import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { useNavigate } from 'react-router-dom';

// ─── Markdown-like renderer for AI summaries ──────────────────────────────
function AISummary({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div style={{ lineHeight: 1.8, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return (
            <div key={i} style={{
              fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)',
              marginTop: i === 0 ? 0 : '1.2rem', marginBottom: '0.4rem',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {line.replace('## ', '')}
            </div>
          );
        }
        if (line.startsWith('- ') || line.startsWith('• ')) {
          return (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, paddingLeft: 8 }}>
              <span style={{ color: 'var(--primary-light)', flexShrink: 0 }}>•</span>
              <span>{line.replace(/^[-•]\s*/, '')}</span>
            </div>
          );
        }
        if (line.startsWith('---')) {
          return <hr key={i} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1rem 0' }} />;
        }
        if (line.trim() === '') return <div key={i} style={{ height: 4 }} />;
        return <p key={i} style={{ margin: '4px 0' }}>{line}</p>;
      })}
    </div>
  );
}

// ─── Single Report Card ────────────────────────────────────────────────────
function ReportCard({ report, onDelete, onReanalyze, patients }) {
  const [expanded, setExpanded] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const patientName = patients.find(p => p.id === report.patient_id)?.name || 'Unknown';
  const date = new Date(report.uploaded_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  const time = new Date(report.uploaded_at).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit',
  });

  const handleReanalyze = async () => {
    setReanalyzing(true);
    try {
      await onReanalyze(report.id);
    } finally {
      setReanalyzing(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${report.filename}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await onDelete(report.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="card animate-slideUp" style={{
      border: '1px solid var(--border)',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      overflow: 'hidden',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)'; e.currentTarget.style.boxShadow = 'var(--glow-purple)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      {/* Card Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.15))',
            border: '1px solid rgba(139,92,246,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem',
          }}>
            📄
          </div>
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div style={{
              fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              marginBottom: 4,
            }}>
              {report.filename}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="badge badge-purple">{patientName}</span>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                {date} · {time}
              </span>
              {report.file_size_kb && (
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  {report.file_size_kb} KB
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            id={`reanalyze-report-${report.id}`}
            className="btn btn-ghost btn-sm"
            onClick={handleReanalyze}
            disabled={reanalyzing}
            title="Re-analyze with AI"
          >
            {reanalyzing ? '⏳' : '🔄'} {reanalyzing ? 'Analyzing...' : 'Re-analyze'}
          </button>
          <button
            id={`expand-report-${report.id}`}
            className="btn btn-secondary btn-sm"
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? '▲ Hide' : '▼ View'} AI Summary
          </button>
          <button
            id={`delete-report-${report.id}`}
            className="btn btn-ghost btn-sm"
            onClick={handleDelete}
            disabled={deleting}
            style={{ color: 'var(--danger)' }}
            title="Delete report"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* AI Summary Expandable */}
      {expanded && (
        <div style={{
          marginTop: '1.25rem', paddingTop: '1.25rem',
          borderTop: '1px solid var(--border)',
          animation: 'fadeIn 0.3s ease',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem',
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              borderRadius: 8, width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.9rem', flexShrink: 0,
            }}>🤖</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>AI Clinical Summary</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Generated by {'{'}Agent 5{'}'} · llama-3.3-70b-versatile
              </div>
            </div>
          </div>

          <div style={{
            background: 'rgba(99,102,241,0.04)',
            border: '1px solid rgba(99,102,241,0.12)',
            borderRadius: 12, padding: '1.25rem',
          }}>
            {report.ai_summary ? (
              <AISummary text={report.ai_summary} />
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
                No AI summary available. Click "Re-analyze" to generate one.
              </p>
            )}
          </div>

          <p style={{
            fontSize: '0.72rem', color: 'var(--text-muted)',
            marginTop: '0.75rem', textAlign: 'center',
          }}>
            📋 This AI summary is for informational purposes only and does not replace professional medical advice.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main Reports Page ─────────────────────────────────────────────────────
export default function Reports() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState(null);
  const [filterPatient, setFilterPatient] = useState('');
  const fileInputRef = useRef(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    try {
      const [pts, rpts] = await Promise.all([
        api.getPatients(),
        api.getReports(filterPatient || undefined),
      ]);
      setPatients(pts);
      setReports(rpts);
      if (pts.length > 0 && !selectedPatientId) {
        setSelectedPatientId(String(pts[0].id));
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  }, [filterPatient]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleFileUpload = async (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().match(/\.(pdf|png|jpg|jpeg)$/)) {
      showToast('Only PDF, PNG, and JPG files are supported', 'error');
      return;
    }
    if (!selectedPatientId) {
      showToast('Please select a family member first', 'error');
      return;
    }

    setUploading(true);
    setUploadProgress(10);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => Math.min(prev + 15, 85));
    }, 800);

    try {
      const result = await api.uploadReport(Number(selectedPatientId), file);
      clearInterval(progressInterval);
      setUploadProgress(100);
      setTimeout(() => {
        setUploadProgress(0);
        setUploading(false);
      }, 600);
      setReports(prev => [result, ...prev]);
      showToast(`✅ "${file.name}" uploaded and analyzed!`);
    } catch (err) {
      clearInterval(progressInterval);
      setUploadProgress(0);
      setUploading(false);
      showToast(err.message || 'Upload failed', 'error');
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [selectedPatientId]);

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  const handleDelete = async (reportId) => {
    try {
      await api.deleteReport(reportId);
      setReports(prev => prev.filter(r => r.id !== reportId));
      showToast('Report deleted');
    } catch (err) {
      showToast(err.message || 'Delete failed', 'error');
    }
  };

  const handleReanalyze = async (reportId) => {
    try {
      const result = await api.reanalyzeReport(reportId);
      setReports(prev => prev.map(r =>
        r.id === reportId ? { ...r, ai_summary: result.ai_summary } : r
      ));
      showToast('✅ AI re-analysis complete!');
    } catch (err) {
      showToast(err.message || 'Re-analysis failed', 'error');
    }
  };

  const filteredReports = filterPatient
    ? reports.filter(r => String(r.patient_id) === filterPatient)
    : reports;

  return (
    <div className="animate-fadeIn" style={{ maxWidth: 960, margin: '0 auto' }}>

      {/* ── Page Header */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.1) 100%)',
        border: '1px solid rgba(139,92,246,0.2)',
        borderRadius: 'var(--radius-xl)',
        padding: '2rem',
        marginBottom: '2rem',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: '-30%', right: '5%', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem',
            }}>📋</div>
            <div>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>Medical Reports</h1>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                Upload PDF reports · AI analyzes them instantly using <strong style={{ color: 'var(--primary-light)' }}>llama-3.3-70b</strong>
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <span className="badge badge-purple">5 AI Models Active</span>
            <span className="badge badge-info">Agent 5 · Report Analyzer</span>
            <span className="badge badge-success">{reports.length} Reports Uploaded</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '1.5rem', alignItems: 'start' }}>

        {/* ── Left: Upload Panel */}
        <div className="flex-col gap-4">

          {/* Patient Selector */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
              For Patient
            </div>
            {patients.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No family members yet</p>
                <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={() => navigate('/')}>
                  + Add Member
                </button>
              </div>
            ) : (
              <div className="flex-col gap-2">
                {patients.map(p => (
                  <button
                    key={p.id}
                    id={`select-patient-${p.id}`}
                    onClick={() => setSelectedPatientId(String(p.id))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      borderRadius: 10, border: selectedPatientId === String(p.id)
                        ? '1px solid rgba(139,92,246,0.5)' : '1px solid var(--border)',
                      background: selectedPatientId === String(p.id)
                        ? 'rgba(139,92,246,0.1)' : 'transparent',
                      cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left',
                      width: '100%',
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--grad-primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.75rem', fontWeight: 800, color: 'white',
                    }}>
                      {p.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{p.name}</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{p.relationship_to_user || 'Family'} · {p.age}y</div>
                    </div>
                    {selectedPatientId === String(p.id) && (
                      <span style={{ marginLeft: 'auto', color: 'var(--primary-light)', fontSize: '1rem' }}>✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Upload Zone */}
          <div
            id="upload-dropzone"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !uploading && fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? 'var(--primary-light)' : 'rgba(139,92,246,0.3)'}`,
              borderRadius: 'var(--radius-xl)',
              padding: '2rem 1.5rem',
              textAlign: 'center',
              cursor: uploading ? 'not-allowed' : 'pointer',
              background: dragOver ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.03)',
              transition: 'all 0.2s',
              opacity: uploading ? 0.7 : 1,
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              style={{ display: 'none' }}
              onChange={e => handleFileUpload(e.target.files[0])}
            />
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>
              {uploading ? '⏳' : '📤'}
            </div>
            {uploading ? (
              <>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Uploading & Analyzing...</div>
                <div style={{
                  height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', marginTop: 12,
                }}>
                  <div style={{
                    height: '100%', width: `${uploadProgress}%`,
                    background: 'var(--grad-primary)', borderRadius: 99,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 8 }}>
                  AI is reading your report... {uploadProgress}%
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>
                  Drop PDF here or click to upload
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Supports lab reports, prescriptions, discharge summaries
                </div>
                <button id="upload-btn" className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                  📂 Choose PDF File
                </button>
              </>
            )}
          </div>




        </div>

        {/* ── Right: Reports List */}
        <div className="flex-col gap-4">
          {/* Filter bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>
              Uploaded Reports
              <span className="badge badge-muted" style={{ marginLeft: 8 }}>{filteredReports.length}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                id="filter-patient-select"
                className="input"
                style={{ width: 'auto', padding: '6px 32px 6px 12px', fontSize: '0.82rem' }}
                value={filterPatient}
                onChange={e => setFilterPatient(e.target.value)}
              >
                <option value="">All Patients</option>
                {patients.map(p => (
                  <option key={p.id} value={String(p.id)}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <div className="spinner" style={{ margin: '0 auto 1rem' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading reports...</p>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', border: '1px dashed var(--border)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📂</div>
              <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>No Reports Yet</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Upload a PDF report on the left to get started with AI analysis
              </p>
            </div>
          ) : (
            <div className="flex-col gap-3">
              {filteredReports.map(report => (
                <ReportCard
                  key={report.id}
                  report={report}
                  patients={patients}
                  onDelete={handleDelete}
                  onReanalyze={handleReanalyze}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type}`} style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 999,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span>{toast.type === 'success' ? '✅' : '❌'}</span>
          <span style={{ fontSize: '0.875rem' }}>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
