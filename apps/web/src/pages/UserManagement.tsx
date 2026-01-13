import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { CheckCircle, XCircle, Clock, Users, Edit, Trash2, Key, Mail } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  createdAt: string;
}

interface PendingUser {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  createdAt: string;
}

function clsx(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(' ');
}

export default function UserManagement() {
  const { user } = useAuth();
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  
  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  // Form states
  const [editFormData, setEditFormData] = useState({ name: '', email: '' });
  const [passwordFormData, setPasswordFormData] = useState({ password: '', confirmPassword: '' });
  const [emailFormData, setEmailFormData] = useState({ email: '' });

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      const [pendingRes, usersRes] = await Promise.all([
        api.get('/auth/pending-users'),
        api.get('/auth/users')
      ]);
      setPendingUsers(pendingRes.data || []);
      setApprovedUsers(usersRes.data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPendingUsers = async () => {
    try {
      const response = await api.get('/auth/pending-users');
      setPendingUsers(response.data || []);
    } catch (error) {
      console.error('Error loading pending users:', error);
    }
  };

  const handleApprove = async (userId: string) => {
    if (!window.confirm('האם אתה בטוח שברצונך לאשר משתמש זה?')) {
      return;
    }

    setProcessing(userId);
    try {
      await api.post('/auth/approve-user', { userId, action: 'approve' });
      await loadPendingUsers();
      await loadData(); // Reload all users
    } catch (error: any) {
      alert(error.response?.data?.message || 'שגיאה באישור משתמש');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (userId: string) => {
    if (!window.confirm('האם אתה בטוח שברצונך לדחות משתמש זה?')) {
      return;
    }

    setProcessing(userId);
    try {
      await api.post('/auth/approve-user', { userId, action: 'reject' });
      await loadPendingUsers();
    } catch (error: any) {
      alert(error.response?.data?.message || 'שגיאה בדחיית משתמש');
    } finally {
      setProcessing(null);
    }
  };

  const handleEditClick = (user: User) => {
    setSelectedUser(user);
    setEditFormData({ name: user.name, email: user.email });
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!selectedUser) return;
    if (!editFormData.name || !editFormData.email) {
      alert('אנא מלא את כל השדות');
      return;
    }

    setProcessing(selectedUser.id);
    try {
      await api.put(`/auth/users/${selectedUser.id}`, {
        name: editFormData.name,
        email: editFormData.email
      });
      setEditDialogOpen(false);
      await loadData();
      alert('המשתמש עודכן בהצלחה');
    } catch (error: any) {
      alert(error.response?.data?.message || 'שגיאה בעדכון משתמש');
    } finally {
      setProcessing(null);
    }
  };

  const handlePasswordClick = (user: User) => {
    setSelectedUser(user);
    setPasswordFormData({ password: '', confirmPassword: '' });
    setPasswordDialogOpen(true);
  };

  const handlePasswordSave = async () => {
    if (!selectedUser) return;
    if (!passwordFormData.password || passwordFormData.password.length < 6) {
      alert('סיסמה חייבת להכיל לפחות 6 תווים');
      return;
    }
    if (passwordFormData.password !== passwordFormData.confirmPassword) {
      alert('הסיסמאות לא תואמות');
      return;
    }

    setProcessing(selectedUser.id);
    try {
      await api.put(`/auth/users/${selectedUser.id}/password`, {
        password: passwordFormData.password
      });
      setPasswordDialogOpen(false);
      alert('סיסמה עודכנה בהצלחה');
    } catch (error: any) {
      alert(error.response?.data?.message || 'שגיאה בעדכון סיסמה');
    } finally {
      setProcessing(null);
    }
  };

  const handleEmailClick = (user: User) => {
    setSelectedUser(user);
    setEmailFormData({ email: user.email });
    setEmailDialogOpen(true);
  };

  const handleEmailSave = async () => {
    if (!selectedUser) return;
    if (!emailFormData.email) {
      alert('אנא מלא את שדה האימייל');
      return;
    }

    setProcessing(selectedUser.id);
    try {
      await api.put(`/auth/users/${selectedUser.id}`, {
        email: emailFormData.email
      });
      setEmailDialogOpen(false);
      await loadData();
      alert('אימייל עודכן בהצלחה');
    } catch (error: any) {
      alert(error.response?.data?.message || 'שגיאה בעדכון אימייל');
    } finally {
      setProcessing(null);
    }
  };

  const handleDelete = async (userId: string) => {
    if (!window.confirm('האם אתה בטוח שברצונך למחוק משתמש זה? פעולה זו לא ניתנת לביטול.')) {
      return;
    }

    setProcessing(userId);
    try {
      await api.delete(`/auth/users/${userId}`);
      await loadData();
      alert('משתמש נמחק בהצלחה');
    } catch (error: any) {
      alert(error.response?.data?.message || 'שגיאה במחיקת משתמש');
    } finally {
      setProcessing(null);
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'TECHNICIAN': return 'טכנאי';
      case 'OFFICE': return 'משרד';
      case 'ADMIN': return 'אדמין';
      default: return role;
    }
  };

  if (user?.role !== 'ADMIN') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-lg font-semibold text-slate-900">אין הרשאה</div>
          <div className="mt-2 text-sm text-slate-500">דף זה זמין רק למנהלי מערכת</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">ניהול משתמשים</h1>
          <p className="mt-1 text-sm text-slate-500">ניהול משתמשים מאושרים ובקשות הרשמה</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700">
          <Users className="h-4 w-4" />
          {pendingUsers.length} ממתינים לאישור
        </div>
      </div>

      {/* Approved Users List */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">משתמשים מאושרים</h2>
        {approvedUsers.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 shadow-sm ring-1 ring-slate-200 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
              <Users className="h-6 w-6 text-slate-500" />
            </div>
            <div className="text-sm font-medium text-slate-900">אין משתמשים מאושרים</div>
          </div>
        ) : (
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">שם</th>
                    <th className="px-4 py-3 font-medium">אימייל</th>
                    <th className="px-4 py-3 font-medium">תפקיד</th>
                    <th className="px-4 py-3 font-medium">תאריך הרשמה</th>
                    <th className="px-4 py-3 font-medium">פעולות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {approvedUsers.map((approvedUser) => (
                    <tr key={approvedUser.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{approvedUser.name}</td>
                      <td className="px-4 py-3 text-slate-700">{approvedUser.email}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-green-50 text-green-700">
                          {getRoleLabel(approvedUser.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {new Date(approvedUser.createdAt).toLocaleDateString('he-IL')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditClick(approvedUser)}
                            disabled={processing === approvedUser.id}
                            className={clsx(
                              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition",
                              processing === approvedUser.id
                                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                                : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                            )}
                            title="עריכה"
                          >
                            <Edit className="h-3.5 w-3.5" />
                            עריכה
                          </button>
                          <button
                            onClick={() => handleEmailClick(approvedUser)}
                            disabled={processing === approvedUser.id}
                            className={clsx(
                              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition",
                              processing === approvedUser.id
                                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                                : "bg-purple-50 text-purple-700 hover:bg-purple-100"
                            )}
                            title="החלפת אימייל"
                          >
                            <Mail className="h-3.5 w-3.5" />
                            אימייל
                          </button>
                          <button
                            onClick={() => handlePasswordClick(approvedUser)}
                            disabled={processing === approvedUser.id}
                            className={clsx(
                              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition",
                              processing === approvedUser.id
                                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                                : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                            )}
                            title="החלפת סיסמה"
                          >
                            <Key className="h-3.5 w-3.5" />
                            סיסמה
                          </button>
                          <button
                            onClick={() => handleDelete(approvedUser.id)}
                            disabled={processing === approvedUser.id || approvedUser.id === user?.id}
                            className={clsx(
                              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white transition",
                              processing === approvedUser.id || approvedUser.id === user?.id
                                ? "bg-slate-400 cursor-not-allowed"
                                : "bg-rose-600 hover:bg-rose-700"
                            )}
                            title="מחיקה"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            מחק
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Pending Users List */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">משתמשים ממתינים לאישור</h2>
        {pendingUsers.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 shadow-sm ring-1 ring-slate-200 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
              <CheckCircle className="h-6 w-6 text-slate-500" />
            </div>
            <div className="text-sm font-medium text-slate-900">אין משתמשים ממתינים לאישור</div>
            <div className="mt-1 text-sm text-slate-500">כל המשתמשים טופלו</div>
          </div>
        ) : (
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">שם</th>
                    <th className="px-4 py-3 font-medium">אימייל</th>
                    <th className="px-4 py-3 font-medium">תפקיד</th>
                    <th className="px-4 py-3 font-medium">תאריך הרשמה</th>
                    <th className="px-4 py-3 font-medium">פעולות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingUsers.map((pendingUser) => (
                    <tr key={pendingUser.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{pendingUser.name}</td>
                      <td className="px-4 py-3 text-slate-700">{pendingUser.email}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-700">
                          {getRoleLabel(pendingUser.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {new Date(pendingUser.createdAt).toLocaleDateString('he-IL')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleApprove(pendingUser.id)}
                            disabled={processing === pendingUser.id}
                            className={clsx(
                              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white transition",
                              processing === pendingUser.id
                                ? "bg-slate-400 cursor-not-allowed"
                                : "bg-emerald-600 hover:bg-emerald-700"
                            )}
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            {processing === pendingUser.id ? 'מעבד...' : 'אשר'}
                          </button>
                          <button
                            onClick={() => handleReject(pendingUser.id)}
                            disabled={processing === pendingUser.id}
                            className={clsx(
                              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white transition",
                              processing === pendingUser.id
                                ? "bg-slate-400 cursor-not-allowed"
                                : "bg-rose-600 hover:bg-rose-700"
                            )}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            {processing === pendingUser.id ? 'מעבד...' : 'דחה'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>עריכת משתמש</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-name">שם</Label>
              <Input
                id="edit-name"
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-email">אימייל</Label>
              <Input
                id="edit-email"
                type="email"
                value={editFormData.email}
                onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              ביטול
            </Button>
            <Button onClick={handleEditSave} disabled={processing === selectedUser?.id}>
              {processing === selectedUser?.id ? 'שומר...' : 'שמור'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>החלפת סיסמה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="password">סיסמה חדשה</Label>
              <Input
                id="password"
                type="password"
                value={passwordFormData.password}
                onChange={(e) => setPasswordFormData({ ...passwordFormData, password: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">אימות סיסמה</Label>
              <Input
                id="confirm-password"
                type="password"
                value={passwordFormData.confirmPassword}
                onChange={(e) => setPasswordFormData({ ...passwordFormData, confirmPassword: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>
              ביטול
            </Button>
            <Button onClick={handlePasswordSave} disabled={processing === selectedUser?.id}>
              {processing === selectedUser?.id ? 'שומר...' : 'שמור'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>החלפת אימייל</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="email">אימייל חדש</Label>
              <Input
                id="email"
                type="email"
                value={emailFormData.email}
                onChange={(e) => setEmailFormData({ email: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>
              ביטול
            </Button>
            <Button onClick={handleEmailSave} disabled={processing === selectedUser?.id}>
              {processing === selectedUser?.id ? 'שומר...' : 'שמור'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}