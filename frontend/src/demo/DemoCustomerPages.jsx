import { useMemo, useState } from 'react';
import {
  AlertOutlined,
  BankOutlined,
  CheckCircleFilled,
  DollarOutlined,
  IdcardOutlined,
  PhoneOutlined,
  SearchOutlined,
  TeamOutlined,
  UserOutlined,
  UserSwitchOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  Modal,
  Progress,
  Row,
  Segmented,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';

import { demoCustomers, demoMeta } from './data/mockCustomers';

const { Text, Title } = Typography;
const compactMoney = (value) => {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1_000_000_000) return `${(number / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu`;
  return `${number.toLocaleString('vi-VN')} đ`;
};

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

function SummaryCard({ label, value, note, icon, tone = 'blue' }) {
  return (
    <Card className={`demo-mini-metric demo-mini-metric--${tone}`}>
      <div className="demo-mini-metric-head"><span>{icon}</span><Text>{label}</Text></div>
      <strong>{value}</strong>
      <small>{note}</small>
    </Card>
  );
}

function CustomerIdentity({ customer }) {
  return (
    <div className="demo-customer-cell">
      <Avatar className="demo-customer-avatar">{customer.customerName.charAt(0)}</Avatar>
      <div>
        <Text strong>{customer.customerName}</Text>
        <Text type="secondary">{customer.customerCode} · {customer.customerType}</Text>
      </div>
    </div>
  );
}

function RiskTag({ level }) {
  if (level === 'high') return <Tag color="error">Rủi ro cao</Tag>;
  if (level === 'medium') return <Tag color="warning">Cần chú ý</Tag>;
  return <Tag color="success">Bình thường</Tag>;
}

const baseColumns = (onCustomerOpen) => [
  {
    title: 'Khách hàng',
    dataIndex: 'customerName',
    width: 280,
    render: (_, row) => <CustomerIdentity customer={row} />,
  },
  { title: 'Phân khúc', dataIndex: 'segment', width: 120, render: (value) => <Tag color={value === 'PLATINUM' ? 'purple' : value === 'GOLD' ? 'gold' : value === 'SILVER' ? 'blue' : 'default'}>{value}</Tag> },
  { title: 'Chi nhánh/PGD', width: 220, render: (_, row) => <div><Text>{row.branchName}</Text><br /><Text type="secondary">{row.pgd}</Text></div> },
  { title: 'Cán bộ quản lý', dataIndex: 'officer', width: 175 },
  { title: 'Tiền gửi', dataIndex: 'totalDeposits', width: 125, align: 'right', render: compactMoney },
  { title: 'Dư nợ', dataIndex: 'totalLoans', width: 125, align: 'right', render: compactMoney },
  { title: 'Cảnh báo', dataIndex: 'riskLevel', width: 120, render: (value) => <RiskTag level={value} /> },
  { title: '', width: 105, fixed: 'right', render: (_, row) => <Button type="link" onClick={(event) => { event.stopPropagation(); onCustomerOpen(row.id); }}>Xem nhanh</Button> },
];

function ProductSummary({ customer }) {
  const groups = [
    {
      name: 'Ngân hàng điện tử',
      values: [
        ['Agribank Plus', customer.digital.agribankPlus],
        ['OTT', customer.digital.ott],
        ['E-Banking', customer.digital.eBanking],
        ['Loa thần tài', customer.digital.loaThanTai],
      ],
    },
    {
      name: 'Thẻ và POS',
      values: [
        ['Thẻ ghi nợ nội địa', customer.cards.domesticDebit],
        ['Thẻ tín dụng quốc tế', customer.cards.internationalCredit],
        ['POS', customer.cards.pos],
      ],
    },
    {
      name: 'ABIC',
      values: [
        ['Bảo an tín dụng', customer.abic.creditProtection],
        ['Bảo an tài khoản', customer.abic.accountProtection],
        ['Bảo hiểm ô tô', customer.abic.automobile],
      ],
    },
  ];
  return (
    <div className="demo-quick-product-groups">
      {groups.map((group) => (
        <Card size="small" title={group.name} key={group.name}>
          {group.values.map(([label, value]) => (
            <div className="demo-quick-product-row" key={label}>
              <Text>{label}</Text>
              {value === true ? <Tag color="success">Đang dùng</Tag> : value === false ? <Tag>Chưa dùng</Tag> : <Tag color="warning">Chưa rõ</Tag>}
            </div>
          ))}
        </Card>
      ))}
    </div>
  );
}

export function CustomerQuickViewModal({ customer, open, onClose, onOpenProfile }) {
  if (!customer) return null;
  const alerts = [
    customer.loans.badDebt > 0 && { tone: 'error', title: 'Có dư nợ xấu', detail: compactMoney(customer.loans.badDebt) },
    customer.missingDataCount > 0 && { tone: 'warning', title: 'Dữ liệu chưa đầy đủ', detail: `${customer.missingDataCount} trường cần đối chiếu` },
    !customer.phone && { tone: 'warning', title: 'Thiếu số điện thoại', detail: 'Cần cập nhật hồ sơ CIF' },
    customer.opportunityCount > 0 && { tone: 'blue', title: 'Cơ hội bán chéo', detail: `${customer.opportunityCount} sản phẩm tiềm năng` },
  ].filter(Boolean);

  return (
    <Modal
      width={1040}
      open={open}
      onCancel={onClose}
      title={null}
      footer={[
        <Button key="close" onClick={onClose}>Đóng</Button>,
        <Button key="profile" type="primary" onClick={() => onOpenProfile(customer.id)}>Mở Profile đầy đủ</Button>,
      ]}
      className="demo-customer-modal"
    >
      <div className="demo-quick-header">
        <Avatar size={58} className="demo-profile-avatar">{customer.customerName.charAt(0)}</Avatar>
        <div>
          <Space wrap><Title level={3}>{customer.customerName}</Title><Tag color="blue">{customer.customerType}</Tag><Tag color="gold">{customer.segment}</Tag></Space>
          <Text type="secondary">{customer.customerCode} · {customer.idNumber} · {customer.phone || 'Chưa có điện thoại'}</Text>
          <div className="demo-profile-meta"><span>{customer.branchName}</span><span>{customer.pgd}</span><span>CBQL: {customer.officer}</span></div>
        </div>
        <div className="demo-quick-risk"><RiskTag level={customer.riskLevel} /></div>
      </div>

      <Row gutter={[12, 12]} className="demo-quick-metrics">
        <Col span={6}><div><WalletOutlined /><Text>Tiền gửi</Text><strong>{compactMoney(customer.totalDeposits)}</strong></div></Col>
        <Col span={6}><div><BankOutlined /><Text>Dư nợ</Text><strong>{compactMoney(customer.totalLoans)}</strong></div></Col>
        <Col span={6}><div><DollarOutlined /><Text>Tổng lợi ích</Text><strong>{compactMoney(customer.totalBenefits)}</strong></div></Col>
        <Col span={6}><div><TeamOutlined /><Text>Sản phẩm</Text><strong>{customer.productCount}</strong></div></Col>
      </Row>

      <Tabs
        items={[
          {
            key: 'summary',
            label: 'Tóm tắt',
            children: (
              <Row gutter={[16, 16]}>
                <Col span={14}>
                  <Descriptions size="small" bordered column={2} items={[
                    { key: 'code', label: 'Mã khách hàng', children: customer.customerCode },
                    { key: 'id', label: 'CCCD/MST', children: customer.idNumber },
                    { key: 'phone', label: 'Điện thoại', children: customer.phone || <Tag color="warning">Chưa có</Tag> },
                    { key: 'date', label: 'Ngày sinh/Thành lập', children: customer.birthOrEstablished },
                    { key: 'branch', label: 'Chi nhánh', children: customer.branchName },
                    { key: 'officer', label: 'Cán bộ', children: customer.officer },
                    { key: 'address', label: 'Địa chỉ', span: 2, children: customer.address },
                  ]} />
                </Col>
                <Col span={10}>
                  <div className="demo-quick-alerts">
                    {alerts.length ? alerts.map((alert) => (
                      <div className={`is-${alert.tone}`} key={alert.title}>
                        <AlertOutlined /><span><Text strong>{alert.title}</Text><small>{alert.detail}</small></span>
                      </div>
                    )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có cảnh báo" />}
                  </div>
                </Col>
              </Row>
            ),
          },
          { key: 'products', label: `Sản phẩm (${customer.productCount})`, children: <ProductSummary customer={customer} /> },
          {
            key: 'sources',
            label: 'Nguồn dữ liệu',
            children: <Table size="small" rowKey="code" pagination={false} dataSource={customer.sources} columns={[
              { title: 'Nguồn', dataIndex: 'code', render: (value) => <Tag color="blue">{value}</Tag> },
              { title: 'Trạng thái', dataIndex: 'status', render: (value) => value === 'ready' ? <Tag color="success">Sẵn sàng</Tag> : value === 'warning' ? <Tag color="warning">Cần kiểm tra</Tag> : <Tag color="error">Thiếu</Tag> },
              { title: 'Bản ghi', dataIndex: 'records', align: 'right' },
              { title: 'Cập nhật', dataIndex: 'updatedAt' },
            ]} />,
          },
        ]}
      />
    </Modal>
  );
}

export function CustomerSearchPage({ onCustomerOpen }) {
  const [keyword, setKeyword] = useState('');
  const normalized = keyword.trim().toLocaleLowerCase('vi');
  const results = useMemo(() => {
    const source = normalized
      ? demoCustomers.filter((customer) => [customer.customerCode, customer.customerName, customer.idNumber, customer.phone]
        .filter(Boolean).some((value) => value.toLocaleLowerCase('vi').includes(normalized)))
      : [...demoCustomers].sort((a, b) => b.totalBenefits - a.totalBenefits).slice(0, 8);
    return source.slice(0, 30);
  }, [normalized]);

  return (
    <div className="demo-page">
      <div className="demo-search-hero">
        <Text className="demo-eyebrow">TRA CỨU PROFILE 360</Text>
        <Title level={2}>Tìm một khách hàng trong vài giây</Title>
        <Text type="secondary">Tìm theo mã khách hàng, tên, CCCD/MST hoặc số điện thoại.</Text>
        <Input
          size="large"
          autoFocus
          allowClear
          prefix={<SearchOutlined />}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="Ví dụ: KH260000001, Nguyễn Văn An, 02720..."
        />
        <Space wrap><Tag icon={<IdcardOutlined />}>CCCD/MST</Tag><Tag icon={<PhoneOutlined />}>Điện thoại</Tag><Tag icon={<UserOutlined />}>Tên khách hàng</Tag></Space>
      </div>
      <Card title={normalized ? `Kết quả tìm kiếm (${results.length})` : 'Khách hàng giá trị cao truy cập nhanh'} className="demo-table-card demo-section">
        <Table
          rowKey="id"
          pagination={false}
          dataSource={results}
          columns={baseColumns(onCustomerOpen)}
          onRow={(row) => ({ onClick: () => onCustomerOpen(row.id) })}
          rowClassName="demo-clickable-row"
          scroll={{ x: 1450 }}
        />
      </Card>
    </div>
  );
}

export function HighValueCustomersPage({ onCustomerOpen }) {
  const [basis, setBasis] = useState('benefit');
  const getters = {
    benefit: (item) => item.totalBenefits,
    deposits: (item) => item.totalDeposits,
    loans: (item) => item.totalLoans,
  };
  const rows = useMemo(() => [...demoCustomers].sort((a, b) => getters[basis](b) - getters[basis](a)).slice(0, 100), [basis]);
  const platinumGold = rows.filter((item) => ['PLATINUM', 'GOLD'].includes(item.segment)).length;
  return (
    <div className="demo-page">
      <PageHeading eyebrow="PHÂN KHÚC KHÁCH HÀNG" title="Khách hàng giá trị cao" description="Xếp hạng linh hoạt theo lợi ích, tiền gửi hoặc dư nợ; không dùng chung bộ lọc với danh sách thông thường." extra={<Segmented value={basis} onChange={setBasis} options={[{ value: 'benefit', label: 'Tổng lợi ích' }, { value: 'deposits', label: 'Tiền gửi' }, { value: 'loans', label: 'Dư nợ' }]} />} />
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}><SummaryCard label="Danh mục ưu tiên" value="Top 100" note="Xếp hạng tự động theo tiêu chí" tone="gold" icon={<DollarOutlined />} /></Col>
        <Col xs={24} md={8}><SummaryCard label="GOLD/PLATINUM" value={`${platinumGold} KH`} note="Trong danh mục ưu tiên" tone="green" icon={<CheckCircleFilled />} /></Col>
        <Col xs={24} md={8}><SummaryCard label="Tổng lợi ích" value={compactMoney(rows.reduce((sum, item) => sum + item.totalBenefits, 0))} note="Đóng góp của Top 100" tone="blue" icon={<WalletOutlined />} /></Col>
      </Row>
      <Card className="demo-table-card demo-section">
        <Table
          rowKey="id"
          dataSource={rows}
          pagination={{ defaultPageSize: 20 }}
          onRow={(row) => ({ onClick: () => onCustomerOpen(row.id) })}
          rowClassName="demo-clickable-row"
          scroll={{ x: 1500 }}
          columns={[
            { title: 'Hạng', width: 70, render: (_, __, index) => <span className="demo-rank-number">{index + 1}</span> },
            ...baseColumns(onCustomerOpen).slice(0, 4),
            { title: 'Tổng lợi ích', dataIndex: 'totalBenefits', width: 140, align: 'right', sorter: (a, b) => a.totalBenefits - b.totalBenefits, render: (value) => <Text strong>{compactMoney(value)}</Text> },
            { title: 'Tiền gửi', dataIndex: 'totalDeposits', width: 130, align: 'right', render: compactMoney },
            { title: 'Dư nợ', dataIndex: 'totalLoans', width: 130, align: 'right', render: compactMoney },
            { title: 'Sản phẩm', dataIndex: 'productCount', align: 'center', render: (value) => <Badge count={value} color="#3567a8" /> },
            baseColumns(onCustomerOpen).at(-1),
          ]}
        />
      </Card>
    </div>
  );
}

export function AttentionCustomersPage({ onCustomerOpen }) {
  const [issue, setIssue] = useState('all');
  const issueCounts = {
    risk: demoCustomers.filter((item) => item.loans.badDebt > 0).length,
    missing: demoCustomers.filter((item) => item.missingDataCount > 4).length,
    contact: demoCustomers.filter((item) => !item.phone).length,
    declining: demoCustomers.filter((item) => item.history.at(-1).deposits < item.history.at(-2).deposits * 0.93).length,
  };
  const rows = useMemo(() => demoCustomers.filter((customer) => {
    if (issue === 'risk') return customer.loans.badDebt > 0;
    if (issue === 'missing') return customer.missingDataCount > 4;
    if (issue === 'contact') return !customer.phone;
    if (issue === 'declining') return customer.history.at(-1).deposits < customer.history.at(-2).deposits * 0.93;
    return customer.riskLevel !== 'low';
  }), [issue]);
  const cards = [
    ['risk', 'Nợ xấu', issueCounts.risk, 'red', 'Cần xử lý tín dụng'],
    ['missing', 'Thiếu dữ liệu', issueCounts.missing, 'gold', 'Nguồn chưa đầy đủ'],
    ['contact', 'Thiếu liên hệ', issueCounts.contact, 'blue', 'Không có điện thoại'],
    ['declining', 'Tiền gửi suy giảm', issueCounts.declining, 'red', 'Giảm trên 7%'],
  ];
  return (
    <div className="demo-page">
      <PageHeading eyebrow="CẢNH BÁO DANH MỤC" title="Khách hàng cần chú ý" description="Tổ chức theo vấn đề cần xử lý thay vì lặp lại trang danh sách khách hàng." />
      <Row gutter={[16, 16]}>
        {cards.map(([key, label, count, tone, note]) => (
          <Col xs={24} sm={12} xl={6} key={key}>
            <div className={`demo-issue-card is-${tone}${issue === key ? ' is-active' : ''}`} onClick={() => setIssue(issue === key ? 'all' : key)}>
              <AlertOutlined /><div><Text>{label}</Text><strong>{count}</strong><small>{note}</small></div>
            </div>
          </Col>
        ))}
      </Row>
      <Card title={`Danh sách cần xử lý · ${rows.length} khách hàng`} className="demo-table-card demo-section">
        <Table
          rowKey="id"
          dataSource={rows}
          pagination={{ defaultPageSize: 20 }}
          onRow={(row) => ({ onClick: () => onCustomerOpen(row.id) })}
          rowClassName="demo-clickable-row"
          scroll={{ x: 1500 }}
          columns={[
            ...baseColumns(onCustomerOpen).slice(0, 4),
            {
              title: 'Vấn đề phát hiện',
              width: 280,
              render: (_, row) => <Space wrap>
                {row.loans.badDebt > 0 && <Tag color="error">Nợ xấu {compactMoney(row.loans.badDebt)}</Tag>}
                {row.missingDataCount > 4 && <Tag color="warning">{row.missingDataCount} trường thiếu</Tag>}
                {!row.phone && <Tag color="blue">Thiếu điện thoại</Tag>}
              </Space>,
            },
            { title: 'Mức độ', dataIndex: 'riskLevel', render: (value) => <RiskTag level={value} /> },
            baseColumns(onCustomerOpen).at(-1),
          ]}
        />
      </Card>
    </div>
  );
}

export function CustomerAssignmentPage({ onCustomerOpen }) {
  const officers = [...new Set(demoCustomers.map((item) => item.officer))];
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [selectedOfficer, setSelectedOfficer] = useState(null);
  const reviewRows = useMemo(() => demoCustomers.filter((item) => item.id % 9 === 0).slice(0, 90), []);
  const workloads = officers.map((officer) => {
    const customers = demoCustomers.filter((item) => item.officer === officer);
    return { officer, customers: customers.length, highValue: customers.filter((item) => item.totalBenefits >= 100_000_000).length, alerts: customers.filter((item) => item.riskLevel !== 'low').length };
  }).sort((a, b) => b.customers - a.customers);

  function assign() {
    if (!selectedOfficer || !selectedKeys.length) {
      message.warning('Chọn khách hàng và cán bộ nhận phân công');
      return;
    }
    message.success(`Đã mô phỏng phân công ${selectedKeys.length} khách hàng cho ${selectedOfficer}`);
    setSelectedKeys([]);
  }

  return (
    <div className="demo-page">
      <PageHeading eyebrow="PHÂN CÔNG QUẢN LÝ" title="Điều phối danh mục khách hàng" description="Theo dõi tải cán bộ, cảnh báo và phân công hàng loạt; khác biệt hoàn toàn với trang tra cứu." extra={<Space><Select placeholder="Chọn cán bộ nhận" value={selectedOfficer} onChange={setSelectedOfficer} style={{ width: 210 }} options={officers.map((value) => ({ value, label: value }))} /><Button type="primary" icon={<UserSwitchOutlined />} onClick={assign}>Phân công {selectedKeys.length || ''}</Button></Space>} />
      <Card title="Tải danh mục theo cán bộ" className="demo-panel">
        <div className="demo-officer-workload">
          {workloads.map((row) => (
            <div key={row.officer}>
              <Avatar icon={<UserOutlined />} />
              <div><Text strong>{row.officer}</Text><Text type="secondary">{row.customers} KH · {row.highValue} giá trị cao</Text><Progress percent={Math.round(row.customers / Math.max(...workloads.map((item) => item.customers)) * 100)} showInfo={false} /></div>
              <Badge count={row.alerts} color={row.alerts > 40 ? '#c62828' : '#d6a033'} title="Khách hàng cần chú ý" />
            </div>
          ))}
        </div>
      </Card>
      <Card title="Khách hàng cần rà soát đơn vị/cán bộ quản lý" className="demo-table-card demo-section">
        <Table
          rowKey="id"
          rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
          dataSource={reviewRows}
          pagination={{ defaultPageSize: 15 }}
          onRow={(row) => ({ onDoubleClick: () => onCustomerOpen(row.id) })}
          scroll={{ x: 1400 }}
          columns={[
            ...baseColumns(onCustomerOpen).slice(0, 3),
            { title: 'Cán bộ hiện tại', dataIndex: 'officer' },
            { title: 'Lý do rà soát', render: (_, row) => <Tag color="warning">{row.id % 2 ? 'Nhiều điểm giao dịch' : 'Chênh lệch điểm quản lý'}</Tag> },
            { title: 'Giá trị quan hệ', dataIndex: 'totalBenefits', align: 'right', render: compactMoney },
            baseColumns(onCustomerOpen).at(-1),
          ]}
        />
      </Card>
    </div>
  );
}

