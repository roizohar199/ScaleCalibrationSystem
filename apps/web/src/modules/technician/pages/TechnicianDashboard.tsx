import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutGrid,
  ClipboardList,
  BadgeCheck,
  ClipboardCheck,
  Plus,
  ChevronLeft,
} from 'lucide-react';

import api from '../../../api/client';
import { useAuth } from '../../../auth/AuthProvider';

interface Scale {
  id: string;
  serialMfg: string | null;
  serialInternal: string | null;
  manufacturer: string | null;
  modelName: string | null;
  model?: {
    id: string;
    manufacturer: string;
    modelName: string;
    maxCapacity: number;
    unit: string;
    d: number;
    e: number;
    accuracyClass: string;
    defaultProfile?: {
      id: string;
      capacity: number;
      unit: string;
      d: number;
      e: number;
      accuracyCls: string;
    } | null;
  } | null;
  site?: {
    name: string;
    customer: {
      name: string;
    };
  } | null;
  customerId?: string | null;
  customer?: {
    name: string;
  } | null;
}

interface Profile {
  id: string;
  capacity: number;
  unit: string;
  d: number;
  e: number;
  accuracyCls: string;
  testPoints?: any[];
}

interface Calibration {
  id: string;
  status: string;
  calibrationDate?: string | null;
  testDate?: string | null;
  scale: Scale | null;
  profile?: Profile | null;
  measurements?: any[];
  customer?: {
    name: string;
  } | null;
  technician?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

function clsx(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(' ');
}

function TechnicianDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [calibrations, setCalibrations] = useState<Calibration[]>([]);


  useEffect(() => {
    loadData();
    // רענון אוטומטי כל 5 שניות כדי לראות עדכונים מהאדמין בזמן אמת
    const interval = setInterval(() => {
      loadData();
    }, 5000);
    
    // רענון כאשר המשתמש חוזר לדף (focus)
    const handleFocus = () => {
      loadData();
    };
    window.addEventListener('focus', handleFocus);
    
    // רענון כאשר המשתמש עושה פעילות בדף (visibility change)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]); // רענון גם כאשר המשתמש נווט לדף

  const loadData = async () => {
    try {
      // הוספת timestamp כדי למנוע caching
      const timestamp = Date.now();
      const calibrationsRes = await api.get('/calibrations', { 
        params: { 
          mine: '1',
          _t: timestamp // timestamp למניעת caching
        } 
      });
      setCalibrations(calibrationsRes.data || []);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading data:', error);
    }
  };


  const stats = useMemo(() => {
    const draft = calibrations.filter((c) => String(c.status).toUpperCase() === 'DRAFT').length;
    const submitted = calibrations.filter((c) => {
      const status = String(c.status).toUpperCase();
      return status === 'SUBMITTED' || status === 'IN_REVIEW';
    }).length;
    const approved = calibrations.filter((c) => {
      const status = String(c.status).toUpperCase();
      return status === 'APPROVED' || status === 'CERTIFICATE_ISSUED';
    }).length;
    const rejected = calibrations.filter((c) => String(c.status).toUpperCase() === 'REJECTED').length;
    return { draft, submitted, approved, rejected };
  }, [calibrations]);

  const recentCalibrations = useMemo(() => {
    const sorted = [...calibrations].sort(
      (a, b) => {
        const dateA = a.calibrationDate || a.testDate || '';
        const dateB = b.calibrationDate || b.testDate || '';
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      }
    );
    return sorted.slice(0, 10);
  }, [calibrations]);



  const handleSubmitCalibration = async (calibrationId: string) => {
    if (!confirm('האם אתה בטוח שברצונך לשלוח את הכיול לאישור?')) return;
    try {
      await api.post(`/calibrations/${calibrationId}/submit`);
      // רענון מיידי של הנתונים כדי לעדכן את הסטטיסטיקות
      // notify admin/office UI immediately
      window.dispatchEvent(new CustomEvent('calibrationStatusChanged'));
      await loadData();
    } catch (error: any) {
      alert(error.response?.data?.error || 'שגיאה בשליחת כיול');
    }
  };


  return (
    <div className="space-y-6">
        {/* Top header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-slate-900">
                שלום, {user?.name || "טכנאי"}
              </h1>

              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
                title="תפריט מהיר"
              >
                <LayoutGrid className="h-5 w-5 text-slate-700" />
              </button>
            </div>

            <p className="mt-1 text-sm text-slate-500">לוח בקרה לניהול כיולים</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => navigate('/technician/new-calibration')}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700"
            >
              <Plus className="h-4 w-4" />
              כיול חדש
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard title="נדחו" value={stats.rejected} tone="danger" icon={<BadgeCheck className="h-5 w-5" />} />
          <KpiCard title="אושרו" value={stats.approved} tone="success" icon={<BadgeCheck className="h-5 w-5" />} />
          <KpiCard title="נשלחו לאישור" value={stats.submitted} tone="info" icon={<ClipboardCheck className="h-5 w-5" />} />
          <KpiCard title="טיוטות" value={stats.draft} tone="warning" icon={<ClipboardList className="h-5 w-5" />} />
        </div>

        {/* Recent calibrations */}
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">כיולים אחרונים</h2>
          </div>

          {recentCalibrations.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 p-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                <ClipboardList className="h-6 w-6 text-slate-500" />
              </div>
              <div className="text-sm font-medium text-slate-900">אין כיולים עדכניים</div>
              <div className="mt-1 text-sm text-slate-500">כשתיצור כיול חדש הוא יופיע כאן.</div>
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">מספר סידורי</th>
                    <th className="px-4 py-3 font-medium">לקוח</th>
                    <th className="px-4 py-3 font-medium">טכנאי</th>
                    <th className="px-4 py-3 font-medium">תאריך</th>
                    <th className="px-4 py-3 font-medium">סטטוס</th>
                    <th className="px-4 py-3 font-medium">פעולות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentCalibrations.map((cal) => {
                    const serial = cal.scale?.serialMfg || cal.scale?.serialInternal || "ללא מספר סידורי";
                    const customerName =
                      cal.scale?.site?.customer?.name || cal.scale?.customer?.name || cal.customer?.name || "";
                    const calDate = cal.calibrationDate || cal.testDate || "";
                    const technicianName = cal.technician?.name || "לא ידוע";

                    return (
                      <tr key={cal.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{serial}</td>
                        <td className="px-4 py-3 text-slate-700">{customerName}</td>
                        <td className="px-4 py-3 text-slate-700">{technicianName}</td>
                        <td className="px-4 py-3 text-slate-700">
                          {calDate ? new Date(calDate).toLocaleDateString("he-IL") : ""}
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={cal.status} />
                        </td>
                        <td className="px-4 py-3">
                          {String(cal.status).toUpperCase() === "DRAFT" ? (
                            <button
                              onClick={() => handleSubmitCalibration(cal.id)}
                              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                            >
                              שלח לאישור
                              <ChevronLeft className="h-4 w-4" />
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
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

function KpiCard({
  title,
  value,
  tone,
  icon,
}: {
  title: string;
  value: number;
  tone: 'danger' | 'success' | 'info' | 'warning';
  icon?: React.ReactNode;
}) {
  const toneBar =
    tone === 'danger'
      ? 'bg-rose-500'
      : tone === 'success'
      ? 'bg-emerald-500'
      : tone === 'info'
      ? 'bg-blue-500'
      : 'bg-amber-500';

  const iconBg =
    tone === 'danger'
      ? 'bg-rose-50 text-rose-600'
      : tone === 'success'
      ? 'bg-emerald-50 text-emerald-600'
      : tone === 'info'
      ? 'bg-blue-50 text-blue-600'
      : 'bg-amber-50 text-amber-700';

  return (
    <div className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className={clsx('absolute left-0 top-0 h-1.5 w-full', toneBar)} />
      <div className="flex items-center justify-between p-5">
        <div>
          <div className="text-xs font-medium text-slate-500">{title}</div>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</div>
        </div>
        <div className={clsx('flex h-10 w-10 items-center justify-center rounded-2xl', iconBg)}>{icon}</div>
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

  return <span className={clsx('inline-flex rounded-full px-2.5 py-1 text-xs font-medium', v.cls)}>{v.label}</span>;
}

export default TechnicianDashboard;
