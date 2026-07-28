import { useEffect, useMemo, useState } from 'react';
import {
  AlertOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  DatabaseOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Progress,
  Row,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';

import client from '../api/client';
import {
  determinationStatuses,
  fieldDictionary,
  fieldGroups,
} from '../demo/data/fieldDictionary';
import '../demo/demo.css';

const { Text, Title } = Typography;

const statusMeta = {
  ready: { color: 'success', label: 'Sẵn sàng' },
  partial: { color: 'warning', label: 'Chưa đầy đủ' },
  processing: { color: 'processing', label: 'Đang xử lý' },
  error: { color: 'error', label: 'Có lỗi' },
  missing: { color: 'error', label: 'Thiếu nguồn' },
  planned: { color: 'default', label: 'Dự kiến' },
};

function periodLabel(value) {
  if (!value || value.length !== 8) return value || '—';
  return `${value.slice(6, 8)}/${value.slice(4, 6)}/${value.slice(0, 4)}`;
}

function dateTimeLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN');
}

function numberLabel(value) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function durationLabel(job) {
  if (!job?.started_at || !job?.finished_at) return '—';
  const seconds = Math.max(0, Math.round((new Date(job.finished_at) - new Date(job.started_at)) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function PageHeading({ title, description, extra }) {
  return (
    <div className="demo-page-heading">
      <div>
        <Text className="demo-eyebrow">QUẢN TRỊ DỮ LIỆU</Text>
        <Title level={2}>{title}</Title>
        <Text type="secondary">{description}</Text>
      </div>
      {extra ? <div>{extra}</div> : null}
    </div>
  );
}

function Metric({ label, value, note, icon, color }) {
  return (
    <Card className="demo-metric">
      <div className="demo-metric-icon" style={{ color }}>{icon}</div>
      <div>
        <Text className="demo-metric-label">{label}</Text>
        <div className="demo-metric-value">{value}</div>
        <Text type="secondary" className="demo-metric-note">{note}</Text>
      </div>
    </Card>
  );
}

function SourceStatusTag({ status }) {
  const meta = statusMeta[status] || { color: 'default', label: status || 'Chưa rõ' };
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

function useGovernanceData() {
  const [periods, setPeriods] = useState([]);
  const [periodKey, setPeriodKey] = useState('');
  const [sources, setSources] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      client.get('/customer-processing/periods'),
      client.get('/customer-processing/jobs'),
    ])
      .then(([periodResponse, jobResponse]) => {
        if (!active) return;
        const nextPeriods = Array.isArray(periodResponse.data) ? periodResponse.data : [];
        setPeriods(nextPeriods);
        setJobs(Array.isArray(jobResponse.data) ? jobResponse.data : []);
        setPeriodKey((current) => current || nextPeriods[0]?.period_key || '');
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.detail || requestError.message || 'Không tải được dữ liệu');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [reloadKey]);

  useEffect(() => {
    if (!periodKey) {
      setSources([]);
      return undefined;
    }
    let active = true;
    setLoading(true);
    client.get('/imports/report-sources', { params: { period_key: periodKey } })
      .then(({ data }) => {
        if (active) setSources(Array.isArray(data) ? data : []);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.detail || requestError.message || 'Không tải được trạng thái nguồn');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [periodKey, reloadKey]);

  return {
    periods,
    periodKey,
    setPeriodKey,
    sources,
    jobs,
    loading,
    error,
    reload: () => setReloadKey((value) => value + 1),
  };
}

function PeriodActions({ data }) {
  return (
    <Space wrap>
      <Select
        value={data.periodKey || undefined}
        placeholder="Chọn kỳ dữ liệu"
        style={{ minWidth: 180 }}
        onChange={data.setPeriodKey}
        options={data.periods.map((item) => ({
          value: item.period_key,
          label: `${periodLabel(item.period_key)} · ${numberLabel(item.profile_count)} KH`,
        }))}
      />
      <Button icon={<ReloadOutlined />} onClick={data.reload}>Làm mới</Button>
    </Space>
  );
}

function SourceTable({ sources }) {
  return (
    <Table
      rowKey="source_code"
      dataSource={sources}
      pagination={false}
      scroll={{ x: 1050 }}
      locale={{ emptyText: <Empty description="Chưa có trạng thái nguồn trong kỳ" /> }}
      columns={[
        { title: 'Nguồn', dataIndex: 'source_code', width: 105, render: (value) => <Tag color="blue">{value}</Tag> },
        {
          title: 'Tên nguồn',
          dataIndex: 'source_name',
          width: 245,
          render: (value, row) => <div><Text strong>{value}</Text><br /><Text type="secondary">{row.source_table || 'Chưa có bảng nguồn'}</Text></div>,
        },
        { title: 'File', dataIndex: 'file_count', width: 75, align: 'right', render: numberLabel },
        { title: 'Thành công', dataIndex: 'success_file_count', width: 105, align: 'right', render: numberLabel },
        { title: 'Lỗi', dataIndex: 'error_file_count', width: 70, align: 'right', render: (value) => value ? <Text type="danger">{numberLabel(value)}</Text> : '0' },
        { title: 'Số dòng', dataIndex: 'row_count', width: 125, align: 'right', render: numberLabel },
        { title: 'Khách hàng', dataIndex: 'customer_count', width: 125, align: 'right', render: numberLabel },
        { title: 'Cập nhật', dataIndex: 'built_at', width: 165, render: dateTimeLabel },
        { title: 'Trạng thái', dataIndex: 'status', width: 125, render: (value) => <SourceStatusTag status={value} /> },
      ]}
      expandable={{
        expandedRowRender: (row) => (
          <Space direction="vertical">
            <Text>{row.message || 'Không có ghi chú.'}</Text>
            <Text type="secondary">
              Trường đang ánh xạ: {(row.mapped_fields?.fields || []).join(', ') || 'Chưa khai báo'}
            </Text>
          </Space>
        ),
      }}
    />
  );
}

function SourcesPage({ data }) {
  const ready = data.sources.filter((item) => item.status === 'ready').length;
  const issues = data.sources.filter((item) => !['ready', 'planned'].includes(item.status)).length;
  return (
    <div className="demo-page">
      <PageHeading
        title="Trạng thái nguồn dữ liệu"
        description="Theo dõi trực tiếp số file, số dòng, phạm vi khách hàng và trạng thái từng nguồn đã import."
        extra={<PeriodActions data={data} />}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}><Metric label="Nguồn đã cấu hình" value={`${data.sources.length} nguồn`} note={`Kỳ ${periodLabel(data.periodKey)}`} color="#3567a8" icon={<DatabaseOutlined />} /></Col>
        <Col xs={24} md={8}><Metric label="Nguồn sẵn sàng" value={`${ready}/${data.sources.length || 0}`} note="Có file thành công và có dữ liệu" color="#218653" icon={<CheckCircleFilled />} /></Col>
        <Col xs={24} md={8}><Metric label="Nguồn cần xử lý" value={`${issues} nguồn`} note="Thiếu, lỗi hoặc chưa đầy đủ" color="#8f1438" icon={<AlertOutlined />} /></Col>
      </Row>
      <Card className="demo-table-card demo-section"><SourceTable sources={data.sources} /></Card>
    </div>
  );
}

function QualityPage({ data }) {
  const checkedSources = data.sources.filter((item) => item.status !== 'planned');
  const ready = checkedSources.filter((item) => item.status === 'ready').length;
  const score = checkedSources.length ? Math.round((ready / checkedSources.length) * 100) : 0;
  const issues = checkedSources.filter((item) => item.status !== 'ready');
  const period = data.periods.find((item) => item.period_key === data.periodKey);
  const qualityRows = data.sources.map((source) => ({
    ...source,
    issue: source.status === 'ready' ? 'Không phát hiện vấn đề ở mức nguồn' : source.message,
    recommendation: source.status === 'missing'
      ? 'Bổ sung file nguồn cho kỳ dữ liệu'
      : source.status === 'error'
        ? 'Kiểm tra file lỗi và import lại'
        : source.status === 'processing'
          ? 'Chờ job hoàn tất hoặc khôi phục job bị kẹt'
          : source.status === 'partial'
            ? 'Đối chiếu file thành công và file lỗi'
            : 'Chờ cấu hình nguồn nghiệp vụ',
  }));

  return (
    <div className="demo-page">
      <PageHeading
        title="Chất lượng dữ liệu"
        description="Đánh giá độ đầy đủ ở mức nguồn theo kết quả import thật; chưa thay thế bộ kiểm tra chất lượng từng trường."
        extra={<PeriodActions data={data} />}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}><Metric label="Điểm sẵn sàng nguồn" value={`${score}%`} note={`${ready}/${checkedSources.length} nguồn đạt`} color={score >= 80 ? '#218653' : '#d6a033'} icon={<CheckCircleFilled />} /></Col>
        <Col xs={24} md={8}><Metric label="Nguồn có vấn đề" value={`${issues.length} nguồn`} note="Cần bổ sung hoặc kiểm tra lại" color="#8f1438" icon={<AlertOutlined />} /></Col>
        <Col xs={24} md={8}><Metric label="Hồ sơ đã tổng hợp" value={numberLabel(period?.profile_count)} note={period?.is_ready ? 'Đủ 4 nguồn chuẩn' : 'Chưa đủ 4 nguồn chuẩn'} color="#3567a8" icon={<DatabaseOutlined />} /></Col>
      </Row>
      <Alert
        className="demo-section"
        type="info"
        showIcon
        message="Phạm vi đánh giá hiện tại"
        description="Điểm trên phản ánh tình trạng file và số dòng của từng nguồn. Các rule kiểm tra trùng khóa, sai định dạng, NULL và đối soát tổng tiền sẽ được bổ sung khi chốt đầy đủ nguồn dữ liệu mới."
      />
      <Card className="demo-table-card demo-section">
        <Table
          rowKey="source_code"
          dataSource={qualityRows}
          pagination={false}
          scroll={{ x: 900 }}
          columns={[
            { title: 'Nguồn', dataIndex: 'source_code', width: 105, render: (value) => <Tag color="blue">{value}</Tag> },
            { title: 'Kết quả', dataIndex: 'status', width: 130, render: (value) => <SourceStatusTag status={value} /> },
            { title: 'Dòng lỗi/file lỗi', dataIndex: 'error_file_count', width: 135, align: 'right', render: numberLabel },
            { title: 'Nhận định', dataIndex: 'issue', width: 320 },
            { title: 'Hướng xử lý', dataIndex: 'recommendation' },
          ]}
        />
      </Card>
    </div>
  );
}

function MappingPage() {
  const [keyword, setKeyword] = useState('');
  const [group, setGroup] = useState('all');
  const [status, setStatus] = useState('all');
  const filtered = useMemo(() => fieldDictionary.filter((item) => {
    const haystack = `${item.code} ${item.label} ${item.source}`.toLocaleLowerCase('vi');
    return (!keyword || haystack.includes(keyword.toLocaleLowerCase('vi')))
      && (group === 'all' || item.group === group)
      && (status === 'all' || (status === 'unrated' ? item.status == null : item.status === status));
  }), [group, keyword, status]);
  const clear = fieldDictionary.filter((item) => item.status === 1).length;
  const unresolved = fieldDictionary.filter((item) => item.status == null).length;

  return (
    <div className="demo-page">
      <PageHeading
        title="Mapping 84 trường Profile khách hàng"
        description="Từ điển thiết kế dự kiến từ bản demo; trạng thái này không đồng nghĩa trường đã được import vào database thật."
        extra={<Tag color="purple">{fieldDictionary.length}/84 TRƯỜNG</Tag>}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}><Metric label="Đã xác định rõ nguồn" value={`${clear}/${fieldDictionary.length}`} note="Theo tài liệu thiết kế hiện tại" color="#218653" icon={<CheckCircleFilled />} /></Col>
        <Col xs={24} md={8}><Metric label="Chưa đánh giá" value={`${unresolved} trường`} note="Cần chốt cùng nghiệp vụ" color="#8f1438" icon={<AlertOutlined />} /></Col>
        <Col xs={24} md={8}><Metric label="Nhóm nghiệp vụ" value={`${fieldGroups.length} nhóm`} note="Phân nhóm Profile khách hàng" color="#3567a8" icon={<DatabaseOutlined />} /></Col>
      </Row>
      <Card className="demo-filter-card demo-section">
        <Space wrap>
          <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm tên trường, nội dung hoặc nguồn..." allowClear style={{ width: 320 }} />
          <Select value={group} onChange={setGroup} style={{ minWidth: 180 }} options={[{ value: 'all', label: 'Tất cả nhóm' }, ...fieldGroups.map((value) => ({ value, label: value }))]} />
          <Select value={status} onChange={setStatus} style={{ minWidth: 200 }} options={determinationStatuses} />
          <Tag color="blue">{filtered.length} trường</Tag>
        </Space>
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
            { title: 'Nguồn dự kiến', dataIndex: 'source', width: 145, render: (value) => <Tag color="blue">{value}</Tag> },
            { title: 'Bảng đích dự kiến', dataIndex: 'targetTable', width: 230, render: (value) => <Text code>{value}</Text> },
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

function HistoryPage({ data }) {
  return (
    <div className="demo-page">
      <PageHeading
        title="Lịch sử xử lý các kỳ"
        description="Theo dõi các job tổng hợp Profile C360, tiến độ, thời gian chạy và kết quả thực tế."
        extra={<Button icon={<ReloadOutlined />} onClick={data.reload}>Làm mới</Button>}
      />
      <Card className="demo-table-card">
        <Table
          rowKey="id"
          dataSource={data.jobs}
          pagination={{ pageSize: 10, showTotal: (total) => `${total} job` }}
          scroll={{ x: 1000 }}
          columns={[
            { title: 'Mã job', dataIndex: 'id', width: 100, render: (value) => <Text code>JOB-{value}</Text> },
            { title: 'Kỳ dữ liệu', dataIndex: 'period_key', width: 125, render: periodLabel },
            { title: 'Công đoạn', dataIndex: 'stage', width: 290 },
            { title: 'Tiến độ', dataIndex: 'progress_percent', width: 180, render: (value, row) => <Progress percent={Number(value || 0)} size="small" status={row.status === 'error' ? 'exception' : undefined} /> },
            { title: 'Khách hàng', dataIndex: 'processed_customers', width: 125, align: 'right', render: numberLabel },
            { title: 'Thời gian', width: 95, align: 'right', render: (_, row) => durationLabel(row) },
            {
              title: 'Kết quả',
              dataIndex: 'status',
              width: 125,
              render: (value) => value === 'success'
                ? <Tag color="success">Thành công</Tag>
                : value === 'error'
                  ? <Tag color="error">Thất bại</Tag>
                  : value === 'processing'
                    ? <Tag color="processing">Đang xử lý</Tag>
                    : <Tag color="default">Chờ xử lý</Tag>,
            },
            { title: 'Bắt đầu', dataIndex: 'started_at', width: 170, render: dateTimeLabel },
          ]}
          expandable={{
            expandedRowRender: (row) => row.error_message
              ? <Alert type="error" showIcon message={row.error_message} />
              : <Text type="secondary"><ClockCircleOutlined /> Tạo lúc {dateTimeLabel(row.created_at)} · Hoàn thành {dateTimeLabel(row.finished_at)}</Text>,
          }}
        />
      </Card>
    </div>
  );
}

export default function DataGovernance({ mode = 'sources' }) {
  const data = useGovernanceData();
  if (data.loading && !data.periods.length) return <Card><Skeleton active /></Card>;
  if (data.error && !data.periods.length) return <Alert type="error" showIcon message="Không tải được quản trị dữ liệu" description={data.error} />;

  return (
    <>
      {data.error ? <Alert closable type="warning" showIcon message={data.error} style={{ marginBottom: 16 }} /> : null}
      {mode === 'quality' ? <QualityPage data={data} />
        : mode === 'mapping' ? <MappingPage />
          : mode === 'history' ? <HistoryPage data={data} />
            : <SourcesPage data={data} />}
    </>
  );
}
