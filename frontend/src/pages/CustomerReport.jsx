import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Empty,
  Form,
  Input,
  Modal,
  Popover,
  Row,
  Select,
  Segmented,
  Space,
  Statistic,
  Table,
  Tag,
  Tabs,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  AimOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  ClockCircleOutlined,
  DownloadOutlined,
  ExpandOutlined,
  FieldTimeOutlined,
  FilterOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  RiseOutlined,
  SearchOutlined,
  TeamOutlined,
  TrophyOutlined,
  UserOutlined,
  WalletOutlined,
  BankOutlined,
  WarningOutlined,
} from '@ant-design/icons';

import client from '../api/client';
import VisualDashboard from '../components/dashboard/VisualDashboard';
import { getScopeLabel, toApiBranchParams } from '../auth';
import {
  ACTIVE_SERVICES,
  GROUP_COLORS,
  SERVICE_BY_GROUP,
  SERVICE_DEFS,
  SERVICE_GROUPS_ORDER,
  TOTAL_SERVICES,
} from '../constants/services';
import {
  CN_NAMES,
  PGD_NAMES,
} from '../constants/branches';
import { useBranchFilters } from '../hooks/useBranchFilters';
import {
  countUsed,
  getPendingServices,
  getUnusedServices,
  getUsedServices,
  money,
} from '../utils/customerMetrics';

const { Paragraph, Text, Title } = Typography;

// ─── Định nghĩa tất cả dịch vụ ────────────────────────────────────────────────
const SERVICE_DEFS = [
  { key: 'thau_chi',             label: 'Thấu chi',             group: 'Tài khoản',       pending: false },
  { key: 'tk_so_dep',            label: 'TK số đẹp',            group: 'Tài khoản',       pending: false },
  { key: 'agribank_plus',        label: 'Agribank Plus',        group: 'Digital',         pending: false },
  { key: 'tin_nhan_ott',         label: 'Tin nhắn OTT',         group: 'Digital',         pending: false },
  { key: 'e_banking',            label: 'e-Banking',            group: 'Digital',         pending: true  },
  { key: 'sms_nhac_no_vay',      label: 'SMS nhắc nợ vay',      group: 'Digital',         pending: false },
  { key: 'sms_tien_gui',         label: 'SMS tiền gửi',         group: 'Digital',         pending: false },
  { key: 'the_ghi_no_noi_dia',   label: 'Thẻ ghi nợ nội địa',  group: 'Thẻ',             pending: false },
  { key: 'the_td_quoc_te',       label: 'Thẻ TD quốc tế',      group: 'Thẻ',             pending: false },
  { key: 'the_td_loc_viet',      label: 'Thẻ TD Lộc Việt',     group: 'Thẻ',             pending: true  },
  { key: 'tt_tien_dien',         label: 'TT tiền điện',         group: 'Thanh toán',      pending: true  },
  { key: 'tt_tien_nuoc',         label: 'TT tiền nước',         group: 'Thanh toán',      pending: true  },
  { key: 'tt_cuoc_vien_thong',   label: 'TT cước viễn thông',  group: 'Thanh toán',      pending: true  },
  { key: 'tra_luong_qua_the',    label: 'Trả lương qua thẻ',   group: 'Thanh toán',      pending: true  },
  { key: 'batd',                 label: 'BATD',                 group: 'Bảo hiểm',        pending: true  },
  { key: 'batk',                 label: 'BATK',                 group: 'Bảo hiểm',        pending: true  },
  { key: 'bh_oto_xe_may',        label: 'BH ô tô, xe máy',     group: 'Bảo hiểm',        pending: true  },
  { key: 'bh_khac',              label: 'BH khác',              group: 'Bảo hiểm',        pending: true  },
  { key: 'bao_lanh',             label: 'Bảo lãnh',             group: 'Bảo lãnh/TTQT',  pending: true  },
  { key: 'loa_bien_dong_so_du',  label: 'Loa biến động số dư', group: 'Khác',            pending: true  },
  { key: 'phan_mem_ban_hang',    label: 'Phần mềm bán hàng',   group: 'Khác',            pending: true  },
  { key: 'pos',                  label: 'POS',                  group: 'Khác',            pending: true  },
  { key: 'chi_tra_kieu_hoi',     label: 'Chi trả kiều hối',    group: 'Bảo lãnh/TTQT',  pending: true  },
  { key: 'phat_hanh_lc',         label: 'Phát hành LC',         group: 'Bảo lãnh/TTQT',  pending: true  },
  { key: 'thanh_toan_quoc_te',   label: 'Thanh toán quốc tế',  group: 'Bảo lãnh/TTQT',  pending: true  },
  { key: 'mua_ban_ngoai_te',     label: 'Mua bán ngoại tệ',    group: 'Bảo lãnh/TTQT',  pending: true  },
];

const TOTAL_SERVICES = SERVICE_DEFS.length;
const ACTIVE_SERVICES = SERVICE_DEFS.filter((s) => !s.pending);

// Nhóm dịch vụ theo category để hiển thị mini-grid
const SERVICE_GROUPS_ORDER = ['Tài khoản', 'Digital', 'Thẻ', 'Thanh toán', 'Bảo hiểm', 'Bảo lãnh/TTQT', 'Khác'];
const SERVICE_BY_GROUP = SERVICE_GROUPS_ORDER.reduce((acc, g) => {
  acc[g] = ACTIVE_SERVICES.filter((s) => s.group === g);
  return acc;
}, {});

// ─── Tính điểm tiềm năng (dư nợ + dư gửi + CASA, quy về đơn vị triệu) ─────────
function calcTiemNang(row) {
  const loan    = Number(row.so_du_tien_vay || 0);
  const deposit = Number(row.so_du_tien_gui_ckh || 0);
  const casa    = Number(row.so_du_tgtt_binh_quan || 0);
  return loan + deposit + casa; // đơn vị đồng, sort sẽ so sánh trực tiếp
}

// Label phân hạng tiềm năng
function tiemNangTag(score) {
  if (score >= 500_000_000) return { label: 'VIP', color: '#d4380d',  bg: '#fff2e8' };
  if (score >= 100_000_000) return { label: 'Cao', color: '#7c3aed',  bg: '#f5f3ff' };
  if (score >= 10_000_000)  return { label: 'TB',  color: '#0369a1',  bg: '#f0f9ff' };
  return                           { label: 'Thấp', color: '#64748b', bg: '#f8fafc' };
}

function ServiceMiniGrid({ row, onUnusedClick }) {
  const used  = countUsed(row);
  const total = ACTIVE_SERVICES.length;
  const ratio = total === 0 ? 0 : used / total;
  const badgeColor = ratio === 0 ? '#ef4444' : ratio < 0.4 ? '#f97316' : ratio < 0.7 ? '#eab308' : '#22c55e';

  // Nội dung popover: grid dots theo nhóm
  const popoverContent = (
    <div style={{ width: 320 }}>
      {SERVICE_GROUPS_ORDER.map((group) => {
        const svcs = SERVICE_BY_GROUP[group];
        if (!svcs || svcs.length === 0) return null;
        const groupColor = GROUP_COLORS[group] || '#64748b';
        return (
          <div key={group} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: groupColor, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              {group}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {svcs.map((s) => {
                const active = Number(row[s.key] || 0) > 0;
                return (
                  <Tooltip key={s.key} title={s.label} mouseEnterDelay={0.1}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        padding: '2px 7px',
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 500,
                        background: active ? `${groupColor}18` : '#f1f5f9',
                        color: active ? groupColor : '#94a3b8',
                        border: `1px solid ${active ? groupColor + '55' : '#e2e8f0'}`,
                        cursor: 'default',
                      }}
                    >
                      {active
                        ? <CheckCircleFilled style={{ fontSize: 10, color: groupColor }} />
                        : <CloseCircleFilled style={{ fontSize: 10, color: '#cbd5e1' }} />}
                      {s.label}
                    </span>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        );
      })}
      <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: 8, marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#64748b' }}>
          Đã dùng: <strong style={{ color: badgeColor }}>{used}</strong> / {total} dịch vụ
        </span>
        <button
          onClick={onUnusedClick}
          style={{
            background: '#fff1f0', border: '1px solid #fca5a5', color: '#c0392b',
            borderRadius: 6, padding: '2px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600,
          }}
        >
          🎯 Bán chéo
        </button>
      </div>
    </div>
  );

  // Inline mini dots – chỉ hiện grouped squares nhỏ
  const inlineDots = SERVICE_GROUPS_ORDER.map((group) => {
    const svcs = SERVICE_BY_GROUP[group];
    if (!svcs || svcs.length === 0) return null;
    const groupColor = GROUP_COLORS[group] || '#64748b';
    return (
      <span key={group} style={{ display: 'inline-flex', gap: 2, marginRight: 3 }}>
        {svcs.map((s) => {
          const active = Number(row[s.key] || 0) > 0;
          return (
            <span
              key={s.key}
              style={{
                width: 8, height: 8,
                borderRadius: 2,
                background: active ? groupColor : '#e2e8f0',
                display: 'inline-block',
              }}
            />
          );
        })}
      </span>
    );
  });

  return (
    <Popover
      content={popoverContent}
      title={
        <span style={{ fontSize: 13 }}>
          📋 Tình hình dịch vụ
        </span>
      }
      trigger="click"
      placement="bottomLeft"
      overlayStyle={{ maxWidth: 360 }}
    >
      <div className="svc-mini-cell">
        {/* Badge đếm */}
        <span
          className="svc-count-badge"
          style={{ background: `${badgeColor}18`, color: badgeColor, border: `1px solid ${badgeColor}55` }}
        >
          {used}/{total}
        </span>
        {/* Mini dot strip */}
        <div className="svc-dot-strip">
          {inlineDots}
        </div>
      </div>
    </Popover>
  );
}

function sourceTag(source) {
  const colors = { DP01: 'gold', LN01: 'volcano', PF14: 'cyan', CN05: 'green', MANUAL: 'default' };
  return <Tag color={colors[source] || 'default'}>{source}</Tag>;
}

const sourceGroups = [
  { label: 'Thông tin KH', source: 'DP01', note: 'Mã CN, mã KH, tên KH, loại KH, PGD' },
  { label: 'Tiền gửi', source: 'DP01', note: 'Số dư tiền gửi, doanh số DR/CR' },
  { label: 'Khoản vay', source: 'LN01', note: 'Dư nợ, loại vay, cán bộ quản lý' },
  { label: 'CASA bình quân', source: 'PF14', note: 'Số dư TGTT bình quân trong tháng' },
  { label: 'Dịch vụ', source: 'CN05', note: 'Thấu chi, số đẹp, Agribank Plus, SMS, thẻ' },
  { label: 'Bổ sung', source: 'MANUAL', note: 'Các cột chưa có nguồn rõ sẽ nhập/mapping sau' },
];

const sourceStatusMeta = {
  ready: { label: 'Sẵn sàng', color: 'success' },
  partial: { label: 'Một phần', color: 'warning' },
  processing: { label: 'Đang xử lý', color: 'processing' },
  error: { label: 'Lỗi', color: 'error' },
  missing: { label: 'Thiếu dữ liệu', color: 'default' },
  planned: { label: 'Sẽ bổ sung', color: 'blue' },
};

function formatFileSize(value) {
  const bytes = Number(value || 0);
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

// ─── Modal Chi tiết khách hàng ─────────────────────────────────────────────────
function CustomerDetailModal({ customer, open, onClose }) {
  const [fullscreen, setFullscreen] = useState(false);
  if (!customer) return null;

  const usedServices   = getUsedServices(customer);
  const pendingSvcs    = getPendingServices();
  const usedCount      = usedServices.length;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={fullscreen ? '100vw' : '98vw'}
      style={fullscreen ? { top: 0, padding: 0, maxWidth: '100vw' } : { top: 20 }}
      styles={fullscreen ? { body: { height: 'calc(100vh - 55px)', overflow: 'auto', padding: '16px 8px', overflowX: 'hidden' } } : { body: { maxHeight: '85vh', overflow: 'auto', padding: '16px 8px', overflowX: 'hidden' } }}
      title={
        <div className="modal-title-bar">
          <Space>
            <UserOutlined />
            <span className="modal-kh-name">{customer.ten_kh}</span>
            <Tag color="volcano">{customer.ma_kh_chuan}</Tag>
            <Tag color="blue">{customer.loai_khach_hang}</Tag>
          </Space>
          <Tooltip title={fullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}>
            <Button
              type="text"
              icon={<ExpandOutlined />}
              onClick={() => setFullscreen((v) => !v)}
              className="modal-fullscreen-btn"
            />
          </Tooltip>
        </div>
      }
      destroyOnHidden
    >
      <div className="detail-overview">
        <Row gutter={[10, 10]} style={{ marginBottom: 8 }}>
          <Col xs={24} md={6}>
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '6px 12px',
              borderLeft: '3px solid #3b82f6',
              boxShadow: '0 1px 2px rgba(0,0,0,0.01)'
            }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Dư nợ vay</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1e3a8a' }}>
                {money(customer.so_du_tien_vay) || 0} <span style={{ fontSize: 10 }}>đ</span>
              </div>
            </div>
          </Col>
          <Col xs={24} md={6}>
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '6px 12px',
              borderLeft: '3px solid #10b981',
              boxShadow: '0 1px 2px rgba(0,0,0,0.01)'
            }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Tiền gửi CKH</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#064e3b' }}>
                {money(customer.so_du_tien_gui_ckh) || 0} <span style={{ fontSize: 10 }}>đ</span>
              </div>
            </div>
          </Col>
          <Col xs={24} md={6}>
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '6px 12px',
              borderLeft: '3px solid #06b6d4',
              boxShadow: '0 1px 2px rgba(0,0,0,0.01)'
            }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>TGTT bình quân</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#164e63' }}>
                {money(customer.so_du_tgtt_binh_quan) || 0} <span style={{ fontSize: 10 }}>đ</span>
              </div>
            </div>
          </Col>
          <Col xs={24} md={6}>
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '6px 12px',
              borderLeft: '3px solid #7c3aed',
              boxShadow: '0 1px 2px rgba(0,0,0,0.01)'
            }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Dịch vụ đã dùng</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#5b21b6' }}>
                {usedCount} <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>/ {TOTAL_SERVICES - pendingSvcs.length}</span>
              </div>
            </div>
          </Col>
        </Row>

        <Descriptions
          bordered
          size="small"
          column={{ xs: 1, md: 2 }}
          labelStyle={{ fontWeight: 600, background: '#faf7f5', padding: '4px 8px', fontSize: 11 }}
          contentStyle={{ padding: '4px 8px', fontSize: 11 }}
          style={{ marginBottom: 8 }}
        >
          <Descriptions.Item label="Mã KH chuẩn">{customer.ma_kh_chuan}</Descriptions.Item>
          <Descriptions.Item label="Mã CN">{customer.ma_cn}</Descriptions.Item>
          <Descriptions.Item label="Loại KH">{customer.loai_khach_hang}</Descriptions.Item>
          <Descriptions.Item label="Loại vay">{customer.loai_vay || '—'}</Descriptions.Item>
          <Descriptions.Item label="Số điện thoại">{customer.telephone || '—'}</Descriptions.Item>
          <Descriptions.Item label="Cán bộ phụ trách">
            {customer.ten_can_bo || '—'} {customer.ma_cb ? `(${customer.ma_cb})` : ''}
          </Descriptions.Item>
          <Descriptions.Item label="Doanh số chuyển tiền về TK" span={2}>
            {money(customer.doanh_so_chuyen_tien_ve_tai_khoan)} đ
          </Descriptions.Item>
          <Descriptions.Item label="Ghi chú" span={2}>
            {customer.ghi_chu || <Text type="secondary">Chưa có ghi chú</Text>}
          </Descriptions.Item>
        </Descriptions>
        
        <ServiceDetailView customer={customer} />
      </div>
    </Modal>
  );
}

// ─── Modal quick-view Dịch vụ chưa dùng ───────────────────────────────────────
function UnusedServicesModal({ customer, open, onClose }) {
  if (!customer) return null;
  const unusedServices = getUnusedServices(customer);
  const groupBy = (arr) =>
    arr.reduce((acc, s) => {
      (acc[s.group] = acc[s.group] || []).push(s);
      return acc;
    }, {});
  const unusedByGroup = groupBy(unusedServices);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={<Button onClick={onClose}>Đóng</Button>}
      width={640}
      title={
        <Space>
          <AimOutlined style={{ color: '#c0392b' }} />
          <span>Cơ hội bán chéo</span>
          <Tag color="volcano">{customer.ten_kh}</Tag>
        </Space>
      }
      destroyOnHidden
    >
      {unusedServices.length === 0 ? (
        <Tag color="success" style={{ fontSize: 14, padding: '6px 14px' }}>
          🎉 KH đã sử dụng đầy đủ dịch vụ có dữ liệu!
        </Tag>
      ) : (
        <>
          <div className="unused-banner">
            <AimOutlined /> <strong>{unusedServices.length} dịch vụ</strong> chưa khai thác
          </div>
          {Object.entries(unusedByGroup).map(([group, svcs]) => (
            <div key={group} className="service-group">
              <Text strong className="service-group-title">
                {group}
              </Text>
              <div className="service-chip-row">
                {svcs.map((s) => (
                  <Tag key={s.key} color="error" className="service-chip">
                    {s.label}
                  </Tag>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}

// ─── Bảng chi tiết tình hình sử dụng SPDV (Thiết kế ngang 2 hàng tinh tế, cân đối cột) ──────────────────────────
function ServiceDetailView({ customer }) {
  if (!customer) return null;

  const usedSvcs = [];
  const unusedSvcs = [];
  SERVICE_DEFS.forEach(s => {
    if (s.pending) return;
    if (Number(customer[s.key] || 0) > 0) usedSvcs.push(s.label);
    else unusedSvcs.push(s.label);
  });

  const row1Groups = ['Tài khoản', 'Digital', 'Thẻ', 'Thanh toán'];
  const row2Groups = ['Bảo hiểm', 'Bảo lãnh/TTQT', 'Khác'];

  const renderGroupBox = (group) => {
    const svcs = SERVICE_DEFS.filter(s => s.group === group);
    if (!svcs.length) return null;
    const color = GROUP_COLORS[group] || '#1890ff';

    return (
      <div key={group} style={{
        gridColumn: `span ${svcs.length}`,
        border: `1px solid ${color}35`,
        borderRadius: 6,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
      }}>
        {/* Header của Nhóm */}
        <div style={{
          backgroundColor: `${color}09`,
          borderBottom: `1px solid ${color}15`,
          padding: '3px 6px',
          textAlign: 'center',
          fontWeight: 800,
          fontSize: 10,
          color: color,
          textTransform: 'uppercase',
          letterSpacing: '0.3px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {group}
        </div>
        {/* Hàng chứa các dịch vụ con */}
        <div style={{ display: 'flex', flex: 1 }}>
          {svcs.map((s, idx) => {
            const active = Number(customer[s.key] || 0) > 0;
            return (
              <div key={s.key} style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                borderRight: idx < svcs.length - 1 ? '1px solid #f1f5f9' : 'none'
              }}>
                {/* Tiêu đề dịch vụ */}
                <div style={{
                  padding: '3px 4px',
                  fontSize: 9,
                  fontWeight: 600,
                  color: '#475569',
                  textAlign: 'center',
                  backgroundColor: '#fafafa',
                  borderBottom: '1px solid #f1f5f9',
                  lineHeight: 1.1,
                  minHeight: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {s.label}
                </div>
                {/* Trạng thái sử dụng */}
                <div style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '3px 4px',
                  minHeight: 24
                }}>
                  {s.pending ? (
                    <span style={{ fontSize: 9, fontStyle: 'italic', color: '#94a3b8' }}>Chờ DL</span>
                  ) : active ? (
                    <CheckCircleFilled style={{ color: '#15803d', fontSize: 14 }} />
                  ) : (
                    <span style={{ color: '#cbd5e1' }}>—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: 8 }}>
      {/* Tổng hợp text 2 hàng */}
      <div style={{ fontSize: 12, background: '#f8fafc', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', lineHeight: 1.4, marginBottom: 8 }}>
        <Row gutter={[16, 4]}>
          <Col span={24} style={{ display: 'flex', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 600, color: '#15803d', whiteSpace: 'nowrap', marginRight: 8 }}>
              <CheckCircleFilled /> Đang sử dụng ({usedSvcs.length}):
            </span>
            <span style={{ color: '#0f172a' }}>
              {usedSvcs.join(', ') || <Text type="secondary">Chưa sử dụng dịch vụ nào</Text>}
            </span>
          </Col>
          <Col span={24} style={{ display: 'flex', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 600, color: '#be123c', whiteSpace: 'nowrap', marginRight: 8 }}>
              <CloseCircleFilled /> Chưa sử dụng ({unusedSvcs.length}):
            </span>
            <span style={{ color: '#64748b' }}>
              {unusedSvcs.join(', ') || <Text type="secondary">Đã sử dụng tất cả</Text>}
            </span>
          </Col>
        </Row>
      </div>
      
      {/* Hàng 1 - 14 columns grid với gap */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14, 1fr)', gap: '8px', width: '100%', marginBottom: 8 }}>
        {row1Groups.map((g) => renderGroupBox(g))}
      </div>

      {/* Hàng 2 - 14 columns grid với gap */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14, 1fr)', gap: '8px', width: '100%', marginBottom: 0 }}>
        {row2Groups.map((g) => renderGroupBox(g))}
      </div>
    </div>
  );
}

// ─── Cột bảng chính – KHỚP VỚI MẪU EXCEL (các cột màu xanh) ──────────────────────────
// ─── Cột bảng chính – KHỚP VỚI MẪU EXCEL (các cột màu xanh) ──────────────────────────
function buildColumns(onDetailClick, onUnusedClick) {
  return [
    {
      title: 'STT',
      key: 'stt',
      width: 44,
      align: 'center',
      render: (_, __, index) => <Text type="secondary" style={{ fontSize: 11 }}>{index + 1}</Text>,
    },
    {
      title: 'Mã CN',
      dataIndex: 'ma_cn',
      key: 'ma_cn',
      width: 120,
      align: 'center',
      sorter: (a, b) => (a.ma_cn || '').localeCompare(b.ma_cn || ''),
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text>,
    },
    {
      title: 'Tên CN',
      key: 'ten_cn',
      width: 160,
      sorter: (a, b) => {
        const nameA = CN_NAMES[a.ma_cn] || a.ma_cn || '';
        const nameB = CN_NAMES[b.ma_cn] || b.ma_cn || '';
        return nameA.localeCompare(nameB);
      },
      render: (_, row) => (
        <Text style={{ fontSize: 12 }}>
          {String(row.ma_cn || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
            .map((code) => CN_NAMES[code] || code)
            .join(', ') || '—'}
        </Text>
      ),
    },
    {
      title: 'PGD',
      dataIndex: 'ma_pgd',
      key: 'ma_pgd',
      width: 120,
      align: 'center',
      sorter: (a, b) => (a.ma_pgd || '').localeCompare(b.ma_pgd || ''),
      render: (v) => <Text style={{ fontSize: 12 }}>{PGD_NAMES[v]?.name || v || '—'}</Text>,
    },
    {
      title: 'Mã KH chuẩn',
      dataIndex: 'ma_kh_chuan',
      key: 'ma_kh_chuan',
      width: 120,
      fixed: 'left',
      sorter: (a, b) => (a.ma_kh_chuan || '').localeCompare(b.ma_kh_chuan || ''),
      render: (v) => <Text code style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: 'Tên khách hàng',
      dataIndex: 'ten_kh',
      key: 'ten_kh',
      width: 210,
      fixed: 'left',
      sorter: (a, b) => (a.ten_kh || '').localeCompare(b.ten_kh || ''),
      render: (v, row) => (
        <Button type="link" size="small" className="kh-name-link" onClick={() => onDetailClick(row)}>
          {v || '—'}
        </Button>
      ),
    },


    {
      title: 'Loại KH',
      dataIndex: 'loai_khach_hang',
      key: 'loai_khach_hang',
      width: 100,
      align: 'center',
      sorter: (a, b) => (a.loai_khach_hang || '').localeCompare(b.loai_khach_hang || ''),
      render: (v) => v ? <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Số dư tiền vay',
      dataIndex: 'so_du_tien_vay',
      key: 'so_du_tien_vay',
      width: 130,
      align: 'right',
      sorter: (a, b) => Number(a.so_du_tien_vay || 0) - Number(b.so_du_tien_vay || 0),
      render: (v) => <Text style={{ fontSize: 12 }}>{money(v) || <span style={{ color: '#cbd5e1' }}>—</span>}</Text>,
    },
    {
      title: 'Số dư gửi CKH',
      dataIndex: 'so_du_tien_gui_ckh',
      key: 'so_du_tien_gui_ckh',
      width: 130,
      align: 'right',
      sorter: (a, b) => Number(a.so_du_tien_gui_ckh || 0) - Number(b.so_du_tien_gui_ckh || 0),
      render: (v) => <Text style={{ fontSize: 12 }}>{money(v) || <span style={{ color: '#cbd5e1' }}>—</span>}</Text>,
    },
    {
      title: 'Loại vay',
      dataIndex: 'loai_vay',
      key: 'loai_vay',
      width: 120,
      sorter: (a, b) => (a.loai_vay || '').localeCompare(b.loai_vay || ''),
      render: (v) => v
        ? <Tag style={{ fontSize: 11, margin: 0 }}>{v}</Tag>
        : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>,
    },
    {
      title: 'DS chuyển tiền về TK',
      dataIndex: 'doanh_so_chuyen_tien_ve_tai_khoan',
      key: 'dsctt',
      width: 140,
      align: 'right',
      sorter: (a, b) => Number(a.doanh_so_chuyen_tien_ve_tai_khoan || 0) - Number(b.doanh_so_chuyen_tien_ve_tai_khoan || 0),
      render: (v) => <Text style={{ fontSize: 12 }}>{money(v) || <span style={{ color: '#cbd5e1' }}>—</span>}</Text>,
    },
    {
      title: 'Số dư TGTT BQ',
      dataIndex: 'so_du_tgtt_binh_quan',
      key: 'so_du_tgtt_binh_quan',
      width: 130,
      align: 'right',
      sorter: (a, b) => Number(a.so_du_tgtt_binh_quan || 0) - Number(b.so_du_tgtt_binh_quan || 0),
      render: (v) => <Text style={{ fontSize: 12 }}>{money(v) || <span style={{ color: '#cbd5e1' }}>—</span>}</Text>,
    },
    {
      title: 'Tổng lợi ích',
      dataIndex: 'tong_loi_ich_thang',
      key: 'tong_loi_ich_thang',
      width: 100,
      align: 'center',
      sorter: (a, b) => Number(a.tong_loi_ich_thang || 0) - Number(b.tong_loi_ich_thang || 0),
      render: () => <Tag style={{ fontSize: 10 }}><ClockCircleOutlined /> Chờ</Tag>,
    },
    {
      title: 'Cán bộ quản lý',
      key: 'can_bo',
      width: 170,
      sorter: (a, b) => (a.ten_can_bo || '').localeCompare(b.ten_can_bo || ''),
      render: (_, row) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 500 }}>
            {row.ten_can_bo || <Text type="secondary" style={{ fontSize: 11 }}>—</Text>}
          </div>
          {row.ma_cb && <Text type="secondary" style={{ fontSize: 10 }}>{row.ma_cb}</Text>}
        </div>
      ),
    },
    {
      title: 'Ghi chú',
      dataIndex: 'ghi_chu',
      key: 'ghi_chu',
      width: 170,
      sorter: (a, b) => countUsed(a) - countUsed(b),
      render: (v, row) => {
        const used = countUsed(row);
        const total = ACTIVE_SERVICES.length;
        const ratio = total === 0 ? 0 : used / total;
        const color = ratio === 0 ? '#be123c' : ratio < 0.4 ? '#c2410c' : ratio < 0.7 ? '#b45309' : '#15803d';
        return (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color }}>
              SPDV: {used}/{total}
            </div>
            {v && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{v}</div>}
          </div>
        );
      },
    },
  ];
}


// ─── Component chính ───────────────────────────────────────────────────────────
function CustomerReport() {
  const [form] = Form.useForm();
  const [rows, setRows] = useState([]);
  const [sourceRows, setSourceRows] = useState([]);
  const [reportPeriods, setReportPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [reportPagination, setReportPagination] = useState({ current: 1, pageSize: 25, total: 0 });
  const [reportSummary, setReportSummary] = useState({
    total_customers: 0,
    total_loan: 0,
    total_deposit: 0,
    total_casa: 0,
    no_service_customers: 0,
  });
  const [loading, setLoading] = useState(false);
  const [reportReady, setReportReady] = useState(false);
  const [viewMode, setViewMode] = useState('report');
  const [searchText, setSearchText] = useState('');
  const [filterOfficer, setFilterOfficer] = useState(null);   // mã CB
  const [filterUnusedSvc, setFilterUnusedSvc] = useState(null); // key dịch vụ chưa dùng
  const [filterCn, setFilterCn] = useState(null);               // mã CN
  const [filterPgd, setFilterPgd] = useState(null);             // mã PGD

  const handlePgdChange = (val) => {
    setFilterPgd(val);
    if (val) {
      const pgdInfo = PGD_NAMES[val];
      if (pgdInfo && pgdInfo.parent) {
        setFilterCn(pgdInfo.parent);
      }
    }
  };

  const handleCnChange = (val) => {
    setFilterCn(val);
    if (val) {
      const pgdInfo = PGD_NAMES[filterPgd];
      if (pgdInfo && pgdInfo.parent !== val) {
        setFilterPgd(null);
      }
    } else {
      setFilterPgd(null);
    }
  };

  // Modal states
  const [detailCustomer, setDetailCustomer] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [unusedCustomer, setUnusedCustomer] = useState(null);
  const [unusedOpen, setUnusedOpen] = useState(false);
  const [noServiceOpen, setNoServiceOpen] = useState(false);
  const [noServiceRows, setNoServiceRows] = useState([]);
  const [noServiceLoading, setNoServiceLoading] = useState(false);
  const [noServicePagination, setNoServicePagination] = useState({ current: 1, pageSize: 25, total: 0 });

  function openDetail(row) { setDetailCustomer(row); setDetailOpen(true); }
  function openUnused(row) { setUnusedCustomer(row); setUnusedOpen(true); }

  const columns = useMemo(() => buildColumns(openDetail, openUnused), []);

  function normalizeProcessedProfile(row) {
    return {
      ...row,
      ma_kh_chuan: row.ma_kh,
      ma_cn: row.branch_codes,
      ma_pgd: row.pgd_codes,
      so_du_tien_gui_ckh: row.so_du_tien_gui,
      doanh_so_chuyen_tien_ve_tai_khoan: row.doanh_so_chuyen_tien_ve_tk,
      ghi_chu: Number(row.branch_count || 0) > 1 ? `Phát sinh tại ${row.branch_count} chi nhánh` : row.ghi_chu,
    };
  }

  async function loadReportPeriods(preferredPeriod) {
    const { data } = await client.get('/customer-processing/periods');
    const processedPeriods = (data || []).filter((item) => Number(item.profile_count || 0) > 0);
    setReportPeriods(processedPeriods);
    const nextPeriod = preferredPeriod || selectedPeriod || processedPeriods[0]?.period_key || null;
    setSelectedPeriod(nextPeriod);
    return nextPeriod;
  }

  function getReportParams(periodKey) {
    return {
      period_key: periodKey,
      keyword: searchText || undefined,
      branch_code: filterCn || undefined,
      pgd_code: filterPgd || undefined,
      loan_type: filterLoanType || undefined,
      officer_code: filterOfficer || undefined,
      unused_service: filterUnusedSvc || undefined,
      multi_branch: filterMultiBranch === null ? undefined : filterMultiBranch,
    };
  }

  async function loadReport(period = selectedPeriod, nextPagination = reportPagination) {
    const periodKey = period;
    if (!periodKey) {
      message.warning('Chưa có kỳ dữ liệu đã xử lý để xem báo cáo');
      return;
    }
    const current = nextPagination?.current || 1;
    const pageSize = nextPagination?.pageSize || 25;
    setLoading(true);
    try {
      const { data } = await client.get('/imports/summary', {
        params: { period_key: periodKey, limit: 1000 },
      });
      setRows(Array.isArray(data) ? data : data.value || []);
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function initReport() {
      setLoading(true);
      try {
        const periodKey = await loadReportPeriods();
        if (periodKey) await loadReport(periodKey, { current: 1, pageSize: 25, total: 0 });
        setReportReady(true);
      } catch (error) {
        message.error(error.response?.data?.detail || error.message);
      } finally {
        setLoading(false);
      }
    }
    initReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!reportReady || !selectedPeriod) return undefined;
    const timer = window.setTimeout(() => {
      loadReport(selectedPeriod, { ...reportPagination, current: 1 });
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, filterOfficer, filterUnusedSvc, filterCn, filterPgd, filterLoanType, filterMultiBranch]);

  async function loadNoServiceCustomers(nextPagination = noServicePagination) {
    if (!selectedPeriod) return;
    const current = nextPagination?.current || 1;
    const pageSize = nextPagination?.pageSize || 25;
    setNoServiceLoading(true);
    try {
      const { data } = await client.get('/customer-processing/profiles', {
        params: {
          ...getReportParams(selectedPeriod),
          no_service: true,
          include_total: true,
          page: current,
          page_size: pageSize,
        },
      });
      const normalizedRows = (data?.items || []).map(normalizeProcessedProfile);
      setNoServiceRows(normalizedRows);
      setNoServicePagination({
        current,
        pageSize,
        total: Number(data?.total || 0),
      });
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setNoServiceLoading(false);
    }
  }

  function openNoServiceModal() {
    setNoServiceOpen(true);
    loadNoServiceCustomers({ current: 1, pageSize: noServicePagination.pageSize, total: 0 });
  }

  function loadDemoData() {
    const mockData = [
      {
        ma_kh_chuan: 'KH001', ten_kh: 'CÔNG TY CP TẬP ĐOÀN ĐỈNH CAO', ma_cn: 'CN01', ma_pgd: 'PGD01', loai_khach_hang: 'KHDN',
        so_du_tien_vay: 12000000000, so_du_tien_gui_ckh: 5000000000, loai_vay: 'Ngắn hạn', doanh_so_chuyen_tien_ve_tai_khoan: 25000000000,
        so_du_tgtt_binh_quan: 800000000, ma_cb: 'CB01', ten_can_bo: 'Nguyễn Văn A', telephone: '0912345678',
        thau_chi: 1, e_banking: 1, sms_nhac_no_vay: 1, phan_mem_ban_hang: 1, pos: 1, thanh_toan_quoc_te: 1, phat_hanh_lc: 1, mua_ban_ngoai_te: 1
      },
      {
        ma_kh_chuan: 'KH002', ten_kh: 'Trần Thị Thu Thủy', ma_cn: 'CN01', ma_pgd: 'PGD02', loai_khach_hang: 'KHCN',
        so_du_tien_vay: 4500000000, so_du_tien_gui_ckh: 0, loai_vay: 'Trung hạn', doanh_so_chuyen_tien_ve_tai_khoan: 0,
        so_du_tgtt_binh_quan: 150000000, ma_cb: 'CB02', ten_can_bo: 'Lê Thị B', telephone: '0988888888',
        tk_so_dep: 1, agribank_plus: 1, the_ghi_no_noi_dia: 1, the_td_quoc_te: 1, bh_oto_xe_may: 1
      },
      {
        ma_kh_chuan: 'KH003', ten_kh: 'Lê Hoàng Long', ma_cn: 'CN02', ma_pgd: 'PGD03', loai_khach_hang: 'KHCN',
        so_du_tien_vay: 80000000, so_du_tien_gui_ckh: 120000000, loai_vay: 'Tiêu dùng', doanh_so_chuyen_tien_ve_tai_khoan: 10000000,
        so_du_tgtt_binh_quan: 5000000, ma_cb: 'CB03', ten_can_bo: 'Phạm Văn C', telephone: '0901234567',
        agribank_plus: 1, the_ghi_no_noi_dia: 1, tt_tien_dien: 1
      },
      {
        ma_kh_chuan: 'KH004', ten_kh: 'CÔNG TY TNHH VẬN TẢI XANH', ma_cn: 'CN02', ma_pgd: 'PGD04', loai_khach_hang: 'KHDN',
        so_du_tien_vay: 500000000, so_du_tien_gui_ckh: 0, loai_vay: 'Ngắn hạn', doanh_so_chuyen_tien_ve_tai_khoan: 200000000,
        so_du_tgtt_binh_quan: 20000000, ma_cb: 'CB01', ten_can_bo: 'Nguyễn Văn A', telephone: '0944556677',
        e_banking: 1, the_ghi_no_noi_dia: 1
      },
      {
        ma_kh_chuan: 'KH005', ten_kh: 'Hoàng Quốc Việt', ma_cn: 'CN03', ma_pgd: 'PGD05', loai_khach_hang: 'KHCN',
        so_du_tien_vay: 25000000, so_du_tien_gui_ckh: 0, loai_vay: 'Thấu chi', doanh_so_chuyen_tien_ve_tai_khoan: 5000000,
        so_du_tgtt_binh_quan: 200000, ma_cb: 'CB04', ten_can_bo: 'Bùi Thị D', telephone: '0977112233',
        agribank_plus: 1 // Chỉ dùng đúng 1 dịch vụ
      },
      {
        ma_kh_chuan: 'KH006', ten_kh: 'Dương Mỹ Linh', ma_cn: 'CN03', ma_pgd: 'PGD06', loai_khach_hang: 'KHCN',
        so_du_tien_vay: 350000000, so_du_tien_gui_ckh: 0, loai_vay: 'Trung hạn', doanh_so_chuyen_tien_ve_tai_khoan: 0,
        so_du_tgtt_binh_quan: 0, ma_cb: 'CB04', ten_can_bo: 'Bùi Thị D', telephone: '0966554433',
        // Không dùng DV nào (0 DV)
      },
      {
        ma_kh_chuan: 'KH007', ten_kh: 'CỬA HÀNG ĐIỆN MÁY TUẤN TÀI', ma_cn: 'CN01', ma_pgd: 'PGD01', loai_khach_hang: 'KHDN',
        so_du_tien_vay: 1500000000, so_du_tien_gui_ckh: 300000000, loai_vay: 'Ngắn hạn', doanh_so_chuyen_tien_ve_tai_khoan: 400000000,
        so_du_tgtt_binh_quan: 45000000, ma_cb: 'CB02', ten_can_bo: 'Lê Thị B', telephone: '0933221100',
        e_banking: 1, sms_tien_gui: 1, pos: 1
      },
      {
        ma_kh_chuan: 'KH008', ten_kh: 'Vũ Đức Đam', ma_cn: 'CN02', ma_pgd: 'PGD03', loai_khach_hang: 'KHCN',
        so_du_tien_vay: 100000000, so_du_tien_gui_ckh: 0, loai_vay: 'Dài hạn', doanh_so_chuyen_tien_ve_tai_khoan: 0,
        so_du_tgtt_binh_quan: 1000000, ma_cb: 'CB03', ten_can_bo: 'Phạm Văn C', telephone: '0922446688',
        // Không dùng DV nào (0 DV)
      },
      {
        ma_kh_chuan: 'KH009', ten_kh: 'Đỗ Thị Quyên', ma_cn: 'CN01', ma_pgd: 'PGD02', loai_khach_hang: 'KHCN',
        so_du_tien_vay: 50000000, so_du_tien_gui_ckh: 0, loai_vay: 'Ngắn hạn', doanh_so_chuyen_tien_ve_tai_khoan: 0,
        so_du_tgtt_binh_quan: 500000, ma_cb: 'CB02', ten_can_bo: 'Lê Thị B', telephone: '0911335577',
        sms_nhac_no_vay: 1
      },
      {
        ma_kh_chuan: 'KH010', ten_kh: 'CÔNG TY XNK TOÀN CẦU', ma_cn: 'CN03', ma_pgd: 'PGD05', loai_khach_hang: 'KHDN',
        so_du_tien_vay: 8500000000, so_du_tien_gui_ckh: 2000000000, loai_vay: 'Ngắn hạn', doanh_so_chuyen_tien_ve_tai_khoan: 15000000000,
        so_du_tgtt_binh_quan: 600000000, ma_cb: 'CB04', ten_can_bo: 'Bùi Thị D', telephone: '0955998877',
        e_banking: 1, thanh_toan_quoc_te: 1, phat_hanh_lc: 1, bao_lanh: 1, chi_tra_kieu_hoi: 1, tk_so_dep: 1, tra_luong_qua_the: 1
      }
    ];
    setRows(mockData);
    setSourceRows([]);
    message.success('Đã nạp 10 khách hàng giả định (Demo)');
  }


  // ── Danh sách CB duy nhất để dropdown filter ────────────────────────────────
  const officerOptions = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      if (r.ma_cb) map.set(r.ma_cb, r.ten_can_bo || r.ma_cb);
    });
    return [...map.entries()].map(([code, name]) => ({
      value: code,
      label: `${name} (${code})`,
    }));
  }, [rows]);

  // ── Danh sách dịch vụ chưa dùng (active) chia theo nhóm (OptGroup) ─────────
  const groupedUnusedSvcOptions = useMemo(() => {
    const groups = {};
    ACTIVE_SERVICES.forEach((s) => {
      if (!groups[s.group]) groups[s.group] = [];
      groups[s.group].push({
        value: s.key,
        label: s.label,
        group: s.group,
      });
    });
    return Object.entries(groups).map(([groupName, items]) => ({
      label: groupName,
      options: items,
    }));
  }, []);

  const cnOptions = useMemo(() => {
    const uniqueCns = [...new Set(rows.map(r => r.ma_cn).filter(Boolean))];
    return uniqueCns.map(cn => ({
      value: cn,
      label: CN_NAMES[cn] || `Chi nhánh ${cn}`
    }));
  }, [rows]);

  const pgdOptions = useMemo(() => {
    const uniquePgds = [...new Set(
      rows
        .filter(r => !filterCn || r.ma_cn === filterCn)
        .map(r => r.ma_pgd)
        .filter(Boolean)
    )];
    return uniquePgds.map(pgd => ({
      value: pgd,
      label: PGD_NAMES[pgd]?.name || pgd
    }));
  }, [rows, filterCn]);

  const stats = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.loan    += Number(row.so_du_tien_vay || 0);
        acc.deposit += Number(row.so_du_tien_gui_ckh || 0);
        acc.casa    += Number(row.so_du_tgtt_binh_quan || 0);
        const usedCount = countUsed(row);
        if (usedCount === 0) acc.noService++;
        const total = ACTIVE_SERVICES.length;
        if (usedCount < total * 0.3) acc.lowService++;
        return acc;
      },
      { loan: 0, deposit: 0, casa: 0, noService: 0, lowService: 0 },
    );
  }, [rows]);

  // ── Lọc kết hợp: text search + cán bộ + dịch vụ chưa dùng + CN + PGD ─────────
  const filteredRows = useMemo(() => {
    let result = rows;
    // 1. text search
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(
        (r) =>
          (r.ten_kh || '').toLowerCase().includes(q) ||
          (r.ma_kh_chuan || '').toLowerCase().includes(q) ||
          (r.ma_cb || '').toLowerCase().includes(q) ||
          (r.telephone || '').toLowerCase().includes(q),
      );
    }
    // 2. lọc theo cán bộ
    if (filterOfficer) {
      result = result.filter((r) => r.ma_cb === filterOfficer);
    }
    // 3. lọc KH chưa dùng dịch vụ cụ thể
    if (filterUnusedSvc) {
      result = result.filter((r) => Number(r[filterUnusedSvc] || 0) === 0);
    }
    if (filterLoanType) {
      result = result.filter((r) => String(r.loai_vay || '').includes(filterLoanType));
    }
    if (filterMultiBranch !== null) {
      result = result.filter((r) => filterMultiBranch ? Number(r.branch_count || 0) > 1 : Number(r.branch_count || 0) <= 1);
    }
    // 4. lọc theo Chi nhánh (CN)
    if (filterCn) {
      result = result.filter((r) => String(r.ma_cn || '').split(',').map((item) => item.trim()).includes(filterCn));
    }
    // 5. lọc theo Phòng giao dịch (PGD)
    if (filterPgd) {
      result = result.filter((r) => String(r.ma_pgd || '').includes(filterPgd));
    }
    // 6. Sắp xếp theo PGD nếu chỉ chọn lọc theo CN mà không chọn PGD cụ thể
    if (filterCn && !filterPgd) {
      result = [...result].sort((a, b) => (a.ma_pgd || '').localeCompare(b.ma_pgd || ''));
    }
    return result;
  }, [rows, searchText, filterOfficer, filterUnusedSvc, filterCn, filterPgd, filterLoanType, filterMultiBranch]);

  const sourceColumns = useMemo(() => [
    {
      title: 'Nguồn',
      dataIndex: 'source_code',
      key: 'source_code',
      width: 110,
      render: (value, row) => (
        <Space direction="vertical" size={2}>
          {sourceTag(value)}
          <Text strong style={{ fontSize: 12 }}>{row.source_name}</Text>
        </Space>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (value) => {
        const meta = sourceStatusMeta[value] || sourceStatusMeta.missing;
        return <Badge status={meta.color} text={meta.label} />;
      },
    },
    {
      title: 'File',
      key: 'file_count',
      width: 130,
      align: 'center',
      render: (_, row) => (
        <Space size={4}>
          <Tag color="green">{row.success_file_count || 0} thành công</Tag>
          {Number(row.error_file_count || 0) > 0 && <Tag color="red">{row.error_file_count} lỗi</Tag>}
        </Space>
      ),
    },
    {
      title: 'Số dòng',
      dataIndex: 'row_count',
      key: 'row_count',
      width: 110,
      align: 'right',
      render: (value) => money(value || 0),
    },
    {
      title: 'Số KH',
      dataIndex: 'customer_count',
      key: 'customer_count',
      width: 100,
      align: 'right',
      render: (value) => money(value || 0),
    },
    {
      title: 'Dung lượng',
      dataIndex: 'total_file_size',
      key: 'total_file_size',
      width: 110,
      align: 'right',
      render: formatFileSize,
    },
    {
      title: 'Trường dữ liệu dùng cho báo cáo',
      dataIndex: 'mapped_fields',
      key: 'mapped_fields',
      width: 280,
      render: (value) => {
        const fields = value?.fields || [];
        return (
          <Space size={[4, 4]} wrap>
            {fields.slice(0, 8).map((field) => <Tag key={field}>{field}</Tag>)}
            {fields.length > 8 && <Tag color="blue">+{fields.length - 8}</Tag>}
          </Space>
        );
      },
    },
    {
      title: 'Ghi chú',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
      render: (value) => <Text type="secondary">{value || '—'}</Text>,
    },
  ], []);

  return (
    <Space direction="vertical" size={5} className="page-stack">
      <div>
        <Title level={2}>Bảng quản lý khách hàng</Title>
        
      </div>

      {/* Bộ lọc */}
      <Card>
        <Form form={form} layout="vertical">
          {/* Hàng 1: Tham số chính & Tác vụ */}
          <Row gutter={[16, 12]} align="bottom">
            <Col xs={24} sm={12} md={5}>
              <Form.Item label="Kỳ dữ liệu đã xử lý" style={{ marginBottom: 0 }}>
                <Select
                  placeholder="Chọn kỳ dữ liệu"
                  value={selectedPeriod}
                  options={reportPeriods.map((item) => ({
                    value: item.period_key,
                    label: `${item.period_key} · ${money(item.profile_count)} KH`,
                  }))}
                  onChange={async (value) => {
                    setSelectedPeriod(value);
                    await loadReport(value, { current: 1, pageSize: reportPagination.pageSize, total: 0 });
                  }}
                  notFoundContent={<Empty description="Chưa có kỳ đã xử lý" imageStyle={{ height: 34 }} />}
                  showSearch
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={5}>
              <Form.Item label="Chế độ xem" style={{ marginBottom: 0 }}>
                <Segmented
                  block
                  value={viewMode}
                  onChange={setViewMode}
                  options={[
                    { label: 'Báo cáo', value: 'report' },
                    { label: 'Trực quan', value: 'visual' },
                    { label: 'Nguồn DL', value: 'sources' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={14}>
              <Form.Item label=" " style={{ marginBottom: 0 }}>
                <Space wrap style={{ width: '100%', justifyContent: 'flex-start' }}>
                  <Button
                    type="primary"
                    icon={<SearchOutlined />}
                    loading={loading}
                    onClick={() => loadReport(selectedPeriod, { ...reportPagination, current: 1 })}
                  >
                    Tải báo cáo
                  </Button>
                  <Button icon={<DownloadOutlined />} disabled style={{ opacity: 0.65 }}>
                    Xuất Excel
                  </Button>
                  {(filterOfficer || filterUnusedSvc || searchText || filterCn || filterPgd || filterLoanType || filterMultiBranch !== null) && (
                    <Button
                      danger
                      onClick={() => {
                        setFilterOfficer(null);
                        setFilterUnusedSvc(null);
                        setSearchText('');
                        setFilterCn(null);
                        setFilterPgd(null);
                        setFilterLoanType(null);
                        setFilterMultiBranch(null);
                      }}
                    >
                      Xóa bộ lọc
                    </Button>
                  )}
                </Space>
              </Form.Item>
            </Col>
          </Row>

          <div style={{ margin: '16px 0', borderTop: '1px dashed #e2e8f0' }} />

          {/* Hàng 2: Các bộ lọc nâng cao */}
          <Row gutter={[12, 12]}>
            <Col xs={24} sm={12} md={4}>
              <Form.Item label="Chi nhánh" style={{ marginBottom: 0 }}>
                <Select
                  placeholder="Phạm vi xem"
                  value={branchSelectValue}
                  onChange={handleCnChange}
                  allowClear={false}
                  options={cnOptions}
                  showSearch
                  filterOption={(input, opt) =>
                    (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  style={{ width: '100%' }}
                  disabled={branchSelectDisabled}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={5}>
              <Form.Item label="Phòng giao dịch" style={{ marginBottom: 0 }}>
                <Select
                  placeholder="Tất cả phòng GD"
                  value={filterPgd}
                  onChange={handlePgdChange}
                  allowClear
                  options={pgdOptions}
                  showSearch
                  filterOption={(input, opt) =>
                    (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  style={{ width: '100%' }}
                  disabled={pgdSelectDisabled || !filterCn}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Form.Item label="Loại vay" style={{ marginBottom: 0 }}>
                <Select
                  placeholder="Tất cả loại vay"
                  value={filterLoanType}
                  onChange={setFilterLoanType}
                  allowClear
                  options={loanTypeOptions}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={5}>
              <Form.Item label="Cán bộ phụ trách" style={{ marginBottom: 0 }}>
                <Select
                  placeholder="Tất cả cán bộ"
                  value={filterOfficer}
                  onChange={setFilterOfficer}
                  allowClear
                  options={officerOptions}
                  showSearch
                  filterOption={(input, opt) =>
                    (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  notFoundContent={<Empty description="Không có cán bộ" imageStyle={{ height: 30 }} />}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Form.Item label="Phạm vi KH" style={{ marginBottom: 0 }}>
                <Select
                  placeholder="Tất cả"
                  value={filterMultiBranch}
                  onChange={setFilterMultiBranch}
                  allowClear
                  options={[
                    { value: true, label: 'Nhiều chi nhánh' },
                    { value: false, label: 'Một chi nhánh' },
                  ]}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={5}>
              <Form.Item label="KH chưa dùng dịch vụ" style={{ marginBottom: 0 }}>
                <Select
                  placeholder="Chọn dịch vụ chưa dùng"
                  value={filterUnusedSvc}
                  onChange={setFilterUnusedSvc}
                  allowClear
                  showSearch
                  filterOption={(input, opt) => {
                    const q = input.toLowerCase();
                    const label = (opt?.label || '').toLowerCase();
                    const group = (opt?.group || '').toLowerCase();
                    return label.includes(q) || group.includes(q);
                  }}
                  options={groupedUnusedSvcOptions}
                  notFoundContent={null}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={5}>
              <Form.Item label="Tìm kiếm nhanh" style={{ marginBottom: 0 }}>
                <Input
                  placeholder="Tên KH / CIF / Mã CB"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  allowClear
                  prefix={<SearchOutlined style={{ color: '#cbd5e1' }} />}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>


      {/* Thống kê nhanh */}
      <Row gutter={[12, 12]}>
        {/* Khách hàng */}
        <Col xs={12} md={4}>
          <div style={{
            background: 'linear-gradient(to bottom right, #ffffff, #f8fafc)',
            border: '1px solid #e2e8f0',
            borderLeft: '4px solid #3b82f6',
            borderRadius: '8px',
            padding: '12px 16px',
            position: 'relative',
            boxShadow: '0 2px 8px rgba(59, 130, 246, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: '92px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {filterOfficer || filterUnusedSvc ? 'KH (đã lọc)' : 'Khách hàng'}
              </span>
              <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
                <UserOutlined style={{ fontSize: 14 }} />
              </div>
            </div>
            <div>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#1e3a8a', lineHeight: 1 }}>
                {money(reportSummary.total_customers || reportPagination.total)}
              </span>
              <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>toàn bộ</span>
            </div>
          </div>
        </Col>

        {/* Tổng dư nợ */}
        <Col xs={12} md={5}>
          <div style={{
            background: 'linear-gradient(to bottom right, #ffffff, #fff1f2)',
            border: '1px solid #ffe4e6',
            borderLeft: '4px solid #f43f5e',
            borderRadius: '8px',
            padding: '12px 16px',
            position: 'relative',
            boxShadow: '0 2px 8px rgba(244, 63, 94, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: '92px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#f43f5e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Tổng dư nợ
              </span>
              <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#fff1f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f43f5e' }}>
                <WalletOutlined style={{ fontSize: 14 }} />
              </div>
            </div>
            <div>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#881337', lineHeight: 1 }}>
                {money(reportSummary.total_loan)} <span style={{ fontSize: 12, fontWeight: 600 }}>đ</span>
              </span>
            </div>
          </div>
        </Col>

        {/* Tổng tiền gửi */}
        <Col xs={12} md={5}>
          <div style={{
            background: 'linear-gradient(to bottom right, #ffffff, #ecfdf5)',
            border: '1px solid #d1fae5',
            borderLeft: '4px solid #10b981',
            borderRadius: '8px',
            padding: '12px 16px',
            position: 'relative',
            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: '92px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Tổng tiền gửi
              </span>
              <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                <BankOutlined style={{ fontSize: 14 }} />
              </div>
            </div>
            <div>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#064e3b', lineHeight: 1 }}>
                {money(reportSummary.total_deposit)} <span style={{ fontSize: 12, fontWeight: 600 }}>đ</span>
              </span>
            </div>
          </div>
        </Col>

        {/* TGTT bình quan */}
        <Col xs={12} md={5}>
          <div style={{
            background: 'linear-gradient(to bottom right, #ffffff, #ecfeff)',
            border: '1px solid #cffafe',
            borderLeft: '4px solid #06b6d4',
            borderRadius: '8px',
            padding: '12px 16px',
            position: 'relative',
            boxShadow: '0 2px 8px rgba(6, 182, 212, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: '92px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#0891b2', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                TGTT bình quân
              </span>
              <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#ecfeff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#06b6d4' }}>
                <RiseOutlined style={{ fontSize: 14 }} />
              </div>
            </div>
            <div>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#164e63', lineHeight: 1 }}>
                {money(reportSummary.total_casa)} <span style={{ fontSize: 12, fontWeight: 600 }}>đ</span>
              </span>
            </div>
          </div>
        </Col>

        {/* Chưa sử dụng DV nào */}
        <Col xs={12} md={5}>
          <Tooltip title="KH chưa sử dụng dịch vụ nào (từ dữ liệu CN05) — cơ hội bán chéo cao">
            <div onClick={openNoServiceModal} style={{
              background: 'linear-gradient(to bottom right, #ffffff, #fffbeb)',
              border: '1px solid #fef3c7',
              borderLeft: '4px solid #d97706',
              borderRadius: '8px',
              padding: '12px 16px',
              position: 'relative',
              boxShadow: '0 2px 8px rgba(217, 119, 6, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '92px',
              cursor: 'pointer'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Chưa dùng DV nào
                </span>
                <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706' }}>
                  <WarningOutlined style={{ fontSize: 14 }} />
                </div>
              </div>
              <div>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#78350f', lineHeight: 1 }}>
                  {money(reportSummary.no_service_customers)}
                </span>
                <span style={{ fontSize: 12, color: '#78350f', fontWeight: 600, marginLeft: 4 }}>
                  / {money(reportSummary.total_customers || reportPagination.total)} KH
                </span>
              </div>
            </div>
          </Tooltip>
        </Col>
      </Row>

      {/* Thanh trạng thái bộ lọc đang active */}
      {(filterOfficer || filterUnusedSvc || filterCn || filterPgd || filterLoanType || filterMultiBranch !== null) && (
        <div className="active-filter-bar">
          <Space size={8} wrap>
            <RiseOutlined style={{ color: '#7c3aed' }} />
            <Text strong style={{ fontSize: 13 }}>Đang lọc:</Text>
            {filterCn && (
              <Tag
                color="blue"
                closable
                onClose={() => handleCnChange(null)}
              >
                CN: {CN_NAMES[filterCn] || filterCn}
              </Tag>
            )}
            {filterPgd && (
              <Tag
                color="cyan"
                closable
                onClose={() => handlePgdChange(null)}
              >
                PGD: {PGD_NAMES[filterPgd]?.name || filterPgd}
              </Tag>
            )}
            {filterOfficer && (
              <Tag
                color="purple"
                closable
                onClose={() => setFilterOfficer(null)}
                icon={<TeamOutlined />}
              >
                CB: {officerOptions.find((o) => o.value === filterOfficer)?.label || filterOfficer}
              </Tag>
            )}
            {filterLoanType && (
              <Tag
                color="volcano"
                closable
                onClose={() => setFilterLoanType(null)}
              >
                Loại vay: {filterLoanType}
              </Tag>
            )}
            {filterMultiBranch !== null && (
              <Tag
                color="geekblue"
                closable
                onClose={() => setFilterMultiBranch(null)}
              >
                {filterMultiBranch ? 'KH nhiều chi nhánh' : 'KH một chi nhánh'}
              </Tag>
            )}
            {filterUnusedSvc && (
              <Tag
                color="red"
                closable
                onClose={() => setFilterUnusedSvc(null)}
                icon={<AimOutlined />}
              >
                Chưa dùng: {SERVICE_DEFS.find((s) => s.key === filterUnusedSvc)?.label}
              </Tag>
            )}
            <Text type="secondary" style={{ fontSize: 12 }}>
              → {filteredRows.length} khách hàng phù hợp
            </Text>
          </Space>
        </div>
      )}

      {/* Nội dung chính */}
      {viewMode === 'sources' ? (
        <Card title="Theo dõi nguồn dữ liệu">
          <Row gutter={[12, 12]}>
            {sourceGroups.map((item) => (
              <Col xs={24} md={8} key={item.label}>
                <div className="source-tile">
                  <Space direction="vertical" size={8}>
                    <Text strong>{item.label}</Text>
                    {sourceTag(item.source)}
                    <Text type="secondary">{item.note}</Text>
                  </Space>
                </div>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {viewMode === 'visual' && (
        <VisualDashboard
          rows={filteredRows}
          showTrend={false}
          emptyDescription="Hãy nhấn 'Demo Dữ Liệu' hoặc 'Xem báo cáo' để hiển thị biểu đồ phân tích trực quan"
        />
      )}

      {viewMode === 'report' && (
        <Card
          title={
            <Space>
             
              <Tag color="blue">Tổng: {money(reportPagination.total)} KH</Tag>
              <Tag color="geekblue">Trang hiện tại: {filteredRows.length} dòng</Tag>
            </Space>
          }
          extra={
            <Space size={12}>
              {filterUnusedSvc && (
                <Tag color="orange" icon={<AimOutlined />}>
                  Chưa dùng: {SERVICE_DEFS.find((s) => s.key === filterUnusedSvc)?.label}
                </Tag>
              )}
              {filterOfficer && (
                <Tag color="purple" icon={<TeamOutlined />}>
                  CB: {filterOfficer}
                </Tag>
              )}
              <Text type="secondary" style={{ fontSize: 12 }}>
                Click tên KH → Chi tiết &nbsp;|&nbsp; <AimOutlined style={{ color: '#c0392b' }} /> → Bán chéo
              </Text>
            </Space>
          }
        >
          <Table
            bordered
            size="small"
            rowKey="ma_kh_chuan"
            columns={columns}
            dataSource={filteredRows}
            loading={loading}
            scroll={{ x: 'max-content', y: 560 }}
            pagination={{
              current: reportPagination.current,
              pageSize: reportPagination.pageSize,
              total: reportPagination.total,
              showSizeChanger: true,
              pageSizeOptions: [25, 50, 100, 200],
              showTotal: (total, range) => `${range[0]}-${range[1]} / ${money(total)} khách hàng`,
            }}
            onChange={(pagination) => {
              loadReport(selectedPeriod, {
                current: pagination.current,
                pageSize: pagination.pageSize,
                total: reportPagination.total,
              });
            }}
            locale={{ emptyText: <Empty description="Chưa có dữ liệu báo cáo cho kỳ này" /> }}
            rowClassName={(_, index) => (index % 2 === 0 ? 'row-even' : 'row-odd')}
          />
        </Card>
      )}

      {/* Modals */}
      <Modal
        open={noServiceOpen}
        onCancel={() => setNoServiceOpen(false)}
        footer={<Button onClick={() => setNoServiceOpen(false)}>Đóng</Button>}
        width={1080}
        title={
          <Space>
            <WarningOutlined style={{ color: '#d97706' }} />
            <span>Khách hàng chưa dùng dịch vụ nào</span>
            <Tag color="orange">{money(noServicePagination.total)} KH</Tag>
          </Space>
        }
      >
        <Table
          bordered
          size="small"
          rowKey="ma_kh_chuan"
          loading={noServiceLoading}
          dataSource={noServiceRows}
          scroll={{ x: 980, y: 460 }}
          pagination={{
            current: noServicePagination.current,
            pageSize: noServicePagination.pageSize,
            total: noServicePagination.total,
            showSizeChanger: true,
            pageSizeOptions: [25, 50, 100],
            showTotal: (total, range) => `${range[0]}-${range[1]} / ${money(total)} khách hàng`,
          }}
          onChange={(pagination) => {
            loadNoServiceCustomers({
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: noServicePagination.total,
            });
          }}
          columns={[
            {
              title: 'Mã KH',
              dataIndex: 'ma_kh_chuan',
              width: 120,
              fixed: 'left',
              render: (value, row) => (
                <Button type="link" size="small" style={{ padding: 0, fontWeight: 700 }} onClick={() => openDetail(row)}>
                  {value}
                </Button>
              ),
            },
            { title: 'Tên khách hàng', dataIndex: 'ten_kh', width: 250, fixed: 'left', ellipsis: true },
            { title: 'Loại KH', dataIndex: 'loai_khach_hang', width: 90, render: (value) => value ? <Tag color="blue">{value}</Tag> : '—' },
            { title: 'Chi nhánh', dataIndex: 'ma_cn', width: 150, ellipsis: true },
            { title: 'PGD', dataIndex: 'ma_pgd', width: 160, ellipsis: true },
            { title: 'Cán bộ', key: 'officer', width: 170, ellipsis: true, render: (_, row) => row.ten_can_bo || row.ma_cb || '—' },
            { title: 'Dư nợ', dataIndex: 'so_du_tien_vay', width: 130, align: 'right', render: money },
            { title: 'CKH', dataIndex: 'so_du_tien_gui_ckh', width: 130, align: 'right', render: money },
            { title: 'TGTT BQ', dataIndex: 'so_du_tgtt_binh_quan', width: 130, align: 'right', render: money },
            { title: 'SĐT', dataIndex: 'telephone', width: 130, render: (value) => value || '—' },
          ]}
          locale={{ emptyText: <Empty description="Không có khách hàng phù hợp" /> }}
        />
      </Modal>
      <CustomerDetailModal customer={detailCustomer} open={detailOpen} onClose={() => setDetailOpen(false)} />
      <UnusedServicesModal customer={unusedCustomer} open={unusedOpen} onClose={() => setUnusedOpen(false)} />
    </Space>
  );
}

export default CustomerReport;
