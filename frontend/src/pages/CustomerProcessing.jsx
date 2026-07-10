import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Empty,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Timeline,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  FileDoneOutlined,
  InboxOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';

import client from '../api/client';

const { Dragger } = Upload;
const { Paragraph, Text, Title } = Typography;

const REQUIRED_LABELS = {
  DP01: 'DP01 - dữ liệu nền',
  LN01: 'LN01 - khoản vay',
  CN05: 'CN05 - dịch vụ',
  PF14: 'PF14 - CASA',
};

const statusMeta = {
  queued: { text: 'Chờ xử lý', color: 'blue', badge: 'processing' },
  processing: { text: 'Đang xử lý', color: 'processing', badge: 'processing' },
  success: { text: 'Hoàn thành', color: 'success', badge: 'success' },
  error: { text: 'Lỗi', color: 'error', badge: 'error' },
};

const moneyFormatter = new Intl.NumberFormat('vi-VN');

function money(value) {
  return moneyFormatter.format(Number(value || 0));
}

function fileSize(value) {
  const bytes = Number(value || 0);
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function elapsedText(startedAt, finishedAt) {
  if (!startedAt) return 'Chưa bắt đầu';
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  if (seconds < 60) return `${seconds} giây`;
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  return `${minutes} phút ${restSeconds} giây`;
}

function jobStatusTag(status) {
  const meta = statusMeta[status] || { text: status || 'Chưa chạy', color: 'default', badge: 'default' };
  return <Tag color={meta.color}>{meta.text}</Tag>;
}

function requiredFileTags(row) {
  return row.required_types.map((type) => {
    const count = row.success_by_type?.[type] || 0;
    const error = row.error_by_type?.[type] || 0;
    const processing = row.processing_by_type?.[type] || 0;
    const color = count > 0 ? 'success' : error > 0 ? 'error' : processing > 0 ? 'processing' : 'default';
    return (
      <Tooltip
        key={type}
        title={`${REQUIRED_LABELS[type] || type}: ${count} file thành công${error ? `, ${error} file lỗi` : ''}${processing ? `, ${processing} file đang xử lý` : ''}`}
      >
        <Tag color={color}>{type}: {count}</Tag>
      </Tooltip>
    );
  });
}

function CustomerProcessing() {
  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [currentJob, setCurrentJob] = useState(null);
  const [optionalFiles, setOptionalFiles] = useState([]);
  const [exchangeRates, setExchangeRates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [fileList, setFileList] = useState([]);

  function selectPeriod(periodKey, periodList = periods) {
    setSelectedPeriod(periodKey);
    const period = periodList.find((item) => item.period_key === periodKey);
    setCurrentJob(period?.last_job || null);
  }

  async function loadPeriods(nextSelectedPeriod) {
    const { data } = await client.get('/customer-processing/periods');
    setPeriods(data || []);
    const target = nextSelectedPeriod || selectedPeriod || data?.[0]?.period_key || null;
    if (target) {
      selectPeriod(target, data || []);
    }
  }

  async function loadOptionalFiles(periodKey = selectedPeriod) {
    if (!periodKey) return;
    const { data } = await client.get('/customer-processing/optional-files', {
      params: { period_key: periodKey },
    });
    setOptionalFiles(data || []);
  }

  async function loadExchangeRates(periodKey = selectedPeriod) {
    if (!periodKey) return;
    const { data } = await client.get('/customer-processing/exchange-rates', {
      params: { period_key: periodKey },
    });
    setExchangeRates(data || []);
  }

  async function refreshAll(periodKey = selectedPeriod) {
    setLoading(true);
    try {
      await loadPeriods(periodKey);
      await Promise.all([loadOptionalFiles(periodKey), loadExchangeRates(periodKey)]);
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedPeriod) return;
    loadOptionalFiles(selectedPeriod);
    loadExchangeRates(selectedPeriod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod]);

  useEffect(() => {
    if (!currentJob || !['queued', 'processing'].includes(currentJob.status)) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const { data } = await client.get(`/customer-processing/jobs/${currentJob.id}`);
        setCurrentJob(data);
        if (!['queued', 'processing'].includes(data.status)) {
          await refreshAll(data.period_key);
        }
      } catch (error) {
        message.error(error.response?.data?.detail || error.message);
      }
    }, 2500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentJob?.id, currentJob?.status]);

  const selectedPeriodInfo = useMemo(
    () => periods.find((item) => item.period_key === selectedPeriod),
    [periods, selectedPeriod],
  );

  const isCurrentJobRunning = currentJob && ['queued', 'processing'].includes(currentJob.status);
  const isCurrentJobPossiblyStalled = useMemo(() => {
    if (!isCurrentJobRunning || !currentJob?.updated_at) return false;
    return Date.now() - new Date(currentJob.updated_at).getTime() > 15 * 60 * 1000;
  }, [currentJob?.status, currentJob?.updated_at, isCurrentJobRunning]);

  async function startProcessing() {
    if (!selectedPeriod) {
      message.warning('Vui lòng chọn kỳ dữ liệu');
      return;
    }
    setProcessing(true);
    try {
      const { data } = await client.post(`/customer-processing/jobs/${selectedPeriod}`);
      setCurrentJob(data);
      localStorage.setItem('c360_processing_job_id', String(data.id));
      localStorage.setItem('c360_processing_period_key', selectedPeriod);
      message.success('Đã tạo job xử lý dữ liệu khách hàng');
      await loadPeriods(selectedPeriod);
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setProcessing(false);
    }
  }

  async function recoverProcessing() {
    if (!selectedPeriod) {
      message.warning('Vui lòng chọn kỳ dữ liệu');
      return;
    }
    setRecovering(true);
    try {
      const { data } = await client.post(`/customer-processing/jobs/${selectedPeriod}/recover`, null, {
        timeout: 60 * 1000,
      });
      setCurrentJob(data);
      localStorage.setItem('c360_processing_job_id', String(data.id));
      localStorage.setItem('c360_processing_period_key', selectedPeriod);
      message.success(`Đã tạo job mới để chạy lại kỳ ${selectedPeriod}`);
      await loadPeriods(selectedPeriod);
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setRecovering(false);
    }
  }

  async function uploadOptionalFile() {
    if (!selectedPeriod) {
      message.warning('Vui lòng chọn kỳ dữ liệu trước khi thêm file');
      return;
    }
    if (!fileList.length) {
      message.warning('Vui lòng chọn file bổ sung');
      return;
    }
    const formData = new FormData();
    formData.append('file', fileList[0].originFileObj || fileList[0]);
    setLoading(true);
    try {
      await client.post('/customer-processing/optional-files', formData, {
        params: { period_key: selectedPeriod },
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setFileList([]);
      message.success('Đã thêm file bổ sung cho kỳ dữ liệu');
      await refreshAll(selectedPeriod);
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setLoading(false);
    }
  }

  const periodColumns = [
    {
      title: 'Kỳ dữ liệu',
      dataIndex: 'period_key',
      key: 'period_key',
      width: 120,
      render: (value, row) => (
        <Button type="link" onClick={() => selectPeriod(value)} style={{ padding: 0, fontWeight: 700 }}>
          {value}
          {selectedPeriod === value && <Tag color="blue" style={{ marginLeft: 8 }}>Đang xem</Tag>}
        </Button>
      ),
    },
    {
      title: 'File bắt buộc',
      key: 'required',
      render: (_, row) => <Space size={[4, 4]} wrap>{requiredFileTags(row)}</Space>,
    },
    {
      title: 'Độ sẵn sàng',
      key: 'ready',
      width: 180,
      render: (_, row) => (
        <Space orientation="vertical" size={2} style={{ width: '100%' }}>
          <Progress
            percent={Math.round((row.available_required_file_count / row.required_file_count) * 100)}
            size="small"
            status={row.is_ready ? 'success' : 'active'}
          />
          <Text type="secondary">{row.available_required_file_count}/{row.required_file_count} nhóm file</Text>
        </Space>
      ),
    },
    {
      title: 'Kết quả',
      key: 'result',
      width: 190,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <Text>{money(row.profile_count)} khách hàng đã xử lý</Text>
          {row.last_job ? jobStatusTag(row.last_job.status) : <Tag>Chưa chạy</Tag>}
        </Space>
      ),
    },
  ];

  return (
    <Space orientation="vertical" size={18} className="page-stack">
      <div>
        <Title level={2}>Xử lý dữ liệu khách hàng</Title>
        <Paragraph className="dashboard-description">
          Đối chiếu dữ liệu theo kỳ, lấy DP01 làm dữ liệu nền và gom khách hàng theo MA_KH để một khách hàng dùng dịch vụ ở nhiều chi nhánh chỉ còn một hồ sơ tổng hợp.
        </Paragraph>
      </div>

      <Row gutter={[12, 12]}>
        <Col xs={24} md={6}>
          <Card size="small">
            <Statistic title="Kỳ dữ liệu" value={periods.length} prefix={<DatabaseOutlined />} />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card size="small">
            <Statistic
              title="Khách hàng đã xử lý"
              value={Number(selectedPeriodInfo?.profile_count || 0)}
              prefix={<FileDoneOutlined />}
              formatter={money}
            />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card size="small">
            <Statistic
              title="Job gần nhất"
              value={currentJob ? statusMeta[currentJob.status]?.text || currentJob.status : 'Chưa chạy'}
              prefix={<PlayCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card size="small">
            <Statistic title="File bổ sung" value={optionalFiles.length} prefix={<CloudUploadOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card
        title="Các kỳ dữ liệu có thể xử lý"
        extra={
          <Space>
            <Select
              value={selectedPeriod}
              placeholder="Chọn kỳ dữ liệu"
              style={{ width: 170 }}
              options={periods.map((item) => ({ value: item.period_key, label: item.period_key }))}
              onChange={selectPeriod}
            />
            <Button icon={<ReloadOutlined />} onClick={() => refreshAll()} loading={loading}>Tải lại</Button>
          </Space>
        }
      >
        <Table
          size="small"
          rowKey="period_key"
          columns={periodColumns}
          dataSource={periods}
          pagination={{ pageSize: 5 }}
          loading={loading}
          rowClassName={(row) => (row.period_key === selectedPeriod ? 'row-selected-soft' : '')}
          onRow={(row) => ({
            onClick: () => selectPeriod(row.period_key),
          })}
          locale={{ emptyText: <Empty description="Chưa có kỳ dữ liệu trong kho" /> }}
        />
      </Card>

      <Row gutter={[12, 12]} align="stretch">
        <Col xs={24} lg={10}>
          <Card
            title="Thêm file bổ sung cho kỳ"
            extra={selectedPeriod ? <Tag color="blue">{selectedPeriod}</Tag> : null}
          >
            <Dragger
              maxCount={1}
              fileList={fileList}
              beforeUpload={() => false}
              onChange={({ fileList: nextFileList }) => setFileList(nextFileList)}
              onRemove={() => setFileList([])}
              accept=".csv,.xlsx,.xls"
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">Kéo thả hoặc chọn file bổ sung</p>
              <p className="ant-upload-hint">File bổ sung được lưu theo kỳ để dùng mapping/đối chiếu sau này.</p>
            </Dragger>
            <Space style={{ marginTop: 12 }}>
              <Button type="primary" icon={<CloudUploadOutlined />} onClick={uploadOptionalFile} loading={loading}>
                Thêm file
              </Button>
              <Text type="secondary">{optionalFiles.length} file bổ sung đã lưu</Text>
            </Space>
            {optionalFiles.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <Timeline
                  items={optionalFiles.slice(0, 5).map((item) => ({
                    color: 'blue',
                    children: (
                      <Space orientation="vertical" size={0}>
                        <Text strong>{item.original_filename}</Text>
                        <Text type="secondary">{fileSize(item.file_size)} · {item.status}</Text>
                      </Space>
                    ),
                  }))}
                />
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card
            title={
              <Space wrap>
                <span>Chạy xử lý dữ liệu</span>
                {selectedPeriod ? <Tag color="blue">Đang xem kỳ {selectedPeriod}</Tag> : null}
                {isCurrentJobPossiblyStalled ? <Tag color="warning">Job có thể bị kẹt</Tag> : null}
              </Space>
            }
            extra={
              <Space wrap>
                {isCurrentJobRunning ? (
                  <Button
                    danger
                    icon={<ReloadOutlined />}
                    loading={recovering}
                    onClick={recoverProcessing}
                  >
                    Chạy lại job kẹt
                  </Button>
                ) : null}
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  disabled={!selectedPeriodInfo?.success_by_type?.DP01 || isCurrentJobRunning}
                  loading={processing}
                  onClick={startProcessing}
                >
                  Chạy dữ liệu
                </Button>
              </Space>
            }
          >
            {selectedPeriodInfo ? (
              <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                <Space size={[6, 6]} wrap>
                  {selectedPeriodInfo.is_ready ? (
                    <Tag color="success" icon={<CheckCircleOutlined />}>Đủ nhóm file chuẩn</Tag>
                  ) : (
                    <Tag color="warning" icon={<WarningOutlined />}>Có nhóm file còn thiếu</Tag>
                  )}
                  {requiredFileTags(selectedPeriodInfo)}
                </Space>
                <div className="exchange-rate-strip">
                  <Text strong>Tỷ giá quy đổi từ DP01:</Text>
                  <Space size={[6, 6]} wrap>
                    {exchangeRates.length > 0 ? exchangeRates.map((item) => (
                      <Tag key={item.id || item.ccy} color={item.ccy === 'VND' ? 'green' : 'gold'}>
                        {item.ccy}: {money(item.exchange_rate)}
                      </Tag>
                    )) : <Text type="secondary">Chưa có tỷ giá, chạy xử lý để tạo từ DP01</Text>}
                  </Space>
                </div>
                <Progress
                  percent={currentJob?.progress_percent || 0}
                  status={currentJob?.status === 'error' ? 'exception' : currentJob?.status === 'success' ? 'success' : 'active'}
                />
                <Timeline
                  items={[
                    {
                      color: currentJob ? 'green' : 'gray',
                      children: currentJob ? `Job #${currentJob.id} - ${jobStatusTag(currentJob.status).props.children}` : 'Chưa có job xử lý',
                    },
                    {
                      color: currentJob?.status === 'error' ? 'red' : 'blue',
                      children: currentJob?.stage || 'Chọn kỳ dữ liệu và bấm Chạy dữ liệu',
                    },
                    {
                      color: currentJob?.status === 'success' ? 'green' : 'gray',
                      children: `${money(currentJob?.processed_customers || 0)} / ${money(currentJob?.total_customers || 0)} khách hàng`,
                    },
                    {
                      color: currentJob?.started_at ? 'blue' : 'gray',
                      children: `Thời gian xử lý: ${elapsedText(currentJob?.started_at, currentJob?.finished_at)}`,
                    },
                  ]}
                />
                {currentJob?.error_message && <Text type="danger">{currentJob.error_message}</Text>}
              </Space>
            ) : (
              <Empty description="Chưa chọn kỳ dữ liệu" />
            )}
          </Card>
        </Col>
      </Row>

    </Space>
  );
}

export default CustomerProcessing;

