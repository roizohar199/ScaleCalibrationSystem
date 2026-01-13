import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { Link, useSearchParams } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import PageHeader from '../modules/shared/components/PageHeader';
import DataTable from '../modules/shared/components/DataTable';
import { 
  Scale, 
  Plus,
  Building2,
  Calendar
} from 'lucide-react';
import { format } from 'date-fns';

interface ScaleData {
  id: string;
  manufacturer_serial?: string | null;
  internal_serial?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  customer_id?: string | null;
  max_capacity?: number | null;
  unit?: string | null;
  accuracy_class?: string | null;
  next_calibration_date?: string | null;
  status?: string;
}

interface Customer {
  id: string;
  name: string;
}

interface ScaleModel {
  id: string;
  manufacturer: string;
  model_name: string;
  device_type?: string;
  max_capacity?: number;
  unit?: string;
  d_value?: number;
  e_value?: number;
  accuracy_class?: string;
}

export default function Scales() {
  const [searchParams] = useSearchParams();
  const filterCustomerId = searchParams.get('customer_id');
  
  const [scales, setScales] = useState<ScaleData[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [scaleModels, setScaleModels] = useState<ScaleModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    customer_id: filterCustomerId || '',
    scale_model_id: '',
    manufacturer_serial: '',
    internal_serial: '',
    manufacturer: '',
    manufacturer_custom: '',
    model: '',
    model_name: '',
    device_type: 'electronic',
    // שדות ScaleModel
    max_capacity: '',
    unit: 'kg',
    d_value: '',
    e_value: '',
    accuracy_class: 'III',
    create_new_model: false, // האם ליצור דגם חדש
  });
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
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [scalesRes, customersRes, modelsRes] = await Promise.all([
        api.get('/scales'),
        api.get('/customers'),
        api.get('/scale-models')
      ]);
      
      // Transform scales
      const transformedScales = (scalesRes.data || []).map((scale: any) => ({
        id: scale.id,
        manufacturer_serial: scale.serialMfg,
        internal_serial: scale.serialInternal,
        manufacturer: scale.model?.manufacturer || scale.manufacturer || '',
        model: scale.model?.modelName || scale.modelName || '',
        customer_id: scale.customerId || scale.site?.customerId,
        max_capacity: scale.model?.maxCapacity || null,
        unit: scale.model?.unit || null,
        accuracy_class: scale.model?.accuracyClass || null,
        next_calibration_date: scale.nextDueDate,
        status: 'active',
      }));
      
      // Transform scale models
      const transformedModels = (modelsRes.data || []).map((model: any) => ({
        id: model.id,
        manufacturer: model.manufacturer,
        model_name: model.modelName,
        device_type: 'electronic',
        max_capacity: model.maxCapacity,
        unit: model.unit,
        d_value: model.d,
        e_value: model.e,
        accuracy_class: model.accuracyClass,
      }));
      
      setScales(transformedScales);
      setCustomers(customersRes.data || []);
      setScaleModels(transformedModels);
    } catch (error) {
      console.error('Error loading scales:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCustomerName = (customerId?: string | null) => {
    if (!customerId) return 'לא ידוע';
    const customer = customers.find(c => c.id === customerId);
    return customer?.name || 'לא ידוע';
  };

  const handleSave = async () => {
    if (!formData.customer_id || !formData.manufacturer_serial) {
      alert('נדרש לקוח ומספר סידורי יצרן');
      return;
    }
    setSaving(true);
    try {
      let modelId = formData.scale_model_id || null;
      
      // אם המשתמש בחר ליצור דגם חדש, ניצור אותו קודם
      if (formData.create_new_model && formData.manufacturer && (formData.model_name || formData.model)) {
        try {
          const manufacturer = formData.manufacturer === 'אחר' ? formData.manufacturer_custom : formData.manufacturer;
          const modelName = formData.model_name || formData.model;
          
          if (!manufacturer || !modelName) {
            alert('נדרש יצרן ושם דגם ליצירת דגם חדש');
            setSaving(false);
            return;
          }
          
          const scaleModelData = {
            manufacturer,
            modelName,
            maxCapacity: formData.max_capacity ? parseFloat(formData.max_capacity) : 0,
            unit: formData.unit,
            d: formData.d_value ? parseFloat(formData.d_value) : 0,
            e: formData.e_value ? parseFloat(formData.e_value) : 0,
            accuracyClass: formData.accuracy_class,
          };
          
          const modelResponse = await api.post('/scale-models', scaleModelData);
          modelId = modelResponse.data.id;
        } catch (error: any) {
          console.error('Error creating scale model:', error);
          alert(error.response?.data?.error || 'שגיאה ביצירת דגם חדש');
          setSaving(false);
          return;
        }
      }
      
      // יצירת המשקל
      await api.post('/scales', {
        customerId: formData.customer_id,
        modelId: modelId,
        manufacturer: formData.manufacturer === 'אחר' ? formData.manufacturer_custom : (formData.manufacturer || null),
        deviceType: formData.device_type || 'electronic',
        modelName: formData.model_name || formData.model || null,
        serialMfg: formData.manufacturer_serial || null,
        serialInternal: formData.internal_serial || null,
      });
      
      setDialogOpen(false);
      setFormData({
        customer_id: filterCustomerId || '',
        scale_model_id: '',
        manufacturer_serial: '',
        internal_serial: '',
        manufacturer: '',
        manufacturer_custom: '',
        model: '',
        model_name: '',
        device_type: 'electronic',
        max_capacity: '',
        unit: 'kg',
        d_value: '',
        e_value: '',
        accuracy_class: 'III',
        create_new_model: false,
      });
      loadData();
    } catch (error: any) {
      console.error('Error saving scale:', error);
      alert(error.response?.data?.error || 'שגיאה בשמירת דגם המשקל');
    } finally {
      setSaving(false);
    }
  };

  const handleModelSelect = (modelId: string) => {
    const model = scaleModels.find(m => m.id === modelId);
    if (model) {
      setFormData(prev => ({
        ...prev,
        scale_model_id: modelId,
        manufacturer: model.manufacturer,
        model: model.model_name,
        device_type: model.device_type || 'electronic',
      }));
    }
  };

  let filteredScales = scales.filter(scale =>
    scale.manufacturer_serial?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    scale.internal_serial?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    scale.manufacturer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    scale.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    getCustomerName(scale.customer_id)?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (filterCustomerId) {
    filteredScales = filteredScales.filter(s => s.customer_id === filterCustomerId);
  }

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

  const columns = [
    {
      header: 'משקל',
      accessor: 'manufacturer',
      render: (value: string, row: ScaleData) => (
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center">
            <Scale className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <p className="font-medium text-slate-800">{value} {row.model}</p>
            <p className="text-sm text-slate-500">{row.manufacturer_serial}</p>
          </div>
        </div>
      )
    },
    {
      header: 'לקוח',
      accessor: 'customer_id',
      render: (value: string | null) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-slate-400" />
          <span>{getCustomerName(value)}</span>
        </div>
      )
    },
    {
      header: 'כושר העמסה',
      accessor: 'max_capacity',
      render: (value: number | null, row: ScaleData) => value ? `${value} ${row.unit || ''}` : '-'
    },
    {
      header: 'רמת דיוק',
      accessor: 'accuracy_class',
      render: (value: string | null) => value || '-'
    },
    {
      header: 'סטטוס',
      accessor: 'status',
      render: (value: string | undefined) => (
        <Badge variant="outline" className={statusColors[value || 'active'] || statusColors.active}>
          {statusLabels[value || 'active'] || 'פעיל'}
        </Badge>
      )
    },
    {
      header: 'כיול הבא',
      accessor: 'next_calibration_date',
      render: (value: string | null) => {
        if (!value) return '-';
        const date = new Date(value);
        const isOverdue = date < new Date();
        return (
          <div className={`flex items-center gap-1.5 ${isOverdue ? 'text-red-600' : 'text-slate-600'}`}>
            <Calendar className="h-4 w-4" />
            <span>{format(date, 'dd/MM/yyyy')}</span>
          </div>
        );
      }
    }
  ];

  return (
    <div className="p-6 lg:p-8">
      <PageHeader 
        title="דגמי משקלים"
        subtitle={`${filteredScales.length} דגמי משקלים ${filterCustomerId ? `של ${getCustomerName(filterCustomerId)}` : 'במערכת'}`}
        icon={Scale}
        actions={
          <Button 
            onClick={() => setDialogOpen(true)}
            className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-lg shadow-violet-500/30"
          >
            <Plus className="h-4 w-4 ml-2" />
            דגם משקל חדש
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={filteredScales}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="חיפוש משקל..."
        loading={loading}
        emptyMessage="אין משקלות במערכת"
        onRowClick={(row) => {
          window.location.href = createPageUrl(`ScaleDetails?id=${row.id}`);
        }}
      />

      {/* Add Scale Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>הוספת דגם משקל חדש</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>לקוח *</Label>
              <Select 
                value={formData.customer_id} 
                onValueChange={(value) => setFormData({ ...formData, customer_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="בחר לקוח" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <input
                type="checkbox"
                id="create_new_model"
                checked={formData.create_new_model}
                onChange={(e) => setFormData({ ...formData, create_new_model: e.target.checked, scale_model_id: e.target.checked ? '' : formData.scale_model_id })}
                className="h-4 w-4 text-violet-600 focus:ring-violet-500 border-slate-300 rounded"
              />
              <Label htmlFor="create_new_model" className="cursor-pointer text-sm font-medium text-slate-700">
                צור דגם חדש (אם לא קיים)
              </Label>
            </div>

            {!formData.create_new_model && scaleModels.length > 0 && (
              <div>
                <Label>בחר מדגם קיים (אופציונלי)</Label>
                <Select 
                  value={formData.scale_model_id} 
                  onValueChange={handleModelSelect}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="בחר דגם" />
                  </SelectTrigger>
                  <SelectContent>
                    {scaleModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.manufacturer} - {model.model_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {formData.create_new_model && (
              <div className="space-y-4 p-4 bg-violet-50 rounded-lg border border-violet-200">
                <h3 className="text-sm font-semibold text-violet-900 mb-3">פרטי דגם חדש</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>יצרן *</Label>
                    <Select 
                      value={formData.manufacturer} 
                      onValueChange={(value) => setFormData({ ...formData, manufacturer: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="בחר יצרן" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A&D">A&D</SelectItem>
                        <SelectItem value="Mettler Toledo">Mettler Toledo</SelectItem>
                        <SelectItem value="Ohaus">Ohaus</SelectItem>
                        <SelectItem value="Rice Lake">Rice Lake</SelectItem>
                        <SelectItem value="Sartorius">Sartorius</SelectItem>
                        <SelectItem value="אחר">אחר</SelectItem>
                      </SelectContent>
                    </Select>
                    {formData.manufacturer === 'אחר' && (
                      <Input
                        className="mt-2"
                        placeholder="הזן שם יצרן"
                        value={formData.manufacturer_custom}
                        onChange={(e) => setFormData({ ...formData, manufacturer_custom: e.target.value })}
                      />
                    )}
                  </div>
                  <div>
                    <Label>שם דגם *</Label>
                    <Input
                      value={formData.model_name}
                      onChange={(e) => setFormData({ ...formData, model_name: e.target.value })}
                      placeholder="לדוגמה: GX-30K"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>כושר העמסה</Label>
                    <Input
                      type="number"
                      value={formData.max_capacity}
                      onChange={(e) => setFormData({ ...formData, max_capacity: e.target.value })}
                      placeholder="לדוגמה: 30"
                    />
                  </div>
                  <div>
                    <Label>יחידה</Label>
                    <Select 
                      value={formData.unit} 
                      onValueChange={(value) => setFormData({ ...formData, unit: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
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
                  <Label>רמת דיוק</Label>
                  <Select 
                    value={formData.accuracy_class} 
                    onValueChange={(value) => setFormData({ ...formData, accuracy_class: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="I">I</SelectItem>
                      <SelectItem value="II">II</SelectItem>
                      <SelectItem value="III">III</SelectItem>
                      <SelectItem value="IIII">IIII</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>ערך e</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={formData.e_value}
                      onChange={(e) => setFormData({ ...formData, e_value: e.target.value })}
                      placeholder="לדוגמה: 0.01"
                    />
                  </div>
                  <div>
                    <Label>ערך d</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={formData.d_value}
                      onChange={(e) => setFormData({ ...formData, d_value: e.target.value })}
                      placeholder="לדוגמה: 0.005"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>מספר סידורי יצרן *</Label>
                <Input
                  value={formData.manufacturer_serial}
                  onChange={(e) => setFormData({ ...formData, manufacturer_serial: e.target.value })}
                />
              </div>
              <div>
                <Label>מספר סידורי פנימי</Label>
                <Input
                  value={formData.internal_serial}
                  onChange={(e) => setFormData({ ...formData, internal_serial: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>יצרן</Label>
                <Input
                  value={formData.manufacturer}
                  onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                />
              </div>
              <div>
                <Label>דגם</Label>
                <Input
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>סוג מכשיר</Label>
              <Select 
                value={formData.device_type} 
                onValueChange={(value) => setFormData({ ...formData, device_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="electronic">אלקטרוני</SelectItem>
                  <SelectItem value="mechanical">מכני</SelectItem>
                  <SelectItem value="hybrid">היברידי</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              ביטול
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={!formData.customer_id || !formData.manufacturer_serial || saving}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {saving ? 'שומר...' : 'שמור'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

