/**
 * Mã quyền dùng chung giữa frontend và backend.
 * Module quản trị chỉ cần map role → danh sách permission này.
 */
export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',
  REPORT_VIEW: 'report.view',
  IMPORT_VIEW: 'import.view',
  IMPORT_MANAGE: 'import.manage',
  BRANCH_VIEW_ALL: 'branch.view_all',
  BRANCH_VIEW_OWN: 'branch.view_own',
  DATA_EXPORT: 'data.export',
  ADMIN: 'admin',
};

export const SCOPES = {
  PROVINCE: 'province',
  BRANCH: 'branch',
  PGD: 'pgd',
  OWN: 'own',
};

/**
 * User shape mà module quản trị cần cung cấp (qua /api/auth/me hoặc authBridge).
 * @typedef {Object} AuthUser
 * @property {string} id
 * @property {string} username
 * @property {string} [display_name]
 * @property {string} [ma_cn]
 * @property {string} [ma_pgd]
 * @property {'province'|'branch'|'pgd'} [scope]
 * @property {string[]} [allowed_branches]
 * @property {string[]} [allowed_pgds]
 * @property {string[]} permissions
 */

/**
 * @typedef {Object} BranchScope
 * @property {string|null} filterCn
 * @property {string|null} filterPgd
 * @property {boolean} canViewProvince
 * @property {boolean} canChangeBranch
 * @property {boolean} canChangePgd
 * @property {string[]} allowedBranches
 * @property {string[]} allowedPgds
 * @property {string|null} defaultCn
 * @property {string|null} defaultPgd
 */

export const DEV_USER = {
  id: 'dev',
  username: 'dev',
  display_name: 'Dev (toàn quyền)',
  scope: SCOPES.PROVINCE,
  ma_cn: null,
  ma_pgd: null,
  allowed_branches: [],
  allowed_pgds: [],
  permissions: Object.values(PERMISSIONS),
};
