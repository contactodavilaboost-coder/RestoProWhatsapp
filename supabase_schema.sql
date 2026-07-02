-- Supabase Schema for Resto Pro bien Pro

-- 1. Users (Empleados)
CREATE TABLE public.users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'waiter', 'chef', 'bartender')),
  pin TEXT NOT NULL
);

-- 2. Ingredients
CREATE TABLE public.ingredients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  stock NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  "minStock" NUMERIC NOT NULL DEFAULT 0,
  location TEXT CHECK (location IN ('cocina', 'bodega', 'barra'))
);

-- 3. Suppliers
CREATE TABLE public.suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- 4. Inventory Movements
CREATE TABLE public.inventory_movements (
  id TEXT PRIMARY KEY,
  "ingredientId" TEXT REFERENCES public.ingredients(id) ON DELETE CASCADE,
  "ingredientName" TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('entrada', 'salida_plato', 'traslado_bodega_cocina', 'desecho', 'ajuste')),
  "prevStock" NUMERIC NOT NULL,
  "newStock" NUMERIC NOT NULL,
  timestamp BIGINT NOT NULL,
  "userName" TEXT NOT NULL,
  notes TEXT
);

-- 5. Menu Items
CREATE TABLE public.menu_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price NUMERIC NOT NULL,
  stock NUMERIC NOT NULL DEFAULT 0,
  image TEXT,
  additions JSONB, -- Array of MenuAddition objects
  recipe JSONB     -- Array of RecipeItem objects
);

-- 6. Areas
CREATE TABLE public.areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- 7. Tables
CREATE TABLE public.tables (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available', 'occupied')),
  "currentOrderId" TEXT,
  "areaId" TEXT REFERENCES public.areas(id) ON DELETE SET NULL
);

-- 8. Orders
CREATE TABLE public.orders (
  id TEXT PRIMARY KEY,
  "tableId" TEXT REFERENCES public.tables(id) ON DELETE SET NULL,
  items JSONB NOT NULL, -- Array of OrderItem objects
  status TEXT NOT NULL CHECK (status IN ('pending', 'preparing', 'ready', 'served', 'paid', 'unconfirmed')),
  type TEXT CHECK (type IN ('food', 'drink')),
  total NUMERIC NOT NULL DEFAULT 0,
  timestamp BIGINT NOT NULL,
  "businessDate" BIGINT,
  "preparingTimestamp" BIGINT,
  "readyTimestamp" BIGINT,
  "paymentMethod" TEXT CHECK ("paymentMethod" IN ('efectivo', 'tarjeta', 'pago_movil', 'transferencia', 'zelle')),
  "referenceNumber" TEXT,
  "waiterId" TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  "waiterName" TEXT,
  "customerPhone" TEXT,
  "customerName" TEXT,
  "customerAddress" TEXT,
  "customerID" TEXT,
  "isDelivery" BOOLEAN DEFAULT false,
  "deliveryCost" NUMERIC DEFAULT 0
);

-- Note: Add foreign key for currentOrderId in tables now that orders table exists
ALTER TABLE public.tables ADD CONSTRAINT fk_current_order FOREIGN KEY ("currentOrderId") REFERENCES public.orders(id) ON DELETE SET NULL;


-- 9. Purchases
CREATE TABLE public.purchases (
  id TEXT PRIMARY KEY,
  "supplierName" TEXT NOT NULL,
  "userName" TEXT NOT NULL,
  "totalAmount" NUMERIC NOT NULL,
  timestamp BIGINT NOT NULL,
  "invoicePhoto" TEXT,
  items JSONB NOT NULL -- Array of PurchaseItem
);

-- 10. Daily Expenses
CREATE TABLE public.daily_expenses (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('delivery', 'otro')),
  amount NUMERIC NOT NULL,
  description TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  "businessDate" BIGINT NOT NULL,
  "userName" TEXT NOT NULL,
  "orderId" TEXT REFERENCES public.orders(id) ON DELETE SET NULL
);

-- 11. Settings (Key-Value)
CREATE TABLE public.settings (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

-- Enable Realtime for all tables
alter publication supabase_realtime add table public.users, public.ingredients, public.suppliers, public.inventory_movements, public.menu_items, public.areas, public.tables, public.orders, public.purchases, public.daily_expenses, public.settings;

