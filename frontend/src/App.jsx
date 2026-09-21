import { useCallback, useEffect, useState } from 'react';
import { notification } from 'antd';

import { AuthProvider } from './auth';
import MainLayout, { PAGE_PERMISSIONS } from './components/MainLayout';
import GlobalApiLoading from './components/GlobalApiLoading';
import ExcelExportProgress from './components/ExcelExportProgress';
import SessionGuard from './components/SessionGuard';
import ImportData from './pages/ImportData';
import CustomerProcessing from './pages/CustomerProcessing';
import Login from './pages/LoginProduction';
import ForcedPasswordChange from './components/ForcedPasswordChange';
import SystemAdmin from './pages/SystemAdmin';
import AuditLogs from './pages/AuditLogs';
import SystemConfiguration from './pages/SystemConfiguration';
import DataGovernance from './pages/DataGovernance';
import CifDataWarehouse from './pages/CifDataWarehouse';
import client, { clearApiCache } from './api/client';
import C360App from './c360/C360App';
import { menuKeyFromPath, pathFromMenuKey } from './constants/navigation';
import { AnalysisScopeProvider } from './c360/AnalysisScopeContext';
import { UserWorkspaceProvider } from './workspace/UserWorkspaceContext';

function LegacyApp() {
  const [activeMenu, setActiveMenu] = useState(() => menuKeyFromPath(window.location.pathname));
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const raw = localStorage.getItem('c360_user');
      const token = localStorage.getItem('access_token');
      if (raw && token) return JSON.parse(raw);
      localStorage.removeItem('c360_user');
      localStorage.removeItem('access_token');
      return null;
    } catch {
      localStorage.removeItem('c360_user');
      return null;
    }
  });

  function handleLogin(user, accessToken, sessionPolicy) {
    localStorage.setItem('c360_user', JSON.stringify(user));
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('c360_session_policy', JSON.stringify(sessionPolicy || { idle_minutes: 30, warning_seconds: 120 }));
    localStorage.setItem('c360_last_activity_at', String(Date.now()));
    setCurrentUser(user);
  }

  function handlePasswordChanged(user, accessToken) {
    const nextUser = { ...currentUser, ...user, must_change_password: false };
    if (accessToken) localStorage.setItem('access_token', accessToken);
    localStorage.setItem('c360_user', JSON.stringify(nextUser));
    setCurrentUser(nextUser);
    window.dispatchEvent(new CustomEvent('c360:user-updated', { detail: nextUser }));
  }

  const clearCurrentSession = useCallback(() => {
    localStorage.removeItem('c360_user');
    localStorage.removeItem('access_token');
    localStorage.removeItem('c360_session_policy');
    localStorage.removeItem('c360_last_activity_at');
    sessionStorage.removeItem('c360_analysis_session');
    clearApiCache();
    setCurrentUser(null);
    setActiveMenu('c360-dashboard');
    window.history.replaceState({}, '', pathFromMenuKey('c360-dashboard'));
  }, []);

  const handleLogout = useCallback(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      client.post('/auth/logout', {}, {
        headers: { Authorization: `Bearer ${token}` },
        hideGlobalLoading: true,
      }).catch(() => {});
    }
    clearCurrentSession();
  }, [clearCurrentSession]);

  const handleSessionExpired = useCallback((reason) => {
    clearCurrentSession();
    notification.warning({
      message: 'Phiên đăng nhập đã kết thúc',
      description: reason || 'Vui lòng đăng nhập lại để tiếp tục sử dụng C360.',
      placement: 'topRight',
      duration: 6,
    });
  }, [clearCurrentSession]);

  function handleUserUpdated(user) {
    const nextUser = { ...currentUser, ...user };
    localStorage.setItem('c360_user', JSON.stringify(nextUser));
    setCurrentUser(nextUser);
    window.dispatchEvent(new CustomEvent('c360:user-updated', { detail: nextUser }));
  }

  useEffect(() => {
    if (!currentUser) return undefined;
    let active = true;
    async function refreshCurrentUser() {
      try {
        const { data } = await client.get('/auth/me', { noCache: true, hideGlobalLoading: true });
        if (!active) return;
        setCurrentUser((existing) => {
          const nextUser = { ...existing, ...data };
          localStorage.setItem('c360_user', JSON.stringify(nextUser));
          window.dispatchEvent(new CustomEvent('c360:user-updated', { detail: nextUser }));
          return nextUser;
        });
      } catch {
        // Interceptor xử lý phiên hết hạn; lỗi mạng tạm thời không làm mất phiên hiện tại.
      }
    }
    refreshCurrentUser();
    const onFocus = () => refreshCurrentUser();
    window.addEventListener('focus', onFocus);
    return () => { active = false; window.removeEventListener('focus', onFocus); };
  }, [Boolean(currentUser)]);

  useEffect(() => {
    const requirePasswordChange = () => {
      setCurrentUser((existing) => {
        if (!existing) return existing;
        const nextUser = { ...existing, must_change_password: true };
        localStorage.setItem('c360_user', JSON.stringify(nextUser));
        return nextUser;
      });
    };
    window.addEventListener('c360:password-change-required', requirePasswordChange);
    return () => window.removeEventListener('c360:password-change-required', requirePasswordChange);
  }, []);

  useEffect(() => {
    const handleSessionEnded = (event) => handleSessionExpired(event.detail?.message);
    window.addEventListener('c360:session-ended', handleSessionEnded);
    return () => window.removeEventListener('c360:session-ended', handleSessionEnded);
  }, [handleSessionExpired]);

  function handleMenuChange(menuKey) {
    setActiveMenu(menuKey);
    const nextPath = pathFromMenuKey(menuKey);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({ menuKey }, '', nextPath);
    }
  }

  useEffect(() => {
    const currentKey = menuKeyFromPath(window.location.pathname);
    const canonicalPath = pathFromMenuKey(currentKey);
    setActiveMenu(currentKey);
    if (window.location.pathname !== canonicalPath) {
      window.history.replaceState({ menuKey: currentKey }, '', canonicalPath);
    }
    const handlePopState = () => setActiveMenu(menuKeyFromPath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!currentUser || currentUser.must_change_password) return undefined;

    const timer = window.setInterval(async () => {
      const rawJobId = localStorage.getItem('c360_processing_job_id');
      if (!rawJobId) return;

      try {
        const { data } = await client.get(`/customer-processing/jobs/${rawJobId}`);
        if (data.status === 'success') {
          localStorage.removeItem('c360_processing_job_id');
          localStorage.removeItem('c360_processing_period_key');
          notification.success({
            message: 'Đã xử lý xong dữ liệu khách hàng',
            description: `Kỳ ${data.period_key}: ${Number(data.processed_customers || 0).toLocaleString('vi-VN')} khách hàng đã sẵn sàng lên báo cáo.`,
            placement: 'topRight',
            duration: 0,
          });
        }
        if (data.status === 'error') {
          localStorage.removeItem('c360_processing_job_id');
          localStorage.removeItem('c360_processing_period_key');
          notification.error({
            message: 'Xử lý dữ liệu khách hàng bị lỗi',
            description: data.error_message || `Kỳ ${data.period_key} chưa xử lý thành công.`,
            placement: 'topRight',
            duration: 0,
          });
        }
      } catch {
        // Keep the job id so the watcher can retry on the next tick.
      }
    }, 3000);

    return () => window.clearInterval(timer);
  }, [currentUser]);

  const pages = {
    'c360-dashboard': <C360App embedded initialPage="dashboard" currentUser={currentUser} onLogout={handleLogout} />,
    'c360-insights': <C360App embedded initialPage="insights" currentUser={currentUser} onLogout={handleLogout} />,
    'c360-customers': <C360App embedded initialPage="customers" currentUser={currentUser} onLogout={handleLogout} />,
    'analysis-deposit': <C360App embedded initialPage="analysis-deposit" currentUser={currentUser} onLogout={handleLogout} />,
    'analysis-credit': <C360App embedded initialPage="analysis-credit" currentUser={currentUser} onLogout={handleLogout} />,
    'analysis-income': <C360App embedded initialPage="analysis-income" currentUser={currentUser} onLogout={handleLogout} />,
    'analysis-unit': <C360App embedded initialPage="analysis-unit" currentUser={currentUser} onLogout={handleLogout} />,
    'data-warehouse': <ImportData />,
    'data-cif': <CifDataWarehouse />,
    'customer-processing': <CustomerProcessing />,
    'data-sources': <DataGovernance mode="sources" />,
    'data-reconciliation': <DataGovernance mode="reconciliation" />,
    'data-mapping': <DataGovernance mode="mapping" />,
    'admin-branches': <SystemAdmin section="branches" />,
    'admin-departments': <SystemAdmin section="departments" />,
    'admin-users': <SystemAdmin section="users" />,
    'admin-roles': <SystemAdmin section="roles" />,
    'admin-audit-logs': <AuditLogs />,
    'admin-configuration': <SystemConfiguration />,
  };

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  if (currentUser.must_change_password) {
    return <ForcedPasswordChange user={currentUser} onChanged={handlePasswordChanged} onLogout={handleLogout} />;
  }

  const granted = new Set(currentUser.permissions || []);
  const requiredPermissions = PAGE_PERMISSIONS[activeMenu] || [];
  const authorizedMenu = granted.has('admin') || requiredPermissions.some((code) => granted.has(code));
  const visibleMenu = authorizedMenu ? activeMenu : 'c360-dashboard';

  return (
    <AuthProvider>
      <AnalysisScopeProvider currentUser={currentUser}>
        <UserWorkspaceProvider currentUser={currentUser}>
          <GlobalApiLoading />
          <ExcelExportProgress />
          <SessionGuard currentUser={currentUser} onSessionExpired={handleSessionExpired} onLogout={handleLogout} />
          <MainLayout activeMenu={visibleMenu} onMenuChange={handleMenuChange} currentUser={currentUser} onLogout={handleLogout} onUserUpdated={handleUserUpdated}>
            {pages[visibleMenu] || pages['c360-dashboard']}
          </MainLayout>
        </UserWorkspaceProvider>
      </AnalysisScopeProvider>
    </AuthProvider>
  );
}

function App() {
  if (window.location.pathname.startsWith('/c360') || window.location.pathname.startsWith('/demo')) {
    window.history.replaceState({}, '', '/');
  }
  return <LegacyApp />;
}

export default App;
