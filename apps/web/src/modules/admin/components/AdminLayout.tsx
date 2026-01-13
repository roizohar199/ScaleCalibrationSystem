import React from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import api from '@/api/client';
import { io as socketClient, Socket } from 'socket.io-client';
import { 
  LayoutDashboard, 
  Users, 
  ClipboardCheck, 
  Award,
  Settings,
  LogOut,
  UserCheck,
  Upload
} from 'lucide-react';

function clsx(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(' ');
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [pendingUsersCount, setPendingUsersCount] = React.useState(0);
  const [pendingCalibrationsCount, setPendingCalibrationsCount] = React.useState(0);

  React.useEffect(() => {
    if (user?.role === 'ADMIN') {
      loadPendingUsersCount();
      const interval = setInterval(loadPendingUsersCount, 30000); // רענון כל 30 שניות
      return () => clearInterval(interval);
    }
  }, [user]);

  React.useEffect(() => {
    if (user?.role === 'ADMIN' || user?.role === 'OFFICE') {
      loadPendingCalibrationsCount();
      const interval = setInterval(loadPendingCalibrationsCount, 30000); // רענון כל 30 שניות

      // Try real-time via socket.io if available
      let socket: Socket | null = null;
      try {
        socket = socketClient(window.location.origin);
        socket.on('pendingCalibrationsCount', (data: any) => {
          setPendingCalibrationsCount(data.count || 0);
        });
      } catch (err) {
        // socket.io not available or failed to connect, fall back to window events
        console.warn('Socket.io client not connected', err);
      }

      // Listen for legacy window events as fallback
      const handleCalibrationStatusChange = () => {
        loadPendingCalibrationsCount();
      };

      window.addEventListener('calibrationStatusChanged', handleCalibrationStatusChange);

      return () => {
        clearInterval(interval);
        window.removeEventListener('calibrationStatusChanged', handleCalibrationStatusChange);
        if (socket) {
          socket.off('pendingCalibrationsCount');
          socket.close();
        }
      };
    }
  }, [user]);

  const loadPendingUsersCount = async () => {
    try {
      const response = await api.get('/auth/pending-users');
      setPendingUsersCount((response.data || []).length);
    } catch (error) {
      // ignore errors
    }
  };

  const loadPendingCalibrationsCount = async () => {
    try {
      const response = await api.get('/calibrations/pending-count');
      setPendingCalibrationsCount(response.data?.count || 0);
    } catch (error: any) {
      // Ignore 403 errors (user might not have permission)
      if (error?.response?.status !== 403) {
        console.error('Error fetching pending calibrations count:', error);
      }
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const adminNavItems = [
    { label: 'לוח בקרה', to: '/admin', icon: LayoutDashboard, enabled: true },
    { label: 'לקוחות', to: '/admin/customers', icon: Users, enabled: true },
    { label: 'יבוא מסמכים', to: '/admin/import-documents', icon: Upload, enabled: true },
    { label: 'כיולים ממתינים לאישור', to: '/admin/approval', icon: ClipboardCheck, enabled: true, badge: pendingCalibrationsCount },
    { label: 'תעודות שהונפקו', to: '/admin/certificates', icon: Award, enabled: true },
    ...(user?.role === 'ADMIN' ? [{ label: 'ניהול משתמשים', to: '/admin/users', icon: UserCheck, enabled: true, badge: pendingUsersCount }] : []),
  ];

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
            {adminNavItems.map((item) => {
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
                  {item.badge !== undefined && (
                    <span className={`inline-flex items-center justify-center rounded-full text-xs font-semibold text-white h-5 min-w-[20px] px-1.5 ${item.badge > 0 ? 'bg-rose-500' : 'bg-slate-400'}`}>
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
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
                {(user?.full_name || user?.name || user?.email || "A").trim().slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">{user?.full_name || user?.name || user?.email || "מנהל"}</div>
                <div className="text-xs text-slate-500">{user?.role === 'ADMIN' ? 'מנהל מערכת' : 'משרד'}</div>
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

