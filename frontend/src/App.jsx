import { useEffect, useState } from 'react';
import { notification } from 'antd';

import { AuthProvider } from './auth';
import MainLayout from './components/MainLayout';
import GlobalApiLoading from './components/GlobalApiLoading';
import ImportData from './pages/ImportData';
import CustomerProcessing from './pages/CustomerProcessing';
import Login from './pages/Login';
import SystemAdmin from './pages/SystemAdmin';
import AuditLogs from './pages/AuditLogs';
import SystemConfiguration from './pages/SystemConfiguration';
import DataGovernance from './pages/DataGovernance';
import CifDataWarehouse from './pages/CifDataWarehouse';
import client from './api/client';
import C360App from './c360/C360App';
import { menuKeyFromPath, pathFromMenuKey } from './constants/navigation';
import { AnalysisScopeProvider } from './c360/AnalysisScopeContext';

function LegacyApp() {
  const [activeMenu, setActiveMenu] = useState(() => menuKeyFromPath(window.location.pathname));
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const raw = localStorage.getItem('c360_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      localStorage.removeItem('c360_user');
      return null;
    }
  });

  function handleLogin(user) {
    localStorage.setItem('c360_user', JSON.stringify(user));
    setCurrentUser(user);
  }

  function handleLogout() {
    localStorage.removeItem('c360_user');
    setCurrentUser(null);
    setActiveMenu('c360-dashboard');
    window.history.replaceState({}, '', pathFromMenuKey('c360-dashboard'));
  }

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
    if (!currentUser) return undefined;

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

  return (
    <AuthProvider>
      <AnalysisScopeProvider currentUser={currentUser}>
        <GlobalApiLoading />
        <MainLayout activeMenu={activeMenu} onMenuChange={handleMenuChange} currentUser={currentUser} onLogout={handleLogout}>
          {pages[activeMenu] || pages['c360-dashboard']}
        </MainLayout>
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
