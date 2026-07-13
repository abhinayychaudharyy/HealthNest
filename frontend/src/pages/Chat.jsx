import React, { useState, useRef, useEffect } from 'react';
import { api } from '../api';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const SUGGESTIONS = [
  "What is a safe blood pressure range?",
  "What are symptoms of high blood sugar?",
  "How should I store insulin?",
  "What time should I take my blood pressure medication?",
  "What foods should a diabetic avoid?",
];



function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0' }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.9rem', flexShrink: 0
      }}>🤖</div>
      <div className="chat-bubble ai" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 18px' }}>
        <div className="typing-dots">
          <span /><span /><span />
        </div>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginLeft: 6 }}>AI is thinking...</span>
      </div>
    </div>
  );
}

function ChatMessage({ msg, userPicture, userName }) {
  const isUser = msg.role === 'user';
  return (
    <div
      className="animate-slideUp"
      style={{ display: 'flex', alignItems: 'flex-end', gap: 10, justifyContent: isUser ? 'flex-end' : 'flex-start' }}
    >
      {!isUser && (
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.9rem', flexShrink: 0
        }}>🤖</div>
      )}

      <div style={{ maxWidth: '72%' }}>
        <div className={`chat-bubble ${isUser ? 'user' : 'ai'}`}>
          {msg.content}
          {msg.agent && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.15)', fontSize: '0.72rem', opacity: 0.75, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>🤖</span> via {msg.agent}
            </div>
          )}
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4, textAlign: isUser ? 'right' : 'left' }}>
          {new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {isUser && (
        userPicture ? (
          <img src={userPicture} alt="" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, border: '2px solid rgba(139,92,246,0.4)' }} />
        ) : (
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'var(--grad-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.85rem', color: 'white', fontWeight: 800, flexShrink: 0
          }}>
            {userName?.charAt(0) || 'U'}
          </div>
        )
      )}
    </div>
  );
}

export default function Chat() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState(null);
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      content: "Hi! I'm your AI Health Assistant powered by advanced LLMs. I can help you understand vitals, medications, and answer questions about your uploaded medical reports. How can I help your family today?",
      timestamp: Date.now(),
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [documentSummary, setDocumentSummary] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  // ── Stored Reports (persistent across sessions) ──────────────────────
  const [storedReports, setStoredReports] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [reportsLoading, setReportsLoading] = useState(true);

  useEffect(() => {
    api.getPatients().then(list => {
      setPatients(list);
      if (list.length > 0) setPatientId(list[0].id);
    }).catch(console.error);

    // Fetch stored reports
    api.getReports().then(reports => {
      setStoredReports(reports || []);
    }).catch(console.error).finally(() => setReportsLoading(false));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // When a stored report is selected, use its ai_summary as document context
  const handleSelectReport = (report) => {
    if (selectedReportId === report.id) {
      // Deselect
      setSelectedReportId(null);
      setUploadedFile(null);
      setDocumentSummary('');
      setMessages(prev => [...prev, {
        role: 'ai',
        content: 'Report context cleared. I\'ll still reference all your stored reports for general questions.',
        timestamp: Date.now(),
      }]);
    } else {
      setSelectedReportId(report.id);
      setUploadedFile(report.filename);
      setDocumentSummary(report.ai_summary || '');
      setMessages(prev => [...prev, {
        role: 'ai',
        content: `📄 Now focused on report: "${report.filename}". Ask me anything about this report — I'll answer concisely based on the analysis.`,
        agent: 'Report_Context',
        timestamp: Date.now(),
      }]);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setUploadedFile(file.name);
    setIsUploading(true);
    try {
      const response = await api.uploadChatContext(patientId || 1, file);
      setDocumentSummary(response.summary);
      setMessages(prev => [...prev, {
        role: 'ai',
        content: `I have analyzed the document "${file.name}". You can ask me questions about this document — I'll answer concisely.`,
        agent: 'Vision_Analyzer',
        timestamp: Date.now(),
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'ai',
        content: `Failed to analyze document: ${err.message}`,
        timestamp: Date.now(),
      }]);
      setUploadedFile(null);
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async (query = input) => {
    const trimmed = query.trim();
    if (!trimmed || loading) return;

    const userMsg = { role: 'user', content: trimmed, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await api.chat(patientId || 1, trimmed, documentSummary);
      setMessages(prev => [...prev, {
        role: 'ai',
        content: response.response,
        agent: response.agent_used,
        timestamp: Date.now(),
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'ai',
        content: 'Sorry, I encountered an error. Please check your connection and try again.',
        timestamp: Date.now(),
      }]);
    }
    setLoading(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', maxWidth: 960, margin: '0 auto' }}>

      {/* ── Chat Header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="flex items-center gap-3">
          <button id="chat-back-btn" className="btn btn-ghost btn-icon btn-sm" onClick={() => navigate(-1)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.3rem',
            boxShadow: 'var(--glow-purple)'
          }}>🤖</div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>AI Health Assistant</h2>
            <div className="flex items-center gap-2">
              <div className="pulse-dot" />
              <span style={{ fontSize: '0.78rem', color: 'var(--success)' }}>
                Online · {storedReports.length} report{storedReports.length !== 1 ? 's' : ''} in memory
              </span>
            </div>
          </div>
        </div>

        {/* Patient context selector */}
        {patients.length > 0 && (
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Context:</span>
            <select
              id="chat-patient-select"
              className="input"
              style={{ width: 'auto', padding: '6px 32px 6px 12px', fontSize: '0.82rem' }}
              value={patientId || ''}
              onChange={e => setPatientId(Number(e.target.value))}
            >
              <option value="">General (no patient)</option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Stored Reports Bar ───────────────────────────────────────── */}
      {storedReports.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            📋 Your Reports ({storedReports.length}) — click to focus AI on a report
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {storedReports.slice(0, 8).map(rpt => {
              const isActive = selectedReportId === rpt.id;
              return (
                <button
                  key={rpt.id}
                  id={`report-chip-${rpt.id}`}
                  onClick={() => handleSelectReport(rpt)}
                  style={{
                    padding: '5px 12px', borderRadius: 99, fontSize: '0.78rem',
                    border: isActive ? '1px solid rgba(139,92,246,0.6)' : '1px solid var(--border)',
                    background: isActive ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.04)',
                    color: isActive ? 'var(--primary-light)' : 'var(--text-secondary)',
                    cursor: 'pointer', transition: 'all 0.15s', fontWeight: isActive ? 700 : 500,
                    maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                  title={rpt.filename}
                >
                  {isActive ? '✓ ' : '📄 '}{rpt.filename}
                </button>
              );
            })}
            {storedReports.length > 8 && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                +{storedReports.length - 8} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Messages Area ────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        padding: '1.25rem',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        marginBottom: '1rem',
        minHeight: 0,
      }}>
        {messages.map((msg, i) => (
          <ChatMessage key={i} msg={msg} userPicture={user?.picture} userName={user?.name} />
        ))}
        {loading && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Suggestions ─────────────────────────────────────────────── */}
      {messages.length <= 2 && !loading && (
        <div style={{ marginBottom: '0.75rem', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              id={`suggestion-${i}`}
              onClick={() => handleSend(s)}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.78rem', borderRadius: 99, padding: '5px 12px' }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Context Mode Chip */}
      {uploadedFile && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
          background: 'var(--grad-primary)', color: 'white', borderRadius: 12, marginBottom: '0.75rem', fontSize: '0.85rem',
          boxShadow: 'var(--glow-purple)'
        }}>
          <span>📎 <strong>Document Mode:</strong> {uploadedFile}</span>
          <button 
            onClick={() => { setUploadedFile(null); setDocumentSummary(''); setSelectedReportId(null); }}
            style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', cursor: 'pointer', marginLeft: 'auto', padding: '4px 10px', borderRadius: 8, fontSize: '0.75rem' }}
          >✕ Clear Context</button>
        </div>
      )}

      {/* ── Input Area ───────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-bright)',
        borderRadius: 'var(--radius-xl)',
        padding: '8px 8px 8px 16px',
        transition: 'border-color 0.2s',
      }}>
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          accept=".pdf,.png,.jpg,.jpeg" 
          onChange={handleFileUpload} 
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={loading || isUploading}
          className="btn btn-ghost btn-icon"
          title="Upload Document"
          style={{ borderRadius: 14, flexShrink: 0, width: 44, height: 44, color: 'var(--text-muted)' }}
        >
          {isUploading ? (
            <svg style={{ animation: 'spin 0.8s linear infinite' }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
          )}
        </button>
        <textarea
          id="chat-input"
          ref={inputRef}
          className="scroll-area"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about vitals, medications, your reports..."
          disabled={loading}
          rows={1}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: '0.9rem',
            fontFamily: "'Inter', sans-serif",
            resize: 'none',
            lineHeight: 1.5,
            paddingTop: 6,
            maxHeight: 120,
            overflowY: 'auto',
          }}
          onInput={e => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
          }}
        />
        <button
          id="send-btn"
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
          className="btn btn-primary btn-icon"
          style={{ borderRadius: 14, flexShrink: 0, width: 44, height: 44 }}
        >
          {loading ? (
            <svg style={{ animation: 'spin 0.8s linear infinite' }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          )}
        </button>
      </div>

      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.5rem' }}>
        Press Enter to send · Shift+Enter for new line · AI gives concise answers based on your reports & vitals
      </p>
    </div>
  );
}
