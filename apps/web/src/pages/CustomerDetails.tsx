import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { Link, useSearchParams } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import PageHeader from '../modules/shared/components/PageHeader';
import StatusBadge from '../components/calibration/StatusBadge';
import { 
  Building2, 
  Phone,
  MapPin,
  Scale,
  FileCheck,
  Plus,
  ArrowRight,
  Edit,
  Save,
  User,
  Hash
} from 'lucide-react';
import { format } from 'date-fns';

interface Customer {
  id: string;
  name: string;
  taxId?: string | null;
  customerNo?: string | null;
  address?: string | null;
  contact?: string | null;
  phone?: string | null;
}

interface ScaleData {
  id: string;
  serialMfg?: string | null;
  serialInternal?: string | null;
  manufacturer?: string | null;
  modelName?: string | null;
  model?: {
    manufacturer: string;
    modelName: string;
    maxCapacity?: number;
    unit?: string;
  } | null;
  nextDueDate?: string | null;
}

interface Calibration {
  id: string;
  status: string;
  testDate?: string | null;
  scaleId?: string | null;
  scale?: ScaleData | null;
}

export default function CustomerDetails() {
  const [searchParams] = useSearchParams();
  const customerId = searchParams.get('id');
  
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [scales, setScales] = useState<ScaleData[]>([]);
  const [calibrations, setCalibrations] = useState<Calibration[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Customer>>({});
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
    if (customerId) {
      loadData();
    }
  }, [customerId]);

  const loadData = async () => {
    try {
      const [customerRes, customerDetailsRes] = await Promise.all([
        api.get('/customers'),
        customerId ? api.get(`/customers/${customerId}`) : Promise.resolve({ data: null })
      ]);

      if (customerDetailsRes.data) {
        const customerData = customerDetailsRes.data;
        const transformedCustomer: Customer = {
          id: customerData.id,
          name: customerData.name,
          taxId: customerData.taxId || null,
          customerNo: customerData.customerNo || null,
          address: customerData.address || null,
          contact: customerData.contact || null,
          phone: customerData.phone || null,
        };
        setCustomer(transformedCustomer);
        setEditData(transformedCustomer);
        
        // Get scales from customer details
        const scalesData = customerData.scales || [];
        
        // Get calibrations for this customer to calculate nextDueDate for scales
        if (customerId) {
          const calibrationsRes = await api.get('/calibrations');
          const filteredCalibrations = (calibrationsRes.data || []).filter(
            (cal: any) => cal.customerId === customerId
          );
          setCalibrations(filteredCalibrations);
          
          // Calculate nextDueDate for each scale
          const scalesWithDates = scalesData.map((scale: any) => {
            const scaleCalibrations = filteredCalibrations
              .filter((cal: any) => cal.scaleId === scale.id)
              .filter((cal: any) => cal.status === 'APPROVED' || cal.status === 'CERTIFICATE_ISSUED')
              .sort((a: any, b: any) => {
                const dateA = a.testDate ? new Date(a.testDate).getTime() : 0;
                const dateB = b.testDate ? new Date(b.testDate).getTime() : 0;
                return dateB - dateA;
              });
            
            const lastCalibration = scaleCalibrations[0];
            const nextDueDate = lastCalibration?.nextDueDate || null;
            
            return {
              ...scale,
              nextDueDate
            };
          });
          
          setScales(scalesWithDates);
        } else {
          setScales(scalesData);
        }
      }
    } catch (error) {
      console.error('Error loading customer:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!customerId) return;
    setSaving(true);
    try {
      await api.put(`/customers/${customerId}`, {
        name: editData.name,
        taxId: editData.taxId,
        contact: editData.contact,
        phone: editData.phone,
        address: editData.address,
      });
      setCustomer({ ...customer!, ...editData });
      setEditing(false);
      loadData(); // Reload to get updated data
    } catch (error) {
      console.error('Error saving customer:', error);
      alert('שגיאה בשמירת הלקוח');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6 lg:p-8">
        <div className="text-center py-12">
          <p className="text-slate-500">לקוח לא נמצא</p>
          <Link to="/customers">
            <Button variant="outline" className="mt-4">
              <ArrowRight className="h-4 w-4 ml-2" />
              חזרה לרשימת הלקוחות
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-4">
        <Link to={createPageUrl('Customers')}>
          <Button variant="ghost" size="sm" className="text-slate-500">
            <ArrowRight className="h-4 w-4 ml-1" />
            חזרה לרשימת הלקוחות
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 xs:gap-6">
        {/* Scales and Calibrations - Left Side (2 columns) */}
        <div className="lg:col-span-2">
          <Card className="border-0 shadow-lg shadow-slate-200/50 overflow-hidden">
            <Tabs defaultValue="scales" dir="rtl">
              <div className="border-b border-slate-100">
                <TabsList className="w-full justify-start p-0 h-auto bg-transparent">
                  <TabsTrigger 
                    value="scales" 
                    className="px-6 py-4 data-[state=active]:border-b-2 data-[state=active]:border-violet-500 rounded-none flex items-center gap-2"
                  >
                    <Scale className="h-4 w-4" />
                    דגמי משקלים ({scales.length})
                  </TabsTrigger>
                  <TabsTrigger 
                    value="calibrations"
                    className="px-6 py-4 data-[state=active]:border-b-2 data-[state=active]:border-violet-500 rounded-none flex items-center gap-2"
                  >
                    <FileCheck className="h-4 w-4" />
                    כיולים ({calibrations.length})
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="scales" className="m-0">
                <div className="p-6">
                  <div className="mb-4">
                    <span className="text-sm text-slate-500">{scales.length} דגמי משקלים</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {scales.length === 0 ? (
                      <div className="p-6 text-center text-slate-500">
                        אין דגמי משקלים ללקוח זה
                      </div>
                    ) : (
                      scales.map((scale) => (
                        <Link
                          key={scale.id}
                          to={createPageUrl(`ScaleDetails?id=${scale.id}`)}
                          className="block p-4 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1">
                              <div className="h-10 w-10 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                                <Scale className="h-5 w-5 text-violet-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-700 truncate">
                                  {scale.model?.manufacturer || scale.manufacturer} {scale.model?.modelName || scale.modelName}
                                </p>
                                <p className="text-sm text-slate-500 truncate">
                                  {scale.serialMfg || scale.serialInternal || 'ללא מספר סידורי'}
                                </p>
                              </div>
                            </div>
                            <div className="text-left flex-shrink-0 mr-4">
                              {scale.model?.maxCapacity && scale.model?.unit && (
                                <p className="text-sm text-slate-600 font-medium">
                                  {scale.model.maxCapacity} {scale.model.unit}
                                </p>
                              )}
                              {scale.nextDueDate && (
                                <p className="text-xs text-slate-400 mt-1">
                                  כיול הבא: {format(new Date(scale.nextDueDate), 'dd/MM/yyyy')}
                                </p>
                              )}
                            </div>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="calibrations" className="m-0">
                <div className="p-6">
                  <div className="mb-4">
                    <span className="text-sm text-slate-500">{calibrations.length} כיולים</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {calibrations.length === 0 ? (
                      <div className="p-6 text-center text-slate-500">
                        אין כיולים ללקוח זה
                      </div>
                    ) : (
                      calibrations.map((calibration) => {
                        const scale = calibration.scale || scales.find(s => s.id === calibration.scaleId);
                        return (
                          <Link
                            key={calibration.id}
                            to={createPageUrl(`CalibrationDetails?id=${calibration.id}`)}
                            className="block p-4 hover:bg-slate-50 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-slate-700">
                                  {scale?.model?.manufacturer || scale?.manufacturer} {scale?.model?.modelName || scale?.modelName}
                                </p>
                                <p className="text-sm text-slate-500">
                                  {scale?.serialMfg || scale?.serialInternal || 'ללא מספר סידורי'}
                                </p>
                              </div>
                              <div className="text-left">
                                <StatusBadge status={calibration.status} />
                                <p className="text-xs text-slate-400 mt-1">
                                  {calibration.testDate && format(new Date(calibration.testDate), 'dd/MM/yyyy')}
                                </p>
                              </div>
                            </div>
                          </Link>
                        );
                      })
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        {/* Customer Info Card - Right Side (1 column) */}
        <Card className="border-0 shadow-lg shadow-slate-200/50 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">פרטי לקוח</h2>
              {!editing ? (
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                  <Edit className="h-4 w-4 ml-1" />
                  עריכה
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setEditData(customer); }}>
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
                <div>
                  <Label>שם לקוח *</Label>
                  <Input
                    value={editData.name || ''}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>ח.פ/ע.מ *</Label>
                  <Input
                    value={editData.taxId || ''}
                    onChange={(e) => setEditData({ ...editData, taxId: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>מס' לקוח</Label>
                  <Input
                    value={editData.customerNo || ''}
                    disabled
                    className="bg-slate-50"
                  />
                </div>
                <div>
                  <Label>איש קשר *</Label>
                  <Input
                    value={editData.contact || ''}
                    onChange={(e) => setEditData({ ...editData, contact: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>טלפון *</Label>
                  <Input
                    value={editData.phone || ''}
                    onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>כתובת *</Label>
                  <Textarea
                    value={editData.address || ''}
                    onChange={(e) => setEditData({ ...editData, address: e.target.value })}
                    rows={3}
                    required
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-800 mb-3">{customer.name}</h3>
                </div>

                  <div className="flex items-center gap-3 text-slate-600">
                  <Hash className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-500">ח.פ/ע.מ:</span>
                  <span>{customer.taxId || '-'}</span>
                  </div>

                  <div className="flex items-center gap-3 text-slate-600">
                  <Hash className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-500">מס' לקוח:</span>
                  <span>{customer.customerNo || '-'}</span>
                  </div>

                  <div className="flex items-center gap-3 text-slate-600">
                  <User className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-500">איש קשר:</span>
                  <span>{customer.contact || '-'}</span>
                  </div>

                  <div className="flex items-center gap-3 text-slate-600">
                  <Phone className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-500">טלפון:</span>
                  <span>{customer.phone || '-'}</span>
                  </div>

                <div className="flex items-start gap-3 text-slate-600">
                  <MapPin className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm font-medium text-slate-500">כתובת:</span>
                  <span>{customer.address || '-'}</span>
                  </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

