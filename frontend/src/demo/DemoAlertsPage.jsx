import { useMemo, useState } from 'react';
import {
  AlertOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  PhoneOutlined,
  RiseOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  Input,
  message,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';

import { demoCustomers } from './data/mockCustomers';

const { Text, Title } = Typography;

const alertTypes = {
  badDebt: { label: 'Nợ xấu', severity: 'critical', icon: <ExclamationCircleOutlined />, action: 'Liên hệ và rà soát phương án xử lý nợ' },
  declining: { label: 'Tiền gửi suy giảm', severity: 'high', icon: <RiseOutlined />, action: 'Xác minh nguyên nhân tiền gửi giảm' },
  missingContact: { label: 'Thiếu liên hệ', severity: 'medium', icon: <PhoneOutlined />, action: 'Bổ sung số điện thoại khách hàng' },
  incomplete: { label: 'Thiếu dữ liệu', severity: 'medium', icon: <AlertOutlined />, action: 'Đối chiếu và hoàn thiện hồ sơ' },
};

const severityMeta = {
  critical: { label: 'Khẩn cấp', color: 'error', order: 0 },
  high: { label: 'Cao', color: 'volcano', order: 1 },
  medium: { label: 'Trung bình', color: 'gold', order: 2 },
};

function createAlert(customer, type, detail, offset) {
  const rule = alertTypes[type];
  const overdue = (customer.id + offset) % 5 === 0;
  return {
    id: `${type}-${customer.id}`,
    type,
    title: rule.label,
    detail,
    severity: rule.severity,
    suggestedAction: rule.action,
    customer,
    createdAt: `2${(customer.id + offset) % 4 + 1}/07/2026`,
    dueAt: overdue ? '23/07/2026' : `${25 + ((customer.id + offset) % 5)}/07/2026`,
    overdue,
  };
}

function buildAlerts() {
  return demoCustomers.flatMap((customer) => {
    const alerts = [];
    const latest = customer.history.at(-1);
    const previous = customer.history.at(-2);
    const decline = previous.deposits > 0 ? (previous.deposits - latest.deposits) / previous.deposits : 0;

    if (customer.loans.badDebt > 0) {
      alerts.push(createAlert(customer, 'badDebt', `Dư nợ xấu ${customer.loans.badDebt.toLocaleString('vi-VN')} đ`, 1));
    }
    if (decline >= 0.07) {
      alerts.push(createAlert(customer, 'declining', `Tiền gửi giảm ${(decline * 100).toFixed(1)}% so với kỳ trước`, 2));
    }
    if (!customer.phone) {
      alerts.push(createAlert(customer, 'missingContact', 'Hồ sơ chưa có số điện thoại', 3));
    }
    if (customer.missingDataCount >= 5) {
      alerts.push(createAlert(customer, 'incomplete', `Thiếu ${customer.missingDataCount} trường dữ liệu`, 4));
    }
    return alerts;
  }).sort((a, b) => severityMeta[a.severity].order - severityMeta[b.severity].order || Number(b.overdue) - Number(a.overdue));
}

export const demoAlerts = buildAlerts();

function Metric({ title, value, note, tone, icon }) {
  return (
    <Card className={`demo-alert-metric is-${tone}`}>
      <span className="demo-alert-metric-icon">{icon}</span>
      <div><Text type="secondary">{title}</Text><strong>{value.toLocaleString('vi-VN')}</strong><small>{note}</small></div>
    </Card>
  );
}

export default function DemoAlertsPage({ onCustomerOpen }) {
  const [statusById, setStatusById] = useState({});
  const [keyword, setKeyword] = useState('');
  const [type, setType] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [status, setStatus] = useState('open');

  const resolvedCount = Object.values(statusById).filter(Boolean).length;
  const visibleAlerts = useMemo(() => demoAlerts.filter((alert) => {
    const isResolved = Boolean(statusById[alert.id]);
    if (status === 'open' && isResolved) return false;
    if (status === 'resolved' && !isResolved) return false;
    if (type !== 'all' && alert.type !== type) return false;
    if (severity !== 'all' && alert.severity !== severity) return false;
    const search = keyword.trim().toLocaleLowerCase('vi');
    return !search || [alert.customer.customerName, alert.customer.customerCode, alert.customer.officer, alert.title]
      .some((value) => String(value).toLocaleLowerCase('vi').includes(search));
  }), [keyword, severity, status, statusById, type]);

  const openAlerts = demoAlerts.length - resolvedCount;
  const critical = demoAlerts.filter((item) => item.severity === 'critical' && !statusById[item.id]).length;
  const overdue = demoAlerts.filter((item) => item.overdue && !statusById[item.id]).length;

  function resolve(alert) {
    setStatusById((current) => ({ ...current, [alert.id]: true }));
    message.success(`Đã xử lý cảnh báo của ${alert.customer.customerName}`);
  }

  const columns = [
    {
      title: 'Mức độ',
      dataIndex: 'severity',
      width: 115,
      render: (value) => <Tag color={severityMeta[value].color}>{severityMeta[value].label}</Tag>,
    },
    {
      title: 'Cảnh báo',
      width: 245,
      render: (_, row) => (
        <div className="demo-alert-title">
          <span className={`is-${row.severity}`}>{alertTypes[row.type].icon}</span>
          <div><Text strong>{row.title}</Text><Text type="secondary">{row.detail}</Text></div>
        </div>
      ),
    },
    {
      title: 'Khách hàng',
      width: 230,
      render: (_, row) => (
        <Button type="link" className="demo-alert-customer" onClick={() => onCustomerOpen(row.customer.id)}>
          <strong>{row.customer.customerName}</strong><small>{row.customer.customerCode} · {row.customer.segment}</small>
        </Button>
      ),
    },
    { title: 'Cán bộ phụ trách', dataIndex: ['customer', 'officer'], width: 170 },
    { title: 'Việc cần làm', dataIndex: 'suggestedAction', ellipsis: true },
    {
      title: 'Hạn xử lý',
      dataIndex: 'dueAt',
      width: 125,
      render: (value, row) => row.overdue && !statusById[row.id]
        ? <Text type="danger"><ClockCircleOutlined /> {value}</Text>
        : value,
    },
    {
      title: 'Trạng thái',
      width: 125,
      render: (_, row) => statusById[row.id]
        ? <Tag color="success">Đã xử lý</Tag>
        : <Tag color="processing">Chờ xử lý</Tag>,
    },
    {
      title: '',
      width: 105,
      render: (_, row) => statusById[row.id]
        ? <Button size="small" onClick={() => setStatusById((current) => ({ ...current, [row.id]: false }))}>Mở lại</Button>
        : <Button size="small" type="primary" onClick={() => resolve(row)}>Hoàn tất</Button>,
    },
  ];

  return (
    <div className="demo-page">
      <div className="demo-page-heading">
        <div>
          <Text className="demo-eyebrow">THEO DÕI CHỦ ĐỘNG</Text>
          <Title level={2}>Cảnh báo tự động</Title>
          <Text type="secondary">Các việc cần chú ý được hệ thống phát hiện từ dữ liệu khách hàng hiện có</Text>
        </div>
        <Tag color="purple">DEMO QUY TẮC</Tag>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}><Metric title="Đang chờ xử lý" value={openAlerts} note="Tất cả cảnh báo chưa đóng" tone="blue" icon={<AlertOutlined />} /></Col>
        <Col xs={24} sm={12} xl={6}><Metric title="Khẩn cấp" value={critical} note="Ưu tiên xử lý trước" tone="red" icon={<ExclamationCircleOutlined />} /></Col>
        <Col xs={24} sm={12} xl={6}><Metric title="Đã quá hạn" value={overdue} note="Cần kiểm tra ngay hôm nay" tone="gold" icon={<ClockCircleOutlined />} /></Col>
        <Col xs={24} sm={12} xl={6}><Metric title="Đã hoàn tất" value={resolvedCount} note="Trong phiên demo này" tone="green" icon={<CheckCircleOutlined />} /></Col>
      </Row>

      <Card className="demo-table-card demo-section">
        <div className="demo-alert-toolbar">
          <Input.Search allowClear placeholder="Tên, mã KH, cán bộ hoặc cảnh báo..." value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          <Space wrap>
            <Select value={type} onChange={setType} style={{ width: 180 }} options={[
              { value: 'all', label: 'Tất cả loại cảnh báo' },
              ...Object.entries(alertTypes).map(([value, item]) => ({ value, label: item.label })),
            ]} />
            <Select value={severity} onChange={setSeverity} style={{ width: 150 }} options={[
              { value: 'all', label: 'Tất cả mức độ' },
              ...Object.entries(severityMeta).map(([value, item]) => ({ value, label: item.label })),
            ]} />
            <Select value={status} onChange={setStatus} style={{ width: 145 }} options={[
              { value: 'open', label: 'Chờ xử lý' },
              { value: 'resolved', label: 'Đã xử lý' },
              { value: 'all', label: 'Tất cả trạng thái' },
            ]} />
          </Space>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={visibleAlerts}
          scroll={{ x: 1250 }}
          pagination={{ pageSize: 12, showSizeChanger: false, showTotal: (total) => `${total.toLocaleString('vi-VN')} cảnh báo` }}
          rowClassName={(row) => statusById[row.id] ? 'is-alert-resolved' : ''}
        />
      </Card>
    </div>
  );
}
