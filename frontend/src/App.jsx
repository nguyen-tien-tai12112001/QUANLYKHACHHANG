import { useState } from 'react';

import MainLayout from './components/MainLayout';
import Dashboard from './pages/Dashboard';
import ImportData from './pages/ImportData';
import CustomerReport from './pages/CustomerReport';
import Login from './pages/Login';
import SystemAdmin from './pages/SystemAdmin';
import AuditLogs from './pages/AuditLogs';

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

  const pages = {
    dashboard: <Dashboard />,
    'data-warehouse': <ImportData />,
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
