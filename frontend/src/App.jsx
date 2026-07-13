import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';

import Login from './pages/Login';
import Callback from './pages/Callback';
import Dashboard from './pages/Dashboard';
import Analytics from './pages/Analytics';
import Chat from './pages/Chat';
import Reports from './pages/Reports';

// ─── Route titles ───────────────────────────────────────────────────────────
const routeMeta = {
  '/':          { title: 'Dashboard',       subtitle: 'Family health overview' },
  '/analytics': { title: 'Health Analytics', subtitle: 'Trends and insights' },
  '/chat':      { title: 'AI Assistant',     subtitle: 'Powered by LangGraph + Groq' },
  '/reports':   { title: 'Medical Reports',  subtitle: 'Upload & AI-analyze PDF reports' },
};

// ─── Shell Layout ───────────────────────────────────────────────────────────
function AppShell({ children, path }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const meta = routeMeta[path] || {};

  return (
    <>
      {/* Background mesh */}
      <div className="bg-mesh" />

      <div className="app-shell">
        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

        <div className="main-content">
          <Topbar
            title={meta.title}
            subtitle={meta.subtitle}
            onMenuToggle={() => setMobileOpen(v => !v)}
          />
          <main className="page-content">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}

// ─── Protected Route ────────────────────────────────────────────────────────
function ProtectedRoute({ children, path }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', flexDirection: 'column', gap: 16,
        background: 'var(--bg-primary)'
      }}>
        <div className="spinner" />
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <AppShell path={path}>
      {children}
    </AppShell>
  );
}

// ─── App ────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<Callback />} />
          <Route
            path="/"
            element={
              <ProtectedRoute path="/">
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute path="/analytics">
                <Analytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedRoute path="/chat">
                <Chat />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute path="/reports">
                <Reports />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
