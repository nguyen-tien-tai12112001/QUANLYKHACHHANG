import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import client from '../api/client';
import { getRegisteredAccessToken, getRegisteredCurrentUser } from './authBridge';

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

      const storedUser = localStorage.getItem('c360_user');
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        return parsedUser;
      }

      const token = getRegisteredAccessToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await client.get('/auth/me', { headers });
      setUser(data);
      return data;
    } catch (err) {
      setUser(null);
      setError(err.response?.data?.detail || err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    const handleUserUpdated = (event) => {
      if (event.detail) setUser(event.detail);
      else refreshUser();
    };
    window.addEventListener('c360:user-updated', handleUserUpdated);
    return () => window.removeEventListener('c360:user-updated', handleUserUpdated);
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
