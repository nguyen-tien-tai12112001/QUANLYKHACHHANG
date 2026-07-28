import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
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
  return (
    <Space orientation="vertical" size={18} style={{ width: '100%' }}>
      <Alert
        showIcon
        type="info"
        message="Kho CIF đang chờ cấu hình nguồn"
        description="Các chỉ số sẽ được cập nhật từ database thật sau khi chốt cấu trúc cột, quy tắc tách mã chi nhánh và mã khách hàng lõi."
      />
      <Row gutter={[14, 14]}>
        <Col xs={24} sm={12} xl={6}><Card className="cif-metric cif-metric--blue"><Statistic title="Khách hàng duy nhất" value="—" prefix={<TeamOutlined />} /><Text type="secondary">Theo mã khách hàng lõi</Text></Card></Col>
        <Col xs={24} sm={12} xl={6}><Card className="cif-metric cif-metric--green"><Statistic title="Mã CIF đầy đủ" value="—" prefix={<DatabaseOutlined />} /><Text type="secondary">Tất cả mã tại 7 chi nhánh</Text></Card></Col>
        <Col xs={24} sm={12} xl={6}><Card className="cif-metric cif-metric--purple"><Statistic title="Khách hàng đa chi nhánh" value="—" prefix={<ApartmentOutlined />} /><Text type="secondary">Một khách hàng có nhiều mã CIF</Text></Card></Col>
        <Col xs={24} sm={12} xl={6}><Card className="cif-metric cif-metric--red"><Statistic title="Cần đối chiếu" value="—" prefix={<WarningOutlined />} /><Text type="secondary">Mã lỗi, trùng hoặc xung đột</Text></Card></Col>
      </Row>
      <Row gutter={[14, 14]}>
        <Col xs={24} xl={15}>
          <Card title="Phân bố khách hàng theo chi nhánh" className="cif-panel">
            <EmptyState
              icon={<ApartmentOutlined />}
              title="Chưa có dữ liệu chi nhánh"
              description="Biểu đồ sẽ hiển thị số mã CIF và số khách hàng duy nhất tại từng chi nhánh sau lần import đầu tiên."
            />
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card title="Chất lượng định danh" className="cif-panel">
            <Space orientation="vertical" size={16} style={{ width: '100%' }}>
              {['Mã CIF hợp lệ', 'Có CCCD/MST', 'Có số điện thoại', 'Không xung đột'].map((label) => (
                <div key={label}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}><Text>{label}</Text><Text type="secondary">Chưa có dữ liệu</Text></Space>
                  <Progress percent={0} showInfo={false} strokeColor="#d7dee8" />
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
  const selected = fileList[0];
  return (
    <Row gutter={[18, 18]}>
      <Col xs={24} xl={15}>
        <Card title="Import dữ liệu CIF" className="cif-panel">
          <Alert
            showIcon
            type="warning"
            message="Chưa chốt cấu trúc cột CIF"
            description="Bạn có thể chọn file để chuẩn bị, nhưng hệ thống chưa ghi dữ liệu vào database cho đến khi có file mẫu và quy tắc kiểm tra chính thức."
            style={{ marginBottom: 16 }}
          />
          <Dragger
            accept=".csv,.xlsx"
            maxCount={1}
            beforeUpload={() => false}
            fileList={fileList}
            onChange={({ fileList: next }) => setFileList(next.slice(-1))}
            onRemove={() => setFileList([])}
            className="cif-upload"
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Kéo thả hoặc chọn file CIF</p>
            <p className="ant-upload-hint">Hỗ trợ CSV và XLSX. File lớn sẽ được xử lý nền theo từng lô.</p>
          </Dragger>
          {selected ? (
            <div className="cif-selected-file">
              <FileSearchOutlined />
              <div><Text strong>{selected.name}</Text><Text type="secondary">{fileSize(selected.size)} · Chờ tiền kiểm cấu trúc</Text></div>
              <Tag color="warning">Chưa kiểm tra</Tag>
            </div>
          ) : null}
          <Space style={{ marginTop: 16 }}>
            <Button
              type="primary"
              icon={<FileSearchOutlined />}
              disabled={!selected}
              onClick={() => message.info('Cần file mẫu và cấu trúc cột CIF trước khi bật tiền kiểm.')}
            >
              Kiểm tra trước khi import
            </Button>
            <Button disabled icon={<CloudUploadOutlined />}>Xác nhận import</Button>
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
  return (
    <Card className="cif-panel" title="Danh sách khách hàng CIF" extra={<Tag>Phân trang từ backend</Tag>}>
      <Table
        rowKey="id"
        dataSource={[]}
        pagination={false}
        columns={[
          { title: 'Mã khách hàng lõi', dataIndex: 'core_code', width: 180 },
          { title: 'Khách hàng', dataIndex: 'customer_name' },
          { title: 'Số chi nhánh', dataIndex: 'branch_count', width: 130 },
          { title: 'Cập nhật gần nhất', dataIndex: 'updated_at', width: 180 },
          { title: 'Trạng thái', dataIndex: 'status', width: 140 },
        ]}
        locale={{
          emptyText: <Empty description="Chưa có dữ liệu CIF. Cấu trúc cột bảng sẽ được hoàn thiện theo file mẫu." />,
        }}
      />
    </Card>
  );
}

function ReconciliationTab() {
  return (
    <Row gutter={[14, 14]}>
      <Col xs={24} md={8}><Card className="cif-status-card"><WarningOutlined /><strong>Mã không hợp lệ</strong><span>Chưa có dữ liệu</span></Card></Col>
      <Col xs={24} md={8}><Card className="cif-status-card"><SafetyCertificateOutlined /><strong>Nghi trùng khách hàng</strong><span>Chưa có dữ liệu</span></Card></Col>
      <Col xs={24} md={8}><Card className="cif-status-card"><AuditOutlined /><strong>Xung đột định danh</strong><span>Chưa có dữ liệu</span></Card></Col>
      <Col span={24}>
        <Card title="Danh sách cần đối chiếu" className="cif-panel">
          <EmptyState
            icon={<CheckCircleOutlined />}
            title="Chưa có bản ghi cần xử lý"
            description="Sau import, các trường hợp cùng mã lõi nhưng khác CCCD/MST hoặc một CCCD có nhiều mã lõi sẽ xuất hiện tại đây."
          />
        </Card>
      </Col>
    </Row>
  );
}

function HistoryTab() {
  return (
    <Card title="Lịch sử cập nhật kho CIF" className="cif-panel">
      <Table
        rowKey="id"
        dataSource={[]}
        pagination={false}
        columns={[
          { title: 'File CIF', dataIndex: 'filename' },
          { title: 'Thời gian', dataIndex: 'created_at', width: 180 },
          { title: 'Tổng dòng', dataIndex: 'total_rows', width: 120 },
          { title: 'Thêm mới', dataIndex: 'inserted_rows', width: 110 },
          { title: 'Cập nhật', dataIndex: 'updated_rows', width: 110 },
          { title: 'Xung đột', dataIndex: 'conflict_rows', width: 110 },
          { title: 'Trạng thái', dataIndex: 'status', width: 140 },
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
          <Tag color="purple">CUSTOMER MASTER DATA</Tag>
          <Title level={2}>Kho dữ liệu CIF khách hàng</Title>
          <Paragraph type="secondary">
            Quản lý nguồn khách hàng gốc, mã CIF tại nhiều chi nhánh, chất lượng định danh và toàn bộ lịch sử cập nhật.
          </Paragraph>
        </div>
        <Tag color="warning">Chờ cấu hình file mẫu</Tag>
      </div>
      <Tabs className="cif-tabs" items={items} destroyOnHidden />
    </Space>
  );
}
