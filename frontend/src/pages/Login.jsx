import { DatabaseOutlined, LockOutlined, SafetyCertificateOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, Space, Typography, message } from 'antd';

import client from '../api/client';
import logoUrl from '../../favicon.jpg';

const { Paragraph, Text, Title } = Typography;

function Login({ onLogin }) {
  async function handleSubmit(values) {
    try {
      const { data } = await client.post('/auth/login', values);
      onLogin(data.user);
      message.success(`Xin chào ${data.user.full_name}`);
    } catch (error) {
      message.error(error.response?.data?.detail || 'Không thể đăng nhập');
    }
  }

  return (
    <main className="login-page">
      <section className="login-intro">
        <div className="login-brand">
          <img src={logoUrl} alt="C360" />
          <Title level={1}>C360</Title>
        </div>
        <Text className="login-kicker">Hệ thống quản lý khách hàng tập trung</Text>
        <Paragraph>
          Chuẩn hóa dữ liệu khách hàng, kiểm soát import CSV/Excel và tổng hợp báo cáo phục vụ quản trị kinh doanh.
        </Paragraph>
        <div className="login-feature-grid">
          <div>
            <DatabaseOutlined />
            <span>Kho dữ liệu</span>
          </div>
          <div>
            <TeamOutlined />
            <span>Phân quyền</span>
          </div>
          <div>
            <SafetyCertificateOutlined />
            <span>Kiểm soát</span>
          </div>
        </div>
      </section>

      <section className="login-form-wrap">
        <Card className="login-card">
          <Space orientation="vertical" size={8} className="full-width login-card-heading">
            <span className="login-card-icon">
              <SafetyCertificateOutlined />
            </span>
            <Title level={3}>Đăng nhập</Title>
            <Text type="secondary">Sử dụng mã nhân viên hoặc tài khoản quản trị được cấp.</Text>
          </Space>

          <Form layout="vertical" onFinish={handleSubmit} className="login-form">
            <Form.Item label="Mã nhân viên / Tài khoản" name="username" rules={[{ required: true, message: 'Nhập mã nhân viên hoặc tài khoản' }]}>
              <Input size="large" prefix={<UserOutlined />} placeholder="Ví dụ: 200702563 hoặc admin" autoFocus />
            </Form.Item>
            <Form.Item label="Mật khẩu" name="password" rules={[{ required: true, message: 'Nhập mật khẩu' }]}>
              <Input.Password size="large" prefix={<LockOutlined />} placeholder="Mật khẩu" />
            </Form.Item>
            <Button type="primary" htmlType="submit" size="large" block>
              Đăng nhập
            </Button>
          </Form>

          <div className="login-hint">
            Mật khẩu mặc định: <Text code>1</Text>
          </div>
        </Card>
      </section>
    </main>
  );
}

export default Login;

