import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Select,
  Space,
  Steps,
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
  CloseCircleOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  FileDoneOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  FilterOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  LoadingOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';

import client from '../api/client';

const { Dragger } = Upload;
const { RangePicker } = DatePicker;
const { Paragraph, Text, Title } = Typography;

const requiredTypes = ['DP01', 'LN01', 'CN05', 'PF14'];
const typeColors = {
  DP01: 'gold',
  LN01: 'volcano',
  CN05: 'green',
  PF14: 'cyan',
};

const fileTypeOptions = [
  { label: 'Tất cả', value: '' },
  ...requiredTypes.map((type) => ({ label: type, value: type })),
];

const fileStatusOptions = [
  { label: 'Tất cả trạng thái', value: '' },
  { label: 'Đã import', value: 'success' },
  { label: 'Chờ xử lý', value: 'queued' },
  { label: 'Đang xử lý', value: 'processing' },
  { label: 'Đang xóa', value: 'deleting' },
  { label: 'Lỗi', value: 'error' },
  { label: 'Đã thay thế', value: 'replaced' },
  { label: 'Đã xóa', value: 'deleted' },
];

const warehouseSession = {
  fileList: [],
  importJobs: [],
  uploading: false,
  resultOpen: false,
};

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
    queued: 'default',
    success: 'success',
    error: 'error',
    deleted: 'default',
    replaced: 'warning',
    processing: 'processing',
    deleting: 'processing',
  };
  const labelMap = {
    queued: 'Chờ xử lý',
    success: 'Đã import',
    error: 'Lỗi',
    deleted: 'Đã xóa',
    replaced: 'Đã thay thế',
    processing: 'Đang xử lý',
    deleting: 'Đang xóa',
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

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function jobStepStatus(job, step) {
  const order = {
    queued: 0,
    uploading: 1,
    processing: 2,
    success: 3,
    error: 3,
  };
  const currentStep = job.status === 'queued' && job.importFileId ? 2 : order[job.status] ?? 0;
  if (job.status === 'error' && step === 3) {
    return 'error';
  }
  if (currentStep > step) {
    return 'finish';
  }
  if (currentStep === step) {
    return job.status === 'success' ? 'finish' : 'process';
  }
  return 'wait';
}

function ImportJobTimeline({ jobs }) {
  if (!jobs.length) {
    return null;
  }

  return (
    <div className="import-job-timeline">
      <Space direction="vertical" size={10} className="full-width">
        {jobs.map((job) => (
          <div className="import-job-item" key={job.uid}>
            <Space direction="vertical" size={6} className="full-width">
              <Space wrap>
                <Text strong>{job.name}</Text>
                {progressStatusTag(job.status)}
                <Text type="secondary">{job.message}</Text>
              </Space>
              <Steps
                size="small"
                responsive={false}
                items={[
                  { title: 'Đã chọn', status: jobStepStatus(job, 0) },
                  { title: 'Tải lên', status: jobStepStatus(job, 1) },
                  { title: 'Ghi kho', status: jobStepStatus(job, 2) },
                  { title: job.status === 'error' ? 'Có lỗi' : 'Hoàn tất', status: jobStepStatus(job, 3) },
                ]}
              />
            </Space>
          </div>
        ))}
      </Space>
    </div>
  );
}

function ImportData() {
  const [form] = Form.useForm();
  const [fileList, setFileListState] = useState(warehouseSession.fileList);
  const [files, setFiles] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const [uploading, setUploadingState] = useState(warehouseSession.uploading);
  const [importJobs, setImportJobsState] = useState(warehouseSession.importJobs);
  const [resultOpen, setResultOpenState] = useState(warehouseSession.resultOpen);
  const [summarizing, setSummarizing] = useState(false);
  const [deletingIds, setDeletingIds] = useState([]);

  const selectedPeriod = Form.useWatch('period_key', form);
  const filterValues = Form.useWatch([], form);

  function setFileList(nextValue) {
    const value = typeof nextValue === 'function' ? nextValue(warehouseSession.fileList) : nextValue;
    warehouseSession.fileList = value;
    setFileListState(value);
  }

  function setImportJobs(nextValue) {
    const value = typeof nextValue === 'function' ? nextValue(warehouseSession.importJobs) : nextValue;
    warehouseSession.importJobs = value;
    setImportJobsState(value);
  }

  function setUploading(nextValue) {
    const value = typeof nextValue === 'function' ? nextValue(warehouseSession.uploading) : nextValue;
    warehouseSession.uploading = value;
    setUploadingState(value);
  }

  function setResultOpen(nextValue) {
    const value = typeof nextValue === 'function' ? nextValue(warehouseSession.resultOpen) : nextValue;
    warehouseSession.resultOpen = value;
    setResultOpenState(value);
  }

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

  const activeFiles = files.filter((file) => !['deleted', 'replaced', 'deleting'].includes(file.status));
  const deletedFiles = files.filter((file) => file.status === 'deleted' || file.status === 'replaced');
  const branchCount = new Set(activeFiles.map((file) => file.branch_code)).size;
  const totalActiveSize = activeFiles.reduce((sum, file) => sum + Number(file.file_size || 0), 0);
  const branchOptions = [
    ...new Set([
      ...files.map((file) => file.branch_code).filter(Boolean),
      ...periods.flatMap((period) => period.branches || []),
    ]),
  ]
    .sort()
    .map((branch) => ({ label: branch, value: branch }));
  const statusOrder = {
    success: 0,
    processing: 1,
    queued: 2,
    deleting: 3,
    error: 4,
    replaced: 5,
    deleted: 6,
  };
  const sortedFiles = [...files].sort((a, b) => {
    const statusCompare = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    if (statusCompare !== 0) {
      return statusCompare;
    }
    return new Date(b.uploaded_at || 0).getTime() - new Date(a.uploaded_at || 0).getTime();
  });

  const uploadPreviewBase = fileList.map((item) => {
    const meta = parseFilename(item.name);
    const duplicate = meta
      ? activeFiles.find(
          (file) =>
            file.branch_code === meta.branchCode &&
            file.file_type === meta.fileType &&
            file.period_key === meta.periodKey,
        )
      : null;
    return { uid: item.uid, name: item.name, meta, size: item.size, duplicate };
  });
  const uploadKeyCounts = uploadPreviewBase.reduce((acc, item) => {
    if (item.meta) {
      const key = `${item.meta.branchCode}_${item.meta.fileType}_${item.meta.periodKey}`;
      acc[key] = (acc[key] || 0) + 1;
    }
    return acc;
  }, {});
  const uploadPreview = uploadPreviewBase.map((item) => {
    const uploadKey = item.meta ? `${item.meta.branchCode}_${item.meta.fileType}_${item.meta.periodKey}` : '';
    return { ...item, uploadKey, duplicatedInBatch: Boolean(uploadKey && uploadKeyCounts[uploadKey] > 1) };
  });

  const batchPeriods = new Set(uploadPreview.filter((item) => item.meta).map((item) => item.meta.periodKey));
  const detectedPeriod = batchPeriods.size === 1 ? [...batchPeriods][0] : '';
  const hasInvalidName = uploadPreview.some((item) => !item.meta);
  const hasMixedPeriod = batchPeriods.size > 1;
  const hasDuplicateFiles = uploadPreview.some((item) => item.duplicate);
  const hasDuplicateInBatch = uploadPreview.some((item) => item.duplicatedInBatch);
  const hasInvalidFiles = hasInvalidName || hasMixedPeriod || hasDuplicateInBatch;
  const constraintItems = [
    {
      key: 'filename',
      ok: !hasInvalidName,
      label: hasInvalidName ? 'Có file sai định dạng tên' : 'Tên file đúng chuẩn MACN_LOAI_yyyymmdd',
    },
    {
      key: 'period',
      ok: !hasMixedPeriod,
      label: hasMixedPeriod ? 'Một lượt import không được chứa nhiều kỳ' : 'Toàn bộ file cùng một kỳ dữ liệu',
    },
    {
      key: 'batch-duplicate',
      ok: !hasDuplicateInBatch,
      label: hasDuplicateInBatch ? 'Có file trùng chi nhánh, loại file và kỳ trong lượt chọn' : 'Không trùng file trong lượt chọn',
    },
    {
      key: 'warehouse-duplicate',
      ok: !hasDuplicateFiles,
      warning: hasDuplicateFiles,
      label: hasDuplicateFiles ? 'Có file đã tồn tại trong kho, import sẽ thay thế bản đang dùng' : 'Không trùng file đang dùng trong kho',
    },
  ];
  const successJobs = importJobs.filter((job) => job.status === 'success').length;
  const errorJobs = importJobs.filter((job) => job.status === 'error').length;
  const errorDetails = importJobs.filter((job) => job.status === 'error');

  async function loadFiles() {
    setLoadingFiles(true);
    try {
      const params = {};
      const values = form.getFieldsValue();
      if (values.period_key) params.period_key = values.period_key;
      if (values.file_type) params.file_type = values.file_type;
      if (values.branch_code) params.branch_code = values.branch_code;
      if (values.status) params.status = values.status;
      if (values.keyword) params.keyword = values.keyword;
      if (values.uploaded_range?.[0]) params.uploaded_from = values.uploaded_range[0].format('YYYY-MM-DD');
      if (values.uploaded_range?.[1]) params.uploaded_to = values.uploaded_range[1].format('YYYY-MM-DD');
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
          params: { replace_existing: true, background: true },
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
        const isBackgroundJob = data.status === 'queued' || data.status === 'processing';
        updateJob(item.uid, {
          importFileId: data.id,
          status: isBackgroundJob ? data.status : 'success',
          percent: data.status === 'queued' ? 96 : isBackgroundJob ? 98 : 100,
          durationMs: Date.now() - startedAt,
          message: isBackgroundJob
            ? 'File đã tải lên máy chủ và đang chờ backend xử lý. Theo dõi trạng thái trong bảng Kho dữ liệu.'
            : `${data.success_rows || 0} dòng hợp lệ. Hãy tổng hợp kỳ sau khi import đủ file.`,
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
    setDeletingIds((ids) => [...ids, fileId]);
    try {
      await client.delete(`/imports/files/${fileId}`, { params: { background: true }, timeout: 30 * 60 * 1000 });
      message.success('Đã đưa file vào hàng chờ xóa. Hãy theo dõi trạng thái trong bảng kho dữ liệu.');
      await refreshAll();
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setDeletingIds((ids) => ids.filter((id) => id !== fileId));
    }
  }

  async function summarizeSelectedPeriod() {
    const periodKey = form.getFieldValue('period_key');
    if (!periodKey) {
      message.warning('Chọn một kỳ dữ liệu trước khi tổng hợp');
      return;
    }
    setSummarizing(true);
    try {
      const { data } = await client.post(`/imports/summarize/${periodKey}`, null, { timeout: 30 * 60 * 1000 });
      message.success(`Đã tổng hợp ${data.summary_rows || 0} khách hàng cho kỳ ${periodKey}`);
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setSummarizing(false);
    }
  }

  const fileColumns = [
    {
      title: 'File dữ liệu',
      dataIndex: 'original_filename',
      key: 'original_filename',
      width: 420,
      fixed: 'left',
      render: (value, row) => (
        <div className="warehouse-file-cell">
          <span className={`file-icon file-icon-${row.file_type?.toLowerCase()}`}>{fileIcon(value)}</span>
          <div className="warehouse-file-meta">
            <Tooltip title={value}>
              <Text strong className="warehouse-file-name">
                {value}
              </Text>
            </Tooltip>
            <Text type="secondary" className="warehouse-file-subtitle">
              {periodLabel(row.period_key)} · {row.branch_code} · {row.file_type}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: 'Chi nhánh',
      dataIndex: 'branch_code',
      key: 'branch_code',
      width: 105,
      align: 'center',
      render: (value) => <Tag color="red">{value}</Tag>,
    },
    { title: 'Loại', dataIndex: 'file_type', key: 'file_type', width: 95, align: 'center', render: fileTypeTag },
    {
      title: 'Kỳ dữ liệu',
      dataIndex: 'period_key',
      key: 'period_key',
      width: 145,
      render: (value) => (
        <div className="warehouse-period-cell">
          <Text strong>{value}</Text>
          <Text type="secondary">{periodLabel(value)}</Text>
        </div>
      ),
    },
    {
      title: 'Dòng hợp lệ',
      dataIndex: 'success_rows',
      key: 'success_rows',
      width: 120,
      align: 'right',
      render: (value) => <Text>{Number(value || 0).toLocaleString('vi-VN')}</Text>,
    },
    {
      title: 'Dung lượng',
      dataIndex: 'file_size',
      key: 'file_size',
      width: 120,
      align: 'right',
      render: (value) => <Text>{formatBytes(value)}</Text>,
    },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 135, align: 'center', render: statusTag },
    {
      title: 'Thời gian',
      dataIndex: 'uploaded_at',
      key: 'uploaded_at',
      width: 170,
      render: (value) => {
        if (!value) return '';
        const uploadedAt = new Date(value);
        return (
          <div className="warehouse-time-cell">
            <Text>{uploadedAt.toLocaleDateString('vi-VN')}</Text>
            <Text type="secondary">{uploadedAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</Text>
          </div>
        );
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 120,
      align: 'center',
      fixed: 'right',
      render: (_, row) =>
        ['deleted', 'replaced', 'deleting'].includes(row.status) ? (
          <Tag>{row.status === 'deleting' ? 'Đang xóa' : 'Đã lưu lịch sử'}</Tag>
        ) : (
          <Popconfirm
            title="Xóa file khỏi kỳ dữ liệu?"
            description="Dữ liệu chi tiết của file sẽ được gỡ khỏi báo cáo, lịch sử import vẫn còn."
            okText="Xóa"
            cancelText="Hủy"
            onConfirm={() => deleteFile(row.id)}
          >
            <Button danger size="small" icon={<DeleteOutlined />} loading={deletingIds.includes(row.id)}>
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
      render: (value, row) =>
        value ? formatSeconds(value) : row.status === 'processing' || row.status === 'uploading' ? <LoadingOutlined /> : '',
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadFiles();
    }, 450);
    return () => window.clearTimeout(timer);
  }, [JSON.stringify(filterValues || {})]);

  useEffect(() => {
    const hasPendingJob = importJobs.some((job) => job.importFileId && ['queued', 'processing'].includes(job.status));
    if (!hasPendingJob) {
      return undefined;
    }

    const timer = window.setInterval(async () => {
      try {
        const [{ data: fileData }, { data: periodData }] = await Promise.all([
          client.get('/imports/files'),
          client.get('/imports/periods'),
        ]);
        const nextFiles = getArrayPayload(fileData);
        const fileById = new Map(nextFiles.map((file) => [file.id, file]));
        setFiles(nextFiles);
        setPeriods(getArrayPayload(periodData));
        setImportJobs((jobs) =>
          jobs.map((job) => {
            const file = fileById.get(job.importFileId);
            if (!file) {
              return job;
            }
            if (!['queued', 'processing', 'success', 'error'].includes(file.status)) {
              return job;
            }
            const finished = file.status === 'success' || file.status === 'error';
            return {
              ...job,
              status: file.status,
              percent: file.status === 'queued' ? 96 : file.status === 'processing' ? 98 : 100,
              durationMs: finished && !job.durationMs && job.startedAt ? Date.now() - job.startedAt : job.durationMs,
              message:
                file.status === 'success'
                  ? `${file.success_rows || 0} dòng hợp lệ. Hãy tổng hợp kỳ sau khi import đủ file.`
                  : file.status === 'error'
                    ? file.error_message || 'Import không thành công'
                    : job.message,
            };
          }),
        );
      } catch {
        // Polling chỉ để cập nhật giao diện; lỗi tạm thời sẽ được thử lại ở vòng sau.
      }
    }, 4000);

    return () => window.clearInterval(timer);
  }, [importJobs]);

  return (
    <Space direction="vertical" size={20} className="page-stack">
      <section className="brand-panel warehouse-hero">
        <div>
          <Tag color="gold">Kho dữ liệu theo kỳ</Tag>
          <Title level={2}>Quản trị file dữ liệu khách hàng</Title>
          <Paragraph>
            Kỳ dữ liệu được tự động trích từ tên file. Khi chọn nhiều file, toàn bộ file phải cùng một ngày chốt,
            ví dụ 20260630 là kỳ Tháng 6/2026.
          </Paragraph>
        </div>
        <DatabaseOutlined className="brand-panel-icon" />
      </section>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8} xl={5}>
          <Card className="metric-card">
            <Statistic title="Kỳ dữ liệu" value={periods.length} prefix={<FolderOpenOutlined />} loading={loadingPeriods} />
          </Card>
        </Col>
        <Col xs={24} md={8} xl={5}>
          <Card className="metric-card">
            <Statistic title="File đang dùng" value={activeFiles.length} prefix={<FileDoneOutlined />} loading={loadingFiles} />
          </Card>
        </Col>
        <Col xs={24} md={8} xl={5}>
          <Card className="metric-card">
            <Statistic title="Chi nhánh" value={branchCount} prefix={<BankOutlined />} loading={loadingFiles} />
          </Card>
        </Col>
        <Col xs={24} md={8} xl={5}>
          <Card className="metric-card">
            <Statistic title="Tổng dung lượng" value={formatBytes(totalActiveSize)} prefix={<DatabaseOutlined />} loading={loadingFiles} />
          </Card>
        </Col>
        <Col xs={24} md={8} xl={4}>
          <Card className="metric-card">
            <Statistic title="Lịch sử xóa/thay thế" value={deletedFiles.length} prefix={<HistoryOutlined />} loading={loadingFiles} />
          </Card>
        </Col>
      </Row>

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
              <Text strong>Kiểm tra ràng buộc theo kỳ</Text>
              <Space wrap>
                <Tag color={detectedPeriod ? 'gold' : 'error'}>
                  {detectedPeriod ? `${detectedPeriod} · ${periodLabel(detectedPeriod)}` : 'Chưa xác định được một kỳ duy nhất'}
                </Tag>
                {constraintItems.map((item) => (
                  <Tag key={item.key} color={item.warning ? 'warning' : item.ok ? 'success' : 'error'}>
                    {item.label}
                  </Tag>
                ))}
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
                          : item.duplicatedInBatch
                            ? 'File bị trùng chi nhánh, loại file và kỳ trong chính lượt chọn này'
                          : item.duplicate
                            ? `Đã có file ${item.duplicate.original_filename} trong kho. Import sẽ thay thế dữ liệu đang dùng.`
                            : 'Hợp lệ'
                    }
                  >
                    <Tag
                      color={!item.meta || hasMixedPeriod || item.duplicatedInBatch ? 'error' : item.duplicate ? 'warning' : typeColors[item.meta.fileType]}
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
        <ImportJobTimeline jobs={importJobs} />
      </Card>

      <Card
        title={
          <Space size={12} className="warehouse-filter-title">
            <span className="warehouse-filter-title-icon">
              <FilterOutlined />
            </span>
            <Space direction="vertical" size={0}>
              <Text strong>Bộ lọc kho dữ liệu</Text>
              <Text type="secondary">Tìm file theo kỳ, chi nhánh, trạng thái và thời gian upload</Text>
            </Space>
          </Space>
        }
        className="warehouse-filter-card"
      >
        <Form form={form} layout="vertical" initialValues={{ period_key: '', file_type: '', branch_code: '', status: '' }}>
          <div className="warehouse-filter-grid">
            <div className="warehouse-filter-main">
              <Form.Item label="Tìm kiếm file" name="keyword">
                <Input size="large" allowClear prefix={<SearchOutlined />} placeholder="Nhập tên file gốc hoặc file lưu trong kho" />
              </Form.Item>
            </div>

            <Form.Item label="Kỳ dữ liệu" name="period_key">
              <Select
                size="large"
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Tất cả kỳ"
                options={periods.map((period) => ({
                  label: `${period.period_key} · ${periodLabel(period.period_key)}`,
                  value: period.period_key,
                }))}
              />
            </Form.Item>

            <Form.Item label="Chi nhánh" name="branch_code">
              <Select
                size="large"
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Tất cả chi nhánh"
                options={branchOptions}
              />
            </Form.Item>

            <Form.Item label="Loại file" name="file_type">
              <Select size="large" options={fileTypeOptions} />
            </Form.Item>

            <Form.Item label="Trạng thái" name="status">
              <Select size="large" options={fileStatusOptions} />
            </Form.Item>

            <div className="warehouse-filter-range">
              <Form.Item label="Thời gian upload" name="uploaded_range">
                <RangePicker size="large" className="full-width" format="DD/MM/YYYY" />
              </Form.Item>
            </div>
          </div>

          <div className="warehouse-filter-toolbar">
            <Space wrap>
              <Button type="primary" size="large" icon={<SearchOutlined />} onClick={loadFiles}>
                Lọc dữ liệu
              </Button>
              <Button
                size="large"
                icon={<ReloadOutlined />}
                onClick={() => {
                  form.resetFields();
                  refreshAll();
                }}
              >
                Tải lại kho
              </Button>
            </Space>
            <Button
              size="large"
              icon={<DatabaseOutlined />}
              loading={summarizing}
              disabled={!selectedPeriod}
              onClick={summarizeSelectedPeriod}
            >
              Tổng hợp kỳ
            </Button>
          </div>
        </Form>
      </Card>

      <Card title="Các kỳ dữ liệu">
        <Row gutter={[12, 12]}>
          {periods.length ? (
            periods.map((period) => (
              <Col xs={24} md={12} xl={6} key={period.period_key}>
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
                    {period.file_count || 0} file đang dùng · {formatBytes(period.total_size)} · {period.history_count || 0} lịch sử
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

      <Card
        title={
          <Space direction="vertical" size={0}>
            <Text strong>File trong kho dữ liệu</Text>
            <Text type="secondary">{sortedFiles.length} file theo điều kiện lọc hiện tại</Text>
          </Space>
        }
        className="warehouse-table-card"
      >
        <Table
          rowKey="id"
          columns={fileColumns}
          dataSource={sortedFiles}
          loading={loadingFiles}
          size="middle"
          className="warehouse-file-table"
          rowClassName={(row) => `warehouse-row-${row.status || 'default'}`}
          scroll={{ x: 1320 }}
          pagination={{ pageSize: 5, showSizeChanger: false }}
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
