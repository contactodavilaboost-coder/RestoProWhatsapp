import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Customer, Order } from '../types';
import { useBCVRate } from '../hooks/useBCVRate';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import {
  Users,
  Search,
  UserPlus,
  Edit2,
  Trash2,
  Phone,
  MapPin,
  Calendar,
  DollarSign,
  TrendingUp,
  Award,
  Receipt,
  MessageCircle,
  X,
  Plus,
  ChevronRight,
  Filter,
  ArrowUpDown,
  Building2,
  UserCheck,
  CheckCircle2,
  FileText
} from 'lucide-react';

interface CustomersProps {
  orders: Order[];
}

export default function Customers({ orders }: CustomersProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'spent' | 'orders' | 'name'>('recent');

  // Modal states
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Form states
  const [docPrefix, setDocPrefix] = useState<'V-' | 'E-' | 'J-' | 'G-'>('V-');
  const [docNumber, setDocNumber] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // History modal state
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState<Customer | null>(null);

  // Delete modal state
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  const { rate: bcvRate } = useBCVRate();

  // Escuchar colección de clientes en Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'customers'),
      (snapshot) => {
        const custs: Customer[] = [];
        snapshot.forEach((docSnap) => {
          custs.push({ id: docSnap.id, ...docSnap.data() } as Customer);
        });
        setCustomers(custs);
        setLoading(false);
      },
      (error) => {
        console.error('Error al cargar la base de datos de clientes:', error);
        handleFirestoreError(error, OperationType.GET, 'customers');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Abrir modal para crear
  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setDocPrefix('V-');
    setDocNumber('');
    setName('');
    setPhone('');
    setAddress('');
    setIsAddEditModalOpen(true);
  };

  // Abrir modal para editar
  const handleOpenEdit = (cust: Customer) => {
    setEditingCustomer(cust);
    setDocPrefix(cust.docPrefix || 'V-');
    setDocNumber(cust.docNumber || cust.id.replace(/^[VEJGvejg]-?/, ''));
    setName(cust.name || '');
    setPhone(cust.phone || '');
    setAddress(cust.address || '');
    setIsAddEditModalOpen(true);
  };

  // Guardar cliente (crear o actualizar)
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDocNum = docNumber.trim().replace(/\D/g, '');
    const cleanName = name.trim();

    if (!cleanDocNum && !cleanName) {
      toast.error('Ingresa al menos la Cédula/RIF o el Nombre del cliente');
      return;
    }

    const fullId = cleanDocNum
      ? `${docPrefix}${cleanDocNum}`
      : editingCustomer
      ? editingCustomer.id
      : `CLI-${cleanName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15)}`;

    setIsSaving(true);
    try {
      const custRef = doc(db, 'customers', fullId);
      const dataToSave: Partial<Customer> = {
        id: fullId,
        docPrefix,
        docNumber: cleanDocNum,
        name: cleanName || 'Cliente General',
        phone: phone.trim(),
        address: address.trim(),
        updatedAt: Date.now(),
        ...(editingCustomer
          ? {}
          : {
              createdAt: Date.now(),
              totalOrders: 0,
              totalSpent: 0
            })
      };

      await setDoc(custRef, dataToSave, { merge: true });
      toast.success(editingCustomer ? 'Cliente actualizado con éxito' : 'Cliente registrado exitosamente');
      setIsAddEditModalOpen(false);
    } catch (err: any) {
      console.error('Error al guardar cliente:', err);
      toast.error('Error al guardar cliente');
      handleFirestoreError(err, OperationType.CREATE, 'customers');
    } finally {
      setIsSaving(false);
    }
  };

  // Eliminar cliente
  const handleConfirmDelete = async () => {
    if (!customerToDelete) return;
    try {
      await deleteDoc(doc(db, 'customers', customerToDelete.id));
      toast.success(`Cliente ${customerToDelete.name} eliminado de la base de datos`);
      setCustomerToDelete(null);
    } catch (err: any) {
      console.error('Error al eliminar cliente:', err);
      toast.error('Error al eliminar cliente');
      handleFirestoreError(err, OperationType.DELETE, `customers/${customerToDelete.id}`);
    }
  };

  // Filtrar y ordenar clientes
  const filteredCustomers = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return customers
      .filter((c) => {
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          (c.docNumber && c.docNumber.includes(q)) ||
          (c.phone && c.phone.includes(q)) ||
          (c.address && c.address.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (sortBy === 'recent') {
          return (b.lastOrderDate || b.updatedAt || 0) - (a.lastOrderDate || a.updatedAt || 0);
        }
        if (sortBy === 'spent') {
          return (b.totalSpent || 0) - (a.totalSpent || 0);
        }
        if (sortBy === 'orders') {
          return (b.totalOrders || 0) - (a.totalOrders || 0);
        }
        if (sortBy === 'name') {
          return a.name.localeCompare(b.name);
        }
        return 0;
      });
  }, [customers, searchTerm, sortBy]);

  // Métricas
  const stats = useMemo(() => {
    const totalCount = customers.length;
    const totalSpentSum = customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0);
    const frequentCount = customers.filter((c) => (c.totalOrders || 0) > 1).length;
    const avgSpent = totalCount > 0 ? totalSpentSum / totalCount : 0;
    const vipCustomer = customers.length > 0 ? [...customers].sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0))[0] : null;

    return { totalCount, totalSpentSum, frequentCount, avgSpent, vipCustomer };
  }, [customers]);

  // Historial de pedidos para cliente seleccionado
  const customerOrders = useMemo(() => {
    if (!selectedCustomerForHistory) return [];
    return orders.filter(
      (o) =>
        o.customerID === selectedCustomerForHistory.id ||
        (selectedCustomerForHistory.docNumber && o.customerID?.includes(selectedCustomerForHistory.docNumber))
    ).sort((a, b) => b.timestamp - a.timestamp);
  }, [orders, selectedCustomerForHistory]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header con título y botón de agregar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-orange-100 text-orange-600 rounded-xl">
              <Users size={24} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Base de Datos de Clientes
              </h1>
              <p className="text-xs sm:text-sm font-medium text-slate-500">
                Directorio unificado, frecuencia de compra y gestión de fichas comerciales
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-5 py-3 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-md shadow-orange-500/20 flex items-center justify-center gap-2 cursor-pointer border-0"
        >
          <UserPlus size={18} />
          Nuevo Cliente
        </button>
      </div>

      {/* Tarjetas de Métricas / KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Clientes */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <UserCheck size={22} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Registrados</p>
            <h3 className="text-2xl font-black text-slate-900 mt-0.5">{stats.totalCount}</h3>
            <p className="text-[11px] font-semibold text-emerald-600 mt-0.5">
              {stats.frequentCount} frecuentes ({stats.totalCount > 0 ? Math.round((stats.frequentCount / stats.totalCount) * 100) : 0}%)
            </p>
          </div>
        </div>

        {/* Total Facturado a Clientes */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <DollarSign size={22} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Facturado Acumulado</p>
            <h3 className="text-2xl font-black text-slate-900 mt-0.5">
              ${stats.totalSpentSum.toFixed(2)}
            </h3>
            <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
              Bs. {(stats.totalSpentSum * (bcvRate || 1)).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Promedio por Cliente */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <TrendingUp size={22} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Promedio de Compra</p>
            <h3 className="text-2xl font-black text-slate-900 mt-0.5">
              ${stats.avgSpent.toFixed(2)}
            </h3>
            <p className="text-[11px] font-semibold text-slate-500 mt-0.5">Por cliente registrado</p>
          </div>
        </div>

        {/* Cliente VIP */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Award size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cliente Mayor Gasto</p>
            <h3 className="text-sm font-extrabold text-slate-900 mt-0.5 truncate">
              {stats.vipCustomer ? stats.vipCustomer.name : 'N/A'}
            </h3>
            <p className="text-[11px] font-bold text-amber-600 mt-0.5">
              {stats.vipCustomer ? `$${(stats.vipCustomer.totalSpent || 0).toFixed(2)}` : '$0.00'}
            </p>
          </div>
        </div>
      </div>

      {/* Filtros y Buscador */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por Cédula/RIF, Nombre, Teléfono o Dirección..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-orange-500 transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap flex items-center gap-1">
            <ArrowUpDown size={14} /> Ordenar:
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:bg-white focus:border-orange-500 cursor-pointer w-full sm:w-auto"
          >
            <option value="recent">Última actividad</option>
            <option value="spent">Mayor monto gastado ($)</option>
            <option value="orders">Más pedidos realizados</option>
            <option value="name">Nombre alfabético</option>
          </select>
        </div>
      </div>

      {/* Tabla de Clientes */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500 mx-auto mb-3"></div>
            Cargando base de datos de clientes...
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h4 className="text-base font-bold text-slate-700">No se encontraron clientes</h4>
            <p className="text-xs text-slate-400 mt-1">
              {searchTerm ? 'Intenta modificar el término de búsqueda.' : 'Los clientes se registrarán automáticamente al realizar ventas o cobros en la caja.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Cédula / RIF</th>
                  <th className="py-3.5 px-4">Cliente</th>
                  <th className="py-3.5 px-4">Contacto</th>
                  <th className="py-3.5 px-4">Dirección</th>
                  <th className="py-3.5 px-4 text-center">Pedidos</th>
                  <th className="py-3.5 px-4 text-right">Total Gastado ($)</th>
                  <th className="py-3.5 px-4 text-right">Última Visita</th>
                  <th className="py-3.5 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {filteredCustomers.map((cust) => {
                  const rawPhone = (cust.phone || '').replace(/\D/g, '');
                  const waNumber = rawPhone.startsWith('0') ? `58${rawPhone.slice(1)}` : rawPhone.startsWith('58') ? rawPhone : `58${rawPhone}`;

                  return (
                    <tr key={cust.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Cédula/RIF */}
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-800 text-[11px]">
                          {cust.id}
                        </span>
                      </td>

                      {/* Nombre */}
                      <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 font-black text-xs flex items-center justify-center shrink-0">
                            {cust.name.charAt(0).toUpperCase()}
                          </div>
                          <span>{cust.name}</span>
                        </div>
                      </td>

                      {/* Teléfono & WhatsApp */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {cust.phone ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-slate-700">{cust.phone}</span>
                            {rawPhone.length >= 7 && (
                              <a
                                href={`https://wa.me/${waNumber}`}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                                title="Enviar WhatsApp"
                              >
                                <MessageCircle size={14} />
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-normal italic">Sin registrar</span>
                        )}
                      </td>

                      {/* Dirección */}
                      <td className="py-3.5 px-4 max-w-xs truncate text-slate-600">
                        {cust.address ? cust.address : <span className="text-slate-400 italic">No especificada</span>}
                      </td>

                      {/* Total Pedidos */}
                      <td className="py-3.5 px-4 text-center font-bold">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-800">
                          {cust.totalOrders || 0}
                        </span>
                      </td>

                      {/* Total Gastado */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="font-black text-slate-900 text-sm">
                          ${(cust.totalSpent || 0).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-semibold">
                          Bs. {((cust.totalSpent || 0) * (bcvRate || 1)).toFixed(2)}
                        </div>
                      </td>

                      {/* Última visita */}
                      <td className="py-3.5 px-4 text-right text-slate-500 whitespace-nowrap">
                        {cust.lastOrderDate ? (
                          new Date(cust.lastOrderDate).toLocaleDateString('es-VE')
                        ) : cust.updatedAt ? (
                          new Date(cust.updatedAt).toLocaleDateString('es-VE')
                        ) : (
                          <span className="text-slate-400 italic">-</span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedCustomerForHistory(cust)}
                            className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors cursor-pointer"
                            title="Ver Historial de Compras"
                          >
                            <Receipt size={15} />
                          </button>

                          <button
                            onClick={() => handleOpenEdit(cust)}
                            className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors cursor-pointer"
                            title="Editar Datos"
                          >
                            <Edit2 size={15} />
                          </button>

                          <button
                            onClick={() => setCustomerToDelete(cust)}
                            className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
                            title="Eliminar Cliente"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Crear / Editar Cliente */}
      <AnimatePresence>
        {isAddEditModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="p-6 pb-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center font-bold">
                    <UserPlus size={20} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">
                      {editingCustomer ? 'Editar Ficha de Cliente' : 'Registrar Nuevo Cliente'}
                    </h3>
                    <p className="text-xs text-slate-500">Completa la información para facturación e historial</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAddEditModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/50"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSaveCustomer} className="p-6 space-y-4">
                {/* Documento (Cédula/RIF) */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Cédula / RIF / ID Fiscal
                  </label>
                  <div className="flex rounded-xl border border-slate-200 overflow-hidden focus-within:border-orange-500 transition-all">
                    <select
                      value={docPrefix}
                      onChange={(e) => setDocPrefix(e.target.value as any)}
                      className="bg-slate-100 text-slate-800 font-extrabold text-xs px-3 py-2.5 border-r border-slate-200 outline-none cursor-pointer"
                    >
                      <option value="V-">V-</option>
                      <option value="E-">E-</option>
                      <option value="J-">J-</option>
                      <option value="G-">G-</option>
                    </select>
                    <input
                      type="text"
                      value={docNumber}
                      onChange={(e) => setDocNumber(e.target.value.replace(/\D/g, ''))}
                      placeholder="12345678"
                      className="w-full px-3 py-2.5 text-xs font-mono font-bold text-slate-800 outline-none placeholder-slate-400 bg-white"
                    />
                  </div>
                </div>

                {/* Nombre */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Nombre y Apellido / Razón Social
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-orange-500 transition-all"
                  />
                </div>

                {/* Teléfono */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Teléfono de Contacto
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ej. 0412-1234567"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 outline-none focus:bg-white focus:border-orange-500 transition-all"
                  />
                </div>

                {/* Dirección */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Dirección Habitacional / Fiscal
                  </label>
                  <textarea
                    rows={2}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ej. Av. Manaure entre Calle Jabonería, Coro"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-orange-500 transition-all resize-none"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsAddEditModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-200/50 transition-all border border-slate-200 bg-white cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 transition-all shadow-sm cursor-pointer border-0 disabled:bg-orange-300"
                  >
                    {isSaving ? 'Guardando...' : editingCustomer ? 'Guardar Cambios' : 'Registrar Cliente'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Historial de Compras */}
      <AnimatePresence>
        {selectedCustomerForHistory && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="p-6 pb-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                    <Receipt size={20} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">
                      Historial de Compras: {selectedCustomerForHistory.name}
                    </h3>
                    <p className="text-xs text-slate-500 font-mono">ID: {selectedCustomerForHistory.id}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCustomerForHistory(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/50"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4 flex-1">
                {customerOrders.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-xs font-semibold">No se encontraron facturas o pedidos históricos en el sistema.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {customerOrders.map((ord) => (
                      <div
                        key={ord.id}
                        className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 space-y-2 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-black text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-md">
                              {ord.controlNumber ? `#${ord.controlNumber}` : `ID: ${ord.id.slice(0, 8)}`}
                            </span>
                            <span className="text-xs font-bold text-slate-700">
                              Mesa {ord.tableId.replace('t', '')}
                            </span>
                          </div>
                          <span className="text-xs font-bold text-slate-500">
                            {new Date(ord.timestamp).toLocaleString('es-VE', {
                              dateStyle: 'short',
                              timeStyle: 'short'
                            })}
                          </span>
                        </div>

                        <div className="text-xs text-slate-600 space-y-1">
                          {(ord.items || []).map((it, idx) => (
                            <div key={idx} className="flex justify-between">
                              <span>
                                {it.quantity}x {it.menuItem?.name || 'Producto'}
                              </span>
                              <span className="font-semibold text-slate-800">
                                ${( (it.menuItem?.price || 0) * it.quantity ).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs font-bold text-slate-900">
                          <span>Método: {ord.paymentMethod?.toUpperCase() || 'PAGADO'}</span>
                          <span className="text-sm font-black text-slate-900">Total: ${ord.total.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setSelectedCustomerForHistory(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Confirmación de Eliminación */}
      <AnimatePresence>
        {customerToDelete && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-sm w-full overflow-hidden"
            >
              <div className="p-6 pb-4 border-b border-slate-100 bg-red-50 flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-red-900 text-base">Eliminar Cliente</h3>
                  <p className="text-xs text-red-600 font-medium">Confirmación de borrado permanente</p>
                </div>
              </div>

              <div className="p-6">
                <p className="text-xs text-slate-600 leading-relaxed">
                  ¿Estás seguro de que deseas eliminar permanentemente a <strong>{customerToDelete.name}</strong> (
                  {customerToDelete.id}) de la base de datos de clientes?
                </p>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setCustomerToDelete(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-200/50 transition-all border border-slate-200 bg-white"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-all shadow-sm border-0"
                >
                  Eliminar Cliente
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
