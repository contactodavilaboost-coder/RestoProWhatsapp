import React, { useState, useEffect } from 'react';
import { MenuItem, MenuAddition, Ingredient, RecipeItem, InventoryMovement } from '../types';
import { 
  Package, 
  AlertTriangle, 
  X, 
  Plus, 
  Trash2, 
  Scale, 
  Settings, 
  Layers, 
  FileText,
  Egg,
  Edit2,
  Check,
  Tags,
  ArrowLeftRight,
  Flame,
  Search,
  History,
  ShoppingBag,
  Upload,
  Truck,
  Eye,
  EyeOff,
  AlertCircle
} from 'lucide-react';
import { doc, setDoc, deleteDoc, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { toast } from 'sonner';

interface InventoryProps {
  menu: MenuItem[];
  ingredients: Ingredient[];
  currentUser?: any;
}

export const getCategoryDisplayName = (cat: string): string => {
  const mapping: Record<string, string> = {
    bebida: 'Bebida 🥤',
    postre: 'Postre 🍰',
    paninis: 'Paninis 🥪',
    pizzas: 'Pizzas 🍕',
    patacones: 'Patacones 🍌'
  };
  const norm = (cat || '').toLowerCase().trim();
  return mapping[norm] || cat;
};

export default function Inventory({ menu, ingredients, currentUser }: InventoryProps) {
  const [activeTab, setActiveTab] = useState<'ingredients' | 'products' | 'movements' | 'compras'>('ingredients');

  // Compras (Purchase) States
  const [purchases, setPurchases] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<{id: string; name: string}[]>([]);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [searchPurchaseQuery, setSearchPurchaseQuery] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [invoicePhoto, setInvoicePhoto] = useState<string>('');
  const [purchaseItems, setPurchaseItems] = useState<{ ingredientId: string; quantity: number; cost: number }[]>([]);
  const [currentPurchaseItem, setCurrentPurchaseItem] = useState({ ingredientId: '', quantity: '', cost: '' });

  // Fetch purchases & suppliers
  useEffect(() => {
    const qPurchases = query(collection(db, 'purchases'), orderBy('timestamp', 'desc'));
    const unsubPurchases = onSnapshot(qPurchases, (snapshot) => {
      const docsArr: any[] = [];
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        docsArr.push({
          id: docSnap.id,
          ...d
        });
      });
      setPurchases(docsArr);
    }, (error) => {
      console.error("Error fetching purchases:", error);
    });

    const qSuppliers = query(collection(db, 'suppliers'), orderBy('name', 'asc'));
    const unsubSuppliers = onSnapshot(qSuppliers, (snapshot) => {
      const docsArr: {id: string; name: string}[] = [];
      snapshot.forEach(docSnap => {
        const d = docSnap.data() as {name: string};
        docsArr.push({
          id: docSnap.id,
          name: d.name
        });
      });
      setSuppliers(docsArr);
    }, (error) => {
      console.error("Error fetching suppliers:", error);
    });

    return () => {
      unsubPurchases();
      unsubSuppliers();
    };
  }, []);

  const addPurchaseItem = () => {
    if (!currentPurchaseItem.ingredientId || !currentPurchaseItem.quantity) {
      toast.error('Selecciona un ingrediente y cantidad válida');
      return;
    }
    const qtyNum = parseFloat(currentPurchaseItem.quantity);
    const costNum = currentPurchaseItem.cost ? parseFloat(currentPurchaseItem.cost) : 0;
    
    if (isNaN(qtyNum) || qtyNum <= 0) {
      toast.error('La cantidad debe ser mayor que cero');
      return;
    }

    // Check if ingredient already added
    const existsIndex = purchaseItems.findIndex(i => i.ingredientId === currentPurchaseItem.ingredientId);
    const calculatedItemCost = qtyNum * costNum;
    
    if (existsIndex >= 0) {
      const updated = [...purchaseItems];
      updated[existsIndex].quantity = Number((updated[existsIndex].quantity + qtyNum).toFixed(3));
      updated[existsIndex].cost = Number((updated[existsIndex].cost + calculatedItemCost).toFixed(3));
      setPurchaseItems(updated);
    } else {
      setPurchaseItems([
        ...purchaseItems,
        {
          ingredientId: currentPurchaseItem.ingredientId,
          quantity: qtyNum,
          cost: calculatedItemCost
        }
      ]);
    }

    // Reset item inputs
    setCurrentPurchaseItem({ ingredientId: '', quantity: '', cost: '' });
  };

  const removePurchaseItem = (index: number) => {
    const updated = [...purchaseItems];
    updated.splice(index, 1);
    setPurchaseItems(updated);
  };

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim()) {
      toast.error('Nombre del proveedor es obligatorio');
      return;
    }
    const totalNum = parseFloat(totalAmount);
    if (isNaN(totalNum) || totalNum <= 0) {
      toast.error('Monto de la factura es obligatorio y debe ser mayor a cero');
      return;
    }
    if (purchaseItems.length === 0) {
      toast.error('Debes agregar al menos un ingrediente a la compra');
      return;
    }

    try {
      const purchaseId = Math.random().toString(36).substr(2, 9);
      const now = Date.now();
      const userDisplayName = currentUser?.name || 'Admin';
      const cleanSupplierName = supplierName.trim();

      // Check if supplier exists, if not, create it
      const existingSupplier = suppliers.find(s => s.name.toLowerCase() === cleanSupplierName.toLowerCase());
      if (!existingSupplier) {
        const newSupplierId = Math.random().toString(36).substr(2, 9);
        await setDoc(doc(db, 'suppliers', newSupplierId), {
          id: newSupplierId,
          name: cleanSupplierName
        });
      }

      // 1. Save purchase document
      await setDoc(doc(db, 'purchases', purchaseId), {
        id: purchaseId,
        supplierName: cleanSupplierName,
        userName: userDisplayName,
        totalAmount: totalNum,
        timestamp: now,
        invoicePhoto: invoicePhoto,
        items: purchaseItems
      });

      // 2. Update stock for each ingredient & log movement
      for (const item of purchaseItems) {
        const ing = ingredients.find(i => i.id === item.ingredientId);
        if (ing) {
          const oldStock = ing.stock;
          const newStock = Number((oldStock + item.quantity).toFixed(3));

          // Update ingredient document
          await setDoc(doc(db, 'ingredients', ing.id), {
            ...ing,
            stock: newStock
          });

          // Create inventory movement record
          const movementId = Math.random().toString(36).substr(2, 9);
          await setDoc(doc(db, 'inventoryMovements', movementId), {
            id: movementId,
            ingredientId: ing.id,
            ingredientName: ing.name,
            quantity: item.quantity,
            type: 'entrada',
            prevStock: oldStock,
            newStock: newStock,
            timestamp: now,
            userName: userDisplayName,
            notes: `Compra a Proveedor: ${supplierName.trim()} (Monto ítem: $${item.cost})`
          });
        }
      }

      toast.success('Compra registrada e inventarios actualizados con éxito.');
      setIsPurchaseModalOpen(false);
      
      // Reset forms
      setSupplierName('');
      setTotalAmount('');
      setInvoicePhoto('');
      setPurchaseItems([]);
      setCurrentPurchaseItem({ ingredientId: '', quantity: '', cost: '' });
    } catch (error) {
      console.error(error);
      toast.error('Error al registrar la compra.');
    }
  };
  
  // Product States (Menu Items)
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [newItem, setNewItem] = useState({ name: '', category: '', price: '', stock: '' });
  const [newAdditions, setNewAdditions] = useState<MenuAddition[]>([]);
  const [currentAddition, setCurrentAddition] = useState({ ingredientId: '', price: '', quantity: '' });
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Ingredient States
  const [isIngredientModalOpen, setIsIngredientModalOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [newIngredient, setNewIngredient] = useState({ name: '', stock: '', unit: 'g', minStock: '', location: 'cocina' });
  const [locationFilter, setLocationFilter] = useState<'all' | 'cocina' | 'bodega' | 'barra'>('all');

  // Movements State
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [isMovementsLoading, setIsMovementsLoading] = useState(true);
  const [searchMovementQuery, setSearchMovementQuery] = useState('');

  // Adjustment Modal States (Desecho & Traslado)
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState<'desecho' | 'traslado_bodega_cocina'>('desecho');
  const [selectedAdjustmentIng, setSelectedAdjustmentIng] = useState<Ingredient | null>(null);
  const [adjustmentQty, setAdjustmentQty] = useState('');
  const [adjustmentNotes, setAdjustmentNotes] = useState('');
  const [targetIngredientId, setTargetIngredientId] = useState('');
  const [transferMode, setTransferMode] = useState<'manual' | 'recipe'>('manual');
  const [recipeProductId, setRecipeProductId] = useState('');
  const [recipePortions, setRecipePortions] = useState('');
  const [manualOutputQty, setManualOutputQty] = useState('');
  const [manualOutputLabel, setManualOutputLabel] = useState('');

  // Custom Confirmation Dialog State
  const [adminPasscode, setAdminPasscode] = useState('1234');
  const [enteredPasscode, setEnteredPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [passcodeError, setPasscodeError] = useState(false);

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

  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    type: 'ingredient' | 'category' | 'product';
    id: string; // Ingredient, product, or category Name
    name: string; // Human readable name
    msg: string; // Custom warning message
  }>({
    open: false,
    type: 'ingredient',
    id: '',
    name: '',
    msg: ''
  });

  // Fetch movements
  useEffect(() => {
    const q = query(collection(db, 'inventoryMovements'), orderBy('timestamp', 'desc'), limit(150));
    const unsub = onSnapshot(q, (snapshot) => {
      const docsArr: InventoryMovement[] = [];
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        docsArr.push({
          id: docSnap.id,
          ingredientId: d.ingredientId,
          ingredientName: d.ingredientName,
          quantity: d.quantity,
          type: d.type,
          prevStock: d.prevStock,
          newStock: d.newStock,
          timestamp: d.timestamp,
          userName: d.userName || 'Sistema',
          notes: d.notes
        });
      });
      setMovements(docsArr);
      setIsMovementsLoading(false);
    }, (error) => {
      console.error('Error fetching movements:', error);
      setIsMovementsLoading(false);
    });
    return unsub;
  }, []);

  // Recipe Manager States
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [recipeMenuItem, setRecipeMenuItem] = useState<MenuItem | null>(null);
  const [recipeItems, setRecipeItems] = useState<RecipeItem[]>([]);
  const [selectedIngredientId, setSelectedIngredientId] = useState('');
  const [selectedIngredientQty, setSelectedIngredientQty] = useState('');

  // Category management States
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [categoryInputName, setCategoryInputName] = useState('');

  // Calculate dynamic portions based on ingredient stock
  const calculateMaxPortions = (item: MenuItem) => {
    if (!item.recipe || item.recipe.length === 0) return item.stock;
    
    let minPortions = Infinity;
    item.recipe.forEach(recipeItem => {
      const ing = ingredients.find(i => i.id === recipeItem.ingredientId);
      if (ing) {
        const portions = Math.floor(ing.stock / recipeItem.quantity);
        if (portions < minPortions) {
          minPortions = portions;
        }
      } else {
        minPortions = 0; // ingredient not found
      }
    });
    return minPortions === Infinity ? 0 : minPortions;
  };

  // ----- INGREDIENT ACTIONS -----
  const openAddIngredientModal = () => {
    setEditingIngredient(null);
    setNewIngredient({ name: '', stock: '', unit: 'g', minStock: '', location: 'cocina' });
    setIsIngredientModalOpen(true);
  };

  const openEditIngredientModal = (ing: Ingredient) => {
    setEditingIngredient(ing);
    setNewIngredient({
      name: ing.name,
      stock: ing.stock.toString(),
      unit: ing.unit,
      minStock: ing.minStock.toString(),
      location: ing.location || 'cocina'
    });
    setIsIngredientModalOpen(true);
  };

  const handleSaveIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const id = editingIngredient ? editingIngredient.id : Math.random().toString(36).substr(2, 9);
      const isNew = !editingIngredient;
      const previousStock = editingIngredient ? editingIngredient.stock : 0;
      const newStockVal = Number(newIngredient.stock);
      const stockDiff = newStockVal - previousStock;

      await setDoc(doc(db, 'ingredients', id), {
        name: newIngredient.name,
        stock: newStockVal,
        unit: newIngredient.unit,
        minStock: Number(newIngredient.minStock),
        location: newIngredient.location || 'cocina'
      });

      // Log movement automatically if there is a difference
      if (stockDiff !== 0) {
        const movId = Math.random().toString(36).substr(2, 9);
        await setDoc(doc(db, 'inventoryMovements', movId), {
          id: movId,
          ingredientId: id,
          ingredientName: newIngredient.name,
          quantity: stockDiff,
          type: stockDiff > 0 ? 'entrada' : 'ajuste',
          prevStock: previousStock,
          newStock: newStockVal,
          timestamp: Date.now(),
          userName: currentUser?.name || 'Admin',
          notes: isNew 
            ? `Carga inicial de inventario (${newIngredient.location === 'bodega' ? 'Bodega' : 'Cocina'})`
            : `Modificación manual de stock (${newIngredient.location === 'bodega' ? 'Bodega' : 'Cocina'})`
        });
      }

      setIsIngredientModalOpen(false);
      toast.success(editingIngredient ? 'Ingrediente actualizado' : 'Ingrediente registrado con éxito');
    } catch (error) {
      handleFirestoreError(error, editingIngredient ? OperationType.UPDATE : OperationType.CREATE, 'ingredients');
      toast.error('Error al guardar ingrediente');
    }
  };

  const openDesechoModal = (ing: Ingredient) => {
    setSelectedAdjustmentIng(ing);
    setAdjustmentType('desecho');
    setAdjustmentQty('');
    setAdjustmentNotes('');
    setTargetIngredientId('');
    setIsAdjustmentModalOpen(true);
  };

  const openTrasladoModal = (ing: Ingredient) => {
    setSelectedAdjustmentIng(ing);
    setAdjustmentType('traslado_bodega_cocina');
    setAdjustmentQty('');
    setAdjustmentNotes('Destape de ingrediente de Bodega a Cocina');
    const matchingCocinaIng = ingredients.find(i => (i.location || 'cocina') === 'cocina' && i.name.toLowerCase() === ing.name.toLowerCase() && i.id !== ing.id);
    setTargetIngredientId(matchingCocinaIng ? matchingCocinaIng.id : '');
    
    // Reset transfer mode states
    setTransferMode('manual');
    setRecipeProductId('');
    setRecipePortions('');
    setManualOutputQty('');
    setManualOutputLabel('');
    
    setIsAdjustmentModalOpen(true);
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdjustmentIng) return;
    
    if ((adjustmentType === 'desecho' || transferMode === 'manual') && !adjustmentQty) {
      toast.error('Debe ingresar la cantidad');
      return;
    }
    
    if (adjustmentType === 'traslado_bodega_cocina' && !targetIngredientId) {
      toast.error('Debe seleccionar el ingrediente de Cocina destino (o debe existir uno)');
      return;
    }
    
    let qtyNum = Number(adjustmentQty);
    let calculatedNotes = adjustmentNotes;

    if (adjustmentType === 'traslado_bodega_cocina') {
      if (transferMode === 'recipe') {
        const menuItem = menu.find(m => m.id === recipeProductId);
        if (!menuItem) {
          toast.error('Debe seleccionar un producto del menú');
          return;
        }
        const portionsNum = Number(recipePortions);
        if (isNaN(portionsNum) || portionsNum <= 0) {
          toast.error('Debe ingresar un número de porciones válido');
          return;
        }
        const recipeItem = menuItem.recipe?.find(r => r.ingredientId === selectedAdjustmentIng.id);
        if (!recipeItem) {
          toast.error('Este ingrediente no forma parte de la receta del platillo seleccionado');
          return;
        }
        qtyNum = Number((recipeItem.quantity * portionsNum).toFixed(3));
        calculatedNotes = `Por receta: ${portionsNum} raciones de "${menuItem.name}". Trasladados ${qtyNum} ${selectedAdjustmentIng.unit} de bodega a cocina.`;
      } else {
        // Manual mode
        const outputQtyVal = manualOutputQty.trim();
        const outputLabelVal = manualOutputLabel.trim();
        if (outputQtyVal && outputLabelVal) {
          calculatedNotes = `Traslado manual: ${qtyNum} ${selectedAdjustmentIng.unit} de bodega a cocina. Producción: ${outputQtyVal} ${outputLabelVal}.`;
        } else {
          calculatedNotes = adjustmentNotes || 'Traslado Bodega -> Cocina';
        }
      }
    } else {
      // Desecho
      calculatedNotes = adjustmentNotes || 'Desecho de ingrediente';
    }

    if (isNaN(qtyNum) || qtyNum <= 0) {
      toast.error('Coloque una cantidad válida');
      return;
    }
    
    if (qtyNum > selectedAdjustmentIng.stock) {
      toast.error(`Cantidad supera el stock disponible (${selectedAdjustmentIng.stock} ${selectedAdjustmentIng.unit})`);
      return;
    }
    
    try {
      const now = Date.now();
      const userDisplayName = currentUser?.name || 'Admin';
      const roundedNewStock = Number((selectedAdjustmentIng.stock - qtyNum).toFixed(3));
      
      // 1. Update source ingredient (usually Bodega, but works for any)
      await setDoc(doc(db, 'ingredients', selectedAdjustmentIng.id), {
        ...selectedAdjustmentIng,
        stock: roundedNewStock
      });
      
      // 2. Log subtraction movement
      const movIdSource = Math.random().toString(36).substr(2, 9);
      await setDoc(doc(db, 'inventoryMovements', movIdSource), {
        id: movIdSource,
        ingredientId: selectedAdjustmentIng.id,
        ingredientName: selectedAdjustmentIng.name,
        quantity: -qtyNum,
        type: adjustmentType,
        prevStock: selectedAdjustmentIng.stock,
        newStock: roundedNewStock,
        timestamp: now,
        userName: userDisplayName,
        notes: calculatedNotes
      });
      
      // 3. Update target ingredient if type is traslado
      if (adjustmentType === 'traslado_bodega_cocina' && targetIngredientId) {
        const targetIng = ingredients.find(i => i.id === targetIngredientId);
        if (targetIng) {
          const newTargetStock = Number((targetIng.stock + qtyNum).toFixed(3));
          await setDoc(doc(db, 'ingredients', targetIng.id), {
            ...targetIng,
            stock: newTargetStock
          });
          
          const movIdTarget = Math.random().toString(36).substr(2, 9);
          await setDoc(doc(db, 'inventoryMovements', movIdTarget), {
            id: movIdTarget,
            ingredientId: targetIng.id,
            ingredientName: targetIng.name,
            quantity: qtyNum,
            type: 'entrada',
            prevStock: targetIng.stock,
            newStock: newTargetStock,
            timestamp: now + 1, // Offset slightly to preserve order
            userName: userDisplayName,
            notes: `Ingreso por destape desde Bodega (${selectedAdjustmentIng.name})`
          });
        }
      }
      
      setIsAdjustmentModalOpen(false);
      toast.success(adjustmentType === 'desecho' ? 'Desecho registrado con éxito' : 'Destape de Bodega registrado con éxito');
    } catch (error) {
      console.error(error);
      toast.error('Error al registrar movimiento');
    }
  };

  const handleDeleteIngredient = (id: string, name: string) => {
    setDeleteConfirm({
      open: true,
      type: 'ingredient',
      id,
      name,
      msg: `¿Estás seguro de que deseas eliminar el ingrediente "${name}"? Se quitará permanentemente del inventario.`
    });
  };

  const handleDeleteProduct = (id: string, name: string) => {
    setDeleteConfirm({
      open: true,
      type: 'product',
      id,
      name,
      msg: `¿Estás seguro de que deseas eliminar el platillo/producto "${name}"? Se quitará permanentemente del menú.`
    });
    setEnteredPasscode('');
    setPasscodeError(false);
    setShowPasscode(false);
  };

  const executeDelete = async () => {
    const { type, id, name } = deleteConfirm;
    if (!id) return;

    if (type === 'product' && enteredPasscode !== adminPasscode) {
      setPasscodeError(true);
      toast.error('Clave de seguridad incorrecta. Inténtelo de nuevo.');
      return;
    }

    try {
      if (type === 'ingredient') {
        await deleteDoc(doc(db, 'ingredients', id));
        toast.success(`Ingrediente "${name}" eliminado con éxito.`);
      } else if (type === 'product') {
        await deleteDoc(doc(db, 'menuItems', id));
        toast.success(`Platillo "${name}" eliminado con éxito.`);
      } else if (type === 'category') {
        const normCat = id.toLowerCase().trim();
        const itemsToUpdate = menu.filter(item => (item.category || '').toLowerCase().trim() === normCat);
        const promises = itemsToUpdate.map(item => {
          return setDoc(doc(db, 'menuItems', item.id), {
            ...item,
            category: ''
          });
        });
        await Promise.all(promises);
        toast.success(`Categoría "${name}" eliminada.`);
      }
      setDeleteConfirm({ open: false, type: 'ingredient', id: '', name: '', msg: '' });
      setEnteredPasscode('');
      setPasscodeError(false);
    } catch (error) {
      console.error(error);
      handleFirestoreError(error, OperationType.DELETE, type === 'ingredient' ? 'ingredients' : 'menuItems');
      toast.error('Error al realizar la eliminación.');
    }
  };

  // ----- DISH / PRODUCT ACTIONS -----
  const openAddProductModal = () => {
    setEditingItem(null);
    setNewItem({ name: '', category: '', price: '', stock: '0' });
    setNewAdditions([]);
    setCurrentAddition({ ingredientId: '', price: '', quantity: '' });
    setShowNewCategoryInput(false);
    setNewCategoryName('');
    setIsProductModalOpen(true);
  };

  const openEditProductModal = (item: MenuItem) => {
    setEditingItem(item);
    setNewItem({
      name: item.name,
      category: item.category,
      price: item.price.toString(),
      stock: item.stock.toString()
    });
    setNewAdditions(item.additions || []);
    setCurrentAddition({ ingredientId: '', price: '', quantity: '' });
    setShowNewCategoryInput(false);
    setNewCategoryName('');
    setIsProductModalOpen(true);
  };

  const handleAddAddition = () => {
    if (currentAddition.ingredientId && currentAddition.price && currentAddition.quantity) {
      const qNum = Number(currentAddition.quantity);
      if (isNaN(qNum) || qNum <= 0) {
        toast.error('Coloque una cantidad válida para el adicional');
        return;
      }
      const ing = ingredients.find(i => i.id === currentAddition.ingredientId);
      if (ing) {
        // Prevent duplicate additions
        if (newAdditions.some(a => a.ingredientId === ing.id)) {
          toast.error('Este ingrediente ya está agregado como adicional');
          return;
        }
        setNewAdditions([...newAdditions, { 
          name: ing.name, 
          price: Number(currentAddition.price),
          ingredientId: ing.id,
          quantity: qNum
        }]);
        setCurrentAddition({ ingredientId: '', price: '', quantity: '' });
      }
    } else {
      toast.error('Selecciona un ingrediente, coloca la cantidad y un precio válido');
    }
  };

  const handleRemoveAddition = (index: number) => {
    setNewAdditions(newAdditions.filter((_, i) => i !== index));
  };

  const handleCategoryChange = (val: string) => {
    if (val === '__new__') {
      setShowNewCategoryInput(true);
      setNewItem({ ...newItem, category: '' });
    } else {
      setShowNewCategoryInput(false);
      setNewItem({ ...newItem, category: val });
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const id = editingItem ? editingItem.id : Math.random().toString(36).substr(2, 9);
      await setDoc(doc(db, 'menuItems', id), {
        name: newItem.name,
        category: newItem.category,
        price: Number(newItem.price),
        stock: Number(newItem.stock),
        additions: newAdditions,
        recipe: editingItem?.recipe || []
      });
      setIsProductModalOpen(false);
      setEditingItem(null);
      toast.success(editingItem ? 'Producto actualizado' : 'Producto creado con éxito');
    } catch (error) {
      handleFirestoreError(error, editingItem ? OperationType.UPDATE : OperationType.CREATE, 'menuItems');
      toast.error('Error al guardar producto');
    }
  };

  // ----- RECIPE MANAGER ACTIONS -----
  const openRecipeModal = (item: MenuItem) => {
    setRecipeMenuItem(item);
    setRecipeItems(item.recipe || []);
    setSelectedIngredientId('');
    setSelectedIngredientQty('');
    setIsRecipeModalOpen(true);
  };

  const handleAddRecipeIngredient = () => {
    if (!selectedIngredientId || !selectedIngredientQty) {
      toast.error('Selecciona un ingrediente y coloca la cantidad');
      return;
    }

    const qty = Number(selectedIngredientQty);
    if (qty <= 0) {
      toast.error('La cantidad debe ser mayor a 0');
      return;
    }

    // Check if food ingredient is already attached
    if (recipeItems.some(ri => ri.ingredientId === selectedIngredientId)) {
      toast.error('Este ingrediente ya está en la receta');
      return;
    }

    setRecipeItems([...recipeItems, {
      ingredientId: selectedIngredientId,
      quantity: qty
    }]);
    setSelectedIngredientId('');
    setSelectedIngredientQty('');
  };

  const handleRemoveRecipeIngredient = (index: number) => {
    setRecipeItems(recipeItems.filter((_, i) => i !== index));
  };

  const handleSaveRecipe = async () => {
    if (!recipeMenuItem) return;
    try {
      await setDoc(doc(db, 'menuItems', recipeMenuItem.id), {
        ...recipeMenuItem,
        recipe: recipeItems
      });
      setIsRecipeModalOpen(false);
      setRecipeMenuItem(null);
      toast.success(`Receta de "${recipeMenuItem.name}" guardada con éxito`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'menuItems');
      toast.error('Error al guardar la receta');
    }
  };

  // ----- CATEGORY MANAGER ACTIONS -----
  const handleRenameCategory = async (oldCategory: string, newCategoryNameVal: string) => {
    const normOld = oldCategory.toLowerCase().trim();
    const normNew = newCategoryNameVal.toLowerCase().trim();
    if (!normNew) {
      toast.error('El nuevo nombre de la categoría no puede estar vacío');
      return;
    }
    if (normOld === normNew) {
      toast.error('El nuevo nombre es idéntico al actual');
      return;
    }

    try {
      const itemsToUpdate = menu.filter(item => (item.category || '').toLowerCase().trim() === normOld);
      const promises = itemsToUpdate.map(item => {
        return setDoc(doc(db, 'menuItems', item.id), {
          ...item,
          category: normNew
        });
      });
      await Promise.all(promises);
      toast.success(`Categoría renombrada de "${oldCategory}" a "${normNew}" con éxito`);
      setEditingCategory(null);
      setCategoryInputName('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'menuItems');
      toast.error('Error al renombrar la categoría');
    }
  };

  const handleDeleteCategory = async (catToDelete: string) => {
    const normCat = catToDelete.toLowerCase().trim();
    const count = menu.filter(item => (item.category || '').toLowerCase().trim() === normCat).length;
    const msg = count > 0 
      ? `¿Estás seguro de que deseas eliminar la categoría "${getCategoryDisplayName(catToDelete)}"? Tiene ${count} platillo(s) asociado(s). Se les quitará la categoría, pero no se borrarán del inventario.`
      : `¿Estás seguro de que deseas eliminar la categoría "${getCategoryDisplayName(catToDelete)}"?`;
      
    setDeleteConfirm({
      open: true,
      type: 'category',
      id: catToDelete,
      name: getCategoryDisplayName(catToDelete),
      msg
    });
  };

  const renderIngredientOptions = (filterFn?: (ing: Ingredient) => boolean) => {
    const sorted = [...ingredients].sort((a, b) => a.name.localeCompare(b.name));
    const filtered = filterFn ? sorted.filter(filterFn) : sorted;
    const cocina = filtered.filter(i => (i.location || 'cocina') === 'cocina');
    const barra = filtered.filter(i => i.location === 'barra');
    const bodega = filtered.filter(i => i.location === 'bodega');

    return (
      <>
        <option value="">-- Seleccionar --</option>
        {cocina.length > 0 && (
          <optgroup label="🍳 Cocina (Alimentos)">
            {cocina.map(ing => <option key={ing.id} value={ing.id}>{ing.name} ({ing.stock} {ing.unit})</option>)}
          </optgroup>
        )}
        {barra.length > 0 && (
          <optgroup label="🍹 Barra (Bebidas)">
            {barra.map(ing => <option key={ing.id} value={ing.id}>{ing.name} ({ing.stock} {ing.unit})</option>)}
          </optgroup>
        )}
        {bodega.length > 0 && (
          <optgroup label="📦 Bodega (Materia Prima)">
            {bodega.map(ing => <option key={ing.id} value={ing.id}>{ing.name} ({ing.stock} {ing.unit})</option>)}
          </optgroup>
        )}
      </>
    );
  };

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [sortMenuConfig, setSortMenuConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [sortMovementsConfig, setSortMovementsConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleSortMenu = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortMenuConfig && sortMenuConfig.key === key && sortMenuConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortMenuConfig({ key, direction });
  };

  const handleSortMovements = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortMovementsConfig && sortMovementsConfig.key === key && sortMovementsConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortMovementsConfig({ key, direction });
  };

  const sortedMenu = React.useMemo(() => {
    let sortableItems = [...menu];
    if (sortMenuConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue: any = a[sortMenuConfig.key as keyof MenuItem];
        let bValue: any = b[sortMenuConfig.key as keyof MenuItem];

        if (aValue < bValue) return sortMenuConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortMenuConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [menu, sortMenuConfig]);

  const sortedMovements = React.useMemo(() => {
    let sortableItems = movements.filter(m => 
      m.ingredientName.toLowerCase().includes(searchMovementQuery.toLowerCase()) ||
      m.userName.toLowerCase().includes(searchMovementQuery.toLowerCase()) ||
      m.type.toLowerCase().includes(searchMovementQuery.toLowerCase())
    );

    if (sortMovementsConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue: any = a[sortMovementsConfig.key as keyof InventoryMovement];
        let bValue: any = b[sortMovementsConfig.key as keyof InventoryMovement];

        if (aValue < bValue) return sortMovementsConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortMovementsConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      sortableItems.sort((a, b) => b.timestamp - a.timestamp); // default desc
    }
    return sortableItems;
  }, [movements, searchMovementQuery, sortMovementsConfig]);

  const sortedFilteredIngredients = React.useMemo(() => {
    let sortableItems = ingredients.filter(ing => {
      if (locationFilter === 'all') return true;
      return (ing.location || 'cocina') === locationFilter;
    });

    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue: any = a[sortConfig.key as keyof Ingredient];
        let bValue: any = b[sortConfig.key as keyof Ingredient];

        if (sortConfig.key === 'location') {
          aValue = a.location || 'cocina';
          bValue = b.location || 'cocina';
        }
        
        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [ingredients, locationFilter, sortConfig]);

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen relative font-sans">
      {/* Title section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Scale className="text-orange-500" size={28} /> Control de Inventario
          </h2>
          <p className="text-slate-500 mt-1 text-sm md:text-base">
            Gestiona la materia prima por ingredientes y asocia las recetas a tus platillos para control automático de stock.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {activeTab === 'ingredients' && (
            <button 
              onClick={openAddIngredientModal}
              className="bg-slate-900 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-slate-800 transition-colors w-full sm:w-auto flex items-center justify-center gap-2 text-sm"
            >
              <Plus size={18} /> Nuevo Ingrediente
            </button>
          )}
          {activeTab === 'products' && (
            <>
              <button 
                onClick={() => setIsCategoryModalOpen(true)}
                className="bg-white text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl font-bold hover:bg-slate-50 hover:border-slate-300 transition-all w-full sm:w-auto flex items-center justify-center gap-2 text-sm shadow-sm"
              >
                <Tags size={18} className="text-slate-500" /> Gestionar Categorías
              </button>
              <button 
                onClick={openAddProductModal}
                className="bg-slate-900 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-slate-800 transition-colors w-full sm:w-auto flex items-center justify-center gap-2 text-sm shrink-0"
              >
                <Plus size={18} /> Nuevo Platillo
              </button>
            </>
          )}
          {activeTab === 'compras' && (
            <button 
              onClick={() => setIsPurchaseModalOpen(true)}
              className="bg-orange-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-orange-700 transition-colors w-full sm:w-auto flex items-center justify-center gap-2 text-sm shadow-sm"
            >
              <Plus size={18} /> Registrar Compra
            </button>
          )}
        </div>
      </div>

      {/* Tabs list */}
      <div className="flex flex-wrap gap-1 bg-slate-200 p-1 rounded-xl w-fit mb-6">
        <button
          onClick={() => setActiveTab('ingredients')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'ingredients' 
              ? 'bg-white text-slate-900 shadow-sm' 
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Egg size={16} />
          Ingredientes (Materia Prima)
          <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded-full ml-1 font-bold">
            {ingredients.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'products' 
              ? 'bg-white text-slate-900 shadow-sm' 
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layers size={16} />
          Platillos y Recetas
          <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded-full ml-1 font-bold">
            {menu.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('compras')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'compras' 
              ? 'bg-white text-slate-900 shadow-sm' 
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShoppingBag size={16} />
          Compras de Facturas
          <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded-full ml-1 font-bold">
            {purchases.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('movements')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'movements' 
              ? 'bg-white text-slate-900 shadow-sm' 
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <History size={16} />
          Historial de Movimientos
        </button>
      </div>

      {/* TAB 1: INGREDIENTS TABLE */}
      {activeTab === 'ingredients' && (
        <div className="space-y-4">
          {/* Location Filters */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex gap-1.5 bg-slate-200/70 p-1 rounded-xl w-fit">
              <button
                onClick={() => setLocationFilter('all')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  locationFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos ({ingredients.length})
              </button>
              <button
                onClick={() => setLocationFilter('cocina')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  locationFilter === 'cocina'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>🍳 Coz.</span> ({ingredients.filter(i => (i.location || 'cocina') === 'cocina').length})
              </button>
              <button
                onClick={() => setLocationFilter('barra')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  locationFilter === 'barra'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>🍹 Barra</span> ({ingredients.filter(i => i.location === 'barra').length})
              </button>
              <button
                onClick={() => setLocationFilter('bodega')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  locationFilter === 'bodega'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>📦 Bodega</span> ({ingredients.filter(i => i.location === 'bodega').length})
              </button>
            </div>
            
            <p className="text-xs text-slate-400 font-medium">
              * Los ingredientes en <strong className="text-slate-600">Bodega</strong> no forman parte de las recetas directamente hasta ser trasladados a <strong className="text-slate-600">Cocina</strong>.
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[850px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase text-slate-500 tracking-wider">
                    <th className="p-4 pl-6 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('name')}>
                      <div className="flex items-center gap-1">Ingrediente <ArrowLeftRight size={12} className="opacity-50" /></div>
                    </th>
                    <th className="p-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('location')}>
                      <div className="flex items-center gap-1">Ubicación <ArrowLeftRight size={12} className="opacity-50" /></div>
                    </th>
                    <th className="p-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('stock')}>
                      <div className="flex items-center gap-1">Stock <ArrowLeftRight size={12} className="opacity-50" /></div>
                    </th>
                    <th className="p-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('minStock')}>
                      <div className="flex items-center gap-1">Min. <ArrowLeftRight size={12} className="opacity-50" /></div>
                    </th>
                    <th className="p-4">Estado</th>
                    <th className="p-4 text-right pr-6">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {sortedFilteredIngredients.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        No hay ingredientes registrados en esta ubicación.
                      </td>
                    </tr>
                  ) : (
                    sortedFilteredIngredients.map(ing => {
                      const isLowStock = ing.stock <= ing.minStock;
                      const loc = ing.location || 'cocina';
                      return (
                        <tr key={ing.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-4 pl-6 font-extrabold text-slate-800">{ing.name}</td>
                          <td className="p-4">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                              loc === 'bodega' 
                                ? 'bg-purple-50 text-purple-700 border-purple-200/80' 
                                : loc === 'barra'
                                ? 'bg-orange-50 text-orange-700 border-orange-200/80'
                                : 'bg-sky-50 text-sky-700 border-sky-200/85'
                            }`}>
                              {loc === 'bodega' ? '📦 Bodega' : loc === 'barra' ? '🍹 Barra' : '🍳 Cocina'}
                            </span>
                          </td>
                          <td className="p-4 text-slate-700 font-mono font-bold">
                            {ing.stock} <span className="text-slate-400 font-medium">{ing.unit}</span>
                          </td>
                          <td className="p-4 text-slate-600 font-mono">
                            {ing.minStock} <span className="text-slate-400">{ing.unit}</span>
                          </td>
                          <td className="p-4">
                            {isLowStock ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200 animate-pulse">
                                <AlertTriangle size={12} /> Bajo Stock
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <Check size={12} /> Óptimo
                              </span>
                            )}
                          </td>
                          <td className="p-4 text-right pr-6 space-x-1.5 whitespace-nowrap text-xs">
                            {loc === 'bodega' && (
                              <button
                                onClick={() => openTrasladoModal(ing)}
                                className="bg-purple-50 border border-purple-200/70 text-purple-700 hover:bg-purple-100 font-extrabold px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 inline-flex"
                                title="Destapar y Trasladar stock a Cocina"
                              >
                                <ArrowLeftRight size={12} /> Destapar (Bodega ➔ Cocina)
                              </button>
                            )}
                            <button
                              onClick={() => openDesechoModal(ing)}
                              className="bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 font-extrabold px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 inline-flex"
                              title="Registrar merma o desecho de materia prima"
                            >
                              <Flame size={12} /> Desecho
                            </button>
                            <button
                              onClick={() => openEditIngredientModal(ing)}
                              className="text-blue-600 hover:text-blue-800 font-bold hover:underline px-1.5 py-1"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleDeleteIngredient(ing.id, ing.name)}
                              className="text-rose-500 hover:text-rose-700 font-bold hover:underline px-1.5 py-1"
                            >
                              Eliminar
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MENU ITEMS AND RECIPES */}
      {activeTab === 'products' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[750px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase text-slate-500 tracking-wider">
                  <th className="p-4 pl-6 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSortMenu('name')}>
                    <div className="flex items-center gap-1">Platillo / Producto <ArrowLeftRight size={12} className="opacity-50" /></div>
                  </th>
                  <th className="p-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSortMenu('category')}>
                    <div className="flex items-center gap-1">Categoría <ArrowLeftRight size={12} className="opacity-50" /></div>
                  </th>
                  <th className="p-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSortMenu('price')}>
                    <div className="flex items-center gap-1">Precio (USD) <ArrowLeftRight size={12} className="opacity-50" /></div>
                  </th>
                  <th className="p-4">Fórmula / Receta</th>
                  <th className="p-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSortMenu('stock')}>
                    <div className="flex items-center gap-1">Stock de Cocina <ArrowLeftRight size={12} className="opacity-50" /></div>
                  </th>
                  <th className="p-4 text-right pr-6">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {sortedMenu.map(item => {
                  const hasRecipe = item.recipe && item.recipe.length > 0;
                  const portions = calculateMaxPortions(item);
                  const isLowStock = portions < 10;
                  
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center font-bold">
                            <Package size={20} />
                          </div>
                          <div>
                            <span className="font-extrabold text-slate-800">{item.name}</span>
                            {item.additions && item.additions.length > 0 && (
                              <div className="text-xs text-slate-400 mt-0.5">
                                {item.additions.length} adicionales configurados
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-slate-600 font-medium capitalize">{getCategoryDisplayName(item.category)}</td>
                      <td className="p-4 text-slate-800 font-bold">${item.price.toFixed(2)}</td>
                      <td className="p-4 max-w-[280px]">
                        {hasRecipe ? (
                          <div className="flex flex-wrap gap-1.5 max-h-[85px] overflow-y-auto py-1">
                            {item.recipe!.map((recipeItem, idx) => {
                              const ing = ingredients.find(i => i.id === recipeItem.ingredientId);
                              return (
                                <span key={idx} className="bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded-md border border-slate-200/65 font-medium inline-block">
                                  {ing ? ing.name : 'Missing'} ({recipeItem.quantity}{ing ? ing.unit : ''})
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-amber-600 font-bold bg-amber-50 rounded-lg px-2.5 py-1 text-xs border border-amber-100">
                            Sin receta (Límite por plato: {item.stock})
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        {hasRecipe ? (
                          <div className="flex flex-col">
                            <span className={`font-bold ${isLowStock ? 'text-rose-600' : 'text-emerald-700'}`}>
                              {portions} raciones
                            </span>
                            <span className="text-xs text-slate-400 font-medium mt-0.5">Calculado por receta</span>
                          </div>
                        ) : (
                          <span className="font-medium text-slate-600 font-mono">{item.stock} unidades</span>
                        )}
                      </td>
                      <td className="p-4 text-right pr-6 space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => openRecipeModal(item)}
                          className="bg-orange-50 text-orange-700 hover:bg-orange-100 font-bold text-xs px-3 py-1.5 rounded-lg border border-orange-100 transition-colors flex items-center gap-1 inline-flex cursor-pointer"
                        >
                          <Settings size={14} /> Receta
                        </button>
                        <button
                          onClick={() => openEditProductModal(item)}
                          className="text-slate-600 hover:text-slate-800 font-bold hover:underline text-xs py-1 px-2 cursor-pointer"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(item.id, item.name)}
                          className="text-rose-500 hover:text-rose-700 font-bold hover:underline text-xs py-1 px-2 cursor-pointer"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: COMPRAS (PURCHASE RECORDS) */}
      {activeTab === 'compras' && (
        <div className="space-y-4 animate-fade-in">
          {/* Controls bar */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-white p-4 rounded-xl border border-slate-200">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                <Search size={16} />
              </span>
              <input
                type="text"
                value={searchPurchaseQuery}
                onChange={e => setSearchPurchaseQuery(e.target.value)}
                placeholder="Buscar compras por proveedor o ingrediente..."
                className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none text-sm bg-white"
              />
            </div>
            {/* Info */}
            <p className="text-xs text-slate-400 font-semibold md:text-right">
              Total facturado registrado: <strong className="text-slate-800 font-bold">${purchases.reduce((acc, curr) => acc + (curr.totalAmount || 0), 0).toFixed(2)}</strong>
            </p>
          </div>

          {/* Purchases Grid */}
          {purchases.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
              <ShoppingBag size={48} className="mx-auto text-slate-300 mb-3 animate-pulse" />
              <h3 className="text-lg font-bold text-slate-700">No hay compras registradas</h3>
              <p className="text-slate-500 mt-1 text-sm max-w-md mx-auto">
                Registra tu primera factura de compra utilizando el botón en la esquina superior derecha para sumar ingredientes al inventario automáticamente.
              </p>
            </div>
          ) : (
            (() => {
              const filtered = purchases.filter(p => 
                (p.supplierName || '').toLowerCase().includes(searchPurchaseQuery.toLowerCase()) ||
                (p.userName || '').toLowerCase().includes(searchPurchaseQuery.toLowerCase()) ||
                p.items?.some((item: any) => ingredients.find(ing => ing.id === item.ingredientId)?.name.toLowerCase().includes(searchPurchaseQuery.toLowerCase()))
              );

              if (filtered.length === 0) {
                return (
                  <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
                    <p className="text-slate-500 text-sm">Ninguna compra coincide con el criterio de búsqueda.</p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {filtered.map(p => {
                    const dateStr = new Date(p.timestamp).toLocaleString('es-ES', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit', hour12: true
                    });

                    return (
                      <div key={p.id} className="bg-white rounded-2xl border border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md transition-all p-5 flex flex-col md:flex-row gap-5">
                        {/* Left: Invoice Image Preview */}
                        <div className="w-full md:w-1/3 shrink-0">
                          {p.invoicePhoto ? (
                            <div className="relative group rounded-xl overflow-hidden bg-slate-100 border border-slate-200 aspect-[3/4] flex items-center justify-center">
                              <img 
                                src={p.invoicePhoto} 
                                alt="Factura" 
                                className="object-cover w-full h-full"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <a 
                                  href={p.invoicePhoto} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="bg-white text-slate-800 text-xs font-black px-3 py-1.5 rounded-lg shadow-md hover:bg-slate-50 transition-colors"
                                >
                                  Ver Imagen
                                </a>
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-xl border border-dashed border-slate-200 aspect-[3/4] flex flex-col items-center justify-center text-slate-400 bg-slate-50">
                              <FileText size={24} />
                              <span className="text-[10px] uppercase font-bold mt-1.5 font-mono">Sin foto</span>
                            </div>
                          )}
                        </div>

                        {/* Right: Info details & Ingredients */}
                        <div className="flex-1 flex flex-col justify-between">
                          <div>
                            <div className="flex justify-between items-start gap-2">
                              <div>
                                <h4 className="font-extrabold text-slate-900 text-base flex items-center gap-1.5">
                                  <Truck size={16} className="text-orange-500 shrink-0" />
                                  <span className="truncate max-w-[150px]">{p.supplierName}</span>
                                </h4>
                                <span className="text-slate-400 font-mono text-[11px] block mt-0.5">{dateStr}</span>
                              </div>
                              <div className="bg-emerald-50 text-emerald-800 border border-emerald-250 font-mono font-black text-sm px-2.5 py-1 rounded-lg shrink-0">
                                ${p.totalAmount.toFixed(2)}
                              </div>
                            </div>

                            <div className="mt-4">
                              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Detalle de Ingredientes:</span>
                              <div className="mt-1.5 space-y-1 max-h-[140px] overflow-y-auto pr-1">
                                {p.items?.map((item: any, idx: number) => {
                                  const ing = ingredients.find(i => i.id === item.ingredientId);
                                  return (
                                    <div key={idx} className="flex justify-between items-center text-slate-700 bg-slate-50 border border-slate-100 rounded-lg py-1.5 px-2.5 text-xs">
                                      <span className="font-semibold text-slate-800 truncate pr-2 max-w-[120px]">
                                        {ing ? ing.name : item.ingredientName || 'Ingrediente'}
                                      </span>
                                      <div className="font-mono text-slate-500 flex items-center gap-2 shrink-0">
                                        <span>+{item.quantity} {ing?.unit || ''}</span>
                                        <span className="bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                          ${item.cost ? item.cost.toFixed(2) : '0.00'}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          <div className="border-t border-slate-100 pt-3 mt-4 flex justify-between items-center text-xs text-slate-400">
                            <span>Registrado por: <strong className="text-slate-600 font-bold">{p.userName}</strong></span>
                            <span className="font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md text-[10px]">ID: {p.id}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* TAB 3: MOVEMENTS HISTORY */}
      {activeTab === 'movements' && (
        <div className="space-y-4 animate-fade-in">
          {/* Controls bar */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-white p-4 rounded-xl border border-slate-200">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                <Search size={16} />
              </span>
              <input
                type="text"
                value={searchMovementQuery}
                onChange={e => setSearchMovementQuery(e.target.value)}
                placeholder="Buscar por ingrediente o detalles..."
                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none text-xs bg-white"
              />
            </div>
            
            {/* Legend / Info */}
            <p className="text-[11px] text-slate-400 font-semibold md:text-right">
              Mostrando los últimos 150 registros de movimientos del inventario.
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden text-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase text-slate-500 tracking-wider">
                    <th className="p-4 pl-6 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSortMovements('timestamp')}>
                      <div className="flex items-center gap-1">Fecha / Hora <ArrowLeftRight size={12} className="opacity-50" /></div>
                    </th>
                    <th className="p-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSortMovements('ingredientName')}>
                      <div className="flex items-center gap-1">Ingrediente <ArrowLeftRight size={12} className="opacity-50" /></div>
                    </th>
                    <th className="p-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSortMovements('type')}>
                      <div className="flex items-center gap-1">Tipo Mov. <ArrowLeftRight size={12} className="opacity-50" /></div>
                    </th>
                    <th className="p-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSortMovements('quantity')}>
                      <div className="flex items-center gap-1">Cantidad <ArrowLeftRight size={12} className="opacity-50" /></div>
                    </th>
                    <th className="p-4">Stock Cambio</th>
                    <th className="p-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSortMovements('userName')}>
                      <div className="flex items-center gap-1">Usuario <ArrowLeftRight size={12} className="opacity-50" /></div>
                    </th>
                    <th className="p-4 pr-6">Detalle / Nota</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isMovementsLoading ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 font-medium">
                        Cargando historial de movimientos...
                      </td>
                    </tr>
                  ) : sortedMovements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        No hay movimientos que coincidan.
                      </td>
                    </tr>
                  ) : (
                    sortedMovements.map(m => {
                      const dateStr = new Date(m.timestamp).toLocaleString('es-ES', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit', hour12: true
                        });
                        
                        let typeBadge = '';
                        switch (m.type) {
                          case 'entrada':
                            typeBadge = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                            break;
                          case 'salida_plato':
                            typeBadge = 'bg-blue-50 text-blue-750 border-blue-100';
                            break;
                          case 'traslado_bodega_cocina':
                            typeBadge = 'bg-purple-100 text-purple-850 border-purple-200/80';
                            break;
                          case 'desecho':
                            typeBadge = 'bg-amber-50 text-amber-800 border-amber-200';
                            break;
                          default:
                            typeBadge = 'bg-slate-100 text-slate-700 border-slate-200';
                            break;
                        }

                        const isNegative = m.quantity < 0;

                        return (
                          <tr key={m.id} className="hover:bg-slate-50/40 transition-colors font-medium">
                            <td className="p-4 pl-6 text-slate-500 font-mono text-xs whitespace-nowrap">{dateStr}</td>
                            <td className="p-4 font-bold text-slate-800">{m.ingredientName}</td>
                            <td className="p-4">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border capitalize leading-none ${typeBadge}`}>
                                {m.type === 'entrada' && '📥 Entrada'}
                                {m.type === 'salida_plato' && '🍽️ Consumo Plato'}
                                {m.type === 'traslado_bodega_cocina' && '🔄 Bodega ➔ Cocina'}
                                {m.type === 'desecho' && '🗑️ Desecho'}
                                {m.type === 'ajuste' && '🔧 Ajuste'}
                              </span>
                            </td>
                            <td className="p-4">
                              <span className={`font-mono font-bold whitespace-nowrap ${isNegative ? 'text-rose-600' : 'text-emerald-600'}`}>
                                {isNegative ? '' : '+'}{m.quantity}
                              </span>
                            </td>
                            <td className="p-4 text-xs font-mono text-slate-600 whitespace-nowrap">
                              {m.prevStock} ➔ <strong className="text-slate-800 font-bold">{m.newStock}</strong>
                            </td>
                            <td className="p-4 text-slate-600 truncate max-w-[120px]" title={m.userName}>{m.userName}</td>
                            <td className="p-4 pr-6 text-slate-500 text-xs italic truncate max-w-[220px]" title={m.notes}>{m.notes || '-'}</td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD / EDIT INGREDIENT */}
      {isIngredientModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Egg className="text-orange-500" size={20} /> {editingIngredient ? 'Editar Ingrediente' : 'Nuevo Ingrediente'}
              </h3>
              <button onClick={() => setIsIngredientModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveIngredient} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nombre del Ingrediente</label>
                <input 
                  type="text" 
                  required
                  value={newIngredient.name}
                  onChange={e => setNewIngredient({...newIngredient, name: e.target.value})}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none text-sm transition-all shadow-sm"
                  placeholder="Ej. Carne Mechada, Queso Blanco, Harina PAN"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Stock Inicial</label>
                  <input 
                    type="number" 
                    required
                    min="0"
                    step="any"
                    value={newIngredient.stock}
                    onChange={e => setNewIngredient({...newIngredient, stock: e.target.value})}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none text-sm transition-all shadow-sm"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Unidad de Medida</label>
                  <select
                    value={newIngredient.unit}
                    onChange={e => setNewIngredient({...newIngredient, unit: e.target.value})}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none text-sm bg-white transition-all shadow-sm"
                  >
                    <option value="g">Gramos (g)</option>
                    <option value="Kg">Kilogramos (Kg)</option>
                    <option value="unidades">Unidades (unidades)</option>
                    <option value="L">Litros (L)</option>
                    <option value="ml">Mililitros (ml)</option>
                    <option value="oz">Onzas (oz)</option>
                    <option value="porciones">Porciones (porciones)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Alerta de Bajo Stock</label>
                <input 
                  type="number" 
                  required
                  min="0"
                  step="any"
                  value={newIngredient.minStock}
                  onChange={e => setNewIngredient({...newIngredient, minStock: e.target.value})}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none text-sm transition-all shadow-sm mb-3"
                  placeholder="Ej. Cantidad mínima antes de alerta"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Ubicación Física</label>
                <select
                  value={newIngredient.location || 'cocina'}
                  onChange={e => setNewIngredient({...newIngredient, location: e.target.value as any})}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none text-sm bg-white font-bold transition-all shadow-sm"
                >
                  <option value="cocina">🍳 Cocina (Alimentos)</option>
                  <option value="barra">🍹 Barra (Bebidas)</option>
                  <option value="bodega">📦 Bodega (Materia Prima / Almacén Central)</option>
                </select>
              </div>

              <div className="pt-4 flex gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsIngredientModalOpen(false)}
                  className="flex-1 py-3 px-4 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-colors text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 px-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors text-sm"
                >
                  {editingIngredient ? 'Guardar Cambios' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD / EDIT PLATILLO (MENU ITEM) */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Package className="text-orange-500" size={20} /> {editingItem ? 'Editar Platillo' : 'Nuevo Platillo'}
              </h3>
              <button onClick={() => setIsProductModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveProduct} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nombre del Platillo</label>
                <input 
                  type="text" 
                  required
                  value={newItem.name}
                  onChange={e => setNewItem({...newItem, name: e.target.value})}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none text-sm transition-all shadow-sm"
                  placeholder="Ej. Arepa de Queso, Pabellón, Refresco"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Categoría</label>
                <select 
                  required={!showNewCategoryInput}
                  value={showNewCategoryInput ? '__new__' : newItem.category}
                  onChange={e => handleCategoryChange(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none text-sm bg-white transition-all shadow-sm capitalize font-semibold"
                >
                  <option value="">-- Seleccionar Categoría --</option>
                  {Array.from(new Set(['bebida', 'postre', 'paninis', 'pizzas', 'patacones', ...menu.map(item => (item.category || '').toLowerCase().trim()).filter(Boolean)])).map(cat => (
                    <option key={cat} value={cat}>{getCategoryDisplayName(cat)}</option>
                  ))}
                  <option value="__new__" className="text-orange-600 font-bold">+ Crear Nueva Categoría...</option>
                </select>

                {showNewCategoryInput && (
                  <div className="mt-2.5 p-3 bg-orange-50 rounded-xl border border-orange-100 animate-fade-in animate-duration-150">
                    <label className="block text-[10px] font-bold text-orange-700 uppercase tracking-wider mb-1">Nombre de la Nueva Categoría</label>
                    <input
                      type="text"
                      required
                      value={newCategoryName}
                      onChange={e => {
                        setNewCategoryName(e.target.value);
                        setNewItem({...newItem, category: e.target.value.toLowerCase().trim()});
                      }}
                      className="w-full px-4 py-2 border border-orange-200 bg-white rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none text-sm transition-all shadow-sm"
                      placeholder="Ej. Entradas, Especiales"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Precio (USD)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    min="0"
                    required
                    value={newItem.price}
                    onChange={e => setNewItem({...newItem, price: e.target.value})}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none text-sm transition-all shadow-sm"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Stock Fijo (sin Receta)</label>
                  <input 
                    type="number" 
                    min="0"
                    required
                    value={newItem.stock}
                    onChange={e => setNewItem({...newItem, stock: e.target.value})}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none text-sm transition-all shadow-sm"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Additions Section */}
              <div className="border-t border-slate-100 pt-4 mt-4">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Ingredientes Adicionales / Extras (Desde Inventario)</label>
                
                <div className="space-y-2 mb-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Ingrediente</label>
                    <select
                      value={currentAddition.ingredientId}
                      onChange={e => setCurrentAddition({...currentAddition, ingredientId: e.target.value})}
                      className="w-full p-2.5 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-orange-500 outline-none shadow-sm font-semibold text-slate-700"
                    >
                      {renderIngredientOptions()}
                    </select>
                  </div>

                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Cantidad ({ingredients.find(i => i.id === currentAddition.ingredientId)?.unit || 'g'})
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={currentAddition.quantity}
                        onChange={e => setCurrentAddition({...currentAddition, quantity: e.target.value})}
                        className="w-full p-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-orange-500 outline-none shadow-sm font-semibold"
                        placeholder="Ej. 75"
                      />
                    </div>

                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Precio Adicional (USD)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={currentAddition.price}
                        onChange={e => setCurrentAddition({...currentAddition, price: e.target.value})}
                        className="w-full p-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-orange-500 outline-none shadow-sm font-semibold"
                        placeholder="Ej. 1.50"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleAddAddition}
                      className="bg-orange-500 text-white h-[34px] px-4 rounded-lg hover:bg-orange-600 transition-colors text-xs font-bold shrink-0 border-0 cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Plus size={14} /> Agregar
                    </button>
                  </div>
                </div>
                
                {newAdditions.length > 0 && (
                  <ul className="space-y-1.5 max-h-36 overflow-y-auto bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                    {newAdditions.map((addition, index) => {
                      const ingObj = ingredients.find(i => i.id === addition.ingredientId);
                      const unitStr = ingObj ? ingObj.unit : 'g';
                      return (
                        <li key={index} className="flex justify-between items-center bg-white py-1.5 px-2.5 rounded-lg border border-slate-150">
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-slate-700">{addition.name}</span>
                            <span className="text-[10px] text-slate-400 font-bold">
                              Consumo: {addition.quantity || 0} {unitStr}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-orange-600 font-black">${addition.price.toFixed(2)}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveAddition(index)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="pt-4 flex gap-3 border-t border-slate-150">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="flex-1 py-3 px-4 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-colors text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 px-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors text-sm"
                >
                  Guardar Platillo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: RECIPE MANAGER (FORMULA CONFIG) */}
      {isRecipeModalOpen && recipeMenuItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="text-lg font-black text-slate-900 leading-tight">Configurar Receta</h3>
                <p className="text-xs text-slate-500 mt-1 font-medium">Asigna la fórmula de preparación para: <strong>{recipeMenuItem.name}</strong></p>
              </div>
              <button onClick={() => { setIsRecipeModalOpen(false); setRecipeMenuItem(null); }} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Form to add ingredient to formula */}
              <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/50 space-y-3">
                <h4 className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">Agregar componente a la receta</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-1.5">
                    <select
                      value={selectedIngredientId}
                      onChange={e => setSelectedIngredientId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs outline-none bg-white font-medium"
                    >
                      {renderIngredientOptions(ing => !recipeItems.some(ri => ri.ingredientId === ing.id))}
                    </select>
                  </div>
                  <div>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      value={selectedIngredientQty}
                      onChange={e => setSelectedIngredientQty(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs outline-none"
                      placeholder="Cantidad requerida"
                    />
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={handleAddRecipeIngredient}
                      className="w-full bg-orange-500 text-white font-bold text-xs px-4 py-2.5 rounded-lg hover:bg-orange-600 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Plus size={14} /> Añadir
                    </button>
                  </div>
                </div>
              </div>

              {/* Recipe Ingredients list */}
              <div>
                <h4 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2.5">Ingredientes Añadidos en Receta</h4>
                {recipeItems.length === 0 ? (
                  <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-medium">
                    Sin ingredientes establecidos. Este platillo se gestionará por stock tradicional del plato hasta que configures una receta.
                  </div>
                ) : (
                  <div className="border border-slate-150 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-150 text-slate-500 font-bold">
                          <th className="p-3">Ingrediente</th>
                          <th className="p-3">Cantidad Requerida</th>
                          <th className="p-3 text-right"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {recipeItems.map((recipeItem, index) => {
                          const ing = ingredients.find(i => i.id === recipeItem.ingredientId);
                          return (
                            <tr key={index} className="hover:bg-slate-50/50">
                              <td className="p-3 font-bold text-slate-800">
                                {ing ? ing.name : <span className="text-red-500">Ingrediente No Encontrado</span>}
                              </td>
                              <td className="p-3 font-mono text-slate-700 font-medium">
                                {recipeItem.quantity} <span className="text-slate-400 font-sans">{ing ? ing.unit : ''}</span>
                              </td>
                              <td className="p-3 text-right pr-4">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveRecipeIngredient(index)}
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                type="button"
                onClick={() => { setIsRecipeModalOpen(false); setRecipeMenuItem(null); }}
                className="flex-1 py-2.5 px-4 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-colors text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveRecipe}
                className="flex-1 py-2.5 px-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors text-xs shadow-md"
              >
                Guardar Receta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: CATEGORY MANAGER (EDIT/DELETE CATEGORIES) */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col animate-fade-in animate-duration-200">
            <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="text-base font-black text-slate-900 leading-tight flex items-center gap-2">
                  <Tags className="text-orange-500" size={18} /> Gestionar Categorías
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Edita o elimina las categorías del menú de comida.</p>
              </div>
              <button 
                onClick={() => { setIsCategoryModalOpen(false); setEditingCategory(null); }} 
                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="space-y-2">
                {Array.from(new Set([
                  'bebida', 'postre', 'paninis', 'pizzas', 'patacones',
                  ...menu.map(item => (item.category || '').toLowerCase().trim()).filter(Boolean)
                ])).map((cat) => {
                  const isEditing = editingCategory === cat;
                  const associateCount = menu.filter(item => (item.category || '').toLowerCase().trim() === cat.toLowerCase().trim()).length;
                  
                  return (
                    <div 
                      key={cat} 
                      className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100/50 transition-all gap-3"
                    >
                      {isEditing ? (
                        <div className="flex-1 flex gap-1.5 items-center">
                          <input
                            type="text"
                            value={categoryInputName}
                            onChange={e => setCategoryInputName(e.target.value)}
                            className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none bg-white"
                            placeholder="Nombre categoría"
                            autoFocus
                          />
                          <button
                            onClick={() => handleRenameCategory(cat, categoryInputName)}
                            className="bg-emerald-50 text-emerald-600 p-2 rounded-lg hover:bg-emerald-100 transition-colors border-0 cursor-pointer"
                            title="Guardar"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => { setEditingCategory(null); setCategoryInputName(''); }}
                            className="bg-slate-200 text-slate-600 p-2 rounded-lg hover:bg-slate-300 transition-all border-0 cursor-pointer"
                            title="Cancelar"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-black text-slate-800 capitalize truncate block">
                              {getCategoryDisplayName(cat)}
                            </span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase">
                              {associateCount} platillo{associateCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => {
                                setEditingCategory(cat);
                                setCategoryInputName(cat);
                              }}
                              className="text-slate-500 hover:text-slate-800 hover:bg-white p-2 rounded-lg border border-transparent hover:border-slate-200 transition-all cursor-pointer"
                              title="Editar"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteCategory(cat)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-all cursor-pointer border-0 animate-fade-in"
                              title="Eliminar"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="p-3.5 bg-orange-50 rounded-xl border border-orange-100 text-[11px] text-orange-850 font-medium space-y-1">
                <p className="font-bold text-orange-900 text-xs">ℹ️ Notas importantes</p>
                <p>• Al **renombrar**, todos los platillos asociados se actualizarán automáticamente en la base de datos.</p>
                <p>• Al **eliminar**, la categoría se quitará de los platillos. El inventario conservará los platillos, pero figurarán sin categoría asignada.</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => { setIsCategoryModalOpen(false); setEditingCategory(null); }}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-colors text-xs border-0 cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: ADJUSTMENT MODAL (DESECHO & TRASLADO) */}
      {isAdjustmentModalOpen && selectedAdjustmentIng && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden max-h-[90vh] flex flex-col animate-fade-in animate-duration-200">
            <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/70">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-1.5 leading-tight">
                {adjustmentType === 'desecho' ? (
                  <>
                    <Flame className="text-red-500 animate-pulse animate-duration-1000" size={18} /> Registrar Desecho
                  </>
                ) : (
                  <>
                    <ArrowLeftRight className="text-purple-650" size={18} /> Bodega ➔ Cocina
                  </>
                )}
              </h3>
              <button onClick={() => setIsAdjustmentModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleSaveAdjustment} className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="p-3 bg-slate-100/50 border border-slate-200 rounded-xl space-y-1 text-xs">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Materia prima elegida</p>
                <div className="flex justify-between items-center mr-1">
                  <span className="font-extrabold text-slate-800">{selectedAdjustmentIng.name}</span>
                  <span className="bg-slate-200 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded">
                    Stock: {selectedAdjustmentIng.stock} {selectedAdjustmentIng.unit}
                  </span>
                </div>
              </div>

              {adjustmentType === 'traslado_bodega_cocina' && (
                <div className="space-y-3">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Modo de Traslado</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTransferMode('manual')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                        transferMode === 'manual'
                          ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-650 hover:bg-slate-50'
                      }`}
                    >
                      Manual ✏️
                    </button>
                    <button
                      type="button"
                      onClick={() => setTransferMode('recipe')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                        transferMode === 'recipe'
                          ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-650 hover:bg-slate-50'
                      }`}
                    >
                      Por Receta 🍽️
                    </button>
                  </div>
                </div>
              )}

              {/* Mode 1: Manual */}
              {((adjustmentType === 'desecho') || (adjustmentType === 'traslado_bodega_cocina' && transferMode === 'manual')) && (
                <div className="space-y-4 animate-fade-in">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Cantidad a {adjustmentType === 'desecho' ? 'desechar / consumir' : 'destapar'}</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        required={adjustmentType === 'desecho' || transferMode === 'manual'}
                        min="0.001"
                        step="any"
                        value={adjustmentQty}
                        onChange={e => setAdjustmentQty(e.target.value)}
                        className="w-full pl-4 pr-16 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none text-base font-bold transition-all shadow-sm"
                        placeholder="0.00"
                        autoFocus
                      />
                      <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-slate-400 text-[11px] font-bold">
                        {selectedAdjustmentIng.unit}
                      </div>
                    </div>
                  </div>

                  {adjustmentType === 'traslado_bodega_cocina' && (
                    <div className="grid grid-cols-2 gap-3 border border-slate-100 p-3 rounded-xl bg-slate-50">
                      <div className="col-span-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Producción Manual (Opcional)</div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Cant. Salida</label>
                        <input
                          type="number"
                          value={manualOutputQty}
                          onChange={e => setManualOutputQty(e.target.value)}
                          placeholder="Ej: 10"
                          className="w-full px-2.5 py-1.5 border border-slate-300 bg-white rounded-lg text-xs outline-none focus:ring-1 focus:ring-orange-500 font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Producto/Label</label>
                        <input
                          type="text"
                          value={manualOutputLabel}
                          onChange={e => setManualOutputLabel(e.target.value)}
                          placeholder="Ej: Masas pizza"
                          className="w-full px-2.5 py-1.5 border border-slate-300 bg-white rounded-lg text-xs outline-none focus:ring-1 focus:ring-orange-500 font-semibold"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Mode 2: Por Receta */}
              {adjustmentType === 'traslado_bodega_cocina' && transferMode === 'recipe' && (
                <div className="space-y-3.5 animate-fade-in">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Seleccionar Plato del Menú</label>
                    <select
                      value={recipeProductId}
                      onChange={e => {
                        setRecipeProductId(e.target.value);
                      }}
                      required={transferMode === 'recipe'}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none text-xs transition-all shadow-sm font-medium cursor-pointer"
                    >
                      <option value="">-- Seleccionar Plato --</option>
                      {menu
                        .filter(item => item.recipe?.some(r => r.ingredientId === selectedAdjustmentIng.id))
                        .map(item => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                    {menu.filter(item => item.recipe?.some(r => r.ingredientId === selectedAdjustmentIng.id)).length === 0 && (
                      <p className="text-[10px] text-rose-500 font-semibold mt-1">
                        ⚠️ Ningún platillo contiene este ingrediente en su receta.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Raciones/Porciones a Producir</label>
                    <input
                      type="number"
                      required={transferMode === 'recipe'}
                      min="1"
                      value={recipePortions}
                      onChange={e => setRecipePortions(e.target.value)}
                      placeholder="Ej. 5"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none text-xs transition-all shadow-sm font-bold"
                    />
                  </div>

                  {/* Calculated Preview */}
                  {(() => {
                    const menuItem = menu.find(m => m.id === recipeProductId);
                    const recipeItem = menuItem?.recipe?.find(r => r.ingredientId === selectedAdjustmentIng.id);
                    const portionsNum = Number(recipePortions);
                    if (recipeItem && !isNaN(portionsNum) && portionsNum > 0) {
                      const computedVal = Number((recipeItem.quantity * portionsNum).toFixed(3));
                      return (
                        <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl text-purple-950 text-xs font-semibold space-y-1">
                          <p className="text-purple-800 text-[10px] uppercase font-bold tracking-wider">Cálculo de Receta</p>
                          <p>• Cantidad por ración: {recipeItem.quantity} {selectedAdjustmentIng.unit}</p>
                          <p>• Raciones a preparar: {portionsNum}</p>
                          <p className="text-sm font-black border-t border-purple-200/55 pt-1 mt-1 text-purple-750">
                            Total a deducir: {computedVal} {selectedAdjustmentIng.unit}
                          </p>
                          {computedVal > selectedAdjustmentIng.stock && (
                            <p className="text-red-650 text-[10px] font-black mt-1 uppercase animate-pulse">
                              ⚠️ ¡Stock insuficiente en Bodega! (Disponibles: {selectedAdjustmentIng.stock} {selectedAdjustmentIng.unit})
                            </p>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}

              {adjustmentType === 'traslado_bodega_cocina' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Stock a incrementar en Cocina / Barra</label>
                  <select
                    value={targetIngredientId}
                    onChange={e => setTargetIngredientId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none text-xs transition-all shadow-sm font-medium cursor-pointer"
                  >
                     {renderIngredientOptions(ing => (ing.location || 'cocina') !== 'bodega')}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  {adjustmentType === 'desecho' ? 'Motivo de salida (Obligatorio)' : 'Detalle del traslado'}
                </label>
                <textarea
                  value={adjustmentNotes}
                  onChange={e => setAdjustmentNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none text-xs transition-all shadow-sm h-20 resize-none font-medium"
                  placeholder={adjustmentType === 'desecho' ? 'Ej. Producto marchito tomado para comida de empleados' : 'Ej. Se destapa nueva porción para uso activo'}
                  required={adjustmentType === 'desecho'}
                />
              </div>

              <div className="pt-3.5 flex gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAdjustmentModalOpen(false)}
                  className="flex-1 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold hover:bg-slate-50 transition-colors text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`flex-1 py-2 text-white rounded-lg font-bold transition-colors text-xs shadow-sm cursor-pointer ${
                    adjustmentType === 'desecho' 
                      ? 'bg-rose-500 hover:bg-rose-600' 
                      : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  Confirmar {adjustmentType === 'desecho' ? 'Salida' : 'Traslado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOM CONFIRMATION DIALOG (FOR DELETION ACTIONS) */}
      {deleteConfirm.open && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in animate-duration-150">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/70">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5 leading-tight">
                <AlertTriangle className="text-amber-500 animate-pulse" size={18} /> Confirmar Eliminación
              </h3>
              <button 
                onClick={() => setDeleteConfirm({ open: false, type: 'ingredient', id: '', name: '', msg: '' })} 
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                {deleteConfirm.msg}
              </p>

              {/* Security passcode verification for product (dish) deletion */}
              {deleteConfirm.type === 'product' && (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
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
                          executeDelete();
                        }
                      }}
                      placeholder="Ingrese la clave..."
                      className={`w-full px-4 py-2.5 bg-slate-50 border outline-none rounded-xl focus:bg-white text-slate-800 font-mono tracking-widest text-center text-sm transition-all ${
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
                      {showPasscode ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {passcodeError && (
                    <p className="text-[10px] text-red-500 font-semibold flex items-center gap-1">
                      <AlertCircle size={12} />
                      Clave inválida. Verifique e intente nuevamente.
                    </p>
                  )}
                </div>
              )}

              <div className="pt-3.5 flex gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm({ open: false, type: 'ingredient', id: '', name: '', msg: '' })}
                  className="flex-1 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg font-bold hover:bg-slate-50 transition-colors text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={executeDelete}
                  className="flex-1 py-2 bg-rose-500 text-white rounded-lg font-bold hover:bg-rose-600 transition-colors text-xs shadow-sm cursor-pointer"
                >
                  Sí, Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: REGISTRAR COMPRA (PURCHASE ENTRY) */}
      {isPurchaseModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col animate-fade-in animate-duration-200">
            <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="text-base font-black text-slate-900 leading-tight flex items-center gap-2">
                  <ShoppingBag className="text-orange-500" size={18} /> Registrar Nueva Compra
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Ingresa los datos de la factura para sumar existencias de forma masiva.</p>
              </div>
              <button 
                onClick={() => {
                  setIsPurchaseModalOpen(false);
                  setSupplierName('');
                  setTotalAmount('');
                  setInvoicePhoto('');
                  setPurchaseItems([]);
                  setCurrentPurchaseItem({ ingredientId: '', quantity: '', cost: '' });
                }} 
                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleSavePurchase} className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Supplier Name */}
                <div className="relative z-10">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Nombre del Proveedor</label>
                  <input 
                    type="text" 
                    required
                    value={supplierName}
                    onChange={e => setSupplierName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none text-xs transition-all shadow-sm font-semibold"
                    placeholder="Escribe o selecciona..."
                    onFocus={() => {
                        const drp = document.getElementById('supplier-dropdown');
                        if (drp) drp.style.display = 'block';
                    }}
                    onBlur={() => {
                        setTimeout(() => {
                            const drp = document.getElementById('supplier-dropdown');
                            if (drp) drp.style.display = 'none';
                        }, 200);
                    }}
                  />
                  {suppliers.length > 0 && (
                      <div id="supplier-dropdown" className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 shadow-xl rounded-xl max-h-48 overflow-y-auto hidden">
                        {suppliers.filter(s => s.name.toLowerCase().includes(supplierName.toLowerCase()) || !supplierName).map(s => (
                          <div 
                             key={s.id} 
                             className="px-4 py-2 text-sm text-slate-700 hover:bg-orange-50 cursor-pointer font-medium border-b border-slate-50 last:border-0"
                             onMouseDown={(e) => {
                                 e.preventDefault(); // Prevent blur
                                 setSupplierName(s.name);
                                 const drp = document.getElementById('supplier-dropdown');
                                 if (drp) drp.style.display = 'none';
                             }}
                          >
                             {s.name}
                          </div>
                        ))}
                      </div>
                  )}
                </div>

                {/* Invoice Total Amount */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Monto Total de la Factura ($)</label>
                  <input 
                    type="number" 
                    required
                    step="any"
                    min="0.01"
                    value={totalAmount}
                    onChange={e => setTotalAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none text-xs transition-all shadow-sm font-mono font-bold"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Detail Items Addition Form */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
                <p className="text-[10px] font-mono font-black uppercase text-slate-400 tracking-wider">Detalle del Ingreso de Existencias:</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  {/* Select Ingredient */}
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Materia Prima</label>
                    <select
                      value={currentPurchaseItem.ingredientId}
                      onChange={e => {
                        const ingId = e.target.value;
                        setCurrentPurchaseItem({
                          ...currentPurchaseItem,
                          ingredientId: ingId
                        });
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none bg-white font-semibold"
                    >
                      {renderIngredientOptions()}
                    </select>
                  </div>

                  {/* Quantity */}
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Cantidad a Ingresar</label>
                    <input 
                      type="number"
                      step="any"
                      min="0.001"
                      placeholder="Ej. 1000"
                      value={currentPurchaseItem.quantity}
                      onChange={e => setCurrentPurchaseItem({ ...currentPurchaseItem, quantity: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none font-semibold"
                    />
                  </div>

                  {/* Item Cost */}
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Costo Unitario ($)</label>
                    <div className="flex gap-2">
                      <input 
                        type="number"
                        step="any"
                        min="0"
                        placeholder="Ej. 1.50"
                        value={currentPurchaseItem.cost}
                        onChange={e => setCurrentPurchaseItem({ ...currentPurchaseItem, cost: e.target.value })}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none font-semibold"
                      />
                      <button 
                        type="button"
                        onClick={addPurchaseItem}
                        className="bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer border-0 shrink-0"
                      >
                        Añadir
                      </button>
                    </div>
                  </div>
                </div>

                {/* Items Added Table */}
                {purchaseItems.length > 0 ? (
                  <div className="border border-slate-200 rounded-lg overflow-hidden bg-white text-xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-200 text-[10px] uppercase text-slate-500 font-bold">
                          <th className="p-2 pl-3">Nombre</th>
                          <th className="p-2">Ubicación</th>
                          <th className="p-2">Cantidad</th>
                          <th className="p-2">Costo Total ($)</th>
                          <th className="p-2 pr-3 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {purchaseItems.map((item, index) => {
                          const ing = ingredients.find(i => i.id === item.ingredientId);
                          return (
                            <tr key={index} className="hover:bg-slate-50/50">
                              <td className="p-2 pl-3 font-semibold text-slate-800">{ing ? ing.name : 'N/A'}</td>
                              <td className="p-2 text-slate-500 text-[10px] capitalize font-semibold">{ing?.location || 'cocina'}</td>
                              <td className="p-2 font-mono text-slate-700 font-semibold text-[11px]">{item.quantity} {ing?.unit}</td>
                              <td className="p-2 font-mono text-slate-900 font-bold text-[11px]">${item.cost.toFixed(2)}</td>
                              <td className="p-2 text-right pr-3">
                                <button
                                  type="button"
                                  onClick={() => removePurchaseItem(index)}
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded-lg transition-colors cursor-pointer border-0"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center p-3 text-slate-400 text-xs italic bg-white rounded-lg border border-slate-200">
                    Ningún ingrediente añadido a esta factura todavía.
                  </div>
                )}
              </div>

              {/* Warning or Total Summary Check */}
              {purchaseItems.length > 0 && (() => {
                const calculatedTotal = purchaseItems.reduce((acc, curr) => acc + curr.cost, 0);
                const typedTotal = parseFloat(totalAmount) || 0;
                const diff = calculatedTotal - typedTotal;
                
                if (Math.abs(diff) > 0.01) {
                  return (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800 font-semibold">
                      ⚠️ El monto sumado de los ítems (${calculatedTotal.toFixed(2)}) no coincide exactamente con el monto total de la factura (${typedTotal.toFixed(2)}).
                    </div>
                  );
                }
                return null;
              })()}

              <div className="pt-3.5 flex gap-2 border-t border-slate-100 flex-col sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setIsPurchaseModalOpen(false);
                    setSupplierName('');
                    setTotalAmount('');
                    setInvoicePhoto('');
                    setPurchaseItems([]);
                    setCurrentPurchaseItem({ ingredientId: '', quantity: '', cost: '' });
                  }}
                  className="flex-grow py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-grow py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors text-xs shadow-md cursor-pointer border-0"
                >
                  Registrar e Ingresar al Inventario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
