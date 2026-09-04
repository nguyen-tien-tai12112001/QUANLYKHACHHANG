import { useMemo, useState } from 'react';
import {
  CheckCircleFilled,
  KeyOutlined,
  LockOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Form, Input, Progress, Typography, message } from 'antd';

import client from '../api/client';
import { apiErrorMessage, evaluatePassword } from '../auth/passwordPolicy';
import logoUrl from '../../favicon.jpg';
import './ForcedPasswordChange.css';

const { Text, Title } = Typography;

export default function ForcedPasswordChange({ user, onChanged, onLogout }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const evaluation = useMemo(() => evaluatePassword(newPassword), [newPassword]);
  const strength = {
    weak: { label: 'Yếu', color: '#cf3d49' },
    medium: { label: 'Trung bình', color: '#d69020' },
    good: { label: 'Khá', color: '#2d7fb8' },
    strong: { label: 'An toàn', color: '#16805e' },
  }[evaluation.level];

  async function submit(values) {
    setSaving(true);
    try {
      const { data } = await client.post('/auth/change-password', values, { hideGlobalLoading: true });
      if (data.access_token) localStorage.setItem('access_token', data.access_token);
      message.success('Mật khẩu đã được cập nhật. Bạn có thể sử dụng hệ thống.');
      onChanged(data.user, data.access_token);
    } catch (error) {
      message.error(apiErrorMessage(error, 'Không thể cập nhật mật khẩu'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="forced-password-page">
      <section className="forced-password-shell">
        <aside className="forced-password-context">
          <div className="forced-password-brand"><img src={logoUrl} alt="Agribank C360" /><span>C360</span></div>
          <div className="forced-password-symbol"><SafetyCertificateOutlined /></div>
          <Text className="forced-password-kicker">BẢO VỆ TÀI KHOẢN</Text>
          <Title level={1}>Thiết lập mật khẩu của riêng bạn</Title>
          <Text className="forced-password-description">
            Đây là lần đăng nhập đầu tiên hoặc mật khẩu vừa được quản trị viên đặt lại. Hãy đổi mật khẩu tạm thời trước khi truy cập dữ liệu khách hàng.
          </Text>
          <div className="forced-password-user">
            <span><UserOutlined /></span>
            <div><small>Tài khoản đang xác thực</small><strong>{user?.full_name || user?.display_name}</strong><Text>{user?.employee_code || user?.username}</Text></div>
          </div>
        </aside>

        <section className="forced-password-form-panel">
          <div className="forced-password-form-heading">
            <span><KeyOutlined /></span>
            <div><Title level={3}>Đổi mật khẩu lần đầu</Title><Text type="secondary">Hoàn thành một lần để tiếp tục vào hệ thống.</Text></div>
          </div>
          <Form form={form} layout="vertical" onFinish={submit} requiredMark={false} className="forced-password-form">
            <Form.Item label="Mật khẩu tạm thời" name="current_password" rules={[{ required: true, message: 'Nhập mật khẩu đang sử dụng' }]}>
              <Input.Password size="large" prefix={<LockOutlined />} autoComplete="current-password" placeholder="Nhập mật khẩu hiện tại" autoFocus />
            </Form.Item>
            <Form.Item label="Mật khẩu mới" name="new_password" rules={[
              { required: true, message: 'Nhập mật khẩu mới' },
              { validator: (_, value) => evaluatePassword(value).valid ? Promise.resolve() : Promise.reject(new Error('Mật khẩu chưa đáp ứng đủ yêu cầu')) },
            ]}>
              <Input.Password size="large" prefix={<KeyOutlined />} autoComplete="new-password" placeholder="Tạo mật khẩu an toàn" onChange={(event) => setNewPassword(event.target.value)} />
            </Form.Item>

            <div className={`password-strength is-${evaluation.level}`}>
              <div className="password-strength-head"><Text strong>Mức độ an toàn</Text><Text style={{ color: strength.color }}>{strength.label}</Text></div>
              <Progress percent={(evaluation.passed / evaluation.results.length) * 100} showInfo={false} strokeColor={strength.color} trailColor="#e9edf2" />
              <div className="password-rule-grid">
                {evaluation.results.map((rule) => <span key={rule.key} className={rule.passed ? 'is-passed' : ''}><CheckCircleFilled /> {rule.label}</span>)}
              </div>
            </div>

            <Form.Item label="Xác nhận mật khẩu mới" name="confirm_password" dependencies={['new_password']} rules={[
              { required: true, message: 'Nhập lại mật khẩu mới' },
              ({ getFieldValue }) => ({ validator: (_, value) => !value || getFieldValue('new_password') === value ? Promise.resolve() : Promise.reject(new Error('Hai mật khẩu chưa trùng khớp')) }),
            ]}>
              <Input.Password size="large" prefix={<KeyOutlined />} autoComplete="new-password" placeholder="Nhập lại mật khẩu mới" />
            </Form.Item>
            <Button type="primary" htmlType="submit" size="large" block loading={saving} disabled={!evaluation.valid} icon={<SafetyCertificateOutlined />}>
              Xác nhận và vào hệ thống
            </Button>
          </Form>
          <button type="button" className="forced-password-logout" onClick={onLogout}><LogoutOutlined /> Đăng xuất tài khoản này</button>
        </section>
      </section>
    </main>
  );
}
