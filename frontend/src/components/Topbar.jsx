import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Topbar({ title, subtitle, onMenuToggle }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [time] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const [date] = useState(() => new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }));

  return (
    <header className="topbar">
      <div className="flex items-center gap-3">
        {/* Mobile menu toggle */}
        <button
          id="mobile-menu-btn"
          onClick={onMenuToggle}
          className="btn btn-ghost btn-icon"
          aria-label="Toggle menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>

        <div>
          {title && <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{title}</h2>}
          {subtitle && <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Time */}
        <div style={{ textAlign: 'right', display: 'none' }} className="topbar-time">
          <div style={{ fontSize: '0.95rem', fontWeight: 700, fontFamily: "'Space Grotesk', monospace", color: 'var(--text-primary)' }}>{time}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{date}</div>
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-2" style={{ padding: '6px 12px', background: 'rgba(16,185,129,0.1)', borderRadius: 99, border: '1px solid rgba(16,185,129,0.2)' }}>
          <div className="pulse-dot" />
          <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>Live</span>
        </div>

        {/* AI Chat shortcut */}
        <button
          id="topbar-chat-btn"
          onClick={() => navigate('/chat')}
          className="btn btn-primary btn-sm flex items-center gap-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          AI Assistant
        </button>

        {/* User avatar */}
        {user?.picture ? (
          <img
            src={user.picture}
            alt="Profile"
            style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid var(--border-bright)' }}
          />
        ) : (
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--grad-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.85rem', color: 'white', fontWeight: 800,
            border: '2px solid var(--border-bright)'
          }}>
            {user?.name?.charAt(0) || 'U'}
          </div>
        )}
      </div>
    </header>
  );
}
