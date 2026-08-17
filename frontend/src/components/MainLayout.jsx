import { useEffect, useMemo, useState } from 'react';
import {
  ApartmentOutlined,
  AuditOutlined,
  BankOutlined,
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
  WalletOutlined,
} from '@ant-design/icons';
import { Avatar, Badge, Breadcrumb, Button, Layout, Menu, Space, Tooltip, Typography } from 'antd';

import logoUrl from '../../favicon.jpg';
import client from '../api/client';
import { PAGE_NAVIGATION } from '../constants/navigation';
import GlobalAnalysisFilter from './GlobalAnalysisFilter';
import { useAnalysisScope } from '../c360/AnalysisScopeContext';

const { Header, Sider, Content } = Layout;

const baseMenuItems = [
  {
    key: 'overview',
    icon: <DashboardOutlined />,
    label: 'Tổng quan',
    children: [
      { key: 'c360-dashboard', icon: <DashboardOutlined />, label: 'Dashboard điều hành' },
      { key: 'c360-insights', icon: <BarChartOutlined />, label: 'Cảnh báo & phân nhóm' },
    ],
  },
  {
    key: 'customers',
    icon: <TeamOutlined />,
    label: 'Quản lý khách hàng',
    children: [
      { key: 'c360-customers', icon: <TeamOutlined />, label: 'Danh sách khách hàng' },
    ],
  },
  {
    key: 'analytics',
    icon: <BarChartOutlined />,
    label: 'Phân tích nghiệp vụ',
    children: [
      { key: 'analysis-deposit', icon: <WalletOutlined />, label: 'Tiền gửi & dòng tiền' },
      { key: 'analysis-credit', icon: <BankOutlined />, label: 'Tiền vay & rủi ro' },
      { key: 'analysis-income', icon: <BarChartOutlined />, label: 'Thu nhập & sản phẩm' },
      { key: 'analysis-unit', icon: <ApartmentOutlined />, label: 'Đơn vị & cán bộ' },
    ],
  },
  {
    key: 'data',
    icon: <DatabaseOutlined />,
    label: 'Quản trị dữ liệu',
    children: [
      { key: 'data-warehouse', icon: <DatabaseOutlined />, label: 'Kho dữ liệu' },
      { key: 'data-cif', icon: <TeamOutlined />, label: 'Kho dữ liệu CIF' },
      { key: 'customer-processing', icon: <BranchesOutlined />, label: 'Xử lý dữ liệu KH' },
      { key: 'data-sources', icon: <DatabaseOutlined />, label: 'Giám sát nguồn dữ liệu' },
      { key: 'data-reconciliation', icon: <AuditOutlined />, label: 'Đối chiếu CIF' },
      { key: 'data-mapping', icon: <BranchesOutlined />, label: 'Từ điển & mapping' },
    ],
  },
  {
    key: 'admin',
    icon: <SettingOutlined />,
    label: 'Quản trị hệ thống',
    children: [
      { key: 'admin-branches', icon: <DatabaseOutlined />, label: 'Chi nhánh' },
      { key: 'admin-departments', icon: <ApartmentOutlined />, label: 'Phòng ban' },
      { key: 'admin-users', icon: <TeamOutlined />, label: 'Người dùng' },
      { key: 'admin-roles', icon: <SafetyCertificateOutlined />, label: 'Nhóm quyền' },
      { key: 'admin-configuration', icon: <SettingOutlined />, label: 'Cấu hình hệ thống' },
      { key: 'admin-audit-logs', icon: <AuditOutlined />, label: 'Nhật ký thao tác' },
    ],
  },
];

function MainLayout({ children, activeMenu, onMenuChange, currentUser, onLogout }) {
  const analysisScope = useAnalysisScope();
  const [collapsed, setCollapsed] = useState(false);
  const [sourceIssueCount, setSourceIssueCount] = useState(0);
  const pageMeta = PAGE_NAVIGATION[activeMenu] || PAGE_NAVIGATION['c360-dashboard'];
  const [openKeys, setOpenKeys] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('c360_open_menu_groups') || '[]');
      return [...new Set([...(Array.isArray(stored) ? stored : []), pageMeta.parent])];
    } catch {
      return [pageMeta.parent];
    }
  });
  const siderWidth = collapsed ? 76 : 260;
  const parentMenu = pageMeta.parent;
  const menuItems = useMemo(() => baseMenuItems.map((group) => ({
    ...group,
    children: group.children?.map((item) => (
      item.key === 'data-sources'
        ? {
          ...item,
          label: (
            <span className="menu-label-with-badge">
              <span>Giám sát nguồn dữ liệu</span>
              <Badge count={sourceIssueCount} size="small" overflowCount={99} />
            </span>
          ),
        }
        : item
    )),
  })), [sourceIssueCount]);

  useEffect(() => {
    setOpenKeys((current) => {
      const next = [...new Set([...current, parentMenu])];
      localStorage.setItem('c360_open_menu_groups', JSON.stringify(next));
      return next;
    });
  }, [parentMenu]);

  useEffect(() => {
    let active = true;
    async function loadSourceIssues() {
      const selectedPeriod = analysisScope?.applied?.periodKey;
      if (!selectedPeriod) {
        setSourceIssueCount(0);
        return;
      }
      try {
        const { data } = await client.get('/imports/source-readiness', {
          params: { period_key: selectedPeriod },
          hideGlobalLoading: true,
        });
        if (active) setSourceIssueCount((data?.sources || []).filter((item) => !item.is_ready).length);
      } catch {
        if (active) setSourceIssueCount(0);
      }
    }
    loadSourceIssues();
    const timer = window.setInterval(loadSourceIssues, 5 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [analysisScope?.applied?.periodKey]);

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
          {!collapsed ? <div className="app-brand"><strong>Customer 360</strong><small>Quản trị khách hàng</small></div> : null}
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
          openKeys={collapsed ? [] : openKeys}
          items={menuItems}
          inlineCollapsed={collapsed}
          onOpenChange={(keys) => {
            setOpenKeys(keys);
            localStorage.setItem('c360_open_menu_groups', JSON.stringify(keys));
          }}
          onClick={({ key }) => {
            if (['overview', 'customers', 'analytics', 'data', 'admin'].includes(key)) return;
            onMenuChange(key);
          }}
        />
        {!collapsed ? (
          <div className="app-sidebar-footer">
            <span className="app-sidebar-live"><i /> Hệ thống trực tuyến</span>
            <small>Dữ liệu được phân quyền theo đơn vị</small>
          </div>
        ) : null}
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
              {pageMeta.title}
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
        <GlobalAnalysisFilter activeMenu={activeMenu} />
        <Content className="app-content">
          <Breadcrumb
            className="app-breadcrumb"
            items={[
              { title: pageMeta.parentLabel },
              { title: pageMeta.title },
            ]}
          />
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}

export default MainLayout;
