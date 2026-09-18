import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { message } from 'antd';

import client from '../api/client';

const UserWorkspaceContext = createContext(null);
const MAX_RECENTS = 24;

const customerShape = (row = {}) => ({
  customer_code: String(row.customer_code || row.ma_kh || row.custseq || row.id || '').trim(),
  customer_name: row.customer_name || row.ten_kh || row.nmloc || '',
  branch_code: row.branch_code || row.viewing_branch_code || row.primary_branch_code || row.ma_cn || '',
});

export function UserWorkspaceProvider({ currentUser, children }) {
  const storageKey = `c360_recent_workspace_${currentUser?.id || currentUser?.username || 'anonymous'}`;
  const [pins, setPins] = useState([]);
  const [pinsLoading, setPinsLoading] = useState(false);
  const [recents, setRecents] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; }
  });
  const [contextMenu, setContextMenu] = useState(null);

  const refreshPins = useCallback(async () => {
    setPinsLoading(true);
    try {
      const { data } = await client.get('/user-preferences/pinned-customers', { hideGlobalLoading: true, noCache: true });
      setPins(data?.items || []);
    } catch {
      setPins([]);
    } finally {
      setPinsLoading(false);
    }
  }, []);

  useEffect(() => { refreshPins(); }, [refreshPins, currentUser?.id]);
  useEffect(() => {
    try { setRecents(JSON.parse(localStorage.getItem(storageKey) || '[]')); } catch { setRecents([]); }
  }, [storageKey]);
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('scroll', close, true);
    };
  }, []);

  const isPinned = useCallback((code) => pins.some((item) => item.customer_code === String(code || '').trim()), [pins]);

  const pinCustomer = useCallback(async (row) => {
    const customer = customerShape(row);
    if (!customer.customer_code) return;
    const { data } = await client.post('/user-preferences/pinned-customers', customer, { hideGlobalLoading: true });
    setPins((current) => [data, ...current.filter((item) => item.customer_code !== data.customer_code)]);
    message.success(`Đã ghim ${customer.customer_name || customer.customer_code}`);
  }, []);

  const unpinCustomer = useCallback(async (code) => {
    await client.delete(`/user-preferences/pinned-customers/${encodeURIComponent(code)}`, { hideGlobalLoading: true });
    setPins((current) => current.filter((item) => item.customer_code !== code));
    message.success('Đã bỏ ghim khách hàng');
  }, []);

  const recordRecent = useCallback((entry) => {
    if (!entry?.key) return;
    setRecents((current) => {
      const next = [{ ...entry, viewed_at: new Date().toISOString() }, ...current.filter((item) => !(item.type === entry.type && item.key === entry.key))].slice(0, MAX_RECENTS);
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [storageKey]);

  const clearRecents = useCallback(() => {
    localStorage.removeItem(storageKey);
    setRecents([]);
  }, [storageKey]);

  const showCustomerMenu = useCallback((event, row) => {
    const customer = customerShape(row);
    if (!customer.customer_code) return;
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 230), y: Math.min(event.clientY, window.innerHeight - 120), customer });
  }, []);

  const value = useMemo(() => ({
    pins, pinsLoading, refreshPins, isPinned, pinCustomer, unpinCustomer,
    recents, recordRecent, clearRecents, showCustomerMenu,
  }), [clearRecents, isPinned, pinCustomer, pins, pinsLoading, recents, recordRecent, refreshPins, showCustomerMenu, unpinCustomer]);

  return (
    <UserWorkspaceContext.Provider value={value}>
      {children}
      {contextMenu ? (
        <div className="c360-customer-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          <strong>{contextMenu.customer.customer_name || 'Khách hàng'}</strong>
          <small>{contextMenu.customer.customer_code}</small>
          <button type="button" onClick={async () => {
            if (isPinned(contextMenu.customer.customer_code)) await unpinCustomer(contextMenu.customer.customer_code);
            else await pinCustomer(contextMenu.customer);
            setContextMenu(null);
          }}>
            {isPinned(contextMenu.customer.customer_code) ? 'Bỏ ghim khách hàng' : 'Ghim khách hàng để theo dõi'}
          </button>
        </div>
      ) : null}
    </UserWorkspaceContext.Provider>
  );
}

export function useUserWorkspace() {
  return useContext(UserWorkspaceContext);
}
