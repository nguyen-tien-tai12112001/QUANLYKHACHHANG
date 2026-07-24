import { useMemo, useState } from 'react';
import {
  AlertOutlined,
  BankOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  DollarOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  InfoCircleOutlined,
  SaveOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import {
  Badge,
  Button,
  Card,
  Col,
  Input,
  message,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';

import { demoCustomers, demoMeta } from './data/mockCustomers';

const { Text, Title } = Typography;
const TEMPLATE_KEY = 'c360_demo_executive_templates';

const compactMoney = (value) => {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1_000_000_000_000) return `${(number / 1_000_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} nghìn tỷ`;
  if (Math.abs(number) >= 1_000_000_000) return `${(number / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu`;
  return `${number.toLocaleString('vi-VN')} đ`;
};
const periodLabel = (period) => `${period.slice(4, 6)}/${period.slice(0, 4)}`;
const percent = (current, previous) => previous ? ((current - previous) / previous) * 100 : 0;

const products = [
  ['Agribank Plus', (item) => item.digital.agribankPlus],
  ['E-Banking', (item) => item.digital.eBanking],
  ['Thẻ ghi nợ nội địa', (item) => item.cards.domesticDebit],
  ['Thẻ tín dụng quốc tế', (item) => item.cards.internationalCredit],
  ['POS', (item) => item.cards.pos],
  ['Bill Payment điện', (item) => item.billPayments.electricity],
  ['Bảo an tài khoản', (item) => item.abic.accountProtection],
  ['Bảo an tín dụng', (item) => item.abic.creditProtection],
];

function periodValue(customer, periodIndex) {
  const history = customer.history[periodIndex] || customer.history.at(-1);
  return { deposits: history.deposits, loans: history.loans, fees: history.fees };
}

function aggregate(customers, periodIndex) {
  return customers.reduce((result, customer) => {
    const value = periodValue(customer, periodIndex);
    result.customers += 1;
    result.deposits += value.deposits;
    result.loans += value.loans;
    result.fees += value.fees;
    result.badDebt += customer.loans.badDebt;
    if (customer.loans.badDebt > 0) result.badDebtCustomers += 1;
    return result;
  }, { customers: 0, deposits: 0, loans: 0, fees: 0, badDebt: 0, badDebtCustomers: 0 });
}

function groupRows(customers, periodIndex, keyGetter, nameGetter) {
  const previousIndex = Math.max(0, periodIndex - 1);
  const buckets = new Map();
  customers.forEach((customer) => {
    const key = keyGetter(customer);
    if (!buckets.has(key)) buckets.set(key, { key, name: nameGetter(customer), customers: [], deposits: 0, previousDeposits: 0, loans: 0, fees: 0, badDebt: 0 });
    const row = buckets.get(key);
    const current = periodValue(customer, periodIndex);
    const previous = periodValue(customer, previousIndex);
    row.customers.push(customer);
    row.deposits += current.deposits;
    row.previousDeposits += previous.deposits;
    row.loans += current.loans;
    row.fees += current.fees;
    row.badDebt += customer.loans.badDebt;
  });
  return [...buckets.values()].map((row) => ({ ...row, growth: percent(row.deposits, row.previousDeposits) }));
}

function ChangeTag({ value, samePeriod = false }) {
  const positive = value >= 0;
  return (
    <Tooltip title={samePeriod ? 'Cùng kỳ được mô phỏng do dữ liệu demo hiện có 12 tháng' : 'So với kỳ liền trước'}>
      <Tag color={positive ? 'success' : 'error'}>{positive ? '+' : ''}{value.toFixed(1)}%</Tag>
    </Tooltip>
  );
}

function ExecutiveMetric({ title, value, note, change, yearChange, icon, tone, onClick, formula }) {
  return (
    <Card className={`demo-exec-metric is-${tone}`} onClick={onClick}>
      <div className="demo-exec-metric-head">
        <span>{icon}</span>
        <Tooltip title={formula}><InfoCircleOutlined /></Tooltip>
      </div>
      <Text type="secondary">{title}</Text>
      <strong>{value}</strong>
      <div className="demo-exec-comparison">
        <ChangeTag value={change} /><Text type="secondary">tháng trước</Text>
        <ChangeTag value={yearChange} samePeriod /><Text type="secondary">cùng kỳ</Text>
      </div>
      <small>{note}</small>
    </Card>
  );
}

function downloadFile(content, filename, type) {
  const blob = new Blob(['\ufeff', content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function DemoExecutiveDashboard({ onCustomerOpen }) {
  const [period, setPeriod] = useState(demoMeta.period);
  const [branch, setBranch] = useState('all');
  const [customerType, setCustomerType] = useState('all');
  const [drill, setDrill] = useState(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templates, setTemplates] = useState(() => {
    try { return JSON.parse(localStorage.getItem(TEMPLATE_KEY) || '[]'); } catch { return []; }
  });

  const periodIndex = Math.max(0, demoMeta.periods.indexOf(period));
  const previousIndex = Math.max(0, periodIndex - 1);
  const filtered = useMemo(() => demoCustomers.filter((customer) =>
    (branch === 'all' || customer.branchCode === branch)
    && (customerType === 'all' || customer.customerType === customerType)
  ), [branch, customerType]);
  const current = useMemo(() => aggregate(filtered, periodIndex), [filtered, periodIndex]);
  const previous = useMemo(() => aggregate(filtered, previousIndex), [filtered, previousIndex]);
  const yearFactor = 0.91 + ((periodIndex % 4) * 0.01);
  const newCustomers = filtered.filter((item) => (item.id + periodIndex) % 23 === 0);
  const lostCustomers = filtered.filter((item) => (item.id + periodIndex) % 41 === 0);
  const badDebtRate = current.loans ? current.badDebt / current.loans * 100 : 0;
  const previousBadDebtRate = previous.loans ? current.badDebt / previous.loans * 100 : 0;

  const branchRows = useMemo(() => groupRows(filtered, periodIndex, (item) => item.branchCode, (item) => item.branchName)
    .sort((a, b) => b.deposits + b.loans + b.fees - a.deposits - a.loans - a.fees), [filtered, periodIndex]);
  const officerRows = useMemo(() => groupRows(filtered, periodIndex, (item) => item.officer, (item) => item.officer)
    .sort((a, b) => b.fees - a.fees), [filtered, periodIndex]);
  const productRows = useMemo(() => products.map(([name, getter]) => ({
    name,
    customers: filtered.filter((item) => getter(item) === true),
  })).sort((a, b) => b.customers.length - a.customers.length), [filtered]);
  const abnormalCustomers = useMemo(() => filtered.map((customer) => {
    const now = periodValue(customer, periodIndex);
    const before = periodValue(customer, previousIndex);
    return { ...customer, currentDeposits: now.deposits, depositChange: percent(now.deposits, before.deposits) };
  }).filter((item) => item.currentDeposits >= 2_000_000_000 && Math.abs(item.depositChange) >= 5)
    .sort((a, b) => Math.abs(b.depositChange) - Math.abs(a.depositChange)).slice(0, 8), [filtered, periodIndex, previousIndex]);
  const decliningBranches = branchRows.filter((row) => row.growth < 0).sort((a, b) => a.growth - b.growth);
  const sourceIssues = filtered.filter((item) => item.sources.some((source) => source.status !== 'ready'));
  const qualityScore = filtered.length ? Math.round((1 - sourceIssues.length / filtered.length) * 100) : 100;

  function openDrill(title, customers) {
    setDrill({ title, customers });
  }

  function saveTemplate() {
    if (!templateName.trim()) return message.warning('Hãy nhập tên mẫu báo cáo');
    const next = [...templates.filter((item) => item.name !== templateName.trim()), { name: templateName.trim(), period, branch, customerType }];
    setTemplates(next);
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(next));
    setSaveOpen(false);
    setTemplateName('');
    message.success('Đã lưu mẫu báo cáo trên trình duyệt này');
  }

  function applyTemplate(name) {
    const template = templates.find((item) => item.name === name);
    if (!template) return;
    setPeriod(template.period);
    setBranch(template.branch);
    setCustomerType(template.customerType);
    message.success(`Đã áp dụng mẫu “${name}”`);
  }

  function exportExcel() {
    const rows = branchRows.map((row, index) => `<tr><td>${index + 1}</td><td>${row.name}</td><td>${row.customers.length}</td><td>${row.deposits}</td><td>${row.loans}</td><td>${row.fees}</td><td>${row.growth.toFixed(2)}%</td><td>${row.badDebt}</td></tr>`).join('');
    const html = `<html><head><meta charset="UTF-8"></head><body><h2>Báo cáo điều hành C360 - ${periodLabel(period)}</h2><p>Phạm vi: ${branch === 'all' ? 'Toàn tỉnh' : demoMeta.branches.find((item) => item.code === branch)?.name} | Loại KH: ${customerType === 'all' ? 'Tất cả' : customerType}</p><table border="1"><tr><th>STT</th><th>Đơn vị</th><th>Khách hàng</th><th>Tiền gửi</th><th>Dư nợ</th><th>Doanh thu phí</th><th>Tăng trưởng</th><th>Nợ xấu</th></tr>${rows}</table></body></html>`;
    downloadFile(html, `bao-cao-dieu-hanh-${period}.xls`, 'application/vnd.ms-excel');
    message.success('Đã xuất báo cáo Excel theo bộ lọc hiện tại');
  }

  function exportPdf() {
    document.body.classList.add('demo-print-executive');
    window.print();
    setTimeout(() => document.body.classList.remove('demo-print-executive'), 500);
  }

  const branchColumns = [
    { title: '#', width: 48, render: (_, __, index) => index + 1 },
    { title: 'Đơn vị', dataIndex: 'name', render: (value) => <Text strong>{value}</Text> },
    { title: 'Tăng trưởng', dataIndex: 'growth', width: 112, align: 'right', render: (value) => <ChangeTag value={value} /> },
    { title: 'Khách hàng', dataIndex: 'customers', align: 'right', render: (value, row) => <Button type="link" onClick={() => openDrill(`Khách hàng - ${row.name}`, value)}>{value.length.toLocaleString('vi-VN')}</Button> },
    { title: 'Tiền gửi', dataIndex: 'deposits', align: 'right', render: compactMoney },
    { title: 'Dư nợ', dataIndex: 'loans', align: 'right', render: compactMoney },
    { title: 'Phí', dataIndex: 'fees', align: 'right', render: compactMoney },
    { title: 'Nợ xấu', dataIndex: 'badDebt', align: 'right', render: (value) => value ? <Text type="danger">{compactMoney(value)}</Text> : '—' },
  ];

  return (
    <div className="demo-page demo-executive-dashboard">
      <div className="demo-page-heading demo-exec-heading">
        <div>
          <Text className="demo-eyebrow">DASHBOARD DÀNH CHO LÃNH ĐẠO</Text>
          <Title level={2}>Tổng quan điều hành C360</Title>
          <Text type="secondary"><ClockCircleOutlined /> Dữ liệu cập nhật gần nhất: {demoMeta.generatedAt}</Text>
        </div>
        <Space wrap className="demo-no-print">
          {templates.length > 0 && <Select placeholder="Mẫu đã lưu" style={{ width: 170 }} onChange={applyTemplate} options={templates.map((item) => ({ value: item.name, label: item.name }))} />}
          <Button icon={<SaveOutlined />} onClick={() => setSaveOpen(true)}>Lưu mẫu</Button>
          <Button icon={<FileExcelOutlined />} onClick={exportExcel}>Excel</Button>
          <Button icon={<FilePdfOutlined />} onClick={exportPdf}>PDF</Button>
        </Space>
      </div>

      <Card className="demo-exec-filter demo-no-print">
        <div>
          <Select value={period} onChange={setPeriod} options={demoMeta.periods.map((value) => ({ value, label: `Kỳ ${periodLabel(value)}` }))} />
          <Select value={branch} onChange={setBranch} options={[{ value: 'all', label: 'Toàn tỉnh' }, ...demoMeta.branches.map((item) => ({ value: item.code, label: item.name }))]} />
          <Select value={customerType} onChange={setCustomerType} options={[{ value: 'all', label: 'Tất cả loại khách hàng' }, ...['Cá nhân', 'Doanh nghiệp', 'Hộ kinh doanh'].map((value) => ({ value, label: value }))]} />
        </div>
        <Text type="secondary">Đang xem <strong>{filtered.length.toLocaleString('vi-VN')}</strong> hồ sơ phù hợp</Text>
      </Card>

      <Row gutter={[14, 14]}>
        <Col xs={24} sm={12} xl={6}><ExecutiveMetric title="Tổng khách hàng" value={current.customers.toLocaleString('vi-VN')} note={`${newCustomers.length} mới · ${lostCustomers.length} rời bỏ`} change={percent(current.customers + newCustomers.length - lostCustomers.length, current.customers)} yearChange={8.2} icon={<TeamOutlined />} tone="blue" formula="Số hồ sơ khách hàng thuộc phạm vi và bộ lọc đang chọn" onClick={() => openDrill('Tổng khách hàng', filtered)} /></Col>
        <Col xs={24} sm={12} xl={6}><ExecutiveMetric title="Tổng tiền gửi" value={compactMoney(current.deposits)} note="Số dư cuối kỳ" change={percent(current.deposits, previous.deposits)} yearChange={percent(current.deposits, current.deposits * yearFactor)} icon={<WalletOutlined />} tone="green" formula="Tổng tiền gửi không kỳ hạn và có kỳ hạn của khách hàng" onClick={() => openDrill('Khách hàng có tiền gửi', filtered.filter((item) => periodValue(item, periodIndex).deposits > 0))} /></Col>
        <Col xs={24} sm={12} xl={6}><ExecutiveMetric title="Tổng dư nợ" value={compactMoney(current.loans)} note={`${current.badDebtCustomers} khách hàng có nợ xấu`} change={percent(current.loans, previous.loans)} yearChange={percent(current.loans, current.loans * (yearFactor + .02))} icon={<BankOutlined />} tone="red" formula="Tổng dư nợ ngắn hạn, trung dài hạn và thấu chi" onClick={() => openDrill('Khách hàng có dư nợ', filtered.filter((item) => periodValue(item, periodIndex).loans > 0))} /></Col>
        <Col xs={24} sm={12} xl={6}><ExecutiveMetric title="Doanh thu phí" value={compactMoney(current.fees)} note="Tổng phí trong kỳ" change={percent(current.fees, previous.fees)} yearChange={percent(current.fees, current.fees * .88)} icon={<DollarOutlined />} tone="gold" formula="Tổng phí chuyển tiền, thẻ, POS, KDNH và các phí dịch vụ khác" onClick={() => openDrill('Khách hàng phát sinh phí', filtered.filter((item) => periodValue(item, periodIndex).fees > 0))} /></Col>
      </Row>

      <Row gutter={[14, 14]} className="demo-section">
        <Col xs={24} sm={12} xl={6}><Card className="demo-exec-small"><Text type="secondary">Khách hàng mới</Text><strong>{newCustomers.length}</strong><Button type="link" onClick={() => openDrill('Khách hàng mới trong kỳ', newCustomers)}>Xem danh sách</Button></Card></Col>
        <Col xs={24} sm={12} xl={6}><Card className="demo-exec-small is-warning"><Text type="secondary">Khách hàng rời bỏ</Text><strong>{lostCustomers.length}</strong><Button type="link" onClick={() => openDrill('Khách hàng rời bỏ', lostCustomers)}>Xem danh sách</Button></Card></Col>
        <Col xs={24} sm={12} xl={6}><Card className="demo-exec-small is-danger"><Text type="secondary">Tỷ lệ nợ xấu <Tooltip title="Dư nợ xấu / Tổng dư nợ"><InfoCircleOutlined /></Tooltip></Text><strong>{badDebtRate.toFixed(2)}%</strong><ChangeTag value={badDebtRate - previousBadDebtRate} /></Card></Col>
        <Col xs={24} sm={12} xl={6}><Card className="demo-exec-small is-quality"><Text type="secondary">Chất lượng dữ liệu</Text><strong>{qualityScore}%</strong><Button type="link" onClick={() => openDrill('Hồ sơ có vấn đề dữ liệu', sourceIssues)}>Xem {sourceIssues.length} hồ sơ</Button></Card></Col>
      </Row>

      <Row gutter={[16, 16]} className="demo-section">
        <Col xs={24} xl={15}>
          <Card title="Xếp hạng chi nhánh" className="demo-panel" extra={<Tooltip title="Xếp theo tổng tiền gửi + dư nợ + doanh thu phí"><InfoCircleOutlined /></Tooltip>}>
            <Table size="small" rowKey="key" pagination={false} dataSource={branchRows} columns={branchColumns} scroll={{ x: 920 }} />
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card title="Độ phủ sản phẩm" className="demo-panel" extra={<Tooltip title="Số khách hàng đang sử dụng / tổng khách hàng theo bộ lọc"><InfoCircleOutlined /></Tooltip>}>
            <div className="demo-exec-products">
              {productRows.map((item) => {
                const coverage = filtered.length ? Math.round(item.customers.length / filtered.length * 100) : 0;
                return <button type="button" key={item.name} onClick={() => openDrill(`Khách hàng dùng ${item.name}`, item.customers)}><span><Text>{item.name}</Text><strong>{item.customers.length.toLocaleString('vi-VN')}</strong></span><Progress percent={coverage} size="small" strokeColor="#8f1438" /></button>;
              })}
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="demo-section">
        <Col xs={24} xl={12}>
          <Card title="Top cán bộ theo doanh thu phí" className="demo-panel" extra={<Tooltip title="Xếp theo tổng doanh thu phí của khách hàng được phân công"><InfoCircleOutlined /></Tooltip>}>
            <div className="demo-exec-ranking">
              {officerRows.slice(0, 6).map((row, index) => <button type="button" key={row.key} onClick={() => openDrill(`Khách hàng của ${row.name}`, row.customers)}><Badge count={index + 1} color={index < 3 ? '#8f1438' : '#8b7d76'} /><span><Text strong>{row.name}</Text><Text type="secondary">{row.customers.length} khách hàng</Text></span><strong>{compactMoney(row.fees)}</strong></button>)}
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="Chi nhánh có chỉ tiêu suy giảm" className="demo-panel" extra={<Tooltip title="So sánh tổng tiền gửi với kỳ liền trước"><InfoCircleOutlined /></Tooltip>}>
            {decliningBranches.length ? <div className="demo-exec-ranking is-decline">
              {decliningBranches.slice(0, 6).map((row) => <button type="button" key={row.key} onClick={() => openDrill(`Khách hàng tại ${row.name}`, row.customers)}><AlertOutlined /><span><Text strong>{row.name}</Text><Text type="secondary">Tiền gửi {compactMoney(row.deposits)}</Text></span><ChangeTag value={row.growth} /></button>)}
            </div> : <div className="demo-exec-empty">Không có chi nhánh suy giảm trong kỳ</div>}
          </Card>
        </Col>
      </Row>

      <Card title="Khách hàng lớn có biến động bất thường" className="demo-panel demo-section" extra={<Tooltip title="Tiền gửi từ 2 tỷ đồng và biến động từ 5% so với kỳ trước"><InfoCircleOutlined /></Tooltip>}>
        <Table size="small" rowKey="id" pagination={false} dataSource={abnormalCustomers} onRow={(row) => ({ onClick: () => onCustomerOpen(row.id) })} rowClassName="demo-clickable-row" columns={[
          { title: 'Khách hàng', dataIndex: 'customerName', render: (value, row) => <div><Text strong>{value}</Text><br /><Text type="secondary">{row.customerCode} · {row.segment}</Text></div> },
          { title: 'Chi nhánh', dataIndex: 'branchName' },
          { title: 'Cán bộ', dataIndex: 'officer' },
          { title: 'Tiền gửi', dataIndex: 'currentDeposits', align: 'right', render: compactMoney },
          { title: 'Biến động', dataIndex: 'depositChange', align: 'right', render: (value) => <ChangeTag value={value} /> },
          { title: 'Đánh giá', render: (_, row) => <Tag color={row.depositChange < 0 ? 'error' : 'success'}>{row.depositChange < 0 ? 'Cần làm rõ' : 'Tăng mạnh'}</Tag> },
        ]} />
      </Card>

      <Card className="demo-exec-data-status demo-section">
        <div><DatabaseOutlined /><span><Text strong>Trạng thái dữ liệu</Text><Text type="secondary">6 nguồn · Cập nhật {demoMeta.generatedAt} · {sourceIssues.length} hồ sơ cần đối chiếu</Text></span></div>
        <Space><Tag color={qualityScore >= 85 ? 'success' : 'warning'}>{qualityScore}% đạt yêu cầu</Tag><Tooltip title="Điểm chất lượng = tỷ lệ hồ sơ không có nguồn thiếu hoặc cảnh báo"><InfoCircleOutlined /></Tooltip></Space>
      </Card>

      <Modal open={Boolean(drill)} onCancel={() => setDrill(null)} width={1050} title={drill?.title} footer={<Button onClick={() => setDrill(null)}>Đóng</Button>}>
        <Table size="small" rowKey="id" dataSource={drill?.customers || []} pagination={{ pageSize: 8 }} onRow={(row) => ({ onClick: () => onCustomerOpen(row.id) })} rowClassName="demo-clickable-row" columns={[
          { title: 'Khách hàng', dataIndex: 'customerName', render: (value, row) => <div><Text strong>{value}</Text><br /><Text type="secondary">{row.customerCode}</Text></div> },
          { title: 'Loại KH', dataIndex: 'customerType', render: (value) => <Tag>{value}</Tag> },
          { title: 'Chi nhánh', dataIndex: 'branchName' },
          { title: 'Cán bộ', dataIndex: 'officer' },
          { title: 'Tiền gửi', align: 'right', render: (_, row) => compactMoney(periodValue(row, periodIndex).deposits) },
          { title: 'Dư nợ', align: 'right', render: (_, row) => compactMoney(periodValue(row, periodIndex).loans) },
        ]} />
      </Modal>

      <Modal open={saveOpen} onCancel={() => setSaveOpen(false)} onOk={saveTemplate} okText="Lưu mẫu" cancelText="Hủy" title="Lưu mẫu báo cáo">
        <Text type="secondary">Mẫu sẽ lưu kỳ, chi nhánh và loại khách hàng đang chọn trên trình duyệt này.</Text>
        <Input autoFocus value={templateName} onChange={(event) => setTemplateName(event.target.value)} onPressEnter={saveTemplate} placeholder="Ví dụ: Báo cáo giao ban tháng" style={{ marginTop: 16 }} />
      </Modal>
    </div>
  );
}
