import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3001", 10);

  // Server-side route to proxy Google Sheets CSV.
  // Server-side requests bypass browser CORS and sandboxing restrictions.
  app.get("/api/users", async (req, res) => {
    try {
      const url = 'https://docs.google.com/spreadsheets/d/1hpVk7Nfz1VAgzpvHPZOpn0Y94092xHqiE5abAID7rOo/export?format=csv';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Google Sheets fetch failed with status ${response.status}`);
      }
      const text = await response.text();
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.send(text);
    } catch (error: any) {
      console.error("Backend error fetching Google Sheets CSV:", error);
      res.status(500).send(`Error in backend proxy: ${error.message || error}`);
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { port: 24679 } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
