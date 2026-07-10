import { useMemo } from 'react';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  ExpandOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Col, Descriptions, Modal, Row, Space, Tag, Tooltip, Typography } from 'antd';

import { ACTIVE_SERVICES, SERVICE_DEFS } from '../../constants/services';
import { money } from '../../utils/customerMetrics';
import { countUsedServices } from '../../utils/reportHelpers';

const { Text } = Typography;

export default function CustomerDetailModal({ customer, open, onClose }) {
  const usedCount = useMemo(() => (customer ? countUsedServices(customer) : 0), [customer]);
  if (!customer) return null;

  const usedSvcs = SERVICE_DEFS.filter((s) => !s.pending && Number(customer[s.key] || 0) > 0);
  const unusedSvcs = SERVICE_DEFS.filter((s) => !s.pending && Number(customer[s.key] || 0) === 0);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={<Button onClick={onClose}>Đóng</Button>}
      width="96vw"
      style={{ top: 20 }}
      styles={{ body: { maxHeight: '85vh', overflow: 'auto' } }}
      title={
        <Space>
          <UserOutlined />
          <span>{customer.ten_kh}</span>
          <Tag color="volcano">{customer.ma_kh_chuan}</Tag>
          <Tag color="blue">{customer.loai_khach_hang}</Tag>
        </Space>
      }
      destroyOnHidden
    >
      <Row gutter={[10, 10]} style={{ marginBottom: 12 }}>
        {[
          { label: 'Dư nợ vay', value: customer.so_du_tien_vay, color: '#3b82f6' },
          { label: 'Tiền gửi CKH', value: customer.so_du_tien_gui_ckh, color: '#10b981' },
          { label: 'TGTT bình quân', value: customer.so_du_tgtt_binh_quan, color: '#06b6d4' },
          { label: 'Dịch vụ đã dùng', value: `${usedCount}/${ACTIVE_SERVICES.length}`, color: '#7c3aed' },
        ].map((item) => (
          <Col xs={24} md={6} key={item.label}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px', borderLeft: `3px solid ${item.color}` }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>{item.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{typeof item.value === 'number' ? `${money(item.value)} đ` : item.value}</div>
            </div>
          </Col>
        ))}
      </Row>

      <Descriptions bordered size="small" column={{ xs: 1, md: 2 }} style={{ marginBottom: 12 }}>
        <Descriptions.Item label="Mã CN">{customer.ma_cn}</Descriptions.Item>
        <Descriptions.Item label="PGD">{customer.ma_pgd || '—'}</Descriptions.Item>
        <Descriptions.Item label="Loại vay">{customer.loai_vay || '—'}</Descriptions.Item>
        <Descriptions.Item label="Cán bộ">{customer.ten_can_bo || '—'} {customer.ma_cb ? `(${customer.ma_cb})` : ''}</Descriptions.Item>
        <Descriptions.Item label="SĐT">{customer.telephone || '—'}</Descriptions.Item>
        <Descriptions.Item label="Ghi chú">{customer.ghi_chu || '—'}</Descriptions.Item>
      </Descriptions>

      <div style={{ fontSize: 12, background: '#f8fafc', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
        <div style={{ marginBottom: 6 }}>
          <CheckCircleFilled style={{ color: '#15803d' }} /> Đang sử dụng ({usedSvcs.length}): {usedSvcs.map((s) => s.label).join(', ') || '—'}
        </div>
        <div>
          <CloseCircleFilled style={{ color: '#be123c' }} /> Chưa sử dụng ({unusedSvcs.length}): {unusedSvcs.map((s) => s.label).join(', ') || '—'}
        </div>
      </div>
    </Modal>
  );
}
