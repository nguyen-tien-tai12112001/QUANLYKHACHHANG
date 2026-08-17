import { FilterOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Drawer, InputNumber, Select, Space, Tag, Typography, message } from 'antd';
import { useState } from 'react';
import { useAnalysisScope } from '../c360/AnalysisScopeContext';

const { Text } = Typography;
const C360_PAGES = new Set(['c360-dashboard', 'c360-insights', 'c360-customers', 'analysis-deposit', 'analysis-credit', 'analysis-income', 'analysis-unit']);

function optionValue(item) { return typeof item === 'string' ? item : item?.value; }
function optionLabel(item) { return typeof item === 'string' ? item : item?.label || item?.name || item?.value; }

export default function GlobalAnalysisFilter({ activeMenu }) {
  const scope = useAnalysisScope();
  const [open, setOpen] = useState(false);
  if (!C360_PAGES.has(activeMenu) || !scope) return null;
  const { draft, applied, options, periods, metadataLoading } = scope;
  const advancedCount = Object.values(draft.advanced || {}).filter((value) => Array.isArray(value) ? value.length : value != null && value !== '').length;
  const apply = () => {
    if (!scope.apply()) return message.warning('Vui lòng chọn kỳ dữ liệu');
    setOpen(false);
    message.success('Đã áp dụng bộ lọc cho toàn bộ C360');
  };
  return <>
    <div className="global-scope-bar">
      <Select loading={metadataLoading} value={draft.periodKey || undefined} placeholder="Chọn kỳ dữ liệu" style={{ width: 150 }} onChange={(periodKey) => scope.updateDraft({ periodKey, branchCode: null, pgdCode: null })} options={periods.map((item) => ({ value: item.period_key, label: `${item.period_key.slice(4, 6)}/${item.period_key.slice(0, 4)}` }))} />
      <Select allowClear value={draft.branchCode || undefined} placeholder="Tất cả chi nhánh" style={{ width: 155 }} onChange={(branchCode) => scope.updateDraft({ branchCode: branchCode || null, pgdCode: null })} options={(options.branches || []).map((item) => ({ value: optionValue(item), label: optionLabel(item) }))} />
      <Select allowClear value={draft.pgdCode || undefined} placeholder="Tất cả phòng ban" style={{ width: 165 }} onChange={(pgdCode) => scope.updateDraft({ pgdCode: pgdCode || null })} options={(options.pgd_options || []).map((item) => ({ value: optionValue(item), label: optionLabel(item) }))} />
      <Button icon={<FilterOutlined />} onClick={() => setOpen(true)}>Nâng cao {advancedCount ? <Tag color="blue">{advancedCount}</Tag> : null}</Button>
      <Button type="primary" icon={<SearchOutlined />} onClick={apply}>Xem dữ liệu</Button>
      {applied ? <Button icon={<ReloadOutlined />} onClick={scope.refresh}>Làm mới</Button> : null}
      {applied ? <Tag color="success">Đang áp dụng: {applied.periodKey}{applied.branchCode ? ` · CN ${applied.branchCode}` : ' · Toàn hệ thống'}</Tag> : <Text type="secondary">Chưa tải dữ liệu</Text>}
    </div>
    <Drawer title="Bộ lọc C360 dùng chung" width={560} open={open} onClose={() => setOpen(false)} extra={<Space><Button onClick={scope.reset}>Đặt lại</Button><Button type="primary" onClick={apply}>Xem dữ liệu</Button></Space>}>
      <div className="global-scope-advanced">
        <label>Loại khách hàng<Select mode="multiple" allowClear value={draft.advanced.customerTypes} onChange={(customerTypes) => scope.updateAdvanced({ customerTypes })} options={(options.customer_types || []).map((item) => ({ value: optionValue(item), label: optionLabel(item) }))} /></label>
        <label>Loại hình vay<Select mode="multiple" allowClear value={draft.advanced.loanTypes} onChange={(loanTypes) => scope.updateAdvanced({ loanTypes })} options={(options.loan_types || []).map((item) => ({ value: optionValue(item), label: optionLabel(item) }))} /></label>
        <label>Cán bộ quản lý<Select allowClear showSearch optionFilterProp="label" value={draft.advanced.officerCode} onChange={(officerCode) => scope.updateAdvanced({ officerCode: officerCode || null })} options={(options.officers || []).map((item) => ({ value: item.code || item.value, label: item.name ? `${item.name} (${item.code})` : optionLabel(item) }))} /></label>
        <label>Quan hệ chi nhánh<Select allowClear value={draft.advanced.relationshipStatus} onChange={(relationshipStatus) => scope.updateAdvanced({ relationshipStatus: relationshipStatus || null })} options={[{ value: 'single', label: 'Một chi nhánh' }, { value: 'multi', label: 'Đa chi nhánh' }]} /></label>
        <label>Trạng thái tiền gửi<Select allowClear value={draft.advanced.depositStatus} onChange={(depositStatus) => scope.updateAdvanced({ depositStatus: depositStatus || null })} options={[{ value: 'yes', label: 'Có tiền gửi' }, { value: 'no', label: 'Không có tiền gửi' }]} /></label>
        <label>Trạng thái tiền vay<Select allowClear value={draft.advanced.loanStatus} onChange={(loanStatus) => scope.updateAdvanced({ loanStatus: loanStatus || null })} options={[{ value: 'yes', label: 'Có tiền vay' }, { value: 'no', label: 'Không có tiền vay' }]} /></label>
        <div className="global-scope-range"><Text strong>Tiền gửi (triệu đồng)</Text><InputNumber min={0} placeholder="Từ" value={draft.advanced.minDeposit} onChange={(minDeposit) => scope.updateAdvanced({ minDeposit })} /><InputNumber min={0} placeholder="Đến" value={draft.advanced.maxDeposit} onChange={(maxDeposit) => scope.updateAdvanced({ maxDeposit })} /></div>
        <div className="global-scope-range"><Text strong>Tiền vay (triệu đồng)</Text><InputNumber min={0} placeholder="Từ" value={draft.advanced.minLoan} onChange={(minLoan) => scope.updateAdvanced({ minLoan })} /><InputNumber min={0} placeholder="Đến" value={draft.advanced.maxLoan} onChange={(maxLoan) => scope.updateAdvanced({ maxLoan })} /></div>
      </div>
    </Drawer>
  </>;
}
