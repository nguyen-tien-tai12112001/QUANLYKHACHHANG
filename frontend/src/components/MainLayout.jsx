import {
  BarChartOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { Layout, Menu, Typography } from 'antd';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: 'dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: 'data-warehouse', icon: <DatabaseOutlined />, label: 'Kho dữ liệu' },
  { key: 'reports', icon: <BarChartOutlined />, label: 'Báo cáo' },
  { key: 'settings', icon: <SettingOutlined />, label: 'Cấu hình' },
];

function MainLayout({ children, activeMenu, onMenuChange }) {
  return (
    <Layout className="app-shell">
      <Sider width={248} className="app-sidebar">
        <div className="app-logo">
          <span className="app-logo-mark">A</span>
          <span>QLKH</span>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[activeMenu]}
          items={menuItems}
          onClick={({ key }) => onMenuChange(key)}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <Typography.Title level={4} className="app-title">
            QUẢN LÝ KHÁCH HÀNG
          </Typography.Title>
        </Header>
        <Content className="app-content">{children}</Content>
      </Layout>
    </Layout>
  );
}

export default MainLayout;

