import axios from 'axios';

import { getRegisteredAccessToken, notifyUnauthorized } from '../auth/authBridge';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 600000,
});

client.interceptors.request.use((config) => {
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
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      notifyUnauthorized();
    }
    return Promise.reject(error);
  },
);

export default client;
