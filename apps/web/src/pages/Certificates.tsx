import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { Link, useSearchParams } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
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
  Award, 
  Building2,
  Scale,
  Calendar,
  FileText,
  ExternalLink,
  AlertCircle,
  Download,
  FileDown,
  Printer
} from 'lucide-react';
import { format, isBefore, addDays } from 'date-fns';

interface Certificate {
  id: string;
  certificate_number: string;
  calibration_id: string;
  issue_date: string;
  expiry_date?: string | null;
  customer_id?: string | null;
  scale_id?: string | null;
  status: string;
}

interface ScaleData {
  id: string;
  manufacturer_serial?: string | null;
  manufacturer?: string | null;
  model?: string | null;
}

interface Customer {
  id: string;
  name: string;
}

export default function Certificates() {
  const [searchParams] = useSearchParams();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [calibrations, setCalibrations] = useState<any[]>([]);
  const [scales, setScales] = useState<ScaleData[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

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
      const [certificatesRes, calibrationsRes, scalesRes, customersRes] = await Promise.all([
        api.get('/certificates'),
        api.get('/calibrations'),
        api.get('/scales'),
        api.get('/customers')
      ]);
      
      // Transform certificates
      const transformedCertificates = certificatesRes.data.map((cert: any) => ({
        id: cert.id,
        certificate_number: cert.certificateNo,
        calibration_id: cert.calibrationId,
        issue_date: cert.issuedAt,
        expiry_date: cert.calibration?.nextDueDate || null,
        customer_id: cert.calibration?.customerId || null,
        scale_id: cert.calibration?.scaleId || null,
        status: 'active',
      }));
      setCertificates(transformedCertificates);
      
      // Transform scales
      const transformedScales = (scalesRes.data || []).map((scale: any) => ({
        id: scale.id,
        manufacturer_serial: scale.serialMfg,
        internal_serial: scale.serialInternal,
        manufacturer: scale.model?.manufacturer || scale.manufacturer || '',
        model: scale.model?.modelName || scale.modelName || '',
      }));
      setScales(transformedScales);
      
      setCalibrations(calibrationsRes.data || []);
      setCustomers(customersRes.data || []);
    } catch (error) {
      console.error('Error loading certificates:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCustomerName = (customerId?: string | null) => {
    if (!customerId) return 'לא ידוע';
    const customer = customers.find(c => c.id === customerId);
    return customer?.name || 'לא ידוע';
  };

  const getScaleInfo = (scaleId?: string | null) => {
    if (!scaleId) return null;
    return scales.find(s => s.id === scaleId) || null;
  };

  const getExpiryStatus = (expiryDate?: string | null) => {
    if (!expiryDate) return 'unknown';
    const expiry = new Date(expiryDate);
    const now = new Date();
    const thirtyDaysFromNow = addDays(now, 30);
    
    if (isBefore(expiry, now)) return 'expired';
    if (isBefore(expiry, thirtyDaysFromNow)) return 'expiring';
    return 'valid';
  };

  const handleDownloadPDF = async (certificateId: string, certificateNumber?: string) => {
    try {
      const response = await api.get(`/certificates/${certificateId}/download-pdf`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${certificateNumber || certificateId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Error downloading PDF:', error);
      alert('שגיאה בהורדת קובץ PDF: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDownloadDOCX = async (certificateId: string, certificateNumber?: string) => {
    try {
      const response = await api.get(`/certificates/${certificateId}/download-docx`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${certificateNumber || certificateId}.docx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Error downloading DOCX:', error);
      alert('שגיאה בהורדת קובץ DOCX: ' + (error.response?.data?.error || error.message));
    }
  };

  const handlePrint = async (certificateId: string, certificateNumber?: string) => {
    try {
      const response = await api.get(`/certificates/${certificateId}/print`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      } else {
        // Fallback: download if popup blocked
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${certificateNumber || certificateId}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      // Clean up after a delay
      setTimeout(() => window.URL.revokeObjectURL(url), 100);
    } catch (error: any) {
      console.error('Error printing certificate:', error);
      alert('שגיאה בהדפסת תעודה: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleSendEmail = async (certificateId: string) => {
    try {
      const email = window.prompt('הכנס כתובת אימייל למשלוח התעודה:');
      if (!email) return;
      const confirmed = confirm(`שלוח תעודה לכתובת: ${email}?`);
      if (!confirmed) return;
      const resp = await api.post(`/certificates/${certificateId}/send-email`, { email });
      if (resp.data && resp.data.success === false) {
        alert(resp.data.error || 'שגיאה בשליחת המייל');
      } else {
        alert('המייל נשלח בהצלחה');
      }
    } catch (error: any) {
      console.error('Error sending certificate email:', error);
      alert('שגיאה בשליחת המייל: ' + (error.response?.data?.error || error.message));
    }
  };

  let filteredCertificates = certificates.filter(cert => {
    const scale = getScaleInfo(cert.scale_id);
    const customerName = getCustomerName(cert.customer_id);
    const searchMatch = 
      cert.certificate_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      scale?.manufacturer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      scale?.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      scale?.manufacturer_serial?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customerName.toLowerCase().includes(searchTerm.toLowerCase());
    
    let statusMatch = true;
    if (statusFilter !== 'all') {
      const expiryStatus = getExpiryStatus(cert.expiry_date);
      if (statusFilter === 'expired') statusMatch = expiryStatus === 'expired';
      else if (statusFilter === 'expiring') statusMatch = expiryStatus === 'expiring';
      else if (statusFilter === 'valid') statusMatch = expiryStatus === 'valid';
    }
    
    return searchMatch && statusMatch;
  });

  const statusColors: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    revoked: 'bg-red-50 text-red-600 border-red-200',
    expired: 'bg-slate-50 text-slate-600 border-slate-200'
  };

  const statusLabels: Record<string, string> = {
    active: 'פעילה',
    revoked: 'בוטלה',
    expired: 'פגה'
  };

  const expiryColors: Record<string, string> = {
    valid: 'text-emerald-600',
    expiring: 'text-amber-600',
    expired: 'text-red-600'
  };

  const columns = [
    {
      header: 'מספר תעודה',
      accessor: 'certificate_number',
      render: (value: string) => (
        <span className="font-medium text-slate-800 font-mono">{value || '-'}</span>
      )
    },
    {
      header: 'דגם משקל',
      accessor: 'scale_id',
      render: (value: string | null) => {
        const scale = getScaleInfo(value);
        if (!scale) return <span className="text-slate-700">-</span>;
        return (
          <span className="text-slate-700">
            {scale.manufacturer} {scale.model}
          </span>
        );
      }
    },
    {
      header: 'לקוח',
      accessor: 'customer_id',
      render: (value: string | null) => (
        <span className="text-slate-700">{getCustomerName(value)}</span>
      )
    },
    {
      header: 'תאריך הנפקה',
      accessor: 'issue_date',
      render: (value: string) => (
        <span className="text-slate-700">{value ? format(new Date(value), 'dd/MM/yyyy HH:mm') : '-'}</span>
      )
    },
    {
      header: 'תאריך תפוגה',
      accessor: 'expiry_date',
      render: (value: string | null) => (
        <span className="text-slate-700">{value ? format(new Date(value), 'dd/MM/yyyy') : '-'}</span>
      )
    },
    {
      header: 'סטטוס',
      accessor: 'status',
      render: (value: string, row: Certificate) => {
        const expiryStatus = getExpiryStatus(row.expiry_date);
        const displayStatus = expiryStatus === 'expired' && value === 'active' ? 'expired' : value;
        return (
          <Badge variant="outline" className={statusColors[displayStatus] || statusColors.active}>
            {statusLabels[displayStatus] || 'פעילה'}
          </Badge>
        );
      }
    },
    {
      header: 'פעולות',
      accessor: 'id',
      render: (value: string, row: Certificate) => (
        <div className="flex gap-2">
          <Link to={createPageUrl(`CalibrationDetails?id=${row.calibration_id}`)}>
            <Button size="sm" variant="ghost" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
              <FileText className="h-4 w-4 ml-1" />
              צפה
            </Button>
          </Link>
          <Button 
            size="sm" 
            variant="ghost" 
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => handleDownloadPDF(value, row.certificate_number)}
          >
            <Download className="h-4 w-4 ml-1" />
            PDF
          </Button>
          <Button 
            size="sm" 
            variant="ghost" 
            className="text-green-600 hover:text-green-700 hover:bg-green-50"
            onClick={() => handleDownloadDOCX(value, row.certificate_number)}
          >
            <FileDown className="h-4 w-4 ml-1" />
            DOCX
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
            onClick={() => handleSendEmail(value)}
          >
            <ExternalLink className="h-4 w-4 ml-1" />
            שלח מייל
          </Button>
          <Button 
            size="sm" 
            variant="ghost" 
            className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
            onClick={() => handlePrint(value, row.certificate_number)}
          >
            <Printer className="h-4 w-4 ml-1" />
            הדפס
          </Button>
        </div>
      )
    }
  ];

  const validCount = certificates.filter(c => getExpiryStatus(c.expiry_date) === 'valid').length;
  const expiringCount = certificates.filter(c => getExpiryStatus(c.expiry_date) === 'expiring').length;
  const expiredCount = certificates.filter(c => getExpiryStatus(c.expiry_date) === 'expired').length;

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Award className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">תעודות כיול</h1>
            <p className="text-slate-500 mt-1">{certificates.length} תעודות במערכת</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 xs:gap-4 mb-4 xs:mb-6">
        <Card className="p-4 border-0 shadow-lg shadow-slate-200/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">פגו</p>
              <p className="text-2xl font-bold text-red-600">{expiredCount}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center">
              <Award className="h-5 w-5 text-red-600" />
            </div>
          </div>
        </Card>
        <Card className="p-4 border-0 shadow-lg shadow-slate-200/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">עומדות לפוג (30 יום)</p>
              <p className="text-2xl font-bold text-amber-600">{expiringCount}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-amber-600" />
            </div>
          </div>
        </Card>
        <Card className="p-4 border-0 shadow-lg shadow-slate-200/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">תקפות</p>
              <p className="text-2xl font-bold text-emerald-600">{validCount}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Award className="h-5 w-5 text-emerald-600" />
            </div>
          </div>
        </Card>
        <Card className="p-4 border-0 shadow-lg shadow-slate-200/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">סה"כ</p>
              <p className="text-2xl font-bold text-slate-600">{certificates.length}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-slate-50 flex items-center justify-center">
              <Award className="h-5 w-5 text-slate-600" />
            </div>
          </div>
        </Card>
      </div>

      <div className="mb-4 flex gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="סינון לפי סטטוס" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל התעודות</SelectItem>
            <SelectItem value="valid">תקפות</SelectItem>
            <SelectItem value="expiring">עומדות לפוג</SelectItem>
            <SelectItem value="expired">פגו</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filteredCertificates}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="חיפוש תעודה..."
        loading={loading}
        emptyMessage="אין תעודות במערכת"
      />
    </div>
  );
}

