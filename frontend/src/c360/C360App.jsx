import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BankOutlined,
  BarChartOutlined,
  CheckCircleFilled,
  CreditCardOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DownloadOutlined,
  FilterOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  SwapOutlined,
  TeamOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Input,
  InputNumber,
  Layout,
  Menu,
  Modal,
  Progress,
  Row,
  Select,
  Skeleton,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';

import logoUrl from '../../favicon.jpg';
import client from '../api/client';
import { toApiBranchParams } from '../auth';
import { scopeToProfileParams, useAnalysisScope } from './AnalysisScopeContext';
import '../demo/demo.css';
import './c360.css';

const { Header, Sider, Content } = Layout;
const { Text, Title } = Typography;
const PAGE_SIZE = 15;

const compactMoney = (value) => {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1_000_000_000_000) return `${(number / 1_000_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} nghìn tỷ`;
  if (Math.abs(number) >= 1_000_000_000) return `${(number / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu`;
  return `${number.toLocaleString('vi-VN')} đ`;
};
const fullMoney = (value) => `${Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} đ`;
const originalMoney = (value, ccy) => `${Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ${ccy || 'VND'}`;
const convertedMoneyCell = (vndValue, originalValue, row) => (
  <div>
    <Text strong>{fullMoney(vndValue)}</Text>
    {row.currency_code && row.currency_code !== 'VND' ? (
      <><br /><Text type="secondary">{originalMoney(originalValue, row.currency_code)} × {Number(row.exchange_rate || 1).toLocaleString('vi-VN')}</Text></>
    ) : null}
  </div>
);
const loanTypeLabel = (value) => {
  const text = String(value || '').trim();
  if (!text) return 'Không có khoản vay';
  const labels = { Ngắn: 'Ngắn hạn', Trung: 'Trung hạn', Dài: 'Dài hạn' };
  return text.split('/').map((part) => labels[part.trim()] || part.trim()).join(' / ');
};
const periodLabel = (value) => value?.length >= 6 ? `${value.slice(4, 6)}/${value.slice(0, 4)}` : value || '—';
const changePercent = (current, previous) => Number(previous) ? ((Number(current) - Number(previous)) / Number(previous)) * 100 : 0;
const dateLabel = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('vi-VN') : '—';
const dateTimeLabel = (value) => value ? new Date(value).toLocaleString('vi-VN') : 'Chưa phát sinh';
const activityLabels = {
  active: ['Đang hoạt động', 'success'],
  low_activity: ['Ít hoạt động', 'warning'],
  inactive: ['Không hoạt động', 'default'],
};
const pf10CategoryLabels = {
  short_term: 'Ngắn hạn',
  medium_long_term: 'Trung dài hạn',
  overdraft: 'Thấu chi',
};
const loanStatusLabels = {
  active: ['Còn hiệu lực', 'success'],
  due_soon: ['Sắp đến hạn', 'warning'],
  due_in_month: ['Đến hạn trong tháng', 'orange'],
  closed: ['Đã đóng', 'default'],
};
const depositStatusLabels = {
  active: ['Đang hoạt động', 'success'],
  inactive: ['Không hoạt động', 'warning'],
  new: ['Mới kỳ này', 'blue'],
  closed: ['Tất toán/ngừng', 'default'],
};

const depositFields = [
  { key: 'so_du_tktt', label: 'Số dư TKTT cuối kỳ', source: 'PF14', money: true },
  { key: 'so_du_tgtt_binh_quan', label: 'Số dư TKTT bình quân', source: 'PF14', money: true },
  { key: 'doanh_so_chuyen_tien_ve_tk', label: 'Doanh số chuyển tiền đến', source: 'GL02', money: true },
  { key: 'so_du_tien_gui', label: 'Tiền gửi có kỳ hạn cuối kỳ', source: 'PF14', money: true },
  { key: 'so_du_tgckh_binh_quan', label: 'Tiền gửi có kỳ hạn bình quân', source: 'PF14', money: true },
  { key: 'ftp_nguon_von', label: 'Lợi ích FTP nguồn vốn', source: 'Nguồn FTP', money: true },
  { key: 'ngay_update', label: 'Giao dịch TKTT gần nhất', source: 'Giao dịch', date: true },
];

const internationalFields = [
  { key: 'ds_ttqt', label: 'Doanh số thanh toán quốc tế', source: 'KDNH', money: true },
  { key: 'ds_lc', label: 'Doanh số thanh toán LC', source: 'KDNH', money: true },
  { key: 'chi_tra_kieu_hoi', label: 'Chi trả kiều hối', source: 'KDNH', boolean: true },
  { key: 'ttqt', label: 'LC / TTQT / kinh doanh ngoại tệ', source: 'Suy ra từ phí KH02', boolean: true },
];

const feeFields = [
  { key: 'abic_batd', label: 'Phí Bảo an tín dụng', source: 'KH02', money: true },
  { key: 'phi_bao_lanh', label: 'Phí bảo lãnh', source: 'KH02', money: true },
  { key: 'phi_chuyen_tien', label: 'Phí chuyển tiền', source: 'KH02', money: true },
  { key: 'phi_kdnt', label: 'Phí kinh doanh ngoại tệ', source: 'KH02 · 721001', money: true },
  { key: 'phi_ttqt', label: 'Phí thanh toán quốc tế', source: 'KH02 · 711002–711014, 711096', money: true },
  { key: 'phi_lc', label: 'Phí LC', source: 'KH02 · 709002', money: true },
  { key: 'phi_nhdt', label: 'Phí ngân hàng điện tử', source: 'KH02', money: true },
  { key: 'phi_the', label: 'Phí dịch vụ thẻ', source: 'Nguồn thẻ', money: true },
  { key: 'phi_pos', label: 'Phí đơn vị chấp nhận thẻ', source: 'Nguồn thẻ', money: true },
  { key: 'phi_khac', label: 'Phí dịch vụ khác', source: 'KH02', money: true },
];

const productGroups = [
  {
    key: 'digital',
    title: 'Sản phẩm dịch vụ NHĐT',
    note: 'Kênh số, thông báo và tiện ích tài khoản',
    tone: 'blue',
    items: [
      ['agribank_plus', 'Agribank Plus'],
      ['tin_nhan_ott', 'Tin nhắn OTT'],
      ['e_banking', 'E-Banking'],
      ['sms_nhac_no_vay', 'SMS nhắc nợ vay'],
      ['sms_tien_gui', 'SMS tiền gửi'],
      ['hkd_tk', 'Tài khoản hộ kinh doanh'],
    ],
  },
  {
    key: 'card',
    title: 'Sản phẩm thẻ',
    note: 'Các loại thẻ và dịch vụ chấp nhận thẻ',
    tone: 'gold',
    items: [
      ['the_ghi_no_noi_dia', 'Thẻ ghi nợ nội địa'],
      ['the_ghi_no_quoc_te', 'Thẻ ghi nợ quốc tế'],
      ['the_td_loc_viet', 'Thẻ Lộc Việt'],
      ['the_td_quoc_te', 'Thẻ tín dụng quốc tế'],
      ['pos', 'Đơn vị chấp nhận thẻ POS'],
    ],
  },
  {
    key: 'bill',
    title: 'Bill Payment',
    note: 'Dịch vụ thu hộ và thanh toán định kỳ',
    tone: 'cyan',
    items: [
      ['thuho_dien', 'Thu hộ tiền điện'],
      ['thuho_nuoc', 'Thu hộ tiền nước'],
      ['thuho_dt', 'Thu hộ điện thoại/viễn thông'],
      ['thu_ho_hoc_phi', 'Thu hộ học phí'],
      ['thu_ho_vien_phi', 'Thu hộ viện phí'],
    ],
  },
  {
    key: 'abic',
    title: 'ABIC',
    note: 'Sản phẩm bảo hiểm khách hàng đang tham gia',
    tone: 'green',
    items: [
      ['abic_batd', 'Bảo an tín dụng'],
      ['batd', 'Bảo an tín dụng'],
      ['abic_batk', 'Bảo an tài khoản'],
      ['abic_bathe', 'Bảo an chủ thẻ'],
      ['abic_bhts', 'Bảo hiểm tài sản'],
      ['abic_bhpc', 'Bảo hiểm cháy nổ'],
      ['abic_bhxm', 'Bảo hiểm xe máy'],
      ['abic_bhoto', 'Bảo hiểm ô tô'],
      ['abic_bhnhao', 'Bảo hiểm nhà ở'],
      ['abic_bhyt', 'Bảo hiểm y tế, sức khỏe'],
    ],
  },
];

// Compatibility map for dashboard penetration and customer-list counters.
// The detailed profile uses productGroups, while these two existing views
// still receive flat service keys from the current API.
const serviceLabels = {
  ...Object.fromEntries(productGroups.flatMap((group) => group.items)),
  tk_so_dep: 'Tài khoản số đẹp',
  the_td_noi_dia: 'Thẻ tín dụng nội địa',
  bao_lanh: 'Bảo lãnh',
  loa_bien_dong_so_du: 'Loa biến động số dư',
  phat_hanh_lc: 'Phát hành LC',
  ttqt: 'LC/TTQT/KDNT',
};

const reconciliationReasonLabels = {
  NOT_FOUND_IN_CIF: 'Mã KH lõi có trong file nguồn nhưng chưa tồn tại trong Kho CIF',
  INVALID_CUSTOMER_CODE: 'Mã khách hàng trống hoặc không đúng định dạng để đối chiếu',
  DUPLICATE_CIF: 'Mã khách hàng khớp nhiều bản ghi CIF, chưa xác định được bản ghi chuẩn',
  BRANCH_CONFLICT: 'Thông tin chi nhánh giữa file nguồn và CIF không thống nhất',
  MISSING_CORE_CODE: 'Không tách được mã khách hàng lõi từ dữ liệu nguồn',
};

const reconciliationStatusLabels = {
  pending: 'Chờ xử lý', reviewed: 'Đã rà soát', resolved: 'Đã xử lý', ignored: 'Bỏ qua có xác nhận',
};

const hasData = (value) => value !== undefined && value !== null && value !== '';

function DomainMetricGrid({ customer, fields, emptyNote }) {
  return (
    <div className="c360-domain-grid">
      {fields.map((field) => {
        const value = customer[field.key];
        const available = hasData(value);
        let rendered = value;
        if (field.money && available) rendered = compactMoney(value);
        if (field.date && available) rendered = dateLabel(value);
        if (field.boolean && available) rendered = Number(value) > 0 ? 'Đang sử dụng' : 'Chưa sử dụng';
        return (
          <div key={field.key} className={`c360-domain-metric ${available ? 'has-data' : 'is-pending'} ${field.money && Number(value || 0) > 0 ? 'has-positive-value' : ''}`}>
            <div>
              <Text>{field.label}</Text>
              <Tag bordered={false}>{field.source}</Tag>
            </div>
            {available
              ? <strong>{rendered}</strong>
              : <span>Chưa có nguồn dữ liệu</span>}
          </div>
        );
      })}
      {emptyNote ? <Alert className="c360-domain-note" type="info" showIcon message={emptyNote} /> : null}
    </div>
  );
}

function ProductServiceGroups({ customer }) {
  return (
    <div className="c360-product-groups">
      {productGroups.map((group) => {
        const available = group.items.filter(([key]) => hasData(customer[key]));
        const active = group.items.filter(([key]) => hasData(customer[key]) && Number(customer[key]) > 0);
        return (
          <section key={group.key} className={`c360-product-group is-${group.tone}`}>
            <header>
              <div>
                <Text strong>{group.title}</Text>
              </div>
              <Tag color={active.length ? 'success' : available.length ? 'default' : 'warning'}>
                {active.length}/{group.items.length}
              </Tag>
            </header>
            <div>
              {group.items.map(([key, label]) => {
                const value = customer[key];
                const enabled = hasData(value) && Number(value) > 0;
                return (
                  <div key={key} className={enabled ? 'is-active' : ''}>
                    <span className={`c360-product-dot ${enabled ? 'is-on' : 'is-off'}`} aria-label={enabled ? 'Có sử dụng' : 'Không sử dụng'}>
                      {enabled ? '✓' : '×'}
                    </span>
                    <Text>{label}</Text>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function FinancialHistoryChart({ history }) {
  const [visibleSeries, setVisibleSeries] = useState(['so_du_tien_gui', 'so_du_tien_vay', 'so_du_tgtt_binh_quan']);
  const [hoverPoint, setHoverPoint] = useState(null);
  const rows = [...history].sort((a, b) => String(a.period_key).localeCompare(String(b.period_key))).slice(-12);
  if (rows.length < 2) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Cần ít nhất hai kỳ để hiển thị biểu đồ" />;
  const width = 760;
  const height = 250;
  const paddingLeft = 72;
  const paddingRight = 28;
  const paddingTop = 18;
  const paddingBottom = 34;
  const series = [
    { key: 'so_du_tien_gui', label: 'Tiền gửi', color: '#23885d' },
    { key: 'so_du_tien_vay', label: 'Tiền vay', color: '#9f3150' },
    { key: 'so_du_tgtt_binh_quan', label: 'TGTT bình quân', color: '#2d6ca3' },
  ];
  const activeSeries = series.filter((item) => visibleSeries.includes(item.key));
  const maxValue = Math.max(1, ...rows.flatMap((row) => activeSeries.map((item) => Number(row[item.key] || 0))));
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const pointFor = (key, row, index) => ({
    x: paddingLeft + (index * chartWidth) / Math.max(1, rows.length - 1),
    y: paddingTop + chartHeight - (Number(row[key] || 0) / maxValue) * chartHeight,
  });
  const pointsFor = (key) => rows.map((row, index) => {
    const point = pointFor(key, row, index);
    return `${point.x},${point.y}`;
  }).join(' ');
  const latest = rows[rows.length - 1];
  const previous = rows[rows.length - 2];
  const axisValues = [maxValue, maxValue * 0.75, maxValue * 0.5, maxValue * 0.25, 0];
  const toggleSeries = (key) => setVisibleSeries((current) => (
    current.includes(key)
      ? (current.length === 1 ? current : current.filter((item) => item !== key))
      : [...current, key]
  ));
  return (
    <div className="c360-history-chart">
      <div className="c360-history-kpis">
        {series.map((item) => {
          const change = changePercent(latest[item.key], previous[item.key]);
          return (
            <div key={item.key}>
              <span><i style={{ background: item.color }} />{item.label}</span>
              <strong>{compactMoney(latest[item.key])}</strong>
              <small className={change >= 0 ? 'is-up' : 'is-down'}>{change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}% so kỳ trước</small>
            </div>
          );
        })}
      </div>
      <div className="c360-chart-legend">
        {series.map((item) => (
          <button type="button" key={item.key} className={visibleSeries.includes(item.key) ? 'is-active' : ''} onClick={() => toggleSeries(item.key)}>
            <i style={{ background: item.color }} />{item.label}
          </button>
        ))}
      </div>
      <div className="c360-chart-stage" onMouseLeave={() => setHoverPoint(null)}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Biểu đồ lịch sử tài chính">
        {axisValues.map((value, index) => {
          const y = paddingTop + (index * chartHeight) / (axisValues.length - 1);
          return <g key={value}><line x1={paddingLeft} x2={width - paddingRight} y1={y} y2={y} className="grid" /><text x={paddingLeft - 10} y={y + 4} textAnchor="end">{compactMoney(value).replace(' đ', '')}</text></g>;
        })}
        {activeSeries.map((item) => <polyline key={item.key} points={pointsFor(item.key)} fill="none" stroke={item.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />)}
        {activeSeries.flatMap((item) => rows.map((row, index) => {
          const point = pointFor(item.key, row, index);
          return (
            <circle
              key={`${item.key}-${row.period_key}`}
              cx={point.x}
              cy={point.y}
              r="5"
              fill="#fff"
              stroke={item.color}
              strokeWidth="3"
              onMouseEnter={() => setHoverPoint({ row, index, x: point.x, y: point.y })}
            />
          );
        }))}
        {rows.map((row, index) => {
          const x = paddingLeft + (index * chartWidth) / Math.max(1, rows.length - 1);
          return <text key={row.period_key} x={x} y={height - 9} textAnchor="middle">{periodLabel(row.period_key)}</text>;
        })}
        </svg>
        {hoverPoint ? (
          <div className="c360-chart-tooltip" style={{ left: `${(hoverPoint.x / width) * 100}%`, top: `${(hoverPoint.y / height) * 100}%` }}>
            <Text strong>Kỳ {periodLabel(hoverPoint.row.period_key)}</Text>
            {series.map((item) => {
              const previousRow = rows[hoverPoint.index - 1];
              const change = previousRow ? changePercent(hoverPoint.row[item.key], previousRow[item.key]) : 0;
              return (
                <div key={item.key}>
                  <span><i style={{ background: item.color }} />{item.label}</span>
                  <strong>{Number(hoverPoint.row[item.key] || 0).toLocaleString('vi-VN')} đ</strong>
                  {previousRow ? <small className={change >= 0 ? 'is-up' : 'is-down'}>{change >= 0 ? '+' : ''}{change.toFixed(1)}%</small> : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CustomerEventTimeline({ history }) {
  const rows = [...history].sort((a, b) => String(a.period_key).localeCompare(String(b.period_key)));
  const events = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    Object.entries(serviceLabels).forEach(([key, label]) => {
      const before = Number(previous[key] || 0) > 0;
      const after = Number(current[key] || 0) > 0;
      if (before !== after) events.push({ period: current.period_key, type: after ? 'added' : 'removed', label });
    });
    const previousLoans = Number(previous.pf10_lds_count || 0);
    const currentLoans = Number(current.pf10_lds_count || 0);
    if (currentLoans !== previousLoans) {
      events.push({
        period: current.period_key,
        type: currentLoans > previousLoans ? 'added' : 'removed',
        label: `${Math.abs(currentLoans - previousLoans)} LDS ${currentLoans > previousLoans ? 'mới' : 'giảm/tất toán'}`,
      });
    }
    const financialFields = [
      ['so_du_tien_gui', 'Tiền gửi CKH', 'deposit'],
      ['so_du_tgtt_binh_quan', 'TGTT bình quân', 'deposit'],
      ['so_du_tien_vay', 'Dư nợ', 'loan'],
      ['du_no_xlrr', 'Dư nợ XLRR', 'risk'],
    ];
    financialFields.forEach(([key, label, category]) => {
      const before = Number(previous[key] || 0); const after = Number(current[key] || 0);
      const difference = after - before;
      const pct = before ? difference / Math.abs(before) * 100 : (after ? 100 : 0);
      if (difference !== 0 && (Math.abs(pct) >= 10 || key === 'du_no_xlrr')) events.push({ period: current.period_key, type: difference > 0 ? 'added' : 'removed', category, label: `${label} ${difference > 0 ? 'tăng' : 'giảm'} ${compactMoney(Math.abs(difference))}`, detail: `${fullMoney(before)} → ${fullMoney(after)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)` });
    });
    const feeFields = ['phi_bao_lanh', 'phi_chuyen_tien', 'phi_nhdt', 'abic_batd', 'phi_kdnt', 'phi_lc', 'phi_ttqt'];
    const beforeFee = feeFields.reduce((sum, key) => sum + Number(previous[key] || 0), 0);
    const afterFee = feeFields.reduce((sum, key) => sum + Number(current[key] || 0), 0);
    if (beforeFee !== afterFee) events.push({ period: current.period_key, type: afterFee > beforeFee ? 'added' : 'removed', category: 'fee', label: `Thu phí ${afterFee > beforeFee ? 'tăng' : 'giảm'} ${compactMoney(Math.abs(afterFee - beforeFee))}`, detail: `${fullMoney(beforeFee)} → ${fullMoney(afterFee)}` });
  }
  if (!events.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa ghi nhận thay đổi sản phẩm giữa các kỳ" />;
  return (
    <div className="c360-event-timeline">
      {events.slice().reverse().map((event, index) => (
        <div key={`${event.period}-${event.label}-${index}`} className={`is-${event.type}`}>
          <span>{event.type === 'added' ? '+' : '−'}</span>
          <div><Text strong>{event.label}</Text><small>{event.detail || (event.type === 'added' ? 'Thêm mới/ghi nhận sử dụng' : 'Ngừng sử dụng hoặc không còn ghi nhận')} · Kỳ {periodLabel(event.period)}</small></div>
        </div>
      ))}
    </div>
  );
}

function ErrorState({ error, onRetry }) {
  return (
    <div className="c360-error-state">
      <Alert
        type="error"
        showIcon
        message="Không tải được dữ liệu thật"
        description={error || 'Hãy kiểm tra backend và kết nối database.'}
        action={<Button icon={<ReloadOutlined />} onClick={onRetry}>Thử lại</Button>}
      />
      <Text type="secondary">C360 mới không tự chuyển sang dữ liệu giả khi API gặp lỗi.</Text>
    </div>
  );
}

function DataLoadingState({ message: loadingMessage = 'Đang tải dữ liệu…', detail = 'Hệ thống đang truy vấn và tổng hợp dữ liệu thật từ database.' }) {
  return <Card className="c360-loading-state"><Alert type="info" showIcon message={loadingMessage} description={detail} /><Skeleton active paragraph={{ rows: 9 }} /></Card>;
}

function Change({ current, previous }) {
  const value = changePercent(current, previous);
  return <Tag color={value >= 0 ? 'success' : 'error'}>{value >= 0 ? '+' : ''}{value.toFixed(1)}% so kỳ trước</Tag>;
}

function CashFlowChart({ rows = [] }) {
  if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dòng tiền GL02 hợp lệ" />;
  const width = 760; const height = 155; const left = 54; const right = 18; const top = 10; const bottom = 30;
  const innerWidth = width - left - right; const innerHeight = height - top - bottom;
  const maxValue = Math.max(1, ...rows.flatMap((row) => [Number(row.credit_amount || 0), Number(row.debit_amount || 0)]));
  const point = (row, index, key) => ({
    x: left + (rows.length === 1 ? innerWidth / 2 : (index / (rows.length - 1)) * innerWidth),
    y: top + innerHeight - (Number(row[key] || 0) / maxValue) * innerHeight,
  });
  const credit = rows.map((row, index) => point(row, index, 'credit_amount'));
  const debit = rows.map((row, index) => point(row, index, 'debit_amount'));
  const line = (points) => points.map((item) => `${item.x},${item.y}`).join(' ');
  const labelEvery = Math.max(1, Math.ceil(rows.length / 6));
  return (
    <div className="c360-cashflow-chart">
      <div className="c360-chart-legend"><span className="is-credit">Phát sinh Có</span><span className="is-debit">Phát sinh Nợ</span></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Biểu đồ dòng tiền GL02 theo ngày">
        <defs>
          <linearGradient id="gl02CreditFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#16865c" stopOpacity=".22" /><stop offset="100%" stopColor="#16865c" stopOpacity="0" /></linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = top + innerHeight * ratio;
          return <g key={ratio}><line x1={left} x2={width - right} y1={y} y2={y} stroke="#e9edf3" /><text x={left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#7b8798">{compactMoney(maxValue * (1 - ratio)).replace(' đ', '')}</text></g>;
        })}
        <polygon points={`${left},${top + innerHeight} ${line(credit)} ${width - right},${top + innerHeight}`} fill="url(#gl02CreditFill)" />
        <polyline points={line(credit)} fill="none" stroke="#16865c" strokeWidth="2.5" strokeLinejoin="round" />
        <polyline points={line(debit)} fill="none" stroke="#bb3e56" strokeWidth="2.5" strokeLinejoin="round" />
        {rows.map((row, index) => {
          const cp = credit[index]; const dp = debit[index];
          return <g key={row.transaction_date}>
            <circle cx={cp.x} cy={cp.y} r="3.5" fill="#16865c"><title>{`${dateLabel(row.transaction_date)} · Có ${fullMoney(row.credit_amount)} · ${row.transaction_count} bút toán`}</title></circle>
            <circle cx={dp.x} cy={dp.y} r="3.5" fill="#bb3e56"><title>{`${dateLabel(row.transaction_date)} · Nợ ${fullMoney(row.debit_amount)} · Dòng tiền thuần ${fullMoney(row.net_amount)}`}</title></circle>
            {(index % labelEvery === 0 || index === rows.length - 1) ? <text x={cp.x} y={height - 13} textAnchor="middle" fontSize="10" fill="#657184">{String(row.transaction_date || '').slice(8, 10)}/{String(row.transaction_date || '').slice(5, 7)}</text> : null}
          </g>;
        })}
      </svg>
    </div>
  );
}

function RealMetric({ title, value, icon, tone, current, previous, note, onClick, explanation }) {
  const content = (
    <Card className={`c360-real-metric is-${tone}`} onClick={onClick}>
      <span>{icon}</span>
      <Text type="secondary">{title}</Text>
      <strong>{value}</strong>
      <Change current={current} previous={previous} />
      <small>{note}</small>
    </Card>
  );
  return explanation ? <Tooltip title={<div><strong>{explanation.formula}</strong><br />Nguồn: {explanation.source}<br />Đơn vị: {explanation.unit || 'VNĐ'}<br />Cập nhật theo kỳ đang chọn.</div>}>{content}</Tooltip> : content;
}

function CustomerModal({ customer, periodKey, open, onClose }) {
  const modalAnchorRef = useRef(null);
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState('');
  const [loanData, setLoanData] = useState({ categories: [], branches: [], items: [], total: 0 });
  const [depositData, setDepositData] = useState({ categories: [], branches: [], items: [], total: 0 });
  const [classificationData, setClassificationData] = useState({ branches: [], items: [] });
  const [financialMetrics, setFinancialMetrics] = useState({ totals: {}, branches: [] });
  const [rr01Data, setRr01Data] = useState({ lav_groups: [], items: [] });
  const [rr01Loading, setRr01Loading] = useState(false);
  const [rr01Open, setRr01Open] = useState(false);
  const [gl02Activity, setGl02Activity] = useState({ daily: [], branches: [], history: [] });
  const [gl02Loading, setGl02Loading] = useState(false);
  const [gl02Open, setGl02Open] = useState(false);
  const [loanCategory, setLoanCategory] = useState('short_term');
  const [loanBranch, setLoanBranch] = useState(null);
  const [depositCategory, setDepositCategory] = useState('demand');
  const [profileBranch, setProfileBranch] = useState(null);
  const [activeTab, setActiveTab] = useState('summary');
  const [loading, setLoading] = useState(false);
  const [loanLoading, setLoanLoading] = useState(false);
  const [depositLoading, setDepositLoading] = useState(false);
  const [classificationLoading, setClassificationLoading] = useState(false);
  const [financialLoading, setFinancialLoading] = useState(false);

  useEffect(() => {
    if (!open || !customer?.ma_kh || !['credit', 'fees', 'products'].includes(activeTab)) return;
    let active = true;
    setFinancialLoading(true);
    client.get('/customer-processing/financial-metrics', {
      params: {
        period_key: periodKey,
        ma_kh: customer.ma_kh,
        branch_code: profileBranch || undefined,
      },
    })
      .then(({ data }) => { if (active) setFinancialMetrics(data || { totals: {}, branches: [] }); })
      .catch(() => { if (active) setFinancialMetrics({ totals: {}, branches: [] }); })
      .finally(() => { if (active) setFinancialLoading(false); });
    return () => { active = false; };
  }, [activeTab, customer?.ma_kh, open, periodKey, profileBranch]);

  useEffect(() => {
    if (!open || !customer?.ma_kh || activeTab !== 'history') return;
    let active = true;
    setLoading(true);
    setHistoryError('');
    client.get('/customer-processing/profile-history', { params: { ma_kh: customer.ma_kh, branch_code: profileBranch || undefined } })
      .then(({ data }) => { if (active) setHistory(Array.isArray(data) ? data : []); })
      .catch((error) => { if (active) { setHistory([]); setHistoryError(error.response?.data?.detail || error.message || 'Không tải được lịch sử các kỳ'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [activeTab, customer?.ma_kh, open, profileBranch]);

  useEffect(() => {
    if (!open || !customer?.ma_kh || activeTab !== 'credit') return;
    let active = true;
    setLoanLoading(true);
    client.get('/customer-processing/pf10-loans', {
      params: {
        period_key: periodKey,
        ma_kh: customer.ma_kh,
        category: loanCategory,
        branch_code: loanBranch || profileBranch || undefined,
        page_size: 500,
      },
    })
      .then(({ data }) => { if (active) setLoanData(data || { categories: [], branches: [], items: [], total: 0 }); })
      .catch(() => { if (active) setLoanData({ categories: [], branches: [], items: [], total: 0 }); })
      .finally(() => { if (active) setLoanLoading(false); });
    return () => { active = false; };
  }, [activeTab, customer?.ma_kh, loanBranch, loanCategory, open, periodKey, profileBranch]);

  useEffect(() => {
    if (!open || !customer?.ma_kh || activeTab !== 'credit') return;
    let active = true;
    setRr01Loading(true);
    client.get('/customer-processing/rr01-handled-risk', { params: {
      period_key: periodKey, ma_kh: customer.ma_kh, branch_code: profileBranch || undefined,
    } })
      .then(({ data }) => { if (active) setRr01Data(data || { lav_groups: [], items: [] }); })
      .catch(() => { if (active) setRr01Data({ lav_groups: [], items: [] }); })
      .finally(() => { if (active) setRr01Loading(false); });
    return () => { active = false; };
  }, [activeTab, customer?.ma_kh, open, periodKey, profileBranch]);

  useEffect(() => {
    if (!open || !customer?.ma_kh || activeTab !== 'deposit') return;
    let active = true;
    setDepositLoading(true);
    client.get('/customer-processing/deposit-accounts', {
      params: {
        period_key: periodKey,
        ma_kh: customer.ma_kh,
        category: depositCategory,
        branch_code: profileBranch || undefined,
        page_size: 500,
      },
    })
      .then(({ data }) => { if (active) setDepositData(data || { categories: [], branches: [], items: [], total: 0 }); })
      .catch(() => { if (active) setDepositData({ categories: [], branches: [], items: [], total: 0 }); })
      .finally(() => { if (active) setDepositLoading(false); });
    return () => { active = false; };
  }, [activeTab, customer?.ma_kh, depositCategory, open, periodKey, profileBranch]);

  useEffect(() => {
    if (!open || !customer?.ma_kh || activeTab !== 'deposit') return;
    let active = true;
    setGl02Loading(true);
    client.get('/customer-processing/gl02-account-activity', {
      params: { period_key: periodKey, ma_kh: customer.ma_kh, branch_code: profileBranch || undefined },
    })
      .then(({ data }) => { if (active) setGl02Activity(data || { daily: [], branches: [], history: [] }); })
      .catch(() => { if (active) setGl02Activity({ daily: [], branches: [], history: [] }); })
      .finally(() => { if (active) setGl02Loading(false); });
    return () => { active = false; };
  }, [activeTab, customer?.ma_kh, open, periodKey, profileBranch]);

  useEffect(() => {
    if (!open || !customer?.ma_kh || activeTab !== 'classification') return;
    let active = true;
    setClassificationLoading(true);
    client.get('/customer-processing/customer-classification-history', {
      params: { ma_kh: customer.ma_kh, branch_code: profileBranch || undefined },
    })
      .then(({ data }) => { if (active) setClassificationData(data || { branches: [], items: [] }); })
      .catch(() => { if (active) setClassificationData({ branches: [], items: [] }); })
      .finally(() => { if (active) setClassificationLoading(false); });
    return () => { active = false; };
  }, [activeTab, customer?.ma_kh, open, profileBranch]);

  useEffect(() => {
    if (open) {
      setLoanCategory('short_term');
      setLoanBranch(null);
      setDepositCategory('demand');
      setProfileBranch(null);
      setActiveTab('summary');
      setHistory([]);
      setHistoryError('');
      setRr01Open(false);
      setGl02Open(false);
    }
  }, [customer?.ma_kh, open]);

  const changeProfileTab = (nextTab) => {
    setActiveTab(nextTab);
    window.requestAnimationFrame(() => {
      const modal = modalAnchorRef.current?.closest('.ant-modal');
      modalAnchorRef.current?.closest('.c360-profile-scroll')?.scrollTo({ top: 0, left: 0 });
      modal?.closest('.ant-modal-wrap')?.scrollTo({ top: 0, left: 0 });
      modal?.querySelector('.c360-profile-tabs > .ant-tabs-content-holder')?.scrollTo({ top: 0, left: 0 });
    });
  };

  if (!customer) return null;
  const trackedProducts = productGroups.flatMap((group) => group.items);
  const branchDetails = Array.isArray(customer.branch_details) ? customer.branch_details : [];
  const selectedBranchDetail = profileBranch
    ? branchDetails.find((item) => item.branch_code === profileBranch)
    : null;
  const viewedCustomer = selectedBranchDetail
    ? {
        ...customer,
        ...selectedBranchDetail,
        branch_codes: selectedBranchDetail.branch_code,
        pgd_codes: selectedBranchDetail.ma_pgd,
        branch_count: 1,
        pgd_count: selectedBranchDetail.ma_pgd ? 1 : 0,
      }
    : customer;
  const metricCustomer = { ...viewedCustomer, ...(financialMetrics.totals || {}) };
  const officerScope = profileBranch && selectedBranchDetail ? [selectedBranchDetail] : branchDetails;
  const officerSummary = [...new Set(officerScope
    .filter((item) => item.ten_can_bo || item.ma_cb || item.officer_employee_code)
    .map((item) => [
      item.officer_branch_code
        ? `${item.officer_branch_name || 'Chi nhánh'} (${item.officer_branch_code})`
        : (item.branch_code ? `CN ${item.branch_code}` : null),
      item.officer_department_name
        ? `${item.officer_department_name}${item.officer_department_code ? ` (${item.officer_department_code})` : ''}`
        : null,
      item.officer_employee_code ? `Mã NV ${item.officer_employee_code}` : null,
      item.ma_cb ? `Mã CBTD ${item.ma_cb}` : null,
      item.ten_can_bo,
    ].filter(Boolean).join(' · ')))]
    .join(' | ');
  const officerShortSummary = [...new Set(officerScope
    .filter((item) => item.ten_can_bo)
    .map((item) => `${item.ten_can_bo} (${viewedCustomer.managing_department_name || item.officer_department_name || item.ten_pgd || 'Chưa xác định phòng'})`))]
    .join(' | ');
  const activeProducts = trackedProducts.filter(([key]) => hasData(viewedCustomer[key]) && Number(viewedCustomer[key]) > 0);
  const totalDeposit = Number(viewedCustomer.so_du_tien_gui || 0) + Number(viewedCustomer.so_du_tgtt_binh_quan || 0);
  const totalLoan = Number(viewedCustomer.du_no_ngan_han || 0)
    + Number(viewedCustomer.du_no_trung_dai_han || 0)
    + Number(viewedCustomer.du_no_thau_chi || 0)
    || Number(viewedCustomer.so_du_tien_vay || 0);
  const periodRevenue = Number(viewedCustomer.pf10_interest || 0)
    + feeFields.reduce((sum, field) => sum + Number(metricCustomer[field.key] || 0), 0);
  const classificationPrevious = {};
  const classificationRows = [...(classificationData?.items || [])]
    .sort((a, b) => `${a.period_key}-${a.branch_code}`.localeCompare(`${b.period_key}-${b.branch_code}`))
    .map((item) => {
      const previous = classificationPrevious[item.branch_code];
      classificationPrevious[item.branch_code] = item;
      return {
        ...item,
        previous_rank: previous?.rank_branch || null,
        rank_changed: Boolean(previous && previous.rank_branch !== item.rank_branch),
      };
    });
  return (
    <Modal
      width="100vw"
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      wrapClassName="c360-real-profile-wrap"
      destroyOnHidden
      className="c360-real-profile-modal"
    >
      <div className="c360-profile-scroll">
      <div ref={modalAnchorRef} className="demo-quick-header c360-profile-hero">
        <Avatar size={48} className="demo-profile-avatar">{customer.ten_kh?.charAt(0) || 'K'}</Avatar>
        <div>
          <Text className="c360-profile-kicker">HỒ SƠ KHÁCH HÀNG 360° · KỲ {periodLabel(periodKey)}</Text>
          <Space wrap><Title level={2}>{customer.ten_kh || 'Chưa có tên khách hàng'}</Title><Tag color="blue">{customer.loai_khach_hang || 'Chưa phân loại'}</Tag><Tag color="success">ĐANG HOẠT ĐỘNG</Tag></Space>
          <div className="demo-profile-meta"><span>Mã KH lõi: {customer.ma_kh}</span><span>{customer.telephone || 'Chưa có điện thoại'}</span><span>CBQL: {customer.ten_can_bo || customer.ma_cb || '—'}</span></div>
        </div>
        <Space className="c360-profile-actions" wrap>
          <Button icon={<BarChartOutlined />} onClick={() => changeProfileTab('history')}>Lịch sử các kỳ</Button>
          <Select
            className="c360-profile-scope"
            value={profileBranch || 'all'}
            onChange={(value) => {
              const next = value === 'all' ? null : value;
              setProfileBranch(next);
              setLoanBranch(null);
            }}
            options={[
              { value: 'all', label: 'Toàn khách hàng' },
              ...[...new Set(branchDetails.map((item) => item.branch_code).filter(Boolean))]
                .map((value) => ({ value, label: `Chi nhánh ${value}` })),
            ]}
          />
        </Space>
      </div>
      <Row gutter={[14, 14]} className="demo-quick-metrics c360-profile-metrics">
        <Col xs={12} lg={8} xl><div role="button" tabIndex={0} className="is-deposit" onClick={() => changeProfileTab('deposit')}><WalletOutlined /><Text>Tổng tiền gửi</Text><strong>{compactMoney(totalDeposit)}</strong><small>CKH + TGTT bình quân</small></div></Col>
        <Col xs={12} lg={8} xl><div role="button" tabIndex={0} className="is-loan" onClick={() => changeProfileTab('credit')}><BankOutlined /><Text>Tổng tiền vay</Text><strong>{compactMoney(totalLoan)}</strong><small>{viewedCustomer.pf10_lds_count || 0} LDS đang ghi nhận</small></div></Col>
        <Col xs={12} lg={8} xl><div role="button" tabIndex={0} className="is-casa" onClick={() => changeProfileTab('fees')}><DatabaseOutlined /><Text>Doanh thu/phí trong kỳ</Text><strong>{compactMoney(periodRevenue)}</strong><small>Số liệu hiện đã tổng hợp</small></div></Col>
        <Col xs={12} lg={8} xl><div role="button" tabIndex={0} className="is-product" onClick={() => changeProfileTab('products')}><CreditCardOutlined /><Text>Sản phẩm đang sử dụng</Text><strong>{activeProducts.length}</strong><small>Trên {trackedProducts.length} sản phẩm theo dõi</small></div></Col>
        <Col xs={12} lg={8} xl><div role="button" tabIndex={0} className="is-branch" onClick={() => changeProfileTab('relationships')}><BankOutlined /><Text>Chi nhánh có quan hệ</Text><strong>{viewedCustomer.branch_count || 0}</strong><small>{profileBranch ? `Đang xem ${profileBranch}` : 'Toàn khách hàng'}</small></div></Col>
      </Row>
      <Tabs activeKey={activeTab} onChange={changeProfileTab} animated={false} className="c360-profile-tabs" items={[
        {
          key: 'summary',
          label: 'Thông tin khách hàng',
          children: <Descriptions bordered column={2} size="small" items={[
            { key: 'code', label: 'Mã khách hàng', children: <Text strong copyable={{ text: customer.ma_kh }}>{customer.ma_kh}</Text> },
            { key: 'type', label: 'Loại khách hàng', children: customer.loai_khach_hang || 'Chưa có dữ liệu' },
            { key: 'branches', label: 'Các chi nhánh', children: viewedCustomer.branch_codes || 'Chưa có dữ liệu' },
            { key: 'pgds', label: 'Các phòng/PGD', children: profileBranch
              ? (selectedBranchDetail?.ten_pgd || 'Chưa xác định phòng/PGD')
              : (customer.pgd_names || customer.primary_pgd_name || 'Chưa có dữ liệu') },
            { key: 'loanType', label: 'Loại vay', children: loanTypeLabel(viewedCustomer.loai_vay) },
            { key: 'hkdAccounts', label: 'Tài khoản hộ kinh doanh', children: viewedCustomer.hkd_tk
              ? <Text copyable={{ text: viewedCustomer.hkd_account_numbers || '' }}>{viewedCustomer.hkd_account_numbers || 'Đã xác định CUST_TYPE 570'}</Text>
              : 'Không ghi nhận trong kỳ' },
            { key: 'phone', label: 'Điện thoại', children: customer.telephone || 'Chưa có dữ liệu' },
            { key: 'officer', label: 'Cán bộ quản lý', span: 2, children: officerSummary ? (
              <Tooltip title={officerSummary}>
                <Text>{officerShortSummary || customer.ten_can_bo}</Text>
              </Tooltip>
            ) : (customer.ten_can_bo || customer.ma_cb || 'Chưa có dữ liệu') },
            { key: 'period', label: 'Kỳ đang xem', children: periodLabel(periodKey) },
          ]} />,
        },
        {
          key: 'deposit',
          label: 'Tiền gửi',
          children: (
            <div className="c360-credit-pane">
              <div className="c360-insight-strip">
                <div role="button" tabIndex={0} onClick={() => setGl02Open(true)}><Text>Doanh số TKTT</Text><strong>{compactMoney(viewedCustomer.doanh_so_chuyen_tien_ve_tk)}</strong><small>GL02 · Bấm xem theo chi nhánh</small></div>
                <div><Text>Giao dịch TKTT gần nhất</Text><strong>{dateTimeLabel(viewedCustomer.last_tktt_transaction_at)}</strong><small>{viewedCustomer.tktt_inactive_days == null ? 'Chưa có giao dịch GL02 hợp lệ' : `Cách ngày cuối kỳ ${viewedCustomer.tktt_inactive_days} ngày`}</small></div>
                <Tooltip title="Đang hoạt động: giao dịch gần nhất cách ngày cuối kỳ không quá 7 ngày. Ít hoạt động: từ 8–30 ngày. Không hoạt động: trên 30 ngày hoặc chưa có giao dịch hợp lệ.">
                  <div><Text>Trạng thái TKTT</Text><strong><Tag color={(activityLabels[viewedCustomer.tktt_activity_status] || activityLabels.inactive)[1]}>{(activityLabels[viewedCustomer.tktt_activity_status] || activityLabels.inactive)[0]}</Tag></strong><small>Hover để xem cách xác định</small></div>
                </Tooltip>
                <div><Text>Đang hoạt động</Text><strong>{depositData.analytics?.active || 0}</strong><small>tài khoản</small></div>
                <div><Text>Mới / tất toán</Text><strong>{depositData.analytics?.new || 0} / {depositData.analytics?.closed || 0}</strong><small>trong kỳ</small></div>
              </div>
              <section className="c360-gl02-panel">
                <div className="c360-pane-heading">
                  <div><Text strong>Dòng tiền tài khoản thanh toán theo ngày</Text><small>GL02 · TK cân đối 421101 · Chỉ giao dịch hợp lệ</small></div>
                  <Button size="small" onClick={() => setGl02Open(true)}>Chi tiết chi nhánh</Button>
                </div>
                {gl02Loading ? <Skeleton active paragraph={{ rows: 4 }} /> : <CashFlowChart rows={gl02Activity.daily || []} />}
              </section>
              <section className="c360-gl02-history">
                <div className="c360-pane-heading">
                  <div><Text strong>Lịch sử hoạt động TKTT</Text><small>Đối chiếu tối đa 12 kỳ gần nhất</small></div>
                  <Tag color="blue">{(gl02Activity.history || []).length} kỳ</Tag>
                </div>
                <Alert type="info" showIcon message="Mỗi dòng là tình trạng sử dụng TKTT của khách hàng tại một kỳ. Trạng thái được tính từ giao dịch GL02 gần nhất đến ngày cuối kỳ; số liệu Có, Nợ và dòng tiền thuần được cộng theo TK cân đối 421101." />
                <Table loading={gl02Loading} size="small" rowKey="period_key" pagination={false}
                  scroll={{ x: 900, y: 260 }} dataSource={gl02Activity.history || []} columns={[
                    { title: 'Kỳ', dataIndex: 'period_key', width: 95, fixed: 'left', render: periodLabel },
                    { title: 'Trạng thái', dataIndex: 'activity_status', width: 140, render: (value) => { const status = activityLabels[value] || activityLabels.inactive; return <Tag color={status[1]}>{status[0]}</Tag>; } },
                    { title: 'Giao dịch gần nhất', dataIndex: 'last_transaction_at', width: 170, render: dateTimeLabel },
                    { title: 'Ngày không hoạt động', dataIndex: 'inactive_days', width: 145, align: 'right', render: (value) => value == null ? '—' : `${value} ngày` },
                    { title: 'Số bút toán', dataIndex: 'transaction_count', width: 115, align: 'right' },
                    { title: 'Phát sinh Có', dataIndex: 'credit_amount', width: 165, align: 'right', render: fullMoney },
                    { title: 'Phát sinh Nợ', dataIndex: 'debit_amount', width: 165, align: 'right', render: fullMoney },
                    { title: 'Dòng tiền thuần', dataIndex: 'net_amount', width: 165, align: 'right', render: (value) => <Text className={Number(value || 0) >= 0 ? 'is-up' : 'is-down'} strong>{fullMoney(value)}</Text> },
                  ]} />
              </section>
              <div className="c360-credit-cards c360-deposit-cards">
                {(depositData.categories || []).map((item) => (
                  <button
                    type="button"
                    key={item.key}
                    className={depositCategory === item.key ? 'is-active' : ''}
                    onClick={() => setDepositCategory(item.key)}
                  >
                    <span><Text>{item.key === 'demand' ? 'Tiền gửi thanh toán' : 'Tiền gửi có kỳ hạn'}</Text><Tag>{item.account_count} TK</Tag></span>
                    <strong>{compactMoney(item.end_balance)}</strong>
                    <small>Bình quân {compactMoney(item.average_balance)}</small>
                    <small>{item.branch_count} chi nhánh</small>
                  </button>
                ))}
              </div>
              <div className="c360-credit-toolbar">
                <div>
                  <Text strong>{depositCategory === 'demand' ? 'Tài khoản thanh toán' : 'Tài khoản tiền gửi có kỳ hạn'}</Text>
                  <Text type="secondary">{depositData.total || 0} tài khoản phù hợp</Text>
                </div>
                <Tag color="green">{profileBranch ? `Chi nhánh ${profileBranch}` : 'Toàn khách hàng'}</Tag>
              </div>
              <Table
                loading={depositLoading}
                size="small"
                rowKey="id"
                sticky
                pagination={{ pageSize: 20, showSizeChanger: false }}
                scroll={{ x: 1250, y: 350 }}
                dataSource={depositData?.items || []}
                columns={[
                  { title: 'Chi nhánh', dataIndex: 'branch_code', width: 95, fixed: 'left' },
                  { title: depositCategory === 'term' ? 'Số tài khoản / Sổ tiết kiệm' : 'Số tài khoản thanh toán', dataIndex: 'account_number', width: 210, fixed: 'left', render: (value, row) => <div><Text strong copyable>{value || '—'}</Text><br /><Text type="secondary">Nguồn {row.account_source || 'DP01'} · SO_TAI_KHOAN</Text></div> },
                  { title: 'Loại tiền gửi (DP01)', width: 220, render: (_, row) => <div><Text>{row.deposit_type || 'Chưa đối chiếu được DP01'}</Text>{row.product_code ? <><br /><Text type="secondary">Mã DP_TYPE {row.product_code} · Nguồn {row.deposit_type_source || 'chưa xác định'}</Text></> : null}</div> },
                  { title: 'Trạng thái', dataIndex: 'account_status', width: 135, render: (value) => {
                    const status = depositStatusLabels[value] || [value || '—', 'default'];
                    return <Tag color={status[1]}>{status[0]}</Tag>;
                  } },
                  { title: 'Số dư cuối kỳ (VND)', dataIndex: 'end_balance', width: 210, align: 'right', render: (value, row) => convertedMoneyCell(value, row.end_balance_original, row) },
                  { title: `Kỳ trước (VND)${depositData.previous_period ? ` · ${periodLabel(depositData.previous_period)}` : ''}`, dataIndex: 'previous_balance', width: 210, align: 'right', render: (value, row) => convertedMoneyCell(value, row.previous_balance_original, row) },
                  { title: 'Biến động', dataIndex: 'balance_change', width: 180, align: 'right', render: (value) => <Text className={Number(value || 0) >= 0 ? 'is-up' : 'is-down'} strong>{Number(value || 0) >= 0 ? '+' : ''}{fullMoney(value)}</Text> },
                  { title: 'Số dư bình quân (VND)', dataIndex: 'average_balance', width: 210, align: 'right', render: (value, row) => convertedMoneyCell(value, row.average_balance_original, row) },
                  { title: 'Tỷ lệ duy trì', dataIndex: 'retention_rate', width: 125, align: 'right', render: (value, row) => <div><Text strong>{value == null ? '—' : `${value}%`}</Text>{row.low_average_high_end || row.high_average_end_drop ? <><br /><Tag color="warning">Cần xem</Tag></> : null}</div> },
                  { title: 'Ngày mở', dataIndex: 'opening_date', width: 120, render: dateLabel },
                  { title: 'Ngày đến hạn', dataIndex: 'maturity_date', width: 125, render: dateLabel },
                  { title: 'Kỳ hạn', dataIndex: 'month_term', width: 90, align: 'center', render: (value) => value == null ? '—' : `${value} tháng` },
                  { title: 'Loại tiền', dataIndex: 'currency_code', width: 90, align: 'center' },
                ]}
              />
            </div>
          ),
        },
        {
          key: 'credit',
          label: `Tiền vay (${viewedCustomer.pf10_lds_count || 0} LDS)`,
          children: (
            <div className="c360-credit-pane">
              <div className="c360-insight-strip c360-loan-obligations">
                <div><Text>Gốc phải thu</Text><strong>{loanData.obligations?.source_available ? compactMoney(loanData.obligations.principal_due) : '—'}</strong><small>tháng {loanData.obligations?.next_month || 'tới'} · LN01</small></div>
                <div><Text>Lãi phải thu</Text><strong>{loanData.obligations?.source_available ? compactMoney(loanData.obligations.interest_due) : '—'}</strong><small>tháng {loanData.obligations?.next_month || 'tới'} · LN01</small></div>
                <div><Text>Lãi quá hạn</Text><strong className={Number(loanData.obligations?.overdue_interest || 0) > 0 ? 'is-down' : ''}>{loanData.obligations?.source_available ? compactMoney(loanData.obligations.overdue_interest) : '—'}</strong><small>{loanData.obligations?.source_available ? `${loanData.obligations.overdue_loan_count || 0} khoản` : 'Cần import lại LN01 để bổ sung'}</small></div>
                <div><Text>Chuyển nhóm nợ</Text><strong>{loanData.obligations?.current_debt_groups?.join(', ') || '—'}</strong><small>{loanData.obligations?.debt_group_changed ? `${loanData.obligations.previous_debt_groups.join(', ')} → ${loanData.obligations.current_debt_groups.join(', ')}` : 'Không đổi / chưa đủ lịch sử'}</small></div>
              </div>
              {Number(viewedCustomer.so_du_tien_vay || 0) > 0 && Number(loanData.total || 0) === 0 ? (
                <Alert
                  showIcon
                  type="warning"
                  message={`LN01 ghi nhận dư nợ ${fullMoney(viewedCustomer.so_du_tien_vay)}, nhưng PF10 kỳ này chưa có món vay tương ứng để hiển thị chi tiết.`}
                />
              ) : null}
              <div className="c360-credit-cards">
                {(loanData.categories || []).map((item) => (
                  <button
                    type="button"
                    key={item.key}
                    className={loanCategory === item.key ? 'is-active' : ''}
                    onClick={() => setLoanCategory(item.key)}
                  >
                    <span><Text>{pf10CategoryLabels[item.key] || item.key}</Text><Tag>{item.account_count} LDS</Tag></span>
                    <strong>{compactMoney(item.end_balance)}</strong>
                    <small>Bình quân {compactMoney(item.average_balance)}</small>
                    <small>{item.branch_count} chi nhánh · Lãi tháng {compactMoney(item.interest)}</small>
                  </button>
                ))}
              </div>
              <div className="c360-risk-panel">
                <div className="c360-pane-heading">
                  <div><Text strong>Rủi ro tín dụng BC29</Text><small>Nhóm nợ, quá hạn, tài sản bảo đảm và dự phòng của khách hàng</small></div>
                  {loanData.risk?.available ? <Tag color="blue">Đã có BC29</Tag> : <Tag>Chưa có bản ghi BC29</Tag>}
                </div>
                <div>
                  <div><Text>Nhóm nợ</Text><strong>{loanData.risk?.debt_groups?.join(', ') || '—'}</strong></div>
                  <div><Text>Quá hạn gốc/lãi</Text><strong>{loanData.risk?.available ? `${loanData.risk.max_principal_overdue_days || 0}/${loanData.risk.max_interest_overdue_days || 0} ngày` : '—'}</strong></div>
                  <div><Text>Tài sản bảo đảm</Text><strong>{loanData.risk?.available ? compactMoney(loanData.risk.collateral_value) : '—'}</strong></div>
                  <div><Text>Dự phòng cụ thể</Text><strong>{loanData.risk?.available ? compactMoney(loanData.risk.specific_provision) : '—'}</strong></div>
                  <div role="button" tabIndex={0} onClick={() => setRr01Open(true)}><Text>Dư nợ XLRR</Text><strong>{compactMoney(viewedCustomer.du_no_xlrr)}</strong><small>RR01 · Bấm xem LAV/LDS</small></div>
                  <div role="button" tabIndex={0} onClick={() => setRr01Open(true)}><Text>Doanh số thu nợ XLRR</Text><strong>{compactMoney(viewedCustomer.ds_thu_no_xlrr)}</strong><small>Thu gốc + thu lãi trong tháng</small></div>
                  <div><Text>DPRR chung tháng</Text><strong>{financialLoading ? '…' : fullMoney(metricCustomer.dprr_chung_tt)}</strong></div>
                  <div><Text>DPRR chung lũy kế</Text><strong>{financialLoading ? '…' : fullMoney(metricCustomer.dprr_chung_lk)}</strong></div>
                  <div><Text>DPRR cụ thể tháng</Text><strong>{financialLoading ? '…' : fullMoney(metricCustomer.dprr_cuthe_tt)}</strong></div>
                  <div><Text>DPRR cụ thể lũy kế</Text><strong>{financialLoading ? '…' : fullMoney(metricCustomer.dprr_cuthe_lk)}</strong></div>
                </div>
              </div>
              <div className="c360-credit-toolbar">
                <div>
                  <Text strong>{pf10CategoryLabels[loanCategory]}</Text>
                  <Text type="secondary">{loanData.total || 0} khoản giải ngân phù hợp</Text>
                </div>
                <Select
                  allowClear
                  value={loanBranch || profileBranch || undefined}
                  placeholder="Tất cả chi nhánh"
                  disabled={Boolean(profileBranch)}
                  onChange={(value) => setLoanBranch(value || null)}
                  options={(loanData.branches || []).map((value) => ({ value, label: `Chi nhánh ${value}` }))}
                />
              </div>
              <Table
                loading={loanLoading}
                size="small"
                rowKey="id"
                sticky
                pagination={{ pageSize: 20, showSizeChanger: false }}
                scroll={{ x: 1750, y: 360 }}
                dataSource={loanData?.items || []}
                columns={[
                  { title: 'Chi nhánh', dataIndex: 'branch_code', width: 95, fixed: 'left' },
                  { title: 'Số LDS (LN01)', dataIndex: 'lds_number', width: 200, fixed: 'left', render: (value) => <Text strong copyable>{value || 'Chưa ghép được LDS'}</Text> },
                  { title: 'Tài khoản vay (PF10)', dataIndex: 'account_number', width: 180, render: (value) => <Text copyable>{value || '—'}</Text> },
                  { title: 'Loại vay', dataIndex: 'loan_type_label', width: 120, render: (value, row) => <div><Text>{value}</Text><br /><Text type="secondary">{row.loan_type}</Text></div> },
                  { title: 'Trạng thái', dataIndex: 'loan_status', width: 145, render: (value) => {
                    const status = loanStatusLabels[value] || [value || '—', 'default'];
                    return <Tag color={status[1]}>{status[0]}</Tag>;
                  } },
                  { title: 'Dư nợ cuối tháng', dataIndex: 'end_of_month_balance', width: 175, align: 'right', render: fullMoney },
                  { title: 'Dư nợ bình quân', dataIndex: 'average_balance', width: 175, align: 'right', render: fullMoney },
                  { title: 'Ngày mở/giải ngân', dataIndex: 'opening_date', width: 135, render: dateLabel },
                  { title: 'Ngày đến hạn', dataIndex: 'maturity_date', width: 125, render: dateLabel },
                  { title: 'Kỳ hạn', dataIndex: 'month_term', width: 85, align: 'center', render: (value) => value == null ? '—' : `${value} tháng` },
                  { title: 'LS hợp đồng', dataIndex: 'contract_rate', width: 105, align: 'right', render: (value) => value == null ? '—' : `${Number(value).toLocaleString('vi-VN')}%` },
                  { title: 'Lãi tháng', dataIndex: 'interest_amount', width: 155, align: 'right', render: fullMoney },
                  { title: 'Lãi dự thu', dataIndex: 'accruals', width: 155, align: 'right', render: fullMoney },
                  { title: 'Lãi điều chỉnh sổ', dataIndex: 'book_correction_interest', width: 170, align: 'right', render: fullMoney },
                  { title: 'Tỷ lệ', dataIndex: 'ratio', width: 90, align: 'right', render: (value) => value == null ? '—' : Number(value).toLocaleString('vi-VN') },
                  { title: 'CCY', dataIndex: 'currency_code', width: 75, align: 'center' },
                  { title: 'Đối chiếu DP01', dataIndex: 'dp01_match_status', width: 145, render: (value) => value === 'same_branch' ? <Tag color="success">Cùng chi nhánh</Tag> : <Tag color="warning">Khác chi nhánh</Tag> },
                ]}
              />
            </div>
          ),
        },
        {
          key: 'international',
          label: 'KDNH',
          children: (
            <div className="c360-domain-pane">
              <div className="c360-pane-heading">
                <div><Text strong>Kinh doanh ngoại hối và thanh toán quốc tế</Text><small>Doanh số và trạng thái sử dụng dịch vụ trong kỳ</small></div>
                <Tag color="blue">KDNH</Tag>
              </div>
              <DomainMetricGrid customer={viewedCustomer} fields={internationalFields} />
            </div>
          ),
        },
        {
          key: 'fees',
          label: 'Phí thu được',
          children: (
            <div className="c360-domain-pane">
              <div className="c360-pane-heading">
                <div><Text strong>Thu nhập phí theo khách hàng</Text><small>Phân loại theo từng nhóm dịch vụ, không cộng giá trị chưa có nguồn</small></div>
                <Tag color="gold">KH02 · Nguồn bổ sung</Tag>
              </div>
              <DomainMetricGrid
                customer={metricCustomer}
                fields={feeFields}
                emptyNote="Chỉ tiêu chưa có nguồn được để trống thay vì mặc định bằng 0, tránh hiểu nhầm khách hàng không phát sinh phí."
              />
              <Table
                loading={financialLoading}
                size="small"
                rowKey="branch_code"
                pagination={false}
                dataSource={financialMetrics.branches || []}
                columns={[
                  { title: 'Chi nhánh', dataIndex: 'branch_code', width: 100 },
                  { title: 'Phí bảo lãnh', dataIndex: 'phi_bao_lanh', align: 'right', render: fullMoney },
                  { title: 'Phí chuyển tiền', dataIndex: 'phi_chuyen_tien', align: 'right', render: fullMoney },
                  { title: 'Phí NHĐT', dataIndex: 'phi_nhdt', align: 'right', render: fullMoney },
                  { title: 'Phí BATD', dataIndex: 'abic_batd', align: 'right', render: fullMoney },
                ]}
              />
            </div>
          ),
        },
        {
          key: 'classification',
          label: 'Phân hạng KH',
          children: (
            <div className="c360-classification-pane">
              <div className="c360-pane-heading">
                <div><Text strong>Diễn biến phân hạng khách hàng BC06</Text><small>Phân khúc, hạng và các thành phần điểm theo từng chi nhánh, từng kỳ</small></div>
                <Tag color="purple">{classificationRows.length} bản ghi</Tag>
              </div>
              {classificationLoading ? <Skeleton active /> : classificationRows.length ? (
                <Table
                  size="small"
                  rowKey="id"
                  pagination={false}
                  scroll={{ x: 800, y: 430 }}
                  dataSource={[...classificationRows].reverse()}
                  columns={[
                    { title: 'Kỳ', dataIndex: 'period_key', width: 95, fixed: 'left', render: periodLabel },
                    { title: 'Chi nhánh', dataIndex: 'branch_code', width: 95, fixed: 'left' },
                    { title: 'Phân khúc CN', dataIndex: 'segment_branch', width: 130, render: (value) => value || '—' },
                    { title: 'Hạng CN', dataIndex: 'rank_branch', width: 115, render: (value) => <Tag color={value ? 'purple' : 'default'}>{value || 'Chưa xếp hạng'}</Tag> },
                    { title: 'Thay đổi hạng', width: 150, render: (_, row) => row.rank_changed ? <Tag color="gold">{row.previous_rank || '—'} → {row.rank_branch || '—'}</Tag> : <Text type="secondary">Không đổi</Text> },
                    { title: 'Phân khúc hệ thống', dataIndex: 'segment_system', width: 145, render: (value) => value || '—' },
                    { title: 'Hạng hệ thống', dataIndex: 'rank_system', width: 130, render: (value) => value || '—' },
                  ]}
                />
              ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Khách hàng chưa có dữ liệu phân hạng BC06" />}
            </div>
          ),
        },
        {
          key: 'relationships',
          label: `Quan hệ chi nhánh (${branchDetails.length || customer.branch_count || 0})`,
          children: branchDetails.length ? (
            <Table
              size="small"
              rowKey={(row) => `${row.branch_code}-${row.ma_pgd}`}
              pagination={false}
              scroll={{ x: 900 }}
              dataSource={branchDetails}
              columns={[
                { title: 'Chi nhánh', dataIndex: 'branch_code', width: 100, fixed: 'left' },
                { title: 'PGD', width: 190, render: (_, row) => <div><Text>{row.ten_pgd || row.ma_pgd || '—'}</Text>{row.ten_pgd && row.ma_pgd ? <><br /><Text type="secondary">{row.ma_pgd}</Text></> : null}</div> },
                { title: 'Cán bộ quản lý', width: 180, render: (_, row) => row.ten_can_bo || row.ma_cb || '—' },
                { title: 'Tiền gửi CKH', dataIndex: 'so_du_tien_gui', align: 'right', width: 140, render: compactMoney },
                { title: 'TGTT bình quân', dataIndex: 'so_du_tgtt_binh_quan', align: 'right', width: 140, render: compactMoney },
                { title: 'Dư nợ', dataIndex: 'so_du_tien_vay', align: 'right', width: 140, render: compactMoney },
                { title: 'Sản phẩm', dataIndex: 'service_count', align: 'center', width: 100 },
              ]}
            />
          ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có chi tiết quan hệ theo chi nhánh" />,
        },
        {
          key: 'products',
          label: 'Sản phẩm dịch vụ',
          children: <ProductServiceGroups customer={metricCustomer} />,
        },
        {
          key: 'history',
          label: <span>Biến động & cảnh báo{history.length ? <Tag color="blue">{history.length} kỳ</Tag> : null}</span>,
          children: loading ? <Skeleton active /> : (
            <div className="c360-history-pane">
              {historyError ? <Alert className="is-full" type="error" showIcon message="Không tải được lịch sử khách hàng" description={historyError} /> : null}
              {!historyError && !history.length ? <Empty className="is-full" image={Empty.PRESENTED_IMAGE_SIMPLE} description="Khách hàng chưa có dữ liệu ở các kỳ đã xử lý" /> : null}
              <section>
                <div className="c360-pane-heading"><div><Text strong>Lịch sử tài chính</Text><small>Tối đa 12 kỳ gần nhất · {profileBranch ? `Chi nhánh ${profileBranch}` : 'Toàn khách hàng'}</small></div></div>
                <FinancialHistoryChart history={history} />
              </section>
              <section>
                <div className="c360-pane-heading"><div><Text strong>Dòng thời gian biến động & cảnh báo</Text><small>Tiền gửi, tiền vay, XLRR, phí, sản phẩm và LDS được so sánh tự động giữa hai kỳ liên tiếp</small></div></div>
                <CustomerEventTimeline history={history} />
              </section>
              <section className="is-full">
                <div className="c360-pane-heading"><div><Text strong>Số liệu từng kỳ</Text><small>Bấm chọn chi nhánh phía trên để đổi phạm vi</small></div></div>
                <Table size="small" rowKey="period_key" pagination={false} scroll={{ x: 900 }} dataSource={[...history].reverse()} columns={[
                  { title: 'Kỳ', dataIndex: 'period_key', width: 95, fixed: 'left', render: periodLabel },
                  { title: 'Tiền gửi CKH', dataIndex: 'so_du_tien_gui', align: 'right', width: 150, render: compactMoney },
                  { title: 'TGTT bình quân', dataIndex: 'so_du_tgtt_binh_quan', align: 'right', width: 150, render: compactMoney },
                  { title: 'Tiền vay', dataIndex: 'so_du_tien_vay', align: 'right', width: 150, render: compactMoney },
                  { title: 'Số LDS PF10', dataIndex: 'pf10_lds_count', align: 'center', width: 110 },
                  { title: 'Sản phẩm', width: 100, align: 'center', render: (_, row) => Object.keys(serviceLabels).filter((key) => Number(row[key] || 0) > 0).length },
                ]} />
              </section>
            </div>
          ),
        },
      ]} />
      <Modal width="92vw" open={gl02Open} onCancel={() => setGl02Open(false)} footer={null}
        title={`Chi tiết doanh số TKTT GL02 · ${customer.ma_kh}`}>
        <Alert showIcon type="info" message="Chi nhánh được xác định từ tiền tố CUSTOMER; số liệu chỉ gồm LOCAC 421101 và giao dịch Normal." />
        <Table loading={gl02Loading} className="c360-gl02-branch-table" size="small" sticky
          rowKey="branch_code" pagination={false} scroll={{ x: 1050, y: 480 }}
          dataSource={gl02Activity.branches || []} columns={[
            { title: 'Chi nhánh', dataIndex: 'branch_code', width: 110, fixed: 'left', render: (value) => <Text strong>{value || 'Chưa xác định'}</Text> },
            { title: 'Phát sinh Có', dataIndex: 'credit_amount', width: 180, align: 'right', render: fullMoney },
            { title: 'Phát sinh Nợ', dataIndex: 'debit_amount', width: 180, align: 'right', render: fullMoney },
            { title: 'Dòng tiền thuần', dataIndex: 'net_amount', width: 180, align: 'right', render: (value) => <Text className={Number(value || 0) >= 0 ? 'is-up' : 'is-down'} strong>{fullMoney(value)}</Text> },
            { title: 'Số bút toán', dataIndex: 'transaction_count', width: 120, align: 'right' },
            { title: 'Số ngày phát sinh', dataIndex: 'active_days', width: 140, align: 'right' },
            { title: 'Giao dịch gần nhất', dataIndex: 'last_transaction_at', width: 180, render: dateTimeLabel },
          ]} />
      </Modal>
      <Modal width="96vw" open={rr01Open} onCancel={() => setRr01Open(false)} footer={null} title={`Chi tiết nợ xử lý rủi ro RR01 · ${customer.ma_kh}`}>
        <div className="c360-credit-cards">
          {(rr01Data.lav_groups || []).map((item) => <div key={item.lav_number || 'unknown'}>
            <span><Text>{item.lav_number || 'Chưa xác định LAV'}</Text><Tag>{item.lds_count} LDS</Tag></span>
            <strong>{compactMoney(item.current_principal)}</strong>
            <small>Thu trong tháng {compactMoney(item.recovered_amount)}</small>
          </div>)}
        </div>
        <Table loading={rr01Loading} size="small" sticky rowKey="id" dataSource={rr01Data?.items || []}
          pagination={{ pageSize: 20, showSizeChanger: false }} scroll={{ x: 2500, y: 480 }} columns={[
            { title: 'Chi nhánh', dataIndex: 'branch_code', width: 95, fixed: 'left' },
            { title: 'Số LAV', dataIndex: 'lav_number', width: 190, fixed: 'left' },
            { title: 'Số LDS', dataIndex: 'lds_number', width: 190, fixed: 'left' },
            { title: 'CCY', dataIndex: 'currency_code', width: 70 },
            { title: 'Ngày giải ngân', dataIndex: 'disbursement_date', width: 120, render: dateLabel },
            { title: 'Ngày đến hạn', dataIndex: 'maturity_date', width: 120, render: dateLabel },
            { title: 'Ngày XLRR', dataIndex: 'risk_handling_date', width: 120, render: dateLabel },
            { title: 'VAMC', dataIndex: 'vamc_flag', width: 75 },
            { title: 'Gốc ban đầu', dataIndex: 'original_principal', width: 170, align: 'right', render: fullMoney },
            { title: 'Lãi tích lũy ban đầu', dataIndex: 'original_accrued_interest', width: 180, align: 'right', render: fullMoney },
            { title: 'Gốc đã thu trước kỳ', dataIndex: 'recovered_principal_before_period', width: 180, align: 'right', render: fullMoney },
            { title: 'Dư gốc hiện tại', dataIndex: 'current_principal', width: 170, align: 'right', render: fullMoney },
            { title: 'Dư lãi hiện tại', dataIndex: 'current_interest', width: 170, align: 'right', render: fullMoney },
            { title: 'Ngắn hạn', dataIndex: 'short_term_principal', width: 160, align: 'right', render: fullMoney },
            { title: 'Trung hạn', dataIndex: 'medium_term_principal', width: 160, align: 'right', render: fullMoney },
            { title: 'Dài hạn', dataIndex: 'long_term_principal', width: 160, align: 'right', render: fullMoney },
            { title: 'Thu gốc tháng', dataIndex: 'recovered_principal_period', width: 160, align: 'right', render: fullMoney },
            { title: 'Thu lãi tháng', dataIndex: 'recovered_interest_period', width: 160, align: 'right', render: fullMoney },
            { title: 'BĐS', dataIndex: 'real_estate_amount', width: 150, align: 'right', render: fullMoney },
            { title: 'ĐS', dataIndex: 'movable_asset_amount', width: 150, align: 'right', render: fullMoney },
            { title: 'TSK', dataIndex: 'other_asset_amount', width: 150, align: 'right', render: fullMoney },
          ]} />
      </Modal>
      </div>
    </Modal>
  );
}

function RealDashboard({ context, onOpenCustomer, onGoCustomers }) {
  const { periodKey, branchCode, pgdCode, refreshKey, profileParams = {} } = context;
  const [data, setData] = useState(null);
  const [insights, setInsights] = useState(null);
  const [topChanges, setTopChanges] = useState({});
  const [comparison, setComparison] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [topCustomers, setTopCustomers] = useState([]);
  const [dashboardView, setDashboardView] = useState('results');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [kpiDrill, setKpiDrill] = useState({ open: false, metric: '', label: '', items: [], total: 0, totalValue: 0, page: 1 });
  const [kpiDrillLoading, setKpiDrillLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!periodKey) return;
    setLoading(true);
    setError('');
    const previousPeriod = context.periods[context.periods.findIndex((item) => item.period_key === periodKey) + 1]?.period_key;
    let primaryLoaded = false;
    try {
      const filteredSummaryRes = await client.get('/customer-processing/profile-summary', { params: profileParams });
      const filtered = filteredSummaryRes.data || {};
      setData({
        kpis: {
          total_customers: filtered.total_customers,
          total_loan: filtered.total_loan,
          total_deposit: filtered.total_deposit,
          total_casa: filtered.total_casa,
          no_service_count: filtered.no_service_customers,
        },
      });
      primaryLoaded = true;
      setLoading(false);
      setDetailLoading(true);
      const background = { hideGlobalLoading: true };
      const [summaryRes, profilesRes, insightsRes, comparisonRes, analyticsRes, readinessRes] = await Promise.all([
        client.get('/dashboard/summary', { params: profileParams, ...background }),
        client.get('/customer-processing/profiles', { params: { ...profileParams, sort_by: 'so_du_tien_gui', sort_dir: 'desc', limit: 8 }, ...background }),
        client.get('/dashboard/insights', { params: profileParams, ...background }),
        previousPeriod
          ? client.get('/customer-processing/period-comparison', { params: { ...profileParams, period_key: undefined, current_period: periodKey, previous_period: previousPeriod }, ...background })
          : Promise.resolve({ data: null }),
        client.get('/dashboard/business-analytics', { params: { ...profileParams, include_rankings: false }, ...background }),
        client.get('/imports/source-readiness', { params: { period_key: periodKey }, ...background }).catch(() => ({ data: null })),
      ]);
      setData(summaryRes.data);
      setInsights(insightsRes.data);
      setTopCustomers(Array.isArray(profilesRes.data) ? profilesRes.data : profilesRes.data?.items || []);
      setComparison(comparisonRes.data);
      setAnalytics(analyticsRes.data);
      setReadiness(readinessRes.data);
      client.get('/dashboard/insights', { params: { ...profileParams, include_top_changes: true }, ...background })
        .then(({ data: detail }) => setTopChanges(detail?.top_changes || {}))
        .catch(() => setTopChanges({}));
    } catch (requestError) {
      const detail = requestError.response?.data?.detail || requestError.message || 'Không thể kết nối API';
      if (primaryLoaded) message.warning(`Một số phân tích nền chưa tải xong: ${detail}`);
      else setError(detail);
    } finally {
      setLoading(false);
      setDetailLoading(false);
    }
  }, [branchCode, context.periods, periodKey, pgdCode, profileParams, refreshKey]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <DataLoadingState message="Đang tải các chỉ tiêu điều hành…" detail="KPI chính sẽ hiển thị trước; biểu đồ và phân tích chi tiết tiếp tục được tải ở nền." />;
  if (error) return <ErrorState error={error} onRetry={load} />;
  const kpis = data?.kpis || {};
  const compare = comparison?.summary || {};
  const services = data?.service_penetration || [];
  const officers = data?.officer_leaderboard || [];
  const loanTypes = data?.loan_type_breakdown || [];
  const segment = data?.segment || {};
  const segmentCustomerTotal = Number(segment.cn || 0) + Number(segment.dn || 0);
  const segmentLoanTotal = Number(segment.cn_loan || 0) + Number(segment.dn_loan || 0);
  const customerOverview = insights?.customer_overview || {};
  const deposit = insights?.deposit || {};
  const credit = insights?.credit || {};
  const abnormal = insights?.abnormal || {};
  const executiveRisk = analytics?.risk || {};
  const executiveIncome = analytics?.income || {};
  const readinessSources = readiness?.sources || [];
  const missingSources = readinessSources.filter((item) => !item.is_ready);
  const depositChangeRate = changePercent(deposit.total, deposit.previous_total);
  const creditChangeRate = changePercent(credit.total, credit.previous_total);

  const openInsightCustomer = async (row) => {
    try {
      const { data: profileData } = await client.get('/customer-processing/profiles', {
        params: {
          ...profileParams,
          keyword: row.ma_kh,
          page_size: 1,
        },
      });
      const profile = Array.isArray(profileData) ? profileData[0] : profileData?.items?.[0];
      onOpenCustomer(profile || row);
    } catch {
      onOpenCustomer(row);
    }
  };

  const loadKpiDrilldown = async (metric, page = 1) => {
    setKpiDrillLoading(true);
    setKpiDrill((current) => ({ ...current, open: true, metric, page }));
    try {
      const { data: response } = await client.get('/dashboard/business-drilldown', {
        params: { ...profileParams, metric, page, page_size: 20 },
      });
      setKpiDrill({ open: true, metric, label: response?.label, items: response?.items || [], total: Number(response?.total || 0), totalValue: Number(response?.total_value || 0), page });
    } catch (requestError) {
      message.error(requestError.response?.data?.detail || 'Không tải được danh sách khách hàng của chỉ tiêu');
    } finally {
      setKpiDrillLoading(false);
    }
  };

  const insightMetric = (label, value, note, tone = '') => (
    <div className={`c360-dashboard-stat ${tone}`}>
      <Text type="secondary">{label}</Text>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
  return (
    <div className="demo-page c360-customer-page c360-executive-dashboard">
      <div className="c360-dashboard-context"><Space><span className="is-live" /><Text strong>Kỳ {periodLabel(periodKey)}</Text><Text type="secondary">Dữ liệu trực tiếp từ database</Text>{detailLoading ? <Tag color="processing">Đang tải biểu đồ và phân tích bổ sung…</Tag> : <Tag color="success">Đã cập nhật đầy đủ</Tag>}</Space><Text type="secondary">Bấm KPI để xem đúng danh sách tạo ra chỉ tiêu</Text></div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}><RealMetric title="Tổng khách hàng" value={Number(kpis.total_customers || 0).toLocaleString('vi-VN')} current={compare.customers?.current ?? kpis.total_customers} previous={compare.customers?.previous} icon={<TeamOutlined />} tone="blue" note={`${comparison?.new_customers || 0} mới · ${comparison?.lost_customers || 0} rời kỳ`} onClick={() => loadKpiDrilldown('all')} explanation={{ formula: 'Đếm duy nhất mã KH lõi trong tập CIF đã xử lý', source: 'CustomerPeriodProfile / Kho CIF', unit: 'Khách hàng' }} /></Col>
        <Col xs={24} sm={12} xl={6}><RealMetric title="Tiền gửi CKH" value={compactMoney(kpis.total_deposit)} current={compare.deposit?.current ?? kpis.total_deposit} previous={compare.deposit?.previous} icon={<WalletOutlined />} tone="green" note="Tổng số dư cuối kỳ" onClick={() => loadKpiDrilldown('term_deposit')} explanation={{ formula: 'Tổng số dư tiền gửi có kỳ hạn cuối kỳ, quy đổi VNĐ', source: 'PF14; tỷ giá tham chiếu DP01' }} /></Col>
        <Col xs={24} sm={12} xl={6}><RealMetric title="Tổng dư nợ" value={compactMoney(kpis.total_loan)} current={compare.loan?.current ?? kpis.total_loan} previous={compare.loan?.previous} icon={<BankOutlined />} tone="red" note="Tổng dư nợ khách hàng" onClick={() => loadKpiDrilldown('loan')} explanation={{ formula: 'Tổng dư nợ ngắn hạn + trung dài hạn + thấu chi', source: 'PF10/LN01; tỷ giá tham chiếu DP01' }} /></Col>
        <Col xs={24} sm={12} xl={6}><RealMetric title="TGTT bình quân" value={compactMoney(kpis.total_casa)} current={compare.casa?.current ?? kpis.total_casa} previous={compare.casa?.previous} icon={<BarChartOutlined />} tone="gold" note={`${kpis.no_service_count || 0} KH chưa dùng dịch vụ`} onClick={() => loadKpiDrilldown('casa')} explanation={{ formula: 'Tổng số dư bình quân tài khoản thanh toán trong tháng', source: 'PF14/DP01; quy đổi VNĐ' }} /></Col>
      </Row>
      <Tabs className="c360-dashboard-view-tabs" activeKey={dashboardView} onChange={setDashboardView} items={[{ key: 'results', label: 'Kết quả kỳ' }, { key: 'alerts', label: <span>Cần xử lý <Tag color="error">{Number(abnormal.deposit_drop_count || 0) + Number(abnormal.loan_increase_count || 0) + Number(abnormal.service_drop_count || 0)}</Tag></span> }]} />
      {dashboardView === 'results' && <>
      <Card
        title="Tổng quan khách hàng"
        className="demo-panel demo-section c360-dashboard-overview"
        extra={<Button type="link" onClick={onGoCustomers}>Mở danh sách C360</Button>}
      >
        <div className="c360-dashboard-stat-grid is-five">
          {insightMetric('Có tiền gửi', Number(customerOverview.with_deposit || 0).toLocaleString('vi-VN'), 'Khách hàng có số dư', 'is-green')}
          {insightMetric('Có tiền vay', Number(customerOverview.with_loan || 0).toLocaleString('vi-VN'), 'Khách hàng còn dư nợ', 'is-red')}
          {insightMetric('Có sản phẩm dịch vụ', Number(customerOverview.with_digital_service || 0).toLocaleString('vi-VN'), 'Ít nhất một sản phẩm', 'is-blue')}
          {insightMetric('Quan hệ đa chi nhánh', Number(customerOverview.multi_branch || 0).toLocaleString('vi-VN'), 'Từ hai chi nhánh trở lên', 'is-purple')}
          {insightMetric('Biến động khách hàng', `${Number(comparison?.new_customers || 0).toLocaleString('vi-VN')} / ${Number(comparison?.lost_customers || 0).toLocaleString('vi-VN')}`, 'Mới / rời kỳ', 'is-gold')}
        </div>
      </Card>
      <Row gutter={[16, 16]} className="demo-section">
        <Col xs={24} xl={12}>
          <Card title="Tiền gửi và dòng tiền" className="demo-panel c360-dashboard-domain">
            <div className="c360-dashboard-stat-grid">
              {insightMetric('Tổng tiền gửi', compactMoney(deposit.total), `${depositChangeRate >= 0 ? '+' : ''}${depositChangeRate.toFixed(1)}% so kỳ trước`, depositChangeRate >= 0 ? 'is-green' : 'is-red')}
              {insightMetric('Biến động tuyệt đối', compactMoney(deposit.change), `Kỳ trước ${compactMoney(deposit.previous_total)}`, Number(deposit.change || 0) >= 0 ? 'is-green' : 'is-red')}
              {insightMetric('Tài khoản mở mới trong kỳ', Number(deposit.new_accounts || 0).toLocaleString('vi-VN'), 'So với kỳ PF14 trước', 'is-blue')}
              {insightMetric('Tài khoản đã đóng trong kỳ', Number(deposit.closed_accounts || 0).toLocaleString('vi-VN'), 'So với kỳ PF14 trước', 'is-gold')}
            </div>
          </Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]} className="demo-section">
        <Col xs={24} xl={12}>
          <Card title="Rủi ro tín dụng & XLRR" className="demo-panel c360-dashboard-domain">
            <div className="c360-dashboard-stat-grid">
              {insightMetric('DPRR chung trong tháng', compactMoney(executiveRisk.general_period), `Lũy kế ${compactMoney(executiveRisk.general_accumulated)}`, 'is-blue')}
              {insightMetric('DPRR cụ thể trong tháng', compactMoney(executiveRisk.specific_period), `Lũy kế ${compactMoney(executiveRisk.specific_accumulated)}`, 'is-red')}
              {insightMetric('Dư nợ XLRR', compactMoney(executiveRisk.written_off_balance), 'Số dư cuối kỳ từ RR01', 'is-gold')}
              {insightMetric('Thu nợ XLRR', compactMoney(executiveRisk.written_off_recovery), 'Thu gốc và lãi trong kỳ', 'is-green')}
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="Thu nhập phí & sản phẩm" className="demo-panel c360-dashboard-domain">
            <div className="c360-dashboard-stat-grid">
              {insightMetric('Tổng phí ghi nhận', compactMoney(executiveIncome.total_fee), 'Tổng các nguồn phí hiện có', 'is-green')}
              {(executiveIncome.fees || []).slice(0, 3).map((item, index) => insightMetric(item.label, compactMoney(item.value), 'Theo công thức nghiệp vụ cấu hình', ['is-blue', 'is-purple', 'is-gold'][index]))}
            </div>
          </Card>
        </Col>
      </Row>
      <Card title="Kết quả theo chi nhánh" className="demo-panel demo-section" extra={<Tooltip title="Mỗi dòng tổng hợp số khách hàng và các chỉ tiêu phát sinh tại chi nhánh trong kỳ, theo đúng phạm vi bộ lọc chung."><Text type="secondary">Cách tính: tổng hợp theo quan hệ KH–chi nhánh</Text></Tooltip>}>
        <Table size="small" rowKey="branch_code" pagination={false} dataSource={analytics?.branches || []} scroll={{ x: 880 }} columns={[
          { title: 'Chi nhánh', dataIndex: 'branch_code', fixed: 'left', width: 110, render: (value) => <Text strong>{value}</Text> },
          { title: 'Khách hàng', dataIndex: 'customers', align: 'right', render: (value) => Number(value || 0).toLocaleString('vi-VN') },
          { title: 'Tiền gửi CKH', dataIndex: 'deposit', align: 'right', render: compactMoney },
          { title: 'TGTT bình quân', dataIndex: 'casa', align: 'right', render: compactMoney },
          { title: 'Dư nợ', dataIndex: 'loan', align: 'right', render: compactMoney },
          { title: 'Thu phí', dataIndex: 'fee', align: 'right', render: compactMoney },
        ]} />
      </Card>
      </>}
      {dashboardView === 'alerts' && <>
      <div className="c360-dashboard-section-title is-warning"><div><Text className="demo-eyebrow">CẦN XỬ LÝ</Text><Title level={4}>Cảnh báo và biến động cần rà soát</Title></div><Text type="secondary">Bấm khách hàng để mở hồ sơ C360</Text></div>
      <Card title="Khách hàng có biến động bất thường" className="demo-panel demo-section">
        <div className="c360-anomaly-summary">
          <Tag color="error">Tiền gửi giảm mạnh: {Number(abnormal.deposit_drop_count || 0).toLocaleString('vi-VN')}</Tag>
          <Tag color="warning">Dư nợ tăng nhanh: {Number(abnormal.loan_increase_count || 0).toLocaleString('vi-VN')}</Tag>
          <Tag color="processing">Giảm sản phẩm: {Number(abnormal.service_drop_count || 0).toLocaleString('vi-VN')}</Tag>
          <Text type="secondary">Ngưỡng cảnh báo biến động tiền gửi/dư nợ: 30% so kỳ trước.</Text>
        </div>
        <Table
          size="small"
          rowKey="ma_kh"
          pagination={false}
          dataSource={abnormal?.items || []}
          scroll={{ x: 920 }}
          onRow={(row) => ({ onClick: () => openInsightCustomer(row) })}
          rowClassName="demo-clickable-row"
          locale={{ emptyText: 'Không phát hiện khách hàng có biến động vượt ngưỡng trong kỳ' }}
          columns={[
            { title: 'Khách hàng', fixed: 'left', width: 240, render: (_, row) => <div><Text strong>{row.ten_kh || 'Chưa có tên'}</Text><br /><Text type="secondary">{row.ma_kh}</Text></div> },
            { title: 'Cảnh báo', dataIndex: 'flags', width: 270, render: (flags = []) => <Space size={[4, 4]} wrap>{flags.map((flag) => <Tag key={flag} color={flag.includes('Tiền gửi') ? 'error' : flag.includes('Dư nợ') ? 'warning' : 'processing'}>{flag}</Tag>)}</Space> },
            { title: 'Tiền gửi kỳ này', dataIndex: 'deposit', align: 'right', width: 145, render: compactMoney },
            { title: 'Tiền gửi kỳ trước', dataIndex: 'previous_deposit', align: 'right', width: 145, render: compactMoney },
            { title: 'Dư nợ kỳ này', dataIndex: 'loan', align: 'right', width: 135, render: compactMoney },
            { title: 'Dư nợ kỳ trước', dataIndex: 'previous_loan', align: 'right', width: 135, render: compactMoney },
          ]}
        />
      </Card>
      <Card title="Top biến động trong kỳ" className="demo-panel demo-section">
        <Tabs items={[
          ['deposit_increase', 'Tăng tiền gửi'], ['deposit_decrease', 'Giảm tiền gửi'], ['loan_increase', 'Tăng dư nợ'], ['fee', 'Thu phí lớn'],
        ].map(([key, label]) => ({ key, label, children: <Table size="small" rowKey="ma_kh" pagination={false} dataSource={topChanges[key] || []} onRow={(row) => ({ onClick: () => openInsightCustomer(row) })} rowClassName="demo-clickable-row" scroll={{ x: 820 }} columns={[
          { title: 'Khách hàng', fixed: 'left', width: 260, render: (_, row) => <div><Text strong>{row.ten_kh || 'Chưa có tên'}</Text><br /><Text copyable>{row.ma_kh}</Text></div> },
          { title: 'Chi nhánh', dataIndex: 'primary_branch_code', width: 110 },
          { title: 'Kỳ trước', dataIndex: 'previous', align: 'right', width: 160, render: fullMoney },
          { title: 'Kỳ này', dataIndex: 'current', align: 'right', width: 160, render: fullMoney },
          { title: 'Chênh lệch', dataIndex: 'change', align: 'right', width: 170, render: (value) => <Text strong className={Number(value || 0) >= 0 ? 'is-up' : 'is-down'}>{Number(value || 0) >= 0 ? '+' : ''}{fullMoney(value)}</Text> },
          { title: 'Tỷ lệ', dataIndex: 'change_pct', align: 'right', width: 110, render: (value) => value == null ? 'Mới phát sinh' : `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(1)}%` },
        ]} /> }))} />
      </Card>
      </>}
      {dashboardView === 'analysis' && <>
      <div className="c360-dashboard-section-title is-neutral"><div><Text className="demo-eyebrow">PHÂN TÍCH BỔ SUNG</Text><Title level={4}>Khách hàng, sản phẩm và cơ cấu danh mục</Title></div><Text type="secondary">Các góc nhìn hỗ trợ đánh giá kết quả kỳ</Text></div>
      <Row gutter={[16, 16]} className="demo-section">
        <Col xs={24} xl={14}>
          <Card title="Khách hàng tiền gửi lớn" className="demo-panel" extra={<Button type="link" onClick={onGoCustomers}>Xem tất cả</Button>}>
            <Table size="small" rowKey="id" pagination={false} dataSource={topCustomers} onRow={(row) => ({ onClick: () => onOpenCustomer(row) })} rowClassName="demo-clickable-row" columns={[
              { title: 'Khách hàng', dataIndex: 'ten_kh', render: (value, row) => <div><Text strong>{value || 'Chưa có tên'}</Text><br /><Text type="secondary">{row.ma_kh}</Text></div> },
              { title: 'CN chính', dataIndex: 'primary_branch_code', width: 100 },
              { title: 'Tiền gửi', dataIndex: 'so_du_tien_gui', align: 'right', render: compactMoney },
              { title: 'Dư nợ', dataIndex: 'so_du_tien_vay', align: 'right', render: compactMoney },
            ]} />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card title="Độ phủ sản phẩm hiện có" className="demo-panel">
            <div className="c360-penetration">
              {services.length ? services.map((item) => {
                const label = item.label || serviceLabels[item.key] || item.key;
                const rate = Number(item.pct ?? item.rate ?? item.percentage ?? 0);
                const count = Number(item.count ?? item.used ?? 0);
                return <div key={item.key || label}><span><Text>{label}</Text><Text strong>{count.toLocaleString('vi-VN')} KH</Text></span><Progress percent={rate} size="small" strokeColor="#8f1438" /></div>;
              }) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="API chưa trả dữ liệu sản phẩm" />}
            </div>
          </Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]} className="demo-section">
        <Col xs={24} xl={12}>
          <Card title="Cơ cấu dư nợ theo loại vay" className="demo-panel">
            <div className="c360-penetration">
              {loanTypes.length ? loanTypes.map((item) => {
                const rate = Number(item.pct || 0);
                return (
                  <div key={item.type}>
                    <span><Text>{item.type}</Text><Text strong>{compactMoney(item.amt)}</Text></span>
                    <Progress percent={rate} size="small" strokeColor="#b7791f" />
                  </div>
                );
              }) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu cơ cấu loại vay" />}
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="Cơ cấu khách hàng cá nhân và doanh nghiệp" className="demo-panel">
            <div className="c360-dashboard-stat-grid">
              {insightMetric('Khách hàng cá nhân', Number(segment.cn || 0).toLocaleString('vi-VN'), segmentCustomerTotal ? `${((Number(segment.cn || 0) / segmentCustomerTotal) * 100).toFixed(1)}% số khách hàng` : 'Chưa có dữ liệu', 'is-green')}
              {insightMetric('Khách hàng doanh nghiệp', Number(segment.dn || 0).toLocaleString('vi-VN'), segmentCustomerTotal ? `${((Number(segment.dn || 0) / segmentCustomerTotal) * 100).toFixed(1)}% số khách hàng` : 'Chưa có dữ liệu', 'is-blue')}
              {insightMetric('Dư nợ khách hàng cá nhân', compactMoney(segment.cn_loan), segmentLoanTotal ? `${((Number(segment.cn_loan || 0) / segmentLoanTotal) * 100).toFixed(1)}% tổng dư nợ` : 'Chưa có dữ liệu', 'is-green')}
              {insightMetric('Dư nợ khách hàng doanh nghiệp', compactMoney(segment.dn_loan), segmentLoanTotal ? `${((Number(segment.dn_loan || 0) / segmentLoanTotal) * 100).toFixed(1)}% tổng dư nợ` : 'Chưa có dữ liệu', 'is-blue')}
            </div>
          </Card>
        </Col>
      </Row>
      <Card title="Top cán bộ quản lý" className="demo-panel demo-section">
        <div className="c360-officer-grid">
          {officers.slice(0, 8).map((item, index) => <div key={`${item.code || item.ma_cb || item.officer_code}-${index}`}><Avatar icon={<UserOutlined />} /><span><Text strong>{item.name || item.ten_can_bo || item.officer_name || item.code || item.ma_cb || 'Chưa xác định'}</Text><Text type="secondary">{Number(item.custCount ?? item.customer_count ?? item.count ?? 0).toLocaleString('vi-VN')} khách hàng</Text></span><strong>{compactMoney(item.totalLoan ?? item.total_loan ?? item.loan ?? 0)}</strong></div>)}
        </div>
      </Card>
      <Card title="Phạm vi & chất lượng dữ liệu điều hành" className="demo-panel demo-section">
        <div className="c360-dashboard-stat-grid">
          {insightMetric('Kỳ báo cáo', periodLabel(periodKey), 'Kỳ dữ liệu đang áp dụng toàn Dashboard', 'is-blue')}
          {insightMetric('Nguồn sẵn sàng', `${readinessSources.length - missingSources.length}/${readinessSources.length || 0}`, 'Theo ma trận nguồn của kỳ', missingSources.length ? 'is-gold' : 'is-green')}
          {insightMetric('Nguồn còn thiếu', Number(missingSources.length).toLocaleString('vi-VN'), missingSources.slice(0, 3).map((item) => item.source_code).join(', ') || 'Không có nguồn thiếu', missingSources.length ? 'is-red' : 'is-green')}
          {insightMetric('Phạm vi báo cáo', branchCode || 'Toàn tỉnh', pgdCode ? `PGD ${pgdCode}` : 'Tất cả phòng giao dịch được phép', 'is-purple')}
        </div>
      </Card>
      </>}
      <Drawer width="min(1120px, 96vw)" open={kpiDrill.open} onClose={() => setKpiDrill((current) => ({ ...current, open: false }))} title={`${kpiDrill.label || 'Khách hàng tạo ra chỉ tiêu'} · Kỳ ${periodLabel(periodKey)}`}>
        <Alert type="info" showIcon message={`${kpiDrill.total.toLocaleString('vi-VN')} khách hàng · Tổng giá trị ${fullMoney(kpiDrill.totalValue)}`} description="Bấm một khách hàng để mở hồ sơ C360 đầy đủ. Danh sách này được lọc đúng theo KPI đã chọn." style={{ marginBottom: 12 }} />
        <Table loading={{ spinning: kpiDrillLoading, tip: 'Đang truy vấn khách hàng tạo ra chỉ tiêu…' }} size="small" sticky rowKey="ma_kh" dataSource={kpiDrill.items} rowClassName="demo-clickable-row" onRow={(row) => ({ onClick: () => onOpenCustomer(row) })} scroll={{ x: 1120, y: 'calc(100vh - 260px)' }} pagination={{ current: kpiDrill.page, pageSize: 20, total: kpiDrill.total, showSizeChanger: false, onChange: (page) => loadKpiDrilldown(kpiDrill.metric, page) }} columns={[
          { title: 'Khách hàng', fixed: 'left', width: 250, render: (_, row) => <div><Text strong>{row.ten_kh || 'Chưa có tên'}</Text><br /><Text copyable>{row.ma_kh}</Text></div> },
          { title: 'Chi nhánh', dataIndex: 'branch_code', width: 100 },
          { title: 'Cán bộ quản lý', dataIndex: 'officer_name', width: 190, render: (value, row) => value || row.officer_code || '—' },
          { title: 'Tiền gửi CKH', dataIndex: 'deposit', align: 'right', width: 160, render: fullMoney },
          { title: 'TGTT bình quân', dataIndex: 'casa', align: 'right', width: 160, render: fullMoney },
          { title: 'Dư nợ', dataIndex: 'loan', align: 'right', width: 160, render: fullMoney },
          { title: 'Thu phí', dataIndex: 'fee', align: 'right', width: 150, render: fullMoney },
        ]} />
      </Drawer>
    </div>
  );
}

const EMPTY_CUSTOMER_FILTERS = {
  loan_types: [],
  customer_types: [],
  officer_code: null,
  relationship_status: null,
  service_status: null,
  deposit_status: null,
  loan_status: null,
  contact_status: null,
  min_deposit_million: null,
  max_deposit_million: null,
  min_loan_million: null,
  max_loan_million: null,
  min_casa_million: null,
  max_casa_million: null,
  service_codes: [],
  min_service_count: null,
};

function RealCustomerList({ context, onOpenCustomer }) {
  const { periodKey, branchCode, pgdCode, refreshKey, profileParams = {} } = context;
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({});
  const [filterOptions, setFilterOptions] = useState({ loan_types: [], customer_types: [], officers: [] });
  const [filters, setFilters] = useState(EMPTY_CUSTOMER_FILTERS);
  const [draftFilters, setDraftFilters] = useState(EMPTY_CUSTOMER_FILTERS);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [sort, setSort] = useState('so_du_tien_gui:desc');
  const [exporting, setExporting] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState([
    'customer', 'location', 'officer', 'deposit', 'casa', 'loan', 'products', 'status', 'telephone',
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const requestParams = useMemo(() => {
    const [sortBy, sortDir] = sort.split(':');
    return {
      period_key: periodKey,
      branch_code: branchCode || undefined,
      pgd_code: pgdCode || undefined,
      keyword: query || undefined,
      loan_type: filters.loan_types?.join(',') || undefined,
      customer_type: filters.customer_types?.join(',') || undefined,
      officer_code: filters.officer_code || undefined,
      no_service: filters.service_status === 'none' || undefined,
      multi_branch: filters.relationship_status === 'multi'
        ? true
        : filters.relationship_status === 'single'
          ? false
          : undefined,
      has_deposit: filters.deposit_status === 'yes'
        ? true
        : filters.deposit_status === 'no'
          ? false
          : undefined,
      has_loan: filters.loan_status === 'yes'
        ? true
        : filters.loan_status === 'no'
          ? false
          : undefined,
      missing_phone: filters.contact_status === 'missing'
        ? true
        : filters.contact_status === 'available'
          ? false
          : undefined,
      min_deposit: filters.min_deposit_million != null ? filters.min_deposit_million * 1_000_000 : undefined,
      max_deposit: filters.max_deposit_million != null ? filters.max_deposit_million * 1_000_000 : undefined,
      min_loan: filters.min_loan_million != null ? filters.min_loan_million * 1_000_000 : undefined,
      max_loan: filters.max_loan_million != null ? filters.max_loan_million * 1_000_000 : undefined,
      min_casa: filters.min_casa_million != null ? filters.min_casa_million * 1_000_000 : undefined,
      max_casa: filters.max_casa_million != null ? filters.max_casa_million * 1_000_000 : undefined,
      service_codes: filters.service_codes?.join(',') || undefined,
      min_service_count: filters.min_service_count ?? undefined,
      ...context.profileParams,
      sort_by: sortBy,
      sort_dir: sortDir,
    };
  }, [branchCode, filters, periodKey, pgdCode, query, sort]);

  const load = useCallback(async () => {
    if (!periodKey) return;
    setLoading(true);
    setError('');
    try {
      const [profilesRes, summaryRes, optionsRes] = await Promise.all([
        client.get('/customer-processing/profiles', {
          params: { ...requestParams, page, page_size: pageSize, include_total: true },
        }),
        client.get('/customer-processing/profile-summary', { params: requestParams }),
        client.get('/customer-processing/profile-filter-options', {
          params: {
            period_key: periodKey,
            branch_code: branchCode || undefined,
            pgd_code: pgdCode || undefined,
          },
        }),
      ]);
      setRows(profilesRes.data?.items || []);
      setTotal(Number(profilesRes.data?.total || 0));
      setSummary(summaryRes.data || {});
      setFilterOptions(optionsRes.data || { loan_types: [], officers: [] });
    } catch (requestError) {
      setError(requestError.response?.data?.detail || requestError.message || 'Không tải được danh sách');
    } finally {
      setLoading(false);
    }
  }, [branchCode, page, pageSize, periodKey, pgdCode, refreshKey, requestParams]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [branchCode, filters, periodKey, pgdCode, query, sort]);

  const resetFilters = () => {
    setKeyword('');
    setQuery('');
    setFilters(EMPTY_CUSTOMER_FILTERS);
    setDraftFilters(EMPTY_CUSTOMER_FILTERS);
    setSort('so_du_tien_gui:desc');
    setPage(1);
  };

  const activeFilterCount = Object.values(filters).filter((value) => (
    Array.isArray(value) ? value.length > 0 : value !== null && value !== '' && value !== undefined
  )).length;
  const updateDraftFilter = (key, value) => {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const response = await client.get('/customer-processing/profiles/export', {
        params: requestParams,
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `danh_sach_kh_c360_${periodKey}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      message.success('Đã xuất danh sách theo đúng bộ lọc');
    } catch (requestError) {
      message.error(requestError.response?.data?.detail || 'Không thể xuất Excel');
    } finally {
      setExporting(false);
    }
  };

  const serviceCount = (row) => Object.keys(serviceLabels)
    .filter((key) => Number(row[key] || 0) > 0).length;
  const profileStatus = (row) => {
    if (!row.telephone) return <Tag color="warning">Thiếu liên hệ</Tag>;
    if (serviceCount(row) === 0) return <Tag color="default">Chưa dùng dịch vụ</Tag>;
    if (Number(row.branch_count || 0) > 1) return <Tag color="blue">Đa chi nhánh</Tag>;
    return <Tag color="success">Đang hoạt động</Tag>;
  };

  const allColumns = [
    {
      key: 'customer',
      title: 'Khách hàng',
      dataIndex: 'ten_kh',
      width: 270,
      fixed: 'left',
      render: (value, row) => (
        <div className="c360-customer-cell">
          <Avatar>{value?.charAt(0) || 'K'}</Avatar>
          <span><Text strong>{value || 'Chưa có tên'}</Text><Text type="secondary">{row.ma_kh} · {row.loai_khach_hang || 'Chưa phân loại'}</Text></span>
        </div>
      ),
    },
    { key: 'location', title: 'Chi nhánh/PGD chính', width: 190, render: (_, row) => <div><Text>{row.primary_branch_code || '—'}</Text><br /><Text type="secondary">{row.primary_pgd_name || row.primary_pgd_code || '—'}</Text></div> },
    { key: 'officer', title: 'Cán bộ quản lý', dataIndex: 'ten_can_bo', width: 180, render: (value, row) => <div><Text>{value || row.ma_cb || '—'}</Text>{value && row.ma_cb ? <><br /><Text type="secondary">{row.ma_cb}</Text></> : null}</div> },
    { key: 'deposit', title: 'Tiền gửi CKH', dataIndex: 'so_du_tien_gui', align: 'right', width: 145, render: compactMoney },
    { key: 'casa', title: 'TGTT bình quân', dataIndex: 'so_du_tgtt_binh_quan', align: 'right', width: 145, render: compactMoney },
    { key: 'loan', title: 'Dư nợ', dataIndex: 'so_du_tien_vay', align: 'right', width: 145, render: compactMoney },
    { key: 'products', title: 'Sản phẩm', width: 105, align: 'center', render: (_, row) => <Tag color={serviceCount(row) ? 'geekblue' : 'default'}>{serviceCount(row)} SP</Tag> },
    { key: 'status', title: 'Trạng thái hồ sơ', width: 150, render: (_, row) => profileStatus(row) },
    { key: 'telephone', title: 'Số điện thoại', dataIndex: 'telephone', width: 135, render: (value) => value || '—' },
    { key: 'branches', title: 'Phạm vi chi nhánh', dataIndex: 'branch_codes', width: 180, render: (value) => value || '—' },
    { key: 'loan_type', title: 'Loại vay', dataIndex: 'loai_vay', width: 150, render: (value) => value || '—' },
  ];
  const columns = allColumns.filter((column) => visibleColumns.includes(column.key));

  if (error) return <ErrorState error={error} onRetry={load} />;
  return (
    <div className="demo-page">
      <div className="demo-page-heading">
        <div><Text className="demo-eyebrow">HỒ SƠ KHÁCH HÀNG THẬT</Text><Title level={2}>Danh sách khách hàng C360</Title><Text type="secondary">Tra cứu, phân nhóm và theo dõi khách hàng trong một màn hình</Text></div>
        <Space wrap><Tag color="success">KỲ {periodLabel(periodKey)}</Tag><Button icon={<DownloadOutlined />} loading={exporting} onClick={exportExcel}>Xuất Excel</Button></Space>
      </div>
      <Row gutter={[12, 12]} className="c360-customer-summary">
        <Col xs={12} lg={6}><Card><Text type="secondary">Khách hàng phù hợp</Text><strong>{Number(summary.total_customers || 0).toLocaleString('vi-VN')}</strong><small>Theo bộ lọc hiện tại</small></Card></Col>
        <Col xs={12} lg={6}><Card><Text type="secondary">Tổng tiền gửi</Text><strong>{compactMoney(summary.total_deposit)}</strong><small>Số dư CKH cuối kỳ</small></Card></Col>
        <Col xs={12} lg={6}><Card><Text type="secondary">Tổng dư nợ</Text><strong>{compactMoney(summary.total_loan)}</strong><small>Dư nợ tại phạm vi chọn</small></Card></Col>
        <Col xs={12} lg={6}><Card><Text type="secondary">Chưa dùng dịch vụ</Text><strong>{Number(summary.no_service_customers || 0).toLocaleString('vi-VN')}</strong><small>Cần xem xét bán chéo</small></Card></Col>
      </Row>
      <Card className="demo-filter-card c360-customer-filters">
        <div className="c360-filter-search">
          <Input.Search value={keyword} onChange={(event) => setKeyword(event.target.value)} onSearch={(value) => { setPage(1); setQuery(value.trim()); }} allowClear enterButton={<SearchOutlined />} placeholder="Tên, mã KH, điện thoại hoặc cán bộ..." />
        </div>
        <Select value={sort} onChange={setSort} options={[
          { value: 'so_du_tien_gui:desc', label: 'Tiền gửi: cao → thấp' },
          { value: 'so_du_tien_vay:desc', label: 'Dư nợ: cao → thấp' },
          { value: 'so_du_tgtt_binh_quan:desc', label: 'TGTT: cao → thấp' },
          { value: 'ten_kh:asc', label: 'Tên khách hàng: A → Z' },
        ]} />
        <Button
          type={activeFilterCount ? 'primary' : 'default'}
          icon={<FilterOutlined />}
          onClick={() => {
            setDraftFilters(filters);
            setFilterDrawerOpen(true);
          }}
        >
          Bộ lọc nâng cao{activeFilterCount ? ` (${activeFilterCount})` : ''}
        </Button>
        {activeFilterCount || query ? <Button onClick={resetFilters}>Xóa bộ lọc</Button> : null}
      </Card>
      <div className="c360-list-toolbar">
        <Text type="secondary"><strong>{total.toLocaleString('vi-VN')}</strong> hồ sơ được tìm thấy</Text>
        <Select
          mode="multiple"
          maxTagCount="responsive"
          value={visibleColumns}
          suffixIcon={<SettingOutlined />}
          className="c360-column-picker"
          onChange={(value) => value.includes('customer') && setVisibleColumns(value)}
          options={allColumns.map((column) => ({ value: column.key, label: column.title }))}
        />
      </div>
      <Card className="demo-table-card c360-customer-table">
        <Table
          loading={loading}
          rowKey="id"
          dataSource={rows}
          columns={columns}
          sticky
          onRow={(row) => ({ onClick: () => onOpenCustomer(row) })}
          rowClassName="demo-clickable-row"
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: [15, 30, 50, 100],
            showTotal: (value) => `${value.toLocaleString('vi-VN')} khách hàng`,
            onChange: (nextPage, nextSize) => {
              setPage(nextSize !== pageSize ? 1 : nextPage);
              setPageSize(nextSize);
            },
          }}
          scroll={{ x: Math.max(1100, columns.reduce((sum, column) => sum + Number(column.width || 140), 0)), y: 560 }}
        />
      </Card>
      <Drawer
        title="Bộ lọc khách hàng nâng cao"
        width={560}
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        className="c360-customer-filter-drawer"
        footer={(
          <div className="c360-filter-drawer-footer">
            <Button onClick={() => setDraftFilters(EMPTY_CUSTOMER_FILTERS)}>Xóa tất cả</Button>
            <Space>
              <Button onClick={() => setFilterDrawerOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                icon={<FilterOutlined />}
                onClick={() => {
                  setFilters(draftFilters);
                  setPage(1);
                  setFilterDrawerOpen(false);
                }}
              >
                Áp dụng bộ lọc
              </Button>
            </Space>
          </div>
        )}
      >
        <Alert type="info" showIcon message="Có thể kết hợp nhiều điều kiện; các sản phẩm đã chọn được áp dụng đồng thời." />
        <div className="c360-filter-drawer-grid">
          <label className="is-full"><Text strong>Loại khách hàng</Text><Select mode="multiple" allowClear value={draftFilters.customer_types} placeholder="Chọn một hoặc nhiều loại khách hàng" options={(filterOptions.customer_types || []).map((value) => ({ value, label: value }))} onChange={(value) => updateDraftFilter('customer_types', value)} /></label>
          <label className="is-full"><Text strong>Loại hình vay</Text><Select mode="multiple" allowClear value={draftFilters.loan_types} placeholder="Ngắn hạn, trung hạn, dài hạn, thấu chi..." options={(filterOptions.loan_types || []).map((value) => ({ value, label: loanTypeLabel(value) }))} onChange={(value) => updateDraftFilter('loan_types', value)} /></label>
          <label className="is-full"><Text strong>Cán bộ quản lý</Text><Select showSearch allowClear optionFilterProp="label" value={draftFilters.officer_code} placeholder="Chọn cán bộ quản lý" options={filterOptions.officers || []} onChange={(value) => updateDraftFilter('officer_code', value || null)} /></label>
          <Divider className="is-full">Quan hệ và trạng thái</Divider>
          <label><Text strong>Quan hệ chi nhánh</Text><Select allowClear value={draftFilters.relationship_status} placeholder="Tất cả" options={[{ value: 'single', label: 'Một chi nhánh' }, { value: 'multi', label: 'Đa chi nhánh' }]} onChange={(value) => updateDraftFilter('relationship_status', value || null)} /></label>
          <label><Text strong>Thông tin liên hệ</Text><Select allowClear value={draftFilters.contact_status} placeholder="Tất cả" options={[{ value: 'available', label: 'Có số điện thoại' }, { value: 'missing', label: 'Thiếu số điện thoại' }]} onChange={(value) => updateDraftFilter('contact_status', value || null)} /></label>
          <label><Text strong>Quan hệ tiền gửi</Text><Select allowClear value={draftFilters.deposit_status} placeholder="Tất cả" options={[{ value: 'yes', label: 'Có số dư tiền gửi' }, { value: 'no', label: 'Không có tiền gửi' }]} onChange={(value) => updateDraftFilter('deposit_status', value || null)} /></label>
          <label><Text strong>Quan hệ tiền vay</Text><Select allowClear value={draftFilters.loan_status} placeholder="Tất cả" options={[{ value: 'yes', label: 'Có dư nợ' }, { value: 'no', label: 'Không có dư nợ' }]} onChange={(value) => updateDraftFilter('loan_status', value || null)} /></label>
          <label className="is-full"><Text strong>Tình trạng sản phẩm</Text><Select allowClear value={draftFilters.service_status} placeholder="Tất cả" options={[{ value: 'none', label: 'Chưa sử dụng sản phẩm dịch vụ' }]} onChange={(value) => updateDraftFilter('service_status', value || null)} /></label>
          <Divider className="is-full">Khoảng giá trị (triệu đồng)</Divider>
          <label><Text strong>Tiền gửi từ</Text><InputNumber min={0} value={draftFilters.min_deposit_million} placeholder="Ví dụ 100" addonAfter="triệu" onChange={(value) => updateDraftFilter('min_deposit_million', value)} /></label>
          <label><Text strong>Tiền gửi đến</Text><InputNumber min={0} value={draftFilters.max_deposit_million} placeholder="Không giới hạn" addonAfter="triệu" onChange={(value) => updateDraftFilter('max_deposit_million', value)} /></label>
          <label><Text strong>Dư nợ từ</Text><InputNumber min={0} value={draftFilters.min_loan_million} placeholder="Ví dụ 500" addonAfter="triệu" onChange={(value) => updateDraftFilter('min_loan_million', value)} /></label>
          <label><Text strong>Dư nợ đến</Text><InputNumber min={0} value={draftFilters.max_loan_million} placeholder="Không giới hạn" addonAfter="triệu" onChange={(value) => updateDraftFilter('max_loan_million', value)} /></label>
          <label><Text strong>TGTT bình quân từ</Text><InputNumber min={0} value={draftFilters.min_casa_million} placeholder="Ví dụ 50" addonAfter="triệu" onChange={(value) => updateDraftFilter('min_casa_million', value)} /></label>
          <label><Text strong>TGTT bình quân đến</Text><InputNumber min={0} value={draftFilters.max_casa_million} placeholder="Không giới hạn" addonAfter="triệu" onChange={(value) => updateDraftFilter('max_casa_million', value)} /></label>
          <Divider className="is-full">Sản phẩm dịch vụ</Divider>
          <label className="is-full"><Text strong>Bắt buộc đang sử dụng</Text><Select mode="multiple" allowClear value={draftFilters.service_codes} placeholder="Chọn các sản phẩm khách hàng phải đang sử dụng" options={Object.entries(serviceLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => updateDraftFilter('service_codes', value)} /></label>
          <label className="is-full"><Text strong>Số sản phẩm tối thiểu</Text><InputNumber min={0} max={20} value={draftFilters.min_service_count} placeholder="Ví dụ 2" onChange={(value) => updateDraftFilter('min_service_count', value)} /></label>
        </div>
      </Drawer>
    </div>
  );
}

const ANALYSIS_META = {
  'analysis-deposit': { eyebrow: 'PHÂN TÍCH NGHIỆP VỤ', title: 'Tiền gửi & dòng tiền', description: 'Theo dõi quy mô nguồn vốn, CASA, doanh số thanh toán và biến động tài khoản.', tone: 'green' },
  'analysis-credit': { eyebrow: 'PHÂN TÍCH NGHIỆP VỤ', title: 'Tiền vay & rủi ro', description: 'Phân tích cơ cấu dư nợ, nhóm nợ, dự phòng và thu hồi nợ đã xử lý rủi ro.', tone: 'red' },
  'analysis-income': { eyebrow: 'PHÂN TÍCH NGHIỆP VỤ', title: 'Thu nhập & sản phẩm', description: 'Theo dõi nguồn thu phí, mức thâm nhập sản phẩm và khoảng trống bán chéo.', tone: 'blue' },
  'analysis-unit': { eyebrow: 'PHÂN TÍCH NGHIỆP VỤ', title: 'Đơn vị & cán bộ', description: 'So sánh kết quả giữa chi nhánh và danh mục khách hàng do từng cán bộ quản lý.', tone: 'purple' },
};

function AnalysisKpi({ label, value, note, tone = 'blue', onClick }) {
  return <div role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick} onKeyDown={(event) => event.key === 'Enter' && onClick?.()} className={`c360-analysis-kpi is-${tone} ${onClick ? 'is-clickable' : ''}`}><Text type="secondary">{label}</Text><strong>{value}</strong><small>{note}</small>{onClick ? <Text className="c360-analysis-drill-hint">Xem khách hàng →</Text> : null}</div>;
}

function BusinessAnalysisPage({ context, mode, onOpenCustomer }) {
  const { periods, periodKey, branchCode, pgdCode, refreshKey, profileParams = {} } = context;
  const [data, setData] = useState(null);
  const [insights, setInsights] = useState(null);
  const [reconciliationTotal, setReconciliationTotal] = useState(0);
  const [reconciliation, setReconciliation] = useState({ open: false, items: [], total: 0, page: 1 });
  const [reconciliationLoading, setReconciliationLoading] = useState(false);
  const [reconciliationKeyword, setReconciliationKeyword] = useState('');
  const [reconciliationSource, setReconciliationSource] = useState();
  const [trends, setTrends] = useState([]);
  const [drilldown, setDrilldown] = useState({ open: false, metric: '', label: '', items: [], total: 0, page: 1 });
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillKeyword, setDrillKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [comparisonPeriod, setComparisonPeriod] = useState(() => new URLSearchParams(window.location.search).get('compare') || '');
  const [serviceView, setServiceView] = useState('all');
  const meta = ANALYSIS_META[mode] || ANALYSIS_META['analysis-deposit'];
  const load = useCallback(async () => {
    if (!periodKey) return;
    setLoading(true); setError('');
    const params = profileParams;
    try {
      const [analyticsRes, insightsRes, trendRes, reconciliationRes] = await Promise.all([
        client.get('/dashboard/business-analytics', { params }),
        client.get('/dashboard/insights', { params }),
        client.get('/dashboard/business-trends', { params: { periods: 12, ...toApiBranchParams(branchCode, pgdCode) } }),
        client.get('/customer-processing/reconciliations', { params: { period_key: periodKey, branch_code: branchCode || undefined, latest_job_only: true, page: 1, page_size: 1 } }),
      ]);
      setData(analyticsRes.data); setInsights(insightsRes.data); setTrends(trendRes.data?.items || []);
      setReconciliationTotal(Number(reconciliationRes.data?.total || 0));
    } catch (requestError) {
      setError(requestError.response?.data?.detail || requestError.message || 'Không tải được dữ liệu phân tích');
    } finally { setLoading(false); }
  }, [branchCode, periodKey, pgdCode, profileParams, refreshKey]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const available = trends.filter((item) => item.period_key !== periodKey);
    if (!available.length) return;
    if (!available.some((item) => item.period_key === comparisonPeriod)) setComparisonPeriod(available.at(-1)?.period_key || '');
  }, [comparisonPeriod, periodKey, trends]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (comparisonPeriod) params.set('compare', comparisonPeriod); else params.delete('compare');
    const query = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [comparisonPeriod]);

  const deposit = data?.deposit || {};
  const credit = data?.credit || {};
  const risk = data?.risk || {};
  const income = data?.income || {};
  const customer = data?.customer || {};
  const depositInsight = insights?.deposit || {};
  const creditInsight = insights?.credit || {};
  const maxService = Math.max(...(data?.services || []).map((item) => Number(item.pct || 0)), 1);
  const metricForMode = mode === 'analysis-credit' ? 'loan' : mode === 'analysis-income' ? 'fee' : mode === 'analysis-unit' ? 'service' : 'deposit';
  const trendField = mode === 'analysis-credit' ? 'loan' : mode === 'analysis-income' ? 'fee' : mode === 'analysis-unit' ? 'customers' : 'deposit';
  const trendMax = Math.max(...trends.map((item) => Number(item[trendField] || 0)), 1);
  const currentTrend = trends.at(-1) || {};
  const previousTrend = trends.at(-2) || {};
  const comparisonTrend = trends.find((item) => item.period_key === comparisonPeriod) || previousTrend;
  const comparisonFields = mode === 'analysis-deposit'
    ? [['Tiền gửi CKH', 'deposit'], ['TGTT bình quân', 'casa']]
    : mode === 'analysis-credit'
      ? [['Dư nợ', 'loan'], ['Dự phòng lũy kế', 'provision']]
      : mode === 'analysis-income'
        ? [['Thu phí', 'fee'], ['Khách hàng', 'customers']]
        : [['Khách hàng', 'customers'], ['Tiền gửi', 'deposit'], ['Dư nợ', 'loan'], ['Thu phí', 'fee']];
  const sourceNotes = mode === 'analysis-deposit'
    ? [['Tiền gửi', 'PF14.EOMBAL/AVGBAL, phân loại kỳ hạn; tỷ giá lấy theo DP01 của kỳ'], ['Dòng tiền', 'GL02 LOCAC 421101, giao dịch Normal; KH02 theo tài khoản cân đối'], ['Biến động', 'So sánh cùng tài khoản và mã KH lõi giữa hai kỳ liên tiếp']]
    : mode === 'analysis-credit'
      ? [['Dư nợ', 'LN01.DU_NO và PF10.EOMBAL/AVGBAL theo loại vay'], ['DPRR', 'LN01 nhóm 1–4 và BC29 nhóm 2–5 theo công thức cấu hình'], ['XLRR', 'RR01: dư gốc hiện tại và thu gốc + thu lãi theo LAV/LDS']]
      : mode === 'analysis-income'
        ? [['Thu phí', 'KH02: SUM(CRAMT) − SUM(DRAMT) theo nhóm tài khoản cấu hình'], ['Sản phẩm', 'CN05, DP01 và file Bill Payment; tổng hợp cờ có/không theo khách hàng'], ['Bán chéo', 'Khách hàng có quy mô nhưng chưa sử dụng sản phẩm phù hợp']]
        : [['Đơn vị', 'CustomerPeriodBranchDetail, cộng đúng phần quan hệ tại từng chi nhánh/PGD'], ['Cán bộ', 'User gắn mã KH → BC06 → LN01 → DP01; không nhân cán bộ sang chi nhánh khác'], ['Khách hàng', 'Toàn tỉnh đếm duy nhất theo mã KH lõi CIF']];
  const loadDrilldown = useCallback(async (metric, nextPage = 1, keyword = drillKeyword) => {
    setDrillLoading(true);
    try {
      const { data: response } = await client.get('/dashboard/business-drilldown', { params: { ...profileParams, metric, detail_keyword: keyword || undefined, page: nextPage, page_size: 20 } });
      setDrilldown({ open: true, metric, label: response?.label, items: response?.items || [], total: Number(response?.total || 0), totalValue: Number(response?.total_value || 0), page: nextPage });
    } catch (requestError) { message.error(requestError.response?.data?.detail || requestError.message); }
    finally { setDrillLoading(false); }
  }, [drillKeyword, profileParams]);
  const loadReconciliations = useCallback(async (nextPage = 1, keyword = reconciliationKeyword, source = reconciliationSource) => {
    setReconciliationLoading(true);
    try {
      const { data: response } = await client.get('/customer-processing/reconciliations', { params: { period_key: periodKey, branch_code: branchCode || undefined, source_type: source || undefined, keyword: keyword || undefined, latest_job_only: true, page: nextPage, page_size: 50 } });
      setReconciliation({ open: true, items: response?.items || [], total: Number(response?.total || 0), page: nextPage });
    } catch (requestError) { message.error(requestError.response?.data?.detail || requestError.message || 'Không tải được danh sách đối chiếu CIF'); }
    finally { setReconciliationLoading(false); }
  }, [branchCode, periodKey, reconciliationKeyword, reconciliationSource]);
  if (loading) return <DataLoadingState message="Đang tải phân tích nghiệp vụ…" detail="Đang tổng hợp dữ liệu theo kỳ và phạm vi tổ chức được phép truy cập." />;
  if (error) return <ErrorState error={error} onRetry={load} />;
  const exportMetric = async () => {
    try {
      const response = await client.get('/dashboard/business-export', { params: { ...profileParams, metric: drilldown.metric || metricForMode }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data); const link = document.createElement('a');
      link.href = url; link.download = `phan_tich_${drilldown.metric || metricForMode}_${periodKey}.xlsx`; link.click(); URL.revokeObjectURL(url);
    } catch (requestError) { message.error(requestError.response?.data?.detail || 'Không xuất được Excel'); }
  };
  const pageKpis = mode === 'analysis-deposit' ? [
    ['Tiền gửi có kỳ hạn', compactMoney(deposit.term), 'Số dư cuối kỳ', 'green', 'term_deposit'],
    ['TGTT bình quân', compactMoney(deposit.casa_average), 'Bình quân trong tháng', 'blue', 'casa'],
    ['Doanh số TKTT', compactMoney(deposit.payment_turnover), 'Phát sinh Có GL02/KH02', 'purple', 'payment_turnover'],
    ['KH có tiền gửi', Number(customer.with_deposit || 0).toLocaleString('vi-VN'), `${Number(depositInsight.new_accounts || 0).toLocaleString('vi-VN')} TK mới`, 'gold', 'deposit'],
  ] : mode === 'analysis-credit' ? [
    ['Tổng dư nợ', compactMoney(credit.total), `${Number(customer.with_loan || 0).toLocaleString('vi-VN')} khách hàng`, 'red', 'loan'],
    ['Dư nợ ngắn hạn', compactMoney(credit.short_term), 'Theo PF10/LN01', 'blue', 'short_loan'],
    ['Dư nợ trung dài hạn', compactMoney(credit.medium_long_term), 'Trung hạn và dài hạn', 'purple', 'medium_long_loan'],
    ['Dư nợ XLRR', compactMoney(risk.written_off_balance), `Thu hồi ${compactMoney(risk.written_off_recovery)}`, 'gold', 'written_off'],
  ] : mode === 'analysis-income' ? [
    ['Tổng phí ghi nhận', compactMoney(income.total_fee), 'Tổng các nguồn phí hiện có', 'green', 'fee'],
    ['KH dùng sản phẩm', Number(customer.with_service || 0).toLocaleString('vi-VN'), `Trên ${Number(customer.total || 0).toLocaleString('vi-VN')} KH`, 'blue', 'service'],
    ['Phí chuyển tiền', compactMoney(income.fees?.find((item) => item.key === 'phi_chuyen_tien')?.value), 'Nguồn KH02', 'purple', 'transfer_fee'],
    ['Phí NHĐT', compactMoney(income.fees?.find((item) => item.key === 'phi_nhdt')?.value), 'Nguồn KH02', 'gold', 'digital_fee'],
  ] : [
    ['Số chi nhánh', Number(data?.branches?.length || 0).toLocaleString('vi-VN'), 'Trong phạm vi đang chọn', 'blue', 'service'],
    ['Cán bộ có danh mục', Number(data?.officers?.length || 0).toLocaleString('vi-VN'), 'Có dữ liệu quản lý KH', 'purple', 'service'],
    ['Tổng khách hàng', Number(customer.total || 0).toLocaleString('vi-VN'), 'Không đếm trùng mã KH lõi', 'green', 'service'],
    ['Tổng quy mô', compactMoney(Number(deposit.term || 0) + Number(deposit.casa_average || 0) + Number(credit.total || 0)), 'Tiền gửi và tiền vay', 'gold', 'service'],
  ];

  return <div className={`demo-page c360-analysis-page is-${meta.tone}`}>
    <div className="demo-page-heading c360-analysis-heading"><div><Text className="demo-eyebrow">{meta.eyebrow}</Text><Title level={2}>{meta.title}</Title><Text type="secondary">{meta.description}</Text></div><Space><Button icon={<DownloadOutlined />} onClick={exportMetric}>Xuất Excel</Button><Tag color="success">Kỳ {periodLabel(periodKey)} · LIVE</Tag></Space></div>
    <div className="c360-analysis-kpi-grid">{pageKpis.map(([label, value, note, tone, metric]) => <AnalysisKpi key={label} label={label} value={value} note={note} tone={tone} onClick={() => loadDrilldown(metric)} />)}</div>
    {reconciliationTotal > 0 && <Alert className="demo-section" showIcon type="warning" message={`${reconciliationTotal.toLocaleString('vi-VN')} mã khách hàng từ file nguồn chưa khớp Kho CIF`} description="Dữ liệu được giữ theo lần xử lý mới nhất và không bị mất. Mở danh sách để xem từng mã cùng lý do chưa đối chiếu." action={<Button danger ghost onClick={() => loadReconciliations(1)}>Xem danh sách & lý do</Button>} />}
    <Card className="demo-panel demo-section c360-analysis-trend" title={`Xu hướng ${trends.length} kỳ`} extra={<Text type="secondary">Bấm KPI phía trên để xem khách hàng cấu thành</Text>}><div className="c360-trend-strip">{trends.map((item) => <Tooltip key={item.period_key} title={`${periodLabel(item.period_key)}: ${trendField === 'customers' ? Number(item[trendField] || 0).toLocaleString('vi-VN') : fullMoney(item[trendField])}`}><div><span style={{ height: `${Math.max(6, Number(item[trendField] || 0) / trendMax * 100)}%` }} /><small>{periodLabel(item.period_key)}</small></div></Tooltip>)}</div></Card>
    <Card className="demo-panel demo-section" title="So sánh kỳ" extra={<Space><Text type="secondary">Kỳ đối chiếu</Text><Select value={comparisonPeriod || undefined} style={{ width: 145 }} placeholder="Chọn kỳ" onChange={setComparisonPeriod} options={(periods || []).filter((item) => item.period_key !== periodKey && trends.some((trend) => trend.period_key === item.period_key)).map((item) => ({ value: item.period_key, label: periodLabel(item.period_key) }))} /></Space>}><div className="c360-analysis-compare-grid">{comparisonFields.map(([label, field]) => { const current = Number(currentTrend[field] || 0); const previous = Number(comparisonTrend[field] || 0); const pct = previous ? (current - previous) / Math.abs(previous) * 100 : 0; const sourceAvailable = comparisonTrend.availability?.[field] !== false; const populationChanged = field === 'customers' && previous > 0 && Math.abs(pct) >= 50; const comparisonValid = comparisonTrend.period_key && sourceAvailable && !populationChanged; const statusText = !comparisonTrend.period_key ? 'Chưa chọn kỳ đối chiếu' : !sourceAvailable ? 'Kỳ đối chiếu thiếu nguồn' : populationChanged ? 'Thay đổi tập CIF nền' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`; return <div key={field}><Text type="secondary">{label}</Text><strong className={comparisonValid ? (pct >= 0 ? 'is-up' : 'is-down') : ''}>{statusText}</strong><small>{field === 'customers' ? `${current.toLocaleString('vi-VN')} / ${previous.toLocaleString('vi-VN')} KH` : `${compactMoney(current)} / ${compactMoney(previous)}`}</small></div>; })}</div></Card>

    {mode === 'analysis-deposit' && <Row gutter={[16, 16]} className="demo-section">
      <Col xs={24} xl={14}><Card className="demo-panel" title="Cơ cấu và biến động nguồn vốn"><div className="c360-analysis-bars">
        {[['Tiền gửi có kỳ hạn', deposit.term, '#16a34a', 'term_deposit'], ['TGTT bình quân', deposit.casa_average, '#1677ff', 'casa'], ['Doanh số thanh toán', deposit.payment_turnover, '#7c3aed', 'payment_turnover']].map(([label, value, color, metric]) => <div key={label} role="button" tabIndex={0} className="is-clickable" onClick={() => loadDrilldown(metric)} onKeyDown={(event) => event.key === 'Enter' && loadDrilldown(metric)}><span><Text>{label}</Text><Text strong>{compactMoney(value)}</Text></span><Progress percent={Math.round(Number(value || 0) / Math.max(Number(deposit.term || 0), Number(deposit.casa_average || 0), Number(deposit.payment_turnover || 0), 1) * 100)} showInfo={false} strokeColor={color} /></div>)}
      </div></Card></Col>
      <Col xs={24} xl={10}><Card className="demo-panel" title="Biến động tài khoản"><div className="c360-analysis-event-grid"><AnalysisKpi label="Tài khoản mới" value={Number(depositInsight.new_accounts || 0).toLocaleString('vi-VN')} note="So với kỳ trước" tone="green" /><AnalysisKpi label="Tài khoản tất toán/ngừng" value={Number(depositInsight.closed_accounts || 0).toLocaleString('vi-VN')} note="So với kỳ trước" tone="gold" /><AnalysisKpi label="KH giảm tiền gửi mạnh" value={Number(depositInsight.large_drop_customers || 0).toLocaleString('vi-VN')} note="Giảm từ 30%" tone="red" /></div></Card></Col>
    </Row>}

    {mode === 'analysis-credit' && <Row gutter={[16, 16]} className="demo-section">
      <Col xs={24} xl={13}><Card className="demo-panel" title="Cơ cấu dư nợ theo loại vay"><div className="c360-analysis-bars">{[['Ngắn hạn', credit.short_term, '#1677ff', 'short_loan'], ['Trung dài hạn', credit.medium_long_term, '#7c3aed', 'medium_long_loan'], ['Thấu chi', credit.overdraft, '#f59e0b', 'overdraft']].map(([label, value, color, metric]) => <div key={label} role="button" tabIndex={0} className="is-clickable" onClick={() => loadDrilldown(metric)} onKeyDown={(event) => event.key === 'Enter' && loadDrilldown(metric)}><span><Text>{label}</Text><Text strong>{compactMoney(value)}</Text></span><Progress percent={Math.round(Number(value || 0) / Math.max(Number(credit.total || 0), 1) * 100)} strokeColor={color} /></div>)}</div></Card></Col>
      <Col xs={24} xl={11}><Card className="demo-panel" title="Dự phòng và nghĩa vụ"><div className="c360-analysis-event-grid"><AnalysisKpi label="DPRR chung trong tháng" value={compactMoney(risk.general_period)} note={`Lũy kế ${compactMoney(risk.general_accumulated)}`} tone="blue" /><AnalysisKpi label="DPRR cụ thể trong tháng" value={compactMoney(risk.specific_period)} note={`Lũy kế ${compactMoney(risk.specific_accumulated)}`} tone="red" /><AnalysisKpi label="Lãi quá hạn" value={creditInsight.obligation_source_available ? compactMoney(creditInsight.overdue_interest) : 'Chưa có nguồn'} note={`${Number(creditInsight.overdue_customers || 0)} KH`} tone="gold" /></div></Card></Col>
      <Col span={24}><Card className="demo-panel" title="Phân bố nhóm nợ"><Table size="small" pagination={false} rowKey="group" dataSource={risk.debt_groups || []} rowClassName="demo-clickable-row" onRow={(row) => ({ onClick: () => loadDrilldown('loan', 1, '') })} columns={[{ title: 'Nhóm nợ', dataIndex: 'group', render: (value) => <Tag color={Number(value) > 2 ? 'error' : Number(value) === 2 ? 'warning' : 'success'}>Nhóm {value}</Tag> }, { title: 'Khách hàng', dataIndex: 'customers', align: 'right', render: (value) => Number(value || 0).toLocaleString('vi-VN') }, { title: 'Dư nợ', dataIndex: 'balance', align: 'right', render: fullMoney }, { title: 'Tỷ trọng', align: 'right', render: (_, row) => `${credit.total ? (Number(row.balance || 0) / Number(credit.total) * 100).toFixed(2) : 0}%` }]} /></Card></Col>
    </Row>}

    {mode === 'analysis-income' && <Row gutter={[16, 16]} className="demo-section"><Col xs={24} xl={10}><Card className="demo-panel" title="Cơ cấu thu phí"><div className="c360-analysis-bars">{(income.fees || []).map((item, index) => { const feeMetric = { phi_bao_lanh: 'guarantee_fee', phi_chuyen_tien: 'transfer_fee', phi_nhdt: 'digital_fee', abic_batd: 'abic_fee' }[item.key] || 'fee'; return <div key={item.key} role="button" tabIndex={0} className={`is-clickable ${Number(item.value || 0) === 0 ? 'is-zero' : ''}`} onClick={() => loadDrilldown(feeMetric)} onKeyDown={(event) => event.key === 'Enter' && loadDrilldown(feeMetric)}><span><Text>{item.label}</Text><Text strong>{compactMoney(item.value)}</Text></span><small>{Number(item.customers || 0).toLocaleString('vi-VN')} KH · bình quân {compactMoney(item.average)}</small><Progress percent={income.total_fee ? Math.round(Number(item.value || 0) / Number(income.total_fee) * 100) : 0} strokeColor={['#16a34a', '#1677ff', '#7c3aed', '#f59e0b'][index % 4]} /></div>; })}</div></Card></Col><Col xs={24} xl={14}><Card className="demo-panel" title="Độ phủ và khoảng trống sản phẩm" extra={<Select size="small" value={serviceView} onChange={setServiceView} style={{ width: 160 }} options={[{ value: 'all', label: 'Tất cả sản phẩm' }, { value: 'used', label: 'Có khách sử dụng' }, { value: 'gap', label: 'Còn khoảng trống' }]} />}><div className="c360-analysis-service-grid">{(data?.services || []).filter((item) => serviceView === 'all' || (serviceView === 'used' ? Number(item.count || 0) > 0 : Number(item.base || 0) > Number(item.count || 0))).map((item) => <div className="is-clickable" key={item.key} role="button" tabIndex={0} onClick={() => loadDrilldown(`service:${item.key}`)} onKeyDown={(event) => event.key === 'Enter' && loadDrilldown(`service:${item.key}`)}><span><Text strong>{item.label || serviceLabels[item.key] || item.key}</Text><Text type="secondary">{Number(item.count || 0).toLocaleString('vi-VN')} / {Number(item.base || 0).toLocaleString('vi-VN')} {item.base_label}</Text></span><Progress percent={Number(item.pct || 0)} strokeColor={Number(item.pct || 0) === maxService ? '#16a34a' : '#1677ff'} /><button type="button" className="c360-service-gap" onClick={(event) => { event.stopPropagation(); loadDrilldown(`no_service:${item.key}`); }}>Còn {Math.max(0, Number(item.base || 0) - Number(item.count || 0)).toLocaleString('vi-VN')} KH chưa dùng</button></div>)}</div></Card></Col></Row>}

    {mode === 'analysis-unit' && <Row gutter={[16, 16]} className="demo-section"><Col span={24}><Card className="demo-panel" title="Kết quả theo chi nhánh"><Table size="small" sticky pagination={false} rowKey="branch_code" dataSource={data?.branches || []} scroll={{ x: 1050 }} columns={[{ title: 'Chi nhánh', dataIndex: 'branch_code', fixed: 'left', width: 120, render: (value) => <Text strong>{value}</Text> }, { title: 'Khách hàng', dataIndex: 'customers', align: 'right', render: (value) => Number(value || 0).toLocaleString('vi-VN') }, { title: 'Tiền gửi CKH', dataIndex: 'deposit', align: 'right', render: compactMoney }, { title: 'TGTT bình quân', dataIndex: 'casa', align: 'right', render: compactMoney }, { title: 'Dư nợ', dataIndex: 'loan', align: 'right', render: compactMoney }, { title: 'Thu phí', dataIndex: 'fee', align: 'right', render: compactMoney }, { title: 'Cán bộ', dataIndex: 'officers', align: 'right' }]} /></Card></Col><Col span={24}><Card className="demo-panel" title="Hiệu quả cán bộ"><Table size="small" rowKey="code" dataSource={data?.officers || []} pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: 920 }} columns={[{ title: 'Cán bộ', fixed: 'left', width: 240, render: (_, row) => <div><Text strong>{row.name}</Text><br /><Text type="secondary">{row.employeeCode || row.code}</Text></div> }, { title: 'Khách hàng', dataIndex: 'custCount', align: 'right' }, { title: 'Dư nợ', dataIndex: 'totalLoan', align: 'right', render: compactMoney }, { title: 'TGTT bình quân', dataIndex: 'totalCASA', align: 'right', render: compactMoney }, { title: 'SP/KH', dataIndex: 'avgCrossSell', align: 'right', render: (value) => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) }]} /></Card></Col></Row>}
    <Alert className="demo-section" showIcon type="info" message="Cách đọc số liệu" description="Số liệu được tổng hợp theo kỳ và phạm vi chi nhánh/PGD đang chọn. Toàn tỉnh không đếm trùng mã khách hàng lõi; khi lọc chi nhánh, số liệu lấy đúng phần quan hệ tại chi nhánh đó." />
    <Card className="demo-panel demo-section" title="Nguồn dữ liệu & công thức"><Descriptions column={{ xs: 1, md: 1 }} bordered size="small" items={sourceNotes.map(([label, children]) => ({ key: label, label, children }))} /></Card>
    <Drawer width="min(1380px, 98vw)" open={reconciliation.open} onClose={() => setReconciliation((current) => ({ ...current, open: false }))} title={`Khách hàng chưa đối chiếu Kho CIF · Kỳ ${periodLabel(periodKey)}`}>
      <Alert showIcon type="info" message="Nguyên tắc hiển thị" description="Chỉ lấy kết quả của job xử lý gần nhất để không đếm lặp lịch sử. Một mã có thể xuất hiện ở nhiều nguồn hoặc chi nhánh; từng dòng ghi rõ nơi phát hiện và nguyên nhân chưa ghép được với CIF." />
      <div className="c360-reconciliation-toolbar"><Input.Search allowClear value={reconciliationKeyword} onChange={(event) => setReconciliationKeyword(event.target.value)} onSearch={(value) => loadReconciliations(1, value)} placeholder="Tìm mã hoặc tên khách hàng" /><Select allowClear value={reconciliationSource} placeholder="Tất cả nguồn" onChange={(value) => { setReconciliationSource(value); loadReconciliations(1, reconciliationKeyword, value); }} options={['DP01', 'LN01', 'PF10', 'PF14', 'BC06', 'BC29', 'CN05', 'KH02', 'RR01', 'GL02'].map((value) => ({ value, label: value }))} /><Tag color="warning">{reconciliation.total.toLocaleString('vi-VN')} bản ghi cần rà soát</Tag></div>
      <Table loading={reconciliationLoading} size="small" sticky rowKey="id" dataSource={reconciliation.items} scroll={{ x: 1400, y: 'calc(100vh - 270px)' }} pagination={{ current: reconciliation.page, pageSize: 50, total: reconciliation.total, showSizeChanger: false, showTotal: (value) => `${value.toLocaleString('vi-VN')} bản ghi`, onChange: (page) => loadReconciliations(page) }} columns={[
        { title: 'Mã KH lõi', dataIndex: 'customer_core_code', fixed: 'left', width: 150, render: (value) => value ? <Text copyable strong>{value}</Text> : <Tag color="error">Không có mã</Tag> },
        { title: 'Tên khách hàng từ nguồn', dataIndex: 'customer_name', width: 240, render: (value) => value || '—' }, { title: 'Nguồn', dataIndex: 'source_type', width: 90, render: (value) => <Tag color="blue">{value}</Tag> }, { title: 'Chi nhánh', dataIndex: 'branch_code', width: 100, render: (value) => value || '—' },
        { title: 'Lý do chưa đối chiếu', dataIndex: 'reason_code', width: 390, render: (value) => <div><Text strong type="danger">{reconciliationReasonLabels[value] || 'Chưa có diễn giải cho mã lỗi này'}</Text><br /><Text code>{value}</Text></div> },
        { title: 'Số dòng nguồn', dataIndex: 'source_row_count', width: 115, align: 'right', render: (value) => Number(value || 0).toLocaleString('vi-VN') }, { title: 'Giá trị nguồn', dataIndex: 'source_amount', width: 165, align: 'right', render: (value) => value == null ? '—' : fullMoney(value) },
        { title: 'Trạng thái', dataIndex: 'status', width: 125, render: (value) => <Tag color={value === 'resolved' ? 'success' : value === 'reviewed' ? 'processing' : 'warning'}>{reconciliationStatusLabels[value] || value}</Tag> }, { title: 'Thời điểm ghi nhận', dataIndex: 'created_at', width: 180, render: (value) => value ? new Date(value).toLocaleString('vi-VN') : '—' },
      ]} />
    </Drawer>
    <Drawer width="min(1180px, 96vw)" open={drilldown.open} onClose={() => setDrilldown((current) => ({ ...current, open: false }))} title={`${drilldown.label || 'Chi tiết khách hàng'} · Kỳ ${periodLabel(periodKey)}`} extra={<Button icon={<DownloadOutlined />} onClick={exportMetric}>Xuất Excel</Button>}>
      <div className="c360-drill-toolbar"><Input.Search allowClear value={drillKeyword} onChange={(event) => setDrillKeyword(event.target.value)} onSearch={(value) => loadDrilldown(drilldown.metric, 1, value)} placeholder="Tìm mã hoặc tên khách hàng" /><Space direction="vertical" size={0} align="end"><Text type="secondary">{drilldown.total.toLocaleString('vi-VN')} khách hàng</Text>{Number(drilldown.totalValue || 0) !== 0 && <Text strong>Tổng giá trị: {fullMoney(drilldown.totalValue)}</Text>}</Space></div>
      <Table loading={drillLoading} size="small" sticky rowKey="ma_kh" dataSource={drilldown.items} onRow={(row) => ({ onClick: () => onOpenCustomer?.({ ...row, id: row.ma_kh, ma_kh: row.ma_kh, ten_kh: row.ten_kh }) })} rowClassName="demo-clickable-row" scroll={{ x: 1320, y: 'calc(100vh - 280px)' }} pagination={{ current: drilldown.page, pageSize: 20, total: drilldown.total, showSizeChanger: false, onChange: (nextPage) => loadDrilldown(drilldown.metric, nextPage) }} columns={[{ title: 'Khách hàng', fixed: 'left', width: 250, render: (_, row) => <div><Text strong>{row.ten_kh || 'Chưa có tên'}</Text><br /><Text copyable>{row.ma_kh}</Text></div> }, { title: 'Chi nhánh', dataIndex: 'branch_code', width: 100 }, { title: 'Cán bộ', dataIndex: 'officer_name', width: 180, render: (value, row) => value || row.officer_code || '—' }, { title: 'Tiền gửi CKH', dataIndex: 'deposit', align: 'right', width: 150, render: fullMoney }, { title: 'TGTT bình quân', dataIndex: 'casa', align: 'right', width: 150, render: fullMoney }, { title: 'Dư nợ', dataIndex: 'loan', align: 'right', width: 150, render: fullMoney }, { title: 'Thu phí', dataIndex: 'fee', align: 'right', width: 140, render: fullMoney }, { title: 'Dự phòng', dataIndex: 'provision', align: 'right', width: 140, render: fullMoney }, { title: 'SP', dataIndex: 'service_count', align: 'right', width: 70 }, { title: 'Dư nợ XLRR', dataIndex: 'written_off', align: 'right', width: 150, render: fullMoney }]} />
    </Drawer>
  </div>;
}

function RealInsightsPage({ context, onOpenCustomer }) {
  const { periodKey, branchCode, pgdCode, refreshKey, profileParams = {} } = context;
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('large_deposit');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!periodKey) return;
    setLoading(true);
    setError('');
    try {
      const params = profileParams;
      const [groupRes, profileRes] = await Promise.all([
        client.get('/customer-processing/profile-groups', { params }),
        client.get('/customer-processing/profiles', {
          params: {
            ...params,
            group_key: selectedGroup,
            page,
            page_size: PAGE_SIZE,
            include_total: true,
            sort_by: selectedGroup === 'large_loan' ? 'so_du_tien_vay' : 'so_du_tien_gui',
            sort_dir: 'desc',
          },
        }),
      ]);
      setGroups(groupRes.data?.groups || []);
      setRows(profileRes.data?.items || []);
      setTotal(Number(profileRes.data?.total || 0));
    } catch (requestError) {
      setError(requestError.response?.data?.detail || requestError.message || 'Không tải được dữ liệu phân nhóm');
    } finally {
      setLoading(false);
    }
  }, [branchCode, page, periodKey, pgdCode, profileParams, refreshKey, selectedGroup]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [branchCode, periodKey, pgdCode, selectedGroup]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  return (
    <div className="demo-page">
      <div className="demo-page-heading">
        <div><Text className="demo-eyebrow">PHÂN NHÓM TỪ DATABASE</Text><Title level={2}>Cảnh báo và nhóm khách hàng trọng điểm</Title><Text type="secondary">Các nhóm được backend tính trực tiếp theo kỳ và phạm vi dữ liệu đang chọn</Text></div>
        <Tag color="success">DỮ LIỆU THẬT</Tag>
      </div>
      <div className="c360-group-cards">
        {groups.map((group) => (
          <button type="button" className={selectedGroup === group.key ? 'is-active' : ''} key={group.key} onClick={() => setSelectedGroup(group.key)}>
            <span><BarChartOutlined /><Text strong>{group.label}</Text></span>
            <strong>{Number(group.count || 0).toLocaleString('vi-VN')}</strong>
            <small>{group.description}</small>
          </button>
        ))}
      </div>
      <Card className="demo-table-card demo-section">
        <Table
          loading={loading}
          rowKey="id"
          dataSource={rows}
          onRow={(row) => ({ onClick: () => onOpenCustomer(row) })}
          rowClassName="demo-clickable-row"
          pagination={{ current: page, pageSize: PAGE_SIZE, total, showSizeChanger: false, showTotal: (value) => `${value.toLocaleString('vi-VN')} khách hàng`, onChange: setPage }}
          scroll={{ x: 1050 }}
          columns={[
            { title: 'Khách hàng', dataIndex: 'ten_kh', width: 260, render: (value, row) => <div><Text strong>{value || 'Chưa có tên'}</Text><br /><Text type="secondary">{row.ma_kh} · {row.loai_khach_hang || 'Chưa phân loại'}</Text></div> },
            { title: 'Chi nhánh chính', dataIndex: 'primary_branch_code', width: 130, render: (value) => value || '—' },
            { title: 'Cán bộ', dataIndex: 'ten_can_bo', width: 180, render: (value, row) => value || row.ma_cb || '—' },
            { title: 'Tiền gửi CKH', dataIndex: 'so_du_tien_gui', align: 'right', width: 150, render: compactMoney },
            { title: 'TGTT bình quân', dataIndex: 'so_du_tgtt_binh_quan', align: 'right', width: 150, render: compactMoney },
            { title: 'Dư nợ', dataIndex: 'so_du_tien_vay', align: 'right', width: 150, render: compactMoney },
            { title: 'Số chi nhánh', dataIndex: 'branch_count', align: 'center', width: 110 },
          ]}
        />
      </Card>
    </div>
  );
}

export default function C360App({ currentUser, onLogout, embedded = false, initialPage = 'dashboard' }) {
  const globalScope = useAnalysisScope();
  const [page, setPage] = useState(initialPage);
  const [collapsed, setCollapsed] = useState(false);
  const periods = globalScope?.periods || [];
  const periodKey = globalScope?.applied?.periodKey || '';
  const branchCode = globalScope?.applied?.branchCode || null;
  const pgdCode = globalScope?.applied?.pgdCode || null;
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const refreshKey = globalScope?.sessionVersion || 0;
  const sharedProfileParams = useMemo(() => scopeToProfileParams(globalScope?.applied), [globalScope?.applied]);

  useEffect(() => {
    setPage(initialPage);
  }, [initialPage]);

  // Dữ liệu nghiệp vụ chỉ được tải sau khi người dùng áp dụng bộ lọc chung trên header.
  useEffect(() => {
    if (!periodKey) return;
    const params = new URLSearchParams(window.location.search);
    params.set('period', periodKey);
    if (branchCode) params.set('branch', branchCode); else params.delete('branch');
    if (pgdCode) params.set('pgd', pgdCode); else params.delete('pgd');
    const query = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [branchCode, periodKey, pgdCode]);

  const context = { periods, periodKey, branchCode, pgdCode, refreshKey, profileParams: sharedProfileParams };
  const content = page === 'customers'
    ? <RealCustomerList context={context} onOpenCustomer={setSelectedCustomer} />
    : page.startsWith('analysis-')
      ? <BusinessAnalysisPage context={context} mode={page} onOpenCustomer={setSelectedCustomer} />
    : page === 'insights'
      ? <RealInsightsPage context={context} onOpenCustomer={setSelectedCustomer} />
      : <RealDashboard context={context} onOpenCustomer={setSelectedCustomer} onGoCustomers={() => setPage('customers')} />;

  const workspace = (
    <>
      <div className={embedded ? 'c360-embedded-content' : 'demo-content'}>
        {!periodKey ? <Card className="c360-empty-scope"><Empty description="Chọn điều kiện trên bộ lọc chung và bấm Xem dữ liệu" /><Text type="secondary">Hệ thống chưa truy vấn dữ liệu nghiệp vụ để tránh tải thừa.</Text></Card> : content}
      </div>
      <CustomerModal customer={selectedCustomer} periodKey={periodKey} open={Boolean(selectedCustomer)} onClose={() => setSelectedCustomer(null)} />
    </>
  );

  if (embedded) return workspace;

  return (
    <Layout className="demo-shell c360-real-shell">
      <Sider width={270} collapsedWidth={76} collapsed={collapsed} trigger={null} className="demo-sidebar">
        <div className="demo-logo"><img src={logoUrl} alt="C360" />{!collapsed && <div><strong>C360</strong><small>Dữ liệu thật</small></div>}</div>
        <Menu theme="dark" mode="inline" selectedKeys={[page]} items={[
          { key: 'dashboard', icon: <DashboardOutlined />, label: 'Tổng quan điều hành' },
          { key: 'insights', icon: <BarChartOutlined />, label: 'Cảnh báo & phân nhóm' },
          { key: 'customers', icon: <TeamOutlined />, label: 'Khách hàng C360' },
        ]} onClick={({ key }) => setPage(key)} />
        {!collapsed && <div className="demo-sidebar-note"><Tag color="success">LIVE</Tag><span>Kết nối API/database<br />Không sử dụng dữ liệu giả</span></div>}
      </Sider>
      <Layout className="demo-main" style={{ marginLeft: collapsed ? 76 : 270 }}>
        <Header className="demo-header c360-real-header">
          <Space>
            <Button type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed((value) => !value)} />
            <div><Text strong>Profile khách hàng C360</Text><Text type="secondary" className="demo-header-subtitle">Giao diện mới · dữ liệu thật</Text></div>
          </Space>
          <Space>
            <Button icon={<SwapOutlined />} onClick={() => { window.location.href = '/'; }}>Giao diện cũ</Button>
            <Tooltip title={currentUser?.full_name}><Avatar icon={<UserOutlined />} /></Tooltip>
            <Button type="text" icon={<LogoutOutlined />} onClick={onLogout} />
          </Space>
        </Header>
        <Content>{workspace}</Content>
      </Layout>
    </Layout>
  );
}
