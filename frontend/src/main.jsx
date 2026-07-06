import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      locale={viVN}
      theme={{
        token: {
          colorPrimary: '#8f1438',
          colorInfo: '#8f1438',
          colorSuccess: '#218653',
          colorWarning: '#c78913',
          colorError: '#c62828',
          colorBgLayout: '#f7f3ef',
          colorText: '#25171b',
          borderRadius: 6,
          fontFamily: 'Inter, Arial, sans-serif',
        },
        components: {
          Layout: {
            siderBg: '#6f102c',
            triggerBg: '#6f102c',
          },
          Menu: {
            darkItemBg: '#6f102c',
            darkItemSelectedBg: '#a51d44',
            darkItemHoverBg: '#861638',
          },
          Card: {
            headerBg: '#ffffff',
          },
          Table: {
            headerBg: '#f8efe8',
            headerColor: '#4b1b2a',
          },
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
);

