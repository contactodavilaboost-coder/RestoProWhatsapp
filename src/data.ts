import { MenuItem, Table, User } from './types';

export const USERS: User[] = [
  { id: 'u1', name: 'Carlos (Admin)', role: 'admin', pin: '1234' },
  { id: 'u2', name: 'Ana (Mesera)', role: 'waiter', pin: '1111' },
  { id: 'u3', name: 'Luis (Chef)', role: 'chef', pin: '2222' },
];

export const INITIAL_MENU: MenuItem[] = [
  { id: 'm1', name: 'Panini de Jamón y Queso', category: 'paninis', price: 6.50, stock: 50 },
  { id: 'm2', name: 'Pizza Margarita', category: 'pizzas', price: 12.00, stock: 30 },
  { id: 'm3', name: 'Patacón de Carne Mechada', category: 'patacones', price: 8.50, stock: 40 },
  { id: 'm4', name: 'Patacón de Pollo', category: 'patacones', price: 8.00, stock: 45 },
  { id: 'm5', name: 'Refresco Cola', category: 'bebida', price: 2.50, stock: 200 },
  { id: 'm6', name: 'Malta Fría', category: 'bebida', price: 2.00, stock: 150 },
  { id: 'm7', name: 'Torta de Tres Leches', category: 'postre', price: 4.50, stock: 15 },
  { id: 'm8', name: 'Café Expreso', category: 'bebida', price: 1.50, stock: 180 },
];

export const INITIAL_TABLES: Table[] = [
  { id: 't1', number: 1, status: 'available' },
  { id: 't2', number: 2, status: 'available' },
  { id: 't3', number: 3, status: 'available' },
  { id: 't4', number: 4, status: 'available' },
  { id: 't5', number: 5, status: 'available' },
  { id: 't6', number: 6, status: 'available' },
  { id: 't7', number: 7, status: 'available' },
  { id: 't8', number: 8, status: 'available' },
];
