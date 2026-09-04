import { useEffect, useState } from 'react';
import {
  AuditOutlined,
  ClockCircleOutlined,
  FileSearchOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Empty, Form, Input, Modal, Row, Select, Space, Table, Tag, Typography, message } from 'antd';

import client from '../api/client';

const { Paragraph, Text, Title } = Typography;

const actionOptions = [
  { label: 'Tất cả hành động', value: '' },
  { label: 'Thêm mới', value: 'create' },
  { label: 'Cập nhật', value: 'update' },
  { label: 'Thay đổi phân quyền', value: 'authorization_change' },
  { label: 'Xóa', value: 'delete' },
  { label: 'Ngừng hoạt động', value: 'deactivate' },
  { label: 'Import Excel', value: 'import' },
  { label: 'Reset mật khẩu', value: 'reset_password' },
  { label: 'Khóa tài khoản', value: 'lock' },
  { label: 'Mở khóa tài khoản', value: 'unlock' },
  { label: 'Người dùng tự đổi mật khẩu', value: 'change_password' },
];

const entityOptions = [
  { label: 'Tất cả đối tượng', value: '' },
  { label: 'Chi nhánh', value: 'branch' },
  { label: 'Phòng ban', value: 'department' },
  { label: 'Người dùng', value: 'user' },
  { label: 'Nhóm quyền', value: 'role' },
  { label: 'Tổ chức', value: 'organization' },
  { label: 'Hồ sơ cá nhân', value: 'personal_profile' },
];

function actionTag(value) {
  const map = {
    create: ['green', 'Thêm'],
    update: ['blue', 'Sửa'],
    authorization_change: ['purple', 'Thay đổi quyền'],
    delete: ['red', 'Xóa'],
    deactivate: ['orange', 'Ngừng hoạt động'],
    lock: ['volcano', 'Khóa tài khoản'],
    unlock: ['green', 'Mở tài khoản'],
    import: ['purple', 'Import'],
    reset_password: ['gold', 'Reset mật khẩu'],
    toggle_active: ['volcano', 'Khóa/mở khóa'],
    change_password: ['cyan', 'Đổi mật khẩu'],
  };
  const [color, label] = map[value] || ['default', value || 'Khác'];
  return <Tag color={color}>{label}</Tag>;
}

function entityTag(value) {
  const map = {
    branch: ['red', 'Chi nhánh'],
    department: ['gold', 'Phòng ban'],
    user: ['green', 'Người dùng'],
    role: ['blue', 'Nhóm quyền'],
    organization: ['purple', 'Tổ chức'],
    personal_profile: ['cyan', 'Hồ sơ cá nhân'],
  };
  const [color, label] = map[value] || ['default', value || 'Khác'];
  return <Tag color={color}>{label}</Tag>;
}

function getArrayPayload(data) {
  return Array.isArray(data) ? data : data?.value || [];
}

const fieldLabels = {
  branch_code: 'Mã chi nhánh', branch_name: 'Tên chi nhánh', branch_level: 'Cấp đơn vị', parent_branch_id: 'Đơn vị cha',
  department_code: 'Mã phòng', department_name: 'Tên phòng ban', department_type: 'Loại phòng', parent_department_id: 'Phòng cha', manager_user_id: 'Trưởng phòng',
  username: 'Tên đăng nhập', employee_code: 'Mã nhân viên', credit_officer_code: 'Mã CBTD', customer_cif_code: 'Mã CIF quản lý', ipcas_username: 'User IPCAS', full_name: 'Họ tên',
  email: 'Email', phone: 'Số điện thoại', branch_id: 'Chi nhánh', department_id: 'Phòng ban', role_id: 'Nhóm quyền', data_scope: 'Phạm vi dữ liệu',
  is_active: 'Trạng thái', is_superuser: 'Quản trị viên', extra_permissions: 'Quyền cấp thêm', must_change_password: 'Yêu cầu đổi mật khẩu',
  role_code: 'Mã nhóm quyền', role_name: 'Tên nhóm quyền', description: 'Mô tả', permission_codes: 'Danh sách quyền', default_scope: 'Phạm vi mặc định', allowed_scopes: 'Phạm vi được phép', scope_warning_level: 'Mức cảnh báo',
  failed_login_attempts: 'Số lần đăng nhập sai', locked_until: 'Khóa đến thời điểm', status: 'Trạng thái',
};

function displayAuditValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'Không có';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function AuditChangeModal({ log, onClose }) {
  const before = log?.before_data || {};
  const after = log?.after_data || {};
  const fields = [...new Set([...(log?.changed_fields || []), ...Object.keys(before), ...Object.keys(after)])];
  const changed = new Set(log?.changed_fields || []);
  const diffRows = fields.map((field) => ({
    field,
    label: fieldLabels[field] || field,
    before: before[field],
    after: after[field],
    changed: changed.has(field),
  }));
  return (
    <Modal
      title="Chi tiết thay đổi cấu hình"
      open={Boolean(log)}
      onCancel={onClose}
      footer={null}
      width={1040}
      destroyOnHidden
    >
      {log ? (
        <Space orientation="vertical" size={14} style={{ width: '100%' }}>
          <Card size="small">
            <Space wrap>
              {actionTag(log.action)}
              {entityTag(log.entity_type)}
              <Text strong>{log.description}</Text>
              <Text type="secondary">{log.created_at ? new Date(log.created_at).toLocaleString('vi-VN') : ''}</Text>
            </Space>
          </Card>
          {diffRows.length ? (
            <Table
              rowKey="field"
              size="small"
              bordered
              pagination={false}
              dataSource={diffRows}
              scroll={{ x: 880, y: 520 }}
              rowClassName={(row) => row.changed ? 'audit-diff-changed-row' : ''}
              columns={[
                { title: 'Trường dữ liệu', dataIndex: 'label', key: 'label', width: 210, render: (value, row) => <Space><Text strong={row.changed}>{value}</Text>{row.changed ? <Tag color="blue">Đã đổi</Tag> : null}</Space> },
                { title: 'Trước thay đổi', dataIndex: 'before', key: 'before', render: (value) => <Text type="secondary">{displayAuditValue(value)}</Text> },
                { title: 'Sau thay đổi', dataIndex: 'after', key: 'after', render: (value, row) => <Text strong={row.changed}>{displayAuditValue(value)}</Text> },
              ]}
            />
          ) : <Empty description="Nhật ký cũ chưa có dữ liệu so sánh trước và sau" />}
        </Space>
      ) : null}
    </Modal>
  );
}

function AuditLogs() {
  const [form] = Form.useForm();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);

  async function loadRows(extraParams = {}) {
    setLoading(true);
    try {
      const params = { limit: 200, ...form.getFieldsValue(), ...extraParams };
      Object.keys(params).forEach((key) => {
        if (params[key] === undefined || params[key] === null || params[key] === '') {
          delete params[key];
        }
      });
      const { data } = await client.get('/admin/audit-logs', { params });
      setRows(getArrayPayload(data));
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
  }, []);

  const columns = [
    {
      title: 'Thời gian',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (value) => (value ? new Date(value).toLocaleString('vi-VN') : ''),
    },
    {
      title: 'Người thao tác',
      key: 'actor',
      width: 220,
      render: (_, row) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{row.actor_name || row.actor_username}</Text>
          <Text type="secondary">{row.actor_username}</Text>
        </Space>
      ),
    },
    { title: 'Hành động', dataIndex: 'action', key: 'action', width: 150, render: actionTag },
    { title: 'Đối tượng', dataIndex: 'entity_type', key: 'entity_type', width: 140, render: entityTag },
    { title: 'Mã đối tượng', dataIndex: 'entity_id', key: 'entity_id', width: 120 },
    {
      title: 'Trường thay đổi',
      dataIndex: 'changed_fields',
      key: 'changed_fields',
      width: 260,
      render: (fields = []) => fields.length
        ? <Space size={[4, 4]} wrap>{fields.slice(0, 3).map((field) => <Tag key={field} color="blue">{fieldLabels[field] || field}</Tag>)}{fields.length > 3 ? <Tag>+{fields.length - 3}</Tag> : null}</Space>
        : <Text type="secondary">Nhật ký mô tả</Text>,
    },
    { title: 'Nội dung', dataIndex: 'description', key: 'description' },
    {
      title: '', key: 'detail', fixed: 'right', width: 115,
      render: (_, row) => <Button size="small" type="link" onClick={() => setSelectedLog(row)}>Xem thay đổi</Button>,
    },
  ];

  return (
    <Space orientation="vertical" size={14} className="page-stack">
      <section className="admin-title-panel admin-title-role">
        <div>
          <Tag color="blue">Kiểm soát</Tag>
          <Title level={3}>Nhật ký thao tác</Title>
          <Paragraph>Theo dõi các thao tác thêm, sửa, xóa, import và thay đổi tài khoản trong hệ thống.</Paragraph>
        </div>
        <span className="admin-title-icon"><AuditOutlined /></span>
      </section>

      <Card title="Bộ lọc nhật ký" className="admin-filter-card admin-filter-role">
        <Form form={form} layout="vertical" onFinish={() => loadRows()}>
          <Row gutter={[12, 12]} align="bottom">
            <Col xs={24} md={6}>
              <Form.Item label="Từ khóa" name="keyword">
                <Input allowClear prefix={<FileSearchOutlined />} placeholder="Nội dung, người thao tác, mã đối tượng..." />
              </Form.Item>
            </Col>
            <Col xs={24} md={4}>
              <Form.Item label="Người thao tác" name="actor_username">
                <Input allowClear prefix={<UserOutlined />} placeholder="Tất cả người dùng" />
              </Form.Item>
            </Col>
            <Col xs={24} md={4}>
              <Form.Item label="Hành động" name="action">
                <Select options={actionOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} md={4}>
              <Form.Item label="Đối tượng" name="entity_type">
                <Select options={entityOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} md={3}>
              <Form.Item label="Từ ngày" name="date_from">
                <Input type="date" prefix={<ClockCircleOutlined />} />
              </Form.Item>
            </Col>
            <Col xs={24} md={3}>
              <Form.Item label="Đến ngày" name="date_to">
                <Input type="date" prefix={<ClockCircleOutlined />} />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Space>
                <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>
                  Lọc nhật ký
                </Button>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => {
                    form.resetFields();
                    loadRows({});
                  }}
                >
                  Tải lại
                </Button>
              </Space>
            </Col>
          </Row>
        </Form>
      </Card>

      <Card title="Danh sách nhật ký thao tác">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 1480, y: 560 }}
        />
      </Card>
      <AuditChangeModal log={selectedLog} onClose={() => setSelectedLog(null)} />
    </Space>
  );
}

export default AuditLogs;

