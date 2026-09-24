import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Col, Form, Input, InputNumber, Modal, Popconfirm, Row,
  Statistic, Switch, Table, Tabs, Tag, Typography, message,
} from 'antd';
import {
  AppstoreOutlined, CalculatorOutlined, DeleteOutlined, EditOutlined,
  PlusOutlined, ReloadOutlined, SettingOutlined,
} from '@ant-design/icons';

import client from '../api/client';
import './SystemConfiguration.css';

const { Text, Title } = Typography;
const statusTag = (status) => status === 'database_config'
  ? <Tag color="success">Cấu hình trong DB</Tag>
  : <Tag color="warning">Đang nằm trong mã nguồn</Tag>;

export default function SystemConfiguration() {
  const [catalog, setCatalog] = useState({ sources: [], formulas: [], catalogs: [], rule_count: 0 });
  const [rules, setRules] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [entryForm] = Form.useForm();
  const [editingEntry, setEditingEntry] = useState(null);
  const [entryCategory, setEntryCategory] = useState('ACCOUNT_FORMULA');

  async function load() {
    setLoading(true);
    try {
      const [{ data: catalogData }, { data: ruleData }, { data: entryData }] = await Promise.all([
        client.get('/customer-processing/configuration-catalog'),
        client.get('/customer-processing/business-matching-rules'),
        client.get('/customer-processing/system-configuration-entries'),
      ]);
      setCatalog(catalogData || { sources: [], formulas: [], catalogs: [], rule_count: 0 });
      setRules(ruleData || []);
      setEntries(entryData || []);
    } catch (error) {
      message.error(error.response?.data?.detail || 'Không tải được cấu hình hệ thống');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openRule(row) {
    setEditing(row);
    form.setFieldsValue({
      ...row,
      service_codes: (row.service_codes || []).join(', '),
      effective_from: row.effective_from || '',
      effective_to: row.effective_to || '',
    });
  }

  function newRule() {
    setEditing({ isNew: true });
    form.resetFields();
    form.setFieldsValue({ source_type: 'BILLPAYMENT', priority: 100, active: true });
  }

  async function saveRule() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const payload = {
        ...values,
        service_codes: String(values.service_codes || '').split(',').map((item) => item.trim()).filter(Boolean),
        amount_equals: values.amount_equals ?? null,
        effective_from: values.effective_from || null,
        effective_to: values.effective_to || null,
        updated_by: 'system-admin',
      };
      if (editing.isNew) await client.post('/customer-processing/business-matching-rules', payload);
      else await client.put(`/customer-processing/business-matching-rules/${editing.id}`, payload);
      message.success('Đã cập nhật quy tắc nghiệp vụ');
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(id) {
    await client.delete(`/customer-processing/business-matching-rules/${id}`);
    message.success('Đã xóa quy tắc'); load();
  }

  function openEntry(category, row = null) {
    setEntryCategory(category); setEditingEntry(row || { isNew: true }); entryForm.resetFields();
    entryForm.setFieldsValue(row ? { ...row, config_value: JSON.stringify(row.config_value || {}, null, 2) }
      : { category, active: true, config_value: '{}', effective_from: '' });
  }

  async function saveEntry() {
    const values = await entryForm.validateFields();
    let configValue;
    try { configValue = JSON.parse(values.config_value || '{}'); } catch { message.error('Giá trị cấu hình phải là JSON hợp lệ'); return; }
    const payload = { ...values, category: entryCategory, config_value: configValue, updated_by: 'system-admin', effective_from: values.effective_from || null, effective_to: values.effective_to || null };
    setSaving(true);
    try {
      if (editingEntry.isNew) await client.post('/customer-processing/system-configuration-entries', payload);
      else await client.put(`/customer-processing/system-configuration-entries/${editingEntry.id}`, payload);
      message.success('Đã lưu cấu hình'); setEditingEntry(null); await load();
    } finally { setSaving(false); }
  }

  async function deleteEntry(id) {
    await client.delete(`/customer-processing/system-configuration-entries/${id}`);
    message.success('Đã xóa cấu hình'); load();
  }

  async function toggleRule(row, active) {
    await client.put(`/customer-processing/business-matching-rules/${row.id}`, { active, updated_by: 'system-admin' });
    message.success(active ? 'Đã bật quy tắc' : 'Đã tắt quy tắc');
    load();
  }

  const configuredCount = useMemo(() => rules.length + entries.length, [rules, entries]);

  const productTab = (
    <Card className="system-config-card">
      <div className="system-config-section-title"><div><Title level={4}>Quy tắc nhận diện sản phẩm/dịch vụ</Title><Text type="secondary">Thay đổi mã dịch vụ và mức tiền mà không phải sửa code.</Text></div><Button type="primary" icon={<PlusOutlined />} onClick={newRule}>Thêm quy tắc</Button></div>
      <Table loading={loading} rowKey="id" pagination={false} dataSource={rules} scroll={{ x: 1000 }} columns={[
        { title: 'Mã quy tắc', dataIndex: 'rule_code', width: 150, fixed: 'left', render: (value) => <Text strong>{value}</Text> },
        { title: 'Tên nghiệp vụ', dataIndex: 'rule_name', width: 190 },
        { title: 'Nguồn', dataIndex: 'source_type', width: 130, render: (value) => <Tag color="cyan">{value}</Tag> },
        { title: 'Mã dịch vụ', dataIndex: 'service_codes', width: 280, render: (values) => (values || []).map((value) => <Tag key={value}>{value}</Tag>) },
        { title: 'Số tiền điều kiện', dataIndex: 'amount_equals', width: 160, align: 'right', render: (value) => value == null ? 'Không giới hạn' : `${Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} đ` },
        { title: 'Hiệu lực', width: 190, render: (_, row) => `${row.effective_from || 'Không giới hạn'} → ${row.effective_to || '∞'}` },
        { title: 'Bật', dataIndex: 'active', width: 80, align: 'center', render: (value, row) => <Switch checked={value} onChange={(checked) => toggleRule(row, checked)} /> },
        { title: '', width: 110, fixed: 'right', render: (_, row) => <><Button icon={<EditOutlined />} onClick={() => openRule(row)} /><Popconfirm title="Xóa quy tắc này?" onConfirm={() => deleteRule(row.id)}><Button danger icon={<DeleteOutlined />} /></Popconfirm></> },
      ]} />
    </Card>
  );

  const entryTable = (category, title, note) => (
    <Card className="system-config-card">
      <div className="system-config-section-title"><div><Title level={4}>{title}</Title><Text type="secondary">{note}</Text></div><Button type="primary" icon={<PlusOutlined />} onClick={() => openEntry(category)}>Thêm cấu hình</Button></div>
      <Alert showIcon type="info" message="Thay đổi được lưu trong DB và có lịch sử hiệu lực. Quy tắc Bill Payment đã đọc cấu hình động; các công thức cũ sẽ được chuyển khỏi code theo từng nhóm trước khi dùng để tính lại dữ liệu." />
      <Table loading={loading} rowKey="id" pagination={false} dataSource={entries.filter((item) => item.category === category)} scroll={{ x: 950 }} columns={[
        { title: 'Mã cấu hình', dataIndex: 'config_code', width: 180, render: (value) => <Text strong>{value}</Text> },
        { title: 'Tên cấu hình', dataIndex: 'config_name', width: 220 },
        { title: 'Nguồn', dataIndex: 'source_type', width: 110, render: (value) => <Tag color="purple">{value || 'Chung'}</Tag> },
        { title: 'Giá trị', dataIndex: 'config_value', width: 330, render: (value) => <Text code className="system-config-json">{JSON.stringify(value)}</Text> },
        { title: 'Bật', dataIndex: 'active', width: 70, render: (value) => <Switch checked={value} disabled /> },
        { title: '', width: 110, fixed: 'right', render: (_, row) => <><Button icon={<EditOutlined />} onClick={() => openEntry(category, row)} /><Popconfirm title="Xóa cấu hình này?" onConfirm={() => deleteEntry(row.id)}><Button danger icon={<DeleteOutlined />} /></Popconfirm></> },
      ]} />
    </Card>
  );

  return (
    <div className="system-configuration-page">
      <div className="system-config-header">
        <div><Text className="system-config-kicker">QUẢN TRỊ HỆ THỐNG</Text><Title level={2}>Cấu hình hệ thống</Title><Text type="secondary">Quản lý nguồn dữ liệu, quy tắc sản phẩm, công thức và danh mục nghiệp vụ tập trung.</Text></div>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Tải lại</Button>
      </div>
      <Row gutter={[14, 14]} className="system-config-metrics">
        <Col xs={12} lg={8}><Card><Statistic title="Quy tắc sản phẩm" value={rules.length} prefix={<AppstoreOutlined />} /></Card></Col>
        <Col xs={12} lg={8}><Card><Statistic title="Tài khoản và công thức" value={entries.filter((i) => i.category === 'ACCOUNT_FORMULA').length} prefix={<CalculatorOutlined />} /></Card></Col>
        <Col xs={12} lg={8}><Card><Statistic title="Tổng cấu hình trong DB" value={configuredCount} prefix={<SettingOutlined />} /></Card></Col>
      </Row>
      <Tabs className="system-config-tabs" items={[
        { key: 'products', label: 'Cấu hình sản phẩm/dịch vụ', children: productTab },
        { key: 'formulas', label: 'Cấu hình tài khoản và công thức', children: entryTable('ACCOUNT_FORMULA', 'Tài khoản và công thức', 'Điều kiện tài khoản, nhóm nợ, tỷ lệ và biểu thức tính.') },
        { key: 'catalogs', label: 'Cấu hình danh mục nghiệp vụ', children: entryTable('BUSINESS_CATALOG', 'Danh mục nghiệp vụ', 'Loại vay, trạng thái hoạt động, ngưỡng và nhóm khách hàng.') },
      ]} />
      <Modal open={Boolean(editing)} onCancel={() => setEditing(null)} onOk={saveRule} confirmLoading={saving} title={editing?.isNew ? 'Thêm quy tắc sản phẩm' : `Cập nhật ${editing?.rule_code || ''}`} width={680}>
        <Form form={form} layout="vertical">
          {editing?.isNew ? <><Form.Item name="rule_code" label="Mã quy tắc" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="source_type" label="Nguồn"><Input /></Form.Item></> : null}
          <Form.Item name="rule_name" label="Tên nghiệp vụ" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="service_codes" label="Mã dịch vụ (phân cách bằng dấu phẩy)" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
          <Row gutter={12}><Col span={12}><Form.Item name="amount_equals" label="Số tiền điều kiện"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col><Col span={12}><Form.Item name="priority" label="Độ ưu tiên"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col></Row>
          <Row gutter={12}><Col span={12}><Form.Item name="effective_from" label="Hiệu lực từ (YYYY-MM-DD)"><Input /></Form.Item></Col><Col span={12}><Form.Item name="effective_to" label="Hiệu lực đến"><Input /></Form.Item></Col></Row>
          <Form.Item name="description" label="Mô tả"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
      <Modal open={Boolean(editingEntry)} onCancel={() => setEditingEntry(null)} onOk={saveEntry} confirmLoading={saving} title={editingEntry?.isNew ? 'Thêm cấu hình' : `Cập nhật ${editingEntry?.config_code || ''}`} width={720}>
        <Form form={entryForm} layout="vertical">
          {editingEntry?.isNew ? <Form.Item name="config_code" label="Mã cấu hình" rules={[{ required: true }]}><Input /></Form.Item> : null}
          <Form.Item name="config_name" label="Tên cấu hình" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="source_type" label="Nguồn dữ liệu"><Input /></Form.Item>
          <Form.Item name="config_value" label="Giá trị cấu hình (JSON)" rules={[{ required: true }]}><Input.TextArea rows={8} className="system-config-json-editor" /></Form.Item>
          <Row gutter={12}><Col span={12}><Form.Item name="effective_from" label="Hiệu lực từ"><Input placeholder="YYYY-MM-DD" /></Form.Item></Col><Col span={12}><Form.Item name="effective_to" label="Hiệu lực đến"><Input placeholder="YYYY-MM-DD" /></Form.Item></Col></Row>
          <Form.Item name="active" label="Đang áp dụng" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="description" label="Mô tả"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
