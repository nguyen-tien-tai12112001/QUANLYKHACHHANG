import { useState } from 'react';
import { BarChartOutlined, CheckCircleFilled, DatabaseOutlined, EyeInvisibleOutlined, EyeOutlined, LoadingOutlined, LockOutlined, SafetyCertificateOutlined, UserOutlined, WarningOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Typography, message } from 'antd';

import client from '../api/client';
import { apiErrorMessage } from '../auth/passwordPolicy';
import logoUrl from '../../favicon.jpg';
import './LoginProduction.css';

const { Paragraph, Text, Title } = Typography;

function getOrCreateDeviceId() {
  const stored = localStorage.getItem('c360_device_id');
  if (stored) return stored;
  const cryptoApi = globalThis.crypto;
  const value = typeof cryptoApi?.randomUUID === 'function'
    ? cryptoApi.randomUUID()
    : `c360-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  localStorage.setItem('c360_device_id', value);
  return value;
}

export default function LoginProduction({ onLogin }) {
  const [submitting, setSubmitting] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [loginError, setLoginError] = useState('');

  async function handleSubmit(values) {
    setSubmitting(true);
    setLoginError('');
    try {
      const { data } = await client.post('/auth/login', { ...values, device_id: getOrCreateDeviceId() }, { hideGlobalLoading: true });
      onLogin(data.user, data.access_token, data.session_policy);
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
        <div className="login-ambient" aria-hidden="true">
          <span className="login-ambient-orb is-one" />
          <span className="login-ambient-orb is-two" />
          <span className="login-ambient-beam" />
        </div>
        <div className="login-brand">
          <span className="login-brand-mark"><img src={logoUrl} alt="Agribank C360" /></span>
          <div>
            <Title level={1}>C360</Title>
            <Text>NỀN TẢNG DỮ LIỆU KHÁCH HÀNG</Text>
          </div>
        </div>

        <div className="login-intro-body">
          <div className="login-copy">
            <Text className="login-kicker"><span /> Trung tâm dữ liệu khách hàng số</Text>
            <Title level={2} className="login-headline">
              Dữ liệu hợp nhất.<br />
              <span>Thấu hiểu khách hàng.</span><br />
              Điều hành hiệu quả.
            </Title>
            <Paragraph className="login-description">Kết nối hồ sơ CIF với dữ liệu nghiệp vụ, mang đến góc nhìn khách hàng toàn diện, nhất quán và an toàn.</Paragraph>
          </div>

          <div className="login-data-scene" aria-hidden="true">
            <div className="login-scene-halo" />
            <div className="login-scene-ring ring-one" />
            <div className="login-scene-ring ring-two" />
            <div className="login-scene-ring ring-three" />
            <div className="login-data-core">
              <span className="login-core-pulse" />
              <span className="login-core-logo"><img src={logoUrl} alt="" /></span>
              <strong>C360</strong><small>DATA CORE</small>
            </div>
            <span className="login-data-node node-cif"><i />CIF</span>
            <span className="login-data-node node-deposit"><i />TIỀN GỬI</span>
            <span className="login-data-node node-loan"><i />TIỀN VAY</span>
            <span className="login-data-node node-service"><i />SẢN PHẨM</span>
            <span className="login-data-node node-risk"><i />RỦI RO</span>
          </div>

          <div className="login-feature-grid">
            <div className="login-feature-card"><span className="login-feature-icon"><DatabaseOutlined /></span><span>Hồ sơ 360°</span><small>Dữ liệu hợp nhất, truy vết rõ ràng</small></div>
            <div className="login-feature-card"><span className="login-feature-icon"><BarChartOutlined /></span><span>Phân tích nghiệp vụ</span><small>Theo kỳ, đơn vị và cán bộ</small></div>
            <div className="login-feature-card"><span className="login-feature-icon"><SafetyCertificateOutlined /></span><span>Truy cập an toàn</span><small>Đúng vai trò, đúng phạm vi</small></div>
          </div>
        </div>

        <div className="login-intro-foot">
          <span><CheckCircleFilled /> Vận hành độc lập trong hạ tầng nội bộ</span>
          <span className="login-live-indicator"><i /> Hệ thống sẵn sàng</span>
        </div>
      </section>

      <section className="login-form-wrap">
        <div className="login-form-pattern" aria-hidden="true" />
        <div className="login-card">
          <span className="login-card-glow" aria-hidden="true" />
          <div className="login-card-status"><i /> KẾT NỐI NỘI BỘ AN TOÀN</div>
          <div className="login-card-heading">
            <span className="login-card-icon"><LockOutlined /></span>
            <div>
              <Text className="login-form-kicker">TRUY CẬP HỆ THỐNG</Text>
              <Title level={2}>Chào mừng trở lại</Title>
              <Text type="secondary">Đăng nhập để tiếp tục làm việc trên C360.</Text>
            </div>
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
          <Form layout="vertical" onFinish={handleSubmit} onValuesChange={() => loginError && setLoginError('')} className="login-form" requiredMark={false}>
            <Form.Item label="Mã nhân viên / Tài khoản" name="username" rules={[{ required: true, message: 'Nhập mã nhân viên hoặc tài khoản' }]}>
              <Input size="large" prefix={<UserOutlined />} placeholder="Nhập mã nhân viên hoặc tài khoản" autoFocus autoComplete="username" />
            </Form.Item>
            <Form.Item label="Mật khẩu" name="password" rules={[{ required: true, message: 'Nhập mật khẩu' }]}>
              <Input.Password size="large" prefix={<LockOutlined />} placeholder="Nhập mật khẩu" autoComplete="current-password" iconRender={(visible) => visible ? <EyeOutlined title="Ẩn mật khẩu" /> : <EyeInvisibleOutlined title="Hiện mật khẩu" />} onKeyDown={(event) => setCapsLock(event.getModifierState?.('CapsLock'))} onKeyUp={(event) => setCapsLock(event.getModifierState?.('CapsLock'))} onBlur={() => setCapsLock(false)} />
            </Form.Item>
            {capsLock ? <div className="login-caps-warning" role="status"><WarningOutlined /> Caps Lock đang bật; mật khẩu có phân biệt chữ hoa và chữ thường.</div> : null}
            {submitting ? <div className="login-submit-status" role="status" aria-live="polite"><LoadingOutlined spin /><span><strong>Đang đăng nhập</strong><small>Hệ thống đang xác thực tài khoản và phạm vi truy cập…</small></span></div> : null}
            <Button type="primary" htmlType="submit" size="large" block loading={submitting} icon={!submitting ? <SafetyCertificateOutlined /> : null}>
              {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </Button>
          </Form>
          <div className="login-security-note"><SafetyCertificateOutlined /><span><strong>Phiên truy cập được bảo vệ</strong><small>Không chia sẻ mật khẩu và luôn đăng xuất khi rời máy.</small></span></div>
          <div className="login-copyright"><span>C360</span><i />@Agribank Chi nhánh Bắc Ninh</div>
        </div>
      </section>
    </main>
  );
}
