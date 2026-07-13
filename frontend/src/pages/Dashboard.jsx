import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import { useNavigate } from 'react-router-dom';

// ─── Helpers ──────────────────────────────────────────────────────────────
const avatarColors = ['purple', 'teal', 'rose', 'amber', 'blue'];
function getAvatarColor(index) { return avatarColors[index % avatarColors.length]; }
function getInitials(name = '') {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
function bpStatusClass(status) {
  if (!status) return 'badge-muted';
  const s = status.toUpperCase();
  if (s.includes('NORMAL')) return 'badge-success';
  if (s.includes('ELEVATED') || s.includes('HIGH')) return 'badge-warning';
  return 'badge-danger';
}

// ─── Add Patient Modal ─────────────────────────────────────────────────────
function AddPatientModal({ onClose, onAdded }) {
  const [form, setForm] = useState({ name: '', age: '', relationship_to_user: '', baseline_medical_conditions: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.age) return setError('Name and age are required.');
    setLoading(true);
    setError('');
    try {
      await api.createPatient({ ...form, age: Number(form.age) });
      onAdded();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add patient.');
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Add Family Member</div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>Track their vitals & medications</p>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-col gap-4">
          <div className="input-group">
            <label className="input-label">Full Name *</label>
            <input
              id="patient-name-input"
              className="input"
              placeholder="e.g. Dad, Mum, Ravi Sharma"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              required
            />
          </div>
          <div className="grid-2">
            <div className="input-group">
              <label className="input-label">Age *</label>
              <input
                id="patient-age-input"
                type="number"
                className="input"
                placeholder="Age in years"
                value={form.age}
                onChange={e => setForm(p => ({ ...p, age: e.target.value }))}
                min={0} max={150} required
              />
            </div>
            <div className="input-group">
              <label className="input-label">Relationship</label>
              <input
                id="patient-rel-input"
                className="input"
                placeholder="e.g. Dad, Mom, Wife"
                value={form.relationship_to_user}
                onChange={e => setForm(p => ({ ...p, relationship_to_user: e.target.value }))}
              />
            </div>
          </div>
          <div className="input-group">
            <label className="input-label">Medical Conditions</label>
            <input
              id="patient-conditions-input"
              className="input"
              placeholder="e.g. Diabetes, Hypertension"
              value={form.baseline_medical_conditions}
              onChange={e => setForm(p => ({ ...p, baseline_medical_conditions: e.target.value }))}
            />
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: 10, fontSize: '0.85rem', color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          <div className="flex gap-3" style={{ marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button id="add-patient-submit" type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={loading}>
              {loading ? 'Adding...' : '+ Add Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit Patient Modal ─────────────────────────────────────────────────────
function EditPatientModal({ patient, onClose, onUpdated }) {
  const [form, setForm] = useState({
    name: patient.name || '',
    age: patient.age || '',
    relationship_to_user: patient.relationship_to_user || '',
    baseline_medical_conditions: patient.baseline_medical_conditions || ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.age) return setError('Name and age are required.');
    setLoading(true);
    setError('');
    try {
      await api.updatePatient(patient.id, { ...form, age: Number(form.age) });
      onUpdated();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update patient.');
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Edit Family Member</div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-col gap-4">
          <div className="input-group">
            <label className="input-label">Full Name *</label>
            <input
              className="input"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              required
            />
          </div>
          <div className="grid-2">
            <div className="input-group">
              <label className="input-label">Age *</label>
              <input
                type="number"
                className="input"
                value={form.age}
                onChange={e => setForm(p => ({ ...p, age: e.target.value }))}
                min={0} max={150} required
              />
            </div>
            <div className="input-group">
              <label className="input-label">Relationship</label>
              <input
                className="input"
                value={form.relationship_to_user}
                onChange={e => setForm(p => ({ ...p, relationship_to_user: e.target.value }))}
              />
            </div>
          </div>
          <div className="input-group">
            <label className="input-label">Medical Conditions</label>
            <input
              className="input"
              value={form.baseline_medical_conditions}
              onChange={e => setForm(p => ({ ...p, baseline_medical_conditions: e.target.value }))}
            />
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: 10, fontSize: '0.85rem', color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          <div className="flex gap-3" style={{ marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add/Edit Vitals Modal ─────────────────────────────────────────────────────
function AddVitalsModal({ patient, type, initialData, onClose, onAdded }) {
  const [form, setForm] = useState(
    initialData ? { ...initialData } : (
      type === 'bp'
        ? { systolic: '', diastolic: '', recorded_at: '' }
        : { fasting_sugar: '', post_meal_sugar: '', recorded_at: '' }
    )
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Format datetime for input if editing
  useEffect(() => {
    if (initialData?.recorded_at) {
      setForm(prev => ({ ...prev, recorded_at: initialData.recorded_at.slice(0, 16) }));
    }
  }, [initialData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = { ...form, patient_id: patient.patient.id };
      if (payload.recorded_at) {
        payload.recorded_at = new Date(payload.recorded_at).toISOString();
      } else {
        delete payload.recorded_at;
      }
      
      delete payload.id;
      delete payload.status;
      delete payload.fasting; // from latest_sugar formatting
      delete payload.post_meal;

      if (type === 'bp') {
        if (initialData?.id) {
          await api.updateBP(patient.patient.id, initialData.id, { ...payload, systolic: Number(form.systolic), diastolic: Number(form.diastolic) });
        } else {
          await api.logBP({ ...payload, systolic: Number(form.systolic), diastolic: Number(form.diastolic) });
        }
      } else {
        if (initialData?.id) {
          await api.updateSugar(patient.patient.id, initialData.id, { ...payload, fasting_sugar: Number(form.fasting_sugar || form.fasting), post_meal_sugar: Number(form.post_meal_sugar || form.post_meal) });
        } else {
          await api.logSugar({ ...payload, fasting_sugar: Number(form.fasting_sugar), post_meal_sugar: Number(form.post_meal_sugar) });
        }
      }
      onAdded();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to log vitals.');
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">
              {initialData ? 'Edit' : 'Log'} {type === 'bp' ? 'Blood Pressure' : 'Blood Sugar'}
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
              For {patient?.patient?.name}
            </p>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-col gap-4">
          {type === 'bp' ? (
            <div className="grid-2">
              <div className="input-group">
                <label className="input-label">Systolic (mmHg)</label>
                <input id="systolic-input" type="number" className="input" placeholder="e.g. 120" value={form.systolic}
                  onChange={e => setForm(p => ({ ...p, systolic: e.target.value }))} min={50} max={300} required />
              </div>
              <div className="input-group">
                <label className="input-label">Diastolic (mmHg)</label>
                <input id="diastolic-input" type="number" className="input" placeholder="e.g. 80" value={form.diastolic}
                  onChange={e => setForm(p => ({ ...p, diastolic: e.target.value }))} min={30} max={200} required />
              </div>
            </div>
          ) : (
            <div className="grid-2">
              <div className="input-group">
                <label className="input-label">Fasting Sugar (mg/dL)</label>
                <input id="fasting-input" type="number" className="input" placeholder="e.g. 95" value={form.fasting_sugar || form.fasting || ''}
                  onChange={e => setForm(p => ({ ...p, fasting_sugar: e.target.value }))} min={0} max={1000} required />
              </div>
              <div className="input-group">
                <label className="input-label">Post-Meal (mg/dL)</label>
                <input id="post-meal-input" type="number" className="input" placeholder="e.g. 140" value={form.post_meal_sugar || form.post_meal || ''}
                  onChange={e => setForm(p => ({ ...p, post_meal_sugar: e.target.value }))} min={0} max={1500} required />
              </div>
            </div>
          )}

          <div className="input-group">
            <label className="input-label">Date & Time (Optional)</label>
            <input 
              id="recorded-at-input" 
              type="datetime-local" 
              className="input" 
              value={form.recorded_at}
              onChange={e => setForm(p => ({ ...p, recorded_at: e.target.value }))} 
            />
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Leave blank to use current time.
            </p>
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: 10, fontSize: '0.85rem', color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          <div className="flex gap-3" style={{ marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button id="log-vitals-submit" type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={loading}>
              {loading ? 'Saving...' : 'Save Reading'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add Medication Modal ──────────────────────────────────────────────────
function AddMedicationModal({ patient, onClose, onAdded }) {
  const [form, setForm] = useState({ medicine_name: '', dosage: '', time_of_day: '', instructions: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.addMedication(patient.patient.id, { ...form, patient_id: patient.patient.id });
      onAdded();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add medication.');
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Add Medication</div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>For {patient?.patient?.name}</p>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-col gap-4">
          <div className="input-group">
            <label className="input-label">Medicine Name *</label>
            <input id="med-name-input" className="input" placeholder="e.g. Metformin, Amlodipine" value={form.medicine_name}
              onChange={e => setForm(p => ({ ...p, medicine_name: e.target.value }))} required />
          </div>
          <div className="grid-2">
            <div className="input-group">
              <label className="input-label">Dosage *</label>
              <input id="med-dosage-input" className="input" placeholder="e.g. 500mg" value={form.dosage}
                onChange={e => setForm(p => ({ ...p, dosage: e.target.value }))} required />
            </div>
            <div className="input-group">
              <label className="input-label">Time (HH:MM) *</label>
              <input id="med-time-input" type="time" className="input" value={form.time_of_day}
                onChange={e => setForm(p => ({ ...p, time_of_day: e.target.value }))} required />
            </div>
          </div>
          <div className="input-group">
            <label className="input-label">Instructions</label>
            <input id="med-instructions-input" className="input" placeholder="e.g. Take after meals" value={form.instructions}
              onChange={e => setForm(p => ({ ...p, instructions: e.target.value }))} />
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: 10, fontSize: '0.85rem', color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          <div className="flex gap-3" style={{ marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button id="add-med-submit" type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={loading}>
              {loading ? 'Adding...' : '+ Add Medication'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit Medication Modal ─────────────────────────────────────────────────
function EditMedicationModal({ patient, medication, onClose, onUpdated }) {
  const [form, setForm] = useState({ 
    medicine_name: medication.medicine_name || medication.medicine || '', 
    dosage: medication.dosage || '', 
    time_of_day: medication.time_of_day || medication.time || '', 
    instructions: medication.instructions || '' 
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.updateMedication(patient.patient.id, medication.id, { ...form });
      onUpdated();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update medication.');
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Edit Medication</div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>For {patient?.patient?.name}</p>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-col gap-4">
          <div className="input-group">
            <label className="input-label">Medicine Name *</label>
            <input className="input" placeholder="e.g. Metformin, Amlodipine" value={form.medicine_name}
              onChange={e => setForm(p => ({ ...p, medicine_name: e.target.value }))} required />
          </div>
          <div className="grid-2">
            <div className="input-group">
              <label className="input-label">Dosage *</label>
              <input className="input" placeholder="e.g. 500mg" value={form.dosage}
                onChange={e => setForm(p => ({ ...p, dosage: e.target.value }))} required />
            </div>
            <div className="input-group">
              <label className="input-label">Time (HH:MM) *</label>
              <input type="time" className="input" value={form.time_of_day}
                onChange={e => setForm(p => ({ ...p, time_of_day: e.target.value }))} required />
            </div>
          </div>
          <div className="input-group">
            <label className="input-label">Instructions</label>
            <input className="input" placeholder="e.g. Take after meals" value={form.instructions}
              onChange={e => setForm(p => ({ ...p, instructions: e.target.value }))} />
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: 10, fontSize: '0.85rem', color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          <div className="flex gap-3" style={{ marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Phone Settings Modal ─────────────────────────────────────────────────
function PhoneModal({ user, onClose, onSaved }) {
  const [phone, setPhone] = useState(user?.phone_number || '');
  const [loading, setLoading] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.updateProfile({ phone_number: phone });
      onSaved?.();
      onClose();
    } catch { /* ignored */ }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">SMS Notifications</div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>✕</button>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Add your phone number to receive daily medication reminders via SMS.
        </p>
        <form onSubmit={handleSave} className="flex-col gap-4">
          <div className="input-group">
            <label className="input-label">Phone Number (E.164 format)</label>
            <input id="phone-input" className="input" placeholder="+919876543210" value={phone}
              onChange={e => setPhone(e.target.value)} />
          </div>
          <div className="flex gap-3">
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button id="save-phone-btn" type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={loading}>
              {loading ? 'Saving...' : 'Save Number'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Notification Center Panel ────────────────────────────────────────────
function NotificationCenter({ onClose }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ pending_count: 0, due_now_count: 0 });

  useEffect(() => {
    api.getNotifications().then(data => {
      setNotifications(data.notifications || []);
      setStats({ pending_count: data.pending_count, due_now_count: data.due_now_count });
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">🔔 Notification Center</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <span className="badge badge-warning">{stats.pending_count} Pending</span>
              {stats.due_now_count > 0 && <span className="badge badge-danger">{stats.due_now_count} Due Now!</span>}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div className="spinner" style={{ margin: '0 auto 1rem' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading notifications...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🎉</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No medications scheduled yet</p>
            </div>
          ) : (
            <div className="flex-col gap-2">
              {notifications.map(n => (
                <div key={n.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                  borderRadius: 12, transition: 'all 0.15s',
                  background: n.is_due_now ? 'rgba(244,63,94,0.1)' : n.status === 'pending' ? 'rgba(245,158,11,0.06)' : 'rgba(20,184,166,0.06)',
                  border: `1px solid ${n.is_due_now ? 'rgba(244,63,94,0.3)' : n.status === 'pending' ? 'rgba(245,158,11,0.2)' : 'rgba(20,184,166,0.2)'}`,
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: n.is_due_now ? 'rgba(244,63,94,0.15)' : 'rgba(139,92,246,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem',
                  }}>{n.is_due_now ? '🚨' : n.status === 'sent' ? '✅' : '💊'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                      {n.medicine_name} · {n.dosage}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {n.patient_name} · {n.time_of_day}{n.instructions ? ` · ${n.instructions}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: n.is_due_now ? 'var(--danger)' : 'var(--primary-light)' }}>
                      {n.time_of_day}
                    </div>
                    <span className={`badge ${n.status === 'sent' ? 'badge-success' : n.is_due_now ? 'badge-danger' : 'badge-warning'}`}
                      style={{ fontSize: '0.68rem' }}>
                      {n.is_due_now ? 'DUE NOW' : n.status === 'sent' ? 'Taken' : 'Pending'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '1rem 0 0', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
            💊 Medications reset daily at midnight for recurring schedules
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Add/Edit Custom Test Modal ─────────────────────────────────────────────
const COMMON_CUSTOM_TESTS = [
  { name: 'Weight', unit: 'kg' },
  { name: 'Heart Rate', unit: 'bpm' },
  { name: 'SpO2', unit: '%' },
  { name: 'Body Temperature', unit: '°F' },
  { name: 'Respiratory Rate', unit: 'bpm' },
  { name: 'Cholesterol', unit: 'mg/dL' },
  { name: 'Hemoglobin', unit: 'g/dL' }
];

function AddCustomTestModal({ patient, initialData, onClose, onAdded }) {
  const [form, setForm] = useState(
    initialData ? { ...initialData } : { test_name: COMMON_CUSTOM_TESTS[0].name, value: '', unit: COMMON_CUSTOM_TESTS[0].unit, recorded_at: '' }
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [isOther, setIsOther] = useState(false);

  useEffect(() => {
    if (initialData?.recorded_at) {
      setForm(prev => ({ ...prev, recorded_at: initialData.recorded_at.slice(0, 16) }));
    }
    if (initialData && !COMMON_CUSTOM_TESTS.find(t => t.name === initialData.test_name)) {
      setIsOther(true);
    }
  }, [initialData]);

  const handleTestNameChange = (e) => {
    if (e.target.value === 'Other') {
      setIsOther(true);
      setForm(p => ({ ...p, test_name: '', unit: '' }));
    } else {
      setIsOther(false);
      const selected = COMMON_CUSTOM_TESTS.find(t => t.name === e.target.value);
      setForm(p => ({ ...p, test_name: e.target.value, unit: selected ? selected.unit : '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (!form.test_name || !form.test_name.trim()) {
        throw new Error("Test name is required.");
      }
      const payload = { ...form, patient_id: patient.patient.id, value: Number(form.value), test_name: form.test_name.trim() };
      if (payload.recorded_at) {
        payload.recorded_at = new Date(payload.recorded_at).toISOString();
      } else {
        delete payload.recorded_at;
      }
      
      delete payload.id;

      if (initialData?.id) {
        await api.updateCustomTest(patient.patient.id, initialData.id, payload);
      } else {
        await api.addCustomTest(payload);
      }
      onAdded();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to log custom test.');
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">
              {initialData ? 'Edit' : 'Log'} Custom Test
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
              For {patient?.patient?.name}
            </p>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-col gap-4">
          <div className="input-group">
            <label className="input-label">Test Type</label>
            <select className="input" value={isOther ? 'Other' : form.test_name} onChange={handleTestNameChange} disabled={!!initialData} required>
              <option value="" disabled>Select test type</option>
              {COMMON_CUSTOM_TESTS.map(t => (
                <option key={t.name} value={t.name}>{t.name} ({t.unit})</option>
              ))}
              <option value="Other">Other (Enter manually)</option>
            </select>
          </div>
          
          {isOther && (
            <div className="input-group">
              <label className="input-label">Custom Test Name</label>
              <input type="text" className="input" placeholder="e.g. Vitamin D" value={form.test_name}
                onChange={e => setForm(p => ({ ...p, test_name: e.target.value }))} disabled={!!initialData} required />
            </div>
          )}

          <div className="grid-2">
            <div className="input-group">
              <label className="input-label">Value</label>
              <input type="number" step="0.01" className="input" placeholder="e.g. 75" value={form.value}
                onChange={e => setForm(p => ({ ...p, value: e.target.value }))} required />
            </div>
            <div className="input-group">
              <label className="input-label">Unit</label>
              <input type="text" className="input" placeholder="e.g. ng/mL" value={form.unit} 
                onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} disabled={!isOther && !!initialData} required />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Date & Time (Optional)</label>
            <input type="datetime-local" className="input" value={form.recorded_at}
              onChange={e => setForm(p => ({ ...p, recorded_at: e.target.value }))} />
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: 10, fontSize: '0.85rem', color: 'var(--danger)' }}>
              {error}
            </div>
          )}

          <div className="flex gap-3" style={{ marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={loading}>
              {loading ? 'Saving...' : (initialData ? 'Update Record' : 'Save Record')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Toast ─────────────────────────────────────────────────────────────────
function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={`toast ${type}`}>
      <span style={{ fontSize: '1.1rem' }}>
        {type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}
      </span>
      <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{message}</span>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dashboardData, setDashboardData] = useState(null);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [customTests, setCustomTests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [showBPModal, setShowBPModal] = useState(false);
  const [editingBP, setEditingBP] = useState(null);
  const [showSugarModal, setShowSugarModal] = useState(false);
  const [editingSugar, setEditingSugar] = useState(null);
  const [showMedModal, setShowMedModal] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showEditPatient, setShowEditPatient] = useState(false);
  const [showEditMedModal, setShowEditMedModal] = useState(false);
  const [showCustomTestModal, setShowCustomTestModal] = useState(false);
  const [editingCustomTest, setEditingCustomTest] = useState(null);
  const [selectedMed, setSelectedMed] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [toast, setToast] = useState(null);
  const notifPollRef = useRef(null);

  const showToast = (message, type = 'success') => setToast({ message, type });

  useEffect(() => { fetchDashboard(); }, []);

  const fetchAndGroupCustomTests = async (patientId) => {
    try {
      const tests = await api.getCustomTests(patientId);
      // Group by test_name and only keep the most recent reading for each
      const latestTestsMap = {};
      tests.forEach(t => {
        if (!latestTestsMap[t.test_name] || new Date(t.recorded_at) > new Date(latestTestsMap[t.test_name].recorded_at)) {
          latestTestsMap[t.test_name] = t;
        }
      });
      // Sort by most recently recorded across all tests
      setCustomTests(Object.values(latestTestsMap).sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at)));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (selectedPatient) {
      fetchAndGroupCustomTests(selectedPatient.patient.id);
    } else {
      setCustomTests([]);
    }
  }, [selectedPatient]);

  // ── Notification polling + Browser Notification API ────────────────────
  const fetchNotifCount = useCallback(async () => {
    try {
      const data = await api.getNotifications();
      setNotifCount(data.pending_count || 0);
      // Browser notification for due-now medications
      if (data.due_now_count > 0 && 'Notification' in window && Notification.permission === 'granted') {
        const dueItems = (data.notifications || []).filter(n => n.is_due_now);
        dueItems.forEach(n => {
          new Notification(`💊 Medication Due: ${n.medicine_name}`, {
            body: `${n.patient_name} — ${n.dosage} at ${n.time_of_day}${n.instructions ? ' · ' + n.instructions : ''}`,
            icon: '💊',
            tag: `med-${n.id}`,
          });
        });
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    // Request browser notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    fetchNotifCount();
    notifPollRef.current = setInterval(fetchNotifCount, 60000); // poll every 60s
    return () => clearInterval(notifPollRef.current);
  }, [fetchNotifCount]);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const data = await api.getDashboard();
      setDashboardData(data);
      if (data.family?.length > 0) {
        setSelectedPatient(prev => {
          if (prev) {
            const updated = data.family.find(f => f.patient.id === prev.patient.id);
            return updated || data.family[0];
          }
          return data.family[0];
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDataAdded = () => {
    fetchDashboard();
    showToast('Data saved successfully!');
  };

  const handleDeleteMedication = async (patientId, medId) => {
    if (!window.confirm("Are you sure you want to delete this medication?")) return;
    try {
      await api.deleteMedication(patientId, medId);
      fetchDashboard();
      showToast('Medication deleted successfully!');
    } catch (err) {
      showToast(err.message || 'Failed to delete medication.', 'error');
    }
  };

  const handleDeletePatient = async (patientId) => {
    if (!window.confirm("Are you sure you want to permanently delete this family member and all their health data?")) return;
    try {
      await api.deletePatient(patientId);
      setSelectedPatient(null);
      fetchDashboard();
      showToast('Family member deleted successfully!');
    } catch (err) {
      showToast(err.message || 'Failed to delete family member.', 'error');
    }
  };

  const handleDeleteBP = async (recordId) => {
    if (!window.confirm("Delete this blood pressure reading?")) return;
    try {
      await api.deleteBP(selectedPatient.patient.id, recordId);
      fetchDashboard();
      showToast('Reading deleted.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteSugar = async (recordId) => {
    if (!window.confirm("Delete this blood sugar reading?")) return;
    try {
      await api.deleteSugar(selectedPatient.patient.id, recordId);
      fetchDashboard();
      showToast('Reading deleted.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteCustomTest = async (recordId) => {
    if (!window.confirm("Delete this custom test reading?")) return;
    try {
      await api.deleteCustomTest(selectedPatient.patient.id, recordId);
      fetchAndGroupCustomTests(selectedPatient.patient.id);
      showToast('Reading deleted.');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // ── Stats summary ─────────────────────────────────────────────────────
  const totalPatients = dashboardData?.family?.length ?? 0;
  const totalMeds = dashboardData?.family?.reduce((sum, f) => sum + (f.medications?.length ?? 0), 0) ?? 0;
  const abnormalVitals = dashboardData?.family?.filter(
    f => f.latest_bp?.status !== 'NORMAL' || f.latest_sugar?.status !== 'NORMAL'
  ).length ?? 0;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: 16 }}>
        <div className="spinner" />
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      {/* ── Welcome Banner ──────────────────────────────────────────────── */}
      <div className="card" style={{
        marginBottom: '2rem',
        background: 'linear-gradient(135deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.02) 50%, rgba(0,0,0,0.01) 100%)',
        border: '1px solid rgba(0,0,0,0.1)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Glow orbs */}
        <div className="glow-orb glow-orb-purple" style={{ width: 200, height: 200, top: '-50%', right: '5%', opacity: 0.3 }} />
        <div className="glow-orb glow-orb-teal" style={{ width: 150, height: 150, bottom: '-40%', right: '25%', opacity: 0.2 }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 1, flexWrap: 'wrap', gap: '1rem' }}>
          <div className="flex items-center gap-4">
            {user?.picture ? (
              <img src={user.picture} alt="Profile" style={{ width: 56, height: 56, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.5)' }} />
            ) : (
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--grad-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', color: 'white', fontWeight: 800 }}>
                {user?.name?.charAt(0) || 'U'}
              </div>
            )}
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--primary-light)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'} 👋
              </div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '2px 0 4px', letterSpacing: '-0.02em' }}>
                {user?.name || 'Welcome back'}
              </h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
            <button id="notif-center-btn" className="btn btn-ghost btn-sm" onClick={() => setShowNotifications(true)}
              style={{ position: 'relative' }}>
              🔔 Notifications
              {notifCount > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4, width: 20, height: 20,
                  borderRadius: '50%', background: 'var(--danger)', color: 'white',
                  fontSize: '0.68rem', fontWeight: 800, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 8px rgba(244,63,94,0.5)',
                  animation: 'pulse 2s infinite',
                }}>{notifCount}</span>
              )}
            </button>
            <button id="phone-settings-btn" className="btn btn-ghost btn-sm" onClick={() => setShowPhoneModal(true)}>
              📱 SMS Alerts
            </button>
            <button id="add-patient-btn" className="btn btn-primary btn-sm" onClick={() => setShowAddPatient(true)}>
              + Add Member
            </button>
          </div>
        </div>
      </div>

      {/* ── Stats Row ──────────────────────────────────────────────────── */}
      <div className="grid-4 stagger-children" style={{ marginBottom: '2rem' }}>
        <div className="stat-card purple animate-floatUp">
          <div className="flex items-center justify-between">
            <div className="stat-icon-wrap purple">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <span className="badge badge-purple">{totalPatients > 0 ? 'Active' : 'Empty'}</span>
          </div>
          <div>
            <div className="stat-value">{totalPatients}</div>
            <div className="stat-label">Family Members</div>
          </div>
        </div>

        <div className="stat-card teal animate-floatUp">
          <div className="flex items-center justify-between">
            <div className="stat-icon-wrap teal">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
              </svg>
            </div>
            <span className={`badge ${abnormalVitals > 0 ? 'badge-warning' : 'badge-success'}`}>
              {abnormalVitals > 0 ? `${abnormalVitals} Alert${abnormalVitals > 1 ? 's' : ''}` : 'All Normal'}
            </span>
          </div>
          <div>
            <div className="stat-value" style={{ color: abnormalVitals > 0 ? 'var(--warning)' : 'var(--success)' }}>{abnormalVitals}</div>
            <div className="stat-label">Vitals Alerts</div>
          </div>
        </div>

        <div className="stat-card animate-floatUp">
          <div className="flex items-center justify-between">
            <div className="stat-icon-wrap amber">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              </svg>
            </div>
            <span className="badge badge-info">Scheduled</span>
          </div>
          <div>
            <div className="stat-value">{totalMeds}</div>
            <div className="stat-label">Medications</div>
          </div>
        </div>

        <div className="stat-card rose animate-floatUp" style={{ cursor: 'pointer' }} onClick={() => navigate('/chat')}>
          <div className="flex items-center justify-between">
            <div className="stat-icon-wrap rose">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <span className="badge badge-purple">AI</span>
          </div>
          <div>
            <div className="stat-value" style={{ fontSize: '1.5rem', paddingTop: 4 }}>Chat</div>
            <div className="stat-label">AI Assistant →</div>
          </div>
        </div>
      </div>

      {/* ── Main Layout: Sidebar + Detail ──────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem', alignItems: 'start' }}>

        {/* ── Family Members Sidebar ──────────────────────────────────── */}
        <div className="flex-col gap-3">
          <div className="card" style={{ padding: '1.25rem' }}>
            <div className="section-header">
              <div className="section-title">
                <div className="section-icon" style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--primary-light)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                Family
              </div>
              <button id="add-member-sidebar-btn" className="btn btn-primary btn-icon btn-sm" onClick={() => setShowAddPatient(true)} title="Add member">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </div>

            <div className="flex-col gap-1">
              {dashboardData?.family?.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>👨‍👩‍👧‍👦</div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No family members yet.<br />Click + to add one.</p>
                </div>
              ) : dashboardData?.family?.map((f, idx) => (
                <button
                  key={f.patient.id}
                  id={`patient-card-${f.patient.id}`}
                  className={`patient-card ${selectedPatient?.patient?.id === f.patient.id ? 'active' : ''}`}
                  onClick={() => setSelectedPatient(f)}
                >
                  <div className={`patient-avatar ${getAvatarColor(idx)}`}>
                    {getInitials(f.patient.name)}
                  </div>
                  <div style={{ overflow: 'hidden', flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {f.patient.name}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                      {f.patient.relationship_to_user || 'Family'} · {f.patient.age}y
                    </div>
                  </div>
                  {(f.latest_bp?.status !== 'NORMAL' || f.latest_sugar?.status !== 'NORMAL') && (
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning)', flexShrink: 0 }} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          {selectedPatient && (
            <div className="card" style={{ padding: '1.25rem' }}>
              <div className="section-title" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>Quick Actions</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <button id="log-bp-btn" className="quick-action-btn" onClick={() => setShowBPModal(true)}>
                  <div className="quick-action-icon" style={{ background: 'rgba(244,63,94,0.12)', color: 'var(--rose)' }}>🩸</div>
                  Log BP
                </button>
                <button id="log-sugar-btn" className="quick-action-btn" onClick={() => setShowSugarModal(true)}>
                  <div className="quick-action-icon" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--amber)' }}>🩺</div>
                  Log Sugar
                </button>
                <button id="add-med-quick-btn" className="quick-action-btn" onClick={() => setShowMedModal(true)}>
                  <div className="quick-action-icon" style={{ background: 'rgba(139,92,246,0.12)', color: 'var(--primary-light)' }}>💊</div>
                  Add Med
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Patient Detail ──────────────────────────────────────────── */}
        <div className="flex-col gap-5">
          {selectedPatient ? (
            <>
              {/* Patient Header */}
              <div className="card" style={{ padding: '1.5rem', background: 'var(--bg-card)' }}>
                <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                  <div className="flex items-center gap-4">
                    <div className={`patient-avatar ${getAvatarColor(dashboardData?.family?.findIndex(f => f.patient.id === selectedPatient.patient.id))} `}
                      style={{ width: 56, height: 56, fontSize: '1.3rem' }}>
                      {getInitials(selectedPatient.patient.name)}
                    </div>
                    <div>
                      <div className="flex items-center gap-3" style={{ marginBottom: 2 }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>{selectedPatient.patient.name}</h3>
                        <div className="flex gap-1">
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowEditPatient(true)} title="Edit Patient">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDeletePatient(selectedPatient.patient.id)} title="Delete Patient" style={{ color: 'var(--danger)' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="badge badge-purple">{selectedPatient.patient.relationship_to_user || 'Family'}</span>
                        <span className="badge badge-muted">Age {selectedPatient.patient.age}</span>
                        {selectedPatient.patient.baseline_medical_conditions && (
                          <span className="badge badge-info" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {selectedPatient.patient.baseline_medical_conditions}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button id="view-analytics-btn" className="btn btn-secondary btn-sm" onClick={() => navigate('/analytics')}>
                    📊 View Analytics
                  </button>
                </div>
              </div>

              {/* Vitals Cards */}
              <div>
                <div className="section-header">
                  <div className="section-title">
                    <div className="section-icon" style={{ background: 'rgba(244,63,94,0.12)', color: 'var(--rose)' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                      </svg>
                    </div>
                    Latest Vitals
                  </div>
                  <div className="flex gap-2">
                    <button id="log-bp-header-btn" className="btn btn-ghost btn-sm" onClick={() => setShowBPModal(true)}>+ BP</button>
                    <button id="log-sugar-header-btn" className="btn btn-ghost btn-sm" onClick={() => setShowSugarModal(true)}>+ Sugar</button>
                  </div>
                </div>

                <div className="grid-2">
                  {/* Blood Pressure Card */}
                  <div className="card" style={{
                    background: 'linear-gradient(135deg, rgba(244,63,94,0.08) 0%, rgba(236,72,153,0.05) 100%)',
                    border: '1px solid rgba(244,63,94,0.2)',
                    padding: '1.75rem'
                  }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: '1.25rem' }}>
                      <div className="flex items-center gap-2">
                        <div style={{ fontSize: '1.1rem' }}>🩸</div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Blood Pressure</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedPatient.latest_bp?.id && (
                          <>
                            <button className="btn btn-ghost btn-icon btn-sm" title="Edit BP" onClick={(e) => { e.stopPropagation(); setEditingBP(selectedPatient.latest_bp); setShowBPModal(true); }}>
                              ✏️
                            </button>
                            <button className="btn btn-ghost btn-icon btn-sm" title="Delete BP" onClick={(e) => { e.stopPropagation(); handleDeleteBP(selectedPatient.latest_bp.id); }}>
                              ❌
                            </button>
                          </>
                        )}
                        <span className={`badge ${bpStatusClass(selectedPatient.latest_bp?.status)}`}>
                          {selectedPatient.latest_bp?.status || 'N/A'}
                        </span>
                      </div>
                    </div>

                    {selectedPatient.latest_bp?.systolic ? (
                      <>
                        <div className="vitals-number" style={{ background: 'var(--grad-rose)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                          {selectedPatient.latest_bp.systolic}
                          <span style={{ fontSize: '1.5rem', opacity: 0.6 }}>/</span>
                          {selectedPatient.latest_bp.diastolic}
                        </div>
                        <div className="vitals-unit">mmHg · Systolic / Diastolic</div>
                        <div className="flex gap-4" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(244,63,94,0.15)', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                          <div className="flex gap-4">
                            <div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>Normal Range</div>
                              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>120/80</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>Pulse Pressure</div>
                              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                {selectedPatient.latest_bp.systolic - selectedPatient.latest_bp.diastolic} mmHg
                              </div>
                            </div>
                          </div>
                          <button
                            id="log-bp-card-btn"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setShowBPModal(true)}
                            style={{ flexShrink: 0, fontSize: '0.78rem' }}
                          >
                            + Add Reading
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                        <div style={{ fontSize: '2rem', marginBottom: 8 }}>📋</div>
                        <p style={{ fontSize: '0.85rem' }}>No readings yet</p>
                        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setShowBPModal(true)}>Log First Reading</button>
                      </div>
                    )}
                  </div>

                  {/* Blood Sugar Card */}
                  <div className="card" style={{
                    background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(251,191,36,0.05) 100%)',
                    border: '1px solid rgba(245,158,11,0.2)',
                    padding: '1.75rem'
                  }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: '1.25rem' }}>
                      <div className="flex items-center gap-2">
                        <div style={{ fontSize: '1.1rem' }}>🍬</div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Blood Sugar</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedPatient.latest_sugar?.id && (
                          <>
                            <button className="btn btn-ghost btn-icon btn-sm" title="Edit Sugar" onClick={(e) => { e.stopPropagation(); setEditingSugar(selectedPatient.latest_sugar); setShowSugarModal(true); }}>
                              ✏️
                            </button>
                            <button className="btn btn-ghost btn-icon btn-sm" title="Delete Sugar" onClick={(e) => { e.stopPropagation(); handleDeleteSugar(selectedPatient.latest_sugar.id); }}>
                              ❌
                            </button>
                          </>
                        )}
                        <span className={`badge ${bpStatusClass(selectedPatient.latest_sugar?.status)}`}>
                          {selectedPatient.latest_sugar?.status || 'N/A'}
                        </span>
                      </div>
                    </div>

                    {selectedPatient.latest_sugar?.fasting ? (
                      <>
                        <div className="vitals-number" style={{ background: 'var(--grad-amber)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                          {selectedPatient.latest_sugar.fasting}
                        </div>
                        <div className="vitals-unit">mg/dL · Fasting</div>
                        <div className="flex gap-4" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(245,158,11,0.15)', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                          <div className="flex gap-4">
                            <div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>Post-Meal</div>
                              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                {selectedPatient.latest_sugar.post_meal || '--'} mg/dL
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2 }}>Normal Fasting</div>
                              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>&lt;100 mg/dL</div>
                            </div>
                          </div>
                          <button
                            id="log-sugar-card-btn"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setShowSugarModal(true)}
                            style={{ flexShrink: 0, fontSize: '0.78rem' }}
                          >
                            + Add Reading
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                        <div style={{ fontSize: '2rem', marginBottom: 8 }}>📋</div>
                        <p style={{ fontSize: '0.85rem' }}>No readings yet</p>
                        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setShowSugarModal(true)}>Log First Reading</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>


              {/* Custom Tests */}
              <div>
                <div className="section-header">
                  <div className="section-title">
                    <div className="section-icon" style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--blue)' }}>🧪</div>
                    Custom Tests
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowCustomTestModal(true)}>
                    + Log Test
                  </button>
                </div>

                {customTests.length > 0 ? (
                  <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {customTests.map((test, i) => (
                      <div key={test.id || i} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '1rem 1.25rem',
                        borderBottom: i < customTests.length - 1 ? '1px solid var(--border)' : 'none'
                      }}>
                        <div className="flex items-center gap-3">
                          <div style={{ fontSize: '1.5rem' }}>🔬</div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{test.test_name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(test.recorded_at).toLocaleDateString()} {new Date(test.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{test.value} <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>{test.unit}</span></div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setEditingCustomTest(test); setShowCustomTestModal(true); }}>✏️</button>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDeleteCustomTest(test.id)}>❌</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="card" style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                    <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔬</div>
                    <p style={{ fontSize: '0.85rem' }}>No custom tests logged</p>
                    <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setShowCustomTestModal(true)}>Log First Test</button>
                  </div>
                )}
              </div>

              {/* Medications */}
              <div>
                <div className="section-header">
                  <div className="section-title">
                    <div className="section-icon" style={{ background: 'rgba(139,92,246,0.12)', color: 'var(--primary-light)' }}>💊</div>
                    Medications
                  </div>
                  <button id="add-medication-btn" className="btn btn-primary btn-sm" onClick={() => setShowMedModal(true)}>
                    + Add Medication
                  </button>
                </div>

                <div className="card">
                  {selectedPatient.medications?.length > 0 ? (
                    <div>
                      {selectedPatient.medications.map((med, i) => (
                        <div key={med.id || i} className="med-item">
                          <div className="med-icon">💊</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: 2 }}>
                              {med.medicine || med.medicine_name}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              {med.dosage}
                              {med.instructions ? ` · ${med.instructions}` : ''}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 700, color: 'var(--primary-light)', fontSize: '0.9rem' }}>
                                {med.time}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Daily</div>
                            </div>
                            <span className={`badge ${med.status === 'sent' ? 'badge-success' : med.status === 'pending' ? 'badge-warning' : 'badge-muted'}`}>
                              {med.status === 'sent' ? '✅ Sent' : med.status === 'pending' ? '⏳ Pending' : med.status || 'scheduled'}
                            </span>
                            <button className="btn btn-ghost btn-icon btn-sm" title="Edit Medication" onClick={(e) => { e.stopPropagation(); setSelectedMed(med); setShowEditMedModal(true); }}>
                              ✏️
                            </button>
                            <button className="btn btn-ghost btn-icon btn-sm" title="Delete Medication" onClick={(e) => { e.stopPropagation(); handleDeleteMedication(selectedPatient.patient.id, med.id); }}>
                              ❌
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>💊</div>
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>No medications scheduled</p>
                      <button className="btn btn-primary btn-sm" onClick={() => setShowMedModal(true)}>
                        + Add First Medication
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Conditions */}
              {selectedPatient.patient.baseline_medical_conditions && (
                <div className="card" style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)' }}>
                  <div className="section-title" style={{ marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                    <span>🏥</span> Baseline Conditions
                  </div>
                  <div className="flex" style={{ flexWrap: 'wrap', gap: 8 }}>
                    {selectedPatient.patient.baseline_medical_conditions.split(',').map((c, i) => (
                      <span key={i} className="badge badge-info">{c.trim()}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, flexDirection: 'column', gap: '1rem' }}>
              <div style={{ fontSize: '4rem' }}>👨‍👩‍👧</div>
              <h3 style={{ color: 'var(--text-secondary)' }}>No Family Member Selected</h3>
              <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Add or select a family member to view their health dashboard</p>
              <button className="btn btn-primary" onClick={() => setShowAddPatient(true)}>
                + Add First Member
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {showAddPatient && <AddPatientModal onClose={() => setShowAddPatient(false)} onAdded={() => { fetchDashboard(); showToast('Family member added'); }} />}
      {showEditPatient && selectedPatient && (
        <EditPatientModal 
          patient={selectedPatient.patient} 
          onClose={() => setShowEditPatient(false)} 
          onUpdated={() => { fetchDashboard(); showToast('Family member updated'); }} 
        />
      )}
      {showBPModal && selectedPatient && <AddVitalsModal patient={selectedPatient} type="bp" initialData={editingBP} onClose={() => { setShowBPModal(false); setEditingBP(null); }} onAdded={handleDataAdded} />}
      {showSugarModal && selectedPatient && <AddVitalsModal patient={selectedPatient} type="sugar" initialData={editingSugar} onClose={() => { setShowSugarModal(false); setEditingSugar(null); }} onAdded={handleDataAdded} />}
      {showCustomTestModal && selectedPatient && <AddCustomTestModal patient={selectedPatient} initialData={editingCustomTest} onClose={() => { setShowCustomTestModal(false); setEditingCustomTest(null); }} onAdded={() => { handleDataAdded(); fetchAndGroupCustomTests(selectedPatient.patient.id); }} />}
      {showMedModal && selectedPatient && <AddMedicationModal patient={selectedPatient} onClose={() => setShowMedModal(false)} onAdded={handleDataAdded} />}
      {showEditMedModal && selectedMed && <EditMedicationModal patient={selectedPatient} medication={selectedMed} onClose={() => { setShowEditMedModal(false); setSelectedMed(null); }} onUpdated={handleDataAdded} />}
      {showPhoneModal && <PhoneModal user={user} onClose={() => setShowPhoneModal(false)} onSaved={() => showToast('Phone number saved!')} />}
      {showNotifications && <NotificationCenter onClose={() => { setShowNotifications(false); fetchNotifCount(); }} />}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
