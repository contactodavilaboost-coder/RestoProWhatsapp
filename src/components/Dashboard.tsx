import { Order, MenuItem } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { TrendingUp, Users, ShoppingBag, DollarSign } from 'lucide-react';

interface DashboardProps {
  orders: Order[];
  menu: MenuItem[];
}

export default function Dashboard({ orders, menu }: DashboardProps) {
  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
  const totalOrders = orders.length;
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Calculate sales by waiter
  const waiterSales = orders.reduce((acc, order) => {
    if (order.waiterName && order.status === 'paid') {
      if (!acc[order.waiterName]) {
        acc[order.waiterName] = { name: order.waiterName, sales: 0, orders: 0 };
      }
      acc[order.waiterName].sales += order.total;
      acc[order.waiterName].orders += 1;
    }
    return acc;
  }, {} as Record<string, { name: string, sales: number, orders: number }>);

  const waiterSalesData = Object.values(waiterSales).sort((a, b) => b.sales - a.sales);

  // Mock data for charts
  const salesData = [
    { name: 'Lun', sales: 400 },
    { name: 'Mar', sales: 300 },
    { name: 'Mié', sales: 550 },
    { name: 'Jue', sales: 450 },
    { name: 'Vie', sales: 700 },
    { name: 'Sáb', sales: 900 },
    { name: 'Dom', sales: 850 },
  ];

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen">
      <h2 className="text-2xl md:text-3xl font-bold text-slate-800 mb-6 md:mb-8">Resumen General</h2>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
        <StatCard 
          title="Ingresos Totales" 
          value={`$${totalRevenue.toFixed(2)}`} 
          icon={DollarSign} 
          trend="+12.5%" 
        />
        <StatCard 
          title="Pedidos Hoy" 
          value={totalOrders.toString()} 
          icon={ShoppingBag} 
          trend="+5.2%" 
        />
        <StatCard 
          title="Ticket Promedio" 
          value={`$${averageOrderValue.toFixed(2)}`} 
          icon={TrendingUp} 
          trend="+2.1%" 
        />
        <StatCard 
          title="Clientes Atendidos" 
          value={(totalOrders * 2.5).toFixed(0)} 
          icon={Users} 
          trend="+8.4%" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800 mb-6">Ventas Semanales</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="sales" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800 mb-6">Tendencia de Pedidos</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip />
                <Line type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-8 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-semibold text-slate-800 mb-6">Ventas por Mesero</h3>
        {waiterSalesData.length > 0 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={waiterSalesData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={100} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(value: number) => `$${value.toFixed(2)}`} />
                <Bar dataKey="sales" fill="#10b981" radius={[0, 4, 4, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-slate-500">
            No hay datos de ventas por mesero aún.
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, trend }: any) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
        <h4 className="text-3xl font-bold text-slate-800">{value}</h4>
        <p className="text-sm font-medium text-emerald-500 mt-2">{trend} vs semana pasada</p>
      </div>
      <div className="p-3 bg-orange-50 text-orange-500 rounded-lg">
        <Icon size={24} />
      </div>
    </div>
  );
}
