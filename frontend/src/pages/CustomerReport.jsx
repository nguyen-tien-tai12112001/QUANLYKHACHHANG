import { useCallback, useMemo, useState } from 'react';
import {
  AimOutlined,
  RiseOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Button, Form, Modal, Space, Table, Tabs, Tag, Typography, message } from 'antd';

import { resolveBranchScope, useAuth } from '../auth';
import { ALL_BRANCHES_VALUE, CN_NAMES, PGD_NAMES } from '../constants/branches';
import {
  SERVICE_DEFS,
  ACTIVE_SERVICES,
  TOTAL_SERVICES,
  SERVICE_GROUPS_ORDER,
  SERVICE_BY_GROUP,
  GROUP_COLORS,
} from '../constants/services';
import CustomerDetailModal from '../components/report/CustomerDetailModal';
import ReportCustomerTable from '../components/report/ReportCustomerTable';
import ReportFilterBar from '../components/report/ReportFilterBar';
import ReportSummaryPanel from '../components/report/ReportSummaryPanel';
import { useBranchFilters } from '../hooks/useBranchFilters';
import { useCustomerReport } from '../hooks/useCustomerReport';
import { useReportFilters } from '../hooks/useReportFilters';
import { money } from '../utils/customerMetrics';
import { formatPgdLabel } from '../utils/reportHelpers';
import { CROSS_SELL_PRESETS, hasActiveFilters } from '../utils/reportParams';

const { Text, Title } = Typography;

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

function CheckboxPopoverFilter({ title, placeholder, options, value, onChange, className = '' }) {
  const selected = Array.isArray(value) ? value : [];
  const selectedLabels = options
    .filter((item) => selected.includes(item.value))
    .map((item) => item.label);
  const buttonText = selectedLabels.length
    ? `${selectedLabels.length} đã chọn`
    : placeholder;

  const content = (
    <div className={`report-checkbox-filter ${className}`}>
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


// ─── Component chính ───────────────────────────────────────────────────────────
function CustomerReport() {
  const [form] = Form.useForm();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('list');
  const [detailCustomer, setDetailCustomer] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [noServiceOpen, setNoServiceOpen] = useState(false);
  const [noServiceRows, setNoServiceRows] = useState([]);
  const [noServiceLoading, setNoServiceLoading] = useState(false);
  const [noServicePagination, setNoServicePagination] = useState({ current: 1, pageSize: 25, total: 0 });

  const { filters, searchText, setSearchText, updateFilter, resetFilters } = useReportFilters();

  const {
    filterCn,
    filterPgd,
    cnOptions,
    pgdOptions,
    handleCnChange: branchCnChange,
    handlePgdChange: branchPgdChange,
    resetScope,
    branchSelectDisabled,
    pgdSelectDisabled,
  } = useBranchFilters([], {});

  const branchScope = useMemo(
    () => resolveBranchScope(user, filterCn, filterPgd),
    [user, filterCn, filterPgd],
  );

  const {
    rows,
    reportPeriods,
    selectedPeriod,
    setSelectedPeriod,
    pagination,
    summary,
    analytics,
    filterOptions,
    loading,
    analyticsLoading,
    loadReport,
    loadNoServiceCustomers,
  } = useCustomerReport({
    filters,
    filterCn,
    filterPgd,
  });

  const openDetail = useCallback((row) => {
    setDetailCustomer(row);
    setDetailOpen(true);
  }, []);

  const handleCnChange = useCallback((value) => {
    branchCnChange(value);
    updateFilter('filterOfficer', null);
  }, [branchCnChange, updateFilter]);

  const handleReset = useCallback(() => {
    resetFilters();
    resetScope();
  }, [resetFilters, resetScope]);

  const handleNoServiceFromSummary = useCallback(() => {
    updateFilter('noService', true);
    setActiveTab('list');
  }, [updateFilter]);

  const officerOptions = useMemo(() => {
    if (filterOptions.officers?.length) return filterOptions.officers;
    return [];
  }, [filterOptions.officers]);

  const cnSelectOptions = useMemo(() => {
    const allowed = new Set(branchScope.allowedBranches || []);
    const sourceBranches = filterOptions.branches?.length ? filterOptions.branches : [];
    const visible = branchScope.canViewProvince || allowed.size === 0
      ? sourceBranches
      : sourceBranches.filter((cn) => allowed.has(cn));
    return visible.map((cn) => ({ value: cn, label: CN_NAMES[cn] || cn }));
  }, [branchScope, filterOptions.branches]);

  const pgdSelectOptions = useMemo(() => {
    if (filterOptions.pgd_options?.length) return filterOptions.pgd_options;
    return (filterOptions.pgds || []).map((pgd) => ({
      value: pgd,
      label: formatPgdLabel(pgd, filterOptions.pgd_names || {}),
    }));
  }, [filterOptions]);

  const loanTypeOptions = useMemo(
    () => (filterOptions.loan_types || []).map((value) => ({ value, label: value })),
    [filterOptions.loan_types],
  );

  const filtersActive = hasActiveFilters(filters, filterCn, filterPgd);

  const tabItems = [
    {
      key: 'list',
      label: 'Danh sách KH',
      children: (
        <ReportCustomerTable
          rows={rows}
          loading={loading}
          pagination={pagination}
          onPaginationChange={(next) => loadReport(selectedPeriod, next)}
          onDetailClick={openDetail}
          pgdNameMap={filterOptions.pgd_names || {}}
          filterOfficer={filters.filterOfficer}
          filterUnusedCount={filters.filterUnusedSvc.length}
          onSortChange={({ sortBy, sortOrder }) => {
            updateFilter('sortBy', sortBy);
            updateFilter('sortOrder', sortOrder);
          }}
        />
      ),
    },
    {
      key: 'summary',
      label: 'Tổng hợp nhanh',
      children: (
        <ReportSummaryPanel
          summary={summary}
          analytics={analytics}
          loading={analyticsLoading}
          total={pagination.total}
          filterActive={filtersActive}
          onNoServiceClick={handleNoServiceFromSummary}
        />
      ),
    },
  ];

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

      <ReportFilterBar
        form={form}
        selectedPeriod={selectedPeriod}
        reportPeriods={reportPeriods}
        onPeriodChange={async (value) => {
          setSelectedPeriod(value);
          await loadReport(value, { current: 1, pageSize: pagination.pageSize, total: 0 });
        }}
        loading={loading}
        searchText={searchText}
        onSearchChange={setSearchText}
        filterCn={filterCn}
        filterPgd={filterPgd}
        cnOptions={cnSelectOptions.length ? cnSelectOptions : cnOptions}
        pgdOptions={pgdSelectOptions.length ? pgdSelectOptions : pgdOptions}
        branchSelectDisabled={branchSelectDisabled}
        pgdSelectDisabled={pgdSelectDisabled}
        onCnChange={handleCnChange}
        onPgdChange={branchPgdChange}
        filters={filters}
        onFilterChange={updateFilter}
        loanTypeOptions={loanTypeOptions}
        officerOptions={officerOptions}
        hasFilters={filtersActive}
        onApply={() => loadReport(selectedPeriod, { ...pagination, current: 1 })}
        onReset={handleReset}
      />

      {filtersActive && (
        <div className="active-filter-bar">
          <Space size={8} wrap>
            <RiseOutlined style={{ color: '#7c3aed' }} />
            <Text strong style={{ fontSize: 13 }}>Đang lọc:</Text>
            {filterCn && (
              <Tag color="blue" closable onClose={() => handleCnChange(ALL_BRANCHES_VALUE)}>
                CN: {CN_NAMES[filterCn] || filterCn}
              </Tag>
            )}
            {filterPgd && (
              <Tag color="cyan" closable onClose={() => branchPgdChange(null)}>
                PGD: {formatPgdLabel(filterPgd, filterOptions.pgd_names || {})}
              </Tag>
            )}
            {filters.filterCustomerType && <Tag color="geekblue">Loại KH: {filters.filterCustomerType}</Tag>}
            {filters.filterOfficer && (
              <Tag color="purple" closable onClose={() => updateFilter('filterOfficer', null)} icon={<TeamOutlined />}>
                CB: {officerOptions.find((o) => o.value === filters.filterOfficer)?.label || filters.filterOfficer}
              </Tag>
            )}
            {filters.crossSellRule && (
              <Tag color="magenta">
                {CROSS_SELL_PRESETS.find((item) => item.value === filters.crossSellRule)?.label}
              </Tag>
            )}
            {filters.filterUnusedSvc.map((serviceKey) => (
              <Tag
                key={serviceKey}
                color="red"
                closable
                onClose={() => updateFilter('filterUnusedSvc', filters.filterUnusedSvc.filter((v) => v !== serviceKey))}
                icon={<AimOutlined />}
              >
                Chưa dùng: {ACTIVE_SERVICES.find((s) => s.key === serviceKey)?.label}
              </Tag>
            ))}
            <Text type="secondary" style={{ fontSize: 12 }}>
              → {Number(pagination.total || 0).toLocaleString('vi-VN')} khách hàng phù hợp
            </Text>
          </Space>
        </div>
      )}

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

      <Modal
        open={noServiceOpen}
        onCancel={() => setNoServiceOpen(false)}
        footer={<Button onClick={() => setNoServiceOpen(false)}>Đóng</Button>}
        width={1080}
        title={
          <Space>
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
          }}
          onChange={async (nextPagination) => {
            setNoServiceLoading(true);
            try {
              const result = await loadNoServiceCustomers({
                current: nextPagination.current,
                pageSize: nextPagination.pageSize,
                total: noServicePagination.total,
              });
              setNoServiceRows(result.rows);
              setNoServicePagination(result.pagination);
            } finally {
              setNoServiceLoading(false);
            }
          }}
          columns={[
            { title: 'Mã KH', dataIndex: 'ma_kh_chuan', width: 120 },
            { title: 'Tên khách hàng', dataIndex: 'ten_kh', width: 250, ellipsis: true },
            { title: 'Loại KH', dataIndex: 'loai_khach_hang', width: 90 },
            { title: 'Chi nhánh', dataIndex: 'ma_cn', width: 150, ellipsis: true },
            { title: 'Dư nợ', dataIndex: 'so_du_tien_vay', width: 130, align: 'right', render: money },
          ]}
        />
      </Modal>

      <CustomerDetailModal customer={detailCustomer} open={detailOpen} onClose={() => setDetailOpen(false)} />
    </div>
  );
}

export default CustomerReport;
