const http = require('http');

const API_KEY = 'restopro_secret_key_123';
const INSTANCE_NAME = 'restopro';

const options = {
  hostname: 'localhost',
  port: 8080,
  path: `/webhook/set/${INSTANCE_NAME}`,
  method: 'POST',
  headers: {
    'apikey': API_KEY,
    'Content-Type': 'application/json'
  }
};

const req = http.request(options, (res) => {
  let responseData = '';
  res.on('data', (chunk) => { responseData += chunk; });
  res.on('end', () => {
    console.log('Webhook updated:', responseData);
  });
});

req.write(JSON.stringify({
  webhook: {
    url: 'http://host.docker.internal:5678/webhook/evolution',
    webhookByEvents: false,
    webhookBase64: false,
    events: ['MESSAGES_UPSERT'],
    enabled: true
  }
}));

req.end();
