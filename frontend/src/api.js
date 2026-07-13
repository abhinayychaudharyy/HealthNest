const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('token');

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new ApiError('Session expired. Please log in again.', 401);
  }

  if (!response.ok) {
    let errorMsg = 'An error occurred';
    try {
      const data = await response.json();
      errorMsg = data.detail || errorMsg;
    } catch (_) {
      // ignored
    }
    throw new ApiError(errorMsg, response.status);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const api = {
  // Auth
  getGoogleAuthUrl: () => `${BASE_URL}/auth/google`,
  loginWithEmail: (email, password) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }),
  registerWithEmail: (name, email, password) => request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  }),
  getProfile: () => request('/auth/me'),
  updateProfile: (data) => request('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),

  // Dashboard
  getDashboard: () => request('/api/v1/dashboard/'),

  // Patients
  getPatients: () => request('/api/v1/patients/'),
  getPatient: (id) => request(`/api/v1/patients/${id}`),
  createPatient: (data) => request('/api/v1/patients/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  updatePatient: (id, data) => request(`/api/v1/patients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  deletePatient: (id) => request(`/api/v1/patients/${id}`, { method: 'DELETE' }),

  // Medications
  getMedications: (patientId) => request(`/api/v1/patients/${patientId}/medications/`),
  addMedication: (patientId, data) => request(`/api/v1/patients/${patientId}/medications/`, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  updateMedication: (patientId, medId, data) => request(`/api/v1/patients/${patientId}/medications/${medId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  deleteMedication: (patientId, medId) => request(`/api/v1/patients/${patientId}/medications/${medId}`, {
    method: 'DELETE',
  }),

  // Vitals — Blood Pressure
  logBP: (data) => request('/api/v1/vitals/bp/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  updateBP: (patientId, recordId, data) => request(`/api/v1/vitals/bp/${patientId}/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  deleteBP: (patientId, recordId) => request(`/api/v1/vitals/bp/${patientId}/${recordId}`, { method: 'DELETE' }),
  getBpStats: (patientId, days = 30) => request(`/api/v1/vitals/bp/${patientId}/stats?days=${days}`),
  getBpChart: (patientId, days = 30) => request(`/api/v1/vitals/bp/${patientId}/chart?days=${days}`),

  // Vitals — Blood Sugar
  logSugar: (data) => request('/api/v1/vitals/sugar/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  updateSugar: (patientId, recordId, data) => request(`/api/v1/vitals/sugar/${patientId}/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  deleteSugar: (patientId, recordId) => request(`/api/v1/vitals/sugar/${patientId}/${recordId}`, { method: 'DELETE' }),
  getSugarStats: (patientId, days = 30) => request(`/api/v1/vitals/sugar/${patientId}/stats?days=${days}`),
  getSugarChart: (patientId, days = 30) => request(`/api/v1/vitals/sugar/${patientId}/chart?days=${days}`),

  // Vitals — Custom Tests
  getCustomTests: (patientId) => request(`/api/v1/vitals/custom/${patientId}`),
  addCustomTest: (data) => request('/api/v1/vitals/custom/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  updateCustomTest: (patientId, recordId, data) => request(`/api/v1/vitals/custom/${patientId}/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  deleteCustomTest: (patientId, recordId) => request(`/api/v1/vitals/custom/${patientId}/${recordId}`, { method: 'DELETE' }),
  getCustomTestStats: (patientId, testName, days = 30) => request(`/api/v1/vitals/custom/${patientId}/stats?test_name=${encodeURIComponent(testName)}&days=${days}`),
  getCustomTestChart: (patientId, testName, days = 30) => request(`/api/v1/vitals/custom/${patientId}/chart?test_name=${encodeURIComponent(testName)}&days=${days}`),

  // Chat
  chat: (patientId, query, documentSummary) => request('/api/v1/chat/', {
    method: 'POST',
    body: JSON.stringify({ patient_id: String(patientId), query, document_summary: documentSummary }),
  }),
  uploadChatContext: (patientId, file) => {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);
    return fetch(`${BASE_URL}/api/v1/chat/upload_context/?patient_id=${patientId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    }).then(async (res) => {
      if (res.status === 401) {
        localStorage.removeItem('token');
        window.location.href = '/login';
        throw new ApiError('Session expired.', 401);
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new ApiError(data.detail || 'Upload failed', res.status);
      }
      return res.json();
    });
  },

  // Notifications
  getNotifications: () => request('/api/v1/notifications/'),

  // Medical Reports
  uploadReport: (patientId, file) => {
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('file', file);
    return fetch(`${BASE_URL}/api/v1/reports/upload/?patient_id=${patientId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    }).then(async (res) => {
      if (res.status === 401) {
        localStorage.removeItem('token');
        window.location.href = '/login';
        throw new ApiError('Session expired.', 401);
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new ApiError(data.detail || 'Upload failed', res.status);
      }
      return res.json();
    });
  },
  getReports: (patientId) => {
    const url = patientId ? `/api/v1/reports/?patient_id=${patientId}` : '/api/v1/reports/';
    return request(url);
  },
  reanalyzeReport: (reportId) => request(`/api/v1/reports/${reportId}/analyze/`, { method: 'POST' }),
  deleteReport: (reportId) => request(`/api/v1/reports/${reportId}/`, { method: 'DELETE' }),
};
