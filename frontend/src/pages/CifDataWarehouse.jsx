import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Progress,
  Row,
  Space,
  Statistic,
  Steps,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import {
  ApartmentOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  InboxOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import client from '../api/client';

const { Dragger } = Upload;
const { Paragraph, Text, Title } = Typography;

function fileSize(value) {
  const bytes = Number(value || 0);
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function EmptyState({ icon, title, description }) {
  return (
    <div className="cif-empty-state">
      <div className="cif-empty-state__icon">{icon}</div>
      <Title level={4}>{title}</Title>
      <Paragraph type="secondary">{description}</Paragraph>
    </div>
  );
}

function OverviewTab() {
  const [data, setData] = useState({ quality: {}, branches: [] });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    client.get('/cif/overview')
      .then(({ data: response }) => { if (active) setData(response || { quality: {}, branches: [] }); })
      .catch((error) => message.error(error.response?.data?.detail || error.message))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const qualityRows = [
    ['Mã CIF hợp lệ', data.quality?.valid_cif_percent],
    ['Có giấy tờ định danh', data.quality?.identity_percent],
    ['Có số điện thoại', data.quality?.telephone_percent],
    ['Khách hàng hoạt động', data.quality?.active_percent],
  ];
  return (
    <Space orientation="vertical" size={18} style={{ width: '100%' }}>
      <Row gutter={[14, 14]}>
        <Col xs={24} sm={12} xl={6}><Card className="cif-metric cif-metric--blue"><Statistic loading={loading} title="Khách hàng duy nhất" value={data.total_customers || 0} prefix={<TeamOutlined />} /><Text type="secondary">Theo mã khách hàng lõi</Text></Card></Col>
        <Col xs={24} sm={12} xl={6}><Card className="cif-metric cif-metric--green"><Statistic loading={loading} title="Mã CIF đầy đủ" value={data.total_identifiers || 0} prefix={<DatabaseOutlined />} /><Text type="secondary">Tất cả mã tại các chi nhánh</Text></Card></Col>
        <Col xs={24} sm={12} xl={6}><Card className="cif-metric cif-metric--purple"><Statistic loading={loading} title="Khách hàng đa chi nhánh" value={data.multi_branch_customers || 0} prefix={<ApartmentOutlined />} /><Text type="secondary">Một khách hàng có nhiều mã CIF</Text></Card></Col>
        <Col xs={24} sm={12} xl={6}><Card className="cif-metric cif-metric--red"><Statistic loading={loading} title="Cần đối chiếu" value={data.pending_conflicts || 0} prefix={<WarningOutlined />} /><Text type="secondary">Giấy tờ trùng hoặc xung đột</Text></Card></Col>
      </Row>
      <Row gutter={[14, 14]}>
        <Col xs={24} xl={15}>
          <Card title="Phân bố khách hàng theo chi nhánh" className="cif-panel">
            <Table
              loading={loading}
              rowKey="branch_code"
              dataSource={data.branches || []}
              pagination={false}
              columns={[
                { title: 'Chi nhánh', dataIndex: 'branch_code', render: (value) => <Tag color="blue">{value}</Tag> },
                { title: 'Khách hàng', dataIndex: 'customer_count', align: 'right', render: (value) => Number(value || 0).toLocaleString('vi-VN') },
                { title: 'Mã CIF', dataIndex: 'identifier_count', align: 'right', render: (value) => Number(value || 0).toLocaleString('vi-VN') },
              ]}
              locale={{ emptyText: <Empty description="Chưa có dữ liệu chi nhánh" /> }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card title="Chất lượng định danh" className="cif-panel">
            <Space orientation="vertical" size={16} style={{ width: '100%' }}>
              {qualityRows.map(([label, value]) => (
                <div key={label}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}><Text>{label}</Text><Text type="secondary">{Number(value || 0).toLocaleString('vi-VN')}%</Text></Space>
                  <Progress percent={Number(value || 0)} showInfo={false} strokeColor="#218653" />
                </div>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}

function ImportTab() {
  const [fileList, setFileList] = useState([]);
  const [uploading, setUploading] = useState(false);
  const selected = fileList[0];
  async function uploadFile() {
    if (!selected) return;
    const formData = new FormData();
    formData.append('file', selected.originFileObj || selected);
    setUploading(true);
    try {
      await client.post('/cif/imports', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setFileList([]);
      message.success('Đã tiếp nhận file CIF; hệ thống đang xử lý nền.');
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <Row gutter={[18, 18]}>
      <Col xs={24} xl={15}>
        <Card title="Import dữ liệu CIF" className="cif-panel">
          <Alert
            showIcon
            type="info"
            message="Importer CIF đã sẵn sàng"
            description="Hệ thống kiểm tra 58 cột, mã CIF 13 chữ số, chi nhánh trong mã, ngày bất thường và checksum trước khi cập nhật kho master."
            style={{ marginBottom: 16 }}
          />
          <Dragger
            accept=".xls"
            maxCount={1}
            beforeUpload={() => false}
            fileList={fileList}
            onChange={({ fileList: next }) => setFileList(next.slice(-1))}
            onRemove={() => setFileList([])}
            className="cif-upload"
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Kéo thả hoặc chọn file CIF</p>
            <p className="ant-upload-hint">Hỗ trợ XLS. File được lưu nguyên bản và xử lý nền theo từng lô.</p>
          </Dragger>
          {selected ? (
            <div className="cif-selected-file">
              <FileSearchOutlined />
              <div><Text strong>{selected.name}</Text><Text type="secondary">{fileSize(selected.size)} · Sẵn sàng gửi tiền kiểm</Text></div>
              <Tag color="processing">Chờ import</Tag>
            </div>
          ) : null}
          <Space style={{ marginTop: 16 }}>
            <Button
              type="primary"
              icon={<CloudUploadOutlined />}
              disabled={!selected}
              loading={uploading}
              onClick={uploadFile}
            >
              Tiền kiểm và import
            </Button>
          </Space>
        </Card>
      </Col>
      <Col xs={24} xl={9}>
        <Card title="Quy trình xử lý" className="cif-panel">
          <Steps
            direction="vertical"
            current={0}
            items={[
              { title: 'Tiếp nhận file', description: 'Kiểm tra định dạng, checksum và phiên bản.' },
              { title: 'Tiền kiểm cấu trúc', description: 'Kiểm tra cột, kiểu dữ liệu và mã chi nhánh.' },
              { title: 'Chuẩn hóa mã CIF', description: 'Tách chi nhánh và mã khách hàng lõi.' },
              { title: 'Phát hiện xung đột', description: 'So sánh CCCD, MST và thông tin định danh.' },
              { title: 'Cập nhật kho CIF', description: 'Ghi phiên bản mới và lưu toàn bộ lịch sử.' },
            ]}
          />
        </Card>
      </Col>
    </Row>
  );
}

function CustomerListTab() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      client.get('/cif/customers', { params: { page, page_size: 20, keyword: keyword || undefined } })
        .then(({ data }) => {
          if (!active) return;
          setRows(data?.items || []);
          setTotal(Number(data?.total || 0));
        })
        .catch((error) => message.error(error.response?.data?.detail || error.message))
        .finally(() => { if (active) setLoading(false); });
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [keyword, page]);
  async function openDetail(row) {
    try {
      const { data } = await client.get(`/cif/customers/${row.id}`);
      setDetail(data);
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    }
  }
  return (
    <>
      <Card
        className="cif-panel"
        title="Danh sách khách hàng CIF"
        extra={<Input.Search allowClear placeholder="Tìm mã lõi, tên, CCCD/MST..." value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} style={{ width: 300 }} />}
      >
        <Table
          loading={loading}
          rowKey="id"
          dataSource={rows}
          onRow={(row) => ({ onClick: () => openDetail(row) })}
          rowClassName="demo-clickable-row"
          pagination={{ current: page, pageSize: 20, total, showSizeChanger: false, onChange: setPage, showTotal: (value) => `${Number(value).toLocaleString('vi-VN')} khách hàng` }}
          sticky
          scroll={{ x: 1250, y: 420 }}
          columns={[
            { title: 'Mã KH lõi', dataIndex: 'customer_core_code', width: 150, fixed: 'left', render: (value) => <Text code>{value}</Text> },
            { title: 'Khách hàng', dataIndex: 'customer_name', width: 240, ellipsis: true, render: (value, row) => <div><Text strong>{value || 'Chưa có tên'}</Text><br /><Text type="secondary">{row.customer_type || 'Chưa phân loại'}</Text></div> },
            { title: 'Giấy tờ', dataIndex: 'registration_number', width: 150, render: (value, row) => value || row.tax_number || '—' },
            { title: 'Điện thoại', dataIndex: 'telephone', width: 145, render: (value) => value || '—' },
            { title: 'Mã chi nhánh', dataIndex: 'branch_codes', width: 135, render: (values) => <Space size={[4, 4]} wrap>{(values || []).map((value) => <Tag color="blue" key={value}>{value}</Tag>)}</Space> },
            { title: 'Mã CIF đầy đủ', dataIndex: 'full_cif_codes', width: 190, render: (values) => <Space orientation="vertical" size={2}>{(values || []).map((value) => <Text code key={value}>{value}</Text>)}</Space> },
            { title: 'Trạng thái', dataIndex: 'status', width: 125, render: (value) => <Tag color={value === 'active' ? 'success' : value === 'invalid' ? 'error' : 'warning'}>{value}</Tag> },
          ]}
          locale={{ emptyText: <Empty description="Chưa có dữ liệu CIF" /> }}
        />
      </Card>
      <Drawer title={`Khách hàng CIF ${detail?.customer_core_code || ''}`} open={Boolean(detail)} width={720} onClose={() => setDetail(null)}>
        {detail ? (
          <Space orientation="vertical" size={18} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={2} items={[
              { key: 'name', label: 'Tên khách hàng', children: detail.customer_name || '—', span: 2 },
              { key: 'type', label: 'Loại KH', children: detail.customer_type || '—' },
              { key: 'status', label: 'Trạng thái', children: detail.status },
              { key: 'regno', label: 'Giấy tờ', children: detail.registration_number || '—' },
              { key: 'tax', label: 'MST', children: detail.tax_number || '—' },
              { key: 'phone', label: 'Điện thoại', children: detail.telephone || '—' },
              { key: 'nationality', label: 'Quốc tịch', children: detail.nationality_code || '—' },
              { key: 'address', label: 'Địa chỉ', children: detail.full_address || '—', span: 2 },
            ]} />
            <Table size="small" rowKey="id" pagination={false} dataSource={detail.identifiers || []} columns={[
              { title: 'Mã CIF đầy đủ', dataIndex: 'full_cif_code', render: (value) => <Text code>{value}</Text> },
              { title: 'Chi nhánh', dataIndex: 'branch_code', render: (value) => <Tag color="blue">{value}</Tag> },
              { title: 'Trạng thái nguồn', dataIndex: 'source_status' },
            ]} />
          </Space>
        ) : null}
      </Drawer>
    </>
  );
}

function ReconciliationTab() {
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    client.get('/cif/conflicts')
      .then(({ data: response }) => { if (active) setData(response || { items: [], total: 0 }); })
      .catch((error) => message.error(error.response?.data?.detail || error.message))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return (
    <Row gutter={[14, 14]}>
      <Col xs={24} md={8}><Card className="cif-status-card"><WarningOutlined /><strong>Mã không hợp lệ</strong><span>Được theo dõi trong lịch sử import</span></Card></Col>
      <Col xs={24} md={8}><Card className="cif-status-card"><SafetyCertificateOutlined /><strong>Nghi trùng khách hàng</strong><span>{data.total || 0} trường hợp chờ xử lý</span></Card></Col>
      <Col xs={24} md={8}><Card className="cif-status-card"><AuditOutlined /><strong>Xung đột định danh</strong><span>Đối chiếu giấy tờ trên nhiều mã lõi</span></Card></Col>
      <Col span={24}>
        <Card title="Danh sách cần đối chiếu" className="cif-panel">
          <Table
            loading={loading}
            rowKey="id"
            dataSource={data.items || []}
            pagination={false}
            columns={[
              { title: 'Loại xung đột', dataIndex: 'conflict_type', width: 210, render: () => <Tag color="error">Trùng giấy tờ</Tag> },
              { title: 'Giá trị định danh', dataIndex: 'identity_value', width: 180, render: (value) => <Text code>{value}</Text> },
              { title: 'Mã CIF liên quan', dataIndex: 'full_cif_codes', render: (values) => <Space wrap>{(values || []).map((value) => <Tag key={value}>{value}</Tag>)}</Space> },
              { title: 'Trạng thái', dataIndex: 'status', width: 120, render: (value) => <Tag color="warning">{value}</Tag> },
            ]}
            locale={{
              emptyText: <EmptyState icon={<CheckCircleOutlined />} title="Không có xung đột" description="Chưa phát hiện giấy tờ định danh gắn với nhiều khách hàng." />,
            }}
          />
        </Card>
      </Col>
    </Row>
  );
}

function HistoryTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data } = await client.get('/cif/imports');
        if (active) setRows(data || []);
      } catch (error) {
        message.error(error.response?.data?.detail || error.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    const timer = window.setInterval(load, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  return (
    <Card title="Lịch sử cập nhật kho CIF" className="cif-panel">
      <Table
        loading={loading}
        rowKey="id"
        dataSource={rows}
        pagination={false}
        scroll={{ x: 1150 }}
        columns={[
          { title: 'File CIF', dataIndex: 'original_filename', width: 220, fixed: 'left' },
          { title: 'Chi nhánh', dataIndex: 'branch_code', width: 100, render: (value) => value ? <Tag color="blue">{value}</Tag> : '—' },
          { title: 'Tổng dòng', dataIndex: 'total_rows', width: 120 },
          { title: 'Chấp nhận', dataIndex: 'accepted_rows', width: 110 },
          { title: 'KH mới', dataIndex: 'new_customers', width: 100 },
          { title: 'Mã CIF mới', dataIndex: 'new_identifiers', width: 110 },
          { title: 'Cảnh báo', dataIndex: 'warning_rows', width: 100 },
          { title: 'Xung đột', dataIndex: 'conflict_count', width: 100 },
          { title: 'Tiến độ', dataIndex: 'progress_percent', width: 160, render: (value, row) => <Progress percent={Number(value || 0)} size="small" status={row.status === 'error' ? 'exception' : row.status === 'success' ? 'success' : 'active'} /> },
          { title: 'Trạng thái', dataIndex: 'status', width: 130, render: (value) => <Tag color={value === 'success' ? 'success' : value === 'error' ? 'error' : 'processing'}>{value}</Tag> },
        ]}
        locale={{ emptyText: <Empty description="Chưa có lần import CIF nào" /> }}
      />
    </Card>
  );
}

export default function CifDataWarehouse() {
  const items = [
    { key: 'overview', label: 'Tổng quan', children: <OverviewTab /> },
    { key: 'import', label: 'Import CIF', children: <ImportTab /> },
    { key: 'customers', label: 'Danh sách khách hàng', children: <CustomerListTab /> },
    { key: 'reconciliation', label: 'Đối chiếu & xung đột', children: <ReconciliationTab /> },
    { key: 'history', label: 'Lịch sử cập nhật', children: <HistoryTab /> },
  ];
  return (
    <Space orientation="vertical" size={18} className="page-stack cif-page">
      <div className="cif-page-heading">
        <div>
          <Title level={2}>Kho dữ liệu CIF khách hàng</Title>
          <Paragraph type="secondary">
            Quản lý nguồn khách hàng gốc, mã CIF tại nhiều chi nhánh, chất lượng định danh và toàn bộ lịch sử cập nhật.
          </Paragraph>
        </div>
      </div>
      <Tabs className="cif-tabs" items={items} destroyOnHidden />
    </Space>
  );
}
