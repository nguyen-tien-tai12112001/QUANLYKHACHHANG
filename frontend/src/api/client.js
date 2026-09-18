import axios from 'axios';

import { getRegisteredAccessToken, notifyUnauthorized } from '../auth/authBridge';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 600000,
});

const responseCache = new Map();
const inflightGets = new Map();
let heavyAnalysisTail = Promise.resolve();
let lastSessionEndedNotificationAt = 0;
// Một phiên lọc C360 dùng lại kết quả khi chuyển tab; bộ lọc mới/Làm mới sẽ xóa cache.
const DEFAULT_CACHE_TTL = 5 * 60_000;
const CACHEABLE_GET_PATHS = [
  '/admin/branches',
  '/admin/departments',
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

// Kho dữ liệu đã có progress upload, timeline job và loading cục bộ tại bảng.
// Không dùng overlay toàn màn hình vì polling trạng thái nền sẽ làm giao diện bị che lặp lại.
const LOCAL_LOADING_PATHS = ['/imports/', '/cif/', '/admin/'];
const HEAVY_ANALYSIS_PATHS = [
  '/dashboard/insights',
  '/dashboard/business-analytics',
  '/dashboard/business-trends',
  '/customer-processing/period-comparison',
  '/customer-processing/profile-groups',
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

function clearExpiredSession() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('c360_user');
  localStorage.removeItem('c360_session_policy');
  localStorage.removeItem('c360_last_activity_at');
  sessionStorage.removeItem('c360_analysis_session');
  clearApiCache();
}

function emitLoading(delta) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('c360:api-loading', { detail: { delta } }));
  }
}

client.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  const setHeader = (name, value) => {
    if (typeof config.headers.set === 'function') config.headers.set(name, value);
    else config.headers[name] = value;
  };
  const requestPath = String(config.url || '');
  const usesLocalLoading = LOCAL_LOADING_PATHS.some((path) => requestPath.startsWith(path));
  if (!config.hideGlobalLoading && !usesLocalLoading) {
    config.__tracksGlobalLoading = true;
    emitLoading(1);
  }
  const token = getRegisteredAccessToken();
  if (token) {
    setHeader('Authorization', `Bearer ${token}`);
  }
  const analysisSession = sessionStorage.getItem('c360_analysis_session');
  if (analysisSession) setHeader('X-Analysis-Session', analysisSession);

  try {
    const raw = localStorage.getItem('c360_user');
    if (raw) {
      const user = JSON.parse(raw);
      setHeader('X-C360-User', user.username || '');
      setHeader('X-C360-User-Name', encodeURIComponent(user.full_name || ''));
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
    const requestUrl = String(error.config?.url || '');
    if (error.response?.status === 401 && !requestUrl.startsWith('/auth/login')) {
      const detail = error.response?.data?.detail;
      const sessionMessage = typeof detail === 'object' ? detail?.message : detail;
      const sessionCode = typeof detail === 'object' ? detail?.code : 'SESSION_ENDED';
      clearExpiredSession();
      notifyUnauthorized({ code: sessionCode, message: sessionMessage });
      if (typeof window !== 'undefined' && Date.now() - lastSessionEndedNotificationAt > 1500) {
        lastSessionEndedNotificationAt = Date.now();
        window.dispatchEvent(new CustomEvent('c360:session-ended', {
          detail: {
            code: sessionCode,
            message: sessionMessage || 'Phiên đăng nhập không còn hiệu lực, vui lòng đăng nhập lại',
          },
        }));
      }
    }
    const detail = error.response?.data?.detail;
    if (error.response?.status === 403 && detail?.code === 'PASSWORD_CHANGE_REQUIRED' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('c360:password-change-required'));
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

  const execute = () => axiosGet(url, config);
  const isHeavyAnalysis = HEAVY_ANALYSIS_PATHS.some((path) => url.startsWith(path));
  const transport = isHeavyAnalysis
    ? (heavyAnalysisTail = heavyAnalysisTail.catch(() => {}).then(execute))
    : execute();
  const request = transport
    .then((response) => {
      if (canCache) responseCache.set(key, { savedAt: Date.now(), response });
      return response;
    })
    .finally(() => inflightGets.delete(key));
  inflightGets.set(key, request);
  return request;
};

export default client;
