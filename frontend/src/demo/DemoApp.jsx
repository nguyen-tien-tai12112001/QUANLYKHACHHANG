import { useMemo, useState } from 'react';
import {
  AlertOutlined,
  ArrowLeftOutlined,
  BankOutlined,
  BarChartOutlined,
  CheckCircleFilled,
  CreditCardOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DollarOutlined,
  FileSearchOutlined,
  GlobalOutlined,
  IdcardOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PieChartOutlined,
  SearchOutlined,
  ShopOutlined,
  TeamOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Layout,
  Menu,
  Progress,
  Row,
  Segmented,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';

import logoUrl from '../../favicon.jpg';
import { demoCustomers, demoMeta, summarizeCustomers } from './data/mockCustomers';
import {
  AnalyticsPage,
  CareOperationsPage,
  ProductsPage,
  ReportsPage,
  SourceManagementPage,
} from './DemoExtendedPages';
import {
  AttentionCustomersPage,
  CustomerAssignmentPage,
  CustomerQuickViewModal,
  CustomerSearchPage,
  HighValueCustomersPage,
} from './DemoCustomerPages';
import DemoAlertsPage, { demoAlerts } from './DemoAlertsPage';
import './demo.css';

const { Header, Sider, Content } = Layout;
const { Text, Title } = Typography;

const money = (value) => Number(value || 0).toLocaleString('vi-VN');
const compactMoney = (value) => {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1_000_000_000) return `${(number / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu`;
  return `${number.toLocaleString('vi-VN')} đ`;
};
const periodLabel = (period) => `${period.slice(6, 8)}/${period.slice(4, 6)}/${period.slice(0, 4)}`;

function parseInitialRoute() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/demo';
  const customerMatch = pathname.match(/^\/demo\/customers\/(\d+)$/);
  if (customerMatch) return { page: 'profile', customerId: Number(customerMatch[1]) };
  const matchedPage = Object.entries(pagePaths).find(([, path]) => path === pathname)?.[0];
  return { page: matchedPage || 'dashboard', customerId: null };
}

const pagePaths = {
  dashboard: '/demo',
  customers: '/demo/customers',
  'customer-search': '/demo/customer-search',
  'customer-high-value': '/demo/customers/high-value',
  'customer-attention': '/demo/customers/attention',
  'customer-assignment': '/demo/customers/assignment',
  alerts: '/demo/alerts',
  'analytics-deposits': '/demo/analytics/deposits',
  'analytics-loans': '/demo/analytics/loans',
  'analytics-international': '/demo/analytics/international',
  'analytics-fees': '/demo/analytics/fees',
  'products-overview': '/demo/products',
  'products-digital': '/demo/products/digital',
  'products-cards': '/demo/products/cards',
  'products-bills': '/demo/products/bills',
  'products-abic': '/demo/products/abic',
  opportunities: '/demo/opportunities',
  'care-unused': '/demo/care/unused',
  'care-declining': '/demo/care/declining',
  'care-plans': '/demo/care/plans',
  'data-sources': '/demo/data/sources',
  quality: '/demo/quality',
  'data-mapping': '/demo/data/mapping',
  'data-history': '/demo/data/history',
  'reports-overall': '/demo/reports',
  'reports-branches': '/demo/reports/branches',
  'reports-officers': '/demo/reports/officers',
  'reports-products': '/demo/reports/products',
};

function MetricCard({ title, value, note, icon, tone = 'red', onClick }) {
  return (
    <Card className={`demo-metric demo-metric--${tone}${onClick ? ' is-clickable' : ''}`} onClick={onClick}>
      <div className="demo-metric-icon">{icon}</div>
      <div>
        <Text className="demo-metric-label">{title}</Text>
        <div className="demo-metric-value">{value}</div>
        <Text type="secondary" className="demo-metric-note">{note}</Text>
      </div>
    </Card>
  );
}

function Distribution({ title, values, colors = ['#8f1438', '#d6a033', '#218653', '#3567a8'] }) {
  const total = Object.values(values).reduce((sum, value) => sum + value, 0) || 1;
  return (
    <Card title={title} className="demo-panel">
      <div className="demo-distribution">
        {Object.entries(values).map(([label, value], index) => {
          const percent = Math.round((value / total) * 100);
          return (
            <div className="demo-distribution-row" key={label}>
              <div className="demo-distribution-label">
                <Text>{label}</Text>
                <Text strong>{value.toLocaleString('vi-VN')} <span>{percent}%</span></Text>
              </div>
              <div className="demo-distribution-track">
                <div style={{ width: `${percent}%`, background: colors[index % colors.length] }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function StatusValue({ value }) {
  if (value === true) return <Tag color="success" icon={<CheckCircleFilled />}>Đang sử dụng</Tag>;
  if (value === false) return <Tag>Chưa sử dụng</Tag>;
  return <Tag color="warning">Chưa có dữ liệu</Tag>;
}

function ServiceGroup({ title, icon, items, compact = false }) {
  const active = items.filter((item) => item.value === true).length;
  return (
    <Card
      className={`demo-service-card${compact ? ' is-compact' : ''}`}
      title={<Space>{icon}<span>{title}</span></Space>}
      extra={<Tag color="blue">{active}/{items.length} sản phẩm</Tag>}
    >
      <div className="demo-service-list">
        {items.map((item) => (
          <div className="demo-service-item" key={item.label}>
            <Text>{item.label}</Text>
            <StatusValue value={item.value} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function DashboardPage({ navigate, onCustomerOpen }) {
  const summary = useMemo(() => summarizeCustomers(), []);
  const opportunityRows = useMemo(
    () => [...demoCustomers].sort((a, b) => b.opportunityCount - a.opportunityCount || b.totalBenefits - a.totalBenefits).slice(0, 8),
    [],
  );
  const sourceRows = [
    { code: 'CIF', files: 6, records: 1000, status: 'ready', coverage: 100 },
    { code: 'DP01', files: 12, records: 3648, status: 'ready', coverage: 100 },
    { code: 'PF14', files: 12, records: 2981, status: 'warning', coverage: 96 },
    { code: 'LN01', files: 10, records: 1740, status: 'ready', coverage: 100 },
    { code: 'CN05', files: 11, records: 1000, status: 'warning', coverage: 98 },
    { code: 'ABIC', files: 4, records: 842, status: 'warning', coverage: 84 },
  ];

  return (
    <div className="demo-page">
      <div className="demo-page-heading">
        <div>
          <Text className="demo-eyebrow">TỔNG QUAN PROFILE KHÁCH HÀNG</Text>
          <Title level={2}>Dashboard C360 thử nghiệm</Title>
          <Text type="secondary">Dữ liệu giả lập cố định · Kỳ {periodLabel(demoMeta.period)} · {demoMeta.recordCount.toLocaleString('vi-VN')} khách hàng</Text>
        </div>
        <Space wrap>
          <Tag color="purple">DEMO DATA</Tag>
          <Select value={demoMeta.period} options={demoMeta.periods.map((period) => ({ value: period, label: periodLabel(period) }))} style={{ width: 150 }} />
          <Select value="all" options={[{ value: 'all', label: 'Toàn tỉnh' }, ...demoMeta.branches.map((branch) => ({ value: branch.code, label: branch.name }))]} style={{ width: 220 }} />
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}><MetricCard title="Tổng khách hàng" value={summary.totalCustomers.toLocaleString('vi-VN')} note="100% hồ sơ demo" icon={<TeamOutlined />} tone="blue" onClick={() => navigate('customers')} /></Col>
        <Col xs={24} sm={12} xl={6}><MetricCard title="Tổng tiền gửi" value={compactMoney(summary.totalDeposits)} note="Số dư cuối kỳ" icon={<WalletOutlined />} tone="green" /></Col>
        <Col xs={24} sm={12} xl={6}><MetricCard title="Tổng dư nợ" value={compactMoney(summary.totalLoans)} note={`${summary.badDebtCustomers} KH có nợ xấu`} icon={<BankOutlined />} tone="red" /></Col>
        <Col xs={24} sm={12} xl={6}><MetricCard title="Cơ hội bán chéo" value={summary.opportunities.toLocaleString('vi-VN')} note="Gợi ý sản phẩm tiềm năng" icon={<PieChartOutlined />} tone="gold" onClick={() => navigate('opportunities')} /></Col>
      </Row>

      <Row gutter={[16, 16]} className="demo-section">
        <Col xs={24} xl={12}><Distribution title="Khách hàng theo phân khúc" values={summary.bySegment} /></Col>
        <Col xs={24} xl={12}><Distribution title="Khách hàng theo loại hình" values={summary.byType} colors={['#3567a8', '#218653', '#d6a033']} /></Col>
      </Row>

      <Row gutter={[16, 16]} className="demo-section">
        <Col xs={24} xl={15}>
          <Card title="Khách hàng có cơ hội bán chéo nổi bật" className="demo-panel" extra={<Button type="link" onClick={() => navigate('opportunities')}>Xem tất cả</Button>}>
            <Table
              size="small"
              pagination={false}
              rowKey="id"
              dataSource={opportunityRows}
              onRow={(row) => ({ onClick: () => onCustomerOpen(row.id) })}
              columns={[
                { title: 'Khách hàng', dataIndex: 'customerName', ellipsis: true, render: (value, row) => <div><Text strong>{value}</Text><br /><Text type="secondary">{row.customerCode}</Text></div> },
                { title: 'Phân khúc', dataIndex: 'segment', width: 120, render: (value) => <Tag color={value === 'PLATINUM' ? 'purple' : value === 'GOLD' ? 'gold' : 'default'}>{value}</Tag> },
                { title: 'Tiền gửi', dataIndex: 'totalDeposits', width: 125, align: 'right', render: compactMoney },
                { title: 'Cơ hội', dataIndex: 'opportunityCount', width: 90, align: 'center', render: (value) => <Badge count={value} color="#8f1438" /> },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card title="Độ sẵn sàng nguồn dữ liệu" className="demo-panel" extra={<Button type="link" onClick={() => navigate('quality')}>Chi tiết</Button>}>
            <div className="demo-source-list">
              {sourceRows.map((source) => (
                <div className="demo-source-row" key={source.code}>
                  <div>
                    <Tag color={source.status === 'ready' ? 'success' : 'warning'}>{source.code}</Tag>
                    <Text type="secondary">{source.files} file · {source.records.toLocaleString('vi-VN')} dòng</Text>
                  </div>
                  <Progress percent={source.coverage} size="small" status={source.coverage < 90 ? 'exception' : 'normal'} />
                </div>
              ))}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

function CustomerListPage({ navigate, onCustomerOpen, mode = 'all' }) {
  const [keyword, setKeyword] = useState('');
  const [branch, setBranch] = useState('all');
  const [customerType, setCustomerType] = useState('all');
  const [risk, setRisk] = useState('all');
  const filtered = useMemo(() => {
    const normalized = keyword.trim().toLocaleLowerCase('vi');
    return demoCustomers.filter((customer) => {
      if (mode === 'opportunities' && customer.opportunityCount < 10) return false;
      if (mode === 'high-value' && customer.totalBenefits < 100_000_000) return false;
      if (mode === 'attention' && customer.riskLevel === 'low') return false;
      if (mode === 'assignment' && customer.id % 9 !== 0) return false;
      if (branch !== 'all' && customer.branchCode !== branch) return false;
      if (customerType !== 'all' && customer.customerType !== customerType) return false;
      if (risk !== 'all' && customer.riskLevel !== risk) return false;
      if (!normalized) return true;
      return [customer.customerCode, customer.customerName, customer.idNumber, customer.phone]
        .filter(Boolean)
        .some((value) => value.toLocaleLowerCase('vi').includes(normalized));
    });
  }, [keyword, branch, customerType, risk, mode]);

  const pageMeta = {
    all: ['PROFILE C360', 'Danh sách khách hàng demo', 'Toàn bộ hồ sơ khách hàng và chỉ tiêu tổng hợp theo kỳ.'],
    search: ['TRA CỨU NHANH', 'Tìm kiếm Profile 360', 'Tìm theo mã khách hàng, CCCD/MST, điện thoại hoặc tên khách hàng.'],
    'high-value': ['PHÂN KHÚC KHÁCH HÀNG', 'Khách hàng giá trị cao', 'Khách hàng có tổng lợi ích kỳ hiện tại từ 100 triệu đồng.'],
    attention: ['CẢNH BÁO DANH MỤC', 'Khách hàng cần chú ý', 'Hồ sơ có rủi ro cao, thiếu dữ liệu hoặc cần cán bộ kiểm tra.'],
    assignment: ['PHÂN CÔNG QUẢN LÝ', 'Khách hàng cần rà soát phân công', 'Danh sách minh họa các trường hợp cần xác nhận cán bộ/đơn vị quản lý chính.'],
    opportunities: ['KHAI THÁC DỮ LIỆU', 'Cơ hội bán chéo', 'Khách hàng có nhiều sản phẩm tiềm năng chưa sử dụng.'],
  }[mode] || ['PROFILE C360', 'Danh sách khách hàng demo', ''];

  const columns = [
    {
      title: 'Khách hàng',
      dataIndex: 'customerName',
      width: 260,
      fixed: 'left',
      render: (value, row) => (
        <div className="demo-customer-cell">
          <Avatar className="demo-customer-avatar">{value.charAt(0)}</Avatar>
          <div><Text strong>{value}</Text><Text type="secondary">{row.customerCode} · {row.customerType}</Text></div>
        </div>
      ),
    },
    { title: 'Phân khúc', dataIndex: 'segment', width: 120, render: (value) => <Tag color={value === 'PLATINUM' ? 'purple' : value === 'GOLD' ? 'gold' : value === 'SILVER' ? 'blue' : 'default'}>{value}</Tag> },
    { title: 'Chi nhánh/PGD', key: 'location', width: 220, render: (_, row) => <div><Text>{row.branchName}</Text><br /><Text type="secondary">{row.pgd}</Text></div> },
    { title: 'Cán bộ', dataIndex: 'officer', width: 170, ellipsis: true },
    { title: 'Tiền gửi', dataIndex: 'totalDeposits', width: 135, align: 'right', sorter: (a, b) => a.totalDeposits - b.totalDeposits, render: compactMoney },
    { title: 'Dư nợ', dataIndex: 'totalLoans', width: 135, align: 'right', sorter: (a, b) => a.totalLoans - b.totalLoans, render: compactMoney },
    { title: 'Tổng phí', dataIndex: ['fees', 'total'], width: 120, align: 'right', render: compactMoney },
    { title: 'Sản phẩm', dataIndex: 'productCount', width: 95, align: 'center', sorter: (a, b) => a.productCount - b.productCount, render: (value) => <Badge count={value} color="#3567a8" /> },
    { title: 'Cơ hội', dataIndex: 'opportunityCount', width: 90, align: 'center', sorter: (a, b) => a.opportunityCount - b.opportunityCount, render: (value) => <Badge count={value} color="#8f1438" /> },
    {
      title: 'Cảnh báo',
      dataIndex: 'riskLevel',
      width: 110,
      render: (value) => value === 'high' ? <Tag color="error">Rủi ro</Tag> : value === 'medium' ? <Tag color="warning">Cần chú ý</Tag> : <Tag color="success">Bình thường</Tag>,
    },
  ];

  return (
    <div className="demo-page">
      <div className="demo-page-heading">
        <div>
          <Text className="demo-eyebrow">{pageMeta[0]}</Text>
          <Title level={2}>{pageMeta[1]}</Title>
          <Text type="secondary">{pageMeta[2]} · {filtered.length.toLocaleString('vi-VN')} trên {demoCustomers.length.toLocaleString('vi-VN')} hồ sơ</Text>
        </div>
        <Tag color="purple">KHÔNG PHẢI DỮ LIỆU THẬT</Tag>
      </div>
      <Card className="demo-filter-card">
        <div className="demo-filters">
          <Input allowClear prefix={<SearchOutlined />} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Mã KH, tên, CCCD/MST, điện thoại..." className="demo-search" />
          <Select value={branch} onChange={setBranch} style={{ minWidth: 190 }} options={[{ value: 'all', label: 'Tất cả chi nhánh' }, ...demoMeta.branches.map((item) => ({ value: item.code, label: item.name }))]} />
          <Select value={customerType} onChange={setCustomerType} style={{ minWidth: 160 }} options={[{ value: 'all', label: 'Tất cả loại KH' }, ...['Cá nhân', 'Doanh nghiệp', 'Hộ kinh doanh'].map((value) => ({ value, label: value }))]} />
          <Select value={risk} onChange={setRisk} style={{ minWidth: 150 }} options={[{ value: 'all', label: 'Tất cả cảnh báo' }, { value: 'high', label: 'Rủi ro cao' }, { value: 'medium', label: 'Cần chú ý' }, { value: 'low', label: 'Bình thường' }]} />
          <Button onClick={() => { setKeyword(''); setBranch('all'); setCustomerType('all'); setRisk('all'); }}>Đặt lại</Button>
        </div>
      </Card>
      <Card className="demo-table-card">
        <Table
          rowKey="id"
          dataSource={filtered}
          columns={columns}
          scroll={{ x: 1700 }}
          pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: (total) => `${total.toLocaleString('vi-VN')} khách hàng` }}
          onRow={(row) => ({ onClick: () => onCustomerOpen(row.id) })}
          rowClassName="demo-clickable-row"
        />
      </Card>
    </div>
  );
}

function FinancialList({ items }) {
  return (
    <div className="demo-financial-list">
      {items.map((item) => (
        <div className="demo-financial-item" key={item.label}>
          <Text type="secondary">{item.label}</Text>
          <Text strong className={item.danger ? 'demo-danger' : ''}>{compactMoney(item.value)}</Text>
        </div>
      ))}
    </div>
  );
}

function ProfilePage({ customerId, navigate }) {
  const customer = demoCustomers.find((item) => item.id === Number(customerId));
  const [sourceDrawerOpen, setSourceDrawerOpen] = useState(false);
  if (!customer) return <Empty description="Không tìm thấy khách hàng demo" />;

  const latest = customer.history.at(-1);
  const previous = customer.history.at(-2);
  const depositChange = previous?.deposits ? ((latest.deposits - previous.deposits) / previous.deposits) * 100 : 0;
  const loanChange = previous?.loans ? ((latest.loans - previous.loans) / previous.loans) * 100 : 0;
  const maxHistory = Math.max(...customer.history.flatMap((item) => [item.deposits, item.loans]), 1);

  const tabItems = [
    {
      key: 'overview',
      label: 'Tổng quan',
      children: (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card title="Xu hướng 12 kỳ" className="demo-panel">
                <div className="demo-history-chart">
                  {customer.history.map((item) => (
                    <Tooltip key={item.period} title={`${periodLabel(item.period)} · TG ${compactMoney(item.deposits)} · DN ${compactMoney(item.loans)}`}>
                      <div className="demo-history-column">
                        <div className="demo-history-bars">
                          <span className="is-deposit" style={{ height: `${Math.max(3, item.deposits / maxHistory * 100)}%` }} />
                          <span className="is-loan" style={{ height: `${Math.max(3, item.loans / maxHistory * 100)}%` }} />
                        </div>
                        <small>{item.period.slice(4, 6)}/{item.period.slice(2, 4)}</small>
                      </div>
                    </Tooltip>
                  ))}
                </div>
                <Space className="demo-chart-legend"><Badge color="#218653" text="Tiền gửi" /><Badge color="#8f1438" text="Dư nợ" /></Space>
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title="Cơ hội và cảnh báo" className="demo-panel">
                <div className="demo-alert-list">
                  {customer.loans.badDebt > 0 && <div className="demo-alert is-danger"><AlertOutlined /><span><strong>Phát hiện dư nợ xấu</strong><small>{compactMoney(customer.loans.badDebt)} tại kỳ hiện tại</small></span></div>}
                  {customer.opportunityCount > 0 && <div className="demo-alert is-opportunity"><PieChartOutlined /><span><strong>{customer.opportunityCount} cơ hội bán chéo</strong><small>Ưu tiên dịch vụ số, thẻ và ABIC</small></span></div>}
                  {customer.missingDataCount > 0 && <div className="demo-alert is-warning"><DatabaseOutlined /><span><strong>{customer.missingDataCount} trường chưa đủ dữ liệu</strong><small>Cần đối chiếu nguồn CN05/ABIC</small></span></div>}
                  {!customer.phone && <div className="demo-alert is-warning"><UserOutlined /><span><strong>Thiếu số điện thoại</strong><small>Cần cập nhật hồ sơ CIF</small></span></div>}
                  {!customer.loans.badDebt && customer.missingDataCount === 0 && customer.phone && <div className="demo-alert is-ok"><CheckCircleFilled /><span><strong>Hồ sơ đầy đủ</strong><small>Không có cảnh báo quan trọng</small></span></div>}
                </div>
              </Card>
            </Col>
          </Row>
          <Row gutter={[16, 16]} className="demo-section">
            <Col xs={24} lg={8}><ServiceGroup compact title="Ngân hàng điện tử" icon={<GlobalOutlined />} items={[
              { label: 'Agribank Plus', value: customer.digital.agribankPlus },
              { label: 'OTT', value: customer.digital.ott },
              { label: 'E-Banking', value: customer.digital.eBanking },
              { label: 'Loa thần tài', value: customer.digital.loaThanTai },
            ]} /></Col>
            <Col xs={24} lg={8}><ServiceGroup compact title="Sản phẩm thẻ" icon={<CreditCardOutlined />} items={[
              { label: 'Thẻ ghi nợ nội địa', value: customer.cards.domesticDebit },
              { label: 'Thẻ Lộc Việt', value: customer.cards.locViet },
              { label: 'Thẻ ghi nợ quốc tế', value: customer.cards.internationalDebit },
              { label: 'Thẻ tín dụng quốc tế', value: customer.cards.internationalCredit },
            ]} /></Col>
            <Col xs={24} lg={8}><ServiceGroup compact title="ABIC" icon={<ShopOutlined />} items={[
              { label: 'Bảo an tín dụng', value: customer.abic.creditProtection },
              { label: 'Bảo an tài khoản', value: customer.abic.accountProtection },
              { label: 'Bảo hiểm ô tô', value: customer.abic.automobile },
              { label: 'Bảo hiểm sức khỏe', value: customer.abic.health },
            ]} /></Col>
          </Row>
        </>
      ),
    },
    {
      key: 'identity',
      label: 'Thông tin KH',
      children: <Card className="demo-panel"><Descriptions bordered column={{ xs: 1, md: 2 }} items={[
        { key: 'code', label: 'Mã khách hàng', children: customer.customerCode },
        { key: 'name', label: 'Tên khách hàng', children: customer.customerName },
        { key: 'id', label: 'CCCD/MST', children: customer.idNumber },
        { key: 'type', label: 'Loại khách hàng', children: customer.customerType },
        { key: 'date', label: 'Ngày sinh/Thành lập', children: customer.birthOrEstablished },
        { key: 'gender', label: 'Giới tính', children: customer.gender || 'Không áp dụng' },
        { key: 'phone', label: 'Điện thoại', children: customer.phone || <Tag color="warning">Chưa có</Tag> },
        { key: 'address', label: 'Địa chỉ', children: customer.address },
        { key: 'branch', label: 'Chi nhánh', children: `${customer.branchCode} - ${customer.branchName}` },
        { key: 'pgd', label: 'PGD/Phòng', children: customer.pgd },
        { key: 'officer', label: 'Cán bộ quản lý', children: customer.officer },
        { key: 'segment', label: 'Phân khúc', children: <Tag color="gold">{customer.segment}</Tag> },
      ]} /></Card>,
    },
    {
      key: 'deposits',
      label: 'Tiền gửi',
      children: <Card className="demo-panel"><FinancialList items={[
        { label: 'Số dư tài khoản thanh toán', value: customer.deposits.currentAccountBalance },
        { label: 'Số dư TKTT bình quân', value: customer.deposits.averageCurrentBalance },
        { label: 'Doanh số chuyển tiền đến', value: customer.deposits.incomingTurnover },
        { label: 'Tiền gửi có kỳ hạn', value: customer.deposits.termDepositBalance },
        { label: 'Tiền gửi CKH bình quân', value: customer.deposits.termDepositAverage },
        { label: 'FTP nguồn vốn', value: customer.deposits.ftpIncome },
      ]} /></Card>,
    },
    {
      key: 'loans',
      label: 'Tiền vay',
      children: <Card className="demo-panel"><FinancialList items={[
        { label: 'Dư nợ ngắn hạn', value: customer.loans.shortTerm },
        { label: 'Dư nợ trung dài hạn', value: customer.loans.mediumLongTerm },
        { label: 'Dư nợ thấu chi', value: customer.loans.overdraft },
        { label: 'Dư nợ xấu', value: customer.loans.badDebt, danger: customer.loans.badDebt > 0 },
        { label: 'Dư nợ XLRR', value: customer.loans.writtenOffDebt, danger: customer.loans.writtenOffDebt > 0 },
        { label: 'Dự phòng rủi ro', value: customer.loans.provision },
        { label: 'FTP dư nợ', value: customer.loans.ftpIncome },
      ]} /></Card>,
    },
    {
      key: 'international',
      label: 'KDNH',
      children: <Row gutter={[16, 16]}><Col xs={24} lg={12}><Card title="Doanh số" className="demo-panel"><FinancialList items={[
        { label: 'Doanh số thanh toán quốc tế', value: customer.internationalBusiness.internationalTurnover },
        { label: 'Doanh số LC', value: customer.internationalBusiness.lcTurnover },
      ]} /></Card></Col><Col xs={24} lg={12}><ServiceGroup title="Dịch vụ KDNH" icon={<GlobalOutlined />} items={[
        { label: 'Chi trả kiều hối', value: customer.internationalBusiness.remittance },
        { label: 'Thanh toán quốc tế', value: customer.internationalBusiness.internationalPayment },
      ]} /></Col></Row>,
    },
    {
      key: 'fees',
      label: 'Phí',
      children: <Card className="demo-panel"><FinancialList items={[
        { label: 'Phí bảo lãnh', value: customer.fees.guarantee },
        { label: 'Phí chuyển tiền', value: customer.fees.transfer },
        { label: 'Phí kinh doanh ngoại tệ', value: customer.fees.foreignExchange },
        { label: 'Phí thanh toán quốc tế', value: customer.fees.international },
        { label: 'Phí LC', value: customer.fees.lc },
        { label: 'Phí ngân hàng điện tử', value: customer.fees.digital },
        { label: 'Phí thẻ/POS', value: customer.fees.card + customer.fees.pos },
        { label: 'Phí khác', value: customer.fees.other },
        { label: 'Tổng phí trong tháng', value: customer.fees.total },
      ]} /></Card>,
    },
    {
      key: 'digital',
      label: 'NH điện tử',
      children: <ServiceGroup title="Sản phẩm ngân hàng điện tử" icon={<GlobalOutlined />} items={[
        { label: 'Tài khoản số đẹp', value: customer.digital.prettyAccount },
        { label: 'Agribank Plus', value: customer.digital.agribankPlus },
        { label: 'OTT', value: customer.digital.ott },
        { label: 'E-Banking', value: customer.digital.eBanking },
        { label: 'SMS nhắc nợ vay', value: customer.digital.loanReminder },
        { label: 'SMS tiền gửi', value: customer.digital.depositReminder },
        { label: 'Loa thần tài', value: customer.digital.loaThanTai },
        { label: 'Tài khoản hộ kinh doanh', value: customer.digital.businessAccount },
        { label: 'E-Tax', value: customer.digital.eTax },
      ]} />,
    },
    {
      key: 'cards',
      label: 'Thẻ',
      children: <ServiceGroup title="Sản phẩm thẻ và POS" icon={<CreditCardOutlined />} items={[
        { label: 'Thẻ ghi nợ nội địa', value: customer.cards.domesticDebit },
        { label: 'Thẻ Lộc Việt', value: customer.cards.locViet },
        { label: 'Thẻ ghi nợ quốc tế', value: customer.cards.internationalDebit },
        { label: 'Thẻ tín dụng quốc tế', value: customer.cards.internationalCredit },
        { label: 'Trả lương cá nhân', value: customer.cards.salaryIndividual },
        { label: 'Trả lương pháp nhân', value: customer.cards.salaryBusiness },
        { label: 'Đơn vị chấp nhận thẻ POS', value: customer.cards.pos },
      ]} />,
    },
    {
      key: 'bill',
      label: 'Bill Payment',
      children: <ServiceGroup title="Dịch vụ thu hộ" icon={<DollarOutlined />} items={[
        { label: 'Thu hộ tiền điện', value: customer.billPayments.electricity },
        { label: 'Thu hộ tiền nước', value: customer.billPayments.water },
        { label: 'Thu hộ viễn thông', value: customer.billPayments.telecom },
        { label: 'Thu hộ học phí', value: customer.billPayments.tuition },
        { label: 'Thu hộ viện phí', value: customer.billPayments.hospital },
      ]} />,
    },
    {
      key: 'abic',
      label: 'ABIC',
      children: <ServiceGroup title="Sản phẩm bảo hiểm ABIC" icon={<ShopOutlined />} items={[
        { label: 'Bảo an tín dụng', value: customer.abic.creditProtection },
        { label: 'Bảo an tài khoản', value: customer.abic.accountProtection },
        { label: 'Bảo an chủ thẻ', value: customer.abic.cardholderProtection },
        { label: 'Bảo hiểm tài sản', value: customer.abic.property },
        { label: 'Bảo hiểm cháy nổ', value: customer.abic.fire },
        { label: 'Bảo hiểm xe máy', value: customer.abic.motorcycle },
        { label: 'Bảo hiểm ô tô', value: customer.abic.automobile },
        { label: 'Bảo hiểm nhà ở', value: customer.abic.home },
        { label: 'Bảo hiểm sức khỏe', value: customer.abic.health },
      ]} />,
    },
    {
      key: 'history',
      label: 'Lịch sử',
      children: <Card className="demo-panel"><Table rowKey="period" pagination={false} dataSource={[...customer.history].reverse()} columns={[
        { title: 'Kỳ', dataIndex: 'period', render: periodLabel },
        { title: 'Tiền gửi', dataIndex: 'deposits', align: 'right', render: (value) => `${money(value)} đ` },
        { title: 'Dư nợ', dataIndex: 'loans', align: 'right', render: (value) => `${money(value)} đ` },
        { title: 'Phí', dataIndex: 'fees', align: 'right', render: (value) => `${money(value)} đ` },
      ]} /></Card>,
    },
  ];

  return (
    <div className="demo-page">
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('customers')} className="demo-back">Quay lại danh sách</Button>
      <Card className="demo-profile-hero">
        <div className="demo-profile-main">
          <Avatar size={64} className="demo-profile-avatar">{customer.customerName.charAt(0)}</Avatar>
          <div>
            <Space wrap><Title level={2}>{customer.customerName}</Title><Tag color={customer.customerType === 'Cá nhân' ? 'blue' : 'green'}>{customer.customerType}</Tag><Tag color="gold">{customer.segment}</Tag></Space>
            <Text type="secondary">{customer.customerCode} · {customer.idNumber} · {customer.phone || 'Chưa có điện thoại'}</Text>
            <div className="demo-profile-meta"><span>{customer.branchName}</span><span>{customer.pgd}</span><span>CBQL: {customer.officer}</span></div>
          </div>
        </div>
        <Space wrap>
          <Button icon={<FileSearchOutlined />} onClick={() => setSourceDrawerOpen(true)}>Nguồn dữ liệu</Button>
          <Tag color={customer.riskLevel === 'high' ? 'error' : customer.riskLevel === 'medium' ? 'warning' : 'success'}>{customer.riskLevel === 'high' ? 'Rủi ro cao' : customer.riskLevel === 'medium' ? 'Cần chú ý' : 'Hồ sơ bình thường'}</Tag>
        </Space>
      </Card>

      <Row gutter={[16, 16]} className="demo-section">
        <Col xs={24} sm={12} xl={6}><MetricCard title="Tổng tiền gửi" value={compactMoney(customer.totalDeposits)} note={`${depositChange >= 0 ? '+' : ''}${depositChange.toFixed(1)}% so với kỳ trước`} icon={<WalletOutlined />} tone="green" /></Col>
        <Col xs={24} sm={12} xl={6}><MetricCard title="Tổng dư nợ" value={compactMoney(customer.totalLoans)} note={`${loanChange >= 0 ? '+' : ''}${loanChange.toFixed(1)}% so với kỳ trước`} icon={<BankOutlined />} tone="red" /></Col>
        <Col xs={24} sm={12} xl={6}><MetricCard title="Tổng lợi ích" value={compactMoney(customer.totalBenefits)} note={`Phí tháng ${compactMoney(customer.fees.total)}`} icon={<DollarOutlined />} tone="gold" /></Col>
        <Col xs={24} sm={12} xl={6}><MetricCard title="Sản phẩm đang dùng" value={`${customer.productCount} sản phẩm`} note={`${customer.opportunityCount} cơ hội bán chéo`} icon={<PieChartOutlined />} tone="blue" /></Col>
      </Row>

      <Card className="demo-tabs-card">
        <Tabs items={tabItems} defaultActiveKey="overview" tabBarGutter={24} />
      </Card>

      <Drawer title="Nguồn dữ liệu của khách hàng" width={520} open={sourceDrawerOpen} onClose={() => setSourceDrawerOpen(false)}>
        <Table rowKey="code" pagination={false} dataSource={customer.sources} columns={[
          { title: 'Nguồn', dataIndex: 'code', render: (value) => <Tag>{value}</Tag> },
          { title: 'Trạng thái', dataIndex: 'status', render: (value) => value === 'ready' ? <Tag color="success">Sẵn sàng</Tag> : value === 'warning' ? <Tag color="warning">Cần kiểm tra</Tag> : <Tag color="error">Thiếu</Tag> },
          { title: 'Bản ghi', dataIndex: 'records', align: 'right' },
          { title: 'Cập nhật', dataIndex: 'updatedAt' },
        ]} />
      </Drawer>
    </div>
  );
}

function QualityPage({ navigate }) {
  const summary = useMemo(() => summarizeCustomers(), []);
  const issues = [
    { key: 'missing-source', level: 'high', title: 'Thiếu dữ liệu nguồn ABIC', count: 142, source: 'ABIC', action: 'Bổ sung file hoặc xác nhận không phát sinh' },
    { key: 'pf14', level: 'medium', title: 'PF14 chưa đủ khách hàng', count: 38, source: 'PF14', action: 'Đối chiếu DP01 và file số dư bình quân' },
    { key: 'phone', level: 'medium', title: 'Khách hàng thiếu số điện thoại', count: demoCustomers.filter((item) => !item.phone).length, source: 'CIF', action: 'Bổ sung hồ sơ khách hàng' },
    { key: 'bad-debt', level: 'high', title: 'Khách hàng có dư nợ xấu', count: summary.badDebtCustomers, source: 'LN01', action: 'Chuyển danh sách cho cán bộ quản lý' },
    { key: 'multi-branch', level: 'low', title: 'Cần xác định đơn vị quản lý chính', count: 27, source: 'DP01/LN01', action: 'Áp dụng quy tắc chấm điểm địa điểm' },
  ];
  return (
    <div className="demo-page">
      <div className="demo-page-heading"><div><Text className="demo-eyebrow">KIỂM SOÁT DỮ LIỆU</Text><Title level={2}>Chất lượng dữ liệu demo</Title><Text type="secondary">Theo dõi độ đầy đủ, nhất quán và khả năng truy vết của các nguồn</Text></div><Tag color="purple">KỲ {periodLabel(demoMeta.period)}</Tag></div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}><MetricCard title="Hồ sơ cần kiểm tra" value={summary.incompleteCustomers.toLocaleString('vi-VN')} note="Có ít nhất một trường chưa xác định" icon={<FileSearchOutlined />} tone="gold" /></Col>
        <Col xs={24} sm={8}><MetricCard title="Nguồn hoàn thành" value="4/6" note="PF14 và ABIC cần đối chiếu" icon={<DatabaseOutlined />} tone="blue" /></Col>
        <Col xs={24} sm={8}><MetricCard title="Lỗi nghiêm trọng" value="2 nhóm" note="Ảnh hưởng báo cáo và chăm sóc KH" icon={<AlertOutlined />} tone="red" /></Col>
      </Row>
      <Card className="demo-table-card demo-section">
        <Table rowKey="key" pagination={false} dataSource={issues} columns={[
          { title: 'Mức độ', dataIndex: 'level', width: 110, render: (value) => value === 'high' ? <Tag color="error">Cao</Tag> : value === 'medium' ? <Tag color="warning">Trung bình</Tag> : <Tag color="blue">Theo dõi</Tag> },
          { title: 'Vấn đề', dataIndex: 'title', render: (value) => <Text strong>{value}</Text> },
          { title: 'Nguồn', dataIndex: 'source', width: 140, render: (value) => <Tag>{value}</Tag> },
          { title: 'Số bản ghi', dataIndex: 'count', width: 120, align: 'right', render: (value) => value.toLocaleString('vi-VN') },
          { title: 'Hướng xử lý', dataIndex: 'action' },
          { title: '', width: 100, render: () => <Button type="link" onClick={() => navigate('customers')}>Xem KH</Button> },
        ]} />
      </Card>
    </div>
  );
}

const menuItems = [
  { key: 'dashboard', icon: <DashboardOutlined />, label: 'Tổng quan' },
  { key: 'alerts', icon: <AlertOutlined />, label: <span>Cảnh báo tự động <Badge count={demoAlerts.length} overflowCount={999} size="small" /></span> },
  {
    key: 'customers-group',
    icon: <TeamOutlined />,
    label: 'Khách hàng',
    children: [
      { key: 'customers', label: 'Danh sách khách hàng' },
      { key: 'customer-search', label: 'Tìm kiếm Profile 360' },
      { key: 'customer-high-value', label: 'Khách hàng giá trị cao' },
      { key: 'customer-attention', label: 'Khách hàng cần chú ý' },
      { key: 'customer-assignment', label: 'Phân công quản lý' },
    ],
  },
  {
    key: 'analytics-group',
    icon: <BarChartOutlined />,
    label: 'Phân tích nghiệp vụ',
    children: [
      { key: 'analytics-deposits', label: 'Tiền gửi' },
      { key: 'analytics-loans', label: 'Tiền vay' },
      { key: 'analytics-international', label: 'Kinh doanh quốc tế' },
      { key: 'analytics-fees', label: 'Doanh thu & phí' },
    ],
  },
  {
    key: 'products-group',
    icon: <CreditCardOutlined />,
    label: 'Sản phẩm dịch vụ',
    children: [
      { key: 'products-overview', label: 'Tổng hợp SPDV' },
      { key: 'products-digital', label: 'Ngân hàng điện tử' },
      { key: 'products-cards', label: 'Thẻ & POS' },
      { key: 'products-bills', label: 'Bill Payment' },
      { key: 'products-abic', label: 'ABIC' },
    ],
  },
  {
    key: 'care-group',
    icon: <PieChartOutlined />,
    label: 'Khai thác khách hàng',
    children: [
      { key: 'opportunities', label: 'Cơ hội bán chéo' },
      { key: 'care-unused', label: 'Khách hàng chưa dùng SP' },
      { key: 'care-declining', label: 'Khách hàng suy giảm' },
      { key: 'care-plans', label: 'Kế hoạch chăm sóc' },
    ],
  },
  {
    key: 'data-group',
    icon: <DatabaseOutlined />,
    label: 'Quản trị dữ liệu',
    children: [
      { key: 'data-sources', label: 'Trạng thái nguồn' },
      { key: 'quality', label: 'Chất lượng dữ liệu' },
      { key: 'data-mapping', label: 'Mapping 84 trường' },
      { key: 'data-history', label: 'Lịch sử các kỳ' },
    ],
  },
  {
    key: 'reports-group',
    icon: <FileSearchOutlined />,
    label: 'Báo cáo',
    children: [
      { key: 'reports-overall', label: 'Báo cáo tổng hợp' },
      { key: 'reports-branches', label: 'Theo chi nhánh' },
      { key: 'reports-officers', label: 'Theo cán bộ' },
      { key: 'reports-products', label: 'Theo sản phẩm' },
    ],
  },
];

function menuGroupForPage(page) {
  if (['customers', 'customer-search', 'customer-high-value', 'customer-attention', 'customer-assignment', 'profile'].includes(page)) return 'customers-group';
  if (page.startsWith('analytics-')) return 'analytics-group';
  if (page.startsWith('products-')) return 'products-group';
  if (page === 'opportunities' || page.startsWith('care-')) return 'care-group';
  if (page === 'quality' || page.startsWith('data-')) return 'data-group';
  if (page.startsWith('reports-')) return 'reports-group';
  return null;
}

export default function DemoApp() {
  const initial = useMemo(parseInitialRoute, []);
  const [page, setPage] = useState(initial.page);
  const [customerId, setCustomerId] = useState(initial.customerId);
  const [collapsed, setCollapsed] = useState(false);
  const [openKeys, setOpenKeys] = useState(() => [menuGroupForPage(initial.page)].filter(Boolean));
  const [quickCustomerId, setQuickCustomerId] = useState(() => {
    const value = Number(new URLSearchParams(window.location.search).get('quick'));
    return value > 0 ? value : null;
  });

  const quickCustomer = quickCustomerId ? demoCustomers.find((item) => item.id === quickCustomerId) : null;

  function openCustomer(customerIdToOpen) {
    setQuickCustomerId(Number(customerIdToOpen));
  }

  function openFullProfile(customerIdToOpen) {
    setQuickCustomerId(null);
    navigate('profile', customerIdToOpen);
  }

  function navigate(nextPage, nextCustomerId = null) {
    setPage(nextPage);
    setCustomerId(nextCustomerId);
    const nextGroup = menuGroupForPage(nextPage);
    if (nextGroup) setOpenKeys([nextGroup]);
    const path = nextPage === 'profile' ? `/demo/customers/${nextCustomerId}` : pagePaths[nextPage] || '/demo';
    window.history.pushState({}, '', path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const contentByPage = {
    dashboard: <DashboardPage navigate={navigate} onCustomerOpen={openCustomer} />,
    alerts: <DemoAlertsPage onCustomerOpen={openCustomer} />,
    customers: <CustomerListPage navigate={navigate} onCustomerOpen={openCustomer} mode="all" />,
    'customer-search': <CustomerSearchPage onCustomerOpen={openCustomer} />,
    'customer-high-value': <HighValueCustomersPage onCustomerOpen={openCustomer} />,
    'customer-attention': <AttentionCustomersPage onCustomerOpen={openCustomer} />,
    'customer-assignment': <CustomerAssignmentPage onCustomerOpen={openCustomer} />,
    'analytics-deposits': <AnalyticsPage domain="deposits" navigate={navigate} onCustomerOpen={openCustomer} />,
    'analytics-loans': <AnalyticsPage domain="loans" navigate={navigate} onCustomerOpen={openCustomer} />,
    'analytics-international': <AnalyticsPage domain="international" navigate={navigate} onCustomerOpen={openCustomer} />,
    'analytics-fees': <AnalyticsPage domain="fees" navigate={navigate} onCustomerOpen={openCustomer} />,
    'products-overview': <ProductsPage group="overview" navigate={navigate} />,
    'products-digital': <ProductsPage group="digital" navigate={navigate} />,
    'products-cards': <ProductsPage group="cards" navigate={navigate} />,
    'products-bills': <ProductsPage group="bills" navigate={navigate} />,
    'products-abic': <ProductsPage group="abic" navigate={navigate} />,
    opportunities: <CustomerListPage navigate={navigate} onCustomerOpen={openCustomer} mode="opportunities" />,
    'care-unused': <CareOperationsPage mode="unused" navigate={navigate} onCustomerOpen={openCustomer} />,
    'care-declining': <CareOperationsPage mode="declining" navigate={navigate} onCustomerOpen={openCustomer} />,
    'care-plans': <CareOperationsPage mode="plans" navigate={navigate} onCustomerOpen={openCustomer} />,
    'data-sources': <SourceManagementPage mode="sources" />,
    quality: <QualityPage navigate={navigate} />,
    'data-mapping': <SourceManagementPage mode="mapping" />,
    'data-history': <SourceManagementPage mode="history" />,
    'reports-overall': <ReportsPage mode="overall" />,
    'reports-branches': <ReportsPage mode="branches" />,
    'reports-officers': <ReportsPage mode="officers" />,
    'reports-products': <ReportsPage mode="products" />,
  };
  const content = page === 'profile'
    ? <ProfilePage customerId={customerId} navigate={navigate} />
    : contentByPage[page] || <DashboardPage navigate={navigate} onCustomerOpen={openCustomer} />;

  return (
    <Layout className="demo-shell">
      <Sider width={270} collapsedWidth={76} collapsed={collapsed} trigger={null} className="demo-sidebar">
        <div className="demo-logo">
          <img src={logoUrl} alt="C360 Demo" />
          {!collapsed && <div><strong>C360</strong><small>Giao diện thử nghiệm</small></div>}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[page === 'profile' ? 'customers' : page]}
          openKeys={collapsed ? [] : openKeys}
          onOpenChange={(keys) => setOpenKeys(keys.slice(-1))}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
        {!collapsed && <div className="demo-sidebar-note"><Tag color="purple">DEMO</Tag><span>1.000 hồ sơ giả lập<br />Không dùng dữ liệu thật</span></div>}
      </Sider>
      <Layout className="demo-main" style={{ marginLeft: collapsed ? 76 : 270 }}>
        <Header className="demo-header">
          <Space>
            <Button type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed((value) => !value)} />
            <div><Text strong>Profile khách hàng C360</Text><Text type="secondary" className="demo-header-subtitle">Bản thử nghiệm giao diện mới</Text></div>
          </Space>
          <Space>
            <Segmented size="small" value="demo" options={[{ label: 'Giao diện hiện tại', value: 'legacy' }, { label: 'C360 Demo', value: 'demo' }]} onChange={(value) => { if (value === 'legacy') window.location.href = '/'; }} />
            <Avatar icon={<UserOutlined />} />
          </Space>
        </Header>
        <Content className="demo-content">{content}</Content>
      </Layout>
      <CustomerQuickViewModal
        customer={quickCustomer}
        open={Boolean(quickCustomer)}
        onClose={() => setQuickCustomerId(null)}
        onOpenProfile={openFullProfile}
      />
    </Layout>
  );
}
