import React, { useState, useEffect } from 'react';
import { Table, MenuItem, Order, OrderItem, User, Ingredient, Area, MenuAddition } from '../types';
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
  Settings
} from 'lucide-react';
import { useBCVRate } from '../hooks/useBCVRate';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, writeBatch, onSnapshot, deleteDoc, collection, query, where, getDocs, updateDoc } from '../firebase';
import { AnimatePresence, motion } from 'motion/react';
import * as XLSX from 'xlsx';

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
    deliveryCost?: number
  ) => void;
  currentUser: User | null;
  ingredients: Ingredient[];
  registerSettings?: any;
}

const CATEGORY_TABS = [
  { id: 'all', label: 'Todos 📋' },
  { id: 'bebida', label: 'Bebidas 🥤' },
  { id: 'postre', label: 'Postres 🍰' },
  { id: 'paninis', label: 'Paninis 🥪' },
  { id: 'pizzas', label: 'Pizzas 🍕' },
  { id: 'patacones', label: 'Patacones 🍌' }
];

const getCategoryLabel = (categoryRaw: string) => {
  const norm = (categoryRaw || '').toLowerCase().trim();
  const found = CATEGORY_TABS.find(t => t.id === norm);
  // Match plural/singular
  if (norm.includes('bebida')) return 'Bebida 🥤';
  if (norm.includes('postre')) return 'Postre 🍰';
  if (norm.includes('panini')) return 'Panini 🥪';
  if (norm.includes('pizza')) return 'Pizza 🍕';
  if (norm.includes('patacon') || norm.includes('patacón')) return 'Patacón 🍌';
  return found ? found.label : categoryRaw;
};

const matchCategory = (itemCategory: string, filterId: string) => {
  if (filterId === 'all') return true;
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
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('efectivo');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [editingItem, setEditingItem] = useState<OrderItem | null>(null);
  const [itemNotes, setItemNotes] = useState('');
  const [selectedAdditions, setSelectedAdditions] = useState<{name: string, price: number}[]>([]);

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
  const [customerPhone, setCustomerPhone] = useState('');
  const [isDelivery, setIsDelivery] = useState(false);
  const [deliveryCost, setDeliveryCost] = useState('');

  // Dynamic category tabs derived from default categories + any custom ones created by the user
  const dynamicCategories = [...CATEGORY_TABS];
  menu.forEach(item => {
    const catNorm = (item.category || '').toLowerCase().trim();
    if (catNorm && !dynamicCategories.some(cat => cat.id === catNorm)) {
      // Capitalize first letter
      const labelName = catNorm.charAt(0).toUpperCase() + catNorm.slice(1);
      dynamicCategories.push({
        id: catNorm,
        label: `${labelName} 🏷️`
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

  const handleTableSelect = (table: Table) => {
    setSelectedTable(table);
    setCurrentCart([]); // Reset cart when changing table
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
            JSON.stringify(i.selectedAdditions?.sort((a,b) => a.name.localeCompare(b.name)) || []) === JSON.stringify(selectedAdditions.sort((a,b) => a.name.localeCompare(b.name)))
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

  const handleApproveWhatsAppOrder = async (orderId: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status: 'pending' });
      toast.success('Pedido de WhatsApp aprobado y enviado a cocina');
    } catch (e) {
      toast.error('Error al aprobar pedido');
    }
  };

  const handleRejectWhatsAppOrder = async (orderId: string) => {
    try {
      await deleteDoc(doc(db, 'orders', orderId));
      toast.success('Pedido cancelado');
    } catch (e) {
      toast.error('Error al cancelar pedido');
    }
  };

  const activeTableOrders = activeOrders.filter(o => o.tableId === selectedTable?.id && o.status !== 'paid');
  const tableTotal = activeTableOrders.reduce((sum, o) => sum + o.total, 0);

  const generateReceipt = (
    table: Table, 
    orders: Order[], 
    bcvRate: number | null,
    paymentDetails?: { 
      method: string; 
      reference?: string; 
      isFinal: boolean; 
      customerName?: string;
      customerAddress?: string;
      customerID?: string;
      customerPhone?: string;
    }
  ) => {
    // Calculate totals to estimate line item heights dynamically
    const totalLinesEstimate = orders.flatMap(o => o.items).reduce((sum, item) => {
      let lines = 1;
      if (item.selectedAdditions && item.selectedAdditions.length > 0) lines += 1;
      if (item.notes) lines += 1;
      return sum + lines;
    }, 0);
    
    const hasCustomerInfo = !!(paymentDetails?.customerName || paymentDetails?.customerID || paymentDetails?.customerAddress);
    
    // Estimate total page height in millimeters for an 80mm roll (removed USD block height block)
    const heightEstimate = 65 + (totalLinesEstimate * 6.5) + 30 + (paymentDetails ? 15 : 0) + (hasCustomerInfo ? 15 : 0) + 15;
    const finalHeight = Math.max(140, Math.ceil(heightEstimate));

    const doc = new jsPDF({ unit: 'mm', format: [80, finalHeight] });
    
    let currentY = 8;

    // Draw modern orange company circular logo
    doc.setDrawColor(249, 115, 22); // Orange theme color: #f97316 (rgb 249, 115, 22)
    doc.setLineWidth(0.6);
    doc.circle(40, currentY + 5, 6, 'S'); // border circle centered at X=40, radius=6
    
    doc.setTextColor(249, 115, 22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('RP', 40, currentY + 8.5, { align: 'center' }); // Label 'RP' inside

    currentY += 16;

    // Company Header Info
    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('RestoPro B2B, C.A.', 40, currentY, { align: 'center' });
    
    currentY += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text('RIF: J-41234567-8', 40, currentY, { align: 'center' });
    
    currentY += 3.5;
    doc.text('Av. Francisco de Miranda, Torre RestoPro, Chacao', 40, currentY, { align: 'center' });
    
    currentY += 3.5;
    doc.text('Caracas, Distrito Capital', 40, currentY, { align: 'center' });
    
    currentY += 3.5;
    doc.text('Teléf: +58 (212) 555-1234', 40, currentY, { align: 'center' });
    
    currentY += 4.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    
    const isFinalReceipt = paymentDetails?.isFinal;
    const documentType = isFinalReceipt ? 'COMPROBANTE DE COMPRA / FACTURA' : 'CONTROL DE MESA / PRE-CUENTA';
    doc.text(documentType, 40, currentY, { align: 'center' });
    
    currentY += 3;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text('*** DOCUMENTO NO FISCAL ***', 40, currentY, { align: 'center' });
    
    currentY += 2;
    // Draw divider
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.25);
    doc.line(5, currentY, 75, currentY);

    // Metadata details
    currentY += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85); // slate-700
    
    const orderId = orders[0]?.id || '';
    const shortOrderId = orderId ? orderId.slice(0, 8).toUpperCase() : String(Math.floor(100000 + Math.random() * 900000));
    const invoiceNum = isFinalReceipt ? `F-${shortOrderId}` : `P-${shortOrderId}`;
    const controlNum = `00-${shortOrderId}`;
    const formatedTime = new Date().toLocaleString('es-VE', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
      hour12: true 
    });
    
    // Left Metadata
    doc.setFont('helvetica', 'bold');
    doc.text('Mesa:', 5, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(`Mesa ${table.number}`, 15, currentY);
    
    // Right Metadata
    doc.setFont('helvetica', 'bold');
    doc.text('Boleta:', 45, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(`#${invoiceNum}`, 58, currentY);
    
    currentY += 3.5;
    // Left Metadata
    doc.setFont('helvetica', 'bold');
    doc.text('Fecha:', 5, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(formatedTime.split(',')[0], 15, currentY);
    
    // Right Metadata
    doc.setFont('helvetica', 'bold');
    doc.text('Control:', 45, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(`#${controlNum}`, 58, currentY);
    
    currentY += 3.5;
    // Left Metadata
    doc.setFont('helvetica', 'bold');
    doc.text('Hora:', 5, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(formatedTime.split(',')[1]?.trim() || '', 15, currentY);
    
    // Right Metadata (waiter if available)
    const waiterName = orders[0]?.waiterName || '';
    if (waiterName) {
      doc.setFont('helvetica', 'bold');
      doc.text('Mesero:', 45, currentY);
      doc.setFont('helvetica', 'normal');
      doc.text(waiterName, 58, currentY);
    }
    
    currentY += 2.5;
    // Customer Details inside Ticket
    const hasCustomerDetailsVal = !!(paymentDetails?.customerName || paymentDetails?.customerID || paymentDetails?.customerAddress || paymentDetails?.customerPhone);
    if (hasCustomerDetailsVal) {
      doc.setDrawColor(226, 232, 240);
      doc.line(5, currentY, 75, currentY);
      
      currentY += 4;
      doc.setFont('helvetica', 'bold');
      doc.text('Cliente:', 5, currentY);
      doc.setFont('helvetica', 'normal');
      doc.text(paymentDetails.customerName || 'Consumidor Final', 16, currentY);

      if (paymentDetails.customerID) {
        doc.setFont('helvetica', 'bold');
        doc.text('CI/RIF:', 45, currentY);
        doc.setFont('helvetica', 'normal');
        doc.text(paymentDetails.customerID, 57, currentY);
      }

      if (paymentDetails.customerAddress) {
        currentY += 3.5;
        doc.setFont('helvetica', 'bold');
        doc.text('Dirección:', 5, currentY);
        doc.setFont('helvetica', 'normal');
        doc.text(paymentDetails.customerAddress, 18, currentY);
      }

      if (paymentDetails.customerPhone) {
        currentY += 3.5;
        doc.setFont('helvetica', 'bold');
        doc.text('Teléfono:', 5, currentY);
        doc.setFont('helvetica', 'normal');
        doc.text(paymentDetails.customerPhone, 18, currentY);
      }
    }
    
    currentY += 2.5;
    doc.setDrawColor(226, 232, 240);
    doc.line(5, currentY, 75, currentY);

    const rate = bcvRate || 40.0;

    // Table Data preparation
    const tableData: any[] = [];
    let totalVES = 0;
    
    orders.forEach(order => {
      order.items.forEach(item => {
        const itemPriceUSD = item.menuItem.price + (item.extraPrice || 0);
        const itemPriceVES = itemPriceUSD * rate;
        const itemTotalVES = item.quantity * itemPriceVES;
        totalVES += itemTotalVES;
        
        const removeEmojis = (text: string) => {
          return text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]+/gu, '').replace(/\s+/g, ' ').trim();
        };
        const safeCategoryRaw = removeEmojis(item.menuItem.category);
        const safeCategory = safeCategoryRaw.charAt(0).toUpperCase() + safeCategoryRaw.slice(1);
        const safeName = removeEmojis(item.menuItem.name);
        
        let description = `${safeCategory} - ${safeName}`;
        const additionsList: string[] = [];
        if (item.selectedAdditions && item.selectedAdditions.length > 0) {
          additionsList.push(`+ ${item.selectedAdditions.map(a => `${a.count && a.count > 1 ? `${a.count}x ` : ''}${a.name}`).join(', ')}`);
        }
        if (item.notes) {
          additionsList.push(`Nota: ${item.notes}`);
        }
        if (additionsList.length > 0) {
          description += `\n${additionsList.join('\n')}`;
        }
        
        tableData.push([
          item.quantity.toString(),
          description,
          `Bs. ${itemPriceVES.toFixed(2)}`,
          `Bs. ${itemTotalVES.toFixed(2)}`
        ]);
      });
    });

    // Draw Items Table inside custom widths
    autoTable(doc, {
      startY: currentY + 1.5,
      margin: { left: 5, right: 5 },
      theme: 'plain',
      styles: {
        fontSize: 7.5,
        cellPadding: { top: 1, bottom: 1, left: 0.5, right: 0.5 },
        font: 'helvetica',
      },
      headStyles: {
        fontStyle: 'bold',
        fillColor: false,
        textColor: [15, 23, 42],
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' }, // Quantity
        1: { cellWidth: 32, halign: 'left' },  // Product
        2: { cellWidth: 15, halign: 'right' }, // Unit Price in Bs.
        3: { cellWidth: 15, halign: 'right' }, // Total Price in Bs.
      },
      head: [['Cant', 'Producto', 'P.U. (Bs.)', 'Total (Bs.)']],
      body: tableData,
    });

    let finalY = (doc as any).lastAutoTable.finalY || (currentY + 10);

    // Invoice tax breakdowns in Bolívares (Bs.)
    const subtotalVES = totalVES / 1.16;
    const ivaVES = totalVES - subtotalVES;

    finalY += 2;
    doc.setDrawColor(226, 232, 240);
    doc.line(5, finalY, 75, finalY);
    
    finalY += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    
    // Subtotal
    doc.text('Subtotal (Sin IVA):', 5, finalY);
    doc.text(`Bs. ${subtotalVES.toFixed(2)}`, 75, finalY, { align: 'right' });
    
    finalY += 3.5;
    // IVA
    doc.text('I.V.A. (16.00%):', 5, finalY);
    doc.text(`Bs. ${ivaVES.toFixed(2)}`, 75, finalY, { align: 'right' });
    
    finalY += 4;
    // Total VES
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(249, 115, 22); // Orange highlight for VES Total
    doc.text('TOTAL A PAGAR:', 5, finalY);
    doc.text(`Bs. ${totalVES.toFixed(2)}`, 75, finalY, { align: 'right' });

    // Payment details printed if final payment receipt
    if (paymentDetails) {
      finalY += 4;
      doc.setDrawColor(226, 232, 240);
      doc.line(5, finalY, 75, finalY);
      
      finalY += 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text('INFORMACIÓN DE PAGO', 5, finalY);
      
      finalY += 3.5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      
      let methodText = 'EFECTIVO';
      if (paymentDetails.method === 'tarjeta') methodText = 'TARJETA';
      else if (paymentDetails.method === 'pago_movil') methodText = 'PAGO MÓVIL';
      else if (paymentDetails.method === 'transferencia') methodText = 'TRANSFERENCIA';
      else if (paymentDetails.method === 'zelle') methodText = 'ZELLE';
      
      doc.text('Método:', 5, finalY);
      doc.setFont('helvetica', 'bold');
      doc.text(methodText, 30, finalY);
      doc.setFont('helvetica', 'normal');
      
      if (paymentDetails.reference) {
        finalY += 3;
        doc.text('Referencia:', 5, finalY);
        doc.setFont('helvetica', 'bold');
        doc.text(paymentDetails.reference, 30, finalY);
        doc.setFont('helvetica', 'normal');
      }
    }

    // Aesthetic Footer
    finalY += 5;
    doc.setDrawColor(226, 232, 240);
    doc.line(5, finalY, 75, finalY);
    
    finalY += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text('¡Gracias por su visita y preferencia!', 40, finalY, { align: 'center' });
    
    finalY += 3.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Diseño de Boleta por RestoPro', 40, finalY, { align: 'center' });
    
    finalY += 2.5;
    doc.text('*** Software de Gestión Comercial RestoPro ***', 40, finalY, { align: 'center' });

    // Stream out PDF
    const filenameType = isFinalReceipt ? 'Factura' : 'Boleta';
    doc.save(`${filenameType}_Mesa_${table.number}_${Date.now()}.pdf`);
  };

  const confirmPaymentAndClose = () => {
    if (selectedTable) {
      if (selectedPaymentMethod === 'pago_movil' && !referenceNumber.trim()) {
        toast.error('Por favor, ingresa el número de referencia del Pago Móvil');
        return;
      }

      const costNum = parseFloat(deliveryCost);
      const hasDeliveryCost = isDelivery && !isNaN(costNum) && costNum > 0;

      generateReceipt(selectedTable, activeTableOrders, bcvRate, {
        method: selectedPaymentMethod,
        reference: referenceNumber.trim() || undefined,
        isFinal: true,
        customerName: customerName.trim() || undefined,
        customerAddress: customerAddress.trim() || undefined,
        customerID: customerID.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined
      });
      onCloseTable(
        selectedTable.id, 
        selectedPaymentMethod, 
        referenceNumber.trim() || undefined,
        customerName.trim() || undefined,
        customerAddress.trim() || undefined,
        customerID.trim() || undefined,
        customerPhone.trim() || undefined,
        isDelivery,
        hasDeliveryCost ? costNum : 0
      );
      setIsPaymentModalOpen(false);
      setSelectedTable(null);
      setCurrentCart([]);
      setReferenceNumber('');
      setCustomerName('');
      setCustomerAddress('');
      setCustomerID('');
      setCustomerPhone('');
      setIsDelivery(false);
      setDeliveryCost('');
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
          {/* Tables Section - Hidden on mobile if table is selected */}
          <div className={selectedTable ? 'hidden lg:block' : 'block'}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold text-slate-800">Seleccionar Mesa</h2>
                {currentUser?.role === 'admin' && isRegisterOpen && (
                  <button 
                    onClick={() => setIsCloseRegisterModalOpen(true)}
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
                className={`px-4 py-2 text-xs font-black rounded-lg uppercase tracking-wider transition-all duration-250 border select-none cursor-pointer ${
                  selectedAreaId === 'all'
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
                    className={`px-4 py-2 text-xs font-black rounded-lg uppercase tracking-wider transition-all duration-250 border flex items-center gap-1.5 select-none cursor-pointer ${
                      selectedAreaId === area.id
                        ? 'bg-orange-500 border-orange-500 text-white shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                    }`}
                  >
                    <span>{area.name}</span>
                    <span className={`text-[10px] pointer-events-none rounded px-1.5 py-0.5 ${
                      selectedAreaId === area.id ? 'bg-orange-600/50 text-white' : 'bg-slate-200 text-slate-600 font-bold'
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
          
          {/* Unconfirmed WhatsApp Orders */}
          {activeOrders.filter(o => o.status === 'unconfirmed').length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Smartphone className="text-emerald-500" /> 
                Pedidos de WhatsApp por Confirmar
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeOrders.filter(o => o.status === 'unconfirmed').map(order => (
                  <div key={order.id} className="bg-emerald-50 border-2 border-emerald-500 rounded-xl p-4 shadow-sm relative animate-fade-in">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-bold text-emerald-900">{order.customerName || 'Cliente WhatsApp'}</p>
                        <p className="text-xs text-emerald-700">{order.customerPhone}</p>
                        {order.isDelivery && <span className="inline-block mt-1 bg-emerald-200 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Delivery</span>}
                      </div>
                      <span className="font-black text-emerald-700">${order.total.toFixed(2)}</span>
                    </div>
                    <div className="text-sm text-emerald-800 mb-4 bg-white/60 p-2 rounded max-h-24 overflow-y-auto">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex gap-1">
                          <span className="font-bold">{item.quantity}x</span>
                          <span>{item.menuItem.name}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleApproveWhatsAppOrder(order.id)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg text-sm flex items-center justify-center gap-1 transition-colors cursor-pointer border-0">
                        <CheckCircle2 size={16} /> Aprobar
                      </button>
                      <button onClick={() => handleRejectWhatsAppOrder(order.id)} className="px-3 bg-red-100 hover:bg-red-200 text-red-600 font-bold rounded-lg transition-colors cursor-pointer border-0">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                      className={`w-full p-6 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-3 relative
                        ${isSelected ? 'border-orange-500 bg-orange-50 shadow-sm' : 
                          hasReadyOrder ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/50 shadow-md animate-pulse' :
                          hasOrder ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}
                      `}
                    >
                      <div className={`p-3 rounded-full ${
                        hasReadyOrder ? 'bg-emerald-100 text-emerald-600 animate-bounce' :
                        hasOrder ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {hasReadyOrder ? <CheckCircle2 size={24} /> : <Users size={24} />}
                      </div>
                      <div className="text-center">
                        <p className={`font-bold text-lg ${hasReadyOrder ? 'text-emerald-990' : 'text-slate-800'}`}>Mesa {table.number}</p>
                        <p className={`text-xs font-semibold uppercase tracking-wider ${
                          hasReadyOrder ? 'text-emerald-600 font-extrabold animate-pulse' :
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
            <div className="mt-4 lg:mt-12 order-last">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6">
                <h2 className="text-xl font-bold text-slate-800">Menú</h2>
                
                {/* Compact Category Tab Filters in 2 Wrapped Rows */}
                <div className="flex flex-wrap gap-1.5 max-w-full">
                  {dynamicCategories.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setSelectedCategory(tab.id)}
                      className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer select-none
                        ${selectedCategory === tab.id 
                          ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/10' 
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {menu
                  .filter(item => matchCategory(item.category, selectedCategory))
                  .map(item => {
                    const cartQuantity = currentCart.filter(i => i.menuItem.id === item.id).reduce((sum, i) => sum + i.quantity, 0);
                    
                    return (
                      <button
                        key={item.id}
                        onClick={() => addToCart(item)}
                        className={`relative bg-white p-3 rounded-xl border transition-all text-left overflow-hidden flex flex-col justify-between min-h-[105px] cursor-pointer select-none
                          ${cartQuantity > 0 ? 'border-orange-500 shadow-sm ring-1 ring-orange-500 bg-orange-50/5' : 'border-slate-200 hover:border-orange-300 hover:shadow-sm'}
                        `}
                      >
                        {cartQuantity > 0 && (
                          <div className="absolute top-0 right-0 bg-orange-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-bl-lg">
                            {cartQuantity}
                          </div>
                        )}
                        <div>
                          <div className="flex justify-between items-start mb-0.5 mt-0.5 gap-2">
                             <p className="text-[9px] font-extrabold text-orange-500 uppercase tracking-wide capitalize">{getCategoryLabel(item.category)}</p>
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
                                 <span className="text-[9px] font-bold text-slate-500 whitespace-nowrap bg-slate-100 px-1 py-0.5 rounded">Raciones: {maxServings}</span>
                               );
                             })()}
                          </div>
                          <h3 className="font-bold text-slate-800 text-xs line-clamp-2 leading-tight mb-1" title={item.name}>{item.name}</h3>
                        </div>
                        <div className="flex justify-between items-end gap-1 border-t border-slate-100 pt-1.5 mt-1">
                          <p className="text-xs sm:text-sm font-black text-slate-900 font-mono">${item.price.toFixed(2)}</p>
                          {bcvRate && (
                            <p className="text-[10px] font-bold text-slate-400 font-mono">Bs. {(item.price * bcvRate).toFixed(2)}</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
              </div>
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
                    onClick={() => generateReceipt(selectedTable, activeTableOrders, bcvRate)}
                    className="p-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer border-0"
                  >
                    <FileText size={13} />
                    Imprimir Boleta
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

              {/* Datos del Cliente */}
              <div className="mb-6 border-b border-slate-100 pb-5">
                <h4 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                  <span className="w-1.5 h-3.5 bg-orange-500 rounded-full"></span>
                  Datos del Cliente
                </h4>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Cédula / RIF</label>
                    <input
                      type="text"
                      value={customerID}
                      onChange={(e) => setCustomerID(e.target.value)}
                      placeholder="V-12345678"
                      className="w-full px-3 py-2.5 border border-slate-200 bg-white rounded-xl focus:ring-2 focus:ring-orange-500/10 focus:border-orange-500 outline-none text-xs transition-colors shadow-none font-semibold text-slate-800 placeholder-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Nombre y Apellido</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Cliente General"
                      className="w-full px-3 py-2.5 border border-slate-200 bg-white rounded-xl focus:ring-2 focus:ring-orange-500/10 focus:border-orange-500 outline-none text-xs transition-colors shadow-none font-semibold text-slate-800 placeholder-slate-400"
                    />
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
                      className="w-full px-3 py-2.5 border border-slate-200 bg-white rounded-xl focus:ring-2 focus:ring-orange-500/10 focus:border-orange-500 outline-none text-xs transition-colors shadow-none font-semibold text-slate-800 placeholder-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Teléfono</label>
                    <input
                      type="text"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="0412-1234567"
                      className="w-full px-3 py-2.5 border border-slate-200 bg-white rounded-xl focus:ring-2 focus:ring-orange-500/10 focus:border-orange-500 outline-none text-xs transition-colors shadow-none font-semibold text-slate-800 placeholder-slate-400"
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

              <div className="space-y-3">
                <label className="block text-sm font-bold text-slate-700 mb-2">Método de Pago</label>
                
                {[
                  { id: 'efectivo', label: 'Efectivo' },
                  { id: 'tarjeta', label: 'Tarjeta (Punto de Venta)' },
                  { id: 'pago_movil', label: 'Pago Móvil' },
                  { id: 'transferencia', label: 'Transferencia' },
                  { id: 'zelle', label: 'Zelle' }
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
                className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
              >
                <DollarSign size={20} />
                Confirmar Pago
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
                            className={`flex flex-col p-2.5 border rounded-xl transition-all select-none ${
                              isSelected 
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
                        className={`p-4 rounded-xl border-2 font-bold text-center transition-all cursor-pointer ${
                          isSelected 
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
                      className={`w-full px-4 py-3 bg-slate-50 border outline-none rounded-xl focus:bg-white text-slate-800 font-mono tracking-widest text-center text-lg transition-all ${
                        passcodeError
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
                    className={`w-full px-4 py-3 border rounded-xl font-mono text-center tracking-widest text-lg transition-all ${
                      registerPasscodeError 
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
                    className={`w-full px-4 py-3 border rounded-xl font-mono text-center tracking-widest text-lg transition-all ${
                      registerPasscodeError 
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
