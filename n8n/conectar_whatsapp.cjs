const http = require('http');
const fs = require('fs');

const API_KEY = 'restopro_secret_key_123';
const EVO_URL = 'http://localhost:8080';
const INSTANCE_NAME = 'restopro';
const N8N_WEBHOOK = 'http://restopro-n8n:5678/webhook/evolution';

function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: 'localhost',
      port: 8080,
      path: path,
      method: method,
      headers: {
        'apikey': API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(responseData || '{}') });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(data);
    req.end();
  });
}

async function setupWhatsApp() {
  console.log("Creando instancia en Evolution API...");
  try {
    const createRes = await makeRequest('POST', '/instance/create', {
      instanceName: INSTANCE_NAME,
      token: INSTANCE_NAME,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS"
    });
    
    if (createRes.status === 201 || createRes.status === 200) {
      console.log("Instancia creada exitosamente.");
    } else {
      console.log("La instancia ya existe o hubo un error:", createRes.data);
    }
    
    console.log("Configurando Webhook...");
    const webhookRes = await makeRequest('POST', `/webhook/set/${INSTANCE_NAME}`, {
      webhook: {
        enabled: true,
        url: N8N_WEBHOOK,
        byEvents: false,
        base64: false,
        events: ["MESSAGES_UPSERT"]
      }
    });
    
    console.log("Obteniendo código QR para conexión...");
    const connectRes = await makeRequest('GET', `/instance/connect/${INSTANCE_NAME}`, {});
    
    if (connectRes.data && connectRes.data.base64) {
      const htmlContent = `
        <html>
        <head><title>Conectar WhatsApp</title></head>
        <body style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; background-color: #f0f2f5;">
          <h2>Escanea este código QR con tu WhatsApp</h2>
          <p>Abre WhatsApp en tu celular > Menú > Dispositivos vinculados > Vincular un dispositivo</p>
          <img src="${connectRes.data.base64}" style="width: 300px; height: 300px; border: 1px solid #ccc; border-radius: 10px;" />
          <p style="margin-top: 20px; color: #666;">Si el código expira, recarga tu terminal para generar uno nuevo.</p>
        </body>
        </html>
      `;
      fs.writeFileSync('qr.html', htmlContent);
      console.log("=========================================");
      console.log("¡ÉXITO! He generado el archivo 'qr.html'");
      console.log("Abre 'qr.html' en tu navegador para ver el código QR y escanearlo con WhatsApp.");
      console.log("=========================================");
    } else {
      console.log("No se pudo obtener el QR. ¿Tal vez ya está conectado?", connectRes.data);
    }

  } catch (error) {
    console.error("Error contactando a Evolution API:", error.message);
  }
}

setupWhatsApp();
