import { LayoutDashboard, ShoppingCart, ChefHat, Package, DollarSign, LogOut, Users, GlassWater, Menu, X } from 'lucide-react';
import { User } from '../types';
import { useState, useEffect } from 'react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: User;
  onLogout: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, currentUser, onLogout }: SidebarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const allNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin'] },
    { id: 'pos', label: 'Caja / Mesas', icon: ShoppingCart, roles: ['admin', 'waiter'] },
    { id: 'kitchen', label: 'Cocina', icon: ChefHat, roles: ['admin', 'chef'] },
    { id: 'barra', label: 'Barra', icon: GlassWater, roles: ['admin', 'bartender'] },
    { id: 'inventory', label: 'Inventario', icon: Package, roles: ['admin'] },
    { id: 'finances', label: 'Finanzas', icon: DollarSign, roles: ['admin'] },
    { id: 'administracion', label: 'Administración', icon: Users, roles: ['admin'] },
  ];

  const navItems = allNavItems.filter(item => item.roles.includes(currentUser.role));

  // Close mobile sidebar when navigating
  useEffect(() => {
    setIsMobileOpen(false);
  }, [activeTab]);

  return (
    <>
      {/* Mobile/Tablet Hamburger Button */}
      <button 
        onClick={() => setIsMobileOpen(true)}
        className="lg:hidden fixed top-4 right-4 z-40 p-3 bg-slate-900 text-white rounded-full shadow-lg"
      >
        <Menu size={24} />
      </button>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 animate-fade-in"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <div 
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={(e) => {
          // If clicking nav buttons, let them handle it. Only toggle if clicking the container
          if ((e.target as HTMLElement).closest('button')) return;
          setIsHovered(!isHovered);
        }}
        className={`fixed lg:static inset-y-0 left-0 z-50 bg-slate-900 text-white h-screen flex-col transition-all duration-300 ease-in-out shadow-2xl lg:shadow-none cursor-pointer lg:cursor-default
          ${isMobileOpen ? 'translate-x-0 w-72' : '-translate-x-full lg:translate-x-0'}
          ${isHovered ? 'lg:w-64' : 'lg:w-20'}
        `}
      >
        <div className={`p-6 transition-all duration-300 flex items-center ${isHovered || isMobileOpen ? 'justify-between px-6' : 'justify-center px-4'}`}>
          {(isHovered || isMobileOpen) ? (
            <div className="animate-fade-in duration-300">
              <h1 className="text-2xl font-bold tracking-tight text-orange-500 whitespace-nowrap">Resto<span className="text-white">Pro</span></h1>
              <p className="text-xs text-slate-400 mt-1 whitespace-nowrap">Sistema de Gestión B2B</p>
            </div>
          ) : (
            <h1 className="text-2xl font-black text-orange-500">R<span className="text-white text-lg">.</span></h1>
          )}
          
          {isMobileOpen && (
            <button onClick={() => setIsMobileOpen(false)} className="lg:hidden text-slate-400 hover:text-white">
              <X size={24} />
            </button>
          )}
        </div>
        
        <nav className={`flex-1 space-y-2 mt-4 transition-all duration-300 overflow-y-auto overflow-x-hidden ${isHovered || isMobileOpen ? 'px-4' : 'px-3'}`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center transition-all duration-200 rounded-lg ${
                  (isHovered || isMobileOpen)
                    ? 'justify-start space-x-3 px-4 py-3' 
                    : 'justify-center py-3 px-0'
                } ${
                  isActive 
                    ? 'bg-orange-500 text-white' 
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
                title={!(isHovered || isMobileOpen) ? item.label : undefined}
              >
                <div className="flex-shrink-0">
                  <Icon size={20} />
                </div>
                {(isHovered || isMobileOpen) && (
                  <span className="font-medium whitespace-nowrap transition-opacity duration-300">
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-slate-800 transition-all duration-300">
          <div className={`flex items-center ${(isHovered || isMobileOpen) ? 'justify-between' : 'justify-center flex-col space-y-3'}`}>
            <div className="flex items-center space-x-3 overflow-hidden">
              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-orange-400 font-bold flex-shrink-0" title={`${currentUser.name} (${currentUser.role})`}>
                {currentUser.name.charAt(0)}
              </div>
              {(isHovered || isMobileOpen) && (
                <div className="transition-opacity duration-300 whitespace-nowrap">
                  <p className="text-sm font-bold text-white truncate w-24">{currentUser.name}</p>
                  <p className="text-xs text-slate-400 capitalize">{currentUser.role}</p>
                </div>
              )}
            </div>
            <button 
              onClick={onLogout}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors flex items-center justify-center"
              title="Cerrar Sesión"
            >
              <LogOut size={(isHovered || isMobileOpen) ? 18 : 16} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
