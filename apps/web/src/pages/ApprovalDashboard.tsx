import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
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
import StatusBadge from '../components/calibration/StatusBadge';
import { 
  ClipboardCheck, 
  Building2,
  Scale,
  CheckCircle,
  XCircle,
  Eye,
  MessageSquare
} from 'lucide-react';
import { format } from 'date-fns';

interface Calibration {
  id: string;
  status: string;
  testDate?: string | null;
  submittedAt?: string | null;
  scaleId?: string | null;
  customerId?: string | null;
  overallStatus?: string | null;
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

export default function ApprovalDashboard() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [calibrations, setCalibrations] = useState<Calibration[]>([]);
  const [scales, setScales] = useState<ScaleData[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedCalibration, setSelectedCalibration] = useState<Calibration | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);

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
      const [calibrationsRes, scalesRes, customersRes] = await Promise.all([
        api.get('/calibrations'),
        api.get('/scales'),
        api.get('/customers')
      ]);
      
      // Transform scales
      const transformedScales = (scalesRes.data || []).map((scale: any) => ({
        id: scale.id,
        manufacturer_serial: scale.serialMfg,
        internal_serial: scale.serialInternal,
        manufacturer: scale.model?.manufacturer || scale.manufacturer || '',
        model: scale.model?.modelName || scale.modelName || '',
      }));
      
      setCalibrations(calibrationsRes.data || []);
      setScales(transformedScales);
      setCustomers(customersRes.data || []);
    } catch (error) {
      console.error('Error loading calibrations:', error);
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

  const handleApprove = async (calibration: Calibration) => {
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
      console.error('Error approving calibration:', error);
      alert(error.response?.data?.error || 'שגיאה באישור הכיול');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedCalibration || !rejectReason) return;
    setProcessing(true);
    try {
      await api.post(`/calibrations/${selectedCalibration.id}/return`, {
        reason: rejectReason
      });
      setRejectDialogOpen(false);
      setSelectedCalibration(null);
      setRejectReason('');
      loadData();
      // Trigger event to update pending count in Layout
      window.dispatchEvent(new CustomEvent('calibrationStatusChanged'));
    } catch (error: any) {
      console.error('Error rejecting calibration:', error);
      alert(error.response?.data?.error || 'שגיאה בדחיית הכיול');
    } finally {
      setProcessing(false);
    }
  };

  const openRejectDialog = (calibration: Calibration) => {
    setSelectedCalibration(calibration);
    setRejectDialogOpen(true);
  };

  let filteredCalibrations = calibrations.filter(cal => {
    const scale = cal.scale || getScaleInfo(cal.scaleId);
    const customerName = cal.customer?.name || getCustomerName(cal.customerId);
    const searchMatch = 
      scale?.manufacturer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      scale?.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      scale?.manufacturer_serial?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customerName.toLowerCase().includes(searchTerm.toLowerCase());
    
    let statusMatch = true;
    if (statusFilter === 'pending') {
      statusMatch = cal.status === 'SUBMITTED' || cal.status === 'IN_REVIEW';
    } else if (statusFilter !== 'all') {
      statusMatch = cal.status === statusFilter;
    }
    
    return searchMatch && statusMatch;
  });

  const resultLabels: Record<string, string> = {
    PASS: 'עבר',
    FAIL: 'נכשל',
    PENDING: 'ממתין'
  };

  const resultColors: Record<string, string> = {
    PASS: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    FAIL: 'bg-red-50 text-red-600 border-red-200',
    PENDING: 'bg-slate-50 text-slate-600 border-slate-200'
  };

  const pendingCount = calibrations.filter(c => c.status === 'SUBMITTED' || c.status === 'IN_REVIEW').length;

  const columns = [
    {
      header: 'תאריך שליחה',
      accessor: 'submittedAt',
      render: (value: string | null) => (
        <span className="text-slate-700">{value ? format(new Date(value), 'dd/MM/yyyy HH:mm') : '-'}</span>
      )
    },
    {
      header: 'סטטוס',
      accessor: 'status',
      render: (value: string) => <StatusBadge status={value} />
    },
    {
      header: 'תוצאה',
      accessor: 'overallStatus',
      render: (value: string | null) => (
        <Badge variant="outline" className={resultColors[value || 'PENDING'] || resultColors.PENDING}>
          {value === 'PASS' && <CheckCircle className="h-3 w-3 ml-1" />}
          {value === 'FAIL' && <XCircle className="h-3 w-3 ml-1" />}
          {resultLabels[value || 'PENDING'] || 'ממתין'}
        </Badge>
      )
    },
    {
      header: 'פעולות',
      accessor: 'id',
      render: (value: string, row: Calibration) => (
        <div className="flex gap-2">
          <Link to={createPageUrl(`CalibrationDetails?id=${value}`)}>
            <Button size="sm" variant="ghost" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
              <Eye className="h-4 w-4" />
            </Button>
          </Link>
          {(row.status === 'SUBMITTED' || row.status === 'IN_REVIEW') && (
            <>
              <Button 
                size="sm" 
                variant="outline"
                className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                onClick={() => handleApprove(row)}
                disabled={processing}
              >
                <CheckCircle className="h-4 w-4 ml-1" />
                אשר
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => openRejectDialog(row)}
                disabled={processing}
              >
                <XCircle className="h-4 w-4 ml-1" />
                דחה
              </Button>
            </>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <ClipboardCheck className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">אישור כיולים</h1>
              <p className="text-slate-500 mt-1">{pendingCount} כיולים ממתינים לאישור</p>
            </div>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="סינון לפי סטטוס" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">ממתינים לאישור</SelectItem>
              <SelectItem value="all">כל הסטטוסים</SelectItem>
              <SelectItem value="APPROVED">מאושרים</SelectItem>
              <SelectItem value="REJECTED">נדחו</SelectItem>
              <SelectItem value="CERTIFICATE_ISSUED">תעודה הונפקה</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredCalibrations}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="חיפוש כיול..."
        loading={loading}
        emptyMessage="אין כיולים ממתינים"
      />

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>דחיית כיול</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-slate-600 mb-4">
              אנא ציין את סיבת הדחייה. הודעה זו תישלח לטכנאי.
            </p>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="סיבת הדחייה..."
              rows={4}
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
