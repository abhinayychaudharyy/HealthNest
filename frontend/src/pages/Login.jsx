import React, { useState, useEffect } from 'react';
import { api } from '../api';
import PostLoginLoader from '../components/PostLoginLoader';

/* ── tiny 3-D floating card particles ── */
const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: 2 + Math.random() * 3,
  delay: Math.random() * 4,
  duration: 5 + Math.random() * 6,
}));

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [showPostLogin, setShowPostLogin] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t); }, []);

  const handleGoogleLogin = () => { window.location.href = api.getGoogleAuthUrl(); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isLogin) {
      const rx = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
      if (!rx.test(password)) {
        setError('Password needs 8+ chars, one uppercase, one number, one symbol.');
        return;
      }
    }

    setLoading(true);
    try {
      const data = isLogin
        ? await api.loginWithEmail(email, password)
        : await api.registerWithEmail(name, email, password);
      localStorage.setItem('token', data.access_token);
      // Show post-login loader before redirect
      setShowPostLogin(true);
    } catch (err) {
      if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
        setError('Cannot connect to server. Make sure the backend is running on port 8000.');
      } else {
        setError(err.message || 'Authentication failed');
      }
      setLoading(false);
    }
  };

  if (showPostLogin) {
    return <PostLoginLoader onDone={() => { window.location.href = '/'; }} />;
  }

  return (
    <div className="lp-root">
      {/* ── Ambient floating particles ── */}
      {PARTICLES.map(p => (
        <div key={p.id} className="lp-particle" style={{
          left: `${p.x}%`, top: `${p.y}%`,
          width: p.size, height: p.size,
          animationDuration: `${p.duration}s`,
          animationDelay: `${p.delay}s`,
        }} />
      ))}

      {/* ── 3-D perspective left panel ── */}
      <div className={`lp-left ${mounted ? 'lp-left--in' : ''}`}>
        {/* Brand */}
        <div className="lp-brand">
          <div className="lp-brand-icon" style={{ background: '#fff', padding: '6px' }}>
            <img src="/logo.png" alt="HealthNest" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div>
            <div className="lp-brand-name">
              Health<span>Nest</span>
            </div>
            <div className="lp-brand-sub">Family Health Platform</div>
          </div>
        </div>

        {/* Big headline */}
        <h1 className="lp-headline">
          Your Family's<br />
          Health,&nbsp;
          <span className="lp-headline-accent">AI-Powered.</span>
        </h1>

        <p className="lp-tagline">
          Track vitals, manage medications, and get AI health insights — all in one secure, intelligent dashboard.
        </p>

        {/* 3-D floating feature cards */}
        <div className="lp-features">
          {[
            { icon: '💊', label: 'Medication Tracking',  delay: '0ms'   },
            { icon: '🩺', label: 'Vitals Monitoring',    delay: '80ms'  },
            { icon: '🤖', label: 'AI Health Assistant',  delay: '160ms' },
            { icon: '📊', label: 'Health Analytics',     delay: '240ms' },
          ].map(f => (
            <div key={f.label} className="lp-feature-chip" style={{ animationDelay: f.delay }}>
              <span className="lp-feature-chip-icon">{f.icon}</span>
              <span>{f.label}</span>
            </div>
          ))}
        </div>

        {/* Decorative 3-D grid */}
        <div className="lp-grid-3d" aria-hidden="true">
          <div className="lp-grid-3d-inner" />
        </div>
      </div>

      {/* ── Right panel — Login Card ── */}
      <div className="lp-right">
        <div className={`lp-card ${mounted ? 'lp-card--in' : ''}`}>

          {/* Card top ornament */}
          <div className="lp-card-top-line" />

          {/* Header */}
          <div className="lp-card-header">
            <div className="lp-lock-icon">🔐</div>
            <h2 className="lp-card-title">
              {isLogin ? 'Welcome back' : 'Create account'}
            </h2>
            <p className="lp-card-sub">
              {isLogin
                ? 'Sign in to access your family health dashboard'
                : 'Join and start managing your family\'s health'}
            </p>
          </div>

          {/* Tab toggle */}
          <div className="lp-tab-row">
            <button
              type="button"
              className={`lp-tab ${isLogin ? 'lp-tab--active' : ''}`}
              onClick={() => { setIsLogin(true); setError(''); }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`lp-tab ${!isLogin ? 'lp-tab--active' : ''}`}
              onClick={() => { setIsLogin(false); setError(''); }}
            >
              Sign Up
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="lp-form">
            {!isLogin && (
              <div className="lp-field">
                <label className="lp-label">Full Name</label>
                <div className="lp-input-wrap">
                  <span className="lp-input-icon">👤</span>
                  <input
                    type="text"
                    className="lp-input"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required={!isLogin}
                    placeholder="John Doe"
                    autoComplete="name"
                  />
                </div>
              </div>
            )}

            <div className="lp-field">
              <label className="lp-label">Email Address</label>
              <div className="lp-input-wrap">
                <span className="lp-input-icon">✉️</span>
                <input
                  type="email"
                  className="lp-input"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="lp-field">
              <label className="lp-label">Password</label>
              <div className="lp-input-wrap">
                <span className="lp-input-icon">🔑</span>
                <input
                  type={showPass ? 'text' : 'password'}
                  className="lp-input"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••••"
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  className="lp-toggle-pass"
                  onClick={() => setShowPass(v => !v)}
                  tabIndex={-1}
                >
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="lp-error">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              id="login-submit-btn"
              type="submit"
              className="lp-submit"
              disabled={loading}
            >
              {loading ? (
                <span className="lp-submit-spinner" />
              ) : (
                isLogin ? 'Sign In →' : 'Create Account →'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="lp-divider"><span>OR</span></div>

          {/* Google */}
          <button
            id="google-login-btn"
            type="button"
            className="lp-google-btn"
            onClick={handleGoogleLogin}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          {/* Security note */}
          <div className="lp-security">
            <span>🔒</span>
            <p>256-bit encrypted. We never store or share your health data.</p>
          </div>
        </div>
      </div>

      {/* ── Styles (scoped via class prefix) ── */}
      <style>{`
        /* ─── ROOT ─────────────────────────────────── */
        .lp-root {
          min-height: 100vh;
          display: flex;
          background: #000;
          position: relative;
          overflow: hidden;
          font-family: 'Inter', sans-serif;
        }

        /* Floating particles */
        .lp-particle {
          position: absolute;
          border-radius: 50%;
          background: rgba(255,255,255,0.18);
          animation: lp-float linear infinite;
          pointer-events: none;
        }
        @keyframes lp-float {
          0%   { transform: translateY(0px)   rotate(0deg);   opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 0.6; }
          100% { transform: translateY(-120px) rotate(360deg); opacity: 0; }
        }

        /* ─── LEFT PANEL ─────────────────────────────── */
        .lp-left {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: clamp(2rem, 5vw, 5rem);
          position: relative;
          opacity: 0;
          transform: translateX(-40px);
          transition: opacity 0.7s ease 0.1s, transform 0.7s ease 0.1s;
        }
        .lp-left--in { opacity: 1; transform: translateX(0); }

        /* Subtle left-panel grid */
        .lp-left::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
          background-size: 50px 50px;
          pointer-events: none;
        }

        /* Brand row */
        .lp-brand {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 3rem;
        }
        .lp-brand-icon {
          width: 52px; height: 52px;
          border-radius: 14px;
          background: linear-gradient(135deg, #fff 0%, #aaa 100%);
          display: flex; align-items: center; justify-content: center;
          font-size: 1.5rem;
          box-shadow: 0 0 40px rgba(255,255,255,0.2);
          flex-shrink: 0;
        }
        .lp-brand-name {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1.4rem; font-weight: 800;
          color: #fff; letter-spacing: -0.03em;
        }
        .lp-brand-name span { color: #666; }
        .lp-brand-sub {
          font-size: 0.65rem; color: #444;
          letter-spacing: 0.18em; text-transform: uppercase;
          margin-top: 3px;
        }

        /* Headline */
        .lp-headline {
          font-family: 'Space Grotesk', sans-serif;
          font-size: clamp(2.2rem, 4.5vw, 3.5rem);
          font-weight: 900;
          color: #fff;
          line-height: 1.1;
          letter-spacing: -0.04em;
          margin: 0 0 1.25rem;
        }
        .lp-headline-accent {
          /* 3-D chrome text effect */
          background: linear-gradient(180deg, #fff 0%, #888 50%, #333 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          filter: drop-shadow(0 2px 8px rgba(255,255,255,0.15));
        }

        .lp-tagline {
          color: #555;
          font-size: 1rem;
          line-height: 1.7;
          max-width: 420px;
          margin: 0 0 2.5rem;
        }

        /* Feature chips */
        .lp-features {
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-width: 360px;
        }
        .lp-feature-chip {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.07);
          background: rgba(255,255,255,0.03);
          color: rgba(255,255,255,0.6);
          font-size: 0.875rem; font-weight: 500;
          backdrop-filter: blur(4px);
          animation: lp-chip-in 0.5s ease both;
          transform-style: preserve-3d;
          transition: all 0.25s ease;
          cursor: default;
        }
        .lp-feature-chip:hover {
          border-color: rgba(255,255,255,0.2);
          background: rgba(255,255,255,0.07);
          color: #fff;
          transform: translateX(6px) translateZ(4px);
          box-shadow: -4px 0 20px rgba(255,255,255,0.05);
        }
        .lp-feature-chip-icon { font-size: 1.1rem; }
        @keyframes lp-chip-in {
          from { opacity: 0; transform: translateX(-16px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        /* Decorative 3-D grid at bottom of left panel */
        .lp-grid-3d {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 180px;
          perspective: 600px;
          overflow: hidden;
          pointer-events: none;
        }
        .lp-grid-3d-inner {
          position: absolute;
          bottom: -40px; left: -20%; right: -20%;
          height: 220px;
          background-image:
            linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px);
          background-size: 40px 40px;
          transform: rotateX(60deg);
          transform-origin: bottom center;
          mask-image: linear-gradient(to top, transparent 0%, black 60%);
          -webkit-mask-image: linear-gradient(to top, transparent 0%, black 60%);
        }

        /* ─── RIGHT PANEL ─────────────────────────────── */
        .lp-right {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(1.5rem, 3vw, 3rem);
          min-width: min(440px, 100vw);
          position: relative;
        }

        /* Glowing vertical separator */
        .lp-right::before {
          content: '';
          position: absolute;
          left: 0; top: 10%; bottom: 10%;
          width: 1px;
          background: linear-gradient(to bottom, transparent, rgba(255,255,255,0.1), transparent);
        }

        /* ─── CARD ─────────────────────────────────────── */
        .lp-card {
          width: 100%;
          max-width: 400px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 24px;
          padding: 2.5rem 2.25rem;
          backdrop-filter: blur(20px);
          position: relative;
          overflow: hidden;
          opacity: 0;
          transform: translateY(30px) scale(0.97);
          transition: opacity 0.7s ease 0.3s, transform 0.7s ease 0.3s;

          /* 3-D card shadow */
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.05),
            0 20px 60px rgba(0,0,0,0.8),
            0 4px 16px rgba(0,0,0,0.6),
            inset 0 1px 0 rgba(255,255,255,0.08);
        }
        .lp-card--in {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        .lp-card:hover {
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.1),
            0 30px 80px rgba(0,0,0,0.9),
            0 8px 24px rgba(0,0,0,0.7),
            inset 0 1px 0 rgba(255,255,255,0.1);
          transform: translateY(-2px) scale(1);
        }

        /* Top shimmer line */
        .lp-card-top-line {
          position: absolute;
          top: 0; left: 10%; right: 10%;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
          border-radius: 1px;
        }

        /* Ambient glow inside card */
        .lp-card::before {
          content: '';
          position: absolute;
          top: -60px; left: 50%;
          transform: translateX(-50%);
          width: 200px; height: 100px;
          background: radial-gradient(ellipse, rgba(255,255,255,0.04) 0%, transparent 70%);
          pointer-events: none;
        }

        /* ─── CARD HEADER ───────────────────────────── */
        .lp-card-header { text-align: center; margin-bottom: 1.75rem; }
        .lp-lock-icon {
          width: 58px; height: 58px;
          margin: 0 auto 1rem;
          border-radius: 16px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          display: flex; align-items: center; justify-content: center;
          font-size: 1.6rem;
          box-shadow: 0 0 30px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.1);
        }
        .lp-card-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1.6rem; font-weight: 800;
          color: #fff;
          margin: 0 0 0.4rem;
          letter-spacing: -0.03em;
        }
        .lp-card-sub {
          font-size: 0.85rem;
          color: #555;
          margin: 0;
          line-height: 1.5;
        }

        /* ─── TAB TOGGLE ─────────────────────────────── */
        .lp-tab-row {
          display: flex;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px;
          padding: 4px;
          margin-bottom: 1.5rem;
          gap: 4px;
        }
        .lp-tab {
          flex: 1;
          padding: 8px 0;
          border: none;
          border-radius: 9px;
          background: transparent;
          color: #555;
          font-size: 0.85rem; font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: 'Inter', sans-serif;
        }
        .lp-tab--active {
          background: rgba(255,255,255,0.1);
          color: #fff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        }

        /* ─── FORM ────────────────────────────────────── */
        .lp-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-bottom: 1.25rem;
        }
        .lp-field { display: flex; flex-direction: column; gap: 6px; }
        .lp-label {
          font-size: 0.78rem; font-weight: 600;
          color: rgba(255,255,255,0.45);
          letter-spacing: 0.06em; text-transform: uppercase;
        }
        .lp-input-wrap {
          position: relative;
          display: flex; align-items: center;
        }
        .lp-input-icon {
          position: absolute; left: 13px;
          font-size: 0.9rem; pointer-events: none;
          filter: grayscale(1) opacity(0.5);
        }
        .lp-input {
          width: 100%;
          padding: 12px 40px 12px 38px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 11px;
          color: #fff;
          font-size: 0.9rem;
          font-family: 'Inter', sans-serif;
          outline: none;
          transition: all 0.2s ease;
          box-sizing: border-box;
        }
        .lp-input::placeholder { color: #333; }
        .lp-input:focus {
          border-color: rgba(255,255,255,0.25);
          background: rgba(255,255,255,0.07);
          box-shadow: 0 0 0 3px rgba(255,255,255,0.04), 0 0 20px rgba(255,255,255,0.03);
        }
        .lp-toggle-pass {
          position: absolute; right: 12px;
          background: none; border: none;
          cursor: pointer; font-size: 0.9rem;
          padding: 0; line-height: 1;
          filter: grayscale(1) opacity(0.5);
          transition: filter 0.2s;
        }
        .lp-toggle-pass:hover { filter: grayscale(0) opacity(1); }

        /* Error */
        .lp-error {
          display: flex; align-items: flex-start; gap: 8px;
          padding: 10px 14px;
          background: rgba(255,60,60,0.08);
          border: 1px solid rgba(255,60,60,0.2);
          border-radius: 10px;
          font-size: 0.82rem;
          color: #ff8080;
          line-height: 1.4;
        }

        /* Submit button */
        .lp-submit {
          width: 100%;
          padding: 14px;
          border: none;
          border-radius: 12px;
          background: #fff;
          color: #000;
          font-size: 0.95rem; font-weight: 700;
          font-family: 'Space Grotesk', sans-serif;
          letter-spacing: 0.01em;
          cursor: pointer;
          transition: all 0.22s ease;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.1), 0 8px 32px rgba(255,255,255,0.15);
          position: relative;
          overflow: hidden;
          margin-top: 0.25rem;
        }
        .lp-submit::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.15) 100%);
          opacity: 0;
          transition: opacity 0.2s;
        }
        .lp-submit:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 0 0 1px rgba(255,255,255,0.2), 0 12px 40px rgba(255,255,255,0.25);
        }
        .lp-submit:hover::before { opacity: 1; }
        .lp-submit:active:not(:disabled) { transform: translateY(0); }
        .lp-submit:disabled { opacity: 0.5; cursor: not-allowed; }

        .lp-submit-spinner {
          width: 18px; height: 18px;
          border-radius: 50%;
          border: 2px solid rgba(0,0,0,0.15);
          border-top-color: #000;
          animation: lp-spin 0.7s linear infinite;
          display: inline-block;
        }
        @keyframes lp-spin { to { transform: rotate(360deg); } }

        /* ─── DIVIDER ────────────────────────────────── */
        .lp-divider {
          display: flex; align-items: center; gap: 12px;
          margin: 1.25rem 0;
        }
        .lp-divider::before,
        .lp-divider::after {
          content: ''; flex: 1;
          height: 1px;
          background: rgba(255,255,255,0.07);
        }
        .lp-divider span {
          font-size: 0.72rem; color: #444;
          letter-spacing: 0.1em;
        }

        /* ─── GOOGLE BTN ─────────────────────────────── */
        .lp-google-btn {
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.75);
          font-size: 0.88rem; font-weight: 600;
          font-family: 'Inter', sans-serif;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          transition: all 0.22s ease;
        }
        .lp-google-btn:hover {
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.2);
          color: #fff;
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        }

        /* ─── SECURITY NOTE ───────────────────────────── */
        .lp-security {
          display: flex; align-items: center; gap: 10px;
          margin-top: 1.25rem;
          padding: 10px 14px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 10px;
        }
        .lp-security p {
          margin: 0;
          font-size: 0.76rem;
          color: #444;
          line-height: 1.4;
        }

        /* ─── RESPONSIVE ─────────────────────────────── */
        @media (max-width: 768px) {
          .lp-root { flex-direction: column; }
          .lp-left {
            padding: 2rem 1.5rem 1rem;
            min-height: auto;
          }
          .lp-grid-3d { display: none; }
          .lp-right::before { display: none; }
          .lp-right { padding: 1rem 1.5rem 2rem; min-width: unset; width: 100%; }
          .lp-headline { font-size: 2rem; }
        }
      `}</style>
    </div>
  );
}
