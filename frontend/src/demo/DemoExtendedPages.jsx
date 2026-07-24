import { useMemo, useState } from 'react';
import {
  AlertOutlined,
  BankOutlined,
  BarChartOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  DatabaseOutlined,
  DollarOutlined,
  FileExcelOutlined,
  FileSearchOutlined,
  GlobalOutlined,
  PieChartOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserSwitchOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import {
  Badge,
  Button,
  Card,
  Col,
  Input,
  Progress,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';

import { demoCustomers, demoMeta } from './data/mockCustomers';
import { determinationStatuses, fieldDictionary, fieldGroups } from './data/fieldDictionary';

const { Text, Title } = Typography;
const compactMoney = (value) => {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1_000_000_000) return `${(number / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu`;
  return `${number.toLocaleString('vi-VN')} đ`;
};
const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;
const periodLabel = (period) => `${period.slice(6, 8)}/${period.slice(4, 6)}/${period.slice(0, 4)}`;

function PageHeading({ eyebrow, title, description, extra }) {
  return (
    <div className="demo-page-heading">
      <div>
        <Text className="demo-eyebrow">{eyebrow}</Text>
        <Title level={2}>{title}</Title>
        <Text type="secondary">{description}</Text>
      </div>
      {extra}
    </div>
  );
}

function MiniMetric({ label, value, note, tone = 'blue', icon }) {
  return (
    <Card className={`demo-mini-metric demo-mini-metric--${tone}`}>
      <div className="demo-mini-metric-head"><span>{icon}</span><Text>{label}</Text></div>
      <strong>{value}</strong>
      <small>{note}</small>
    </Card>
  );
}

function BranchBars({ rows, valueKey, formatter = compactMoney }) {
  const max = Math.max(...rows.map((item) => item[valueKey]), 1);
  return (
    <div className="demo-ranking-bars">
      {rows.map((row, index) => (
        <div className="demo-ranking-row" key={row.code || row.name}>
          <div><span className="demo-rank-number">{index + 1}</span><Text>{row.name}</Text><Text strong>{formatter(row[valueKey])}</Text></div>
          <Progress percent={Math.round((row[valueKey] / max) * 100)} showInfo={false} strokeColor={index < 3 ? '#8f1438' : '#3567a8'} />
        </div>
      ))}
    </div>
  );
}

const analyticsConfig = {
  deposits: {
    eyebrow: 'PHÂN TÍCH NGHIỆP VỤ',
    title: 'Phân tích tiền gửi',
    description: 'Quy mô nguồn vốn, CASA, tiền gửi có kỳ hạn và biến động danh mục khách hàng.',
    icon: <WalletOutlined />,
    tone: 'green',
    primaryLabel: 'Tổng tiền gửi',
    primary: (item) => item.totalDeposits,
    metrics: [
      ['Số dư TKTT', (item) => item.deposits.currentAccountBalance],
      ['TKTT bình quân', (item) => item.deposits.averageCurrentBalance],
      ['Tiền gửi có kỳ hạn', (item) => item.deposits.termDepositBalance],
      ['Doanh số chuyển tiền đến', (item) => item.deposits.incomingTurnover],
      ['FTP nguồn vốn', (item) => item.deposits.ftpIncome],
    ],
  },
  loans: {
    eyebrow: 'PHÂN TÍCH NGHIỆP VỤ',
    title: 'Phân tích tiền vay',
    description: 'Cơ cấu dư nợ, nợ xấu, dự phòng rủi ro và hiệu quả tín dụng.',
    icon: <BankOutlined />,
    tone: 'red',
    primaryLabel: 'Tổng dư nợ',
    primary: (item) => item.totalLoans,
    metrics: [
      ['Dư nợ ngắn hạn', (item) => item.loans.shortTerm],
      ['Dư nợ trung dài hạn', (item) => item.loans.mediumLongTerm],
      ['Dư nợ thấu chi', (item) => item.loans.overdraft],
      ['Dư nợ xấu', (item) => item.loans.badDebt],
      ['Dự phòng rủi ro', (item) => item.loans.provision],
      ['FTP dư nợ', (item) => item.loans.ftpIncome],
    ],
  },
  international: {
    eyebrow: 'PHÂN TÍCH NGHIỆP VỤ',
    title: 'Kinh doanh quốc tế',
    description: 'Doanh số TTQT, LC, kiều hối và mức độ sử dụng dịch vụ quốc tế.',
    icon: <GlobalOutlined />,
    tone: 'blue',
    primaryLabel: 'Doanh số KDNH',
    primary: (item) => item.internationalBusiness.internationalTurnover + item.internationalBusiness.lcTurnover,
    metrics: [
      ['Doanh số TTQT', (item) => item.internationalBusiness.internationalTurnover],
      ['Doanh số LC', (item) => item.internationalBusiness.lcTurnover],
    ],
  },
  fees: {
    eyebrow: 'PHÂN TÍCH NGHIỆP VỤ',
    title: 'Doanh thu và phí',
    description: 'Đóng góp doanh thu dịch vụ theo loại phí, chi nhánh và khách hàng.',
    icon: <DollarOutlined />,
    tone: 'gold',
    primaryLabel: 'Tổng phí tháng',
    primary: (item) => item.fees.total,
    metrics: [
      ['Phí chuyển tiền', (item) => item.fees.transfer],
      ['Phí bảo lãnh', (item) => item.fees.guarantee],
      ['Phí TTQT và LC', (item) => item.fees.international + item.fees.lc],
      ['Phí NHĐT', (item) => item.fees.digital],
      ['Phí thẻ và POS', (item) => item.fees.card + item.fees.pos],
      ['Phí khác', (item) => item.fees.other],
    ],
  },
};

export function AnalyticsPage({ domain = 'deposits', navigate }) {
  const config = analyticsConfig[domain] || analyticsConfig.deposits;
  const [branch, setBranch] = useState('all');
  const scoped = useMemo(() => branch === 'all' ? demoCustomers : demoCustomers.filter((item) => item.branchCode === branch), [branch]);
  const totals = useMemo(() => {
    const result = { primary: 0, metrics: config.metrics.map(() => 0), active: 0 };
    scoped.forEach((customer) => {
      const primary = config.primary(customer);
      result.primary += primary;
      if (primary > 0) result.active += 1;
      config.metrics.forEach((metric, index) => { result.metrics[index] += metric[1](customer); });
    });
    return result;
  }, [scoped, config]);
  const branchRows = useMemo(() => demoMeta.branches.map((item) => {
    const customers = demoCustomers.filter((customer) => customer.branchCode === item.code);
    return {
      code: item.code,
      name: item.name,
      customers: customers.length,
      value: customers.reduce((sum, customer) => sum + config.primary(customer), 0),
    };
  }).sort((a, b) => b.value - a.value), [config]);
  const topCustomers = useMemo(() => [...scoped].sort((a, b) => config.primary(b) - config.primary(a)).slice(0, 12), [scoped, config]);

  return (
    <div className="demo-page">
      <PageHeading
        eyebrow={config.eyebrow}
        title={config.title}
        description={config.description}
        extra={<Space><Tag color="purple">DEMO</Tag><Select value={branch} onChange={setBranch} style={{ width: 220 }} options={[{ value: 'all', label: 'Toàn tỉnh' }, ...demoMeta.branches.map((item) => ({ value: item.code, label: item.name }))]} /></Space>}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={6}><MiniMetric label={config.primaryLabel} value={compactMoney(totals.primary)} note={`${totals.active.toLocaleString('vi-VN')} khách hàng có phát sinh`} tone={config.tone} icon={config.icon} /></Col>
        {config.metrics.slice(0, 3).map((metric, index) => <Col xs={24} md={12} xl={6} key={metric[0]}><MiniMetric label={metric[0]} value={compactMoney(totals.metrics[index])} note={`${((totals.metrics[index] / Math.max(totals.primary, 1)) * 100).toFixed(1)}% quy mô chính`} tone={index === 2 ? 'gold' : 'blue'} icon={<BarChartOutlined />} /></Col>)}
      </Row>
      <Row gutter={[16, 16]} className="demo-section">
        <Col xs={24} xl={10}>
          <Card title={`Xếp hạng chi nhánh theo ${config.primaryLabel.toLowerCase()}`} className="demo-panel">
            <BranchBars rows={branchRows} valueKey="value" />
          </Card>
        </Col>
        <Col xs={24} xl={14}>
          <Card title="Cơ cấu chỉ tiêu" className="demo-panel">
            <div className="demo-composition-grid">
              {config.metrics.map((metric, index) => (
                <div key={metric[0]}><Text type="secondary">{metric[0]}</Text><strong>{compactMoney(totals.metrics[index])}</strong><Progress percent={Math.min(100, Math.round(totals.metrics[index] / Math.max(...totals.metrics, 1) * 100))} showInfo={false} strokeColor={index % 2 ? '#3567a8' : '#8f1438'} /></div>
              ))}
            </div>
          </Card>
        </Col>
      </Row>
      <Card title={`Top khách hàng theo ${config.primaryLabel.toLowerCase()}`} className="demo-table-card demo-section">
        <Table
          rowKey="id"
          pagination={false}
          dataSource={topCustomers}
          onRow={(row) => ({ onClick: () => navigate('profile', row.id) })}
          rowClassName="demo-clickable-row"
          columns={[
            { title: 'Khách hàng', dataIndex: 'customerName', render: (value, row) => <div><Text strong>{value}</Text><br /><Text type="secondary">{row.customerCode} · {row.segment}</Text></div> },
            { title: 'Chi nhánh', dataIndex: 'branchName' },
            { title: 'Cán bộ quản lý', dataIndex: 'officer' },
            { title: config.primaryLabel, align: 'right', render: (_, row) => <Text strong>{money(config.primary(row))}</Text> },
            { title: 'Sản phẩm', dataIndex: 'productCount', width: 100, align: 'center', render: (value) => <Badge count={value} color="#3567a8" /> },
          ]}
        />
      </Card>
    </div>
  );
}

const productGroups = {
  overview: {
    title: 'Tổng hợp sản phẩm dịch vụ',
    description: 'Mức độ bao phủ toàn bộ sản phẩm trên danh mục khách hàng.',
    products: [
      ['Agribank Plus', (item) => item.digital.agribankPlus, 'NH điện tử'],
      ['E-Banking', (item) => item.digital.eBanking, 'NH điện tử'],
      ['OTT', (item) => item.digital.ott, 'NH điện tử'],
      ['Thẻ ghi nợ nội địa', (item) => item.cards.domesticDebit, 'Thẻ'],
      ['Thẻ tín dụng quốc tế', (item) => item.cards.internationalCredit, 'Thẻ'],
      ['Đơn vị chấp nhận POS', (item) => item.cards.pos, 'Thẻ'],
      ['Thu hộ tiền điện', (item) => item.billPayments.electricity, 'Bill Payment'],
      ['Thu hộ tiền nước', (item) => item.billPayments.water, 'Bill Payment'],
      ['Bảo an tín dụng', (item) => item.abic.creditProtection, 'ABIC'],
      ['Bảo an tài khoản', (item) => item.abic.accountProtection, 'ABIC'],
    ],
  },
  digital: {
    title: 'Ngân hàng điện tử',
    description: 'Agribank Plus, OTT, E-Banking, SMS và dịch vụ số cho hộ kinh doanh.',
    products: [
      ['Tài khoản số đẹp', (item) => item.digital.prettyAccount, 'NH điện tử'],
      ['Agribank Plus', (item) => item.digital.agribankPlus, 'NH điện tử'],
      ['OTT', (item) => item.digital.ott, 'NH điện tử'],
      ['E-Banking', (item) => item.digital.eBanking, 'NH điện tử'],
      ['SMS nhắc nợ vay', (item) => item.digital.loanReminder, 'NH điện tử'],
      ['SMS tiền gửi', (item) => item.digital.depositReminder, 'NH điện tử'],
      ['Loa thần tài', (item) => item.digital.loaThanTai, 'NH điện tử'],
      ['Tài khoản hộ kinh doanh', (item) => item.digital.businessAccount, 'NH điện tử'],
      ['E-Tax', (item) => item.digital.eTax, 'NH điện tử'],
    ],
  },
  cards: {
    title: 'Thẻ và POS',
    description: 'Độ phủ các dòng thẻ, trả lương và đơn vị chấp nhận thẻ.',
    products: [
      ['Thẻ ghi nợ nội địa', (item) => item.cards.domesticDebit, 'Thẻ'],
      ['Thẻ Lộc Việt', (item) => item.cards.locViet, 'Thẻ'],
      ['Thẻ ghi nợ quốc tế', (item) => item.cards.internationalDebit, 'Thẻ'],
      ['Thẻ tín dụng quốc tế', (item) => item.cards.internationalCredit, 'Thẻ'],
      ['Trả lương cá nhân', (item) => item.cards.salaryIndividual, 'Thẻ'],
      ['Trả lương pháp nhân', (item) => item.cards.salaryBusiness, 'Thẻ'],
      ['Đơn vị chấp nhận POS', (item) => item.cards.pos, 'Thẻ'],
    ],
  },
  bills: {
    title: 'Bill Payment',
    description: 'Dịch vụ thu hộ điện, nước, viễn thông, học phí và viện phí.',
    products: [
      ['Thu hộ tiền điện', (item) => item.billPayments.electricity, 'Bill Payment'],
      ['Thu hộ tiền nước', (item) => item.billPayments.water, 'Bill Payment'],
      ['Thu hộ viễn thông', (item) => item.billPayments.telecom, 'Bill Payment'],
      ['Thu hộ học phí', (item) => item.billPayments.tuition, 'Bill Payment'],
      ['Thu hộ viện phí', (item) => item.billPayments.hospital, 'Bill Payment'],
    ],
  },
  abic: {
    title: 'Sản phẩm ABIC',
    description: 'Tình trạng sử dụng bảo hiểm tín dụng, tài khoản, tài sản và con người.',
    products: [
      ['Bảo an tín dụng', (item) => item.abic.creditProtection, 'ABIC'],
      ['Bảo an tài khoản', (item) => item.abic.accountProtection, 'ABIC'],
      ['Bảo an chủ thẻ', (item) => item.abic.cardholderProtection, 'ABIC'],
      ['Bảo hiểm tài sản', (item) => item.abic.property, 'ABIC'],
      ['Bảo hiểm cháy nổ', (item) => item.abic.fire, 'ABIC'],
      ['Bảo hiểm xe máy', (item) => item.abic.motorcycle, 'ABIC'],
      ['Bảo hiểm ô tô', (item) => item.abic.automobile, 'ABIC'],
      ['Bảo hiểm nhà ở', (item) => item.abic.home, 'ABIC'],
      ['Bảo hiểm sức khỏe', (item) => item.abic.health, 'ABIC'],
    ],
  },
};

export function ProductsPage({ group = 'overview', navigate }) {
  const config = productGroups[group] || productGroups.overview;
  const [branch, setBranch] = useState('all');
  const scoped = useMemo(() => branch === 'all' ? demoCustomers : demoCustomers.filter((item) => item.branchCode === branch), [branch]);
  const rows = useMemo(() => config.products.map(([name, getter, category]) => {
    const values = scoped.map(getter);
    const using = values.filter((value) => value === true).length;
    const notUsing = values.filter((value) => value === false).length;
    const unknown = values.filter((value) => value == null).length;
    return { name, category, using, notUsing, unknown, coverage: Math.round(using / Math.max(scoped.length, 1) * 100), getter };
  }).sort((a, b) => b.coverage - a.coverage), [scoped, config]);
  const best = rows[0];
  const lowest = [...rows].sort((a, b) => a.coverage - b.coverage)[0];
  const unknownTotal = rows.reduce((sum, row) => sum + row.unknown, 0);

  return (
    <div className="demo-page">
      <PageHeading eyebrow="SẢN PHẨM DỊCH VỤ" title={config.title} description={config.description} extra={<Select value={branch} onChange={setBranch} style={{ width: 220 }} options={[{ value: 'all', label: 'Toàn tỉnh' }, ...demoMeta.branches.map((item) => ({ value: item.code, label: item.name }))]} />} />
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}><MiniMetric label="Sản phẩm có độ phủ cao nhất" value={`${best?.coverage || 0}%`} note={best?.name} tone="green" icon={<CheckCircleFilled />} /></Col>
        <Col xs={24} md={8}><MiniMetric label="Dư địa bán chéo lớn nhất" value={`${lowest?.notUsing.toLocaleString('vi-VN') || 0} KH`} note={lowest?.name} tone="gold" icon={<PieChartOutlined />} /></Col>
        <Col xs={24} md={8}><MiniMetric label="Trạng thái chưa xác định" value={unknownTotal.toLocaleString('vi-VN')} note="Cần bổ sung/đối chiếu nguồn" tone="red" icon={<AlertOutlined />} /></Col>
      </Row>
      <Card className="demo-table-card demo-section">
        <Table
          rowKey="name"
          pagination={false}
          dataSource={rows}
          columns={[
            { title: 'Sản phẩm', dataIndex: 'name', render: (value, row) => <div><Text strong>{value}</Text><br /><Text type="secondary">{row.category}</Text></div> },
            { title: 'Đang sử dụng', dataIndex: 'using', align: 'right', render: (value) => <Tag color="success">{value.toLocaleString('vi-VN')} KH</Tag> },
            { title: 'Chưa sử dụng', dataIndex: 'notUsing', align: 'right', render: (value) => <Tag>{value.toLocaleString('vi-VN')} KH</Tag> },
            { title: 'Chưa có dữ liệu', dataIndex: 'unknown', align: 'right', render: (value) => <Tag color={value ? 'warning' : 'default'}>{value.toLocaleString('vi-VN')} KH</Tag> },
            { title: 'Tỷ lệ sử dụng', dataIndex: 'coverage', width: 240, render: (value) => <Progress percent={value} strokeColor={value >= 70 ? '#218653' : value >= 35 ? '#d6a033' : '#8f1438'} /> },
            { title: '', width: 130, render: () => <Button type="link" onClick={() => navigate('customers')}>Xem khách hàng</Button> },
          ]}
        />
      </Card>
    </div>
  );
}

const sourceOverview = [
  { code: 'CIF', name: 'Hồ sơ khách hàng IPCAS', group: 'Thông tin KH', files: 6, branches: 6, rows: 1000, coverage: 100, status: 'ready', updated: '30/06/2026 21:05' },
  { code: 'DP01', name: 'Tài khoản tiền gửi', group: 'Tiền gửi', files: 12, branches: 6, rows: 3648, coverage: 100, status: 'ready', updated: '30/06/2026 21:12' },
  { code: 'PF14', name: 'Số dư bình quân và cuối kỳ', group: 'Tiền gửi', files: 12, branches: 6, rows: 2981, coverage: 96, status: 'warning', updated: '30/06/2026 21:18' },
  { code: 'LN01', name: 'Dư nợ khách hàng', group: 'Tiền vay', files: 10, branches: 6, rows: 1740, coverage: 100, status: 'ready', updated: '30/06/2026 21:25' },
  { code: 'CN05', name: 'Sản phẩm dịch vụ khách hàng', group: 'NHĐT/Thẻ', files: 11, branches: 6, rows: 1000, coverage: 98, status: 'warning', updated: '30/06/2026 21:31' },
  { code: 'ABIC', name: 'Dịch vụ bảo hiểm', group: 'ABIC', files: 4, branches: 3, rows: 842, coverage: 84, status: 'warning', updated: '30/06/2026 21:42' },
  { code: 'TTQT', name: 'Thanh toán quốc tế và LC', group: 'KDNH', files: 2, branches: 2, rows: 214, coverage: 42, status: 'missing', updated: '29/06/2026 18:10' },
  { code: 'PHI', name: 'Chi tiết phí dịch vụ', group: 'Phí', files: 0, branches: 0, rows: 0, coverage: 0, status: 'missing', updated: '—' },
];

export function SourceManagementPage({ mode = 'sources' }) {
  if (mode === 'mapping') return <FieldMappingPage />;
  const jobs = [
    { id: 'JOB-0626-01', period: '20260630', stage: 'Tổng hợp Profile C360', progress: 100, status: 'success', records: 1000, duration: '04:18' },
    { id: 'JOB-0526-01', period: '20260531', stage: 'Tổng hợp Profile C360', progress: 100, status: 'success', records: 986, duration: '03:54' },
    { id: 'JOB-0426-02', period: '20260430', stage: 'Đối chiếu nguồn PF14', progress: 100, status: 'warning', records: 972, duration: '05:12' },
    { id: 'JOB-0326-01', period: '20260331', stage: 'Tổng hợp Profile C360', progress: 100, status: 'success', records: 961, duration: '03:41' },
  ];

  if (mode === 'history') {
    return (
      <div className="demo-page">
        <PageHeading eyebrow="QUẢN TRỊ DỮ LIỆU" title="Lịch sử xử lý các kỳ" description="Theo dõi job tổng hợp, thời gian chạy, kết quả và khả năng phục hồi dữ liệu." />
        <Card className="demo-table-card">
          <Table rowKey="id" pagination={false} dataSource={jobs} columns={[
            { title: 'Mã job', dataIndex: 'id', render: (value) => <Text code>{value}</Text> },
            { title: 'Kỳ dữ liệu', dataIndex: 'period', render: periodLabel },
            { title: 'Công đoạn', dataIndex: 'stage' },
            { title: 'Tiến độ', dataIndex: 'progress', width: 180, render: (value) => <Progress percent={value} size="small" /> },
            { title: 'Khách hàng', dataIndex: 'records', align: 'right' },
            { title: 'Thời gian', dataIndex: 'duration', align: 'right' },
            { title: 'Kết quả', dataIndex: 'status', render: (value) => value === 'success' ? <Tag color="success">Thành công</Tag> : <Tag color="warning">Có cảnh báo</Tag> },
          ]} />
        </Card>
      </div>
    );
  }

  return (
    <div className="demo-page">
      <PageHeading eyebrow="QUẢN TRỊ DỮ LIỆU" title="Trạng thái nguồn dữ liệu" description="Thiết kế mở để tiếp nhận thêm nguồn mới ngoài các file ban đầu." extra={<Button type="primary" icon={<FileExcelOutlined />}>Thêm file nguồn</Button>} />
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}><MiniMetric label="Nguồn đã cấu hình" value={`${sourceOverview.length} nguồn`} note="Có thể bổ sung không giới hạn" tone="blue" icon={<DatabaseOutlined />} /></Col>
        <Col xs={24} md={8}><MiniMetric label="Nguồn sẵn sàng" value={`${sourceOverview.filter((item) => item.status === 'ready').length}/${sourceOverview.length}`} note="Đủ điều kiện tổng hợp tự động" tone="green" icon={<CheckCircleFilled />} /></Col>
        <Col xs={24} md={8}><MiniMetric label="Nguồn cần bổ sung" value={`${sourceOverview.filter((item) => item.status === 'missing').length} nguồn`} note="TTQT và chi tiết phí" tone="red" icon={<AlertOutlined />} /></Col>
      </Row>
      <Card className="demo-table-card demo-section">
        <Table rowKey="code" pagination={false} dataSource={sourceOverview} columns={[
          { title: 'Nguồn', dataIndex: 'code', width: 100, render: (value) => <Tag color="blue">{value}</Tag> },
          { title: 'Tên nguồn', dataIndex: 'name', render: (value, row) => <div><Text strong>{value}</Text><br /><Text type="secondary">{row.group}</Text></div> },
          { title: 'File', dataIndex: 'files', align: 'right' },
          { title: 'Chi nhánh', dataIndex: 'branches', align: 'right', render: (value) => `${value}/6` },
          { title: 'Số dòng', dataIndex: 'rows', align: 'right', render: (value) => value.toLocaleString('vi-VN') },
          { title: 'Độ sẵn sàng', dataIndex: 'coverage', width: 220, render: (value) => <Progress percent={value} size="small" status={value < 50 ? 'exception' : 'normal'} /> },
          { title: 'Cập nhật', dataIndex: 'updated' },
          { title: 'Trạng thái', dataIndex: 'status', render: (value) => value === 'ready' ? <Tag color="success">Sẵn sàng</Tag> : value === 'warning' ? <Tag color="warning">Cần kiểm tra</Tag> : <Tag color="error">Thiếu</Tag> },
        ]} />
      </Card>
    </div>
  );
}

export function FieldMappingPage() {
  const [keyword, setKeyword] = useState('');
  const [group, setGroup] = useState('all');
  const [status, setStatus] = useState('all');
  const filtered = useMemo(() => fieldDictionary.filter((item) => {
    const matchKeyword = !keyword || `${item.code} ${item.label} ${item.source}`.toLocaleLowerCase('vi').includes(keyword.toLocaleLowerCase('vi'));
    const matchGroup = group === 'all' || item.group === group;
    const matchStatus = status === 'all' || (status === 'unrated' ? item.status == null : item.status === status);
    return matchKeyword && matchGroup && matchStatus;
  }), [keyword, group, status]);
  const clear = fieldDictionary.filter((item) => item.status === 1).length;
  const unresolved = fieldDictionary.filter((item) => item.status == null).length;

  return (
    <div className="demo-page">
      <PageHeading eyebrow="QUẢN TRỊ DỮ LIỆU" title="Mapping 84 trường Profile khách hàng" description="Từ điển trường, nhóm nghiệp vụ, nguồn, kiểu dữ liệu và bảng đích dự kiến." extra={<Tag color="purple">84/84 TRƯỜNG</Tag>} />
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}><MiniMetric label="Đã xác định rõ nguồn" value={`${clear}/84`} note={`${Math.round(clear / 84 * 100)}% tổng số trường`} tone="green" icon={<CheckCircleFilled />} /></Col>
        <Col xs={24} sm={8}><MiniMetric label="Chưa đánh giá trạng thái" value={`${unresolved} trường`} note="Chủ yếu tiền vay, phí và KDNH" tone="red" icon={<AlertOutlined />} /></Col>
        <Col xs={24} sm={8}><MiniMetric label="Nhóm nghiệp vụ" value={`${fieldGroups.length} nhóm`} note="Tương ứng thiết kế ERD Profile" tone="blue" icon={<DatabaseOutlined />} /></Col>
      </Row>
      <Card className="demo-filter-card demo-section">
        <div className="demo-filters">
          <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm tên trường, nội dung hoặc nguồn..." className="demo-search" allowClear />
          <Select value={group} onChange={setGroup} style={{ minWidth: 180 }} options={[{ value: 'all', label: 'Tất cả nhóm' }, ...fieldGroups.map((value) => ({ value, label: value }))]} />
          <Select value={status} onChange={setStatus} style={{ minWidth: 190 }} options={determinationStatuses} />
          <Tag color="blue">{filtered.length} trường</Tag>
        </div>
      </Card>
      <Card className="demo-table-card">
        <Table
          rowKey="code"
          dataSource={filtered}
          pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 84], showTotal: (total) => `${total} trường` }}
          scroll={{ x: 1300 }}
          columns={[
            { title: 'STT', dataIndex: 'order', width: 65, align: 'center' },
            { title: 'Tên trường', dataIndex: 'code', width: 175, fixed: 'left', render: (value) => <Text code>{value}</Text> },
            { title: 'Nội dung', dataIndex: 'label', width: 270 },
            { title: 'Nhóm', dataIndex: 'group', width: 150, render: (value) => <Tag>{value}</Tag> },
            { title: 'Kiểu', dataIndex: 'typeName', width: 100 },
            { title: 'Nguồn dự kiến', dataIndex: 'source', width: 140, render: (value) => <Tag color="blue">{value}</Tag> },
            { title: 'Bảng đích', dataIndex: 'targetTable', width: 230, render: (value) => <Text code>{value}</Text> },
            {
              title: 'Trạng thái xác định',
              dataIndex: 'status',
              width: 190,
              render: (value, row) => value === 1
                ? <Tag color="success">{row.statusName}</Tag>
                : value == null
                  ? <Tag color="error">{row.statusName}</Tag>
                  : <Tag color="warning">{value} - {row.statusName}</Tag>,
            },
            { title: 'Cho phép NULL', dataIndex: 'nullable', width: 120, align: 'center', render: (value) => value ? <Tag color="warning">Có</Tag> : <Tag color="success">Không</Tag> },
          ]}
        />
      </Card>
    </div>
  );
}

export function CareOperationsPage({ mode = 'plans', navigate }) {
  const rows = useMemo(() => demoCustomers
    .filter((item) => mode === 'declining' ? item.history.at(-1).deposits < item.history.at(-2).deposits * 0.93 : item.opportunityCount >= 12)
    .slice(0, 80)
    .map((item, index) => ({
      ...item,
      suggestedProduct: !item.digital.agribankPlus ? 'Agribank Plus' : !item.cards.internationalCredit ? 'Thẻ tín dụng quốc tế' : !item.abic.accountProtection ? 'Bảo an tài khoản' : 'Bill Payment',
      careStatus: ['Mới phát hiện', 'Đã giao cán bộ', 'Đang tư vấn', 'Khách hàng quan tâm'][index % 4],
      dueDate: `0${1 + (index % 8)}/07/2026`,
      potential: 20_000_000 + (index % 12) * 5_000_000,
    })), [mode]);
  const title = mode === 'declining' ? 'Khách hàng suy giảm' : mode === 'unused' ? 'Khách hàng chưa dùng sản phẩm' : 'Kế hoạch chăm sóc khách hàng';
  return (
    <div className="demo-page">
      <PageHeading eyebrow="KHAI THÁC KHÁCH HÀNG" title={title} description="Biến tín hiệu dữ liệu thành danh sách công việc có cán bộ, thời hạn và trạng thái xử lý." extra={<Button type="primary" icon={<UserSwitchOutlined />}>Phân công hàng loạt</Button>} />
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}><MiniMetric label="Tổng trường hợp" value={rows.length.toLocaleString('vi-VN')} note="Theo điều kiện demo đang chọn" tone="blue" icon={<TeamOutlined />} /></Col>
        <Col xs={24} md={8}><MiniMetric label="Đang tư vấn/quan tâm" value={rows.filter((item) => ['Đang tư vấn', 'Khách hàng quan tâm'].includes(item.careStatus)).length.toLocaleString('vi-VN')} note="Có hoạt động chăm sóc" tone="green" icon={<ClockCircleOutlined />} /></Col>
        <Col xs={24} md={8}><MiniMetric label="Giá trị tiềm năng" value={compactMoney(rows.reduce((sum, item) => sum + item.potential, 0))} note="Ước tính minh họa" tone="gold" icon={<DollarOutlined />} /></Col>
      </Row>
      <Card className="demo-table-card demo-section">
        <Table rowKey="id" dataSource={rows} pagination={{ defaultPageSize: 15 }} onRow={(row) => ({ onClick: () => navigate('profile', row.id) })} rowClassName="demo-clickable-row" columns={[
          { title: 'Khách hàng', dataIndex: 'customerName', render: (value, row) => <div><Text strong>{value}</Text><br /><Text type="secondary">{row.customerCode} · {row.segment}</Text></div> },
          { title: 'Sản phẩm/Chủ đề', dataIndex: 'suggestedProduct', render: (value) => <Tag color="blue">{value}</Tag> },
          { title: 'Cán bộ', dataIndex: 'officer' },
          { title: 'Trạng thái', dataIndex: 'careStatus', render: (value) => <Tag color={value === 'Khách hàng quan tâm' ? 'success' : value === 'Đang tư vấn' ? 'processing' : 'default'}>{value}</Tag> },
          { title: 'Hạn xử lý', dataIndex: 'dueDate' },
          { title: 'Tiềm năng', dataIndex: 'potential', align: 'right', render: compactMoney },
        ]} />
      </Card>
    </div>
  );
}

export function ReportsPage({ mode = 'branches' }) {
  const groupKey = mode === 'officers' ? 'officer' : mode === 'products' ? null : 'branchCode';
  const rows = useMemo(() => {
    if (mode === 'products') {
      return productGroups.overview.products.map(([name, getter, category]) => {
        const using = demoCustomers.filter((item) => getter(item) === true).length;
        return { key: name, name, category, customers: using, deposits: 0, loans: 0, fees: 0, opportunities: demoCustomers.length - using };
      });
    }
    const buckets = new Map();
    demoCustomers.forEach((customer) => {
      const key = customer[groupKey];
      if (!buckets.has(key)) buckets.set(key, { key, name: mode === 'officers' ? key : customer.branchName, customers: 0, deposits: 0, loans: 0, fees: 0, opportunities: 0 });
      const row = buckets.get(key);
      row.customers += 1;
      row.deposits += customer.totalDeposits;
      row.loans += customer.totalLoans;
      row.fees += customer.fees.total;
      row.opportunities += customer.opportunityCount;
    });
    return [...buckets.values()].sort((a, b) => b.deposits + b.loans - a.deposits - a.loans);
  }, [mode, groupKey]);
  const title = mode === 'officers' ? 'Báo cáo theo cán bộ' : mode === 'products' ? 'Báo cáo sản phẩm' : mode === 'overall' ? 'Báo cáo tổng hợp' : 'Báo cáo theo chi nhánh';
  return (
    <div className="demo-page">
      <PageHeading eyebrow="BÁO CÁO QUẢN TRỊ" title={title} description="Báo cáo tổng hợp từ 1.000 hồ sơ demo, hỗ trợ so sánh và xuất dữ liệu." extra={<Space><Button icon={<FileExcelOutlined />}>Xuất Excel</Button><Button type="primary" icon={<BarChartOutlined />}>Lưu mẫu báo cáo</Button></Space>} />
      <Card className="demo-table-card">
        <Table rowKey="key" pagination={false} dataSource={rows} columns={[
          { title: mode === 'products' ? 'Sản phẩm' : mode === 'officers' ? 'Cán bộ' : 'Đơn vị', dataIndex: 'name', render: (value, row) => <div><Text strong>{value}</Text>{mode === 'products' && <><br /><Text type="secondary">{row.category}</Text></>}</div> },
          { title: 'Khách hàng', dataIndex: 'customers', align: 'right', render: (value) => value.toLocaleString('vi-VN') },
          ...(mode !== 'products' ? [
            { title: 'Tiền gửi', dataIndex: 'deposits', align: 'right', render: compactMoney },
            { title: 'Dư nợ', dataIndex: 'loans', align: 'right', render: compactMoney },
            { title: 'Tổng phí', dataIndex: 'fees', align: 'right', render: compactMoney },
          ] : []),
          { title: 'Cơ hội', dataIndex: 'opportunities', align: 'right', render: (value) => <Badge count={value} overflowCount={9999} color="#8f1438" /> },
          { title: 'Đánh giá', render: (_, row) => <Tag color={row.customers > 150 || row.deposits > 1_200_000_000_000 ? 'success' : 'blue'}>{mode === 'products' ? `${Math.round(row.customers / demoCustomers.length * 100)}% độ phủ` : 'Hoạt động ổn định'}</Tag> },
        ]} />
      </Card>
    </div>
  );
}

