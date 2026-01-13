import './styles/index.css';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import Login from './pages/Login';
import Register from './pages/Register';

// Technician Module
import TechnicianLayout from './modules/technician/components/TechnicianLayout';
import TechnicianDashboard from './modules/technician/pages/TechnicianDashboard';
import { TechnicianRoute } from './auth/TechnicianRoute';

// Admin Module
import AdminLayout from './modules/admin/components/AdminLayout';
import OfficeDashboard from './pages/OfficeDashboard';
import ApprovalDashboard from './pages/ApprovalDashboard';
import CustomersPage from './pages/CustomersPage';
import CustomerDetails from './pages/CustomerDetails';
import CalibrationDetails from './pages/CalibrationDetails';
import ScaleDetails from './pages/ScaleDetails';
import Scales from './pages/Scales';
import Certificates from './pages/Certificates';
import UserManagement from './pages/UserManagement';
import ImportDocuments from './pages/ImportDocuments';
import { AdminRoute } from './auth/AdminRoute';

// Shared pages (used by both)
import NewCalibration from './pages/NewCalibration';
import MyCalibrations from './pages/MyCalibrations';

function IndexRedirect() {
  const { user } = useAuth();
  
  if (user?.role === 'TECHNICIAN') {
    return <Navigate to="/technician" replace />;
  } else if (user?.role === 'OFFICE' || user?.role === 'ADMIN') {
    return <Navigate to="/admin" replace />;
  }
  
  // אם אין תפקיד, נשלח לדף המשרד (ברירת מחדל)
  return <Navigate to="/admin" replace />;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      
      {/* Technician Routes - Only accessible by TECHNICIAN role */}
      <Route element={<TechnicianRoute />}>
        <Route path="/technician" element={<TechnicianLayout />}>
          <Route index element={<TechnicianDashboard />} />
          <Route path="new-calibration" element={<NewCalibration />} />
          <Route path="my-calibrations" element={<MyCalibrations />} />
          <Route path="calibration-details" element={<CalibrationDetails />} />
        </Route>
      </Route>

      {/* Admin/Office Routes - Only accessible by ADMIN or OFFICE role */}
      <Route element={<AdminRoute />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<OfficeDashboard />} />
          <Route path="new-calibration" element={<NewCalibration />} />
          <Route path="my-calibrations" element={<MyCalibrations />} />
          <Route path="approval" element={<ApprovalDashboard />} />
          <Route path="scales" element={<Scales />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="customer-details" element={<CustomerDetails />} />
          <Route path="calibration-details" element={<CalibrationDetails />} />
          <Route path="scale-details" element={<ScaleDetails />} />
          <Route path="certificates" element={<Certificates />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="import-documents" element={<ImportDocuments />} />
        </Route>
      </Route>

      {/* Legacy redirects for backward compatibility */}
      <Route path="/" element={<IndexRedirect />} />
      <Route path="/office" element={<Navigate to="/admin" replace />} />
      <Route path="/OfficeDashboard" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}

export default App;

