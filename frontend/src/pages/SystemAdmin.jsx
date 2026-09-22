import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ApartmentOutlined,
  ArrowLeftOutlined,
  BankOutlined,
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  DiffOutlined,
  DesktopOutlined,
  EditOutlined,
  EyeOutlined,
  ExclamationCircleOutlined,
  FullscreenOutlined,
  KeyOutlined,
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SettingOutlined,
  StopOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UnlockOutlined,
  UploadOutlined,
  UserSwitchOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Collapse,
  Form,
  Input,
  Modal,
  Popconfirm,
  Popover,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd';

import client from '../api/client';
import { useAuth } from '../auth';

const { Paragraph, Text, Title } = Typography;
const { Panel } = Collapse;

const sectionMeta = {
  branches: {
    title: 'Quản trị chi nhánh',
    subtitle: 'Quản lý mã chi nhánh, tên chi nhánh và trạng thái hoạt động.',
    tag: 'Tổ chức',
    icon: <BankOutlined />,
    endpoint: '/admin/branches',
    entityName: 'chi nhánh',
    theme: 'branch',
  },
  departments: {
    title: 'Quản trị phòng ban',
    subtitle: 'Quản lý phòng ban trực thuộc từng chi nhánh.',
    tag: 'Cơ cấu',
    icon: <ApartmentOutlined />,
    endpoint: '/admin/departments',
    entityName: 'phòng ban',
    theme: 'department',
  },
  users: {
    title: 'Quản trị người dùng',
    subtitle: 'Quản lý tài khoản đăng nhập, cán bộ, phòng ban và nhóm quyền.',
    tag: 'Tài khoản',
    icon: <TeamOutlined />,
    endpoint: '/admin/users',
    entityName: 'người dùng',
    theme: 'user',
  },
  roles: {
    title: 'Quản trị nhóm quyền',
    subtitle: 'Cấu hình nhóm quyền chung hoặc nhóm quyền riêng theo đặc thù vận hành.',
    tag: 'Phân quyền',
    icon: <SafetyCertificateOutlined />,
    endpoint: '/admin/roles',
    entityName: 'nhóm quyền',
    theme: 'role',
  },
};

const defaultVisibleColumns = {
  branches: ['branch_code', 'branch_name', 'branch_level', 'parent_branch_name', 'department_count', 'user_count', 'status'],
  departments: ['branch_name', 'department_code', 'department_name', 'department_type', 'parent_department_name', 'manager_name', 'user_count', 'status'],
  users: ['full_name', 'employee_code', 'contact', 'customer_cif_code', 'ipcas_username', 'department_name', 'role_code', 'extra_permissions', 'data_scope', 'password_status', 'last_login_at', 'is_active'],
  roles: ['role_code', 'role_name', 'description', 'default_scope', 'allowed_scopes', 'user_count', 'permissions'],
};

const SEGREGATION_CONFLICTS = [
  {
    codes: ['warehouse:import', 'reconciliation:review'],
    label: 'Vừa import nguồn vừa xác nhận đối chiếu',
  },
  {
    codes: ['processing:run', 'reconciliation:review'],
    label: 'Vừa chạy xử lý vừa xác nhận đối chiếu',
  },
  {
    codes: ['cif:override', 'cif:review'],
    label: 'Vừa ghi đè CIF vừa xác nhận xung đột CIF',
  },
];

const bulkActionOptions = [
  { value: 'grant_permissions', label: 'Cấp thêm quyền (ALLOW)', description: 'Bổ sung quyền, tự thêm quyền nền còn thiếu và bỏ DENY trùng.' },
  { value: 'deny_permissions', label: 'Từ chối quyền (DENY)', description: 'Chặn quyền đang được kế thừa; DENY luôn ưu tiên hơn ALLOW.' },
  { value: 'remove_overrides', label: 'Gỡ quyền ngoại lệ', description: 'Gỡ ALLOW/DENY đã cấu hình riêng, đưa người dùng về quyền của nhóm.' },
  { value: 'assign_role', label: 'Gán nhóm quyền', description: 'Đổi nhóm và đưa phạm vi về mặc định của nhóm mới.' },
  { value: 'set_scope', label: 'Đổi phạm vi dữ liệu', description: 'Đổi phạm vi nhưng giữ nguyên nhóm và các quyền hiện có.' },
  { value: 'lock_accounts', label: 'Khóa tài khoản', description: 'Khóa tài khoản và kết thúc toàn bộ phiên đăng nhập.' },
  { value: 'unlock_accounts', label: 'Mở khóa tài khoản', description: 'Cho phép các tài khoản bị khóa đăng nhập trở lại.' },
  { value: 'force_logout', label: 'Buộc đăng nhập lại', description: 'Kết thúc toàn bộ phiên hiện tại, không thay đổi quyền.' },
];

function requestErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail?.message) return detail.message;
  return error?.message || fallback;
}

function analyzeRolePermissions(role, permissionCatalog) {
  const codes = new Set(role?.permission_codes || []);
  const missingPrerequisites = permissionCatalog
    .filter((item) => codes.has(item.permission_code) && item.prerequisite_code && !codes.has(item.prerequisite_code))
    .map((item) => `${item.permission_name} cần quyền ${item.prerequisite_code}`);
  const dutyConflicts = role?.role_code === 'ADMIN' ? [] : SEGREGATION_CONFLICTS
    .filter((rule) => rule.codes.every((code) => codes.has(code)))
    .map((rule) => rule.label);
  return { missingPrerequisites, dutyConflicts, total: missingPrerequisites.length + dutyConflicts.length };
}

function getArrayPayload(data) {
  return Array.isArray(data) ? data : data?.value || [];
}

function activeTag(value) {
  const inactive = value === false || value === 'inactive';
  return <Tag color={inactive ? 'default' : 'success'}>{inactive ? 'Ngừng dùng' : 'Hoạt động'}</Tag>;
}

function roleColor(code) {
  if (code === 'ADMIN') return 'red';
  if (code === 'HEAD_OFFICE_LEADER') return 'purple';
  if (code === 'BRANCH_MANAGER') return 'volcano';
  if (code === 'DEPARTMENT_MANAGER') return 'gold';
  return 'green';
}

function isTemporaryLoginLocked(user) {
  if (user?.is_temporarily_locked) return true;
  const lockedUntil = user?.locked_until ? new Date(user.locked_until).getTime() : 0;
  return Number.isFinite(lockedUntil) && lockedUntil > Date.now();
}

function roleShortLabel(code) {
  return {
    ADMIN: 'Quản trị',
    HEAD_OFFICE_LEADER: 'Lãnh đạo Hội sở',
    BRANCH_MANAGER: 'Lãnh đạo CN II',
    DEPARTMENT_MANAGER: 'Lãnh đạo phòng/PGD',
    USER: 'Cán bộ QLKH',
  }[code] || code;
}

function compactPermissionList(items = []) {
  const groups = [...new Set(items.map((item) => item.permission_group).filter(Boolean))];
  const detail = items.map((item) => `${item.permission_name} (${item.permission_code})`).join('\n');
  return (
    <Tooltip title={<span className="admin-permission-tooltip">{detail || 'Chưa cấp quyền'}</span>} placement="left">
      <div className="admin-permission-summary">
        <Tag color="geekblue">{items.length} quyền</Tag>
        {groups.slice(0, 2).map((group) => <Tag key={group}>{group}</Tag>)}
        {groups.length > 2 && <Tag>+{groups.length - 2} nhóm</Tag>}
      </div>
    </Tooltip>
  );
}

function dataScopeTag(value) {
  const scopeMap = {
    province: ['red', 'Toàn tỉnh'],
    branch: ['volcano', 'Theo chi nhánh'],
    department: ['gold', 'Theo phòng ban'],
    own: ['green', 'Khách hàng được giao'],
  };
  const [color, label] = scopeMap[value] || ['default', value || 'Chưa cấu hình'];
  return <Tag color={color}>{label}</Tag>;
}

function selectProps(placeholder) {
  return {
    allowClear: true,
    showSearch: true,
    optionFilterProp: 'label',
    placeholder,
    popupMatchSelectWidth: 420,
    className: 'wide-select',
  };
}

function ellipsisText(value, options = {}) {
  const text = value || options.empty || '';
  if (!text) {
    return <Text type="secondary">Chưa có</Text>;
  }
  return (
    <Tooltip title={text}>
      <Text strong={options.strong} className={options.className || 'admin-ellipsis-text'}>
        {text}
      </Text>
    </Tooltip>
  );
}

function matchesSupplementaryFilters(section, row, filters) {
  if (section === 'branches') {
    return (!filters.branch_level || row.branch_level === filters.branch_level)
      && (!filters.parent_branch_id || row.parent_branch_id === filters.parent_branch_id);
  }
  if (section === 'departments') {
    return !filters.parent_department_id || row.parent_department_id === filters.parent_department_id;
  }
  if (section === 'users') {
    const temporarilyLocked = isTemporaryLoginLocked(row);
    const lastLogin = row.last_login_at ? new Date(row.last_login_at).getTime() : null;
    const staleLogin = lastLogin !== null && Number.isFinite(lastLogin) && lastLogin < Date.now() - 90 * 86400000;
    const passwordMatches = !filters.password_state
      || (filters.password_state === 'temporary_lock' && temporarilyLocked)
      || (filters.password_state === 'must_change' && row.must_change_password && !temporarilyLocked)
      || (filters.password_state === 'ready' && !row.must_change_password && !temporarilyLocked);
    const loginMatches = !filters.login_state
      || (filters.login_state === 'never' && !row.last_login_at)
      || (filters.login_state === 'stale' && staleLogin)
      || (filters.login_state === 'recent' && lastLogin !== null && !staleLogin);
    const overrideCount = (row.extra_permission_codes?.length || 0) + (row.denied_permission_codes?.length || 0);
    return passwordMatches && loginMatches
      && (filters.has_overrides === undefined || Boolean(overrideCount) === filters.has_overrides)
      && (filters.cif_linked === undefined || Boolean(row.customer_cif_code) === filters.cif_linked)
      && (filters.is_superuser === undefined || Boolean(row.is_superuser) === filters.is_superuser);
  }
  const warnings = analyzeRolePermissions(row, filters.permissionCatalog || []).total;
  return (!filters.default_scope || row.default_scope === filters.default_scope)
    && (filters.is_system === undefined || Boolean(row.is_system) === filters.is_system)
    && (filters.has_users === undefined || (Number(row.user_count || 0) > 0) === filters.has_users)
    && (!filters.warning_state || (filters.warning_state === 'warning' ? warnings > 0 : warnings === 0));
}

function SystemAdmin({ section = 'branches' }) {
  const meta = sectionMeta[section] || sectionMeta.branches;
  const { user: currentUser } = useAuth();
  const [form] = Form.useForm();
  const [filterForm] = Form.useForm();
  const [accessForm] = Form.useForm();
  const [resetPasswordForm] = Form.useForm();
  const [bulkForm] = Form.useForm();
  const modalBranchId = Form.useWatch('branch_id', form);
  const modalBranchLevel = Form.useWatch('branch_level', form);
  const modalRoleId = Form.useWatch('role_id', form);
  const filterBranchId = Form.useWatch('branch_id', filterForm);
  const accessBranchCode = Form.useWatch('branch_code', accessForm);
  const bulkAction = Form.useWatch('action', bulkForm);

  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [userWarnings, setUserWarnings] = useState({ missing_role: 0, missing_department: 0, duplicate_ipcas: [] });
  const [warningModal, setWarningModal] = useState({ open: false, title: '', rows: [], loading: false });
  const [accessTester, setAccessTester] = useState({ open: false, loading: false, result: null });
  const [sessionManager, setSessionManager] = useState({ open: false, loading: false, items: [] });
  const [overview, setOverview] = useState({});
  const [loading, setLoading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLookup, setUploadingLookup] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [resetPasswordTarget, setResetPasswordTarget] = useState(null);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedPermissionCodes, setSelectedPermissionCodes] = useState([]);
  const [selectedExtraPermissionCodes, setSelectedExtraPermissionCodes] = useState([]);
  const [selectedDeniedPermissionCodes, setSelectedDeniedPermissionCodes] = useState([]);
  const [selectedUserRowKeys, setSelectedUserRowKeys] = useState([]);
  const [bulkActionModal, setBulkActionModal] = useState({ open: false, loading: false, preview: null });
  const [roleViewMode, setRoleViewMode] = useState('matrix');
  const [matrixExpanded, setMatrixExpanded] = useState(false);
  const [matrixPermissionGroup, setMatrixPermissionGroup] = useState('all');
  const [permissionSearch, setPermissionSearch] = useState('');
  const [permissionView, setPermissionView] = useState('all');
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState({});
  const [visibleColumns, setVisibleColumns] = useState(defaultVisibleColumns[section]);
  const loadRowsRequestRef = useRef(0);
  const loadLookupsRequestRef = useRef(0);
  const canTestAccess = (currentUser?.permissions || []).some((code) => code === 'admin' || code === 'admin:access_test');
  const canManageSuperuser = (currentUser?.permissions || []).includes('admin');
  const modalRole = useMemo(() => roles.find((item) => item.id === modalRoleId), [modalRoleId, roles]);
  const inheritedPermissionCodes = useMemo(() => new Set(modalRole?.permission_codes || []), [modalRole]);

  async function loadLookups() {
    const requestId = ++loadLookupsRequestRef.current;
    setOverviewLoading(true);
    try {
      // Trang Nhóm quyền chỉ cần tổng quan và danh mục quyền. Trước đây màn
      // hình này vẫn tải toàn bộ 370+ người dùng, phòng ban, chi nhánh và cảnh
      // báo nên menu có cảm giác bị treo dù ma trận chỉ có vài nhóm quyền.
      const lookupRequests = [
        ['overview', client.get('/admin/overview', { hideGlobalLoading: true })],
      ];
      if (section === 'roles') {
        lookupRequests.push(['permissions', client.get('/admin/permissions', { hideGlobalLoading: true })]);
      }
      if (section === 'users') {
        lookupRequests.push(
          ['branches', client.get('/admin/branches', { hideGlobalLoading: true })],
          ['departments', client.get('/admin/departments', { hideGlobalLoading: true })],
          ['roles', client.get('/admin/roles', { hideGlobalLoading: true })],
          ['permissions', client.get('/admin/permissions', { hideGlobalLoading: true })],
          ['warnings', client.get('/admin/users/warnings', { hideGlobalLoading: true })],
        );
      }
      if (section === 'departments') {
        lookupRequests.push(
          ['branches', client.get('/admin/branches', { hideGlobalLoading: true })],
          ['users', client.get('/admin/users', { hideGlobalLoading: true })],
        );
      }
      const results = await Promise.allSettled(lookupRequests.map(([, request]) => request));
      if (requestId !== loadLookupsRequestRef.current) return;
      results.forEach((result, index) => {
        if (result.status !== 'fulfilled') return;
        const [key] = lookupRequests[index];
        const value = result.value.data;
        if (key === 'overview') setOverview(value || {});
        if (key === 'branches') setBranches(getArrayPayload(value));
        if (key === 'departments') setDepartments(getArrayPayload(value));
        if (key === 'roles') setRoles(getArrayPayload(value));
        if (key === 'permissions') setPermissions(getArrayPayload(value));
        if (key === 'users') setStaffUsers(getArrayPayload(value));
        if (key === 'warnings') setUserWarnings(value || {});
      });
    } finally {
      if (requestId === loadLookupsRequestRef.current) setOverviewLoading(false);
    }
  }

  async function refreshAdminSummary() {
    const results = await Promise.allSettled([
      client.get('/admin/overview', { hideGlobalLoading: true, noCache: true }),
      client.get('/admin/users/warnings', { hideGlobalLoading: true, noCache: true }),
    ]);
    if (results[0].status === 'fulfilled') setOverview(results[0].value.data || {});
    if (results[1].status === 'fulfilled') setUserWarnings(results[1].value.data || {});
  }

  async function refreshCurrentCatalog() {
    const { data } = await client.get(meta.endpoint, { hideGlobalLoading: true, noCache: true });
    const catalog = getArrayPayload(data);
    if (section === 'branches') setBranches(catalog);
    if (section === 'departments') setDepartments(catalog);
    if (section === 'users') setStaffUsers(catalog);
    if (section === 'roles') setRoles(catalog);
  }

  async function loadRows(extraParams = {}, reset = false) {
    const requestId = ++loadRowsRequestRef.current;
    setLoading(true);
    try {
      const allowedKeys = {
        branches: ['keyword', 'status', 'branch_level', 'parent_branch_id'],
        departments: ['keyword', 'branch_id', 'department_type', 'manager_user_id', 'parent_department_id', 'status'],
        users: ['keyword', 'branch_id', 'department_id', 'role_id', 'data_scope', 'is_active', 'password_state', 'login_state', 'has_overrides', 'cif_linked', 'is_superuser'],
        roles: ['keyword', 'permission_group', 'permission_code', 'default_scope', 'is_system', 'has_users', 'warning_state'],
      }[section] || [];
      const params = reset ? {} : Object.fromEntries(Object.entries({ ...filterForm.getFieldsValue(true), ...extraParams }).filter(([key]) => allowedKeys.includes(key)));
      Object.keys(params).forEach((key) => {
        if (params[key] === undefined || params[key] === null || params[key] === '') {
          delete params[key];
        }
      });
      const serverKeys = {
        branches: ['keyword', 'status'],
        departments: ['keyword', 'branch_id', 'department_type', 'manager_user_id', 'status'],
        users: ['keyword', 'branch_id', 'department_id', 'role_id', 'data_scope', 'is_active'],
        roles: ['keyword', 'permission_group', 'permission_code'],
      }[section] || [];
      const serverParams = Object.fromEntries(Object.entries(params).filter(([key]) => serverKeys.includes(key)));
      const { data } = await client.get(meta.endpoint, { params: serverParams, hideGlobalLoading: true });
      if (requestId !== loadRowsRequestRef.current) return;
      const nextRows = getArrayPayload(data);
      setRows(nextRows);
      // Dùng ngay catalog không lọc cho bảng và các lựa chọn trên cùng trang,
      // tránh gọi lại endpoint chỉ để tạo một bản dữ liệu thứ hai.
      if (!Object.keys(serverParams).length) {
        if (section === 'branches') setBranches(nextRows);
        if (section === 'departments') setDepartments(nextRows);
        if (section === 'users') setStaffUsers(nextRows);
        if (section === 'roles') setRoles(nextRows);
      }
      setAppliedFilters(params);
      if (section === 'users') {
        setSelectedUserRowKeys([]);
      }
    } catch (error) {
      if (requestId === loadRowsRequestRef.current) message.error(error.response?.data?.detail || error.message);
    } finally {
      if (requestId === loadRowsRequestRef.current) setLoading(false);
    }
  }

  function openAccessTester(row = null) {
    accessForm.resetFields();
    accessForm.setFieldsValue({ user_id: row?.id, permission_code: 'customer:profile:view' });
    setAccessTester({ open: true, loading: false, result: null });
  }

  async function runAccessTest(values) {
    setAccessTester((current) => ({ ...current, loading: true, result: null }));
    try {
      const { data } = await client.post('/admin/access-check', values);
      setAccessTester((current) => ({ ...current, loading: false, result: data }));
    } catch (error) {
      setAccessTester((current) => ({ ...current, loading: false }));
      message.error(error.response?.data?.detail || error.message);
    }
  }

  function openBulkAction() {
    if (!selectedUserRowKeys.length) {
      message.warning('Hãy chọn ít nhất một người dùng');
      return;
    }
    bulkForm.resetFields();
    bulkForm.setFieldsValue({ action: 'grant_permissions', permission_codes: [], clear_overrides: true });
    setBulkActionModal({ open: true, loading: false, preview: null });
  }

  function closeBulkAction() {
    if (bulkActionModal.loading) return;
    setBulkActionModal({ open: false, loading: false, preview: null });
    bulkForm.resetFields();
  }

  function bulkPayload(values) {
    return {
      user_ids: selectedUserRowKeys,
      action: values.action,
      permission_codes: values.permission_codes || [],
      role_id: values.role_id,
      data_scope: values.data_scope,
      clear_overrides: values.clear_overrides !== false,
    };
  }

  async function previewBulkAction() {
    try {
      const values = await bulkForm.validateFields();
      setBulkActionModal((current) => ({ ...current, loading: true, preview: null }));
      const { data } = await client.post('/admin/users/bulk-action/preview', bulkPayload(values), { hideGlobalLoading: true });
      setBulkActionModal((current) => ({ ...current, loading: false, preview: data }));
    } catch (error) {
      setBulkActionModal((current) => ({ ...current, loading: false }));
      if (error?.errorFields) return;
      message.error(requestErrorMessage(error, 'Không xem trước được thao tác hàng loạt'));
    }
  }

  async function applyBulkAction() {
    try {
      const values = await bulkForm.validateFields();
      setBulkActionModal((current) => ({ ...current, loading: true }));
      const { data } = await client.post('/admin/users/bulk-action', bulkPayload(values), { hideGlobalLoading: true });
      message.success(`Đã cập nhật ${Number(data.affected_count || 0).toLocaleString('vi-VN')} người dùng · Mã lô ${data.batch_id}`);
      setBulkActionModal({ open: false, loading: false, preview: null });
      bulkForm.resetFields();
      await Promise.all([loadRows(), refreshAdminSummary(), refreshCurrentCatalog()]);
    } catch (error) {
      const serverPreview = error?.response?.data?.detail?.preview;
      setBulkActionModal((current) => ({ ...current, loading: false, preview: serverPreview || current.preview }));
      if (error?.errorFields) return;
      message.error(requestErrorMessage(error, 'Không thể áp dụng thao tác hàng loạt'));
    }
  }

  useEffect(() => {
    loadLookups();
  }, [section]);

  useEffect(() => {
    filterForm.resetFields();
    setFilterExpanded(false);
    setAppliedFilters({});
    setMatrixExpanded(false);
    setMatrixPermissionGroup('all');
    setVisibleColumns(defaultVisibleColumns[section]);
    setEditing(null);
    setModalOpen(false);
    setSelectedUserRowKeys([]);
    setBulkActionModal({ open: false, loading: false, preview: null });
    loadRows({}, true);
  }, [section]);

  function handleUserRoleChange(roleId) {
    const selectedRole = roles.find((item) => item.id === roleId);
    if (selectedRole?.default_scope) {
      form.setFieldValue('data_scope', selectedRole.default_scope);
      form.setFieldValue('is_superuser', selectedRole.role_code === 'ADMIN');
    }
  }

  useEffect(() => {
    if (section !== 'users' || !modalRoleId) return;
    setSelectedExtraPermissionCodes((current) => current.filter((code) => !inheritedPermissionCodes.has(code)));
    setSelectedDeniedPermissionCodes((current) => current.filter((code) => inheritedPermissionCodes.has(code)));
  }, [inheritedPermissionCodes, modalRoleId, section]);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setPermissionSearch('');
    setPermissionView('all');
    if (section === 'users') {
      form.setFieldsValue({ is_active: true, is_superuser: false, data_scope: 'own' });
      setSelectedExtraPermissionCodes([]);
      setSelectedDeniedPermissionCodes([]);
    } else if (section === 'roles') {
      form.setFieldsValue({
        permission_codes: [],
        default_scope: 'own',
        allowed_scopes: ['own'],
        scope_warning_level: 'warning',
      });
      setSelectedPermissionCodes([]);
    } else if (section === 'branches') {
      form.setFieldsValue({ status: 'active', branch_level: 'LEVEL_2', parent_branch_id: headOfficeOptions[0]?.value });
    } else if (section === 'departments') {
      form.setFieldsValue({ status: 'active', department_type: 'BRANCH_DEPARTMENT' });
    } else {
      form.setFieldsValue({ status: 'active' });
    }
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    form.resetFields();
    setPermissionSearch('');
    setPermissionView('all');
    if (section === 'roles') {
      const permissionCodes = row.permission_codes || [];
      form.setFieldsValue({ ...row, permission_codes: permissionCodes });
      setSelectedPermissionCodes(permissionCodes);
    } else if (section === 'users') {
      form.setFieldsValue(row);
      setSelectedExtraPermissionCodes(row.extra_permission_codes || []);
      setSelectedDeniedPermissionCodes(row.denied_permission_codes || []);
    } else {
      form.setFieldsValue(row);
    }
    setModalOpen(true);
  }

  async function submitForm(values) {
    try {
      const payload = { ...values };
      if (section === 'users') delete payload.confirm_password;
      if (section === 'users' && !payload.password) {
        delete payload.password;
      }
      if (section === 'users') {
        payload.extra_permission_codes = selectedExtraPermissionCodes;
        payload.denied_permission_codes = selectedDeniedPermissionCodes;
      }
      if (section === 'roles') {
        payload.permission_codes = selectedPermissionCodes;
      }
      if (editing && section === 'roles') {
        const previous = new Set(editing.permission_codes || []);
        const requested = new Set(selectedPermissionCodes);
        const added = [...requested].filter((code) => !previous.has(code));
        const removed = [...previous].filter((code) => !requested.has(code));
        const scopePolicyChanged = (
          editing.default_scope !== payload.default_scope
          || JSON.stringify([...(editing.allowed_scopes || [])].sort()) !== JSON.stringify([...(payload.allowed_scopes || [])].sort())
          || editing.scope_warning_level !== payload.scope_warning_level
        );
        if (added.length || removed.length || scopePolicyChanged) {
          const accepted = await new Promise((resolve) => {
            Modal.confirm({
              title: 'Xác nhận thay đổi ma trận quyền',
              icon: <ExclamationCircleOutlined />,
              width: 600,
              content: (
                <div className="admin-impact-preview">
                  <p>Thay đổi áp dụng ngay cho <b>{editing.user_count || 0} người dùng</b> thuộc nhóm <b>{editing.role_name}</b>.</p>
                  <div><Tag color="green">+{added.length} quyền</Tag><Tag color="red">-{removed.length} quyền</Tag></div>
                  {scopePolicyChanged ? <div><Tag color="purple">Thay đổi chính sách phạm vi dữ liệu</Tag></div> : null}
                  <small>Các phiên đăng nhập của người dùng bị ảnh hưởng sẽ phải xác thực lại để nhận đúng quyền mới.</small>
                </div>
              ),
              okText: 'Xác nhận cập nhật',
              cancelText: 'Kiểm tra lại',
              onOk: () => resolve(true),
              onCancel: () => resolve(false),
            });
          });
          if (!accepted) return;
        }
      }
      if (editing && section === 'users') {
        const changedLabels = [
          ['role_id', 'nhóm quyền'],
          ['branch_id', 'chi nhánh'],
          ['department_id', 'phòng ban'],
          ['data_scope', 'phạm vi dữ liệu'],
          ['is_active', 'trạng thái tài khoản'],
          ['is_superuser', 'quyền quản trị viên'],
        ].filter(([key]) => String(editing[key] ?? '') !== String(payload[key] ?? '')).map(([, label]) => label);
        const previousExtra = [...(editing.extra_permission_codes || [])].sort().join('|');
        const requestedExtra = [...selectedExtraPermissionCodes].sort().join('|');
        if (previousExtra !== requestedExtra) changedLabels.push('quyền cấp thêm');
        const previousDenied = [...(editing.denied_permission_codes || [])].sort().join('|');
        const requestedDenied = [...selectedDeniedPermissionCodes].sort().join('|');
        if (previousDenied !== requestedDenied) changedLabels.push('quyền từ chối');
        if (changedLabels.length) {
          const accepted = await new Promise((resolve) => {
            Modal.confirm({
              title: 'Xác nhận thay đổi quyền truy cập',
              icon: <ExclamationCircleOutlined />,
              width: 590,
              content: (
                <div className="admin-impact-preview">
                  <p>Đang thay đổi <b>{changedLabels.join(', ')}</b> của <b>{editing.full_name}</b>.</p>
                  <small>Phiên đăng nhập hiện tại của người dùng này sẽ hết hiệu lực để hệ thống áp dụng đúng phạm vi mới.</small>
                </div>
              ),
              okText: 'Xác nhận cập nhật',
              cancelText: 'Kiểm tra lại',
              onOk: () => resolve(true),
              onCancel: () => resolve(false),
            });
          });
          if (!accepted) return;
        }
      }
      setSaving(true);
      try {
        if (editing) {
          await client.put(`${meta.endpoint}/${editing.id}`, payload, { hideGlobalLoading: true });
          message.success(`Đã cập nhật ${meta.entityName}`);
        } else {
          await client.post(meta.endpoint, payload, { hideGlobalLoading: true });
          message.success(`Đã thêm ${meta.entityName}`);
          if (section === 'users') message.info('Người dùng sẽ phải đổi mật khẩu tạm thời ở lần đăng nhập đầu tiên.');
        }
        setModalOpen(false);
        await Promise.all([loadRows(), refreshAdminSummary(), refreshCurrentCatalog()]);
      } finally {
        setSaving(false);
      }
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    }
  }

  async function deleteRow(row) {
    try {
      const { data } = await client.delete(`${meta.endpoint}/${row.id}`, { hideGlobalLoading: true });
      message.success(data?.message || `Đã xóa ${meta.entityName}`);
      await Promise.all([loadRows(), refreshAdminSummary(), refreshCurrentCatalog()]);
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    }
  }

  function openResetPassword(row) {
    resetPasswordForm.resetFields();
    setResetPasswordTarget(row);
  }

  async function resetPassword(values) {
    if (!resetPasswordTarget) return;
    setResettingPassword(true);
    try {
      await client.post(`/admin/users/${resetPasswordTarget.id}/reset-password`, values, { hideGlobalLoading: true });
      message.success(`Đã đặt lại mật khẩu cho ${resetPasswordTarget.full_name}`);
      setResetPasswordTarget(null);
      resetPasswordForm.resetFields();
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setResettingPassword(false);
    }
  }

  async function toggleUserActive(row) {
    try {
      const { data } = await client.post(`/admin/users/${row.id}/toggle-active`, undefined, { hideGlobalLoading: true });
      message.success(data.is_active ? 'Đã mở khóa tài khoản' : 'Đã khóa tài khoản');
      setRows((current) => current.map((item) => item.id === data.id ? data : item));
      setStaffUsers((current) => current.map((item) => item.id === data.id ? data : item));
      await refreshAdminSummary();
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    }
  }

  async function importLookupExcel(file) {
    const endpoint = section === 'users' ? '/admin/import/users' : '/admin/import/branches';
    const formData = new FormData();
    formData.append('file', file);
    setUploadingLookup(true);
    try {
      const { data } = await client.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 10 * 60 * 1000,
        hideGlobalLoading: true,
      });
      message.success(`Đã import ${data.rows || 0} dòng từ Excel`);
      await Promise.all([loadRows(), refreshAdminSummary(), refreshCurrentCatalog()]);
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setUploadingLookup(false);
    }
    return Upload.LIST_IGNORE;
  }

  async function openWarningDetails(warningType, title, extraParams = {}) {
    setWarningModal({ open: true, title, rows: [], loading: true });
    try {
      const { data } = await client.get('/admin/users/warnings/details', {
        params: { warning_type: warningType, ...extraParams },
      });
      setWarningModal({ open: true, title, rows: getArrayPayload(data), loading: false });
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
      setWarningModal((state) => ({ ...state, loading: false }));
    }
  }

  async function unlockTemporaryLogin(row) {
    try {
      const { data } = await client.post(`/admin/users/${row.id}/unlock-login`, undefined, { hideGlobalLoading: true });
      message.success(`Đã mở khóa đăng nhập ngay cho ${row.full_name}`);
      setRows((current) => current.map((item) => item.id === data.id ? data : item));
      setStaffUsers((current) => current.map((item) => item.id === data.id ? data : item));
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    }
  }

  async function loadLoginSessions() {
    setSessionManager((current) => ({ ...current, loading: true }));
    try {
      const { data } = await client.get('/admin/sessions', {
        params: { active_only: true },
        hideGlobalLoading: true,
        noCache: true,
      });
      setSessionManager((current) => ({ ...current, loading: false, items: data?.items || [] }));
    } catch (error) {
      setSessionManager((current) => ({ ...current, loading: false }));
      message.error(error.response?.data?.detail || error.message);
    }
  }

  function openSessionManager() {
    setSessionManager({ open: true, loading: true, items: [] });
    loadLoginSessions();
  }

  async function revokeManagedSession(session) {
    try {
      await client.post(`/admin/sessions/${session.id}/revoke`, undefined, { hideGlobalLoading: true });
      message.success(`Đã kết thúc phiên đăng nhập của ${session.full_name || session.username}`);
      setSessionManager((current) => ({
        ...current,
        items: current.items.filter((item) => item.id !== session.id),
      }));
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    }
  }

  function editWarningUser(row) {
    setWarningModal({ open: false, title: '', rows: [], loading: false });
    openEdit(row);
  }

  const branchOptions = branches.map((item) => ({ label: `${item.branch_code} - ${item.branch_name}`, value: item.id }));
  const filterDepartmentOptions = departments
    .filter((item) => !filterBranchId || item.branch_id === filterBranchId)
    .map((item) => ({
      label: `${item.department_code} - ${item.department_name} · ${item.branch_name}`,
      value: item.id,
    }));
  const filterParentDepartmentOptions = departments
    .filter((item) => !filterBranchId || item.branch_id === filterBranchId)
    .map((item) => ({ label: `${item.department_code} - ${item.department_name}`, value: item.id }));
  const modalDepartmentOptions = departments
    .filter((item) => !modalBranchId || item.branch_id === modalBranchId)
    .map((item) => ({ label: `${item.department_code} - ${item.department_name}`, value: item.id }));
  const roleOptions = roles.map((item) => ({
    label: `${item.role_code} - ${item.role_name}`,
    value: item.id,
    disabled: item.role_code === 'ADMIN' && !canManageSuperuser,
  }));
  const managerOptions = staffUsers
    .filter((item) => !modalBranchId || item.branch_id === modalBranchId)
    .map((item) => ({ label: `${item.employee_code || item.username} - ${item.full_name}`, value: item.id }));
  const filterManagerOptions = staffUsers
    .filter((item) => !filterBranchId || item.branch_id === filterBranchId)
    .map((item) => ({ label: `${item.employee_code || item.username} - ${item.full_name}`, value: item.id }));
  const dataScopeOptions = [
    { label: 'Toàn tỉnh', value: 'province' },
    { label: 'Theo chi nhánh', value: 'branch' },
    { label: 'Theo phòng ban', value: 'department' },
    { label: 'Khách hàng được phân công', value: 'own' },
  ];
  const userDataScopeOptions = dataScopeOptions.filter((item) => (
    !modalRole?.allowed_scopes?.length || modalRole.allowed_scopes.includes(item.value)
  ));
  const branchLevelOptions = [
    { label: 'Hội sở tỉnh', value: 'HEAD_OFFICE' },
    { label: 'Chi nhánh loại II', value: 'LEVEL_2' },
  ];
  const departmentTypeOptions = [
    { label: 'Phòng nghiệp vụ Hội sở', value: 'HEAD_OFFICE_DEPARTMENT' },
    { label: 'Phòng nghiệp vụ chi nhánh', value: 'BRANCH_DEPARTMENT' },
    { label: 'Phòng giao dịch', value: 'TRANSACTION_OFFICE' },
  ];
  const headOfficeOptions = branches.filter((item) => item.branch_level === 'HEAD_OFFICE').map((item) => ({ label: `${item.branch_code} - ${item.branch_name}`, value: item.id }));
  const parentDepartmentOptions = modalDepartmentOptions.filter((item) => item.value !== editing?.id);

  const permissionGroups = useMemo(() => {
    return permissions.reduce((acc, item) => {
      acc[item.permission_group] = acc[item.permission_group] || [];
      acc[item.permission_group].push(item);
      return acc;
    }, {});
  }, [permissions]);
  const visibleRolePermissionGroups = useMemo(() => Object.entries(permissionGroups).map(([group, items]) => {
    const search = permissionSearch.trim().toLocaleLowerCase('vi');
    const visibleItems = items.filter((item) => {
      const matchesText = !search || `${item.permission_name} ${item.permission_code} ${group}`.toLocaleLowerCase('vi').includes(search);
      const selected = selectedPermissionCodes.includes(item.permission_code);
      return matchesText && (permissionView === 'all'
        || (permissionView === 'selected' && selected)
        || (permissionView === 'unselected' && !selected)
        || (permissionView === 'high' && item.risk_level === 'high'));
    });
    return [group, visibleItems];
  }).filter(([, items]) => items.length), [permissionGroups, permissionSearch, permissionView, selectedPermissionCodes]);
  const displayRows = useMemo(() => rows.filter((row) => matchesSupplementaryFilters(
    section,
    row,
    { ...appliedFilters, permissionCatalog: permissions },
  )), [rows, section, appliedFilters, permissions]);
  const activeFilterCount = Object.values(appliedFilters).filter((value) => value !== undefined && value !== null && value !== '').length;
  const permissionGroupOptions = Object.keys(permissionGroups).map((group) => ({ label: group, value: group }));
  const permissionOptions = permissions.map((item) => ({ label: `${item.permission_name} · ${item.permission_group}`, value: item.permission_code }));
  const bulkEligibleRows = displayRows.filter((item) => (
    section === 'users'
    && String(item.id) !== String(currentUser?.id)
    && !item.is_superuser
    && item.role_code !== 'ADMIN'
  ));
  const selectedBulkUsers = displayRows.filter((item) => selectedUserRowKeys.includes(item.id));
  const commonInheritedPermissionCodes = selectedBulkUsers.length
    ? selectedBulkUsers.reduce((common, item, index) => {
        const codes = new Set(item.role_permission_codes || []);
        return index === 0 ? codes : new Set([...common].filter((code) => codes.has(code)));
      }, new Set())
    : new Set();
  const selectedOverrideCodes = new Set(selectedBulkUsers.flatMap((item) => [
    ...(item.extra_permission_codes || []),
    ...(item.denied_permission_codes || []),
  ]));
  const bulkGrantPermissionOptions = permissions
    .filter((item) => item.permission_code !== 'admin')
    .map((item) => ({
      label: `${item.permission_name} · ${item.permission_group}`,
      value: item.permission_code,
      disabled: item.risk_level === 'high' && !canManageSuperuser,
    }));
  const bulkDenyPermissionOptions = permissions
    .filter((item) => item.permission_code !== 'admin' && commonInheritedPermissionCodes.has(item.permission_code))
    .map((item) => ({ label: `${item.permission_name} · ${item.permission_group}`, value: item.permission_code }));
  const bulkOverridePermissionOptions = permissions
    .filter((item) => selectedOverrideCodes.has(item.permission_code))
    .map((item) => ({ label: `${item.permission_name} · ${item.permission_group}`, value: item.permission_code }));
  const bulkRoleOptions = roleOptions.filter((item) => !roles.find((role) => role.id === item.value && role.role_code === 'ADMIN'));
  const extraPermissionOptions = Object.entries(permissionGroups).map(([group, items]) => ({
    label: group,
    options: items
      .filter((item) => !inheritedPermissionCodes.has(item.permission_code))
      .map((item) => ({
        label: item.permission_name,
        value: item.permission_code,
        title: item.permission_code,
        disabled: item.risk_level === 'high' && !canManageSuperuser,
      })),
  })).filter((group) => group.options.length);
  const deniedPermissionOptions = Object.entries(permissionGroups).map(([group, items]) => ({
    label: group,
    options: items
      .filter((item) => inheritedPermissionCodes.has(item.permission_code))
      .map((item) => ({
        label: item.permission_name,
        value: item.permission_code,
        title: item.permission_code,
      })),
  })).filter((group) => group.options.length);
  const roleOrder = ['ADMIN', 'HEAD_OFFICE_LEADER', 'BRANCH_MANAGER', 'DEPARTMENT_MANAGER', 'USER'];
  const matrixRoleSource = section === 'roles' ? displayRows : roles;
  const matrixRoles = [...matrixRoleSource].sort((left, right) => {
    const leftIndex = roleOrder.indexOf(left.role_code);
    const rightIndex = roleOrder.indexOf(right.role_code);
    return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex)
      || left.role_name.localeCompare(right.role_name, 'vi');
  });
  const matrixPermissions = permissions.filter((item) => (
    matrixPermissionGroup === 'all' || item.permission_group === matrixPermissionGroup
  ));
  const roleDiagnostics = Object.fromEntries(
    roles.map((role) => [role.id, analyzeRolePermissions(role, permissions)]),
  );
  const selectedRoleDiagnostics = analyzeRolePermissions({
    role_code: form.getFieldValue('role_code') || editing?.role_code,
    permission_codes: selectedPermissionCodes,
  }, permissions);
  const matrixWarningCount = matrixRoles.reduce((total, role) => total + (roleDiagnostics[role.id]?.total || 0), 0);
  const matrixColumns = [
    {
      title: 'Chức năng / quyền',
      key: 'permission',
      fixed: 'left',
      width: 330,
      render: (_, permission) => (
        <div className="role-matrix-permission">
          <span>
            <Text strong>{permission.permission_name}</Text>
            {permission.risk_level === 'high' ? <Tag color="red">Rủi ro cao</Tag> : null}
          </span>
          <Text type="secondary">{permission.permission_code}</Text>
          {permission.prerequisite_code ? <small>Cần: {permission.prerequisite_code}</small> : null}
        </div>
      ),
    },
    {
      title: 'Nhóm nghiệp vụ',
      dataIndex: 'permission_group',
      key: 'permission_group',
      width: 175,
      render: (value) => <Tag color="blue">{value}</Tag>,
    },
    ...matrixRoles.map((role) => ({
      title: (
        <button type="button" className="role-matrix-role-head" onClick={() => { setMatrixExpanded(false); openEdit(role); }} disabled={role.is_system && !canManageSuperuser}>
          <span>{roleShortLabel(role.role_code)}</span>
          <small>{role.user_count || 0} người · {role.permission_codes?.length || 0} quyền</small>
          {roleDiagnostics[role.id]?.total ? <Tag color="warning">{roleDiagnostics[role.id].total} cảnh báo</Tag> : null}
        </button>
      ),
      key: `role-${role.id}`,
      width: 158,
      align: 'center',
      render: (_, permission) => {
        const granted = (role.permission_codes || []).includes(permission.permission_code);
        return (
          <Tooltip title={`${role.role_name}: ${granted ? 'Được cấp' : 'Không được cấp'} · ${permission.permission_name}`}>
            <span className={`role-matrix-state ${granted ? 'is-granted' : 'is-denied'}`}>
              {granted ? <CheckOutlined /> : <CloseOutlined />}
            </span>
          </Tooltip>
        );
      },
    })),
  ];
  const renderRoleMatrixTable = (expanded = false) => (
    <Table
      rowKey="permission_code"
      columns={expanded ? matrixColumns.map((column, index) => ({ ...column, width: index === 0 ? 380 : index === 1 ? 190 : 190 })) : matrixColumns}
      dataSource={matrixPermissions}
      loading={loading}
      pagination={false}
      sticky
      size={expanded ? 'middle' : 'small'}
      className={`role-permission-matrix ${expanded ? 'is-expanded' : ''}`}
      scroll={{ x: expanded ? 570 + matrixRoles.length * 190 : 505 + matrixRoles.length * 158, y: expanded ? Math.max(360, (typeof window !== 'undefined' ? window.innerHeight : 900) - 280) : 520 }}
    />
  );
  const accessUserOptions = staffUsers.map((item) => ({
    label: `${item.employee_code || item.username} · ${item.full_name} · ${item.branch_code || 'Chưa có CN'}`,
    value: item.id,
  }));
  const accessBranchOptions = branches.map((item) => ({
    label: `${item.branch_code} · ${item.branch_name}`,
    value: item.branch_code,
  }));
  const accessDepartmentOptions = departments
    .filter((item) => !accessBranchCode || item.branch_code === accessBranchCode)
    .map((item) => ({
      label: `${item.department_code} · ${item.department_name}`,
      value: item.department_code,
    }));

  const actionColumn = {
    title: 'Thao tác',
    key: 'actions',
    width: section === 'users' ? 238 : 112,
    fixed: 'right',
    align: 'right',
    render: (_, row) => {
      const isSelf = section === 'users' && String(row.id) === String(currentUser?.id);
      const protectedUser = section === 'users' && row.is_superuser && !canManageSuperuser;
      const protectedRole = section === 'roles' && row.is_system && !canManageSuperuser;
      const disableUserSecurityAction = isSelf || protectedUser;
      const disableDelete = disableUserSecurityAction || (section === 'roles' && row.is_system);
      const userActions = section === 'users' ? (
        <>
          <Tooltip title={isSelf ? 'Đổi mật khẩu của bạn tại Thông tin cá nhân' : protectedUser ? 'Chỉ siêu quản trị viên được thao tác' : 'Đặt lại mật khẩu'}>
            <Button size="small" icon={<KeyOutlined />} disabled={disableUserSecurityAction} onClick={() => openResetPassword(row)} />
          </Tooltip>
          {isTemporaryLoginLocked(row) ? (
            <Tooltip title={`Mở khóa đăng nhập ngay, không cần chờ đến ${new Date(row.locked_until).toLocaleTimeString('vi-VN')}`}>
              <Button
                size="small"
                type="primary"
                ghost
                danger
                icon={<UnlockOutlined />}
                onClick={() => unlockTemporaryLogin(row)}
                disabled={protectedUser}
              />
            </Tooltip>
          ) : null}
          <Tooltip title={isSelf ? 'Không thể tự khóa tài khoản đang đăng nhập' : row.is_active ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}>
            <Button
              size="small"
              icon={row.is_active ? <LockOutlined /> : <UnlockOutlined />}
              onClick={() => toggleUserActive(row)}
              disabled={disableUserSecurityAction}
            />
          </Tooltip>
          {canTestAccess ? (
            <Tooltip title="Kiểm tra quyền thực tế">
              <Button size="small" icon={<SafetyCertificateOutlined />} onClick={() => openAccessTester(row)} />
            </Tooltip>
          ) : null}
        </>
      ) : null;

      return (
        <Space size={4} className="admin-row-actions">
          <Tooltip title={protectedUser || protectedRole ? 'Chỉ siêu quản trị viên được cập nhật cấu hình này' : 'Chỉnh sửa'}>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} disabled={protectedUser || protectedRole} />
          </Tooltip>
          {userActions}
          <Popconfirm
            title={`Xóa ${meta.entityName}?`}
            description="Thao tác này không thể hoàn tác nếu dữ liệu không còn ràng buộc."
            okText="Xóa"
            cancelText="Hủy"
            onConfirm={() => deleteRow(row)}
            disabled={disableDelete}
          >
            <Tooltip title={isSelf ? 'Không thể tự xóa tài khoản đang đăng nhập' : section === 'roles' && row.is_system ? 'Nhóm quyền chuẩn được hệ thống bảo vệ' : 'Xóa'}>
              <Button danger size="small" icon={<DeleteOutlined />} disabled={disableDelete} />
            </Tooltip>
          </Popconfirm>
        </Space>
      );
    },
  };

  const allColumns = useMemo(() => {
    if (section === 'branches') {
      return [
        { title: 'Mã chi nhánh', dataIndex: 'branch_code', key: 'branch_code', width: 140, render: (value) => <Tag color="red">{value}</Tag> },
        { title: 'Tên chi nhánh', dataIndex: 'branch_name', key: 'branch_name' },
        { title: 'Cấp đơn vị', dataIndex: 'branch_level', key: 'branch_level', width: 135, align: 'center', render: (value) => <Tag className="admin-unit-level-tag" color={value === 'HEAD_OFFICE' ? 'purple' : 'blue'}>{value === 'HEAD_OFFICE' ? 'Hội sở' : 'CN loại II'}</Tag> },
        { title: 'Trực thuộc', dataIndex: 'parent_branch_name', key: 'parent_branch_name', width: 220, render: (value) => value || <Text type="secondary">Đơn vị gốc</Text> },
        { title: 'Phòng ban', dataIndex: 'department_count', key: 'department_count', width: 110 },
        { title: 'Cán bộ', dataIndex: 'user_count', key: 'user_count', width: 82, align: 'right' },
        { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 130, render: activeTag },
      ];
    }
    if (section === 'departments') {
      return [
        { title: 'Chi nhánh', dataIndex: 'branch_name', key: 'branch_name', width: 230, render: (value) => ellipsisText(value) },
        { title: 'Mã phòng', dataIndex: 'department_code', key: 'department_code', width: 120, align: 'center', render: (value) => <Tag color="gold">{value}</Tag> },
        { title: 'Tên phòng ban', dataIndex: 'department_name', key: 'department_name', width: 260, render: (value) => ellipsisText(value, { strong: true }) },
        { title: 'Loại đơn vị', dataIndex: 'department_type', key: 'department_type', width: 190, render: (value) => <Tag color={value === 'TRANSACTION_OFFICE' ? 'cyan' : 'blue'}>{departmentTypeOptions.find((item) => item.value === value)?.label || value || 'Chưa phân loại'}</Tag> },
        { title: 'Đơn vị cha', dataIndex: 'parent_department_name', key: 'parent_department_name', width: 210, render: (value) => value || <Text type="secondary">Trực thuộc chi nhánh</Text> },
        { title: 'Trưởng phòng', dataIndex: 'manager_name', key: 'manager_name', width: 190, render: (value) => ellipsisText(value, { empty: 'Chưa gán' }) },
        { title: 'Cán bộ', dataIndex: 'user_count', key: 'user_count', width: 82, align: 'right', render: (value) => <Text strong>{Number(value || 0).toLocaleString('vi-VN')}</Text> },
        { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 130, align: 'center', render: activeTag },
      ];
    }
    if (section === 'users') {
      return [
        {
          title: 'Cán bộ',
          dataIndex: 'full_name',
          key: 'full_name',
          width: 198,
          fixed: 'left',
          render: (value, row) => (
            <div className="admin-person-cell">
              {ellipsisText(value, { strong: true, className: 'admin-person-name' })}
              <Text type="secondary" className="admin-person-sub">{row.username}</Text>
            </div>
          ),
        },
        { title: 'Mã NV', dataIndex: 'employee_code', key: 'employee_code', width: 125, align: 'center', render: (value) => <Tag color="red">{value || 'Thiếu'}</Tag> },
        { title: 'Liên hệ', key: 'contact', width: 230, render: (_, row) => <div className="admin-person-cell"><Text>{row.email || 'Chưa có email'}</Text><Text type="secondary" className="admin-person-sub">{row.phone || 'Chưa có số điện thoại'}</Text></div> },
        { title: 'Mã CBTD', dataIndex: 'credit_officer_code', key: 'credit_officer_code', width: 120, align: 'center', render: (value) => value ? <Tag>{value}</Tag> : <Text type="secondary">-</Text> },
        { title: 'Mã CIF quản lý', dataIndex: 'customer_cif_code', key: 'customer_cif_code', width: 155, render: (value) => value ? <Text code>{value}</Text> : <Text type="secondary">-</Text> },
        { title: 'User IPCAS', dataIndex: 'ipcas_username', key: 'ipcas_username', width: 135, align: 'center', render: (value) => value ? <Tag color="blue">{value}</Tag> : <Tag color="warning">Chưa có</Tag> },
        { title: 'Chi nhánh', dataIndex: 'branch_name', key: 'branch_name', width: 220, render: (value) => ellipsisText(value) },
        { title: 'Phòng ban', dataIndex: 'department_name', key: 'department_name', width: 220, render: (value) => value ? ellipsisText(value) : <Tag color="warning">Chưa gán</Tag> },
        { title: 'Nhóm quyền', dataIndex: 'role_code', key: 'role_code', width: 180, align: 'center', render: (value) => <Tooltip title={value}><Tag className="admin-role-tag" color={roleColor(value)}>{roleShortLabel(value) || 'Chưa gán'}</Tag></Tooltip> },
        { title: 'Ngoại lệ quyền', dataIndex: 'extra_permissions', key: 'extra_permissions', width: 280, render: (items, row) => (
          <Space orientation="vertical" size={3}>
            {items?.length ? compactPermissionList(items) : <Tag className="admin-inherited-only-tag">Không cấp thêm</Tag>}
            {row.denied_permissions?.length ? <Tooltip title={row.denied_permissions.map((item) => `${item.permission_name} (${item.permission_code})`).join('\n')}><Tag color="red">-{row.denied_permissions.length} quyền từ chối</Tag></Tooltip> : null}
          </Space>
        ) },
        { title: 'Phạm vi dữ liệu', dataIndex: 'data_scope', key: 'data_scope', width: 155, align: 'center', render: dataScopeTag },
        {
          title: 'Bảo mật',
          dataIndex: 'password_status',
          key: 'password_status',
          width: 180,
          align: 'center',
          render: (_, row) => isTemporaryLoginLocked(row)
            ? <Tooltip title={`Tạm khóa đến ${new Date(row.locked_until).toLocaleString('vi-VN')}`}><Tag color="orange">Tạm khóa đăng nhập</Tag></Tooltip>
            : row.must_change_password ? <Tag color="warning">Chờ đổi mật khẩu</Tag> : <Tag color="success">Đã thiết lập</Tag>,
        },
        { title: 'Đăng nhập gần nhất', dataIndex: 'last_login_at', key: 'last_login_at', width: 175, render: (value) => value ? new Date(value).toLocaleString('vi-VN') : <Tag>Chưa đăng nhập</Tag> },
        {
          title: 'Trạng thái',
          dataIndex: 'is_active',
          key: 'is_active',
          width: 150,
          align: 'center',
          render: (value, row) => value === false
            ? <Tag color="default">Đã khóa</Tag>
            : isTemporaryLoginLocked(row) ? <Tag color="orange">Khóa tạm 15 phút</Tag> : <Tag color="success">Hoạt động</Tag>,
        },
      ];
    }
    return [
      { title: 'Vai trò', dataIndex: 'role_code', key: 'role_code', width: 190, render: (value) => <Tooltip title={value}><Tag className="admin-role-tag" color={roleColor(value)}>{roleShortLabel(value)}</Tag></Tooltip> },
      { title: 'Tên nhóm quyền', dataIndex: 'role_name', key: 'role_name', width: 235, render: (value) => ellipsisText(value, { strong: true }) },
      { title: 'Mô tả', dataIndex: 'description', key: 'description', width: 320, render: (value) => ellipsisText(value) },
      { title: 'Phạm vi mặc định', dataIndex: 'default_scope', key: 'default_scope', width: 170, align: 'center', render: dataScopeTag },
      {
        title: 'Phạm vi được phép',
        dataIndex: 'allowed_scopes',
        key: 'allowed_scopes',
        width: 280,
        render: (values = []) => <Space size={[4, 4]} wrap>{values.map((value) => <span key={value}>{dataScopeTag(value)}</span>)}</Space>,
      },
      { title: 'Người dùng', dataIndex: 'user_count', key: 'user_count', width: 110 },
      {
        title: 'Quyền được cấp',
        dataIndex: 'permissions',
        key: 'permissions',
        width: 330,
        render: compactPermissionList,
      },
    ];
  }, [section]);

  const columns = [...allColumns.filter((column) => visibleColumns.includes(column.key)), actionColumn];
  const columnChooser = (
    <Checkbox.Group value={visibleColumns} onChange={setVisibleColumns} className="column-chooser">
      {allColumns.map((column) => (
        <Checkbox key={column.key} value={column.key}>{column.title}</Checkbox>
      ))}
    </Checkbox.Group>
  );

  function togglePermissionGroup(group, checked) {
    const groupCodes = permissionGroups[group].map((item) => item.permission_code);
    const current = new Set(selectedPermissionCodes);
    groupCodes.forEach((code) => {
      const permission = permissions.find((item) => item.permission_code === code);
      if (permission?.risk_level === 'high' && !canManageSuperuser) return;
      if (checked) current.add(code);
      else current.delete(code);
    });
    if (checked) {
      let changed = true;
      while (changed) {
        changed = false;
        permissions.forEach((item) => {
          if (current.has(item.permission_code) && item.prerequisite_code && !current.has(item.prerequisite_code)) {
            current.add(item.prerequisite_code);
            changed = true;
          }
        });
      }
    } else {
      permissions.forEach((item) => {
        if (item.prerequisite_code && !current.has(item.prerequisite_code)) current.delete(item.permission_code);
      });
    }
    const nextCodes = [...current];
    setSelectedPermissionCodes(nextCodes);
    form.setFieldsValue({ permission_codes: nextCodes });
  }

  function togglePermissionCode(code, checked) {
    const current = new Set(selectedPermissionCodes);
    const target = permissions.find((item) => item.permission_code === code);
    if (target?.risk_level === 'high' && !canManageSuperuser) {
      message.warning('Chỉ siêu quản trị viên được thay đổi quyền rủi ro cao.');
      return;
    }
    if (checked) {
      current.add(code);
      let requiredCode = target?.prerequisite_code;
      while (requiredCode) {
        current.add(requiredCode);
        requiredCode = permissions.find((item) => item.permission_code === requiredCode)?.prerequisite_code;
      }
    } else {
      current.delete(code);
      permissions.forEach((item) => {
        if (item.prerequisite_code === code) current.delete(item.permission_code);
      });
    }
    const nextCodes = [...current];
    setSelectedPermissionCodes(nextCodes);
    form.setFieldsValue({ permission_codes: nextCodes });
  }

  function updateExtraPermissions(codes) {
    const effective = new Set([...inheritedPermissionCodes, ...codes]);
    let changed = true;
    while (changed) {
      changed = false;
      permissions.forEach((item) => {
        if (effective.has(item.permission_code) && item.prerequisite_code && !effective.has(item.prerequisite_code)) {
          effective.add(item.prerequisite_code);
          changed = true;
        }
      });
    }
    const requested = [...effective].filter((code) => !inheritedPermissionCodes.has(code));
    setSelectedExtraPermissionCodes(requested);
  }

  function updateDeniedPermissions(codes) {
    setSelectedDeniedPermissionCodes([...new Set(codes)].filter((code) => inheritedPermissionCodes.has(code)));
  }

  const warningColumns = [
    {
      title: 'Cán bộ',
      key: 'user',
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{row.full_name}</Text>
          <Text type="secondary">{row.username}</Text>
        </Space>
      ),
    },
    { title: 'Mã NV', dataIndex: 'employee_code', key: 'employee_code', width: 120 },
    { title: 'User IPCAS', dataIndex: 'ipcas_username', key: 'ipcas_username', width: 130 },
    { title: 'Chi nhánh', dataIndex: 'branch_name', key: 'branch_name' },
    { title: 'Phòng ban', dataIndex: 'department_name', key: 'department_name', render: (value) => value || <Tag color="gold">Chưa gán</Tag> },
    { title: 'Nhóm quyền', dataIndex: 'role_name', key: 'role_name', render: (value) => value || <Tag color="gold">Chưa gán</Tag> },
    { title: 'Lý do cảnh báo', dataIndex: 'warning_reason', key: 'warning_reason', width: 330, render: (value) => ellipsisText(value, { empty: 'Cần rà soát cấu hình' }) },
  ];

  return (
    <Space orientation="vertical" size={14} className="page-stack">
      <section className={`admin-title-panel admin-title-${meta.theme}`}>
        <div className="admin-title-copy">
          <span className="admin-title-kicker"><SettingOutlined /> QUẢN TRỊ HỆ THỐNG <i /> {meta.tag}</span>
          <Title level={3}>{meta.title}</Title>
          <Paragraph>{meta.subtitle}</Paragraph>
        </div>
        <div className="admin-title-side"><span className="admin-title-state"><i /> Dữ liệu cấu hình trực tiếp</span><span className="admin-title-icon">{meta.icon}</span></div>
      </section>

      <Row gutter={[12, 12]} className="admin-metric-row">
        <Col xs={12} xl={6}><Card className="metric-card compact-metric is-branch"><Statistic title="Chi nhánh" value={overview.branch_count || 0} prefix={<BankOutlined />} loading={overviewLoading} /><small>Cơ cấu toàn hệ thống</small></Card></Col>
        <Col xs={12} xl={6}><Card className="metric-card compact-metric is-department"><Statistic title="Phòng ban" value={overview.department_count || 0} prefix={<ApartmentOutlined />} loading={overviewLoading} /><small>Phòng nghiệp vụ và PGD</small></Card></Col>
        <Col xs={12} xl={6}><Card className="metric-card compact-metric is-user"><Statistic title="Người dùng" value={overview.user_count || 0} prefix={<TeamOutlined />} loading={overviewLoading} /><small>Tài khoản đã khai báo</small></Card></Col>
        <Col xs={12} xl={6}><Card className="metric-card compact-metric is-role"><Statistic title="Nhóm quyền" value={overview.role_count || 0} prefix={<SafetyCertificateOutlined />} loading={overviewLoading} /><small>+{Number(overview.direct_permission_allow_count || 0).toLocaleString('vi-VN')} cấp riêng · -{Number(overview.direct_permission_deny_count || 0).toLocaleString('vi-VN')} từ chối</small></Card></Col>
      </Row>

      <Card
        title={<span className="admin-filter-title"><SearchOutlined /><span>Tra cứu {meta.entityName}</span><Tag color={activeFilterCount ? 'blue' : 'default'}>{activeFilterCount ? `${activeFilterCount} điều kiện` : 'Toàn bộ'}</Tag></span>}
        className={`admin-filter-card admin-filter-${meta.theme}`}
      >
        <Form form={filterForm} layout="vertical" onFinish={() => loadRows()} className="admin-filter-form">
          <Row gutter={[14, 0]}>
            <Col xs={24} sm={12} xl={section === 'users' ? 8 : 9}>
              <Form.Item label={section === 'users' ? 'Tên, mã nhân viên, tài khoản hoặc liên hệ' : 'Mã hoặc tên'} name="keyword">
                <Input prefix={<SearchOutlined />} placeholder={`Tìm ${meta.entityName}...`} allowClear />
              </Form.Item>
            </Col>
            {section === 'branches' && <>
              <Col xs={24} sm={12} xl={7}><Form.Item label="Cấp đơn vị" name="branch_level"><Select {...selectProps('Tất cả cấp đơn vị')} options={branchLevelOptions} /></Form.Item></Col>
              <Col xs={24} sm={12} xl={8}><Form.Item label="Trạng thái" name="status"><Select {...selectProps('Tất cả trạng thái')} options={[{ label: 'Hoạt động', value: 'active' }, { label: 'Ngừng dùng', value: 'inactive' }]} /></Form.Item></Col>
            </>}
            {(section === 'departments' || section === 'users') && <>
              <Col xs={24} sm={12} xl={section === 'users' ? 5 : 7}><Form.Item label="Chi nhánh" name="branch_id"><Select {...selectProps('Tất cả chi nhánh')} options={branchOptions} onChange={() => filterForm.setFieldsValue({ department_id: undefined, parent_department_id: undefined, manager_user_id: undefined })} /></Form.Item></Col>
              {section === 'departments'
                ? <Col xs={24} sm={12} xl={8}><Form.Item label="Loại phòng/đơn vị" name="department_type"><Select {...selectProps('Tất cả loại đơn vị')} options={departmentTypeOptions} /></Form.Item></Col>
                : <>
                  <Col xs={24} sm={12} xl={5}><Form.Item label="Phòng ban" name="department_id"><Select {...selectProps('Tất cả phòng ban')} options={filterDepartmentOptions} /></Form.Item></Col>
                  <Col xs={24} sm={12} xl={6}><Form.Item label="Nhóm quyền" name="role_id"><Select {...selectProps('Tất cả nhóm quyền')} options={roleOptions} /></Form.Item></Col>
                </>}
            </>}
            {section === 'roles' && <>
              <Col xs={24} sm={12} xl={7}><Form.Item label="Nhóm nghiệp vụ" name="permission_group"><Select {...selectProps('Tất cả nhóm')} options={permissionGroupOptions} /></Form.Item></Col>
              <Col xs={24} sm={12} xl={8}><Form.Item label="Quyền cụ thể" name="permission_code"><Select {...selectProps('Tất cả quyền')} options={permissionOptions} /></Form.Item></Col>
            </>}
          </Row>
          {filterExpanded && <div className="admin-filter-advanced">
            <div className="admin-filter-advanced-title"><SettingOutlined /> Điều kiện bổ sung theo {meta.entityName}</div>
            <Row gutter={[14, 0]}>
              {section === 'branches' && <Col xs={24} sm={12} xl={8}><Form.Item label="Trực thuộc hội sở" name="parent_branch_id"><Select {...selectProps('Tất cả')} options={headOfficeOptions} /></Form.Item></Col>}
              {section === 'departments' && <>
                <Col xs={24} sm={12} xl={6}><Form.Item label="Trưởng phòng" name="manager_user_id"><Select {...selectProps('Tất cả')} options={filterManagerOptions} /></Form.Item></Col>
                <Col xs={24} sm={12} xl={6}><Form.Item label="Đơn vị cha" name="parent_department_id"><Select {...selectProps('Tất cả')} options={filterParentDepartmentOptions} /></Form.Item></Col>
                <Col xs={24} sm={12} xl={6}><Form.Item label="Trạng thái" name="status"><Select {...selectProps('Tất cả')} options={[{ label: 'Hoạt động', value: 'active' }, { label: 'Ngừng dùng', value: 'inactive' }]} /></Form.Item></Col>
              </>}
              {section === 'users' && <>
                <Col xs={24} sm={12} xl={6}><Form.Item label="Trạng thái tài khoản" name="is_active"><Select {...selectProps('Tất cả')} options={[{ label: 'Hoạt động', value: true }, { label: 'Đã khóa', value: false }]} /></Form.Item></Col>
                <Col xs={24} sm={12} xl={6}><Form.Item label="Phạm vi dữ liệu" name="data_scope"><Select {...selectProps('Tất cả')} options={dataScopeOptions} /></Form.Item></Col>
                <Col xs={24} sm={12} xl={6}><Form.Item label="Bảo mật đăng nhập" name="password_state"><Select {...selectProps('Tất cả')} options={[{ label: 'Tạm khóa do sai mật khẩu', value: 'temporary_lock' }, { label: 'Chờ đổi mật khẩu', value: 'must_change' }, { label: 'Đã thiết lập', value: 'ready' }]} /></Form.Item></Col>
                <Col xs={24} sm={12} xl={6}><Form.Item label="Lần đăng nhập" name="login_state"><Select {...selectProps('Tất cả')} options={[{ label: 'Chưa từng đăng nhập', value: 'never' }, { label: 'Trên 90 ngày', value: 'stale' }, { label: 'Trong 90 ngày', value: 'recent' }]} /></Form.Item></Col>
                <Col xs={24} sm={12} xl={6}><Form.Item label="Quyền ngoại lệ" name="has_overrides"><Select {...selectProps('Tất cả')} options={[{ label: 'Có quyền cấp/từ chối riêng', value: true }, { label: 'Không có ngoại lệ', value: false }]} /></Form.Item></Col>
                <Col xs={24} sm={12} xl={6}><Form.Item label="Gắn mã CIF quản lý" name="cif_linked"><Select {...selectProps('Tất cả')} options={[{ label: 'Đã gắn', value: true }, { label: 'Chưa gắn', value: false }]} /></Form.Item></Col>
                <Col xs={24} sm={12} xl={6}><Form.Item label="Loại tài khoản" name="is_superuser"><Select {...selectProps('Tất cả')} options={[{ label: 'Quản trị viên', value: true }, { label: 'Người dùng thường', value: false }]} /></Form.Item></Col>
              </>}
              {section === 'roles' && <>
                <Col xs={24} sm={12} xl={6}><Form.Item label="Phạm vi mặc định" name="default_scope"><Select {...selectProps('Tất cả')} options={dataScopeOptions} /></Form.Item></Col>
                <Col xs={24} sm={12} xl={6}><Form.Item label="Loại nhóm" name="is_system"><Select {...selectProps('Tất cả')} options={[{ label: 'Nhóm chuẩn hệ thống', value: true }, { label: 'Nhóm tùy chỉnh', value: false }]} /></Form.Item></Col>
                <Col xs={24} sm={12} xl={6}><Form.Item label="Số người dùng" name="has_users"><Select {...selectProps('Tất cả')} options={[{ label: 'Đang có người dùng', value: true }, { label: 'Chưa có người dùng', value: false }]} /></Form.Item></Col>
                <Col xs={24} sm={12} xl={6}><Form.Item label="Kiểm tra cấu hình" name="warning_state"><Select {...selectProps('Tất cả')} options={[{ label: 'Có cảnh báo', value: 'warning' }, { label: 'Không có cảnh báo', value: 'clear' }]} /></Form.Item></Col>
              </>}
            </Row>
          </div>}
          <div className="admin-filter-actions">
            <Button type="link" icon={<SettingOutlined />} onClick={() => setFilterExpanded((value) => !value)}>{filterExpanded ? 'Ẩn điều kiện mở rộng' : 'Thêm điều kiện lọc'}</Button>
            <Space wrap>
              <Button icon={<ReloadOutlined />} disabled={loading} onClick={() => { filterForm.resetFields(); loadRows({}, true); }}>Đặt lại</Button>
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>Xem kết quả</Button>
            </Space>
          </div>
        </Form>
      </Card>

      {section === 'users' && (
        <Alert
          type={
            userWarnings.missing_role || userWarnings.missing_department || userWarnings.missing_branch
              || userWarnings.scope_mismatch || userWarnings.duplicate_ipcas?.length
              ? 'warning'
              : 'success'
          }
          showIcon
          icon={<WarningOutlined />}
          message="Cảnh báo cấu hình người dùng"
          description={
            <Space wrap>
              <Tag
                color={userWarnings.missing_role ? 'gold' : 'green'}
                className="clickable-tag"
                onClick={() => openWarningDetails('missing_role', 'Người dùng chưa có nhóm quyền')}
              >
                Chưa có nhóm quyền: {userWarnings.missing_role || 0}
              </Tag>
              <Tag
                color={userWarnings.missing_department ? 'gold' : 'green'}
                className="clickable-tag"
                onClick={() => openWarningDetails('missing_department', 'Người dùng chưa có phòng ban')}
              >
                Chưa có phòng ban: {userWarnings.missing_department || 0}
              </Tag>
              <Tag
                color={userWarnings.missing_branch ? 'red' : 'green'}
                className="clickable-tag"
                onClick={() => openWarningDetails('missing_branch', 'Người dùng chưa có chi nhánh')}
              >
                Chưa có chi nhánh: {userWarnings.missing_branch || 0}
              </Tag>
              <Tag
                color={userWarnings.duplicate_ipcas?.length ? 'red' : 'green'}
                className="clickable-tag"
                onClick={() => openWarningDetails('duplicate_ipcas', 'Người dùng trùng User IPCAS')}
              >
                Trùng User IPCAS: {userWarnings.duplicate_ipcas?.length || 0}
              </Tag>
              <Tag
                color={userWarnings.scope_mismatch ? 'red' : 'green'}
                className="clickable-tag"
                onClick={() => openWarningDetails('scope_mismatch', 'Người dùng có cấu hình phạm vi chưa hợp lệ')}
              >
                Phạm vi chưa hợp lệ: {userWarnings.scope_mismatch || 0}
              </Tag>
              <Tag
                color={userWarnings.direct_permission_users ? 'purple' : 'default'}
                className="clickable-tag"
                onClick={() => openWarningDetails('direct_permissions', 'Người dùng có quyền cấp thêm')}
              >
                Có quyền cấp thêm: {userWarnings.direct_permission_users || 0}
              </Tag>
              <Tag
                color={userWarnings.never_login ? 'blue' : 'green'}
                className="clickable-tag"
                onClick={() => openWarningDetails('never_login', 'Người dùng chưa từng đăng nhập')}
              >
                Chưa đăng nhập: {userWarnings.never_login || 0}
              </Tag>
              <Tag
                color={userWarnings.stale_login ? 'gold' : 'green'}
                className="clickable-tag"
                onClick={() => openWarningDetails('stale_login', 'Người dùng không đăng nhập trên 90 ngày')}
              >
                Không dùng trên 90 ngày: {userWarnings.stale_login || 0}
              </Tag>
              <Tag
                color={userWarnings.inactive_users ? 'default' : 'green'}
                className="clickable-tag"
                onClick={() => openWarningDetails('inactive_users', 'Tài khoản đang bị khóa')}
              >
                Tài khoản khóa: {userWarnings.inactive_users || 0}
              </Tag>
            </Space>
          }
        />
      )}

      <Card
        className="admin-list-card"
        title={<span className="admin-list-title"><span>{meta.icon}</span><span><b>{section === 'roles' && roleViewMode === 'matrix' ? 'Ma trận nhóm quyền' : `Danh sách ${meta.entityName}`}</b><small>{section === 'roles' && roleViewMode === 'matrix' ? `${matrixPermissions.length} quyền · ${matrixRoles.length} nhóm người dùng` : `${Number(displayRows.length || 0).toLocaleString('vi-VN')} bản ghi theo bộ lọc hiện tại`}</small></span></span>}
        extra={(
          <Space wrap className="role-admin-toolbar">
            {section === 'roles' ? (
              <Segmented
                value={roleViewMode}
                onChange={setRoleViewMode}
                options={[
                  { label: 'Ma trận', value: 'matrix', icon: <DiffOutlined /> },
                  { label: 'Danh sách', value: 'list', icon: <SafetyCertificateOutlined /> },
                ]}
              />
            ) : null}
            {section === 'roles' && roleViewMode === 'matrix' ? <>
              <Select
                value={matrixPermissionGroup}
                onChange={setMatrixPermissionGroup}
                style={{ width: 190 }}
                options={[{ label: 'Tất cả nhóm nghiệp vụ', value: 'all' }, ...permissionGroupOptions]}
              />
              <Button icon={<FullscreenOutlined />} onClick={() => setMatrixExpanded(true)}>Xem ma trận lớn</Button>
            </> : null}
            {section !== 'roles' && (
              <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={importLookupExcel}>
                <Button icon={<UploadOutlined />} loading={uploadingLookup}>
                  Import Excel
                </Button>
              </Upload>
            )}
            {section === 'users' && canTestAccess ? (
              <Button icon={<SafetyCertificateOutlined />} onClick={() => openAccessTester()}>
                Kiểm tra quyền thực tế
              </Button>
            ) : null}
            {section === 'users' ? (
              <Button icon={<DesktopOutlined />} onClick={openSessionManager}>
                Phiên đăng nhập
              </Button>
            ) : null}
            {section !== 'roles' || roleViewMode === 'list' ? (
              <Popover title="Chọn cột hiển thị" content={columnChooser} trigger="click" placement="bottomRight">
                <Button icon={<SettingOutlined />}>Cột hiển thị</Button>
              </Popover>
            ) : null}
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Thêm mới</Button>
          </Space>
        )}
      >
        {section === 'users' ? (
          <div className={`admin-bulk-selection ${selectedUserRowKeys.length ? 'is-active' : ''}`}>
            <div className="admin-bulk-selection-copy">
              <span><UserSwitchOutlined /></span>
              <div>
                <Text strong>{selectedUserRowKeys.length ? `Đã chọn ${selectedUserRowKeys.length.toLocaleString('vi-VN')} người dùng` : 'Phân quyền nhiều người dùng'}</Text>
                <Text type="secondary">Chọn từng dòng hoặc chọn toàn bộ kết quả lọc; tài khoản quản trị được bảo vệ và phải cập nhật riêng.</Text>
              </div>
            </div>
            <Space wrap>
              <Button
                onClick={() => {
                  const ids = bulkEligibleRows.slice(0, 500).map((item) => item.id);
                  setSelectedUserRowKeys(ids);
                  if (bulkEligibleRows.length > 500) message.warning('Mỗi lần xử lý tối đa 500 người dùng');
                }}
                disabled={!bulkEligibleRows.length}
              >
                Chọn tất cả kết quả ({bulkEligibleRows.length})
              </Button>
              {selectedUserRowKeys.length ? <Button onClick={() => setSelectedUserRowKeys([])}>Bỏ chọn</Button> : null}
              <Button type="primary" icon={<UserSwitchOutlined />} disabled={!selectedUserRowKeys.length} onClick={openBulkAction}>
                Thao tác hàng loạt
              </Button>
            </Space>
          </div>
        ) : null}
        {section === 'roles' && roleViewMode === 'matrix' ? (
          <div className="role-matrix-wrap">
            <div className="role-matrix-summary">
              <span><SafetyCertificateOutlined /><b>{matrixRoles.length}</b> nhóm quyền đang áp dụng cho <b>{matrixRoles.reduce((total, role) => total + Number(role.user_count || 0), 0)}</b> người dùng</span>
              <Tag color={matrixWarningCount ? 'warning' : 'success'}>
                {matrixWarningCount ? `${matrixWarningCount} cấu hình cần rà soát` : 'Ma trận hợp lệ'}
              </Tag>
            </div>
            {matrixWarningCount ? (
              <Alert
                type="warning"
                showIcon
                message="Phát hiện quyền phụ thuộc hoặc nhiệm vụ cần tách biệt"
                description="Bấm tiêu đề nhóm quyền trong ma trận để mở cấu hình và xem chi tiết cảnh báo."
              />
            ) : null}
            {renderRoleMatrixTable()}
          </div>
        ) : (
          <Table
            rowKey="id"
            rowSelection={section === 'users' ? {
              selectedRowKeys: selectedUserRowKeys,
              onChange: setSelectedUserRowKeys,
              preserveSelectedRowKeys: false,
              getCheckboxProps: (row) => ({
                disabled: String(row.id) === String(currentUser?.id) || row.is_superuser || row.role_code === 'ADMIN',
                title: String(row.id) === String(currentUser?.id)
                  ? 'Không thể chọn chính tài khoản đang đăng nhập'
                  : row.is_superuser || row.role_code === 'ADMIN'
                    ? 'Tài khoản quản trị phải được cập nhật riêng'
                    : undefined,
              }),
            } : undefined}
            columns={columns}
            dataSource={displayRows}
            loading={loading}
            size="middle"
            sticky
            bordered={false}
            tableLayout="fixed"
            className={`admin-data-table admin-data-table-${section}`}
            pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `${total.toLocaleString('vi-VN')} bản ghi` }}
            scroll={{ x: 'max-content', y: 520 }}
          />
        )}
      </Card>

      <Modal
        title={<span className="admin-access-title"><span><DiffOutlined /></span><span><b>Ma trận quyền truy cập</b><small>Xem toàn bộ nhóm quyền và chức năng trên không gian rộng</small></span></span>}
        open={section === 'roles' && matrixExpanded}
        onCancel={() => setMatrixExpanded(false)}
        footer={null}
        width="96vw"
        style={{ top: '2vh' }}
        className="admin-matrix-modal"
        destroyOnHidden
      >
        <div className="admin-matrix-modal-toolbar">
          <span><Tag color="green"><CheckOutlined /> Được cấp</Tag><Tag>Chưa cấp</Tag></span>
          <Select value={matrixPermissionGroup} onChange={setMatrixPermissionGroup} style={{ minWidth: 230 }} options={[{ label: 'Tất cả nhóm nghiệp vụ', value: 'all' }, ...permissionGroupOptions]} />
        </div>
        {renderRoleMatrixTable(true)}
      </Modal>

      <Modal
        title={(
          <span className="admin-access-title">
            <span><UserSwitchOutlined /></span>
            <span><b>Thao tác người dùng hàng loạt</b><small>{selectedUserRowKeys.length.toLocaleString('vi-VN')} tài khoản đã chọn · kiểm tra trước, áp dụng sau</small></span>
          </span>
        )}
        open={bulkActionModal.open}
        onCancel={closeBulkAction}
        width={1120}
        className="admin-bulk-modal"
        destroyOnHidden
        footer={bulkActionModal.preview ? (
          <Space>
            <Button icon={<ArrowLeftOutlined />} disabled={bulkActionModal.loading} onClick={() => setBulkActionModal((current) => ({ ...current, preview: null }))}>Điều chỉnh</Button>
            <Button onClick={closeBulkAction} disabled={bulkActionModal.loading}>Hủy</Button>
            <Button type="primary" icon={<CheckOutlined />} loading={bulkActionModal.loading} disabled={!bulkActionModal.preview.can_apply} onClick={applyBulkAction}>
              Áp dụng cho {bulkActionModal.preview.valid_count || 0} người dùng
            </Button>
          </Space>
        ) : (
          <Space>
            <Button onClick={closeBulkAction} disabled={bulkActionModal.loading}>Hủy</Button>
            <Button type="primary" icon={<EyeOutlined />} loading={bulkActionModal.loading} onClick={previewBulkAction}>Xem trước tác động</Button>
          </Space>
        )}
      >
        <div className="admin-bulk-modal-body">
          <Alert
            type="info"
            showIcon
            message="Thay đổi quyền được kiểm soát theo một mã lô"
            description="Hệ thống không sửa từng người ngay. Sau khi kiểm tra hợp lệ, toàn bộ thay đổi được ghi cùng một transaction và người bị đổi quyền sẽ phải đăng nhập lại."
          />
          <Form
            form={bulkForm}
            layout="vertical"
            requiredMark={false}
            className="admin-bulk-form"
            onValuesChange={() => setBulkActionModal((current) => ({ ...current, preview: null }))}
          >
            <Row gutter={14}>
              <Col xs={24} lg={10}>
                <Form.Item label="Thao tác cần thực hiện" name="action" rules={[{ required: true, message: 'Chọn thao tác' }]}>
                  <Select options={bulkActionOptions.map((item) => ({ label: item.label, value: item.value }))} />
                </Form.Item>
              </Col>
              {['grant_permissions', 'deny_permissions', 'remove_overrides'].includes(bulkAction) ? (
                <Col xs={24} lg={14}>
                  <Form.Item
                    label={bulkAction === 'grant_permissions' ? 'Quyền cần cấp thêm' : bulkAction === 'deny_permissions' ? 'Quyền cần từ chối' : 'Ngoại lệ cần gỡ'}
                    name="permission_codes"
                    rules={bulkAction === 'remove_overrides' ? [] : [{ required: true, type: 'array', min: 1, message: 'Chọn ít nhất một quyền' }]}
                    extra={bulkAction === 'remove_overrides' ? 'Để trống nếu muốn gỡ toàn bộ ALLOW và DENY của những người đã chọn.' : bulkAction === 'deny_permissions' ? 'Chỉ hiển thị quyền nền chung mà tất cả người đã chọn đều đang được kế thừa.' : 'Các quyền nền bắt buộc còn thiếu sẽ được hệ thống tự bổ sung.'}
                  >
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      maxTagCount="responsive"
                      placeholder={bulkAction === 'remove_overrides' ? 'Để trống để gỡ toàn bộ ngoại lệ' : 'Chọn quyền'}
                      options={bulkAction === 'grant_permissions' ? bulkGrantPermissionOptions : bulkAction === 'deny_permissions' ? bulkDenyPermissionOptions : bulkOverridePermissionOptions}
                    />
                  </Form.Item>
                </Col>
              ) : null}
              {bulkAction === 'assign_role' ? (
                <>
                  <Col xs={24} lg={9}>
                    <Form.Item label="Nhóm quyền mới" name="role_id" rules={[{ required: true, message: 'Chọn nhóm quyền mới' }]}>
                      <Select {...selectProps('Chọn nhóm quyền')} options={bulkRoleOptions} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} lg={5}>
                    <Form.Item name="clear_overrides" valuePropName="checked" label="Quyền ngoại lệ">
                      <Checkbox>Xóa ALLOW/DENY cũ</Checkbox>
                    </Form.Item>
                  </Col>
                </>
              ) : null}
              {bulkAction === 'set_scope' ? (
                <Col xs={24} lg={9}>
                  <Form.Item label="Phạm vi dữ liệu mới" name="data_scope" rules={[{ required: true, message: 'Chọn phạm vi dữ liệu' }]}>
                    <Select options={dataScopeOptions} placeholder="Chọn phạm vi" />
                  </Form.Item>
                </Col>
              ) : null}
            </Row>
            <div className="admin-bulk-action-note">
              <ThunderboltOutlined />
              <span>{bulkActionOptions.find((item) => item.value === bulkAction)?.description || 'Chọn thao tác để xem cách hệ thống xử lý.'}</span>
            </div>
          </Form>

          {bulkActionModal.preview ? (
            <div className="admin-bulk-preview">
              <div className="admin-bulk-preview-summary">
                <div className="is-selected"><small>Đã chọn</small><strong>{bulkActionModal.preview.requested_count || 0}</strong></div>
                <div className="is-valid"><small>Có thể áp dụng</small><strong>{bulkActionModal.preview.valid_count || 0}</strong></div>
                <div className={bulkActionModal.preview.invalid_count ? 'is-invalid' : 'is-clean'}><small>Không hợp lệ</small><strong>{bulkActionModal.preview.invalid_count || 0}</strong></div>
                <Tag color={bulkActionModal.preview.can_apply ? 'success' : 'error'}>{bulkActionModal.preview.can_apply ? 'SẴN SÀNG ÁP DỤNG' : 'CẦN KIỂM TRA LẠI'}</Tag>
              </div>
              {bulkActionModal.preview.global_errors?.length ? (
                <Alert type="error" showIcon message="Cấu hình chưa hợp lệ" description={bulkActionModal.preview.global_errors.join(' · ')} />
              ) : null}
              <Table
                rowKey="id"
                size="small"
                sticky
                pagination={{ pageSize: 8, showSizeChanger: false }}
                dataSource={bulkActionModal.preview.items || []}
                scroll={{ x: 1000, y: 360 }}
                rowClassName={(row) => row.valid ? 'admin-bulk-valid-row' : 'admin-bulk-invalid-row'}
                columns={[
                  { title: 'Người dùng', fixed: 'left', width: 235, render: (_, row) => <div className="admin-person-cell"><Text strong>{row.full_name}</Text><Text type="secondary" className="admin-person-sub">{row.employee_code || row.username}</Text></div> },
                  { title: 'Đơn vị', width: 190, render: (_, row) => <div className="admin-person-cell"><Text>{row.branch_code || 'Chưa có CN'}</Text><Text type="secondary" className="admin-person-sub">{row.department_name || 'Chưa có phòng'}</Text></div> },
                  { title: 'Nhóm quyền', width: 190, render: (_, row) => <Space orientation="vertical" size={2}><Tag>{row.role_code || 'Chưa gán'}</Tag>{row.proposed_role_code !== row.role_code ? <Tag color="blue">→ {row.proposed_role_code}</Tag> : null}</Space> },
                  { title: 'Phạm vi', width: 155, render: (_, row) => <Space orientation="vertical" size={2}>{dataScopeTag(row.current_scope)}{row.proposed_scope !== row.current_scope ? <span>→ {dataScopeTag(row.proposed_scope)}</span> : null}</Space> },
                  { title: 'Quyền hiệu lực', width: 135, align: 'center', render: (_, row) => <Text strong>{row.current_permission_count} → {row.proposed_permission_count}</Text> },
                  { title: 'Kết quả kiểm tra', width: 300, render: (_, row) => <Space orientation="vertical" size={3}><Tag color={row.valid ? 'success' : 'error'}>{row.valid ? 'Hợp lệ' : 'Bị chặn'}</Tag>{row.changes?.map((item) => <Text key={item}>{item}</Text>)}{row.warnings?.map((item) => <Text key={item} type="warning">{item}</Text>)}{row.errors?.map((item) => <Text key={item} type="danger">{item}</Text>)}</Space> },
                ]}
              />
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        title={<span className="admin-access-title"><span>{meta.icon}</span><span><b>{editing ? 'Cập nhật' : 'Thêm mới'} {meta.entityName}</b><small>{editing ? 'Kiểm tra thông tin hiện có trước khi lưu thay đổi' : 'Hoàn thiện thông tin bắt buộc trước khi lưu'}</small></span></span>}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText={editing ? 'Cập nhật' : 'Thêm mới'}
        cancelText="Hủy"
        width={section === 'roles' || section === 'users' ? 1020 : 760}
        className={`admin-entity-modal is-${section}`}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={submitForm}>
          {section === 'branches' && (
            <Row gutter={[16, 0]}>
              <Col span={24}><div className="admin-form-section-head"><span>01</span><div><b>Thông tin đơn vị</b><small>Mã và cấp chi nhánh quyết định cơ cấu tổ chức</small></div></div></Col>
              <Col xs={24} md={8}><Form.Item label="Mã chi nhánh" name="branch_code" rules={[{ required: true, message: 'Nhập mã chi nhánh' }]}><Input /></Form.Item></Col>
              <Col xs={24} md={16}><Form.Item label="Tên chi nhánh" name="branch_name" rules={[{ required: true, message: 'Nhập tên chi nhánh' }]}><Input /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item label="Cấp đơn vị" name="branch_level" rules={[{ required: true, message: 'Chọn cấp đơn vị' }]}><Select options={branchLevelOptions} onChange={(value) => { if (value === 'HEAD_OFFICE') form.setFieldValue('parent_branch_id', undefined); }} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item label="Trực thuộc Hội sở" name="parent_branch_id"><Select {...selectProps('Chọn Hội sở')} options={headOfficeOptions} disabled={modalBranchLevel === 'HEAD_OFFICE'} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item label="Trạng thái" name="status"><Select options={[{ label: 'Hoạt động', value: 'active' }, { label: 'Ngừng dùng', value: 'inactive' }]} /></Form.Item></Col>
            </Row>
          )}

          {section === 'departments' && (
            <Row gutter={[16, 0]}>
              <Col span={24}><div className="admin-form-section-head"><span>01</span><div><b>Đơn vị trực thuộc</b><small>Chọn chi nhánh trước, sau đó khai báo mã và tên phòng</small></div></div></Col>
              <Col span={24}>
                <Form.Item label="Chi nhánh" name="branch_id" rules={[{ required: true, message: 'Chọn chi nhánh trước' }]}>
                  <Select
                    {...selectProps('Chọn chi nhánh trước')}
                    options={branchOptions}
                    onChange={() => form.setFieldsValue({ parent_department_id: undefined, manager_user_id: undefined })}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}><Form.Item label="Mã phòng" name="department_code" rules={[{ required: true, message: 'Nhập mã phòng' }]}><Input /></Form.Item></Col>
              <Col xs={24} md={16}><Form.Item label="Tên phòng ban" name="department_name" rules={[{ required: true, message: 'Nhập tên phòng ban' }]}><Input /></Form.Item></Col>
              <Col span={24}><div className="admin-form-section-head"><span>02</span><div><b>Cơ cấu và phụ trách</b><small>Phân loại phòng, đơn vị cha và cán bộ phụ trách</small></div></div></Col>
              <Col xs={24} md={12}><Form.Item label="Loại đơn vị" name="department_type" rules={[{ required: true, message: 'Chọn loại đơn vị' }]}><Select options={departmentTypeOptions} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item label="Đơn vị cha (nếu có)" name="parent_department_id"><Select {...selectProps('Trực thuộc trực tiếp chi nhánh')} options={parentDepartmentOptions} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item label="Trưởng phòng" name="manager_user_id"><Select {...selectProps(modalBranchId ? 'Chọn trưởng phòng' : 'Chọn chi nhánh trước')} options={managerOptions} disabled={!modalBranchId} /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item label="Trạng thái" name="status"><Select options={[{ label: 'Hoạt động', value: 'active' }, { label: 'Ngừng dùng', value: 'inactive' }]} /></Form.Item></Col>
            </Row>
          )}

          {section === 'users' && (
            <Row gutter={[16, 0]} className="admin-user-form-grid">
              <Col span={24}><div className="admin-form-section-head"><span>01</span><div><b>Thông tin cán bộ</b><small>Định danh đăng nhập và thông tin đối chiếu nghiệp vụ</small></div></div></Col>
              <Col xs={24} md={9}><Form.Item label="Mã nhân viên" name="employee_code" rules={[{ required: true, message: 'Nhập mã nhân viên' }]}><Input placeholder="Mã nhân viên duy nhất" /></Form.Item></Col>
              <Col xs={24} md={15}><Form.Item label="Họ tên cán bộ" name="full_name" rules={[{ required: true, message: 'Nhập họ tên' }]}><Input placeholder="Họ và tên đầy đủ" /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item label="Tên đăng nhập" name="username" extra="Để trống khi tạo mới để dùng mã nhân viên làm tên đăng nhập."><Input placeholder="Tự lấy từ mã nhân viên nếu bỏ trống" /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item label="User IPCAS" name="ipcas_username"><Input placeholder="Tài khoản IPCAS nếu có" /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item label="Mã CBTD" name="credit_officer_code"><Input placeholder="Mã quản lý khoản vay nếu có" /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item label="Mã CIF quản lý" name="customer_cif_code" rules={[{ pattern: /^\d{13}$/, message: 'Mã CIF phải gồm đúng 13 chữ số' }]}><Input maxLength={13} placeholder="Ví dụ 2600012345678" /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item label="Email" name="email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}><Input placeholder="ten.canbo@agribank.com.vn" /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item label="Số điện thoại" name="phone"><Input placeholder="Số điện thoại liên hệ" /></Form.Item></Col>
              <Col span={24}><div className="admin-form-section-head"><span>02</span><div><b>Đơn vị và phạm vi</b><small>Chi nhánh → phòng ban → nhóm quyền → dữ liệu được xem</small></div></div></Col>
              <Col xs={24} md={12}>
                <Form.Item label="Chi nhánh" name="branch_id" rules={[{ required: true, message: 'Chọn chi nhánh' }]}>
                  <Select {...selectProps('Chọn chi nhánh')} options={branchOptions} onChange={() => form.setFieldValue('department_id', undefined)} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Phòng ban" name="department_id" rules={[{ required: true, message: 'Chọn phòng ban' }]}>
                  <Select {...selectProps(modalBranchId ? 'Chọn phòng ban' : 'Chọn chi nhánh trước')} options={modalDepartmentOptions} disabled={!modalBranchId} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}><Form.Item label="Nhóm quyền" name="role_id" rules={[{ required: true, message: 'Chọn nhóm quyền' }]}><Select {...selectProps('Chọn nhóm quyền')} options={roleOptions} onChange={handleUserRoleChange} /></Form.Item></Col>
              <Col xs={24} md={12}>
                <Tooltip title={canManageSuperuser ? 'Quản trị viên có thể chọn phạm vi khác với mặc định của nhóm quyền' : 'Chỉ quản trị viên được thay đổi phạm vi dữ liệu'}>
                  <Form.Item
                    label="Phạm vi dữ liệu"
                    name="data_scope"
                    rules={[{ required: true, message: 'Chọn phạm vi dữ liệu' }]}
                    extra={canManageSuperuser ? 'Mặc định được gợi ý theo nhóm quyền; quản trị viên có thể điều chỉnh.' : 'Phạm vi được xác định tự động theo nhóm quyền.'}
                  >
                    <Select options={userDataScopeOptions} disabled={!canManageSuperuser} />
                  </Form.Item>
                </Tooltip>
              </Col>
              <Col xs={12} md={12}><Form.Item label="Tài khoản hoạt động" name="is_active" valuePropName="checked"><Switch /></Form.Item></Col>
              <Col xs={12} md={12}>
                <Tooltip title={canManageSuperuser ? 'Quyền siêu quản trị hệ thống' : 'Chỉ siêu quản trị viên được thay đổi'}>
                  <Form.Item label="Quản trị viên" name="is_superuser" valuePropName="checked"><Switch disabled={!canManageSuperuser} /></Form.Item>
                </Tooltip>
              </Col>
              <Col span={24}><div className="admin-form-section-head"><span>03</span><div><b>Mật khẩu tạm thời</b><small>{editing ? 'Bỏ trống nếu không đổi; có thể dùng nút đặt lại mật khẩu ở bảng người dùng.' : 'Người dùng sẽ phải đổi mật khẩu ở lần đăng nhập đầu tiên.'}</small></div></div></Col>
              <Col xs={24} md={12}><Form.Item label="Mật khẩu tạm thời" name="password" rules={[{ validator: (_, value) => editing || value ? Promise.resolve() : Promise.reject(new Error('Nhập mật khẩu tạm thời')) }]}><Input.Password placeholder={editing ? 'Bỏ trống nếu không thay đổi' : 'Quản trị viên tự đặt'} autoComplete="new-password" /></Form.Item></Col>
              <Col xs={24} md={12}><Form.Item label="Xác nhận mật khẩu" name="confirm_password" dependencies={['password']} rules={[{ validator: (_, value) => { const password = form.getFieldValue('password'); if (!password && editing) return Promise.resolve(); return value === password ? Promise.resolve() : Promise.reject(new Error('Xác nhận mật khẩu không khớp')); } }]}><Input.Password placeholder="Nhập lại mật khẩu tạm thời" autoComplete="new-password" /></Form.Item></Col>
              <Col span={24}><div className="admin-form-section-head"><span>04</span><div><b>Quyền ngoại lệ</b><small>Chỉ dùng khi quyền của nhóm chưa phù hợp với cá nhân này</small></div></div></Col>
              <Col span={24}>
                <div className="admin-extra-permission-box">
                  <div className="admin-extra-permission-head">
                    <span className="admin-extra-permission-icon"><ThunderboltOutlined /></span>
                    <span><Text strong>Quyền cấp thêm riêng cho người dùng</Text><Text type="secondary">Người dùng vẫn giữ nguyên phạm vi dữ liệu theo nhóm quyền và đơn vị được giao.</Text></span>
                    <Tag color="blue">{inheritedPermissionCodes.size} quyền nền</Tag>
                    <Tag color={selectedExtraPermissionCodes.length ? 'purple' : 'default'}>+{selectedExtraPermissionCodes.length} quyền thêm</Tag>
                  </div>
                  <Select
                    mode="multiple"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    value={selectedExtraPermissionCodes}
                    options={extraPermissionOptions}
                    placeholder={modalRoleId ? 'Chọn các quyền ngoài nhóm quyền nền' : 'Chọn nhóm quyền trước'}
                    disabled={!modalRoleId}
                    maxTagCount="responsive"
                    onChange={updateExtraPermissions}
                  />
                  <div className="admin-extra-permission-head" style={{ marginTop: 14 }}>
                    <span className="admin-extra-permission-icon"><StopOutlined /></span>
                    <span><Text strong>Quyền từ chối riêng</Text><Text type="secondary">Dùng để chặn một quyền đang thừa hưởng từ nhóm. Từ chối luôn được ưu tiên hơn cho phép.</Text></span>
                    <Tag color={selectedDeniedPermissionCodes.length ? 'red' : 'default'}>-{selectedDeniedPermissionCodes.length} quyền</Tag>
                  </div>
                  <Select
                    mode="multiple"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    value={selectedDeniedPermissionCodes}
                    options={deniedPermissionOptions}
                    placeholder={modalRoleId ? 'Chọn quyền thừa hưởng cần chặn' : 'Chọn nhóm quyền trước'}
                    disabled={!modalRoleId}
                    maxTagCount="responsive"
                    status={selectedDeniedPermissionCodes.length ? 'warning' : undefined}
                    onChange={updateDeniedPermissions}
                  />
                  {modalRoleId ? <div className="admin-effective-permission-summary"><SafetyCertificateOutlined /><span>Quyền thực tế sau khi lưu: <b>{Math.max(0, inheritedPermissionCodes.size + selectedExtraPermissionCodes.length - selectedDeniedPermissionCodes.length)}</b> quyền</span><small>ALLOW + quyền nhóm - DENY · phạm vi vẫn là {dataScopeTag(form.getFieldValue('data_scope'))}</small></div> : null}
                </div>
              </Col>
            </Row>
          )}

          {section === 'roles' && (
            <Row gutter={[16, 0]} className="admin-role-form-grid">
              <Form.Item name="permission_codes" noStyle preserve>
                <Checkbox.Group className="hidden-permission-field" />
              </Form.Item>
              <Col span={24}><div className="admin-form-section-head"><span>01</span><div><b>Nhận diện nhóm quyền</b><small>Đặt tên rõ theo đối tượng sử dụng; mã nhóm là khóa cấu hình</small></div></div></Col>
              <Col xs={24} md={8}><Form.Item label="Mã nhóm quyền" name="role_code" rules={[{ required: true, message: 'Nhập mã nhóm quyền' }]}><Input disabled={editing?.is_system} placeholder="Ví dụ BRANCH_MANAGER" /></Form.Item></Col>
              <Col xs={24} md={16}><Form.Item label="Tên nhóm quyền" name="role_name" rules={[{ required: true, message: 'Nhập tên nhóm quyền' }]}><Input placeholder="Tên dễ hiểu cho quản trị viên" /></Form.Item></Col>
              <Col span={24}><Form.Item label="Mô tả phạm vi công việc" name="description"><Input.TextArea rows={2} placeholder="Nhóm này dành cho ai, thực hiện các nghiệp vụ gì?" /></Form.Item></Col>
              <Col span={24}><div className="admin-form-section-head"><span>02</span><div><b>Chính sách phạm vi dữ liệu</b><small>Giới hạn dữ liệu trước khi chọn quyền thao tác</small></div></div></Col>
              <Col span={24}>
                <div className="admin-extra-permission-box">
                  <div className="admin-extra-permission-head">
                    <span className="admin-extra-permission-icon"><SafetyCertificateOutlined /></span>
                    <span><Text strong>Chính sách phạm vi dữ liệu</Text><Text type="secondary">Được lưu trong DB và áp dụng thống nhất khi tạo người dùng, kiểm tra quyền và cảnh báo cấu hình.</Text></span>
                  </div>
                  <Row gutter={12}>
                    <Col xs={24} md={8}>
                      <Form.Item label="Phạm vi mặc định" name="default_scope" rules={[{ required: true, message: 'Chọn phạm vi mặc định' }]}>
                        <Select options={dataScopeOptions} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={10}>
                      <Form.Item label="Phạm vi được phép" name="allowed_scopes" rules={[{ required: true, message: 'Chọn ít nhất một phạm vi' }]}>
                        <Select mode="multiple" options={dataScopeOptions} maxTagCount="responsive" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={6}>
                      <Form.Item label="Mức cảnh báo" name="scope_warning_level" rules={[{ required: true }]}>
                        <Select options={[
                          { label: 'Thông tin', value: 'info' },
                          { label: 'Cảnh báo', value: 'warning' },
                          { label: 'Nghiêm trọng', value: 'critical' },
                        ]} />
                      </Form.Item>
                    </Col>
                  </Row>
                </div>
              </Col>
              <Col span={24}><div className="admin-form-section-head"><span>03</span><div><b>Quyền thao tác theo nghiệp vụ</b><small>Đã chọn {selectedPermissionCodes.length}/{permissions.length} quyền · quyền rủi ro cao chỉ dành cho người được phép cấu hình</small></div></div></Col>
              <Col span={24}>
                {selectedRoleDiagnostics.total ? (
                  <Alert
                    className="role-diagnostic-alert"
                    type="warning"
                    showIcon
                    message={`${selectedRoleDiagnostics.total} điểm cần rà soát trước khi lưu`}
                    description={(
                      <Space orientation="vertical" size={2}>
                        {selectedRoleDiagnostics.missingPrerequisites.map((item) => <span key={item}>• {item}</span>)}
                        {selectedRoleDiagnostics.dutyConflicts.map((item) => <span key={item}>• Cần tách nhiệm vụ: {item}</span>)}
                      </Space>
                    )}
                  />
                ) : (
                  <Alert className="role-diagnostic-alert" type="success" showIcon message="Cấu hình quyền hợp lệ, không thiếu quyền nền bắt buộc" />
                )}
              </Col>
              <Col span={24}>
                <Form.Item label="Danh sách quyền" className="admin-role-permission-field">
                  <div className="admin-permission-filterbar">
                    <Input prefix={<SearchOutlined />} allowClear value={permissionSearch} onChange={(event) => setPermissionSearch(event.target.value)} placeholder="Tìm theo tên hoặc mã quyền" />
                    <Segmented value={permissionView} onChange={setPermissionView} options={[{ label: 'Tất cả', value: 'all' }, { label: 'Đã cấp', value: 'selected' }, { label: 'Chưa cấp', value: 'unselected' }, { label: 'Rủi ro cao', value: 'high' }]} />
                  </div>
                  {visibleRolePermissionGroups.length === 0 && <Alert type="info" showIcon message="Không tìm thấy quyền phù hợp" description="Đổi từ khóa hoặc chọn chế độ hiển thị khác." />}
                  <Collapse key={`${permissionSearch}:${permissionView}`} className="permission-groups" defaultActiveKey={permissionSearch || permissionView !== 'all' ? visibleRolePermissionGroups.map(([group]) => group) : Object.keys(permissionGroups).slice(0, 1)}>
                    {visibleRolePermissionGroups.map(([group, items]) => {
                      const codes = permissionGroups[group].map((item) => item.permission_code);
                      const checkedCount = codes.filter((code) => selectedPermissionCodes.includes(code)).length;
                      return (
                        <Panel
                          key={group}
                          header={
                            <Space>
                              <Text strong>{group}</Text>
                              <Tag color={checkedCount ? 'blue' : 'default'}>{checkedCount}/{codes.length}</Tag>
                            </Space>
                          }
                        >
                          <div className="permission-group-card">
                          <Checkbox
                            checked={checkedCount === codes.length}
                            indeterminate={checkedCount > 0 && checkedCount < codes.length}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => togglePermissionGroup(group, event.target.checked)}
                          >
                            <Text strong>Chọn toàn bộ nhóm {group}{items.length !== codes.length ? ' (kể cả quyền đang ẩn bởi bộ lọc)' : ''}</Text>
                          </Checkbox>
                          <div className="permission-child-grid">
                            {items.map((item) => (
                              <Checkbox
                                key={item.permission_code}
                                checked={selectedPermissionCodes.includes(item.permission_code)}
                                disabled={item.risk_level === 'high' && !canManageSuperuser}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => togglePermissionCode(item.permission_code, event.target.checked)}
                              >
                                <Space orientation="vertical" size={0}>
                                  <span><Text>{item.permission_name}</Text>{item.risk_level === 'high' ? <Tag color="red">Rủi ro cao</Tag> : null}</span>
                                  <Text type="secondary">{item.permission_code}</Text>
                                  {item.prerequisite_code ? <Text type="secondary">Cần quyền: {item.prerequisite_code}</Text> : null}
                                </Space>
                              </Checkbox>
                            ))}
                          </div>
                          </div>
                        </Panel>
                      );
                    })}
                  </Collapse>
                </Form.Item>
              </Col>
            </Row>
          )}
        </Form>
      </Modal>

      <Modal
        title={(
          <span className="admin-access-title">
            <span><KeyOutlined /></span>
            <span><b>Đặt lại mật khẩu</b><small>{resetPasswordTarget?.full_name} · {resetPasswordTarget?.employee_code}</small></span>
          </span>
        )}
        open={Boolean(resetPasswordTarget)}
        onCancel={() => { setResetPasswordTarget(null); resetPasswordForm.resetFields(); }}
        onOk={() => resetPasswordForm.submit()}
        okText="Xác nhận đặt lại"
        cancelText="Hủy"
        confirmLoading={resettingPassword}
        width={520}
        destroyOnHidden
      >
        <Alert
          type="warning"
          showIcon
          message="Đây là mật khẩu tạm thời"
          description="Có thể đặt mật khẩu đơn giản theo quy trình nội bộ. Toàn bộ phiên cũ sẽ hết hiệu lực và người dùng bắt buộc đổi sang mật khẩu an toàn khi đăng nhập."
        />
        <Form form={resetPasswordForm} layout="vertical" onFinish={resetPassword} requiredMark={false} style={{ marginTop: 18 }}>
          <Form.Item label="Mật khẩu tạm thời mới" name="password" rules={[{ required: true, message: 'Nhập mật khẩu tạm thời' }, { max: 128, message: 'Mật khẩu không vượt quá 128 ký tự' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Ví dụ: 1, 123456 hoặc mã quy ước" autoComplete="new-password" autoFocus />
          </Form.Item>
          <Form.Item label="Xác nhận mật khẩu" name="confirm_password" dependencies={['password']} rules={[
            { required: true, message: 'Nhập lại mật khẩu tạm thời' },
            ({ getFieldValue }) => ({ validator: (_, value) => value === getFieldValue('password') ? Promise.resolve() : Promise.reject(new Error('Xác nhận mật khẩu không khớp')) }),
          ]}>
            <Input.Password prefix={<KeyOutlined />} placeholder="Nhập lại mật khẩu tạm thời" autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={(
          <span className="admin-access-title">
            <span><DesktopOutlined /></span>
            <span><b>Phiên đăng nhập đang hoạt động</b><small>Theo dõi và kết thúc phiên người dùng ngay khi cần</small></span>
          </span>
        )}
        open={sessionManager.open}
        onCancel={() => setSessionManager({ open: false, loading: false, items: [] })}
        footer={(
          <Space>
            <Button icon={<ReloadOutlined />} loading={sessionManager.loading} onClick={loadLoginSessions}>Làm mới</Button>
            <Button type="primary" onClick={() => setSessionManager({ open: false, loading: false, items: [] })}>Đóng</Button>
          </Space>
        )}
        width={1080}
        className="admin-session-modal"
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          message={`${sessionManager.items.length.toLocaleString('vi-VN')} phiên còn hiệu lực`}
          description="Tài khoản thường chỉ có một phiên. Quản trị viên có thể đăng nhập nhiều thiết bị; thao tác kết thúc phiên được ghi vào nhật ký hệ thống."
        />
        <Table
          rowKey="id"
          className="admin-session-table"
          loading={sessionManager.loading}
          dataSource={sessionManager.items}
          size="small"
          sticky
          pagination={{ pageSize: 8, showSizeChanger: false }}
          scroll={{ x: 1020, y: 430 }}
          columns={[
            {
              title: 'Người dùng',
              key: 'user',
              fixed: 'left',
              width: 220,
              render: (_, row) => (
                <div className="admin-person-cell">
                  <Text strong>{row.full_name || row.username}</Text>
                  <Text type="secondary" className="admin-person-sub">{row.username} · {roleShortLabel(row.role_code)}</Text>
                </div>
              ),
            },
            { title: 'Địa chỉ IP', dataIndex: 'ip_address', key: 'ip_address', width: 145, render: (value) => <Text code>{value || 'Không xác định'}</Text> },
            {
              title: 'Thiết bị / trình duyệt',
              key: 'device',
              width: 250,
              render: (_, row) => (
                <Tooltip title={row.user_agent || 'Không có thông tin trình duyệt'}>
                  <div className="admin-person-cell">
                    <Text ellipsis>{row.user_agent || 'Không xác định'}</Text>
                    <Text type="secondary" className="admin-person-sub">Mã thiết bị: {row.device_id ? `${row.device_id.slice(0, 12)}…` : 'Không có'}</Text>
                  </div>
                </Tooltip>
              ),
            },
            { title: 'Đăng nhập lúc', dataIndex: 'logged_in_at', key: 'logged_in_at', width: 165, render: (value) => value ? new Date(value).toLocaleString('vi-VN') : '-' },
            { title: 'Hoạt động gần nhất', dataIndex: 'last_activity_at', key: 'last_activity_at', width: 175, render: (value) => value ? new Date(value).toLocaleString('vi-VN') : '-' },
            {
              title: 'Thao tác',
              key: 'action',
              fixed: 'right',
              width: 115,
              align: 'center',
              render: (_, row) => (
                <Popconfirm
                  title="Kết thúc phiên đăng nhập?"
                  description="Người dùng sẽ được yêu cầu đăng nhập lại ở thao tác tiếp theo."
                  okText="Kết thúc"
                  cancelText="Hủy"
                  onConfirm={() => revokeManagedSession(row)}
                  disabled={String(row.user_id) === String(currentUser?.id)}
                >
                  <Tooltip title={String(row.user_id) === String(currentUser?.id) ? 'Không kết thúc phiên của chính bạn tại đây' : 'Kết thúc phiên'}>
                    <Button danger size="small" icon={<StopOutlined />} disabled={String(row.user_id) === String(currentUser?.id)}>Kết thúc</Button>
                  </Tooltip>
                </Popconfirm>
              ),
            },
          ]}
        />
      </Modal>

      <Modal
        title={warningModal.title}
        open={warningModal.open}
        onCancel={() => setWarningModal({ open: false, title: '', rows: [], loading: false })}
        footer={null}
        width={980}
      >
        <div className="admin-warning-modal-hint">
          <EditOutlined /> Bấm vào một dòng để mở ngay hồ sơ và cập nhật cấu hình người dùng.
        </div>
        <Table
          rowKey="id"
          columns={warningColumns}
          dataSource={warningModal.rows}
          loading={warningModal.loading}
          pagination={{ pageSize: 8 }}
          size="small"
          scroll={{ x: 1180 }}
          rowClassName="admin-warning-clickable-row"
          onRow={(row) => ({ onClick: () => editWarningUser(row) })}
        />
      </Modal>

      <Modal
        title={(
          <span className="admin-access-title">
            <span><SafetyCertificateOutlined /></span>
            <span>
              <b>Kiểm tra quyền truy cập thực tế</b>
              <small>Đối chiếu đồng thời quyền chức năng và phạm vi dữ liệu</small>
            </span>
          </span>
        )}
        open={accessTester.open}
        onCancel={() => setAccessTester({ open: false, loading: false, result: null })}
        footer={null}
        width={860}
        className="admin-access-modal"
        destroyOnHidden
      >
        <div className="admin-access-intro">
          Công cụ chỉ mô phỏng quyền đọc, không thay đổi dữ liệu. Có thể kiểm tra ở cấp chức năng,
          đơn vị hoặc chính xác một khách hàng trong một kỳ.
        </div>
        <Form form={accessForm} layout="vertical" onFinish={runAccessTest} className="admin-access-form">
          <Row gutter={[12, 4]}>
            <Col xs={24} md={12}>
              <Form.Item label="Người dùng cần kiểm tra" name="user_id" rules={[{ required: true, message: 'Chọn người dùng' }]}>
                <Select {...selectProps('Chọn người dùng')} options={accessUserOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Quyền chức năng" name="permission_code" rules={[{ required: true, message: 'Chọn quyền chức năng' }]}>
                <Select {...selectProps('Chọn quyền')} options={permissionOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Chi nhánh cần truy cập" name="branch_code">
                <Select
                  {...selectProps('Không chọn = không giới hạn theo CN')}
                  options={accessBranchOptions}
                  onChange={() => accessForm.setFieldValue('department_code', undefined)}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Phòng ban cần truy cập" name="department_code">
                <Select {...selectProps('Không chọn = không giới hạn theo phòng')} options={accessDepartmentOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Kỳ dữ liệu (nếu kiểm tra KH)" name="period_key">
                <Input placeholder="Ví dụ: 072026" maxLength={6} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Mã khách hàng lõi (tùy chọn)" name="customer_code">
                <Input placeholder="Nhập mã KH lõi" />
              </Form.Item>
            </Col>
          </Row>
          <div className="admin-access-actions">
            <Text type="secondary">Kết quả dựa trên cấu hình hiện tại trong hệ thống.</Text>
            <Button type="primary" htmlType="submit" loading={accessTester.loading} icon={<SafetyCertificateOutlined />}>
              Kiểm tra quyền
            </Button>
          </div>
        </Form>

        {accessTester.result && (
          <section className={`admin-access-result ${accessTester.result.allowed ? 'is-allowed' : 'is-denied'}`}>
            <div className="admin-access-result-head">
              <span className="admin-access-verdict">{accessTester.result.allowed ? 'ĐƯỢC PHÉP TRUY CẬP' : 'TỪ CHỐI TRUY CẬP'}</span>
              <Space wrap>
                <Tag color={accessTester.result.permission_source === 'direct' ? 'purple' : 'blue'}>
                  Nguồn quyền: {{ role: 'Nhóm quyền', direct: 'Cấp thêm riêng', denied: 'Bị từ chối riêng', superuser: 'Quản trị viên', missing: 'Chưa được cấp' }[accessTester.result.permission_source] || accessTester.result.permission_source}
                </Tag>
                {dataScopeTag(accessTester.result.scope)}
              </Space>
            </div>
            <div className="admin-access-subject">
              <b>{accessTester.result.user?.full_name}</b>
              <span>{accessTester.result.user?.employee_code}</span>
              <span>{accessTester.result.user?.branch_code || 'Chưa có CN'} / {accessTester.result.user?.department_code || 'Chưa có phòng'}</span>
              <span>{accessTester.result.permission?.permission_name}</span>
            </div>
            <div className="admin-access-reasons">
              {(accessTester.result.reasons || []).map((reason, index) => (
                <div key={`${index}-${reason}`}>
                  <i>{index + 1}</i>
                  <span>{reason}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </Modal>
    </Space>
  );
}

export default SystemAdmin;

