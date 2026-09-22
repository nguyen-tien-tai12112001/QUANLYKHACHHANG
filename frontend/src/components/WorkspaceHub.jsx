import { useState } from 'react';
import {
  ClockCircleOutlined, DeleteOutlined, HistoryOutlined, PushpinFilled,
  LoadingOutlined, StarOutlined,
} from '@ant-design/icons';
import { Badge, Button, Drawer, Empty, List, Segmented, Space, Tag, Tooltip, Typography, message } from 'antd';

import { useUserWorkspace } from '../workspace/UserWorkspaceContext';
import client from '../api/client';

const { Text } = Typography;

export default function WorkspaceHub({ onNavigate, onRestoreScope, onOpenCustomer, periodKey }) {
  const workspace = useUserWorkspace();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('pins');
  const [openingCustomerCode, setOpeningCustomerCode] = useState('');

  const openCustomer = async (item) => {
    const customerCode = String(item?.customer_code || '').trim();
    if (!customerCode || openingCustomerCode) return;
    setOpeningCustomerCode(customerCode);
    try {
      const { data } = await client.get('/customer-processing/profile', {
        params: {
          ma_kh: customerCode,
          period_key: periodKey || undefined,
          include_units: true,
        },
        hideGlobalLoading: true,
        noCache: true,
      });
      if (!data?.customer || !data?.period_key) {
        throw new Error('Không tìm thấy hồ sơ khách hàng');
      }
      sessionStorage.removeItem('c360_pending_customer');
      onOpenCustomer?.({ customer: data.customer, periodKey: data.period_key });
      setOpen(false);
    } catch (error) {
      message.error(error.response?.data?.detail || error.message || 'Không thể mở hồ sơ khách hàng đã ghim');
    } finally {
      setOpeningCustomerCode('');
    }
  };

  const runItem = (item) => {
    if (item.type === 'customer') openCustomer(item.raw || { customer_code: item.key, customer_name: item.title });
    else if (item.type === 'filter') {
      onNavigate('c360-dashboard');
      onRestoreScope?.(item.raw?.scope);
      setOpen(false);
    }
    else {
      onNavigate(item.key);
      setOpen(false);
    }
  };

  return (
    <>
      <Tooltip title="Khách hàng đã ghim và nội dung vừa xem">
        <Badge count={workspace?.pins?.length || 0} size="small" overflowCount={99}>
          <Button className="workspace-pin-button" icon={<PushpinFilled />} onClick={() => setOpen(true)} />
        </Badge>
      </Tooltip>

      <Drawer className="workspace-hub-drawer" width={480} open={open} onClose={() => setOpen(false)} title={<div className="workspace-hub-title"><span><StarOutlined /></span><div><strong>Không gian làm việc của tôi</strong><small>Lưu riêng theo tài khoản đang đăng nhập</small></div></div>}>
        <Segmented block value={tab} onChange={setTab} options={[
          { value: 'pins', label: `Đã ghim (${workspace?.pins?.length || 0})`, icon: <PushpinFilled /> },
          { value: 'recent', label: 'Vừa xem', icon: <HistoryOutlined /> },
        ]} />
        {tab === 'pins' ? (
          <List className="workspace-list" loading={workspace?.pinsLoading} dataSource={workspace?.pins || []} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa ghim khách hàng nào" /> }} renderItem={(item) => (
            <List.Item className={openingCustomerCode === item.customer_code ? 'is-opening' : ''} actions={[<Tooltip title="Bỏ ghim" key="remove"><Button type="text" danger icon={<DeleteOutlined />} disabled={Boolean(openingCustomerCode)} onClick={(event) => { event.stopPropagation(); workspace.unpinCustomer(item.customer_code); }} /></Tooltip>]} onClick={() => openCustomer(item)}>
              <List.Item.Meta avatar={<span className="workspace-customer-avatar">{openingCustomerCode === item.customer_code ? <LoadingOutlined spin /> : (item.customer_name || 'K').charAt(0)}</span>} title={item.customer_name || 'Chưa có tên'} description={<Space size={6}><Text copyable={{ text: item.customer_code }}>{item.customer_code}</Text>{item.branch_code ? <Tag>CN {item.branch_code}</Tag> : null}{openingCustomerCode === item.customer_code ? <Text type="secondary">Đang mở hồ sơ…</Text> : null}</Space>} />
            </List.Item>
          )} />
        ) : (
          <>
            <div className="workspace-list-actions"><Text type="secondary">Tối đa 24 nội dung gần nhất</Text>{workspace?.recents?.length ? <Button type="link" danger onClick={workspace.clearRecents}>Xóa lịch sử</Button> : null}</div>
            <List className="workspace-list" dataSource={workspace?.recents || []} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có nội dung vừa xem" /> }} renderItem={(item) => (
              <List.Item onClick={() => runItem(item)}>
                <List.Item.Meta avatar={<ClockCircleOutlined />} title={item.title} description={item.subtitle} />
              </List.Item>
            )} />
          </>
        )}
        {!periodKey && tab === 'pins' ? <div className="workspace-scope-hint">Chưa chọn kỳ phân tích. Hồ sơ ghim sẽ mở theo kỳ dữ liệu mới nhất bạn được phép xem mà không tải toàn bộ danh sách khách hàng.</div> : null}
      </Drawer>
    </>
  );
}
