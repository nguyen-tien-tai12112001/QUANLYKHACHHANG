import { useEffect, useMemo, useState } from 'react';
import {
  ApartmentOutlined,
  BankOutlined,
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  DiffOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  KeyOutlined,
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SettingOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UnlockOutlined,
  UploadOutlined,
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

function SystemAdmin({ section = 'branches' }) {
  const meta = sectionMeta[section] || sectionMeta.branches;
  const { user: currentUser } = useAuth();
  const [form] = Form.useForm();
  const [filterForm] = Form.useForm();
  const [accessForm] = Form.useForm();
  const [resetPasswordForm] = Form.useForm();
  const modalBranchId = Form.useWatch('branch_id', form);
  const modalBranchLevel = Form.useWatch('branch_level', form);
  const modalRoleId = Form.useWatch('role_id', form);
  const filterBranchId = Form.useWatch('branch_id', filterForm);
  const accessBranchCode = Form.useWatch('branch_code', accessForm);

  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [userWarnings, setUserWarnings] = useState({ missing_role: 0, missing_department: 0, duplicate_ipcas: [] });
  const [warningModal, setWarningModal] = useState({ open: false, title: '', rows: [], loading: false });
  const [accessTester, setAccessTester] = useState({ open: false, loading: false, result: null });
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
  const [roleViewMode, setRoleViewMode] = useState('matrix');
  const [matrixPermissionGroup, setMatrixPermissionGroup] = useState('all');
  const [visibleColumns, setVisibleColumns] = useState(defaultVisibleColumns[section]);
  const canTestAccess = (currentUser?.permissions || []).some((code) => code === 'admin' || code === 'admin:access_test');
  const canManageSuperuser = (currentUser?.permissions || []).includes('admin');
  const modalRole = useMemo(() => roles.find((item) => item.id === modalRoleId), [modalRoleId, roles]);
  const inheritedPermissionCodes = useMemo(() => new Set(modalRole?.permission_codes || []), [modalRole]);

  async function loadLookups() {
    setOverviewLoading(true);
    try {
      const results = await Promise.allSettled([
        client.get('/admin/overview', { hideGlobalLoading: true }),
        client.get('/admin/branches', { hideGlobalLoading: true }),
        client.get('/admin/departments', { hideGlobalLoading: true }),
        client.get('/admin/roles', { hideGlobalLoading: true }),
        client.get('/admin/permissions', { hideGlobalLoading: true }),
        client.get('/admin/users', { hideGlobalLoading: true }),
        client.get('/admin/users/warnings', { hideGlobalLoading: true }),
      ]);
      const value = (index) => results[index].status === 'fulfilled' ? results[index].value.data : null;
      if (value(0)) setOverview(value(0));
      if (value(1)) setBranches(getArrayPayload(value(1)));
      if (value(2)) setDepartments(getArrayPayload(value(2)));
      if (value(3)) setRoles(getArrayPayload(value(3)));
      if (value(4)) setPermissions(getArrayPayload(value(4)));
      if (value(5)) setStaffUsers(getArrayPayload(value(5)));
      if (value(6)) setUserWarnings(value(6));
    } finally {
      setOverviewLoading(false);
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

  async function loadRows(extraParams = {}) {
    setLoading(true);
    try {
      const params = { ...filterForm.getFieldsValue(), ...extraParams };
      Object.keys(params).forEach((key) => {
        if (params[key] === undefined || params[key] === null || params[key] === '') {
          delete params[key];
        }
      });
      const { data } = await client.get(meta.endpoint, { params, hideGlobalLoading: true, noCache: true });
      const nextRows = getArrayPayload(data);
      setRows(nextRows);
      if (section === 'branches') setBranches(nextRows);
      if (section === 'departments') setDepartments(nextRows);
      if (section === 'roles') setRoles(nextRows);
      if (section === 'users') setStaffUsers(nextRows);
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setLoading(false);
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

  useEffect(() => {
    loadLookups();
  }, []);

  useEffect(() => {
    filterForm.resetFields();
    setVisibleColumns(defaultVisibleColumns[section]);
    setEditing(null);
    setModalOpen(false);
    loadRows({});
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
  }, [inheritedPermissionCodes, modalRoleId, section]);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    if (section === 'users') {
      form.setFieldsValue({ is_active: true, is_superuser: false, data_scope: 'own' });
      setSelectedExtraPermissionCodes([]);
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
    if (section === 'roles') {
      const permissionCodes = row.permission_codes || [];
      form.setFieldsValue({ ...row, permission_codes: permissionCodes });
      setSelectedPermissionCodes(permissionCodes);
    } else if (section === 'users') {
      form.setFieldsValue(row);
      setSelectedExtraPermissionCodes(row.extra_permission_codes || []);
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
        await Promise.all([loadRows(), refreshAdminSummary()]);
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
      await Promise.all([loadRows(), refreshAdminSummary()]);
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
      await Promise.all([loadRows(), refreshAdminSummary()]);
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
  const permissionGroupOptions = Object.keys(permissionGroups).map((group) => ({ label: group, value: group }));
  const permissionOptions = permissions.map((item) => ({ label: `${item.permission_name} · ${item.permission_group}`, value: item.permission_code }));
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
  const roleOrder = ['ADMIN', 'HEAD_OFFICE_LEADER', 'BRANCH_MANAGER', 'DEPARTMENT_MANAGER', 'USER'];
  const matrixRoleSource = section === 'roles' && rows.every((item) => Array.isArray(item.permission_codes)) ? rows : roles;
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
        <button type="button" className="role-matrix-role-head" onClick={() => openEdit(role)} disabled={role.is_system && !canManageSuperuser}>
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
    width: section === 'users' ? 250 : 116,
    fixed: 'right',
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
        <Space>
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
        { title: 'Cán bộ', dataIndex: 'user_count', key: 'user_count', width: 100 },
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
        { title: 'Cán bộ', dataIndex: 'user_count', key: 'user_count', width: 100, align: 'right', render: (value) => <Text strong>{Number(value || 0).toLocaleString('vi-VN')}</Text> },
        { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 130, align: 'center', render: activeTag },
      ];
    }
    if (section === 'users') {
      return [
        {
          title: 'Cán bộ',
          dataIndex: 'full_name',
          key: 'full_name',
          width: 260,
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
        { title: 'Quyền cấp thêm', dataIndex: 'extra_permissions', key: 'extra_permissions', width: 240, render: (items) => items?.length ? compactPermissionList(items) : <Tag className="admin-inherited-only-tag">Theo nhóm quyền</Tag> },
        { title: 'Phạm vi dữ liệu', dataIndex: 'data_scope', key: 'data_scope', width: 155, align: 'center', render: dataScopeTag },
        { title: 'Bảo mật', dataIndex: 'password_status', key: 'password_status', width: 150, align: 'center', render: (_, row) => row.must_change_password ? <Tag color="warning">Chờ đổi mật khẩu</Tag> : <Tag color="success">Đã thiết lập</Tag> },
        { title: 'Đăng nhập gần nhất', dataIndex: 'last_login_at', key: 'last_login_at', width: 175, render: (value) => value ? new Date(value).toLocaleString('vi-VN') : <Tag>Chưa đăng nhập</Tag> },
        { title: 'Trạng thái', dataIndex: 'is_active', key: 'is_active', width: 125, align: 'center', render: activeTag },
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
        <Col xs={12} xl={6}><Card className="metric-card compact-metric is-role"><Statistic title="Nhóm quyền" value={overview.role_count || 0} prefix={<SafetyCertificateOutlined />} loading={overviewLoading} /><small>{Number(overview.direct_permission_grant_count || 0).toLocaleString('vi-VN')} quyền đang cấp riêng</small></Card></Col>
      </Row>

      <Card title={`Bộ lọc ${meta.entityName}`} className={`admin-filter-card admin-filter-${meta.theme}`}>
        <Form form={filterForm} layout="vertical" onFinish={() => loadRows()}>
          <Row gutter={[12, 12]} align="bottom">
            <Col xs={24} md={section === 'users' ? 6 : 7}>
              <Form.Item label="Từ khóa" name="keyword">
                <Input placeholder="Tất cả mã, tên, tài khoản..." allowClear />
              </Form.Item>
            </Col>
            {(section === 'departments' || section === 'users') && (
                <Col xs={24} md={5}>
                  <Form.Item label="Chi nhánh" name="branch_id">
                    <Select
                      {...selectProps('Tất cả chi nhánh')}
                      options={branchOptions}
                      onChange={() => filterForm.setFieldValue('department_id', undefined)}
                    />
                  </Form.Item>
                </Col>
            )}
            {section === 'departments' && (
              <>
                <Col xs={24} md={5}>
                  <Form.Item label="Trưởng phòng" name="manager_user_id">
                    <Select {...selectProps('Tất cả trưởng phòng')} options={filterManagerOptions} />
                  </Form.Item>
                </Col>
              </>
            )}
            {section === 'users' && (
              <>
                <Col xs={24} md={5}>
                  <Form.Item label="Phòng ban" name="department_id">
                    <Select
                      {...selectProps(filterBranchId ? 'Tất cả phòng ban thuộc chi nhánh' : 'Chọn chi nhánh trước hoặc xem tất cả phòng ban')}
                      options={filterDepartmentOptions}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={4}>
                  <Form.Item label="Nhóm quyền" name="role_id">
                    <Select {...selectProps('Tất cả nhóm quyền')} options={roleOptions} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={4}>
                  <Form.Item label="Phạm vi dữ liệu" name="data_scope">
                    <Select {...selectProps('Tất cả phạm vi')} options={dataScopeOptions} />
                  </Form.Item>
                </Col>
              </>
            )}
            {section === 'roles' && (
              <>
                <Col xs={24} md={5}>
                  <Form.Item label="Nhóm menu" name="permission_group">
                    <Select {...selectProps('Tất cả nhóm menu')} options={permissionGroupOptions} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={6}>
                  <Form.Item label="Quyền chi tiết" name="permission_code">
                    <Select {...selectProps('Tất cả quyền')} options={permissionOptions} />
                  </Form.Item>
                </Col>
              </>
            )}
            {section !== 'roles' && (
              <Col xs={24} md={4}>
                <Form.Item label="Trạng thái" name={section === 'users' ? 'is_active' : 'status'}>
                  <Select
                    placeholder="Tất cả trạng thái"
                    allowClear
                    options={section === 'users'
                      ? [{ label: 'Hoạt động', value: true }, { label: 'Khóa', value: false }]
                      : [{ label: 'Hoạt động', value: 'active' }, { label: 'Ngừng dùng', value: 'inactive' }]}
                  />
                </Form.Item>
              </Col>
            )}
            <Col xs={24} md={section === 'roles' ? 6 : 4}>
              <Form.Item label=" ">
                <Space>
                  <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>Lọc</Button>
                  <Button icon={<ReloadOutlined />} disabled={loading} onClick={() => { filterForm.resetFields(); loadRows({}); }}>Tải lại</Button>
                </Space>
              </Form.Item>
            </Col>
          </Row>
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
        title={<span className="admin-list-title"><span>{meta.icon}</span><span><b>{section === 'roles' && roleViewMode === 'matrix' ? 'Ma trận nhóm quyền' : `Danh sách ${meta.entityName}`}</b><small>{section === 'roles' && roleViewMode === 'matrix' ? `${matrixPermissions.length} quyền · ${matrixRoles.length} nhóm người dùng` : `${Number(rows.length || 0).toLocaleString('vi-VN')} bản ghi theo bộ lọc hiện tại`}</small></span></span>}
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
            {section === 'roles' && roleViewMode === 'matrix' ? (
              <Select
                value={matrixPermissionGroup}
                onChange={setMatrixPermissionGroup}
                style={{ width: 190 }}
                options={[{ label: 'Tất cả nhóm nghiệp vụ', value: 'all' }, ...permissionGroupOptions]}
              />
            ) : null}
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
            {section !== 'roles' || roleViewMode === 'list' ? (
              <Popover title="Chọn cột hiển thị" content={columnChooser} trigger="click" placement="bottomRight">
                <Button icon={<SettingOutlined />}>Cột hiển thị</Button>
              </Popover>
            ) : null}
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Thêm mới</Button>
          </Space>
        )}
      >
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
            <Table
              rowKey="permission_code"
              columns={matrixColumns}
              dataSource={matrixPermissions}
              loading={loading}
              pagination={false}
              sticky
              size="small"
              className="role-permission-matrix"
              scroll={{ x: 505 + matrixRoles.length * 158, y: 520 }}
            />
          </div>
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={rows}
            loading={loading}
            size="middle"
            sticky
            bordered={false}
            tableLayout="fixed"
            className={`admin-data-table admin-data-table-${section}`}
            pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `${total.toLocaleString('vi-VN')} bản ghi` }}
            scroll={{ x: section === 'users' ? 2220 : section === 'departments' ? 1580 : section === 'roles' ? 1400 : 1250, y: 520 }}
          />
        )}
      </Card>

      <Modal
        title={`${editing ? 'Cập nhật' : 'Thêm'} ${meta.entityName}`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText={editing ? 'Cập nhật' : 'Thêm mới'}
        cancelText="Hủy"
        width={section === 'roles' ? 900 : section === 'users' ? 900 : 720}
        className={`admin-entity-modal is-${section}`}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={submitForm}>
          {section === 'branches' && (
            <Row gutter={12}>
              <Col span={8}><Form.Item label="Mã chi nhánh" name="branch_code" rules={[{ required: true, message: 'Nhập mã chi nhánh' }]}><Input /></Form.Item></Col>
              <Col span={16}><Form.Item label="Tên chi nhánh" name="branch_name" rules={[{ required: true, message: 'Nhập tên chi nhánh' }]}><Input /></Form.Item></Col>
              <Col span={12}><Form.Item label="Cấp đơn vị" name="branch_level" rules={[{ required: true, message: 'Chọn cấp đơn vị' }]}><Select options={branchLevelOptions} /></Form.Item></Col>
              <Col span={12}><Form.Item label="Trực thuộc Hội sở" name="parent_branch_id"><Select {...selectProps('Chọn Hội sở')} options={headOfficeOptions} disabled={modalBranchLevel === 'HEAD_OFFICE'} /></Form.Item></Col>
              <Col span={12}><Form.Item label="Trạng thái" name="status"><Select options={[{ label: 'Hoạt động', value: 'active' }, { label: 'Ngừng dùng', value: 'inactive' }]} /></Form.Item></Col>
            </Row>
          )}

          {section === 'departments' && (
            <Row gutter={12}>
              <Col span={24}>
                <Form.Item label="Chi nhánh" name="branch_id" rules={[{ required: true, message: 'Chọn chi nhánh trước' }]}>
                  <Select
                    {...selectProps('Chọn chi nhánh trước')}
                    options={branchOptions}
                    onChange={() => form.setFieldsValue({ manager_user_id: undefined })}
                  />
                </Form.Item>
              </Col>
              <Col span={8}><Form.Item label="Mã phòng" name="department_code" rules={[{ required: true, message: 'Nhập mã phòng' }]}><Input /></Form.Item></Col>
              <Col span={16}><Form.Item label="Tên phòng ban" name="department_name" rules={[{ required: true, message: 'Nhập tên phòng ban' }]}><Input /></Form.Item></Col>
              <Col span={12}><Form.Item label="Loại đơn vị" name="department_type" rules={[{ required: true, message: 'Chọn loại đơn vị' }]}><Select options={departmentTypeOptions} /></Form.Item></Col>
              <Col span={12}><Form.Item label="Đơn vị cha (nếu có)" name="parent_department_id"><Select {...selectProps('Trực thuộc trực tiếp chi nhánh')} options={parentDepartmentOptions} /></Form.Item></Col>
              <Col span={12}><Form.Item label="Trưởng phòng" name="manager_user_id"><Select {...selectProps(modalBranchId ? 'Chọn trưởng phòng' : 'Chọn chi nhánh trước')} options={managerOptions} disabled={!modalBranchId} /></Form.Item></Col>
              <Col span={12}><Form.Item label="Trạng thái" name="status"><Select options={[{ label: 'Hoạt động', value: 'active' }, { label: 'Ngừng dùng', value: 'inactive' }]} /></Form.Item></Col>
            </Row>
          )}

          {section === 'users' && (
            <Row gutter={12}>
              <Col span={12}><Form.Item label="Mã nhân viên" name="employee_code" rules={[{ required: true, message: 'Nhập mã nhân viên' }]}><Input /></Form.Item></Col>
              <Col span={12}><Form.Item label="Mật khẩu tạm thời" name="password" rules={[{ validator: (_, value) => editing || value ? Promise.resolve() : Promise.reject(new Error('Nhập mật khẩu tạm thời')) }]}><Input.Password placeholder={editing ? 'Bỏ trống nếu không thay đổi' : 'Quản trị viên tự đặt'} autoComplete="new-password" /></Form.Item></Col>
              <Col span={12}><Form.Item label="Xác nhận mật khẩu tạm thời" name="confirm_password" dependencies={['password']} rules={[{ validator: (_, value) => { const password = form.getFieldValue('password'); if (!password && editing) return Promise.resolve(); return value === password ? Promise.resolve() : Promise.reject(new Error('Xác nhận mật khẩu không khớp')); } }]}><Input.Password placeholder="Nhập lại mật khẩu tạm thời" autoComplete="new-password" /></Form.Item></Col>
              <Col span={24}><Form.Item label="Họ tên cán bộ" name="full_name" rules={[{ required: true, message: 'Nhập họ tên' }]}><Input /></Form.Item></Col>
              <Col span={12}><Form.Item label="Email" name="email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}><Input placeholder="ten.canbo@agribank.com.vn" /></Form.Item></Col>
              <Col span={12}><Form.Item label="Số điện thoại" name="phone"><Input placeholder="Số điện thoại liên hệ" /></Form.Item></Col>
              <Col span={12}><Form.Item label="Mã CBTD" name="credit_officer_code"><Input /></Form.Item></Col>
              <Col span={12}><Form.Item label="Mã CIF quản lý" name="customer_cif_code" rules={[{ pattern: /^\d{13}$/, message: 'Mã CIF phải gồm đúng 13 chữ số' }]}><Input maxLength={13} placeholder="Ví dụ 2600012345678" /></Form.Item></Col>
              <Col span={12}><Form.Item label="User IPCAS" name="ipcas_username"><Input /></Form.Item></Col>
              <Col span={12}>
                <Form.Item label="Chi nhánh" name="branch_id" rules={[{ required: true, message: 'Chọn chi nhánh' }]}>
                  <Select {...selectProps('Chọn chi nhánh')} options={branchOptions} onChange={() => form.setFieldValue('department_id', undefined)} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Phòng ban" name="department_id" rules={[{ required: true, message: 'Chọn phòng ban' }]}>
                  <Select {...selectProps(modalBranchId ? 'Chọn phòng ban' : 'Chọn chi nhánh trước')} options={modalDepartmentOptions} disabled={!modalBranchId} />
                </Form.Item>
              </Col>
              <Col span={12}><Form.Item label="Nhóm quyền" name="role_id" rules={[{ required: true, message: 'Chọn nhóm quyền' }]}><Select {...selectProps('Chọn nhóm quyền')} options={roleOptions} onChange={handleUserRoleChange} /></Form.Item></Col>
              <Col span={12}>
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
              <Col span={6}><Form.Item label="Hoạt động" name="is_active" valuePropName="checked"><Switch /></Form.Item></Col>
              <Col span={6}>
                <Tooltip title={canManageSuperuser ? 'Quyền siêu quản trị hệ thống' : 'Chỉ siêu quản trị viên được thay đổi'}>
                  <Form.Item label="Quản trị viên" name="is_superuser" valuePropName="checked"><Switch disabled={!canManageSuperuser} /></Form.Item>
                </Tooltip>
              </Col>
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
                  {modalRoleId ? <div className="admin-effective-permission-summary"><SafetyCertificateOutlined /><span>Quyền thực tế sau khi lưu: <b>{inheritedPermissionCodes.size + selectedExtraPermissionCodes.length}</b> quyền</span><small>Quyền cấp thêm không làm thay đổi phạm vi {dataScopeTag(form.getFieldValue('data_scope'))}</small></div> : null}
                </div>
              </Col>
            </Row>
          )}

          {section === 'roles' && (
            <Row gutter={12}>
              <Form.Item name="permission_codes" noStyle preserve>
                <Checkbox.Group className="hidden-permission-field" />
              </Form.Item>
              <Col span={8}><Form.Item label="Mã nhóm quyền" name="role_code" rules={[{ required: true, message: 'Nhập mã nhóm quyền' }]}><Input disabled={editing?.is_system} /></Form.Item></Col>
              <Col span={16}><Form.Item label="Tên nhóm quyền" name="role_name" rules={[{ required: true, message: 'Nhập tên nhóm quyền' }]}><Input /></Form.Item></Col>
              <Col span={24}><Form.Item label="Mô tả" name="description"><Input.TextArea rows={3} /></Form.Item></Col>
              <Col span={24}>
                <div className="admin-extra-permission-box">
                  <div className="admin-extra-permission-head">
                    <span className="admin-extra-permission-icon"><SafetyCertificateOutlined /></span>
                    <span><Text strong>Chính sách phạm vi dữ liệu</Text><Text type="secondary">Được lưu trong DB và áp dụng thống nhất khi tạo người dùng, kiểm tra quyền và cảnh báo cấu hình.</Text></span>
                  </div>
                  <Row gutter={12}>
                    <Col span={8}>
                      <Form.Item label="Phạm vi mặc định" name="default_scope" rules={[{ required: true, message: 'Chọn phạm vi mặc định' }]}>
                        <Select options={dataScopeOptions} />
                      </Form.Item>
                    </Col>
                    <Col span={10}>
                      <Form.Item label="Phạm vi được phép" name="allowed_scopes" rules={[{ required: true, message: 'Chọn ít nhất một phạm vi' }]}>
                        <Select mode="multiple" options={dataScopeOptions} maxTagCount="responsive" />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
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
                <Form.Item label="Danh sách quyền">
                  <Collapse className="permission-groups" defaultActiveKey={Object.keys(permissionGroups).slice(0, 1)}>
                    {Object.entries(permissionGroups).map(([group, items]) => {
                      const codes = items.map((item) => item.permission_code);
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
                            <Text strong>Chọn toàn bộ nhóm {group}</Text>
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
                  Nguồn quyền: {{ role: 'Nhóm quyền', direct: 'Cấp thêm riêng', superuser: 'Quản trị viên', missing: 'Chưa được cấp' }[accessTester.result.permission_source] || accessTester.result.permission_source}
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

