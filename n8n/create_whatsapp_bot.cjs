const fs = require('fs');

const subMenuId = '5a6f8b9d-4e2b-11ee-be56-0242ac120002';
const subOrderId = '6b7f8c0e-5f3c-22ff-cf67-1353bd230003';

const subMenu = {
  id: subMenuId,
  name: 'Sub-flujo: Consultar Menu',
  nodes: [
    {
      parameters: {},
      id: 'trigger-1',
      name: 'Execute Workflow Trigger',
      type: 'n8n-nodes-base.executeWorkflowTrigger',
      typeVersion: 1,
      position: [0, 0]
    },
    {
      parameters: {
        method: 'GET',
        url: 'https://yitgrjblmdatksvblzdg.supabase.co/rest/v1/menu_items?select=*',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'apikey', value: '={{ $env.SUPABASE_ANON_KEY }}' },
            { name: 'Authorization', value: '=Bearer {{ $env.SUPABASE_ANON_KEY }}' }
          ]
        },
        options: {}
      },
      id: 'http-1',
      name: 'Get Menu from Supabase',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.1,
      position: [200, 0]
    },
    {
      parameters: {
        jsCode: 'const items = $input.all().map(i => i.json);\nif (!items.length) return { menu: "El menú está vacío." };\nconst menu = items.map(i => `- ${i.name} ($${i.price}): ${i.category} (Disponible: ${i.stock > 0 ? "Sí" : "No"})`).join("\\n");\nreturn { menu };'
      },
      id: 'code-1',
      name: 'Format Menu',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [400, 0]
    }
  ],
  connections: {
    'Execute Workflow Trigger': { main: [ [ { node: 'Get Menu from Supabase', type: 'main', index: 0 } ] ] },
    'Get Menu from Supabase': { main: [ [ { node: 'Format Menu', type: 'main', index: 0 } ] ] }
  }
};

const subOrder = {
  id: subOrderId,
  name: 'Sub-flujo: Tomar Pedido',
  nodes: [
    {
      parameters: {},
      id: 'trigger-2',
      name: 'Execute Workflow Trigger',
      type: 'n8n-nodes-base.executeWorkflowTrigger',
      typeVersion: 1,
      position: [0, 0]
    },
    {
      parameters: {
        jsCode: `const data = $input.all()[0].json;
const total = (data.items || []).reduce((sum, item) => sum + (item.price * item.quantity), 0);
return {
  status: 'unconfirmed',
  type: 'food',
  total: total,
  timestamp: Date.now(),
  customerName: data.customerName,
  customerPhone: data.customerPhone,
  customerAddress: data.customerAddress || null,
  isDelivery: data.isDelivery,
  items: data.items,
  paymentMethod: 'efectivo'
};`
      },
      id: 'code-2',
      name: 'Format Order',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [200, 0]
    },
    {
      parameters: {
        method: 'POST',
        url: 'https://yitgrjblmdatksvblzdg.supabase.co/rest/v1/orders',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'apikey', value: '={{ $env.SUPABASE_ANON_KEY }}' },
            { name: 'Authorization', value: '=Bearer {{ $env.SUPABASE_ANON_KEY }}' },
            { name: 'Content-Type', value: 'application/json' },
            { name: 'Prefer', value: 'return=representation' }
          ]
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify($json) }}',
        options: {}
      },
      id: 'http-2',
      name: 'Insert Order to Supabase',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.1,
      position: [400, 0]
    },
    {
      parameters: {
        jsCode: 'return { result: "Pedido registrado exitosamente. Será verificado por el cajero." };'
      },
      id: 'code-3',
      name: 'Success Message',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [600, 0]
    }
  ],
  connections: {
    'Execute Workflow Trigger': { main: [ [ { node: 'Format Order', type: 'main', index: 0 } ] ] },
    'Format Order': { main: [ [ { node: 'Insert Order to Supabase', type: 'main', index: 0 } ] ] },
    'Insert Order to Supabase': { main: [ [ { node: 'Success Message', type: 'main', index: 0 } ] ] }
  }
};

fs.writeFileSync('n8n/Sub_ConsultarMenu.json', JSON.stringify(subMenu, null, 2));
fs.writeFileSync('n8n/Sub_TomarPedido.json', JSON.stringify(subOrder, null, 2));

const mainFlow = JSON.parse(fs.readFileSync('RestoPro WhatsApp Agent (Chatwoot).json', 'utf8'));

// Delete existing connections for the tools we are replacing
delete mainFlow.connections['Tool: ConsultarMenu'];
delete mainFlow.connections['Tool: EnviarPedidoSistema'];

mainFlow.nodes = mainFlow.nodes.map(n => {
  if (n.name === 'Tool: ConsultarMenu') {
    return {
      parameters: {
        name: 'ConsultarMenu',
        description: 'Usa esta herramienta SIEMPRE para saber qué hay en el menú y los precios.',
        workflowId: subMenuId
      },
      id: n.id,
      name: 'Call Workflow: ConsultarMenu',
      type: '@n8n/n8n-nodes-langchain.toolWorkflow',
      typeVersion: 1.1,
      position: n.position
    };
  }
  if (n.name === 'Tool: EnviarPedidoSistema') {
    return {
      parameters: {
        name: 'EnviarPedidoSistema',
        description: 'Llama a esta herramienta cuando el cliente confirme su pedido para enviarlo a la cocina. Necesita customerName, customerPhone, customerAddress (si delivery), isDelivery (boolean) y un arreglo de items (con price y quantity).',
        workflowId: subOrderId
      },
      id: n.id,
      name: 'Call Workflow: TomarPedido',
      type: '@n8n/n8n-nodes-langchain.toolWorkflow',
      typeVersion: 1.1,
      position: n.position
    };
  }
  return n;
});

// Add new connections with correct names
mainFlow.connections['Call Workflow: ConsultarMenu'] = {
  ai_tool: [ [ { node: 'AI Agent', type: 'ai_tool', index: 0 } ] ]
};
mainFlow.connections['Call Workflow: TomarPedido'] = {
  ai_tool: [ [ { node: 'AI Agent', type: 'ai_tool', index: 0 } ] ]
};

fs.writeFileSync('n8n/RestoPro_Main_Agent.json', JSON.stringify(mainFlow, null, 2));
console.log('Workflows generated successfully');
