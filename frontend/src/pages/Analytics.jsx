import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Area, AreaChart, Dot
} from 'recharts';

// ─── Custom Tooltip ────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-bright)',
      borderRadius: 12,
      padding: '12px 16px',
      boxShadow: 'var(--shadow-md)',
      minWidth: 160
    }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>{label}</div>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2" style={{ marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color }} />
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{entry.name}:</span>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {entry.value} {entry.name.toLowerCase().includes('sugar') ? 'mg/dL' : 'mmHg'}
          </span>
        </div>
      ))}
    </div>
  );
};

// ─── Stat Chip ─────────────────────────────────────────────────────────────
function StatChip({ label, value, color = '#8b5cf6', unit = '' }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '14px 18px',
      flex: 1,
      minWidth: 120,
    }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.5rem', fontWeight: 800, color, lineHeight: 1, letterSpacing: '-0.03em' }}>
        {value ?? '—'}{value != null ? <span style={{ fontSize: '0.8rem', fontWeight: 500, marginLeft: 4, color: 'var(--text-muted)' }}>{unit}</span> : ''}
      </div>
    </div>
  );
}

export default function Analytics() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [bpData, setBpData] = useState([]);
  const [sugarData, setSugarData] = useState([]);
  const [customData, setCustomData] = useState([]);
  const [bpStats, setBpStats] = useState(null);
  const [sugarStats, setSugarStats] = useState(null);
  const [customStats, setCustomStats] = useState(null);
  const [days, setDays] = useState(30);
  const [testType, setTestType] = useState('bp');
  const [availableCustomTests, setAvailableCustomTests] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch patients on mount
  useEffect(() => {
    api.getPatients().then(list => {
      setPatients(list);
      if (list.length > 0) setSelectedId(list[0].id);
    }).catch(console.error);
  }, []);

  // Fetch chart + stats when patient, days, or testType changes
  useEffect(() => {
    if (!selectedId) return;
    const load = async () => {
      setLoading(true);
      try {
        // Fetch available custom tests for the dropdown
        const customTestsList = await api.getCustomTests(selectedId);
        const uniqueTests = [...new Set(customTestsList.map(t => t.test_name))];
        setAvailableCustomTests(uniqueTests);

        if (testType === 'bp') {
          const [bp, bpStat] = await Promise.all([
            api.getBpChart(selectedId, days),
            api.getBpStats(selectedId, days),
          ]);
          setBpData(bp.data || []);
          setBpStats(bpStat);
        } else if (testType === 'sugar') {
          const [sugar, sugarStat] = await Promise.all([
            api.getSugarChart(selectedId, days),
            api.getSugarStats(selectedId, days),
          ]);
          setSugarData(sugar.data || []);
          setSugarStats(sugarStat);
        } else {
          // Custom test
          const [customChart, customStat] = await Promise.all([
            api.getCustomTestChart(selectedId, testType, days),
            api.getCustomTestStats(selectedId, testType, days),
          ]);
          setCustomData(customChart.data || []);
          setCustomStats(customStat);
        }
      } catch (err) {
        console.error('Failed to load analytics', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedId, days, testType]);

  return (
    <div className="animate-fadeIn">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="flex items-center gap-3">
          <button id="back-btn" className="btn btn-ghost btn-icon btn-sm" onClick={() => navigate(-1)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Health Analytics</h2>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>Trends and insights for your family</p>
          </div>
        </div>

        <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
          {/* Patient selector */}
          {patients.length > 1 && (
            <select
              id="patient-select"
              className="input"
              style={{ width: 'auto', padding: '8px 36px 8px 14px', fontSize: '0.875rem' }}
              value={selectedId || ''}
              onChange={e => setSelectedId(Number(e.target.value))}
            >
              {patients.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}

          {/* Test Type selector */}
          <select
            className="input"
            style={{ width: 'auto', padding: '8px 36px 8px 14px', fontSize: '0.875rem' }}
            value={testType}
            onChange={e => setTestType(e.target.value)}
          >
            <option value="bp">Blood Pressure</option>
            <option value="sugar">Blood Sugar</option>
            {availableCustomTests.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {/* Days selector */}
          <div className="flex gap-1" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 4 }}>
            {[7, 14, 30, 90].map(d => (
              <button
                key={d}
                id={`days-${d}-btn`}
                onClick={() => setDays(d)}
                className="btn btn-sm"
                style={{
                  padding: '5px 12px',
                  borderRadius: 7,
                  fontSize: '0.8rem',
                  background: days === d ? 'var(--grad-primary)' : 'transparent',
                  color: days === d ? 'white' : 'var(--text-muted)',
                  boxShadow: days === d ? '0 2px 8px rgba(139,92,246,0.35)' : 'none',
                  border: 'none',
                }}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, flexDirection: 'column', gap: 16 }}>
          <div className="spinner" />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading analytics...</p>
        </div>
      ) : (
        <div className="flex-col gap-6">

          {/* ── Blood Pressure ───────────────────────────────────────── */}
          {testType === 'bp' && (
            <div className="card">
              <div className="section-header" style={{ marginBottom: '1.5rem' }}>
                <div>
                  <div className="section-title" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: '1rem' }}>🩸</span>
                    Blood Pressure — Last {days} Days
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                    Normal: Systolic &lt;120 · Diastolic &lt;80 mmHg
                  </p>
                </div>
                <span className={`badge ${bpData.length > 0 ? 'badge-success' : 'badge-muted'}`}>
                  {bpData.length} Reading{bpData.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* BP Stats */}
              {bpStats && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                  <StatChip label="Avg Systolic" value={bpStats.systolic?.avg} color="#f43f5e" unit="mmHg" />
                  <StatChip label="Avg Diastolic" value={bpStats.diastolic?.avg} color="#ec4899" unit="mmHg" />
                  <StatChip label="Max Systolic" value={bpStats.systolic?.max} color="#f59e0b" unit="mmHg" />
                  <StatChip label="Min Systolic" value={bpStats.systolic?.min} color="#10b981" unit="mmHg" />
                </div>
              )}

              <div style={{ height: 280 }}>
                {bpData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={bpData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="bpSystolicGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.25}/>
                          <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.02}/>
                        </linearGradient>
                        <linearGradient id="bpDiastolicGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.2}/>
                          <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
                      <XAxis dataKey="date_label" stroke="#475569" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis stroke="#475569" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={['dataMin - 10', 'dataMax + 10']} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: '0.8rem', color: 'var(--text-muted)' }} />
                      <ReferenceLine y={120} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.5}
                        label={{ value: 'Sys Normal', fill: '#10b981', fontSize: 10, position: 'insideTopRight' }} />
                      <ReferenceLine y={80} stroke="#3b82f6" strokeDasharray="4 4" strokeOpacity={0.5}
                        label={{ value: 'Dia Normal', fill: '#3b82f6', fontSize: 10, position: 'insideTopRight' }} />
                      <Area type="monotone" dataKey="systolic" name="Systolic" stroke="#f43f5e" strokeWidth={2.5} fill="url(#bpSystolicGrad)" dot={{ r: 3, fill: '#f43f5e' }} activeDot={{ r: 6, fill: '#f43f5e' }} />
                      <Area type="monotone" dataKey="diastolic" name="Diastolic" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#bpDiastolicGrad)" dot={{ r: 3, fill: '#8b5cf6' }} activeDot={{ r: 6, fill: '#8b5cf6' }} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: '2.5rem' }}>📊</div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No blood pressure data in the last {days} days</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Blood Sugar ──────────────────────────────────────────── */}
          {testType === 'sugar' && (
            <div className="card">
              <div className="section-header" style={{ marginBottom: '1.5rem' }}>
                <div>
                  <div className="section-title" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: '1rem' }}>🍬</span>
                    Blood Sugar — Last {days} Days
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                    Normal fasting: &lt;100 mg/dL · Post-meal: &lt;140 mg/dL
                  </p>
                </div>
                <span className={`badge ${sugarData.length > 0 ? 'badge-success' : 'badge-muted'}`}>
                  {sugarData.length} Reading{sugarData.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Sugar Stats */}
              {sugarStats && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                  <StatChip label="Avg Fasting" value={sugarStats.fasting?.avg} color="#f59e0b" unit="mg/dL" />
                  <StatChip label="Avg Post-Meal" value={sugarStats.post_meal?.avg} color="#f43f5e" unit="mg/dL" />
                  <StatChip label="Max Fasting" value={sugarStats.fasting?.max} color="#ec4899" unit="mg/dL" />
                  <StatChip label="Min Fasting" value={sugarStats.fasting?.min} color="#10b981" unit="mg/dL" />
                </div>
              )}

              <div style={{ height: 280 }}>
                {sugarData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sugarData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="fastingGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.25}/>
                          <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02}/>
                        </linearGradient>
                        <linearGradient id="postMealGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.2}/>
                          <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.02}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
                      <XAxis dataKey="date_label" stroke="#475569" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis stroke="#475569" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={['dataMin - 10', 'dataMax + 10']} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: '0.8rem', color: 'var(--text-muted)' }} />
                      <ReferenceLine y={100} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.5}
                        label={{ value: 'Normal Fasting', fill: '#10b981', fontSize: 10, position: 'insideTopRight' }} />
                      <ReferenceLine y={140} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.5}
                        label={{ value: 'Normal Post-Meal', fill: '#f59e0b', fontSize: 10, position: 'insideTopRight' }} />
                      <Area type="monotone" dataKey="fasting_sugar" name="Fasting Sugar" stroke="#f59e0b" strokeWidth={2.5} fill="url(#fastingGrad)" dot={{ r: 3, fill: '#f59e0b' }} activeDot={{ r: 6, fill: '#f59e0b' }} />
                      <Area type="monotone" dataKey="post_meal_sugar" name="Post-Meal Sugar" stroke="#f43f5e" strokeWidth={2.5} fill="url(#postMealGrad)" dot={{ r: 3, fill: '#f43f5e' }} activeDot={{ r: 6, fill: '#f43f5e' }} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: '2.5rem' }}>📊</div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No blood sugar data in the last {days} days</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Custom Test ──────────────────────────────────────────── */}
          {testType !== 'bp' && testType !== 'sugar' && (
            <div className="card">
              <div className="section-header" style={{ marginBottom: '1.5rem' }}>
                <div>
                  <div className="section-title" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: '1rem' }}>🔬</span>
                    {testType} — Last {days} Days
                  </div>
                </div>
                <span className={`badge ${customData.length > 0 ? 'badge-success' : 'badge-muted'}`}>
                  {customData.length} Reading{customData.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Custom Test Stats */}
              {customStats && customStats.stats && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                  <StatChip label={`Avg ${testType}`} value={customStats.stats?.avg} color="#3b82f6" unit={customStats.unit} />
                  <StatChip label={`Max ${testType}`} value={customStats.stats?.max} color="#ef4444" unit={customStats.unit} />
                  <StatChip label={`Min ${testType}`} value={customStats.stats?.min} color="#10b981" unit={customStats.unit} />
                </div>
              )}

              <div style={{ height: 280 }}>
                {customData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={customData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="customGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25}/>
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
                      <XAxis dataKey="date_label" stroke="#475569" tick={{ fontSize: 11 }} tickLine={false} />
                      <YAxis stroke="#475569" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: '0.8rem', color: 'var(--text-muted)' }} />
                      <Area type="monotone" dataKey="value" name={testType} stroke="#3b82f6" strokeWidth={2.5} fill="url(#customGrad)" dot={{ r: 3, fill: '#3b82f6' }} activeDot={{ r: 6, fill: '#3b82f6' }} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: '2.5rem' }}>📊</div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No data in the last {days} days</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Health Tips ──────────────────────────────────────────── */}
          {(testType === 'bp' || testType === 'sugar') && (
            <div className="card" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(99,102,241,0.06) 100%)', border: '1px solid rgba(59,130,246,0.2)' }}>
              <div className="section-title" style={{ marginBottom: '1rem' }}>
                <span>💡</span> Health Reference Guide
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                {[
                  { icon: '🩸', title: 'Normal BP', value: '120/80 mmHg', desc: 'Systolic/Diastolic' },
                  { icon: '⚠️', title: 'Stage 1 Hypertension', value: '130-139/80-89', desc: 'Consult a doctor' },
                  { icon: '🍬', title: 'Normal Fasting Sugar', value: '<100 mg/dL', desc: 'Before eating' },
                  { icon: '🍽️', title: 'Normal Post-Meal', value: '<140 mg/dL', desc: '2 hours after eating' },
                ].map((tip, i) => (
                  <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: 12, padding: '14px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '1.2rem', marginBottom: 6 }}>{tip.icon}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>{tip.title}</div>
                    <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 2 }}>{tip.value}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{tip.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
