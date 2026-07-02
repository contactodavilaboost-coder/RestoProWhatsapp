export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'paid' | 'unconfirmed';
export type TableStatus = 'available' | 'occupied';
export type Role = 'admin' | 'waiter' | 'chef' | 'bartender';

export interface User {
  id: string;
  name: string;
  role: Role;
  pin: string;
}

export interface MenuAddition {
  name: string;
  price: number;
  ingredientId?: string;
  quantity?: number;
  count?: number;
}

export interface Ingredient {
  id: string;
  name: string;
  stock: number;
  unit: string;
  minStock: number;
  location?: 'cocina' | 'bodega' | 'barra';
}

export interface Supplier {
  id: string;
  name: string;
}

export type MovementType = 'entrada' | 'salida_plato' | 'traslado_bodega_cocina' | 'desecho' | 'ajuste';

export interface InventoryMovement {
  id: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  type: MovementType;
  prevStock: number;
  newStock: number;
  timestamp: number;
  userName: string;
  notes?: string;
}

export interface RecipeItem {
  ingredientId: string;
  quantity: number;
}

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  image?: string;
  additions?: MenuAddition[];
  recipe?: RecipeItem[];
}

export interface OrderItem {
  id: string;
  menuItem: MenuItem;
  quantity: number;
  notes?: string;
  extraPrice?: number;
  selectedAdditions?: MenuAddition[];
}

export interface Order {
  id: string;
  tableId: string;
  items: OrderItem[];
  status: OrderStatus;
  type?: 'food' | 'drink';
  total: number;
  timestamp: number;
  businessDate?: number;
  preparingTimestamp?: number;
  readyTimestamp?: number;
  paymentMethod?: 'efectivo' | 'tarjeta' | 'pago_movil' | 'transferencia' | 'zelle';
  referenceNumber?: string;
  waiterId?: string;
  waiterName?: string;
  customerPhone?: string;
  customerName?: string;
  customerAddress?: string;
  customerID?: string;
  isDelivery?: boolean;
  deliveryCost?: number;
}

export interface Area {
  id: string;
  name: string;
}

export interface Table {
  id: string;
  number: number | string;
  status: TableStatus;
  currentOrderId?: string;
  areaId?: string;
}

export interface PurchaseItem {
  ingredientId: string;
  quantity: number;
  cost: number;
}

export interface Purchase {
  id: string;
  supplierName: string;
  userName: string;
  totalAmount: number;
  timestamp: number;
  invoicePhoto?: string;
  items: PurchaseItem[];
}

export interface DailyExpense {
  id: string;
  type: 'delivery' | 'otro';
  amount: number;
  description: string;
  timestamp: number;
  businessDate: number;
  userName: string;
  orderId?: string;
}
