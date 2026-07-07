/**
 * Cầu nối cho module quản trị / đăng nhập bên ngoài.
 *
 * Cách tích hợp (bên module quản trị gọi 1 lần khi khởi động app):
 *
 *   import { registerAuthIntegration } from '@/auth/authBridge';
 *   registerAuthIntegration({
 *     getAccessToken: () => keycloak.token,
 *     getCurrentUser: () => mappedUser,
 *     onUnauthorized: () => keycloak.login(),
 *   });
 */

let integration = {
  getAccessToken: null,
  getCurrentUser: null,
  onUnauthorized: null,
};

export function registerAuthIntegration(handlers) {
  integration = { ...integration, ...handlers };
}

export function getRegisteredAccessToken() {
  if (typeof integration.getAccessToken === 'function') {
    return integration.getAccessToken();
  }
  return localStorage.getItem('access_token');
}

export function getRegisteredCurrentUser() {
  if (typeof integration.getCurrentUser === 'function') {
    return integration.getCurrentUser();
  }
  return null;
}

export function notifyUnauthorized() {
  if (typeof integration.onUnauthorized === 'function') {
    integration.onUnauthorized();
  }
}

export function isAuthIntegrationRegistered() {
  return typeof integration.getAccessToken === 'function' || typeof integration.getCurrentUser === 'function';
}
