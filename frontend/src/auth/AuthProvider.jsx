import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import client from '../api/client';
import { getRegisteredAccessToken, getRegisteredCurrentUser } from './authBridge';
import { DEV_USER } from './permissions';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refreshUser = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const externalUser = getRegisteredCurrentUser();
      if (externalUser) {
        setUser(externalUser);
        return externalUser;
      }

      const token = getRegisteredAccessToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await client.get('/auth/me', { headers });
      setUser(data);
      return data;
    } catch (err) {
      setUser(DEV_USER);
      setError(err.response?.data?.detail || err.message);
      return DEV_USER;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      isAuthenticated: Boolean(user && user.id !== 'dev'),
      refreshUser,
    }),
    [user, loading, error, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth phải dùng bên trong AuthProvider');
  }
  return context;
}
