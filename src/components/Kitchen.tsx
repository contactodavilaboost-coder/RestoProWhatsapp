import { useState, useEffect } from 'react';
import { Order, Table } from '../types';
import { Clock, CheckCircle2, ChefHat, Timer } from 'lucide-react';

interface KitchenProps {
  orders: Order[];
  tables: Table[];
  onUpdateOrderStatus: (orderId: string, status: Order['status']) => void;
}

const OrderTimer = ({ order }: { order: Order }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const calculateElapsed = () => {
      if (order.status === 'ready' || order.status === 'served' || order.status === 'paid') {
        if (order.readyTimestamp) {
          return Math.floor((order.readyTimestamp - order.timestamp) / 1000);
        }
        // Fallback if readyTimestamp is missing
        return Math.floor((Date.now() - order.timestamp) / 1000);
      }
      return Math.floor((Date.now() - order.timestamp) / 1000);
    };

    setElapsed(calculateElapsed());

    if (order.status === 'ready' || order.status === 'served' || order.status === 'paid') {
      return;
    }

    const interval = setInterval(() => {
      setElapsed(calculateElapsed());
    }, 1000);

    return () => clearInterval(interval);
  }, [order.timestamp, order.status, order.readyTimestamp]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  
  let colorClass = "text-slate-500 bg-slate-100";
  if (order.status === 'pending' || order.status === 'preparing') {
    if (minutes >= 15) {
      colorClass = "text-red-700 bg-red-100 font-bold animate-pulse";
    } else if (minutes >= 12) {
      colorClass = "text-yellow-800 bg-yellow-100 font-bold border border-yellow-200/60";
    } else {
      colorClass = "text-emerald-700 bg-emerald-100 font-medium";
    }
  }

  return (
    <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${colorClass}`}>
      <Timer size={12} />
      <span>
        {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
      </span>
    </div>
  );
};

const PrepTimer = ({ order }: { order: Order }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const calculateElapsed = () => {
      const start = order.preparingTimestamp || order.timestamp;
      
      if (order.status === 'ready' || order.status === 'served' || order.status === 'paid') {
        if (order.readyTimestamp) {
          return Math.floor((order.readyTimestamp - start) / 1000);
        }
        return Math.floor((Date.now() - start) / 1000);
      }
      return Math.floor((Date.now() - start) / 1000);
    };

    setElapsed(calculateElapsed());

    if (order.status === 'ready' || order.status === 'served' || order.status === 'paid') {
      return;
    }

    const interval = setInterval(() => {
      setElapsed(calculateElapsed());
    }, 1000);

    return () => clearInterval(interval);
  }, [order.preparingTimestamp, order.timestamp, order.status, order.readyTimestamp]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  
  let colorClass = "text-blue-750 bg-blue-100 border border-blue-200/60 font-semibold";
  if (order.status === 'preparing') {
    if (minutes >= 15) {
      colorClass = "text-red-700 bg-red-100 font-bold animate-pulse border border-red-200/60";
    } else if (minutes >= 12) {
      colorClass = "text-yellow-800 bg-yellow-101 font-bold border border-yellow-250/60";
    } else {
      colorClass = "text-blue-700 bg-blue-100 font-medium border border-blue-200/60";
    }
  }

  return (
    <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs ${colorClass}`} title="Tiempo de Preparación">
      <ChefHat size={12} />
      <span>
        Prep: {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
      </span>
    </div>
  );
};

export default function Kitchen({ orders, tables, onUpdateOrderStatus }: KitchenProps) {
  // Sort ascending by timestamp: oldest on top, newest at bottom (FIFO)
  const pendingOrders = orders.filter(o => o.status === 'pending').sort((a, b) => a.timestamp - b.timestamp);
  const preparingOrders = orders.filter(o => o.status === 'preparing').sort((a, b) => a.timestamp - b.timestamp);
  const readyOrders = orders.filter(o => o.status === 'ready').sort((a, b) => a.timestamp - b.timestamp);

  const getTableNumber = (tableId: string) => tables.find(t => t.id === tableId)?.number || '?';

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const OrderCard = ({ order, nextStatus, nextLabel, nextColor }: any) => {
    const [prepElapsed, setPrepElapsed] = useState(0);

    useEffect(() => {
      if (order.status !== 'preparing') {
        setPrepElapsed(0);
        return;
      }

      const updatePrep = () => {
        const start = order.preparingTimestamp || order.timestamp;
        setPrepElapsed(Math.floor((Date.now() - start) / 1000));
      };

      updatePrep();
      const interval = setInterval(updatePrep, 1000);
      return () => clearInterval(interval);
    }, [order.preparingTimestamp, order.timestamp, order.status]);

    const prepMinutes = Math.floor(prepElapsed / 60);

    let cardBorderBg = "bg-white border-slate-200 shadow-sm";
    if (order.status === 'preparing') {
      if (prepMinutes >= 15) {
        cardBorderBg = "bg-red-50/70 border-red-400 shadow-md shadow-red-100 ring-1 ring-red-400";
      } else if (prepMinutes >= 12) {
        cardBorderBg = "bg-yellow-50/70 border-yellow-400 shadow-md shadow-yellow-105 ring-1 ring-yellow-400";
      }
    }

    return (
      <div className={`p-4 rounded-xl border flex flex-col transition-all duration-300 ${cardBorderBg}`}>
        <div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-black text-xl text-slate-800">Mesa {getTableNumber(order.tableId)}</h3>
            {order.waiterName && (
              <p className="text-sm font-medium text-slate-600 mt-0.5">Mesero: {order.waiterName}</p>
            )}
            <div className="flex items-center text-slate-500 text-sm mt-1 gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <Clock size={14} />
                <span>{formatTime(order.timestamp)}</span>
              </div>
              <OrderTimer order={order} />
              {order.status === 'preparing' && <PrepTimer order={order} />}
            </div>
          </div>
          <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1 rounded uppercase tracking-wide">
            #{order.id.slice(-4)}
          </span>
        </div>
        
        <div className="flex-1 space-y-3 mb-4">
          {order.items.map((item: any, idx: number) => (
            <div key={idx} className="flex flex-col gap-1">
              <div className="flex items-start gap-3">
                <span className="bg-slate-800 text-white text-xs font-bold w-6 h-6 rounded flex items-center justify-center shrink-0">
                  {item.quantity}x
                </span>
                <span className="font-medium text-slate-700 leading-tight">{item.menuItem.name}</span>
              </div>
              {item.selectedAdditions && item.selectedAdditions.length > 0 && (
                <div className="ml-9 text-sm text-orange-600 font-medium italic bg-orange-50 p-2 rounded border border-orange-100">
                  + {item.selectedAdditions.map((a: any) => a.name).join(', ')}
                </div>
              )}
              {item.notes && (
                <div className="ml-9 text-sm text-red-600 font-medium italic bg-red-50 p-2 rounded border border-red-100">
                  Nota: {item.notes}
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={() => onUpdateOrderStatus(order.id, nextStatus)}
          className={`w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors ${nextColor}`}
        >
          {nextLabel}
        </button>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-8 bg-slate-100 min-h-screen">
      <div className="flex items-center gap-3 mb-6 md:mb-8">
        <div className="p-2 md:p-3 bg-slate-800 text-white rounded-lg">
          <ChefHat size={24} className="md:w-7 md:h-7" />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-slate-800">Pantalla de Cocina (KDS)</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-auto lg:h-[calc(100vh-140px)]">
        {/* Column 1: Pendientes */}
        <div className="bg-slate-200/50 rounded-2xl p-4 flex flex-col h-[500px] lg:h-auto">
          <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="font-bold text-lg text-slate-700 uppercase tracking-wider">Nuevos Pedidos</h3>
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">{pendingOrders.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {pendingOrders.map(order => (
              <OrderCard 
                key={order.id} 
                order={order} 
                nextStatus="preparing" 
                nextLabel="Empezar a Preparar"
                nextColor="bg-blue-500 hover:bg-blue-600 text-white"
              />
            ))}
          </div>
        </div>

        {/* Column 2: En Preparación */}
        <div className="bg-slate-200/50 rounded-2xl p-4 flex flex-col h-[500px] lg:h-auto">
          <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="font-bold text-lg text-slate-700 uppercase tracking-wider">En Preparación</h3>
            <span className="bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-full">{preparingOrders.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {preparingOrders.map(order => (
              <OrderCard 
                key={order.id} 
                order={order} 
                nextStatus="ready" 
                nextLabel={<><CheckCircle2 size={18} /> Listo para Servir</>}
                nextColor="bg-emerald-500 hover:bg-emerald-600 text-white"
              />
            ))}
          </div>
        </div>

        {/* Column 3: Listos */}
        <div className="bg-slate-200/50 rounded-2xl p-4 flex flex-col h-[500px] lg:h-auto">
          <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="font-bold text-lg text-slate-700 uppercase tracking-wider">Listos / Esperando Mesero</h3>
            <span className="bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded-full">{readyOrders.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {readyOrders.map(order => (
              <OrderCard 
                key={order.id} 
                order={order} 
                nextStatus="served" 
                nextLabel="Marcar como Entregado"
                nextColor="bg-slate-800 hover:bg-slate-900 text-white"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
