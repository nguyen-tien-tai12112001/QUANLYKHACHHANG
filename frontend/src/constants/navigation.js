export const PAGE_NAVIGATION = {
  'c360-dashboard': { path: '/overview', parent: 'overview', parentLabel: 'Tổng quan', title: 'Dashboard điều hành' },
  'c360-insights': { path: '/overview/insights', parent: 'overview', parentLabel: 'Tổng quan', title: 'Cảnh báo & phân nhóm' },
  'c360-customers': { path: '/customers', parent: 'customers', parentLabel: 'Quản lý khách hàng', title: 'Danh sách khách hàng' },
  'analysis-deposit': { path: '/analytics/deposit-cashflow', parent: 'analytics', parentLabel: 'Phân tích nghiệp vụ', title: 'Tiền gửi & dòng tiền' },
  'analysis-credit': { path: '/analytics/credit-risk', parent: 'analytics', parentLabel: 'Phân tích nghiệp vụ', title: 'Tiền vay & rủi ro' },
  'analysis-income': { path: '/analytics/income-products', parent: 'analytics', parentLabel: 'Phân tích nghiệp vụ', title: 'Thu nhập & sản phẩm' },
  'analysis-unit': { path: '/analytics/units-officers', parent: 'analytics', parentLabel: 'Phân tích nghiệp vụ', title: 'Đơn vị & cán bộ' },
  'data-warehouse': { path: '/data/warehouse', parent: 'data', parentLabel: 'Quản trị dữ liệu', title: 'Kho dữ liệu' },
  'data-cif': { path: '/data/cif', parent: 'data', parentLabel: 'Quản trị dữ liệu', title: 'Kho dữ liệu CIF' },
  'customer-processing': { path: '/data/customer-processing', parent: 'data', parentLabel: 'Quản trị dữ liệu', title: 'Xử lý dữ liệu KH' },
  'data-sources': { path: '/data/source-monitoring', parent: 'data', parentLabel: 'Quản trị dữ liệu', title: 'Giám sát nguồn dữ liệu' },
  'data-reconciliation': { path: '/data/cif-reconciliation', parent: 'data', parentLabel: 'Quản trị dữ liệu', title: 'Đối chiếu CIF' },
  'data-mapping': { path: '/data/dictionary', parent: 'data', parentLabel: 'Quản trị dữ liệu', title: 'Từ điển & mapping' },
  'admin-branches': { path: '/admin/branches', parent: 'admin', parentLabel: 'Quản trị hệ thống', title: 'Chi nhánh' },
  'admin-departments': { path: '/admin/departments', parent: 'admin', parentLabel: 'Quản trị hệ thống', title: 'Phòng ban' },
  'admin-users': { path: '/admin/users', parent: 'admin', parentLabel: 'Quản trị hệ thống', title: 'Người dùng' },
  'admin-roles': { path: '/admin/roles', parent: 'admin', parentLabel: 'Quản trị hệ thống', title: 'Nhóm quyền' },
  'admin-audit-logs': { path: '/admin/audit-logs', parent: 'admin', parentLabel: 'Quản trị hệ thống', title: 'Nhật ký thao tác' },
  'admin-configuration': { path: '/admin/configuration', parent: 'admin', parentLabel: 'Quản trị hệ thống', title: 'Cấu hình hệ thống' },
};

export function menuKeyFromPath(pathname) {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return Object.entries(PAGE_NAVIGATION).find(([, item]) => item.path === normalized)?.[0] || 'c360-dashboard';
}

export function pathFromMenuKey(key) {
  return PAGE_NAVIGATION[key]?.path || PAGE_NAVIGATION['c360-dashboard'].path;
}
