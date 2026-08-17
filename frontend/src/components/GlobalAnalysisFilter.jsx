import { ApartmentOutlined, BankOutlined, CalendarOutlined, FilterOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Drawer, Input, InputNumber, Select, Space, Typography, message } from 'antd';
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
      <div className="global-scope-heading">
        <div><span className="global-scope-heading__icon"><FilterOutlined /></span><span><strong>Phạm vi phân tích</strong><small>Áp dụng đồng bộ cho toàn bộ C360</small></span></div>
        {applied
          ? <span className="global-scope-status is-ready"><i />Kỳ {applied.periodKey}{applied.branchCode ? ` · CN ${applied.branchCode}` : ' · Toàn hệ thống'}</span>
          : <span className="global-scope-status"><i />Chưa tải dữ liệu</span>}
      </div>
      <div className="global-scope-controls">
        <label className="global-scope-field is-period"><span><CalendarOutlined /> Kỳ dữ liệu <em>*</em></span><Select loading={metadataLoading} value={draft.periodKey || undefined} placeholder="Chọn kỳ" onChange={(periodKey) => scope.updateDraft({ periodKey, branchCode: null, pgdCode: null })} options={periods.map((item) => ({ value: item.period_key, label: `${item.period_key.slice(4, 6)}/${item.period_key.slice(0, 4)}` }))} /></label>
        <label className="global-scope-field"><span><BankOutlined /> Chi nhánh</span><Select disabled={!draft.periodKey} allowClear value={draft.branchCode || undefined} placeholder="Tất cả chi nhánh" onChange={(branchCode) => scope.updateDraft({ branchCode: branchCode || null, pgdCode: null })} options={(options.branches || []).map((item) => ({ value: optionValue(item), label: optionLabel(item) }))} /></label>
        <label className="global-scope-field"><span><ApartmentOutlined /> Phòng ban</span><Select disabled={!draft.periodKey || !draft.branchCode} allowClear value={draft.pgdCode || undefined} placeholder={draft.branchCode ? 'Tất cả phòng ban' : 'Chọn chi nhánh trước'} onChange={(pgdCode) => scope.updateDraft({ pgdCode: pgdCode || null })} options={(options.pgd_options || []).map((item) => ({ value: optionValue(item), label: optionLabel(item) }))} /></label>
        <div className="global-scope-actions">
          <Button className="global-scope-advanced-btn" icon={<FilterOutlined />} onClick={() => setOpen(true)}>Nâng cao{advancedCount ? <b>{advancedCount}</b> : null}</Button>
          <Button className="global-scope-submit" disabled={!draft.periodKey} type="primary" icon={<SearchOutlined />} onClick={apply}>Xem dữ liệu</Button>
          {applied ? <Button className="global-scope-refresh" icon={<ReloadOutlined />} onClick={scope.refresh} aria-label="Làm mới dữ liệu" /> : null}
        </div>
      </div>
    </div>
    <Drawer title="Bộ lọc C360 dùng chung" width={560} open={open} onClose={() => setOpen(false)} extra={<Space><Button onClick={scope.reset}>Đặt lại</Button><Button type="primary" onClick={apply}>Xem dữ liệu</Button></Space>}>
      <div className="global-scope-advanced">
        <label>Tìm khách hàng<Input allowClear placeholder="Mã KH, tên, CCCD, mã số thuế..." value={draft.advanced.keyword} onChange={(event) => scope.updateAdvanced({ keyword: event.target.value })} /></label>
        <label>Loại khách hàng<Select mode="multiple" allowClear value={draft.advanced.customerTypes} onChange={(customerTypes) => scope.updateAdvanced({ customerTypes })} options={(options.customer_types || []).map((item) => ({ value: optionValue(item), label: optionLabel(item) }))} /></label>
        <label>Loại hình vay<Select mode="multiple" allowClear value={draft.advanced.loanTypes} onChange={(loanTypes) => scope.updateAdvanced({ loanTypes })} options={(options.loan_types || []).map((item) => ({ value: optionValue(item), label: optionLabel(item) }))} /></label>
        <label>Cán bộ quản lý<Select allowClear showSearch optionFilterProp="label" value={draft.advanced.officerCode} onChange={(officerCode) => scope.updateAdvanced({ officerCode: officerCode || null })} options={(options.officers || []).map((item) => ({ value: item.code || item.value, label: item.name ? `${item.name} (${item.code})` : optionLabel(item) }))} /></label>
        <label>Quan hệ chi nhánh<Select allowClear value={draft.advanced.relationshipStatus} onChange={(relationshipStatus) => scope.updateAdvanced({ relationshipStatus: relationshipStatus || null })} options={[{ value: 'single', label: 'Một chi nhánh' }, { value: 'multi', label: 'Đa chi nhánh' }]} /></label>
        <label>Trạng thái tiền gửi<Select allowClear value={draft.advanced.depositStatus} onChange={(depositStatus) => scope.updateAdvanced({ depositStatus: depositStatus || null })} options={[{ value: 'yes', label: 'Có tiền gửi' }, { value: 'no', label: 'Không có tiền gửi' }]} /></label>
        <label>Trạng thái tiền vay<Select allowClear value={draft.advanced.loanStatus} onChange={(loanStatus) => scope.updateAdvanced({ loanStatus: loanStatus || null })} options={[{ value: 'yes', label: 'Có tiền vay' }, { value: 'no', label: 'Không có tiền vay' }]} /></label>
        <div className="global-scope-range"><Text strong>Tiền gửi (triệu đồng)</Text><InputNumber min={0} placeholder="Từ" value={draft.advanced.minDeposit} onChange={(minDeposit) => scope.updateAdvanced({ minDeposit })} /><InputNumber min={0} placeholder="Đến" value={draft.advanced.maxDeposit} onChange={(maxDeposit) => scope.updateAdvanced({ maxDeposit })} /></div>
        <div className="global-scope-range"><Text strong>Tiền vay (triệu đồng)</Text><InputNumber min={0} placeholder="Từ" value={draft.advanced.minLoan} onChange={(minLoan) => scope.updateAdvanced({ minLoan })} /><InputNumber min={0} placeholder="Đến" value={draft.advanced.maxLoan} onChange={(maxLoan) => scope.updateAdvanced({ maxLoan })} /></div>
        <div className="global-scope-range"><Text strong>CASA (triệu đồng)</Text><InputNumber min={0} placeholder="Từ" value={draft.advanced.minCasa} onChange={(minCasa) => scope.updateAdvanced({ minCasa })} /><InputNumber min={0} placeholder="Đến" value={draft.advanced.maxCasa} onChange={(maxCasa) => scope.updateAdvanced({ maxCasa })} /></div>
        <label>Thông tin liên hệ<Select allowClear value={draft.advanced.contactStatus} onChange={(contactStatus) => scope.updateAdvanced({ contactStatus: contactStatus || null })} options={[{ value: 'available', label: 'Có số điện thoại' }, { value: 'missing', label: 'Thiếu số điện thoại' }]} /></label>
        <label>Sản phẩm dịch vụ<Select allowClear value={draft.advanced.serviceStatus} onChange={(serviceStatus) => scope.updateAdvanced({ serviceStatus: serviceStatus || null })} options={[{ value: 'none', label: 'Chưa sử dụng sản phẩm' }]} /></label>
        <label>Số sản phẩm tối thiểu<InputNumber min={0} precision={0} value={draft.advanced.minServiceCount} onChange={(minServiceCount) => scope.updateAdvanced({ minServiceCount })} style={{ width: '100%' }} /></label>
      </div>
    </Drawer>
  </>;
}
