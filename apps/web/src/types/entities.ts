/**
 * Type definitions for entities in the system
 */

export interface Customer {
  id?: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  notes?: string;
  created_date?: string;
}

export interface Site {
  id?: string;
  customer_id: string;
  name: string;
  address?: string;
  city?: string;
  contact_person?: string;
  phone?: string;
  notes?: string;
  created_date?: string;
}

export interface Scale {
  id?: string;
  customer_id: string;
  site_id?: string;
  scale_model_id?: string;
  manufacturer_serial: string;
  internal_serial?: string;
  manufacturer?: string;
  model?: string;
  device_type?: 'electronic' | 'mechanical' | 'hybrid';
  max_capacity?: number;
  unit?: 'kg' | 'g' | 'mg' | 'ton';
  d_value?: number;
  e_value?: number;
  accuracy_class?: 'I' | 'II' | 'III' | 'IIII';
  location?: string;
  installation_date?: string;
  last_calibration_date?: string;
  next_calibration_date?: string;
  status?: 'active' | 'inactive' | 'maintenance' | 'retired';
  notes?: string;
}

export interface Calibration {
  id?: string;
  scale_id: string;
  customer_id: string;
  profile_id?: string;
  technician_id?: string;
  created_by?: string;
  status?: 'DRAFT' | 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'CERTIFICATE_ISSUED';
  calibration_date?: string;
  expiry_date?: string;
  temperature?: number;
  humidity?: number;
  measurements?: {
    accuracy?: Array<{
      load: number;
      reading1?: number;
      reading2?: number;
      reading3?: number;
      average?: number;
      error?: number;
      tolerance?: number;
      pass?: boolean;
    }>;
    eccentricity?: Array<{
      position: string;
      load: number;
      reading?: number;
      error?: number;
      tolerance?: number;
      pass?: boolean;
    }>;
    repeatability?: Array<{
      load: number;
      readings?: number[];
      average?: number;
      std_dev?: number;
      tolerance?: number;
      pass?: boolean;
    }>;
  };
  overall_result?: 'PASS' | 'FAIL' | 'PENDING';
  technician_notes?: string;
  office_notes?: string;
  rejection_reason?: string;
  submitted_at?: string;
  approved_at?: string;
  approved_by?: string;
  data_hash?: string;
  created_date?: string;
  updated_date?: string;
  scale?: Scale;
  customer?: Customer;
}

export interface ScaleModel {
  id?: string;
  manufacturer: string;
  model_name: string;
  device_type?: 'electronic' | 'mechanical' | 'hybrid';
  max_capacity?: number;
  unit?: 'kg' | 'g' | 'mg' | 'ton';
  d_value?: number;
  e_value?: number;
  accuracy_class?: 'I' | 'II' | 'III' | 'IIII';
  default_profile_id?: string;
  is_active?: boolean;
}

export interface MetrologicalProfile {
  id?: string;
  name: string;
  max_capacity: number;
  unit?: 'kg' | 'g' | 'mg' | 'ton';
  d_value?: number;
  e_value?: number;
  accuracy_class: 'I' | 'II' | 'III' | 'IIII';
  tolerance_mode?: 'HUB_REFERENCE' | 'OIML_ENGINE';
  min_load?: number;
  max_load?: number;
  test_points?: Array<{
    load_value: number;
    test_type: string;
  }>;
  tolerance_rows?: Array<{
    test_type: string;
    min_load: number;
    max_load: number;
    tolerance: number;
  }>;
  is_active?: boolean;
}

export interface Certificate {
  id?: string;
  calibration_id: string;
  certificate_number: string;
  issue_date?: string;
  expiry_date?: string;
  pdf_url?: string;
  qr_code?: string;
  issued_by?: string;
  customer_id?: string;
  scale_id?: string;
  status?: 'active' | 'revoked' | 'expired';
}

export interface AuditLog {
  id?: string;
  entity_type: string;
  entity_id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'SUBMIT' | 'APPROVE' | 'REJECT' | 'CERTIFICATE_ISSUED';
  user_id?: string;
  user_email?: string;
  changes?: Record<string, any>;
  previous_data?: Record<string, any>;
  new_data?: Record<string, any>;
  notes?: string;
  ip_address?: string;
  created_date?: string;
}

