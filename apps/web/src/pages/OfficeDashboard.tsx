import React, { useState, useEffect, useMemo } from 'react';
import api from '../api/client';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import StatsCard from '../modules/shared/components/StatsCard';
import { 
  Plus,
  XCircle,
  CheckCircle,
  FileEdit,
  Clock,
  ChevronLeft
} from 'lucide-react';

interface Calibration {
  id: string;
  status: string;
  testDate?: string | null;
  submittedAt?: string | null;
  updatedAt?: string | null;
  scaleId?: string | null;
  customerId?: string | null;
  scale?: {
    id: string;
    serialMfg?: string | null;
    serialInternal?: string | null;
    manufacturer?: string | null;
    modelName?: string | null;
    model?: {
      manufacturer: string;
      modelName: string;
    } | null;
  } | null;
  customer?: {
    id: string;
    name: string;
  } | null;
  certificate?: {
    id: string;
    certificateNo: string;
  } | null;
  technician?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface ScaleData {
  id: string;
  serialMfg?: string | null;
  serialInternal?: string | null;
  manufacturer?: string | null;
  modelName?: string | null;
  customerId?: string | null;
  nextDueDate?: string | null;
  model?: {
    manufacturer: string;
    modelName: string;
  } | null;
  site?: {
    customer?: {
      id: string;
      name: string;
    } | null;
  } | null;
}

interface Customer {
  id: string;
  name: string;
}

function clsx(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(' ');
}

export default function OfficeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [calibrations, setCalibrations] = useState<Calibration[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [calibrationsRes, customersRes] = await Promise.all([
        api.get('/calibrations'),
        api.get('/customers')
      ]);
      
      setCalibrations(calibrationsRes.data || []);
      setCustomers(customersRes.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCustomerName = (customerId?: string | null) => {
    if (!customerId) return 'לא ידוע';
    const customer = customers.find(c => c.id === customerId);
    return customer?.name || 'לא ידוע';
  };


  // Calculate stats according to the image: נדחו, אושרו, נשלחו לאישור, טיוטות
  const stats = useMemo(() => {
    const rejected = calibrations.filter(c => c.status === 'REJECTED').length;
    const approved = calibrations.filter(c => c.status === 'APPROVED' || c.status === 'CERTIFICATE_ISSUED').length;
    const submitted = calibrations.filter(c => c.status === 'SUBMITTED' || c.status === 'IN_REVIEW').length;
    const draft = calibrations.filter(c => c.status === 'DRAFT').length;
    return { rejected, approved, submitted, draft };
  }, [calibrations]);

  // Recent calibrations - sorted by date
  const recentCalibrations = useMemo(() => {
    const sorted = [...calibrations].sort((a, b) => {
      const dateA = a.testDate || a.submittedAt || a.updatedAt || '';
      const dateB = b.testDate || b.submittedAt || b.updatedAt || '';
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
    return sorted.slice(0, 10);
  }, [calibrations]);


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top header */}
      <div className="flex flex-col xs:flex-row xs:items-start xs:justify-between gap-4 xs:gap-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl xs:text-2xl lg:text-3xl font-semibold text-slate-900 truncate">
            שלום, {user?.full_name || user?.name || user?.email || "משתמש"}
          </h1>
          <p className="mt-1 text-xs xs:text-sm text-slate-500">לוח בקרה לניהול כיולים</p>
        </div>

        <button
          onClick={() => navigate('/admin/new-calibration')}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3 xs:px-4 py-2 xs:py-2.5 text-xs xs:text-sm font-medium text-white shadow-sm hover:bg-violet-700 touch-target whitespace-nowrap flex-shrink-0"
        >
          <Plus className="h-3 w-3 xs:h-4 xs:w-4" />
          כיול חדש
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 xs:gap-4">
        <StatsCard 
          title="נדחו" 
          value={stats.rejected} 
          icon={XCircle}
          color="rose"
        />
        <StatsCard 
          title="אושרו" 
          value={stats.approved} 
          icon={CheckCircle}
          color="emerald"
        />
        <StatsCard 
          title="נשלחו לאישור" 
          value={stats.submitted} 
          icon={Clock}
          color="blue"
        />
        <StatsCard 
          title="טיוטות" 
          value={stats.draft} 
          icon={FileEdit}
          color="amber"
        />
      </div>

      {/* Recent calibrations */}
      <div className="rounded-xl xs:rounded-2xl bg-white p-4 xs:p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between">
          <h2 className="text-sm xs:text-base font-semibold text-slate-900">כיולים אחרונים</h2>
        </div>

        {recentCalibrations.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 p-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
              <FileEdit className="h-6 w-6 text-slate-500" />
            </div>
            <div className="text-sm font-medium text-slate-900">אין כיולים עדכניים</div>
            <div className="mt-1 text-sm text-slate-500">כשתיצור כיול חדש הוא יופיע כאן.</div>
          </div>
        ) : (
          <div className="mt-4 table-responsive">
            <table className="w-full text-right text-xs xs:text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-2 xs:px-3 lg:px-4 py-2 xs:py-3 font-medium whitespace-nowrap">מספר סידורי</th>
                  <th className="px-2 xs:px-3 lg:px-4 py-2 xs:py-3 font-medium whitespace-nowrap hidden xs:table-cell">לקוח</th>
                  <th className="px-2 xs:px-3 lg:px-4 py-2 xs:py-3 font-medium whitespace-nowrap hidden sm:table-cell">טכנאי</th>
                  <th className="px-2 xs:px-3 lg:px-4 py-2 xs:py-3 font-medium whitespace-nowrap">תאריך</th>
                  <th className="px-2 xs:px-3 lg:px-4 py-2 xs:py-3 font-medium whitespace-nowrap">סטטוס</th>
                  <th className="px-2 xs:px-3 lg:px-4 py-2 xs:py-3 font-medium whitespace-nowrap">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentCalibrations.map((cal) => {
                  const scale = cal.scale;
                  const serial = scale?.serialMfg || scale?.serialInternal || "ללא מספר סידורי";
                  const customerName =
                    scale?.site?.customer?.name || cal.customer?.name || getCustomerName(cal.customerId) || "";
                  const calDate = cal.testDate || cal.submittedAt || "";

                  const technicianName = cal.technician?.name || "לא ידוע";

                  return (
                    <tr key={cal.id} className="hover:bg-slate-50">
                      <td className="px-2 xs:px-3 lg:px-4 py-2 xs:py-3 font-medium text-slate-900 text-xs xs:text-sm">
                        <div className="truncate max-w-[80px] xs:max-w-none" title={serial}>
                          {serial}
                        </div>
                      </td>
                      <td className="px-2 xs:px-3 lg:px-4 py-2 xs:py-3 text-slate-700 text-xs xs:text-sm hidden xs:table-cell">
                        <div className="truncate max-w-[100px]" title={customerName}>
                          {customerName}
                        </div>
                      </td>
                      <td className="px-2 xs:px-3 lg:px-4 py-2 xs:py-3 text-slate-700 text-xs xs:text-sm hidden sm:table-cell">
                        <div className="truncate max-w-[100px]" title={technicianName}>
                          {technicianName}
                        </div>
                      </td>
                      <td className="px-2 xs:px-3 lg:px-4 py-2 xs:py-3 text-slate-700 text-xs xs:text-sm whitespace-nowrap">
                        {calDate ? new Date(calDate).toLocaleDateString("he-IL", {
                          month: '2-digit',
                          day: '2-digit',
                          year: '2-digit'
                        }) : ""}
                      </td>
                      <td className="px-2 xs:px-3 lg:px-4 py-2 xs:py-3">
                        <StatusPill status={cal.status} />
                      </td>
                      <td className="px-2 xs:px-3 lg:px-4 py-2 xs:py-3">
                        <Link
                          to={`/admin/calibration-details?id=${cal.id}`}
                          className="inline-flex items-center gap-1 xs:gap-2 rounded-lg bg-violet-600 px-2 xs:px-3 py-1.5 xs:py-2 text-xs font-medium text-white hover:bg-violet-700 touch-target"
                        >
                          <span className="hidden xs:inline">צפה בפרטים</span>
                          <span className="xs:hidden">צפה</span>
                          <ChevronLeft className="h-3 w-3 xs:h-4 xs:w-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = String(status || '').toUpperCase();

  const map: Record<string, { label: string; cls: string }> = {
    DRAFT: { label: 'טיוטה', cls: 'bg-slate-100 text-slate-700' },
    SUBMITTED: { label: 'נשלח', cls: 'bg-blue-50 text-blue-700' },
    APPROVED: { label: 'אושר', cls: 'bg-emerald-50 text-emerald-700' },
    CERTIFICATE_ISSUED: { label: 'אושר', cls: 'bg-emerald-50 text-emerald-700' },
    REJECTED: { label: 'נדחה', cls: 'bg-rose-50 text-rose-700' },
  };

  const v = map[s] || { label: status, cls: 'bg-slate-100 text-slate-700' };

  return <span className={clsx('inline-flex rounded-full px-1.5 xs:px-2.5 py-0.5 xs:py-1 text-xs font-medium whitespace-nowrap', v.cls)}>{v.label}</span>;
}




