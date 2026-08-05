import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Drawer,
  Divider,
  Empty,
  Input,
  Progress,
  Row,
  Space,
  Statistic,
  Steps,
  Select,
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

const fieldLabels = {
  customer_name: 'Tên khách hàng', customer_name_ascii: 'Tên không dấu', short_name: 'Tên viết tắt',
  customer_type: 'Loại khách hàng', customer_detail_type: 'Loại chi tiết', registration_number: 'CCCD/ĐKKD',
  passport_number: 'Hộ chiếu', driver_license_number: 'Giấy phép lái xe', tax_number: 'Mã số thuế',
  telephone: 'Điện thoại', address_type: 'Loại địa chỉ', full_address: 'Địa chỉ', province: 'Tỉnh/thành',
  district: 'Quận/huyện', commune_ward: 'Xã/phường', nationality_code: 'Quốc tịch', birth_date: 'Ngày sinh',
  gender_code: 'Giới tính', establishment_date: 'Ngày thành lập', occupation: 'Nghề nghiệp',
  source_status: 'Trạng thái nguồn', normalized_status: 'Trạng thái chuẩn', operator_user: 'Người nhập nguồn',
};

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

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
    ['Có địa chỉ', data.quality?.address_percent],
    ['Có ngày sinh', data.quality?.birth_percent],
    ['Khách hàng hoạt động', data.quality?.active_percent],
  ];
  return (
    <Space orientation="vertical" size={18} style={{ width: '100%' }}>
      <Row gutter={[14, 14]}>
        <Col xs={24} sm={12} xl={6}><Card className="cif-metric cif-metric--blue"><Statistic loading={loading} title="Khách hàng duy nhất" value={data.total_customers || 0} prefix={<TeamOutlined />} /><Text type="secondary">Theo mã khách hàng lõi</Text></Card></Col>
        <Col xs={24} sm={12} xl={6}><Card className="cif-metric cif-metric--green"><Statistic loading={loading} title="Mã CIF đầy đủ" value={data.total_identifiers || 0} prefix={<DatabaseOutlined />} /><Text type="secondary">Tất cả mã tại các chi nhánh</Text></Card></Col>
        <Col xs={24} sm={12} xl={6}><Card className="cif-metric cif-metric--purple"><Statistic loading={loading} title="Khách hàng đa chi nhánh" value={data.multi_branch_customers || 0} prefix={<ApartmentOutlined />} /><Text type="secondary">Một khách hàng có nhiều mã CIF</Text></Card></Col>
        <Col xs={24} sm={12} xl={6}><Card className="cif-metric cif-metric--red"><Statistic loading={loading} title="Cần đối chiếu" value={data.pending_conflicts || 0} prefix={<WarningOutlined />} /><Text type="secondary">Giấy tờ trùng hoặc xung đột</Text></Card></Col>
        <Col xs={24} sm={12} xl={6}><Card className="cif-metric cif-metric--orange"><Statistic loading={loading} title="Bản ghi mới chờ duyệt" value={data.pending_changes || 0} prefix={<AuditOutlined />} /><Text type="secondary">Không tự ghi đè kho CIF chuẩn</Text></Card></Col>
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
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [queueRefresh, setQueueRefresh] = useState(0);
  const [jobDetail, setJobDetail] = useState(null);
  const totalSelectedSize = fileList.reduce((sum, item) => sum + Number(item.size || item.originFileObj?.size || 0), 0);
  useEffect(() => {
    let active = true;
    let timer;
    async function loadJobs() {
      try {
        const { data } = await client.get('/cif/imports', { params: { limit: 20 } });
        if (!active) return;
        const next = data || [];
        setJobs(next);
        setJobDetail((current) => current ? (next.find((item) => item.id === current.id) || current) : null);
        const hasRunning = next.some((item) => ['queued', 'processing'].includes(item.status));
        if (hasRunning) timer = window.setTimeout(loadJobs, 2000);
      } catch (error) {
        if (active) message.error(error.response?.data?.detail || error.message);
      } finally {
        if (active) setJobsLoading(false);
      }
    }
    loadJobs();
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [queueRefresh]);
  async function uploadFiles() {
    if (!fileList.length) return;
    const formData = new FormData();
    fileList.forEach((item) => formData.append('files', item.originFileObj || item));
    setUploading(true);
    try {
      const { data } = await client.post('/cif/imports/bulk', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setFileList([]);
      setQueueRefresh((value) => value + 1);
      message.success(data?.message || `Đã tiếp nhận ${fileList.length} file CIF.`);
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setUploading(false);
    }
  }
  async function recoverJob(row) {
    try {
      await client.post(`/cif/imports/${row.id}/recover`);
      message.success(`Đã đưa job ${row.original_filename} vào hàng đợi khôi phục.`);
      setQueueRefresh((value) => value + 1);
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    }
  }
  return (
    <Row gutter={[18, 18]}>
      <Col span={24}>
        <Card title="Import dữ liệu CIF" className="cif-panel">
          <Alert
            showIcon
            type="info"
            message="Importer CIF đã sẵn sàng"
            description="Hỗ trợ CSV, XLS và XLSX cùng cấu trúc CIF chuẩn. Hệ thống kiểm tra mã CIF 13 chữ số, ngày, checksum và tự bỏ qua các CUSTNO xuất hiện sau lần đầu."
            style={{ marginBottom: 16 }}
          />
          <Dragger
            accept=".csv,.xls,.xlsx"
            multiple
            maxCount={20}
            beforeUpload={() => false}
            fileList={fileList}
            onChange={({ fileList: next }) => {
              const unique = [];
              const seen = new Set();
              next.forEach((item) => {
                const key = `${item.name}:${item.size || item.originFileObj?.size || 0}`;
                if (!seen.has(key)) { seen.add(key); unique.push(item); }
              });
              setFileList(unique.slice(0, 20));
            }}
            onRemove={(file) => setFileList((current) => current.filter((item) => item.uid !== file.uid))}
            className="cif-upload"
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Kéo thả hoặc chọn nhiều file CIF</p>
            <p className="ant-upload-hint">Tối đa 20 file CSV, XLS hoặc XLSX mỗi lần. Có thể thêm và xóa từng file trước khi import.</p>
          </Dragger>
          {fileList.length ? (
            <div className="cif-selected-file">
              <FileSearchOutlined />
              <div><Text strong>{fileList.length} file đã chọn</Text><Text type="secondary">Tổng dung lượng {fileSize(totalSelectedSize)} · Xử lý tuần tự theo từng file</Text></div>
              <Space><Tag color="processing">Chờ import</Tag><Button type="link" danger onClick={() => setFileList([])}>Xóa tất cả</Button></Space>
            </div>
          ) : null}
          <Space style={{ marginTop: 16 }}>
            <Button
              type="primary"
              icon={<CloudUploadOutlined />}
              disabled={!fileList.length}
              loading={uploading}
              onClick={uploadFiles}
            >
              Tiền kiểm và import {fileList.length || ''} file
            </Button>
          </Space>
          <Divider />
          <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text strong>Trạng thái xử lý gần đây</Text>
            <Button size="small" onClick={() => { setJobsLoading(true); setQueueRefresh((value) => value + 1); }}>Làm mới</Button>
          </Space>
          <Table
            size="small"
            loading={jobsLoading}
            rowKey="id"
            dataSource={jobs.slice(0, 10)}
            pagination={false}
            scroll={{ x: 760 }}
            columns={[
              { title: 'File', dataIndex: 'original_filename', width: 210, ellipsis: true },
              { title: 'Trạng thái', dataIndex: 'status', width: 135, render: (value, row) => row.is_stuck ? <Tag color="error">Job bị kẹt</Tag> : <Tag color={value === 'success' ? 'success' : value === 'error' ? 'error' : value === 'queued' ? 'default' : 'processing'}>{value === 'queued' ? 'Đang chờ' : value === 'processing' ? 'Đang chạy' : value === 'success' ? 'Hoàn thành' : 'Lỗi'}</Tag> },
              { title: 'Bước hiện tại', dataIndex: 'stage', width: 230, render: (value) => value || '—' },
              { title: 'Tiến độ', dataIndex: 'progress_percent', width: 150, render: (value, row) => <Progress percent={Number(value || 0)} size="small" status={row.status === 'error' ? 'exception' : row.status === 'success' ? 'success' : 'active'} /> },
              { title: 'Dòng', dataIndex: 'processed_rows', width: 90, align: 'right', render: (value, row) => `${Number(value || 0).toLocaleString('vi-VN')}/${Number(row.total_rows || 0).toLocaleString('vi-VN')}` },
              { title: 'Lỗi', dataIndex: 'error_message', width: 220, ellipsis: true, render: (value) => value ? <Text type="danger">{value}</Text> : '—' },
              { title: 'Lần chạy', dataIndex: 'attempt_count', width: 80, align: 'center', render: (value) => value || 1 },
              { title: '', width: 175, fixed: 'right', render: (_, row) => <Space><Button size="small" onClick={() => setJobDetail(row)}>Chi tiết</Button>{row.is_stuck || row.status === 'error' ? <Button size="small" danger onClick={() => recoverJob(row)}>Khôi phục</Button> : null}</Space> },
            ]}
          />
        </Card>
      </Col>
      <Drawer title={`Quy trình import ${jobDetail?.original_filename || ''}`} width={720} open={Boolean(jobDetail)} onClose={() => setJobDetail(null)} extra={jobDetail?.is_stuck || jobDetail?.status === 'error' ? <Button danger onClick={() => recoverJob(jobDetail)}>Khôi phục job</Button> : null}>
        {jobDetail ? <Space orientation="vertical" size={18} style={{ width: '100%' }}>
          <Descriptions bordered size="small" column={2} items={[
            { key: 'status', label: 'Trạng thái', children: <Tag color={jobDetail.status === 'success' ? 'success' : jobDetail.status === 'error' ? 'error' : 'processing'}>{jobDetail.status}</Tag> },
            { key: 'branch', label: 'Chi nhánh', children: jobDetail.branch_code || 'Đang xác định' },
            { key: 'rows', label: 'Số dòng', children: `${Number(jobDetail.processed_rows || 0).toLocaleString('vi-VN')}/${Number(jobDetail.total_rows || 0).toLocaleString('vi-VN')}` },
            { key: 'progress', label: 'Tiến độ', children: `${jobDetail.progress_percent || 0}%` },
            { key: 'heartbeat', label: 'Cập nhật gần nhất', children: jobDetail.heartbeat_at ? new Date(jobDetail.heartbeat_at).toLocaleString('vi-VN') : '—' },
            { key: 'attempt', label: 'Số lần chạy', children: jobDetail.attempt_count || 1 },
          ]} />
          <Progress percent={Number(jobDetail.progress_percent || 0)} status={jobDetail.status === 'error' ? 'exception' : jobDetail.status === 'success' ? 'success' : 'active'} />
          {jobDetail.error_message ? <Alert type="error" showIcon message="Import thất bại" description={jobDetail.error_message} /> : null}
          <Title level={5}>Chi tiết từng bước</Title>
          <Steps direction="vertical" size="small" current={Math.max(0, (jobDetail.stage_history || []).length - 1)} items={(jobDetail.stage_history || []).map((stage) => ({
            title: stage.label,
            status: stage.status === 'error' ? 'error' : stage.status === 'completed' ? 'finish' : 'process',
            description: <Space orientation="vertical" size={1}>
              <Text type="secondary">{stage.at ? new Date(stage.at).toLocaleString('vi-VN') : ''} · {stage.progress ?? 0}%</Text>
              {stage.details && Object.keys(stage.details).length ? <Text type="secondary">{Object.entries(stage.details).map(([key, value]) => `${key}: ${displayValue(value)}`).join(' · ')}</Text> : null}
              {stage.error ? <Text type="danger">{stage.error}</Text> : null}
            </Space>,
          }))} />
        </Space> : null}
      </Drawer>
    </Row>
  );
}

function CustomerListTab() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState();
  const [qualityIssue, setQualityIssue] = useState();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [identifierHistory, setIdentifierHistory] = useState(null);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      client.get('/cif/customers', { params: { page, page_size: 20, keyword: keyword || undefined, status, quality_issue: qualityIssue } })
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
  }, [keyword, page, status, qualityIssue]);
  async function openDetail(row) {
    try {
      const { data } = await client.get(`/cif/customers/${row.id}`);
      setDetail(data);
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    }
  }
  async function openIdentifierHistory(fullCifCode) {
    try {
      const { data } = await client.get(`/cif/identifiers/${fullCifCode}/history`);
      setIdentifierHistory({ fullCifCode, ...(data || {}) });
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    }
  }
  return (
    <>
      <Card
        className="cif-panel"
        title="Danh sách khách hàng CIF"
        extra={<Space wrap>
          <Select allowClear placeholder="Trạng thái" value={status} style={{ width: 135 }} onChange={(value) => { setStatus(value); setPage(1); }} options={[{ value: 'active', label: 'Hoạt động' }, { value: 'inactive', label: 'Không hoạt động' }, { value: 'invalid', label: 'Không hợp lệ' }]} />
          <Select allowClear placeholder="Lỗi chất lượng" value={qualityIssue} style={{ width: 190 }} onChange={(value) => { setQualityIssue(value); setPage(1); }} options={[
            { value: 'missing_identity', label: 'Thiếu giấy tờ' }, { value: 'missing_phone', label: 'Thiếu điện thoại' },
            { value: 'missing_address', label: 'Thiếu địa chỉ' }, { value: 'missing_birth_date', label: 'Thiếu ngày sinh' }, { value: 'inactive', label: 'Không hoạt động' },
          ]} />
          <Input.Search allowClear placeholder="Tìm mã lõi, tên, CCCD/MST..." value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} style={{ width: 300 }} />
        </Space>}
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
              { title: '', width: 90, render: (_, row) => <Button size="small" onClick={() => openIdentifierHistory(row.full_cif_code)}>Lịch sử</Button> },
            ]} />
          </Space>
        ) : null}
      </Drawer>
      <Drawer title={`Lịch sử CIF ${identifierHistory?.fullCifCode || ''}`} width={760} open={Boolean(identifierHistory)} onClose={() => setIdentifierHistory(null)}>
        {identifierHistory ? <Space orientation="vertical" size={18} style={{ width: '100%' }}>
          <Title level={5}>Các phiên bản nguồn</Title>
          <Table size="small" rowKey="id" pagination={false} dataSource={identifierHistory.sources || []} columns={[
            { title: 'Lô', dataIndex: 'import_batch_id', render: (value) => `#${value}` },
            { title: 'Dòng', dataIndex: 'source_row_number' },
            { title: 'So sánh', dataIndex: 'comparison_status', render: (value) => <Tag>{value || '—'}</Tag> },
            { title: 'Duyệt', dataIndex: 'review_status', render: (value) => <Tag color={value === 'applied' ? 'success' : value === 'rejected' ? 'error' : 'warning'}>{value || '—'}</Tag> },
            { title: 'Người duyệt', dataIndex: 'reviewed_by', render: (value) => value || '—' },
            { title: 'Thời gian', dataIndex: 'imported_at', render: (value) => value ? new Date(value).toLocaleString('vi-VN') : '—' },
          ]} />
          <Divider />
          <Title level={5}>Nhật ký cập nhật thủ công</Title>
          <Table size="small" rowKey="id" pagination={false} dataSource={identifierHistory.audits || []} columns={[
            { title: 'Hành động', dataIndex: 'action', render: (value) => <Tag color="blue">{value}</Tag> },
            { title: 'Người thực hiện', dataIndex: 'performed_by' },
            { title: 'Ghi chú', dataIndex: 'note', render: (value) => value || '—' },
            { title: 'Thời gian', dataIndex: 'performed_at', render: (value) => value ? new Date(value).toLocaleString('vi-VN') : '—' },
          ]} />
        </Space> : null}
      </Drawer>
    </>
  );
}

function ChangeReviewTab() {
  const [data, setData] = useState({ items: [], total: 0 });
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [fields, setFields] = useState([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data: response } = await client.get('/cif/changes', { params: { review_status: status, page, page_size: 20 } });
      setData(response || { items: [], total: 0 });
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [status, page]);

  function openReview(row) {
    setSelected(row);
    setFields(Object.keys(row.changed_fields || {}));
    setNote(row.review_note || '');
  }
  async function decide(action) {
    if (!selected) return;
    setSaving(true);
    try {
      await client.post(`/cif/changes/${selected.id}/${action}`, action === 'apply' ? { fields, note } : { note });
      message.success(action === 'apply' ? 'Đã cập nhật bản ghi chuẩn và lưu lịch sử.' : 'Đã từ chối bản thay đổi và lưu lịch sử.');
      setSelected(null);
      await load();
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setSaving(false);
    }
  }
  const changedKeys = Object.keys(selected?.changed_fields || {});
  return (
    <>
      <Card
        className="cif-panel"
        title="Bản ghi CIF thay đổi chờ xác nhận"
        extra={<Select value={status} style={{ width: 170 }} onChange={(value) => { setStatus(value); setPage(1); }} options={[
          { value: 'pending', label: 'Chờ xác nhận' }, { value: 'applied', label: 'Đã áp dụng' }, { value: 'rejected', label: 'Đã từ chối' },
        ]} />}
      >
        <Alert showIcon type="info" style={{ marginBottom: 14 }} message="Import không tự ghi đè CIF đã tồn tại" description="Mọi giá trị thay đổi được giữ thành một phiên bản nguồn. Người dùng chọn từng trường cần cập nhật; hệ thống lưu giá trị trước/sau, thời gian và tài khoản thực hiện." />
        <Table loading={loading} rowKey="id" dataSource={data.items || []} scroll={{ x: 1050 }} pagination={{ current: page, pageSize: 20, total: data.total || 0, showSizeChanger: false, onChange: setPage }} columns={[
          { title: 'Mã CIF', dataIndex: 'full_cif_code', width: 160, fixed: 'left', render: (value) => <Text code>{value}</Text> },
          { title: 'Chi nhánh', dataIndex: 'branch_code', width: 100, render: (value) => <Tag color="blue">{value}</Tag> },
          { title: 'Dòng nguồn', dataIndex: 'source_row_number', width: 105 },
          { title: 'Trường thay đổi', dataIndex: 'changed_fields', render: (value) => <Space size={[4, 4]} wrap>{Object.keys(value || {}).map((field) => <Tag color="gold" key={field}>{fieldLabels[field] || field}</Tag>)}</Space> },
          { title: 'Người xử lý', dataIndex: 'reviewed_by', width: 130, render: (value) => value || '—' },
          { title: 'Trạng thái', dataIndex: 'review_status', width: 125, render: (value) => <Tag color={value === 'applied' ? 'success' : value === 'rejected' ? 'error' : 'warning'}>{value}</Tag> },
          { title: '', width: 95, fixed: 'right', render: (_, row) => <Button size="small" onClick={() => openReview(row)}>Đối chiếu</Button> },
        ]} />
      </Card>
      <Drawer title={`Đối chiếu CIF ${selected?.full_cif_code || ''}`} width={860} open={Boolean(selected)} onClose={() => setSelected(null)} extra={selected?.review_status === 'pending' ? <Space><Button danger loading={saving} onClick={() => decide('reject')}>Từ chối</Button><Button type="primary" disabled={!fields.length} loading={saving} onClick={() => decide('apply')}>Áp dụng trường đã chọn</Button></Space> : null}>
        {selected ? <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions size="small" bordered column={2} items={[
            { key: 'branch', label: 'Chi nhánh', children: selected.branch_code }, { key: 'row', label: 'Dòng nguồn', children: selected.source_row_number },
            { key: 'batch', label: 'Lô import', children: `#${selected.import_batch_id}` }, { key: 'time', label: 'Thời điểm nhận', children: selected.imported_at ? new Date(selected.imported_at).toLocaleString('vi-VN') : '—' },
          ]} />
          <Checkbox.Group value={fields} onChange={setFields} style={{ width: '100%' }} disabled={selected.review_status !== 'pending'}>
            <Table size="small" pagination={false} rowKey="field" dataSource={changedKeys.map((field) => ({ field }))} columns={[
              { title: 'Chọn', width: 62, render: (_, row) => <Checkbox value={row.field} /> },
              { title: 'Trường', dataIndex: 'field', width: 180, render: (value) => <Text strong>{fieldLabels[value] || value}</Text> },
              { title: 'Trong kho hiện tại', dataIndex: 'field', render: (field) => <Text>{displayValue(selected.current_snapshot?.[field])}</Text> },
              { title: 'Từ file mới', dataIndex: 'field', render: (field) => <Text type="warning">{displayValue(selected.incoming?.[field])}</Text> },
            ]} />
          </Checkbox.Group>
          <Input.TextArea rows={3} value={note} disabled={selected.review_status !== 'pending'} onChange={(event) => setNote(event.target.value)} placeholder="Ghi lý do xác nhận hoặc từ chối..." />
        </Space> : null}
      </Drawer>
    </>
  );
}

function ReconciliationTab() {
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [resolution, setResolution] = useState('waiting_branch');
  const [note, setNote] = useState('');
  async function load() {
    setLoading(true);
    try { const { data: response } = await client.get('/cif/conflicts'); setData(response || { items: [], total: 0 }); }
    catch (error) { message.error(error.response?.data?.detail || error.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function resolveConflict() {
    try {
      await client.post(`/cif/conflicts/${selected.id}/resolve`, { resolution, note });
      message.success('Đã lưu kết quả xử lý xung đột.'); setSelected(null); await load();
    } catch (error) { message.error(error.response?.data?.detail || error.message); }
  }
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
              { title: '', width: 90, render: (_, row) => <Button size="small" onClick={() => { setSelected(row); setNote(''); }}>Xử lý</Button> },
            ]}
            locale={{
              emptyText: <EmptyState icon={<CheckCircleOutlined />} title="Không có xung đột" description="Chưa phát hiện giấy tờ định danh gắn với nhiều khách hàng." />,
            }}
          />
        </Card>
      </Col>
      <Drawer title="Xử lý xung đột định danh" width={620} open={Boolean(selected)} onClose={() => setSelected(null)} extra={<Button type="primary" onClick={resolveConflict}>Lưu kết quả</Button>}>
        {selected ? <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions bordered size="small" column={1} items={[
            { key: 'type', label: 'Loại', children: selected.conflict_type },
            { key: 'value', label: 'Giá trị định danh', children: selected.identity_value || '—' },
            { key: 'cifs', label: 'Các mã CIF', children: (selected.full_cif_codes || []).join(', ') || '—' },
          ]} />
          <Select value={resolution} onChange={setResolution} style={{ width: '100%' }} options={[
            { value: 'resolved_keep', label: 'Xác nhận giữ liên kết hiện tại' },
            { value: 'not_conflict', label: 'Xác nhận không phải xung đột' },
            { value: 'verified_separate', label: 'Đã xác minh là khách hàng riêng' },
            { value: 'waiting_branch', label: 'Chờ chi nhánh xác minh' },
          ]} />
          <Input.TextArea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Nêu căn cứ và kết quả đối chiếu..." />
        </Space> : null}
      </Drawer>
    </Row>
  );
}

function GoldenRulesTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    client.get('/cif/golden-rules').then(({ data }) => setRows(data || []))
      .catch((error) => message.error(error.response?.data?.detail || error.message)).finally(() => setLoading(false));
  }, []);
  return <Card className="cif-panel" title="Quy tắc tạo bản ghi CIF chuẩn">
    <Alert type="info" showIcon style={{ marginBottom: 14 }} message="Một mã CUSTNO chỉ có một bản ghi đang hiệu lực" description="File mới được lưu như phiên bản nguồn. Trường thay đổi chỉ đi vào kho chuẩn sau khi người có quyền đối chiếu và xác nhận." />
    <Table loading={loading} rowKey="id" dataSource={rows} pagination={false} scroll={{ x: 950 }} columns={[
      { title: 'Trường chuẩn', dataIndex: 'target_field', width: 170, render: (value) => <Text strong>{fieldLabels[value] || value}</Text> },
      { title: 'Cột nguồn', dataIndex: 'source_columns', width: 240, render: (values) => <Space size={[4, 4]} wrap>{(values || []).map((value) => <Tag key={value}>{value}</Tag>)}</Space> },
      { title: 'Chiến lược', dataIndex: 'strategy', width: 175, render: (value) => <Tag color="blue">{value}</Tag> },
      { title: 'Duyệt khi xung đột', dataIndex: 'requires_review_on_conflict', width: 160, render: (value) => value ? <Tag color="warning">Có</Tag> : <Tag color="success">Không</Tag> },
      { title: 'Diễn giải', dataIndex: 'description' },
    ]} />
  </Card>;
}

function HistoryTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [issues, setIssues] = useState([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  useEffect(() => {
    let active = true;
    let timer = null;
    async function load() {
      try {
        const { data } = await client.get('/cif/imports');
        if (!active) return;
        const nextRows = data || [];
        setRows(nextRows);
        if (nextRows.some((row) => ['queued', 'processing'].includes(row.status))) {
          timer = window.setTimeout(load, 3000);
        }
      } catch (error) {
        if (active) message.error(error.response?.data?.detail || error.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, []);
  async function openImportResult(row) {
    setSelectedBatch(row);
    setIssuesLoading(true);
    try {
      const { data } = await client.get(`/cif/imports/${row.id}/issues`);
      setIssues(data || []);
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setIssuesLoading(false);
    }
  }
  return (
    <>
      <Card title="Lịch sử cập nhật kho CIF" className="cif-panel">
        <Table
          loading={loading}
          rowKey="id"
          dataSource={rows}
          pagination={false}
          scroll={{ x: 1650 }}
          columns={[
            { title: 'File CIF', dataIndex: 'original_filename', width: 220, fixed: 'left' },
            { title: 'Người import', dataIndex: 'uploaded_by', width: 120, render: (value) => value || '—' },
            { title: 'Phiên bản', dataIndex: 'importer_version', width: 100, render: (value) => value || '—' },
            { title: 'Chi nhánh', dataIndex: 'branch_code', width: 100, render: (value) => value ? <Tag color="blue">{value}</Tag> : '—' },
            { title: 'Tổng dòng', dataIndex: 'total_rows', width: 100 },
            { title: 'CIF mới', dataIndex: 'new_identifiers', width: 90 },
            { title: 'Cập nhật', dataIndex: 'updated_identifiers', width: 90, render: (value) => <Tag color={value ? 'processing' : 'default'}>{value || 0}</Tag> },
            { title: 'Không đổi', dataIndex: 'unchanged_identifiers', width: 100 },
            { title: 'Trùng file', dataIndex: 'duplicate_rows', width: 100, render: (value) => <Tag color={value ? 'error' : 'default'}>{value || 0}</Tag> },
            { title: 'Đa chi nhánh', dataIndex: 'multi_branch_identifiers', width: 115, render: (value) => <Tag color={value ? 'cyan' : 'default'}>{value || 0}</Tag> },
            { title: 'Cần đối chiếu', dataIndex: 'review_rows', width: 125, render: (value) => <Tag color={value ? 'warning' : 'default'}>{value || 0}</Tag> },
            { title: 'Bị loại', dataIndex: 'rejected_rows', width: 85 },
            { title: 'Tiến độ', dataIndex: 'progress_percent', width: 160, render: (value, row) => <Progress percent={Number(value || 0)} size="small" status={row.status === 'error' ? 'exception' : row.status === 'success' ? 'success' : 'active'} /> },
            { title: 'Trạng thái', dataIndex: 'status', width: 120, render: (value) => <Tag color={value === 'success' ? 'success' : value === 'error' ? 'error' : 'processing'}>{value}</Tag> },
            { title: '', key: 'action', width: 90, fixed: 'right', render: (_, row) => <Button size="small" onClick={() => openImportResult(row)}>Chi tiết</Button> },
          ]}
          locale={{ emptyText: <Empty description="Chưa có lần import CIF nào" /> }}
        />
      </Card>
      <Drawer
        title={`Kết quả import ${selectedBatch?.original_filename || ''}`}
        width={820}
        open={Boolean(selectedBatch)}
        onClose={() => { setSelectedBatch(null); setIssues([]); }}
      >
        {selectedBatch ? (
          <Space orientation="vertical" size={18} style={{ width: '100%' }}>
            <Row gutter={[10, 10]}>
              {[
                ['CIF mới', selectedBatch.new_identifiers, 'blue'],
                ['Cập nhật', selectedBatch.updated_identifiers, 'processing'],
                ['Không thay đổi', selectedBatch.unchanged_identifiers, 'default'],
                ['Trùng trong file', selectedBatch.duplicate_rows, 'error'],
                ['Đa chi nhánh', selectedBatch.multi_branch_identifiers, 'cyan'],
                ['Cần đối chiếu', selectedBatch.review_rows, 'warning'],
              ].map(([label, value, color]) => (
                <Col xs={12} md={8} key={label}>
                  <Card size="small"><Statistic title={label} value={value || 0} valueStyle={{ color: color === 'error' ? '#cf1322' : undefined }} /></Card>
                </Col>
              ))}
            </Row>
            <Alert
              showIcon
              type={selectedBatch.duplicate_rows || selectedBatch.review_rows ? 'warning' : 'success'}
              message={selectedBatch.duplicate_rows || selectedBatch.review_rows ? 'Có dữ liệu cần kiểm tra' : 'Không phát hiện mã khách hàng trùng hoặc xung đột'}
              description="Mã CIF xuất hiện sau lần đầu được tự động bỏ qua; mã khách hàng lõi ở các chi nhánh khác nhau vẫn được gộp thành một khách hàng."
            />
            <Descriptions bordered size="small" column={2} items={[
              { key: 'format', label: 'Định dạng thực', children: String(selectedBatch.actual_format || '—').toUpperCase() },
              { key: 'size', label: 'Dung lượng', children: fileSize(selectedBatch.file_size) },
              { key: 'user', label: 'Người import', children: selectedBatch.uploaded_by || '—' },
              { key: 'version', label: 'Phiên bản importer', children: selectedBatch.importer_version || '—' },
              { key: 'checksum', label: 'SHA-256', children: <Text code copyable>{selectedBatch.content_sha256 || '—'}</Text>, span: 2 },
            ]} />
            {selectedBatch.comparison_summary ? <Card size="small" title="So sánh với kho hiện tại">
              <Space size={[8, 8]} wrap>
                <Tag color="blue">Mới: {selectedBatch.comparison_summary.new || 0}</Tag>
                <Tag>Không đổi: {selectedBatch.comparison_summary.no_change || 0}</Tag>
                <Tag color="warning">Chờ duyệt: {selectedBatch.comparison_summary.pending_changes || 0}</Tag>
                <Tag color="error">Không còn trong file mới: {selectedBatch.comparison_summary.missing_from_latest || 0}</Tag>
              </Space>
            </Card> : null}
            {selectedBatch.column_stats?.columns ? <Card size="small" title={`Độ phủ ${selectedBatch.column_stats.total_columns || 0} cột`}>
              <Table size="small" rowKey="name" pagination={{ pageSize: 10 }} dataSource={Array.isArray(selectedBatch.column_stats.columns) ? selectedBatch.column_stats.columns : Object.entries(selectedBatch.column_stats.columns).map(([name, stats]) => ({ name, ...stats }))} columns={[
                { title: 'Cột', dataIndex: 'name', render: (value) => <Text code>{value}</Text> },
                { title: 'Có dữ liệu', dataIndex: 'nonblank', align: 'right' },
                { title: 'Trống', dataIndex: 'blank', align: 'right' },
                { title: 'Độ phủ', dataIndex: 'coverage_percent', render: (value) => <Progress percent={Number(value || 0)} size="small" /> },
                { title: 'Độ dài tối đa', dataIndex: 'max_length', align: 'right' },
              ]} />
            </Card> : null}
            <Table
              size="small"
              loading={issuesLoading}
              rowKey="id"
              dataSource={issues}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
              scroll={{ x: 720 }}
              columns={[
                { title: 'Dòng', dataIndex: 'source_row_number', width: 70 },
                { title: 'Mã CIF', dataIndex: 'full_cif_code', width: 150, render: (value) => value ? <Text code>{value}</Text> : '—' },
                { title: 'Mức độ', dataIndex: 'severity', width: 100, render: (value) => <Tag color={value === 'error' ? 'error' : 'warning'}>{value}</Tag> },
                { title: 'Loại', dataIndex: 'error_code', width: 160 },
                { title: 'Nội dung', dataIndex: 'message' },
              ]}
              locale={{ emptyText: <Empty description="Không có lỗi chi tiết" /> }}
            />
          </Space>
        ) : null}
      </Drawer>
    </>
  );
}

export default function CifDataWarehouse() {
  const items = [
    { key: 'overview', label: 'Tổng quan', children: <OverviewTab /> },
    { key: 'import', label: 'Import CIF', children: <ImportTab /> },
    { key: 'customers', label: 'Danh sách khách hàng', children: <CustomerListTab /> },
    { key: 'changes', label: 'Duyệt thay đổi', children: <ChangeReviewTab /> },
    { key: 'reconciliation', label: 'Đối chiếu & xung đột', children: <ReconciliationTab /> },
    { key: 'rules', label: 'Quy tắc bản ghi chuẩn', children: <GoldenRulesTab /> },
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
