import { useState } from 'react';
import {
  ClockCircleOutlined, DeleteOutlined, HistoryOutlined, PushpinFilled,
  StarOutlined,
} from '@ant-design/icons';
import { Badge, Button, Drawer, Empty, List, Segmented, Space, Tag, Tooltip, Typography, message } from 'antd';

import { useUserWorkspace } from '../workspace/UserWorkspaceContext';

const { Text } = Typography;

export default function WorkspaceHub({ onNavigate, onRestoreScope, periodKey, fallbackPeriodKey, fallbackBranchCode }) {
  const workspace = useUserWorkspace();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('pins');

  const openCustomer = (item) => {
    const effectivePeriod = periodKey || fallbackPeriodKey;
    if (!effectivePeriod) {
      message.warning('Chưa có kỳ dữ liệu đã xử lý để mở hồ sơ khách hàng');
      return;
    }
    sessionStorage.setItem('c360_pending_customer', JSON.stringify(item));
    if (!periodKey) {
      onRestoreScope?.({
        periodKey: effectivePeriod,
        branchCode: fallbackBranchCode || null,
        pgdCode: null,
        advanced: {},
      });
      message.loading({ content: `Đang mở hồ sơ theo kỳ dữ liệu mới nhất ${effectivePeriod}…`, key: 'open-pinned-customer', duration: 2 });
    }
    onNavigate('c360-customers');
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('c360:open-customer', { detail: item })), 50);
    setOpen(false);
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
            <List.Item actions={[<Tooltip title="Bỏ ghim" key="remove"><Button type="text" danger icon={<DeleteOutlined />} onClick={(event) => { event.stopPropagation(); workspace.unpinCustomer(item.customer_code); }} /></Tooltip>]} onClick={() => openCustomer(item)}>
              <List.Item.Meta avatar={<span className="workspace-customer-avatar">{(item.customer_name || 'K').charAt(0)}</span>} title={item.customer_name || 'Chưa có tên'} description={<Space size={6}><Text copyable={{ text: item.customer_code }}>{item.customer_code}</Text>{item.branch_code ? <Tag>CN {item.branch_code}</Tag> : null}</Space>} />
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
        {!periodKey && tab === 'pins' ? <div className="workspace-scope-hint">Chưa chọn kỳ phân tích. Khi mở một khách hàng, hệ thống sẽ tự sử dụng kỳ dữ liệu mới nhất bạn được phép xem.</div> : null}
      </Drawer>
    </>
  );
}
