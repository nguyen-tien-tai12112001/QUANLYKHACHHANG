export const PAGE_NAVIGATION = {
  'c360-dashboard': { path: '/overview', parent: 'overview', parentLabel: 'Tổng quan', title: 'Dashboard điều hành' },
  'c360-insights': { path: '/overview/insights', parent: 'overview', parentLabel: 'Tổng quan', title: 'Cảnh báo & phân nhóm' },
  dashboard: { path: '/overview/business', parent: 'overview', parentLabel: 'Tổng quan', title: 'Dashboard nghiệp vụ' },
  'c360-customers': { path: '/customers', parent: 'customers', parentLabel: 'Quản lý khách hàng', title: 'Danh sách khách hàng' },
  reports: { path: '/customers/reports', parent: 'customers', parentLabel: 'Quản lý khách hàng', title: 'Báo cáo khách hàng' },
  'data-warehouse': { path: '/data/warehouse', parent: 'data', parentLabel: 'Quản trị dữ liệu', title: 'Kho dữ liệu' },
  'customer-processing': { path: '/data/customer-processing', parent: 'data', parentLabel: 'Quản trị dữ liệu', title: 'Xử lý dữ liệu KH' },
  'data-sources': { path: '/data/source-monitoring', parent: 'data', parentLabel: 'Quản trị dữ liệu', title: 'Giám sát nguồn dữ liệu' },
  'data-mapping': { path: '/data/dictionary', parent: 'data', parentLabel: 'Quản trị dữ liệu', title: 'Từ điển & mapping' },
  'data-history': { path: '/data/history', parent: 'data', parentLabel: 'Quản trị dữ liệu', title: 'Lịch sử xử lý dữ liệu' },
  'admin-branches': { path: '/admin/branches', parent: 'admin', parentLabel: 'Quản trị hệ thống', title: 'Chi nhánh' },
  'admin-departments': { path: '/admin/departments', parent: 'admin', parentLabel: 'Quản trị hệ thống', title: 'Phòng ban' },
  'admin-users': { path: '/admin/users', parent: 'admin', parentLabel: 'Quản trị hệ thống', title: 'Người dùng' },
  'admin-roles': { path: '/admin/roles', parent: 'admin', parentLabel: 'Quản trị hệ thống', title: 'Nhóm quyền' },
  'admin-audit-logs': { path: '/admin/audit-logs', parent: 'admin', parentLabel: 'Quản trị hệ thống', title: 'Nhật ký thao tác' },
};

export function menuKeyFromPath(pathname) {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return Object.entries(PAGE_NAVIGATION).find(([, item]) => item.path === normalized)?.[0] || 'c360-dashboard';
}

export function pathFromMenuKey(key) {
  return PAGE_NAVIGATION[key]?.path || PAGE_NAVIGATION['c360-dashboard'].path;
}
