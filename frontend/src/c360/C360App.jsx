import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BankOutlined,
  BarChartOutlined,
  CheckCircleFilled,
  CreditCardOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ReloadOutlined,
  SearchOutlined,
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
  Empty,
  Input,
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
const periodLabel = (value) => value?.length >= 6 ? `${value.slice(4, 6)}/${value.slice(0, 4)}` : value || '—';
const changePercent = (current, previous) => Number(previous) ? ((Number(current) - Number(previous)) / Number(previous)) * 100 : 0;

const serviceLabels = {
  tk_so_dep: 'Tài khoản số đẹp',
  agribank_plus: 'Agribank Plus',
  tin_nhan_ott: 'Tin nhắn OTT',
  e_banking: 'E-Banking',
  sms_nhac_no_vay: 'SMS nhắc nợ vay',
  sms_tien_gui: 'SMS tiền gửi',
  the_ghi_no_noi_dia: 'Thẻ ghi nợ nội địa',
  the_td_noi_dia: 'Thẻ tín dụng nội địa',
  the_td_quoc_te: 'Thẻ tín dụng quốc tế',
  the_td_loc_viet: 'Thẻ Lộc Việt',
  bao_lanh: 'Bảo lãnh',
  loa_bien_dong_so_du: 'Loa biến động số dư',
  phat_hanh_lc: 'Phát hành LC',
};

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
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !customer?.ma_kh) return;
    let active = true;
    setLoading(true);
    client.get('/customer-processing/profile-history', { params: { ma_kh: customer.ma_kh } })
      .then(({ data }) => { if (active) setHistory(Array.isArray(data) ? data : []); })
      .catch(() => { if (active) setHistory([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [customer?.ma_kh, open]);

  if (!customer) return null;
  const services = Object.entries(serviceLabels).map(([key, label]) => ({ key, label, active: Number(customer[key] || 0) > 0 }));
  return (
    <Modal width={1080} open={open} onCancel={onClose} footer={<Button onClick={onClose}>Đóng</Button>} title={null} className="c360-real-profile-modal">
      <div className="demo-quick-header">
        <Avatar size={58} className="demo-profile-avatar">{customer.ten_kh?.charAt(0) || 'K'}</Avatar>
        <div>
          <Space wrap><Title level={3}>{customer.ten_kh || 'Chưa có tên khách hàng'}</Title><Tag color="blue">{customer.loai_khach_hang || 'Chưa phân loại'}</Tag><Tag color="success">DỮ LIỆU THẬT</Tag></Space>
          <Text type="secondary">{customer.ma_kh} · {customer.telephone || 'Chưa có điện thoại'}</Text>
          <div className="demo-profile-meta"><span>CN chính: {customer.primary_branch_code || '—'}</span><span>{customer.primary_pgd_name || customer.primary_pgd_code || 'Chưa xác định PGD'}</span><span>CBQL: {customer.ten_can_bo || customer.ma_cb || '—'}</span></div>
        </div>
      </div>
      <Row gutter={[12, 12]} className="demo-quick-metrics">
        <Col span={6}><div><WalletOutlined /><Text>Tiền gửi CKH</Text><strong>{compactMoney(customer.so_du_tien_gui)}</strong></div></Col>
        <Col span={6}><div><BankOutlined /><Text>Dư nợ</Text><strong>{compactMoney(customer.so_du_tien_vay)}</strong></div></Col>
        <Col span={6}><div><DatabaseOutlined /><Text>TGTT bình quân</Text><strong>{compactMoney(customer.so_du_tgtt_binh_quan)}</strong></div></Col>
        <Col span={6}><div><CreditCardOutlined /><Text>Sản phẩm</Text><strong>{services.filter((item) => item.active).length}</strong></div></Col>
      </Row>
      <Tabs items={[
        {
          key: 'summary',
          label: 'Thông tin hiện có',
          children: <Descriptions bordered column={2} size="small" items={[
            { key: 'code', label: 'Mã khách hàng', children: customer.ma_kh },
            { key: 'type', label: 'Loại khách hàng', children: customer.loai_khach_hang || 'Chưa có dữ liệu' },
            { key: 'branches', label: 'Các chi nhánh', children: customer.branch_codes || 'Chưa có dữ liệu' },
            { key: 'pgds', label: 'Các PGD', children: customer.pgd_codes || 'Chưa có dữ liệu' },
            { key: 'loanType', label: 'Loại vay', children: customer.loai_vay || 'Không có khoản vay' },
            { key: 'phone', label: 'Điện thoại', children: customer.telephone || 'Chưa có dữ liệu' },
            { key: 'officer', label: 'Cán bộ quản lý', children: customer.ten_can_bo || customer.ma_cb || 'Chưa có dữ liệu' },
            { key: 'period', label: 'Kỳ đang xem', children: periodLabel(periodKey) },
          ]} />,
        },
        {
          key: 'products',
          label: 'Sản phẩm dịch vụ',
          children: <div className="c360-real-service-grid">{services.map((item) => <div key={item.key}><Text strong>{item.label}</Text>{item.active ? <Tag color="success" icon={<CheckCircleFilled />}>Đang sử dụng</Tag> : <Tag>Chưa sử dụng</Tag>}</div>)}</div>,
        },
        {
          key: 'history',
          label: 'Lịch sử các kỳ',
          children: loading ? <Skeleton active /> : <Table size="small" rowKey="period_key" pagination={false} dataSource={[...history].reverse()} columns={[
            { title: 'Kỳ', dataIndex: 'period_key', render: periodLabel },
            { title: 'Tiền gửi CKH', dataIndex: 'so_du_tien_gui', align: 'right', render: compactMoney },
            { title: 'Dư nợ', dataIndex: 'so_du_tien_vay', align: 'right', render: compactMoney },
            { title: 'TGTT bình quân', dataIndex: 'so_du_tgtt_binh_quan', align: 'right', render: compactMoney },
          ]} />,
        },
      ]} />
    </Modal>
  );
}

function RealDashboard({ context, onOpenCustomer, onGoCustomers }) {
  const { periodKey, branchCode, pgdCode, refreshKey } = context;
  const [data, setData] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [topCustomers, setTopCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!periodKey) return;
    setLoading(true);
    setError('');
    const scopeParams = { period_key: periodKey, ...toApiBranchParams(branchCode, pgdCode) };
    try {
      const [summaryRes, profilesRes] = await Promise.all([
        client.get('/dashboard/summary', { params: scopeParams }),
        client.get('/customer-processing/profiles', { params: { period_key: periodKey, branch_code: branchCode || undefined, pgd_code: pgdCode || undefined, sort_by: 'so_du_tien_gui', sort_dir: 'desc', limit: 8 } }),
      ]);
      setData(summaryRes.data);
      setTopCustomers(Array.isArray(profilesRes.data) ? profilesRes.data : profilesRes.data?.items || []);
      const previousPeriod = context.periods[context.periods.findIndex((item) => item.period_key === periodKey) + 1]?.period_key;
      if (previousPeriod) {
        const { data: compareData } = await client.get('/customer-processing/period-comparison', { params: { current_period: periodKey, previous_period: previousPeriod, branch_code: branchCode || undefined, pgd_code: pgdCode || undefined } });
        setComparison(compareData);
      } else {
        setComparison(null);
      }
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
  return (
    <div className="demo-page">
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

function RealCustomerList({ context, onOpenCustomer }) {
  const { periodKey, branchCode, pgdCode, refreshKey } = context;
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!periodKey) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get('/customer-processing/profiles', { params: { period_key: periodKey, branch_code: branchCode || undefined, pgd_code: pgdCode || undefined, keyword: query || undefined, page, page_size: PAGE_SIZE, include_total: true, sort_by: 'so_du_tien_gui', sort_dir: 'desc' } });
      setRows(data.items || []);
      setTotal(Number(data.total || 0));
    } catch (requestError) {
      setError(requestError.response?.data?.detail || requestError.message || 'Không tải được danh sách');
    } finally {
      setLoading(false);
    }
  }, [branchCode, page, periodKey, pgdCode, query, refreshKey]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [branchCode, periodKey, pgdCode]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  return (
    <div className="demo-page">
      <div className="demo-page-heading"><div><Text className="demo-eyebrow">HỒ SƠ KHÁCH HÀNG THẬT</Text><Title level={2}>Danh sách khách hàng C360</Title><Text type="secondary">{total.toLocaleString('vi-VN')} hồ sơ trong phạm vi đang chọn</Text></div><Tag color="success">KỲ {periodLabel(periodKey)}</Tag></div>
      <Card className="demo-filter-card">
        <Input.Search value={keyword} onChange={(event) => setKeyword(event.target.value)} onSearch={(value) => { setPage(1); setQuery(value.trim()); }} allowClear enterButton={<SearchOutlined />} placeholder="Tìm theo tên, mã KH, điện thoại hoặc cán bộ..." size="large" />
      </Card>
      <Card className="demo-table-card">
        <Table loading={loading} rowKey="id" dataSource={rows} onRow={(row) => ({ onClick: () => onOpenCustomer(row) })} rowClassName="demo-clickable-row" pagination={{ current: page, pageSize: PAGE_SIZE, total, showSizeChanger: false, showTotal: (value) => `${value.toLocaleString('vi-VN')} khách hàng`, onChange: setPage }} scroll={{ x: 1100 }} columns={[
          { title: 'Khách hàng', dataIndex: 'ten_kh', width: 260, render: (value, row) => <div><Text strong>{value || 'Chưa có tên'}</Text><br /><Text type="secondary">{row.ma_kh} · {row.loai_khach_hang || 'Chưa phân loại'}</Text></div> },
          { title: 'Chi nhánh/PGD chính', width: 190, render: (_, row) => <div><Text>{row.primary_branch_code || '—'}</Text><br /><Text type="secondary">{row.primary_pgd_name || row.primary_pgd_code || '—'}</Text></div> },
          { title: 'Cán bộ', dataIndex: 'ten_can_bo', width: 170, render: (value, row) => value || row.ma_cb || '—' },
          { title: 'Tiền gửi CKH', dataIndex: 'so_du_tien_gui', align: 'right', width: 140, render: compactMoney },
          { title: 'TGTT bình quân', dataIndex: 'so_du_tgtt_binh_quan', align: 'right', width: 140, render: compactMoney },
          { title: 'Dư nợ', dataIndex: 'so_du_tien_vay', align: 'right', width: 140, render: compactMoney },
          { title: 'Số điện thoại', dataIndex: 'telephone', width: 130, render: (value) => value || '—' },
        ]} />
      </Card>
    </div>
  );
}

export default function C360App({ currentUser, onLogout }) {
  const [page, setPage] = useState('dashboard');
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
    : <RealDashboard context={context} onOpenCustomer={setSelectedCustomer} onGoCustomers={() => setPage('customers')} />;

  function changeBranch(value) {
    const requested = value === 'all' ? null : value;
    const resolved = resolveBranchScope(currentUser, requested, null);
    if (resolved.denied) return message.warning('Bạn không có quyền xem chi nhánh này');
    setBranchCode(resolved.filterCn);
    setPgdCode(resolved.filterPgd);
  }

  return (
    <Layout className="demo-shell c360-real-shell">
      <Sider width={270} collapsedWidth={76} collapsed={collapsed} trigger={null} className="demo-sidebar">
        <div className="demo-logo"><img src={logoUrl} alt="C360" />{!collapsed && <div><strong>C360</strong><small>Dữ liệu thật</small></div>}</div>
        <Menu theme="dark" mode="inline" selectedKeys={[page]} items={[
          { key: 'dashboard', icon: <DashboardOutlined />, label: 'Tổng quan điều hành' },
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
        <div className="c360-global-filter demo-no-print">
          <Select loading={bootLoading} value={periodKey || undefined} placeholder="Chọn kỳ" onChange={setPeriodKey} options={periods.map((item) => ({ value: item.period_key, label: `Kỳ ${periodLabel(item.period_key)}` }))} />
          <Select value={branchCode || 'all'} onChange={changeBranch} disabled={!initialScope.canChangeBranch && !initialScope.canViewProvince} options={[...(initialScope.canViewProvince ? [{ value: 'all', label: 'Toàn tỉnh' }] : []), ...branchOptions.map((value) => ({ value, label: `Chi nhánh ${value}` }))]} />
          <Select allowClear value={pgdCode || undefined} placeholder="Tất cả PGD" onChange={(value) => setPgdCode(value || null)} disabled={!initialScope.canChangePgd && !initialScope.canViewProvince} options={(filterOptions.pgd_options || []).map((item) => ({ value: typeof item === 'string' ? item : item.value, label: typeof item === 'string' ? item : item.label }))} />
          <Button icon={<ReloadOutlined />} onClick={() => setRefreshKey((value) => value + 1)}>Làm mới</Button>
          <span><CheckCircleFilled /> API dữ liệu thật</span>
        </div>
        <Content className="demo-content">
          {bootError ? <ErrorState error={bootError} onRetry={loadBootstrap} /> : bootLoading || !periodKey ? <Skeleton active paragraph={{ rows: 12 }} /> : content}
        </Content>
      </Layout>
      <CustomerModal customer={selectedCustomer} periodKey={periodKey} open={Boolean(selectedCustomer)} onClose={() => setSelectedCustomer(null)} />
    </Layout>
  );
}
