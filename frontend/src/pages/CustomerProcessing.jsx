import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Modal,
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
  BranchesOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  FileDoneOutlined,
  InboxOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
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

const CN05_SERVICE_DEFS = [
  { key: 'tk_so_dep', label: 'TK số đẹp' },
  { key: 'agribank_plus', label: 'Agribank Plus' },
  { key: 'tin_nhan_ott', label: 'Tin nhắn OTT' },
  { key: 'sms_nhac_no_vay', label: 'SMS nhắc nợ vay' },
  { key: 'sms_tien_gui', label: 'SMS tiền gửi' },
  { key: 'the_ghi_no_noi_dia', label: 'Thẻ ghi nợ nội địa' },
  { key: 'the_td_quoc_te', label: 'Thẻ TD quốc tế' },
  { key: 'the_td_loc_viet', label: 'Thẻ TD Lộc Việt' },
];

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
  const [profiles, setProfiles] = useState([]);
  const [optionalFiles, setOptionalFiles] = useState([]);
  const [exchangeRates, setExchangeRates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [fileList, setFileList] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [branchFilter, setBranchFilter] = useState(null);
  const [multiBranchOnly, setMultiBranchOnly] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState(null);

  async function loadPeriods(nextSelectedPeriod) {
    const { data } = await client.get('/customer-processing/periods');
    setPeriods(data || []);
    const target = nextSelectedPeriod || selectedPeriod || data?.[0]?.period_key || null;
    if (target) {
      setSelectedPeriod(target);
      const period = data.find((item) => item.period_key === target);
      setCurrentJob(period?.last_job || null);
    }
  }

  async function loadProfiles(periodKey = selectedPeriod) {
    if (!periodKey) return;
    const { data } = await client.get('/customer-processing/profiles', {
      params: {
        period_key: periodKey,
        keyword: keyword || undefined,
        branch_code: branchFilter || undefined,
        multi_branch: multiBranchOnly === null ? undefined : multiBranchOnly,
        limit: 300,
      },
    });
    setProfiles(data || []);
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
      await Promise.all([loadProfiles(periodKey), loadOptionalFiles(periodKey), loadExchangeRates(periodKey)]);
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
    loadProfiles(selectedPeriod);
    loadOptionalFiles(selectedPeriod);
    loadExchangeRates(selectedPeriod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod, keyword, branchFilter, multiBranchOnly]);

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

  const branchOptions = useMemo(() => {
    const branches = new Set();
    profiles.forEach((item) => {
      String(item.branch_codes || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((value) => branches.add(value));
    });
    return [...branches].sort().map((value) => ({ value, label: value }));
  }, [profiles]);

  const stats = useMemo(() => {
    return profiles.reduce(
      (acc, row) => {
        acc.deposit += Number(row.so_du_tien_gui || 0);
        acc.loan += Number(row.so_du_tien_vay || 0);
        acc.casa += Number(row.so_du_tgtt_binh_quan || 0);
        if (Number(row.branch_count || 0) > 1) acc.multiBranch += 1;
        return acc;
      },
      { deposit: 0, loan: 0, casa: 0, multiBranch: 0 },
    );
  }, [profiles]);

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
        <Button type="link" onClick={() => setSelectedPeriod(value)} style={{ padding: 0, fontWeight: 700 }}>
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

  const profileColumns = [
    {
      title: 'Mã KH',
      dataIndex: 'ma_kh',
      key: 'ma_kh',
      width: 130,
      fixed: 'left',
      render: (value, row) => (
        <Button
          type="link"
          size="small"
          onClick={() => {
            setDetailCustomer(row);
            setDetailOpen(true);
          }}
          style={{ padding: 0, fontWeight: 700 }}
        >
          {value}
        </Button>
      ),
    },
    {
      title: 'Tên khách hàng',
      dataIndex: 'ten_kh',
      key: 'ten_kh',
      width: 230,
      fixed: 'left',
      ellipsis: true,
    },
    {
      title: 'Loại KH',
      dataIndex: 'loai_khach_hang',
      key: 'loai_khach_hang',
      width: 100,
      render: (value) => value ? <Tag color="blue">{value}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Chi nhánh',
      dataIndex: 'branch_codes',
      key: 'branch_codes',
      width: 170,
      render: (value, row) => (
        <Space size={4} wrap>
          {String(value || '').split(',').map((item) => item.trim()).filter(Boolean).map((item) => (
            <Tag key={item} color={row.branch_count > 1 ? 'volcano' : 'geekblue'}>{item}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Số CN',
      dataIndex: 'branch_count',
      key: 'branch_count',
      width: 80,
      align: 'center',
      sorter: (a, b) => Number(a.branch_count || 0) - Number(b.branch_count || 0),
      render: (value) => value > 1 ? <Tag color="volcano">{value}</Tag> : <Tag>{value}</Tag>,
    },
    {
      title: 'CKH quy đổi',
      dataIndex: 'so_du_tien_gui',
      key: 'so_du_tien_gui',
      width: 130,
      align: 'right',
      sorter: (a, b) => Number(a.so_du_tien_gui || 0) - Number(b.so_du_tien_gui || 0),
      render: money,
    },
    {
      title: 'Dư nợ',
      dataIndex: 'so_du_tien_vay',
      key: 'so_du_tien_vay',
      width: 130,
      align: 'right',
      sorter: (a, b) => Number(a.so_du_tien_vay || 0) - Number(b.so_du_tien_vay || 0),
      render: money,
    },
    {
      title: 'Loại vay',
      dataIndex: 'loai_vay',
      key: 'loai_vay',
      width: 130,
      render: (value) => value ? <Tag color="volcano">{value}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'CRAMT',
      dataIndex: 'doanh_so_chuyen_tien_ve_tk',
      key: 'doanh_so_chuyen_tien_ve_tk',
      width: 130,
      align: 'right',
      sorter: (a, b) => Number(a.doanh_so_chuyen_tien_ve_tk || 0) - Number(b.doanh_so_chuyen_tien_ve_tk || 0),
      render: money,
    },
    {
      title: 'Dịch vụ',
      key: 'services',
      width: 180,
      render: (_, row) => {
        const used = CN05_SERVICE_DEFS.filter((service) => Number(row[service.key] || 0) > 0).length;
        return <Tag color={used ? 'green' : 'default'}>{used}/{CN05_SERVICE_DEFS.length} dịch vụ CN05</Tag>;
      },
    },
    {
      title: 'Cán bộ',
      key: 'officer',
      width: 170,
      ellipsis: true,
      render: (_, row) => row.ten_can_bo || row.ma_cb || <Text type="secondary">—</Text>,
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
            <Statistic title="Khách hàng đã xử lý" value={profiles.length} prefix={<FileDoneOutlined />} />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card size="small">
            <Statistic title="KH nhiều chi nhánh" value={stats.multiBranch} prefix={<BranchesOutlined />} />
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
              onChange={setSelectedPeriod}
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
            title="Chạy xử lý dữ liệu"
            extra={
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                disabled={!selectedPeriodInfo?.success_by_type?.DP01}
                loading={processing}
                onClick={startProcessing}
              >
                Chạy dữ liệu
              </Button>
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

      <Card
        title="Kiểm tra nhanh hồ sơ sau xử lý"
        extra={
          <Space wrap>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Tìm mã KH hoặc tên KH"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              style={{ width: 240 }}
            />
            <Select
              allowClear
              placeholder="Chi nhánh"
              value={branchFilter}
              onChange={setBranchFilter}
              options={branchOptions}
              style={{ width: 140 }}
            />
            <Select
              allowClear
              placeholder="Phạm vi"
              value={multiBranchOnly}
              onChange={setMultiBranchOnly}
              options={[
                { value: true, label: 'Nhiều chi nhánh' },
                { value: false, label: 'Một chi nhánh' },
              ]}
              style={{ width: 160 }}
            />
          </Space>
        }
      >
        <Table
          bordered
          size="small"
          rowKey="id"
          columns={profileColumns}
          dataSource={profiles}
          loading={loading}
          scroll={{ x: 1450, y: 520 }}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `${total} khách hàng` }}
          locale={{ emptyText: <Empty description="Chưa có dữ liệu xử lý cho kỳ này" /> }}
        />
      </Card>

      <Modal
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={<Button onClick={() => setDetailOpen(false)}>Đóng</Button>}
        width={820}
        title={detailCustomer ? `Chi tiết chi nhánh của khách hàng ${detailCustomer.ma_kh}` : 'Chi tiết khách hàng'}
      >
        {detailCustomer ? (
          <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            <Space wrap>
              <Tag color="blue">{detailCustomer.ten_kh}</Tag>
              <Tag color={detailCustomer.branch_count > 1 ? 'volcano' : 'default'}>
                {detailCustomer.branch_count} chi nhánh
              </Tag>
              <Tag>{detailCustomer.pgd_count} PGD</Tag>
            </Space>
            <Table
              size="small"
              rowKey={(row) => `${row.branch_code}-${row.ma_pgd || ''}`}
              pagination={false}
              dataSource={detailCustomer.branch_details || []}
              columns={[
                { title: 'Chi nhánh', dataIndex: 'branch_code', width: 90 },
                { title: 'PGD', dataIndex: 'ma_pgd', width: 90 },
                { title: 'Tên PGD', dataIndex: 'ten_pgd', ellipsis: true },
                { title: 'CKH quy đổi', dataIndex: 'so_du_tien_gui', align: 'right', render: money },
                { title: 'CRAMT', dataIndex: 'doanh_so_cramt', align: 'right', render: money },
                { title: 'Dư nợ', dataIndex: 'so_du_tien_vay', align: 'right', render: money },
                { title: 'Loại vay', dataIndex: 'loai_vay', render: (value) => value ? <Tag color="volcano">{value}</Tag> : '—' },
                { title: 'Thấu chi', dataIndex: 'thau_chi', align: 'center', render: (value) => Number(value || 0) > 0 ? <Tag color="red">Có</Tag> : <Tag>Không</Tag> },
                { title: 'Cán bộ', key: 'officer', ellipsis: true, render: (_, row) => row.ten_can_bo || row.ma_cb || '—' },
                { title: 'TGTT BQ', dataIndex: 'so_du_tgtt_binh_quan', align: 'right', render: money },
                {
                  title: 'Dịch vụ CN05',
                  key: 'cn05_services',
                  width: 220,
                  render: (_, row) => (
                    <Space size={[4, 4]} wrap>
                      {CN05_SERVICE_DEFS.map((service) => (
                        <Tag key={service.key} color={Number(row[service.key] || 0) > 0 ? 'success' : 'default'}>
                          {service.label}
                        </Tag>
                      ))}
                    </Space>
                  ),
                },
              ]}
            />
          </Space>
        ) : null}
      </Modal>
    </Space>
  );
}

export default CustomerProcessing;

