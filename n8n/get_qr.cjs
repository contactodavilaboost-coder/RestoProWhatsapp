const http = require('http');
const fs = require('fs');

const API_KEY = 'restopro_secret_key_123';
const INSTANCE_NAME = 'restopro';

function makeRequest(method, path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8080,
      path: path,
      method: method,
      headers: {
        'apikey': API_KEY,
        'Content-Type': 'application/json'
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

    req.on('error', (e) => reject(e));
    req.end();
  });
}

async function getNewQR() {
  console.log("Obteniendo nuevo código QR...");
  try {
    const connectRes = await makeRequest('GET', `/instance/connect/${INSTANCE_NAME}`);
    if (connectRes.data && connectRes.data.base64) {
      const htmlContent = `
        <html>
        <head><title>Conectar WhatsApp</title></head>
        <body style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; background-color: #f0f2f5;">
          <h2>Escanea este NUEVO código QR</h2>
          <p>Abre WhatsApp en tu celular > Menú > Dispositivos vinculados > Vincular un dispositivo</p>
          <img src="${connectRes.data.base64}" style="width: 300px; height: 300px; border: 1px solid #ccc; border-radius: 10px;" />
          <p style="margin-top: 20px; color: #666;">Fecha de generación: ${new Date().toLocaleTimeString()}</p>
        </body>
        </html>
      `;
      fs.writeFileSync('qr.html', htmlContent);
      console.log("¡QR actualizado exitosamente en qr.html!");
    } else {
      console.log("No se pudo obtener el QR. Respuesta:", connectRes.data);
    }
  } catch (error) {
    console.error("Error contactando a Evolution API:", error.message);
  }
}

getNewQR();
