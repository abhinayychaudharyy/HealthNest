import React, { useEffect, useState } from 'react';

export default function SplashLoader({ onDone }) {
  const [phase, setPhase] = useState(0);
  // phase 0 → logo fades in
  // phase 1 → progress bar fills
  // phase 2 → screen slides out

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 400);
    const t2 = setTimeout(() => setPhase(2), 2000);
    const t3 = setTimeout(() => onDone(), 2600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#000',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        transform: phase === 2 ? 'translateY(-100%)' : 'translateY(0)',
        transition: 'transform 0.65s cubic-bezier(0.76, 0, 0.24, 1)',
        overflow: 'hidden',
      }}
    >
      {/* Radial grid background */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `
          radial-gradient(circle at 50% 50%, rgba(255,255,255,0.04) 0%, transparent 70%),
          linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '100% 100%, 60px 60px, 60px 60px',
      }} />

      {/* Pulsing rings */}
      {[160, 220, 280].map((size, i) => (
        <div key={i} style={{
          position: 'absolute',
          width: size, height: size,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.08)',
          animation: `splash-ring ${1.8 + i * 0.4}s ease-out infinite`,
          animationDelay: `${i * 0.3}s`,
        }} />
      ))}

      {/* Logo */}
      <div style={{
        position: 'relative', zIndex: 2,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 20,
        opacity: phase >= 0 ? 1 : 0,
        transform: phase >= 0 ? 'scale(1) translateY(0)' : 'scale(0.8) translateY(20px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
      }}>
        {/* Icon */}
        <div style={{
          width: 80, height: 80, borderRadius: 22,
          background: '#fff', padding: '10px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 60px rgba(255,255,255,0.25), 0 0 120px rgba(255,255,255,0.1)',
          animation: 'splash-float 2.5s ease-in-out infinite',
        }}>
          <img src="/logo.png" alt="HealthNest" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>

        {/* Brand text */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '2rem', fontWeight: 800,
            color: '#fff', letterSpacing: '-0.04em',
            lineHeight: 1,
          }}>
            Health<span style={{ color: '#888' }}>Nest</span>
          </div>
          <div style={{
            fontSize: '0.7rem', color: '#555',
            letterSpacing: '0.25em', textTransform: 'uppercase',
            marginTop: 6,
          }}>
            Family Health Platform
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        position: 'absolute', bottom: 60,
        width: 200, zIndex: 2,
        opacity: phase >= 1 ? 1 : 0,
        transition: 'opacity 0.4s ease',
      }}>
        <div style={{
          height: 2, background: 'rgba(255,255,255,0.1)',
          borderRadius: 2, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            background: 'linear-gradient(90deg, #fff, #aaa)',
            borderRadius: 2,
            width: phase >= 1 ? '100%' : '0%',
            transition: 'width 1.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }} />
        </div>
        <p style={{
          textAlign: 'center', marginTop: 14,
          fontSize: '0.7rem', color: '#444',
          letterSpacing: '0.15em', textTransform: 'uppercase',
        }}>
          Initializing…
        </p>
      </div>

      <style>{`
        @keyframes splash-ring {
          0%   { opacity: 0.5; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.8); }
        }
        @keyframes splash-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}
