import { useEffect, useMemo, useState } from 'react';
import {
  ApartmentOutlined,
  BankOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SettingOutlined,
  TeamOutlined,
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
  branches: ['branch_code', 'branch_name', 'department_count', 'user_count', 'status'],
  departments: ['branch_name', 'department_code', 'department_name', 'manager_name', 'user_count', 'status'],
  users: ['full_name', 'employee_code', 'customer_cif_code', 'ipcas_username', 'department_name', 'role_code', 'data_scope', 'is_active'],
  roles: ['role_code', 'role_name', 'description', 'user_count', 'permissions'],
};

function getArrayPayload(data) {
  return Array.isArray(data) ? data : data?.value || [];
}

function activeTag(value) {
  const inactive = value === false || value === 'inactive';
  return <Tag color={inactive ? 'default' : 'success'}>{inactive ? 'Ngừng dùng' : 'Hoạt động'}</Tag>;
}

function roleColor(code) {
  if (code === 'ADMIN') return 'red';
  if (code === 'MANAGER') return 'gold';
  return 'green';
}

function dataScopeTag(value) {
  const scopeMap = {
    all: ['red', 'Toàn hệ thống'],
    branch: ['volcano', 'Theo chi nhánh'],
    department: ['gold', 'Theo phòng ban'],
    own: ['green', 'Dữ liệu cá nhân'],
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
  const [form] = Form.useForm();
  const [filterForm] = Form.useForm();
  const modalBranchId = Form.useWatch('branch_id', form);
  const filterBranchId = Form.useWatch('branch_id', filterForm);
  const filterValues = Form.useWatch([], filterForm);

  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [staffUsers, setStaffUsers] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [userWarnings, setUserWarnings] = useState({ missing_role: 0, missing_department: 0, duplicate_ipcas: [] });
  const [warningModal, setWarningModal] = useState({ open: false, title: '', rows: [], loading: false });
  const [overview, setOverview] = useState({});
  const [loading, setLoading] = useState(false);
  const [uploadingLookup, setUploadingLookup] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedPermissionCodes, setSelectedPermissionCodes] = useState([]);
  const [visibleColumns, setVisibleColumns] = useState(defaultVisibleColumns[section]);

  async function loadLookups() {
    const [overviewRes, branchRes, departmentRes, roleRes, permissionRes, userRes, warningRes] = await Promise.all([
      client.get('/admin/overview'),
      client.get('/admin/branches'),
      client.get('/admin/departments'),
      client.get('/admin/roles'),
      client.get('/admin/permissions'),
      client.get('/admin/users'),
      client.get('/admin/users/warnings'),
    ]);
    setOverview(overviewRes.data || {});
    setBranches(getArrayPayload(branchRes.data));
    setDepartments(getArrayPayload(departmentRes.data));
    setRoles(getArrayPayload(roleRes.data));
    setPermissions(getArrayPayload(permissionRes.data));
    setStaffUsers(getArrayPayload(userRes.data));
    setUserWarnings(warningRes.data || { missing_role: 0, missing_department: 0, duplicate_ipcas: [] });
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
      const [{ data }] = await Promise.all([client.get(meta.endpoint, { params }), loadLookups()]);
      setRows(getArrayPayload(data));
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    filterForm.resetFields();
    setVisibleColumns(defaultVisibleColumns[section]);
    setEditing(null);
    setModalOpen(false);
    loadRows({});
  }, [section]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadRows();
    }, 450);
    return () => window.clearTimeout(timer);
  }, [JSON.stringify(filterValues || {}), section]);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    if (section === 'users') {
      form.setFieldsValue({ is_active: true, is_superuser: false, data_scope: 'own' });
    } else if (section === 'roles') {
      form.setFieldsValue({ permission_codes: [] });
      setSelectedPermissionCodes([]);
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
    } else {
      form.setFieldsValue(row);
    }
    setModalOpen(true);
  }

  async function submitForm(values) {
    try {
      const payload = { ...values };
      if (section === 'users' && !payload.password) {
        delete payload.password;
      }
      if (section === 'roles') {
        payload.permission_codes = selectedPermissionCodes;
      }
      if (editing) {
        await client.put(`${meta.endpoint}/${editing.id}`, payload);
        message.success(`Đã cập nhật ${meta.entityName}`);
      } else {
        await client.post(meta.endpoint, payload);
        message.success(`Đã thêm ${meta.entityName}`);
      }
      setModalOpen(false);
      await loadRows();
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    }
  }

  async function deleteRow(row) {
    try {
      const { data } = await client.delete(`${meta.endpoint}/${row.id}`);
      message.success(data?.message || `Đã xóa ${meta.entityName}`);
      await loadRows();
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    }
  }

  async function resetPassword(row) {
    try {
      await client.post(`/admin/users/${row.id}/reset-password`);
      message.success(`Đã reset mật khẩu của ${row.full_name} về mặc định là 1`);
      await loadRows();
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    }
  }

  async function toggleUserActive(row) {
    try {
      const { data } = await client.post(`/admin/users/${row.id}/toggle-active`);
      message.success(data.is_active ? 'Đã mở khóa tài khoản' : 'Đã khóa tài khoản');
      await loadRows();
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
      });
      message.success(`Đã import ${data.rows || 0} dòng từ Excel`);
      await loadRows();
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
  const roleOptions = roles.map((item) => ({ label: `${item.role_code} - ${item.role_name}`, value: item.id }));
  const managerOptions = staffUsers
    .filter((item) => !modalBranchId || item.branch_id === modalBranchId)
    .map((item) => ({ label: `${item.employee_code || item.username} - ${item.full_name}`, value: item.id }));
  const filterManagerOptions = staffUsers
    .filter((item) => !filterBranchId || item.branch_id === filterBranchId)
    .map((item) => ({ label: `${item.employee_code || item.username} - ${item.full_name}`, value: item.id }));
  const dataScopeOptions = [
    { label: 'Toàn hệ thống', value: 'all' },
    { label: 'Theo chi nhánh', value: 'branch' },
    { label: 'Theo phòng ban', value: 'department' },
    { label: 'Chỉ dữ liệu cá nhân', value: 'own' },
  ];

  const permissionGroups = useMemo(() => {
    return permissions.reduce((acc, item) => {
      acc[item.permission_group] = acc[item.permission_group] || [];
      acc[item.permission_group].push(item);
      return acc;
    }, {});
  }, [permissions]);
  const permissionGroupOptions = Object.keys(permissionGroups).map((group) => ({ label: group, value: group }));
  const permissionOptions = permissions.map((item) => ({ label: `${item.permission_name} · ${item.permission_group}`, value: item.permission_code }));

  const actionColumn = {
    title: 'Thao tác',
    key: 'actions',
    width: section === 'users' ? 210 : 116,
    fixed: 'right',
    render: (_, row) => {
      const userActions = section === 'users' ? (
        <>
          <Popconfirm
            title="Reset mật khẩu?"
            description="Mật khẩu của người dùng sẽ được đặt lại về mặc định là 1."
            okText="Reset"
            cancelText="Hủy"
            onConfirm={() => resetPassword(row)}
          >
            <Button size="small" icon={<KeyOutlined />} />
          </Popconfirm>
          <Button
            size="small"
            icon={row.is_active ? <LockOutlined /> : <UnlockOutlined />}
            onClick={() => toggleUserActive(row)}
          />
        </>
      ) : null;

      return (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
          {userActions}
          <Popconfirm
            title={`Xóa ${meta.entityName}?`}
            description="Thao tác này không thể hoàn tác nếu dữ liệu không còn ràng buộc."
            okText="Xóa"
            cancelText="Hủy"
            onConfirm={() => deleteRow(row)}
          >
            <Button danger size="small" icon={<DeleteOutlined />} />
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
        { title: 'Mã CBTD', dataIndex: 'credit_officer_code', key: 'credit_officer_code', width: 120, align: 'center', render: (value) => value ? <Tag>{value}</Tag> : <Text type="secondary">-</Text> },
        { title: 'Mã CIF quản lý', dataIndex: 'customer_cif_code', key: 'customer_cif_code', width: 155, render: (value) => value ? <Text code>{value}</Text> : <Text type="secondary">-</Text> },
        { title: 'User IPCAS', dataIndex: 'ipcas_username', key: 'ipcas_username', width: 135, align: 'center', render: (value) => value ? <Tag color="blue">{value}</Tag> : <Tag color="warning">Chưa có</Tag> },
        { title: 'Chi nhánh', dataIndex: 'branch_name', key: 'branch_name', width: 220, render: (value) => ellipsisText(value) },
        { title: 'Phòng ban', dataIndex: 'department_name', key: 'department_name', width: 220, render: (value) => value ? ellipsisText(value) : <Tag color="warning">Chưa gán</Tag> },
        { title: 'Nhóm quyền', dataIndex: 'role_code', key: 'role_code', width: 165, align: 'center', render: (value, row) => <Tag color={roleColor(value)}>{row.role_name || 'Chưa gán'}</Tag> },
        { title: 'Phạm vi dữ liệu', dataIndex: 'data_scope', key: 'data_scope', width: 155, align: 'center', render: dataScopeTag },
        { title: 'Trạng thái', dataIndex: 'is_active', key: 'is_active', width: 125, align: 'center', render: activeTag },
      ];
    }
    return [
      { title: 'Mã nhóm', dataIndex: 'role_code', key: 'role_code', width: 130, render: (value) => <Tag color={roleColor(value)}>{value}</Tag> },
      { title: 'Tên nhóm quyền', dataIndex: 'role_name', key: 'role_name', width: 210 },
      { title: 'Mô tả', dataIndex: 'description', key: 'description' },
      { title: 'Người dùng', dataIndex: 'user_count', key: 'user_count', width: 110 },
      {
        title: 'Quyền được cấp',
        dataIndex: 'permissions',
        key: 'permissions',
        render: (items) => (
          <Space wrap size={4}>
            {(items || []).map((item) => <Tag color="blue" key={item.permission_code}>{item.permission_name}</Tag>)}
          </Space>
        ),
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
      if (checked) current.add(code);
      else current.delete(code);
    });
    const nextCodes = [...current];
    setSelectedPermissionCodes(nextCodes);
    form.setFieldsValue({ permission_codes: nextCodes });
  }

  function togglePermissionCode(code, checked) {
    const current = new Set(selectedPermissionCodes);
    if (checked) {
      current.add(code);
    } else {
      current.delete(code);
    }
    const nextCodes = [...current];
    setSelectedPermissionCodes(nextCodes);
    form.setFieldsValue({ permission_codes: nextCodes });
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
  ];

  return (
    <Space orientation="vertical" size={14} className="page-stack">
      <section className={`admin-title-panel admin-title-${meta.theme}`}>
        <div>
          <Tag color="gold">{meta.tag}</Tag>
          <Title level={3}>{meta.title}</Title>
          <Paragraph>{meta.subtitle}</Paragraph>
        </div>
        <span className="admin-title-icon">{meta.icon}</span>
      </section>

      <Row gutter={[12, 12]}>
        <Col xs={24} md={6}><Card className="metric-card compact-metric"><Statistic title="Chi nhánh" value={overview.branch_count || 0} prefix={<BankOutlined />} loading={loading} /></Card></Col>
        <Col xs={24} md={6}><Card className="metric-card compact-metric"><Statistic title="Phòng ban" value={overview.department_count || 0} prefix={<ApartmentOutlined />} loading={loading} /></Card></Col>
        <Col xs={24} md={6}><Card className="metric-card compact-metric"><Statistic title="Người dùng" value={overview.user_count || 0} prefix={<TeamOutlined />} loading={loading} /></Card></Col>
        <Col xs={24} md={6}><Card className="metric-card compact-metric"><Statistic title="Nhóm quyền" value={overview.role_count || 0} prefix={<SafetyCertificateOutlined />} loading={loading} /></Card></Col>
      </Row>

      <Card title={`Bộ lọc ${meta.entityName}`} className={`admin-filter-card admin-filter-${meta.theme}`}>
        <Form form={filterForm} layout="vertical">
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
                  <Button type="primary" icon={<SearchOutlined />} onClick={() => loadRows()}>Lọc</Button>
                  <Button icon={<ReloadOutlined />} onClick={() => { filterForm.resetFields(); loadRows({}); }}>Tải lại</Button>
                </Space>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      {section === 'users' && (
        <Alert
          type={
            userWarnings.missing_role || userWarnings.missing_department || userWarnings.duplicate_ipcas?.length
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
                color={userWarnings.duplicate_ipcas?.length ? 'red' : 'green'}
                className="clickable-tag"
                onClick={() => openWarningDetails('duplicate_ipcas', 'Người dùng trùng User IPCAS')}
              >
                Trùng User IPCAS: {userWarnings.duplicate_ipcas?.length || 0}
              </Tag>
            </Space>
          }
        />
      )}

      <Card
        title={`Danh sách ${meta.entityName}`}
        extra={(
          <Space>
            {section !== 'roles' && (
              <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={importLookupExcel}>
                <Button icon={<UploadOutlined />} loading={uploadingLookup}>
                  Import Excel
                </Button>
              </Upload>
            )}
            <Popover title="Chọn cột hiển thị" content={columnChooser} trigger="click" placement="bottomRight">
              <Button icon={<SettingOutlined />}>Cột hiển thị</Button>
            </Popover>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Thêm mới</Button>
          </Space>
        )}
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          size="middle"
          tableLayout="fixed"
          className={`admin-data-table admin-data-table-${section}`}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          scroll={{ x: section === 'users' ? 1500 : section === 'departments' ? 1280 : section === 'roles' ? 1200 : 900 }}
        />
      </Card>

      <Modal
        title={`${editing ? 'Cập nhật' : 'Thêm'} ${meta.entityName}`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText={editing ? 'Cập nhật' : 'Thêm mới'}
        cancelText="Hủy"
        width={section === 'roles' ? 820 : 640}
      >
        <Form form={form} layout="vertical" onFinish={submitForm}>
          {section === 'branches' && (
            <Row gutter={12}>
              <Col span={8}><Form.Item label="Mã chi nhánh" name="branch_code" rules={[{ required: true, message: 'Nhập mã chi nhánh' }]}><Input /></Form.Item></Col>
              <Col span={16}><Form.Item label="Tên chi nhánh" name="branch_name" rules={[{ required: true, message: 'Nhập tên chi nhánh' }]}><Input /></Form.Item></Col>
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
              <Col span={12}><Form.Item label="Trưởng phòng" name="manager_user_id"><Select {...selectProps(modalBranchId ? 'Chọn trưởng phòng' : 'Chọn chi nhánh trước')} options={managerOptions} disabled={!modalBranchId} /></Form.Item></Col>
              <Col span={12}><Form.Item label="Trạng thái" name="status"><Select options={[{ label: 'Hoạt động', value: 'active' }, { label: 'Ngừng dùng', value: 'inactive' }]} /></Form.Item></Col>
            </Row>
          )}

          {section === 'users' && (
            <Row gutter={12}>
              <Col span={12}><Form.Item label="Mã nhân viên" name="employee_code" rules={[{ required: true, message: 'Nhập mã nhân viên' }]}><Input /></Form.Item></Col>
              <Col span={12}><Form.Item label="Mật khẩu" name="password"><Input.Password placeholder="Bỏ trống để dùng mật khẩu mặc định 1" /></Form.Item></Col>
              <Col span={24}><Form.Item label="Họ tên cán bộ" name="full_name" rules={[{ required: true, message: 'Nhập họ tên' }]}><Input /></Form.Item></Col>
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
              <Col span={12}><Form.Item label="Nhóm quyền" name="role_id" rules={[{ required: true, message: 'Chọn nhóm quyền' }]}><Select {...selectProps('Chọn nhóm quyền')} options={roleOptions} /></Form.Item></Col>
              <Col span={12}><Form.Item label="Phạm vi dữ liệu" name="data_scope"><Select options={dataScopeOptions} /></Form.Item></Col>
              <Col span={6}><Form.Item label="Hoạt động" name="is_active" valuePropName="checked"><Switch /></Form.Item></Col>
              <Col span={6}><Form.Item label="Quản trị viên" name="is_superuser" valuePropName="checked"><Switch /></Form.Item></Col>
            </Row>
          )}

          {section === 'roles' && (
            <Row gutter={12}>
              <Form.Item name="permission_codes" noStyle preserve>
                <Checkbox.Group className="hidden-permission-field" />
              </Form.Item>
              <Col span={8}><Form.Item label="Mã nhóm quyền" name="role_code" rules={[{ required: true, message: 'Nhập mã nhóm quyền' }]}><Input /></Form.Item></Col>
              <Col span={16}><Form.Item label="Tên nhóm quyền" name="role_name" rules={[{ required: true, message: 'Nhập tên nhóm quyền' }]}><Input /></Form.Item></Col>
              <Col span={24}><Form.Item label="Mô tả" name="description"><Input.TextArea rows={3} /></Form.Item></Col>
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
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => togglePermissionCode(item.permission_code, event.target.checked)}
                              >
                                <Space orientation="vertical" size={0}>
                                  <Text>{item.permission_name}</Text>
                                  <Text type="secondary">{item.permission_code}</Text>
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
        title={warningModal.title}
        open={warningModal.open}
        onCancel={() => setWarningModal({ open: false, title: '', rows: [], loading: false })}
        footer={null}
        width={980}
      >
        <Table
          rowKey="id"
          columns={warningColumns}
          dataSource={warningModal.rows}
          loading={warningModal.loading}
          pagination={{ pageSize: 8 }}
          size="small"
          scroll={{ x: 900 }}
        />
      </Modal>
    </Space>
  );
}

export default SystemAdmin;

