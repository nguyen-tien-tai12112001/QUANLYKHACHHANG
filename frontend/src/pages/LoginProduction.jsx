import { useState } from 'react';
import { BarChartOutlined, CheckCircleFilled, DatabaseOutlined, LockOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Typography, message } from 'antd';

import client from '../api/client';
import { apiErrorMessage } from '../auth/passwordPolicy';
import logoUrl from '../../favicon.jpg';
import './LoginProduction.css';

const { Paragraph, Text, Title } = Typography;

export default function LoginProduction({ onLogin }) {
  const [submitting, setSubmitting] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [loginError, setLoginError] = useState('');

  async function handleSubmit(values) {
    setSubmitting(true);
    setLoginError('');
    try {
      const { data } = await client.post('/auth/login', values, { hideGlobalLoading: true });
      onLogin(data.user, data.access_token);
      if (!data.user.must_change_password) message.success(`Xin chào ${data.user.full_name}`);
    } catch (error) {
      const errorText = apiErrorMessage(error, 'Không thể đăng nhập. Vui lòng kiểm tra lại kết nối.');
      setLoginError(errorText);
      message.error(errorText);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-intro">
        <div className="login-intro-orb is-one" />
        <div className="login-intro-orb is-two" />
        <div className="login-brand">
          <img src={logoUrl} alt="C360" />
          <div><Title level={1}>C360</Title><Text>NỀN TẢNG DỮ LIỆU KHÁCH HÀNG</Text></div>
        </div>
        <Text className="login-kicker"><span /> Hệ thống quản lý khách hàng tập trung</Text>
        <Title level={2} className="login-headline">Một góc nhìn thống nhất cho mọi quan hệ khách hàng</Title>
        <Paragraph>Tập trung dữ liệu, phân tích nghiệp vụ và hỗ trợ điều hành trên cùng một nền tảng an toàn trong mạng nội bộ.</Paragraph>
        <div className="login-feature-grid">
          <div><DatabaseOutlined /><span>Kho dữ liệu hợp nhất</span><small>CIF và nguồn nghiệp vụ</small></div>
          <div><BarChartOutlined /><span>Phân tích tức thời</span><small>Theo kỳ và đơn vị</small></div>
          <div><SafetyCertificateOutlined /><span>Kiểm soát truy cập</span><small>Theo vai trò và phạm vi</small></div>
        </div>
        <div className="login-intro-foot"><CheckCircleFilled /> Vận hành độc lập trong hạ tầng nội bộ</div>
      </section>

      <section className="login-form-wrap">
        <div className="login-card">
          <div className="login-card-heading">
            <span className="login-card-icon"><LockOutlined /></span>
            <Text className="login-form-kicker">TRUY CẬP HỆ THỐNG</Text>
            <Title level={2}>Đăng nhập C360</Title>
            <Text type="secondary">Sử dụng tài khoản được quản trị viên cấp cho bạn.</Text>
          </div>
          {loginError ? (
            <Alert
              type="error"
              showIcon
              closable
              message="Đăng nhập chưa thành công"
              description={loginError}
              onClose={() => setLoginError('')}
              style={{ marginBottom: 16 }}
            />
          ) : null}
          <Form layout="vertical" onFinish={handleSubmit} className="login-form" requiredMark={false}>
            <Form.Item label="Mã nhân viên / Tài khoản" name="username" rules={[{ required: true, message: 'Nhập mã nhân viên hoặc tài khoản' }]}>
              <Input size="large" prefix={<UserOutlined />} placeholder="Nhập mã nhân viên hoặc tài khoản" autoFocus autoComplete="username" />
            </Form.Item>
            <Form.Item label="Mật khẩu" name="password" rules={[{ required: true, message: 'Nhập mật khẩu' }]}>
              <Input.Password size="large" prefix={<LockOutlined />} placeholder="Nhập mật khẩu" autoComplete="current-password" onKeyDown={(event) => setCapsLock(event.getModifierState?.('CapsLock'))} onKeyUp={(event) => setCapsLock(event.getModifierState?.('CapsLock'))} onBlur={() => setCapsLock(false)} />
            </Form.Item>
            {capsLock ? <div className="login-caps-warning">Caps Lock đang bật</div> : null}
            <Button type="primary" htmlType="submit" size="large" block loading={submitting} icon={!submitting ? <SafetyCertificateOutlined /> : null}>
              {submitting ? 'Đang xác thực...' : 'Đăng nhập an toàn'}
            </Button>
          </Form>
          <div className="login-security-note"><SafetyCertificateOutlined /><span><strong>Kết nối được bảo vệ</strong><small>Không chia sẻ mật khẩu và luôn đăng xuất khi rời máy.</small></span></div>
          <div className="login-copyright">C360 · Hệ thống sử dụng nội bộ</div>
        </div>
      </section>
    </main>
  );
}
