import React from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { 
  LayoutDashboard, 
  Users, 
  FileCheck, 
  LogOut
} from 'lucide-react';

export default function TechnicianLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const technicianNavItems = [
    { label: 'לוח בקרה', to: '/technician', icon: LayoutDashboard, enabled: true },
    { label: 'לקוחות', to: '/technician/customers', icon: Users, enabled: false },
    { label: 'הכיולים שלי', to: '/technician/my-calibrations', icon: FileCheck, enabled: true },
  ];

  function clsx(...v: Array<string | false | null | undefined>) {
    return v.filter(Boolean).join(' ');
  }

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      {/* Desktop fixed right sidebar */}
      <aside className="hidden lg:flex fixed top-0 right-0 h-full w-80 flex-col bg-white border-l border-slate-200">
        <div className="p-6">
          <div className="text-sm font-semibold text-slate-900">מערכת כיולים</div>
          <div className="mt-1 text-xs text-slate-500">ניהול מאזניים</div>
        </div>

        <div className="px-4">
          <nav className="space-y-1">
            {technicianNavItems.map((item) => {
              const active = item.to !== "#" && location.pathname === item.to;
              const Icon = item.icon;

              const base = "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition";
              const enabledCls = active
                ? "bg-violet-50 text-violet-700"
                : "text-slate-700 hover:bg-slate-50";
              const disabledCls = "text-slate-300 cursor-not-allowed";

              const content = (
                <>
                  <Icon className={clsx("h-4 w-4", active ? "text-violet-700" : "text-slate-500")} />
                  <span className="flex-1">{item.label}</span>
                </>
              );

              return item.enabled && item.to !== "#" ? (
                <Link key={item.label} to={item.to} className={clsx(base, enabledCls)}>
                  {content}
                </Link>
              ) : (
                <div key={item.label} className={clsx(base, disabledCls)}>
                  {content}
                </div>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto p-4">
          <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-600 text-sm font-semibold text-white">
                {(user?.name || "T").trim().slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">{user?.name || "טכנאי"}</div>
                <div className="text-xs text-slate-500">טכנאי</div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              התנתקות
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="px-6 py-6 space-y-6 lg:mr-80">
        <Outlet />
      </main>
    </div>
  );
}

