import { useState } from 'react';

import MainLayout from './components/MainLayout';
import Dashboard from './pages/Dashboard';
import ImportData from './pages/ImportData';
import CustomerReport from './pages/CustomerReport';

function App() {
  const [activeMenu, setActiveMenu] = useState('dashboard');

  const pages = {
    dashboard: <Dashboard />,
    'data-warehouse': <ImportData />,
    reports: <CustomerReport />,
    settings: <Dashboard />,
  };

  return (
    <MainLayout activeMenu={activeMenu} onMenuChange={setActiveMenu}>
      {pages[activeMenu] || <Dashboard />}
    </MainLayout>
  );
}

export default App;
