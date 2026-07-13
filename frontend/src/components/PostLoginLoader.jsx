import React, { useEffect, useState } from 'react';

const MESSAGES = [
  'Authenticating…',
  'Loading your dashboard…',
  'Preparing health data…',
];

export default function PostLoginLoader({ onDone }) {
  const [msgIdx, setMsgIdx] = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // Cycle messages
    const t1 = setInterval(() => setMsgIdx(i => (i + 1) % MESSAGES.length), 700);
    // Start exit
    const t2 = setTimeout(() => { setExiting(true); }, 1800);
    // Unmount
    const t3 = setTimeout(() => onDone(), 2500);
    return () => { clearInterval(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 8888,
      background: '#000',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 32,
      opacity: exiting ? 0 : 1,
      transform: exiting ? 'scale(1.04)' : 'scale(1)',
      transition: 'opacity 0.55s ease, transform 0.55s ease',
    }}>
      {/* Radial grid */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `
          radial-gradient(circle at 50% 50%, rgba(255,255,255,0.05) 0%, transparent 65%),
          linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
        `,
        backgroundSize: '100% 100%, 60px 60px, 60px 60px',
      }} />

      {/* Spinning ring loader */}
      <div style={{ position: 'relative', width: 90, height: 90 }}>
        {/* Outer ring */}
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.08)',
        }} />
        {/* Spinning arc */}
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: '50%',
          border: '2px solid transparent',
          borderTopColor: '#fff',
          borderRightColor: 'rgba(255,255,255,0.4)',
          animation: 'postlogin-spin 0.9s linear infinite',
        }} />
        {/* Center dot */}
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 12, height: 12,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 0 20px rgba(255,255,255,0.6)',
          animation: 'postlogin-pulse 0.9s ease-in-out infinite',
        }} />
      </div>

      {/* Message */}
      <div style={{
        textAlign: 'center',
        animation: 'postlogin-fadein 0.35s ease',
        key: msgIdx,
      }}>
        <p style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: '0.9rem', fontWeight: 500,
          color: 'rgba(255,255,255,0.7)',
          letterSpacing: '0.08em',
          margin: 0,
          animation: 'postlogin-fadein 0.35s ease',
        }}>
          {MESSAGES[msgIdx]}
        </p>
      </div>

      {/* Bottom logo watermark */}
      <div style={{
        position: 'absolute', bottom: 36,
        display: 'flex', alignItems: 'center', gap: 8, opacity: 0.25,
      }}>
        <img src="/logo.png" alt="HealthNest" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
        <span style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: '0.8rem', fontWeight: 700, color: '#fff',
        }}>HealthNest</span>
      </div>

      <style>{`
        @keyframes postlogin-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes postlogin-pulse {
          0%, 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          50%       { opacity: 0.5; transform: translate(-50%, -50%) scale(0.7); }
        }
        @keyframes postlogin-fadein {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
