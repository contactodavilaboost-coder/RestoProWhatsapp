const http = require('http');

const API_KEY = 'restopro_secret_key_123';
const INSTANCE_NAME = 'restopro';

// For production webhook (when workflow is published/active)
const WEBHOOK_URL = 'http://restopro-n8n:5678/webhook/Tr0dOoTrAnSpOrTe/webhook/whatsapp-entrega';

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
    console.log('Webhook updated successfully:', responseData);
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(JSON.stringify({
  webhook: {
    url: WEBHOOK_URL,
    webhookByEvents: false,
    webhookBase64: false,
    events: ['MESSAGES_UPSERT'],
    enabled: true
  }
}));

req.end();
