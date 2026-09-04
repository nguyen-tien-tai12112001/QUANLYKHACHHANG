import { useEffect, useMemo, useState } from 'react';
import {
  ApartmentOutlined,
  BankOutlined,
  CheckCircleOutlined,
  IdcardOutlined,
  KeyOutlined,
  LockOutlined,
  MailOutlined,
  PhoneOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Collapse, Drawer, Form, Input, Progress, Skeleton, Space, Tabs, Tag, Typography, message } from 'antd';

import client from '../api/client';
import { apiErrorMessage, evaluatePassword } from '../auth/passwordPolicy';
import './PersonalProfileDrawer.css';

const { Text, Title } = Typography;

function ProfileValue({ icon, label, value, code }) {
  return <div className="personal-profile-value"><span>{icon}</span><div><small>{label}</small><Text strong>{value || 'Chưa cập nhật'}</Text>{code ? <Text type="secondary">{code}</Text> : null}</div></div>;
}

export default function PersonalProfileDrawer({ open, onClose, currentUser, onUpdated }) {
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  async function loadProfile() {
    setLoading(true);
    try {
      const { data } = await client.get('/auth/profile', { noCache: true });
      setProfile(data);
      profileForm.setFieldsValue({ full_name: data.full_name, email: data.email, phone: data.phone });
    } catch (error) {
      message.error(error.response?.data?.detail || 'Không tải được hồ sơ cá nhân');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) loadProfile();
    else passwordForm.resetFields();
  }, [open]);

  const groupedPermissions = useMemo(() => (profile?.effective_permissions || []).reduce((groups, item) => {
    const group = item.permission_group || 'Khác';
    groups[group] = groups[group] || [];
    groups[group].push(item);
    return groups;
  }, {}), [profile]);

  async function saveProfile(values) {
    setSaving(true);
    try {
      const { data } = await client.put('/auth/profile', values);
      setProfile(data.profile);
      onUpdated?.(data.user);
      message.success('Đã cập nhật thông tin cá nhân');
    } catch (error) {
      message.error(error.response?.data?.detail || 'Không cập nhật được hồ sơ');
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(values) {
    setChangingPassword(true);
    try {
      const { data } = await client.post('/auth/change-password', values);
      if (data.access_token) localStorage.setItem('access_token', data.access_token);
      if (data.user) onUpdated?.(data.user);
      passwordForm.resetFields();
      setNewPassword('');
      await loadProfile();
      message.success(data.message || 'Đã thay đổi mật khẩu');
    } catch (error) {
      message.error(apiErrorMessage(error, 'Không thay đổi được mật khẩu'));
    } finally {
      setChangingPassword(false);
    }
  }

  const permissionCount = profile?.effective_permissions?.length || 0;
  const extraCount = profile?.extra_permission_codes?.length || 0;
  const passwordEvaluation = useMemo(() => evaluatePassword(newPassword), [newPassword]);
  const formatDateTime = (value) => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Chưa ghi nhận';

  const overviewTab = loading ? <Skeleton active paragraph={{ rows: 10 }} /> : <div className="personal-profile-content">
    <div className="personal-profile-section-title"><span><UserOutlined /></span><div><Title level={5}>Thông tin tài khoản</Title><Text type="secondary">Thông tin nhận diện và đơn vị công tác trên hệ thống.</Text></div></div>
    <div className="personal-profile-value-grid">
      <ProfileValue icon={<IdcardOutlined />} label="Mã nhân viên" value={profile?.employee_code} code={profile?.username} />
      <ProfileValue icon={<BankOutlined />} label="Chi nhánh" value={profile?.branch} code={profile?.branch_code} />
      <ProfileValue icon={<ApartmentOutlined />} label="Phòng ban" value={profile?.department} code={profile?.department_code} />
      <ProfileValue icon={<SafetyCertificateOutlined />} label="Nhóm quyền" value={profile?.role_name} code={profile?.role} />
    </div>
    <div className="personal-profile-section-title is-edit"><span><SaveOutlined /></span><div><Title level={5}>Thông tin liên hệ</Title><Text type="secondary">Bạn có thể tự cập nhật các thông tin cá nhân dưới đây.</Text></div></div>
    <Form form={profileForm} layout="vertical" onFinish={saveProfile} className="personal-profile-form">
      <Form.Item label="Họ và tên" name="full_name" rules={[{ required: true, message: 'Nhập họ và tên' }]}><Input prefix={<UserOutlined />} /></Form.Item>
      <Form.Item label="Email" name="email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}><Input prefix={<MailOutlined />} placeholder="ten.canbo@agribank.com.vn" /></Form.Item>
      <Form.Item label="Số điện thoại" name="phone"><Input prefix={<PhoneOutlined />} placeholder="Số điện thoại liên hệ" /></Form.Item>
      <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>Lưu thông tin cá nhân</Button>
    </Form>
  </div>;

  const permissionTab = loading ? <Skeleton active paragraph={{ rows: 10 }} /> : <div className="personal-profile-content">
    <div className="personal-permission-summary">
      <div><span><SafetyCertificateOutlined /></span><small>Tổng quyền thực tế</small><strong>{permissionCount}</strong></div>
      <div className="is-role"><span><CheckCircleOutlined /></span><small>Kế thừa từ nhóm</small><strong>{permissionCount - extraCount}</strong></div>
      <div className="is-extra"><span><KeyOutlined /></span><small>Được cấp thêm</small><strong>{extraCount}</strong></div>
    </div>
    <div className="personal-profile-section-title"><span><SafetyCertificateOutlined /></span><div><Title level={5}>Chi tiết quyền truy cập</Title><Text type="secondary">Quyền xanh lá kế thừa từ nhóm; quyền tím được cấp thêm riêng.</Text></div></div>
    <Collapse className="personal-permission-groups" defaultActiveKey={Object.keys(groupedPermissions).slice(0, 2)} items={Object.entries(groupedPermissions).map(([group, items]) => ({
      key: group,
      label: <span className="personal-permission-group-label"><b>{group}</b><Tag>{items.length} quyền</Tag></span>,
      children: <div className="personal-permission-list">{items.map((item) => <div key={item.permission_code} className={item.source === 'direct' ? 'is-direct' : ''}><span><CheckCircleOutlined /></span><div><Text strong>{item.permission_name}</Text><Text type="secondary">{item.permission_code}</Text></div><Tag color={item.source === 'direct' ? 'purple' : 'green'}>{item.source === 'direct' ? 'Cấp thêm' : 'Theo nhóm'}</Tag></div>)}</div>,
    }))} />
  </div>;

  const securityTab = <div className="personal-profile-content">
    <div className="personal-security-hero"><span><LockOutlined /></span><div><Title level={4}>Bảo mật tài khoản</Title><Text type="secondary">Sử dụng mật khẩu riêng, đủ mạnh và không chia sẻ cho người khác.</Text></div></div>
    <div className="personal-security-status">
      <div><small>Đăng nhập gần nhất</small><strong>{formatDateTime(profile?.last_login_at)}</strong></div>
      <div><small>Đổi mật khẩu gần nhất</small><strong>{formatDateTime(profile?.password_changed_at)}</strong></div>
      <Tag color={profile?.must_change_password ? 'warning' : 'success'}>{profile?.must_change_password ? 'Cần đổi mật khẩu' : 'Tài khoản an toàn'}</Tag>
    </div>
    <Form form={passwordForm} layout="vertical" onFinish={changePassword} className="personal-password-form">
      <Form.Item label="Mật khẩu hiện tại" name="current_password" rules={[{ required: true, message: 'Nhập mật khẩu hiện tại' }]}><Input.Password prefix={<LockOutlined />} autoComplete="current-password" /></Form.Item>
      <Form.Item label="Mật khẩu mới" name="new_password" rules={[{ required: true, message: 'Nhập mật khẩu mới' }, { validator: (_, value) => evaluatePassword(value).valid ? Promise.resolve() : Promise.reject(new Error('Mật khẩu chưa đáp ứng đủ yêu cầu')) }]}><Input.Password prefix={<KeyOutlined />} autoComplete="new-password" onChange={(event) => setNewPassword(event.target.value)} /></Form.Item>
      <div className="personal-password-meter"><Progress percent={(passwordEvaluation.passed / passwordEvaluation.results.length) * 100} showInfo={false} strokeColor={passwordEvaluation.valid ? '#16805e' : '#c58a24'} /><div>{passwordEvaluation.results.map((rule) => <span className={rule.passed ? 'is-passed' : ''} key={rule.key}><CheckCircleOutlined /> {rule.label}</span>)}</div></div>
      <Form.Item label="Xác nhận mật khẩu mới" name="confirm_password" dependencies={['new_password']} rules={[{ required: true, message: 'Xác nhận mật khẩu mới' }, ({ getFieldValue }) => ({ validator(_, value) { return !value || getFieldValue('new_password') === value ? Promise.resolve() : Promise.reject(new Error('Xác nhận mật khẩu không khớp')); } })]}><Input.Password prefix={<KeyOutlined />} /></Form.Item>
      <Button type="primary" htmlType="submit" icon={<KeyOutlined />} loading={changingPassword}>Cập nhật mật khẩu</Button>
    </Form>
  </div>;

  return <Drawer className="personal-profile-drawer" width={Math.min(820, window.innerWidth)} open={open} onClose={onClose} destroyOnHidden title={null}>
    <div className="personal-profile-hero">
      <Avatar size={88}>{(profile?.full_name || currentUser?.full_name || 'C').charAt(0)}</Avatar>
      <div><Text>HỒ SƠ CÁ NHÂN</Text><Title level={3}>{profile?.full_name || currentUser?.full_name}</Title><Space wrap><Tag color="red">{profile?.branch_code || currentUser?.branch_code}</Tag><Tag color="blue">{profile?.role_name || currentUser?.role_name}</Tag></Space></div>
    </div>
    <Tabs className="personal-profile-tabs" items={[
      { key: 'profile', label: <span><UserOutlined /> Thông tin</span>, children: overviewTab },
      { key: 'permissions', label: <span><SafetyCertificateOutlined /> Phân quyền</span>, children: permissionTab },
      { key: 'security', label: <span><LockOutlined /> Mật khẩu</span>, children: securityTab },
    ]} />
  </Drawer>;
}
