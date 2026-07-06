import { useEffect, useState } from 'react';
import {
  AuditOutlined,
  ClockCircleOutlined,
  FileSearchOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Form, Input, Row, Select, Space, Table, Tag, Typography, message } from 'antd';

import client from '../api/client';

const { Paragraph, Text, Title } = Typography;

const actionOptions = [
  { label: 'Tất cả hành động', value: '' },
  { label: 'Thêm mới', value: 'create' },
  { label: 'Cập nhật', value: 'update' },
  { label: 'Xóa', value: 'delete' },
  { label: 'Import Excel', value: 'import' },
  { label: 'Reset mật khẩu', value: 'reset_password' },
  { label: 'Khóa/mở khóa tài khoản', value: 'toggle_active' },
];

const entityOptions = [
  { label: 'Tất cả đối tượng', value: '' },
  { label: 'Chi nhánh', value: 'branch' },
  { label: 'Phòng ban', value: 'department' },
  { label: 'Người dùng', value: 'user' },
  { label: 'Nhóm quyền', value: 'role' },
  { label: 'Tổ chức', value: 'organization' },
];

function actionTag(value) {
  const map = {
    create: ['green', 'Thêm'],
    update: ['blue', 'Sửa'],
    delete: ['red', 'Xóa'],
    import: ['purple', 'Import'],
    reset_password: ['gold', 'Reset mật khẩu'],
    toggle_active: ['volcano', 'Khóa/mở khóa'],
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
  };
  const [color, label] = map[value] || ['default', value || 'Khác'];
  return <Tag color={color}>{label}</Tag>;
}

function getArrayPayload(data) {
  return Array.isArray(data) ? data : data?.value || [];
}

function AuditLogs() {
  const [form] = Form.useForm();
  const filterValues = Form.useWatch([], form);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadRows();
    }, 450);
    return () => window.clearTimeout(timer);
  }, [JSON.stringify(filterValues || {})]);

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
        <Space direction="vertical" size={0}>
          <Text strong>{row.actor_name || row.actor_username}</Text>
          <Text type="secondary">{row.actor_username}</Text>
        </Space>
      ),
    },
    { title: 'Hành động', dataIndex: 'action', key: 'action', width: 150, render: actionTag },
    { title: 'Đối tượng', dataIndex: 'entity_type', key: 'entity_type', width: 140, render: entityTag },
    { title: 'Mã đối tượng', dataIndex: 'entity_id', key: 'entity_id', width: 120 },
    { title: 'Nội dung', dataIndex: 'description', key: 'description' },
  ];

  return (
    <Space direction="vertical" size={14} className="page-stack">
      <section className="admin-title-panel admin-title-role">
        <div>
          <Tag color="blue">Kiểm soát</Tag>
          <Title level={3}>Nhật ký thao tác</Title>
          <Paragraph>Theo dõi các thao tác thêm, sửa, xóa, import và thay đổi tài khoản trong hệ thống.</Paragraph>
        </div>
        <span className="admin-title-icon"><AuditOutlined /></span>
      </section>

      <Card title="Bộ lọc nhật ký" className="admin-filter-card admin-filter-role">
        <Form form={form} layout="vertical">
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
                <Button type="primary" icon={<SearchOutlined />} onClick={() => loadRows()}>
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
          scroll={{ x: 1100 }}
        />
      </Card>
    </Space>
  );
}

export default AuditLogs;
