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
  Checkbox,
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
  Segmented,
  Select,
  Skeleton,
  Space,
  Spin,
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
const hasPermission = (user, permission) => Boolean(
  user && ((user.permissions || []).includes('admin') || (user.permissions || []).includes(permission)),
);

const compactMoney = (value) => {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1_000_000_000_000) return `${(number / 1_000_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} nghìn tỷ`;
  if (Math.abs(number) >= 1_000_000_000) return `${(number / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu`;
  return `${number.toLocaleString('vi-VN')} đ`;
};
const fullMoney = (value) => `${Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} đ`;
const scopeChips = (params = {}) => [
  params.period_key ? `Kỳ ${periodLabel(params.period_key)}` : null,
  params.branch_code ? `CN ${params.branch_code}` : 'Toàn hệ thống',
  params.pgd_code ? `Phòng ${params.pgd_code}` : null,
  params.keyword ? `Tìm: “${params.keyword}”` : null,
  params.customer_type ? `Loại KH: ${params.customer_type}` : null,
  params.loan_type ? `Loại vay: ${params.loan_type}` : null,
  params.officer_code ? `Cán bộ: ${params.officer_code}` : null,
  params.service_codes ? `SP: ${params.service_codes.split(',').length} đã chọn` : null,
].filter(Boolean);
function AppliedScopeBanner({ params, total }) {
  return <div className="c360-applied-scope"><span><FilterOutlined /><strong>Phạm vi đang áp dụng</strong></span><div>{scopeChips(params).map((item) => <Tag key={item}>{item}</Tag>)}{total != null ? <Tag color="blue">{Number(total).toLocaleString('vi-VN')} KH</Tag> : null}</div></div>;
}
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
const primaryBranchLabel = (row = {}) => row.primary_branch_code
  || row.managing_branch_code
  || String(row.branch_codes || '').replaceAll(';', ',').split(',').map((item) => item.trim()).find(Boolean)
  || 'Chưa xác định';
const customerTypeLabel = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return 'Chưa phân loại';
  if (/^\d+$/.test(raw)) return `Chưa cấu hình (${raw})`;
  return raw.replace(/c\?\s*vốn ĐT nước ngoài/gi, 'có vốn ĐT nước ngoài');
};
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
  reopened: ['Xuất hiện lại', 'cyan'],
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
  { key: 'phi_ttqt', label: 'Phí thanh toán quốc tế', source: 'KH02 · 711003–711014, 711096', money: true },
  { key: 'phi_lc', label: 'Phí LC', source: 'KH02 · 709002', money: true },
  { key: 'phi_nhdt', label: 'Phí ngân hàng điện tử', source: 'KH02', money: true },
  { key: 'phi_the', label: 'Phí dịch vụ thẻ', source: 'KH02 · 12 đầu mã thẻ', money: true },
  { key: 'phi_pos', label: 'Phí đơn vị chấp nhận thẻ', source: 'Nguồn thẻ', money: true },
  { key: 'phi_khac', label: 'Phí dịch vụ khác', source: 'KH02 · 5 đầu mã còn lại', money: true },
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

function DomainMetricGrid({ customer, fields, emptyNote, moneyFormatter = compactMoney }) {
  return (
    <div className="c360-domain-grid">
      {fields.map((field) => {
        const value = customer[field.key];
        const available = hasData(value);
        let rendered = value;
        if (field.money && available) rendered = moneyFormatter(value);
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

function CustomerPeriodComparison({ current, baseline, currentPeriod, baselinePeriod, moneyFormatter }) {
  if (!baseline) return null;
  const productItems = productGroups.flatMap((group) => group.items);
  const productCount = (row) => productItems.filter(([key]) => Number(row?.[key] || 0) > 0).length;
  const totalLoan = (row) => Number(row?.du_no_ngan_han || 0)
    + Number(row?.du_no_trung_dai_han || 0)
    + Number(row?.du_no_thau_chi || 0)
    || Number(row?.so_du_tien_vay || 0);
  const metrics = [
    { key: 'deposit', label: 'Tổng tiền gửi', current: Number(current?.so_du_tien_gui || 0) + Number(current?.so_du_tgtt_binh_quan || 0), previous: Number(baseline?.so_du_tien_gui || 0) + Number(baseline?.so_du_tgtt_binh_quan || 0), money: true },
    { key: 'casa', label: 'TGTT bình quân', current: Number(current?.so_du_tgtt_binh_quan || 0), previous: Number(baseline?.so_du_tgtt_binh_quan || 0), money: true },
    { key: 'loan', label: 'Tổng tiền vay', current: totalLoan(current), previous: totalLoan(baseline), money: true },
    { key: 'interest', label: 'Lãi tiền vay', current: Number(current?.pf10_interest || 0), previous: Number(baseline?.pf10_interest || 0), money: true },
    { key: 'lds', label: 'Số LDS', current: Number(current?.pf10_lds_count || 0), previous: Number(baseline?.pf10_lds_count || 0) },
    { key: 'products', label: 'Sản phẩm sử dụng', current: productCount(current), previous: productCount(baseline) },
  ];
  return (
    <section className="c360-period-comparison">
      <div className="c360-period-comparison-head">
        <div><SwapOutlined /><span><Text strong>So sánh hai kỳ</Text><small>Kỳ {periodLabel(currentPeriod)} đối chiếu với kỳ {periodLabel(baselinePeriod)}</small></span></div>
        <Tag color="blue">Cùng phạm vi quan hệ đang chọn</Tag>
      </div>
      <div className="c360-period-comparison-grid">
        {metrics.map((item) => {
          const delta = item.current - item.previous;
          const percentage = item.previous ? delta * 100 / Math.abs(item.previous) : null;
          return <div key={item.key} className={delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : 'is-flat'}>
            <Text>{item.label}</Text>
            <strong>{item.money ? moneyFormatter(item.current) : item.current.toLocaleString('vi-VN')}</strong>
            <small>Kỳ đối chiếu: {item.money ? moneyFormatter(item.previous) : item.previous.toLocaleString('vi-VN')}</small>
            <span>{delta > 0 ? '▲' : delta < 0 ? '▼' : '•'} {item.money ? moneyFormatter(Math.abs(delta)) : Math.abs(delta).toLocaleString('vi-VN')}{percentage == null ? '' : ` · ${Math.abs(percentage).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`}</span>
          </div>;
        })}
      </div>
    </section>
  );
}

function LoanMaturityTimeline({ items = [], periodKey, moneyFormatter, onSelect }) {
  const periodEnd = (() => {
    const text = String(periodKey || '');
    if (text.length < 6) return new Date();
    return new Date(Number(text.slice(0, 4)), Number(text.slice(4, 6)), 0);
  })();
  const candidates = items
    .filter((item) => item.opening_date || item.maturity_date)
    .sort((left, right) => Number(right.end_of_month_balance || 0) - Number(left.end_of_month_balance || 0))
    .slice(0, 12)
    .map((item) => ({
      ...item,
      start: item.opening_date ? new Date(`${item.opening_date}T00:00:00`) : periodEnd,
      end: item.maturity_date ? new Date(`${item.maturity_date}T00:00:00`) : periodEnd,
    }));
  if (!candidates.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có ngày giải ngân/đáo hạn để dựng timeline LDS" />;
  const minimum = new Date(Math.min(...candidates.map((item) => item.start.getTime()), periodEnd.getTime()));
  const maximum = new Date(Math.max(...candidates.map((item) => item.end.getTime()), periodEnd.getTime()));
  const span = Math.max(24 * 60 * 60 * 1000, maximum.getTime() - minimum.getTime());
  const position = (value) => Math.max(0, Math.min(100, ((value.getTime() - minimum.getTime()) / span) * 100));
  const markerPosition = position(periodEnd);
  return (
    <section className="c360-loan-timeline">
      <div className="c360-pane-heading">
        <div><Text strong>Dòng thời gian LDS</Text><small>Tối đa 12 khoản có dư nợ lớn nhất trong loại vay đang chọn</small></div>
        <Space><Tag color="blue">Mốc kỳ {periodLabel(periodKey)}</Tag><Tag>{candidates.length} LDS</Tag></Space>
      </div>
      <div className="c360-loan-timeline-axis"><span>{minimum.toLocaleDateString('vi-VN')}</span><i style={{ left: `${markerPosition}%` }}><b>Kỳ báo cáo</b></i><span>{maximum.toLocaleDateString('vi-VN')}</span></div>
      <div className="c360-loan-timeline-list">
        {candidates.map((item) => {
          const start = Math.min(position(item.start), 98.5);
          const end = Math.max(start + 1.5, Math.min(100, position(item.end)));
          const width = Math.min(100 - start, Math.max(1.5, end - start));
          const status = loanStatusLabels[item.loan_status] || [item.loan_status || 'Chưa xác định', 'default'];
          return <Tooltip key={item.id} title={`${item.lds_number || item.account_number || 'Khoản vay'} · ${dateLabel(item.opening_date)} → ${dateLabel(item.maturity_date)} · ${moneyFormatter(item.end_of_month_balance)} · Bấm để xem chi tiết`}>
            <button type="button" className={`c360-loan-timeline-row is-${item.loan_status || 'unknown'}`} onClick={() => onSelect?.(item)}>
              <div><Text strong>{item.lds_number || item.account_number || 'Chưa xác định LDS'}</Text><small>{item.branch_code} · {item.loan_type_label || item.loan_type}</small></div>
              <div className="c360-loan-timeline-track"><i className="c360-loan-period-marker" style={{ left: `${markerPosition}%` }} /><span style={{ left: `${start}%`, width: `${width}%` }}><b /></span></div>
              <div><strong>{moneyFormatter(item.end_of_month_balance)}</strong><Tag color={status[1]}>{status[0]}</Tag></div>
            </button>
          </Tooltip>;
        })}
      </div>
    </section>
  );
}

function DepositAccountLifecycle({ data, moneyFormatter }) {
  const rows = data?.history || [];
  if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có lịch sử tài khoản" />;
  const maximum = Math.max(1, ...rows.map((row) => Math.abs(Number(row.end_balance || 0))));
  const latest = rows[rows.length - 1];
  return <div className="c360-account-lifecycle">
    <div className="c360-account-life-summary">
      <div><small>Kỳ đầu xuất hiện</small><strong>{periodLabel(data.first_seen_period)}</strong></div>
      <div><small>Kỳ gần nhất có dữ liệu</small><strong>{periodLabel(data.last_seen_period)}</strong></div>
      <div><small>Số kỳ ghi nhận</small><strong>{Number(data.period_count || 0).toLocaleString('vi-VN')}</strong></div>
      <div><small>Trạng thái gần nhất</small><Tag color={(depositStatusLabels[data.latest_status] || [data.latest_status, 'default'])[1]}>{(depositStatusLabels[data.latest_status] || [data.latest_status || '—'])[0]}</Tag></div>
      <div><small>Số dư gần nhất</small><strong>{moneyFormatter(latest.end_balance)}</strong></div>
    </div>
    {!data.is_present_in_selected_period ? <Alert showIcon type="warning" message={`Tài khoản không xuất hiện trong DP01 kỳ ${periodLabel(data.period_key)}`} description={`Kỳ gần nhất còn có dữ liệu là ${periodLabel(data.last_seen_period)}. Hệ thống không tự kết luận tất toán nếu nguồn chưa có trạng thái đóng.`} /> : null}
    {data.latest_gl02 ? <Alert showIcon type="info" message={`Giao dịch TKTT gần nhất của KH tại CN ${data.branch_code}: ${dateTimeLabel(data.latest_gl02.transaction_at)}`} description={<div><div>{data.latest_gl02.description || data.latest_gl02.remark || 'Chưa có diễn giải'}</div><div>Ghi Nợ {moneyFormatter(data.latest_gl02.debit_amount)} · Ghi Có {moneyFormatter(data.latest_gl02.credit_amount)}</div><small>{data.latest_gl02.scope_note}</small></div>} /> : null}
    <section className="c360-account-life-chart">
      <div className="c360-pane-heading"><div><Text strong>Diễn biến số dư từng kỳ</Text><small>Độ dài thanh biểu diễn số dư cuối kỳ; số chính xác hiển thị bên phải</small></div></div>
      {rows.map((row) => {
        const status = depositStatusLabels[row.status] || [row.status || '—', 'default'];
        return <div key={row.period_key} className={`is-${row.status || 'active'}`}>
          <span><strong>{periodLabel(row.period_key)}</strong><Tag color={status[1]}>{status[0]}</Tag></span>
          <i><b style={{ width: `${Math.max(Number(row.end_balance || 0) ? 2 : 0, Math.abs(Number(row.end_balance || 0)) * 100 / maximum)}%` }} /></i>
          <span><strong>{moneyFormatter(row.end_balance)}</strong><small>{row.balance_change == null ? 'Kỳ đầu' : `${Number(row.balance_change || 0) >= 0 ? '+' : ''}${moneyFormatter(row.balance_change)}`}</small></span>
        </div>;
      })}
    </section>
    <Table size="small" sticky rowKey="period_key" pagination={false} scroll={{ x: 1350, y: 330 }} dataSource={[...rows].reverse()} columns={[
      { title: 'Kỳ', dataIndex: 'period_key', fixed: 'left', width: 95, render: periodLabel },
      { title: 'Trạng thái', dataIndex: 'status', width: 135, render: (value) => { const status = depositStatusLabels[value] || [value || '—', 'default']; return <Tag color={status[1]}>{status[0]}</Tag>; } },
      { title: 'Số dư cuối kỳ', dataIndex: 'end_balance', width: 175, align: 'right', render: moneyFormatter },
      { title: 'Số dư bình quân', dataIndex: 'average_balance', width: 175, align: 'right', render: (value) => value == null ? <Text type="secondary">PF14 chưa ghép được</Text> : moneyFormatter(value) },
      { title: 'Biến động', dataIndex: 'balance_change', width: 165, align: 'right', render: (value) => value == null ? '—' : <Text strong className={Number(value || 0) >= 0 ? 'is-up' : 'is-down'}>{Number(value || 0) >= 0 ? '+' : ''}{moneyFormatter(value)}</Text> },
      { title: 'Loại tiền / Tỷ giá', width: 135, render: (_, row) => <span>{row.currency_code || 'VND'}<br /><Text type="secondary">{Number(row.exchange_rate || 1).toLocaleString('vi-VN')}</Text></span> },
      { title: 'Ngày mở', dataIndex: 'opening_date', width: 120, render: dateLabel },
      { title: 'Ngày đến hạn', dataIndex: 'maturity_date', width: 125, render: dateLabel },
      { title: 'Ngày đóng', dataIndex: 'close_date', width: 120, render: dateLabel },
      { title: 'Nguồn bình quân', dataIndex: 'average_source', width: 150, render: (value) => value ? <Tag color="blue">{value === 'PF14_ACCOUNT' ? 'PF14 · Khớp TK' : 'PF14 · Khớp SP'}</Tag> : '—' },
    ]} />
  </div>;
}

function ProductPeriodMatrix({ history = [], activePeriod }) {
  const ordered = [...history].sort((left, right) => String(left.period_key).localeCompare(String(right.period_key)));
  const activeIndex = ordered.findIndex((item) => item.period_key === activePeriod);
  const endIndex = activeIndex >= 0 ? activeIndex + 1 : ordered.length;
  const periods = ordered.slice(Math.max(0, endIndex - 6), endIndex);
  if (!periods.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có lịch sử sản phẩm theo kỳ" />;
  return (
    <section className="c360-product-matrix">
      <div className="c360-pane-heading">
        <div><Text strong>Ma trận sử dụng sản phẩm theo kỳ</Text><small>Xanh: đang dùng · Đỏ: chưa dùng · Viền xanh/đỏ: bắt đầu hoặc ngừng so với kỳ liền trước</small></div>
        <Tag color="blue">{periods.length} kỳ gần nhất</Tag>
      </div>
      <div className="c360-product-matrix-scroll">
        <div className="c360-product-matrix-grid" style={{ '--period-count': periods.length }}>
          <div className="c360-product-matrix-corner">Sản phẩm / dịch vụ</div>
          {periods.map((row) => <div key={row.period_key} className={`c360-product-matrix-period ${row.period_key === activePeriod ? 'is-active' : ''}`}>{periodLabel(row.period_key)}</div>)}
          {productGroups.flatMap((group) => [
            <div key={`group-${group.key}`} className={`c360-product-matrix-group is-${group.tone}`}>{group.title}</div>,
            ...group.items.flatMap(([key, label]) => {
              const previousValues = periods.map((row, index) => index ? Number(periods[index - 1]?.[key] || 0) > 0 : null);
              return [
                <div key={`label-${key}`} className="c360-product-matrix-label">{label}</div>,
                ...periods.map((row, index) => {
                  const available = hasData(row[key]);
                  const enabled = Number(row[key] || 0) > 0;
                  const previous = previousValues[index];
                  const change = previous == null ? '' : !previous && enabled ? 'is-added' : previous && !enabled ? 'is-stopped' : '';
                  return <Tooltip key={`${key}-${row.period_key}`} title={`${label} · ${periodLabel(row.period_key)}: ${available ? enabled ? 'Có sử dụng' : 'Không sử dụng' : 'Chưa có dữ liệu'}`}><div className={`c360-product-matrix-cell ${enabled ? 'is-on' : available ? 'is-off' : 'is-empty'} ${change}`}><span>{enabled ? '✓' : available ? '×' : '—'}</span></div></Tooltip>;
                }),
              ];
            }),
          ])}
        </div>
      </div>
    </section>
  );
}

function FinancialHistoryChart({ history, moneyFormatter = compactMoney }) {
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
              <strong>{moneyFormatter(latest[item.key])}</strong>
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

function CustomerEventTimeline({ history, moneyFormatter = compactMoney }) {
  const rows = [...history].sort((a, b) => String(a.period_key).localeCompare(String(b.period_key)));
  const events = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    const previousBranch = previous.primary_branch_code || previous.branch_code || '';
    const currentBranch = current.primary_branch_code || current.branch_code || '';
    if (previousBranch !== currentBranch) events.push({ period: current.period_key, type: 'added', category: 'management', label: 'Thay đổi chi nhánh chính', detail: `${previousBranch || 'Chưa xác định'} → ${currentBranch || 'Chưa xác định'}` });
    const previousOfficer = previous.ten_can_bo || previous.ma_cb || '';
    const currentOfficer = current.ten_can_bo || current.ma_cb || '';
    if (previousOfficer !== currentOfficer) events.push({ period: current.period_key, type: 'added', category: 'management', label: 'Thay đổi cán bộ quản lý', detail: `${previousOfficer || 'Chưa xác định'} → ${currentOfficer || 'Chưa xác định'}` });
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
      if (difference !== 0 && (Math.abs(pct) >= 10 || key === 'du_no_xlrr')) events.push({ period: current.period_key, type: difference > 0 ? 'added' : 'removed', category, label: `${label} ${difference > 0 ? 'tăng' : 'giảm'} ${moneyFormatter(Math.abs(difference))}`, detail: `${moneyFormatter(before)} → ${moneyFormatter(after)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)` });
    });
    const feeFields = ['phi_bao_lanh', 'phi_chuyen_tien', 'phi_nhdt', 'abic_batd', 'phi_kdnt', 'phi_lc', 'phi_ttqt', 'phi_the', 'phi_khac'];
    const beforeFee = feeFields.reduce((sum, key) => sum + Number(previous[key] || 0), 0);
    const afterFee = feeFields.reduce((sum, key) => sum + Number(current[key] || 0), 0);
    if (beforeFee !== afterFee) events.push({ period: current.period_key, type: afterFee > beforeFee ? 'added' : 'removed', category: 'fee', label: `Thu phí ${afterFee > beforeFee ? 'tăng' : 'giảm'} ${moneyFormatter(Math.abs(afterFee - beforeFee))}`, detail: `${moneyFormatter(beforeFee)} → ${moneyFormatter(afterFee)}` });
  }
  if (!events.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa ghi nhận thay đổi quản lý, tài chính hoặc sản phẩm giữa các kỳ" />;
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
  const width = 760; const height = 210; const left = 62; const right = 62; const top = 18; const bottom = 34;
  const innerWidth = width - left - right; const innerHeight = height - top - bottom;
  const baseline = top + innerHeight / 2;
  const halfHeight = innerHeight / 2 - 9;
  const maxFlow = Math.max(1, ...rows.flatMap((row) => [Number(row.credit_amount || 0), Number(row.debit_amount || 0)]));
  let cumulativeValue = 0;
  const cumulative = rows.map((row) => {
    cumulativeValue += Number(row.net_amount || 0);
    return cumulativeValue;
  });
  const cumulativeMin = Math.min(0, ...cumulative);
  const cumulativeMax = Math.max(0, ...cumulative);
  const cumulativeRange = Math.max(1, cumulativeMax - cumulativeMin);
  const slotWidth = innerWidth / Math.max(1, rows.length);
  const barWidth = Math.max(5, Math.min(18, slotWidth * 0.3));
  const xAt = (index) => left + slotWidth * index + slotWidth / 2;
  const cumulativeY = (value) => top + ((cumulativeMax - value) / cumulativeRange) * innerHeight;
  const cumulativePoints = cumulative.map((value, index) => `${xAt(index)},${cumulativeY(value)}`).join(' ');
  const labelEvery = Math.max(1, Math.ceil(rows.length / 6));
  return (
    <div className="c360-cashflow-chart">
      <div className="c360-chart-legend"><span className="is-credit">Có · tiền vào</span><span className="is-debit">Nợ · tiền ra</span><span className="is-net">Thuần lũy kế</span></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Biểu đồ tiền vào, tiền ra và dòng tiền thuần lũy kế GL02 theo ngày">
        {[0, 0.5, 1].map((ratio) => {
          const yTop = baseline - halfHeight * ratio;
          const yBottom = baseline + halfHeight * ratio;
          const label = compactMoney(maxFlow * ratio).replace(' đ', '');
          return <g key={ratio}>{ratio ? <><line x1={left} x2={width - right} y1={yTop} y2={yTop} stroke="#e9edf3" /><line x1={left} x2={width - right} y1={yBottom} y2={yBottom} stroke="#e9edf3" /><text x={left - 8} y={yTop + 4} textAnchor="end" fontSize="10" fill="#7b8798">{label}</text><text x={left - 8} y={yBottom + 4} textAnchor="end" fontSize="10" fill="#7b8798">−{label}</text></> : null}</g>;
        })}
        <line x1={left} x2={width - right} y1={baseline} y2={baseline} stroke="#94a3b8" strokeWidth="1.2" />
        {rows.map((row, index) => {
          const x = xAt(index);
          const creditHeight = (Number(row.credit_amount || 0) / maxFlow) * halfHeight;
          const debitHeight = (Number(row.debit_amount || 0) / maxFlow) * halfHeight;
          return <g key={row.transaction_date}>
            <rect x={x - barWidth - 1} y={baseline - creditHeight} width={barWidth} height={creditHeight} rx="2" fill="#16a36a"><title>{`${dateLabel(row.transaction_date)} · Tiền vào ${fullMoney(row.credit_amount)}`}</title></rect>
            <rect x={x + 1} y={baseline} width={barWidth} height={debitHeight} rx="2" fill="#e05263"><title>{`${dateLabel(row.transaction_date)} · Tiền ra ${fullMoney(row.debit_amount)}`}</title></rect>
            {(index % labelEvery === 0 || index === rows.length - 1) ? <text x={x} y={height - 12} textAnchor="middle" fontSize="10" fill="#657184">{String(row.transaction_date || '').slice(8, 10)}/{String(row.transaction_date || '').slice(5, 7)}</text> : null}
          </g>;
        })}
        <polyline points={cumulativePoints} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {cumulative.map((value, index) => <circle key={`net-${rows[index].transaction_date}`} cx={xAt(index)} cy={cumulativeY(value)} r="3" fill="#2563eb"><title>{`${dateLabel(rows[index].transaction_date)} · Thuần trong ngày ${fullMoney(rows[index].net_amount)} · Thuần lũy kế ${fullMoney(value)}`}</title></circle>)}
        <text x={width - right + 8} y={top + 4} fontSize="10" fill="#2563eb">{compactMoney(cumulativeMax)}</text>
        <text x={width - right + 8} y={top + innerHeight} fontSize="10" fill="#2563eb">{compactMoney(cumulativeMin)}</text>
      </svg>
      <small className="c360-chart-note">Cột dùng thang bên trái; đường thuần lũy kế dùng thang màu xanh bên phải. Di chuột vào từng điểm để xem số tiền chi tiết.</small>
    </div>
  );
}

function RealMetric({ title, value, icon, tone, current, previous, note, onClick, explanation, loading = false }) {
  const content = (
    <Card className={`c360-real-metric is-${tone}${loading ? ' is-loading' : ''}`} onClick={loading ? undefined : onClick}>
      <span>{icon}</span>
      <Text type="secondary">{title}</Text>
      {loading ? <Skeleton.Input active size="small" block /> : <strong>{value}</strong>}
      {loading ? <small>Đang tính theo bộ lọc mới…</small> : <><Change current={current} previous={previous} /><small>{note}</small></>}
      {explanation ? <small className="c360-metric-source">ⓘ {explanation.source}</small> : null}
    </Card>
  );
  return explanation ? <Tooltip title={<div><strong>{explanation.formula}</strong><br />Nguồn: {explanation.source}<br />Đơn vị: {explanation.unit || 'VNĐ'}<br />Cập nhật theo kỳ đang chọn.</div>}>{content}</Tooltip> : content;
}

function CustomerReplayTimeline({ history, activePeriod, onChange, moneyFormatter = compactMoney }) {
  const rows = useMemo(() => [...(history || [])].sort((a, b) => String(a.period_key).localeCompare(String(b.period_key))), [history]);
  const years = useMemo(() => [...new Set(rows.map((item) => String(item.period_key || '').slice(0, 4)).filter(Boolean))].sort().reverse(), [rows]);
  const [selectedYear, setSelectedYear] = useState(() => String(activePeriod || '').slice(0, 4));
  useEffect(() => { if (activePeriod) setSelectedYear(String(activePeriod).slice(0, 4)); }, [activePeriod]);
  if (!rows.length) return null;
  const visibleRows = rows.filter((item) => String(item.period_key).startsWith(selectedYear || years[0]));
  return <div className="c360-customer-movie">
    <div className="c360-movie-heading"><div><SwapOutlined /><span><Text strong>Lịch sử quan hệ theo kỳ</Text><small>Chọn kỳ để đồng bộ toàn bộ hồ sơ, card và dữ liệu nghiệp vụ bên dưới</small></span></div><Space><Tag color="blue">{rows.length} kỳ</Tag>{years.length > 1 ? <Select size="small" value={selectedYear || years[0]} onChange={setSelectedYear} style={{ width: 104 }} options={years.map((year) => ({ value: year, label: `Năm ${year}` }))} /> : <Tag>{years[0]}</Tag>}</Space></div>
    <div className="c360-movie-track">{visibleRows.map((row) => {
      const globalIndex = rows.findIndex((item) => item.period_key === row.period_key);
      const previous = rows[globalIndex - 1];
      const deposit = Number(row.so_du_tien_gui || 0) + Number(row.so_du_tgtt_binh_quan || 0);
      const oldDeposit = Number(previous?.so_du_tien_gui || 0) + Number(previous?.so_du_tgtt_binh_quan || 0);
      const loan = Number(row.so_du_tien_vay || 0);
      const oldLoan = Number(previous?.so_du_tien_vay || 0);
      const serviceChanged = previous ? Object.keys(serviceLabels).some((key) => Number(row[key] || 0) !== Number(previous[key] || 0)) : false;
      const eventCount = previous ? [Math.abs(deposit - oldDeposit) > 0.01, Math.abs(loan - oldLoan) > 0.01, row.primary_branch_code !== previous.primary_branch_code, row.ten_can_bo !== previous.ten_can_bo, row.pf10_lds_count !== previous.pf10_lds_count, serviceChanged].filter(Boolean).length : 0;
      return <button type="button" key={row.period_key} className={row.period_key === activePeriod ? 'is-active' : ''} onClick={() => onChange(row.period_key)}><i /><span className="c360-movie-period"><strong>{periodLabel(row.period_key)}</strong>{row.period_key === activePeriod ? <Tag color="purple">ĐANG XEM</Tag> : null}</span><small>{eventCount ? `${eventCount} thay đổi nổi bật` : globalIndex ? 'Không có thay đổi lớn' : 'Kỳ đầu tiên'}</small><span className="c360-movie-deltas"><em className={deposit - oldDeposit >= 0 ? 'is-up' : 'is-down'}>TG {globalIndex ? `${deposit - oldDeposit >= 0 ? '+' : ''}${moneyFormatter(deposit - oldDeposit)}` : moneyFormatter(deposit)}</em><em className={loan - oldLoan >= 0 ? 'is-up' : 'is-down'}>Vay {globalIndex ? `${loan - oldLoan >= 0 ? '+' : ''}${moneyFormatter(loan - oldLoan)}` : moneyFormatter(loan)}</em></span></button>;
    })}</div>
  </div>;
}

function CustomerRelationshipMap({ data, selectedBranch, onSelectBranch, loading }) {
  if (loading) return <section className="c360-relationship-map"><Skeleton active paragraph={{ rows: 2 }} /></section>;
  const branches = data?.branches || [];
  if (!branches.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Kỳ này chưa có quan hệ chi nhánh để dựng sơ đồ" />;
  return <section className="c360-relationship-map">
    <div className="c360-relationship-heading"><span className="c360-relationship-heading-icon"><BankOutlined /></span><span><Text strong>Phạm vi quan hệ</Text><small>Chọn đơn vị để đồng bộ số liệu hồ sơ bên dưới</small></span><span className="c360-relationship-count"><strong>{branches.length}</strong><small>CHI NHÁNH</small></span></div>
    <div className="c360-relationship-options">
      <button type="button" className={!selectedBranch ? 'is-selected is-all' : 'is-all'} onClick={() => onSelectBranch(null)}><span className="c360-relationship-option-icon"><BankOutlined /></span><span className="c360-relationship-option-copy"><strong>Toàn bộ quan hệ</strong><small>Hợp nhất {branches.length} chi nhánh</small></span>{!selectedBranch ? <CheckCircleFilled className="c360-relationship-check" /> : null}</button>
      {branches.map((branch) => <button type="button" key={branch.branch_code} className={`${branch.is_primary ? 'is-primary' : ''} ${selectedBranch === branch.branch_code ? 'is-selected' : ''}`} onClick={() => onSelectBranch(branch.branch_code)}><span className="c360-relationship-option-icon"><BankOutlined /></span><span className="c360-relationship-option-copy"><strong>{branch.branch_name || `Chi nhánh ${branch.branch_code}`}</strong><small>Mã đơn vị {branch.branch_code}</small></span>{selectedBranch === branch.branch_code ? <CheckCircleFilled className="c360-relationship-check" /> : branch.is_primary ? <Tag color="gold">CHÍNH</Tag> : null}</button>)}
    </div>
  </section>;
}

function CustomerModal({ customer, periodKey, initialBranchCode, analysisParams, currentUser, open, onClose }) {
  const modalAnchorRef = useRef(null);
  const profileScrollRef = useRef(null);
  const preservedScrollTopRef = useRef(0);
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState('');
  const [scopedHistory, setScopedHistory] = useState([]);
  const [scopedHistoryError, setScopedHistoryError] = useState('');
  const [scopedHistoryLoading, setScopedHistoryLoading] = useState(false);
  const [replayPeriod, setReplayPeriod] = useState(periodKey);
  const [relationshipMap, setRelationshipMap] = useState({ branches: [] });
  const [relationshipMapLoading, setRelationshipMapLoading] = useState(false);
  const [periodSwitchTarget, setPeriodSwitchTarget] = useState(null);
  const [profileReadyPeriod, setProfileReadyPeriod] = useState(null);
  const [relationshipReadyPeriod, setRelationshipReadyPeriod] = useState(null);
  const [loanData, setLoanData] = useState({ categories: [], branches: [], items: [], total: 0 });
  const [depositData, setDepositData] = useState({ categories: [], branches: [], items: [], primary_accounts: [], total: 0 });
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
  const [fullCustomer, setFullCustomer] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [showAllPaymentAccounts, setShowAllPaymentAccounts] = useState(false);
  const [comparisonMode, setComparisonMode] = useState('single');
  const [comparisonPeriod, setComparisonPeriod] = useState(null);
  const [moneyDisplayMode, setMoneyDisplayMode] = useState('compact');
  const [currencyDisplayMode, setCurrencyDisplayMode] = useState('vnd');
  const [loanDetail, setLoanDetail] = useState(null);
  const [selectedLoanId, setSelectedLoanId] = useState(null);
  const [accountHistory, setAccountHistory] = useState({ open: false, loading: false, data: null, error: '', account: null });
  const [lineage, setLineage] = useState({ open: false, loading: false, metric: '', items: [], total: 0, record_count: 0 });
  const viewPeriodKey = replayPeriod || periodKey;

  useEffect(() => {
    setShowAllPaymentAccounts(false);
  }, [customer?.ma_kh, profileBranch]);

  useEffect(() => {
    if (!open || !customer?.ma_kh || !viewPeriodKey) return;
    // Dữ liệu trả về từ truy vấn có lọc chi nhánh vẫn có branch_details, nhưng
    // các chỉ tiêu cấp trên cùng đã được thay bằng số riêng của chi nhánh đó.
    // Chỉ tái sử dụng payload khi đây thực sự là hồ sơ tổng của khách hàng.
    const isScopedCustomer = Boolean(customer.viewing_branch_code || customer.viewing_pgd_code);
    const hasUnitDetails = Array.isArray(customer.branch_details)
      && customer.branch_details.every((detail) => Array.isArray(detail.unit_details));
    if (viewPeriodKey === periodKey && Array.isArray(customer.branch_details) && !isScopedCustomer && hasUnitDetails) {
      setFullCustomer(customer);
      setProfileLoading(false);
      setProfileReadyPeriod(viewPeriodKey);
      return;
    }
    let active = true;
    setFullCustomer(null);
    setProfileLoading(true);
    client.get('/customer-processing/profiles', {
      params: { period_key: viewPeriodKey, keyword: customer.ma_kh, page: 1, page_size: 10, include_units: true },
      hideGlobalLoading: true,
    })
      .then(({ data }) => {
        if (!active) return;
        const items = Array.isArray(data) ? data : data?.items || [];
        setFullCustomer(items.find((item) => item.ma_kh === customer.ma_kh) || customer);
      })
      .catch(() => { if (active) setFullCustomer(customer); })
      .finally(() => { if (active) { setProfileLoading(false); setProfileReadyPeriod(viewPeriodKey); } });
    return () => { active = false; };
  }, [customer, open, periodKey, viewPeriodKey]);

  useEffect(() => {
    if (!open || !customer?.ma_kh || !['credit', 'fees', 'products'].includes(activeTab)) return;
    let active = true;
    setFinancialMetrics({ totals: {}, branches: [] });
    setFinancialLoading(true);
    client.get('/customer-processing/financial-metrics', {
      params: {
        period_key: viewPeriodKey,
        ma_kh: customer.ma_kh,
        branch_code: profileBranch || undefined,
      },
      hideGlobalLoading: true,
    })
      .then(({ data }) => { if (active) setFinancialMetrics(data || { totals: {}, branches: [] }); })
      .catch(() => { if (active) setFinancialMetrics({ totals: {}, branches: [] }); })
      .finally(() => { if (active) setFinancialLoading(false); });
    return () => { active = false; };
  }, [activeTab, customer?.ma_kh, open, profileBranch, viewPeriodKey]);

  useEffect(() => {
    if (!open || !customer?.ma_kh) return;
    let active = true;
    setLoading(true);
    setHistoryError('');
    client.get('/customer-processing/profile-history', { params: { ma_kh: customer.ma_kh }, hideGlobalLoading: true })
      .then(({ data }) => { if (active) setHistory(Array.isArray(data) ? data : []); })
      .catch((error) => { if (active) { setHistory([]); setHistoryError(error.response?.data?.detail || error.message || 'Không tải được lịch sử các kỳ'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [customer?.ma_kh, open]);

  useEffect(() => {
    if (!open || !customer?.ma_kh || !profileBranch) {
      setScopedHistory([]);
      setScopedHistoryError('');
      setScopedHistoryLoading(false);
      return undefined;
    }
    let active = true;
    setScopedHistory([]);
    setScopedHistoryError('');
    setScopedHistoryLoading(true);
    client.get('/customer-processing/profile-history', {
      params: { ma_kh: customer.ma_kh, branch_code: profileBranch }, hideGlobalLoading: true,
    })
      .then(({ data }) => { if (active) setScopedHistory(Array.isArray(data) ? data : []); })
      .catch((error) => { if (active) setScopedHistoryError(error.response?.data?.detail || error.message || 'Không tải được lịch sử chi nhánh'); })
      .finally(() => { if (active) setScopedHistoryLoading(false); });
    return () => { active = false; };
  }, [customer?.ma_kh, open, profileBranch]);

  useEffect(() => {
    if (!open || !customer?.ma_kh || !viewPeriodKey) return;
    let active = true;
    setRelationshipMap({ branches: [] });
    setRelationshipMapLoading(true);
    client.get('/customer-processing/relationship-map', {
      params: { period_key: viewPeriodKey, ma_kh: customer.ma_kh }, hideGlobalLoading: true,
    })
      .then(({ data }) => { if (active) setRelationshipMap(data || { branches: [] }); })
      .catch(() => { if (active) setRelationshipMap({ branches: [] }); })
      .finally(() => { if (active) { setRelationshipMapLoading(false); setRelationshipReadyPeriod(viewPeriodKey); } });
    return () => { active = false; };
  }, [customer?.ma_kh, open, viewPeriodKey]);

  useEffect(() => {
    if (!periodSwitchTarget
      || profileReadyPeriod !== periodSwitchTarget
      || relationshipReadyPeriod !== periodSwitchTarget) return undefined;
    const timer = window.setTimeout(() => setPeriodSwitchTarget(null), 180);
    return () => window.clearTimeout(timer);
  }, [periodSwitchTarget, profileReadyPeriod, relationshipReadyPeriod]);

  useEffect(() => {
    if (!profileBranch || relationshipReadyPeriod !== viewPeriodKey) return;
    const branchExists = (relationshipMap.branches || []).some((item) => item.branch_code === profileBranch);
    if (!branchExists) {
      message.info(`Chi nhánh ${profileBranch} chưa có quan hệ tại kỳ ${periodLabel(viewPeriodKey)}; hệ thống đã chuyển về toàn bộ quan hệ.`);
      setProfileBranch(null);
      setLoanBranch(null);
    }
  }, [profileBranch, relationshipMap.branches, relationshipReadyPeriod, viewPeriodKey]);

  useEffect(() => {
    if (!open || !customer?.ma_kh || activeTab !== 'credit') return;
    let active = true;
    setLoanData({ categories: [], branches: [], items: [], total: 0 });
    setLoanLoading(true);
    client.get('/customer-processing/pf10-loans', {
      params: {
        period_key: viewPeriodKey,
        ma_kh: customer.ma_kh,
        category: loanCategory,
        branch_code: loanBranch || profileBranch || undefined,
        page_size: 500,
      },
      hideGlobalLoading: true,
    })
      .then(({ data }) => {
        if (!active) return;
        const payload = data || { categories: [], branches: [], items: [], total: 0 };
        setLoanData(payload);
        const selected = (payload.categories || []).find((item) => item.key === loanCategory);
        const firstAvailable = (payload.categories || []).find((item) => Number(item.account_count || 0) > 0);
        if (Number(selected?.account_count || 0) === 0 && firstAvailable && firstAvailable.key !== loanCategory) {
          setLoanCategory(firstAvailable.key);
        }
      })
      .catch(() => { if (active) setLoanData({ categories: [], branches: [], items: [], total: 0 }); })
      .finally(() => { if (active) setLoanLoading(false); });
    return () => { active = false; };
  }, [activeTab, customer?.ma_kh, loanBranch, loanCategory, open, profileBranch, viewPeriodKey]);

  useEffect(() => {
    if (!open || !customer?.ma_kh || activeTab !== 'credit') return;
    let active = true;
    setRr01Data({ lav_groups: [], items: [] });
    setRr01Loading(true);
    client.get('/customer-processing/rr01-handled-risk', { params: {
      period_key: viewPeriodKey, ma_kh: customer.ma_kh, branch_code: profileBranch || undefined,
    }, hideGlobalLoading: true })
      .then(({ data }) => { if (active) setRr01Data(data || { lav_groups: [], items: [] }); })
      .catch(() => { if (active) setRr01Data({ lav_groups: [], items: [] }); })
      .finally(() => { if (active) setRr01Loading(false); });
    return () => { active = false; };
  }, [activeTab, customer?.ma_kh, open, profileBranch, viewPeriodKey]);

  useEffect(() => {
    if (!open || !customer?.ma_kh || activeTab !== 'deposit') return;
    let active = true;
    setDepositData({ categories: [], branches: [], items: [], primary_accounts: [], total: 0 });
    setDepositLoading(true);
    client.get('/customer-processing/deposit-accounts', {
      params: {
        period_key: viewPeriodKey,
        ma_kh: customer.ma_kh,
        category: depositCategory,
        branch_code: profileBranch || undefined,
        page_size: 500,
      },
      hideGlobalLoading: true,
    })
      .then(({ data }) => { if (active) setDepositData(data || { categories: [], branches: [], items: [], primary_accounts: [], total: 0 }); })
      .catch(() => { if (active) setDepositData({ categories: [], branches: [], items: [], primary_accounts: [], total: 0 }); })
      .finally(() => { if (active) setDepositLoading(false); });
    return () => { active = false; };
  }, [activeTab, customer?.ma_kh, depositCategory, open, profileBranch, viewPeriodKey]);

  useEffect(() => {
    if (!open || !customer?.ma_kh || activeTab !== 'deposit') return;
    let active = true;
    setGl02Activity({ daily: [], branches: [], history: [] });
    setGl02Loading(true);
    client.get('/customer-processing/gl02-account-activity', {
      params: { period_key: viewPeriodKey, ma_kh: customer.ma_kh, branch_code: profileBranch || undefined }, hideGlobalLoading: true,
    })
      .then(({ data }) => { if (active) setGl02Activity(data || { daily: [], branches: [], history: [] }); })
      .catch(() => { if (active) setGl02Activity({ daily: [], branches: [], history: [] }); })
      .finally(() => { if (active) setGl02Loading(false); });
    return () => { active = false; };
  }, [activeTab, customer?.ma_kh, open, profileBranch, viewPeriodKey]);

  useEffect(() => {
    if (!open || !customer?.ma_kh || activeTab !== 'classification') return;
    let active = true;
    setClassificationData({ branches: [], items: [] });
    setClassificationLoading(true);
    client.get('/customer-processing/customer-classification-history', {
      params: { ma_kh: customer.ma_kh, branch_code: profileBranch || undefined }, hideGlobalLoading: true,
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
      setProfileBranch(initialBranchCode || null);
      setReplayPeriod(periodKey);
      setPeriodSwitchTarget(null);
      setProfileReadyPeriod(null);
      setRelationshipReadyPeriod(null);
      setActiveTab('summary');
      setHistory([]);
      setHistoryError('');
      setScopedHistory([]);
      setScopedHistoryError('');
      setRr01Open(false);
      setGl02Open(false);
      setComparisonMode('single');
      setComparisonPeriod(null);
      setMoneyDisplayMode('compact');
      setCurrencyDisplayMode('vnd');
      setLoanDetail(null);
      setSelectedLoanId(null);
      setAccountHistory({ open: false, loading: false, data: null, error: '', account: null });
    }
  }, [customer?.ma_kh, initialBranchCode, open, periodKey]);

  useEffect(() => {
    if (!open) return;
    const source = profileBranch ? scopedHistory : history;
    const ordered = [...source].sort((left, right) => String(left.period_key).localeCompare(String(right.period_key)));
    const currentIndex = ordered.findIndex((item) => item.period_key === viewPeriodKey);
    const fallback = currentIndex > 0
      ? ordered[currentIndex - 1]?.period_key
      : [...ordered].reverse().find((item) => item.period_key !== viewPeriodKey)?.period_key;
    const valid = ordered.some((item) => item.period_key === comparisonPeriod && item.period_key !== viewPeriodKey);
    if (!valid) setComparisonPeriod(fallback || null);
    if (!fallback && !valid) setComparisonMode('single');
  }, [comparisonPeriod, history, open, profileBranch, scopedHistory, viewPeriodKey]);

  const changeProfileTab = (nextTab) => {
    const scrollElement = profileScrollRef.current;
    preservedScrollTopRef.current = scrollElement?.scrollTop || 0;
    setActiveTab(nextTab);
    window.requestAnimationFrame(() => {
      profileScrollRef.current?.scrollTo({ top: preservedScrollTopRef.current, left: 0, behavior: 'auto' });
    });
  };

  if (!customer) return null;
  const customerRecord = fullCustomer || customer;
  const trackedProducts = productGroups.flatMap((group) => group.items);
  const branchDetails = Array.isArray(customerRecord.branch_details) ? customerRecord.branch_details : [];
  const selectedBranchDetail = profileBranch
    ? branchDetails.find((item) => item.branch_code === profileBranch)
    : null;
  const selectedUnits = profileBranch
    ? (selectedBranchDetail?.unit_details || [])
    : branchDetails.flatMap((item) => (item.unit_details || []).map((unit) => ({ ...unit, branch_code: item.branch_code })));
  const relationshipRows = profileBranch && selectedBranchDetail ? [selectedBranchDetail] : branchDetails;
  const viewedCustomer = selectedBranchDetail
    ? {
        ...customerRecord,
        ...selectedBranchDetail,
        branch_codes: selectedBranchDetail.branch_code,
        pgd_codes: selectedBranchDetail.ma_pgd,
        branch_count: 1,
        pgd_count: selectedBranchDetail.ma_pgd ? 1 : 0,
        doanh_so_chuyen_tien_ve_tk: selectedBranchDetail.doanh_so_cramt || 0,
        last_tktt_transaction_at: null,
        tktt_inactive_days: null,
        tktt_activity_status: null,
      }
    : customerRecord;
  const metricCustomer = { ...viewedCustomer, ...(financialMetrics.totals || {}) };
  const displayedHistory = profileBranch ? scopedHistory : history;
  const displayedHistoryError = profileBranch ? scopedHistoryError : historyError;
  const displayedHistoryLoading = profileBranch ? scopedHistoryLoading : loading;
  const displayMoney = (value) => moneyDisplayMode === 'exact' ? fullMoney(value) : compactMoney(value);
  const displayConvertedMoney = (vndValue, originalValue, row = {}) => {
    const currency = String(row.currency_code || 'VND').trim().toUpperCase() || 'VND';
    if (currencyDisplayMode === 'original' && currency !== 'VND' && originalValue !== undefined && originalValue !== null) {
      return <div><Text strong>{originalMoney(originalValue, currency)}</Text><br /><Text type="secondary">Quy đổi: {displayMoney(vndValue)} · Tỷ giá {Number(row.exchange_rate || 1).toLocaleString('vi-VN')}</Text></div>;
    }
    return <div><Text strong>{displayMoney(vndValue)}</Text>{currency !== 'VND' && originalValue !== undefined && originalValue !== null ? <><br /><Text type="secondary">{originalMoney(originalValue, currency)} × {Number(row.exchange_rate || 1).toLocaleString('vi-VN')}</Text></> : null}</div>;
  };
  const comparisonOptions = [...displayedHistory]
    .filter((item) => item.period_key !== viewPeriodKey)
    .sort((left, right) => String(right.period_key).localeCompare(String(left.period_key)))
    .map((item) => ({ value: item.period_key, label: `Kỳ ${periodLabel(item.period_key)}` }));
  const comparisonBaseline = displayedHistory.find((item) => item.period_key === comparisonPeriod) || null;
  const comparisonCurrent = {
    ...(displayedHistory.find((item) => item.period_key === viewPeriodKey) || {}),
    ...viewedCustomer,
  };
  const primaryBranchDetail = branchDetails.find(
    (item) => item.branch_code === customerRecord.primary_branch_code,
  );
  const canSwitchCustomerScope = currentUser?.scope === 'province';
  // Ở chế độ toàn KH chỉ hiển thị cán bộ của chi nhánh chính. Cán bộ tại chi nhánh
  // khác chỉ xuất hiện khi người dùng chọn đúng quan hệ chi nhánh đó.
  const officerScope = profileBranch && selectedBranchDetail
    ? [selectedBranchDetail]
    : primaryBranchDetail
      ? [primaryBranchDetail]
      : [];
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
    .map((item) => `${item.ten_can_bo} (${item.officer_department_name || item.ten_pgd || viewedCustomer.managing_department_name || 'Chưa xác định phòng'})`))]
    .join(' | ');
  const activeProducts = trackedProducts.filter(([key]) => hasData(viewedCustomer[key]) && Number(viewedCustomer[key]) > 0);
  const totalDeposit = Number(viewedCustomer.so_du_tien_gui || 0) + Number(viewedCustomer.so_du_tgtt_binh_quan || 0);
  const totalLoan = Number(viewedCustomer.du_no_ngan_han || 0)
    + Number(viewedCustomer.du_no_trung_dai_han || 0)
    + Number(viewedCustomer.du_no_thau_chi || 0)
    || Number(viewedCustomer.so_du_tien_vay || 0);
  const loanInterestIncome = Number(viewedCustomer.pf10_interest || 0);
  const serviceFeeIncome = feeFields.reduce((sum, field) => sum + Number(metricCustomer[field.key] || 0), 0);
  const periodRevenue = loanInterestIncome + serviceFeeIncome;
  const canViewLineage = (currentUser?.permissions || []).includes('admin');
  const loadLineage = async (metric) => {
    setLineage({ open: true, loading: true, metric, items: [], total: 0, record_count: 0 });
    try {
      const { data: response } = await client.get('/customer-processing/value-lineage', {
        params: { period_key: viewPeriodKey, ma_kh: viewedCustomer.ma_kh, metric, branch_code: profileBranch || undefined }, hideGlobalLoading: true,
      });
      setLineage({ open: true, loading: false, metric, ...(response || {}) });
    } catch (requestError) {
      message.error(requestError.response?.data?.detail || 'Không tải được truy vết nguồn');
      setLineage((current) => ({ ...current, loading: false }));
    }
  };
  const openLoanDetail = (item) => {
    setSelectedLoanId(item.id);
    setLoanDetail(item);
  };
  const closeLoanDetail = () => {
    const loanId = selectedLoanId;
    setLoanDetail(null);
    window.setTimeout(() => {
      document.querySelector(`[data-loan-row="${loanId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 180);
  };
  const openAccountHistory = async (account) => {
    if (!account?.account_number || !account?.branch_code) return;
    setAccountHistory({ open: true, loading: true, data: null, error: '', account });
    try {
      const { data: response } = await client.get('/customer-processing/deposit-account-history', {
        params: {
          period_key: viewPeriodKey,
          ma_kh: viewedCustomer.ma_kh,
          account_number: account.account_number,
          branch_code: account.branch_code,
        },
        hideGlobalLoading: true,
      });
      setAccountHistory({ open: true, loading: false, data: response, error: '', account });
    } catch (requestError) {
      setAccountHistory({
        open: true,
        loading: false,
        data: null,
        error: requestError.response?.data?.detail || requestError.message || 'Không tải được vòng đời tài khoản',
        account,
      });
    }
  };
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
  const demandAccountCount = Number((depositData.categories || []).find((item) => item.key === 'demand')?.account_count || 0);
  const termAccountCount = Number((depositData.categories || []).find((item) => item.key === 'term')?.account_count || 0);
  const latestGlTransactionAt = gl02Activity.latest_transaction?.transaction_at || (!profileBranch ? viewedCustomer.last_tktt_transaction_at : null);
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
      <div ref={profileScrollRef} className="c360-profile-scroll">
      <div ref={modalAnchorRef} className="demo-quick-header c360-profile-hero">
        <Avatar size={48} className="demo-profile-avatar">{viewedCustomer.ten_kh?.charAt(0) || 'K'}</Avatar>
        <div>
          <Text className="c360-profile-kicker">HỒ SƠ KHÁCH HÀNG 360° · KỲ {periodLabel(viewPeriodKey)}{viewPeriodKey !== periodKey ? ' · ĐANG XEM KỲ LỊCH SỬ' : ''}</Text>
          <Space wrap><Title level={2}>{viewedCustomer.ten_kh || 'Chưa có tên khách hàng'}</Title><Tag color="blue">{customerTypeLabel(viewedCustomer.loai_khach_hang)}</Tag><Tag color="success">ĐANG HOẠT ĐỘNG</Tag>{profileLoading ? <Tag color="processing">Đang đồng bộ hồ sơ…</Tag> : null}</Space>
          <div className="demo-profile-meta"><span>Mã KH lõi: {viewedCustomer.ma_kh}</span><span>{viewedCustomer.telephone || 'Chưa có điện thoại'}</span><span>CBQL: {viewedCustomer.ten_can_bo || viewedCustomer.ma_cb || '—'}</span></div>
        </div>
        <Space className="c360-profile-actions" wrap>
          <Button icon={<BarChartOutlined />} onClick={() => changeProfileTab('history')}>Lịch sử các kỳ</Button>
          <Select
            className="c360-profile-scope"
            popupMatchSelectWidth={false}
            value={profileBranch || 'all'}
            disabled={!canSwitchCustomerScope}
            onChange={(value) => {
              const next = value === 'all' ? null : value;
              setProfileBranch(next);
              setLoanBranch(null);
            }}
            options={canSwitchCustomerScope ? [
              { value: 'all', label: 'Toàn bộ quan hệ · Tất cả chi nhánh' },
              ...[...new Set(branchDetails.map((item) => item.branch_code).filter(Boolean))]
                .map((value) => ({ value, label: `Chỉ quan hệ tại CN ${value}${value === customerRecord.primary_branch_code ? ' · Chi nhánh chính' : ''}` })),
            ] : [{ value: profileBranch || initialBranchCode, label: `Quan hệ tại CN ${profileBranch || initialBranchCode}` }]}
          />
        </Space>
      </div>
      <CustomerReplayTimeline history={history} activePeriod={viewPeriodKey} moneyFormatter={displayMoney} onChange={(nextPeriod) => {
        if (nextPeriod === viewPeriodKey) return;
        setPeriodSwitchTarget(nextPeriod);
        setReplayPeriod(nextPeriod);
        setLoanBranch(null);
      }} />
      <section className="c360-profile-view-controls">
        <div className="c360-profile-view-control is-compare">
          <span><SwapOutlined /><span><Text strong>Đối chiếu kỳ</Text><small>So sánh trên cùng phạm vi chi nhánh</small></span></span>
          <Segmented
            size="small"
            value={comparisonMode}
            onChange={setComparisonMode}
            options={[{ label: 'Một kỳ', value: 'single' }, { label: 'So sánh', value: 'compare', disabled: !comparisonOptions.length }]}
          />
          <Select
            size="small"
            value={comparisonPeriod}
            disabled={comparisonMode !== 'compare' || !comparisonOptions.length}
            onChange={setComparisonPeriod}
            options={comparisonOptions}
            placeholder="Chọn kỳ đối chiếu"
          />
        </div>
        <div className="c360-profile-view-control is-money">
          <span><DatabaseOutlined /><span><Text strong>Hiển thị số tiền</Text><small>Áp dụng trong toàn bộ hồ sơ</small></span></span>
          <Segmented size="small" value={moneyDisplayMode} onChange={setMoneyDisplayMode} options={[{ label: 'Rút gọn', value: 'compact' }, { label: 'Đến đồng', value: 'exact' }]} />
          <Tooltip title="Chế độ nguyên tệ áp dụng cho dòng tài khoản có CCY và tỷ giá nguồn; số tổng hợp vẫn là VND sau quy đổi.">
            <Segmented size="small" value={currencyDisplayMode} onChange={setCurrencyDisplayMode} options={[{ label: 'VND quy đổi', value: 'vnd' }, { label: 'Nguyên tệ chi tiết', value: 'original' }]} />
          </Tooltip>
        </div>
      </section>
      <div className={`c360-period-data${periodSwitchTarget ? ' is-refreshing' : ''}`}>
      {periodSwitchTarget ? <div className="c360-period-loading"><Spin size="large" /><strong>Đang cập nhật dữ liệu kỳ {periodLabel(periodSwitchTarget)}</strong><small>Hồ sơ, quan hệ chi nhánh và số liệu nghiệp vụ đang được đồng bộ…</small></div> : null}
      <CustomerRelationshipMap data={relationshipMap} selectedBranch={profileBranch} loading={relationshipMapLoading} onSelectBranch={(branch) => { setProfileBranch(branch); setLoanBranch(null); }} />
      <div className="c360-profile-scope-banner">
        <div><BankOutlined /><span><strong>{profileBranch ? `Đang xem riêng quan hệ tại Chi nhánh ${profileBranch}` : 'Đang xem toàn bộ quan hệ của khách hàng'}</strong><small>{profileBranch ? `Tất cả số tiền, tài khoản, LDS và cán bộ bên dưới chỉ thuộc chi nhánh này. Chi nhánh chính toàn hồ sơ: ${customerRecord.primary_branch_code || 'chưa xác định'}.` : 'Số liệu được cộng từ tất cả chi nhánh khách hàng có quan hệ.'}</small></span></div>
        <AppliedScopeBanner params={{ ...(analysisParams || {}), period_key: viewPeriodKey, branch_code: profileBranch || analysisParams?.branch_code }} />
      </div>
      <Row gutter={[14, 14]} className="demo-quick-metrics c360-profile-metrics">
        <Col xs={12} lg={8} xl><MetricDefinitionTooltip periodKey={viewPeriodKey} definition={{ source: 'PF14/DP01', columns: 'MONTHLYENDBALANCE, AVERAGEBALANCE/AVGBAL, CCY', formula: 'Tiền gửi CKH cuối kỳ + TGTT bình quân theo phạm vi đang xem', currency: 'Ngoại tệ quy đổi VNĐ bằng tỷ giá DP01 của kỳ' }}><div role="button" tabIndex={0} className="is-deposit" onClick={() => changeProfileTab('deposit')}><WalletOutlined /><Text>Tổng tiền gửi</Text><strong>{displayMoney(totalDeposit)}</strong><small>PF14/DP01 · CKH + TGTT BQ</small></div></MetricDefinitionTooltip></Col>
        <Col xs={12} lg={8} xl><MetricDefinitionTooltip periodKey={viewPeriodKey} definition={{ source: 'PF10/LN01', columns: 'EOMBAL, DU_NO, LNTYPE, CCY', formula: 'Dư nợ ngắn hạn + trung dài hạn + thấu chi theo phạm vi đang xem', currency: 'Ngoại tệ quy đổi VNĐ bằng tỷ giá DP01 của kỳ' }}><div role="button" tabIndex={0} className="is-loan" onClick={() => changeProfileTab('credit')}><BankOutlined /><Text>Tổng tiền vay</Text><strong>{displayMoney(totalLoan)}</strong><small>PF10/LN01 · {viewedCustomer.pf10_lds_count || 0} LDS</small></div></MetricDefinitionTooltip></Col>
        <Col xs={12} lg={8} xl><MetricDefinitionTooltip periodKey={viewPeriodKey} definition={{ source: 'PF10 + KH02', columns: 'INTEREST; ACCTCD, CRAMT, DRAMT', formula: 'Lãi tiền vay + SUM(CRAMT − DRAMT) theo nhóm phí cấu hình', currency: 'PF10 quy đổi theo tỷ giá DP01; KH02 dùng giá trị VNĐ nguồn' }}><div role="button" tabIndex={0} className="is-casa" onClick={() => changeProfileTab('fees')}><DatabaseOutlined /><Text>Tổng thu nhập trong kỳ</Text><strong>{displayMoney(periodRevenue)}</strong><small>Lãi vay {displayMoney(loanInterestIncome)} · Phí {displayMoney(serviceFeeIncome)}</small></div></MetricDefinitionTooltip></Col>
        <Col xs={12} lg={8} xl><MetricDefinitionTooltip periodKey={viewPeriodKey} definition={{ source: 'CN05/DP01/Bill Payment/KH02', columns: 'Cờ sản phẩm, CUST_TYPE, mã dịch vụ và tài khoản cấu hình', formula: 'Đếm sản phẩm có trạng thái sử dụng theo khách hàng và phạm vi', currency: 'Không áp dụng' }}><div role="button" tabIndex={0} className="is-product" onClick={() => changeProfileTab('products')}><CreditCardOutlined /><Text>Sản phẩm đang sử dụng</Text><strong>{activeProducts.length}</strong><small>CN05/DP01/Bill Payment · {trackedProducts.length} SP</small></div></MetricDefinitionTooltip></Col>
        <Col xs={12} lg={8} xl><MetricDefinitionTooltip periodKey={viewPeriodKey} definition={{ source: 'CustomerPeriodBranchDetail', columns: 'MA_KH, BRANCH_CODE', formula: 'COUNT(DISTINCT chi nhánh có quan hệ nghiệp vụ)', currency: 'Không áp dụng' }}><div role="button" tabIndex={0} className="is-branch" onClick={() => changeProfileTab('relationships')}><BankOutlined /><Text>Chi nhánh có quan hệ</Text><strong>{viewedCustomer.branch_count || 0}</strong><small>BranchDetail · {profileBranch ? `CN ${profileBranch}` : 'Toàn KH'}</small></div></MetricDefinitionTooltip></Col>
      </Row>
      {comparisonMode === 'compare' ? <CustomerPeriodComparison current={comparisonCurrent} baseline={comparisonBaseline} currentPeriod={viewPeriodKey} baselinePeriod={comparisonPeriod} moneyFormatter={displayMoney} /> : null}
      <Tabs activeKey={activeTab} onChange={changeProfileTab} animated={false} className="c360-profile-tabs" items={[
        {
          key: 'summary',
          label: 'Thông tin khách hàng',
          children: <Descriptions bordered column={2} size="small" items={[
            { key: 'code', label: 'Mã khách hàng', children: <Text strong copyable={{ text: viewedCustomer.ma_kh }}>{viewedCustomer.ma_kh}</Text> },
            { key: 'type', label: 'Loại khách hàng', children: customerTypeLabel(viewedCustomer.loai_khach_hang) },
            { key: 'branches', label: 'Các chi nhánh', children: branchDetails.length ? <Space size={[4, 4]} wrap>{[...new Set(branchDetails.map((item) => item.branch_code).filter(Boolean))].map((code) => <Tag key={code} color={code === customerRecord.primary_branch_code ? 'gold' : 'default'}>{code}{code === customerRecord.primary_branch_code ? ' · CHÍNH' : ''}</Tag>)}</Space> : (viewedCustomer.branch_codes || 'Chưa có dữ liệu') },
            { key: 'pgds', label: 'Đơn vị phát sinh tài khoản', children: selectedUnits.length
              ? <Space size={[4, 4]} wrap>{selectedUnits.map((unit) => <Tooltip key={`${unit.branch_code || profileBranch}-${unit.unit_code}`} title={`${unit.account_count} tài khoản · ${fullMoney(unit.balance)} · CB tài khoản: ${unit.officer_name || 'Chưa xác định trong danh sách user'}`}><Tag color={unit === selectedUnits[0] ? 'blue' : 'default'}>{!profileBranch ? `CN ${unit.branch_code} · ` : ''}{unit.unit_name}: {displayMoney(unit.balance)}</Tag></Tooltip>)}</Space>
              : 'Chưa có dữ liệu' },
            { key: 'loanType', label: 'Loại vay', children: loanTypeLabel(viewedCustomer.loai_vay) },
            { key: 'hkdAccounts', label: 'Tài khoản hộ kinh doanh', children: viewedCustomer.hkd_tk
              ? <Text copyable={{ text: viewedCustomer.hkd_account_numbers || '' }}>{viewedCustomer.hkd_account_numbers || 'Đã xác định CUST_TYPE 570'}</Text>
              : 'Không ghi nhận trong kỳ' },
            { key: 'phone', label: 'Điện thoại', children: viewedCustomer.telephone || 'Chưa có dữ liệu' },
            { key: 'officer', label: 'Cán bộ quản lý', span: 2, children: officerSummary ? (
              <Tooltip title={officerSummary}>
                <Text>{officerShortSummary || viewedCustomer.ten_can_bo}</Text>
              </Tooltip>
            ) : (viewedCustomer.ten_can_bo || viewedCustomer.ma_cb || 'Chưa có dữ liệu') },
            { key: 'period', label: 'Kỳ đang xem', children: periodLabel(viewPeriodKey) },
          ]} />,
        },
        {
          key: 'deposit',
          label: 'Tiền gửi',
          children: (
            <div className="c360-credit-pane">
              {canViewLineage ? <div className="c360-admin-lineage-action"><Text type="secondary">Giải thích số dư từ PF14 và tỷ giá DP01</Text><Button size="small" icon={<DatabaseOutlined />} onClick={() => loadLineage(depositCategory === 'term' ? 'deposit' : 'casa')}>Truy vết con số</Button></div> : null}
              <div className="c360-insight-strip">
                <div role="button" tabIndex={0} onClick={() => setGl02Open(true)}><Text>Doanh số TKTT</Text><strong>{displayMoney(viewedCustomer.doanh_so_chuyen_tien_ve_tk)}</strong><small>GL02 · Bấm xem theo chi nhánh</small></div>
                <Tooltip title={gl02Activity.latest_transaction ? (
                  <div>
                    <div>Nội dung gốc: {gl02Activity.latest_transaction.remark || '—'}</div>
                    <div>Tham chiếu: {gl02Activity.latest_transaction.reference || '—'}</div>
                      <div>Ghi Nợ: {displayMoney(gl02Activity.latest_transaction.debit_amount)}</div>
                      <div>Ghi Có: {displayMoney(gl02Activity.latest_transaction.credit_amount)}</div>
                  </div>
                ) : 'Chưa có nội dung giao dịch GL02'}>
                  <div>
                    <Text>Giao dịch TKTT gần nhất</Text>
                    <strong>{dateTimeLabel(latestGlTransactionAt)}</strong>
                    <small>{gl02Activity.latest_transaction
                      ? `${gl02Activity.latest_transaction.direction_label || 'Giao dịch'} ${displayMoney(gl02Activity.latest_transaction.amount)} · ${gl02Activity.latest_transaction.description || gl02Activity.latest_transaction.remark || 'Chưa có diễn giải'}`
                      : `Không có GL02 hợp lệ tại ${profileBranch ? `CN ${profileBranch}` : 'phạm vi đang xem'}`}</small>
                  </div>
                </Tooltip>
                <div><Text>TK/sổ đang hoạt động</Text><strong>{depositData.analytics?.active || 0}</strong><small>{demandAccountCount} TKTT · {termAccountCount} TGCKH</small></div>
                <div><Text>Mới / tất toán</Text><strong>{depositData.analytics?.new || 0} / {depositData.analytics?.closed || 0}</strong><small>trong kỳ</small></div>
              </div>
              <section className="c360-primary-accounts">
                <div className="c360-pane-heading">
                  <div>
                    <Text strong>TKTT1 / TKTT2 / TKTT3</Text>
                    <small>Ba tài khoản thanh toán chính được xếp hạng động theo từng kỳ</small>
                  </div>
                  <Tooltip title="Chỉ lấy TKTT đang hoạt động; ưu tiên chi nhánh chính, sau đó số dư bình quân, số dư cuối kỳ và số tài khoản.">
                    <Tag color="blue">DP01 + PF14</Tag>
                  </Tooltip>
                </div>
                <div className="c360-primary-account-grid">
                  {[1, 2, 3].map((rank) => {
                    const account = (depositData.primary_accounts || []).find((item) => Number(item.display_rank) === rank);
                    return (
                      <div className={`c360-primary-account-card rank-${rank}${account ? '' : ' is-empty'}`} key={rank}>
                        <div className="c360-primary-account-title">
                          <span>TKTT{rank}</span>
                          {account ? <Tag color={account.account_status === 'new' ? 'cyan' : 'green'}>{account.account_status === 'new' ? 'Mở mới' : 'Hoạt động'}</Tag> : <Tag>Chưa có</Tag>}
                        </div>
                        {account ? <Button type="link" className="c360-primary-account-number c360-account-history-link" onClick={() => openAccountHistory(account)}>{account.account_number}</Button> : <Text className="c360-primary-account-number">—</Text>}
                        <small>{account ? `${account.branch_code || '—'} · ${account.deposit_type_name || account.deposit_type || 'TKTT'}` : `Không có TKTT hoạt động tại ${profileBranch ? `CN ${profileBranch}` : 'phạm vi đang xem'}`}</small>
                        <div className="c360-primary-account-balances">
                          <span><small>Bình quân</small><strong>{displayMoney(account?.average_balance)}</strong></span>
                          <span><small>Cuối kỳ</small><strong>{displayMoney(account?.end_balance)}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {(depositData.primary_accounts || []).length > 3 ? (
                  <div className="c360-extra-account-toggle">
                    <Button type="link" onClick={() => setShowAllPaymentAccounts((current) => !current)}>
                      {showAllPaymentAccounts
                        ? 'Thu gọn danh sách TKTT'
                        : `Xem thêm ${(depositData.primary_accounts || []).length - 3} TKTT khác`}
                    </Button>
                  </div>
                ) : null}
                {showAllPaymentAccounts ? (
                  <div className="c360-extra-account-list">
                    {(depositData.primary_accounts || []).slice(3).map((account) => (
                      <div key={`${account.branch_code}-${account.account_number}`}>
                        <span><Tag color="blue">TKTT #{account.display_rank}</Tag><Button type="link" className="c360-account-history-link" onClick={() => openAccountHistory(account)}>{account.account_number}</Button></span>
                        <span><Text type="secondary">CN {account.branch_code || '—'} · {account.deposit_type || 'Tài khoản thanh toán'}</Text></span>
                        <span><small>Bình quân</small><strong>{displayMoney(account.average_balance)}</strong></span>
                        <span><small>Cuối kỳ</small><strong>{displayMoney(account.end_balance)}</strong></span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
              <section className="c360-gl02-panel">
                <div className="c360-pane-heading">
                  <div><Text strong>Dòng tiền tài khoản thanh toán theo ngày</Text><small>GL02 · TK cân đối 421101 · Chỉ giao dịch hợp lệ</small></div>
                  <Button size="small" onClick={() => setGl02Open(true)}>Chi tiết chi nhánh</Button>
                </div>
                {gl02Loading ? <Skeleton active paragraph={{ rows: 4 }} /> : <CashFlowChart rows={gl02Activity.daily || []} />}
                {!gl02Loading && (gl02Activity.categories || []).length > 0 ? <>
                  <Divider orientation="left" plain>Phân loại dòng tiền theo nội dung GL02</Divider>
                  <Table size="small" rowKey="key" pagination={false} dataSource={gl02Activity.categories || []} scroll={{ x: 720 }} columns={[
                    { title: 'Nhóm giao dịch', dataIndex: 'label', fixed: 'left', width: 190, render: (value, row) => <Tag color={row.key === 'unclassified' ? 'warning' : 'blue'}>{value}</Tag> },
                    { title: 'Tiền vào (Có)', dataIndex: 'credit_amount', width: 160, align: 'right', render: displayMoney },
                    { title: 'Tiền ra (Nợ)', dataIndex: 'debit_amount', width: 160, align: 'right', render: displayMoney },
                    { title: 'Dòng tiền thuần', dataIndex: 'net_amount', width: 160, align: 'right', render: (value) => <Text strong className={Number(value || 0) >= 0 ? 'is-up' : 'is-down'}>{displayMoney(value)}</Text> },
                    { title: 'Số giao dịch', dataIndex: 'transaction_count', width: 115, align: 'right', render: (value) => Number(value || 0).toLocaleString('vi-VN') },
                  ]} />
                  {Number(gl02Activity.unclassified_count || 0) > 0 && <details className="c360-unknown-remarks"><summary>{Number(gl02Activity.unclassified_count).toLocaleString('vi-VN')} giao dịch chưa nhận diện — xem diễn giải gốc</summary><Table size="small" rowKey={(row) => `${row.transaction_code}-${row.remark}`} pagination={{ pageSize: 5, hideOnSinglePage: true }} dataSource={gl02Activity.unknown_remarks || []} scroll={{ x: 800 }} columns={[
                    { title: 'REMARK chưa nhận diện', dataIndex: 'remark', width: 360 },
                    { title: 'Mã GD', dataIndex: 'transaction_code', width: 110, render: (value) => value || '—' },
                    { title: 'Số GD', dataIndex: 'transaction_count', width: 90, align: 'right' },
                    { title: 'Ghi Có', dataIndex: 'credit_amount', width: 140, align: 'right', render: displayMoney },
                    { title: 'Ghi Nợ', dataIndex: 'debit_amount', width: 140, align: 'right', render: displayMoney },
                  ]} /></details>}
                </> : null}
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
                    { title: 'Phát sinh Có', dataIndex: 'credit_amount', width: 165, align: 'right', render: displayMoney },
                    { title: 'Phát sinh Nợ', dataIndex: 'debit_amount', width: 165, align: 'right', render: displayMoney },
                    { title: 'Dòng tiền thuần', dataIndex: 'net_amount', width: 165, align: 'right', render: (value) => <Text className={Number(value || 0) >= 0 ? 'is-up' : 'is-down'} strong>{displayMoney(value)}</Text> },
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
                    <strong>{displayMoney(item.end_balance)}</strong>
                    <small>Bình quân {displayMoney(item.average_balance)}</small>
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
                  { title: depositCategory === 'term' ? 'Số tài khoản / Sổ tiết kiệm' : 'Số tài khoản thanh toán', dataIndex: 'account_number', width: 210, fixed: 'left', render: (value, row) => <div>{value ? <Button type="link" className="c360-account-history-link" onClick={() => openAccountHistory(row)}>{value}</Button> : '—'}<br /><Text type="secondary">Nguồn {row.account_source || 'DP01'} · Bấm xem vòng đời</Text></div> },
                  { title: 'Loại tiền gửi (DP01)', width: 220, render: (_, row) => <div><Text>{row.deposit_type || 'Chưa đối chiếu được DP01'}</Text>{row.product_code ? <><br /><Text type="secondary">Mã DP_TYPE {row.product_code} · Nguồn {row.deposit_type_source || 'chưa xác định'}</Text></> : null}</div> },
                  { title: 'Trạng thái', dataIndex: 'account_status', width: 135, render: (value) => {
                    const status = depositStatusLabels[value] || [value || '—', 'default'];
                    return <Tag color={status[1]}>{status[0]}</Tag>;
                  } },
                  { title: currencyDisplayMode === 'original' ? 'Số dư cuối kỳ (nguyên tệ)' : 'Số dư cuối kỳ (VND)', dataIndex: 'end_balance', width: 225, align: 'right', render: (value, row) => displayConvertedMoney(value, row.end_balance_original, row) },
                  { title: `${currencyDisplayMode === 'original' ? 'Kỳ trước (nguyên tệ)' : 'Kỳ trước (VND)'}${depositData.previous_period ? ` · ${periodLabel(depositData.previous_period)}` : ''}`, dataIndex: 'previous_balance', width: 225, align: 'right', render: (value, row) => displayConvertedMoney(value, row.previous_balance_original, row) },
                  { title: 'Biến động (VND)', dataIndex: 'balance_change', width: 190, align: 'right', render: (value) => <Text className={Number(value || 0) >= 0 ? 'is-up' : 'is-down'} strong>{Number(value || 0) >= 0 ? '+' : ''}{displayMoney(value)}</Text> },
                  { title: currencyDisplayMode === 'original' ? 'Số dư bình quân (nguyên tệ)' : 'Số dư bình quân (VND)', dataIndex: 'average_balance', width: 225, align: 'right', render: (value, row) => displayConvertedMoney(value, row.average_balance_original, row) },
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
              {canViewLineage ? <div className="c360-admin-lineage-action"><Text type="secondary">Giải thích dư nợ từ từng tài khoản PF10</Text><Button size="small" icon={<DatabaseOutlined />} onClick={() => loadLineage('loan')}>Truy vết con số</Button></div> : null}
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
                    <strong>{displayMoney(item.end_balance)}</strong>
                    <small>Bình quân {displayMoney(item.average_balance)}</small>
                    <small>{item.branch_count} chi nhánh · Lãi tháng {displayMoney(item.interest)}</small>
                  </button>
                ))}
              </div>
              {loanLoading ? <Skeleton active paragraph={{ rows: 4 }} /> : <LoanMaturityTimeline items={loanData?.items || []} periodKey={viewPeriodKey} moneyFormatter={displayMoney} onSelect={openLoanDetail} />}
              <div className="c360-risk-panel">
                <div className="c360-pane-heading">
                  <div><Text strong>Rủi ro tín dụng BC29</Text><small>Nhóm nợ, quá hạn, tài sản bảo đảm và dự phòng của khách hàng</small></div>
                  {loanData.risk?.available ? <Tag color="blue">Đã có BC29</Tag> : <Tag>Chưa có bản ghi BC29</Tag>}
                </div>
                <Alert className="c360-provision-guide" type="info" showIcon message="DPRR trong kỳ là mức tăng/giảm so với kỳ trước" description="Số dương là trích tăng; số âm là giảm/hoàn nhập dự phòng. DPRR chung lấy LN01 nhóm nợ 1–4 × 0,75%; DPRR cụ thể lấy BC29 nhóm nợ 2–5." />
                <div>
                  <div><Text>Nhóm nợ</Text><strong>{loanData.risk?.debt_groups?.join(', ') || '—'}</strong></div>
                  <div><Text>Quá hạn gốc/lãi</Text><strong>{loanData.risk?.available ? `${loanData.risk.max_principal_overdue_days || 0}/${loanData.risk.max_interest_overdue_days || 0} ngày` : '—'}</strong></div>
                  <div><Text>Tài sản bảo đảm</Text><strong>{loanData.risk?.available ? displayMoney(loanData.risk.collateral_value) : '—'}</strong></div>
                  <div><Text>Dự phòng cụ thể</Text><strong>{loanData.risk?.available ? displayMoney(loanData.risk.specific_provision) : '—'}</strong></div>
                  <div role="button" tabIndex={0} onClick={() => setRr01Open(true)}><Text>Dư nợ XLRR</Text><strong>{displayMoney(viewedCustomer.du_no_xlrr)}</strong><small>RR01 · Bấm xem LAV/LDS</small></div>
                  <div role="button" tabIndex={0} onClick={() => setRr01Open(true)}><Text>Doanh số thu nợ XLRR</Text><strong>{displayMoney(viewedCustomer.ds_thu_no_xlrr)}</strong><small>Thu gốc + thu lãi trong tháng</small></div>
                  <div><Text>Tăng/giảm DPRR chung</Text><strong>{financialLoading ? '…' : displayMoney(metricCustomer.dprr_chung_tt)}</strong><small>{Number(metricCustomer.dprr_chung_tt || 0) < 0 ? 'Giảm/hoàn nhập so kỳ trước' : Number(metricCustomer.dprr_chung_tt || 0) > 0 ? 'Trích tăng so kỳ trước' : 'Không biến động'}</small></div>
                  <div><Text>DPRR chung lũy kế</Text><strong>{financialLoading ? '…' : displayMoney(metricCustomer.dprr_chung_lk)}</strong></div>
                  <div><Text>Tăng/giảm DPRR cụ thể</Text><strong>{financialLoading ? '…' : displayMoney(metricCustomer.dprr_cuthe_tt)}</strong><small>{Number(metricCustomer.dprr_cuthe_tt || 0) < 0 ? 'Giảm/hoàn nhập so kỳ trước' : Number(metricCustomer.dprr_cuthe_tt || 0) > 0 ? 'Trích tăng so kỳ trước' : 'Không biến động'}</small></div>
                  <div><Text>DPRR cụ thể lũy kế</Text><strong>{financialLoading ? '…' : displayMoney(metricCustomer.dprr_cuthe_lk)}</strong></div>
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
                onRow={(record) => ({ 'data-loan-row': record.id, onDoubleClick: () => openLoanDetail(record) })}
                rowClassName={(record) => record.id === selectedLoanId ? 'c360-selected-loan-row' : ''}
                columns={[
                  { title: 'Chi nhánh', dataIndex: 'branch_code', width: 95, fixed: 'left' },
                  { title: 'Số LDS (LN01)', dataIndex: 'lds_number', width: 200, fixed: 'left', render: (value) => <Text strong copyable>{value || 'Chưa ghép được LDS'}</Text> },
                  { title: 'Tài khoản vay (PF10)', dataIndex: 'account_number', width: 180, render: (value) => <Text copyable>{value || '—'}</Text> },
                  { title: 'Loại vay', dataIndex: 'loan_type_label', width: 120, render: (value, row) => <div><Text>{value}</Text><br /><Text type="secondary">{row.loan_type}</Text></div> },
                  { title: 'Trạng thái', dataIndex: 'loan_status', width: 145, render: (value) => {
                    const status = loanStatusLabels[value] || [value || '—', 'default'];
                    return <Tag color={status[1]}>{status[0]}</Tag>;
                  } },
                  { title: 'Dư nợ cuối tháng', dataIndex: 'end_of_month_balance', width: 185, align: 'right', render: displayMoney },
                  { title: 'Dư nợ bình quân', dataIndex: 'average_balance', width: 185, align: 'right', render: displayMoney },
                  { title: 'Ngày mở/giải ngân', dataIndex: 'opening_date', width: 135, render: dateLabel },
                  { title: 'Ngày đến hạn', dataIndex: 'maturity_date', width: 125, render: dateLabel },
                  { title: 'Kỳ hạn', dataIndex: 'month_term', width: 85, align: 'center', render: (value) => value == null ? '—' : `${value} tháng` },
                  { title: 'LS hợp đồng', dataIndex: 'contract_rate', width: 105, align: 'right', render: (value) => value == null ? '—' : `${Number(value).toLocaleString('vi-VN')}%` },
                  { title: 'Lãi tháng', dataIndex: 'interest_amount', width: 165, align: 'right', render: displayMoney },
                  { title: 'Lãi dự thu', dataIndex: 'accruals', width: 165, align: 'right', render: displayMoney },
                  { title: 'Lãi điều chỉnh sổ', dataIndex: 'book_correction_interest', width: 180, align: 'right', render: displayMoney },
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
              <DomainMetricGrid customer={viewedCustomer} fields={internationalFields} moneyFormatter={displayMoney} />
            </div>
          ),
        },
        {
          key: 'fees',
          label: 'Phí thu được',
          children: (
            <div className="c360-domain-pane">
              <div className="c360-pane-heading">
                <div><Text strong>Thu nhập theo khách hàng</Text><small>Tách riêng lãi tiền vay PF10 và phí dịch vụ KH02; không tự đưa chênh lệch vào phí khác</small></div>
                <Space><Tag color="gold">PF10 · KH02</Tag>{canViewLineage ? <Button size="small" icon={<DatabaseOutlined />} onClick={() => loadLineage('income')}>Truy vết con số</Button> : null}</Space>
              </div>
              <div className="c360-insight-strip c360-income-breakdown">
                <div><Text>Tổng thu nhập trong kỳ</Text><strong>{displayMoney(periodRevenue)}</strong><small>Lãi tiền vay + phí dịch vụ</small></div>
                <div><Text>Lãi tiền vay</Text><strong>{displayMoney(loanInterestIncome)}</strong><small>PF10 · INTEREST</small></div>
                <div><Text>Tổng phí dịch vụ</Text><strong>{displayMoney(serviceFeeIncome)}</strong><small>Chỉ cộng các phí có nguồn</small></div>
                <div><Text>Đối soát thành phần</Text><strong className="is-up">KHỚP</strong><small>{displayMoney(loanInterestIncome)} + {displayMoney(serviceFeeIncome)}</small></div>
              </div>
              <DomainMetricGrid
                customer={metricCustomer}
                fields={feeFields}
                moneyFormatter={displayMoney}
                emptyNote="Chỉ tiêu chưa có nguồn được để trống thay vì mặc định bằng 0, tránh hiểu nhầm khách hàng không phát sinh phí."
              />
              <Table
                loading={financialLoading}
                size="small"
                rowKey="branch_code"
                pagination={false}
                dataSource={financialMetrics.branches || []}
                scroll={{ x: 1560 }}
                columns={[
                  { title: 'Chi nhánh', dataIndex: 'branch_code', width: 100, fixed: 'left' },
                  { title: 'Phí bảo lãnh', dataIndex: 'phi_bao_lanh', align: 'right', render: displayMoney },
                  { title: 'Phí chuyển tiền', dataIndex: 'phi_chuyen_tien', align: 'right', render: displayMoney },
                  { title: 'Phí NHĐT', dataIndex: 'phi_nhdt', align: 'right', render: displayMoney },
                  { title: 'Phí BATD', dataIndex: 'abic_batd', align: 'right', render: displayMoney },
                  { title: 'Phí KDNT', dataIndex: 'phi_kdnt', align: 'right', render: displayMoney },
                  { title: 'Phí LC', dataIndex: 'phi_lc', align: 'right', render: displayMoney },
                  { title: 'Phí TTQT', dataIndex: 'phi_ttqt', align: 'right', render: displayMoney },
                  { title: 'Phí thẻ', dataIndex: 'phi_the', align: 'right', render: displayMoney },
                  { title: 'Phí khác', dataIndex: 'phi_khac', align: 'right', render: displayMoney },
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
          label: `Quan hệ chi nhánh (${relationshipRows.length || viewedCustomer.branch_count || 0})`,
          children: relationshipRows.length ? (
            <Table
              size="small"
              rowKey={(row) => `${row.branch_code}-${row.ma_pgd}`}
              pagination={false}
              scroll={{ x: 900 }}
              dataSource={relationshipRows}
              rowClassName={(row) => row.branch_code === customerRecord.primary_branch_code ? 'c360-primary-branch-row' : ''}
              expandable={{
                rowExpandable: (row) => Boolean(row.unit_details?.length),
                expandedRowRender: (row) => <Table
                  size="small"
                  rowKey="unit_code"
                  pagination={false}
                  dataSource={row.unit_details || []}
                  columns={[
                    { title: 'Đơn vị phát sinh', dataIndex: 'unit_name', render: (value, unit, index) => <Space><Text strong>{value}</Text>{index === 0 ? <Tag color="blue">GIÁ TRỊ LỚN NHẤT</Tag> : null}</Space> },
                    { title: 'Số tài khoản', dataIndex: 'account_count', align: 'right', width: 120 },
                    { title: 'Số dư', dataIndex: 'balance', align: 'right', width: 180, render: displayMoney },
                    { title: 'CB theo tài khoản', width: 220, render: (_, unit) => unit.officer_verified ? <Text>{unit.officer_name}</Text> : <Text type="secondary">Chưa xác định</Text> },
                  ]}
                />,
              }}
              columns={[
                { title: 'Chi nhánh', dataIndex: 'branch_code', width: 150, fixed: 'left', render: (value) => <Space size={4}><Text strong>{value}</Text>{value === customerRecord.primary_branch_code ? <Tag color="gold">CHÍNH</Tag> : null}</Space> },
                { title: <Tooltip title="Các đơn vị được xếp theo tổng số dư DP01, không chọn theo mã lớn nhất.">Đơn vị quan hệ chính</Tooltip>, width: 210, render: (_, row) => <div><Text>{row.representative_unit_name || '—'}</Text>{row.unit_count > 1 ? <><br /><Text type="secondary">+{row.unit_count - 1} đơn vị khác · Bấm mở rộng</Text></> : null}</div> },
                { title: 'Cán bộ quản lý', width: 180, render: (_, row) => row.ten_can_bo || row.ma_cb || '—' },
                { title: 'Tiền gửi CKH', dataIndex: 'so_du_tien_gui', align: 'right', width: 150, render: displayMoney },
                { title: 'TGTT bình quân', dataIndex: 'so_du_tgtt_binh_quan', align: 'right', width: 150, render: displayMoney },
                { title: 'Dư nợ', dataIndex: 'so_du_tien_vay', align: 'right', width: 150, render: displayMoney },
                { title: 'Sản phẩm', dataIndex: 'service_count', align: 'center', width: 100 },
              ]}
            />
          ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có chi tiết quan hệ theo chi nhánh" />,
        },
        {
          key: 'products',
          label: 'Sản phẩm dịch vụ',
          children: <div className="c360-products-pane">
            <ProductServiceGroups customer={metricCustomer} />
            {displayedHistoryLoading ? <Skeleton active paragraph={{ rows: 5 }} /> : <ProductPeriodMatrix history={displayedHistory} activePeriod={viewPeriodKey} />}
          </div>,
        },
        {
          key: 'history',
          label: <span>Biến động & cảnh báo{displayedHistory.length ? <Tag color="blue">{displayedHistory.length} kỳ</Tag> : null}</span>,
          children: displayedHistoryLoading ? <Skeleton active /> : (
            <div className="c360-history-pane">
              {displayedHistoryError ? <Alert className="is-full" type="error" showIcon message="Không tải được lịch sử khách hàng" description={displayedHistoryError} /> : null}
              {!displayedHistoryError && !displayedHistory.length ? <Empty className="is-full" image={Empty.PRESENTED_IMAGE_SIMPLE} description="Khách hàng chưa có dữ liệu ở các kỳ đã xử lý" /> : null}
              <section>
                <div className="c360-pane-heading"><div><Text strong>Lịch sử tài chính</Text><small>Tối đa 12 kỳ gần nhất · {profileBranch ? `Chi nhánh ${profileBranch}` : 'Toàn khách hàng'}</small></div></div>
                <FinancialHistoryChart history={displayedHistory} moneyFormatter={displayMoney} />
              </section>
              <section>
                <div className="c360-pane-heading"><div><Text strong>Dòng thời gian biến động & cảnh báo</Text><small>Tiền gửi, tiền vay, XLRR, phí, sản phẩm và LDS được so sánh tự động giữa hai kỳ liên tiếp</small></div></div>
                <CustomerEventTimeline history={displayedHistory} moneyFormatter={displayMoney} />
              </section>
              <section className="is-full">
                <div className="c360-pane-heading"><div><Text strong>Số liệu từng kỳ</Text><small>Bấm chọn chi nhánh phía trên để đổi phạm vi</small></div></div>
                <Table size="small" rowKey="period_key" pagination={false} scroll={{ x: 900 }} dataSource={[...displayedHistory].reverse()} columns={[
                  { title: 'Kỳ', dataIndex: 'period_key', width: 95, fixed: 'left', render: periodLabel },
                  { title: 'Chi nhánh chính', width: 130, render: (_, row) => row.primary_branch_code || row.branch_code || '—' },
                  { title: 'Cán bộ quản lý', width: 190, render: (_, row) => row.ten_can_bo || row.ma_cb || '—' },
                  { title: 'Tiền gửi CKH', dataIndex: 'so_du_tien_gui', align: 'right', width: 165, render: displayMoney },
                  { title: 'TGTT bình quân', dataIndex: 'so_du_tgtt_binh_quan', align: 'right', width: 165, render: displayMoney },
                  { title: 'Tiền vay', dataIndex: 'so_du_tien_vay', align: 'right', width: 165, render: displayMoney },
                  { title: 'Số LDS PF10', dataIndex: 'pf10_lds_count', align: 'center', width: 110 },
                  { title: 'Sản phẩm', width: 100, align: 'center', render: (_, row) => Object.keys(serviceLabels).filter((key) => Number(row[key] || 0) > 0).length },
                ]} />
              </section>
            </div>
          ),
        },
      ]} />
      </div>
      <Modal
        width="min(980px, 96vw)"
        open={Boolean(loanDetail)}
        onCancel={closeLoanDetail}
        footer={<Button type="primary" onClick={closeLoanDetail}>Đóng và định vị trong bảng</Button>}
        title={`Chi tiết khoản vay · ${loanDetail?.lds_number || loanDetail?.account_number || ''}`}
      >
        {loanDetail ? <div className="c360-loan-detail-modal">
          <div className="c360-loan-detail-hero">
            <div><small>Dư nợ cuối tháng</small><strong>{displayMoney(loanDetail.end_of_month_balance)}</strong></div>
            <div><small>Dư nợ bình quân</small><strong>{displayMoney(loanDetail.average_balance)}</strong></div>
            <div><small>Lãi trong tháng</small><strong>{displayMoney(loanDetail.interest_amount)}</strong></div>
            <div><small>Trạng thái</small><Tag color={(loanStatusLabels[loanDetail.loan_status] || ['', 'default'])[1]}>{(loanStatusLabels[loanDetail.loan_status] || [loanDetail.loan_status || '—'])[0]}</Tag></div>
          </div>
          <Descriptions bordered size="small" column={2} items={[
            { key: 'lds', label: 'Số LDS', children: <Text strong copyable>{loanDetail.lds_number || 'Chưa ghép được LN01'}</Text> },
            { key: 'lav', label: 'Số LAV', children: <Text copyable>{loanDetail.approval_number || 'Chưa ghép được LN01'}</Text> },
            { key: 'account', label: 'Tài khoản vay PF10', children: <Text copyable>{loanDetail.account_number || '—'}</Text> },
            { key: 'branch', label: 'Chi nhánh', children: loanDetail.branch_code || '—' },
            { key: 'type', label: 'Loại vay', children: `${loanDetail.loan_type_label || '—'}${loanDetail.loan_type ? ` (${loanDetail.loan_type})` : ''}` },
            { key: 'ccy', label: 'Loại tiền', children: loanDetail.currency_code || 'VND' },
            { key: 'open', label: 'Ngày giải ngân', children: dateLabel(loanDetail.opening_date) },
            { key: 'maturity', label: 'Ngày đến hạn', children: dateLabel(loanDetail.maturity_date) },
            { key: 'term', label: 'Kỳ hạn', children: loanDetail.month_term == null ? '—' : `${loanDetail.month_term} tháng` },
            { key: 'rate', label: 'Lãi suất hợp đồng', children: loanDetail.contract_rate == null ? '—' : `${Number(loanDetail.contract_rate).toLocaleString('vi-VN')}%` },
            { key: 'accruals', label: 'Lãi dự thu', children: displayMoney(loanDetail.accruals) },
            { key: 'book', label: 'Lãi điều chỉnh sổ', children: displayMoney(loanDetail.book_correction_interest) },
          ]} />
          <Alert showIcon type="info" message="Nguồn dữ liệu" description={`LDS/LAV ghép từ LN01; dư nợ, lãi suất, ngày mở và ngày đến hạn lấy từ PF10 kỳ ${periodLabel(viewPeriodKey)}. Sau khi đóng, bảng bên dưới sẽ cuộn tới đúng khoản vay này.`} />
        </div> : null}
      </Modal>
      <Modal
        width="min(1120px, 97vw)"
        open={accountHistory.open}
        onCancel={() => setAccountHistory((current) => ({ ...current, open: false }))}
        footer={<Button type="primary" onClick={() => setAccountHistory((current) => ({ ...current, open: false }))}>Đóng</Button>}
        title={`Vòng đời tài khoản · ${accountHistory.account?.account_number || ''}`}
      >
        {accountHistory.loading ? <div className="c360-account-life-loading"><Spin size="large" /><strong>Đang đối chiếu DP01, PF14 và GL02…</strong></div> : null}
        {!accountHistory.loading && accountHistory.error ? <Alert showIcon type="error" message="Không tải được vòng đời tài khoản" description={accountHistory.error} /> : null}
        {!accountHistory.loading && accountHistory.data ? <DepositAccountLifecycle data={accountHistory.data} moneyFormatter={displayMoney} /> : null}
      </Modal>
      <Modal width="92vw" open={gl02Open} onCancel={() => setGl02Open(false)} footer={null}
        title={`Chi tiết doanh số TKTT GL02 · ${customer.ma_kh}`}>
        <Alert showIcon type="info" message="Chi nhánh được xác định từ tiền tố CUSTOMER; số liệu chỉ gồm LOCAC 421101 và giao dịch Normal." />
        <Table loading={gl02Loading} className="c360-gl02-branch-table" size="small" sticky
          rowKey="branch_code" pagination={false} scroll={{ x: 1050, y: 480 }}
          dataSource={gl02Activity.branches || []} columns={[
            { title: 'Chi nhánh', dataIndex: 'branch_code', width: 110, fixed: 'left', render: (value) => <Text strong>{value || 'Chưa xác định'}</Text> },
            { title: 'Phát sinh Có', dataIndex: 'credit_amount', width: 180, align: 'right', render: displayMoney },
            { title: 'Phát sinh Nợ', dataIndex: 'debit_amount', width: 180, align: 'right', render: displayMoney },
            { title: 'Dòng tiền thuần', dataIndex: 'net_amount', width: 180, align: 'right', render: (value) => <Text className={Number(value || 0) >= 0 ? 'is-up' : 'is-down'} strong>{displayMoney(value)}</Text> },
            { title: 'Số ngày phát sinh', dataIndex: 'active_days', width: 140, align: 'right' },
            { title: 'Giao dịch gần nhất', dataIndex: 'last_transaction_at', width: 180, render: dateTimeLabel },
          ]} />
      </Modal>
      <Modal width="96vw" open={rr01Open} onCancel={() => setRr01Open(false)} footer={null} title={`Chi tiết nợ xử lý rủi ro RR01 · ${customer.ma_kh}`}>
        <div className="c360-credit-cards">
          {(rr01Data.lav_groups || []).map((item) => <div key={item.lav_number || 'unknown'}>
            <span><Text>{item.lav_number || 'Chưa xác định LAV'}</Text><Tag>{item.lds_count} LDS</Tag></span>
            <strong>{displayMoney(item.current_principal)}</strong>
            <small>Thu trong tháng {displayMoney(item.recovered_amount)}</small>
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
            { title: 'Gốc ban đầu', dataIndex: 'original_principal', width: 170, align: 'right', render: displayMoney },
            { title: 'Lãi tích lũy ban đầu', dataIndex: 'original_accrued_interest', width: 180, align: 'right', render: displayMoney },
            { title: 'Gốc đã thu trước kỳ', dataIndex: 'recovered_principal_before_period', width: 180, align: 'right', render: displayMoney },
            { title: 'Dư gốc hiện tại', dataIndex: 'current_principal', width: 170, align: 'right', render: displayMoney },
            { title: 'Dư lãi hiện tại', dataIndex: 'current_interest', width: 170, align: 'right', render: displayMoney },
            { title: 'Ngắn hạn', dataIndex: 'short_term_principal', width: 160, align: 'right', render: displayMoney },
            { title: 'Trung hạn', dataIndex: 'medium_term_principal', width: 160, align: 'right', render: displayMoney },
            { title: 'Dài hạn', dataIndex: 'long_term_principal', width: 160, align: 'right', render: displayMoney },
            { title: 'Thu gốc tháng', dataIndex: 'recovered_principal_period', width: 160, align: 'right', render: displayMoney },
            { title: 'Thu lãi tháng', dataIndex: 'recovered_interest_period', width: 160, align: 'right', render: displayMoney },
            { title: 'BĐS', dataIndex: 'real_estate_amount', width: 150, align: 'right', render: displayMoney },
            { title: 'ĐS', dataIndex: 'movable_asset_amount', width: 150, align: 'right', render: displayMoney },
            { title: 'TSK', dataIndex: 'other_asset_amount', width: 150, align: 'right', render: displayMoney },
          ]} />
      </Modal>
      <Drawer width="min(1080px, 96vw)" open={lineage.open} onClose={() => setLineage((current) => ({ ...current, open: false }))} title={`Truy vết nguồn · ${{ income: 'Thu nhập trong kỳ', loan: 'Dư nợ', deposit: 'Tiền gửi CKH', casa: 'TGTT bình quân' }[lineage.metric] || lineage.metric} · KH ${viewedCustomer.ma_kh}`}>
        <Alert showIcon type="warning" message="Nội dung dành riêng cho quản trị viên" description={`Tổng ${fullMoney(lineage.total)} từ ${Number(lineage.record_count || 0).toLocaleString('vi-VN')} bản ghi nguồn. Mỗi dòng giữ tên file và ID bản ghi để kiểm tra lại.`} style={{ marginBottom: 12 }} />
        <Table loading={lineage.loading} size="small" sticky rowKey={(row) => `${row.source}-${row.source_record_id}`} dataSource={lineage.items || []} pagination={{ pageSize: 20, showSizeChanger: false }} scroll={{ x: 1100, y: 'calc(100vh - 250px)' }} columns={[
          { title: 'Nguồn', dataIndex: 'source', width: 80, fixed: 'left', render: (value) => <Tag color="blue">{value}</Tag> }, { title: 'Chi nhánh', dataIndex: 'branch_code', width: 95 }, { title: 'Tệp nguồn', dataIndex: 'file', width: 260, ellipsis: true }, { title: 'ID bản ghi', dataIndex: 'source_record_id', width: 105 }, { title: 'Tài khoản/LDS', dataIndex: 'reference', width: 180, render: (value) => <Text copyable>{value || '—'}</Text> }, { title: 'Cột nguồn', dataIndex: 'source_column', width: 210 }, { title: 'Giá trị đóng góp', dataIndex: 'value', width: 165, align: 'right', render: displayMoney }, { title: 'Công thức', dataIndex: 'formula', width: 250 },
        ]} />
      </Drawer>
      </div>
    </Modal>
  );
}

function PortfolioComparisonModal({ open, onClose, title, description, periodKey, previousPeriod, items = [], note }) {
  const maximum = Math.max(1, ...items.flatMap((item) => [Math.abs(Number(item.current || 0)), Math.abs(Number(item.previous || 0))]));
  const periodCurrent = periodLabel(periodKey);
  const periodPrevious = previousPeriod ? periodLabel(previousPeriod) : 'Kỳ trước';
  let currentGroup = '';
  const changeText = (current, previous) => {
    const currentValue = Number(current || 0);
    const previousValue = Number(previous || 0);
    const difference = currentValue - previousValue;
    if (!previousValue) return currentValue ? 'Mới phát sinh so kỳ trước' : 'Không biến động';
    const percentage = (difference / Math.abs(previousValue)) * 100;
    return `${difference >= 0 ? 'Tăng' : 'Giảm'} ${fullMoney(Math.abs(difference))} (${Math.abs(percentage).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%)`;
  };
  return (
    <Modal
      rootClassName="c360-portfolio-comparison-modal"
      width="min(1020px, 96vw)"
      open={open}
      onCancel={onClose}
      footer={<Button type="primary" onClick={onClose}>Đóng biểu đồ</Button>}
      title={<div className="c360-comparison-title"><span><BarChartOutlined /></span><div><strong>{title}</strong><small>{description}</small></div></div>}
    >
      <div className="c360-comparison-periods">
        <span className="is-current"><i />Kỳ {periodCurrent}</span>
        <span className="is-previous"><i />Kỳ {periodPrevious}</span>
        <Tag color="blue">Đơn vị: VNĐ sau quy đổi</Tag>
      </div>
      <div className="c360-comparison-chart" role="img" aria-label={`${title}, so sánh kỳ ${periodCurrent} với ${periodPrevious}`}>
        {items.map((item) => {
          const showGroup = item.group && item.group !== currentGroup;
          if (item.group) currentGroup = item.group;
          const current = Number(item.current || 0);
          const previous = Number(item.previous || 0);
          const difference = current - previous;
          return (
            <div key={item.key} className="c360-comparison-block">
              {showGroup ? <div className="c360-comparison-group">{item.group}</div> : null}
              <div className="c360-comparison-row">
                <div className="c360-comparison-label">
                  <Text strong>{item.label}</Text>
                  <small className={difference >= 0 ? 'is-up' : 'is-down'}>{changeText(current, previous)}</small>
                </div>
                <div className="c360-comparison-bars">
                  <div><span style={{ width: `${Math.max(current ? 1.5 : 0, (Math.abs(current) / maximum) * 100)}%` }} /><b>{fullMoney(current)}</b></div>
                  <div><span style={{ width: `${Math.max(previous ? 1.5 : 0, (Math.abs(previous) / maximum) * 100)}%` }} /><b>{fullMoney(previous)}</b></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Alert className="c360-comparison-note" type="info" showIcon message="Cách đọc biểu đồ" description={note} />
    </Modal>
  );
}

function RealDashboard({ context, onOpenCustomer, onGoCustomers, currentUser }) {
  const { periodKey, branchCode, pgdCode, refreshKey, profileParams = {}, filterOptions = {}, sessionData, sessionLoading } = context;
  const [data, setData] = useState(null);
  const [insights, setInsights] = useState(null);
  const [topChanges, setTopChanges] = useState({});
  const [comparison, setComparison] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [topCustomers, setTopCustomers] = useState([]);
  const [dashboardView, setDashboardView] = useState('results');
  const [alertPage, setAlertPage] = useState(1);
  const [alertLoading, setAlertLoading] = useState(false);
  const [anomalyKeyword, setAnomalyKeyword] = useState('');
  const [anomalyType, setAnomalyType] = useState();
  const [topChangeKeyword, setTopChangeKeyword] = useState('');
  const [topChangeBranch, setTopChangeBranch] = useState();
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [blockLoading, setBlockLoading] = useState({ overview: true, deposit: true, risk: true, income: true, branches: true, alerts: true, changes: true });
  const [kpiDrill, setKpiDrill] = useState({ open: false, metric: '', label: '', items: [], total: 0, totalValue: 0, page: 1, validation: null });
  const [kpiDrillLoading, setKpiDrillLoading] = useState(false);
  const [kpiDrillFilters, setKpiDrillFilters] = useState({ keyword: '', branch: '', customerTypes: [], officers: [], sortBy: '', sortDir: 'desc' });
  const [kpiDrillDraft, setKpiDrillDraft] = useState({ keyword: '', branch: '', customerTypes: [], officers: [] });
  const [quality, setQuality] = useState({ summary: {} });
  const [portfolioChart, setPortfolioChart] = useState('');
  const canExport = hasPermission(currentUser, 'dashboard:export');
  const [qualityDrill, setQualityDrill] = useState({ open: false, issue: '', items: [], total: 0, page: 1, loading: false });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!periodKey) return;
    if (sessionLoading) {
      setLoading(true);
      return;
    }
    const sessionMatches = sessionData?.ready && sessionData.periodKey === periodKey
      && sessionData.scopeKey === JSON.stringify(profileParams);
    if (sessionMatches && sessionData.summary) {
      const filtered = sessionData.summary || {};
      setData({
        kpis: {
          total_customers: filtered.total_customers,
          total_loan: filtered.total_loan,
          total_deposit: filtered.total_deposit,
          total_casa: filtered.total_casa,
          no_service_count: filtered.no_service_customers,
        },
        service_penetration: sessionData.analytics?.services || [],
        officer_leaderboard: sessionData.analytics?.officers || [],
      });
      setInsights(sessionData.insights || null);
      setComparison(sessionData.comparison || null);
      setAnalytics(sessionData.analytics || null);
      setReadiness(sessionData.readiness || null);
      setQuality(sessionData.quality || { summary: {} });
      setTopCustomers((sessionData.profiles?.items || []).slice(0, 8));
      setTopChanges(sessionData.insights?.top_changes || {});
      setLoading(false);
      setDetailLoading(false);
      setError('');
      setBlockLoading({ overview: false, deposit: false, risk: false, income: false, branches: false, alerts: false, changes: false });
      return;
    }
    setLoading(true);
    setData(null);
    setInsights(null);
    setComparison(null);
    setAnalytics(null);
    setReadiness(null);
    setTopCustomers([]);
    setTopChanges({});
    setBlockLoading({ overview: true, deposit: true, risk: true, income: true, branches: true, alerts: true, changes: true });
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
      const background = { hideGlobalLoading: true, timeout: 60_000 };
      const requestPromises = [
        client.get('/customer-processing/profiles', { params: { ...profileParams, sort_by: 'so_du_tien_gui', sort_dir: 'desc', page_size: 8 }, ...background })
          .then((response) => { setTopCustomers(Array.isArray(response.data) ? response.data : response.data?.items || []); return response; }),
        client.get('/dashboard/insights', { params: profileParams, ...background })
          .then((response) => {
            setInsights(response.data);
            setBlockLoading((current) => ({ ...current, overview: false, deposit: false, alerts: false }));
            return response;
          }),
        previousPeriod
          ? client.get('/customer-processing/period-comparison', { params: { ...profileParams, period_key: undefined, current_period: periodKey, previous_period: previousPeriod }, ...background })
          : Promise.resolve({ data: null }),
        client.get('/dashboard/business-analytics', { params: { ...profileParams, include_rankings: false }, ...background })
          .then((response) => {
            setAnalytics(response.data);
            setData((current) => ({ ...current, service_penetration: response.data?.services || current?.service_penetration || [] }));
            setBlockLoading((current) => ({ ...current, risk: false, income: false, branches: false }));
            return response;
          }),
        client.get('/imports/source-readiness', { params: { period_key: periodKey }, ...background }).catch(() => ({ data: null })),
        client.get('/customer-processing/profile-quality', { params: { period_key: periodKey, branch_code: profileParams.branch_code }, ...background }),
      ];
      const requests = await Promise.allSettled(requestPromises);
      const value = (index) => requests[index].status === 'fulfilled' ? requests[index].value?.data : null;
      if (value(2)) setComparison(value(2));
      if (value(4)) setReadiness(value(4));
      if (value(5)) setQuality(value(5));
      const failedCount = requests.filter((item) => item.status === 'rejected').length;
      if (failedCount) message.warning(`${failedCount} khối phân tích chưa tải được; KPI chính vẫn sử dụng bình thường.`);
      client.get('/dashboard/insights', { params: { ...profileParams, include_top_changes: true }, ...background })
        .then(({ data: detail }) => setTopChanges(detail?.top_changes || {}))
        .catch(() => setTopChanges({}))
        .finally(() => setBlockLoading((current) => ({ ...current, changes: false })));
    } catch (requestError) {
      const detail = requestError.response?.data?.detail || requestError.message || 'Không thể kết nối API';
      if (primaryLoaded) message.warning(`Một số phân tích nền chưa tải xong: ${detail}`);
      else setError(detail);
      setBlockLoading((current) => ({ ...current, changes: false }));
    } finally {
      setLoading(false);
      setDetailLoading(false);
      setBlockLoading((current) => ({
        ...current, overview: false, deposit: false, risk: false,
        income: false, branches: false, alerts: false,
      }));
    }
  }, [branchCode, context.periods, periodKey, pgdCode, profileParams, refreshKey, sessionData, sessionLoading]);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  const kpis = data?.kpis || {};
  const compare = comparison?.summary || {};
  const services = data?.service_penetration || [];
  const officers = data?.officer_leaderboard || [];
  const loanTypes = data?.loan_type_breakdown || [];
  const segment = data?.segment || {};
  const segmentCustomerTotal = Number(segment.cn || 0) + Number(segment.dn || 0);
  const segmentLoanTotal = Number(segment.cn_loan || 0) + Number(segment.dn_loan || 0);
  const customerOverview = {
    ...(insights?.customer_overview || {}),
    with_deposit: analytics?.customer?.with_deposit ?? insights?.customer_overview?.with_deposit,
    with_loan: analytics?.customer?.with_loan ?? insights?.customer_overview?.with_loan,
    with_digital_service: analytics?.customer?.with_service ?? insights?.customer_overview?.with_digital_service,
  };
  const funding = analytics?.funding || {};
  const fundingChanges = funding.changes || {};
  const executiveCredit = analytics?.credit || {};
  const creditChanges = executiveCredit.changes || {};
  const abnormal = insights?.abnormal || {};
  const executiveRisk = analytics?.risk || {};
  const executiveIncome = analytics?.income || {};
  const readinessSources = readiness?.sources || [];
  const missingSources = readinessSources.filter((item) => !item.is_ready);
  const changeCaption = (change) => {
    if (!change || change.change_pct == null) return 'Chưa có kỳ trước để so sánh';
    const value = Number(change.change_pct || 0);
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}% so với kỳ trước`;
  };
  const portfolioMetric = (label, value, change, tone, onClick, definition, children = null) => (
    <Tooltip title={<div><b>{fullMoney(value)}</b><br />Nguồn: {definition.source}<br />Cột: {definition.columns}<br />Công thức: {definition.formula}<br />Kỳ: {periodLabel(periodKey)}<br />Ngoại tệ: {definition.currency}</div>}>
      <button type="button" className={`c360-portfolio-metric is-${tone}`} onClick={onClick}>
        <span className="c360-portfolio-metric__label">{label}</span>
        <strong>{compactMoney(value)}</strong>
        <small className={Number(change?.change || 0) >= 0 ? 'is-up' : 'is-down'}>{changeCaption(change)}</small>
        {children}
      </button>
    </Tooltip>
  );

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

  const loadKpiDrilldown = async (metric, page = 1, filterOverrides = null) => {
    const activeFilters = filterOverrides ? { ...kpiDrillFilters, ...filterOverrides } : kpiDrillFilters;
    setKpiDrillLoading(true);
    setKpiDrill((current) => ({ ...current, open: true, metric, page, validation: null }));
    try {
      const { data: response } = await client.get('/dashboard/business-drilldown', {
        params: {
          ...profileParams, metric, page, page_size: 20,
          detail_keyword: activeFilters.keyword || undefined,
          detail_branch_code: activeFilters.branch || undefined,
          detail_customer_type: activeFilters.customerTypes?.join(',') || undefined,
          detail_officer: activeFilters.officers?.join(',') || undefined,
          sort_by: activeFilters.sortBy || undefined,
          sort_dir: activeFilters.sortDir || 'desc',
        },
      });
      const currentKpis = data?.kpis || {};
      const rules = {
        all: { expectedCount: Number(currentKpis.total_customers || 0), formula: 'COUNT(DISTINCT mã KH lõi)', source: 'CustomerPeriodProfile / Kho CIF', unit: 'Khách hàng' },
        term_deposit: { expectedValue: Number(currentKpis.total_deposit || 0), formula: 'SUM(số dư tiền gửi CKH cuối kỳ)', source: 'PF14; tỷ giá DP01', unit: 'VNĐ' },
        loan: { expectedValue: Number(currentKpis.total_loan || 0), formula: 'SUM(dư nợ ngắn hạn + trung dài hạn + thấu chi)', source: 'PF10/LN01', unit: 'VNĐ' },
        casa: { expectedValue: Number(currentKpis.total_casa || 0), formula: 'SUM(TGTT bình quân trong kỳ)', source: 'PF14/DP01', unit: 'VNĐ' },
      };
      const rule = rules[metric] || {};
      const actualCount = Number(response?.total || 0);
      const actualValue = Number(response?.total_value || 0);
      const countOk = rule.expectedCount == null || actualCount === rule.expectedCount;
      const tolerance = Math.max(1, Math.abs(rule.expectedValue || 0) * 0.000001);
      const valueOk = rule.expectedValue == null || Math.abs(actualValue - rule.expectedValue) <= tolerance;
      const scopeOk = (!profileParams.branch_code || response?.scope?.branch_code === profileParams.branch_code)
        && (!profileParams.pgd_code || response?.scope?.pgd_code === profileParams.pgd_code);
      const hasLocalFilters = Boolean(activeFilters.keyword || activeFilters.branch || activeFilters.customerTypes?.length || activeFilters.officers?.length);
      const validation = hasLocalFilters ? null : { ok: countOk && valueOk && scopeOk, countOk, valueOk, scopeOk, ...rule, actualCount, actualValue };
      setKpiDrill({ open: true, metric, label: response?.label, items: response?.items || [], total: actualCount, totalValue: actualValue, page, validation });
      setKpiDrillFilters(activeFilters);
    } catch (requestError) {
      message.error(requestError.response?.data?.detail || 'Không tải được danh sách khách hàng của chỉ tiêu');
    } finally {
      setKpiDrillLoading(false);
    }
  };

  const openKpiDrilldown = (metric) => {
    const empty = { keyword: '', branch: profileParams.branch_code || '', customerTypes: [], officers: [], sortBy: '', sortDir: 'desc' };
    setKpiDrillFilters(empty);
    setKpiDrillDraft({ keyword: '', branch: profileParams.branch_code || '', customerTypes: [], officers: [] });
    loadKpiDrilldown(metric, 1, empty);
  };

  const applyKpiDrillFilters = () => loadKpiDrilldown(kpiDrill.metric, 1, kpiDrillDraft);
  const resetKpiDrillFilters = () => {
    const empty = { keyword: '', branch: profileParams.branch_code || '', customerTypes: [], officers: [], sortBy: '', sortDir: 'desc' };
    setKpiDrillDraft({ keyword: '', branch: profileParams.branch_code || '', customerTypes: [], officers: [] });
    loadKpiDrilldown(kpiDrill.metric, 1, empty);
  };

  const exportKpiDrilldown = async () => {
    try {
      const response = await client.get('/dashboard/business-export', {
        params: {
          ...profileParams,
          metric: kpiDrill.metric,
          detail_keyword: kpiDrillFilters.keyword || undefined,
          detail_branch_code: kpiDrillFilters.branch || undefined,
          detail_customer_type: kpiDrillFilters.customerTypes?.join(',') || undefined,
          detail_officer: kpiDrillFilters.officers?.join(',') || undefined,
          sort_by: kpiDrillFilters.sortBy || undefined,
          sort_dir: kpiDrillFilters.sortDir || 'desc',
        },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data); const link = document.createElement('a');
      link.href = url; link.download = `c360_${kpiDrill.metric}_${periodKey}.xlsx`; link.click(); URL.revokeObjectURL(url);
      message.success('Đã xuất Excel theo đúng phạm vi và bộ lọc trong bảng');
    } catch (requestError) { message.error(requestError.response?.data?.detail || 'Không xuất được Excel'); }
  };
  const exportDashboardTable = async (dataset) => {
    try {
      const response = await client.get('/dashboard/table-export', {
        params: {
          ...profileParams,
          dataset,
          anomaly_keyword: dataset === 'anomalies' ? anomalyKeyword || undefined : undefined,
          anomaly_type: dataset === 'anomalies' ? anomalyType || undefined : undefined,
        },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data); const link = document.createElement('a');
      link.href = url; link.download = `c360_${dataset}_${periodKey}.xlsx`; link.click(); URL.revokeObjectURL(url);
      message.success('Đã xuất Excel theo đúng phạm vi đang áp dụng');
    } catch (requestError) { message.error(requestError.response?.data?.detail || 'Không xuất được Excel'); }
  };

  const loadAlertPage = async (page, keyword = anomalyKeyword, type = anomalyType) => {
    setAlertLoading(true);
    try {
      const { data: response } = await client.get('/dashboard/insights', {
        params: { ...profileParams, anomalies_only: true, anomaly_include_total: true, anomaly_page: page, anomaly_page_size: 12, anomaly_keyword: keyword || undefined, anomaly_type: type || undefined },
        hideGlobalLoading: true,
      });
      setInsights((current) => ({ ...current, abnormal: { ...(current?.abnormal || {}), ...(response?.abnormal || {}) } }));
      setAlertPage(page);
    } catch (requestError) {
      message.error(requestError.response?.data?.detail || 'Không tải được trang cảnh báo');
    } finally {
      setAlertLoading(false);
    }
  };
  const applyAnomalyFilters = () => loadAlertPage(1, anomalyKeyword, anomalyType);
  const topChangeRows = (key) => (topChanges[key] || []).filter((row) => {
    const keyword = topChangeKeyword.trim().toLocaleLowerCase('vi-VN');
    const keywordOk = !keyword || String(row.ma_kh || '').toLocaleLowerCase('vi-VN').includes(keyword) || String(row.ten_kh || '').toLocaleLowerCase('vi-VN').includes(keyword);
    return keywordOk && (!topChangeBranch || primaryBranchLabel(row) === topChangeBranch);
  });

  const loadQualityIssue = async (issue, page = 1) => {
    setQualityDrill((current) => ({ ...current, open: true, issue, page, loading: true }));
    try {
      const { data: response } = await client.get('/customer-processing/profile-quality', { params: { period_key: periodKey, branch_code: profileParams.branch_code, issue, page, page_size: 10 } });
      setQualityDrill({ open: true, issue, page, loading: false, items: response?.items || [], total: Number(response?.total || 0) });
    } catch (requestError) {
      message.error(requestError.response?.data?.detail || 'Không tải được danh sách chất lượng hồ sơ');
      setQualityDrill((current) => ({ ...current, loading: false }));
    }
  };

  const insightMetric = (label, value, note, tone = '', onClick) => (
    <div role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick} onKeyDown={(event) => event.key === 'Enter' && onClick?.()} className={`c360-dashboard-stat ${tone} ${onClick ? 'is-clickable' : ''}`}>
      <Text type="secondary">{label}</Text>
      <strong>{value}</strong>
      <small>{note}</small>{onClick ? <em>Xem danh sách phù hợp →</em> : null}
    </div>
  );
  const provisionMetric = (label, periodValue, accumulatedValue, source, formula) => {
    const movement = Number(periodValue || 0);
    const accumulated = Number(accumulatedValue || 0);
    const previousAccumulated = accumulated - movement;
    const movementLabel = movement < 0 ? 'Giảm/hoàn nhập' : movement > 0 ? 'Trích tăng' : 'Không biến động';
    return (
      <Tooltip title={<div><b>Nguồn: {source}</b><br />Công thức: {formula}<br />Lũy kế kỳ trước: {fullMoney(previousAccumulated)}<br />Lũy kế kỳ này: {fullMoney(accumulated)}</div>}>
        <div className={`c360-dashboard-stat ${movement < 0 ? 'is-green' : movement > 0 ? 'is-red' : 'is-blue'}`}>
          <Text type="secondary">{label}</Text>
          <strong>{compactMoney(movement)}</strong>
          <small><b>{movementLabel}</b> · {compactMoney(previousAccumulated)} → {compactMoney(accumulated)}</small>
          <small className="c360-provision-source">{source} · Di chuột xem công thức</small>
        </div>
      </Tooltip>
    );
  };
  const kpiHasLocalFilters = Boolean(
    kpiDrillFilters.keyword || kpiDrillFilters.branch
    || kpiDrillFilters.customerTypes?.length || kpiDrillFilters.officers?.length,
  );
  const kpiDrillPresentation = {
    all: { title: 'Danh mục khách hàng trong phạm vi', subtitle: 'Ảnh chụp nhanh quan hệ tài chính và sản phẩm của từng khách hàng', tone: 'blue', valueKind: 'none' },
    term_deposit: { title: 'Khách hàng có tiền gửi có kỳ hạn', subtitle: 'Tập trung vào số dư CKH cuối kỳ và đơn vị quản lý', tone: 'green', valueKind: 'money' },
    casa: { title: 'Khách hàng tạo ra TGTT bình quân', subtitle: 'Sắp xếp theo mức đóng góp CASA bình quân trong kỳ', tone: 'gold', valueKind: 'money' },
    loan: { title: 'Khách hàng có dư nợ', subtitle: 'Tập trung dư nợ và dự phòng rủi ro theo khách hàng', tone: 'red', valueKind: 'money' },
    deposit: { title: 'Khách hàng có quan hệ tiền gửi', subtitle: 'Hiển thị riêng tiền gửi CKH, TGTT bình quân và tổng quy mô tiền gửi', tone: 'green', valueKind: 'money' },
    service: { title: 'Khách hàng đang sử dụng sản phẩm dịch vụ', subtitle: 'Mỗi dòng là một khách hàng; danh sách sản phẩm được hiển thị trực tiếp', tone: 'purple', valueKind: 'count' },
    multi_branch: { title: 'Khách hàng có quan hệ đa chi nhánh', subtitle: 'Làm rõ chi nhánh chính và toàn bộ chi nhánh đang có quan hệ', tone: 'purple', valueKind: 'none' },
    funding: { title: 'Cấu thành tổng nguồn vốn huy động', subtitle: 'Số dư dương cuối kỳ sau quy đổi; loại số dư âm là thấu chi', tone: 'green', valueKind: 'money' },
    demand_deposit: { title: 'Tiền gửi không kỳ hạn', subtitle: 'Chi tiết KKH và tiền gửi thanh toán theo từng khách hàng', tone: 'blue', valueKind: 'money' },
    term_under_12: { title: 'Tiền gửi có kỳ hạn dưới 12 tháng', subtitle: 'Tách rõ dưới 6 tháng và từ 6 đến dưới 12 tháng', tone: 'gold', valueKind: 'money' },
    term_12_plus: { title: 'Tiền gửi có kỳ hạn từ 12 tháng trở lên', subtitle: 'Danh sách khách hàng và số dư cuối kỳ sau quy đổi', tone: 'purple', valueKind: 'money' },
    individual_loan: { title: 'Dư nợ khách hàng cá nhân', subtitle: 'Khách hàng loại Cá nhân/KHCN/Tư nhân trong phạm vi', tone: 'blue', valueKind: 'money' },
    legal_loan: { title: 'Dư nợ khách hàng pháp nhân', subtitle: 'Khách hàng tổ chức, doanh nghiệp và đơn vị pháp nhân', tone: 'purple', valueKind: 'money' },
    provision_accumulated: { title: 'DPRR lũy kế sau hoàn nhập', subtitle: 'DPRR chung lũy kế cộng DPRR cụ thể lũy kế', tone: 'red', valueKind: 'money' },
  }[kpiDrill.metric] || { title: kpiDrill.label || 'Khách hàng tạo ra chỉ tiêu', subtitle: 'Danh sách đúng theo chỉ tiêu và phạm vi đang áp dụng', tone: 'blue', valueKind: 'money' };
  const branchColumn = { title: 'Chi nhánh', dataIndex: 'branch_code', key: 'branch', fixed: 'left', width: 105, sorter: true, render: (value) => <Tag color="blue">{value || '—'}</Tag> };
  const customerColumn = { title: 'Khách hàng', dataIndex: 'ten_kh', key: 'customer', fixed: 'left', width: 270, sorter: true, render: (value, row) => <div><Text strong>{value || 'Chưa có tên'}</Text><br /><Text copyable>{row.ma_kh}</Text></div> };
  const officerColumn = { title: 'Cán bộ quản lý', dataIndex: 'officer_name', key: 'officer', width: 210, sorter: true, render: (value, row) => <div><Text>{value || '—'}</Text>{row.officer_code ? <><br /><Text type="secondary">{row.officer_code}</Text></> : null}</div> };
  const moneyColumn = (title, dataIndex, key = dataIndex) => ({ title, dataIndex, key, align: 'right', width: 170, sorter: true, render: fullMoney });
  const fundingDrillMetrics = ['funding', 'demand_deposit', 'non_term_deposit', 'payment_deposit', 'term_under_12', 'term_under_6', 'term_6_12', 'term_12_plus'];
  const creditDrillMetrics = ['loan', 'individual_loan', 'legal_loan', 'short_loan', 'medium_long_loan', 'overdraft'];
  const kpiDrillColumns = fundingDrillMetrics.includes(kpiDrill.metric)
    ? [branchColumn, customerColumn, moneyColumn('Tổng nguồn vốn', 'funding'), moneyColumn('Tiền gửi KKH', 'non_term'), moneyColumn('Tiền gửi thanh toán', 'payment'), moneyColumn('CKH dưới 6T', 'term_under_6'), moneyColumn('CKH 6–<12T', 'term_6_12'), moneyColumn('CKH ≥12T', 'term_12_plus'), { title: 'Số TK', dataIndex: 'account_count', align: 'center', width: 90 }, officerColumn]
    : kpiDrill.metric === 'service'
    ? [branchColumn, customerColumn,
      { title: 'Số SP/DV', dataIndex: 'service_count', align: 'center', width: 105, sorter: true, render: (value) => <Tag color="purple">{Number(value || 0).toLocaleString('vi-VN')} sản phẩm</Tag> },
      { title: 'Sản phẩm đang sử dụng', dataIndex: 'active_services', width: 420, render: (items = []) => <Space wrap size={[4, 4]}>{items.length ? items.map((item) => <Tag color="geekblue" key={item.key}>{item.label}</Tag>) : <Text type="secondary">Chưa xác định chi tiết</Text>}</Space> },
      officerColumn]
    : kpiDrill.metric === 'multi_branch'
      ? [customerColumn,
        { title: 'Chi nhánh chính', dataIndex: 'primary_branch_code', width: 140, render: (value) => <Tag color="green">{value || 'Chưa xác định'}</Tag> },
        { title: 'Các chi nhánh quan hệ', dataIndex: 'branch_codes', width: 320, render: (value) => <Space wrap size={[4, 4]}>{String(value || '').replaceAll(';', ',').split(',').filter(Boolean).map((code) => <Tag key={code}>{code.trim()}</Tag>)}</Space> },
        { title: 'Số CN', dataIndex: 'branch_count', align: 'center', width: 90 }, officerColumn]
      : kpiDrill.metric === 'deposit'
        ? [branchColumn, customerColumn, moneyColumn('Tiền gửi CKH', 'deposit'), moneyColumn('TGTT bình quân', 'casa'), { title: 'Tổng quan hệ tiền gửi', width: 190, align: 'right', render: (_, row) => <Text strong>{fullMoney(Number(row.deposit || 0) + Number(row.casa || 0))}</Text> }, officerColumn]
        : kpiDrill.metric === 'all'
          ? [branchColumn, customerColumn, moneyColumn('Tiền gửi CKH', 'deposit'), moneyColumn('TGTT bình quân', 'casa'), moneyColumn('Dư nợ', 'loan'), { title: 'SP/DV', dataIndex: 'service_count', align: 'center', width: 85 }, officerColumn]
          : creditDrillMetrics.includes(kpiDrill.metric)
            ? [branchColumn, customerColumn, moneyColumn('Tổng dư nợ', 'loan'), moneyColumn('Dự phòng', 'provision'), { title: 'Loại khách hàng', dataIndex: 'customer_type', width: 180, render: customerTypeLabel }, officerColumn]
            : [branchColumn, customerColumn, moneyColumn(kpiDrill.metric === 'casa' ? 'TGTT bình quân' : 'Tiền gửi CKH', kpiDrill.metric === 'casa' ? 'casa' : 'deposit'), { title: 'Loại khách hàng', dataIndex: 'customer_type', width: 180, render: customerTypeLabel }, officerColumn];
  const portfolioChartConfig = portfolioChart === 'funding' ? {
    title: 'So sánh cơ cấu nguồn vốn huy động',
    description: 'Đối chiếu từng cấu phần nguồn vốn với kỳ liền trước',
    previousPeriod: funding.previous_period,
    note: 'Tổng nguồn vốn là chỉ tiêu tham chiếu. Cơ cấu chi tiết gồm tiền gửi không kỳ hạn (KKH + TGTT) và tiền gửi có kỳ hạn theo nhóm thời hạn; số dư âm đã loại vì được xem là thấu chi.',
    items: [
      { key: 'funding-total', group: 'Tổng quy mô', label: 'Tổng nguồn vốn huy động', current: funding.total, previous: funding.previous?.total },
      { key: 'funding-demand', group: 'Không kỳ hạn', label: 'Tiền gửi không kỳ hạn', current: funding.demand, previous: funding.previous?.demand },
      { key: 'funding-non-term', label: 'KKH', current: funding.non_term, previous: funding.previous?.non_term },
      { key: 'funding-payment', label: 'TGTT', current: funding.payment, previous: funding.previous?.payment },
      { key: 'funding-under-6', group: 'Có kỳ hạn', label: 'Dưới 6 tháng', current: funding.term_under_6, previous: funding.previous?.term_under_6 },
      { key: 'funding-6-12', label: 'Từ 6 đến dưới 12 tháng', current: funding.term_6_to_under_12, previous: funding.previous?.term_6_to_under_12 },
      { key: 'funding-12-plus', label: 'Từ 12 tháng trở lên', current: funding.term_12_plus, previous: funding.previous?.term_12_plus },
    ],
  } : {
    title: 'So sánh cơ cấu dư nợ cuối kỳ',
    description: 'Phân tích dư nợ theo loại khách hàng và thời hạn vay',
    previousPeriod: executiveCredit.previous_period,
    note: 'Tổng dư nợ là chỉ tiêu tham chiếu. Hai nhóm “Theo loại khách hàng” và “Theo thời hạn vay” là hai góc phân loại độc lập, vì vậy không cộng chéo các thanh giữa hai nhóm.',
    items: [
      { key: 'credit-total', group: 'Tổng quy mô', label: 'Tổng dư nợ', current: executiveCredit.total, previous: executiveCredit.previous?.total },
      { key: 'credit-legal', group: 'Theo loại khách hàng', label: 'Khách hàng pháp nhân', current: executiveCredit.legal, previous: executiveCredit.previous?.legal },
      { key: 'credit-individual', label: 'Khách hàng cá nhân', current: executiveCredit.individual, previous: executiveCredit.previous?.individual },
      { key: 'credit-short', group: 'Theo thời hạn vay', label: 'Ngắn hạn', current: executiveCredit.short_term, previous: executiveCredit.previous?.short_term },
      { key: 'credit-medium-long', label: 'Trung dài hạn', current: executiveCredit.medium_long_term, previous: executiveCredit.previous?.medium_long_term },
      { key: 'credit-overdraft', label: 'Thấu chi', current: executiveCredit.overdraft, previous: executiveCredit.previous?.overdraft },
    ],
  };
  return (
    <div className="demo-page c360-customer-page c360-executive-dashboard">
      <div className="c360-dashboard-context"><Space><span className="is-live" /><Text strong>Kỳ {periodLabel(periodKey)}</Text>{loading ? <Tag color="processing">Đang tính KPI chính…</Tag> : detailLoading ? <Tag color="processing">Đang hoàn thiện các khối phân tích…</Tag> : <Tag color="success">Dữ liệu đã sẵn sàng</Tag>}</Space></div>
      <AppliedScopeBanner params={profileParams} total={kpis.total_customers} />
      <Row gutter={[16, 16]} className={loading ? 'c360-kpi-row is-loading' : 'c360-kpi-row'}>
        <Col xs={24} sm={12} xl={6}><RealMetric loading={loading} title="Tổng khách hàng" value={Number(kpis.total_customers || 0).toLocaleString('vi-VN')} current={compare.customers?.current ?? kpis.total_customers} previous={compare.customers?.previous} icon={<TeamOutlined />} tone="blue" note={`${Number(comparison?.new_customers || 0).toLocaleString('vi-VN')} khách hàng mới trong kỳ`} onClick={() => openKpiDrilldown('all')} explanation={{ formula: 'Đếm duy nhất mã KH lõi trong tập CIF đã xử lý', source: 'Kho CIF và kết quả xử lý C360', unit: 'Khách hàng' }} /></Col>
        <Col xs={24} sm={12} xl={6}><RealMetric loading={loading} title="Tổng nguồn vốn huy động" value={compactMoney(funding.total)} current={funding.total} previous={funding.previous?.total} icon={<WalletOutlined />} tone="green" note="CKH + KKH + TGTT · sau quy đổi" onClick={() => openKpiDrilldown('funding')} explanation={{ formula: 'SUM số dư cuối kỳ dương = CKH + KKH + TGTT; loại số dư âm là thấu chi', source: 'DP01 · CURRENT_BALANCE, MONTH_TERM, TYGIA' }} /></Col>
        <Col xs={24} sm={12} xl={6}><RealMetric loading={loading} title="Tổng dư nợ" value={compactMoney(executiveCredit.total)} current={executiveCredit.total} previous={executiveCredit.previous?.total} icon={<BankOutlined />} tone="red" note="LN01 khớp PF10 đến hàng đồng" onClick={() => openKpiDrilldown('loan')} explanation={{ formula: 'Dư nợ ngắn hạn + trung dài hạn + thấu chi', source: 'LN01 DU_NO; đối soát PF10 EOMBAL' }} /></Col>
        <Col xs={24} sm={12} xl={6}><RealMetric loading={loading} title="Tiền gửi không kỳ hạn" value={compactMoney(funding.demand)} current={funding.demand} previous={funding.previous?.demand} icon={<BarChartOutlined />} tone="gold" note={`KKH + TGTT · ${funding.total ? (Number(funding.demand || 0) / Number(funding.total) * 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : 0}% nguồn vốn`} onClick={() => openKpiDrilldown('demand_deposit')} explanation={{ formula: 'Tiền gửi KKH + tiền gửi thanh toán có số dư cuối kỳ dương', source: 'DP01 · CURRENT_BALANCE, MONTH_TERM, DP_TYPE_NAME, TYGIA' }} /></Col>
      </Row>
      <Tabs className="c360-dashboard-view-tabs" activeKey={dashboardView} onChange={setDashboardView} items={[{ key: 'results', label: 'Kết quả kỳ' }, { key: 'alerts', label: <span>Cần xử lý <Tag color="error">{Number(abnormal.total || 0).toLocaleString('vi-VN')}</Tag></span> }]} />
      {dashboardView === 'results' && <>
      <Card
        title="Tổng quan khách hàng"
        className="demo-panel demo-section c360-dashboard-overview"
        loading={blockLoading.overview}
      >
        <div className="c360-dashboard-stat-grid is-four">
          {insightMetric('Có tiền gửi', Number(customerOverview.with_deposit || 0).toLocaleString('vi-VN'), 'TG CKH + TGTT bình quân > 0', 'is-green', () => openKpiDrilldown('deposit'))}
          {insightMetric('Có tiền vay', Number(customerOverview.with_loan || 0).toLocaleString('vi-VN'), 'Tổng dư nợ cuối kỳ > 0', 'is-red', () => openKpiDrilldown('loan'))}
          {insightMetric('Khách hàng có SP/DV', Number(customerOverview.with_digital_service || 0).toLocaleString('vi-VN'), 'Số KH duy nhất có ít nhất 1 SP/DV tại phạm vi đã chọn', 'is-blue', () => openKpiDrilldown('service'))}
          {insightMetric('Quan hệ đa chi nhánh', Number(customerOverview.multi_branch || 0).toLocaleString('vi-VN'), 'Từ hai chi nhánh trở lên', 'is-purple', () => openKpiDrilldown('multi_branch'))}
        </div>
      </Card>
      <Card title="Nguồn vốn huy động sau quy đổi" className="demo-panel demo-section c360-portfolio-section is-funding" loading={blockLoading.deposit} extra={<Space wrap><Tag color={Math.abs(Number(funding.identity_check?.difference || 0)) < 1 ? 'success' : 'error'}>CKH + KKH + TGTT {Math.abs(Number(funding.identity_check?.difference || 0)) < 1 ? 'khớp tổng' : 'có chênh lệch'}</Tag><Button size="small" icon={<BarChartOutlined />} onClick={() => setPortfolioChart('funding')}>Xem biểu đồ</Button></Space>}>
        <div className="c360-portfolio-hero"><div><Text type="secondary">Tổng nguồn vốn cuối kỳ</Text><strong>{fullMoney(funding.total)}</strong><small>DP01 · chỉ lấy CURRENT_BALANCE dương · quy đổi từng tài khoản bằng TYGIA</small></div><span className={Number(fundingChanges.total?.change || 0) >= 0 ? 'is-up' : 'is-down'}>{changeCaption(fundingChanges.total)}</span></div>
        <div className="c360-portfolio-grid is-three">
          {portfolioMetric('Tiền gửi không kỳ hạn', funding.demand, fundingChanges.demand, 'blue', () => openKpiDrilldown('demand_deposit'), { source: 'DP01', columns: 'CURRENT_BALANCE, MONTH_TERM, DP_TYPE_NAME, TYGIA', formula: 'MONTH_TERM = 0; gồm KKH và TGTT', currency: 'Đã quy đổi VNĐ' }, <div className="c360-portfolio-split"><span>KKH <b>{compactMoney(funding.non_term)}</b></span><span>TGTT <b>{compactMoney(funding.payment)}</b></span></div>)}
          {portfolioMetric('Có kỳ hạn dưới 12 tháng', Number(funding.term_under_6 || 0) + Number(funding.term_6_to_under_12 || 0), { current: Number(funding.term_under_6 || 0) + Number(funding.term_6_to_under_12 || 0), previous: Number(funding.previous?.term_under_6 || 0) + Number(funding.previous?.term_6_to_under_12 || 0), change: Number(fundingChanges.term_under_6?.change || 0) + Number(fundingChanges.term_6_to_under_12?.change || 0), change_pct: (Number(funding.previous?.term_under_6 || 0) + Number(funding.previous?.term_6_to_under_12 || 0)) ? ((Number(funding.term_under_6 || 0) + Number(funding.term_6_to_under_12 || 0) - Number(funding.previous?.term_under_6 || 0) - Number(funding.previous?.term_6_to_under_12 || 0)) / (Number(funding.previous?.term_under_6 || 0) + Number(funding.previous?.term_6_to_under_12 || 0)) * 100) : null }, 'gold', () => openKpiDrilldown('term_under_12'), { source: 'DP01/PF14', columns: 'CURRENT_BALANCE, MONTH_TERM, TYGIA', formula: '0 < MONTH_TERM < 12', currency: 'Đã quy đổi VNĐ' }, <div className="c360-portfolio-split"><span>Dưới 6T <b>{compactMoney(funding.term_under_6)}</b></span><span>6–&lt;12T <b>{compactMoney(funding.term_6_to_under_12)}</b></span></div>)}
          {portfolioMetric('Có kỳ hạn từ 12 tháng', funding.term_12_plus, fundingChanges.term_12_plus, 'purple', () => openKpiDrilldown('term_12_plus'), { source: 'DP01/PF14', columns: 'CURRENT_BALANCE, MONTH_TERM, TYGIA', formula: 'MONTH_TERM ≥ 12', currency: 'Đã quy đổi VNĐ' })}
        </div>
      </Card>
      <Card title="Cơ cấu dư nợ cuối kỳ" className="demo-panel demo-section c360-portfolio-section is-credit" loading={blockLoading.risk} extra={<Space wrap><Tag color={Math.abs(Number(executiveCredit.identity_check?.term_components_difference || 0)) < 1 ? 'success' : 'error'}>Ngắn hạn + trung dài hạn + thấu chi {Math.abs(Number(executiveCredit.identity_check?.term_components_difference || 0)) < 1 ? 'khớp tổng' : 'có chênh lệch'}</Tag><Button size="small" icon={<BarChartOutlined />} onClick={() => setPortfolioChart('credit')}>Xem biểu đồ</Button></Space>}>
        <div className="c360-portfolio-hero"><div><Text type="secondary">Tổng dư nợ chính xác</Text><strong>{fullMoney(executiveCredit.total)}</strong><small>LN01 DU_NO · PF10 EOMBAL đối soát khớp đến hàng đồng</small></div><span className={Number(creditChanges.total?.change || 0) >= 0 ? 'is-up' : 'is-down'}>{changeCaption(creditChanges.total)}</span></div>
        <div className="c360-portfolio-grid is-five">
          {portfolioMetric('KH pháp nhân', executiveCredit.legal, creditChanges.legal, 'purple', () => openKpiDrilldown('legal_loan'), { source: 'LN01 + Kho CIF', columns: 'DU_NO, LOAIKH', formula: 'SUM DU_NO của KH không thuộc Cá nhân/KHCN/Tư nhân', currency: 'VNĐ' })}
          {portfolioMetric('KH cá nhân', executiveCredit.individual, creditChanges.individual, 'blue', () => openKpiDrilldown('individual_loan'), { source: 'LN01 + Kho CIF', columns: 'DU_NO, LOAIKH', formula: 'SUM DU_NO của Cá nhân/KHCN/Tư nhân', currency: 'VNĐ' })}
          {portfolioMetric('Ngắn hạn', executiveCredit.short_term, creditChanges.short_term, 'green', () => openKpiDrilldown('short_loan'), { source: 'PF10/LN01', columns: 'EOMBAL/DU_NO, LNTYPE=100', formula: 'SUM dư nợ ngắn hạn', currency: 'Đã quy đổi VNĐ' })}
          {portfolioMetric('Trung dài hạn', executiveCredit.medium_long_term, creditChanges.medium_long_term, 'gold', () => openKpiDrilldown('medium_long_loan'), { source: 'PF10/LN01', columns: 'EOMBAL/DU_NO, LNTYPE=110/120', formula: 'SUM dư nợ trung hạn và dài hạn', currency: 'Đã quy đổi VNĐ' })}
          {portfolioMetric('Thấu chi', executiveCredit.overdraft, creditChanges.overdraft, 'red', () => openKpiDrilldown('overdraft'), { source: 'PF10/LN01', columns: 'EOMBAL/DU_NO, LNTYPE=241', formula: 'SUM dư nợ thấu chi; không cộng số dư DP01 âm vào tiền gửi', currency: 'Đã quy đổi VNĐ' })}
        </div>
      </Card>
      <Row gutter={[16, 16]} className="demo-section">
        <Col xs={24} xl={12}>
          <Card title="Rủi ro tín dụng & XLRR" className="demo-panel c360-dashboard-domain" loading={blockLoading.risk}>
            <Alert className="c360-provision-dashboard-guide" type="info" showIcon message="Cách hiểu DPRR trong kỳ" description="Đây là mức lũy kế kỳ này trừ lũy kế kỳ trước. Số âm thể hiện giảm/hoàn nhập dự phòng, không phải trích lập âm." />
            <div className="c360-dashboard-stat-grid">
              {insightMetric('DPRR sau hoàn nhập (lũy kế)', compactMoney(executiveRisk.provision_after_reversal_accumulated), `Biến động ${compactMoney(executiveRisk.provision_after_reversal_change)}`, 'is-red', () => openKpiDrilldown('provision_accumulated'))}
              {provisionMetric('DPRR chung trong kỳ', executiveRisk.general_period, executiveRisk.general_accumulated, 'LN01 · Nhóm nợ 1–4', '(Dư nợ đủ điều kiện kỳ này − kỳ trước) × 0,75%')}
              {provisionMetric('DPRR cụ thể trong kỳ', executiveRisk.specific_period, executiveRisk.specific_accumulated, 'BC29 · Nhóm nợ 2–5', 'DPRR cụ thể lũy kế kỳ này − lũy kế kỳ trước')}
              {insightMetric('Dư nợ XLRR cuối kỳ', compactMoney(executiveRisk.written_off_balance), 'SUM DUNO_GOC_HIENTAI · RR01', 'is-gold')}
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="Thu nhập phí & sản phẩm" className="demo-panel c360-dashboard-domain" loading={blockLoading.income}>
            <div className="c360-dashboard-stat-grid">
              {insightMetric('Tổng phí ghi nhận', compactMoney(executiveIncome.total_fee), 'Tổng các nguồn phí hiện có', 'is-green')}
              {(executiveIncome.fees || []).slice(0, 3).map((item, index) => insightMetric(item.label, compactMoney(item.value), 'Theo công thức nghiệp vụ cấu hình', ['is-blue', 'is-purple', 'is-gold'][index]))}
            </div>
          </Card>
        </Col>
      </Row>
      <Card title="Kết quả theo chi nhánh" className="demo-panel demo-section c360-branch-results" loading={blockLoading.branches} extra={<Space><Tooltip title="Mỗi dòng cộng đúng số liệu phát sinh tại chi nhánh; khách hàng đa chi nhánh không bị dồn toàn bộ vào chi nhánh chính."><Text type="secondary">Theo quan hệ KH–chi nhánh</Text></Tooltip>{canExport ? <Button size="small" icon={<DownloadOutlined />} onClick={() => exportDashboardTable('branches')}>Excel</Button> : null}</Space>}>
        <Table size="small" sticky rowKey="branch_code" pagination={false} dataSource={analytics?.branches || []} scroll={{ x: 1180, y: 360 }} columns={[
          { title: 'Chi nhánh', dataIndex: 'branch_code', fixed: 'left', width: 120, render: (value) => <Tag color="blue">{value}</Tag> },
          { title: 'Khách hàng', dataIndex: 'customers', align: 'right', width: 130, render: (value) => Number(value || 0).toLocaleString('vi-VN') },
          { title: 'Tiền gửi CKH', dataIndex: 'deposit', align: 'right', width: 185, render: fullMoney },
          { title: 'TGTT bình quân', dataIndex: 'casa', align: 'right', width: 185, render: fullMoney },
          { title: 'Dư nợ', dataIndex: 'loan', align: 'right', width: 185, render: fullMoney },
          { title: 'Thu phí', dataIndex: 'fee', align: 'right', width: 170, render: fullMoney },
          { title: 'Tổng quy mô', align: 'right', width: 190, render: (_, row) => fullMoney(Number(row.deposit || 0) + Number(row.casa || 0) + Number(row.loan || 0)) },
          { title: 'Cán bộ có danh mục', dataIndex: 'officers', align: 'right', width: 155, render: (value) => Number(value || 0).toLocaleString('vi-VN') },
        ]} />
      </Card>
      </>}
      {dashboardView === 'alerts' && <>
      <div className="c360-dashboard-section-title is-warning"><div><Text className="demo-eyebrow">CẦN XỬ LÝ</Text><Title level={4}>Cảnh báo và biến động cần rà soát</Title></div><Text type="secondary">Bấm khách hàng để mở hồ sơ C360</Text></div>
      <Card title="Chất lượng hồ sơ khách hàng" className="demo-panel demo-section">
        <div className="c360-quality-action-grid">
          <button type="button" onClick={() => loadQualityIssue('missing_officer')}><UserOutlined /><span><Text strong>Khách hàng chưa có CBQL</Text><small>Cả mã và tên cán bộ đang trống theo nguồn đã xử lý</small></span><strong>{Number(quality.summary?.missing_officer || 0).toLocaleString('vi-VN')}</strong></button>
          <button type="button" onClick={() => loadQualityIssue('unclear_primary_branch')}><BankOutlined /><span><Text strong>Đa chi nhánh chưa rõ chi nhánh chính</Text><small>Có từ hai quan hệ nhưng thiếu hoặc mâu thuẫn mã chi nhánh chính</small></span><strong>{Number(quality.summary?.unclear_primary_branch || 0).toLocaleString('vi-VN')}</strong></button>
        </div>
      </Card>
      <Card title="Khách hàng có biến động bất thường" className="demo-panel demo-section" loading={blockLoading.alerts} extra={canExport ? <Button size="small" icon={<DownloadOutlined />} onClick={() => exportDashboardTable('anomalies')}>Xuất Excel</Button> : null}>
        <div className="c360-anomaly-summary">
          <Tag color="error">Tiền gửi giảm mạnh: {Number(abnormal.deposit_drop_count || 0).toLocaleString('vi-VN')}</Tag>
          <Tag color="warning">Dư nợ tăng nhanh: {Number(abnormal.loan_increase_count || 0).toLocaleString('vi-VN')}</Tag>
          <Tag color="processing">Giảm sản phẩm: {Number(abnormal.service_drop_count || 0).toLocaleString('vi-VN')}</Tag>
          <Text type="secondary">Ngưỡng cảnh báo biến động tiền gửi/dư nợ: 30% so kỳ trước.</Text>
        </div>
        <div className="c360-table-filter-bar">
          <Input allowClear value={anomalyKeyword} placeholder="Tên hoặc mã khách hàng · Enter để lọc" onChange={(event) => setAnomalyKeyword(event.target.value)} onPressEnter={applyAnomalyFilters} />
          <Select allowClear value={anomalyType} placeholder="Tất cả loại cảnh báo" onChange={(value) => { setAnomalyType(value); loadAlertPage(1, anomalyKeyword, value); }} options={[{ value: 'deposit_drop', label: 'Tiền gửi giảm mạnh' }, { value: 'loan_increase', label: 'Dư nợ tăng nhanh' }, { value: 'service_drop', label: 'Giảm sản phẩm' }]} />
          <Button icon={<ReloadOutlined />} onClick={() => { setAnomalyKeyword(''); setAnomalyType(undefined); loadAlertPage(1, '', undefined); }}>Xóa lọc</Button>
        </div>
        <Table
          size="small"
          rowKey="ma_kh"
          loading={alertLoading}
          pagination={{ current: alertPage, pageSize: 12, total: Number(abnormal.total || 0), showSizeChanger: false, showTotal: (value) => `${value.toLocaleString('vi-VN')} khách hàng`, onChange: loadAlertPage }}
          dataSource={abnormal?.items || []}
          scroll={{ x: 1180, y: 390 }}
          onRow={(row) => ({ onClick: () => openInsightCustomer(row) })}
          rowClassName="demo-clickable-row"
          locale={{ emptyText: 'Không phát hiện khách hàng có biến động vượt ngưỡng trong kỳ' }}
          columns={[
            { title: 'Khách hàng', fixed: 'left', width: 240, render: (_, row) => <div><Text strong>{row.ten_kh || 'Chưa có tên'}</Text><br /><Text type="secondary">{row.ma_kh}</Text></div> },
            { title: 'Quan hệ đang xem', width: 155, render: (_, row) => <div><Text strong>{row.viewing_branch_code || branchCode || primaryBranchLabel(row)}</Text>{row.primary_branch_code && row.primary_branch_code !== (row.viewing_branch_code || branchCode) ? <><br /><Tag color="blue">CN chính: {row.primary_branch_code}</Tag></> : null}</div> },
            { title: 'Cán bộ tại đơn vị', width: 175, render: (_, row) => row.viewing_officer_name || row.viewing_officer_code || '—' },
            { title: 'Cảnh báo', dataIndex: 'flags', width: 270, render: (flags = []) => <Space size={[4, 4]} wrap>{flags.map((flag) => <Tag key={flag} color={flag.includes('Tiền gửi') ? 'error' : flag.includes('Dư nợ') ? 'warning' : 'processing'}>{flag}</Tag>)}</Space> },
            { title: 'Tiền gửi kỳ này', dataIndex: 'deposit', align: 'right', width: 145, render: compactMoney },
            { title: 'Tiền gửi kỳ trước', dataIndex: 'previous_deposit', align: 'right', width: 145, render: compactMoney },
            { title: 'Dư nợ kỳ này', dataIndex: 'loan', align: 'right', width: 135, render: compactMoney },
            { title: 'Dư nợ kỳ trước', dataIndex: 'previous_loan', align: 'right', width: 135, render: compactMoney },
          ]}
        />
      </Card>
      <Card title="Top biến động trong kỳ" className="demo-panel demo-section" loading={blockLoading.changes} extra={canExport ? <Button size="small" icon={<DownloadOutlined />} onClick={() => exportDashboardTable('top_changes')}>Xuất Excel</Button> : null}>
        <div className="c360-table-filter-bar">
          <Input allowClear value={topChangeKeyword} placeholder="Lọc nhanh tên hoặc mã khách hàng" onChange={(event) => setTopChangeKeyword(event.target.value)} />
          <Select allowClear value={topChangeBranch} placeholder="Tất cả chi nhánh" onChange={setTopChangeBranch} options={[...new Set(Object.values(topChanges).flat().map((row) => primaryBranchLabel(row)).filter(Boolean))].map((value) => ({ value, label: `Chi nhánh ${value}` }))} />
        </div>
        <Tabs items={[
          ['deposit_increase', 'Tăng tiền gửi'], ['deposit_decrease', 'Giảm tiền gửi'], ['loan_increase', 'Tăng dư nợ'], ['fee', 'Thu phí lớn'],
        ].map(([key, label]) => ({ key, label, children: <Table size="small" sticky rowKey="ma_kh" pagination={false} dataSource={topChangeRows(key)} onRow={(row) => ({ onClick: () => openInsightCustomer(row) })} rowClassName="demo-clickable-row" scroll={{ x: 920, y: 340 }} columns={[
          { title: 'Khách hàng', fixed: 'left', width: 260, render: (_, row) => <div><Text strong>{row.ten_kh || 'Chưa có tên'}</Text><br /><Text copyable>{row.ma_kh}</Text></div> },
          { title: 'Chi nhánh', width: 110, render: (_, row) => primaryBranchLabel(row) },
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
              { title: 'CN chính', width: 100, render: (_, row) => primaryBranchLabel(row) },
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
      <PortfolioComparisonModal
        open={Boolean(portfolioChart)}
        onClose={() => setPortfolioChart('')}
        title={portfolioChartConfig.title}
        description={portfolioChartConfig.description}
        periodKey={periodKey}
        previousPeriod={portfolioChartConfig.previousPeriod}
        items={portfolioChartConfig.items}
        note={portfolioChartConfig.note}
      />
      <Drawer width="min(1040px, 96vw)" open={qualityDrill.open} onClose={() => setQualityDrill((current) => ({ ...current, open: false }))} title={qualityDrill.issue === 'missing_officer' ? 'Khách hàng chưa có cán bộ quản lý' : 'Khách hàng đa chi nhánh chưa rõ chi nhánh chính'}>
        <Alert showIcon type="info" message={`${qualityDrill.total.toLocaleString('vi-VN')} hồ sơ cần rà soát`} description={qualityDrill.issue === 'missing_officer' ? 'Cán bộ ở chi nhánh khác không được tự động gán sang.' : 'Chi nhánh chính bị thiếu hoặc không nằm trong danh sách quan hệ.'} style={{ marginBottom: 12 }} />
        <Table loading={qualityDrill.loading} size="small" sticky rowKey="ma_kh" dataSource={qualityDrill.items} onRow={(row) => ({ onClick: () => onOpenCustomer(row) })} rowClassName="demo-clickable-row" pagination={{ current: qualityDrill.page, pageSize: 10, total: qualityDrill.total, showSizeChanger: false, onChange: (page) => loadQualityIssue(qualityDrill.issue, page) }} scroll={{ x: 950, y: 'calc(100vh - 250px)' }} columns={[
          { title: 'Chi nhánh chính', dataIndex: 'primary_branch_code', width: 150, fixed: 'left', render: (value, row) => row.primary_branch_configured ? <Tag color="gold">{value}</Tag> : <div><Tag color="error">Chưa xác nhận</Tag>{row.suggested_primary_branch ? <small>Gợi ý: {row.suggested_primary_branch}</small> : null}</div> }, { title: 'Khách hàng', width: 270, render: (_, row) => <div><Text strong>{row.ten_kh || 'Chưa có tên'}</Text><br /><Text copyable>{row.ma_kh}</Text></div> }, { title: 'Các chi nhánh quan hệ', dataIndex: 'branch_codes', width: 200 }, { title: 'Số CN', dataIndex: 'branch_count', width: 80, align: 'center' }, { title: 'CBQL', width: 190, render: (_, row) => row.ten_can_bo || row.ma_cb || <Tag color="error">Chưa có</Tag> }, { title: 'Tiền gửi', dataIndex: 'so_du_tien_gui', width: 150, align: 'right', render: compactMoney }, { title: 'Dư nợ', dataIndex: 'so_du_tien_vay', width: 150, align: 'right', render: compactMoney },
        ]} />
      </Drawer>
      <Drawer rootClassName={`c360-kpi-drill-drawer is-${kpiDrillPresentation.tone}`} width="min(1180px, 97vw)" open={kpiDrill.open} onClose={() => setKpiDrill((current) => ({ ...current, open: false }))} title={<div className="c360-kpi-drill-title"><span><TeamOutlined /></span><div><strong>{kpiDrillPresentation.title}</strong><small>{kpiDrillPresentation.subtitle} · Kỳ {periodLabel(periodKey)}</small></div></div>} extra={canExport ? <Button icon={<DownloadOutlined />} onClick={exportKpiDrilldown}>Xuất Excel</Button> : null}>
        <AppliedScopeBanner params={profileParams} total={kpiDrill.total} />
        <div className="c360-kpi-drill-filters">
          <Input
            allowClear
            value={kpiDrillDraft.keyword}
            placeholder="Tên khách hàng hoặc mã KH · Enter để tìm"
            onChange={(event) => setKpiDrillDraft((current) => ({ ...current, keyword: event.target.value }))}
            onPressEnter={applyKpiDrillFilters}
          />
          <Select allowClear disabled={Boolean(profileParams.branch_code)} value={kpiDrillDraft.branch || undefined} placeholder="Chi nhánh" onChange={(branch) => setKpiDrillDraft((current) => ({ ...current, branch: branch || '', officers: [] }))} options={(filterOptions.branches || []).map((item) => ({ value: item.value, label: item.label }))} />
          <Select mode="multiple" allowClear maxTagCount="responsive" value={kpiDrillDraft.customerTypes} placeholder="Loại khách hàng" onChange={(customerTypes) => setKpiDrillDraft((current) => ({ ...current, customerTypes }))} options={(filterOptions.customer_types || []).map((item) => ({ value: typeof item === 'string' ? item : item.value, label: customerTypeLabel(typeof item === 'string' ? item : item.label) }))} />
          <Select mode="multiple" allowClear showSearch optionFilterProp="label" maxTagCount="responsive" value={kpiDrillDraft.officers} placeholder="Cán bộ quản lý" onChange={(officers) => setKpiDrillDraft((current) => ({ ...current, officers }))} options={(filterOptions.officers || []).map((item) => ({ value: item.code || item.value, label: item.label || item.name }))} />
          <Button icon={<ReloadOutlined />} onClick={resetKpiDrillFilters}>Xóa lọc</Button>
        </div>
        <div className="c360-kpi-drill-summary"><span><strong>{kpiDrill.total.toLocaleString('vi-VN')}</strong><small>khách hàng phù hợp</small></span>{kpiDrillPresentation.valueKind !== 'none' ? <span><strong>{kpiDrillPresentation.valueKind === 'count' ? Number(kpiDrill.totalValue || 0).toLocaleString('vi-VN') : fullMoney(kpiDrill.totalValue)}</strong><small>{kpiDrillPresentation.valueKind === 'count' ? 'lượt sản phẩm đang sử dụng' : 'tổng giá trị theo bộ lọc'}</small></span> : null}<Tag color={kpiHasLocalFilters ? 'processing' : 'success'}>{kpiHasLocalFilters ? 'Đã áp dụng bộ lọc trong bảng' : 'Đúng phạm vi chung'}</Tag></div>
        <Table loading={{ spinning: kpiDrillLoading, tip: 'Đang truy vấn khách hàng tạo ra chỉ tiêu…' }} size="small" sticky rowKey="ma_kh" dataSource={kpiDrill.items} rowClassName="demo-clickable-row" onRow={(row) => ({ onClick: () => onOpenCustomer(context.sessionData?.profiles?.items?.find((item) => item.ma_kh === row.ma_kh) || row) })} scroll={{ x: 1240, y: 'calc(100vh - 330px)' }} pagination={{ current: kpiDrill.page, pageSize: 20, total: kpiDrill.total, showSizeChanger: false, showTotal: (value) => `${value.toLocaleString('vi-VN')} khách hàng`, onChange: (page) => loadKpiDrilldown(kpiDrill.metric, page) }} onChange={(_, __, sorter) => {
          const next = { sortBy: sorter?.columnKey || '', sortDir: sorter?.order === 'ascend' ? 'asc' : 'desc' };
          loadKpiDrilldown(kpiDrill.metric, 1, next);
        }} columns={kpiDrillColumns} />
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

function RealCustomerList({ context, onOpenCustomer, currentUser }) {
  const { periodKey, branchCode, pgdCode, refreshKey, profileParams = {}, sessionData, sessionLoading, filterOptions: sharedFilterOptions = {} } = context;
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
    'customer', 'location', 'officer', 'latest_relationship', 'deposit', 'casa', 'loan', 'products', 'status', 'telephone',
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const canExport = hasPermission(currentUser, 'customer:export');

  const requestParams = useMemo(() => {
    const [sortBy, sortDir] = sort.split(':');
    const localParams = {
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
    return {
      ...context.profileParams,
      ...Object.fromEntries(Object.entries(localParams).filter(([, value]) => value !== undefined)),
    };
  }, [branchCode, filters, periodKey, pgdCode, query, sort]);

  const load = useCallback(async () => {
    if (!periodKey) return;
    if (sessionLoading) {
      setLoading(true);
      return;
    }
    const currentScopeKey = JSON.stringify(profileParams);
    const isDefaultView = page === 1 && pageSize === PAGE_SIZE && !query
      && sort === 'so_du_tien_gui:desc' && filters === EMPTY_CUSTOMER_FILTERS
      && sessionData?.periodKey === periodKey && sessionData?.scopeKey === currentScopeKey
      && sessionData?.profiles;
    if (isDefaultView) {
      setRows(sessionData.profiles?.items || []);
      setTotal(Number(sessionData.profiles?.total || 0));
      setSummary(sessionData.summary || {});
      setFilterOptions(sharedFilterOptions || { loan_types: [], customer_types: [], officers: [] });
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [profilesRes, summaryRes] = await Promise.all([
        client.get('/customer-processing/profiles', {
          params: { ...requestParams, page, page_size: pageSize, include_total: true },
        }),
        client.get('/customer-processing/profile-summary', { params: requestParams }),
      ]);
      setRows(profilesRes.data?.items || []);
      setTotal(Number(profilesRes.data?.total || 0));
      setSummary(summaryRes.data || {});
      client.get('/customer-processing/profile-filter-options', {
        params: { period_key: periodKey, branch_code: branchCode || undefined, pgd_code: pgdCode || undefined },
        hideGlobalLoading: true,
      }).then(({ data }) => setFilterOptions(data || { loan_types: [], officers: [] })).catch(() => {});
    } catch (requestError) {
      setError(requestError.response?.data?.detail || requestError.message || 'Không tải được danh sách');
    } finally {
      setLoading(false);
    }
  }, [branchCode, filters, page, pageSize, periodKey, pgdCode, query, refreshKey, requestParams, sessionData, sessionLoading, sharedFilterOptions, sort]);
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
          <span><Text strong>{value || 'Chưa có tên'}</Text><Text type="secondary">{row.ma_kh} · {customerTypeLabel(row.loai_khach_hang)}</Text></span>
        </div>
      ),
    },
    { key: 'location', title: branchCode ? 'Quan hệ đang xem' : 'Chi nhánh/PGD chính', width: 210, render: (_, row) => <div><Text strong>{row.viewing_branch_code || primaryBranchLabel(row)}</Text><br /><Text type="secondary">{row.viewing_pgd_name || row.viewing_pgd_code || row.primary_pgd_name || row.primary_pgd_code || 'Chưa xác định'}</Text>{row.viewing_branch_code && row.primary_branch_code && row.viewing_branch_code !== row.primary_branch_code ? <><br /><Tag color="blue">CN chính: {row.primary_branch_code}</Tag></> : null}</div> },
    { key: 'officer', title: 'Cán bộ quản lý', dataIndex: 'ten_can_bo', width: 180, render: (value, row) => <div><Text>{value || row.ma_cb || '—'}</Text>{value && row.ma_cb ? <><br /><Text type="secondary">{row.ma_cb}</Text></> : null}</div> },
    { key: 'latest_relationship', title: 'Quan hệ gần nhất', width: 190, render: (_, row) => row.latest_relationship_date ? <div><Text strong>{dateLabel(row.latest_relationship_date)}</Text><br /><Text type="secondary">{row.latest_relationship_type} · {row.latest_relationship_source}</Text></div> : <Text type="secondary">Chưa xác định từ nguồn</Text> },
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
      <div className="demo-page-heading c360-customer-list-heading">
        <div><Title level={2}>Danh sách khách hàng C360</Title><Text type="secondary">Danh mục khách hàng đầy đủ theo phạm vi phân tích đang áp dụng</Text></div>
        <Space wrap><Tag color="success">KỲ {periodLabel(periodKey)}</Tag>{canExport ? <Button icon={<DownloadOutlined />} loading={exporting} onClick={exportExcel}>Xuất Excel</Button> : null}</Space>
      </div>
      <Row gutter={[12, 12]} className="c360-customer-summary">
        <Col xs={12} lg={6}><Card><Text type="secondary">Khách hàng phù hợp</Text><strong>{Number(summary.total_customers || 0).toLocaleString('vi-VN')}</strong><small>Theo bộ lọc hiện tại</small></Card></Col>
        <Col xs={12} lg={6}><Card><Text type="secondary">Tổng tiền gửi</Text><strong>{compactMoney(summary.total_deposit)}</strong><small>Số dư CKH cuối kỳ</small></Card></Col>
        <Col xs={12} lg={6}><Card><Text type="secondary">Tổng dư nợ</Text><strong>{compactMoney(summary.total_loan)}</strong><small>Dư nợ tại phạm vi chọn</small></Card></Col>
        <Col xs={12} lg={6}><Card><Text type="secondary">Chưa dùng dịch vụ</Text><strong>{Number(summary.no_service_customers || 0).toLocaleString('vi-VN')}</strong><small>Cần xem xét bán chéo</small></Card></Col>
      </Row>
      <Card className="demo-filter-card c360-customer-filters">
        <div className="c360-global-filter-note">
          <FilterOutlined />
          <span><strong>Đang sử dụng bộ lọc chung của hệ thống</strong><small>Tên/mã khách hàng và cán bộ quản lý được chọn riêng trên thanh bộ lọc phía trên.</small></span>
        </div>
        <Select value={sort} onChange={setSort} options={[
          { value: 'so_du_tien_gui:desc', label: 'Tiền gửi: cao → thấp' },
          { value: 'so_du_tien_vay:desc', label: 'Dư nợ: cao → thấp' },
          { value: 'so_du_tgtt_binh_quan:desc', label: 'TGTT: cao → thấp' },
          { value: 'ten_kh:asc', label: 'Tên khách hàng: A → Z' },
        ]} />
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
      {false && <Drawer
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
          <label className="is-full"><Text strong>Loại khách hàng</Text><Select mode="multiple" allowClear value={draftFilters.customer_types} placeholder="Chọn một hoặc nhiều loại khách hàng" options={(filterOptions.customer_types || []).map((value) => ({ value, label: customerTypeLabel(value) }))} onChange={(value) => updateDraftFilter('customer_types', value)} /></label>
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
      </Drawer>}
    </div>
  );
}

const ANALYSIS_META = {
  'analysis-deposit': { eyebrow: 'PHÂN TÍCH NGHIỆP VỤ', title: 'Tiền gửi & dòng tiền', description: 'Theo dõi quy mô nguồn vốn, CASA, doanh số thanh toán và biến động tài khoản.', tone: 'green' },
  'analysis-credit': { eyebrow: 'PHÂN TÍCH NGHIỆP VỤ', title: 'Tiền vay & rủi ro', description: 'Phân tích cơ cấu dư nợ, nhóm nợ, dự phòng và thu hồi nợ đã xử lý rủi ro.', tone: 'red' },
  'analysis-income': { eyebrow: 'PHÂN TÍCH NGHIỆP VỤ', title: 'Thu nhập & sản phẩm', description: 'Theo dõi nguồn thu phí, mức thâm nhập sản phẩm và khoảng trống bán chéo.', tone: 'blue' },
  'analysis-unit': { eyebrow: 'PHÂN TÍCH NGHIỆP VỤ', title: 'Đơn vị & cán bộ', description: 'So sánh kết quả giữa chi nhánh và danh mục khách hàng do từng cán bộ quản lý.', tone: 'purple' },
};

function MetricDefinitionTooltip({ definition, periodKey, children }) {
  if (!definition) return children;
  return <Tooltip placement="top" title={<div className="c360-metric-definition"><div><b>Nguồn file:</b> {definition.source}</div><div><b>Cột nguồn:</b> {definition.columns}</div><div><b>Công thức:</b> {definition.formula}</div><div><b>Kỳ dữ liệu:</b> {periodLabel(periodKey)}</div><div><b>Ngoại tệ:</b> {definition.currency}</div></div>}>{children}</Tooltip>;
}

function AnalysisKpi({ label, value, note, tone = 'blue', onClick, definition, periodKey }) {
  const content = <div role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick} onKeyDown={(event) => event.key === 'Enter' && onClick?.()} className={`c360-analysis-kpi is-${tone} ${onClick ? 'is-clickable' : ''}`}><Text type="secondary">{label}</Text><strong>{value}</strong><small>{note}</small>{definition ? <Text className="c360-analysis-drill-hint">ⓘ Nguồn & công thức</Text> : null}{onClick ? <Text className="c360-analysis-drill-hint">Xem khách hàng →</Text> : null}</div>;
  return <MetricDefinitionTooltip definition={definition} periodKey={periodKey}>{content}</MetricDefinitionTooltip>;
}

function AnalysisTrendPanels({ trends = [], series = [] }) {
  const rows = trends.slice(-4);
  if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu xu hướng" />;
  const width = 330; const height = 118; const left = 12; const right = 12; const top = 13; const bottom = 24;
  const chartWidth = width - left - right; const chartHeight = height - top - bottom;
  return <div className="c360-analysis-trend-panels">{series.map((item) => {
    const values = rows.map((row) => Number(item.value(row) || 0));
    const minimum = Math.min(...values); const maximum = Math.max(...values);
    const range = Math.max(1, maximum - minimum);
    const points = values.map((value, index) => ({
      x: left + (index * chartWidth) / Math.max(1, values.length - 1),
      y: top + chartHeight - ((value - minimum) / range) * chartHeight,
    }));
    const polyline = points.map((point) => `${point.x},${point.y}`).join(' ');
    const area = `${left},${top + chartHeight} ${polyline} ${left + chartWidth},${top + chartHeight}`;
    const latest = values.at(-1) || 0; const previous = values.at(-2) || 0;
    const difference = latest - previous;
    const percentage = previous ? difference / Math.abs(previous) * 100 : null;
    return <div key={item.key} className="c360-analysis-trend-panel" style={{ '--trend-color': item.color, '--trend-soft': item.soft }}>
      <header><span><Text type="secondary">{item.label}</Text><strong>{item.format(latest)}</strong></span><Tag color={difference >= 0 ? 'success' : 'error'}>{percentage == null ? 'Chưa có nền so sánh' : `${difference >= 0 ? '+' : ''}${percentage.toFixed(2)}%`}</Tag></header>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Xu hướng 4 kỳ của ${item.label}`}>
        <line x1={left} x2={width - right} y1={top + chartHeight} y2={top + chartHeight} className="axis" />
        <polygon points={area} fill={item.soft} />
        <polyline points={polyline} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => <g key={rows[index].period_key}><circle cx={point.x} cy={point.y} r="4" fill="#fff" stroke={item.color} strokeWidth="2.5"><title>{`${periodLabel(rows[index].period_key)} · ${item.format(values[index])}`}</title></circle><text x={point.x} y={height - 7} textAnchor="middle">{periodLabel(rows[index].period_key)}</text></g>)}
      </svg>
      <footer>{rows.map((row, index) => <Tooltip key={row.period_key} title={`${periodLabel(row.period_key)} · ${item.format(values[index])}`}><span><small>{periodLabel(row.period_key)}</small><b>{item.format(values[index])}</b></span></Tooltip>)}</footer>
    </div>;
  })}</div>;
}

const businessTrendPalette = {
  deposit: '#16845f', casa: '#3187c8', total: '#174b67',
  short: '#3182ce', medium: '#7856c8', overdraft: '#e69b2d', unclassified: '#b2bdc9', provision: '#c83f5b',
  guarantee: '#0f8a68', transfer: '#3387c9', digital: '#7557c7', abic: '#e59b2d', other: '#9aa8b8',
  scale: '#7654bd', customers: '#159176',
};

function BusinessTrendLegend({ items }) {
  return <div className="c360-business-trend-legend">{items.map((item) => <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>)}</div>;
}

function BusinessTrendPeriods({ rows, render }) {
  return <div className="c360-business-trend-periods">{rows.map((row) => <div key={row.period_key}><small>{periodLabel(row.period_key)}</small>{render(row)}</div>)}</div>;
}

function DepositBusinessTrendChart({ trends = [] }) {
  const rows = trends.slice(-6);
  if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu xu hướng tiền gửi" />;
  const width = 900; const height = 330; const left = 68; const right = 28; const top = 34; const bottom = 48;
  const chartWidth = width - left - right; const chartHeight = height - top - bottom;
  const series = [
    { key: 'total', label: 'Tổng tiền gửi', color: businessTrendPalette.total, values: rows.map((row) => Math.max(0, Number(row.deposit || 0) + Number(row.casa || 0))) },
    { key: 'deposit', label: 'Tiền gửi có kỳ hạn', color: businessTrendPalette.deposit, values: rows.map((row) => Math.max(0, Number(row.deposit || 0))) },
    { key: 'casa', label: 'TGTT bình quân', color: businessTrendPalette.casa, values: rows.map((row) => Math.max(0, Number(row.casa || 0))) },
  ];
  const maximum = Math.max(1, ...series[0].values) * 1.12;
  const xAt = (index) => left + index * chartWidth / Math.max(1, rows.length - 1);
  const yAt = (value) => top + chartHeight - value / maximum * chartHeight;
  const points = (values) => values.map((value, index) => `${xAt(index)},${yAt(value)}`).join(' ');
  const totalArea = `${left},${top + chartHeight} ${points(series[0].values)} ${left + chartWidth},${top + chartHeight}`;
  return <div className="c360-business-trend-chart is-deposit">
    <BusinessTrendLegend items={series.map(({ label, color }) => ({ label, color }))} />
    <div className="c360-business-trend-stage"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Xu hướng tổng tiền gửi, tiền gửi có kỳ hạn và tiền gửi thanh toán bình quân qua các kỳ">
      <defs><linearGradient id="depositTotalArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={businessTrendPalette.total} stopOpacity=".18" /><stop offset="1" stopColor={businessTrendPalette.total} stopOpacity=".02" /></linearGradient></defs>
      {[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1={left} x2={width - right} y1={top + chartHeight * ratio} y2={top + chartHeight * ratio} className="grid" /><text x={left - 10} y={top + chartHeight * ratio + 4} textAnchor="end">{compactMoney(maximum * (1 - ratio))}</text></g>)}
      <polygon points={totalArea} fill="url(#depositTotalArea)" />
      {series.map((item) => <polyline key={item.key} points={points(item.values)} fill="none" stroke={item.color} strokeWidth={item.key === 'total' ? 4 : 3} strokeLinecap="round" strokeLinejoin="round" />)}
      {rows.map((row, index) => <g key={row.period_key}>
        {series.map((item) => <circle key={item.key} cx={xAt(index)} cy={yAt(item.values[index])} r={item.key === 'total' ? 5.5 : 4} fill="#fff" stroke={item.color} strokeWidth="2.8"><title>{`${periodLabel(row.period_key)} · ${item.label}: ${fullMoney(item.values[index])}`}</title></circle>)}
        <text x={xAt(index)} y={Math.max(17, yAt(series[0].values[index]) - 11)} textAnchor="middle" className="value">{compactMoney(series[0].values[index])}</text>
        <text x={xAt(index)} y={height - 16} textAnchor="middle" className="period">{periodLabel(row.period_key)}</text>
      </g>)}
    </svg></div>
    <BusinessTrendPeriods rows={rows} render={(row) => { const total = Number(row.deposit || 0) + Number(row.casa || 0); return <><b>{compactMoney(total)}</b><span>CKH {compactMoney(row.deposit)} · TGTT {compactMoney(row.casa)} · tỷ trọng TGTT {total ? (Number(row.casa || 0) / total * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : 0}%</span></>; }} />
  </div>;
}

function CreditBusinessTrendChart({ trends = [] }) {
  const rows = trends.slice(-4);
  if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu xu hướng tín dụng" />;
  const width = 900; const height = 320; const left = 58; const right = 62; const top = 24; const bottom = 48;
  const chartWidth = width - left - right; const chartHeight = height - top - bottom;
  const parts = rows.map((row) => {
    const classified = [Math.max(0, Number(row.short_loan || 0)), Math.max(0, Number(row.medium_long_loan || 0)), Math.max(0, Number(row.overdraft || 0))];
    return [...classified, Math.max(0, Number(row.loan || 0) - classified.reduce((sum, value) => sum + value, 0))];
  });
  const totals = rows.map((row, index) => Math.max(Number(row.loan || 0), parts[index].reduce((sum, value) => sum + value, 0), 0));
  const ratios = rows.map((row) => Number(row.loan || 0) ? Number(row.provision || 0) / Number(row.loan) * 100 : 0);
  const maximum = Math.max(1, ...totals) * 1.08; const ratioMaximum = Math.max(1, ...ratios) * 1.18;
  const groupWidth = chartWidth / rows.length; const barWidth = Math.min(88, groupWidth * .42);
  const xAt = (index) => left + (index + .5) * groupWidth;
  const yAt = (value) => top + chartHeight - value / maximum * chartHeight;
  const ratioY = (value) => top + chartHeight - value / ratioMaximum * chartHeight;
  const ratioPoints = ratios.map((value, index) => `${xAt(index)},${ratioY(value)}`).join(' ');
  const colors = [businessTrendPalette.short, businessTrendPalette.medium, businessTrendPalette.overdraft, businessTrendPalette.unclassified];
  const labels = ['Ngắn hạn', 'Trung dài hạn', 'Thấu chi', 'Chưa phân loại/thiếu nguồn'];
  return <div className="c360-business-trend-chart is-credit">
    <BusinessTrendLegend items={[...labels.map((label, index) => ({ label, color: colors[index] })), { label: 'Tỷ lệ DPRR/dư nợ', color: businessTrendPalette.provision }]} />
    <div className="c360-business-trend-stage"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cơ cấu dư nợ và tỷ lệ dự phòng qua bốn kỳ">
      {[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1={left} x2={width - right} y1={top + chartHeight * ratio} y2={top + chartHeight * ratio} className="grid" /><text x={left - 10} y={top + chartHeight * ratio + 4} textAnchor="end">{compactMoney(maximum * (1 - ratio))}</text><text x={width - right + 10} y={top + chartHeight * ratio + 4}>{(ratioMaximum * (1 - ratio)).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%</text></g>)}
      {rows.map((row, index) => { let accumulated = 0; return <g key={row.period_key}>{parts[index].map((value, partIndex) => { const segmentHeight = value / maximum * chartHeight; const y = yAt(accumulated + value); accumulated += value; return <rect key={labels[partIndex]} x={xAt(index) - barWidth / 2} y={y} width={barWidth} height={Math.max(0, segmentHeight)} fill={colors[partIndex]} rx={partIndex === 3 ? 5 : 0}><title>{`${periodLabel(row.period_key)} · ${labels[partIndex]} ${fullMoney(value)}`}</title></rect>; })}<text x={xAt(index)} y={height - 16} textAnchor="middle" className="period">{periodLabel(row.period_key)}</text></g>; })}
      <polyline points={ratioPoints} fill="none" stroke={businessTrendPalette.provision} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      {rows.map((row, index) => <circle key={row.period_key} cx={xAt(index)} cy={ratioY(ratios[index])} r="5" fill="#fff" stroke={businessTrendPalette.provision} strokeWidth="3"><title>{`${periodLabel(row.period_key)} · DPRR ${fullMoney(row.provision)} · ${ratios[index].toLocaleString('vi-VN', { maximumFractionDigits: 3 })}% dư nợ`}</title></circle>)}
    </svg></div>
    <BusinessTrendPeriods rows={rows} render={(row) => { const classified = Number(row.short_loan || 0) + Number(row.medium_long_loan || 0) + Number(row.overdraft || 0); const missing = Math.max(0, Number(row.loan || 0) - classified); return <><b>{compactMoney(row.loan)}</b><span title={missing ? `Chưa phân loại ${fullMoney(missing)}` : `DPRR ${fullMoney(row.provision)}`}>{missing ? `Thiếu cấu phần ${compactMoney(missing)}` : `DPRR ${compactMoney(row.provision)} · ${Number(row.loan || 0) ? (Number(row.provision || 0) / Number(row.loan) * 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : '0'}%`}</span></>; }} />
  </div>;
}

function IncomeBusinessTrendChart({ trends = [] }) {
  const rows = trends.slice(-4);
  if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu xu hướng thu nhập" />;
  const categories = [
    { label: 'Bảo lãnh', color: businessTrendPalette.guarantee, value: (row) => Number(row.fee_guarantee || 0) },
    { label: 'Chuyển tiền', color: businessTrendPalette.transfer, value: (row) => Number(row.fee_transfer || 0) },
    { label: 'NHĐT', color: businessTrendPalette.digital, value: (row) => Number(row.fee_digital || 0) },
    { label: 'ABIC', color: businessTrendPalette.abic, value: (row) => Number(row.fee_abic || 0) },
    { label: 'KDNT, LC & TTQT', color: businessTrendPalette.other, value: (row) => Number(row.fee_fx || 0) + Number(row.fee_lc || 0) + Number(row.fee_international || 0) },
    { label: 'Thẻ & phí khác', color: '#db5d83', value: (row) => Number(row.fee_card || 0) + Number(row.fee_other || 0) },
  ];
  const width = 900; const height = 320; const left = 58; const right = 22; const top = 24; const bottom = 48;
  const chartWidth = width - left - right; const chartHeight = height - top - bottom;
  const values = rows.map((row) => categories.map((item) => Math.max(0, item.value(row))));
  const totals = values.map((parts) => parts.reduce((sum, value) => sum + value, 0));
  const maximum = Math.max(1, ...totals) * 1.12; const groupWidth = chartWidth / rows.length; const barWidth = Math.min(92, groupWidth * .44);
  const xAt = (index) => left + (index + .5) * groupWidth; const yAt = (value) => top + chartHeight - value / maximum * chartHeight;
  return <div className="c360-business-trend-chart is-income">
    <BusinessTrendLegend items={categories.map(({ label, color }) => ({ label, color }))} />
    <div className="c360-business-trend-stage"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cơ cấu nguồn thu phí qua bốn kỳ">
      {[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1={left} x2={width - right} y1={top + chartHeight * ratio} y2={top + chartHeight * ratio} className="grid" /><text x={left - 10} y={top + chartHeight * ratio + 4} textAnchor="end">{compactMoney(maximum * (1 - ratio))}</text></g>)}
      {rows.map((row, index) => { let accumulated = 0; return <g key={row.period_key}>{values[index].map((value, categoryIndex) => { const segmentHeight = value / maximum * chartHeight; const y = yAt(accumulated + value); accumulated += value; return <rect key={categories[categoryIndex].label} x={xAt(index) - barWidth / 2} y={y} width={barWidth} height={Math.max(0, segmentHeight)} fill={categories[categoryIndex].color}><title>{`${periodLabel(row.period_key)} · ${categories[categoryIndex].label} ${fullMoney(value)}`}</title></rect>; })}<text x={xAt(index)} y={Math.max(14, yAt(totals[index]) - 8)} textAnchor="middle" className="value">{compactMoney(totals[index])}</text><text x={xAt(index)} y={height - 16} textAnchor="middle" className="period">{periodLabel(row.period_key)}</text></g>; })}
    </svg></div>
    <BusinessTrendPeriods rows={rows} render={(row) => <><b>{compactMoney(row.fee)}</b><span>{Number(row.customers || 0).toLocaleString('vi-VN')} KH · BQ {compactMoney(Number(row.customers || 0) ? Number(row.fee || 0) / Number(row.customers) : 0)}/KH</span></>} />
  </div>;
}

function OfficerBusinessTrendChart({ trends = [] }) {
  const rows = trends.slice(-6);
  if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu xu hướng cán bộ" />;
  const width = 900; const height = 320; const left = 58; const right = 62; const top = 24; const bottom = 48;
  const chartWidth = width - left - right; const chartHeight = height - top - bottom;
  const officerValues = rows.map((row) => Math.max(0, Number(row.officers || 0)));
  const coverageValues = rows.map((row) => Number(row.customers || 0) ? Math.min(100, Number(row.managed_customers || 0) / Number(row.customers) * 100) : 0);
  const officerMaximum = Math.max(1, ...officerValues) * 1.15;
  const groupWidth = chartWidth / rows.length; const barWidth = Math.min(92, groupWidth * .42);
  const xAt = (index) => left + (index + .5) * groupWidth;
  const officerY = (value) => top + chartHeight - value / officerMaximum * chartHeight;
  const coverageY = (value) => top + chartHeight - value / 100 * chartHeight;
  const points = coverageValues.map((value, index) => `${xAt(index)},${coverageY(value)}`).join(' ');
  return <div className="c360-business-trend-chart is-officer">
    <BusinessTrendLegend items={[{ label: 'Cán bộ có danh mục', color: businessTrendPalette.scale }, { label: 'Tỷ lệ KH đã có CBQL', color: businessTrendPalette.customers }]} />
    <div className="c360-business-trend-stage"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Mức độ bao phủ cán bộ quản lý qua các kỳ">
      {[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1={left} x2={width - right} y1={top + chartHeight * ratio} y2={top + chartHeight * ratio} className="grid" /><text x={left - 10} y={top + chartHeight * ratio + 4} textAnchor="end">{Math.round(officerMaximum * (1 - ratio))}</text><text x={width - right + 10} y={top + chartHeight * ratio + 4}>{Math.round(100 * (1 - ratio))}%</text></g>)}
      {rows.map((row, index) => <g key={row.period_key}><rect x={xAt(index) - barWidth / 2} y={officerY(officerValues[index])} width={barWidth} height={top + chartHeight - officerY(officerValues[index])} rx="7" fill={businessTrendPalette.scale} fillOpacity=".82"><title>{`${periodLabel(row.period_key)} · ${officerValues[index].toLocaleString('vi-VN')} cán bộ có danh mục`}</title></rect><text x={xAt(index)} y={height - 16} textAnchor="middle" className="period">{periodLabel(row.period_key)}</text></g>)}
      <polyline points={points} fill="none" stroke={businessTrendPalette.customers} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {rows.map((row, index) => <g key={row.period_key}><circle cx={xAt(index)} cy={coverageY(coverageValues[index])} r="5.5" fill="#fff" stroke={businessTrendPalette.customers} strokeWidth="3"><title>{`${periodLabel(row.period_key)} · ${coverageValues[index].toLocaleString('vi-VN', { maximumFractionDigits: 2 })}% KH đã có cán bộ quản lý`}</title></circle><text x={xAt(index) + 9} y={coverageY(coverageValues[index]) - 9} className="ratio-value">{coverageValues[index].toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</text></g>)}
    </svg></div>
    <BusinessTrendPeriods rows={rows} render={(row) => <><b>{Number(row.officers || 0).toLocaleString('vi-VN')} cán bộ</b><span>{Number(row.managed_customers || 0).toLocaleString('vi-VN')}/{Number(row.customers || 0).toLocaleString('vi-VN')} KH đã gán · {Number(row.customers || 0) ? (Number(row.managed_customers || 0) / Number(row.customers) * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : 0}%</span></>} />
  </div>;
}

const officerMetricOptions = [
  { value: 'totalScale', label: 'Tổng quy mô', color: '#6d45b1', format: compactMoney },
  { value: 'custCount', label: 'Số khách hàng', color: '#2878b8', format: (value) => `${Number(value || 0).toLocaleString('vi-VN')} KH` },
  { value: 'totalDeposit', label: 'Tiền gửi CKH', color: '#14835f', format: compactMoney },
  { value: 'totalCASA', label: 'TGTT bình quân', color: '#1683a5', format: compactMoney },
  { value: 'totalLoan', label: 'Dư nợ', color: '#bd3651', format: compactMoney },
  { value: 'totalFee', label: 'Thu phí', color: '#d18418', format: compactMoney },
];

function OfficerRankingChart({ rows = [], metric = 'totalScale' }) {
  const definition = officerMetricOptions.find((item) => item.value === metric) || officerMetricOptions[0];
  const valueOf = (row) => metric === 'totalScale'
    ? Number(row.totalDeposit || 0) + Number(row.totalCASA || 0) + Number(row.totalLoan || 0)
    : Number(row[metric] || 0);
  const ranked = [...rows].sort((a, b) => valueOf(b) - valueOf(a)).slice(0, 10);
  const maximum = Math.max(1, ...ranked.map(valueOf));
  if (!ranked.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có cán bộ hợp lệ trong phạm vi" />;
  return <div className="c360-officer-ranking">{ranked.map((row, index) => <div key={`${row.code}-${row.employeeCode || index}`}>
    <span className={`is-rank is-${index + 1}`}>{index + 1}</span>
    <span className="c360-officer-ranking-name"><Text strong>{row.name || row.code}</Text><small>{row.employeeCode || row.code} · {Number(row.custCount || 0).toLocaleString('vi-VN')} KH</small></span>
    <div className="c360-officer-ranking-bar"><i style={{ width: `${Math.max(2, valueOf(row) / maximum * 100)}%`, background: definition.color }} /></div>
    <b>{definition.format(valueOf(row))}</b>
  </div>)}</div>;
}

function OfficerPerformanceMap({ rows = [] }) {
  const width = 760; const height = 310; const left = 70; const right = 26; const top = 25; const bottom = 48;
  const innerWidth = width - left - right; const innerHeight = height - top - bottom;
  const points = rows.map((row) => ({
    ...row,
    customers: Number(row.custCount || 0),
    scale: Number(row.totalDeposit || 0) + Number(row.totalCASA || 0) + Number(row.totalLoan || 0),
    fee: Number(row.totalFee || 0),
  })).filter((row) => row.customers > 0).slice(0, 120);
  if (!points.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu danh mục cán bộ" />;
  const maxCustomers = Math.max(1, ...points.map((row) => row.customers));
  const maxScale = Math.max(1, ...points.map((row) => row.scale));
  const maxFee = Math.max(1, ...points.map((row) => Math.abs(row.fee)));
  const avgCustomers = points.reduce((sum, row) => sum + row.customers, 0) / points.length;
  const avgScale = points.reduce((sum, row) => sum + row.scale, 0) / points.length;
  const xAt = (value) => left + value / maxCustomers * innerWidth;
  const yAt = (value) => top + innerHeight - value / maxScale * innerHeight;
  const tone = (row) => row.customers >= avgCustomers && row.scale >= avgScale ? '#17825d' : row.scale >= avgScale ? '#326fb0' : row.customers >= avgCustomers ? '#c77a13' : '#aab4c2';
  return <div className="c360-officer-performance-map">
    <div className="c360-officer-map-legend"><span className="is-strong">Quy mô và số KH cao</span><span className="is-scale">Quy mô cao</span><span className="is-customer">Nhiều KH</span><span className="is-base">Cần phát triển</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Ma trận hiệu quả danh mục cán bộ">
      <rect x={left} y={top} width={innerWidth} height={innerHeight} rx="10" className="canvas" />
      <line x1={xAt(avgCustomers)} x2={xAt(avgCustomers)} y1={top} y2={top + innerHeight} className="average" />
      <line x1={left} x2={left + innerWidth} y1={yAt(avgScale)} y2={yAt(avgScale)} className="average" />
      <text x={xAt(avgCustomers) + 5} y={top + 12}>BQ {avgCustomers.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} KH/CB</text>
      <text x={left + 5} y={yAt(avgScale) - 6}>Quy mô BQ {compactMoney(avgScale)}</text>
      {points.map((row, index) => <circle key={`${row.code}-${index}`} cx={xAt(row.customers)} cy={yAt(row.scale)} r={5 + Math.sqrt(Math.abs(row.fee) / maxFee) * 7} fill={tone(row)} fillOpacity=".76" stroke="#fff" strokeWidth="1.5"><title>{`${row.name || row.code}\n${row.customers.toLocaleString('vi-VN')} KH · Quy mô ${fullMoney(row.scale)} · Phí ${fullMoney(row.fee)} · SP/KH ${Number(row.avgCrossSell || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}`}</title></circle>)}
      <text x={left + innerWidth / 2} y={height - 8} textAnchor="middle" className="axis-label">Số khách hàng đang quản lý →</text>
      <text x="15" y={top + innerHeight / 2} textAnchor="middle" className="axis-label" transform={`rotate(-90 15 ${top + innerHeight / 2})`}>Tổng quy mô danh mục →</text>
    </svg>
    <small>Di chuột vào từng điểm để xem cán bộ, số khách hàng, quy mô, thu phí và số sản phẩm bình quân.</small>
  </div>;
}

function BusinessAnalysisPage({ context, mode, onOpenCustomer, currentUser }) {
  const { periods, periodKey, branchCode, pgdCode, refreshKey, profileParams = {}, sessionData, sessionLoading } = context;
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
  const [feeTrace, setFeeTrace] = useState({ open: false, level: 'account', category: null, accountCode: null, customerCode: null, items: [], total: 0, page: 1, summary: {} });
  const [feeTraceLoading, setFeeTraceLoading] = useState(false);
  const [officerDrill, setOfficerDrill] = useState({ row: null, filters: { hasDeposit: false, hasLoan: false, hasFee: false, multiBranch: false } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [comparisonPeriod, setComparisonPeriod] = useState(() => new URLSearchParams(window.location.search).get('compare') || '');
  const [serviceView, setServiceView] = useState('all');
  const [officerMetric, setOfficerMetric] = useState('totalScale');
  const loadSequence = useRef(0);
  const meta = ANALYSIS_META[mode] || ANALYSIS_META['analysis-deposit'];
  const canExport = hasPermission(currentUser, 'analytics:export');
  const load = useCallback(async () => {
    if (!periodKey) return;
    const sequence = ++loadSequence.current;
    setLoading(true); setError('');
    if (sessionLoading) return;
    const sessionMatches = sessionData?.ready && sessionData.periodKey === periodKey
      && sessionData.scopeKey === JSON.stringify(profileParams);
    if (sessionMatches && sessionData.analytics && sessionData.insights && sessionData.trends) {
      setData(sessionData.analytics);
      setInsights(sessionData.insights);
      setTrends(sessionData.trends?.items || []);
      setReconciliationTotal(Number(sessionData.reconciliation?.total || 0));
      setLoading(false);
      return;
    }
    const params = profileParams;
    try {
      const [analyticsRes, insightsRes, trendRes, reconciliationRes] = await Promise.all([
        client.get('/dashboard/business-analytics', { params }),
        client.get('/dashboard/insights', { params }),
        client.get('/dashboard/business-trends', { params: { periods: 12, ...profileParams } }),
        client.get('/customer-processing/reconciliations', { params: { period_key: periodKey, branch_code: branchCode || undefined, latest_job_only: true, page: 1, page_size: 1 } }),
      ]);
      if (sequence !== loadSequence.current) return;
      setData(analyticsRes.data); setInsights(insightsRes.data); setTrends(trendRes.data?.items || []);
      setReconciliationTotal(Number(reconciliationRes.data?.total || 0));
    } catch (requestError) {
      if (sequence !== loadSequence.current) return;
      setError(requestError.response?.data?.detail || requestError.message || 'Không tải được dữ liệu phân tích');
    } finally { if (sequence === loadSequence.current) setLoading(false); }
  }, [branchCode, mode, periodKey, pgdCode, profileParams, refreshKey, sessionData, sessionLoading]);
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
  const feeReconciliation = income.reconciliation || {};
  const customer = data?.customer || {};
  const officerRows = data?.officers || [];
  const officerCount = officerRows.length;
  const managedCustomers = officerRows.reduce((sum, row) => sum + Number(row.custCount || 0), 0);
  const officerTotalScale = officerRows.reduce((sum, row) => sum + Number(row.totalDeposit || 0) + Number(row.totalCASA || 0) + Number(row.totalLoan || 0), 0);
  const officerTotalFee = officerRows.reduce((sum, row) => sum + Number(row.totalFee || 0), 0);
  const metricDefinitions = data?.metric_definitions || {};
  const metricDefinition = (metric) => metricDefinitions[metric]
    || (metric?.includes('fee') ? metricDefinitions.fee : null)
    || (metric?.startsWith('service') ? metricDefinitions.service : null);
  const depositInsight = insights?.deposit || {};
  const creditInsight = insights?.credit || {};
  const maxService = Math.max(...(data?.services || []).map((item) => Number(item.pct || 0)), 1);
  const formatPercent = (value) => {
    const numeric = Number(value || 0);
    return `${numeric.toLocaleString('vi-VN', { minimumFractionDigits: numeric > 0 && numeric < 1 ? 2 : 0, maximumFractionDigits: 2 })}%`;
  };
  const metricForMode = mode === 'analysis-credit' ? 'loan' : mode === 'analysis-income' ? 'fee' : mode === 'analysis-unit' ? 'service' : 'deposit';
  const currentTrend = trends.at(-1) || {};
  const previousTrend = trends.at(-2) || {};
  const comparisonTrend = trends.find((item) => item.period_key === comparisonPeriod) || previousTrend;
  const trendValue = (row, field) => {
    if (field === 'total_funding') return Number(row.deposit || 0) + Number(row.casa || 0);
    if (field === 'total_scale') return Number(row.deposit || 0) + Number(row.casa || 0) + Number(row.loan || 0);
    if (field === 'provision_ratio') return Number(row.loan || 0) ? Number(row.provision || 0) / Number(row.loan) * 100 : 0;
    if (field === 'fee_per_customer') return Number(row.customers || 0) ? Number(row.fee || 0) / Number(row.customers) : 0;
    if (field === 'fee_yield') {
      const scale = Number(row.deposit || 0) + Number(row.casa || 0) + Number(row.loan || 0);
      return scale ? Number(row.fee || 0) / scale * 100 : 0;
    }
    return Number(row[field] || 0);
  };
  const moneyFormat = (value) => compactMoney(value);
  const countFormat = (value) => `${Number(value || 0).toLocaleString('vi-VN')} KH`;
  const percentFormat = (value) => `${Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 4 })}%`;
  const trendPresentation = mode === 'analysis-credit'
    ? { title: 'Cơ cấu dư nợ & mức bao phủ dự phòng', extra: 'Cột xếp chồng theo loại vay · Đường biểu diễn DPRR/dư nợ', chart: <CreditBusinessTrendChart trends={trends} /> }
    : mode === 'analysis-income'
      ? { title: 'Cơ cấu nguồn thu phí qua các kỳ', extra: 'Theo dõi phần đóng góp của từng nhóm nghiệp vụ', chart: <IncomeBusinessTrendChart trends={trends} /> }
      : mode === 'analysis-unit'
        ? { title: 'Mức độ bao phủ cán bộ quản lý qua các kỳ', extra: 'Cột: cán bộ có danh mục · Đường: tỷ lệ khách hàng đã có CBQL', chart: <OfficerBusinessTrendChart trends={trends} /> }
        : { title: 'Xu hướng tiền gửi và cơ cấu theo kỳ', extra: 'Cùng một trục tiền tệ: tổng tiền gửi, tiền gửi CKH và TGTT bình quân', chart: <DepositBusinessTrendChart trends={trends} /> };
  const comparisonFields = mode === 'analysis-deposit'
    ? [['Tổng quan hệ tiền gửi', 'total_funding', 'money'], ['Tiền gửi CKH', 'deposit', 'money'], ['TGTT bình quân', 'casa', 'money'], ['Khách hàng trong phạm vi', 'customers', 'count']]
    : mode === 'analysis-credit'
      ? [['Tổng dư nợ', 'loan', 'money'], ['Dự phòng lũy kế', 'provision', 'money'], ['Tỷ lệ dự phòng/dư nợ', 'provision_ratio', 'percent'], ['Khách hàng trong phạm vi', 'customers', 'count']]
      : mode === 'analysis-income'
        ? [['Tổng phí ghi nhận', 'fee', 'money'], ['Phí bình quân/KH', 'fee_per_customer', 'money'], ['Tỷ lệ phí/tổng quy mô', 'fee_yield', 'percent'], ['Khách hàng trong phạm vi', 'customers', 'count']]
        : [['Cán bộ có danh mục', 'officers', 'officer'], ['KH đã gán CBQL', 'managed_customers', 'count'], ['KH bình quân/cán bộ', 'customers_per_officer', 'decimal'], ['Quy mô bình quân/cán bộ', 'scale_per_officer', 'money'], ['Tiền gửi bình quân/cán bộ', 'deposit_per_officer', 'money'], ['Dư nợ bình quân/cán bộ', 'loan_per_officer', 'money'], ['Thu phí bình quân/cán bộ', 'fee_per_officer', 'money']];
  const loadDrilldown = useCallback(async (metric, nextPage = 1, keyword = drillKeyword) => {
    setDrillLoading(true);
    try {
      const { data: response } = await client.get('/dashboard/business-drilldown', { params: { ...profileParams, metric, detail_keyword: keyword || undefined, page: nextPage, page_size: 20 } });
      setDrilldown({ open: true, metric, label: response?.label, items: response?.items || [], total: Number(response?.total || 0), totalValue: Number(response?.total_value || 0), page: nextPage });
    } catch (requestError) { message.error(requestError.response?.data?.detail || requestError.message); }
    finally { setDrillLoading(false); }
  }, [drillKeyword, profileParams]);
  const loadOfficerCustomers = useCallback(async (row, filters = officerDrill.filters, nextPage = 1, keyword = drillKeyword) => {
    if (!row) return;
    setDrillLoading(true);
    setOfficerDrill({ row, filters });
    try {
      const officerCodes = [...new Set([row.code, row.employeeCode].filter(Boolean))];
      const { data: response } = await client.get('/dashboard/business-drilldown', { params: {
        ...profileParams,
        metric: 'all',
        detail_keyword: keyword || undefined,
        detail_officer: officerCodes.join(','),
        detail_has_deposit: filters.hasDeposit || undefined,
        detail_has_loan: filters.hasLoan || undefined,
        detail_has_fee: filters.hasFee || undefined,
        detail_multi_branch: filters.multiBranch || undefined,
        page: nextPage,
        page_size: 20,
      } });
      setDrilldown({
        open: true,
        metric: 'officer_customers',
        label: `Khách hàng do ${row.name || row.code} quản lý`,
        items: response?.items || [],
        total: Number(response?.total || 0),
        totalValue: 0,
        page: nextPage,
      });
    } catch (requestError) { message.error(requestError.response?.data?.detail || requestError.message || 'Không tải được danh mục khách hàng của cán bộ'); }
    finally { setDrillLoading(false); }
  }, [drillKeyword, officerDrill.filters, profileParams]);
  const loadReconciliations = useCallback(async (nextPage = 1, keyword = reconciliationKeyword, source = reconciliationSource) => {
    setReconciliationLoading(true);
    try {
      const { data: response } = await client.get('/customer-processing/reconciliations', { params: { period_key: periodKey, branch_code: branchCode || undefined, source_type: source || undefined, keyword: keyword || undefined, latest_job_only: true, page: nextPage, page_size: 50 } });
      setReconciliation({ open: true, items: response?.items || [], total: Number(response?.total || 0), page: nextPage });
    } catch (requestError) { message.error(requestError.response?.data?.detail || requestError.message || 'Không tải được danh sách đối chiếu CIF'); }
    finally { setReconciliationLoading(false); }
  }, [branchCode, periodKey, reconciliationKeyword, reconciliationSource]);
  const loadFeeTrace = useCallback(async ({ level = 'account', category = null, accountCode = null, customerCode = null, page = 1 } = {}) => {
    setFeeTraceLoading(true);
    setFeeTrace((current) => ({ ...current, open: true, level, category, accountCode, customerCode, page }));
    try {
      const { data: response } = await client.get('/dashboard/fee-drilldown', { params: {
        ...profileParams,
        level,
        category: category || undefined,
        account_code: accountCode || undefined,
        customer_code: customerCode || undefined,
        page,
        page_size: 20,
      } });
      setFeeTrace({
        open: true, level, category, accountCode, customerCode,
        items: response?.items || [], total: Number(response?.total || 0), page,
        summary: response?.summary || {}, categoryLabel: response?.category_label,
        canViewTransactions: Boolean(response?.can_view_transactions),
      });
    } catch (requestError) {
      message.error(requestError.response?.data?.detail || requestError.message || 'Không tải được truy vết phí KH02');
    } finally { setFeeTraceLoading(false); }
  }, [profileParams]);
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
    ['Cán bộ có danh mục', Number(officerCount).toLocaleString('vi-VN'), 'Chỉ tính cán bộ tồn tại trong danh mục user', 'purple', 'service', 'customers'],
    ['KH đã gán CBQL', Number(managedCustomers).toLocaleString('vi-VN'), `${managedCustomers && customer.total ? (managedCustomers / Number(customer.total) * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : 0}% tập khách hàng`, 'blue', 'service', 'customers'],
    ['Bình quân KH/cán bộ', officerCount ? (managedCustomers / officerCount).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : '0', 'Quy mô danh mục theo đầu cán bộ', 'green', 'service', 'customers'],
    ['Quy mô bình quân/cán bộ', compactMoney(officerCount ? officerTotalScale / officerCount : 0), `Thu phí BQ ${compactMoney(officerCount ? officerTotalFee / officerCount : 0)}`, 'gold', 'service', 'total_scale'],
  ];
  const topOfficerBy = (valueOf) => [...officerRows].sort((a, b) => valueOf(b) - valueOf(a))[0];
  const officerHighlights = [
    { label: 'Quản lý nhiều khách hàng nhất', officer: topOfficerBy((row) => Number(row.custCount || 0)), value: (row) => `${Number(row?.custCount || 0).toLocaleString('vi-VN')} KH`, tone: 'blue' },
    { label: 'Quy mô tiền gửi cao nhất', officer: topOfficerBy((row) => Number(row.totalDeposit || 0) + Number(row.totalCASA || 0)), value: (row) => compactMoney(Number(row?.totalDeposit || 0) + Number(row?.totalCASA || 0)), tone: 'green' },
    { label: 'Dư nợ cao nhất', officer: topOfficerBy((row) => Number(row.totalLoan || 0)), value: (row) => compactMoney(row?.totalLoan), tone: 'red' },
    { label: 'Thu phí cao nhất', officer: topOfficerBy((row) => Number(row.totalFee || 0)), value: (row) => compactMoney(row?.totalFee), tone: 'gold' },
    { label: 'Quy mô bình quân/KH cao nhất', officer: topOfficerBy((row) => (Number(row.totalDeposit || 0) + Number(row.totalCASA || 0) + Number(row.totalLoan || 0)) / Math.max(1, Number(row.custCount || 0))), value: (row) => compactMoney((Number(row?.totalDeposit || 0) + Number(row?.totalCASA || 0) + Number(row?.totalLoan || 0)) / Math.max(1, Number(row?.custCount || 0))), tone: 'purple' },
  ];
  const drillIsService = drilldown.metric === 'service' || String(drilldown.metric || '').startsWith('service:') || String(drilldown.metric || '').startsWith('no_service:');
  const drillIsFee = ['fee', 'transfer_fee', 'digital_fee', 'guarantee_fee', 'abic_fee'].includes(drilldown.metric);
  const drillIsCredit = ['loan', 'short_loan', 'medium_long_loan', 'overdraft', 'written_off', 'general_provision_period', 'specific_provision_period'].includes(drilldown.metric) || String(drilldown.metric || '').startsWith('debt_group:');
  const drillIsDeposit = ['deposit', 'term_deposit', 'casa', 'payment_turnover'].includes(drilldown.metric);
  const drillIsAccountMovement = ['new_deposit_account', 'closed_deposit_account'].includes(drilldown.metric);
  const drillIsDepositDrop = drilldown.metric === 'deposit_drop';
  const drillIsOfficer = drilldown.metric === 'officer_customers';
  const officerQuickValues = Object.entries(officerDrill.filters || {}).filter(([, enabled]) => enabled).map(([key]) => key);
  const analysisCustomerColumn = {
    title: 'Khách hàng', fixed: 'left', width: 250,
    render: (_, row) => <div><Text strong>{row.ten_kh || 'Chưa có tên'}</Text><br /><Text copyable>{row.ma_kh}</Text></div>,
  };
  const analysisScopeColumns = [
    { title: 'Chi nhánh', dataIndex: 'branch_code', width: 100, render: (value) => <Tag color="blue">{value || '—'}</Tag> },
    { title: 'Cán bộ quản lý', dataIndex: 'officer_name', width: 190, render: (value, row) => value || row.officer_code || 'Chưa xác định' },
  ];
  const analysisDrillColumns = drillIsAccountMovement ? [
    analysisCustomerColumn,
    ...analysisScopeColumns,
    { title: drilldown.metric === 'new_deposit_account' ? 'Tài khoản mới' : 'Tài khoản tất toán/ngừng', dataIndex: 'movement_accounts', width: 330, render: (items = []) => <Space size={[4, 4]} wrap>{items.map((item) => <Tag color={drilldown.metric === 'new_deposit_account' ? 'success' : 'warning'} key={item}>{item}</Tag>)}</Space> },
    { title: 'Số TK', dataIndex: 'movement_account_count', align: 'center', width: 90, render: (value) => Number(value || 0).toLocaleString('vi-VN') },
    { title: 'Tiền gửi kỳ này', dataIndex: 'deposit', align: 'right', width: 165, render: fullMoney },
    { title: 'Tiền gửi kỳ trước', dataIndex: 'previous_deposit', align: 'right', width: 165, render: fullMoney },
  ] : drillIsDepositDrop ? [
    analysisCustomerColumn,
    ...analysisScopeColumns,
    { title: 'Tiền gửi kỳ trước', dataIndex: 'previous_deposit', align: 'right', width: 170, render: fullMoney },
    { title: 'Tiền gửi kỳ này', dataIndex: 'deposit', align: 'right', width: 170, render: fullMoney },
    { title: 'Biến động', dataIndex: 'change', align: 'right', width: 170, render: (value) => <Text type="danger">{fullMoney(value)}</Text> },
    { title: 'Tỷ lệ giảm', dataIndex: 'change_pct', align: 'right', width: 110, render: (value) => <Tag color="error">{Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%</Tag> },
  ] : drillIsService ? [
    analysisCustomerColumn,
    ...analysisScopeColumns,
    { title: 'Số SP/DV', dataIndex: 'service_count', align: 'center', width: 100, sorter: (a, b) => Number(a.service_count || 0) - Number(b.service_count || 0), render: (value) => <Tag color={Number(value || 0) > 0 ? 'success' : 'default'}>{Number(value || 0).toLocaleString('vi-VN')}</Tag> },
    { title: 'Sản phẩm đang sử dụng', dataIndex: 'active_services', width: 410, render: (items) => <Space size={[4, 4]} wrap>{(items || []).length ? items.map((item) => <Tag color="processing" key={item.key}>{item.label || serviceLabels[item.key] || item.key}</Tag>) : <Text type="secondary">Chưa có sản phẩm</Text>}</Space> },
    { title: 'Số CN quan hệ', dataIndex: 'branch_count', align: 'center', width: 110, render: (value) => Number(value || 0).toLocaleString('vi-VN') },
  ] : drillIsFee ? [
    analysisCustomerColumn,
    ...analysisScopeColumns,
    { title: 'Phí trong kỳ', dataIndex: 'fee', align: 'right', width: 170, sorter: (a, b) => Number(a.fee || 0) - Number(b.fee || 0), render: fullMoney },
    { title: 'SP/DV đang dùng', dataIndex: 'service_count', align: 'center', width: 120 },
    { title: 'Quy mô tiền gửi', dataIndex: 'deposit', align: 'right', width: 170, render: fullMoney },
  ] : drillIsCredit ? [
    analysisCustomerColumn,
    ...analysisScopeColumns,
    { title: 'Dư nợ', dataIndex: 'loan', align: 'right', width: 170, sorter: (a, b) => Number(a.loan || 0) - Number(b.loan || 0), render: fullMoney },
    { title: 'DPRR', dataIndex: 'provision', align: 'right', width: 160, sorter: (a, b) => Number(a.provision || 0) - Number(b.provision || 0), render: fullMoney },
    { title: 'Dư nợ XLRR', dataIndex: 'written_off', align: 'right', width: 170, sorter: (a, b) => Number(a.written_off || 0) - Number(b.written_off || 0), render: fullMoney },
  ] : drillIsDeposit ? [
    analysisCustomerColumn,
    ...analysisScopeColumns,
    { title: 'Tiền gửi CKH', dataIndex: 'deposit', align: 'right', width: 170, sorter: (a, b) => Number(a.deposit || 0) - Number(b.deposit || 0), render: fullMoney },
    { title: 'TGTT bình quân', dataIndex: 'casa', align: 'right', width: 170, sorter: (a, b) => Number(a.casa || 0) - Number(b.casa || 0), render: fullMoney },
    { title: 'Tổng nguồn vốn', align: 'right', width: 180, sorter: (a, b) => Number(a.deposit || 0) + Number(a.casa || 0) - Number(b.deposit || 0) - Number(b.casa || 0), render: (_, row) => fullMoney(Number(row.deposit || 0) + Number(row.casa || 0)) },
  ] : [analysisCustomerColumn, ...analysisScopeColumns];

  return <div className={`demo-page c360-analysis-page is-${meta.tone}`}>
    <div className="demo-page-heading c360-analysis-heading"><div><Text className="demo-eyebrow">{meta.eyebrow}</Text><Title level={2}>{meta.title}</Title><Text type="secondary">{meta.description}</Text></div><Space>{canExport ? <Button icon={<DownloadOutlined />} onClick={exportMetric}>Xuất Excel</Button> : null}<Tag color="success">Kỳ {periodLabel(periodKey)} · LIVE</Tag></Space></div>
    <div className="c360-analysis-kpi-grid">{pageKpis.map(([label, value, note, tone, metric, definitionKey]) => <AnalysisKpi key={label} label={label} value={value} note={note} tone={tone} definition={metricDefinition(definitionKey || metric)} periodKey={periodKey} />)}</div>
    {reconciliationTotal > 0 && <Alert className="demo-section" showIcon type="warning" message={`${reconciliationTotal.toLocaleString('vi-VN')} mã khách hàng từ file nguồn chưa khớp Kho CIF`} description="Dữ liệu được giữ theo lần xử lý mới nhất và không bị mất. Mở danh sách để xem từng mã cùng lý do chưa đối chiếu." action={<Button danger ghost onClick={() => loadReconciliations(1)}>Xem danh sách & lý do</Button>} />}
    <Card className="demo-panel demo-section c360-analysis-trend c360-business-trend-card" title={trendPresentation.title} extra={<Text type="secondary">{trendPresentation.extra}</Text>}>{trendPresentation.chart}</Card>
    <Card className="demo-panel demo-section" title="So sánh kỳ" extra={<Space><Text type="secondary">Kỳ đối chiếu</Text><Select value={comparisonPeriod || undefined} style={{ width: 145 }} placeholder="Chọn kỳ" onChange={setComparisonPeriod} options={(periods || []).filter((item) => item.period_key !== periodKey && trends.some((trend) => trend.period_key === item.period_key)).map((item) => ({ value: item.period_key, label: periodLabel(item.period_key) }))} /></Space>}><div className="c360-analysis-compare-grid is-expanded">{comparisonFields.map(([label, field, kind]) => { const current = trendValue(currentTrend, field); const previous = trendValue(comparisonTrend, field); const pct = previous ? (current - previous) / Math.abs(previous) * 100 : 0; const sourceFields = field === 'total_funding' ? ['deposit', 'casa'] : field === 'total_scale' ? ['deposit', 'casa', 'loan'] : field === 'provision_ratio' ? ['provision', 'loan'] : field === 'fee_per_customer' ? ['fee', 'customers'] : field === 'fee_yield' ? ['fee', 'deposit', 'casa', 'loan'] : [field]; const sourceAvailable = sourceFields.every((sourceField) => comparisonTrend.availability?.[sourceField] !== false); const populationChanged = field === 'customers' && previous > 0 && Math.abs(pct) >= 50; const comparisonValid = comparisonTrend.period_key && sourceAvailable && !populationChanged; const statusText = !comparisonTrend.period_key ? 'Chưa chọn kỳ đối chiếu' : !sourceAvailable ? 'Kỳ đối chiếu thiếu nguồn' : populationChanged ? 'Thay đổi tập CIF nền' : !previous && current ? 'Mới phát sinh' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`; const format = kind === 'count' ? countFormat : kind === 'officer' ? (value) => `${Number(value || 0).toLocaleString('vi-VN')} CB` : kind === 'decimal' ? (value) => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : kind === 'percent' ? percentFormat : moneyFormat; return <div key={field}><Text type="secondary">{label}</Text><strong className={comparisonValid ? (pct >= 0 ? 'is-up' : 'is-down') : ''}>{statusText}</strong><small><b>{format(current)}</b><span>so với {format(previous)}</span></small></div>; })}</div></Card>

    {mode === 'analysis-deposit' && <Row gutter={[16, 16]} className="demo-section">
      <Col span={24}><Card className="demo-panel" title="Cơ cấu và biến động nguồn vốn"><div className="c360-analysis-bars">
        {[['Tiền gửi có kỳ hạn', deposit.term, '#16a34a', 'term_deposit'], ['TGTT bình quân', deposit.casa_average, '#1677ff', 'casa'], ['Doanh số thanh toán', deposit.payment_turnover, '#7c3aed', 'payment_turnover']].map(([label, value, color, metric]) => <div key={label}><span><Text>{label}</Text><MetricDefinitionTooltip definition={metricDefinition(metric)} periodKey={periodKey}><Text strong>{compactMoney(value)}</Text></MetricDefinitionTooltip></span><Progress percent={Math.round(Number(value || 0) / Math.max(Number(deposit.term || 0), Number(deposit.casa_average || 0), Number(deposit.payment_turnover || 0), 1) * 100)} showInfo={false} strokeColor={color} /></div>)}
      </div></Card></Col>
      <Col span={24}><Card className="demo-panel" title="Biến động tài khoản"><div className="c360-analysis-event-grid"><AnalysisKpi label="Tài khoản mới" value={Number(depositInsight.new_accounts || 0).toLocaleString('vi-VN')} note="So với kỳ trước" tone="green" definition={{ source: 'PF14', columns: 'ACCOUNTNO, CUSTSEQ, TRBRCD', formula: 'Tài khoản có ở kỳ này nhưng không có ở kỳ trước', currency: 'Không áp dụng' }} periodKey={periodKey} onClick={() => loadDrilldown('new_deposit_account')} /><AnalysisKpi label="Tài khoản tất toán/ngừng" value={Number(depositInsight.closed_accounts || 0).toLocaleString('vi-VN')} note="So với kỳ trước" tone="gold" definition={{ source: 'PF14', columns: 'ACCOUNTNO, CUSTSEQ, TRBRCD', formula: 'Tài khoản có ở kỳ trước nhưng không còn ở kỳ này', currency: 'Không áp dụng' }} periodKey={periodKey} onClick={() => loadDrilldown('closed_deposit_account')} /><AnalysisKpi label="KH giảm tiền gửi mạnh" value={Number(depositInsight.large_drop_customers || 0).toLocaleString('vi-VN')} note="Giảm từ 30%" tone="red" definition={{ source: 'C360 từ PF14/DP01', columns: 'Số dư tiền gửi kỳ này và kỳ trước', formula: 'Kỳ này ≤ 70% kỳ trước và kỳ trước > 0', currency: 'Đã quy đổi VNĐ trước khi so sánh' }} periodKey={periodKey} onClick={() => loadDrilldown('deposit_drop')} /></div></Card></Col>
    </Row>}

    {mode === 'analysis-credit' && <Row gutter={[16, 16]} className="demo-section">
      <Col span={24}><Card className="demo-panel" title="Cơ cấu dư nợ theo loại vay"><div className="c360-analysis-bars">{[['Ngắn hạn', credit.short_term, '#1677ff', 'short_loan'], ['Trung dài hạn', credit.medium_long_term, '#7c3aed', 'medium_long_loan'], ['Thấu chi', credit.overdraft, '#f59e0b', 'overdraft']].map(([label, value, color, metric]) => <div key={label}><span><Text>{label}</Text><MetricDefinitionTooltip definition={metricDefinition(metric)} periodKey={periodKey}><Text strong>{compactMoney(value)}</Text></MetricDefinitionTooltip></span><Progress percent={Number((Number(value || 0) / Math.max(Number(credit.total || 0), 1) * 100).toFixed(2))} format={formatPercent} strokeColor={color} /></div>)}</div></Card></Col>
      <Col span={24}><Card className="demo-panel" title="Dự phòng và rủi ro"><Alert className="c360-provision-guide" type="info" showIcon message="Cách đọc biến động DPRR" description="Số trong kỳ = mức lũy kế kỳ này trừ kỳ trước. Số dương là trích tăng; số âm là giảm hoặc hoàn nhập dự phòng, không phải trích lập âm." /><div className="c360-analysis-event-grid"><AnalysisKpi label="Tăng/giảm DPRR chung trong kỳ" value={compactMoney(risk.general_period)} note={`${Number(risk.general_period || 0) < 0 ? 'Giảm/hoàn nhập' : Number(risk.general_period || 0) > 0 ? 'Trích tăng' : 'Không biến động'} · Lũy kế ${compactMoney(risk.general_accumulated)}`} tone={Number(risk.general_period || 0) < 0 ? 'green' : Number(risk.general_period || 0) > 0 ? 'red' : 'blue'} definition={metricDefinition('general_provision')} periodKey={periodKey} onClick={() => loadDrilldown('general_provision_period')} /><AnalysisKpi label="Tăng/giảm DPRR cụ thể trong kỳ" value={compactMoney(risk.specific_period)} note={`${Number(risk.specific_period || 0) < 0 ? 'Giảm/hoàn nhập' : Number(risk.specific_period || 0) > 0 ? 'Trích tăng' : 'Không biến động'} · Lũy kế ${compactMoney(risk.specific_accumulated)}`} tone={Number(risk.specific_period || 0) < 0 ? 'green' : Number(risk.specific_period || 0) > 0 ? 'red' : 'blue'} definition={metricDefinition('specific_provision')} periodKey={periodKey} onClick={() => loadDrilldown('specific_provision_period')} /></div></Card></Col>
      <Col span={24}><Card className="demo-panel c360-debt-group-card" title="Phân bố nhóm nợ" extra={<Text type="secondary">Bấm một nhóm để xem đúng khách hàng cấu thành</Text>}><Table size="small" pagination={false} rowKey="group" dataSource={risk.debt_groups || []} onRow={(row) => ({ onClick: () => loadDrilldown(`debt_group:${row.group}`) })} rowClassName="demo-clickable-row" columns={[{ title: 'Nhóm nợ', dataIndex: 'group', render: (value) => <Tag color={Number(value) > 2 ? 'error' : Number(value) === 2 ? 'warning' : 'success'}>Nhóm {value}</Tag> }, { title: 'Khách hàng', dataIndex: 'customers', align: 'right', render: (value) => Number(value || 0).toLocaleString('vi-VN') }, { title: 'Dư nợ', dataIndex: 'balance', align: 'right', render: fullMoney }, { title: 'Tỷ trọng', align: 'right', render: (_, row) => formatPercent(credit.total ? Number(row.balance || 0) / Number(credit.total) * 100 : 0) }]} /></Card></Col>
    </Row>}

    {mode === 'analysis-income' && <Row gutter={[16, 16]} className="demo-section">
      <Col span={24}><Card className="demo-panel c360-fee-reconciliation" title="Đối soát phân loại phí KH02" extra={<Tag color={feeReconciliation.is_balanced && feeReconciliation.profile_is_balanced ? 'success' : 'warning'}>{feeReconciliation.is_balanced && feeReconciliation.profile_is_balanced ? 'ĐÃ CÂN ĐỐI' : 'CẦN RÀ SOÁT'}</Tag>}>
        <Alert showIcon type={feeReconciliation.is_balanced ? 'success' : 'error'} message="Phương trình kiểm soát" description={`Phí ứng viên KH02 = phí đã phân loại + phí chưa phân loại. Chênh lệch kiểm tra: ${fullMoney(feeReconciliation.balance_difference)}.`} />
        <div className="c360-fee-reconciliation-grid">
          <button type="button" onClick={() => loadFeeTrace({ level: 'account' })}><span>Tổng phí ứng viên KH02</span><strong>{fullMoney(feeReconciliation.source?.net)}</strong><small>Có {fullMoney(feeReconciliation.source?.credit)} · Nợ {fullMoney(feeReconciliation.source?.debit)}</small></button>
          <button type="button" className="is-classified" onClick={() => loadFeeTrace({ level: 'account', category: 'classified' })}><span>Đã phân loại</span><strong>{fullMoney(feeReconciliation.classified?.net)}</strong><small>{Number(feeReconciliation.classified?.records || 0).toLocaleString('vi-VN')} dòng · phủ {formatPercent(feeReconciliation.record_coverage_pct)}</small></button>
          <button type="button" className="is-unclassified" onClick={() => loadFeeTrace({ level: 'account', category: 'unclassified' })}><span>Chưa phân loại</span><strong>{fullMoney(feeReconciliation.unclassified?.net)}</strong><small>{Number(feeReconciliation.unclassified?.records || 0).toLocaleString('vi-VN')} dòng cần rà soát</small></button>
          <button type="button" className={feeReconciliation.profile_is_balanced ? 'is-profile-ok' : 'is-profile-warning'} onClick={() => loadFeeTrace({ level: 'account' })}><span>Đồng bộ hồ sơ C360</span><strong>{fullMoney(feeReconciliation.profile_total)}</strong><small>Chênh nguồn đã phân loại {fullMoney(feeReconciliation.profile_difference)}</small></button>
        </div>
      </Card></Col>
      <Col span={24}><Card className="demo-panel" title="Cơ cấu thu phí" extra={<Text type="secondary">Bấm từng nhóm để xem mã tài khoản cấu thành</Text>}><div className="c360-analysis-bars is-fee-composition">{(income.fees || []).map((item, index) => <div key={item.key} role="button" tabIndex={0} onClick={() => loadFeeTrace({ level: 'account', category: item.key })} onKeyDown={(event) => { if (event.key === 'Enter') loadFeeTrace({ level: 'account', category: item.key }); }} className={`is-clickable ${Number(item.value || 0) === 0 ? 'is-zero' : Number(item.value || 0) < 0 ? 'is-negative' : ''}`}><span><Text>{item.label}</Text><MetricDefinitionTooltip definition={metricDefinition('fee')} periodKey={periodKey}><Text strong type={Number(item.value || 0) < 0 ? 'danger' : undefined}>{fullMoney(item.value)}</Text></MetricDefinitionTooltip></span><small>{Number(item.customers || 0).toLocaleString('vi-VN')} KH · bình quân {fullMoney(item.average)} · tỷ trọng {formatPercent(item.pct)}</small><Progress percent={Number(item.pct || 0)} format={formatPercent} status={Number(item.value || 0) < 0 ? 'exception' : 'normal'} strokeColor={['#16a34a', '#1677ff', '#7c3aed', '#f59e0b'][index % 4]} /></div>)}</div></Card></Col>
      <Col span={24}><Card className="demo-panel" title="Độ phủ và khoảng trống sản phẩm" extra={<Select size="small" value={serviceView} onChange={setServiceView} style={{ width: 180 }} options={[{ value: 'all', label: 'Tất cả sản phẩm' }, { value: 'used', label: 'Có khách sử dụng' }, { value: 'gap', label: 'Còn khoảng trống' }]} />}><div className="c360-analysis-service-grid">{(data?.services || []).filter((item) => serviceView === 'all' || (serviceView === 'used' ? Number(item.count || 0) > 0 : Number(item.base || 0) > Number(item.count || 0))).map((item) => <MetricDefinitionTooltip key={item.key} definition={metricDefinition('service')} periodKey={periodKey}><div><span><Text strong>{item.label || serviceLabels[item.key] || item.key}</Text><Text type="secondary">{Number(item.count || 0).toLocaleString('vi-VN')} / {Number(item.base || 0).toLocaleString('vi-VN')} {item.base_label} · {formatPercent(item.pct)}</Text></span><Progress percent={Number(item.pct || 0)} format={formatPercent} strokeColor={Number(item.pct || 0) === maxService ? '#16a34a' : '#1677ff'} /><button type="button" className="c360-service-gap" onClick={() => loadDrilldown(`no_service:${item.key}`)}>Còn {Math.max(0, Number(item.base || 0) - Number(item.count || 0)).toLocaleString('vi-VN')} KH chưa dùng</button></div></MetricDefinitionTooltip>)}</div></Card></Col>
    </Row>}

    {mode === 'analysis-unit' && <>
      <div className="c360-officer-highlights demo-section">{officerHighlights.map((item) => <div key={item.label} className={`is-${item.tone}`}><span><UserOutlined /></span><small>{item.label}</small><strong>{item.officer?.name || 'Chưa có dữ liệu'}</strong><b>{item.value(item.officer)}</b><em>{item.officer ? `${item.officer.employeeCode || item.officer.code} · ${Number(item.officer.custCount || 0).toLocaleString('vi-VN')} KH` : 'Không có cán bộ hợp lệ'}</em></div>)}</div>
      <Row gutter={[16, 16]} className="demo-section c360-officer-visuals">
        <Col span={24}><Card className="demo-panel" title="Xếp hạng cán bộ" extra={<Space><Text type="secondary">Hiển thị Top 10 cùng giá trị thực tế</Text><Select size="small" value={officerMetric} onChange={setOfficerMetric} style={{ width: 190 }} options={officerMetricOptions.map(({ value, label }) => ({ value, label }))} /></Space>}><OfficerRankingChart rows={officerRows} metric={officerMetric} /></Card></Col>
      </Row>
      <Card className="demo-panel demo-section c360-officer-table" title="Danh mục hiệu quả theo cán bộ" extra={<Space><Tag color="blue">{officerCount.toLocaleString('vi-VN')} cán bộ</Tag><Text type="secondary">Bấm một cán bộ để xem đúng danh mục khách hàng</Text></Space>}><Table size="small" sticky rowKey={(row) => `${row.code}-${row.employeeCode || ''}`} dataSource={officerRows} onRow={(row) => ({ onClick: () => { setDrillKeyword(''); loadOfficerCustomers(row, { hasDeposit: false, hasLoan: false, hasFee: false, multiBranch: false }, 1, ''); } })} rowClassName="demo-clickable-row" pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50], showTotal: (value) => `${value.toLocaleString('vi-VN')} cán bộ` }} scroll={{ x: 1900, y: 520 }} columns={[
        { title: 'Cán bộ quản lý', fixed: 'left', width: 250, render: (_, row) => <div className="c360-officer-cell"><Avatar>{row.name?.charAt(0) || 'C'}</Avatar><span><Text strong>{row.name || row.code}</Text><Text type="secondary">{row.employeeCode || row.code}</Text></span></div> },
        { title: 'Khách hàng', dataIndex: 'custCount', align: 'right', width: 115, sorter: (a, b) => Number(a.custCount || 0) - Number(b.custCount || 0), render: (value) => Number(value || 0).toLocaleString('vi-VN') },
        { title: 'KH mới nhận', dataIndex: 'newCustomers', align: 'right', width: 120, sorter: (a, b) => Number(a.newCustomers || 0) - Number(b.newCustomers || 0), render: (value, row) => row.previousPeriod ? <Tag color={Number(value || 0) ? 'success' : 'default'}>+{Number(value || 0).toLocaleString('vi-VN')}</Tag> : '—' },
        { title: 'KH chuyển đi', dataIndex: 'transferredCustomers', align: 'right', width: 125, sorter: (a, b) => Number(a.transferredCustomers || 0) - Number(b.transferredCustomers || 0), render: (value, row) => row.previousPeriod ? <Tag color={Number(value || 0) ? 'warning' : 'default'}>-{Number(value || 0).toLocaleString('vi-VN')}</Tag> : '—' },
        { title: 'Biến động tiền gửi', dataIndex: 'depositChange', align: 'right', width: 175, sorter: (a, b) => Number(a.depositChange || 0) - Number(b.depositChange || 0), render: (value, row) => row.previousPeriod ? <Text className={Number(value || 0) >= 0 ? 'c360-value-up' : 'c360-value-down'}>{Number(value || 0) >= 0 ? '+' : ''}{compactMoney(value)}</Text> : '—' },
        { title: 'Biến động dư nợ', dataIndex: 'loanChange', align: 'right', width: 170, sorter: (a, b) => Number(a.loanChange || 0) - Number(b.loanChange || 0), render: (value, row) => row.previousPeriod ? <Text className={Number(value || 0) >= 0 ? 'c360-value-up' : 'c360-value-down'}>{Number(value || 0) >= 0 ? '+' : ''}{compactMoney(value)}</Text> : '—' },
        { title: 'Tổng quy mô', align: 'right', width: 175, sorter: (a, b) => (Number(a.totalDeposit || 0) + Number(a.totalCASA || 0) + Number(a.totalLoan || 0)) - (Number(b.totalDeposit || 0) + Number(b.totalCASA || 0) + Number(b.totalLoan || 0)), render: (_, row) => { const value = Number(row.totalDeposit || 0) + Number(row.totalCASA || 0) + Number(row.totalLoan || 0); return <Tooltip title={fullMoney(value)}><Text strong>{compactMoney(value)}</Text></Tooltip>; } },
        { title: 'Tiền gửi CKH', dataIndex: 'totalDeposit', align: 'right', width: 160, sorter: (a, b) => Number(a.totalDeposit || 0) - Number(b.totalDeposit || 0), render: (value) => <Tooltip title={fullMoney(value)}>{compactMoney(value)}</Tooltip> },
        { title: 'TGTT bình quân', dataIndex: 'totalCASA', align: 'right', width: 160, sorter: (a, b) => Number(a.totalCASA || 0) - Number(b.totalCASA || 0), render: (value) => <Tooltip title={fullMoney(value)}>{compactMoney(value)}</Tooltip> },
        { title: 'Dư nợ', dataIndex: 'totalLoan', align: 'right', width: 160, sorter: (a, b) => Number(a.totalLoan || 0) - Number(b.totalLoan || 0), render: (value) => <Tooltip title={fullMoney(value)}>{compactMoney(value)}</Tooltip> },
        { title: 'Thu phí', dataIndex: 'totalFee', align: 'right', width: 150, sorter: (a, b) => Number(a.totalFee || 0) - Number(b.totalFee || 0), render: (value) => <Tooltip title={fullMoney(value)}>{compactMoney(value)}</Tooltip> },
        { title: 'Quy mô/KH', align: 'right', width: 145, sorter: (a, b) => ((Number(a.totalDeposit || 0) + Number(a.totalCASA || 0) + Number(a.totalLoan || 0)) / Math.max(1, Number(a.custCount || 0))) - ((Number(b.totalDeposit || 0) + Number(b.totalCASA || 0) + Number(b.totalLoan || 0)) / Math.max(1, Number(b.custCount || 0))), render: (_, row) => compactMoney((Number(row.totalDeposit || 0) + Number(row.totalCASA || 0) + Number(row.totalLoan || 0)) / Math.max(1, Number(row.custCount || 0))) },
        { title: 'SP/KH', dataIndex: 'avgCrossSell', align: 'right', width: 100, sorter: (a, b) => Number(a.avgCrossSell || 0) - Number(b.avgCrossSell || 0), render: (value) => <Tag color={Number(value || 0) >= 2 ? 'success' : Number(value || 0) >= 1 ? 'processing' : 'warning'}>{Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</Tag> },
      ]} /></Card>
      <Card className="demo-panel demo-section c360-officer-branch-table" title="Phân bổ cán bộ theo chi nhánh" extra={<Text type="secondary">Tổng hợp năng lực quản lý theo đơn vị</Text>}><Table size="small" sticky pagination={false} rowKey="branch_code" dataSource={data?.branches || []} scroll={{ x: 1180, y: 360 }} columns={[
        { title: 'Chi nhánh', dataIndex: 'branch_code', fixed: 'left', width: 120, render: (value) => <Tag color="purple">{value}</Tag> },
        { title: 'Cán bộ có danh mục', dataIndex: 'officers', align: 'right', width: 155, render: (value) => Number(value || 0).toLocaleString('vi-VN') },
        { title: 'Khách hàng', dataIndex: 'customers', align: 'right', width: 125, render: (value) => Number(value || 0).toLocaleString('vi-VN') },
        { title: 'KH/cán bộ', align: 'right', width: 120, render: (_, row) => Number(row.officers || 0) ? (Number(row.customers || 0) / Number(row.officers)).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : '—' },
        { title: 'Tổng quy mô', align: 'right', width: 180, render: (_, row) => fullMoney(Number(row.deposit || 0) + Number(row.casa || 0) + Number(row.loan || 0)) },
        { title: 'Quy mô/cán bộ', align: 'right', width: 170, render: (_, row) => Number(row.officers || 0) ? compactMoney((Number(row.deposit || 0) + Number(row.casa || 0) + Number(row.loan || 0)) / Number(row.officers)) : '—' },
        { title: 'Thu phí', dataIndex: 'fee', align: 'right', width: 155, render: fullMoney },
        { title: 'Phí/cán bộ', align: 'right', width: 145, render: (_, row) => Number(row.officers || 0) ? compactMoney(Number(row.fee || 0) / Number(row.officers)) : '—' },
      ]} /></Card>
    </>}
    <Drawer className="c360-fee-trace-drawer" width="min(1320px, 98vw)" open={feeTrace.open} onClose={() => setFeeTrace((current) => ({ ...current, open: false }))} title={<div className="c360-kpi-drill-title"><span>Truy vết phí KH02 · {feeTrace.categoryLabel || 'Tất cả nhóm phí'}</span><small>{feeTrace.level === 'account' ? 'Nhóm phí → mã tài khoản' : feeTrace.level === 'customer' ? `Mã ${feeTrace.accountCode} → khách hàng` : `Khách hàng ${feeTrace.customerCode} → bút toán gốc`} · Kỳ ${periodLabel(periodKey)}</small></div>} extra={feeTrace.level !== 'account' ? <Button onClick={() => feeTrace.level === 'transaction' ? loadFeeTrace({ level: 'customer', category: feeTrace.category, accountCode: feeTrace.accountCode }) : loadFeeTrace({ level: 'account', category: feeTrace.category })}>Quay lại</Button> : null}>
      <AppliedScopeBanner params={profileParams} />
      <div className="c360-fee-trace-summary">
        <span><Text type="secondary">Phát sinh Có</Text><strong>{fullMoney(feeTrace.summary?.credit)}</strong></span>
        <span><Text type="secondary">Phát sinh Nợ</Text><strong>{fullMoney(feeTrace.summary?.debit)}</strong></span>
        <span><Text type="secondary">Phí thuần</Text><strong>{fullMoney(feeTrace.summary?.net)}</strong></span>
        <span><Text type="secondary">Quy mô truy vết</Text><strong>{Number(feeTrace.summary?.records || 0).toLocaleString('vi-VN')} dòng · {Number(feeTrace.summary?.customers || 0).toLocaleString('vi-VN')} KH</strong></span>
      </div>
      {feeTrace.level === 'customer' && !feeTrace.canViewTransactions ? <Alert className="c360-fee-trace-note" showIcon type="info" message="Bấm khách hàng để mở hồ sơ C360" description="Bút toán KH02 gốc chỉ hiển thị cho quản trị viên có quyền truy vết dữ liệu." /> : null}
      <Table
        loading={feeTraceLoading}
        size="small"
        sticky
        rowKey={(row) => feeTrace.level === 'account' ? `${row.category}-${row.account_code}` : feeTrace.level === 'customer' ? `${row.branch_code}-${row.customer_code}` : row.id}
        dataSource={feeTrace.items || []}
        rowClassName={feeTrace.level === 'transaction' ? '' : 'demo-clickable-row'}
        onRow={(row) => ({ onClick: () => {
          if (feeTrace.level === 'account') loadFeeTrace({ level: 'customer', category: row.category, accountCode: row.account_code });
          else if (feeTrace.level === 'customer' && feeTrace.canViewTransactions) loadFeeTrace({ level: 'transaction', category: feeTrace.category, accountCode: feeTrace.accountCode, customerCode: row.customer_code });
          else if (feeTrace.level === 'customer') onOpenCustomer?.({ id: row.customer_code, ma_kh: row.customer_code, ten_kh: row.customer_name, primary_branch_code: row.branch_code });
        } })}
        scroll={{ x: feeTrace.level === 'transaction' ? 1500 : 980, y: 'calc(100vh - 350px)' }}
        pagination={{ current: feeTrace.page, pageSize: 20, total: feeTrace.total, showSizeChanger: false, showTotal: (value) => `${value.toLocaleString('vi-VN')} ${feeTrace.level === 'account' ? 'mã tài khoản' : feeTrace.level === 'customer' ? 'quan hệ khách hàng' : 'bút toán'}`, onChange: (page) => loadFeeTrace({ level: feeTrace.level, category: feeTrace.category, accountCode: feeTrace.accountCode, customerCode: feeTrace.customerCode, page }) }}
        columns={feeTrace.level === 'account' ? [
          { title: 'Mã tài khoản', dataIndex: 'account_code', fixed: 'left', width: 135, render: (value) => <Text code strong>{value}</Text> },
          { title: 'Nhóm phí', dataIndex: 'category_label', width: 220, render: (value, row) => <Tag color={row.category === 'unclassified' ? 'warning' : 'blue'}>{value}</Tag> },
          { title: 'Số KH', dataIndex: 'customers', align: 'right', width: 100, render: (value) => Number(value || 0).toLocaleString('vi-VN') },
          { title: 'Số dòng', dataIndex: 'records', align: 'right', width: 100, render: (value) => Number(value || 0).toLocaleString('vi-VN') },
          { title: 'Số CN', dataIndex: 'branches', align: 'right', width: 90 },
          { title: 'Phát sinh Có', dataIndex: 'credit', align: 'right', width: 170, render: fullMoney },
          { title: 'Phát sinh Nợ', dataIndex: 'debit', align: 'right', width: 170, render: fullMoney },
          { title: 'Phí thuần', dataIndex: 'net', align: 'right', width: 180, render: (value) => <Text strong type={Number(value || 0) < 0 ? 'danger' : undefined}>{fullMoney(value)}</Text> },
        ] : feeTrace.level === 'customer' ? [
          { title: 'Chi nhánh', dataIndex: 'branch_code', fixed: 'left', width: 105, render: (value) => <Tag color="blue">{value || '—'}</Tag> },
          { title: 'Khách hàng', fixed: 'left', width: 290, render: (_, row) => <div><Text strong>{row.customer_name || 'Chưa có tên'}</Text><br /><Text copyable>{row.customer_code}</Text></div> },
          { title: 'Số dòng', dataIndex: 'records', align: 'right', width: 100, render: (value) => Number(value || 0).toLocaleString('vi-VN') },
          { title: 'Phát sinh Có', dataIndex: 'credit', align: 'right', width: 180, render: fullMoney },
          { title: 'Phát sinh Nợ', dataIndex: 'debit', align: 'right', width: 180, render: fullMoney },
          { title: 'Phí thuần', dataIndex: 'net', align: 'right', width: 190, render: (value) => <Text strong type={Number(value || 0) < 0 ? 'danger' : undefined}>{fullMoney(value)}</Text> },
        ] : [
          { title: 'Ngày GD', dataIndex: 'transaction_date', fixed: 'left', width: 115, render: dateLabel },
          { title: 'Chi nhánh', dataIndex: 'branch_code', width: 95 },
          { title: 'Khách hàng', width: 240, render: (_, row) => <div><Text>{row.customer_name || '—'}</Text><br /><Text copyable>{row.customer_code}</Text></div> },
          { title: 'ACCTCD', dataIndex: 'account_code', width: 115, render: (value) => <Text code>{value}</Text> },
          { title: 'Mã nghiệp vụ', dataIndex: 'business_code', width: 120 },
          { title: 'Mã giao dịch', dataIndex: 'transaction_code', width: 120 },
          { title: 'Tham chiếu', dataIndex: 'transaction_sequence', width: 200, render: (value) => value ? <Text copyable>{value}</Text> : '—' },
          { title: 'Phát sinh Có', dataIndex: 'credit', align: 'right', width: 160, render: fullMoney },
          { title: 'Phát sinh Nợ', dataIndex: 'debit', align: 'right', width: 160, render: fullMoney },
          { title: 'Phí thuần', dataIndex: 'net', align: 'right', width: 165, render: fullMoney },
          { title: 'File nguồn', dataIndex: 'source_file', width: 250 },
        ]}
      />
    </Drawer>
    <Drawer width="min(1380px, 98vw)" open={reconciliation.open} onClose={() => setReconciliation((current) => ({ ...current, open: false }))} title={`Khách hàng chưa đối chiếu Kho CIF · Kỳ ${periodLabel(periodKey)}`}>
      <AppliedScopeBanner params={profileParams} total={reconciliation.total} />
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
    <Drawer className="c360-kpi-drill-drawer" width="min(1240px, 98vw)" open={drilldown.open} onClose={() => setDrilldown((current) => ({ ...current, open: false }))} title={<div className="c360-kpi-drill-title"><span>{drilldown.label || 'Chi tiết khách hàng'}</span><small>{drillIsOfficer ? 'Danh mục theo cán bộ và phạm vi đang áp dụng' : 'Danh sách đúng nội dung biến động'} · Kỳ {periodLabel(periodKey)}</small></div>} extra={canExport && !drillIsOfficer ? <Button icon={<DownloadOutlined />} onClick={exportMetric}>Xuất Excel</Button> : null}>
      <AppliedScopeBanner params={profileParams} total={drilldown.total} />
      {drillIsOfficer ? <div className="c360-officer-quick-filters"><span><FilterOutlined /><strong>Lọc nhanh danh mục</strong></span><Checkbox.Group value={officerQuickValues} options={[{ label: 'Có tiền gửi', value: 'hasDeposit' }, { label: 'Có tiền vay', value: 'hasLoan' }, { label: 'Có phí', value: 'hasFee' }, { label: 'Quan hệ nhiều chi nhánh', value: 'multiBranch' }]} onChange={(values) => { const filters = { hasDeposit: values.includes('hasDeposit'), hasLoan: values.includes('hasLoan'), hasFee: values.includes('hasFee'), multiBranch: values.includes('multiBranch') }; loadOfficerCustomers(officerDrill.row, filters, 1, drillKeyword); }} /></div> : null}
      <div className="c360-drill-toolbar"><Input.Search allowClear value={drillKeyword} onChange={(event) => setDrillKeyword(event.target.value)} onSearch={(value) => drillIsOfficer ? loadOfficerCustomers(officerDrill.row, officerDrill.filters, 1, value) : loadDrilldown(drilldown.metric, 1, value)} placeholder="Tìm mã hoặc tên khách hàng" /><Space direction="vertical" size={0} align="end"><Text type="secondary">{drilldown.total.toLocaleString('vi-VN')} khách hàng phù hợp</Text>{Number(drilldown.totalValue || 0) !== 0 && <Text strong>{drillIsAccountMovement ? `${Number(drilldown.totalValue || 0).toLocaleString('vi-VN')} tài khoản biến động` : drillIsService ? `${Number(drilldown.totalValue || 0).toLocaleString('vi-VN')} lượt sản phẩm đang sử dụng` : `Tổng giá trị: ${fullMoney(drilldown.totalValue)}`}</Text>}</Space></div>
      <Table loading={drillLoading} size="small" sticky rowKey="ma_kh" dataSource={drilldown.items} onRow={(row) => ({ onClick: () => onOpenCustomer?.({ ...row, id: row.ma_kh, ma_kh: row.ma_kh, ten_kh: row.ten_kh }) })} rowClassName="demo-clickable-row" scroll={{ x: 1120, y: 'calc(100vh - 340px)' }} pagination={{ current: drilldown.page, pageSize: 20, total: drilldown.total, showSizeChanger: false, showTotal: (value) => `${value.toLocaleString('vi-VN')} khách hàng`, onChange: (nextPage) => drillIsOfficer ? loadOfficerCustomers(officerDrill.row, officerDrill.filters, nextPage, drillKeyword) : loadDrilldown(drilldown.metric, nextPage) }} columns={analysisDrillColumns} />
    </Drawer>
  </div>;
}

function RealInsightsPage({ context, onOpenCustomer, currentUser }) {
  const { periodKey, branchCode, pgdCode, refreshKey, profileParams = {}, sessionData, sessionLoading } = context;
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('large_deposit');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const canExport = hasPermission(currentUser, 'customer:export');

  const load = useCallback(async () => {
    if (!periodKey) return;
    setLoading(true);
    setError('');
    if (sessionLoading) return;
    const sessionMatches = sessionData?.ready && sessionData.periodKey === periodKey
      && sessionData.scopeKey === JSON.stringify(profileParams);
    const isPrefetchedDefault = page === 1 && selectedGroup === 'large_deposit' && !query;
    if (sessionMatches && isPrefetchedDefault && sessionData.groups && sessionData.groupProfiles) {
      setGroups(sessionData.groups?.groups || []);
      setRows(sessionData.groupProfiles?.items || []);
      setTotal(Number(sessionData.groupProfiles?.total || 0));
      setLoading(false);
      return;
    }
    try {
      const params = profileParams;
      const [groupRes, profileRes] = await Promise.all([
        client.get('/customer-processing/profile-groups', { params }),
        client.get('/customer-processing/profiles', {
          params: {
            ...params,
            group_key: selectedGroup,
            keyword: query || undefined,
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
  }, [branchCode, page, periodKey, pgdCode, profileParams, query, refreshKey, selectedGroup, sessionData, sessionLoading]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [branchCode, periodKey, pgdCode, query, selectedGroup]);

  const exportGroup = async () => {
    setExporting(true);
    try {
      const response = await client.get('/customer-processing/profiles/export', { params: { ...profileParams, group_key: selectedGroup, keyword: query || undefined }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data); const link = document.createElement('a');
      link.href = url; link.download = `c360_nhom_${selectedGroup}_${periodKey}.xlsx`; link.click(); URL.revokeObjectURL(url);
      message.success('Đã xuất nhóm khách hàng theo đúng phạm vi');
    } catch (requestError) { message.error(requestError.response?.data?.detail || 'Không xuất được Excel'); }
    finally { setExporting(false); }
  };

  if (error) return <ErrorState error={error} onRetry={load} />;
  return (
    <div className="demo-page">
      <div className="demo-page-heading">
        <div><Text className="demo-eyebrow">PHÂN NHÓM TỪ DATABASE</Text><Title level={2}>Cảnh báo và nhóm khách hàng trọng điểm</Title><Text type="secondary">Các nhóm được backend tính trực tiếp theo kỳ và phạm vi dữ liệu đang chọn</Text></div>
        <Space><Tag color="success">Kỳ {periodLabel(periodKey)}</Tag>{canExport ? <Button icon={<DownloadOutlined />} loading={exporting} onClick={exportGroup}>Xuất Excel</Button> : null}</Space>
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
        <div className="c360-table-filter-bar">
          <Input allowClear value={keyword} placeholder="Tên hoặc mã khách hàng · Enter để tìm" onChange={(event) => setKeyword(event.target.value)} onPressEnter={() => setQuery(keyword.trim())} />
          <div><Text type="secondary">Nhóm đang xem</Text><br /><Text strong>{groups.find((item) => item.key === selectedGroup)?.label || selectedGroup}</Text></div>
          <Button icon={<ReloadOutlined />} onClick={() => { setKeyword(''); setQuery(''); }}>Xóa tìm kiếm</Button>
        </div>
        <Table
          loading={loading}
          rowKey="id"
          dataSource={rows}
          onRow={(row) => ({ onClick: () => onOpenCustomer(row) })}
          rowClassName="demo-clickable-row"
          pagination={{ current: page, pageSize: PAGE_SIZE, total, showSizeChanger: false, showTotal: (value) => `${value.toLocaleString('vi-VN')} khách hàng`, onChange: setPage }}
          scroll={{ x: 1180, y: 520 }}
          columns={[
            { title: 'Chi nhánh chính', width: 130, fixed: 'left', render: (_, row) => <Tag color="blue">{primaryBranchLabel(row)}</Tag> },
            { title: 'Khách hàng', dataIndex: 'ten_kh', fixed: 'left', width: 280, render: (value, row) => <div><Text strong>{value || 'Chưa có tên'}</Text><br /><Text type="secondary">{row.ma_kh} · {customerTypeLabel(row.loai_khach_hang)}</Text></div> },
            { title: 'Cán bộ', dataIndex: 'ten_can_bo', width: 180, render: (value, row) => value || row.ma_cb || '—' },
            { title: 'Tiền gửi CKH', dataIndex: 'so_du_tien_gui', align: 'right', width: 175, render: fullMoney },
            { title: 'TGTT bình quân', dataIndex: 'so_du_tgtt_binh_quan', align: 'right', width: 175, render: fullMoney },
            { title: 'Dư nợ', dataIndex: 'so_du_tien_vay', align: 'right', width: 175, render: fullMoney },
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

  const context = {
    periods, periodKey, branchCode, pgdCode, refreshKey,
    profileParams: sharedProfileParams,
    sessionData: globalScope?.sessionData,
    sessionLoading: globalScope?.sessionLoading,
    sessionProgress: globalScope?.sessionProgress,
    filterOptions: globalScope?.options || {},
  };
  const content = page === 'customers'
    ? <RealCustomerList context={context} onOpenCustomer={setSelectedCustomer} currentUser={currentUser} />
    : page.startsWith('analysis-')
      ? <BusinessAnalysisPage context={context} mode={page} onOpenCustomer={setSelectedCustomer} currentUser={currentUser} />
    : page === 'insights'
      ? <RealInsightsPage context={context} onOpenCustomer={setSelectedCustomer} currentUser={currentUser} />
      : <RealDashboard context={context} onOpenCustomer={setSelectedCustomer} onGoCustomers={() => setPage('customers')} currentUser={currentUser} />;

  const workspace = (
    <>
      <div className={embedded ? 'c360-embedded-content' : 'demo-content'}>
        {!periodKey ? (
          <Card className="c360-empty-scope" bordered={false}>
            <div className="c360-empty-scope__visual"><img src={logoUrl} alt="Agribank" /><span><FilterOutlined /></span></div>
            <Text className="c360-empty-scope__eyebrow">KHỞI TẠO PHẠM VI PHÂN TÍCH</Text>
            <Title level={3}>Chọn dữ liệu bạn muốn xem</Title>
            <Text type="secondary" className="c360-empty-scope__description">
              Hệ thống chỉ truy vấn sau khi bạn xác nhận bộ lọc, giúp tải đúng phạm vi và tránh xử lý dữ liệu không cần thiết.
            </Text>
            <div className="c360-empty-scope__steps">
              <div><b>1</b><span><strong>Chọn kỳ dữ liệu</strong><small>Điều kiện bắt buộc</small></span></div>
              <i />
              <div><b>2</b><span><strong>Chọn phạm vi</strong><small>Chi nhánh, phòng ban và điều kiện nâng cao</small></span></div>
              <i />
              <div><b>3</b><span><strong>Bấm “Xem dữ liệu”</strong><small>Áp dụng đồng bộ cho toàn bộ C360</small></span></div>
            </div>
            <div className="c360-empty-scope__privacy"><CheckCircleFilled /> Chưa phát sinh truy vấn dữ liệu nghiệp vụ</div>
          </Card>
        ) : content}
      </div>
      <CustomerModal customer={selectedCustomer} periodKey={periodKey} initialBranchCode={branchCode} analysisParams={sharedProfileParams} currentUser={currentUser} open={Boolean(selectedCustomer)} onClose={() => setSelectedCustomer(null)} />
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
