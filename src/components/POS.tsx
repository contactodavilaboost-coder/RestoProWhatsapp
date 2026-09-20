import React, { useState, useEffect, useRef } from 'react';
import { Table, MenuItem, Order, OrderItem, User, Ingredient, Area, MenuAddition, Customer } from '../types';
import {
  Users,
  Plus,
  Minus,
  Trash2,
  Send,
  ShoppingCart,
  DollarSign,
  X,
  FileText,
  MessageSquare,
  Smartphone,
  Hash,
  ArrowLeftRight,
  ShieldAlert,
  EyeOff,
  Eye,
  Lock,
  Unlock,
  AlertCircle,
  CheckCircle2,
  Pencil,
  Check,
  Settings,
  Search,
  ArrowLeft,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { useBCVRate } from '../hooks/useBCVRate';
import { toast } from 'sonner';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, writeBatch, onSnapshot, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { AnimatePresence, motion } from 'motion/react';
import * as XLSX from 'xlsx';
import { printReceipt, generateReceiptPdf, getNextControlNumber, ReceiptPaymentDetails, RECEIPT_CONFIG } from '../utils/receipt';

export { RECEIPT_CONFIG };

interface POSProps {
  tables: Table[];
  menu: MenuItem[];
  onPlaceOrder: (tableId: string, items: OrderItem[], total: number) => void;
  activeOrders: Order[];
  onCloseTable: (
    tableId: string,
    paymentMethod: string,
    referenceNumber?: string,
    customerName?: string,
    customerAddress?: string,
    customerID?: string,
    customerPhone?: string,
    isDelivery?: boolean,
    deliveryCost?: number,
    casheaDetails?: {
      initialPercentage?: number;
      initialAmount?: number;
      financedAmount?: number;
      initialMethod?: string;
    },
    controlNumber?: string
  ) => void;
  currentUser: User | null;
  ingredients: Ingredient[];
  registerSettings?: any;
}

export interface CategoryTabItem {
  id: string;
  label: string;
  emoji: string;
}

const CATEGORY_TABS: CategoryTabItem[] = [
  { id: 'pizzas', label: 'Pizzas', emoji: '🍕' },
  { id: 'paninis', label: 'Paninis', emoji: '🥪' },
  { id: 'patacones', label: 'Patacones', emoji: '🍌' },
  { id: 'bebida', label: 'Bebidas', emoji: '🥤' },
  { id: 'postre', label: 'Postres', emoji: '🍰' }
];

const getCategoryLabel = (categoryRaw: string) => {
  const norm = (categoryRaw || '').toLowerCase().trim();
  if (norm.includes('bebida') || norm.includes('drink')) return 'Bebida 🥤';
  if (norm.includes('postre') || norm.includes('dessert')) return 'Postre 🍰';
  if (norm.includes('panini') || norm.includes('sandwich')) return 'Panini 🥪';
  if (norm.includes('pizza')) return 'Pizza 🍕';
  if (norm.includes('patacon') || norm.includes('patacón')) return 'Patacón 🍌';
  if (norm.includes('hamburguesa') || norm.includes('burger')) return 'Hamburguesa 🍔';
  return categoryRaw ? (categoryRaw.charAt(0).toUpperCase() + categoryRaw.slice(1)) : 'Plato';
};

const matchCategory = (itemCategory: string, filterId: string | null) => {
  if (!filterId || filterId === 'all') return true;
  const itemCat = (itemCategory || '').toLowerCase().trim();

  if (filterId === 'bebida') {
    return itemCat.includes('bebida') || itemCat.includes('beverage') || itemCat.includes('drink');
  }
  if (filterId === 'postre') {
    return itemCat.includes('postre') || itemCat.includes('dessert');
  }
  if (filterId === 'paninis') {
    return itemCat.includes('panini') || itemCat.includes('sandwich');
  }
  if (filterId === 'pizzas') {
    return itemCat.includes('pizza');
  }
  if (filterId === 'patacones') {
    return itemCat.includes('patacon') || itemCat.includes('patacón');
  }
  return itemCat === filterId;
};

export default function POS({ tables, menu, onPlaceOrder, activeOrders, onCloseTable, currentUser, ingredients, registerSettings }: POSProps) {
  const isRegisterOpen = registerSettings !== null ? !!registerSettings.isOpen : false;

  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [currentCart, setCurrentCart] = useState<OrderItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('efectivo');
  const [referenceNumber, setReferenceNumber] = useState('');

  // Cashea state
  const [casheaPercentage, setCasheaPercentage] = useState<number>(60);
  const [casheaInitialMethod, setCasheaInitialMethod] = useState<string>('tarjeta');

  // Split Bill state
  const [splitCount, setSplitCount] = useState<number>(1);
  const [currentSplitPart, setCurrentSplitPart] = useState<number>(1);
  const [editingItem, setEditingItem] = useState<OrderItem | null>(null);
  const [itemNotes, setItemNotes] = useState('');
  const [selectedAdditions, setSelectedAdditions] = useState<{ name: string, price: number }[]>([]);

  // Register state
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isCloseRegisterModalOpen, setIsCloseRegisterModalOpen] = useState(false);
  const [registerInitialCash, setRegisterInitialCash] = useState<string>('');
  const [registerActualCash, setRegisterActualCash] = useState<string>('');
  const [registerPasscode, setRegisterPasscode] = useState('');
  const [registerPasscodeError, setRegisterPasscodeError] = useState(false);

  // Customer info states
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerID, setCustomerID] = useState('');
  const [customerDocPrefix, setCustomerDocPrefix] = useState<'V-' | 'E-' | 'J-' | 'G-'>('V-');
  const [customerDocNumber, setCustomerDocNumber] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isDelivery, setIsDelivery] = useState(false);
  const [deliveryCost, setDeliveryCost] = useState('');
  const [dishSearch, setDishSearch] = useState('');

  // Base de datos de clientes y coincidencia inteligente en tiempo real
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [matchedCustomer, setMatchedCustomer] = useState<Customer | null>(null);
  const [nameSearchTerm, setNameSearchTerm] = useState('');
  const [isSyncingCustomers, setIsSyncingCustomers] = useState(false);
  const autoMigratedRef = useRef(false);

  // Bloqueo estricto para evitar doble clic al cobrar mesa y salto de números
  const isProcessingPaymentRef = useRef(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Escuchar la colección de clientes en tiempo real desde Firestore y cargar respaldo API
  useEffect(() => {
    // Intento inicial rápido mediante endpoint backend
    fetch('/api/customers')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.success && Array.isArray(data.customers) && data.customers.length > 0) {
          setCustomers(prev => {
            const map = new Map<string, Customer>((prev || []).map(c => [c.id, c]));
            data.customers.forEach((c: Customer) => {
              if (!map.has(c.id)) map.set(c.id, c);
            });
            return Array.from(map.values());
          });
        }
      })
      .catch(() => {});

    // Escucha en tiempo real de Firestore
    const unsub = onSnapshot(collection(db, 'customers'), (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Customer));
      setCustomers(list);
    }, (err) => {
      console.warn('Error al escuchar coleccion customers:', err);
    });

    return () => unsub();
  }, []);

  // Función robusta para migrar y sincronizar clientes desde el historial completo de pedidos
  const syncCustomersFromOrders = async (interactive = false) => {
    try {
      if (interactive) setIsSyncingCustomers(true);

      // 1. Intentar primero a través de la API backend con permisos de administración
      try {
        const res = await fetch('/api/sync-customers', { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          if (data?.success && Array.isArray(data.customers)) {
            setCustomers(data.customers);
            if (interactive) {
              toast.success(`¡Sincronización completada! ${data.count || data.customers.length} clientes procesados.`);
            }
            return;
          }
        }
      } catch (apiErr) {
        console.warn('Sincronización por backend no disponible, procediendo con cliente directo:', apiErr);
      }

      // 2. Respaldo directo en Firestore desde el cliente
      let ordersToProcess = activeOrders;
      if (!ordersToProcess || ordersToProcess.length === 0 || interactive) {
        try {
          const snap = await getDocs(collection(db, 'orders'));
          if (!snap.empty) {
            ordersToProcess = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
          }
        } catch (e) {
          console.warn('Error fetching all orders for customer sync:', e);
        }
      }

      if (!ordersToProcess || ordersToProcess.length === 0) {
        if (interactive) toast.info('No se encontraron órdenes en el historial.');
        return;
      }

      const uniqueCusts = new Map<string, Customer>();

      ordersToProcess.forEach(o => {
        const rawId = (o.customerID || '').toString().trim();
        const rawName = (o.customerName || '').toString().trim();
        const rawPhone = (o.customerPhone || '').toString().trim();
        const rawAddr = (o.customerAddress || '').toString().trim();

        if (!rawId && !rawName && !rawPhone) return;

        const isGeneric = !rawName || /^(consumidor final|cliente general|cliente|general|sin nombre)$/i.test(rawName);
        if (!rawId && isGeneric && !rawPhone) return;

        let prefix: 'V-' | 'E-' | 'J-' | 'G-' = 'V-';
        let num = '';

        if (rawId) {
          const match = rawId.match(/^([VEJGvejg])[-_ .]?(.*)$/);
          if (match) {
            prefix = (match[1].toUpperCase() + '-') as 'V-' | 'E-' | 'J-' | 'G-';
            num = match[2].replace(/\D/g, '');
          } else {
            num = rawId.replace(/\D/g, '');
          }
        }

        // Si la cédula viene dentro del nombre (e.g. "Juan V-12345678")
        if (!num && rawName) {
          const nameMatch = rawName.match(/([VEJGvejg])[-_ .]?(\d{5,9})/i);
          if (nameMatch) {
            prefix = (nameMatch[1].toUpperCase() + '-') as 'V-' | 'E-' | 'J-' | 'G-';
            num = nameMatch[2];
          }
        }

        let cleanId = '';
        if (num && num.length >= 3) {
          cleanId = `${prefix}${num}`;
        } else if (rawName && !isGeneric) {
          cleanId = `CLI-${rawName.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '').slice(0, 20)}`;
        } else if (rawPhone) {
          cleanId = `TEL-${rawPhone.replace(/\D/g, '')}`;
        }

        if (!cleanId) return;

        const orderTimestamp = Number(o.timestamp) || Date.now();
        const orderTotal = Number(o.total) || 0;
        const existing = uniqueCusts.get(cleanId);

        if (!existing) {
          uniqueCusts.set(cleanId, {
            id: cleanId,
            docPrefix: prefix,
            docNumber: num || cleanId,
            name: (!isGeneric && rawName) ? rawName : 'Cliente',
            address: rawAddr || '',
            phone: rawPhone || '',
            totalOrders: 1,
            totalSpent: orderTotal,
            lastOrderDate: orderTimestamp,
            createdAt: orderTimestamp,
            updatedAt: Date.now()
          });
        } else {
          existing.totalOrders = (existing.totalOrders || 1) + 1;
          existing.totalSpent = (existing.totalSpent || 0) + orderTotal;
          if (orderTimestamp > (existing.lastOrderDate || 0)) {
            existing.lastOrderDate = orderTimestamp;
            if (rawAddr) existing.address = rawAddr;
          }
          if ((!existing.name || existing.name === 'Cliente' || (rawName && rawName.length > existing.name.length)) && rawName && !isGeneric) {
            existing.name = rawName;
          }
          if (!existing.phone && rawPhone) {
            existing.phone = rawPhone;
          }
          if (!existing.address && rawAddr) {
            existing.address = rawAddr;
          }
          if ((!existing.docNumber || existing.docNumber.startsWith('CLI-')) && num) {
            existing.docNumber = num;
            existing.docPrefix = prefix;
          }
        }
      });

      const extractedList = Array.from(uniqueCusts.values());
      if (extractedList.length === 0) {
        if (interactive) toast.info('No hay información de clientes identificables en los pedidos previos.');
        return;
      }

      // Guardar en Firestore en bloques de 400
      const BATCH_SIZE = 400;
      let totalSaved = 0;
      for (let i = 0; i < extractedList.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = extractedList.slice(i, i + BATCH_SIZE);
        chunk.forEach(c => {
          batch.set(doc(db, 'customers', c.id), c, { merge: true });
        });
        await batch.commit();
        totalSaved += chunk.length;
      }

      // Actualizar estado local inmediatamente
      setCustomers(prev => {
        const map = new Map<string, Customer>((prev || []).map(c => [c.id, c]));
        extractedList.forEach(c => {
          const curr = map.get(c.id);
          if (!curr) {
            map.set(c.id, c);
          } else {
            map.set(c.id, {
              ...curr,
              totalOrders: Math.max(curr.totalOrders || 0, c.totalOrders || 0),
              name: (curr.name && curr.name !== 'Cliente') ? curr.name : c.name,
              phone: curr.phone || c.phone,
              address: curr.address || c.address
            });
          }
        });
        return Array.from(map.values());
      });

      if (interactive) {
        toast.success(`¡Sincronización completada! ${totalSaved} clientes procesados desde el historial.`);
      }
    } catch (err: any) {
      console.error('Error sincronizando clientes:', err);
      if (interactive) {
        toast.error('Error al sincronizar clientes: ' + (err.message || 'Error desconocido'));
      }
    } finally {
      if (interactive) setIsSyncingCustomers(false);
    }
  };

  // Migración automática al cargar órdenes
  useEffect(() => {
    if (autoMigratedRef.current) return;
    if (activeOrders && activeOrders.length > 0) {
      autoMigratedRef.current = true;
      syncCustomersFromOrders(false);
    }
  }, [activeOrders]);

  // Busca y autocompleta el cliente por cédula/RIF
  const handleLookupCustomer = (prefix: string, cleanNum: string) => {
    const num = cleanNum.trim();
    if (!num || num.length < 3) {
      setMatchedCustomer(null);
      return;
    }
    const full = `${prefix}${num}`.toUpperCase();
    const found = customers.find(c => 
      c.id.toUpperCase() === full || 
      (c.docNumber === num && c.docPrefix === prefix) ||
      c.docNumber === num ||
      c.id.endsWith(num) ||
      c.id.replace(/\D/g, '') === num
    );

    if (found) {
      setMatchedCustomer(found);
      setCustomerName(found.name || '');
      setCustomerAddress(found.address || '');
      setCustomerPhone(found.phone || '');
      if (found.docPrefix) {
        setCustomerDocPrefix(found.docPrefix);
      }
    } else {
      setMatchedCustomer(null);
    }
  };

  // Selecciona un cliente sugerido por búsqueda de nombre
  const selectCustomerSuggestion = (cust: Customer) => {
    setMatchedCustomer(cust);
    const prefix = cust.docPrefix || (cust.id.match(/^([VEJGvejg])/i) ? ((cust.id[0].toUpperCase() + '-') as any) : 'V-');
    const num = cust.docNumber || cust.id.replace(/\D/g, '');
    setCustomerDocPrefix(prefix);
    setCustomerDocNumber(num);
    setCustomerID(num ? `${prefix}${num}` : cust.id);
    setCustomerName(cust.name || '');
    setCustomerAddress(cust.address || '');
    setCustomerPhone(cust.phone || '');
    setNameSearchTerm('');
  };

  const nameFilteredCustomers = nameSearchTerm.trim().length >= 2
    ? customers.filter(c => 
        (c.name && c.name.toLowerCase().includes(nameSearchTerm.toLowerCase())) ||
        (c.phone && c.phone.includes(nameSearchTerm.trim()))
      ).slice(0, 6)
    : [];

  // Dynamic category tabs derived from default categories + any custom ones created by the user
  const dynamicCategories: CategoryTabItem[] = [...CATEGORY_TABS];
  menu.forEach(item => {
    const catNorm = (item.category || '').toLowerCase().trim();
    const alreadyExists = dynamicCategories.some(cat => 
      cat.id === catNorm || 
      (cat.id === 'bebida' && (catNorm.includes('bebida') || catNorm.includes('drink'))) ||
      (cat.id === 'pizzas' && catNorm.includes('pizza')) ||
      (cat.id === 'paninis' && catNorm.includes('panini')) ||
      (cat.id === 'patacones' && (catNorm.includes('patacon') || catNorm.includes('patacón'))) ||
      (cat.id === 'postre' && catNorm.includes('postre'))
    );

    if (catNorm && !alreadyExists) {
      const labelName = catNorm.charAt(0).toUpperCase() + catNorm.slice(1);
      let emoji = '🍽️';
      if (catNorm.includes('hamburguesa') || catNorm.includes('burger')) emoji = '🍔';
      else if (catNorm.includes('carne') || catNorm.includes('parrilla') || catNorm.includes('grill') || catNorm.includes('smoke')) emoji = '🥩';
      else if (catNorm.includes('pollo') || catNorm.includes('chicken')) emoji = '🍗';
      else if (catNorm.includes('ensalada') || catNorm.includes('salad')) emoji = '🥗';
      else if (catNorm.includes('cafe') || catNorm.includes('café') || catNorm.includes('coffee')) emoji = '☕';
      else if (catNorm.includes('cerveza') || catNorm.includes('beer') || catNorm.includes('licor')) emoji = '🍺';
      else if (catNorm.includes('tequeño') || catNorm.includes('entrada') || catNorm.includes('snack')) emoji = '🧀';

      dynamicCategories.push({
        id: catNorm,
        label: labelName,
        emoji
      });
    }
  });

  // Security & action states
  const [adminPasscode, setAdminPasscode] = useState('1234');
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isChangeTableModalOpen, setIsChangeTableModalOpen] = useState(false);
  const [targetTable, setTargetTable] = useState<Table | null>(null);
  const [enteredPasscode, setEnteredPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [passcodeError, setPasscodeError] = useState(false);
  const [tableToDelete, setTableToDelete] = useState<Table | null>(null);
  const [itemToDelete, setItemToDelete] = useState<{ order: Order, itemIdx: number, item: OrderItem } | null>(null);

  // Areas states
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string>('all');
  const [isAreaModalOpen, setIsAreaModalOpen] = useState(false);
  const [newAreaName, setNewAreaName] = useState('');
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editingAreaName, setEditingAreaName] = useState<string>('');

  // Add Table Modal states
  const [isAddTableModalOpen, setIsAddTableModalOpen] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState<string>('');
  const [newTableAreaId, setNewTableAreaId] = useState<string>('');

  const { rate: bcvRate, loading: bcvLoading } = useBCVRate();

  // Subscribe to areas in Firestore
  useEffect(() => {
    const unsubAreas = onSnapshot(collection(db, 'areas'), async (snapshot) => {
      if (snapshot.empty) {
        // Seed default areas: Salón and Terraza
        try {
          const batch = writeBatch(db);
          batch.set(doc(db, 'areas', 'salon'), { name: 'Salón' });
          batch.set(doc(db, 'areas', 'terraza'), { name: 'Terraza' });
          await batch.commit();
        } catch (e) {
          console.error("Error seeding default areas:", e);
        }
      } else {
        const list = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name } as Area));
        setAreas(list);
      }
    }, (error) => {
      console.error("Error subscribing to areas:", error);
    });

    return () => unsubAreas();
  }, []);

  // Subscribe to security passcode from configuration
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

  const handleCreateArea = async () => {
    const nameTrimmed = newAreaName.trim();
    if (!nameTrimmed) {
      toast.error('Nombre de área no puede estar vacío.');
      return;
    }
    const id = nameTrimmed.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (areas.some(a => a.id === id)) {
      toast.error('Este área ya existe.');
      return;
    }
    try {
      await setDoc(doc(db, 'areas', id), { name: nameTrimmed });
      toast.success(`Área "${nameTrimmed}" creada con éxito.`);
      setNewAreaName('');
    } catch (e) {
      console.error(e);
      toast.error('Error al crear el área.');
    }
  };

  const handleDeleteArea = async (areaId: string, areaName: string) => {
    // check if tables exist in this area
    const hasTables = tables.some(t => t.areaId === areaId);
    if (hasTables) {
      toast.error(`No se puede eliminar "${areaName}" porque contiene mesas. Mueva o elimine las mesas primero.`);
      return;
    }
    try {
      await deleteDoc(doc(db, 'areas', areaId));
      toast.success(`Área "${areaName}" eliminada.`);
      if (selectedAreaId === areaId) {
        setSelectedAreaId('all');
      }
    } catch (e) {
      console.error(e);
      toast.error('Error al eliminar el área.');
    }
  };

  const handleUpdateArea = async (areaId: string) => {
    const nameTrimmed = editingAreaName.trim();
    if (!nameTrimmed) {
      toast.error('El nombre del área no puede estar vacío.');
      return;
    }
    try {
      await setDoc(doc(db, 'areas', areaId), { name: nameTrimmed }, { merge: true });
      toast.success(`Área actualizada con éxito a "${nameTrimmed}".`);
      setEditingAreaId(null);
      setEditingAreaName('');
    } catch (e) {
      console.error(e);
      toast.error('Error al actualizar el área.');
    }
  };

  const handleOpenAddTableModal = () => {
    const nextNumber = tables.length > 0 ? Math.max(...tables.map(t => Number(t.number) || 0)) + 1 : 1;
    setNewTableNumber(nextNumber.toString());
    if (selectedAreaId && selectedAreaId !== 'all') {
      setNewTableAreaId(selectedAreaId);
    } else if (areas.length > 0) {
      setNewTableAreaId(areas[0].id);
    } else {
      setNewTableAreaId('');
    }
    setIsAddTableModalOpen(true);
  };

  const handleExecuteAddTable = async () => {
    const val = newTableNumber.trim();
    if (!val) {
      toast.error('Nombre o Número de mesa inválido.');
      return;
    }

    // Attempt parse as number for sorting, or just use string
    const numOrStr = isNaN(Number(val)) ? val : Number(val);

    if (tables.some(t => String(t.number).toLowerCase() === val.toLowerCase())) {
      toast.error(`La mesa "${val}" ya existe.`);
      return;
    }
    if (!newTableAreaId) {
      toast.error('Por favor seleccione un área para la mesa.');
      return;
    }
    try {
      const nextId = `t${val.toLowerCase().replace(/\s+/g, '_')}`;
      await setDoc(doc(db, 'tables', nextId), {
        number: numOrStr,
        status: 'available',
        areaId: newTableAreaId
      });
      toast.success(`Mesa ${val} agregada con éxito`);
      setIsAddTableModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tables');
      toast.error('Error al agregar la mesa');
    }
  };

  const handleDeleteTableClick = (table: Table, e: React.MouseEvent) => {
    e.stopPropagation();
    const hasOrder = activeOrders.some(o => o.tableId === table.id && o.status !== 'paid');
    if (hasOrder) {
      toast.error(`No se puede eliminar la Mesa ${table.number} porque está ocupada con pedidos activos.`);
      return;
    }
    setTableToDelete(table);
  };

  const handleConfirmDeleteTable = async () => {
    if (!tableToDelete) return;
    try {
      await deleteDoc(doc(db, 'tables', tableToDelete.id));
      toast.success(`Mesa ${tableToDelete.number} eliminada con éxito.`);
      if (selectedTable?.id === tableToDelete.id) {
        setSelectedTable(null);
        setCurrentCart([]);
      }
      setTableToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'tables');
      toast.error('Error al eliminar la mesa');
    }
  };

  const handleConfirmChangeTable = async () => {
    if (!selectedTable || !targetTable) return;
    try {
      const ordersToUpdate = activeOrders.filter(o => o.tableId === selectedTable.id && o.status !== 'paid');
      const batch = writeBatch(db);

      ordersToUpdate.forEach(order => {
        const orderRef = doc(db, 'orders', order.id);
        batch.update(orderRef, { tableId: targetTable.id });
      });

      await batch.commit();
      toast.success(`Mesa ${selectedTable.number} cambiada de sitio con éxito a la Mesa ${targetTable.number}`);
      setSelectedTable(targetTable);
      setTargetTable(null);
      setIsChangeTableModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'orders');
      toast.error('Error al cambiar de mesa');
    }
  };

  const handleConfirmCancelOrders = async () => {
    if (enteredPasscode !== adminPasscode) {
      setPasscodeError(true);
      toast.error('Clave de seguridad incorrecta. Inténtelo de nuevo.');
      return;
    }

    if (!selectedTable) return;

    try {
      const activeTableOrders = activeOrders.filter(o => o.tableId === selectedTable.id && o.status !== 'paid');
      const batch = writeBatch(db);

      const ingredientRestorations: Record<string, number> = {};
      const menuStockRestorations: Record<string, number> = {};

      activeTableOrders.forEach(order => {
        const orderRef = doc(db, 'orders', order.id);
        batch.delete(orderRef);

        order.items.forEach(item => {
          const menuItem = menu.find(m => m.id === item.menuItem.id);
          if (menuItem) {
            if (menuItem.recipe && menuItem.recipe.length > 0) {
              menuItem.recipe.forEach(recipeItem => {
                const ingId = recipeItem.ingredientId;
                const qtyNeeded = recipeItem.quantity * item.quantity;
                ingredientRestorations[ingId] = (ingredientRestorations[ingId] || 0) + qtyNeeded;
              });
            } else {
              const menuId = item.menuItem.id;
              menuStockRestorations[menuId] = (menuStockRestorations[menuId] || 0) + item.quantity;
            }
          }
        });
      });

      Object.entries(ingredientRestorations).forEach(([ingId, qty]) => {
        const ing = ingredients.find(i => i.id === ingId);
        if (ing) {
          const ingRef = doc(db, 'ingredients', ingId);
          batch.update(ingRef, { stock: ing.stock + qty });
        }
      });

      Object.entries(menuStockRestorations).forEach(([menuId, qty]) => {
        const menuItem = menu.find(m => m.id === menuId);
        if (menuItem) {
          const itemRef = doc(db, 'menuItems', menuId);
          batch.update(itemRef, { stock: menuItem.stock + qty });
        }
      });

      await batch.commit();

      toast.success(`Pedidos de la Mesa ${selectedTable.number} cancelados y stock restaurado en cocina.`);
      setIsCancelModalOpen(false);
      setEnteredPasscode('');
      setPasscodeError(false);
      setSelectedTable(null);
      setCurrentCart([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'orders');
      toast.error('Error al cancelar pedidos');
    }
  };

  const handleConfirmDeleteItem = async () => {
    if (enteredPasscode !== adminPasscode) {
      setPasscodeError(true);
      toast.error('Clave de seguridad incorrecta. Inténtelo de nuevo.');
      return;
    }

    if (!itemToDelete) return;
    const { order, itemIdx, item } = itemToDelete;

    try {
      const batch = writeBatch(db);
      const orderRef = doc(db, 'orders', order.id);

      // Restore ingredient stock
      const ingredientRestorations: Record<string, number> = {};
      const menuStockRestorations: Record<string, number> = {};

      const menuItem = menu.find(m => m.id === item.menuItem.id);
      if (menuItem) {
        if (menuItem.recipe && menuItem.recipe.length > 0) {
          menuItem.recipe.forEach(recipeItem => {
            const ingId = recipeItem.ingredientId;
            const qtyNeeded = recipeItem.quantity * item.quantity;
            ingredientRestorations[ingId] = (ingredientRestorations[ingId] || 0) + qtyNeeded;
          });
        } else {
          menuStockRestorations[menuItem.id] = (menuStockRestorations[menuItem.id] || 0) + item.quantity;
        }
      }

      Object.entries(ingredientRestorations).forEach(([ingId, qty]) => {
        const ing = ingredients.find(i => i.id === ingId);
        if (ing) {
          const ingRef = doc(db, 'ingredients', ingId);
          batch.update(ingRef, { stock: ing.stock + qty });

          const movRef = doc(collection(db, 'inventoryMovements'));
          batch.set(movRef, {
            id: movRef.id,
            ingredientId: ing.id,
            ingredientName: ing.name,
            quantity: qty,
            type: 'entrada',
            prevStock: ing.stock,
            newStock: ing.stock + qty,
            timestamp: Date.now(),
            userName: currentUser?.name || 'Sistema',
            notes: `Cancelación de producto en mesa ${selectedTable?.number}`
          });
        }
      });

      Object.entries(menuStockRestorations).forEach(([menuId, qty]) => {
        const menuItemRef = menu.find(m => m.id === menuId);
        if (menuItemRef) {
          const itemRef = doc(db, 'menuItems', menuId);
          batch.update(itemRef, { stock: menuItemRef.stock + qty });
        }
      });

      // Update or delete order
      if (order.items.length === 1) {
        batch.delete(orderRef);
      } else {
        const newItems = order.items.filter((_, idx) => idx !== itemIdx);
        const itemTotal = (item.menuItem.price + (item.extraPrice || 0)) * item.quantity;
        const newTotal = order.total - itemTotal;
        batch.update(orderRef, {
          items: newItems.map(i => JSON.stringify(i)),
          total: newTotal
        });
      }

      await batch.commit();

      toast.success('Producto eliminado del pedido y stock restaurado.');
      setItemToDelete(null);
      setEnteredPasscode('');
      setPasscodeError(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'orders');
      toast.error('Error al eliminar producto.');
    }
  };

  const handleTableSelect = (table: Table) => {
    setSelectedTable(table);
    setCurrentCart([]); // Reset cart when changing table
    setSelectedCategory(null);
    setDishSearch('');
  };

  const addToCart = (item: MenuItem) => {
    if (!selectedTable) {
      toast.error('Seleccione una mesa primero');
      return;
    }

    if (item.additions && item.additions.length > 0) {
      // If item has additions, open the modal directly
      const newItem = { id: Math.random().toString(), menuItem: item, quantity: 1 };
      setEditingItem(newItem);
      setItemNotes('');
      setSelectedAdditions([]);
      // We don't add it to cart yet, we wait for them to save in the modal
      return;
    }

    setCurrentCart(prev => {
      const existing = prev.find(i => i.menuItem.id === item.id && !i.notes && (!i.selectedAdditions || i.selectedAdditions.length === 0));
      if (existing) {
        return prev.map(i => i.menuItem.id === item.id && !i.notes && (!i.selectedAdditions || i.selectedAdditions.length === 0) ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { id: Math.random().toString(), menuItem: item, quantity: 1 }];
    });
    toast.success(`${item.name} agregado al pedido`);
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCurrentCart(prev => prev.map(item => {
      if (item.id === itemId) {
        const newQuantity = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQuantity };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const openEditModal = (item: OrderItem) => {
    setEditingItem(item);
    setItemNotes(item.notes || '');
    setSelectedAdditions(item.selectedAdditions || []);
  };

  const updateAdditionCount = (addition: MenuAddition, delta: number) => {
    setSelectedAdditions(prev => {
      const exists = prev.find(a => a.name === addition.name);
      if (exists) {
        const currentCount = exists.count || 1;
        const newCount = currentCount + delta;
        if (newCount <= 0) {
          return prev.filter(a => a.name !== addition.name);
        }
        return prev.map(a => a.name === addition.name ? { ...a, count: newCount } : a);
      } else if (delta > 0) {
        return [...prev, { ...addition, count: 1 }];
      }
      return prev;
    });
  };

  const saveItemNotes = () => {
    if (editingItem) {
      const extraPrice = selectedAdditions.reduce((sum, a) => sum + (a.price * (a.count || 1)), 0);

      setCurrentCart(prev => {
        const isExisting = prev.some(item => item.id === editingItem.id);
        if (isExisting) {
          return prev.map(item =>
            item.id === editingItem.id ? { ...item, notes: itemNotes, selectedAdditions, extraPrice } : item
          );
        } else {
          // Check if an item with the exact same additions and notes already exists
          const identicalItem = prev.find(i =>
            i.menuItem.id === editingItem.menuItem.id &&
            i.notes === itemNotes &&
            JSON.stringify(i.selectedAdditions?.sort((a, b) => a.name.localeCompare(b.name)) || []) === JSON.stringify(selectedAdditions.sort((a, b) => a.name.localeCompare(b.name)))
          );

          if (identicalItem) {
            toast.success(`${editingItem.menuItem.name} agregado al pedido con adicionales`);
            return prev.map(i => i.id === identicalItem.id ? { ...i, quantity: i.quantity + 1 } : i);
          }

          // It's a new item being added with additions
          toast.success(`${editingItem.menuItem.name} agregado al pedido con adicionales`);
          return [...prev, { ...editingItem, notes: itemNotes, selectedAdditions, extraPrice }];
        }
      });

      setEditingItem(null);
      setItemNotes('');
      setSelectedAdditions([]);
    }
  };

  const total = currentCart.reduce((sum, item) => sum + ((item.menuItem.price + (item.extraPrice || 0)) * item.quantity), 0);

  const handleSendToKitchen = () => {
    if (selectedTable && currentCart.length > 0) {
      onPlaceOrder(selectedTable.id, currentCart, total);
      setCurrentCart([]);
    }
  };

  const activeTableOrders = activeOrders.filter(o => o.tableId === selectedTable?.id && o.status !== 'paid');
  const tableTotal = activeTableOrders.reduce((sum, o) => sum + o.total, 0);

  const generateReceipt = (
    table: Table,
    orders: Order[],
    bcvRate: number | null,
    paymentDetails?: ReceiptPaymentDetails,
    forcedControlNumber?: string
  ) => {
    return generateReceiptPdf({
      table,
      orders,
      bcvRate,
      paymentDetails,
      forcedControlNumber
    });
  };

  const handlePrintOpenTableInvoice = async () => {
    if (!selectedTable) return;
    try {
      const existingControlNum = activeTableOrders[0]?.controlNumber;
      generateReceipt(selectedTable, activeTableOrders, bcvRate, {
        method: 'efectivo',
        isFinal: false,
        controlNumber: existingControlNum
      }, existingControlNum);
      toast.success(existingControlNum ? `Factura generada con Control #${existingControlNum}` : `Pre-cuenta generada`);
    } catch (e) {
      console.error('Error al generar factura:', e);
      toast.error('Error al generar la pre-cuenta');
    }
  };

  const confirmPaymentAndClose = async () => {
    if (!selectedTable) return;
    if (isProcessingPaymentRef.current) return;
    isProcessingPaymentRef.current = true;
    setIsProcessingPayment(true);

    try {
      if ((selectedPaymentMethod === 'pago_movil' || (selectedPaymentMethod === 'cashea' && casheaInitialMethod === 'pago_movil')) && !referenceNumber.trim()) {
        toast.error('Por favor, ingresa el número de referencia del Pago Móvil');
        return;
      }

      const costNum = parseFloat(deliveryCost);
      const hasDeliveryCost = isDelivery && !isNaN(costNum) && costNum > 0;

      const currentTotalAmount = splitCount > 1 ? (tableTotal / splitCount) : tableTotal;
      const initialAmt = selectedPaymentMethod === 'cashea' ? (currentTotalAmount * casheaPercentage) / 100 : 0;
      const financedAmt = selectedPaymentMethod === 'cashea' ? (currentTotalAmount - initialAmt) : 0;

      // Resolver o generar número correlativo consecutivo para esta factura
      let controlNum = activeTableOrders.find(o => o.controlNumber)?.controlNumber;
      if (!controlNum) {
        controlNum = await getNextControlNumber();
      }

      let fullId = customerDocNumber.trim() ? `${customerDocPrefix}${customerDocNumber.trim()}` : customerID.trim();
      if (!fullId && customerPhone.trim()) {
        fullId = `TEL-${customerPhone.trim().replace(/\D/g, '')}`;
      } else if (!fullId && customerName.trim() && !/^(consumidor final|cliente general)$/i.test(customerName.trim())) {
        fullId = `CLI-${customerName.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '').slice(0, 20)}`;
      }

      // Guardar o actualizar automáticamente la ficha del cliente en Firestore
      if (fullId && (customerName.trim() || customerPhone.trim() || customerAddress.trim())) {
        try {
          const custRef = doc(db, 'customers', fullId);
          await setDoc(custRef, {
            id: fullId,
            docPrefix: customerDocPrefix,
            docNumber: customerDocNumber.trim() || fullId.replace(/^[VEJGvejg]-?/, ''),
            name: customerName.trim() || 'Consumidor Final',
            address: customerAddress.trim() || '',
            phone: customerPhone.trim() || '',
            updatedAt: Date.now(),
            lastOrderDate: Date.now(),
            totalOrders: (matchedCustomer?.totalOrders || 0) + 1,
            totalSpent: (matchedCustomer?.totalSpent || 0) + tableTotal
          }, { merge: true });
        } catch (err) {
          console.warn('Advertencia al guardar cliente en Firestore:', err);
        }
      }

      try {
        generateReceipt(selectedTable, activeTableOrders, bcvRate, {
          method: selectedPaymentMethod,
          reference: referenceNumber.trim() || undefined,
          isFinal: true,
          customerName: customerName.trim() || undefined,
          customerAddress: customerAddress.trim() || undefined,
          customerID: fullId || undefined,
          customerPhone: customerPhone.trim() || undefined,
          casheaDetails: selectedPaymentMethod === 'cashea' ? {
            percentage: casheaPercentage,
            initialAmount: initialAmt,
            financedAmount: financedAmt,
            initialMethod: casheaInitialMethod
          } : undefined,
          splitDetails: splitCount > 1 ? {
            partNumber: currentSplitPart,
            totalParts: splitCount,
            amountPerPart: currentTotalAmount
          } : undefined,
          controlNumber: controlNum
        }, controlNum);
      } catch (receiptErr) {
        console.warn('Error al imprimir o descargar boleta en cierre:', receiptErr);
      }

      if (splitCount > 1 && currentSplitPart < splitCount) {
        toast.success(`Pago Persona ${currentSplitPart} de ${splitCount} registrado ($${currentTotalAmount.toFixed(2)}). Procediendo con Persona ${currentSplitPart + 1}.`);
        setCurrentSplitPart(prev => prev + 1);
        setReferenceNumber('');
        return;
      }

      await onCloseTable(
        selectedTable.id,
        selectedPaymentMethod,
        referenceNumber.trim() || undefined,
        customerName.trim() || undefined,
        customerAddress.trim() || undefined,
        fullId || undefined,
        customerPhone.trim() || undefined,
        isDelivery,
        hasDeliveryCost ? costNum : 0,
        selectedPaymentMethod === 'cashea' ? {
          initialPercentage: casheaPercentage,
          initialAmount: initialAmt,
          financedAmount: financedAmt,
          initialMethod: casheaInitialMethod
        } : undefined,
        controlNum
      );
      setIsPaymentModalOpen(false);
      setSelectedTable(null);
      setCurrentCart([]);
      setReferenceNumber('');
      setCustomerName('');
      setCustomerAddress('');
      setCustomerID('');
      setCustomerDocNumber('');
      setCustomerDocPrefix('V-');
      setCustomerPhone('');
      setMatchedCustomer(null);
      setNameSearchTerm('');
      setIsDelivery(false);
      setDeliveryCost('');
      setSplitCount(1);
      setCurrentSplitPart(1);
    } catch (err) {
      console.error('Error al procesar el pago:', err);
      toast.error('Ocurrió un error al procesar el pago');
    } finally {
      isProcessingPaymentRef.current = false;
      setIsProcessingPayment(false);
    }
  };

  const handleOpenRegisterSubmit = async () => {
    if (registerPasscode !== adminPasscode) {
      setRegisterPasscodeError(true);
      toast.error('Clave de administrador incorrecta.');
      return;
    }
    const initialAmt = parseFloat(registerInitialCash);
    if (isNaN(initialAmt) || initialAmt < 0) {
      toast.error('Monto inicial inválido.');
      return;
    }

    try {
      await setDoc(doc(db, 'settings', 'register'), {
        isOpen: true,
        openedAt: Date.now(),
        openedBy: currentUser?.name || 'Sistema',
        openedById: currentUser?.id || '',
        initialBalance: initialAmt,
        updatedAt: Date.now()
      });
      toast.success('Caja abierta exitosamente.');
      setIsRegisterModalOpen(false);
      setRegisterPasscode('');
      setRegisterInitialCash('');
      setRegisterPasscodeError(false);
    } catch (error) {
      toast.error('Error al abrir la caja.');
    }
  };

  const handleCloseRegisterSubmit = async () => {
    if (registerPasscode !== adminPasscode) {
      setRegisterPasscodeError(true);
      toast.error('Clave de administrador incorrecta.');
      return;
    }
    const actualAmt = parseFloat(registerActualCash);
    if (isNaN(actualAmt) || actualAmt < 0) {
      toast.error('Monto de cierre inválido.');
      return;
    }

    const openedAt = registerSettings?.openedAt || 0;

    // Generar reporte Excel de la caja
    const sessionOrders = activeOrders.filter(o => o.businessDate === openedAt || (o.timestamp >= openedAt && o.status === 'paid'));

    // Fetch daily expenses for this register session
    let sessionExpenses: any[] = [];
    try {
      const qExpenses = query(
        collection(db, 'dailyExpenses'),
        where('businessDate', '==', openedAt)
      );
      const expensesSnap = await getDocs(qExpenses);
      expensesSnap.forEach(docSnap => {
        sessionExpenses.push(docSnap.data());
      });
    } catch (err) {
      console.error("Error fetching session expenses:", err);
    }

    const expensesData = sessionExpenses.map(exp => {
      return {
        'ID Pedido': exp.id,
        'Fecha': new Date(exp.timestamp).toLocaleDateString(),
        'Hora': new Date(exp.timestamp).toLocaleTimeString(),
        'Mesa': 'N/A',
        'Mesero': exp.userName || 'Sistema',
        'Detalle': `Gasto Operativo: ${exp.description} (${exp.type === 'delivery' ? 'Delivery' : 'Otro'})`,
        'Total USD': -exp.amount,
        'Total VES': -exp.amount * (bcvRate || 1),
        'Estado': 'Gasto Registrado',
        'Método de Pago': 'N/A',
        'Referencia': exp.orderId ? `Orden: ${exp.orderId.slice(-6)}` : 'N/A'
      };
    });

    const dataToExport = sessionOrders.map(order => {
      const itemsDescription = order.items.map(item => {
        let desc = `${item.quantity}x ${item.menuItem.name}`;
        if (item.selectedAdditions && item.selectedAdditions.length > 0) {
          desc += ` (+${item.selectedAdditions.map(a => a.name).join(', ')})`;
        }
        return desc;
      }).join(' | ');

      return {
        'ID Pedido': order.id,
        'Fecha': new Date(order.timestamp).toLocaleDateString(),
        'Hora': new Date(order.timestamp).toLocaleTimeString(),
        'Mesa': tables.find(t => t.id === order.tableId)?.number || order.tableId,
        'Mesero': order.waiterName || 'N/A',
        'Detalle': itemsDescription,
        'Total USD': order.total,
        'Total VES': order.total * (bcvRate || 1),
        'Estado': order.status === 'paid' ? 'Pagado' : 'Pendiente o Cancelado',
        'Método de Pago': order.paymentMethod || 'N/A',
        'Referencia': order.referenceNumber || 'N/A'
      };
    });

    const totalVentasUSD = sessionOrders.filter(o => o.status === 'paid').reduce((sum, o) => sum + o.total, 0);
    const totalExpensesUSD = sessionExpenses.reduce((sum, e) => sum + e.amount, 0);
    const balanceNetoUSD = totalVentasUSD - totalExpensesUSD;

    const overviewData: any[] = [
      {}, // empty row
      {
        'ID Pedido': '--- RESUMEN DE CAJA ---',
        'Fecha': '',
        'Hora': '',
        'Mesa': '',
        'Mesero': '',
        'Detalle': '',
        'Total USD': '',
        'Total VES': '',
        'Estado': '',
        'Método de Pago': '',
        'Referencia': ''
      },
      {
        'ID Pedido': 'FONDO INICIAL',
        'Detalle': 'Base declarada al abrir',
        'Total USD': registerSettings?.initialBalance || 0
      },
      {
        'ID Pedido': 'TOTAL VENTAS (INGRESOS)',
        'Detalle': 'Total de ordenes pagadas',
        'Total USD': totalVentasUSD
      },
      {
        'ID Pedido': 'TOTAL GASTOS (EGRESOS)',
        'Detalle': 'Total gastos de delivery/otros',
        'Total USD': -totalExpensesUSD
      },
      {
        'ID Pedido': 'BALANCE NETO SESION',
        'Detalle': 'Ventas - Gastos',
        'Total USD': balanceNetoUSD
      },
      {
        'ID Pedido': 'FONDO ESPERADO EN CAJA',
        'Detalle': 'Inicial + Ventas - Gastos',
        'Total USD': (registerSettings?.initialBalance || 0) + balanceNetoUSD
      },
      {
        'ID Pedido': 'FONDO CONTADO',
        'Detalle': 'Monto físico reportado al cerrar',
        'Total USD': actualAmt
      },
      {
        'ID Pedido': 'DIFERENCIA (CONTADO - ESPERADO)',
        'Detalle': 'Diferencia de caja',
        'Total USD': actualAmt - ((registerSettings?.initialBalance || 0) + balanceNetoUSD)
      }
    ];

    const finalData = [...dataToExport, ...expensesData, ...overviewData];

    const worksheet = XLSX.utils.json_to_sheet(finalData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Cierre de Caja");
    XLSX.writeFile(workbook, `Cierre_Caja_${Date.now()}.xlsx`);

    try {
      await setDoc(doc(db, 'settings', 'register'), {
        isOpen: false,
        closedAt: Date.now(),
        closedBy: currentUser?.name || 'Sistema',
        closedById: currentUser?.id || '',
        initialBalance: registerSettings?.initialBalance || 0,
        finalActualBalance: actualAmt,
        updatedAt: Date.now()
      });
      toast.success('Caja cerrada exitosamente. Reporte descargado.');
      setIsCloseRegisterModalOpen(false);
      setRegisterPasscode('');
      setRegisterActualCash('');
      setRegisterPasscodeError(false);
    } catch (error) {
      toast.error('Error al cerrar la caja.');
    }
  };

  const renderDishCard = (item: MenuItem) => {
    const cartQuantity = currentCart.filter(i => i.menuItem.id === item.id).reduce((sum, i) => sum + i.quantity, 0);

    return (
      <button
        key={item.id}
        onClick={() => addToCart(item)}
        className={`group relative bg-white p-3.5 rounded-2xl border-2 transition-all text-left overflow-hidden flex flex-col justify-between min-h-[118px] cursor-pointer select-none active:scale-[0.98] ${
          cartQuantity > 0
            ? 'border-orange-500 shadow-md ring-2 ring-orange-500/20 bg-orange-50/10'
            : 'border-slate-200 hover:border-orange-300 hover:shadow-md'
        }`}
      >
        {cartQuantity > 0 && (
          <div className="absolute top-0 right-0 bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-bl-xl shadow-xs">
            {cartQuantity}
          </div>
        )}
        <div>
          <div className="flex justify-between items-start mb-1 gap-2">
            <span className="text-[10px] font-black text-orange-500 uppercase tracking-wider">
              {getCategoryLabel(item.category)}
            </span>
            {(() => {
              let maxServings = 0;
              if (item.recipe && item.recipe.length > 0) {
                const possible = item.recipe.map(r => {
                  const ing = ingredients.find(i => i.id === r.ingredientId);
                  if (!ing) return 0;
                  return Math.floor(ing.stock / r.quantity);
                });
                maxServings = possible.length > 0 ? Math.min(...possible) : 0;
              } else {
                maxServings = item.stock;
              }
              return (
                <span className="text-[9px] font-bold text-slate-500 whitespace-nowrap bg-slate-100 px-1.5 py-0.5 rounded">
                  Raciones: {maxServings}
                </span>
              );
            })()}
          </div>
          <h3 className="font-bold text-slate-800 text-xs sm:text-sm line-clamp-2 leading-snug mb-1" title={item.name}>
            {item.name}
          </h3>
        </div>

        <div className="flex justify-between items-end gap-1 border-t border-slate-100 pt-2 mt-2">
          <div>
            <p className="text-sm sm:text-base font-black text-slate-900 font-mono leading-none">
              ${item.price.toFixed(2)}
            </p>
            {bcvRate && (
              <p className="text-[10px] font-bold text-slate-400 font-mono mt-0.5">
                Bs. {(item.price * bcvRate).toFixed(2)}
              </p>
            )}
          </div>
          <span className="text-xs font-bold text-orange-600 bg-orange-50 group-hover:bg-orange-500 group-hover:text-white px-2 py-1 rounded-lg transition-colors flex items-center gap-1">
            + Agregar
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row flex-1 min-h-full w-full bg-slate-100 relative lg:overflow-hidden">
      {!isRegisterOpen && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center border border-slate-200">
            <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock className="text-orange-600" size={40} />
            </div>
            <h2 className="text-2xl font-black text-slate-800 mb-2 tracking-tight">Caja Cerrada</h2>
            {currentUser?.role === 'admin' ? (
              <>
                <p className="text-slate-500 text-sm mb-8 leading-relaxed font-medium">
                  Abre la caja para permitir que los meseros comiencen a procesar pedidos.
                </p>
                <button
                  onClick={() => setIsRegisterModalOpen(true)}
                  className="w-full bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold py-3.5 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
                >
                  <Unlock size={20} />
                  Abrir Caja
                </button>
              </>
            ) : (
              <p className="text-slate-500 text-sm mb-4 leading-relaxed font-medium">
                La caja se encuentra cerrada en este momento. Por favor, solicita a un administrador que realice la apertura para continuar.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tables Outer Wrapper */}
      <div className="flex-1 min-w-0 flex flex-col relative bg-slate-100 lg:h-full flex order-last lg:order-first">
        {/* Main Content Area (Scrollable on desktop) */}
        <div className="flex-1 p-4 lg:p-6 lg:overflow-y-auto">
          {/* Tables Section - Hidden if table is selected to focus on taking orders */}
          <div className={selectedTable ? 'hidden' : 'block'}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold text-slate-800">Seleccionar Mesa</h2>
                {currentUser?.role === 'admin' && isRegisterOpen && (
                  <button
                    onClick={() => {
                      const hasOccupiedTables = tables.some(t => t.status === 'occupied') || activeOrders.some(o => o.status !== 'paid');
                      if (hasOccupiedTables) {
                        toast.error('No se puede cerrar caja: Hay mesas ocupadas o pedidos pendientes por cobrar.');
                        return;
                      }
                      setIsCloseRegisterModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 rounded-lg text-xs font-bold transition-all shadow-sm"
                    title="Cerrar Caja"
                  >
                    <Lock size={14} />
                    Cerrar Caja
                  </button>
                )}
              </div>
              <div className="bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200 flex items-center gap-2">
                <span className="text-sm text-slate-500 font-medium">Tasa BCV:</span>
                {bcvLoading ? (
                  <span className="text-sm font-bold text-slate-800 animate-pulse">Cargando...</span>
                ) : (
                  <span className="text-sm font-bold text-slate-800">Bs. {bcvRate?.toFixed(2)}</span>
                )}
              </div>
            </div>

            {/* Areas Filter & Management */}
            <div className="mb-6 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-sm">
              <div className="flex flex-wrap gap-1.5 items-center">
                <button
                  onClick={() => setSelectedAreaId('all')}
                  className={`px-4 py-2 text-xs font-black rounded-lg uppercase tracking-wider transition-all duration-250 border select-none cursor-pointer ${selectedAreaId === 'all'
                      ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                    }`}
                >
                  Todas ({tables.length})
                </button>
                {areas.map((area) => {
                  const count = tables.filter(t => t.areaId === area.id).length;
                  return (
                    <button
                      key={area.id}
                      onClick={() => setSelectedAreaId(area.id)}
                      className={`px-4 py-2 text-xs font-black rounded-lg uppercase tracking-wider transition-all duration-250 border flex items-center gap-1.5 select-none cursor-pointer ${selectedAreaId === area.id
                          ? 'bg-orange-500 border-orange-500 text-white shadow-sm'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                        }`}
                    >
                      <span>{area.name}</span>
                      <span className={`text-[10px] pointer-events-none rounded px-1.5 py-0.5 ${selectedAreaId === area.id ? 'bg-orange-600/50 text-white' : 'bg-slate-200 text-slate-600 font-bold'
                        }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setIsAreaModalOpen(true)}
                className="px-4 py-2 text-xs font-black text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-100 rounded-lg uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-95 duration-100"
              >
                <Settings size={14} />
                <span>Gestionar zonas</span>
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {tables
                .filter(t => selectedAreaId === 'all' || t.areaId === selectedAreaId)
                .map(table => {
                  const tableOrders = activeOrders.filter(o => o.tableId === table.id && o.status !== 'paid');
                  const hasOrder = tableOrders.length > 0;
                  const hasReadyOrder = tableOrders.some(o => o.status === 'ready');
                  const isSelected = selectedTable?.id === table.id;

                  // Find area name if any
                  const areaObj = areas.find(a => a.id === table.areaId);

                  return (
                    <div key={table.id} className="relative group animate-fade-in animate-duration-200">
                      <button
                        onClick={() => handleTableSelect(table)}
                        className={`w-full p-6 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-3 relative cursor-pointer
                        ${isSelected ? 'border-orange-500 bg-orange-50 shadow-sm' :
                            hasReadyOrder ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/50 shadow-md animate-pulse' :
                              hasOrder ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}
                      `}
                      >
                        <div className={`p-3 rounded-full ${hasReadyOrder ? 'bg-emerald-100 text-emerald-600 animate-bounce' :
                            hasOrder ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'
                          }`}>
                          {hasReadyOrder ? <CheckCircle2 size={24} /> : <Users size={24} />}
                        </div>
                        <div className="text-center">
                          <p className={`font-bold text-lg ${hasReadyOrder ? 'text-emerald-990' : 'text-slate-800'}`}>Mesa {table.number}</p>
                          <p className={`text-xs font-semibold uppercase tracking-wider ${hasReadyOrder ? 'text-emerald-600 font-extrabold animate-pulse' :
                              hasOrder ? 'text-blue-500 font-bold' : 'text-slate-500'
                            }`}>
                            {hasReadyOrder ? '¡Listo! 🛎️' : hasOrder ? 'Ocupada 🥪' : 'Disponible'}
                          </p>
                          {areaObj && (
                            <span className="mt-1 inline-block text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-150 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                              {areaObj.name}
                            </span>
                          )}
                        </div>
                      </button>

                      {!hasOrder && (
                        <button
                          onClick={(e) => handleDeleteTableClick(table, e)}
                          className="absolute top-2.5 right-2.5 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-200 bg-white rounded-lg transition-all cursor-pointer shadow-sm md:opacity-100 z-10"
                          title="Eliminar Mesa"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          {selectedTable && (
            <div className="flex flex-col animate-fade-in animate-duration-200">
              {/* Header de Mesa Activa y Acciones Rápidas */}
              <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setSelectedTable(null);
                      setSelectedCategory(null);
                      setCurrentCart([]);
                      setDishSearch('');
                    }}
                    className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer border-0 shadow-xs"
                    title="Volver al mapa de mesas"
                  >
                    <ArrowLeft size={16} />
                    <span>Volver a Mesas</span>
                  </button>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                        Mesa {selectedTable.number}
                      </h2>
                      <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                        activeTableOrders.length > 0 ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                      }`}>
                        {activeTableOrders.length > 0 ? 'Ocupada' : 'Disponible'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                      {activeTableOrders.length > 0
                        ? `${activeTableOrders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0)} ítems pedidos • Total Mesa: $${tableTotal.toFixed(2)}`
                        : 'Toca una categoría a continuación para abrir los platos'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
                  {activeTableOrders.length > 0 && (
                    <>
                      <button
                        onClick={handlePrintOpenTableInvoice}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer border-0"
                        title="Imprimir factura o pre-cuenta"
                      >
                        <FileText size={14} />
                        <span>Imprimir Factura</span>
                      </button>
                      <button
                        onClick={() => setIsPaymentModalOpen(true)}
                        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer border-0"
                        title="Cobrar cuenta de la mesa"
                      >
                        <DollarSign size={14} />
                        <span>Cobrar Mesa</span>
                      </button>
                    </>
                  )}
                  <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 flex items-center gap-1.5">
                    <span className="text-xs text-slate-500 font-medium">Tasa BCV:</span>
                    <span className="text-xs font-bold text-slate-800">Bs. {bcvRate?.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* VISTA 1: BÚSQUEDA DIRECTA ACTIVA */}
              {dishSearch.trim().length > 0 ? (
                <div className="flex flex-col animate-fade-in animate-duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Search size={18} className="text-orange-500" />
                      <h3 className="text-base font-black text-slate-800">
                        Resultados de búsqueda: <span className="text-orange-600 font-mono">"{dishSearch}"</span>
                      </h3>
                    </div>
                    <button
                      onClick={() => setDishSearch('')}
                      className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer border-0 w-fit"
                    >
                      ✕ Limpiar búsqueda
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                    {menu
                      .filter(item => {
                        const q = dishSearch.toLowerCase().trim();
                        return item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
                      })
                      .map(item => renderDishCard(item))}
                  </div>
                </div>
              ) : selectedCategory === null ? (
                /* VISTA 2: CATEGORÍAS EN GRANDE (CERRADAS / LIMPIAS, TOCAR PARA ABRIR) */
                <div className="flex flex-col animate-fade-in animate-duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                    <div>
                      <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <span>Categorías del Menú</span>
                        <span className="text-xs bg-orange-100 text-orange-700 font-bold px-2 py-0.5 rounded-full">
                          {dynamicCategories.length}
                        </span>
                      </h3>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">
                        Toca una categoría para abrir sus platos
                      </p>
                    </div>

                    {/* Input de Búsqueda Rápida */}
                    <div className="relative w-full sm:w-64">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={dishSearch}
                        onChange={(e) => setDishSearch(e.target.value)}
                        placeholder="Buscar cualquier plato..."
                        className="w-full pl-9 pr-7 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 outline-none transition-all font-semibold text-slate-800 placeholder-slate-400 shadow-sm"
                      />
                    </div>
                  </div>

                  {/* Rejilla de Categorías Grandes */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
                    {dynamicCategories.map(tab => {
                      const count = menu.filter(item => matchCategory(item.category, tab.id)).length;

                      return (
                        <button
                          key={tab.id}
                          onClick={() => {
                            setSelectedCategory(tab.id);
                            setDishSearch('');
                          }}
                          className="group relative p-5 sm:p-6 rounded-2xl border-2 border-slate-200 hover:border-orange-500 bg-white hover:bg-orange-50/20 text-left transition-all duration-200 cursor-pointer select-none flex flex-col justify-between min-h-[130px] sm:min-h-[145px] shadow-sm hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]"
                        >
                          <div className="flex items-start justify-between w-full">
                            <span className="text-4xl sm:text-5xl filter drop-shadow-sm select-none transition-transform duration-200 group-hover:scale-110">
                              {tab.emoji}
                            </span>
                            <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 group-hover:bg-orange-100 group-hover:text-orange-700 transition-colors">
                              {count} {count === 1 ? 'plato' : 'platos'}
                            </span>
                          </div>

                          <div className="mt-4">
                            <p className="font-black text-sm sm:text-base uppercase tracking-wide leading-tight text-slate-800 group-hover:text-orange-600 transition-colors">
                              {tab.label}
                            </p>
                            <span className="text-[11px] font-bold text-orange-500 opacity-80 group-hover:opacity-100 flex items-center gap-1 mt-1 transition-opacity">
                              Abrir categoría ➔
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* VISTA 3: CATEGORÍA ABIERTA AL TOCAR (PLATOS DISPONIBLES) */
                <div className="flex flex-col animate-fade-in animate-duration-200">
                  {/* Barra de cabecera de la categoría abierta */}
                  <div className="mb-5 flex flex-col gap-3.5 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            setSelectedCategory(null);
                            setDishSearch('');
                          }}
                          className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer border-0"
                          title="Cerrar y volver a ver las categorías"
                        >
                          <ArrowLeft size={15} />
                          <span>Volver a Categorías</span>
                        </button>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl sm:text-3xl">
                            {dynamicCategories.find(c => c.id === selectedCategory)?.emoji || '🍽️'}
                          </span>
                          <div>
                            <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tight leading-tight">
                              {dynamicCategories.find(c => c.id === selectedCategory)?.label || selectedCategory}
                            </h3>
                            <p className="text-xs text-slate-500 font-semibold">
                              {menu.filter(item => matchCategory(item.category, selectedCategory)).length} platos en esta categoría
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Buscador dentro de la categoría */}
                      <div className="relative w-full sm:w-60">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={dishSearch}
                          onChange={(e) => setDishSearch(e.target.value)}
                          placeholder={`Buscar en ${dynamicCategories.find(c => c.id === selectedCategory)?.label || 'categoría'}...`}
                          className="w-full pl-8 pr-7 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 outline-none transition-all font-semibold text-slate-800 placeholder-slate-400"
                        />
                        {dishSearch && (
                          <button
                            onClick={() => setDishSearch('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer border-0 bg-transparent"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Selector rápido horizontal de otras categorías */}
                    <div className="pt-3 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto pb-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
                        Cambiar a:
                      </span>
                      {dynamicCategories.map(tab => {
                        const isCurrent = selectedCategory === tab.id;
                        return (
                          <button
                            key={tab.id}
                            onClick={() => {
                              setSelectedCategory(tab.id);
                              setDishSearch('');
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer border shrink-0 ${
                              isCurrent
                                ? 'bg-orange-500 border-orange-500 text-white shadow-xs'
                                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            <span>{tab.emoji}</span>
                            <span>{tab.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Rejilla de Platos de la Categoría Abierta */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                    {menu
                      .filter(item => {
                        const matchesCat = matchCategory(item.category, selectedCategory);
                        if (!matchesCat) return false;
                        if (!dishSearch.trim()) return true;
                        const q = dishSearch.toLowerCase().trim();
                        return item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
                      })
                      .map(item => renderDishCard(item))}
                  </div>

                  {/* Botón al fondo para volver a categorías */}
                  <div className="mt-8 mb-4 text-center">
                    <button
                      onClick={() => {
                        setSelectedCategory(null);
                        setDishSearch('');
                      }}
                      className="px-5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 inline-flex items-center gap-2 shadow-xs cursor-pointer transition-all"
                    >
                      <ArrowLeft size={14} />
                      <span>Volver a todas las categorías</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Floating Add Table Button */}
        <div className={`fixed bottom-20 lg:bottom-6 right-6 lg:right-[410px] z-20 ${selectedTable ? 'hidden lg:block' : 'block'}`}>
          <button
            onClick={handleOpenAddTableModal}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-3 rounded-full shadow-lg hover:shadow-xl transition-all cursor-pointer border-0"
            title="Agregar Nueva Mesa"
          >
            <Plus size={18} />
            <span>Agregar Mesa</span>
          </button>
        </div>
      </div>

      {/* Cart Sidebar */}
      <div className={`w-full lg:w-96 lg:shrink-0 bg-white border-t lg:border-t-0 lg:border-l border-slate-200 flex-col shadow-xl z-10 lg:h-full lg:overflow-hidden ${selectedTable ? 'flex order-first lg:order-last' : 'hidden lg:flex'}`}>
        <div className="p-4 lg:p-6 border-b border-slate-100 bg-slate-50 shrink-0">
          <div className="flex items-center justify-between mb-4 lg:mb-0">
            <h2 className="text-xl font-bold text-slate-800">
              {selectedTable ? `Mesa ${selectedTable.number}` : 'Seleccione una mesa'}
            </h2>
            {selectedTable && (
              <button
                onClick={() => { setSelectedTable(null); setCurrentCart([]); }}
                className="lg:hidden p-2 bg-slate-200 text-slate-600 hover:bg-slate-300 rounded-full transition-colors flex items-center justify-center"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {selectedTable && activeTableOrders.length > 0 && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-4">
              <div className="border-b border-blue-100 pb-3">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs text-blue-800 font-bold uppercase tracking-wider">Cuenta Abierta:</span>
                  <span className="text-2xl font-black text-blue-900">
                    Bs. {(tableTotal * (bcvRate || 40.0)).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>Equivalente:</span>
                  <span className="font-semibold">${tableTotal.toFixed(2)} USD</span>
                </div>
              </div>

              {/* Consumption detail list inside active sidebar */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-blue-800/80 uppercase tracking-widest">PRODUCTOS PEDIDOS EN MESA</p>
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                  {activeTableOrders.flatMap((order) =>
                    order.items.map((item, itemIdx) => {
                      const rate = bcvRate || 40.0;
                      const itemTotalBs = (item.menuItem.price + (item.extraPrice || 0)) * item.quantity * rate;

                      let statusText = 'Poli';
                      let statusColor = 'bg-yellow-100 text-yellow-800';
                      if (order.status === 'pending') {
                        statusText = 'En Cola';
                        statusColor = 'bg-slate-200 text-slate-700';
                      } else if (order.status === 'preparing') {
                        statusText = 'Preparando';
                        statusColor = 'bg-orange-100 text-orange-850';
                      } else if (order.status === 'ready') {
                        statusText = 'Listo';
                        statusColor = 'bg-emerald-100 text-emerald-800';
                      } else if (order.status === 'served') {
                        statusText = 'Servido';
                        statusColor = 'bg-blue-100 text-blue-800';
                      }

                      return (
                        <div key={`${order.id}-${item.id}-${itemIdx}`} className="bg-white p-2 rounded-lg border border-blue-100 shadow-sm">
                          <div className="flex justify-between items-start gap-1">
                            <span className="text-xs font-bold text-slate-800 shrink-0">{item.quantity}x</span>
                            <span className="text-xs font-semibold text-slate-700 flex-1 leading-tight">{item.menuItem.category} - {item.menuItem.name}</span>
                            <span className="text-xs font-bold text-slate-900 shrink-0">Bs. {itemTotalBs.toFixed(0)}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setItemToDelete({ order, itemIdx, item });
                                setEnteredPasscode('');
                                setPasscodeError(false);
                              }}
                              className="text-red-500 hover:text-red-700 p-1 ml-1 rounded-md hover:bg-red-50 transition-colors"
                              title="Eliminar producto"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          {item.selectedAdditions && item.selectedAdditions.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {item.selectedAdditions.map((add, idx) => {
                                const ingObj = add.ingredientId ? ingredients.find(i => i.id === add.ingredientId) : null;
                                return (
                                  <span key={idx} className="bg-orange-50 text-orange-700 text-[9px] px-1 py-0.2 rounded font-medium border border-orange-100">
                                    + {add.count && add.count > 1 ? `${add.count}x ` : ''}{add.name} {add.quantity && ingObj ? `(${(add.quantity * (add.count || 1)).toFixed(1)}${ingObj.unit})` : ''}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                          {item.notes && (
                            <p className="text-[10px] text-slate-500 italic mt-0.5 pl-1 border-l-2 border-slate-200">
                              Nota: {item.notes}
                            </p>
                          )}
                          <div className="flex justify-between items-center mt-1 pt-1 border-t border-slate-100">
                            <span className="text-[9px] text-slate-400">
                              {new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${statusColor}`}>
                              {statusText}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Compact buttons in grid */}
              <div className="pt-2 border-t border-blue-100">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setIsPaymentModalOpen(true)}
                    className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm shadow-blue-505/20 cursor-pointer border-0"
                  >
                    <DollarSign size={13} />
                    Cobrar Mesa
                  </button>
                  <button
                    onClick={handlePrintOpenTableInvoice}
                    className="p-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer border-0"
                  >
                    <FileText size={13} />
                    Imprimir Factura
                  </button>
                  <button
                    onClick={() => {
                      setTargetTable(null);
                      setIsChangeTableModalOpen(true);
                    }}
                    className="p-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                  >
                    <ArrowLeftRight size={13} className="text-slate-500" />
                    Cambiar Mesa
                  </button>
                  {currentUser?.role === 'admin' && (
                    <button
                      onClick={() => {
                        setIsCancelModalOpen(true);
                        setEnteredPasscode('');
                        setPasscodeError(false);
                      }}
                      className="p-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                    >
                      <Trash2 size={13} />
                      Cancelar Pedidos
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 lg:overflow-y-auto p-4 flex flex-col">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Nuevo Pedido</h3>
          {currentCart.length === 0 ? (
            <div className="h-32 lg:h-48 flex flex-col items-center justify-center text-slate-400 space-y-4">
              <ShoppingCart size={48} className="opacity-20" />
              <p>Agrega productos del menú (abajo)</p>
            </div>
          ) : (
            <div className="space-y-4">
              {currentCart.map(item => (
                <div key={item.id} className="flex flex-col p-3 bg-slate-50 rounded-lg border border-slate-100 gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-slate-800">{item.menuItem.category} - {item.menuItem.name}</p>
                      <p className="text-sm text-slate-500">
                        ${((item.menuItem.price + (item.extraPrice || 0)) * item.quantity).toFixed(2)}
                        {item.extraPrice ? <span className="text-xs text-orange-500 ml-1">(+${item.extraPrice.toFixed(2)} c/u)</span> : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg p-1">
                      <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:bg-slate-100 rounded text-slate-600">
                        {item.quantity === 1 ? <Trash2 size={16} className="text-red-500" /> : <Minus size={16} />}
                      </button>
                      <span className="w-6 text-center font-bold">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:bg-slate-100 rounded text-slate-600">
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col mt-1 gap-1">
                    {item.selectedAdditions && item.selectedAdditions.length > 0 && (
                      <div className="text-xs text-slate-600 flex flex-wrap gap-1">
                        {item.selectedAdditions.map((add, idx) => {
                          const ingObj = add.ingredientId ? ingredients.find(i => i.id === add.ingredientId) : null;
                          return (
                            <span key={idx} className="bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">
                              + {add.count && add.count > 1 ? `${add.count}x ` : ''}{add.name} {add.quantity && ingObj ? `(${(add.quantity * (add.count || 1)).toFixed(1)}${ingObj.unit})` : ''}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-500 italic flex-1 truncate mr-2">
                        {item.notes ? `Nota: ${item.notes}` : 'Sin notas'}
                      </p>
                      <button
                        onClick={() => openEditModal(item)}
                        className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                      >
                        <MessageSquare size={12} />
                        {(item.notes || (item.selectedAdditions && item.selectedAdditions.length > 0)) ? 'Editar' : 'Añadir nota/adicional'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 lg:p-6 bg-slate-50 border-t border-slate-200 mt-auto">
          <div className="flex justify-between items-center gap-2 mb-1">
            <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">Total Nuevo Pedido</span>
            <span className="text-2xl sm:text-3xl font-black text-slate-800 shrink-0">${total.toFixed(2)}</span>
          </div>
          {bcvRate && total > 0 && (
            <div className="flex justify-end mb-3">
              <span className="text-xs sm:text-sm font-medium text-slate-500">Bs. {(total * bcvRate).toFixed(2)}</span>
            </div>
          )}
          <button
            onClick={handleSendToKitchen}
            disabled={currentCart.length === 0 || !selectedTable}
            className="w-full py-3 mt-1.5 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-colors shadow-lg shadow-orange-500/30"
          >
            <Send size={18} />
            Enviar a Cocina
          </button>
        </div>
      </div>

      {/* Payment Modal */}
      {isPaymentModalOpen && selectedTable && (
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 shrink-0">
              <h3 className="text-xl font-bold text-slate-800">Cobrar Mesa {selectedTable.number}</h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 min-h-0">
              <div className="bg-slate-50 p-4 rounded-xl mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-600">Total a pagar:</span>
                  <span className="text-2xl font-black text-slate-800">${tableTotal.toFixed(2)}</span>
                </div>
                {bcvRate && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-500">En Bolívares (Tasa: {bcvRate.toFixed(2)}):</span>
                    <span className="text-lg font-bold text-slate-700">Bs. {(tableTotal * bcvRate).toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Datos del Cliente con Autocompletado */}
              <div className="mb-6 border-b border-slate-100 pb-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                      <span className="w-1.5 h-3.5 bg-orange-500 rounded-full"></span>
                      Datos del Cliente
                    </h4>
                    {customers.length > 0 && (
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        {customers.length} {customers.length === 1 ? 'cliente guardado' : 'clientes guardados'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => syncCustomersFromOrders(true)}
                      disabled={isSyncingCustomers}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-2.5 py-1 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                      title="Escanear ventas históricas para importar clientes a la base de datos"
                    >
                      {isSyncingCustomers ? (
                        <Loader2 size={12} className="animate-spin text-orange-600" />
                      ) : (
                        <RefreshCw size={12} className="text-orange-600" />
                      )}
                      <span>{isSyncingCustomers ? 'Sincronizando...' : 'Sincronizar historial'}</span>
                    </button>

                    {matchedCustomer ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full animate-fade-in shadow-xs">
                        <CheckCircle2 size={12} className="text-emerald-600" />
                        <span>Cliente registrado ({matchedCustomer.totalOrders || 1} {matchedCustomer.totalOrders === 1 ? 'pedido' : 'pedidos'})</span>
                      </span>
                    ) : customerDocNumber.trim().length >= 4 ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        Nuevo cliente (se guardará al cobrar)
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        Cédula / RIF
                      </label>
                      {matchedCustomer && (
                        <span className="text-[10px] text-emerald-600 font-bold">¡Encontrado!</span>
                      )}
                    </div>
                    <div className={`flex rounded-xl border ${matchedCustomer ? 'border-emerald-400 ring-2 ring-emerald-400/20' : 'border-slate-200'} bg-white overflow-hidden focus-within:ring-2 focus-within:ring-orange-500/10 focus-within:border-orange-500 transition-all shadow-none`}>
                      <select
                        value={customerDocPrefix}
                        onChange={(e) => {
                          const newPrefix = e.target.value as 'V-' | 'E-' | 'J-' | 'G-';
                          setCustomerDocPrefix(newPrefix);
                          if (customerDocNumber.trim()) {
                            setCustomerID(`${newPrefix}${customerDocNumber.trim()}`);
                            handleLookupCustomer(newPrefix, customerDocNumber.trim());
                          }
                        }}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs px-2.5 py-2.5 border-r border-slate-200 outline-none cursor-pointer transition-colors"
                      >
                        <option value="V-">V-</option>
                        <option value="E-">E-</option>
                        <option value="J-">J-</option>
                        <option value="G-">G-</option>
                      </select>
                      <input
                        type="text"
                        value={customerDocNumber}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const match = raw.match(/^([VEJGvejg])[-_ ]?(.*)$/);
                          let detected = customerDocPrefix;
                          let clean = raw.replace(/[^\d]/g, '');
                          if (match && match[2]) {
                            detected = (match[1].toUpperCase() + '-') as 'V-' | 'E-' | 'J-' | 'G-';
                            clean = match[2].replace(/\D/g, '');
                            setCustomerDocPrefix(detected);
                          }
                          setCustomerDocNumber(clean);
                          setCustomerID(clean ? `${detected}${clean}` : '');
                          handleLookupCustomer(detected, clean);
                        }}
                        placeholder="12345678"
                        className="w-full px-3 py-2.5 bg-transparent outline-none text-xs font-semibold text-slate-800 placeholder-slate-400"
                      />
                    </div>
                  </div>

                  <div className="relative">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                      Nombre y Apellido
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => {
                        setCustomerName(e.target.value);
                        if (!customerDocNumber.trim() && e.target.value.trim().length >= 2) {
                          setNameSearchTerm(e.target.value);
                        } else {
                          setNameSearchTerm('');
                        }
                      }}
                      onFocus={() => {
                        if (!customerDocNumber.trim() && customerName.trim().length >= 2) {
                          setNameSearchTerm(customerName);
                        }
                      }}
                      placeholder="Cliente General"
                      className={`w-full px-3 py-2.5 border ${matchedCustomer ? 'border-emerald-400 bg-emerald-50/20' : 'border-slate-200 bg-white'} rounded-xl focus:ring-2 focus:ring-orange-500/10 focus:border-orange-500 outline-none text-xs transition-colors shadow-none font-semibold text-slate-800 placeholder-slate-400`}
                    />

                    {/* Menú de sugerencias si busca por nombre */}
                    {nameSearchTerm && nameFilteredCustomers.length > 0 && (
                      <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                        <div className="px-3 py-1 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Clientes encontrados en la base de datos:
                        </div>
                        {nameFilteredCustomers.map(cust => (
                          <button
                            key={cust.id}
                            type="button"
                            onClick={() => selectCustomerSuggestion(cust)}
                            className="w-full px-3 py-2 text-left hover:bg-orange-50/80 flex items-center justify-between text-xs transition-colors cursor-pointer border-0 bg-transparent"
                          >
                            <div>
                              <div className="font-bold text-slate-800">{cust.name}</div>
                              <div className="text-[10px] text-slate-500">{cust.id} {cust.phone ? `• Tel: ${cust.phone}` : ''}</div>
                            </div>
                            <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                              Seleccionar
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Dirección</label>
                    <input
                      type="text"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      placeholder="Av. Francisco de Miranda, Chacao"
                      className={`w-full px-3 py-2.5 border ${matchedCustomer && customerAddress ? 'border-emerald-300 bg-emerald-50/10' : 'border-slate-200 bg-white'} rounded-xl focus:ring-2 focus:ring-orange-500/10 focus:border-orange-500 outline-none text-xs transition-colors shadow-none font-semibold text-slate-800 placeholder-slate-400`}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Teléfono</label>
                    <input
                      type="text"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="0412-1234567"
                      className={`w-full px-3 py-2.5 border ${matchedCustomer && customerPhone ? 'border-emerald-300 bg-emerald-50/10' : 'border-slate-200 bg-white'} rounded-xl focus:ring-2 focus:ring-orange-500/10 focus:border-orange-500 outline-none text-xs transition-colors shadow-none font-semibold text-slate-800 placeholder-slate-400`}
                    />
                  </div>
                </div>

                {/* Registro de Delivery */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isDelivery}
                      onChange={(e) => {
                        setIsDelivery(e.target.checked);
                        if (!e.target.checked) setDeliveryCost('');
                      }}
                      className="w-4 h-4 text-orange-600 border-slate-350 rounded focus:ring-orange-500"
                    />
                    <span className="text-xs font-bold text-slate-700">¿Registrar Delivery para esta orden?</span>
                  </label>
                </div>
                {isDelivery && (
                  <div className="mt-3 animate-fade-in">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Costo de Delivery (Gasto para el restaurante)</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <span className="text-xs font-bold">$</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={deliveryCost}
                        onChange={(e) => setDeliveryCost(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-7 pr-3 py-2.5 border border-slate-200 bg-white rounded-xl focus:ring-2 focus:ring-orange-500/10 focus:border-orange-500 outline-none text-xs transition-colors shadow-none font-semibold text-slate-800 placeholder-slate-400"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Sección de División de Cuentas (Split Bill) */}
              <div className="p-4 bg-slate-100/80 border border-slate-200/80 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Users size={14} className="text-orange-500" />
                    División de Cuenta (Cuentas Separadas)
                  </span>
                  {splitCount > 1 && (
                    <span className="text-[10px] font-black bg-orange-500 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Parte {currentSplitPart} de {splitCount}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        setSplitCount(num);
                        setCurrentSplitPart(1);
                      }}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                        splitCount === num
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm font-black'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {num === 1 ? 'Completa' : `${num} partes`}
                    </button>
                  ))}
                  <div className="relative w-16">
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={splitCount}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(20, Number(e.target.value) || 1));
                        setSplitCount(val);
                        setCurrentSplitPart(1);
                      }}
                      className="w-full px-2 py-1 text-xs font-bold text-center border border-slate-200 rounded-lg bg-white outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                {splitCount > 1 && (
                  <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs space-y-1">
                    <div className="flex justify-between items-center font-bold text-orange-950">
                      <span>Monto por comensal (Persona {currentSplitPart}/{splitCount}):</span>
                      <span className="text-sm font-black text-orange-600">
                        ${(tableTotal / splitCount).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-orange-700 font-semibold">
                      <span>Monto en Bs. (Tasa {bcvRate?.toFixed(2)}):</span>
                      <span>
                        Bs. {((tableTotal / splitCount) * (bcvRate || 1)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-bold text-slate-700 mb-2">Método de Pago</label>

                {[
                  { id: 'efectivo', label: 'Efectivo' },
                  { id: 'tarjeta', label: 'Tarjeta (Punto de Venta)' },
                  { id: 'pago_movil', label: 'Pago Móvil' },
                  { id: 'transferencia', label: 'Transferencia' },
                  { id: 'zelle', label: 'Zelle' },
                  { id: 'cashea', label: 'Cashea (Compra ahora, paga después)' }
                ].map((method) => (
                  <label key={method.id} className={`flex items-center p-4 border rounded-xl cursor-pointer transition-all ${selectedPaymentMethod === method.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={method.id}
                      checked={selectedPaymentMethod === method.id}
                      onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                      className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                    />
                    <span className="ml-3 font-medium text-slate-700">{method.label}</span>
                  </label>
                ))}
              </div>

              {selectedPaymentMethod === 'cashea' && (
                <div className="mt-5 p-4 bg-yellow-50/90 border border-yellow-200 rounded-2xl animate-fade-in space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-yellow-500 text-slate-950 font-black text-xs rounded-lg uppercase tracking-wider">
                        Cashea
                      </div>
                      <h4 className="text-sm font-bold text-slate-900">Configuración de Cuota Inicial</h4>
                    </div>
                    <span className="text-xs font-black text-yellow-800 bg-yellow-100 px-2 py-0.5 rounded-full">
                      {casheaPercentage}% Inicial
                    </span>
                  </div>

                  {/* Porcentaje selector */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Porcentaje de Inicial
                    </label>
                    <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                      {[0, 40, 50, 60, 70].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setCasheaPercentage(pct)}
                          className={`flex-1 py-1.5 px-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                            casheaPercentage === pct
                              ? 'bg-yellow-500 text-slate-950 border-yellow-500 shadow-sm font-black'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-yellow-100'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                      <div className="relative w-20">
                        <input
                          type="number"
                          min="0"
                          max="99"
                          value={casheaPercentage}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : Number(e.target.value);
                            setCasheaPercentage(Math.max(0, Math.min(99, isNaN(val) ? 0 : val)));
                          }}
                          className="w-full pl-2 pr-5 py-1 text-xs font-bold text-center border border-slate-200 rounded-lg bg-white outline-none focus:border-yellow-500"
                        />
                        <span className="absolute right-2 top-1 text-xs text-slate-400 font-bold">%</span>
                      </div>
                    </div>
                  </div>

                  {/* Desglose de Montos */}
                  {(() => {
                    const currentTotal = splitCount > 1 ? (tableTotal / splitCount) : tableTotal;
                    const initialAmt = (currentTotal * casheaPercentage) / 100;
                    const financedAmt = currentTotal - initialAmt;
                    const rate = bcvRate || 1;

                    return (
                      <div className="grid grid-cols-2 gap-2 bg-white p-3 rounded-xl border border-yellow-200 text-xs">
                        <div className="space-y-0.5 border-r border-slate-100 pr-2">
                          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">
                            Inicial (Entra a Caja)
                          </span>
                          <p className="font-extrabold text-slate-900 text-sm">
                            ${initialAmt.toFixed(2)}
                          </p>
                          <p className="text-[10px] text-slate-500 font-semibold">
                            Bs. {(initialAmt * rate).toFixed(2)}
                          </p>
                        </div>
                        <div className="space-y-0.5 pl-2">
                          <span className="text-[10px] font-bold text-yellow-700 uppercase tracking-wider block">
                            Cashea (Por cobrar 7 días)
                          </span>
                          <p className="font-extrabold text-slate-900 text-sm">
                            ${financedAmt.toFixed(2)}
                          </p>
                          <p className="text-[10px] text-slate-500 font-semibold">
                            Bs. {(financedAmt * rate).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Método con el que se paga la inicial */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Método de cobro de la Inicial
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'tarjeta', label: 'Punto Venta' },
                        { id: 'pago_movil', label: 'Pago Móvil' },
                        { id: 'efectivo', label: 'Efectivo' }
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setCasheaInitialMethod(m.id)}
                          className={`py-1.5 px-2 text-[11px] font-bold rounded-lg border transition-all text-center cursor-pointer ${
                            casheaInitialMethod === m.id
                              ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {casheaInitialMethod === 'pago_movil' && (
                    <div className="space-y-1 pt-1">
                      <label className="block text-[10px] font-bold text-orange-700 uppercase tracking-wider">
                        Referencia Pago Móvil (Inicial)
                      </label>
                      <input
                        type="text"
                        value={referenceNumber}
                        onChange={(e) => setReferenceNumber(e.target.value)}
                        placeholder="Ej: 123456"
                        className="w-full px-3 py-2 bg-white border border-orange-200 rounded-xl font-mono text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                    </div>
                  )}
                </div>
              )}

              {selectedPaymentMethod === 'pago_movil' && (
                <div className="mt-5 p-4 bg-orange-50/70 border border-orange-100 rounded-2xl animate-fade-in">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-1.5 bg-orange-100 rounded-lg text-orange-600">
                      <Smartphone size={16} />
                    </div>
                    <h4 className="text-sm font-bold text-orange-900">Verificación de Pago Móvil</h4>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-bold text-orange-700 uppercase tracking-wider">
                      Número de Referencia
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-orange-400">
                        <Hash size={16} />
                      </div>
                      <input
                        type="text"
                        value={referenceNumber}
                        onChange={(e) => setReferenceNumber(e.target.value)}
                        placeholder="Ej: 123456"
                        className="w-full pl-9 pr-3 py-2.5 bg-white border border-orange-200 rounded-xl font-mono text-sm font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                      />
                    </div>
                    <p className="text-[10px] text-orange-600 font-medium">
                      Introduce los últimos dígitos de la referencia para la conciliación de caja.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3 shrink-0">
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="flex-1 py-3 px-4 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmPaymentAndClose}
                disabled={isProcessingPayment}
                className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl font-bold transition-colors shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed border-0"
              >
                {isProcessingPayment ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <DollarSign size={20} />
                    Confirmar Pago
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col border border-slate-150 animate-fade-in animate-duration-150">
            <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100 bg-slate-50">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-black text-slate-900 leading-tight truncate">
                  Personalizar: {editingItem.menuItem.name}
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Opciones y comentarios</p>
              </div>
              <button
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3.5 flex-1 scrollbar-thin">
              {editingItem.menuItem.additions && editingItem.menuItem.additions.length > 0 && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-3 bg-orange-500 rounded-full"></span>
                    Ingredientes Adicionales (Extras)
                  </label>
                  <div className="max-h-48 overflow-y-auto pr-1 space-y-1.5 scrollbar-thin">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {editingItem.menuItem.additions.map((addition, index) => {
                        const selectedAdd = selectedAdditions.find(a => a.name === addition.name);
                        const currentCount = selectedAdd ? (selectedAdd.count || 1) : 0;
                        const isSelected = currentCount > 0;
                        const ingObj = addition.ingredientId ? ingredients.find(i => i.id === addition.ingredientId) : null;
                        return (
                          <div
                            key={index}
                            className={`flex flex-col p-2.5 border rounded-xl transition-all select-none ${isSelected
                                ? 'bg-orange-50/70 border-orange-200 ring-2 ring-orange-500/5'
                                : 'bg-white border-slate-200 hover:bg-slate-50/80 hover:border-slate-350'
                              }`}
                          >
                            <div className="flex items-center justify-between mb-2 gap-2">
                              <div className="flex flex-col min-w-0">
                                <span className="font-bold text-[11px] text-slate-700 truncate">{addition.name}</span>
                                {addition.quantity && ingObj && (
                                  <span className="text-[9px] text-slate-400 font-bold whitespace-nowrap">
                                    +{addition.quantity}{ingObj.unit}
                                  </span>
                                )}
                              </div>
                              <span className="text-orange-600 font-black text-[11px] shrink-0 ml-1.5">+${addition.price.toFixed(2)}</span>
                            </div>

                            <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg overflow-hidden mt-1">
                              <button
                                type="button"
                                onClick={() => updateAdditionCount(addition, -1)}
                                className="px-3 py-1 font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                              >
                                -
                              </button>
                              <span className="text-xs font-bold text-slate-800 px-2 min-w-[2rem] text-center">
                                {currentCount > 0 ? currentCount : '0'}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateAdditionCount(addition, 1)}
                                className="px-3 py-1 font-bold text-orange-600 hover:bg-orange-50 transition-colors"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-3 bg-orange-500 rounded-full"></span>
                  Notas Especiales / Comentarios
                </label>
                <textarea
                  value={itemNotes}
                  onChange={(e) => setItemNotes(e.target.value)}
                  placeholder="Ej: sin cebolla, salsa aparte, bien tostado..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none resize-none h-16 text-xs text-slate-800 placeholder-slate-400 shadow-none font-medium"
                />
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                  * Notas impresas directamente en la comanda de cocina.
                </p>
              </div>
            </div>

            <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex flex-col gap-2 shrink-0">
              <div className="grid grid-cols-2 gap-1 text-[11px] font-medium px-0.5">
                <div className="flex justify-between pr-4 border-r border-slate-200">
                  <span className="text-slate-500">Precio Base:</span>
                  <span className="text-slate-700 font-bold">${editingItem.menuItem.price.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pl-4">
                  <span className="text-slate-500 font-semibold">Adicionales:</span>
                  <span className="text-orange-600 font-bold">
                    +${selectedAdditions.reduce((sum, a) => sum + (a.price * (a.count || 1)), 0).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center py-2 border-t border-slate-200 mt-1">
                <span className="text-slate-800 font-black text-xs uppercase tracking-wider">Total por Plato:</span>
                <span className="text-slate-900 font-black text-base">
                  ${(editingItem.menuItem.price + selectedAdditions.reduce((sum, a) => sum + a.price, 0)).toFixed(2)}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="flex-1 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-100 transition-colors text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={saveItemNotes}
                  className="flex-1 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold transition-all text-xs cursor-pointer shadow-sm"
                >
                  {currentCart.some(item => item.id === editingItem.id) ? 'Guardar Cambios' : 'Añadir al Pedido'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cambiar Mesa Modal */}
      {isChangeTableModalOpen && selectedTable && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <ArrowLeftRight size={20} className="text-orange-500" />
                Cambiar de Mesa
              </h3>
              <button
                onClick={() => { setIsChangeTableModalOpen(false); setTargetTable(null); }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              <p className="text-sm text-slate-500 mb-4">
                Transfiere la cuenta abierta de la <strong>Mesa {selectedTable.number}</strong> (${tableTotal.toFixed(2)}) a cualquiera de las mesas disponibles:
              </p>

              <div className="grid grid-cols-3 gap-3 max-h-60 overflow-y-auto p-1">
                {tables
                  .filter(t => t.id !== selectedTable.id && !activeOrders.some(o => o.tableId === t.id && o.status !== 'paid'))
                  .map((t) => {
                    const isSelected = targetTable?.id === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTargetTable(t)}
                        className={`p-4 rounded-xl border-2 font-bold text-center transition-all cursor-pointer ${isSelected
                            ? 'border-orange-500 bg-orange-50 text-orange-700 text-sm'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm hover:border-slate-300'
                          }`}
                      >
                        Mesa {t.number}
                      </button>
                    );
                  })
                }
                {tables.filter(t => t.id !== selectedTable.id && !activeOrders.some(o => o.tableId === t.id && o.status !== 'paid')).length === 0 && (
                  <div className="col-span-3 text-center text-xs text-slate-400 py-6">
                    No hay otras mesas libres en el local.
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
              <button
                onClick={() => { setIsChangeTableModalOpen(false); setTargetTable(null); }}
                className="flex-1 py-2.5 px-4 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-colors text-sm cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmChangeTable}
                disabled={!targetTable}
                className="flex-1 py-2.5 px-4 bg-orange-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-bold hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/20 text-sm cursor-pointer"
              >
                Confirmar Traslado
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancelar Pedidos Confirmation Modal */}
      <AnimatePresence>
        {isCancelModalOpen && selectedTable && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full overflow-hidden"
            >
              {/* Header */}
              <div className="p-6 pb-4 border-b border-slate-100 bg-slate-50 flex items-start gap-3.5 animate-fade-in">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Cancelar Pedidos</h3>
                  <p className="text-xs text-slate-500 mt-1">Requiere Autorización del Administrador</p>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-600 leading-relaxed bg-red-50/50 border border-red-100/50 rounded-xl p-3.5">
                  ¿Estás seguro de que deseas cancelar de manera permanente todos los pedidos de la <strong>Mesa {selectedTable.number}</strong> ({activeTableOrders.length} {activeTableOrders.length === 1 ? 'pedido' : 'pedidos'}, total: ${tableTotal.toFixed(2)})? Se liberará la mesa y se restaurará el stock de cocina.
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
                          handleConfirmCancelOrders();
                        }
                      }}
                      placeholder="Ingrese la clave..."
                      className={`w-full px-4 py-3 bg-slate-50 border outline-none rounded-xl focus:bg-white text-slate-800 font-mono tracking-widest text-center text-lg transition-all ${passcodeError
                          ? 'border-red-500 bg-red-50 focus:border-red-500'
                          : 'border-slate-200 focus:border-orange-500'
                        }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasscode(!showPasscode)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-650 focus:outline-none"
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
                  onClick={() => setIsCancelModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-200/50 transition-all border border-slate-200 bg-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCancelOrders}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 active:scale-95 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  Confirmar Cancelación
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Item from Order Modal */}
      <AnimatePresence>
        {itemToDelete && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="p-6 pb-4 border-b border-slate-100 bg-slate-50 flex items-start gap-3.5 animate-fade-in">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Eliminar Producto</h3>
                  <p className="text-xs text-slate-500 mt-1">Requiere Autorización del Administrador</p>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-600 leading-relaxed bg-red-50/50 border border-red-100/50 rounded-xl p-3.5">
                  ¿Estás seguro de que deseas eliminar <strong>{itemToDelete.item.quantity}x {itemToDelete.item.menuItem.name}</strong> del pedido? Se restaurará el stock de cocina.
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
                          handleConfirmDeleteItem();
                        }
                      }}
                      placeholder="Ingrese la clave..."
                      className={`w-full px-4 py-3 bg-slate-50 border outline-none rounded-xl focus:bg-white text-slate-800 font-mono tracking-widest text-center text-lg transition-all ${passcodeError
                          ? 'border-red-500 bg-red-50 focus:border-red-500'
                          : 'border-slate-200 focus:border-orange-500'
                        }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasscode(!showPasscode)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-650 focus:outline-none"
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

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setItemToDelete(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-200/50 transition-all border border-slate-200 bg-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteItem}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 active:scale-95 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  Confirmar Eliminación
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Confirmation Modal for Table Deletion */}
      <AnimatePresence>
        {tableToDelete && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-sm w-full overflow-hidden"
            >
              {/* Header */}
              <div className="p-6 pb-4 border-b border-slate-100 bg-slate-50 flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Eliminar Mesa</h3>
                  <p className="text-xs text-slate-500 mt-1">Confirmar acción permanente</p>
                </div>
              </div>

              {/* Body */}
              <div className="p-6">
                <p className="text-sm text-slate-600 leading-relaxed">
                  ¿Estás seguro de que deseas eliminar permanentemente la <strong>Mesa {tableToDelete.number}</strong>?<br />Esta acción no se puede deshacer.
                </p>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setTableToDelete(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-200/50 transition-all border border-slate-200 bg-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteTable}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 active:scale-95 transition-all shadow-sm cursor-pointer border-0"
                >
                  Eliminar Mesa
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create / Edit Area Modal */}
      <AnimatePresence>
        {isAreaModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full overflow-hidden"
            >
              {/* Header */}
              <div className="p-6 pb-4 border-b border-slate-100 bg-slate-50 flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Gestionar zonas de Servicio</h3>
                  <p className="text-xs text-slate-500 mt-1">Crea, edita o elimina las zonas del restaurante (Salón, Terraza, etc.)</p>
                </div>
                <button
                  onClick={() => {
                    setIsAreaModalOpen(false);
                    setEditingAreaId(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/50 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-5">
                {/* Form to create area */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Nombre de Nueva Área
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newAreaName}
                      onChange={(e) => setNewAreaName(e.target.value)}
                      placeholder="Ej. VIP, Patio, Planta Alta..."
                      className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:bg-white focus:border-orange-500 text-slate-800 text-sm transition-all animate-fade-in"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateArea();
                      }}
                    />
                    <button
                      onClick={handleCreateArea}
                      className="px-4 py-2 bg-orange-500 text-white font-bold text-xs rounded-xl hover:bg-orange-600 transition-colors uppercase tracking-wider shrink-0 cursor-pointer border-0"
                    >
                      Crear
                    </button>
                  </div>
                </div>

                {/* List of existing areas */}
                <div className="space-y-2.5">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Zonas Registradas
                  </label>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-slate-50/50 overflow-hidden max-h-60 overflow-y-auto">
                    {areas.length === 0 ? (
                      <p className="p-4 text-center text-xs text-slate-400">No hay áreas de servicio registradas.</p>
                    ) : (
                      areas.map((area) => (
                        <div key={area.id} className="p-3 flex items-center justify-between hover:bg-white transition-colors min-h-[56px]">
                          {editingAreaId === area.id ? (
                            <div className="flex items-center gap-2 w-full">
                              <input
                                type="text"
                                value={editingAreaName}
                                onChange={(e) => setEditingAreaName(e.target.value)}
                                className="flex-1 px-2.5 py-1.5 bg-white border border-orange-400 outline-none rounded-lg text-slate-800 text-sm font-semibold focus:ring-1 focus:ring-orange-500"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleUpdateArea(area.id);
                                  if (e.key === 'Escape') setEditingAreaId(null);
                                }}
                                autoFocus
                              />
                              <button
                                onClick={() => handleUpdateArea(area.id)}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer border border-transparent hover:border-emerald-100"
                                title="Guardar Cambios"
                              >
                                <Check size={16} />
                              </button>
                              <button
                                onClick={() => setEditingAreaId(null)}
                                className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition-all cursor-pointer border border-transparent hover:border-slate-200"
                                title="Cancelar"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className="text-sm font-bold text-slate-700">{area.name}</span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setEditingAreaId(area.id);
                                    setEditingAreaName(area.name);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-orange-500 hover:bg-orange-50 border border-transparent hover:border-orange-100 rounded-lg transition-all cursor-pointer"
                                  title="Editar Área"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  onClick={() => handleDeleteArea(area.id, area.name)}
                                  className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-lg transition-all cursor-pointer"
                                  title="Eliminar Área"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsAreaModalOpen(false);
                    setEditingAreaId(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-200/50 transition-all border border-slate-200 bg-white cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Table Modal with Area selection */}
      <AnimatePresence>
        {isAddTableModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-sm w-full overflow-hidden"
            >
              {/* Header */}
              <div className="p-6 pb-4 border-b border-slate-100 bg-slate-50 flex items-start gap-3.5 animate-fade-in animate-duration-200">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                  <Plus size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Agregar Nueva Mesa</h3>
                  <p className="text-xs text-slate-500 mt-1">Configure el número y área física de la mesa</p>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Nombre o Número de Mesa
                  </label>
                  <input
                    type="text"
                    value={newTableNumber}
                    onChange={(e) => setNewTableNumber(e.target.value)}
                    placeholder="Ej. 5, Delivery 1"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:bg-white focus:border-orange-500 text-slate-800 text-sm font-bold tracking-wider transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Asignar Área de Servicio
                  </label>
                  <select
                    value={newTableAreaId}
                    onChange={(e) => setNewTableAreaId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:bg-white focus:border-orange-500 text-slate-800 text-sm font-medium transition-all cursor-pointer"
                  >
                    <option value="" disabled>Seleccione un área...</option>
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddTableModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-200/50 transition-all border border-slate-200 bg-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleExecuteAddTable}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 active:scale-95 transition-all shadow-sm cursor-pointer border-0"
                >
                  Agregar Mesa
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Open Register Modal */}
      <AnimatePresence>
        {isRegisterModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-sm w-full overflow-hidden"
            >
              <div className="p-6 pb-4 border-b border-slate-100 bg-slate-50 flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                  <Unlock size={20} className="text-orange-600" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-lg">Apertura de Caja</h3>
                  <p className="text-xs text-slate-500 font-medium">Ingresa el balance inicial y tu PIN.</p>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Monto Inicial (Bs/USD)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={registerInitialCash}
                    onChange={(e) => setRegisterInitialCash(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 focus:bg-white focus:border-orange-500 outline-none text-sm font-black transition-all"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">PIN Administrador</label>
                  <input
                    type="password"
                    value={registerPasscode}
                    onChange={(e) => {
                      setRegisterPasscode(e.target.value);
                      setRegisterPasscodeError(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleOpenRegisterSubmit();
                    }}
                    className={`w-full px-4 py-3 border rounded-xl font-mono text-center tracking-widest text-lg transition-all ${registerPasscodeError
                        ? 'border-red-400 bg-red-50 text-red-900 focus:border-red-500'
                        : 'border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-slate-400'
                      } outline-none cursor-text`}
                    placeholder="••••"
                    maxLength={4}
                  />
                </div>
              </div>
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegisterModalOpen(false);
                    setRegisterPasscodeError(false);
                    setRegisterPasscode('');
                    setRegisterInitialCash('');
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-200/50 transition-all border border-slate-200 bg-white"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleOpenRegisterSubmit}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 active:scale-95 transition-all shadow-sm"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Close Register Modal */}
      <AnimatePresence>
        {isCloseRegisterModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-sm w-full overflow-hidden"
            >
              <div className="p-6 pb-4 border-b border-slate-100 bg-red-50 flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <Lock size={20} className="text-red-600" />
                </div>
                <div>
                  <h3 className="font-extrabold text-red-900 text-lg">Cierre de Caja</h3>
                  <p className="text-xs text-red-700 font-medium">Se descargará un reporte de ventas.</p>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Monto Actual Contado</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={registerActualCash}
                    onChange={(e) => setRegisterActualCash(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 focus:bg-white focus:border-red-500 outline-none text-sm font-black transition-all"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">PIN Administrador</label>
                  <input
                    type="password"
                    value={registerPasscode}
                    onChange={(e) => {
                      setRegisterPasscode(e.target.value);
                      setRegisterPasscodeError(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCloseRegisterSubmit();
                    }}
                    className={`w-full px-4 py-3 border rounded-xl font-mono text-center tracking-widest text-lg transition-all ${registerPasscodeError
                        ? 'border-red-400 bg-red-50 text-red-900 focus:border-red-500'
                        : 'border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-slate-400'
                      } outline-none cursor-text`}
                    placeholder="••••"
                    maxLength={4}
                  />
                </div>
              </div>
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsCloseRegisterModalOpen(false);
                    setRegisterPasscodeError(false);
                    setRegisterPasscode('');
                    setRegisterActualCash('');
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-200/50 transition-all border border-slate-200 bg-white"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCloseRegisterSubmit}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 active:scale-95 transition-all shadow-sm"
                >
                  Cerrar y Descargar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
