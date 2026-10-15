import axios from 'axios';

// Must match SERVICE_ID in backend/server.js.
export const NODE_API_SERVICE_ID = 'expense-tracker-node-api';

// Dynamically resolve base API URL for production deployment or local Vite proxy
const getBaseURL = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (!envUrl) return '/api';
  return envUrl.endsWith('/api') ? envUrl : `${envUrl.replace(/\/$/, '')}/api`;
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach JWT Bearer Token & auto-handle FormData multipart uploads
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // For FormData requests, let browser set correct multipart/form-data with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle 401 Unauthorized
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        window.location.href = '/login';
      }
    }
    const serverMessage = error.response?.data?.message || error.response?.data?.error;
    const message = serverMessage || error.message || 'An error occurred';
    const customError = new Error(message);
    customError.response = error.response;
    return Promise.reject(customError);
  }
);

// The response interceptor already unwraps axios data, so this resolves to the
// chat payload itself ({ success, reply, refreshData, downloadFormat, pendingAction }).
export const sendChatMessage = async (message) => api.post('/chat', { message });
export const resetChatSession = async () => api.post('/chat/reset', {});

// Which origin the app is actually talking to, for the config banner.
export const getApiBaseURL = getBaseURL;

// Plain fetch on purpose: the axios response interceptor redirects to /login on 401
// and rewrites errors, which would hide a "wrong backend on this port" answer.
export const probeApiIdentity = async () => {
  const base = getBaseURL();
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
    const body = await res.json().catch(() => null);
    return {
      base,
      reachable: res.ok,
      status: res.status,
      isNodeApi: Boolean(body && body.service === NODE_API_SERVICE_ID),
      service: body && body.service ? body.service : null,
      capabilities: body && body.capabilities ? body.capabilities : null
    };
  } catch (error) {
    return { base, reachable: false, isNodeApi: false, service: null, error: error.message };
  }
};

export const downloadReportFile = async (format, period = 'current_month') => {
  const token = localStorage.getItem('token');
  const fmt = (format || 'pdf').toLowerCase();
  const isExcel = fmt.includes('excel') || fmt.includes('xlsx') || fmt.includes('sheet');
  // Same base the axios client uses. A hardcoded "/api/..." here resolves against
  // the page origin, so it silently hits the dev-server proxy instead of the API
  // host whenever VITE_API_URL points somewhere else.
  const endpoint = `${getBaseURL()}/export/${isExcel ? 'excel' : 'pdf'}?period=${encodeURIComponent(period)}`;
  const res = await fetch(endpoint, {
    headers: {
      Authorization: token ? `Bearer ${token}` : ''
    }
  });
  if (!res.ok) {
    throw new Error('Failed to download report');
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ExpenseTracker_Report.${isExcel ? 'xls' : 'pdf'}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

export default api;
