import { useEffect, useState } from 'react';
import {
  ApiOutlined,
  BankOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
} from '@ant-design/icons';
import { Alert, Card, Col, Row, Space, Spin, Statistic, Tag, Typography } from 'antd';

import client from '../api/client';

const { Paragraph, Title } = Typography;

const initialStatus = {
  loading: true,
  backend: 'checking',
  database: 'checking',
  message: '',
};

function StatusCard({ title, status, icon }) {
  const isOk = status === 'connected' || status === 'ok';
  const color = status === 'checking' ? 'processing' : isOk ? 'success' : 'error';
  const text = status === 'checking' ? 'Đang kiểm tra' : isOk ? 'Hoạt động' : 'Lỗi kết nối';

  return (
    <Card className="status-card">
      <Space direction="vertical" size={12}>
        <Space size={12}>
          <span className={`status-icon status-icon-${isOk ? 'ok' : 'error'}`}>{icon}</span>
          <Typography.Text strong>{title}</Typography.Text>
        </Space>
        <Tag color={color}>{text}</Tag>
      </Space>
    </Card>
  );
}

function Dashboard() {
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    async function loadHealth() {
      try {
        const { data } = await client.get('/health');
        setStatus({
          loading: false,
          backend: data.status === 'ok' ? 'ok' : 'error',
          database: data.database === 'connected' ? 'connected' : 'disconnected',
          message: data.message || '',
        });
      } catch (error) {
        const responseMessage = error.response?.data?.message;
        setStatus({
          loading: false,
          backend: 'error',
          database: 'disconnected',
          message: responseMessage || error.message || 'Không thể kết nối backend',
        });
      }
    }

    loadHealth();
  }, []);

  return (
    <Space direction="vertical" size={24} className="page-stack">
      <section className="brand-panel">
        <div>
          <Tag color="gold">Agribank Bắc Ninh</Tag>
          <Title level={2}>Quản lý khách hàng</Title>
          <Paragraph>
            Kho dữ liệu khách hàng theo kỳ, hỗ trợ import CSV/Excel, tổng hợp theo mã khách hàng chuẩn và theo dõi phát triển dịch vụ.
          </Paragraph>
        </div>
        <BankOutlined className="brand-panel-icon" />
      </section>

      {status.loading ? <Spin /> : null}

      {status.message ? (
        <Alert type="error" showIcon message="Không thể kết nối hệ thống" description={status.message} />
      ) : null}

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <StatusCard title="Trạng thái Backend" status={status.backend} icon={<ApiOutlined />} />
        </Col>
        <Col xs={24} md={12}>
          <StatusCard title="Trạng thái Database" status={status.database} icon={<DatabaseOutlined />} />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="Nguồn dữ liệu chính" value="4" suffix="loại file" prefix={<FileSearchOutlined />} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="Khóa khách hàng" value="MA_KH_CHUAN" />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="Chu kỳ báo cáo" value="Theo tháng" />
          </Card>
        </Col>
      </Row>
    </Space>
  );
}

export default Dashboard;

