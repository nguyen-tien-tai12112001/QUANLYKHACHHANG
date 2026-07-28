import axios from 'axios';

import { getRegisteredAccessToken, notifyUnauthorized } from '../auth/authBridge';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 600000,
});

function emitLoading(delta) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('c360:api-loading', { detail: { delta } }));
  }
}

client.interceptors.request.use((config) => {
  if (!config.hideGlobalLoading) {
    config.__tracksGlobalLoading = true;
    emitLoading(1);
  }
  const token = getRegisteredAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  try {
    const raw = localStorage.getItem('c360_user');
    if (raw) {
      const user = JSON.parse(raw);
      config.headers['X-C360-User'] = user.username || '';
      config.headers['X-C360-User-Name'] = encodeURIComponent(user.full_name || '');
    }
  } catch {
    // Ignore localStorage parse errors.
  }

  return config;
}, (error) => {
  if (error.config?.__tracksGlobalLoading) emitLoading(-1);
  return Promise.reject(error);
});

client.interceptors.response.use(
  (response) => {
    if (response.config?.__tracksGlobalLoading) emitLoading(-1);
    return response;
  },
  (error) => {
    if (error.config?.__tracksGlobalLoading) emitLoading(-1);
    if (error.response?.status === 401) {
      notifyUnauthorized();
    }
    return Promise.reject(error);
  },
);

export default client;
