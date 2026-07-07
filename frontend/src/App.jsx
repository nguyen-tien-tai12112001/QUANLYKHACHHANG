import { useEffect, useState } from 'react';
import { notification } from 'antd';

import MainLayout from './components/MainLayout';
import Dashboard from './pages/Dashboard';
import ImportData from './pages/ImportData';
import CustomerProcessing from './pages/CustomerProcessing';
import CustomerReport from './pages/CustomerReport';
import Login from './pages/Login';
import SystemAdmin from './pages/SystemAdmin';
import AuditLogs from './pages/AuditLogs';
import client from './api/client';

function App() {
  const [activeMenu, setActiveMenu] = useState('dashboard');
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
    setActiveMenu('dashboard');
  }

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
    dashboard: <Dashboard />,
    'data-warehouse': <ImportData />,
    'customer-processing': <CustomerProcessing />,
    reports: <CustomerReport />,
    'admin-branches': <SystemAdmin section="branches" />,
    'admin-departments': <SystemAdmin section="departments" />,
    'admin-users': <SystemAdmin section="users" />,
    'admin-roles': <SystemAdmin section="roles" />,
    'admin-audit-logs': <AuditLogs />,
  };

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <MainLayout activeMenu={activeMenu} onMenuChange={setActiveMenu} currentUser={currentUser} onLogout={handleLogout}>
      {pages[activeMenu] || <Dashboard />}
    </MainLayout>
  );
}

export default App;
