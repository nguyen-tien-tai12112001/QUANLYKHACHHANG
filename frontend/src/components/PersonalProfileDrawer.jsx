import { useEffect, useMemo, useState } from 'react';
import {
  ApartmentOutlined,
  BankOutlined,
  CheckCircleFilled,
  CloseOutlined,
  ClockCircleOutlined,
  DesktopOutlined,
  IdcardOutlined,
  KeyOutlined,
  LockOutlined,
  MailOutlined,
  PhoneOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Avatar,
  Button,
  Collapse,
  Drawer,
  Form,
  Input,
  Progress,
  Skeleton,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';

import client from '../api/client';
import { apiErrorMessage, evaluatePassword } from '../auth/passwordPolicy';
import './PersonalProfileDrawer.css';

const { Text, Title } = Typography;

const scopeLabels = {
  province: 'Toàn tỉnh',
  all: 'Toàn hệ thống',
  system: 'Toàn hệ thống',
  branch: 'Theo chi nhánh',
  department: 'Theo phòng ban',
  pgd: 'Theo phòng ban',
  own: 'Khách hàng được giao',
};

function initials(value) {
  const words = String(value || 'C360').trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function formatDateTime(value) {
  if (!value) return 'Chưa ghi nhận';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa ghi nhận';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function IdentityField({ icon, label, value, code, wide = false }) {
  const fullValue = [value, code].filter(Boolean).join(' · ');
  return (
    <div className={`digital-identity-field${wide ? ' is-wide' : ''}`}>
      <span className="digital-identity-field-icon">{icon}</span>
      <span className="digital-identity-field-copy">
        <small>{label}</small>
        <Tooltip title={fullValue || 'Chưa cập nhật'} placement="topLeft">
          <Text strong>{value || 'Chưa cập nhật'}</Text>
        </Tooltip>
        {code ? <Text type="secondary">{code}</Text> : null}
      </span>
    </div>
  );
}

function SectionHeading({ icon, eyebrow, title, description }) {
  return (
    <div className="digital-profile-section-heading">
      <span>{icon}</span>
      <div>
        <small>{eyebrow}</small>
        <Title level={5}>{title}</Title>
        {description ? <Text type="secondary">{description}</Text> : null}
      </div>
    </div>
  );
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
      message.error(apiErrorMessage(error, 'Không tải được hồ sơ cá nhân'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) loadProfile();
    else {
      passwordForm.resetFields();
      setNewPassword('');
    }
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
      message.error(apiErrorMessage(error, 'Không cập nhật được hồ sơ'));
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

  const displayName = profile?.full_name || currentUser?.full_name || currentUser?.display_name || 'Người dùng C360';
  const permissionCount = profile?.effective_permissions?.length || 0;
  const extraCount = profile?.extra_permission_codes?.length || 0;
  const deniedCount = profile?.effective_denied_permission_codes?.length || 0;
  const inheritedCount = Math.max(0, (profile?.role_permission_codes?.length || 0) - deniedCount);
  const passwordEvaluation = useMemo(() => evaluatePassword(newPassword), [newPassword]);
  const scope = profile?.data_scope || profile?.scope || currentUser?.data_scope || currentUser?.scope;
  const isAdmin = Boolean(profile?.is_superuser || profile?.role === 'ADMIN' || currentUser?.is_superuser);

  const overviewTab = loading ? (
    <div className="digital-profile-loading"><Skeleton active avatar paragraph={{ rows: 9 }} /></div>
  ) : (
    <div className="digital-profile-overview-grid">
      <section className="digital-profile-panel digital-profile-identity-panel">
        <SectionHeading icon={<IdcardOutlined />} eyebrow="ĐỊNH DANH SỐ" title="Tài khoản và đơn vị công tác" description="Thông tin được quản trị tập trung trên hệ thống C360." />
        <div className="digital-identity-grid">
          <IdentityField icon={<IdcardOutlined />} label="Mã nhân viên" value={profile?.employee_code} code={`Tên đăng nhập: ${profile?.username || '—'}`} />
          <IdentityField icon={<SafetyCertificateOutlined />} label="Nhóm quyền" value={profile?.role_name} code={profile?.role} />
          <IdentityField icon={<BankOutlined />} label="Chi nhánh" value={profile?.branch} code={profile?.branch_code} />
          <IdentityField icon={<ApartmentOutlined />} label="Phòng ban" value={profile?.department} code={profile?.department_code} />
          <IdentityField icon={<TeamOutlined />} label="Mã cán bộ tín dụng" value={profile?.credit_officer_code} />
          <IdentityField icon={<UserOutlined />} label="User IPCAS" value={profile?.ipcas_username} />
          <IdentityField icon={<IdcardOutlined />} label="Mã CIF được giao" value={profile?.customer_cif_code} wide />
        </div>
        <div className="digital-scope-strip">
          <span><SafetyCertificateOutlined /></span>
          <div><small>Phạm vi dữ liệu hiện tại</small><strong>{scopeLabels[scope] || scope || 'Chưa cấu hình'}</strong></div>
          <Tag color="success"><CheckCircleFilled /> Đang áp dụng</Tag>
        </div>
      </section>

      <section className="digital-profile-panel digital-profile-contact-panel">
        <SectionHeading icon={<UserOutlined />} eyebrow="HỒ SƠ LIÊN HỆ" title="Thông tin cá nhân" description="Bạn có thể chủ động cập nhật các trường liên hệ bên dưới." />
        <Form form={profileForm} layout="vertical" onFinish={saveProfile} className="digital-profile-form" requiredMark={false}>
          <Form.Item label="Họ và tên" name="full_name" rules={[{ required: true, message: 'Nhập họ và tên' }]}><Input prefix={<UserOutlined />} placeholder="Họ và tên người dùng" /></Form.Item>
          <Form.Item label="Email" name="email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}><Input prefix={<MailOutlined />} placeholder="ten.canbo@agribank.com.vn" /></Form.Item>
          <Form.Item label="Số điện thoại" name="phone"><Input prefix={<PhoneOutlined />} placeholder="Số điện thoại liên hệ" /></Form.Item>
          <div className="digital-profile-form-note"><CheckCircleFilled /> Thông tin thay đổi được lưu vào nhật ký hệ thống.</div>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving} block>Lưu thay đổi</Button>
        </Form>
      </section>
    </div>
  );

  const permissionTab = loading ? (
    <div className="digital-profile-loading"><Skeleton active paragraph={{ rows: 10 }} /></div>
  ) : (
    <div className="digital-permission-layout">
      <div className="digital-permission-summary">
        <div className="is-total"><span><SafetyCertificateOutlined /></span><small>Quyền thực tế</small><strong>{permissionCount}</strong><em>Tổng quyền đang có hiệu lực</em></div>
        <div className="is-inherited"><span><CheckCircleFilled /></span><small>Theo nhóm quyền</small><strong>{inheritedCount}</strong><em>Kế thừa từ {profile?.role_name || 'vai trò'}</em></div>
        <div className="is-extra"><span><KeyOutlined /></span><small>Quyền cấp thêm</small><strong>{extraCount}</strong><em>Cấp riêng cho tài khoản</em></div>
        <div className="is-denied"><span><CloseOutlined /></span><small>Quyền bị từ chối</small><strong>{deniedCount}</strong><em>DENY luôn ưu tiên</em></div>
      </div>
      <section className="digital-profile-panel digital-permission-panel">
        <SectionHeading icon={<SafetyCertificateOutlined />} eyebrow="MA TRẬN QUYỀN CÁ NHÂN" title="Chi tiết quyền truy cập" description="Phân biệt rõ quyền kế thừa từ nhóm và quyền được cấp riêng." />
        {Object.keys(groupedPermissions).length ? (
          <Collapse className="digital-permission-groups" defaultActiveKey={Object.keys(groupedPermissions).slice(0, 1)} items={Object.entries(groupedPermissions).map(([group, items]) => ({
            key: group,
            label: <span className="digital-permission-group-label"><b>{group}</b><Tag>{items.length} quyền</Tag></span>,
            children: <div className="digital-permission-list">{items.map((item) => <div key={item.permission_code} className={item.source === 'direct' ? 'is-direct' : ''}><span><CheckCircleFilled /></span><div><Text strong>{item.permission_name}</Text><Text type="secondary">{item.permission_code}</Text></div><Tag color={item.source === 'direct' ? 'purple' : 'green'}>{item.source === 'direct' ? 'Cấp riêng' : 'Theo nhóm'}</Tag></div>)}</div>,
          }))} />
        ) : <div className="digital-profile-empty">Tài khoản chưa được cấp quyền chức năng.</div>}
        {(profile?.denied_permissions || []).length ? (
          <div className="digital-denied-permissions">
            <Text strong>Quyền bị từ chối riêng</Text>
            <div className="digital-permission-list">{profile.denied_permissions.map((item) => <div key={item.permission_code} className="is-denied"><span><CloseOutlined /></span><div><Text strong>{item.permission_name}</Text><Text type="secondary">{item.permission_code}</Text></div><Tag color="red">Từ chối</Tag></div>)}</div>
          </div>
        ) : null}
      </section>
    </div>
  );

  const securityTab = (
    <div className="digital-security-layout">
      <aside className="digital-security-overview">
        <div className="digital-security-emblem"><LockOutlined /></div>
        <small>TRUNG TÂM BẢO MẬT</small>
        <Title level={4}>Bảo vệ tài khoản</Title>
        <Text>Phiên đăng nhập và mật khẩu được kiểm soát tập trung để bảo vệ dữ liệu khách hàng.</Text>
        <div className="digital-security-facts">
          <div><span><ClockCircleOutlined /></span><p><small>Không hoạt động</small><strong>Tự đăng xuất sau 30 phút</strong></p></div>
          <div><span><DesktopOutlined /></span><p><small>Chính sách thiết bị</small><strong>{isAdmin ? 'Cho phép nhiều phiên Admin' : 'Một phiên đăng nhập duy nhất'}</strong></p></div>
          <div><span><CheckCircleFilled /></span><p><small>Trạng thái</small><strong>{profile?.must_change_password ? 'Cần đổi mật khẩu' : 'Đang được bảo vệ'}</strong></p></div>
        </div>
        <div className="digital-security-timeline">
          <div><small>Đăng nhập gần nhất</small><strong>{formatDateTime(profile?.last_login_at)}</strong></div>
          <div><small>Đổi mật khẩu gần nhất</small><strong>{formatDateTime(profile?.password_changed_at)}</strong></div>
        </div>
      </aside>

      <section className="digital-profile-panel digital-password-panel">
        <SectionHeading icon={<KeyOutlined />} eyebrow="XÁC THỰC TÀI KHOẢN" title="Thay đổi mật khẩu" description="Mật khẩu mới cần đáp ứng đầy đủ tiêu chuẩn an toàn của hệ thống." />
        <Form form={passwordForm} layout="vertical" onFinish={changePassword} className="digital-password-form" requiredMark={false}>
          <Form.Item label="Mật khẩu hiện tại" name="current_password" rules={[{ required: true, message: 'Nhập mật khẩu hiện tại' }]}><Input.Password prefix={<LockOutlined />} autoComplete="current-password" placeholder="Nhập mật khẩu đang sử dụng" /></Form.Item>
          <Form.Item label="Mật khẩu mới" name="new_password" rules={[{ required: true, message: 'Nhập mật khẩu mới' }, { validator: (_, value) => evaluatePassword(value).valid ? Promise.resolve() : Promise.reject(new Error('Mật khẩu chưa đáp ứng đủ yêu cầu')) }]}><Input.Password prefix={<KeyOutlined />} autoComplete="new-password" placeholder="Tạo mật khẩu mới" onChange={(event) => setNewPassword(event.target.value)} /></Form.Item>
          <div className="digital-password-meter">
            <div><Text strong>Mức độ đáp ứng</Text><Text type="secondary">{passwordEvaluation.passed}/{passwordEvaluation.results.length} tiêu chí</Text></div>
            <Progress percent={(passwordEvaluation.passed / passwordEvaluation.results.length) * 100} showInfo={false} strokeColor={passwordEvaluation.valid ? '#16805e' : '#c58a24'} />
            <div className="digital-password-rules">{passwordEvaluation.results.map((rule) => <span className={rule.passed ? 'is-passed' : ''} key={rule.key}><CheckCircleFilled /> {rule.label}</span>)}</div>
          </div>
          <Form.Item label="Xác nhận mật khẩu mới" name="confirm_password" dependencies={['new_password']} rules={[{ required: true, message: 'Xác nhận mật khẩu mới' }, ({ getFieldValue }) => ({ validator(_, value) { return !value || getFieldValue('new_password') === value ? Promise.resolve() : Promise.reject(new Error('Xác nhận mật khẩu không khớp')); } })]}><Input.Password prefix={<KeyOutlined />} placeholder="Nhập lại mật khẩu mới" /></Form.Item>
          <Button type="primary" htmlType="submit" icon={<KeyOutlined />} loading={changingPassword} block>Cập nhật mật khẩu</Button>
        </Form>
      </section>
    </div>
  );

  return (
    <Drawer className="digital-profile-drawer" width={Math.min(940, window.innerWidth)} open={open} onClose={onClose} destroyOnHidden title={null} closable={false}>
      <header className="digital-profile-hero">
        <div className="digital-profile-orbit" aria-hidden="true"><i /><i /><i /></div>
        <button type="button" className="digital-profile-close" onClick={onClose} aria-label="Đóng hồ sơ"><CloseOutlined /></button>
        <div className="digital-profile-person">
          <span className="digital-profile-avatar-wrap"><Avatar>{initials(displayName)}</Avatar><i><CheckCircleFilled /></i></span>
          <div className="digital-profile-person-copy">
            <small><SafetyCertificateOutlined /> HỒ SƠ ĐỊNH DANH C360</small>
            <Title level={2}>{displayName}</Title>
            <div className="digital-profile-badges"><Tag>{profile?.branch_code || currentUser?.branch_code || 'Chưa có CN'}</Tag><Tag>{profile?.role_name || currentUser?.role_name || 'Chưa có nhóm quyền'}</Tag><span><i /> Tài khoản hoạt động</span></div>
          </div>
        </div>
        <div className="digital-profile-quick-facts">
          <div><small>Mã nhân viên</small><strong>{profile?.employee_code || currentUser?.employee_code || '—'}</strong></div>
          <div><small>Đơn vị</small><strong>{profile?.department || currentUser?.department || 'Chưa phân công'}</strong></div>
          <div><small>Phạm vi dữ liệu</small><strong>{scopeLabels[scope] || scope || 'Chưa cấu hình'}</strong></div>
          <div><small>Quyền hiệu lực</small><strong>{permissionCount} quyền</strong></div>
        </div>
      </header>
      <Tabs className="digital-profile-tabs" animated={{ inkBar: true, tabPane: true }} items={[
        { key: 'profile', label: <span><UserOutlined /> Tổng quan</span>, children: overviewTab },
        { key: 'permissions', label: <span><SafetyCertificateOutlined /> Quyền truy cập <b>{permissionCount}</b></span>, children: permissionTab },
        { key: 'security', label: <span><LockOutlined /> Bảo mật</span>, children: securityTab },
      ]} />
    </Drawer>
  );
}
