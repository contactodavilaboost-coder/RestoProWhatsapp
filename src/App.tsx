import { useState, useEffect, useRef } from 'react';
import { supabase, handleSupabaseError as handleFirestoreError, OperationType } from './supabase';
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
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setIsLoadingSheet(true);
        try {
          const userEmail = (session.user.email || '').toLowerCase().trim();
          
          const { data: userData } = await supabase
            .from('users')
            .select('*')
            .eq('email', userEmail)
            .single();
          
          let role: 'admin' | 'waiter' | 'chef' | 'bartender' = 'waiter';
          let displayName = session.user.user_metadata?.full_name || 'Usuario';
          let isAuthorized = false;
          let finalUserData: User | null = null;

          if (userData) {
            role = userData.role as any;
            displayName = userData.name || displayName;
            isAuthorized = true;
            finalUserData = {
              id: session.user.id,
              name: displayName,
              role: role,
              pin: userData.pin || '0000'
            };
          } else {
            const isBootstrappedAdmin = 
              userEmail === 'davilacamacho@gmail.com' || 
              userEmail === 'veronicaarcaya2015@gmail.com' || 
              userEmail === 'equisrafael@gmail.com' ||
              userEmail === 'elvalerasmoke@gmail.com';
            
            if (isBootstrappedAdmin) {
              role = 'admin';
              isAuthorized = true;
              
              const { error: insertError } = await supabase.from('users').insert({
                id: session.user.id,
                name: displayName,
                email: userEmail,
                role: 'admin',
                pin: '0000'
              });

              if (!insertError) {
                finalUserData = {
                  id: session.user.id,
                  name: displayName,
                  role: 'admin',
                  pin: '0000'
                };
              }
            }
          }

          if (!isAuthorized || !finalUserData) {
            setBlockedEmail(userEmail);
            setCurrentUser(null);
            setIsLoadingSheet(false);
            return;
          }

          setBlockedEmail('');
          setCurrentUser(finalUserData);
          if (finalUserData.role === 'admin') setActiveTab('dashboard');
          else if (finalUserData.role === 'waiter') setActiveTab('pos');
          else if (finalUserData.role === 'chef') setActiveTab('kitchen');
          else if (finalUserData.role === 'bartender') setActiveTab('barra');
          
          if (finalUserData.role === 'admin') {
            const { data: menuItems } = await supabase.from('menu_items').select('id').limit(1);
            if (!menuItems || menuItems.length === 0) {
              await supabase.from('menu_items').insert(INITIAL_MENU.map(m => ({
                id: m.id, name: m.name, category: m.category, price: m.price, stock: m.stock
              })));
              await supabase.from('tables').insert(INITIAL_TABLES.map(t => ({
                id: t.id, number: String(t.number), status: t.status
              })));
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

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

    useEffect(() => {
    if (!isAuthReady || !currentUser) return;

    const fetchInitialData = async () => {
      const [menuRes, ingRes, tablesRes, ordersRes, regRes] = await Promise.all([
        supabase.from('menu_items').select('*'),
        supabase.from('ingredients').select('*'),
        supabase.from('tables').select('*'),
        supabase.from('orders').select('*').order('timestamp', { ascending: false }),
        supabase.from('settings').select('*').eq('id', 'register').single()
      ]);
      
      if (menuRes.data) setMenu(menuRes.data as MenuItem[]);
      if (ingRes.data) setIngredients(ingRes.data as Ingredient[]);
      if (tablesRes.data) setTables((tablesRes.data as Table[]).sort((a,b) => {
        const numA = Number(a.number);
        const numB = Number(b.number);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        if (!isNaN(numA)) return -1;
        if (!isNaN(numB)) return 1;
        return String(a.number).localeCompare(String(b.number));
      }));
      if (ordersRes.data) setOrders(ordersRes.data as Order[]);
      if (regRes.data) setRegisterSettings(regRes.data.data);
    };

    fetchInitialData();

    const menuSub = supabase.channel('menu_items_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => {
        supabase.from('menu_items').select('*').then(res => res.data && setMenu(res.data as MenuItem[]));
      }).subscribe();

    const ingSub = supabase.channel('ingredients_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, () => {
        supabase.from('ingredients').select('*').then(res => res.data && setIngredients(res.data as Ingredient[]));
      }).subscribe();

    const tablesSub = supabase.channel('tables_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () => {
        supabase.from('tables').select('*').then(res => {
          if (res.data) setTables((res.data as Table[]).sort((a,b) => {
            const numA = Number(a.number);
            const numB = Number(b.number);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            if (!isNaN(numA)) return -1;
            if (!isNaN(numB)) return 1;
            return String(a.number).localeCompare(String(b.number));
          }));
        });
      }).subscribe();

    const ordersSub = supabase.channel('orders_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        supabase.from('orders').select('*').order('timestamp', { ascending: false }).then(res => res.data && setOrders(res.data as Order[]));
      }).subscribe();
      
    const settingsSub = supabase.channel('settings_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: 'id=eq.register' }, () => {
        supabase.from('settings').select('*').eq('id', 'register').single().then(res => res.data && setRegisterSettings(res.data.data));
      }).subscribe();

    return () => {
      supabase.removeChannel(menuSub);
      supabase.removeChannel(ingSub);
      supabase.removeChannel(tablesSub);
      supabase.removeChannel(ordersSub);
      supabase.removeChannel(settingsSub);
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
    await supabase.auth.signOut();
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
      const orderTotal = orderItems.reduce((sum, item) => sum + ((item.menuItem.price + (item.extraPrice || 0)) * item.quantity), 0);
      
      const { error } = await supabase.from('orders').insert({
        tableId,
        items: orderItems,
        status: 'pending',
        type,
        total: orderTotal,
        timestamp: Date.now(),
        businessDate: registerSettings?.openedAt || Date.now(),
        waiterId: currentUser?.id,
        waiterName: currentUser?.name
      });
      if (error) throw error;
    };

    try {
      if (foodItems.length > 0) {
        await createOrderDoc(foodItems, 'food');
      }
      if (drinkItems.length > 0) {
        await createOrderDoc(drinkItems, 'drink');
      }

      for (const orderItem of items) {
        const menuItem = menu.find(m => m.id === orderItem.menuItem.id);
        if (menuItem) {
          if (menuItem.recipe && menuItem.recipe.length > 0) {
            for (const recipeItem of menuItem.recipe) {
              const ing = ingredients.find(i => i.id === recipeItem.ingredientId);
              if (ing) {
                const deduction = recipeItem.quantity * orderItem.quantity;
                const newStock = Math.max(0, ing.stock - deduction);
                await supabase.from('ingredients').update({ stock: newStock }).eq('id', ing.id);
                
                await supabase.from('inventory_movements').insert({
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
            }
          } else {
            await supabase.from('menu_items').update({ stock: Math.max(0, menuItem.stock - orderItem.quantity) }).eq('id', menuItem.id);
          }

          if (orderItem.selectedAdditions && orderItem.selectedAdditions.length > 0) {
            for (const addition of orderItem.selectedAdditions) {
              if (addition.ingredientId) {
                const ing = ingredients.find(i => i.id === addition.ingredientId);
                if (ing) {
                  const deduction = orderItem.quantity * (addition.quantity || 1);
                  const newStock = Math.max(0, ing.stock - deduction);
                  await supabase.from('ingredients').update({ stock: newStock }).eq('id', ing.id);
                  
                  await supabase.from('inventory_movements').insert({
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
            }
          }
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'orders');
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: Order['status']) => {
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === 'preparing') {
        updateData.preparingTimestamp = Date.now();
      } else if (newStatus === 'ready') {
        updateData.readyTimestamp = Date.now();
      }
      const { error } = await supabase.from('orders').update(updateData).eq('id', orderId);
      if (error) throw error;
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
      const orderIds = activeTableOrders.map(o => o.id);
      
      if (orderIds.length > 0) {
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
        if (referenceNumber) updateData.referenceNumber = referenceNumber;
        
        await supabase.from('orders').update(updateData).in('id', orderIds);
      }

      if (isDelivery && deliveryCost && deliveryCost > 0) {
        const businessDate = registerSettings?.openedAt || Date.now();
        await supabase.from('daily_expenses').insert({
          type: 'delivery',
          amount: deliveryCost,
          description: `Delivery Mesa ${tableId.replace('t', '')}`,
          timestamp: Date.now(),
          businessDate: businessDate,
          userName: currentUser?.name || 'Sistema',
          orderId: activeTableOrders[0]?.id || null
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
