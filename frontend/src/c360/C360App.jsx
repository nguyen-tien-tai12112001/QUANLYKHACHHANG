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
import { resolveBranchScope, toApiBranchParams } from '../auth';
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
  { key: 'doanh_so_chuyen_tien_ve_tk', label: 'Doanh số chuyển tiền đến', source: 'GL02/DP01', money: true },
  { key: 'so_du_tien_gui', label: 'Tiền gửi có kỳ hạn cuối kỳ', source: 'PF14', money: true },
  { key: 'so_du_tgckh_binh_quan', label: 'Tiền gửi có kỳ hạn bình quân', source: 'PF14', money: true },
  { key: 'ftp_nguon_von', label: 'Lợi ích FTP nguồn vốn', source: 'Nguồn FTP', money: true },
  { key: 'ngay_update', label: 'Giao dịch TKTT gần nhất', source: 'Giao dịch', date: true },
];

const internationalFields = [
  { key: 'ds_ttqt', label: 'Doanh số thanh toán quốc tế', source: 'KDNH', money: true },
  { key: 'ds_lc', label: 'Doanh số thanh toán LC', source: 'KDNH', money: true },
  { key: 'chi_tra_kieu_hoi', label: 'Chi trả kiều hối', source: 'KDNH', boolean: true },
  { key: 'thanh_toan_quoc_te', label: 'LC / TTQT / mua bán ngoại tệ', source: 'KDNH', boolean: true },
];

const feeFields = [
  { key: 'abic_batd', label: 'Phí Bảo an tín dụng', source: 'KH02', money: true },
  { key: 'phi_bao_lanh', label: 'Phí bảo lãnh', source: 'KH02', money: true },
  { key: 'phi_chuyen_tien', label: 'Phí chuyển tiền', source: 'KH02', money: true },
  { key: 'phi_kdnt', label: 'Phí/lãi mua bán ngoại tệ', source: 'KDNH', money: true },
  { key: 'phi_ttqt', label: 'Phí thanh toán quốc tế', source: 'KDNH', money: true },
  { key: 'phi_lc', label: 'Phí LC', source: 'KDNH', money: true },
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
      ['tt_tien_dien', 'Thu hộ tiền điện'],
      ['tt_tien_nuoc', 'Thu hộ tiền nước'],
      ['tt_cuoc_vien_thong', 'Thu hộ cước viễn thông'],
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
      ['batk', 'Bảo an tài khoản'],
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
          <div key={field.key} className={`c360-domain-metric ${available ? 'has-data' : 'is-pending'}`}>
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
  }
  if (!events.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa ghi nhận thay đổi sản phẩm giữa các kỳ" />;
  return (
    <div className="c360-event-timeline">
      {events.slice().reverse().map((event, index) => (
        <div key={`${event.period}-${event.label}-${index}`} className={`is-${event.type}`}>
          <span>{event.type === 'added' ? '+' : '−'}</span>
          <div><Text strong>{event.label}</Text><small>{event.type === 'added' ? 'Thêm mới/ghi nhận sử dụng' : 'Ngừng sử dụng hoặc không còn ghi nhận'} · Kỳ {periodLabel(event.period)}</small></div>
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

function Change({ current, previous }) {
  const value = changePercent(current, previous);
  return <Tag color={value >= 0 ? 'success' : 'error'}>{value >= 0 ? '+' : ''}{value.toFixed(1)}% so kỳ trước</Tag>;
}

function RealMetric({ title, value, icon, tone, current, previous, note, onClick }) {
  return (
    <Card className={`c360-real-metric is-${tone}`} onClick={onClick}>
      <span>{icon}</span>
      <Text type="secondary">{title}</Text>
      <strong>{value}</strong>
      <Change current={current} previous={previous} />
      <small>{note}</small>
    </Card>
  );
}

function CustomerModal({ customer, periodKey, open, onClose }) {
  const modalAnchorRef = useRef(null);
  const [history, setHistory] = useState([]);
  const [loanData, setLoanData] = useState({ categories: [], branches: [], items: [], total: 0 });
  const [depositData, setDepositData] = useState({ categories: [], branches: [], items: [], total: 0 });
  const [classificationData, setClassificationData] = useState({ branches: [], items: [] });
  const [financialMetrics, setFinancialMetrics] = useState({ totals: {}, branches: [] });
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
    client.get('/customer-processing/profile-history', { params: { ma_kh: customer.ma_kh, branch_code: profileBranch || undefined } })
      .then(({ data }) => { if (active) setHistory(Array.isArray(data) ? data : []); })
      .catch(() => { if (active) setHistory([]); })
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
  const activeProducts = trackedProducts.filter(([key]) => hasData(viewedCustomer[key]) && Number(viewedCustomer[key]) > 0);
  const totalDeposit = Number(viewedCustomer.so_du_tien_gui || 0) + Number(viewedCustomer.so_du_tgtt_binh_quan || 0);
  const totalLoan = Number(viewedCustomer.du_no_ngan_han || 0)
    + Number(viewedCustomer.du_no_trung_dai_han || 0)
    + Number(viewedCustomer.du_no_thau_chi || 0)
    || Number(viewedCustomer.so_du_tien_vay || 0);
  const periodRevenue = Number(viewedCustomer.pf10_interest || 0)
    + feeFields.reduce((sum, field) => sum + Number(metricCustomer[field.key] || 0), 0);
  const classificationPrevious = {};
  const classificationRows = [...(classificationData.items || [])]
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
            { key: 'code', label: 'Mã khách hàng', children: customer.ma_kh },
            { key: 'type', label: 'Loại khách hàng', children: customer.loai_khach_hang || 'Chưa có dữ liệu' },
            { key: 'branches', label: 'Các chi nhánh', children: viewedCustomer.branch_codes || 'Chưa có dữ liệu' },
            { key: 'pgds', label: 'Các phòng/PGD', children: profileBranch
              ? (selectedBranchDetail?.ten_pgd || 'Chưa xác định phòng/PGD')
              : (customer.pgd_names || customer.primary_pgd_name || 'Chưa có dữ liệu') },
            { key: 'loanType', label: 'Loại vay', children: loanTypeLabel(viewedCustomer.loai_vay) },
            { key: 'phone', label: 'Điện thoại', children: customer.telephone || 'Chưa có dữ liệu' },
            { key: 'officer', label: 'Cán bộ quản lý', span: 2, children: officerSummary || customer.ten_can_bo || customer.ma_cb || 'Chưa có dữ liệu' },
            { key: 'period', label: 'Kỳ đang xem', children: periodLabel(periodKey) },
          ]} />,
        },
        {
          key: 'deposit',
          label: 'Tiền gửi',
          children: (
            <div className="c360-credit-pane">
              <div className="c360-insight-strip">
                <div><Text>Đang hoạt động</Text><strong>{depositData.analytics?.active || 0}</strong><small>tài khoản</small></div>
                <div><Text>Mới / tất toán</Text><strong>{depositData.analytics?.new || 0} / {depositData.analytics?.closed || 0}</strong><small>trong kỳ</small></div>
                <div><Text>Biến động số dư</Text><strong className={Number(depositData.analytics?.balance_change || 0) >= 0 ? 'is-up' : 'is-down'}>{compactMoney(depositData.analytics?.balance_change)}</strong><small>{depositData.analytics?.volatility_rate == null ? 'Chưa có kỳ so sánh' : `${depositData.analytics.volatility_rate}% so với kỳ trước`}</small></div>
                <div><Text>Mức sử dụng số dư</Text><strong>{depositData.analytics?.balance_usage_rate == null ? '—' : `${depositData.analytics.balance_usage_rate}%`}</strong><small>Bình quân / mức số dư cao hơn</small></div>
                <div><Text>Tỷ lệ duy trì</Text><strong>{depositData.analytics?.retention_rate == null ? '—' : `${depositData.analytics.retention_rate}%`}</strong><small>Bình quân / cuối kỳ</small></div>
                <div><Text>Dấu hiệu cần xem</Text><strong>{Number(depositData.analytics?.low_average_high_end_count || 0) + Number(depositData.analytics?.high_average_end_drop_count || 0)}</strong><small>tài khoản biến động mạnh</small></div>
              </div>
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
                dataSource={depositData.items || []}
                columns={[
                  { title: 'Chi nhánh', dataIndex: 'branch_code', width: 95, fixed: 'left' },
                  { title: 'Số tài khoản (PF14)', dataIndex: 'account_number', width: 190, fixed: 'left', render: (value, row) => <div><Text strong>{value || '—'}</Text><br /><Text type="secondary">Nguồn {row.account_source || 'PF14'} · ACCOUNTNO</Text></div> },
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
                  <div><Text>Dư nợ XLRR</Text><strong>{loanData.risk?.available ? compactMoney(loanData.risk.handled_risk_amount) : '—'}</strong></div>
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
                dataSource={loanData.items || []}
                columns={[
                  { title: 'Chi nhánh', dataIndex: 'branch_code', width: 95, fixed: 'left' },
                  { title: 'Số LDS', dataIndex: 'account_number', width: 180, fixed: 'left', render: (value) => <Text strong>{value || '—'}</Text> },
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
          label: 'Lịch sử các kỳ',
          children: loading ? <Skeleton active /> : (
            <div className="c360-history-pane">
              <section>
                <div className="c360-pane-heading"><div><Text strong>Lịch sử tài chính</Text><small>Tối đa 12 kỳ gần nhất · {profileBranch ? `Chi nhánh ${profileBranch}` : 'Toàn khách hàng'}</small></div></div>
                <FinancialHistoryChart history={history} />
              </section>
              <section>
                <div className="c360-pane-heading"><div><Text strong>Thay đổi sản phẩm và khoản vay</Text><small>So sánh tự động giữa hai kỳ liên tiếp</small></div></div>
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
      </div>
    </Modal>
  );
}

function RealDashboard({ context, onOpenCustomer, onGoCustomers }) {
  const { periodKey, branchCode, pgdCode, refreshKey } = context;
  const [data, setData] = useState(null);
  const [insights, setInsights] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [topCustomers, setTopCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!periodKey) return;
    setLoading(true);
    setError('');
    const scopeParams = { period_key: periodKey, ...toApiBranchParams(branchCode, pgdCode) };
    const previousPeriod = context.periods[context.periods.findIndex((item) => item.period_key === periodKey) + 1]?.period_key;
    try {
      const [summaryRes, profilesRes, insightsRes, comparisonRes] = await Promise.all([
        client.get('/dashboard/summary', { params: scopeParams }),
        client.get('/customer-processing/profiles', { params: { period_key: periodKey, branch_code: branchCode || undefined, pgd_code: pgdCode || undefined, sort_by: 'so_du_tien_gui', sort_dir: 'desc', limit: 8 } }),
        client.get('/dashboard/insights', { params: scopeParams }),
        previousPeriod
          ? client.get('/customer-processing/period-comparison', { params: { current_period: periodKey, previous_period: previousPeriod, branch_code: branchCode || undefined, pgd_code: pgdCode || undefined } })
          : Promise.resolve({ data: null }),
      ]);
      setData(summaryRes.data);
      setInsights(insightsRes.data);
      setTopCustomers(Array.isArray(profilesRes.data) ? profilesRes.data : profilesRes.data?.items || []);
      setComparison(comparisonRes.data);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || requestError.message || 'Không thể kết nối API');
    } finally {
      setLoading(false);
    }
  }, [branchCode, context.periods, periodKey, pgdCode, refreshKey]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Skeleton active paragraph={{ rows: 14 }} />;
  if (error) return <ErrorState error={error} onRetry={load} />;
  const kpis = data?.kpis || {};
  const compare = comparison?.summary || {};
  const services = data?.service_penetration || [];
  const officers = data?.officer_leaderboard || [];
  const customerOverview = insights?.customer_overview || {};
  const deposit = insights?.deposit || {};
  const credit = insights?.credit || {};
  const abnormal = insights?.abnormal || {};
  const depositChangeRate = changePercent(deposit.total, deposit.previous_total);
  const creditChangeRate = changePercent(credit.total, credit.previous_total);

  const openInsightCustomer = async (row) => {
    try {
      const { data: profileData } = await client.get('/customer-processing/profiles', {
        params: {
          period_key: periodKey,
          branch_code: branchCode || undefined,
          pgd_code: pgdCode || undefined,
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

  const insightMetric = (label, value, note, tone = '') => (
    <div className={`c360-dashboard-stat ${tone}`}>
      <Text type="secondary">{label}</Text>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
  return (
    <div className="demo-page c360-customer-page">
      <div className="demo-page-heading">
        <div><Text className="demo-eyebrow">DASHBOARD DỮ LIỆU THẬT</Text><Title level={2}>Tổng quan điều hành C360</Title><Text type="secondary">Kỳ {periodLabel(periodKey)} · Dữ liệu tổng hợp trực tiếp từ API/database</Text></div>
        <Tag color="success">LIVE DATABASE</Tag>
      </div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}><RealMetric title="Tổng khách hàng" value={Number(kpis.total_customers || 0).toLocaleString('vi-VN')} current={compare.customers?.current ?? kpis.total_customers} previous={compare.customers?.previous} icon={<TeamOutlined />} tone="blue" note={`${comparison?.new_customers || 0} mới · ${comparison?.lost_customers || 0} rời kỳ`} onClick={onGoCustomers} /></Col>
        <Col xs={24} sm={12} xl={6}><RealMetric title="Tiền gửi CKH" value={compactMoney(kpis.total_deposit)} current={compare.deposit?.current ?? kpis.total_deposit} previous={compare.deposit?.previous} icon={<WalletOutlined />} tone="green" note="Tổng số dư cuối kỳ" /></Col>
        <Col xs={24} sm={12} xl={6}><RealMetric title="Tổng dư nợ" value={compactMoney(kpis.total_loan)} current={compare.loan?.current ?? kpis.total_loan} previous={compare.loan?.previous} icon={<BankOutlined />} tone="red" note="Tổng dư nợ khách hàng" /></Col>
        <Col xs={24} sm={12} xl={6}><RealMetric title="TGTT bình quân" value={compactMoney(kpis.total_casa)} current={compare.casa?.current ?? kpis.total_casa} previous={compare.casa?.previous} icon={<BarChartOutlined />} tone="gold" note={`${kpis.no_service_count || 0} KH chưa dùng dịch vụ`} /></Col>
      </Row>
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
              {insightMetric('Tài khoản mới', Number(deposit.new_accounts || 0).toLocaleString('vi-VN'), 'Theo dữ liệu PF14', 'is-blue')}
              {insightMetric('Tài khoản không còn', Number(deposit.closed_accounts || 0).toLocaleString('vi-VN'), 'So với kỳ PF14 trước', 'is-gold')}
              {insightMetric('KH giảm tiền gửi mạnh', Number(deposit.large_drop_customers || 0).toLocaleString('vi-VN'), 'Giảm từ 30% trở lên', 'is-red')}
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="Tín dụng và nghĩa vụ sắp tới" className="demo-panel c360-dashboard-domain">
            <div className="c360-dashboard-stat-grid">
              {insightMetric('Tổng dư nợ', compactMoney(credit.total), `${creditChangeRate >= 0 ? '+' : ''}${creditChangeRate.toFixed(1)}% so kỳ trước`, creditChangeRate <= 0 ? 'is-green' : 'is-red')}
              {insightMetric('Gốc phải trả tháng tới', credit.obligation_source_available ? compactMoney(credit.principal_due_next_month) : '—', 'Ngày trả nợ kế tiếp từ LN01', 'is-blue')}
              {insightMetric('Lãi phải trả tháng tới', credit.obligation_source_available ? compactMoney(credit.interest_due_next_month) : '—', 'Lịch trả lãi từ LN01', 'is-gold')}
              {insightMetric('Lãi quá hạn', credit.obligation_source_available ? compactMoney(credit.overdue_interest) : '—', `${Number(credit.overdue_customers || 0).toLocaleString('vi-VN')} khách hàng`, 'is-red')}
            </div>
            {!credit.obligation_source_available ? (
              <Alert className="c360-dashboard-source-note" type="info" showIcon message="Kỳ LN01 hiện tại chưa có các cột lịch trả nợ mới; cần import lại LN01 để tính nghĩa vụ." />
            ) : null}
          </Card>
        </Col>
      </Row>
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
          dataSource={abnormal.items || []}
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
      <Card title="Top cán bộ quản lý" className="demo-panel demo-section">
        <div className="c360-officer-grid">
          {officers.slice(0, 8).map((item, index) => <div key={`${item.code || item.ma_cb || item.officer_code}-${index}`}><Avatar icon={<UserOutlined />} /><span><Text strong>{item.name || item.ten_can_bo || item.officer_name || item.code || item.ma_cb || 'Chưa xác định'}</Text><Text type="secondary">{Number(item.custCount ?? item.customer_count ?? item.count ?? 0).toLocaleString('vi-VN')} khách hàng</Text></span><strong>{compactMoney(item.totalLoan ?? item.total_loan ?? item.loan ?? 0)}</strong></div>)}
        </div>
      </Card>
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
  const { periodKey, branchCode, pgdCode, refreshKey } = context;
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
      setRows(profilesRes.data.items || []);
      setTotal(Number(profilesRes.data.total || 0));
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

function RealInsightsPage({ context, onOpenCustomer }) {
  const { periodKey, branchCode, pgdCode, refreshKey } = context;
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
      const params = { period_key: periodKey, branch_code: branchCode || undefined, pgd_code: pgdCode || undefined };
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
  }, [branchCode, page, periodKey, pgdCode, refreshKey, selectedGroup]);

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
  const [page, setPage] = useState(initialPage);
  const [collapsed, setCollapsed] = useState(false);
  const [periods, setPeriods] = useState([]);
  const [periodKey, setPeriodKey] = useState('');
  const initialScope = useMemo(() => resolveBranchScope(currentUser, null, null), [currentUser]);
  const [branchCode, setBranchCode] = useState(initialScope.filterCn || null);
  const [pgdCode, setPgdCode] = useState(initialScope.filterPgd || null);
  const [filterOptions, setFilterOptions] = useState({ branches: [], pgd_options: [] });
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [bootError, setBootError] = useState('');
  const [bootLoading, setBootLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setPage(initialPage);
  }, [initialPage]);

  const loadBootstrap = useCallback(async () => {
    setBootLoading(true);
    setBootError('');
    try {
      await client.get('/health');
      const { data } = await client.get('/customer-processing/periods');
      const available = (Array.isArray(data) ? data : []).filter((item) => Number(item.profile_count || 0) > 0);
      setPeriods(available);
      const nextPeriod = periodKey || available[0]?.period_key || '';
      setPeriodKey(nextPeriod);
      if (nextPeriod) {
        const { data: options } = await client.get('/customer-processing/profile-filter-options', { params: { period_key: nextPeriod, branch_code: branchCode || undefined } });
        setFilterOptions(options || { branches: [], pgd_options: [] });
      }
    } catch (error) {
      setBootError(error.response?.data?.detail || error.message || 'Không thể kết nối backend/database');
    } finally {
      setBootLoading(false);
    }
  }, [branchCode, periodKey]);

  useEffect(() => { loadBootstrap(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!periodKey) return;
    client.get('/customer-processing/profile-filter-options', { params: { period_key: periodKey, branch_code: branchCode || undefined } })
      .then(({ data }) => setFilterOptions(data || { branches: [], pgd_options: [] }))
      .catch(() => {});
  }, [branchCode, periodKey]);

  const allowedBranches = new Set(initialScope.allowedBranches || []);
  const branchOptions = (filterOptions.branches || []).filter((value) => initialScope.canViewProvince || !allowedBranches.size || allowedBranches.has(value));
  const context = { periods, periodKey, branchCode, pgdCode, refreshKey };
  const content = page === 'customers'
    ? <RealCustomerList context={context} onOpenCustomer={setSelectedCustomer} />
    : page === 'insights'
      ? <RealInsightsPage context={context} onOpenCustomer={setSelectedCustomer} />
      : <RealDashboard context={context} onOpenCustomer={setSelectedCustomer} onGoCustomers={() => setPage('customers')} />;

  function changeBranch(value) {
    const requested = value === 'all' ? null : value;
    const resolved = resolveBranchScope(currentUser, requested, null);
    if (resolved.denied) return message.warning('Bạn không có quyền xem chi nhánh này');
    setBranchCode(resolved.filterCn);
    setPgdCode(resolved.filterPgd);
  }

  const workspace = (
    <>
      <div className="c360-global-filter demo-no-print">
        <Select loading={bootLoading} value={periodKey || undefined} placeholder="Chọn kỳ" onChange={setPeriodKey} options={periods.map((item) => ({ value: item.period_key, label: `Kỳ ${periodLabel(item.period_key)}` }))} />
        <Select value={branchCode || 'all'} onChange={changeBranch} disabled={!initialScope.canChangeBranch && !initialScope.canViewProvince} options={[...(initialScope.canViewProvince ? [{ value: 'all', label: 'Toàn tỉnh' }] : []), ...branchOptions.map((value) => ({ value, label: `Chi nhánh ${value}` }))]} />
        <Select allowClear value={pgdCode || undefined} placeholder="Tất cả PGD" onChange={(value) => setPgdCode(value || null)} disabled={!initialScope.canChangePgd && !initialScope.canViewProvince} options={(filterOptions.pgd_options || []).map((item) => ({ value: typeof item === 'string' ? item : item.value, label: typeof item === 'string' ? item : item.label }))} />
        <Button icon={<ReloadOutlined />} onClick={() => setRefreshKey((value) => value + 1)}>Làm mới</Button>
        <span><CheckCircleFilled /> API dữ liệu thật</span>
      </div>
      <div className={embedded ? 'c360-embedded-content' : 'demo-content'}>
        {bootError ? <ErrorState error={bootError} onRetry={loadBootstrap} /> : bootLoading || !periodKey ? <Skeleton active paragraph={{ rows: 12 }} /> : content}
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
