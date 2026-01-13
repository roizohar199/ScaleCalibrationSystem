import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/client';

function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/auth/register', { email, password, name });
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'שגיאה בהרשמה');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
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
          <div style={{ textAlign: "center" }}>
            <div style={{ 
              fontSize: 48, 
              marginBottom: 16,
              color: "#10b981"
            }}>✓</div>
            <h2 style={{ marginTop: 0, marginBottom: 16, color: "#1e293b", fontSize: 24, fontWeight: 600 }}>
              ההרשמה בוצעה בהצלחה!
            </h2>
            <p style={{ color: "#64748b", marginBottom: 24, fontSize: 14 }}>
              בקשתך נשלחה למנהל המערכת לאישור.<br />
              תקבל הודעה ברגע שהחשבון שלך יאושר.
            </p>
            <p style={{ color: "#64748b", fontSize: 12 }}>
              מעבר לדף ההתחברות בעוד כמה שניות...
            </p>
          </div>
        </div>
      </div>
    );
  }

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
          הרשמה למערכת
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
            <span style={{ display: "block", marginBottom: 6, color: "#475569", fontSize: 14, fontWeight: 500 }}>שם מלא</span>
            <input 
              type="text"
              value={name} 
              onChange={(e) => setName(e.target.value)} 
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
              minLength={4}
            />
          </label>
          <button 
            type="submit"
            disabled={loading}
            style={{ 
              padding: "14px 24px", 
              background: loading ? "#94a3b8" : "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: 16,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: loading ? "none" : "0 4px 12px rgba(99, 102, 241, 0.4)",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 6px 16px rgba(99, 102, 241, 0.5)";
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 12px rgba(99, 102, 241, 0.4)";
              }
            }}
          >
            {loading ? "מבצע הרשמה..." : "הרשמה"}
          </button>
        </form>
        <div style={{ marginTop: 20, textAlign: "center" }}>
          <Link 
            to="/login"
            style={{ 
              color: "#6366f1", 
              textDecoration: "none", 
              fontSize: 14,
              fontWeight: 500
            }}
          >
            יש לך חשבון? התחבר כאן
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Register;








