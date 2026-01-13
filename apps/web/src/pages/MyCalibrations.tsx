import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
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
import StatusBadge from '../components/calibration/StatusBadge';
import { 
  FileCheck, 
  Plus,
  Building2,
  Scale,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { format } from 'date-fns';

interface Calibration {
  id: string;
  status: string;
  testDate?: string | null;
  scaleId?: string | null;
  customerId?: string | null;
  technicianId?: string | null;
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

export default function MyCalibrations() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [calibrations, setCalibrations] = useState<Calibration[]>([]);
  const [scales, setScales] = useState<ScaleData[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Map page names to actual routes for technician
  const pageToRoute: Record<string, string> = {
    'TechnicianDashboard': 'technician',
    'Customers': 'technician/customers',
    'Scales': 'technician/scales',
    'MyCalibrations': 'technician/my-calibrations',
    'NewCalibration': 'technician/new-calibration',
    'CalibrationDetails': 'technician/calibration-details',
  };

  // Helper function to create page URLs
  const createPageUrl = (page: string): string => {
    const params = new URLSearchParams(searchParams);
    
    if (page.includes('?')) {
      const [pathName, query] = page.split('?');
      const route = pageToRoute[pathName] || `technician/${pathName.toLowerCase()}`;
      const pageParams = new URLSearchParams(query);
      pageParams.forEach((value, key) => {
        params.set(key, value);
      });
      return `/${route}${params.toString() ? `?${params.toString()}` : ''}`;
    }
    
    const route = pageToRoute[page] || `technician/${page.toLowerCase()}`;
    return `/${route}${params.toString() ? `?${params.toString()}` : ''}`;
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // שליחה עם הפרמטר mine=1 כדי שהסרבר יסנן רק את הכיולים של הטכנאי המחובר
      const [calibrationsRes, scalesRes, customersRes] = await Promise.all([
        api.get('/calibrations', { params: { mine: '1' } }),
        api.get('/scales'),
        api.get('/customers')
      ]);
      
      // ה-API כבר מסנן לפי הטכנאי המחובר, אין צורך בסינון נוסף
      const myCalibrations = calibrationsRes.data || [];
      
      // Transform scales
      const transformedScales = (scalesRes.data || []).map((scale: any) => ({
        id: scale.id,
        manufacturer_serial: scale.serialMfg,
        internal_serial: scale.serialInternal,
        manufacturer: scale.model?.manufacturer || scale.manufacturer || '',
        model: scale.model?.modelName || scale.modelName || '',
      }));
      
      setCalibrations(myCalibrations);
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

  let filteredCalibrations = calibrations.filter(cal => {
    const scale = cal.scale || getScaleInfo(cal.scaleId);
    const customerName = cal.customer?.name || getCustomerName(cal.customerId);
    const searchMatch = 
      scale?.manufacturer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      scale?.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      scale?.manufacturer_serial?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customerName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const statusMatch = statusFilter === 'all' || cal.status === statusFilter;
    
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

  const columns = [
    {
      header: 'דגם משקל',
      accessor: 'scaleId',
      render: (value: string | null, row: Calibration) => {
        const scale = row.scale || getScaleInfo(value);
        if (!scale) return '-';
        return (
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center">
              <Scale className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <p className="font-medium text-slate-800">
                {scale.model?.manufacturer || scale.manufacturer} {scale.model?.modelName || scale.model}
              </p>
              <p className="text-sm text-slate-500">
                {scale.serialMfg || scale.manufacturer_serial || 'ללא מספר סידורי'}
              </p>
            </div>
          </div>
        );
      }
    },
    {
      header: 'לקוח',
      accessor: 'customerId',
      render: (value: string | null, row: Calibration) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-slate-400" />
          <span>{row.customer?.name || getCustomerName(value)}</span>
        </div>
      )
    },
    {
      header: 'תאריך כיול',
      accessor: 'testDate',
      render: (value: string | null) => value ? format(new Date(value), 'dd/MM/yyyy') : '-'
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
          {row.status === 'DRAFT' && (
            <Link to={`/new-calibration?calibration=${value}`}>
              <Button size="sm" variant="outline">
                המשך עריכה
              </Button>
            </Link>
          )}
          {row.status !== 'DRAFT' && (
            <Link to={createPageUrl(`CalibrationDetails?id=${value}`)}>
              <Button size="sm" variant="ghost">
                צפייה
              </Button>
            </Link>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="p-6 lg:p-8">
      <PageHeader 
        title="הכיולים שלי"
        subtitle={`${calibrations.length} כיולים`}
        icon={FileCheck}
        actions={
          <Link to="/new-calibration">
            <Button className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-lg shadow-violet-500/30">
              <Plus className="h-4 w-4 ml-2" />
              כיול חדש
            </Button>
          </Link>
        }
      />

      <div className="mb-4 flex gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="סינון לפי סטטוס" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסטטוסים</SelectItem>
            <SelectItem value="DRAFT">טיוטה</SelectItem>
            <SelectItem value="SUBMITTED">נשלח לאישור</SelectItem>
            <SelectItem value="IN_REVIEW">בבדיקה</SelectItem>
            <SelectItem value="APPROVED">מאושר</SelectItem>
            <SelectItem value="REJECTED">נדחה</SelectItem>
            <SelectItem value="CERTIFICATE_ISSUED">תעודה הונפקה</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filteredCalibrations}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="חיפוש כיול..."
        loading={loading}
        emptyMessage="אין כיולים"
      />
    </div>
  );
}

