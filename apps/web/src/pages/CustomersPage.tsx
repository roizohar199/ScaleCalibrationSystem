import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { Link, useSearchParams } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import PageHeader from '../modules/shared/components/PageHeader';
import DataTable from '../modules/shared/components/DataTable';
import { 
  Users, 
  Plus,
  Phone,
  Mail,
  MapPin,
  Building2,
  Scale
} from 'lucide-react';
import { format } from 'date-fns';

interface Customer {
  id: string;
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  notes?: string | null;
  created_date?: string | null;
}

interface ScaleData {
  id: string;
  customerId?: string | null;
  site?: {
    customerId?: string | null;
  } | null;
}

export default function Customers() {
  const [searchParams] = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [scales, setScales] = useState<ScaleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    taxId: '',
    contact: '',
    phone: '',
    address: ''
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
      const [customersRes, scalesRes] = await Promise.all([
        api.get('/customers'),
        api.get('/scales')
      ]);
      
      // Transform customers to match expected format
      const transformedCustomers = (customersRes.data || []).map((customer: any) => ({
        id: customer.id,
        name: customer.name,
        contact_person: customer.contact,
        phone: customer.phone,
        email: customer.email || null,
        address: customer.address,
        city: customer.city || null,
        notes: customer.notes || null,
        created_date: customer.createdAt,
      }));
      
      setCustomers(transformedCustomers);
      setScales(scalesRes.data || []);
    } catch (error) {
      console.error('Error loading customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const getScalesCount = (customerId: string) => {
    return scales.filter(s => s.customerId === customerId || s.site?.customerId === customerId).length;
  };

  const handleSave = async () => {
    if (!formData.name || !formData.taxId || !formData.contact || !formData.phone || !formData.address) {
      alert('אנא מלא את כל השדות החובה');
      return;
    }
    setSaving(true);
    try {
      await api.post('/customers', {
        name: formData.name,
        taxId: formData.taxId,
        contact: formData.contact,
        phone: formData.phone,
        address: formData.address
      });
      setDialogOpen(false);
      setFormData({
        name: '',
        taxId: '',
        contact: '',
        phone: '',
        address: ''
      });
      loadData();
    } catch (error: any) {
      console.error('Error saving customer:', error);
      alert(error.response?.data?.error || 'שגיאה בשמירת הלקוח');
    } finally {
      setSaving(false);
    }
  };

  const filteredCustomers = customers.filter(customer =>
    customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.contact_person?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.city?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    {
      header: 'שם לקוח',
      accessor: 'name',
      render: (value: string, row: Customer) => (
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
            <Building2 className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <p className="font-medium text-slate-800">{value}</p>
          </div>
        </div>
      )
    },
    {
      header: 'איש קשר',
      accessor: 'contact_person',
      render: (value: string | null) => <span className="text-slate-700">{value || '-'}</span>
    },
    {
      header: 'טלפון',
      accessor: 'phone',
      render: (value: string | null) => <span className="text-slate-700">{value || '-'}</span>
    },
    {
      header: 'דגמי משקלים',
      accessor: 'id',
      render: (value: string) => (
        <div className="flex items-center gap-1.5">
          <Scale className="h-4 w-4 text-slate-400" />
          <span className="text-slate-700">{getScalesCount(value)}</span>
        </div>
      )
    },
    {
      header: 'תאריך הוספה',
      accessor: 'created_date',
      render: (value: string | null) => (
        <span className="text-slate-700">{value ? format(new Date(value), 'dd/MM/yyyy HH:mm') : '-'}</span>
      )
    }
  ];

  return (
    <div className="p-4 xs:p-6 lg:p-8">
      <PageHeader 
        title="לקוחות"
        subtitle={`${customers.length} לקוחות במערכת`}
        icon={Users}
        actions={
          <Button 
            onClick={() => setDialogOpen(true)}
            className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-lg shadow-violet-500/30"
          >
            <Plus className="h-4 w-4 ml-2" />
            לקוח חדש
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={filteredCustomers}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="חיפוש לקוח..."
        loading={loading}
        emptyMessage="אין לקוחות במערכת"
        onRowClick={(row) => {
          // Navigate to customer details
          window.location.href = createPageUrl(`CustomerDetails?id=${row.id}`);
        }}
      />

      {/* Add Customer Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl p-6" dir="rtl">
            <DialogHeader>
              <DialogTitle>הוספת לקוח חדש</DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">שם לקוח *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="שם החברה או הלקוח"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="taxId">ח.פ/ע.מ *</Label>
                  <Input
                    id="taxId"
                    value={formData.taxId}
                    onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                    placeholder="מספר ח.פ או ע.מ"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="contact">איש קשר *</Label>
                  <Input
                    id="contact"
                    value={formData.contact}
                    onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                    placeholder="שם איש קשר"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="phone">טלפון *</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="מספר טלפון"
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <Label htmlFor="address">כתובת *</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="כתובת מלאה"
                    required
                  />
                </div>
              </div>
            </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              ביטול
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={!formData.name || !formData.taxId || !formData.contact || !formData.phone || !formData.address || saving}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {saving ? 'שומר...' : 'שמור לקוח'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
