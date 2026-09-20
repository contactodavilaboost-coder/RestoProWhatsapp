const fs = require('fs');
const crypto = require('crypto');

function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

const subMenuId = '5a6f8b9d-4e2b-11ee-be56-0242ac120002';
const subPedidoId = '5a6f8b9d-4e2b-11ee-be56-0242ac120003';

const evolutionWorkflow = {
  name: "RestoPro WhatsApp Bot (Evolution API)",
  nodes: [
    {
      parameters: {
        httpMethod: "POST",
        path: "evolution",
        options: {}
      },
      id: generateId(),
      name: "Evolution Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 1.1,
      position: [ 0, 300 ],
      webhookId: "evolution-webhook-id-123"
    },
    {
      parameters: {
        conditions: {
          boolean: [
            {
              value1: "={{ $json.body.data.message.key.fromMe }}",
              value2: false
            }
          ],
          string: [
            {
              value1: "={{ $json.body.data.message.message.conversation || .body.data.message.message.extendedTextMessage.text }}",
              operation: "isNotEmpty"
            }
          ]
        }
      },
      id: generateId(),
      name: "Filter Incoming",
      type: "n8n-nodes-base.filter",
      typeVersion: 1,
      position: [ 200, 300 ]
    },
    {
      parameters: {
        agent: "openAiFunctionsAgent",
        promptType: "define",
        text: "Eres un mesero virtual amigable del restaurante RestoPro. Tu trabajo es atender a los clientes por WhatsApp, tomar sus pedidos para Delivery o Pick-up y ser muy educado.\nReglas:\n1. Siempre revisa el menú disponible usando la herramienta 'ConsultarMenu'.\n2. Si un cliente pide algo, confirma la cantidad y el precio.\n3. Pregunta el nombre del cliente, teléfono y dirección si es Delivery (si es Pickup, no hace falta dirección).\n4. Cuando el cliente confirme que su orden está lista, usa la herramienta 'TomarPedido' para registrarlo. Diles que el cajero lo está revisando y pronto se confirmará el pago y el envío a cocina.\n5. NUNCA le digas al usuario el nombre de tus herramientas ni le pidas que las use. Tú debes invocarlas automáticamente.",
        options: {
          systemMessage: "Eres un mesero virtual amigable del restaurante RestoPro. Tu trabajo es atender a los clientes por WhatsApp, tomar sus pedidos para Delivery o Pick-up y ser muy educado.\nReglas:\n1. Siempre revisa el menú disponible usando la herramienta 'ConsultarMenu'.\n2. Si un cliente pide algo, confirma la cantidad y el precio.\n3. Pregunta el nombre del cliente, teléfono y dirección si es Delivery (si es Pickup, no hace falta dirección).\n4. Cuando el cliente confirme que su orden está lista, usa la herramienta 'TomarPedido' para registrarlo. Diles que el cajero lo está revisando y pronto se confirmará el pago y el envío a cocina.\n5. NUNCA le digas al usuario el nombre de tus herramientas ni le pidas que las use. Tú debes invocarlas automáticamente."
        }
      },
      id: "agent-node-123",
      name: "AI Agent",
      type: "@n8n/n8n-nodes-langchain.agent",
      typeVersion: 1,
      position: [ 400, 300 ]
    },
    {
      parameters: {
        sessionKey: "={{ $('Evolution Webhook').item.json.body.data.message.key.remoteJid }}"
      },
      id: generateId(),
      name: "Window Buffer Memory",
      type: "@n8n/n8n-nodes-langchain.memoryBufferWindow",
      typeVersion: 1,
      position: [ 450, 450 ]
    },
    {
      parameters: {
        model: {
          __rl: true,
          value: "llama-3.1-8b-instant",
          mode: "list",
          cachedResultName: "llama-3.1-8b-instant"
        },
        options: {}
      },
      id: generateId(),
      name: "Groq Chat Model",
      type: "@n8n/n8n-nodes-langchain.lmChatGroq",
      typeVersion: 1,
      position: [ 400, 450 ]
    },
    {
      parameters: {
        name: "ConsultarMenu",
        description: "Llama a esta herramienta para obtener el menú, los platos y los precios. Ejecútala automáticamente, no le pidas al usuario que lo haga.",
        workflowId: subMenuId
      },
      id: generateId(),
      name: "Call Workflow: ConsultarMenu",
      type: "@n8n/n8n-nodes-langchain.toolWorkflow",
      typeVersion: 1.1,
      position: [ 600, 450 ]
    },
    {
      parameters: {
        name: "TomarPedido",
        description: "Usa esta herramienta cuando el cliente confirme su pedido para guardarlo en la base de datos.",
        workflowId: subPedidoId
      },
      id: generateId(),
      name: "Call Workflow: TomarPedido",
      type: "@n8n/n8n-nodes-langchain.toolWorkflow",
      typeVersion: 1.1,
      position: [ 750, 450 ]
    },
    {
      parameters: {
        method: "POST",
        url: "http://evolution_api:8080/message/sendText/restopro",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: "apikey",
              value: "restopro_secret_key_123"
            }
          ]
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={\n  \"number\": \"{{ $('Evolution Webhook').item.json.body.data.message.key.remoteJid }}\",\n  \"text\": \"{{ $json.output }}\"\n}",
        options: {}
      },
      id: generateId(),
      name: "Send WhatsApp Reply",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.1,
      position: [ 700, 300 ]
    }
  ],
  connections: {
    "Evolution Webhook": {
      "main": [ [ { "node": "Filter Incoming", "type": "main", "index": 0 } ] ]
    },
    "Filter Incoming": {
      "main": [ [ { "node": "AI Agent", "type": "main", "index": 0 } ] ]
    },
    "AI Agent": {
      "main": [ [ { "node": "Send WhatsApp Reply", "type": "main", "index": 0 } ] ]
    },
    "Window Buffer Memory": {
      "ai_memory": [ [ { "node": "AI Agent", "type": "ai_memory", "index": 0 } ] ]
    },
    "Groq Chat Model": {
      "ai_languageModel": [ [ { "node": "AI Agent", "type": "ai_languageModel", "index": 0 } ] ]
    },
    "Call Workflow: ConsultarMenu": {
      "ai_tool": [ [ { "node": "AI Agent", "type": "ai_tool", "index": 0 } ] ]
    },
    "Call Workflow: TomarPedido": {
      "ai_tool": [ [ { "node": "AI Agent", "type": "ai_tool", "index": 0 } ] ]
    }
  },
  settings: {},
  tags: []
};

fs.writeFileSync('n8n/RestoPro_Evolution_Agent.json', JSON.stringify(evolutionWorkflow, null, 2));
console.log("JSON generated at n8n/RestoPro_Evolution_Agent.json");
