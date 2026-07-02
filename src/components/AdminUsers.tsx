import React, { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, setDoc, deleteDoc, getDocs, writeBatch } from '../firebase';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { toast } from 'sonner';
import { 
  Users, 
  UserPlus, 
  Trash2, 
  Shield, 
  UserCheck, 
  RefreshCw, 
  DollarSign, 
  TrendingUp,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  Lock,
  ShieldAlert,
  RotateCcw
} from 'lucide-react';
import { useBCVRate } from '../hooks/useBCVRate';
import { AnimatePresence, motion } from 'motion/react';
import { INITIAL_MENU, INITIAL_TABLES } from '../data';

interface DbUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'waiter' | 'chef' | 'bartender';
  uid?: string;
  createdAt?: number;
}

interface AdminAction {
  type: 'rate' | 'create_user' | 'delete_user' | 'update_passcode' | 'pilot_reset';
  title: string;
  description: string;
  payload: any;
  onExecute: () => Promise<void>;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<DbUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // New user form state
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'waiter' | 'chef' | 'bartender'>('waiter');
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);

  // Exchange rate form state
  const { rate: currentRate } = useBCVRate();
  const [manualRate, setManualRate] = useState('');
  const [isUpdatingRate, setIsUpdatingRate] = useState(false);

  // Security Passcode states
  const [adminPasscode, setAdminPasscode] = useState('1234');
  const [newPasscode, setNewPasscode] = useState('');
  const [showNewPasscode, setShowNewPasscode] = useState(false);
  const [isUpdatingPasscode, setIsUpdatingPasscode] = useState(false);

  // Pending security action modal state
  const [pendingAction, setPendingAction] = useState<AdminAction | null>(null);
  const [enteredPasscode, setEnteredPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [passcodeError, setPasscodeError] = useState(false);

  useEffect(() => {
    if (currentRate) {
      setManualRate(currentRate.toString());
    }
  }, [currentRate]);

  // Subscribe to registered users in real-time
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const usersList: DbUser[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name || '',
            email: data.email || doc.id,
            role: data.role || 'waiter',
            uid: data.uid,
            createdAt: data.createdAt,
          } as DbUser;
        });
        setUsers(usersList);
        setLoadingUsers(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users');
        toast.error('Error al cargar lista de usuarios');
        setLoadingUsers(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Subscribe to continuous security passcode from configuration
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
      (error) => {
        console.error("Error al suscribirse a configuración de seguridad:", error);
      }
    );

    return () => unsubSecurity();
  }, []);

  // Trigger User Creation with intermediate security validation
  const triggerCreateUser = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = newName.trim();
    const trimmedEmail = newEmail.trim().toLowerCase();

    if (!trimmedName) {
      toast.error('Por favor escribe el Nombre y Apellido');
      return;
    }
    if (!trimmedEmail) {
      toast.error('Por favor escribe un correo válido');
      return;
    }

    setPendingAction({
      type: 'create_user',
      title: 'Autorizar Nuevo Personal',
      description: `Autorizar a "${trimmedName}" (${trimmedEmail}) con el rol de [${newRole === 'admin' ? 'Administrador' : newRole === 'chef' ? 'Cocina' : newRole === 'bartender' ? 'Barra' : 'Mesero'}] en el sistema de caja.`,
      payload: { trimmedName, trimmedEmail, newRole },
      onExecute: async () => {
        setIsSubmittingUser(true);
        try {
          const userRef = doc(db, 'users', trimmedEmail);
          await setDoc(userRef, {
            name: trimmedName,
            email: trimmedEmail,
            role: newRole,
            createdAt: Date.now(),
          });

          toast.success(`Usuario ${trimmedName} registrado exitosamente como ${newRole}`);
          setNewName('');
          setNewEmail('');
          setNewRole('waiter');
        } catch (error) {
          toast.error('Error de permisos o conexión al crear el usuario.');
          console.error(error);
        } finally {
          setIsSubmittingUser(false);
        }
      }
    });
  };

  // Trigger User Deletion with custom modal confirmation
  const triggerDeleteUser = (id: string, name: string) => {
    setPendingAction({
      type: 'delete_user',
      title: 'Eliminar Personal Autorizado',
      description: `Eliminar permanentemente los accesos y perfil de "${name}" (${id}). El personal perderá acceso inmediato.`,
      payload: { id, name },
      onExecute: async () => {
        try {
          await deleteDoc(doc(db, 'users', id));
          toast.success(`Usuario ${name} ha sido eliminado permanentemente del sistema.`);
        } catch (error) {
          toast.error('Error de permisos al eliminar el usuario.');
          console.error(error);
        }
      }
    });
  };

  // Trigger Rate Change with security code protection
  const triggerSaveRate = (e: React.FormEvent) => {
    e.preventDefault();
    const rateVal = parseFloat(manualRate);
    if (isNaN(rateVal) || rateVal <= 0) {
      toast.error('Por favor ingresa un monto válido mayor a 0');
      return;
    }

    setPendingAction({
      type: 'rate',
      title: 'Actualizar Tasa del Dólar',
      description: `Cambiar la tasa de conversión global del sistema de Bs. ${currentRate ? currentRate.toFixed(2) : 'Cargando'} a Bs. ${rateVal.toFixed(2)}.`,
      payload: { rateVal },
      onExecute: async () => {
        setIsUpdatingRate(true);
        try {
          await setDoc(doc(db, 'settings', 'rate'), {
            rate: rateVal,
            updatedAt: Date.now(),
          });
          toast.success(`Tasa de cambio actualizada: Bs. ${rateVal.toFixed(2)}`);
        } catch (error) {
          toast.error('Error al guardar la nueva tasa de cambio.');
          console.error(error);
        } finally {
          setIsUpdatingRate(false);
        }
      }
    });
  };

  // Trigger Passcode Change with verification of the current code
  const triggerUpdatePasscode = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedCode = newPasscode.trim();
    if (trimmedCode.length < 4) {
      toast.error('La clave de seguridad debe contener un mínimo de 4 caracteres.');
      return;
    }

    setPendingAction({
      type: 'update_passcode',
      title: 'Cambiar Clave Administrativa',
      description: `Modificar la clave de seguridad administrativa del panel global a la nueva clave introducida.`,
      payload: { trimmedCode },
      onExecute: async () => {
        setIsUpdatingPasscode(true);
        try {
          await setDoc(doc(db, 'settings', 'security'), {
            adminPasscode: trimmedCode,
            updatedAt: Date.now(),
          });
          toast.success('Clave de seguridad administrativa actualizada con éxito.');
          setNewPasscode('');
        } catch (error) {
          toast.error('Error al actualizar la clave de seguridad.');
          console.error(error);
        } finally {
          setIsUpdatingPasscode(false);
        }
      }
    });
  };

  // Trigger Pilot Reset to clear orders, ingredients, and reset menu/tables
  const triggerPilotReset = () => {
    setPendingAction({
      type: 'pilot_reset',
      title: 'Dejar Todo en Cero para Prueba Piloto ⚙️',
      description: 'Esta es una ACCIÓN DE ALTO RIESGO. Se eliminarán permanentemente todas las órdenes de venta, todos los ingredientes registrados y el stock actual se restablecerá a cero en todos los productos del menú. Las cuentas del personal (usuarios), tasas y claves administrativas no se borrarán.',
      payload: {},
      onExecute: async () => {
        const loadingId = toast.loading('Inicializando limpieza del sistema...');
        try {
          // 1. Borrar todas las órdenes
          const ordersSnap = await getDocs(collection(db, 'orders'));
          if (!ordersSnap.empty) {
            const batch = writeBatch(db);
            ordersSnap.docs.forEach(doc => {
              batch.delete(doc.ref);
            });
            await batch.commit();
          }

          // 2. Borrar todos los ingredientes
          const ingredientsSnap = await getDocs(collection(db, 'ingredients'));
          if (!ingredientsSnap.empty) {
            const batch = writeBatch(db);
            ingredientsSnap.docs.forEach(doc => {
              batch.delete(doc.ref);
            });
            await batch.commit();
          }

          // 3. Borrar todo el menú actual para re-inicializar en limpio
          const menuSnap = await getDocs(collection(db, 'menuItems'));
          if (!menuSnap.empty) {
            const batch = writeBatch(db);
            menuSnap.docs.forEach(doc => {
              batch.delete(doc.ref);
            });
            await batch.commit();
          }

          // 4. Borrar todas las mesas actuales para resetear status limpio
          const tablesSnap = await getDocs(collection(db, 'tables'));
          if (!tablesSnap.empty) {
            const batch = writeBatch(db);
            tablesSnap.docs.forEach(doc => {
              batch.delete(doc.ref);
            });
            await batch.commit();
          }

          // 5. Re-inicializar menú limpio (con stock en cero) y mesas disponibles
          const initBatch = writeBatch(db);
          INITIAL_MENU.forEach(item => {
            const ref = doc(db, 'menuItems', item.id);
            initBatch.set(ref, {
              name: item.name,
              category: item.category,
              price: item.price,
              stock: 0
            });
          });

          INITIAL_TABLES.forEach(table => {
            const ref = doc(db, 'tables', table.id);
            initBatch.set(ref, {
              number: table.number,
              status: 'available'
            });
          });

          await initBatch.commit();

          toast.dismiss(loadingId);
          toast.success('¡Limpieza completada! El sistema se encuentra en cero con el personal registrado intacto.');
        } catch (error) {
          toast.dismiss(loadingId);
          console.error(error);
          toast.error('Ocurrió un error al limpiar los datos de Firestore. Revisa las reglas.');
        }
      }
    });
  };

  // Handle confirmation and match verification
  const handleConfirmAction = async () => {
    if (enteredPasscode !== adminPasscode) {
      setPasscodeError(true);
      toast.error('Clave de seguridad incorrecta. Inténtelo de nuevo.');
      return;
    }

    if (pendingAction) {
      setPasscodeError(false);
      const actionToExecute = pendingAction.onExecute;
      setPendingAction(null);
      setEnteredPasscode('');
      await actionToExecute();
    }
  };

  // Handle operation cancellation
  const handleCancelAction = () => {
    setPendingAction(null);
    setEnteredPasscode('');
    setPasscodeError(false);
    setShowPasscode(false);
    toast.info('Operación cancelada.');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
          <Shield className="text-orange-500" size={32} />
          Panel de Administración
        </h1>
        <p className="text-slate-500 mt-1">
          Gestiona permisos de usuarios, configura tasa del dólar y protege acciones con clave de seguridad.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (Forms) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Tasa Dolar Card */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center gap-2.5 mb-2">
              <TrendingUp className="text-orange-500" size={22} />
              <h2 className="text-lg font-bold text-slate-800">Tasa Dólar</h2>
            </div>
            <p className="text-slate-500 text-xs mb-4">
              Modifica la tasa de conversión para calcular totales en Bolívares en toda la aplicación. Requiere clave de autorización.
            </p>

            <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-orange-700 font-semibold uppercase tracking-wider">Tasa Actual Aplicada</p>
                <p className="text-2xl font-black text-orange-950 mt-0.5">
                  Bs. {currentRate ? currentRate.toFixed(2) : 'Cargando...'}
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
                <DollarSign size={20} />
              </div>
            </div>

            <form onSubmit={triggerSaveRate} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Nueva Tasa (Bs. por USD)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold text-sm">
                    Bs.
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={manualRate}
                    onChange={(e) => setManualRate(e.target.value)}
                    placeholder="Ej. 36.50"
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-orange-500 focus:bg-white text-slate-800 font-bold transition-all"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isUpdatingRate}
                className="w-full bg-orange-500 hover:bg-orange-600 active:transform active:scale-[0.98] text-white py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isUpdatingRate ? 'Actualizando...' : 'Guardar Tasa de Cambio'}
              </button>
            </form>
          </div>

          {/* Create User Card */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center gap-2.5 mb-2">
              <UserPlus className="text-orange-500" size={22} />
              <h2 className="text-lg font-bold text-slate-800">Registrar Usuario</h2>
            </div>
            <p className="text-slate-500 text-xs mb-4">
              Agrega una nueva cuenta de personal autorizada. Requiere verificación con clave para confirmar creación.
            </p>

            <form onSubmit={triggerCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Nombre y Apellido
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ej. Rafael Gerardo"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-orange-500 focus:bg-white text-slate-800 font-medium transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Correo Electrónico (Google Account)
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="Ej. elvalerasmoke@gmail.com"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-orange-500 focus:bg-white text-slate-800 font-mono text-sm transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Rol / Permiso
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['admin', 'waiter', 'chef', 'bartender'] as const).map((r) => {
                    const label = r === 'admin' ? 'Admin' : r === 'waiter' ? 'Mesero' : r === 'chef' ? 'Cocina' : 'Barra';
                    const isSelected = newRole === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setNewRole(r)}
                        className={`py-2 px-3 text-xs font-bold rounded-lg transition-all capitalize border cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                            : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmittingUser}
                className="w-full bg-slate-900 hover:bg-slate-800 active:transform active:scale-[0.98] text-white py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-1.5 mt-2 cursor-pointer"
              >
                {isSubmittingUser ? 'Registrando...' : 'Autorizar Usuario'}
              </button>
            </form>
          </div>

          {/* Admin Passcode Config Card */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center gap-2.5 mb-2">
              <KeyRound className="text-orange-500" size={22} />
              <h2 className="text-lg font-bold text-slate-800">Clave de Seguridad</h2>
            </div>
            <p className="text-slate-500 text-xs mb-4">
              Configura o actualiza la clave exigida para confirmar acciones en el sistema. (Clave inicial: <strong>1234</strong>).
            </p>

            <form onSubmit={triggerUpdatePasscode} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Nueva Clave de Seguridad
                </label>
                <div className="relative">
                  <input
                    type={showNewPasscode ? "text" : "password"}
                    value={newPasscode}
                    onChange={(e) => setNewPasscode(e.target.value)}
                    placeholder="Ej. 1234"
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-orange-500 focus:bg-white text-slate-800 font-mono text-sm tracking-widest transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPasscode(!showNewPasscode)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-650 focus:outline-none"
                  >
                    {showNewPasscode ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-start gap-2">
                <Lock className="text-slate-400 shrink-0 mt-0.5" size={14} />
                <p className="text-[11px] text-slate-500 leading-normal">
                  Los cambios a la clave de seguridad también requerirán confirmar introduciendo la clave actual para validar control.
                </p>
              </div>

              <button
                type="submit"
                disabled={isUpdatingPasscode}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 py-2.5 rounded-xl text-sm font-bold shadow-none transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isUpdatingPasscode ? 'Actualizando...' : 'Actualizar Clave de Seguridad'}
              </button>
            </form>
          </div>

          {/* Pilot Reset Card */}
          <div className="bg-red-50 rounded-2xl border border-red-100 p-6 shadow-sm">
            <div className="flex items-center gap-2.5 mb-2">
              <RotateCcw className="text-red-600 shrink-0" size={22} />
              <h2 className="text-lg font-bold text-red-950">Prueba Piloto / Reinicio</h2>
            </div>
            <p className="text-red-700/80 text-xs mb-4 leading-relaxed font-medium">
              ¿Listo para empezar la prueba piloto de hoy? Usa esta opción para <strong>limpiar todo el historial de pedidos e ingredientes, y poner el stock a cero</strong> en todos los productos del menú. Las cuentas del personal autorizado no se tocarán.
            </p>
            <button
              type="button"
              onClick={triggerPilotReset}
              className="w-full bg-red-600 hover:bg-red-700 active:transform active:scale-[0.98] text-white py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer border-0"
            >
              <RotateCcw size={16} />
              Dejar Todo en Cero Excepto Usuarios
            </button>
          </div>

        </div>

        {/* Right Column (Users List) */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden h-full flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Users className="text-orange-500" size={22} />
                <h2 className="text-lg font-bold text-slate-800">Personal Autorizado</h2>
              </div>
              <p className="text-xs font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                {users.length} {users.length === 1 ? 'Usuario' : 'Usuarios'}
              </p>
            </div>

            <div className="flex-1 overflow-x-auto min-h-[400px]">
              {loadingUsers ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 p-12">
                  <RefreshCw className="animate-spin text-orange-500" size={28} />
                  <p className="text-slate-400 text-sm">Cargando personal...</p>
                </div>
              ) : users.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-12 text-center text-slate-400">
                  <UserCheck className="mb-2 text-slate-300" size={36} />
                  <p className="font-semibold text-sm">No hay personal registrado</p>
                  <p className="text-xs mt-1">Registra un usuario en el formulario a la izquierda.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Nombre</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Correo</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Rol</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((u) => {
                      let badgeColor = '';
                      let badgeLabel = '';

                      if (u.role === 'admin') {
                        badgeColor = 'bg-red-50 text-red-600 border-red-100';
                        badgeLabel = 'Admin';
                      } else if (u.role === 'chef') {
                        badgeColor = 'bg-emerald-50 text-emerald-600 border-emerald-100';
                        badgeLabel = 'Cocina';
                      } else if (u.role === 'bartender') {
                        badgeColor = 'bg-purple-50 text-purple-600 border-purple-100';
                        badgeLabel = 'Barra';
                      } else {
                        badgeColor = 'bg-blue-50 text-blue-600 border-blue-100';
                        badgeLabel = 'Mesero';
                      }

                      return (
                        <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-4">
                            <p className="font-bold text-slate-800 text-sm">{u.name}</p>
                            {u.uid ? (
                              <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                Verificado (ID Guardado)
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                Registro Pendiente de Login
                              </span>
                            )}
                          </td>
                          <td className="p-4 text-xs font-mono text-slate-600 font-medium break-all">{u.email}</td>
                          <td className="p-4">
                            <span
                              className={`px-2.5 py-1 text-xs font-bold rounded-full border ${badgeColor}`}
                            >
                              {badgeLabel}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <button
                              type="button"
                              onClick={() => triggerDeleteUser(u.id, u.name)}
                              className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-colors inline-flex items-center justify-center cursor-pointer border-0 shadow-none bg-transparent"
                              title="Eliminar Personal"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Admin Action Confirmation Modal */}
      <AnimatePresence>
        {pendingAction && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full overflow-hidden"
            >
              {/* Header */}
              <div className="p-6 pb-4 border-b border-slate-100 bg-slate-50 flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 shrink-0">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{pendingAction.title}</h3>
                  <p className="text-xs text-slate-500 mt-1">Autorización del Administrador Requerida</p>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-600 leading-relaxed bg-orange-50/50 border border-orange-100/50 rounded-xl p-3.5">
                  {pendingAction.description}
                </p>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Clave de Seguridad Administrativa
                  </label>
                  <div className="relative">
                    <input
                      type={showPasscode ? "text" : "password"}
                      value={enteredPasscode}
                      onChange={(e) => {
                        setEnteredPasscode(e.target.value);
                        setPasscodeError(false);
                      }}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleConfirmAction();
                        }
                      }}
                      placeholder="Ingrese la clave..."
                      className={`w-full px-4 py-3 bg-slate-50 border outline-none rounded-xl focus:bg-white text-slate-800 font-mono tracking-widest text-center text-lg transition-all ${
                        passcodeError
                          ? 'border-red-500 bg-red-50 focus:border-red-500'
                          : 'border-slate-200 focus:border-orange-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasscode(!showPasscode)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                    >
                      {showPasscode ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {passcodeError && (
                    <p className="text-[11px] text-red-500 font-semibold flex items-center gap-1 mt-1">
                      <AlertCircle size={12} />
                      Clave inválida. Verifique e intente nuevamente.
                    </p>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={handleCancelAction}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-200/50 transition-all border border-slate-200 bg-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAction}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 active:scale-95 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  Confirmar Operación
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
