import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 60000,
});

client.interceptors.request.use((config) => {
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

export default client;
