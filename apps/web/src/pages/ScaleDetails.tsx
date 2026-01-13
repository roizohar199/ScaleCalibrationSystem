import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { Link, useSearchParams } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import PageHeader from '../modules/shared/components/PageHeader';
import StatusBadge from '../components/calibration/StatusBadge';
import { 
  Scale, 
  ArrowRight,
  Building2,
  Calendar,
  Edit,
  Save,
  FileCheck,
  Plus,
  MapPin
} from 'lucide-react';
import { format, isBefore } from 'date-fns';

interface ScaleData {
  id: string;
  serialMfg?: string | null;
  serialInternal?: string | null;
  manufacturer?: string | null;
  modelName?: string | null;
  deviceType?: string | null;
  customerId?: string | null;
  model?: {
    manufacturer: string;
    modelName: string;
    maxCapacity?: number | null;
    unit?: string | null;
    d?: number | null;
    e?: number | null;
    accuracyClass?: string | null;
  } | null;
  customer?: {
    id: string;
    name: string;
  } | null;
  lastCalibrationDate?: string | null;
  nextDueDate?: string | null;
}

interface Calibration {
  id: string;
  status: string;
  testDate?: string | null;
  overallStatus?: string | null;
  technician?: {
    email: string;
  } | null;
}

export default function ScaleDetails() {
  const [searchParams] = useSearchParams();
  const scaleId = searchParams.get('id');
  
  const [scale, setScale] = useState<ScaleData | null>(null);
  const [calibrations, setCalibrations] = useState<Calibration[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [saving, setSaving] = useState(false);

  // Map page names to actual routes for admin
  const pageToRoute: Record<string, string> = {
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
    
    if (page.includes('?')) {
      const [pathName, query] = page.split('?');
      const route = pageToRoute[pathName] || `admin/${pathName.toLowerCase()}`;
      const pageParams = new URLSearchParams(query);
      pageParams.forEach((value, key) => {
        params.set(key, value);
      });
      return `/${route}${params.toString() ? `?${params.toString()}` : ''}`;
    }
    
    const route = pageToRoute[page] || `admin/${page.toLowerCase()}`;
    return `/${route}${params.toString() ? `?${params.toString()}` : ''}`;
  };

  useEffect(() => {
    if (scaleId) {
      loadData();
    }
  }, [scaleId]);

  const loadData = async () => {
    try {
      const [scaleRes, calibrationsRes] = await Promise.all([
        api.get(`/scales/${scaleId}`),
        api.get('/calibrations', { params: { scaleId } })
      ]);
      
      const scaleData = scaleRes.data;
      const calibrationsData = calibrationsRes.data || [];
      
      // Calculate lastCalibrationDate and nextDueDate from calibrations
      const approvedCalibrations = calibrationsData
        .filter((cal: any) => cal.status === 'APPROVED' || cal.status === 'CERTIFICATE_ISSUED')
        .sort((a: any, b: any) => {
          const dateA = a.testDate ? new Date(a.testDate).getTime() : 0;
          const dateB = b.testDate ? new Date(b.testDate).getTime() : 0;
          return dateB - dateA;
        });
      
      const lastCalibration = approvedCalibrations[0];
      const lastCalibrationDate = lastCalibration?.testDate || null;
      const nextDueDate = lastCalibration?.nextDueDate || null;
      
      // Add calculated dates to scale data
      const scaleWithDates = {
        ...scaleData,
        lastCalibrationDate,
        nextDueDate
      };
      
      setScale(scaleWithDates);
      setEditData({
        manufacturer: scaleData.model?.manufacturer || scaleData.manufacturer || '',
        model: scaleData.model?.modelName || scaleData.modelName || '',
        max_capacity: scaleData.model?.maxCapacity?.toString() || '',
        unit: scaleData.model?.unit || 'kg',
        d_value: scaleData.model?.d?.toString() || '',
        e_value: scaleData.model?.e?.toString() || '',
        accuracy_class: scaleData.model?.accuracyClass || '',
        location: '', // API doesn't have location field
        status: 'active', // Default status
      });
      
      setCalibrations(calibrationsData);
    } catch (error: any) {
      console.error('Error loading scale:', error);
      if (error.response?.status === 404) {
        setScale(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!scaleId) return;
    setSaving(true);
    try {
      await api.put(`/scales/${scaleId}`, {
        manufacturer: editData.manufacturer || null,
        modelName: editData.model || null,
        deviceType: 'electronic', // Default
      });
      loadData();
      setEditing(false);
    } catch (error: any) {
      console.error('Error saving scale:', error);
      alert(error.response?.data?.error || 'שגיאה בשמירת משקל');
    } finally {
      setSaving(false);
    }
  };

  const statusColors: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    inactive: 'bg-slate-50 text-slate-600 border-slate-200',
    maintenance: 'bg-amber-50 text-amber-600 border-amber-200',
    retired: 'bg-red-50 text-red-600 border-red-200'
  };

  const statusLabels: Record<string, string> = {
    active: 'פעיל',
    inactive: 'לא פעיל',
    maintenance: 'בתחזוקה',
    retired: 'יצא משימוש'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!scale) {
    return (
      <div className="p-6 lg:p-8">
        <div className="text-center py-12">
          <p className="text-slate-500">משקל לא נמצא</p>
          <Link to={createPageUrl('Scales')}>
            <Button variant="outline" className="mt-4">
              <ArrowRight className="h-4 w-4 ml-2" />
              חזרה לרשימת דגמי המשקלים
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const scaleManufacturer = scale.model?.manufacturer || scale.manufacturer || '';
  const scaleModel = scale.model?.modelName || scale.modelName || '';
  const maxCapacity = scale.model?.maxCapacity || null;
  const unit = scale.model?.unit || null;
  const dValue = scale.model?.d || null;
  const eValue = scale.model?.e || null;
  const accuracyClass = scale.model?.accuracyClass || null;
  const isCalibrationOverdue = scale.nextDueDate && isBefore(new Date(scale.nextDueDate), new Date());

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-4">
        <Link to={createPageUrl('Scales')}>
          <Button variant="ghost" size="sm" className="text-slate-500">
            <ArrowRight className="h-4 w-4 ml-1" />
            חזרה לרשימת המשקלות
          </Button>
        </Link>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Scale className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">
              {scaleManufacturer} {scaleModel}
            </h1>
            <p className="text-slate-500">{scale.serialMfg || scale.serialInternal || 'ללא מספר סידורי'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 xs:gap-6">
        {/* Calibrations - Left Side (2 columns) */}
        <div className="lg:col-span-2">
          <Card className="border-0 shadow-lg shadow-slate-200/50 overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-800">היסטוריית כיולים</h2>
                <span className="text-sm text-slate-500">{calibrations.length} כיולים</span>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {calibrations.length === 0 ? (
                <div className="p-6 text-center text-slate-500">
                  אין כיולים למשקל זה
                </div>
              ) : (
                calibrations.map((calibration) => (
                  <Link
                    key={calibration.id}
                    to={createPageUrl(`CalibrationDetails?id=${calibration.id}`)}
                    className="block p-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-violet-50 flex items-center justify-center">
                          <FileCheck className="h-5 w-5 text-violet-500" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-700">
                            כיול {calibration.testDate && format(new Date(calibration.testDate), 'dd/MM/yyyy')}
                          </p>
                          <p className="text-sm text-slate-500">
                            {calibration.technician?.email || 'לא ידוע'}
                          </p>
                        </div>
                      </div>
                      <div className="text-left">
                        <StatusBadge status={calibration.status} />
                        <p className={`text-xs mt-1 ${
                          calibration.overallStatus === 'PASS' ? 'text-emerald-600' :
                          calibration.overallStatus === 'FAIL' ? 'text-red-600' :
                          'text-slate-400'
                        }`}>
                          {calibration.overallStatus === 'PASS' ? 'עבר' :
                           calibration.overallStatus === 'FAIL' ? 'נכשל' : 'ממתין'}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Scale Info Card - Right Side (1 column) */}
        <Card className="border-0 shadow-lg shadow-slate-200/50 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">פרטי משקל</h2>
              {!editing ? (
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                  <Edit className="h-4 w-4 ml-1" />
                  עריכה
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(false); loadData(); }}>
                    ביטול
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving} className="bg-violet-600 hover:bg-violet-700">
                    <Save className="h-4 w-4 ml-1" />
                    {saving ? 'שומר...' : 'שמור'}
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div className="p-6">
            {editing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>יצרן</Label>
                    <Input
                      value={editData.manufacturer || ''}
                      onChange={(e) => setEditData({ ...editData, manufacturer: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>דגם</Label>
                    <Input
                      value={editData.model || ''}
                      onChange={(e) => setEditData({ ...editData, model: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>כושר העמסה</Label>
                    <Input
                      type="number"
                      value={editData.max_capacity || ''}
                      onChange={(e) => setEditData({ ...editData, max_capacity: e.target.value })}
                      disabled
                    />
                  </div>
                  <div>
                    <Label>יחידה</Label>
                    <Select 
                      value={editData.unit || 'kg'} 
                      onValueChange={(value) => setEditData({ ...editData, unit: value })}
                      disabled
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="g">g</SelectItem>
                        <SelectItem value="mg">mg</SelectItem>
                        <SelectItem value="ton">טון</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>מיקום</Label>
                  <Input
                    value={editData.location || ''}
                    onChange={(e) => setEditData({ ...editData, location: e.target.value })}
                    disabled
                  />
                </div>
                <div>
                  <Label>סטטוס</Label>
                  <Select 
                    value={editData.status || 'active'} 
                    onValueChange={(value) => setEditData({ ...editData, status: value })}
                    disabled
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">פעיל</SelectItem>
                      <SelectItem value="inactive">לא פעיל</SelectItem>
                      <SelectItem value="maintenance">בתחזוקה</SelectItem>
                      <SelectItem value="retired">יצא משימוש</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Customer */}
                {scale.customer && (
                  <div className="flex items-start gap-3 mb-4">
                    <Building2 className="h-4 w-4 text-slate-400 flex-shrink-0 mt-1" />
                    <div>
                      <p className="text-sm text-slate-500">לקוח</p>
                      <Link to={createPageUrl(`CustomerDetails?id=${scale.customer.id}`)} className="font-medium text-slate-800 hover:text-violet-600">
                        {scale.customer.name}
                      </Link>
                    </div>
                  </div>
                )}

                {/* Status */}
                <div className="flex items-center justify-between py-3 border-t border-slate-100">
                  <span className="text-slate-500">סטטוס</span>
                  <Badge variant="outline" className={statusColors['active'] || statusColors.active}>
                    {statusLabels['active'] || 'פעיל'}
                  </Badge>
                </div>

                {/* Specs */}
                {maxCapacity && unit && (
                  <div className="py-3 border-t border-slate-100">
                    <p className="text-sm text-slate-500 mb-1">כושר העמסה</p>
                    <p className="font-medium text-slate-800">{maxCapacity} {unit}</p>
                  </div>
                )}
                {accuracyClass && (
                  <div className="py-3 border-t border-slate-100">
                    <p className="text-sm text-slate-500 mb-1">רמת דיוק</p>
                    <p className="font-medium text-slate-800">{accuracyClass}</p>
                  </div>
                )}
                {dValue && (
                  <div className="py-3 border-t border-slate-100">
                    <p className="text-sm text-slate-500 mb-1">ערך d</p>
                    <p className="font-medium text-slate-800">{dValue}</p>
                  </div>
                )}
                {eValue && (
                  <div className="py-3 border-t border-slate-100">
                    <p className="text-sm text-slate-500 mb-1">ערך e</p>
                    <p className="font-medium text-slate-800">{eValue}</p>
                  </div>
                )}

                {/* Calibration Dates */}
                <div className="py-3 border-t border-slate-100">
                  <div className="flex items-start gap-3">
                    <Calendar className="h-4 w-4 text-slate-400 flex-shrink-0 mt-1" />
                    <div>
                      <p className="text-sm text-slate-500 mb-1">כיול אחרון</p>
                      <p className="font-medium text-slate-800">
                        {scale.lastCalibrationDate ? format(new Date(scale.lastCalibrationDate), 'dd/MM/yyyy') : 'לא בוצע'}
                      </p>
                      {scale.nextDueDate && (
                        <p className={`text-sm mt-1 ${isCalibrationOverdue ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                          כיול הבא: {format(new Date(scale.nextDueDate), 'dd/MM/yyyy')}
                          {isCalibrationOverdue && ' (באיחור)'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

      </div>
    </div>
  );
}

