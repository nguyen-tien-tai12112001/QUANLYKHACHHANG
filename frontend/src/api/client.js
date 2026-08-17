import axios from 'axios';

import { getRegisteredAccessToken, notifyUnauthorized } from '../auth/authBridge';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 600000,
});

const responseCache = new Map();
const inflightGets = new Map();
// Một phiên lọc C360 dùng lại kết quả khi chuyển tab; bộ lọc mới/Làm mới sẽ xóa cache.
const DEFAULT_CACHE_TTL = 5 * 60_000;
const CACHEABLE_GET_PATHS = [
  '/dashboard/',
  '/customer-processing/periods',
  '/customer-processing/profiles',
  '/customer-processing/profile-summary',
  '/customer-processing/profile-groups',
  '/customer-processing/profile-filter-options',
  '/customer-processing/profile-field-coverage',
  '/customer-processing/profile-history',
  '/customer-processing/period-comparison',
  '/customer-processing/pf10-loans',
  '/customer-processing/deposit-accounts',
  '/customer-processing/customer-classification-history',
  '/imports/periods',
  '/imports/source-readiness',
  '/imports/report-sources',
  '/cif/overview',
  '/cif/customers',
];

function stableParams(params = {}) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

function getCacheKey(url, config = {}) {
  const token = getRegisteredAccessToken() || '';
  return `${url}?${stableParams(config.params)}|${token.slice(-24)}`;
}

export function clearApiCache() {
  responseCache.clear();
}

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
    if (String(response.config?.method || 'get').toLowerCase() !== 'get') clearApiCache();
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

const axiosGet = client.get.bind(client);
client.get = (url, config = {}) => {
  const canCache = !config.noCache
    && config.responseType !== 'blob'
    && CACHEABLE_GET_PATHS.some((path) => url.startsWith(path));
  const key = getCacheKey(url, config);
  const cached = canCache ? responseCache.get(key) : null;
  const ttl = Number(config.cacheTtl ?? DEFAULT_CACHE_TTL);
  if (cached && Date.now() - cached.savedAt < ttl) {
    return Promise.resolve(cached.response);
  }
  if (inflightGets.has(key)) return inflightGets.get(key);

  const request = axiosGet(url, config)
    .then((response) => {
      if (canCache) responseCache.set(key, { savedAt: Date.now(), response });
      return response;
    })
    .finally(() => inflightGets.delete(key));
  inflightGets.set(key, request);
  return request;
};

export default client;
