import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, onSnapshot, setDoc, updateDoc, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import POS from './components/POS';
import Kitchen from './components/Kitchen';
import Barra from './components/Barra';
import Inventory from './components/Inventory';
import Finances from './components/Finances';
import Login from './components/Login';
import { INITIAL_MENU, INITIAL_TABLES } from './data';
import { Order, OrderItem, User, MenuItem, Table, Ingredient, DailyExpense } from './types';
import { playKitchenBell, playWaiterBell } from './utils/audio';

import { Toaster, toast } from 'sonner';
import { Lock, LogOut } from 'lucide-react';
import AdminUsers from './components/AdminUsers';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);
  const [blockedEmail, setBlockedEmail] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [registerSettings, setRegisterSettings] = useState<any>(null);

  const prevOrdersRef = useRef<Order[]>();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setIsLoadingSheet(true);
        try {
          const userEmail = (firebaseUser.email || '').toLowerCase().trim();
          
          // 1. Intentar cargar el documento del usuario por ID de correo
          const userDocRef = doc(db, 'users', userEmail);
          const userDoc = await getDoc(userDocRef);
          
          // 2. Intentar cargar el documento por ID de uid (compatibilidad heredada)
          const fallbackDocRef = doc(db, 'users', firebaseUser.uid);
          const fallbackDoc = await getDoc(fallbackDocRef);
          
          const foundDoc = userDoc.exists() ? userDoc : (fallbackDoc.exists() ? fallbackDoc : null);
          
          let role: 'admin' | 'waiter' | 'chef' = 'waiter';
          let displayName = firebaseUser.displayName || 'Usuario';
          let isAuthorized = false;
          let finalUserData: User;

          if (foundDoc) {
            const data = foundDoc.data();
            role = data.role;
            displayName = data.name || displayName;
            isAuthorized = true;
            
            finalUserData = {
              id: firebaseUser.uid,
              name: displayName,
              role: role,
              pin: data.pin || '0000'
            };

            // Sincronizar el UID en el documento de Firestore si no está guardado aún
            if (data.uid !== firebaseUser.uid) {
              await updateDoc(foundDoc.ref, { uid: firebaseUser.uid });
            }

            // Asegurar que también existe el documento duplicado con ID de UID para robustez en reglas de seguridad
            const uidDocRef = doc(db, 'users', firebaseUser.uid);
            await setDoc(uidDocRef, {
              name: displayName,
              email: userEmail,
              role: role,
              uid: firebaseUser.uid,
              pin: data.pin || '0000',
              createdAt: data.createdAt || Date.now()
            }, { merge: true });
          } else {
            // Verificar si es uno de los administradores hardcodeados para autoprovisionar
            const isBootstrappedAdmin = 
              userEmail === 'davilacamacho@gmail.com' || 
              userEmail === 'veronicaarcaya2015@gmail.com' || 
              userEmail === 'equisrafael@gmail.com' ||
              userEmail === 'elvalerasmoke@gmail.com';
            
            if (isBootstrappedAdmin) {
              role = 'admin';
              isAuthorized = true;
              
              // Crear su registro directamente en Firestore para no tener problemas de permisos (ID correo)
              const newAdminDocRef = doc(db, 'users', userEmail);
              await setDoc(newAdminDocRef, {
                name: displayName,
                email: userEmail,
                role: 'admin',
                uid: firebaseUser.uid,
                createdAt: Date.now()
              });

              // Crear su registro duplicado directamente con ID de UID
              const newAdminUidRef = doc(db, 'users', firebaseUser.uid);
              await setDoc(newAdminUidRef, {
                name: displayName,
                email: userEmail,
                role: 'admin',
                uid: firebaseUser.uid,
                createdAt: Date.now()
              });

              finalUserData = {
                id: firebaseUser.uid,
                name: displayName,
                role: 'admin',
                pin: '0000'
              };
            } else {
              isAuthorized = false;
            }
          }

          if (!isAuthorized) {
            setBlockedEmail(userEmail);
            setCurrentUser(null);
            setIsLoadingSheet(false);
            return;
          }

          setBlockedEmail('');
          setCurrentUser(finalUserData!);
          if (finalUserData!.role === 'admin') setActiveTab('dashboard');
          else if (finalUserData!.role === 'waiter') setActiveTab('pos');
          else if (finalUserData!.role === 'chef') setActiveTab('kitchen');
          else if (finalUserData!.role === 'bartender') setActiveTab('barra');
          
          // Inicializar datos del menú si está vacío (Bootstrap)
          if (finalUserData!.role === 'admin') {
            const menuSnapshot = await getDocs(collection(db, 'menuItems'));
            if (menuSnapshot.empty) {
              const batch = writeBatch(db);
              INITIAL_MENU.forEach(item => {
                const ref = doc(db, 'menuItems', item.id);
                batch.set(ref, { name: item.name, category: item.category, price: item.price, stock: item.stock });
              });
              INITIAL_TABLES.forEach(table => {
                const ref = doc(db, 'tables', table.id);
                batch.set(ref, { number: table.number, status: table.status });
              });
              await batch.commit();
            }
          }
          
        } catch (error) {
          console.error("Error fetching user data:", error);
          toast.error("Error al sincronizar permisos y base de datos.");
        } finally {
          setIsLoadingSheet(false);
        }
      } else {
        setCurrentUser(null);
        setBlockedEmail('');
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !currentUser) return;

    const unsubMenu = onSnapshot(collection(db, 'menuItems'), (snapshot) => {
      setMenu(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'menuItems'));

    const unsubIngredients = onSnapshot(collection(db, 'ingredients'), (snapshot) => {
      setIngredients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ingredient)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'ingredients'));

    const unsubTables = onSnapshot(collection(db, 'tables'), (snapshot) => {
      setTables(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Table)).sort((a,b) => {
        const numA = Number(a.number);
        const numB = Number(b.number);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        if (!isNaN(numA)) return -1;
        if (!isNaN(numB)) return 1;
        return String(a.number).localeCompare(String(b.number));
      }));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'tables'));

    const unsubOrders = onSnapshot(collection(db, 'orders'), (snapshot) => {
      setOrders(snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          items: data.items.map((i: string) => JSON.parse(i))
        } as Order;
      }).sort((a,b) => b.timestamp - a.timestamp));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'orders'));

    const unsubRegister = onSnapshot(doc(db, 'settings', 'register'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setRegisterSettings(data);
      } else {
        setRegisterSettings(null); // Defecto: cerrado si no existe el doc
      }
    }, (error) => console.log('Error loading register state:', error));

    return () => {
      unsubMenu();
      unsubIngredients();
      unsubTables();
      unsubOrders();
      unsubRegister();
    };
  }, [isAuthReady, currentUser]);

  useEffect(() => {
    if (!isAuthReady || !currentUser) return;

    if (!prevOrdersRef.current) {
      prevOrdersRef.current = orders;
      return;
    }

    let shouldPlayKitchen = false;
    let shouldPlayWaiter = false;

    orders.forEach(order => {
      const prevOrder = prevOrdersRef.current!.find(p => p.id === order.id);

      // New order sent to kitchen
      if (!prevOrder && order.status === 'pending') {
        const isRecent = (Date.now() - order.timestamp) < 10000; // within 10 seconds
        if (isRecent) shouldPlayKitchen = true;
      }

      // Existing order marked as ready
      if (prevOrder && prevOrder.status !== 'ready' && order.status === 'ready') {
        shouldPlayWaiter = true;
      }
    });

    if (shouldPlayKitchen && ['admin', 'chef'].includes(currentUser.role)) {
      playKitchenBell();
    }

    if (shouldPlayWaiter && ['admin', 'waiter'].includes(currentUser.role)) {
      playWaiterBell();
    }

    prevOrdersRef.current = orders;
  }, [orders, currentUser, isAuthReady]);

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handlePlaceOrder = async (tableId: string, items: OrderItem[], total: number) => {
    const isDrinkCategory = (category: string) => {
      const c = category.toLowerCase();
      return c.includes('bebida') || c.includes('jugo') || c.includes('refresco') || c.includes('cerveza') || c.includes('cafe') || c.includes('café') || c.includes('licor') || c.includes('trago') || c.includes('vino') || c.includes('coctel') || c.includes('cóctel');
    };

    const foodItems = items.filter(i => !isDrinkCategory(i.menuItem.category));
    const drinkItems = items.filter(i => isDrinkCategory(i.menuItem.category));

    const createOrderDoc = async (orderItems: OrderItem[], type: 'food' | 'drink') => {
      if (orderItems.length === 0) return;
      const orderId = Math.random().toString(36).substr(2, 9);
      const orderRef = doc(db, 'orders', orderId);
      const orderTotal = orderItems.reduce((sum, item) => sum + ((item.menuItem.price + (item.extraPrice || 0)) * item.quantity), 0);
      
      await setDoc(orderRef, {
        tableId,
        items: orderItems.map(item => JSON.stringify(item)),
        status: 'pending',
        type,
        total: orderTotal,
        timestamp: Date.now(),
        businessDate: registerSettings?.openedAt || Date.now(),
        waiterId: currentUser?.id,
        waiterName: currentUser?.name
      });
    };

    try {
      if (foodItems.length > 0) {
        await createOrderDoc(foodItems, 'food');
      }
      if (drinkItems.length > 0) {
        await createOrderDoc(drinkItems, 'drink');
      }

      const batch = writeBatch(db);
      items.forEach(orderItem => {
        const menuItem = menu.find(m => m.id === orderItem.menuItem.id);
        if (menuItem) {
          if (menuItem.recipe && menuItem.recipe.length > 0) {
            // Deduct recipe ingredients
            menuItem.recipe.forEach(recipeItem => {
              const ing = ingredients.find(i => i.id === recipeItem.ingredientId);
              if (ing) {
                const ingRef = doc(db, 'ingredients', ing.id);
                const deduction = recipeItem.quantity * orderItem.quantity;
                const newStock = Math.max(0, ing.stock - deduction);
                
                batch.update(ingRef, { stock: newStock });

                // Log movement
                const movRef = doc(collection(db, 'inventoryMovements'));
                batch.set(movRef, {
                  id: movRef.id,
                  ingredientId: ing.id,
                  ingredientName: ing.name,
                  quantity: -deduction,
                  type: 'salida_plato',
                  prevStock: ing.stock,
                  newStock: newStock,
                  timestamp: Date.now(),
                  userName: currentUser?.name || 'Sistema',
                  notes: `Consumo plato: ${menuItem.name} (x${orderItem.quantity})`
                });
              }
            });
          } else {
            // Fallback to simple menu stock
            const ref = doc(db, 'menuItems', menuItem.id);
            batch.update(ref, { stock: Math.max(0, menuItem.stock - orderItem.quantity) });
          }

          // Deduct selected additions
          if (orderItem.selectedAdditions && orderItem.selectedAdditions.length > 0) {
            orderItem.selectedAdditions.forEach(addition => {
              if (addition.ingredientId) {
                const ing = ingredients.find(i => i.id === addition.ingredientId);
                if (ing) {
                  const ingRef = doc(db, 'ingredients', ing.id);
                  const deduction = orderItem.quantity * (addition.quantity || 1);
                  const newStock = Math.max(0, ing.stock - deduction);

                  batch.update(ingRef, { stock: newStock });

                  // Log movement
                  const movRef = doc(collection(db, 'inventoryMovements'));
                  batch.set(movRef, {
                    id: movRef.id,
                    ingredientId: ing.id,
                    ingredientName: ing.name,
                    quantity: -deduction,
                    type: 'salida_plato',
                    prevStock: ing.stock,
                    newStock: newStock,
                    timestamp: Date.now(),
                    userName: currentUser?.name || 'Sistema',
                    notes: `Adicional: ${addition.name} (x${orderItem.quantity})`
                  });
                }
              }
            });
          }
        }
      });
      await batch.commit();
      
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'orders');
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: Order['status']) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const updateData: any = { status: newStatus };
      if (newStatus === 'preparing') {
        updateData.preparingTimestamp = Date.now();
      } else if (newStatus === 'ready') {
        updateData.readyTimestamp = Date.now();
      }
      await updateDoc(orderRef, updateData);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const handleCloseTable = async (
    tableId: string, 
    paymentMethod: string, 
    referenceNumber?: string,
    customerName?: string,
    customerAddress?: string,
    customerID?: string,
    customerPhone?: string,
    isDelivery?: boolean,
    deliveryCost?: number
  ) => {
    try {
      const activeTableOrders = orders.filter(o => o.tableId === tableId && o.status !== 'paid');
      const batch = writeBatch(db);
      
      activeTableOrders.forEach(order => {
        const ref = doc(db, 'orders', order.id);
        const updateData: any = { 
          status: 'paid', 
          paymentMethod,
          customerName: customerName || '',
          customerAddress: customerAddress || '',
          customerID: customerID || '',
          customerPhone: customerPhone || '',
          isDelivery: isDelivery || false,
          deliveryCost: deliveryCost || 0
        };
        if (referenceNumber) {
          updateData.referenceNumber = referenceNumber;
        }
        batch.update(ref, updateData);
      });
      
      await batch.commit();

      // Register delivery expense if applicable
      if (isDelivery && deliveryCost && deliveryCost > 0) {
        const expenseId = Math.random().toString(36).substr(2, 9);
        const businessDate = registerSettings?.openedAt || Date.now();
        await setDoc(doc(db, 'dailyExpenses', expenseId), {
          id: expenseId,
          type: 'delivery',
          amount: deliveryCost,
          description: `Delivery Mesa ${tableId.replace('t', '')}`,
          timestamp: Date.now(),
          businessDate: businessDate,
          userName: currentUser?.name || 'Sistema',
          orderId: activeTableOrders[0]?.id || ''
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'orders');
    }
  };

  if (!isAuthReady || isLoadingSheet) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
        {isLoadingSheet && <p className="text-orange-400 font-medium text-sm">Validando accesos con la Base de Datos...</p>}
      </div>
    );
  }

  if (blockedEmail) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-red-500 p-8 text-center text-white">
            <div className="w-16 h-16 bg-white/15 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
              <Lock size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Acceso Restringido</h1>
            <p className="text-red-100 mt-2 text-sm">Este sistema está limitado al personal autorizado.</p>
          </div>
          
          <div className="p-8 space-y-6">
            <div className="bg-slate-50 p-4 border border-slate-100 rounded-xl">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Correo Detectado</p>
              <p className="text-sm font-mono font-bold text-slate-800 break-all">{blockedEmail}</p>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed text-center">
              Tu dirección de correo no está registrada en la base de datos de personal. Solicita al administrador del restaurante que te autorice y registre en el panel de **Administración**.
            </p>

            <div className="flex flex-col gap-3 pt-2">
              <button
                onClick={handleLogout}
                className="w-full flex justify-center items-center gap-2 py-2.5 px-4 bg-slate-900 hover:bg-slate-950 text-white rounded-xl text-sm font-bold transition-all shadow-md animate-pulse"
              >
                <LogOut size={16} />
                Intentar con otra cuenta
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login />;
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-100 overflow-hidden font-sans">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        currentUser={currentUser}
        onLogout={handleLogout}
      />
      
      <main className={`flex-1 font-sans min-h-0 pt-16 lg:pt-0 ${activeTab === 'pos' ? 'overflow-y-auto lg:overflow-hidden flex flex-col' : 'overflow-y-auto'}`}>
        {activeTab === 'dashboard' && currentUser.role === 'admin' && <Dashboard orders={orders} menu={menu} />}
        {activeTab === 'pos' && ['admin', 'waiter'].includes(currentUser.role) && (
          <POS 
            tables={tables} 
            menu={menu} 
            onPlaceOrder={handlePlaceOrder} 
            activeOrders={orders} 
            onCloseTable={handleCloseTable}
            currentUser={currentUser}
            ingredients={ingredients}
            registerSettings={registerSettings}
          />
        )}
        {activeTab === 'kitchen' && ['admin', 'chef'].includes(currentUser.role) && (
          <Kitchen 
            orders={orders.filter(o => o.type !== 'drink')} 
            tables={tables} 
            onUpdateOrderStatus={handleUpdateOrderStatus} 
          />
        )}
        {activeTab === 'barra' && ['admin', 'bartender'].includes(currentUser.role) && (
          <Barra 
            orders={orders.filter(o => o.type === 'drink')} 
            tables={tables} 
            onUpdateOrderStatus={handleUpdateOrderStatus} 
          />
        )}
        {activeTab === 'inventory' && currentUser.role === 'admin' && <Inventory menu={menu} ingredients={ingredients} currentUser={currentUser} />}
        {activeTab === 'finances' && currentUser.role === 'admin' && <Finances orders={orders} ingredients={ingredients} />}
        {activeTab === 'administracion' && currentUser.role === 'admin' && <AdminUsers />}
      </main>
      <Toaster position="top-center" richColors />
    </div>
  );
}
