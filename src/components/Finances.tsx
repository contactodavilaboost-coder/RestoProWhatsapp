import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, doc, deleteDoc, setDoc } from '../firebase';
import { Order, Purchase, Ingredient, DailyExpense } from '../types';
import { DollarSign, ArrowUpRight, ArrowDownRight, Download, Calendar, ExternalLink, Trash2, X, Lock, Eye, EyeOff, ChevronDown, ChevronRight, User, Phone, MapPin, CreditCard, Truck } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

interface FinancesProps {
  orders: Order[];
  ingredients: Ingredient[];
}

export default function Finances({ orders, ingredients }: FinancesProps) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeTab, setActiveTab] = useState<'ingresos' | 'gastos'>('ingresos');
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [expandedPurchaseId, setExpandedPurchaseId] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [dailyExpenses, setDailyExpenses] = useState<DailyExpense[]>([]);

  // Delete Purchase State
  const [adminPasscode, setAdminPasscode] = useState('1234');
  const [enteredPasscode, setEnteredPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [passcodeError, setPasscodeError] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [purchaseToDelete, setPurchaseToDelete] = useState<Purchase | null>(null);

  // Fetch security passcode
  useEffect(() => {
    const unsubSecurity = onSnapshot(
      doc(db, 'settings', 'security'),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data.adminPasscode) {
            setAdminPasscode(data.adminPasscode);
          }
        }
      },
      (error) => console.error("Error fetching security setting:", error)
    );
    return () => unsubSecurity();
  }, []);

  useEffect(() => {

    const pQ = query(collection(db, 'purchases'), orderBy('timestamp', 'desc'));
    const unsub = onSnapshot(pQ, (snapshot) => {
      const pData: Purchase[] = [];
      snapshot.forEach(docSnap => {
        pData.push({ id: docSnap.id, ...docSnap.data() } as Purchase);
      });
      setPurchases(pData);
    });

    const qExpenses = query(collection(db, 'dailyExpenses'), orderBy('timestamp', 'desc'));
    const unsubExpenses = onSnapshot(qExpenses, (snapshot) => {
      const data: DailyExpense[] = [];
      snapshot.forEach(docSnap => {
        data.push({ id: docSnap.id, ...docSnap.data() } as DailyExpense);
      });
      setDailyExpenses(data);
    });

    return () => {
      unsub();
      unsubExpenses();
    };
  }, []);

  const filteredOrders = orders.filter(order => {
    if (!startDate && !endDate) return true;
    const orderDate = new Date(order.businessDate || order.timestamp);
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);
    return orderDate >= start && orderDate <= end;
  });

  const filteredDailyExpenses = dailyExpenses.filter(exp => {
    if (!startDate && !endDate) return true;
    const d = new Date(exp.businessDate || exp.timestamp);
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);
    return d >= start && d <= end;
  });

  const totalDailyExpenses = filteredDailyExpenses.reduce((sum, exp) => sum + exp.amount, 0);

  const totalRevenue = filteredOrders.reduce((sum, order) => sum + order.total, 0);
  
  // Breakdown by payment method
  const paymentBreakdown = filteredOrders.reduce((acc, order) => {
    if (order.status === 'paid') {
      const method = order.paymentMethod || 'desconocido';
      acc[method] = (acc[method] || 0) + order.total;
    }
    return acc;
  }, {} as Record<string, number>);

  const exportToExcel = () => {
    const dataToExport = filteredOrders.map(order => {
      const itemsDescription = order.items.map(item => {
        let desc = `${item.quantity}x ${item.menuItem.name}`;
        if (item.selectedAdditions && item.selectedAdditions.length > 0) {
          desc += ` (+${item.selectedAdditions.map(a => a.name).join(', ')})`;
        }
        if (item.notes) {
          desc += ` [${item.notes}]`;
        }
        return desc;
      }).join(' | ');

      return {
        'ID Pedido': order.id,
        'Fecha': new Date(order.timestamp).toLocaleDateString(),
        'Hora': new Date(order.timestamp).toLocaleTimeString(),
        'Mesa': order.tableId,
        'Mesero': order.waiterName || 'N/A',
        'Detalle': itemsDescription,
        'Total USD': order.total,
        'Estado': order.status === 'paid' ? 'Pagado' : 'Pendiente',
        'Método de Pago': order.paymentMethod || 'N/A',
        'Referencia': order.referenceNumber || 'N/A'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transacciones");
    XLSX.writeFile(workbook, `Reporte_Finanzas_${Date.now()}.xlsx`);
  };

  const formatPaymentMethod = (method: string) => {
    const labels: Record<string, string> = {
      'efectivo': 'Efectivo',
      'tarjeta': 'Tarjeta',
      'pago_movil': 'Pago Móvil',
      'transferencia': 'Transferencia',
      'zelle': 'Zelle',
      'desconocido': 'Otro'
    };
    return labels[method] || method;
  };

  const handleDeletePurchase = async () => {
    if (!purchaseToDelete) return;

    if (enteredPasscode !== adminPasscode) {
      setPasscodeError(true);
      toast.error('Clave de seguridad incorrecta. Inténtelo de nuevo.');
      return;
    }

    try {
      // Revert stock for each item in the purchase
      if (purchaseToDelete.items && Array.isArray(purchaseToDelete.items)) {
        for (const item of purchaseToDelete.items) {
          const ing = ingredients.find((i) => i.id === item.ingredientId);
          if (ing) {
            const revertQty = Number(item.quantity) || 0;
            const newStock = Number(Math.max(0, ing.stock - revertQty).toFixed(3));
            
            await setDoc(doc(db, 'ingredients', ing.id), {
              ...ing,
              stock: newStock
            });

            // Log movement for reversion
            const movementId = Math.random().toString(36).substr(2, 9);
            await setDoc(doc(db, 'inventoryMovements', movementId), {
              id: movementId,
              ingredientId: ing.id,
              ingredientName: ing.name,
              quantity: revertQty,
              type: 'salida',
              prevStock: ing.stock,
              newStock: newStock,
              timestamp: Date.now(),
              userName: 'Admin (Reversión de Compra)'
            });
          }
        }
      }

      await deleteDoc(doc(db, 'purchases', purchaseToDelete.id));
      toast.success('Compra eliminada y stock de inventario revertido correctamente.');
      setIsDeleteModalOpen(false);
      setPurchaseToDelete(null);
      setEnteredPasscode('');
    } catch (error) {
      console.error("Error al eliminar la compra:", error);
      toast.error('Ocurrió un error al intentar eliminar la compra.');
    }
  };

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 md:mb-8 gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-slate-800">Finanzas y Caja</h2>
          <p className="text-slate-500 mt-1 md:mt-2 text-sm md:text-base">Resumen de ingresos y movimientos.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 w-full sm:w-auto">
            <Calendar size={18} className="text-slate-400 shrink-0" />
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-sm outline-none text-slate-700 bg-transparent w-full"
            />
            <span className="text-slate-400">-</span>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-sm outline-none text-slate-700 bg-transparent w-full"
            />
          </div>
          
          <button 
            onClick={exportToExcel}
            className="flex items-center justify-center gap-2 bg-emerald-600 text-white px-4 md:px-6 py-2 md:py-3 rounded-lg font-medium hover:bg-emerald-700 transition-colors shadow-sm w-full sm:w-auto text-sm md:text-base"
          >
            <Download size={18} />
            Exportar Excel
          </button>
        </div>
      </div>

      <div className="flex bg-slate-200/50 p-1 rounded-xl mb-6 w-fit">
        <button
          onClick={() => setActiveTab('ingresos')}
          className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${
            activeTab === 'ingresos' 
              ? 'bg-white text-slate-800 shadow-sm' 
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/80'
          }`}
        >
          Ingresos (Ventas)
        </button>
        <button
          onClick={() => setActiveTab('gastos')}
          className={`px-6 py-2.5 rounded-lg font-bold text-sm transition-all ${
            activeTab === 'gastos' 
              ? 'bg-white text-slate-800 shadow-sm' 
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/80'
          }`}
        >
          Gastos (Compras)
        </button>
      </div>

      {activeTab === 'ingresos' && (
        <div className="animate-fade-in animate-duration-300">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-slate-500 font-medium">Ingresos (Periodo)</h3>
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <DollarSign size={20} />
                </div>
              </div>
              <p className="text-4xl font-black text-slate-800">${totalRevenue.toFixed(2)}</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 md:col-span-2">
              <h3 className="text-slate-500 font-medium mb-4">Desglose por Método de Pago</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {Object.entries(paymentBreakdown).length === 0 ? (
                  <p className="text-slate-400 text-sm col-span-full">No hay pagos registrados en este periodo.</p>
                ) : (
                  Object.entries(paymentBreakdown).map(([method, amount]) => (
                    <div key={method} className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                        {formatPaymentMethod(method)}
                      </p>
                      <p className="text-lg font-black text-slate-800">${amount.toFixed(2)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <h3 className="text-xl font-bold text-slate-800 mb-4">Transacciones del Periodo</h3>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-4 font-semibold text-slate-600">ID Pedido</th>
                  <th className="p-4 font-semibold text-slate-600">Fecha y Hora</th>
                  <th className="p-4 font-semibold text-slate-600">Mesa</th>
                  <th className="p-4 font-semibold text-slate-600">Método</th>
                  <th className="p-4 font-semibold text-slate-600">Monto</th>
                  <th className="p-4 font-semibold text-slate-600">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">No hay transacciones en este periodo</td>
                  </tr>
                ) : (
                  filteredOrders.map(order => (
                    <tr key={order.id} className={`hover:bg-slate-50 transition-colors ${expandedOrderId === order.id ? 'bg-slate-50' : ''}`}>
                      <td colSpan={6} className="p-0">
                        <div className="w-full flex items-center p-4 cursor-pointer" onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}>
                          <div className="w-1/6 font-mono text-sm text-slate-500">#{order.id.slice(-6)}</div>
                          <div className="w-1/6 text-slate-600">
                            {new Date(order.timestamp).toLocaleDateString()} {new Date(order.timestamp).toLocaleTimeString()}
                          </div>
                          <div className="w-1/6 text-slate-800 font-medium">Mesa {order.tableId.replace('t', '')}</div>
                          <div className="w-1/6 text-slate-600 font-medium">
                            <div>
                              {order.paymentMethod ? formatPaymentMethod(order.paymentMethod) : '-'}
                              {order.referenceNumber && (
                                <div className="text-xs font-mono text-orange-600 font-bold mt-0.5">
                                  Ref: {order.referenceNumber}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="w-1/6 font-bold text-slate-800">${order.total.toFixed(2)}</div>
                          <div className="w-1/6 flex items-center justify-between">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                              order.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-orange-800'
                            }`}>
                              {order.status === 'paid' ? 'Pagado' : 'Pendiente'}
                            </span>
                            <span className="text-slate-400">
                              {expandedOrderId === order.id ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                            </span>
                          </div>
                        </div>
                        {expandedOrderId === order.id && (
                          <div className="bg-slate-100 p-6 border-t border-slate-200">
                            <h4 className="font-bold text-slate-800 mb-3 uppercase tracking-wider text-xs">Detalle del Pedido</h4>
                            <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-2 mb-4">
                              {order.items.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center text-sm">
                                  <span className="font-bold text-slate-700">
                                    {item.quantity}x {item.menuItem.name}
                                    {item.selectedAdditions && item.selectedAdditions.length > 0 && (
                                      <span className="font-medium text-slate-500 ml-2">
                                        (+{item.selectedAdditions.map(a => a.name).join(', ')})
                                      </span>
                                    )}
                                    {item.notes && (
                                      <span className="font-normal text-slate-400 ml-2 italic">[{item.notes}]</span>
                                    )}
                                  </span>
                                  <span className="text-slate-500 font-mono">
                                    ${((item.menuItem.price + (item.selectedAdditions?.reduce((s, a) => s + a.price, 0) || 0)) * item.quantity).toFixed(2)}
                                  </span>
                                </div>
                              ))}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {order.waiterName && (
                                <div className="bg-white rounded-lg border border-slate-200 p-3">
                                  <h5 className="font-bold text-slate-800 mb-1 uppercase tracking-wider text-xs flex items-center gap-1.5">
                                    <User size={14} className="text-slate-400" /> Mesero
                                  </h5>
                                  <p className="text-sm text-slate-600">{order.waiterName}</p>
                                </div>
                              )}

                              {(order.customerName || order.customerID || order.customerPhone || order.customerAddress) && (
                                <div className="bg-white rounded-lg border border-slate-200 p-3">
                                  <h5 className="font-bold text-slate-800 mb-1 uppercase tracking-wider text-xs">Datos del Cliente</h5>
                                  <div className="space-y-1 text-sm text-slate-600">
                                    {order.customerName && (
                                      <p className="flex items-center gap-1.5"><User size={13} className="text-slate-400" /> {order.customerName}</p>
                                    )}
                                    {order.customerID && (
                                      <p className="flex items-center gap-1.5"><CreditCard size={13} className="text-slate-400" /> {order.customerID}</p>
                                    )}
                                    {order.customerPhone && (
                                      <p className="flex items-center gap-1.5"><Phone size={13} className="text-slate-400" /> {order.customerPhone}</p>
                                    )}
                                    {order.customerAddress && (
                                      <p className="flex items-center gap-1.5"><MapPin size={13} className="text-slate-400" /> {order.customerAddress}</p>
                                    )}
                                  </div>
                                </div>
                              )}

                              {order.referenceNumber && (
                                <div className="bg-white rounded-lg border border-slate-200 p-3">
                                  <h5 className="font-bold text-slate-800 mb-1 uppercase tracking-wider text-xs">Referencia de Pago</h5>
                                  <p className="text-sm font-mono text-orange-600 font-bold">{order.referenceNumber}</p>
                                </div>
                              )}

                              {order.isDelivery && (
                                <div className="bg-white rounded-lg border border-slate-200 p-3">
                                  <h5 className="font-bold text-slate-800 mb-1 uppercase tracking-wider text-xs flex items-center gap-1.5">
                                    <Truck size={14} className="text-slate-400" /> Delivery
                                  </h5>
                                  <p className="text-sm text-slate-600">Costo: ${order.deliveryCost?.toFixed(2) || '0.00'}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'gastos' && (
        <div className="animate-fade-in animate-duration-300">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-slate-500 font-medium">Total Compras</h3>
                <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                  <DollarSign size={20} />
                </div>
              </div>
              <p className="text-4xl font-black text-slate-800">
                ${purchases.filter(p => {
                  if (!startDate && !endDate) return true;
                  const d = new Date(p.timestamp);
                  const start = startDate ? new Date(startDate) : new Date(0);
                  const end = endDate ? new Date(endDate) : new Date();
                  end.setHours(23, 59, 59, 999);
                  return d >= start && d <= end;
                }).reduce((sum, p) => sum + p.totalAmount, 0).toFixed(2)}
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-slate-500 font-medium">Gastos Operativos</h3>
                <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                  <Truck size={20} />
                </div>
              </div>
              <p className="text-4xl font-black text-slate-800">${totalDailyExpenses.toFixed(2)}</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-rose-200 border-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-rose-600 font-bold">Total Gastos</h3>
                <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
                  <ArrowDownRight size={20} />
                </div>
              </div>
              <p className="text-4xl font-black text-rose-600">
                ${(purchases.filter(p => {
                  if (!startDate && !endDate) return true;
                  const d = new Date(p.timestamp);
                  const start = startDate ? new Date(startDate) : new Date(0);
                  const end = endDate ? new Date(endDate) : new Date();
                  end.setHours(23, 59, 59, 999);
                  return d >= start && d <= end;
                }).reduce((sum, p) => sum + p.totalAmount, 0) + totalDailyExpenses).toFixed(2)}
              </p>
            </div>
          </div>

          <h3 className="text-xl font-bold text-slate-800 mb-4">Registro de Compras</h3>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-4 font-semibold text-slate-600">ID Compra</th>
                  <th className="p-4 font-semibold text-slate-600">Fecha y Hora</th>
                  <th className="p-4 font-semibold text-slate-600">Proveedor</th>
                  <th className="p-4 font-semibold text-slate-600">Ingresado Por</th>
                  <th className="p-4 font-semibold text-slate-600">Total</th>
                  <th className="p-4 font-semibold text-slate-600">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchases.filter(p => {
                  if (!startDate && !endDate) return true;
                  const d = new Date(p.timestamp);
                  const start = startDate ? new Date(startDate) : new Date(0);
                  const end = endDate ? new Date(endDate) : new Date();
                  end.setHours(23, 59, 59, 999);
                  return d >= start && d <= end;
                }).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">No hay compras en este periodo</td>
                  </tr>
                ) : (
                  purchases.filter(p => {
                    if (!startDate && !endDate) return true;
                    const d = new Date(p.timestamp);
                    const start = startDate ? new Date(startDate) : new Date(0);
                    const end = endDate ? new Date(endDate) : new Date();
                    end.setHours(23, 59, 59, 999);
                    return d >= start && d <= end;
                  }).map(p => (
                    <tr key={p.id} className={`hover:bg-slate-50 transition-colors ${expandedPurchaseId === p.id ? 'bg-slate-50' : ''}`}>
                      <td colSpan={6} className="p-0">
                        <div className="w-full flex items-center p-4 cursor-pointer" onClick={() => setExpandedPurchaseId(expandedPurchaseId === p.id ? null : p.id)}>
                          <div className="w-1/6 font-mono text-sm text-slate-500">#{p.id.slice(-6)}</div>
                          <div className="w-1/6 text-slate-600">
                            {new Date(p.timestamp).toLocaleDateString()} {new Date(p.timestamp).toLocaleTimeString()}
                          </div>
                          <div className="w-1/6 text-slate-800 font-bold">{p.supplierName}</div>
                          <div className="w-1/6 text-slate-600">{p.userName}</div>
                          <div className="w-1/6 font-black text-rose-600">${p.totalAmount.toFixed(2)}</div>
                          <div className="w-1/6 flex justify-end items-center gap-3 pr-4 text-slate-400">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPurchaseToDelete(p);
                                setIsDeleteModalOpen(true);
                              }}
                              className="p-1 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                              title="Eliminar Compra"
                            >
                              <Trash2 size={18} />
                            </button>
                            {expandedPurchaseId === p.id ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                          </div>
                        </div>
                        {expandedPurchaseId === p.id && (
                          <div className="bg-slate-100 p-6 border-t border-slate-200">
                            <h4 className="font-bold text-slate-800 mb-3 uppercase tracking-wider text-xs">Materia Prima Ingresada</h4>
                            <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-2 mb-4">
                              {p.items.map((item, idx) => {
                                const ingName = ingredients.find(i => i.id === item.ingredientId)?.name || 'Ingrediente Desconocido';
                                return (
                                  <div key={idx} className="flex justify-between items-center text-sm">
                                    <span className="font-bold text-slate-700">{ingName} <span className="font-medium text-slate-500 ml-2">(Cant: {item.quantity})</span></span>
                                    <span className="text-slate-500 font-mono">Costo Item: ${item.cost.toFixed(2)}</span>
                                  </div>
                                );
                              })}
                            </div>
                            {p.invoicePhoto && (
                              <div>
                                <h4 className="font-bold text-slate-800 mb-3 uppercase tracking-wider text-xs">Soporte Operativo (Factura)</h4>
                                <a href={p.invoicePhoto} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 rounded-lg text-sm font-bold transition-all">
                                  <ExternalLink size={16} /> Ver Fotografía de Factura
                                </a>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <h3 className="text-xl font-bold text-slate-800 mb-4 mt-10">Gastos Operativos (Deliverys y Otros)</h3>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-4 font-semibold text-slate-600">Fecha</th>
                  <th className="p-4 font-semibold text-slate-600">Tipo</th>
                  <th className="p-4 font-semibold text-slate-600">Descripción</th>
                  <th className="p-4 font-semibold text-slate-600">Monto</th>
                  <th className="p-4 font-semibold text-slate-600">Orden Asociada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDailyExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">No hay gastos operativos en este periodo</td>
                  </tr>
                ) : (
                  filteredDailyExpenses.map(exp => (
                    <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 text-slate-600">
                        {new Date(exp.timestamp).toLocaleDateString()} {new Date(exp.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          exp.type === 'delivery' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'
                        }`}>
                          {exp.type === 'delivery' ? 'Delivery' : 'Otro'}
                        </span>
                      </td>
                      <td className="p-4 text-slate-700 font-medium">{exp.description}</td>
                      <td className="p-4 font-black text-rose-600">${exp.amount.toFixed(2)}</td>
                      <td className="p-4 font-mono text-sm text-slate-500">
                        {exp.orderId ? `#${exp.orderId.slice(-6)}` : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && purchaseToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in animate-duration-150">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-rose-50/50">
              <div className="flex items-center gap-3 text-rose-600">
                <div className="p-2 bg-rose-100 rounded-lg">
                  <Trash2 size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-rose-900 leading-tight">Eliminar Compra</h3>
                  <p className="text-xs font-medium text-rose-700/80">Reversión de Inventario</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setPurchaseToDelete(null);
                  setEnteredPasscode('');
                  setPasscodeError(false);
                }} 
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6">
              <p className="text-slate-600 text-sm mb-6 leading-relaxed">
                Vas a eliminar la compra registrada de <strong className="text-slate-800">{purchaseToDelete.supplierName}</strong> por un total de <strong className="text-slate-800">${purchaseToDelete.totalAmount.toFixed(2)}</strong>. 
                El stock de los <strong className="text-rose-600 font-bold">{purchaseToDelete.items?.length || 0}</strong> ingredientes asociados será <strong>descontado (revertido)</strong> del inventario actual. Esta acción es <span className="font-bold underline decoration-rose-500 underline-offset-4">permanente</span>.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Lock size={14} className="text-slate-400" />
                    Clave de Seguridad Requerida
                  </label>
                  <div className="relative">
                    <input
                      type={showPasscode ? 'text' : 'password'}
                      value={enteredPasscode}
                      onChange={(e) => {
                        setEnteredPasscode(e.target.value);
                        setPasscodeError(false);
                      }}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleDeletePurchase();
                        }
                      }}
                      placeholder="Ingrese la clave global..."
                      className={`w-full px-4 py-3 bg-slate-50 border outline-none rounded-xl focus:bg-white text-slate-800 font-mono tracking-widest text-center text-lg transition-all ${
                        passcodeError
                          ? 'border-red-500 bg-red-50 focus:border-red-500'
                          : 'border-slate-200 focus:border-rose-500'
                      }`}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPasscode(!showPasscode)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPasscode ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {passcodeError && (
                    <p className="text-red-500 text-xs mt-2 font-medium text-center animate-shake">
                      Clave inválida. Verifique e intente nuevamente.
                    </p>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      setIsDeleteModalOpen(false);
                      setPurchaseToDelete(null);
                      setEnteredPasscode('');
                      setPasscodeError(false);
                    }}
                    className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDeletePurchase}
                    disabled={!enteredPasscode}
                    className="flex-1 px-4 py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors shadow-lg shadow-rose-600/20 text-sm flex items-center justify-center gap-2"
                  >
                    <Trash2 size={18} />
                    Confirmar Borrado
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
