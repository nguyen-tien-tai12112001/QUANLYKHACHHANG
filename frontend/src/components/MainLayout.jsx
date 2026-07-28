import { useState } from 'react';
import {
  ApartmentOutlined,
  AuditOutlined,
  BarChartOutlined,
  BranchesOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Layout, Menu, Space, Tooltip, Typography } from 'antd';

import logoUrl from '../../favicon.jpg';

const { Header, Sider, Content } = Layout;

const menuItems = [
  {
    key: 'executive',
    icon: <DashboardOutlined />,
    label: 'Điều hành',
    children: [
      { key: 'c360-dashboard', icon: <DashboardOutlined />, label: 'Tổng quan C360' },
      { key: 'c360-insights', icon: <BarChartOutlined />, label: 'Cảnh báo & phân nhóm' },
      { key: 'dashboard', icon: <BarChartOutlined />, label: 'Dashboard nghiệp vụ' },
    ],
  },
  {
    key: 'customers',
    icon: <TeamOutlined />,
    label: 'Khách hàng',
    children: [
      { key: 'c360-customers', icon: <TeamOutlined />, label: 'Danh sách C360' },
      { key: 'reports', icon: <BarChartOutlined />, label: 'Báo cáo khách hàng' },
    ],
  },
  {
    key: 'data',
    icon: <DatabaseOutlined />,
    label: 'Dữ liệu',
    children: [
      { key: 'data-warehouse', icon: <DatabaseOutlined />, label: 'Kho dữ liệu' },
      { key: 'customer-processing', icon: <BranchesOutlined />, label: 'Xử lý dữ liệu KH' },
    ],
  },
  {
    key: 'admin',
    icon: <SettingOutlined />,
    label: 'Quản trị hệ thống',
    children: [
      { key: 'admin-branches', icon: <DatabaseOutlined />, label: 'Quản trị chi nhánh' },
      { key: 'admin-departments', icon: <ApartmentOutlined />, label: 'Phòng ban' },
      { key: 'admin-users', icon: <TeamOutlined />, label: 'Người dùng' },
      { key: 'admin-roles', icon: <SafetyCertificateOutlined />, label: 'Nhóm quyền' },
      { key: 'admin-audit-logs', icon: <AuditOutlined />, label: 'Nhật ký thao tác' },
    ],
  },
];

function MainLayout({ children, activeMenu, onMenuChange, currentUser, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);
  const siderWidth = collapsed ? 76 : 260;
  const parentMenu = ['c360-dashboard', 'c360-insights', 'dashboard'].includes(activeMenu)
    ? 'executive'
    : ['c360-customers', 'reports'].includes(activeMenu)
      ? 'customers'
      : ['data-warehouse', 'customer-processing'].includes(activeMenu)
        ? 'data'
        : activeMenu.startsWith('admin-')
          ? 'admin'
          : null;

  return (
    <Layout className="app-shell">
      <Sider
        width={260}
        collapsedWidth={76}
        collapsed={collapsed}
        trigger={null}
        className="app-sidebar"
      >
        <div className="app-logo">
          <img className="app-logo-image" src={logoUrl} alt="C360" />
          {!collapsed ? <span>C360</span> : null}
          <Tooltip title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}>
            <Button
              type="text"
              className="sidebar-logo-toggle"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((value) => !value)}
            />
          </Tooltip>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[activeMenu]}
          defaultOpenKeys={parentMenu && !collapsed ? [parentMenu] : []}
          items={menuItems}
          inlineCollapsed={collapsed}
          onClick={({ key }) => {
            if (['executive', 'customers', 'data', 'admin'].includes(key)) return;
            onMenuChange(key);
          }}
        />
      </Sider>
      <Layout className="app-main" style={{ marginLeft: siderWidth }}>
        <Header className="app-header">
          <Space size={12}>
            <Tooltip title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}>
              <Button
                type="text"
                className="sidebar-toggle"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed((value) => !value)}
              />
            </Tooltip>
            <Typography.Title level={4} className="app-title">
              C360
            </Typography.Title>
          </Space>
          <Space className="app-user" size={12}>
            <Avatar className="app-user-avatar">{currentUser?.full_name?.charAt(0) || 'C'}</Avatar>
            <span>
              <Typography.Text strong>{currentUser?.full_name}</Typography.Text>
              <Typography.Text type="secondary" className="app-user-subtitle">
                {[currentUser?.branch_code, currentUser?.role_name || 'Người dùng'].filter(Boolean).join(' · ')}
              </Typography.Text>
            </span>
            <Button icon={<LogoutOutlined />} onClick={onLogout}>
              Đăng xuất
            </Button>
          </Space>
        </Header>
        <Content className="app-content">{children}</Content>
      </Layout>
    </Layout>
  );
}

export default MainLayout;
