import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { Link, useSearchParams } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import PageHeader from '../modules/shared/components/PageHeader';
import StatusBadge from '../components/calibration/StatusBadge';
import MeasurementTable from '../components/calibration/MeasurementTable';
import { 
  FileCheck, 
  ArrowRight,
  Building2,
  Scale,
  Calendar,
  User,
  Thermometer,
  Droplets,
  CheckCircle,
  XCircle,
  Award,
  Edit,
  MessageSquare,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';

interface Calibration {
  id: string;
  status: string;
  testDate?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  scaleId?: string | null;
  customerId?: string | null;
  profileId?: string | null;
  overallStatus?: string | null;
  notes?: string | null;
  measurementsJson?: any;
  temperature?: string | null;
  humidity?: string | null;
  scale?: {
    id: string;
    serialMfg?: string | null;
    serialInternal?: string | null;
    manufacturer?: string | null;
    modelName?: string | null;
    model?: {
      manufacturer: string;
      modelName: string;
      maxCapacity?: number | null;
      unit?: string | null;
    } | null;
  } | null;
  customer?: {
    id: string;
    name: string;
    city?: string | null;
  } | null;
  profile?: {
    id: string;
    capacity?: number | null;
    unit?: string | null;
  } | null;
  nextDueDate?: string | null;
}

interface AuditLog {
  id: string;
  entity: string;
  entityId: string;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
  createdAt: string;
  changedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export default function CalibrationDetails() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const calibrationId = searchParams.get('id');
  
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);

  // Map page names to actual routes - check user role to determine correct route
  const isTechnician = user?.role === 'TECHNICIAN';
  const pageToRoute: Record<string, string> = isTechnician ? {
    'TechnicianDashboard': 'technician',
    'Customers': 'technician/customers',
    'Scales': 'technician/scales',
    'MyCalibrations': 'technician/my-calibrations',
    'NewCalibration': 'technician/new-calibration',
    'CalibrationDetails': 'technician/calibration-details',
  } : {
    'OfficeDashboard': 'admin',
    'Customers': 'admin/customers',
    'Scales': 'admin/scales',
    'ScaleModels': 'admin/scale-models',
    'MetrologicalProfiles': 'admin/metrological-profiles',
    'ApprovalDashboard': 'admin/approval',
    'Certificates': 'admin/certificates',
    'CustomerDetails': 'admin/customer-details',
    'ScaleDetails': 'admin/scale-details',
    'CalibrationDetails': 'admin/calibration-details',
  };

  // Helper function to create page URLs
  const createPageUrl = (page: string): string => {
    const params = new URLSearchParams(searchParams);
    const prefix = isTechnician ? 'technician' : 'admin';
    
    if (page.includes('?')) {
      const [pathName, query] = page.split('?');
      const route = pageToRoute[pathName] || `${prefix}/${pathName.toLowerCase()}`;
      const pageParams = new URLSearchParams(query);
      pageParams.forEach((value, key) => {
        params.set(key, value);
      });
      return `/${route}${params.toString() ? `?${params.toString()}` : ''}`;
    }
    
    const route = pageToRoute[page] || `${prefix}/${page.toLowerCase()}`;
    return `/${route}${params.toString() ? `?${params.toString()}` : ''}`;
  };

  useEffect(() => {
    if (calibrationId) {
      loadData();
    }
  }, [calibrationId]);

  const loadData = async () => {
    try {
      console.log('[CalibrationDetails] Loading calibration:', calibrationId);
      const [calRes, auditRes] = await Promise.all([
        api.get(`/calibrations/${calibrationId}`),
        api.get('/audit-logs', { params: { entity: 'Calibration', entityId: calibrationId } }).catch(() => ({ data: [] }))
      ]);
      
      console.log('[CalibrationDetails] API Response:', {
        hasData: !!calRes.data,
        hasMeasurementsJson: !!calRes.data?.measurementsJson,
        measurementsJsonType: typeof calRes.data?.measurementsJson,
        measurementsJsonValue: calRes.data?.measurementsJson ? JSON.stringify(calRes.data.measurementsJson).substring(0, 200) : null
      });
      
      setCalibration(calRes.data);
      
      // Try to get audit logs - if endpoint doesn't exist, we'll use empty array
      if (auditRes.data && Array.isArray(auditRes.data)) {
        setAuditLogs(auditRes.data);
      }
    } catch (error: any) {
      console.error('[CalibrationDetails] Error loading calibration:', error);
      if (error.response?.status === 404) {
        setCalibration(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const isOffice = user?.role === 'OFFICE' || user?.role === 'ADMIN';
  const canApprove = isOffice && calibration && (calibration.status === 'SUBMITTED' || calibration.status === 'IN_REVIEW');
  const canIssueCertificate = isOffice && calibration?.status === 'APPROVED';

  const handleApprove = async () => {
    if (!calibration) return;
    setProcessing(true);
    try {
      const response = await api.post(`/approvals/${calibration.id}/approve`, {
        comment: 'אושר על ידי המשרד'
      });
      loadData();
      // Trigger event to update pending count in Layout
      window.dispatchEvent(new CustomEvent('calibrationStatusChanged'));
      
      // הצגת הודעה על הנפקת תעודה אוטומטית
      if (response.data?.certificate) {
        alert('הכיול אושר ותעודה הונפקה אוטומטית!');
      } else if (response.data?.certificateError) {
        alert(`הכיול אושר, אך הייתה בעיה בהנפקת התעודה: ${response.data.certificateError}`);
      } else {
        alert('הכיול אושר בהצלחה!');
      }
    } catch (error: any) {
      console.error('Error approving:', error);
      alert(error.response?.data?.error || 'שגיאה באישור הכיול');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!calibration || !rejectReason) return;
    setProcessing(true);
    try {
      await api.post(`/calibrations/${calibration.id}/return`, {
        reason: rejectReason
      });
      setRejectDialogOpen(false);
      setRejectReason('');
      loadData();
      // Trigger event to update pending count in Layout
      window.dispatchEvent(new CustomEvent('calibrationStatusChanged'));
    } catch (error: any) {
      console.error('Error rejecting:', error);
      alert(error.response?.data?.error || 'שגיאה בדחיית הכיול');
    } finally {
      setProcessing(false);
    }
  };

  const handleIssueCertificate = async () => {
    if (!calibration) return;
    setProcessing(true);
    try {
      await api.post(`/certificates/${calibration.id}/issue`);
      loadData();
    } catch (error: any) {
      console.error('Error issuing certificate:', error);
      alert(error.response?.data?.error || 'שגיאה בהנפקת התעודה');
    } finally {
      setProcessing(false);
    }
  };

  const resultColors: Record<string, string> = {
    PASS: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    FAIL: 'bg-red-50 text-red-600 border-red-200',
    PENDING: 'bg-slate-50 text-slate-600 border-slate-200'
  };

  const resultLabels: Record<string, string> = {
    PASS: 'עבר',
    FAIL: 'נכשל',
    PENDING: 'ממתין'
  };

  // Parse measurements from JSON
  let measurementsJson: any = null;
  
  if (calibration?.measurementsJson) {
    try {
      if (typeof calibration.measurementsJson === 'string') {
        measurementsJson = JSON.parse(calibration.measurementsJson);
      } else {
        measurementsJson = calibration.measurementsJson;
      }
    } catch (error) {
      console.error('[CalibrationDetails] Error parsing measurementsJson:', error);
      measurementsJson = null;
    }
  }

  console.log('[CalibrationDetails] Raw measurementsJson:', calibration?.measurementsJson);
  console.log('[CalibrationDetails] Raw measurementsJson type:', typeof calibration?.measurementsJson);
  console.log('[CalibrationDetails] Parsed measurementsJson:', measurementsJson);
  console.log('[CalibrationDetails] Parsed measurementsJson type:', typeof measurementsJson);
  console.log('[CalibrationDetails] measurementsJson keys:', measurementsJson ? Object.keys(measurementsJson) : 'null');

  // תמיכה בשני מבנים: ישיר (ידני) ומקונן (מיובא)
  // מבנה מקונן: { imported: true, measurements: { accuracy: [], ... } }
  // מבנה ישיר: { accuracy: [], eccentricity: [], ... }
  let measurements: { accuracy: any[], eccentricity: any[], repeatability: any[] } = {
    accuracy: [],
    eccentricity: [],
    repeatability: []
  };
  
  if (measurementsJson) {
    // אם יש measurements בתוך measurementsJson (מבנה מקונן - מיובא)
    if (measurementsJson.measurements && typeof measurementsJson.measurements === 'object' && !Array.isArray(measurementsJson.measurements)) {
      console.log('[CalibrationDetails] Using nested structure (imported)');
      measurements = {
        accuracy: Array.isArray(measurementsJson.measurements.accuracy) ? measurementsJson.measurements.accuracy : [],
        eccentricity: Array.isArray(measurementsJson.measurements.eccentricity) ? measurementsJson.measurements.eccentricity : [],
        repeatability: Array.isArray(measurementsJson.measurements.repeatability) ? measurementsJson.measurements.repeatability : []
      };
    } 
    // אם יש accuracy ישירות ב-measurementsJson (מבנה ישיר - ידני)
    else if (measurementsJson.accuracy || measurementsJson.eccentricity || measurementsJson.repeatability) {
      console.log('[CalibrationDetails] Using direct structure (manual)');
      measurements = {
        accuracy: Array.isArray(measurementsJson.accuracy) ? measurementsJson.accuracy : [],
        eccentricity: Array.isArray(measurementsJson.eccentricity) ? measurementsJson.eccentricity : [],
        repeatability: Array.isArray(measurementsJson.repeatability) ? measurementsJson.repeatability : []
      };
    } else {
      console.warn('[CalibrationDetails] measurementsJson exists but has unexpected structure:', measurementsJson);
    }
  } else {
    console.warn('[CalibrationDetails] No measurementsJson found in calibration');
  }

  console.log('[CalibrationDetails] Final measurements:', measurements);
  console.log('[CalibrationDetails] accuracy count:', measurements.accuracy?.length || 0);
  console.log('[CalibrationDetails] eccentricity count:', measurements.eccentricity?.length || 0);
  console.log('[CalibrationDetails] repeatability count:', measurements.repeatability?.length || 0);
  
  // לוג מפורט של המדידות
  if (measurements.accuracy.length > 0) {
    console.log('[CalibrationDetails] First accuracy measurement:', measurements.accuracy[0]);
  }
  if (measurements.eccentricity.length > 0) {
    console.log('[CalibrationDetails] First eccentricity measurement:', measurements.eccentricity[0]);
  }
  if (measurements.repeatability.length > 0) {
    console.log('[CalibrationDetails] First repeatability measurement:', measurements.repeatability[0]);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!calibration) {
    return (
      <div className="p-6 lg:p-8">
        <div className="text-center py-12">
          <p className="text-slate-500">כיול לא נמצא</p>
          <Link to={createPageUrl(isTechnician ? 'TechnicianDashboard' : 'OfficeDashboard')}>
            <Button variant="outline" className="mt-4">
              <ArrowRight className="h-4 w-4 ml-2" />
              חזרה
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const scale = calibration.scale;
  const customer = calibration.customer;
  const scaleManufacturer = scale?.model?.manufacturer || scale?.manufacturer || '';
  const scaleModel = scale?.model?.modelName || scale?.modelName || '';
  const maxCapacity = scale?.model?.maxCapacity || null;
  const unit = scale?.model?.unit || null;

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mb-4">
        <Button variant="ghost" size="sm" className="text-slate-500" onClick={() => window.history.back()}>
          <ArrowRight className="h-4 w-4 ml-1" />
          חזרה
        </Button>
      </div>

      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-4 mb-6 md:mb-8">
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-800 truncate">
              פרטי כיול
            </h1>
            <StatusBadge status={calibration.status} />
          </div>
          <p className="text-sm md:text-base text-slate-500 truncate">
            {scaleManufacturer} {scaleModel} - {scale?.serialMfg || 'ללא מספר סידורי'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          {canApprove && (
            <>
              <Button
                onClick={handleApprove}
                disabled={processing}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-sm md:text-base"
              >
                <CheckCircle className="h-4 w-4 ml-2" />
                <span className="hidden sm:inline">אשר כיול</span>
                <span className="sm:hidden">אשר</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => setRejectDialogOpen(true)}
                disabled={processing}
                size="sm"
                className="text-red-600 border-red-200 hover:bg-red-50 text-sm md:text-base"
              >
                <XCircle className="h-4 w-4 ml-2" />
                דחה
              </Button>
            </>
          )}
          {canIssueCertificate && (
            <Button
              onClick={handleIssueCertificate}
              disabled={processing}
              size="sm"
              className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-sm md:text-base"
            >
              <Award className="h-4 w-4 ml-2" />
              <span className="hidden sm:inline">הנפק תעודה</span>
              <span className="sm:hidden">תעודה</span>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Info Panel */}
        <Card className="border-0 shadow-lg shadow-slate-200/50 overflow-hidden">
          <div className="p-4 md:p-6 border-b border-slate-100">
            <h2 className="text-base md:text-lg font-semibold text-slate-800">פרטים</h2>
          </div>
          <div className="p-4 md:p-6 space-y-3 md:space-y-4">
            {/* Scale Info */}
            {scale && (
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                  <Scale className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-800">{scaleManufacturer} {scaleModel}</p>
                  <p className="text-sm text-slate-500">{scale.serialMfg || 'ללא מספר סידורי'}</p>
                  {maxCapacity && unit && (
                    <p className="text-sm text-slate-400">{maxCapacity} {unit}</p>
                  )}
                </div>
              </div>
            )}

            {/* Customer Info */}
            {customer && (
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Building2 className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-800">{customer.name}</p>
                  {customer.city && <p className="text-sm text-slate-500">{customer.city}</p>}
                </div>
              </div>
            )}

            {/* Dates */}
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                <Calendar className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">תאריך כיול</p>
                <p className="font-medium text-slate-800">
                  {calibration.testDate && format(new Date(calibration.testDate), 'dd/MM/yyyy')}
                </p>
                {calibration.nextDueDate && (
                  <p className="text-sm text-slate-400">
                    תפוגה: {format(new Date(calibration.nextDueDate), 'dd/MM/yyyy')}
                  </p>
                )}
              </div>
            </div>

            {/* Environment */}
            {(calibration.temperature || calibration.humidity) && (
              <div className="grid grid-cols-2 gap-3 md:gap-4 pt-3 md:pt-4 border-t border-slate-100">
                {calibration.temperature && (
                  <div className="flex items-center gap-2">
                    <Thermometer className="h-4 w-4 text-slate-400" />
                    <span className="text-sm text-slate-600">
                      {calibration.temperature}°C
                    </span>
                  </div>
                )}
                {calibration.humidity && (
                  <div className="flex items-center gap-2">
                    <Droplets className="h-4 w-4 text-slate-400" />
                    <span className="text-sm text-slate-600">
                      {calibration.humidity}%
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Result */}
            <div className="pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">תוצאה כללית</span>
                <Badge variant="outline" className={resultColors[calibration.overallStatus || 'PENDING'] || resultColors.PENDING}>
                  {calibration.overallStatus === 'PASS' && <CheckCircle className="h-3 w-3 ml-1" />}
                  {calibration.overallStatus === 'FAIL' && <XCircle className="h-3 w-3 ml-1" />}
                  {resultLabels[calibration.overallStatus || 'PENDING'] || 'ממתין'}
                </Badge>
              </div>
            </div>

            {/* Notes */}
            {calibration.notes && (
              <div className="pt-4 border-t border-slate-100">
                <p className="text-sm text-slate-500 mb-2">הערות</p>
                <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">
                  {calibration.notes}
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Measurements Panel */}
        <div className="lg:col-span-2 xl:col-span-2">
          <Card className="border-0 shadow-lg shadow-slate-200/50 overflow-hidden">
            <Tabs defaultValue="accuracy" dir="rtl">
              <div className="border-b border-slate-100">
                <TabsList className="w-full justify-start p-0 h-auto bg-transparent">
                  <TabsTrigger
                    value="accuracy"
                    className="px-3 md:px-6 py-3 md:py-4 text-sm md:text-base data-[state=active]:border-b-2 data-[state=active]:border-violet-500 rounded-none"
                  >
                    דיוק
                  </TabsTrigger>
                  <TabsTrigger
                    value="eccentricity"
                    className="px-3 md:px-6 py-3 md:py-4 text-sm md:text-base data-[state=active]:border-b-2 data-[state=active]:border-violet-500 rounded-none"
                  >
                    אי מרכזיות
                  </TabsTrigger>
                  <TabsTrigger
                    value="repeatability"
                    className="px-3 md:px-6 py-3 md:py-4 text-sm md:text-base data-[state=active]:border-b-2 data-[state=active]:border-violet-500 rounded-none"
                  >
                    הדירות
                  </TabsTrigger>
                  <TabsTrigger
                    value="audit"
                    className="px-3 md:px-6 py-3 md:py-4 text-sm md:text-base data-[state=active]:border-b-2 data-[state=active]:border-violet-500 rounded-none"
                  >
                    היסטוריה
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="accuracy" className="m-0">
                <div className="p-4 md:p-6">
                  <MeasurementTable
                    type="accuracy"
                    measurements={measurements.accuracy || []}
                    onMeasurementChange={() => {}}
                    readOnly={true}
                  />
                </div>
              </TabsContent>

              <TabsContent value="eccentricity" className="m-0">
                <div className="p-4 md:p-6">
                  <MeasurementTable
                    type="eccentricity"
                    measurements={measurements.eccentricity || []}
                    onMeasurementChange={() => {}}
                    readOnly={true}
                  />
                </div>
              </TabsContent>

              <TabsContent value="repeatability" className="m-0">
                <div className="p-4 md:p-6">
                  <MeasurementTable
                    type="repeatability"
                    measurements={measurements.repeatability || []}
                    onMeasurementChange={() => {}}
                    readOnly={true}
                  />
                </div>
              </TabsContent>

              <TabsContent value="audit" className="m-0">
                <div className="p-4 md:p-6">
                  <div className="space-y-4">
                    {auditLogs.length === 0 ? (
                      <p className="text-center text-slate-500 py-8">אין רשומות</p>
                    ) : (
                      auditLogs.map((log) => (
                        <div key={log.id} className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg">
                          <div className="h-8 w-8 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                            <Clock className="h-4 w-4 text-violet-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-slate-800">
                                {log.field ? `שינוי ב-${log.field}` : 'שינוי'}
                              </p>
                              <span className="text-xs text-slate-400">
                                {format(new Date(log.createdAt), 'dd/MM/yyyy HH:mm')}
                              </span>
                            </div>
                            {log.changedBy && (
                              <p className="text-sm text-slate-500">{log.changedBy.email || log.changedBy.name}</p>
                            )}
                            {log.oldValue && log.newValue && (
                              <p className="text-sm text-slate-600 mt-1">
                                {log.oldValue} → {log.newValue}
                              </p>
                            )}
                            {log.reason && (
                              <p className="text-sm text-slate-600 mt-1">{log.reason}</p>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>דחיית כיול</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label>סיבת הדחייה</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="פרט את סיבת הדחייה..."
              rows={4}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              ביטול
            </Button>
            <Button 
              onClick={handleReject}
              disabled={!rejectReason || processing}
              className="bg-red-600 hover:bg-red-700"
            >
              {processing ? 'שולח...' : 'דחה כיול'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

