import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Row,
  Segmented,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  DownloadOutlined,
  FieldTimeOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';

import client from '../api/client';

const { Paragraph, Text, Title } = Typography;

const pendingColumns = new Set([
  'e_banking',
  'the_td_loc_viet',
  'tt_tien_dien',
  'tt_tien_nuoc',
  'tt_cuoc_vien_thong',
  'tra_luong_qua_the',
  'batd',
  'batk',
  'bh_oto_xe_may',
  'bh_khac',
  'bao_lanh',
  'loa_bien_dong_so_du',
  'phan_mem_ban_hang',
  'pos',
  'chi_tra_kieu_hoi',
  'phat_hanh_lc',
  'thanh_toan_quoc_te',
  'mua_ban_ngoai_te',
  'tong_loi_ich_thang',
  'ghi_chu',
]);

const moneyFormatter = new Intl.NumberFormat('vi-VN');

function money(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  return moneyFormatter.format(Number(value || 0));
}

function serviceTag(value, key) {
  const pending = pendingColumns.has(key);
  if (pending) {
    return <Tag>Chờ nguồn</Tag>;
  }
  return Number(value || 0) > 0 ? <Tag color="success">Đã dùng</Tag> : <Tag color="error">Chưa</Tag>;
}

function sourceTag(source) {
  const colors = {
    DP01: 'gold',
    LN01: 'volcano',
    PF14: 'cyan',
    CN05: 'green',
    MANUAL: 'default',
  };
  return <Tag color={colors[source] || 'default'}>{source}</Tag>;
}

function serviceColumn(title, dataIndex, width = 112) {
  return {
    title: (
      <Tooltip title={pendingColumns.has(dataIndex) ? 'Cột đang chờ bổ sung nguồn dữ liệu hoặc mapping nghiệp vụ' : 'Đã có logic tổng hợp từ dữ liệu import'}>
        <span>{title}</span>
      </Tooltip>
    ),
    dataIndex,
    key: dataIndex,
    width,
    align: 'center',
    render: (value) => serviceTag(value, dataIndex),
  };
}

const reportColumns = [
  {
    title: 'Thông tin khách hàng',
    children: [
      { title: 'STT', key: 'stt', width: 70, fixed: 'left', render: (_, __, index) => index + 1 },
      { title: 'Mã CN', dataIndex: 'ma_cn', key: 'ma_cn', width: 90, fixed: 'left' },
      { title: 'Mã PGD', dataIndex: 'ma_pgd', key: 'ma_pgd', width: 95 },
      { title: 'Mã KH chuẩn', dataIndex: 'ma_kh_chuan', key: 'ma_kh_chuan', width: 160, fixed: 'left' },
      { title: 'Tên khách hàng', dataIndex: 'ten_kh', key: 'ten_kh', width: 240 },
      { title: 'Loại KH', dataIndex: 'loai_khach_hang', key: 'loai_khach_hang', width: 140 },
    ],
  },
  {
    title: 'Vay, tiền gửi và CASA',
    children: [
      { title: 'Số dư tiền vay', dataIndex: 'so_du_tien_vay', key: 'so_du_tien_vay', width: 150, align: 'right', render: money },
      { title: 'Số dư tiền gửi CKH', dataIndex: 'so_du_tien_gui_ckh', key: 'so_du_tien_gui_ckh', width: 170, align: 'right', render: money },
      { title: 'Loại vay', dataIndex: 'loai_vay', key: 'loai_vay', width: 200 },
      { title: 'Doanh số chuyển tiền về TK', dataIndex: 'doanh_so_chuyen_tien_ve_tai_khoan', key: 'doanh_so_chuyen_tien_ve_tai_khoan', width: 210, align: 'right', render: money },
      { title: 'Số dư TGTT bình quân', dataIndex: 'so_du_tgtt_binh_quan', key: 'so_du_tgtt_binh_quan', width: 180, align: 'right', render: money },
    ],
  },
  {
    title: 'Tình hình sử dụng sản phẩm dịch vụ Agribank',
    children: [
      serviceColumn('Thấu chi', 'thau_chi'),
      serviceColumn('TK số đẹp', 'tk_so_dep'),
      serviceColumn('Agribank plus', 'agribank_plus', 130),
      serviceColumn('Tin nhắn OTT', 'tin_nhan_ott', 130),
      serviceColumn('e-Banking', 'e_banking'),
      serviceColumn('SMS nhắc nợ vay', 'sms_nhac_no_vay', 145),
      serviceColumn('SMS tiền gửi', 'sms_tien_gui', 130),
      serviceColumn('Thẻ ghi nợ nội địa', 'the_ghi_no_noi_dia', 155),
      serviceColumn('Thẻ TD quốc tế', 'the_td_quoc_te', 145),
      serviceColumn('Thẻ TD Lộc Việt', 'the_td_loc_viet', 145),
      serviceColumn('TT tiền điện', 'tt_tien_dien', 120),
      serviceColumn('TT tiền nước', 'tt_tien_nuoc', 120),
      serviceColumn('TT cước viễn thông', 'tt_cuoc_vien_thong', 165),
      serviceColumn('Trả lương qua thẻ', 'tra_luong_qua_the', 150),
      serviceColumn('BATD', 'batd', 90),
      serviceColumn('BATK', 'batk', 90),
      serviceColumn('BH ô tô, xe máy', 'bh_oto_xe_may', 145),
      serviceColumn('BH khác', 'bh_khac', 100),
      serviceColumn('Bảo lãnh', 'bao_lanh', 105),
      serviceColumn('Loa biến động số dư', 'loa_bien_dong_so_du', 165),
      serviceColumn('Phần mềm bán hàng', 'phan_mem_ban_hang', 155),
      serviceColumn('POS', 'pos', 90),
      serviceColumn('Chi trả kiều hối', 'chi_tra_kieu_hoi', 145),
      serviceColumn('Phát hành LC', 'phat_hanh_lc', 120),
      serviceColumn('Thanh toán quốc tế', 'thanh_toan_quoc_te', 150),
      serviceColumn('Mua bán ngoại tệ', 'mua_ban_ngoai_te', 145),
    ],
  },
  {
    title: 'Hiệu quả và quản lý',
    children: [
      { title: 'Tổng lợi ích tháng', dataIndex: 'tong_loi_ich_thang', key: 'tong_loi_ich_thang', width: 160, align: 'right', render: () => <Tag>Chờ nguồn</Tag> },
      { title: 'Mã CB', dataIndex: 'ma_cb', key: 'ma_cb', width: 120 },
      { title: 'Tên cán bộ', dataIndex: 'ten_can_bo', key: 'ten_can_bo', width: 200 },
      { title: 'Ghi chú', dataIndex: 'ghi_chu', key: 'ghi_chu', width: 180, render: (value) => value || <Tag>Chờ nhập</Tag> },
    ],
  },
];

const sourceGroups = [
  { label: 'Thông tin KH', source: 'DP01', note: 'Mã CN, mã KH, tên KH, loại KH, PGD' },
  { label: 'Tiền gửi', source: 'DP01', note: 'Số dư tiền gửi, doanh số DR/CR' },
  { label: 'Khoản vay', source: 'LN01', note: 'Dư nợ, loại vay, cán bộ quản lý' },
  { label: 'CASA bình quân', source: 'PF14', note: 'Số dư TGTT bình quân trong tháng' },
  { label: 'Dịch vụ', source: 'CN05', note: 'Thấu chi, số đẹp, Agribank Plus, SMS, thẻ' },
  { label: 'Bổ sung', source: 'MANUAL', note: 'Các cột chưa có nguồn rõ sẽ nhập/mapping sau' },
];

function CustomerReport() {
  const [form] = Form.useForm();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState('report');

  async function loadReport() {
    const periodKey = form.getFieldValue('period_key');
    if (!periodKey) {
      message.warning('Nhập kỳ dữ liệu trước khi xem báo cáo');
      return;
    }

    setLoading(true);
    try {
      const { data } = await client.get('/imports/summary', {
        params: { period_key: periodKey, limit: 1000 },
      });
      setRows(Array.isArray(data) ? data : data.value || []);
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setLoading(false);
    }
  }

  async function summarizePeriod() {
    const periodKey = form.getFieldValue('period_key');
    if (!periodKey) {
      message.warning('Nhập kỳ dữ liệu trước khi tổng hợp');
      return;
    }

    setLoading(true);
    try {
      await client.post(`/imports/summarize/${periodKey}`);
      message.success('Đã chạy lại tổng hợp kỳ dữ liệu');
      await loadReport();
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.loan += Number(row.so_du_tien_vay || 0);
        acc.deposit += Number(row.so_du_tien_gui_ckh || 0);
        acc.casa += Number(row.so_du_tgtt_binh_quan || 0);
        return acc;
      },
      { loan: 0, deposit: 0, casa: 0 },
    );
  }, [rows]);

  useEffect(() => {
    form.setFieldsValue({ period_key: '' });
  }, [form]);

  return (
    <Space direction="vertical" size={20} className="page-stack">
      <div>
        <Title level={2}>Bảng quản lý khách hàng cá nhân vay vốn</Title>
        <Paragraph className="dashboard-description">
          Giao diện tổ chức theo mẫu BANG QUAN LY KHACH HANG.xlsx, giữ sẵn các cột đang chờ nguồn để hoàn thiện mapping dần.
        </Paragraph>
      </div>

      <Card>
        <Form form={form} layout="vertical">
          <Row gutter={[16, 16]} align="bottom">
            <Col xs={24} md={7}>
              <Form.Item label="Kỳ dữ liệu" name="period_key">
                <Input placeholder="Ví dụ: 20240630" maxLength={8} prefix={<FieldTimeOutlined />} />
              </Form.Item>
            </Col>
            <Col xs={24} md={7}>
              <Form.Item label="Chế độ xem">
                <Segmented
                  block
                  value={viewMode}
                  onChange={setViewMode}
                  options={[
                    { label: 'Báo cáo', value: 'report' },
                    { label: 'Nguồn dữ liệu', value: 'sources' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Space wrap>
                <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={loadReport}>
                  Xem báo cáo
                </Button>
                <Button icon={<ReloadOutlined />} loading={loading} onClick={summarizePeriod}>
                  Chạy lại tổng hợp
                </Button>
                <Button icon={<DownloadOutlined />} disabled>
                  Xuất Excel
                </Button>
              </Space>
            </Col>
          </Row>
        </Form>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={6}>
          <Card><Statistic title="Khách hàng" value={rows.length} /></Card>
        </Col>
        <Col xs={24} md={6}>
          <Card><Statistic title="Tổng dư nợ" value={stats.loan} formatter={money} /></Card>
        </Col>
        <Col xs={24} md={6}>
          <Card><Statistic title="Tổng tiền gửi" value={stats.deposit} formatter={money} /></Card>
        </Col>
        <Col xs={24} md={6}>
          <Card><Statistic title="TGTT bình quân" value={stats.casa} formatter={money} /></Card>
        </Col>
      </Row>

      {viewMode === 'sources' ? (
        <Card title="Theo dõi nguồn dữ liệu">
          <Row gutter={[12, 12]}>
            {sourceGroups.map((item) => (
              <Col xs={24} md={8} key={item.label}>
                <div className="source-tile">
                  <Space direction="vertical" size={8}>
                    <Text strong>{item.label}</Text>
                    {sourceTag(item.source)}
                    <Text type="secondary">{item.note}</Text>
                  </Space>
                </div>
              </Col>
            ))}
          </Row>
          <Alert
            className="report-alert"
            type="info"
            showIcon
            message="Các cột đang chờ nguồn vẫn xuất hiện trên bảng để giữ đúng cấu trúc mẫu Excel."
          />
        </Card>
      ) : (
        <Card title="Bảng báo cáo theo mẫu">
          <Table
            bordered
            size="small"
            rowKey="ma_kh_chuan"
            columns={reportColumns}
            dataSource={rows}
            loading={loading}
            scroll={{ x: 5200, y: 560 }}
            pagination={{ pageSize: 25, showSizeChanger: true }}
            locale={{ emptyText: <Empty description="Chưa có dữ liệu báo cáo cho kỳ này" /> }}
          />
        </Card>
      )}
    </Space>
  );
}

export default CustomerReport;

