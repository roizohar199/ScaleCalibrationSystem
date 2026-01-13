import React, { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import api from '@/api/client';
import { 
  LayoutDashboard, 
  Users, 
  Scale, 
  FileCheck, 
  ClipboardCheck, 
  Award,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Layout() {
  const { user, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const location = useLocation();
  const navigate = useNavigate();

  // Map page names to actual routes
  const pageToRoute: Record<string, string> = {
    'OfficeDashboard': 'office',
    'TechnicianDashboard': 'technician',
    'ApprovalDashboard': 'approval',
    'Customers': 'customers',
    'CustomerDetails': 'customer-details',
    'Scales': 'scales',
    'ScaleDetails': 'scale-details',
    'MetrologicalProfiles': 'metrological-profiles',
    'NewCalibration': 'new-calibration',
    'MyCalibrations': 'my-calibrations',
    'CalibrationDetails': 'calibration-details',
    'Certificates': 'certificates',
  };

  // Helper function to create page URLs
  const createPageUrl = (page: string): string => {
    const params = new URLSearchParams(searchParams);
    
    // Extract query params from page string if provided (e.g., "NewCalibration?scale_id=123")
    if (page.includes('?')) {
      const [pathName, query] = page.split('?');
      const route = pageToRoute[pathName] || pathName.toLowerCase();
      const pageParams = new URLSearchParams(query);
      pageParams.forEach((value, key) => {
        params.set(key, value);
      });
      return `/${route}${params.toString() ? `?${params.toString()}` : ''}`;
    }
    
    const route = pageToRoute[page] || page.toLowerCase();
    return `/${route}${params.toString() ? `?${params.toString()}` : ''}`;
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Get current page name from location
  const getCurrentPageName = () => {
    const path = location.pathname.replace('/', '');
    if (path === '') return 'OfficeDashboard';
    if (path === 'technician') return 'TechnicianDashboard';
    if (path === 'office') return 'OfficeDashboard';
    if (path === 'approval') return 'ApprovalDashboard';
    if (path === 'customers') return 'Customers';
    if (path === 'customer-details') return 'CustomerDetails';
    if (path === 'scales') return 'Scales';
    if (path === 'scale-details') return 'ScaleDetails';
    if (path === 'metrological-profiles') return 'MetrologicalProfiles';
    if (path === 'new-calibration') return 'NewCalibration';
    if (path === 'my-calibrations') return 'MyCalibrations';
    if (path === 'calibration-details') return 'CalibrationDetails';
    if (path === 'certificates') return 'Certificates';
    return path;
  };

  const currentPageName = getCurrentPageName();
  const isOffice = user?.user_role === 'OFFICE' || user?.role === 'ADMIN' || user?.role === 'OFFICE';

  // Fetch pending calibrations count
  useEffect(() => {
    if (!isOffice) return;

    const fetchPendingCount = async () => {
      try {
        const response = await api.get('/calibrations/pending-count');
        setPendingCount(response.data?.count || 0);
      } catch (error: any) {
        // Ignore 403 errors (user might not have permission)
        if (error?.response?.status !== 403) {
          console.error('Error fetching pending count:', error);
        }
      }
    };

    fetchPendingCount();
    // Refresh every 30 seconds
    const interval = setInterval(fetchPendingCount, 30000);
    
    // Listen for calibration approval/rejection events
    const handleCalibrationStatusChange = () => {
      fetchPendingCount();
    };
    
    window.addEventListener('calibrationStatusChanged', handleCalibrationStatusChange);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('calibrationStatusChanged', handleCalibrationStatusChange);
    };
  }, [isOffice, location.pathname]); // Refresh when navigating

  const technicianNavItems = [
    { name: 'לוח בקרה', icon: LayoutDashboard, page: 'TechnicianDashboard' },
    { name: 'לקוחות', icon: Users, page: 'Customers' },
    { name: 'דגמי משקלים', icon: Scale, page: 'Scales' },
    { name: 'הכיולים שלי', icon: FileCheck, page: 'MyCalibrations' },
  ];

  const officeNavItems = [
    { name: 'לוח בקרה', icon: LayoutDashboard, page: 'OfficeDashboard' },
    { name: 'לקוחות', icon: Users, page: 'Customers' },
    { name: 'דגמי משקלים', icon: Scale, page: 'Scales' },
    { name: 'פרופילים מטרולוגיים', icon: Settings, page: 'MetrologicalProfiles' },
    { name: 'כיולים ממתינים לאישור', icon: ClipboardCheck, page: 'ApprovalDashboard' },
    { name: 'תעודות', icon: Award, page: 'Certificates' },
  ];

  const navItems = isOffice ? officeNavItems : technicianNavItems;

  if (location.pathname === '/login') {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen bg-white" dir="rtl">
      <style>{`
        :root {
          --primary: 139 92 246;
          --primary-foreground: 255 255 255;
        }
        .nav-item {
          transition: all 0.2s ease;
        }
        .nav-item:hover {
          transform: translateX(-4px);
        }
        .nav-item.active {
          background: rgb(245 243 255);
          border-right: 2px solid rgb(139 92 246);
        }
        .glass-effect {
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.3);
        }
      `}</style>

      {/* Mobile Header */}
      <div className="xs:hidden md:hidden fixed top-0 left-0 right-0 z-50 glass-effect border-b border-slate-200/50 px-3 xs:px-4 py-2 xs:py-3 safe-top">
        <div className="flex items-center justify-between max-w-full">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="touch-target flex-shrink-0"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <div className="flex items-center gap-1 xs:gap-2 flex-1 min-w-0">
            <div className="h-6 w-6 xs:h-8 xs:w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
              <Scale className="h-3 w-3 xs:h-4 xs:w-4 text-white" />
            </div>
            <span className="font-bold text-sm xs:text-lg bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent truncate">
              מערכת כיולים
            </span>
          </div>
          <div className="w-8 xs:w-10 flex-shrink-0" />
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 right-0 h-full z-50
        transition-all duration-300 ease-in-out
        bg-white shadow-xl shadow-slate-200/50
        hidden md:block
        ${sidebarOpen ? 'w-56 xs:w-64 lg:w-72' : 'w-16 xs:w-20'}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo - Purple Background */}
          <div className="bg-gradient-to-br from-violet-500 to-purple-600 p-4 xs:p-6">
            <div className={`flex items-center ${sidebarOpen ? 'gap-2 xs:gap-3' : 'justify-center'}`}>
              <div className="h-10 w-10 xs:h-12 xs:w-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                <Scale className="h-5 w-5 xs:h-7 xs:w-7 text-white" />
              </div>
              {sidebarOpen && (
                <div className="min-w-0 flex-1">
                  <h1 className="font-bold text-base xs:text-lg text-white truncate">
                    מערכת כיולים
                  </h1>
                  <p className="text-xs text-violet-100 hidden xs:block">ניהול מאזניים</p>
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-4 xs:py-6 px-2 xs:px-3 space-y-1 overflow-y-auto bg-white scrollbar-hide">
            {navItems.map((item) => {
              const isApprovalItem = item.page === 'ApprovalDashboard';
              return (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                  className={`nav-item flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:text-violet-600 hover:bg-violet-50 transition-colors relative ${
                  currentPageName === item.page ? 'bg-violet-50 text-violet-600 font-medium border-r-2 border-violet-500' : ''
                }`}
              >
                <item.icon className="h-4 w-4 xs:h-5 xs:w-5 flex-shrink-0" />
                  {sidebarOpen && (
                    <span className="flex-1 text-sm xs:text-base truncate">{item.name}</span>
                  )}
                  {isApprovalItem && (
                    <span className={`flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-semibold text-white ${pendingCount > 0 ? 'bg-red-500' : 'bg-slate-400'} ${!sidebarOpen ? 'absolute -top-1 -right-1' : ''}`}>
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
              </Link>
              );
            })}
          </nav>

          {/* User Section */}
          {user && (
            <div className="p-3 xs:p-4 border-t border-slate-200 bg-white">
              <div className={`flex items-center ${sidebarOpen ? 'gap-2 xs:gap-3' : 'justify-center'}`}>
                <div className="h-8 w-8 xs:h-10 xs:w-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-medium shadow-md text-xs xs:text-sm flex-shrink-0">
                  {user.full_name?.charAt(0) || user.email?.charAt(0) || user.name?.charAt(0) || 'U'}
                </div>
                {sidebarOpen && (
                  <div className="flex-1 min-w-0">
                    <p className="text-xs xs:text-sm font-medium text-slate-800 truncate">
                      {user.full_name || user.name || user.email}
                    </p>
                    <p className="text-xs text-slate-500 hidden xs:block">
                      {user.user_role === 'OFFICE' || user.role === 'OFFICE' || user.role === 'ADMIN' ? 'משרד' : 'טכנאי'}
                    </p>
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                onClick={handleLogout}
                className={`w-full mt-2 xs:mt-3 text-slate-600 hover:text-red-600 hover:bg-red-50 touch-target ${
                  !sidebarOpen ? 'px-1' : ''
                }`}
              >
                <LogOut className="h-3 w-3 xs:h-4 xs:w-4 flex-shrink-0" />
                {sidebarOpen && <span className="mr-1 xs:mr-2 text-xs xs:text-sm">התנתקות</span>}
              </Button>
            </div>
          )}

          {/* Collapse Button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="absolute top-1/2 -left-3 h-6 w-6 xs:h-7 xs:w-7 rounded-full bg-white shadow-md border border-slate-200 flex items-center justify-center text-slate-400 hover:text-violet-500 transition-colors touch-target hidden lg:flex"
          >
            <ChevronLeft className={`h-3 w-3 xs:h-4 xs:w-4 transition-transform ${!sidebarOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <aside className={`
        xs:hidden md:hidden fixed top-0 right-0 h-full z-50 w-64 xs:w-72
        transform transition-transform duration-300 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}
        glass-effect shadow-xl
      `}>
        <div className="flex flex-col h-full pt-16">
          <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const isApprovalItem = item.page === 'ApprovalDashboard';
              return (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                onClick={() => setMobileMenuOpen(false)}
                  className={`nav-item flex items-center gap-3 px-4 py-3 rounded-xl text-slate-600 hover:text-violet-600 relative ${
                  currentPageName === item.page ? 'active text-violet-600 font-medium' : ''
                }`}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                  <span className="flex-1">{item.name}</span>
                  {isApprovalItem && (
                    <span className={`flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-semibold text-white ${pendingCount > 0 ? 'bg-red-500' : 'bg-slate-400'}`}>
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
              </Link>
              );
            })}
          </nav>

          {user && (
            <div className="p-4 border-t border-slate-200/50">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white font-medium">
                  {user.full_name?.charAt(0) || user.email?.charAt(0) || user.name?.charAt(0) || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">
                    {user.full_name || user.name || user.email}
                  </p>
                  <p className="text-xs text-slate-500">
                    {user.user_role === 'OFFICE' || user.role === 'OFFICE' || user.role === 'ADMIN' ? 'משרד' : 'טכנאי'}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                onClick={handleLogout}
                className="w-full mt-3 text-slate-500 hover:text-red-500 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4 ml-2" />
                <span>התנתקות</span>
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className={`
        transition-all duration-300
        ${sidebarOpen ? 'md:mr-56 xs:md:mr-64 lg:mr-72' : 'md:mr-16 xs:md:mr-20'}
        pt-12 xs:pt-14 md:pt-0
        min-h-screen
        safe-bottom
      `}>
        <div className="min-h-screen px-2 xs:px-3 sm:px-4 md:px-6 lg:px-8 py-4 xs:py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
