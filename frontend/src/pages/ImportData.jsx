import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd';
import {
  BankOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  FileDoneOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  LoadingOutlined,
  ReloadOutlined,
  SearchOutlined,
  WarningOutlined,
} from '@ant-design/icons';

import client from '../api/client';

const { Dragger } = Upload;
const { Paragraph, Text, Title } = Typography;

const requiredTypes = ['DP01', 'LN01', 'CN05', 'PF14'];
const typeColors = {
  DP01: 'gold',
  LN01: 'volcano',
  CN05: 'green',
  PF14: 'cyan',
};

const typeHints = {
  DP01: 'Khách hàng, tài khoản, tiền gửi',
  LN01: 'Khoản vay, dư nợ, cán bộ',
  CN05: 'Dịch vụ khách hàng đang dùng',
  PF14: 'Số dư bình quân CASA',
};

const fileTypeOptions = [
  { label: 'Tất cả', value: '' },
  ...requiredTypes.map((type) => ({ label: type, value: type })),
];

function getArrayPayload(data) {
  return Array.isArray(data) ? data : data?.value || [];
}

function periodLabel(periodKey) {
  if (!periodKey || periodKey.length !== 8) {
    return 'Chưa rõ kỳ';
  }
  const month = Number(periodKey.slice(4, 6));
  const year = periodKey.slice(0, 4);
  return `Tháng ${month}/${year}`;
}

function parseFilename(name) {
  const match = /^(\d+)_(CN05|DP01|LN01|PF14)_(\d{8})\.(csv|xlsx)$/i.exec(name || '');
  if (!match) {
    return null;
  }
  const periodKey = match[3];
  const month = Number(periodKey.slice(4, 6));
  const day = Number(periodKey.slice(6, 8));
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return {
    branchCode: match[1],
    fileType: match[2].toUpperCase(),
    periodKey,
    ext: match[4].toLowerCase(),
  };
}

function statusTag(value) {
  const colorMap = {
    success: 'success',
    error: 'error',
    deleted: 'default',
    replaced: 'warning',
    processing: 'processing',
  };
  const labelMap = {
    success: 'Đã import',
    error: 'Lỗi',
    deleted: 'Đã xóa',
    replaced: 'Đã thay thế',
    processing: 'Đang xử lý',
  };
  return <Tag color={colorMap[value] || 'default'}>{labelMap[value] || value}</Tag>;
}

function progressStatusTag(status) {
  const map = {
    queued: ['default', 'Chờ import'],
    uploading: ['processing', 'Đang tải lên'],
    processing: ['processing', 'Đang ghi kho'],
    success: ['success', 'Thành công'],
    error: ['error', 'Không thành công'],
  };
  const [color, label] = map[status] || map.queued;
  return <Tag color={color}>{label}</Tag>;
}

function fileTypeTag(type) {
  return <Tag color={typeColors[type] || 'default'}>{type}</Tag>;
}

function fileIcon(filename) {
  return filename?.toLowerCase().endsWith('.xlsx') ? <FileExcelOutlined /> : <FileTextOutlined />;
}

function formatSeconds(ms) {
  if (!ms) {
    return '';
  }
  return `${Math.max(1, Math.round(ms / 1000))} giây`;
}

function ImportData() {
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState([]);
  const [files, setFiles] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importJobs, setImportJobs] = useState([]);
  const [resultOpen, setResultOpen] = useState(false);

  const selectedPeriod = Form.useWatch('period_key', form);

  const uploadProps = useMemo(
    () => ({
      multiple: true,
      fileList,
      beforeUpload: () => false,
      onChange: ({ fileList: nextFileList }) => setFileList(nextFileList),
      accept: '.csv,.xlsx',
      showUploadList: false,
    }),
    [fileList],
  );

  const activeFiles = files.filter((file) => file.status !== 'deleted');
  const deletedFiles = files.filter((file) => file.status === 'deleted');
  const branchCount = new Set(activeFiles.map((file) => file.branch_code)).size;
  const activeTypes = new Set(activeFiles.map((file) => file.file_type));
  const completeness = Math.round((requiredTypes.filter((type) => activeTypes.has(type)).length / requiredTypes.length) * 100);

  const uploadPreview = fileList.map((item) => {
    const meta = parseFilename(item.name);
    const duplicate = meta
      ? activeFiles.find(
          (file) =>
            file.status !== 'deleted' &&
            file.branch_code === meta.branchCode &&
            file.file_type === meta.fileType &&
            file.period_key === meta.periodKey,
        )
      : null;
    return { uid: item.uid, name: item.name, meta, size: item.size, duplicate };
  });

  const batchPeriods = new Set(uploadPreview.filter((item) => item.meta).map((item) => item.meta.periodKey));
  const detectedPeriod = batchPeriods.size === 1 ? [...batchPeriods][0] : '';
  const hasInvalidName = uploadPreview.some((item) => !item.meta);
  const hasMixedPeriod = batchPeriods.size > 1;
  const hasDuplicateFiles = uploadPreview.some((item) => item.duplicate);
  const hasInvalidFiles = hasInvalidName || hasMixedPeriod;
  const successJobs = importJobs.filter((job) => job.status === 'success').length;
  const errorJobs = importJobs.filter((job) => job.status === 'error').length;
  const errorDetails = importJobs.filter((job) => job.status === 'error');

  async function loadFiles() {
    setLoadingFiles(true);
    try {
      const params = {};
      const periodKey = form.getFieldValue('period_key');
      const fileType = form.getFieldValue('file_type');
      if (periodKey) {
        params.period_key = periodKey;
      }
      if (fileType) {
        params.file_type = fileType;
      }
      const { data } = await client.get('/imports/files', { params });
      setFiles(getArrayPayload(data));
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setLoadingFiles(false);
    }
  }

  async function loadPeriods() {
    setLoadingPeriods(true);
    try {
      const { data } = await client.get('/imports/periods');
      setPeriods(getArrayPayload(data));
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setLoadingPeriods(false);
    }
  }

  async function refreshAll() {
    await Promise.all([loadFiles(), loadPeriods()]);
  }

  function updateJob(uid, patch) {
    setImportJobs((jobs) => jobs.map((job) => (job.uid === uid ? { ...job, ...patch } : job)));
  }

  function removeSelectedFile(uid) {
    setFileList((items) => items.filter((item) => item.uid !== uid));
  }

  async function uploadFiles() {
    if (!fileList.length) {
      message.warning('Chọn ít nhất một file CSV hoặc Excel');
      return;
    }
    if (hasInvalidFiles) {
      message.error('Có file sai tên hoặc không cùng kỳ dữ liệu');
      return;
    }

    const jobs = uploadPreview.map((item) => ({
      uid: item.uid,
      name: item.name,
      meta: item.meta,
      duplicate: item.duplicate,
      status: 'queued',
      percent: 0,
      startedAt: null,
      durationMs: null,
      message: '',
    }));
    setImportJobs(jobs);
    setResultOpen(false);
    setUploading(true);

    for (const item of fileList) {
      const startedAt = Date.now();
      const formData = new FormData();
      formData.append('file', item.originFileObj);
      updateJob(item.uid, { status: 'uploading', startedAt, percent: 5 });

      try {
        const { data } = await client.post('/imports/upload', formData, {
          params: { replace_existing: true },
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 30 * 60 * 1000,
          onUploadProgress: (event) => {
            if (!event.total) {
              return;
            }
            const percent = Math.min(95, Math.round((event.loaded / event.total) * 90));
            updateJob(item.uid, { percent, status: percent >= 90 ? 'processing' : 'uploading' });
          },
        });
        updateJob(item.uid, {
          status: 'success',
          percent: 100,
          durationMs: Date.now() - startedAt,
          message: `${data.success_rows || 0} dòng hợp lệ`,
        });
      } catch (error) {
        updateJob(item.uid, {
          status: 'error',
          percent: 100,
          durationMs: Date.now() - startedAt,
          message: error.response?.data?.detail || error.message,
        });
      }
    }

    setUploading(false);
    setFileList([]);
    setResultOpen(true);
    if (detectedPeriod) {
      form.setFieldsValue({ period_key: detectedPeriod, file_type: '' });
    }
    await refreshAll();
  }

  async function deleteFile(fileId) {
    try {
      await client.delete(`/imports/files/${fileId}`);
      message.success('Đã xóa file khỏi dữ liệu phân tích, lịch sử vẫn được giữ lại');
      await refreshAll();
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    }
  }

  const fileColumns = [
    {
      title: 'File dữ liệu',
      dataIndex: 'original_filename',
      key: 'original_filename',
      render: (value, row) => (
        <Space size={12}>
          <span className={`file-icon file-icon-${row.file_type?.toLowerCase()}`}>{fileIcon(value)}</span>
          <Space direction="vertical" size={2}>
            <Text strong>{value}</Text>
            <Text type="secondary">
              {periodLabel(row.period_key)} · {row.branch_code} · {row.file_type}
            </Text>
          </Space>
        </Space>
      ),
    },
    { title: 'Chi nhánh', dataIndex: 'branch_code', key: 'branch_code', width: 95 },
    { title: 'Loại', dataIndex: 'file_type', key: 'file_type', width: 100, render: fileTypeTag },
    {
      title: 'Kỳ dữ liệu',
      dataIndex: 'period_key',
      key: 'period_key',
      width: 150,
      render: (value) => (
        <Space direction="vertical" size={0}>
          <Text>{value}</Text>
          <Text type="secondary">{periodLabel(value)}</Text>
        </Space>
      ),
    },
    { title: 'Dòng hợp lệ', dataIndex: 'success_rows', key: 'success_rows', width: 110 },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 125, render: statusTag },
    {
      title: 'Thời gian',
      dataIndex: 'uploaded_at',
      key: 'uploaded_at',
      width: 185,
      render: (value) => (value ? new Date(value).toLocaleString('vi-VN') : ''),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      fixed: 'right',
      render: (_, row) =>
        row.status === 'deleted' ? (
          <Tag>Đã lưu lịch sử</Tag>
        ) : (
          <Popconfirm
            title="Xóa file khỏi kỳ dữ liệu?"
            description="Dữ liệu chi tiết của file sẽ được gỡ khỏi báo cáo, lịch sử import vẫn còn."
            okText="Xóa"
            cancelText="Hủy"
            onConfirm={() => deleteFile(row.id)}
          >
            <Button danger size="small" icon={<DeleteOutlined />}>
              Xóa
            </Button>
          </Popconfirm>
        ),
    },
  ];

  const progressColumns = [
    {
      title: 'File',
      dataIndex: 'name',
      key: 'name',
      render: (value, row) => (
        <Space direction="vertical" size={2}>
          <Text strong>{value}</Text>
          <Text type="secondary">
            {row.meta?.branchCode} · {row.meta?.fileType} · {row.meta?.periodKey}
          </Text>
        </Space>
      ),
    },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 150, render: progressStatusTag },
    {
      title: 'Tiến trình',
      dataIndex: 'percent',
      key: 'percent',
      width: 220,
      render: (value, row) => (
        <Progress
          percent={value}
          size="small"
          status={row.status === 'error' ? 'exception' : row.status === 'success' ? 'success' : 'active'}
        />
      ),
    },
    {
      title: 'Thời gian',
      dataIndex: 'durationMs',
      key: 'durationMs',
      width: 120,
      render: (value, row) => value ? formatSeconds(value) : row.status === 'processing' || row.status === 'uploading' ? <LoadingOutlined /> : '',
    },
    { title: 'Kết quả/Lý do', dataIndex: 'message', key: 'message' },
  ];

  const errorColumns = [
    { title: 'File', dataIndex: 'name', key: 'name', width: 260 },
    {
      title: 'Thông tin',
      key: 'meta',
      width: 220,
      render: (_, row) => `${row.meta?.branchCode || ''} · ${row.meta?.fileType || ''} · ${row.meta?.periodKey || ''}`,
    },
    { title: 'Lý do lỗi', dataIndex: 'message', key: 'message' },
  ];

  useEffect(() => {
    refreshAll();
  }, []);

  return (
    <Space direction="vertical" size={20} className="page-stack">
      <section className="brand-panel warehouse-hero">
        <div>
          <Tag color="gold">Kho dữ liệu theo kỳ</Tag>
          <Title level={2}>Quản trị file dữ liệu khách hàng</Title>
          <Paragraph>
            Kỳ dữ liệu được tự động trích từ tên file. Khi chọn nhiều file, toàn bộ file phải thuộc cùng một ngày chốt, ví dụ 20260630 là kỳ Tháng 6/2026.
          </Paragraph>
        </div>
        <DatabaseOutlined className="brand-panel-icon" />
      </section>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={6}>
          <Card className="metric-card">
            <Statistic title="Kỳ dữ liệu" value={periods.length} prefix={<FolderOpenOutlined />} loading={loadingPeriods} />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card className="metric-card">
            <Statistic title="File đang dùng" value={activeFiles.length} prefix={<FileDoneOutlined />} loading={loadingFiles} />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card className="metric-card">
            <Statistic title="Chi nhánh" value={branchCount} prefix={<BankOutlined />} loading={loadingFiles} />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card className="metric-card">
            <Statistic title="Lịch sử xóa/thay thế" value={deletedFiles.length} prefix={<HistoryOutlined />} loading={loadingFiles} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} align="stretch">
        <Col span={24}>
          <Card title="Thêm dữ liệu vào kho" className="warehouse-card">
           

            <Dragger {...uploadProps} className="warehouse-dropzone">
              <p className="ant-upload-drag-icon">
                <CloudUploadOutlined />
              </p>
              <p className="ant-upload-text">Kéo thả nhiều file dữ liệu vào đây</p>
              <p className="ant-upload-hint">Ví dụ: 2600_DP01_20260630.csv, 2600_LN01_20260630.csv, 2602_CN05_20260630.csv</p>
            </Dragger>

            {uploadPreview.length ? (
              <div className="upload-preview-panel">
                <Space direction="vertical" size={12} className="full-width">
                  <Space wrap>
                    <Tag color={detectedPeriod ? 'gold' : 'error'}>
                      {detectedPeriod ? `${detectedPeriod} · ${periodLabel(detectedPeriod)}` : 'Chưa xác định được một kỳ duy nhất'}
                    </Tag>
                    <Tag color={hasInvalidName ? 'error' : 'success'}>
                      {hasInvalidName ? 'Có file sai định dạng' : 'Tên file hợp lệ'}
                    </Tag>
                    <Tag color={hasMixedPeriod ? 'error' : 'success'}>
                      {hasMixedPeriod ? 'Nhiều kỳ trong một lượt import' : 'Cùng kỳ dữ liệu'}
                    </Tag>
                    <Tag color={hasDuplicateFiles ? 'warning' : 'success'}>
                      {hasDuplicateFiles ? 'Có file đã tồn tại trong kho' : 'Không trùng file đang dùng'}
                    </Tag>
                  </Space>
                  <div className="upload-preview">
                    {uploadPreview.map((item) => (
                      <Tooltip
                        key={item.uid}
                        title={
                          !item.meta
                            ? 'Sai định dạng tên file'
                            : hasMixedPeriod
                              ? 'Lượt import đang có nhiều kỳ dữ liệu'
                              : item.duplicate
                                ? `Đã có file ${item.duplicate.original_filename} trong kho. Import sẽ thay thế dữ liệu đang dùng.`
                                : 'Hợp lệ'
                        }
                      >
                        <Tag
                          color={!item.meta || hasMixedPeriod ? 'error' : item.duplicate ? 'warning' : typeColors[item.meta.fileType]}
                          closable={!uploading}
                          closeIcon={<CloseCircleOutlined />}
                          onClose={(event) => {
                            event.preventDefault();
                            removeSelectedFile(item.uid);
                          }}
                        >
                          {item.meta ? `${item.meta.branchCode} · ${item.meta.fileType} · ${item.meta.periodKey}` : item.name}
                        </Tag>
                      </Tooltip>
                    ))}
                  </div>
                </Space>
              </div>
            ) : null}

            <div className="form-actions">
              <Button type="primary" loading={uploading} disabled={hasInvalidFiles} onClick={uploadFiles}>
                Đưa vào kho dữ liệu
              </Button>
            </div>
          </Card>
        </Col>

      </Row>

      <Card title="Bộ lọc kho dữ liệu">
        <Form form={form} layout="vertical" initialValues={{ period_key: '', file_type: '' }}>
          <Row gutter={[16, 16]} align="bottom">
            <Col xs={24} md={8}>
              <Form.Item label="Kỳ dữ liệu" name="period_key">
                <Select
                  allowClear
                  placeholder="Tất cả kỳ"
                  options={periods.map((period) => ({
                    label: `${period.period_key} · ${periodLabel(period.period_key)}`,
                    value: period.period_key,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item label="Loại file" name="file_type">
                <Select options={fileTypeOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Space wrap>
                <Button icon={<SearchOutlined />} onClick={loadFiles}>
                  Lọc dữ liệu
                </Button>
                <Button icon={<ReloadOutlined />} onClick={refreshAll}>
                  Tải lại kho
                </Button>
              </Space>
            </Col>
          </Row>
        </Form>
      </Card>

      <Row gutter={[16, 16]} align="stretch">
        <Col xs={24} xl={9}>
          <Card title="Checklist kỳ đang xem" className="warehouse-card">
            <Space direction="vertical" size={16} className="full-width">
              <Progress percent={completeness} strokeColor="#8f1438" />
              {requiredTypes.map((type) => {
                const hasType = activeTypes.has(type);
                return (
                  <div className="source-row" key={type}>
                    <Space>
                      {hasType ? <CheckCircleOutlined className="ok-text" /> : <WarningOutlined className="warning-text" />}
                      {fileTypeTag(type)}
                    </Space>
                    <Text type="secondary">{typeHints[type]}</Text>
                  </div>
                );
              })}
            </Space>
          </Card>
        </Col>
        <Col xs={24} xl={15}>
          <Card title="Các kỳ dữ liệu">
            <Row gutter={[12, 12]}>
              {periods.length ? (
                periods.map((period) => (
                  <Col xs={24} md={12} xl={8} key={period.period_key}>
                    <button
                      type="button"
                      className="period-tile"
                      onClick={() => {
                        form.setFieldsValue({ period_key: period.period_key, file_type: '' });
                        setTimeout(loadFiles, 0);
                      }}
                    >
                      <Text strong>{periodLabel(period.period_key)}</Text>
                      <Text type="secondary">{period.period_key}</Text>
                      <Space wrap size={4}>
                        {(period.file_types || []).map((type) => (
                          <Tag color={typeColors[type]} key={type}>
                            {type}
                          </Tag>
                        ))}
                      </Space>
                      <Space wrap size={4}>
                        {(period.branches || []).slice(0, 5).map((branch) => (
                          <Tag key={branch}>{branch}</Tag>
                        ))}
                      </Space>
                      <Text type="secondary">
                        {period.file_count || 0} file đang dùng · {period.history_count || 0} lịch sử
                      </Text>
                    </button>
                  </Col>
                ))
              ) : (
                <Col span={24}>
                  <Empty description="Chưa có kỳ dữ liệu" />
                </Col>
              )}
            </Row>
          </Card>
        </Col>
      </Row>

      <Card title="File trong kho dữ liệu">
        <Table
          rowKey="id"
          columns={fileColumns}
          dataSource={files}
          loading={loadingFiles}
          scroll={{ x: 1180 }}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          locale={{ emptyText: <Empty description="Chưa có file dữ liệu" /> }}
        />
      </Card>

      <Modal
        title="Kết quả lượt import"
        open={resultOpen}
        onCancel={() => setResultOpen(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setResultOpen(false)}>
            Đóng
          </Button>,
        ]}
        width={980}
      >
        <Space direction="vertical" size={16} className="full-width">
          <Row gutter={[12, 12]}>
            <Col xs={24} md={8}>
              <Card size="small">
                <Statistic title="Tổng file" value={importJobs.length} />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card size="small">
                <Statistic title="Thành công" value={successJobs} valueStyle={{ color: '#218653' }} />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card size="small">
                <Statistic title="Không thành công" value={errorJobs} valueStyle={{ color: '#c62828' }} />
              </Card>
            </Col>
          </Row>

          <Table
            rowKey="uid"
            size="small"
            columns={progressColumns}
            dataSource={importJobs}
            pagination={false}
            locale={{ emptyText: <Empty description="Chưa có lượt import" /> }}
          />

          <Card size="small" title="Bảng lỗi chi tiết">
            <Table
              rowKey="uid"
              size="small"
              columns={errorColumns}
              dataSource={errorDetails}
              pagination={false}
              locale={{ emptyText: <Empty description="Không có file lỗi" /> }}
            />
          </Card>
        </Space>
      </Modal>
    </Space>
  );
}

export default ImportData;
