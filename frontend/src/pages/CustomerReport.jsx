import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Collapse,
  Descriptions,
  Drawer,
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
  RiseOutlined,
  SearchOutlined,
  TeamOutlined,
  TrophyOutlined,
  UserOutlined,
  WalletOutlined,
  BankOutlined,
  WarningOutlined,
  SwapOutlined,
} from '@ant-design/icons';

import client from '../api/client';
import { resolveBranchScope, useAuth } from '../auth';

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
  { key: 'the_td_loc_viet',      label: 'Thẻ TD Lộc Việt',     group: 'Thẻ',             pending: false },
  { key: 'tt_tien_dien',         label: 'TT tiền điện',         group: 'Thanh toán',      pending: true  },
  { key: 'tt_tien_nuoc',         label: 'TT tiền nước',         group: 'Thanh toán',      pending: true  },
  { key: 'tt_cuoc_vien_thong',   label: 'TT cước viễn thông',  group: 'Thanh toán',      pending: true  },
  { key: 'tra_luong_qua_the',    label: 'Trả lương qua thẻ',   group: 'Thanh toán',      pending: true  },
  { key: 'batd',                 label: 'BATD',                 group: 'Bảo hiểm',        pending: true  },
  { key: 'batk',                 label: 'BATK',                 group: 'Bảo hiểm',        pending: true  },
  { key: 'bh_oto_xe_may',        label: 'BH ô tô, xe máy',     group: 'Bảo hiểm',        pending: true  },
  { key: 'bh_khac',              label: 'BH khác',              group: 'Bảo hiểm',        pending: true  },
  { key: 'bao_lanh',             label: 'Bảo lãnh',             group: 'Bảo lãnh/TTQT',  pending: false },
  { key: 'loa_bien_dong_so_du',  label: 'Loa biến động số dư', group: 'Khác',            pending: false },
  { key: 'phan_mem_ban_hang',    label: 'Phần mềm bán hàng',   group: 'Khác',            pending: true  },
  { key: 'pos',                  label: 'POS',                  group: 'Khác',            pending: true  },
  { key: 'chi_tra_kieu_hoi',     label: 'Chi trả kiều hối',    group: 'Bảo lãnh/TTQT',  pending: true  },
  { key: 'phat_hanh_lc',         label: 'Phát hành LC',         group: 'Bảo lãnh/TTQT',  pending: false },
  { key: 'thanh_toan_quoc_te',   label: 'Thanh toán quốc tế',  group: 'Bảo lãnh/TTQT',  pending: true  },
  { key: 'mua_ban_ngoai_te',     label: 'Mua bán ngoại tệ',    group: 'Bảo lãnh/TTQT',  pending: true  },
];

const TOTAL_SERVICES = SERVICE_DEFS.length;
const ACTIVE_SERVICES = SERVICE_DEFS.filter((s) => !s.pending);
const SERVICE_LABEL_BY_KEY = SERVICE_DEFS.reduce((acc, item) => {
  acc[item.key] = item.label;
  return acc;
}, {});

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

const moneyFormatter = new Intl.NumberFormat('vi-VN');

function money(value) {
  if (value === null || value === undefined || value === '') return '';
  return moneyFormatter.format(Number(value || 0));
}

function compactMoney(value) {
  const amount = Math.abs(Number(value || 0));
  const sign = Number(value || 0) < 0 ? '-' : '';
  if (amount >= 1_000_000_000_000) {
    return `${sign}${moneyFormatter.format(Number((amount / 1_000_000_000_000).toFixed(1)))} nghìn tỷ`;
  }
  if (amount >= 1_000_000_000) {
    return `${sign}${moneyFormatter.format(Number((amount / 1_000_000_000).toFixed(1)))} tỷ`;
  }
  if (amount >= 1_000_000) {
    return `${sign}${moneyFormatter.format(Number((amount / 1_000_000).toFixed(1)))} triệu`;
  }
  return `${sign}${moneyFormatter.format(amount)}`;
}

function moneyTooltip(value) {
  return `${money(value || 0)} đ`;
}

function signedCompactMoney(value) {
  const number = Number(value || 0);
  const prefix = number > 0 ? '+' : '';
  return `${prefix}${compactMoney(number)} đ`;
}

function signedNumber(value) {
  const number = Number(value || 0);
  const prefix = number > 0 ? '+' : '';
  return `${prefix}${money(number)}`;
}

function trendTag(value, isMoney = true) {
  const number = Number(value || 0);
  const color = number > 0 ? 'green' : number < 0 ? 'red' : 'default';
  return <Tag color={color}>{isMoney ? signedCompactMoney(number) : signedNumber(number)}</Tag>;
}

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePgdCodes(value) {
  return splitList(value).map((item) => {
    if (!item.includes(':')) return item;
    const [branch, pgd] = item.split(':').map((part) => part.trim());
    return pgd ? `${branch}:${pgd}` : `${branch}: Chưa có PGD`;
  });
}

function formatPgdLabel(value, pgdNameMap = {}) {
  if (!value || String(value).includes('Chưa có PGD')) return value;
  const text = String(value).trim();
  if (pgdNameMap[text]) return pgdNameMap[text];
  if (text.includes(':')) {
    const [, pgd] = text.split(':').map((part) => part.trim());
    return pgdNameMap[pgd] || PGD_NAMES[text]?.name || PGD_NAMES[pgd]?.name || text;
  }
  return pgdNameMap[text] || PGD_NAMES[text]?.name || text;
}

function CheckboxPopoverFilter({ title, placeholder, options, value, onChange, className = '' }) {
  const selected = Array.isArray(value) ? value : [];
  const allValues = options.map((item) => item.value);
  const allChecked = options.length > 0 && selected.length === options.length;
  const indeterminate = selected.length > 0 && selected.length < options.length;
  const selectedLabels = options
    .filter((item) => selected.includes(item.value))
    .map((item) => item.label);
  const buttonText = selectedLabels.length
    ? `${selectedLabels.length} đã chọn`
    : placeholder;

  const content = (
    <div className={`report-checkbox-filter ${className}`}>
      <div className="report-checkbox-filter-head">
        <Checkbox
          checked={allChecked}
          indeterminate={indeterminate}
          onChange={(event) => onChange(event.target.checked ? allValues : [])}
        >
          Chọn tất cả
        </Checkbox>
        <Text type="secondary">{selected.length}/{options.length}</Text>
      </div>
      <Checkbox.Group
        value={selected}
        onChange={onChange}
        options={options}
      />
      {selected.length > 0 && (
        <Button
          type="link"
          size="small"
          onClick={() => onChange([])}
          style={{ paddingLeft: 0, marginTop: 6 }}
        >
          Bỏ chọn tất cả
        </Button>
      )}
    </div>
  );

  return (
    <Popover
      trigger="click"
      placement="bottomLeft"
      title={title}
      content={content}
      overlayClassName="report-filter-popover"
    >
      <Button className={selected.length ? 'report-filter-button is-active' : 'report-filter-button'}>
        <span>{buttonText}</span>
        <FilterOutlined />
      </Button>
    </Popover>
  );
}

function ReportStatCard({ tone, icon, label, value, unit, tooltip, onClick }) {
  const content = (
    <div
      className={`report-stat-card report-stat-card--${tone}${onClick ? ' is-clickable' : ''}`}
      onClick={onClick}
    >
      <div className="report-stat-card-head">
        <span className="report-stat-label">{label}</span>
        <span className="report-stat-icon">{icon}</span>
      </div>
      <div className="report-stat-number-wrap">
        <span className="report-stat-value">{value}</span>
        {unit && <span className="report-stat-unit">{unit}</span>}
      </div>
    </div>
  );

  return tooltip ? <Tooltip title={tooltip}>{content}</Tooltip> : content;
}

// Tính số dịch vụ đã dùng (không tính pending)
function countUsed(row) {
  return SERVICE_DEFS.filter(
    (s) => !s.pending && Number(row[s.key] || 0) > 0
  ).length;
}

// Danh sách dịch vụ chưa dùng (không tính pending chưa có dữ liệu)
function getUnusedServices(row) {
  return SERVICE_DEFS.filter((s) => !s.pending && Number(row[s.key] || 0) === 0);
}
function getUsedServices(row) {
  return SERVICE_DEFS.filter((s) => !s.pending && Number(row[s.key] || 0) > 0);
}
function getPendingServices() {
  return SERVICE_DEFS.filter((s) => s.pending);
}

const CROSS_SELL_RULES = [
  {
    key: 'deposit_plus',
    label: 'TG lớn chưa dùng Agribank Plus',
    color: 'green',
    test: (row) =>
      Number(row.so_du_tien_gui_ckh || 0) + Number(row.so_du_tgtt_binh_quan || 0) >= 1_000_000_000
      && Number(row.agribank_plus || 0) === 0,
  },
  {
    key: 'loan_sms',
    label: 'Có dư nợ thiếu SMS nhắc nợ',
    color: 'volcano',
    test: (row) => Number(row.so_du_tien_vay || 0) > 0 && Number(row.sms_nhac_no_vay || 0) === 0,
  },
  {
    key: 'casa_card',
    label: 'TGTT cao chưa có thẻ',
    color: 'blue',
    test: (row) =>
      Number(row.so_du_tgtt_binh_quan || 0) >= 500_000_000
      && Number(row.the_ghi_no_noi_dia || 0) === 0
      && Number(row.the_td_quoc_te || 0) === 0
      && Number(row.the_td_loc_viet || 0) === 0,
  },
  {
    key: 'multi_branch_owner',
    label: 'Nhiều CN cần quản lý chính',
    color: 'purple',
    test: (row) => Number(row.branch_count || 0) > 1,
  },
];

function getCrossSellOpportunities(row) {
  return CROSS_SELL_RULES.filter((rule) => rule.test(row));
}

// ─── Mini dot-grid hiển thị trong 1 ô bảng ───────────────────────────────────
const GROUP_COLORS = {
  'Tín dụng':       '#d4380d',
  'Tài khoản':      '#0369a1',
  'Digital':        '#7c3aed',
  'Thẻ':            '#b45309',
  'Thanh toán':     '#0891b2',
  'Bảo hiểm':       '#15803d',
  'Bảo lãnh/TTQT':  '#9333ea',
  'Khác':           '#64748b',
};

const CN_NAMES = {
  'CN01': 'Chi nhánh Đông Hà Nội',
  'CN02': 'Chi nhánh Láng Hạ',
  'CN03': 'Chi nhánh Tây Hồ',
  'CN04': 'Chi nhánh Cầu Giấy',
};

const PGD_NAMES = {
  'PGD01': { name: 'PGD Gia Lâm', parent: 'CN01' },
  'PGD02': { name: 'PGD Long Biên', parent: 'CN01' },
  'PGD03': { name: 'PGD Đống Đa', parent: 'CN02' },
  'PGD04': { name: 'PGD Láng Hạ', parent: 'CN02' },
  'PGD05': { name: 'PGD Tây Hồ', parent: 'CN03' },
  'PGD06': { name: 'PGD Nhật Tân', parent: 'CN03' },
  'PGD07': { name: 'PGD Cầu Giấy', parent: 'CN04' },
};

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

        <Tabs
          size="small"
          className="customer-detail-tabs"
          items={[
            {
              key: 'services',
              label: 'Dịch vụ',
              children: <ServiceDetailView customer={customer} />,
            },
            {
              key: 'branches',
              label: 'Chi nhánh / PGD',
              children: <BranchDetailSection customer={customer} />,
            },
            {
              key: 'history',
              label: 'Lịch sử qua kỳ',
              children: <CustomerHistorySection customer={customer} />,
            },
          ]}
        />
      </div>
    </Modal>
  );
}

function BranchDetailSection({ customer }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function loadBranchDetails() {
    if (!customer?.period_key || !customer?.ma_kh) {
      message.warning('Thiếu kỳ dữ liệu hoặc mã khách hàng để xem chi tiết chi nhánh');
      return;
    }
    setLoading(true);
    try {
      const { data } = await client.get('/customer-processing/branch-details', {
        params: {
          period_key: customer.period_key,
          ma_kh: customer.ma_kh,
        },
      });
      setRows(data || []);
      setLoaded(true);
    } catch (error) {
      message.error(error.response?.data?.detail || error.message || 'Không tải được chi tiết theo chi nhánh');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setRows([]);
    setLoaded(false);
    loadBranchDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.period_key, customer?.ma_kh]);

  const columns = [
    {
      title: 'Chi nhánh / PGD',
      key: 'branch',
      fixed: 'left',
      width: 230,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <Tag color="blue">{row.branch_code || 'Chưa có chi nhánh'}</Tag>
          <Text strong>{row.ten_pgd || formatPgdLabel(row.ma_pgd) || 'Chưa có PGD'}</Text>
          {row.ma_pgd && <Text type="secondary">Mã PGD: {row.ma_pgd}</Text>}
        </Space>
      ),
    },
    {
      title: 'Dư nợ vay',
      dataIndex: 'so_du_tien_vay',
      width: 130,
      align: 'right',
      render: (value) => `${money(value) || 0} đ`,
    },
    {
      title: 'Loại vay',
      dataIndex: 'loai_vay',
      width: 130,
      render: (value) => value ? <Tag color="volcano">{value}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Tiền gửi CKH',
      dataIndex: 'so_du_tien_gui',
      width: 130,
      align: 'right',
      render: (value) => `${money(value) || 0} đ`,
    },
    {
      title: 'TGTT bình quân',
      dataIndex: 'so_du_tgtt_binh_quan',
      width: 140,
      align: 'right',
      render: (value) => `${money(value) || 0} đ`,
    },
    {
      title: 'Doanh số CR',
      dataIndex: 'doanh_so_cramt',
      width: 130,
      align: 'right',
      render: (value) => `${money(value) || 0} đ`,
    },
    {
      title: 'Doanh số DR',
      dataIndex: 'doanh_so_dramt',
      width: 130,
      align: 'right',
      render: (value) => `${money(value) || 0} đ`,
    },
    {
      title: 'Dịch vụ tại chi nhánh',
      key: 'services',
      width: 320,
      render: (_, row) => {
        const used = getUsedServices(row);
        if (!used.length) return <Text type="secondary">Chưa ghi nhận dịch vụ</Text>;
        return (
          <Space size={[4, 4]} wrap>
            {used.map((service) => (
              <Tag key={service.key} color="success">
                {service.label}
              </Tag>
            ))}
          </Space>
        );
      },
    },
  ];

  const summary = rows.reduce(
    (acc, row) => ({
      loan: acc.loan + Number(row.so_du_tien_vay || 0),
      deposit: acc.deposit + Number(row.so_du_tien_gui || 0),
      casa: acc.casa + Number(row.so_du_tgtt_binh_quan || 0),
    }),
    { loan: 0, deposit: 0, casa: 0 },
  );

  return (
    <Card
      size="small"
      className="branch-detail-card"
      title={
        <Space>
          <BankOutlined />
          <span>Chi tiết theo chi nhánh / PGD</span>
          {loaded && <Tag color="blue">{rows.length} điểm phát sinh</Tag>}
        </Space>
      }
    >
      <Row gutter={[8, 8]} className="branch-detail-summary">
        <Col xs={24} md={8}>
          <Tag color="volcano">Dư nợ: {money(summary.loan)} đ</Tag>
        </Col>
        <Col xs={24} md={8}>
          <Tag color="green">Tiền gửi CKH: {money(summary.deposit)} đ</Tag>
        </Col>
        <Col xs={24} md={8}>
          <Tag color="cyan">TGTT BQ: {money(summary.casa)} đ</Tag>
        </Col>
      </Row>
      <Table
        size="small"
        rowKey={(row) => `${row.branch_code || ''}-${row.ma_pgd || ''}`}
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={false}
        scroll={{ x: 1250, y: 320 }}
        locale={{ emptyText: <Empty description="Chưa có dữ liệu chi tiết theo chi nhánh" /> }}
      />
    </Card>
  );
}

function CustomerHistorySection({ customer }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  async function loadHistory() {
    if (!customer?.ma_kh) return;
    setLoading(true);
    try {
      const { data } = await client.get('/customer-processing/profile-history', {
        params: { ma_kh: customer.ma_kh },
      });
      setRows((data || []).map((item) => ({
        ...item,
        ma_kh_chuan: item.ma_kh,
        so_du_tien_gui_ckh: item.so_du_tien_gui,
      })));
    } catch (error) {
      message.error(error.response?.data?.detail || error.message || 'Không tải được lịch sử khách hàng');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.ma_kh]);

  return (
    <Table
      size="small"
      rowKey={(row) => `${row.period_key}-${row.ma_kh}`}
      loading={loading}
      dataSource={rows}
      pagination={false}
      scroll={{ x: 980 }}
      columns={[
        { title: 'Kỳ', dataIndex: 'period_key', width: 100, fixed: 'left', render: (value) => <Tag color={value === customer.period_key ? 'blue' : 'default'}>{value}</Tag> },
        { title: 'Chi nhánh', dataIndex: 'branch_codes', width: 140, ellipsis: true },
        { title: 'Dư nợ', dataIndex: 'so_du_tien_vay', width: 130, align: 'right', render: (value) => `${money(value)} đ` },
        { title: 'Tiền gửi CKH', dataIndex: 'so_du_tien_gui_ckh', width: 130, align: 'right', render: (value) => `${money(value)} đ` },
        { title: 'TGTT BQ', dataIndex: 'so_du_tgtt_binh_quan', width: 130, align: 'right', render: (value) => `${money(value)} đ` },
        { title: 'Loại vay', dataIndex: 'loai_vay', width: 130, render: (value) => value ? <Tag color="volcano">{value}</Tag> : '—' },
        {
          title: 'Dịch vụ',
          width: 160,
          render: (_, row) => <Tag color="green">{countUsed(row)}/{ACTIVE_SERVICES.length} dịch vụ</Tag>,
        },
        { title: 'Cán bộ', key: 'officer', width: 180, ellipsis: true, render: (_, row) => row.ten_can_bo || row.ma_cb || '—' },
      ]}
      locale={{ emptyText: <Empty description="Chưa có lịch sử khách hàng qua các kỳ" /> }}
    />
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
function buildColumns(onDetailClick, onUnusedClick, pgdNameMap = {}) {
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
      width: 180,
      align: 'center',
      sorter: (a, b) => (a.ma_pgd || '').localeCompare(b.ma_pgd || ''),
      render: (value) => {
        const items = normalizePgdCodes(value);
        if (!items.length) return <Text type="secondary">—</Text>;
        return (
          <Space size={[4, 4]} wrap>
            {items.slice(0, 3).map((item) => (
              <Tooltip key={item} title={item}>
                <Tag>{formatPgdLabel(item, pgdNameMap)}</Tag>
              </Tooltip>
            ))}
            {items.length > 3 && (
              <Tooltip title={items.map((item) => formatPgdLabel(item, pgdNameMap)).join(', ')}>
                <Tag>+{items.length - 3}</Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
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
    {
      title: 'Cơ hội bán chéo',
      key: 'cross_sell',
      width: 220,
      render: (_, row) => {
        const opportunities = getCrossSellOpportunities(row);
        if (!opportunities.length) return <Text type="secondary">—</Text>;
        return (
          <Space size={[4, 4]} wrap>
            {opportunities.slice(0, 2).map((item) => (
              <Tag key={item.key} color={item.color} className="cross-sell-tag">
                {item.label}
              </Tag>
            ))}
            {opportunities.length > 2 && (
              <Tooltip title={opportunities.map((item) => item.label).join(', ')}>
                <Tag color="gold">+{opportunities.length - 2}</Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];
}

const DEFAULT_REPORT_COLUMN_KEYS = [
  'stt',
  'ma_kh_chuan',
  'ten_kh',
  'loai_khach_hang',
  'ma_cn',
  'ma_pgd',
  'can_bo',
  'so_du_tien_vay',
  'so_du_tien_gui_ckh',
  'so_du_tgtt_binh_quan',
  'loai_vay',
  'ghi_chu',
  'cross_sell',
];


// ─── Component chính ───────────────────────────────────────────────────────────
function CustomerReport() {
  const [form] = Form.useForm();
  const { user } = useAuth();
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
  const [groupStats, setGroupStats] = useState({ groups: [], thresholds: {} });
  const [comparePeriod, setComparePeriod] = useState(null);
  const [periodComparison, setPeriodComparison] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reportReady, setReportReady] = useState(false);
  const [viewMode, setViewMode] = useState('report');
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(DEFAULT_REPORT_COLUMN_KEYS);
  const [searchText, setSearchText] = useState('');
  const [filterOfficer, setFilterOfficer] = useState(null);   // mã CB
  const [filterUnusedSvc, setFilterUnusedSvc] = useState([]); // key dịch vụ chưa dùng
  const [filterCn, setFilterCn] = useState(null);               // mã CN
  const [filterPgd, setFilterPgd] = useState(null);             // mã PGD
  const [filterLoanType, setFilterLoanType] = useState([]);
  const [filterMultiBranch, setFilterMultiBranch] = useState(null);
  const [filterOptions, setFilterOptions] = useState({
    branches: [],
    pgds: [],
    pgd_options: [],
    pgd_names: {},
    loan_types: [],
    officers: [],
  });
  const branchScope = useMemo(
    () => resolveBranchScope(user, filterCn, filterPgd),
    [user, filterCn, filterPgd],
  );
  const effectiveFilterCn = branchScope.filterCn;
  const effectiveFilterPgd = branchScope.filterPgd;

  const handlePgdChange = (val) => {
    const resolved = resolveBranchScope(user, filterCn, val || null);
    if (resolved.denied) {
      message.warning('Bạn không có quyền xem phòng giao dịch này');
      setFilterCn(resolved.defaultCn);
      setFilterPgd(resolved.defaultPgd);
      return;
    }
    setFilterCn(resolved.filterCn);
    setFilterPgd(resolved.filterPgd);
  };

  const handleCnChange = (val) => {
    const resolved = resolveBranchScope(user, val || null, null);
    if (resolved.denied) {
      message.warning('Bạn không có quyền xem chi nhánh này');
      setFilterCn(resolved.defaultCn);
      setFilterPgd(resolved.defaultPgd);
    } else {
      setFilterCn(resolved.filterCn);
      setFilterPgd(resolved.filterPgd);
    }
    setFilterOfficer(null);
  };

  const resetReportFilters = () => {
    setFilterOfficer(null);
    setFilterUnusedSvc([]);
    setSearchText('');
    const resetScope = resolveBranchScope(user, null, null);
    setFilterCn(resetScope.filterCn);
    setFilterPgd(resetScope.filterPgd);
    setFilterLoanType([]);
    setFilterMultiBranch(null);
  };

  const activeFilterCount = [
    searchText,
    effectiveFilterCn,
    effectiveFilterPgd,
    filterOfficer,
    filterMultiBranch !== null,
    filterLoanType.length,
    filterUnusedSvc.length,
  ].filter(Boolean).length;

  // Modal states
  const [detailCustomer, setDetailCustomer] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [unusedCustomer, setUnusedCustomer] = useState(null);
  const [unusedOpen, setUnusedOpen] = useState(false);
  const [noServiceOpen, setNoServiceOpen] = useState(false);
  const [noServiceRows, setNoServiceRows] = useState([]);
  const [noServiceLoading, setNoServiceLoading] = useState(false);
  const [noServicePagination, setNoServicePagination] = useState({ current: 1, pageSize: 25, total: 0 });
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupRows, setGroupRows] = useState([]);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupPagination, setGroupPagination] = useState({ current: 1, pageSize: 25, total: 0 });

  function openDetail(row) { setDetailCustomer(row); setDetailOpen(true); }
  function openUnused(row) { setUnusedCustomer(row); setUnusedOpen(true); }

  const baseColumns = useMemo(
    () => buildColumns(openDetail, openUnused, filterOptions.pgd_names || {}),
    [filterOptions.pgd_names],
  );
  const columnOptions = useMemo(
    () => baseColumns.map((column) => ({ label: column.title, value: column.key })),
    [baseColumns],
  );
  const columns = useMemo(
    () => baseColumns.filter((column) => visibleColumnKeys.includes(column.key)),
    [baseColumns, visibleColumnKeys],
  );

  useEffect(() => {
    if (!user) return;
    const initial = resolveBranchScope(user, filterCn, filterPgd);
    if (initial.filterCn !== filterCn) setFilterCn(initial.filterCn);
    if (initial.filterPgd !== filterPgd) setFilterPgd(initial.filterPgd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
    const previousPeriod = processedPeriods.find((item) => item.period_key !== nextPeriod)?.period_key || null;
    setSelectedPeriod(nextPeriod);
    setComparePeriod((current) => current || previousPeriod);
    return nextPeriod;
  }

  function getReportParams(periodKey) {
    return {
      period_key: periodKey,
      keyword: searchText || undefined,
      branch_code: effectiveFilterCn || undefined,
      pgd_code: effectiveFilterPgd || undefined,
      loan_type: filterLoanType.length ? filterLoanType.join(',') : undefined,
      officer_code: filterOfficer || undefined,
      unused_service: filterUnusedSvc.length ? filterUnusedSvc.join(',') : undefined,
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
      const [profileResponse, summaryResponse, sourceResponse, groupResponse] = await Promise.all([
        client.get('/customer-processing/profiles', {
          params: {
            ...getReportParams(periodKey),
            include_total: true,
            page: current,
            page_size: pageSize,
          },
        }),
        client.get('/customer-processing/profile-summary', {
          params: getReportParams(periodKey),
        }),
        client.get('/imports/report-sources', {
          params: { period_key: periodKey },
        }),
        client.get('/customer-processing/profile-groups', {
          params: getReportParams(periodKey),
        }),
      ]);
      const profilePayload = profileResponse.data;
      const profileData = Array.isArray(profilePayload) ? profilePayload : profilePayload?.items;
      const normalizedRows = (Array.isArray(profileData) ? profileData : []).map(normalizeProcessedProfile);
      const total = Array.isArray(profilePayload) ? normalizedRows.length : Number(profilePayload?.total || 0);
      if (!normalizedRows.length && total === 0) {
        message.warning(`Kỳ ${periodKey} chưa có dữ liệu khách hàng đã xử lý`);
      }
      setRows(normalizedRows);
      setReportPagination({ current, pageSize, total });
      setReportSummary(summaryResponse.data || {});
      setGroupStats(groupResponse.data || { groups: [], thresholds: {} });
      setSourceRows(Array.isArray(sourceResponse.data) ? sourceResponse.data : []);
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadPeriodComparison(current = selectedPeriod, previous = comparePeriod) {
    if (!current || !previous || current === previous) {
      setPeriodComparison(null);
      return;
    }
    try {
      const { data } = await client.get('/customer-processing/period-comparison', {
        params: {
          current_period: current,
          previous_period: previous,
          branch_code: effectiveFilterCn || undefined,
          pgd_code: effectiveFilterPgd || undefined,
        },
      });
      setPeriodComparison(data || null);
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    }
  }

  async function loadFilterOptions(period = selectedPeriod) {
    if (!period) return;
    try {
      const { data } = await client.get('/customer-processing/profile-filter-options', {
        params: {
          period_key: period,
          branch_code: effectiveFilterCn || undefined,
          pgd_code: effectiveFilterPgd || undefined,
        },
      });
      setFilterOptions(data || { branches: [], pgds: [], pgd_options: [], pgd_names: {}, loan_types: [], officers: [] });
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
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
    if (!reportReady || !selectedPeriod) return;
    loadFilterOptions(selectedPeriod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportReady, selectedPeriod, effectiveFilterCn, effectiveFilterPgd]);

  useEffect(() => {
    if (!reportReady || !selectedPeriod || !comparePeriod) return;
    loadPeriodComparison(selectedPeriod, comparePeriod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportReady, selectedPeriod, comparePeriod, effectiveFilterCn, effectiveFilterPgd]);

  useEffect(() => {
    if (!reportReady || !selectedPeriod) return undefined;
    const timer = window.setTimeout(() => {
      loadReport(selectedPeriod, { ...reportPagination, current: 1 });
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, filterOfficer, filterUnusedSvc, effectiveFilterCn, effectiveFilterPgd, filterLoanType, filterMultiBranch]);

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

  async function loadGroupCustomers(group = selectedGroup, nextPagination = groupPagination) {
    if (!selectedPeriod || !group?.key) return;
    const current = nextPagination?.current || 1;
    const pageSize = nextPagination?.pageSize || 25;
    setGroupLoading(true);
    try {
      const { data } = await client.get('/customer-processing/profiles', {
        params: {
          ...getReportParams(selectedPeriod),
          group_key: group.key,
          include_total: true,
          page: current,
          page_size: pageSize,
        },
      });
      setGroupRows((data?.items || []).map(normalizeProcessedProfile));
      setGroupPagination({
        current,
        pageSize,
        total: Number(data?.total || 0),
      });
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setGroupLoading(false);
    }
  }

  function openGroupModal(group) {
    setSelectedGroup(group);
    setGroupModalOpen(true);
    loadGroupCustomers(group, { current: 1, pageSize: groupPagination.pageSize, total: 0 });
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
    if (filterOptions.officers?.length) return filterOptions.officers;
    const map = new Map();
    rows.forEach((r) => {
      if (r.ma_cb) map.set(r.ma_cb, r.ten_can_bo || r.ma_cb);
    });
    return [...map.entries()].map(([code, name]) => ({
      value: code,
      label: `${name} (${code})`,
    }));
  }, [filterOptions.officers, rows]);

  const cnOptions = useMemo(() => {
    const allowed = new Set(branchScope.allowedBranches || []);
    const sourceBranches = filterOptions.branches?.length
      ? filterOptions.branches
      : [...new Set(
        rows.flatMap((r) => String(r.ma_cn || '').split(',').map((item) => item.trim()).filter(Boolean))
      )];
    const visibleBranches = branchScope.canViewProvince || allowed.size === 0
      ? sourceBranches
      : sourceBranches.filter((cn) => allowed.has(cn));
    return visibleBranches.map(cn => ({
        value: cn,
        label: CN_NAMES[cn] || `Chi nhánh ${cn}`
    }));
  }, [branchScope.allowedBranches, branchScope.canViewProvince, filterOptions.branches, rows]);

  const pgdOptions = useMemo(() => {
    const allowed = new Set(branchScope.allowedPgds || []);
    const sourcePgds = filterOptions.pgd_options?.length
      ? filterOptions.pgd_options
      : [...new Set(
      rows
        .filter((r) => !effectiveFilterCn || String(r.ma_cn || '').includes(effectiveFilterCn))
        .flatMap(r => String(r.ma_pgd || '').split(',').map((item) => item.trim()).filter(Boolean))
        .filter(Boolean)
    )];
    const visiblePgds = branchScope.canViewProvince || allowed.size === 0
      ? sourcePgds
      : sourcePgds.filter((pgd) => allowed.has(typeof pgd === 'string' ? pgd : pgd.value));
    return visiblePgds.map(pgd => ({
      value: typeof pgd === 'string' ? pgd : pgd.value,
      label: typeof pgd === 'string' ? formatPgdLabel(pgd, filterOptions.pgd_names || {}) : pgd.label,
    }));
  }, [branchScope.allowedPgds, branchScope.canViewProvince, filterOptions.pgd_options, filterOptions.pgd_names, rows, effectiveFilterCn]);

  const loanTypeOptions = useMemo(() => {
    if (filterOptions.loan_types?.length) {
      return filterOptions.loan_types.map((value) => ({ value, label: value }));
    }
    const values = [...new Set(rows.map((row) => row.loai_vay).filter(Boolean))];
    return values.sort().map((value) => ({ value, label: value }));
  }, [filterOptions.loan_types, rows]);

  const reportStatCards = useMemo(() => {
    const totalCustomers = reportSummary.total_customers || reportPagination.total;
    const groupCount = (key) => Number((groupStats.groups || []).find((item) => item.key === key)?.count || 0);
    const noServiceCustomers = Number(reportSummary.no_service_customers || 0);
    const serviceCoverage = totalCustomers
      ? Math.round(((Number(totalCustomers) - noServiceCustomers) / Number(totalCustomers)) * 100)
      : 0;
    return [
      {
        tone: 'blue',
        icon: <UserOutlined />,
        label: 'Tổng khách hàng',
        value: money(totalCustomers),
        unit: 'toàn bộ',
      },
      {
        tone: 'red',
        icon: <WalletOutlined />,
        label: 'Tổng dư nợ',
        value: compactMoney(reportSummary.total_loan),
        unit: 'đ',
        tooltip: moneyTooltip(reportSummary.total_loan),
      },
      {
        tone: 'green',
        icon: <BankOutlined />,
        label: 'Tổng tiền gửi',
        value: compactMoney(reportSummary.total_deposit),
        unit: 'đ',
        tooltip: moneyTooltip(reportSummary.total_deposit),
      },
      {
        tone: 'cyan',
        icon: <RiseOutlined />,
        label: 'TGTT bình quân',
        value: compactMoney(reportSummary.total_casa),
        unit: 'đ',
        tooltip: moneyTooltip(reportSummary.total_casa),
      },
      {
        tone: 'blue',
        icon: <TeamOutlined />,
        label: 'KH nhiều chi nhánh',
        value: money(groupCount('multi_branch')),
        unit: 'KH',
        tooltip: 'Khách hàng phát sinh tại hơn 1 chi nhánh',
        onClick: () => {
          const group = (groupStats.groups || []).find((item) => item.key === 'multi_branch');
          if (group) openGroupModal(group);
        },
      },
      {
        tone: 'gold',
        icon: <WarningOutlined />,
        label: 'KH chưa dùng dịch vụ',
        value: money(noServiceCustomers),
        unit: 'KH',
        tooltip: `Trên tổng ${money(totalCustomers)} khách hàng`,
        onClick: openNoServiceModal,
      },
      {
        tone: 'green',
        icon: <AimOutlined />,
        label: 'Tiềm năng bán chéo',
        value: money(groupCount('cross_sell')),
        unit: 'KH',
        tooltip: 'Có ít nhất một cảnh báo bán chéo từ dữ liệu hiện có',
        onClick: () => {
          const group = (groupStats.groups || []).find((item) => item.key === 'cross_sell');
          if (group) openGroupModal(group);
        },
      },
      {
        tone: 'cyan',
        icon: <CheckCircleFilled />,
        label: 'Tỷ lệ phủ dịch vụ',
        value: `${serviceCoverage}%`,
        unit: `${money(Number(totalCustomers) - noServiceCustomers)} KH có dịch vụ`,
        tooltip: 'Tỷ lệ khách hàng có ít nhất 1 dịch vụ đã ghi nhận',
      },
    ];
  }, [groupStats.groups, reportPagination.total, reportSummary]);

  const groupCards = useMemo(() => {
    const toneByKey = {
      large_deposit: 'green',
      large_loan: 'red',
      high_casa: 'cyan',
      multi_branch: 'blue',
      cross_sell: 'gold',
    };
    const iconByKey = {
      large_deposit: <BankOutlined />,
      large_loan: <WalletOutlined />,
      high_casa: <RiseOutlined />,
      multi_branch: <TeamOutlined />,
      cross_sell: <AimOutlined />,
    };
    return (groupStats.groups || []).map((item) => ({
      key: item.key,
      tone: toneByKey[item.key] || 'blue',
      icon: iconByKey[item.key] || <UserOutlined />,
      label: item.label,
      value: money(item.count || 0),
      unit: 'KH',
      tooltip: item.description,
      onClick: () => openGroupModal(item),
    }));
  }, [groupStats, selectedPeriod, effectiveFilterCn, effectiveFilterPgd]);

  const comparisonItems = useMemo(() => {
    if (!periodComparison?.summary) return [];
    return [
      {
        key: 'customers',
        label: 'Khách hàng',
        current: periodComparison.summary.customers?.current,
        previous: periodComparison.summary.customers?.previous,
        delta: periodComparison.summary.customers?.delta,
        isMoney: false,
      },
      {
        key: 'deposit',
        label: 'Tiền gửi CKH',
        current: periodComparison.summary.deposit?.current,
        previous: periodComparison.summary.deposit?.previous,
        delta: periodComparison.summary.deposit?.delta,
        isMoney: true,
      },
      {
        key: 'loan',
        label: 'Dư nợ',
        current: periodComparison.summary.loan?.current,
        previous: periodComparison.summary.loan?.previous,
        delta: periodComparison.summary.loan?.delta,
        isMoney: true,
      },
      {
        key: 'casa',
        label: 'TGTT bình quân',
        current: periodComparison.summary.casa?.current,
        previous: periodComparison.summary.casa?.previous,
        delta: periodComparison.summary.casa?.delta,
        isMoney: true,
      },
    ];
  }, [periodComparison]);

  const crossSellCards = useMemo(() => {
    const crossSellGroup = (groupStats.groups || []).find((item) => item.key === 'cross_sell');
    return [
      {
        tone: 'green',
        icon: <AimOutlined />,
        label: 'Tổng cơ hội bán chéo',
        value: money(crossSellGroup?.count || 0),
        unit: 'KH',
        tooltip: crossSellGroup?.description,
        onClick: () => crossSellGroup && openGroupModal(crossSellGroup),
      },
      {
        tone: 'cyan',
        icon: <BankOutlined />,
        label: 'TG lớn thiếu Agribank Plus',
        value: 'Quy tắc',
        unit: '>= 1 tỷ',
        tooltip: 'Có tiền gửi CKH + TGTT bình quân lớn nhưng chưa dùng Agribank Plus',
      },
      {
        tone: 'red',
        icon: <WalletOutlined />,
        label: 'Có dư nợ thiếu SMS vay',
        value: 'Quy tắc',
        unit: 'Dư nợ > 0',
        tooltip: 'Có dư nợ nhưng chưa có SMS nhắc nợ vay',
      },
      {
        tone: 'blue',
        icon: <TeamOutlined />,
        label: 'Nhiều CN cần phân công',
        value: money((groupStats.groups || []).find((item) => item.key === 'multi_branch')?.count || 0),
        unit: 'KH',
        tooltip: 'Khách hàng phát sinh nhiều chi nhánh cần xác định đầu mối quản lý chính',
      },
    ];
  }, [groupStats.groups]);

  const serviceGroupCards = useMemo(() => SERVICE_GROUPS_ORDER.map((group) => {
    const services = SERVICE_BY_GROUP[group] || [];
    const activeKeys = services.map((item) => item.key);
    const usedCount = rows.reduce((count, row) => (
      count + (activeKeys.some((key) => Number(row[key] || 0) > 0) ? 1 : 0)
    ), 0);
    return {
      tone: group === 'Digital' ? 'cyan' : group === 'Thẻ' ? 'gold' : group === 'Bảo lãnh/TTQT' ? 'red' : 'blue',
      icon: <CheckCircleFilled />,
      label: group,
      value: money(usedCount),
      unit: `KH trên trang · ${services.length} DV`,
      tooltip: services.map((item) => item.label).join(', '),
    };
  }), [rows]);

  const dataQualityWarnings = useMemo(() => {
    const warnings = [];
    const missingSources = sourceRows.filter((item) => item.status === 'missing' || item.status === 'error');
    missingSources.forEach((item) => {
      warnings.push({
        key: `source-${item.source_code}`,
        color: item.status === 'error' ? 'red' : 'orange',
        title: `Nguồn ${item.source_code} ${item.status === 'error' ? 'bị lỗi' : 'chưa đủ dữ liệu'}`,
        description: item.message || item.source_name || 'Cần kiểm tra lại file nguồn của kỳ dữ liệu',
      });
    });
    warnings.push(
      {
        key: 'missing-name',
        color: 'gold',
        title: 'KH có mã nhưng thiếu tên',
        description: 'Nên bổ sung endpoint kiểm tra DP01 có MA_KH nhưng TEN_KH trống.',
      },
      {
        key: 'multi-branch-owner',
        color: 'blue',
        title: 'KH nhiều chi nhánh chưa rõ cán bộ chính',
        description: 'Cần cảnh báo riêng khi branch_count > 1 nhưng ma_cb hoặc ten_can_bo trống.',
      },
      {
        key: 'oab-unmatched',
        color: 'purple',
        title: 'Dữ liệu OAB không khớp DP01',
        description: 'Nên thêm chỉ tiêu số dòng OAB không tìm thấy SO_TAI_KHOAN trong DP01.',
      },
      {
        key: 'optional-not-processed',
        color: 'cyan',
        title: 'File bổ sung chưa đưa vào xử lý',
        description: 'Cần cảnh báo file bổ sung đã upload nhưng kỳ chưa chạy lại xử lý khách hàng.',
      },
    );
    return warnings;
  }, [sourceRows]);

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
    if (filterUnusedSvc.length) {
      result = result.filter((r) => filterUnusedSvc.every((service) => Number(r[service] || 0) === 0));
    }
    if (filterLoanType.length) {
      result = result.filter((r) => filterLoanType.some((type) => String(r.loai_vay || '').includes(type)));
    }
    if (filterMultiBranch !== null) {
      result = result.filter((r) => filterMultiBranch ? Number(r.branch_count || 0) > 1 : Number(r.branch_count || 0) <= 1);
    }
    // 4. lọc theo Chi nhánh (CN)
    if (effectiveFilterCn) {
      result = result.filter((r) => String(r.ma_cn || '').split(',').map((item) => item.trim()).includes(effectiveFilterCn));
    }
    // 5. lọc theo Phòng giao dịch (PGD)
    if (effectiveFilterPgd) {
      result = result.filter((r) => String(r.ma_pgd || '').includes(effectiveFilterPgd));
    }
    // 6. Sắp xếp theo PGD nếu chỉ chọn lọc theo CN mà không chọn PGD cụ thể
    if (effectiveFilterCn && !effectiveFilterPgd) {
      result = [...result].sort((a, b) => (a.ma_pgd || '').localeCompare(b.ma_pgd || ''));
    }
    return result;
  }, [rows, searchText, filterOfficer, filterUnusedSvc, effectiveFilterCn, effectiveFilterPgd, filterLoanType, filterMultiBranch]);

  const sourceColumns = useMemo(() => [
    {
      title: 'Nguồn',
      dataIndex: 'source_code',
      key: 'source_code',
      width: 110,
      render: (value, row) => (
        <Space orientation="vertical" size={2}>
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
    <div className="customer-report-page page-stack">
      <div className="report-page-header">
        <div>
          <Title level={2}>Bảng quản lý khách hàng</Title>
          <Text type="secondary">
            Theo dõi dữ liệu khách hàng theo kỳ, đối chiếu sản phẩm dịch vụ và cơ hội chăm sóc.
          </Text>
        </div>
        <Tag color="red" className="report-header-badge">C360</Tag>
      </div>

      <div className="report-sticky-toolbar">
        <Form form={form} layout="vertical">
          <Row gutter={[10, 8]} align="bottom">
            <Col xs={24} sm={12} lg={4}>
              <Form.Item label="Kỳ dữ liệu" style={{ marginBottom: 0 }}>
                <Select
                  placeholder="Chọn kỳ"
                  value={selectedPeriod}
                  options={reportPeriods.map((item) => ({
                    value: item.period_key,
                    label: `${item.period_key} · ${money(item.profile_count)} KH`,
                  }))}
                  onChange={async (value) => {
                    setSelectedPeriod(value);
                    if (comparePeriod === value) {
                      setComparePeriod(reportPeriods.find((item) => item.period_key !== value)?.period_key || null);
                    }
                    await loadReport(value, { current: 1, pageSize: reportPagination.pageSize, total: 0 });
                  }}
                  notFoundContent={<Empty description="Chưa có kỳ đã xử lý" imageStyle={{ height: 34 }} />}
                  showSearch
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} lg={4}>
              <Form.Item label="So sánh với kỳ" style={{ marginBottom: 0 }}>
                <Select
                  allowClear
                  placeholder="Chọn kỳ"
                  value={comparePeriod}
                  options={reportPeriods
                    .filter((item) => item.period_key !== selectedPeriod)
                    .map((item) => ({
                      value: item.period_key,
                      label: `${item.period_key} · ${money(item.profile_count)} KH`,
                    }))}
                  onChange={setComparePeriod}
                  notFoundContent={<Empty description="Chưa có kỳ khác" imageStyle={{ height: 34 }} />}
                  showSearch
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} lg={4}>
              <Form.Item label="Chi nhánh" style={{ marginBottom: 0 }}>
                <Select
                  placeholder="Tất cả chi nhánh"
                  value={filterCn}
                  onChange={handleCnChange}
                  allowClear
                  options={cnOptions}
                  showSearch
                  disabled={!branchScope.canChangeBranch}
                  filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} lg={4}>
              <Form.Item label="PGD/phòng ban" style={{ marginBottom: 0 }}>
                <Select
                  placeholder={effectiveFilterCn ? 'Tất cả PGD thuộc chi nhánh' : 'Tất cả PGD'}
                  value={filterPgd}
                  onChange={handlePgdChange}
                  allowClear
                  options={pgdOptions}
                  showSearch
                  disabled={!branchScope.canChangePgd}
                  filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} lg={4}>
              <Form.Item label="Cán bộ phụ trách" style={{ marginBottom: 0 }}>
                <Select
                  placeholder={effectiveFilterCn ? 'Cán bộ thuộc chi nhánh' : 'Tất cả cán bộ'}
                  value={filterOfficer}
                  onChange={setFilterOfficer}
                  allowClear
                  options={officerOptions}
                  showSearch
                  filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                  notFoundContent={<Empty description="Không có cán bộ" imageStyle={{ height: 30 }} />}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} lg={4}>
              <Form.Item label=" " style={{ marginBottom: 0 }}>
                <Space.Compact block>
                  <Button
                    icon={<FilterOutlined />}
                    onClick={() => setAdvancedFilterOpen(true)}
                  >
                    Bộ lọc nâng cao
                    {activeFilterCount > 0 && <Badge count={activeFilterCount} size="small" offset={[6, -2]} />}
                  </Button>
                  <Button
                    type="primary"
                    icon={<SearchOutlined />}
                    loading={loading}
                    onClick={() => loadReport(selectedPeriod, { ...reportPagination, current: 1 })}
                  />
                </Space.Compact>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </div>

      <Drawer
        title={
          <Space>
            <FilterOutlined />
            <span>Bộ lọc nâng cao</span>
            {activeFilterCount > 0 && <Tag color="red">{activeFilterCount} điều kiện</Tag>}
          </Space>
        }
        open={advancedFilterOpen}
        onClose={() => setAdvancedFilterOpen(false)}
        width={520}
        className="report-filter-drawer"
        extra={
          <Space>
            <Button onClick={resetReportFilters} danger disabled={activeFilterCount === 0}>
              Xóa lọc
            </Button>
            <Button
              type="primary"
              loading={loading}
              onClick={() => {
                setAdvancedFilterOpen(false);
                loadReport(selectedPeriod, { ...reportPagination, current: 1 });
              }}
            >
              Áp dụng
            </Button>
          </Space>
        }
      >
        <Form layout="vertical">
          <Form.Item label="Tìm kiếm nhanh">
            <Input
              placeholder="Tên KH / CIF / Mã CB / SĐT"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
              prefix={<SearchOutlined style={{ color: '#cbd5e1' }} />}
            />
          </Form.Item>
          <Form.Item label="Loại vay">
            <CheckboxPopoverFilter
              title="Chọn loại vay"
              placeholder="Tất cả loại vay"
              options={loanTypeOptions}
              value={filterLoanType}
              onChange={setFilterLoanType}
            />
          </Form.Item>
          <Form.Item label="Phạm vi khách hàng">
            <Select
              placeholder="Tất cả"
              value={filterMultiBranch}
              onChange={setFilterMultiBranch}
              allowClear
              options={[
                { value: true, label: 'Nhiều chi nhánh' },
                { value: false, label: 'Một chi nhánh' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Khách hàng chưa dùng dịch vụ">
            <CheckboxPopoverFilter
              title="Chọn dịch vụ khách hàng chưa dùng"
              placeholder="Tất cả dịch vụ"
              options={ACTIVE_SERVICES.map((item) => ({ value: item.key, label: item.label }))}
              value={filterUnusedSvc}
              onChange={setFilterUnusedSvc}
              className="report-checkbox-filter--services"
            />
          </Form.Item>
          <Form.Item label="Chế độ xem">
            <Segmented
              block
              value={viewMode}
              onChange={setViewMode}
              options={[
                { label: 'Báo cáo', value: 'report' },
                { label: 'Nguồn dữ liệu', value: 'sources' },
              ]}
            />
          </Form.Item>
          <Button icon={<DownloadOutlined />} disabled block style={{ opacity: 0.65 }}>
            Xuất Excel
          </Button>
        </Form>
      </Drawer>


      <div className="report-stat-grid">
        {reportStatCards.map((item) => (
          <ReportStatCard key={item.label} {...item} />
        ))}
      </div>

      <Collapse
        className="report-insight-collapse"
        bordered={false}
        defaultActiveKey={[]}
        items={[
          {
            key: 'insights',
            label: (
              <Space>
                <TrophyOutlined />
                <span>Phân tích trọng tâm</span>
                <Tag color="blue">Theo kỳ {selectedPeriod || '—'}</Tag>
              </Space>
            ),
            children: (
              <Tabs
                size="small"
                items={[
                  {
                    key: 'groups',
                    label: 'Phân nhóm KH',
                    children: (
                      <div className="report-mini-stat-grid">
                        {groupCards.map((item) => (
                          <ReportStatCard key={item.label} {...item} />
                        ))}
                      </div>
                    ),
                  },
                  {
                    key: 'cross-sell',
                    label: 'Cơ hội bán chéo',
                    children: (
                      <div className="report-mini-stat-grid">
                        {crossSellCards.map((item) => (
                          <ReportStatCard key={item.label} {...item} />
                        ))}
                      </div>
                    ),
                  },
                  {
                    key: 'comparison',
                    label: 'So sánh 2 kỳ',
                    children: periodComparison ? (
                      <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                        <Space size={[6, 6]} wrap>
                          <Tag color="blue" icon={<SwapOutlined />}>{comparePeriod} → {selectedPeriod}</Tag>
                          <Tag color="green">KH mới: {money(periodComparison.new_customers || 0)}</Tag>
                          <Tag color="red">KH không còn phát sinh: {money(periodComparison.lost_customers || 0)}</Tag>
                        </Space>
                        <Row gutter={[8, 8]}>
                          {comparisonItems.map((item) => (
                            <Col xs={24} sm={12} xl={6} key={item.key}>
                              <div className="comparison-tile">
                                <Text type="secondary">{item.label}</Text>
                                <div className="comparison-values">
                                  <Tooltip title={`Kỳ hiện tại: ${item.isMoney ? moneyTooltip(item.current) : money(item.current)}`}>
                                    <Text strong>{item.isMoney ? compactMoney(item.current) : money(item.current)}</Text>
                                  </Tooltip>
                                  {trendTag(item.delta, item.isMoney)}
                                </div>
                              </div>
                            </Col>
                          ))}
                        </Row>
                        <Space size={[6, 6]} wrap>
                          {Object.entries(periodComparison.new_services || {}).slice(0, 6).map(([key, count]) => (
                            <Tag key={`new-${key}`} color="green">
                              Mới dùng {SERVICE_LABEL_BY_KEY[key] || key}: {money(count)}
                            </Tag>
                          ))}
                          {Object.entries(periodComparison.lost_services || {}).slice(0, 6).map(([key, count]) => (
                            <Tag key={`lost-${key}`} color="red">
                              Mất {SERVICE_LABEL_BY_KEY[key] || key}: {money(count)}
                            </Tag>
                          ))}
                        </Space>
                      </Space>
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chọn kỳ so sánh để xem tăng/giảm" />
                    ),
                  },
                  {
                    key: 'services',
                    label: 'Dịch vụ',
                    children: (
                      <div className="report-mini-stat-grid">
                        {serviceGroupCards.map((item) => (
                          <ReportStatCard key={item.label} {...item} />
                        ))}
                      </div>
                    ),
                  },
                  {
                    key: 'warnings',
                    label: 'Cảnh báo dữ liệu',
                    children: (
                      <div className="report-warning-list">
                        {dataQualityWarnings.map((item) => (
                          <div className="report-warning-item" key={item.key}>
                            <Tag color={item.color} icon={<WarningOutlined />}>{item.title}</Tag>
                            <Text type="secondary">{item.description}</Text>
                          </div>
                        ))}
                      </div>
                    ),
                  },
                ]}
              />
            ),
          },
        ]}
      />

      {/* Thanh trạng thái bộ lọc đang active */}
      {activeFilterCount > 0 && (
        <div className="active-filter-bar">
          <Space size={8} wrap>
            <RiseOutlined style={{ color: '#7c3aed' }} />
            <Text strong style={{ fontSize: 13 }}>Đang lọc:</Text>
            {searchText && (
              <Tag
                color="default"
                closable
                onClose={() => setSearchText('')}
              >
                Từ khóa: {searchText}
              </Tag>
            )}
            {effectiveFilterCn && (
              <Tag
                color="blue"
                closable
                onClose={() => handleCnChange(null)}
              >
                CN: {CN_NAMES[effectiveFilterCn] || effectiveFilterCn}
              </Tag>
            )}
            {effectiveFilterPgd && (
              <Tag
                color="cyan"
                closable
                onClose={() => handlePgdChange(null)}
              >
                PGD: {formatPgdLabel(effectiveFilterPgd, filterOptions.pgd_names || {})}
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
            {filterLoanType.map((item) => (
              <Tag
                key={item}
                color="volcano"
                closable
                onClose={() => setFilterLoanType((values) => values.filter((value) => value !== item))}
              >
                Loại vay: {item}
              </Tag>
            ))}
            {filterMultiBranch !== null && (
              <Tag
                color="geekblue"
                closable
                onClose={() => setFilterMultiBranch(null)}
              >
                {filterMultiBranch ? 'KH nhiều chi nhánh' : 'KH một chi nhánh'}
              </Tag>
            )}
            {filterUnusedSvc.map((serviceKey) => (
              <Tag
                key={serviceKey}
                color="red"
                closable
                onClose={() => setFilterUnusedSvc((values) => values.filter((value) => value !== serviceKey))}
                icon={<AimOutlined />}
              >
                Chưa dùng: {SERVICE_DEFS.find((s) => s.key === serviceKey)?.label}
              </Tag>
            ))}
            <Text type="secondary" style={{ fontSize: 12 }}>
              → {money(reportPagination.total)} khách hàng phù hợp
            </Text>
          </Space>
        </div>
      )}

      {/* Nội dung chính */}
      {viewMode === 'sources' ? (
        <Card
          className="report-data-card"
          title="Theo dõi nguồn dữ liệu"
          extra={<Text type="secondary">Nguồn dữ liệu của kỳ đang xem</Text>}
        >
          {sourceRows.length > 0 ? (
            <Table
              className="report-table"
              bordered
              size="small"
              rowKey="source_code"
              columns={sourceColumns}
              dataSource={sourceRows}
              pagination={false}
              scroll={{ x: 980 }}
              locale={{ emptyText: <Empty description="Chưa có trạng thái nguồn dữ liệu" /> }}
            />
          ) : (
            <Row gutter={[12, 12]}>
              {sourceGroups.map((item) => (
                <Col xs={24} md={8} key={item.label}>
                  <div className="source-tile">
                    <Space orientation="vertical" size={8}>
                      <Text strong>{item.label}</Text>
                      {sourceTag(item.source)}
                      <Text type="secondary">{item.note}</Text>
                    </Space>
                  </div>
                </Col>
              ))}
            </Row>
          )}
        </Card>
      ) : (
        <Card
          className="report-data-card"
          title={
            <Space>
             
              <Tag color="blue">Tổng: {money(reportPagination.total)} KH</Tag>
              <Tag color="geekblue">Trang hiện tại: {filteredRows.length} dòng</Tag>
            </Space>
          }
          extra={
            <Space size={12}>
              <Popover
                trigger="click"
                placement="bottomRight"
                title="Chọn cột hiển thị"
                content={
                  <div className="report-column-chooser">
                    <Checkbox.Group
                      value={visibleColumnKeys}
                      onChange={(values) => setVisibleColumnKeys(values)}
                      options={columnOptions}
                    />
                    <Space style={{ marginTop: 10 }}>
                      <Button size="small" onClick={() => setVisibleColumnKeys(DEFAULT_REPORT_COLUMN_KEYS)}>
                        Mặc định
                      </Button>
                      <Button size="small" onClick={() => setVisibleColumnKeys(columnOptions.map((item) => item.value))}>
                        Tất cả
                      </Button>
                    </Space>
                  </div>
                }
              >
                <Button size="small" icon={<FilterOutlined />}>Chọn cột</Button>
              </Popover>
              {filterUnusedSvc.length > 0 && (
                <Tag color="orange" icon={<AimOutlined />}>
                  Chưa dùng: {filterUnusedSvc.length} dịch vụ
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
            className="report-table"
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
            {
              title: 'PGD',
              dataIndex: 'ma_pgd',
              width: 180,
              ellipsis: true,
              render: (value) => {
                const items = normalizePgdCodes(value);
                return items.length
                  ? items.map((item) => formatPgdLabel(item, filterOptions.pgd_names || {})).join(', ')
                  : '—';
              },
            },
            { title: 'Cán bộ', key: 'officer', width: 170, ellipsis: true, render: (_, row) => row.ten_can_bo || row.ma_cb || '—' },
            { title: 'Dư nợ', dataIndex: 'so_du_tien_vay', width: 130, align: 'right', render: money },
            { title: 'CKH', dataIndex: 'so_du_tien_gui_ckh', width: 130, align: 'right', render: money },
            { title: 'TGTT BQ', dataIndex: 'so_du_tgtt_binh_quan', width: 130, align: 'right', render: money },
            { title: 'SĐT', dataIndex: 'telephone', width: 130, render: (value) => value || '—' },
          ]}
          locale={{ emptyText: <Empty description="Không có khách hàng phù hợp" /> }}
        />
      </Modal>
      <Modal
        open={groupModalOpen}
        onCancel={() => setGroupModalOpen(false)}
        footer={<Button onClick={() => setGroupModalOpen(false)}>Đóng</Button>}
        width="96vw"
        style={{ top: 24 }}
        title={
          <Space>
            <TrophyOutlined style={{ color: '#8f1438' }} />
            <span>{selectedGroup?.label || 'Danh sách khách hàng theo nhóm'}</span>
            <Tag color="blue">{money(groupPagination.total)} KH</Tag>
          </Space>
        }
      >
        <Paragraph type="secondary" style={{ marginTop: -4 }}>
          {selectedGroup?.description || 'Danh sách khách hàng thuộc nhóm đã chọn, có áp dụng phạm vi lọc hiện tại.'}
        </Paragraph>
        <Table
          className="report-table"
          bordered
          size="small"
          rowKey="ma_kh_chuan"
          columns={columns}
          dataSource={groupRows}
          loading={groupLoading}
          scroll={{ x: 'max-content', y: 520 }}
          pagination={{
            current: groupPagination.current,
            pageSize: groupPagination.pageSize,
            total: groupPagination.total,
            showSizeChanger: true,
            pageSizeOptions: [25, 50, 100],
            showTotal: (total, range) => `${range[0]}-${range[1]} / ${money(total)} khách hàng`,
          }}
          onChange={(pagination) => {
            loadGroupCustomers(selectedGroup, {
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: groupPagination.total,
            });
          }}
          locale={{ emptyText: <Empty description="Không có khách hàng thuộc nhóm này" /> }}
        />
      </Modal>
      <CustomerDetailModal customer={detailCustomer} open={detailOpen} onClose={() => setDetailOpen(false)} />
      <UnusedServicesModal customer={unusedCustomer} open={unusedOpen} onClose={() => setUnusedOpen(false)} />
    </div>
  );
}

export default CustomerReport;

