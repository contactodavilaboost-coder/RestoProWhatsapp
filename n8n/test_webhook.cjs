const http = require('http');

const payload = JSON.stringify({
  data: {
    message: {
      key: {
        remoteJid: "123456789@s.whatsapp.net",
        fromMe: false
      },
      message: {
        conversation: "Hola, quiero pedir algo."
      }
    }
  }
});

const options = {
  hostname: 'localhost',
  port: 5678,
  path: '/webhook/evolution',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(payload);
req.end();
