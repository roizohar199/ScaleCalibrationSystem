import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthProvider';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { user, refreshMe } = useAuth();

  // אם המשתמש כבר מחובר, העבר אותו לדף המתאים
  useEffect(() => {
    if (user) {
      if (user.role === 'TECHNICIAN') {
        navigate('/technician', { replace: true });
      } else if (user.role === 'OFFICE' || user.role === 'ADMIN') {
        navigate('/office', { replace: true });
      }
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await api.post('/auth/login', { email, password });
      
      // רענן את פרטי המשתמש מה-AuthProvider
      await refreshMe();
      
      // Redirect based on role
      const user = response.data.user;
      if (user.role === 'TECHNICIAN') {
        navigate('/technician');
      } else if (user.role === 'OFFICE' || user.role === 'ADMIN') {
        navigate('/office');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || 'שגיאה בהתחברות');
    }
  };

  return (
    <div style={{ 
      minHeight: "100vh", 
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    }}>
      <div style={{ 
        background: "white", 
        padding: "40px", 
        borderRadius: "16px", 
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        maxWidth: 420,
        width: "100%"
      }}>
        <h2 style={{ marginTop: 0, marginBottom: 24, color: "#1e293b", fontSize: 28, fontWeight: 600 }}>
          מערכת כיול מאזניים
        </h2>
        {error && (
          <div style={{ 
            color: "#ef4444", 
            whiteSpace: "pre-wrap", 
            padding: "12px",
            background: "#fef2f2",
            borderRadius: "8px",
            border: "1px solid #fecaca",
            fontSize: 14,
            marginBottom: 20
          }}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: 14, fontWeight: 500 }}>אימייל</span>
            <input 
              type="email"
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              style={{ 
                width: "100%", 
                padding: "12px 16px", 
                border: "2px solid #e2e8f0",
                borderRadius: "8px",
                fontSize: 14,
                transition: "all 0.2s",
                outline: "none"
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = "#6366f1"}
              onBlur={(e) => e.currentTarget.style.borderColor = "#e2e8f0"}
              required
            />
          </label>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: 14, fontWeight: 500 }}>סיסמה</span>
            <input 
              type="password"
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              style={{ 
                width: "100%", 
                padding: "12px 16px", 
                border: "2px solid #e2e8f0",
                borderRadius: "8px",
                fontSize: 14,
                transition: "all 0.2s",
                outline: "none"
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = "#6366f1"}
              onBlur={(e) => e.currentTarget.style.borderColor = "#e2e8f0"}
              required
            />
          </label>
          <button 
            type="submit"
            style={{ 
              padding: "14px 24px", 
              background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(99, 102, 241, 0.4)",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 6px 16px rgba(99, 102, 241, 0.5)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(99, 102, 241, 0.4)";
            }}
          >
            התחברות
          </button>
        </form>
        <div style={{ marginTop: 20, textAlign: "center" }}>
          <Link 
            to="/register"
            style={{ 
              color: "#6366f1", 
              textDecoration: "none", 
              fontSize: 14,
              fontWeight: 500
            }}
          >
            אין לך חשבון? הירשם כאן
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Login;

