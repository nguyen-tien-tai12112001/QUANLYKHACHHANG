import { useEffect, useMemo, useState } from 'react';
import {
  AlertOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleFilled,
  DatabaseOutlined,
  PlayCircleOutlined,
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
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';

import client from '../api/client';
import {
  fieldDictionary,
  fieldGroups,
} from '../demo/data/fieldDictionary';
import { mappingRuleFor } from '../constants/fieldMappingRules';
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

function sourceDateLabel(value, short = false) {
  if (!value) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return short ? `${match[3]}/${match[2]}` : `${match[3]}/${match[2]}/${match[1]}`;
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
  const [files, setFiles] = useState([]);
  const [readiness, setReadiness] = useState({ sources: [] });
  const [stalledJobs, setStalledJobs] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
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
      setFiles([]);
      setReadiness({ sources: [] });
      setStalledJobs([]);
      return undefined;
    }
    let active = true;
    setLoading(true);
    Promise.all([
      client.get('/imports/report-sources', { params: { period_key: periodKey } }),
      client.get('/imports/source-readiness', { params: { period_key: periodKey } }),
      client.get('/imports/files', { params: { period_key: periodKey, compact: true } }),
      client.get('/imports/jobs/stalled', { params: { period_key: periodKey } }),
    ])
      .then(([sourceResponse, readinessResponse, fileResponse, stalledResponse]) => {
        if (!active) return;
        setSources(Array.isArray(sourceResponse.data) ? sourceResponse.data : []);
        setReadiness(readinessResponse.data || { sources: [] });
        setFiles(Array.isArray(fileResponse.data) ? fileResponse.data : []);
        setStalledJobs(Array.isArray(stalledResponse.data) ? stalledResponse.data : []);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.detail || requestError.message || 'Không tải được trạng thái nguồn');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [periodKey, reloadKey]);

  async function recoverStalledJobs() {
    setRecovering(true);
    try {
      const { data } = await client.post('/imports/jobs/recover', null, {
        params: { period_key: periodKey },
      });
      message.success(`Đã đưa ${data.queued_count || 0} job import về hàng chờ`);
      setReloadKey((value) => value + 1);
    } catch (requestError) {
      message.error(requestError.response?.data?.detail || requestError.message);
    } finally {
      setRecovering(false);
    }
  }

  async function recoverProcessingJob() {
    setRecovering(true);
    try {
      await client.post(`/customer-processing/jobs/${periodKey}/recover`);
      message.success(`Đã tạo lại job xử lý kỳ ${periodKey}`);
      setReloadKey((value) => value + 1);
    } catch (requestError) {
      message.error(requestError.response?.data?.detail || requestError.message);
    } finally {
      setRecovering(false);
    }
  }

  return {
    periods,
    periodKey,
    setPeriodKey,
    sources,
    files,
    readiness,
    stalledJobs,
    jobs,
    loading,
    recovering,
    error,
    recoverStalledJobs,
    recoverProcessingJob,
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

const REQUIRED_PROFILE_SOURCES = ['DP01', 'LN01', 'CN05', 'PF14'];

function sourceCell(files, sourceCode, branchCode, readiness) {
  const rows = files.filter((item) => item.file_type === sourceCode && item.branch_code === branchCode);
  const successful = rows.filter((item) => item.status === 'success');
  const errors = rows.filter((item) => item.status === 'error');
  const running = rows.filter((item) => ['queued', 'processing'].includes(item.status));
  if (sourceCode === 'FTPLN') {
    const branch = readiness.sources
      ?.find((item) => item.source_code === 'FTPLN')
      ?.branch_readiness?.find((item) => item.branch_code === branchCode);
    if (branch) {
      const missingDates = branch.missing_dates || [];
      const duplicateDates = branch.duplicate_dates || [];
      const issueDetails = [
        missingDates.length ? `Thiếu ngày: ${missingDates.map((value) => sourceDateLabel(value)).join(', ')}` : '',
        duplicateDates.length ? `Trùng ngày: ${duplicateDates.map((value) => sourceDateLabel(value)).join(', ')}` : '',
        branch.error_file_count ? `${branch.error_file_count} file lỗi` : '',
      ].filter(Boolean);
      return branch.is_ready
        ? (
          <Tooltip title={`Đủ ${branch.success_days}/${branch.expected_days} ngày`}>
            <span className="matrix-state matrix-state--success">
              <CheckCircleFilled />
              <small>{branch.success_days}/{branch.expected_days}</small>
            </span>
          </Tooltip>
        )
        : (
          <Tooltip title={issueDetails.join(' · ') || `Mới có ${branch.success_days}/${branch.expected_days} ngày`}>
            <span className="matrix-state matrix-state--missing">
              <CloseCircleFilled />
              <small>
                {missingDates.length === 1
                  ? `Thiếu ${sourceDateLabel(missingDates[0], true)}`
                  : `Thiếu ${missingDates.length || Math.max(0, branch.expected_days - branch.success_days)} ngày`}
              </small>
            </span>
          </Tooltip>
        );
    }
  }
  if (errors.length) {
    return <Tooltip title={`${errors.length} file lỗi`}><span className="matrix-state matrix-state--error"><CloseCircleFilled /></span></Tooltip>;
  }
  if (running.length) {
    return <Tooltip title={`${running.length} file đang xử lý`}><span className="matrix-state matrix-state--running"><ClockCircleOutlined /></span></Tooltip>;
  }
  if (successful.length) {
    return <Tooltip title={`Đã nhận ${successful.length} file thành công`}><span className="matrix-state matrix-state--success"><CheckCircleFilled /></span></Tooltip>;
  }
  return <Tooltip title="Chưa nhận được file"><span className="matrix-state matrix-state--missing"><CloseCircleFilled /></span></Tooltip>;
}

function ReadinessOverview({ data }) {
  const period = data.periods.find((item) => item.period_key === data.periodKey);
  const activeFiles = data.files.filter((item) => !['deleted', 'replaced', 'deleting'].includes(item.status));
  const branches = [...new Set(activeFiles.map((item) => item.branch_code).filter(Boolean))].sort();
  const missingRequired = REQUIRED_PROFILE_SOURCES.flatMap((sourceCode) => (
    branches.filter((branchCode) => !activeFiles.some(
      (item) => item.file_type === sourceCode && item.branch_code === branchCode && item.status === 'success',
    )).map((branchCode) => `${sourceCode}/${branchCode}`)
  ));
  const errorFiles = activeFiles.filter((item) => item.status === 'error');
  const runningFiles = activeFiles.filter((item) => ['queued', 'processing'].includes(item.status));
  const processingJob = data.jobs.find(
    (item) => item.period_key === data.periodKey && ['queued', 'processing'].includes(item.status),
  );

  let status = { color: 'warning', label: 'Đủ nguồn, chưa tổng hợp', detail: 'Có thể bắt đầu xử lý dữ liệu khách hàng.' };
  if (!activeFiles.length || missingRequired.length) {
    status = {
      color: 'default',
      label: 'Chưa đủ file',
      detail: missingRequired.length
        ? `Thiếu ${missingRequired.length} tổ hợp nguồn/chi nhánh bắt buộc.`
        : 'Kỳ chưa có file dữ liệu.',
    };
  }
  if (runningFiles.length || processingJob) {
    status = { color: 'processing', label: 'Đang xử lý', detail: 'Có job import hoặc tổng hợp đang chạy.' };
  }
  if (errorFiles.length) {
    status = { color: 'error', label: 'Có lỗi', detail: `${errorFiles.length} file cần kiểm tra.` };
  }
  if (data.stalledJobs.length) {
    status = { color: 'error', label: 'Job bị kẹt', detail: `${data.stalledJobs.length} job cần chạy lại.` };
  }
  if (
    !errorFiles.length
    && !runningFiles.length
    && !processingJob
    && !data.stalledJobs.length
    && !missingRequired.length
    && Number(period?.profile_count || 0) > 0
  ) {
    status = { color: 'success', label: 'Sẵn sàng sử dụng', detail: `${numberLabel(period.profile_count)} hồ sơ đã tổng hợp.` };
  }

  return (
    <Card className="demo-section data-readiness-card" bordered={false}>
      <div className="readiness-summary">
        <div className="readiness-summary__main">
          <Text className="readiness-kicker">TRẠNG THÁI KỲ {periodLabel(data.periodKey)}</Text>
          <div className="readiness-title">
            <Tag color={status.color} className="data-readiness-status">{status.label}</Tag>
          </div>
          <Text type="secondary">{status.detail}</Text>
        </div>
        <div className="readiness-summary__stats">
          <div className="readiness-stat"><span>Chi nhánh</span><strong>{branches.length}</strong><small>{branches.join(', ') || 'Chưa có dữ liệu'}</small></div>
          <div className="readiness-stat readiness-stat--success"><span>File hiệu lực</span><strong>{activeFiles.length}</strong><small>{errorFiles.length ? `${errorFiles.length} file lỗi` : 'Không có file lỗi'}</small></div>
          <div className="readiness-stat readiness-stat--warning"><span>Còn thiếu</span><strong>{missingRequired.length}</strong><small>Nguồn/chi nhánh bắt buộc</small></div>
          <div className="readiness-stat readiness-stat--danger"><span>Job bị kẹt</span><strong>{data.stalledJobs.length}</strong><small>Cần kiểm tra hoặc chạy lại</small></div>
        </div>
      </div>
      {missingRequired.length ? (
        <Alert
          showIcon
          type="warning"
          message="Nguồn bắt buộc còn thiếu"
          description={missingRequired.join(', ')}
          style={{ marginTop: 16 }}
        />
      ) : null}
    </Card>
  );
}

function SourceBranchMatrix({ data }) {
  const [onlyMissing, setOnlyMissing] = useState(false);
  const activeFiles = data.files.filter((item) => !['deleted', 'replaced', 'deleting'].includes(item.status));
  const branches = [...new Set(activeFiles.map((item) => item.branch_code).filter(Boolean))].sort();
  const sourceCodes = data.readiness.sources?.map((item) => item.source_code)
    || [...new Set(activeFiles.map((item) => item.file_type))].sort();
  function isSourceReady(sourceCode, branchCode) {
    if (sourceCode === 'FTPLN') {
      return Boolean(data.readiness.sources
        ?.find((item) => item.source_code === 'FTPLN')
        ?.branch_readiness?.find((item) => item.branch_code === branchCode)?.is_ready);
    }
    return activeFiles.some(
      (item) => item.file_type === sourceCode && item.branch_code === branchCode && item.status === 'success',
    );
  }
  const branchReadyCounts = Object.fromEntries(branches.map((branchCode) => [
    branchCode,
    sourceCodes.filter((sourceCode) => isSourceReady(sourceCode, branchCode)).length,
  ]));
  const rows = sourceCodes
    .filter((sourceCode) => !onlyMissing || branches.some((branchCode) => !isSourceReady(sourceCode, branchCode)))
    .map((sourceCode) => ({ source_code: sourceCode }));
  const columns = [
    {
      title: 'Nguồn',
      dataIndex: 'source_code',
      fixed: 'left',
      width: 110,
      render: (value) => <Tag color={REQUIRED_PROFILE_SOURCES.includes(value) ? 'blue' : 'purple'}>{value}</Tag>,
    },
    ...branches.map((branchCode) => ({
      title: branchCode,
      key: branchCode,
      width: 125,
      align: 'center',
      render: (_, row) => sourceCell(activeFiles, row.source_code, branchCode, data.readiness),
      onHeaderCell: () => ({
        className: branchReadyCounts[branchCode] < sourceCodes.length ? 'matrix-column--incomplete' : '',
      }),
      onCell: () => ({
        className: branchReadyCounts[branchCode] < sourceCodes.length ? 'matrix-column--incomplete' : '',
      }),
    })),
  ];
  return (
    <Card
      title={<div><Text strong className="matrix-title">Ma trận nguồn theo chi nhánh</Text><Text type="secondary" className="matrix-subtitle">Theo dõi độ đầy đủ của từng nguồn tại từng đơn vị</Text></div>}
      className="demo-table-card demo-section source-matrix-card"
      extra={(
        <Space size={18} className="matrix-toolbar">
          <Space size={8}><Switch size="small" checked={onlyMissing} onChange={setOnlyMissing} /><Text>Chỉ hiện nguồn còn thiếu</Text></Space>
          <Space size={14} className="matrix-legend">
            <span><CheckCircleFilled className="legend-success" /> Đã đủ</span>
            <span><CloseCircleFilled className="legend-missing" /> Còn thiếu</span>
            <span><ClockCircleOutlined className="legend-running" /> Đang xử lý</span>
          </Space>
        </Space>
      )}
    >
      <Table
        rowKey="source_code"
        dataSource={rows}
        columns={columns}
        pagination={false}
        size="middle"
        scroll={{ x: 110 + branches.length * 125 }}
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row className="matrix-summary-row">
              <Table.Summary.Cell index={0}><Text strong>Tổng nguồn đã đủ</Text></Table.Summary.Cell>
              {branches.map((branchCode, index) => (
                <Table.Summary.Cell
                  key={branchCode}
                  index={index + 1}
                  align="center"
                  className={branchReadyCounts[branchCode] < sourceCodes.length ? 'matrix-column--incomplete' : ''}
                >
                  <Text strong>{branchReadyCounts[branchCode]}/{sourceCodes.length}</Text>
                </Table.Summary.Cell>
              ))}
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
    </Card>
  );
}

function JobIssueCenter({ data }) {
  const failedFiles = data.files
    .filter((item) => item.status === 'error')
    .map((item) => ({
      key: `file-${item.id}`,
      type: 'Import file',
      name: item.original_filename,
      status: 'error',
      reason: item.error_message || 'Import file thất bại nhưng chưa ghi nhận chi tiết lỗi.',
      time: item.finished_at || item.uploaded_at,
    }));
  const stalled = data.stalledJobs.map((item) => ({
    key: `stalled-${item.id}`,
    type: 'Job import',
    name: item.original_filename,
    status: 'stalled',
    reason: item.stalled_reason,
    time: item.started_at || item.uploaded_at,
  }));
  const failedProcessing = data.jobs
    .filter((item) => item.period_key === data.periodKey && item.status === 'error')
    .map((item) => ({
      key: `processing-${item.id}`,
      type: 'Tổng hợp KH',
      name: `JOB-${item.id} · ${item.stage || 'Xử lý dữ liệu khách hàng'}`,
      status: 'error',
      reason: item.error_message || 'Job tổng hợp thất bại.',
      time: item.finished_at || item.started_at,
    }));
  const rows = [...stalled, ...failedFiles, ...failedProcessing];
  return (
    <Card
      title="Trung tâm lỗi và job"
      className="demo-table-card demo-section"
      extra={(
        <Space>
          {stalled.length ? (
            <Button
              danger
              type="primary"
              loading={data.recovering}
              icon={<PlayCircleOutlined />}
              onClick={data.recoverStalledJobs}
            >
              Chạy lại job import kẹt
            </Button>
          ) : null}
          {failedProcessing.length ? (
            <Button
              loading={data.recovering}
              icon={<ReloadOutlined />}
              onClick={data.recoverProcessingJob}
            >
              Chạy lại tổng hợp
            </Button>
          ) : null}
        </Space>
      )}
    >
      <Table
        rowKey="key"
        dataSource={rows}
        pagination={{ pageSize: 8, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty description="Không có lỗi hoặc job bị kẹt trong kỳ" /> }}
        columns={[
          { title: 'Loại', dataIndex: 'type', width: 130, render: (value) => <Tag>{value}</Tag> },
          { title: 'File/Job', dataIndex: 'name', width: 320, ellipsis: true },
          {
            title: 'Trạng thái',
            dataIndex: 'status',
            width: 120,
            render: (value) => <Tag color="error">{value === 'stalled' ? 'Bị kẹt' : 'Thất bại'}</Tag>,
          },
          { title: 'Lý do', dataIndex: 'reason' },
          { title: 'Thời điểm', dataIndex: 'time', width: 175, render: dateTimeLabel },
        ]}
      />
    </Card>
  );
}

function SourcesPage({ data }) {
  return (
    <div className="demo-page">
      <PageHeading
        title="Trạng thái nguồn dữ liệu"
        description="Theo dõi trực tiếp số file, số dòng, phạm vi khách hàng và trạng thái từng nguồn đã import."
        extra={<PeriodActions data={data} />}
      />
      <ReadinessOverview data={data} />
      <SourceBranchMatrix data={data} />
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

function MappingPage({ data }) {
  const [keyword, setKeyword] = useState('');
  const [group, setGroup] = useState('all');
  const [status, setStatus] = useState('all');
  const [coverage, setCoverage] = useState({ total_profiles: 0, fields: {} });
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const defaults = [
      'order', 'code', 'label', 'group', 'actualSource', 'profileField',
      'calculation', 'reconciliation', 'coverage', 'runtimeStatus',
    ];
    try {
      const stored = JSON.parse(localStorage.getItem('c360_dictionary_columns') || '[]');
      return Array.isArray(stored) && stored.length ? stored : defaults;
    } catch {
      return defaults;
    }
  });

  useEffect(() => {
    if (!data.periodKey) {
      setCoverage({ total_profiles: 0, fields: {} });
      return undefined;
    }
    let active = true;
    async function loadCoverage(showLoading = false) {
      if (showLoading) setCoverageLoading(true);
      try {
        const { data: response } = await client.get('/customer-processing/profile-field-coverage', {
          params: { period_key: data.periodKey },
        });
        if (active) setCoverage(response || { total_profiles: 0, fields: {} });
      } catch (error) {
        if (active) message.error(error.response?.data?.detail || error.message);
      } finally {
        if (active && showLoading) setCoverageLoading(false);
      }
    }
    loadCoverage(true);
    const timer = window.setInterval(() => loadCoverage(false), 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [data.periodKey]);

  const mappedRows = useMemo(() => fieldDictionary.map((field) => {
    const rule = mappingRuleFor(field);
    const fieldCoverage = coverage.fields?.[field.code];
    let runtimeStatus = 'not_implemented';
    if (rule.profileField && !coverage.total_profiles) runtimeStatus = 'mapped';
    if (rule.profileField && coverage.total_profiles && Number(fieldCoverage?.populated_count || 0) === 0) runtimeStatus = 'no_data';
    if (rule.profileField && Number(fieldCoverage?.populated_count || 0) > 0) runtimeStatus = 'has_data';
    return { ...field, ...rule, ...fieldCoverage, runtimeStatus };
  }), [coverage]);
  const filtered = useMemo(() => mappedRows.filter((item) => {
    const haystack = `${item.code} ${item.label} ${item.actualSource} ${item.profileField || ''} ${item.calculation}`.toLocaleLowerCase('vi');
    return (!keyword || haystack.includes(keyword.toLocaleLowerCase('vi')))
      && (group === 'all' || item.group === group)
      && (status === 'all' || item.runtimeStatus === status);
  }), [group, keyword, mappedRows, status]);
  const implementedCount = mappedRows.filter((item) => item.profileField).length;
  const availableCount = mappedRows.filter((item) => item.runtimeStatus === 'has_data').length;
  const pendingCount = mappedRows.length - implementedCount;

  const statusOptions = [
    { value: 'all', label: 'Tất cả trạng thái' },
    { value: 'has_data', label: 'Đang có dữ liệu' },
    { value: 'no_data', label: 'Đã mapping, chưa có dữ liệu' },
    { value: 'mapped', label: 'Đã mapping, chưa có hồ sơ kỳ' },
    { value: 'not_implemented', label: 'Chưa triển khai' },
  ];
  const runtimeStatusTag = (value) => {
    if (value === 'has_data') return <Tag color="success">Đang có dữ liệu</Tag>;
    if (value === 'no_data') return <Tag color="warning">Mapping chưa có dữ liệu</Tag>;
    if (value === 'mapped') return <Tag color="processing">Đã mapping</Tag>;
    return <Tag>Chưa triển khai</Tag>;
  };
  const allColumns = [
    { title: 'STT', dataIndex: 'order', key: 'order', width: 65, align: 'center' },
    { title: 'Tên trường', dataIndex: 'code', key: 'code', width: 175, fixed: 'left', render: (value) => <Text code>{value}</Text> },
    { title: 'Nội dung', dataIndex: 'label', key: 'label', width: 260 },
    { title: 'Nhóm', dataIndex: 'group', key: 'group', width: 145, render: (value) => <Tag>{value}</Tag> },
    { title: 'Kiểu', dataIndex: 'typeName', key: 'typeName', width: 95 },
    { title: 'Nguồn đang dùng', dataIndex: 'actualSource', key: 'actualSource', width: 190, render: (value) => <Tag color="blue">{value}</Tag> },
    {
      title: 'Cột đích thực tế',
      dataIndex: 'profileField',
      key: 'profileField',
      width: 210,
      render: (value) => value ? <Text code>{value}</Text> : <Text type="secondary">Chưa có</Text>,
    },
    { title: 'Cách lấy / Công thức', dataIndex: 'calculation', key: 'calculation', width: 390 },
    { title: 'Cách đối chiếu', dataIndex: 'reconciliation', key: 'reconciliation', width: 370 },
    {
      title: 'Độ phủ kỳ',
      dataIndex: 'coverage_percent',
      key: 'coverage',
      width: 175,
      render: (value, row) => row.profileField ? (
        <Space orientation="vertical" size={1} style={{ width: '100%' }}>
          <Progress percent={Number(value || 0)} size="small" />
          <Text type="secondary">{numberLabel(row.populated_count)}/{numberLabel(row.total_count)} hồ sơ</Text>
        </Space>
      ) : <Text type="secondary">Chưa theo dõi</Text>,
    },
    { title: 'Trạng thái hiện tại', dataIndex: 'runtimeStatus', key: 'runtimeStatus', width: 190, render: runtimeStatusTag },
    { title: 'Cho phép NULL', dataIndex: 'nullable', key: 'nullable', width: 120, align: 'center', render: (value) => value ? <Tag color="warning">Có</Tag> : <Tag color="success">Không</Tag> },
  ];
  const columns = allColumns.filter((column) => visibleColumns.includes(column.key));
  const columnOptions = allColumns.map((column) => ({ value: column.key, label: column.title }));

  return (
    <div className="demo-page">
      <PageHeading
        title="Mapping 84 trường Profile khách hàng"
        description="Theo dõi trực tiếp nguồn, công thức, cách đối chiếu và độ phủ dữ liệu thực tế của từng trường Profile khách hàng."
        extra={<PeriodActions data={data} />}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} md={6}><Metric label="Tổng trường theo dõi" value={fieldDictionary.length} note={`${fieldGroups.length} nhóm nghiệp vụ`} color="#3567a8" icon={<DatabaseOutlined />} /></Col>
        <Col xs={24} md={6}><Metric label="Đã có mapping thật" value={`${implementedCount}/${fieldDictionary.length}`} note="Có cột đích trong Profile" color="#7254a3" icon={<CheckCircleFilled />} /></Col>
        <Col xs={24} md={6}><Metric label="Đang có dữ liệu" value={`${availableCount} trường`} note={`Kỳ ${periodLabel(data.periodKey)}`} color="#218653" icon={<CheckCircleFilled />} /></Col>
        <Col xs={24} md={6}><Metric label="Chưa triển khai" value={`${pendingCount} trường`} note="Chưa có cột đích/công thức chạy thật" color="#8f1438" icon={<AlertOutlined />} /></Col>
      </Row>
      <Card className="demo-filter-card demo-section">
        <Space wrap>
          <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm trường, nguồn, cột đích hoặc công thức..." allowClear style={{ width: 340 }} />
          <Select value={group} onChange={setGroup} style={{ minWidth: 180 }} options={[{ value: 'all', label: 'Tất cả nhóm' }, ...fieldGroups.map((value) => ({ value, label: value }))]} />
          <Select value={status} onChange={setStatus} style={{ minWidth: 230 }} options={statusOptions} />
          <Select
            mode="multiple"
            value={visibleColumns}
            onChange={(values) => {
              const next = values.length ? values : ['code', 'label', 'runtimeStatus'];
              setVisibleColumns(next);
              localStorage.setItem('c360_dictionary_columns', JSON.stringify(next));
            }}
            maxTagCount={1}
            style={{ minWidth: 230 }}
            placeholder="Chọn cột hiển thị"
            options={columnOptions}
          />
          <Tag color="blue">{filtered.length} trường</Tag>
        </Space>
      </Card>
      <Card className="demo-table-card">
        <Table
          rowKey="code"
          dataSource={filtered}
          loading={coverageLoading}
          pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 84], showTotal: (total) => `${total} trường` }}
          scroll={{ x: columns.reduce((sum, column) => sum + Number(column.width || 180), 0) }}
          columns={columns}
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
        : mode === 'mapping' ? <MappingPage data={data} />
          : mode === 'history' ? <HistoryPage data={data} />
            : <SourcesPage data={data} />}
    </>
  );
}
