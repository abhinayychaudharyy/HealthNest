import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Callback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('Signing you in...');

  useEffect(() => {
    // After Google OAuth, the backend redirects here with ?token=...&user=...
    // OR with ?error=... if something went wrong
    const token = searchParams.get('token');
    const userParam = searchParams.get('user');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError(`Google login failed: ${errorParam.replace(/_/g, ' ')}`);
      return;
    }

    if (!token) {
      setError('No authentication token received. Please try again.');
      return;
    }

    try {
      setStatus('Verifying token...');
      const userData = userParam ? JSON.parse(decodeURIComponent(userParam)) : null;
      setStatus('Login successful! Redirecting...');
      login(token, userData);
      navigate('/', { replace: true });
    } catch (err) {
      console.error('[Callback] Auth error:', err);
      setError(err.message || 'Authentication failed. Please try again.');
    }
  }, []); // run once on mount only

  if (error) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: 'var(--bg-primary)',
        flexDirection: 'column', gap: 24, padding: '2rem'
      }}>
        <div className="bg-mesh" />
        <div className="card" style={{ textAlign: 'center', maxWidth: 440, padding: '2.5rem', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
          <h2 style={{ marginBottom: '0.5rem', color: 'var(--danger)' }}>Login Failed</h2>
          <p style={{ marginBottom: '1.5rem', fontSize: '0.9rem' }}>{error}</p>
          <div style={{
            background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
            borderRadius: 10, padding: '12px 14px', marginBottom: '1.5rem', textAlign: 'left'
          }}>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
              💡 <strong>Tip:</strong> Make sure the backend server is running on port 8000 and your Google OAuth credentials are correct.
            </p>
          </div>
          <button
            id="back-to-login-btn"
            onClick={() => navigate('/login')}
            className="btn btn-primary w-full"
          >
            ← Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg-primary)',
      flexDirection: 'column', gap: 24
    }}>
      <div className="bg-mesh" />

      <div className="card" style={{ textAlign: 'center', padding: '3rem', maxWidth: 380, position: 'relative', zIndex: 1 }}>
        {/* Animated logo */}
        <div style={{
          width: 64, height: 64, margin: '0 auto 1.5rem',
          borderRadius: '50%',
          background: '#fff', padding: '8px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--glow-purple)',
        }}>
          <img src="/logo.png" alt="HealthNest" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>

        <div className="spinner" style={{ margin: '0 auto 1.25rem' }} />

        <h3 style={{ marginBottom: '0.5rem' }}>{status}</h3>
        <p style={{ fontSize: '0.875rem' }}>
          Please wait while we securely verify your identity.
        </p>

        {/* Progress steps */}
        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
          {[
            { label: 'Google authorization received', done: true },
            { label: 'Exchanging with server...', done: status.includes('successful') },
            { label: 'Redirecting to dashboard', done: false },
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-2" style={{ opacity: step.done ? 1 : 0.4 }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                background: step.done ? 'var(--success)' : 'var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.65rem', color: 'white', fontWeight: 700
              }}>
                {step.done ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: '0.8rem', color: step.done ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
