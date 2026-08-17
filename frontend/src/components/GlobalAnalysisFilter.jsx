import { ApartmentOutlined, BankOutlined, CalendarOutlined, CustomerServiceOutlined, FilterOutlined, ReloadOutlined, SearchOutlined, TeamOutlined, WalletOutlined } from '@ant-design/icons';
import { Button, Drawer, Input, InputNumber, Select, Space, Typography, message } from 'antd';
import { useState } from 'react';
import { useAnalysisScope } from '../c360/AnalysisScopeContext';
import { ACTIVE_SERVICES } from '../constants/services';

const { Text } = Typography;
const C360_PAGES = new Set(['c360-dashboard', 'c360-insights', 'c360-customers', 'analysis-deposit', 'analysis-credit', 'analysis-income', 'analysis-unit']);

function optionValue(item) { return typeof item === 'string' ? item : item?.value; }
function optionLabel(item) { return typeof item === 'string' ? item : item?.label || item?.name || item?.value; }

const moneyFormatter = (value) => value == null || value === '' ? '' : String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const moneyParser = (value) => String(value || '').replace(/[^\d]/g, '');
const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
function readThree(number, full = false) {
  const hundred = Math.floor(number / 100); const ten = Math.floor((number % 100) / 10); const unit = number % 10;
  const words = [];
  if (hundred || full) words.push(`${DIGITS[hundred]} trăm`);
  if (ten > 1) words.push(`${DIGITS[ten]} mươi`);
  else if (ten === 1) words.push('mười');
  else if (unit && (hundred || full)) words.push('lẻ');
  if (unit) words.push(unit === 1 && ten > 1 ? 'mốt' : unit === 5 && ten > 0 ? 'lăm' : DIGITS[unit]);
  return words.join(' ');
}
function moneyInWords(value) {
  let number = Math.floor(Number(value || 0));
  if (!number) return '';
  const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ']; const groups = [];
  while (number > 0) { groups.push(number % 1000); number = Math.floor(number / 1000); }
  return `${groups.map((group, index) => group ? `${readThree(group, index < groups.length - 1 && group < 100)} ${units[index]}` : '').reverse().filter(Boolean).join(' ')} đồng`;
}

function MoneyRange({ label, icon, minValue, maxValue, onMin, onMax }) {
  const inputProps = { min: 0, max: Number.MAX_SAFE_INTEGER, precision: 0, formatter: moneyFormatter, parser: moneyParser, controls: false, style: { width: '100%' } };
  return <div className="global-filter-money-range"><div className="global-filter-section-label">{icon}{label}</div><div className="global-filter-money-inputs"><label>Từ<InputNumber {...inputProps} value={minValue} placeholder="0" onChange={onMin} /><small>{moneyInWords(minValue)}</small></label><label>Đến<InputNumber {...inputProps} value={maxValue} placeholder="Không giới hạn" onChange={onMax} status={minValue != null && maxValue != null && maxValue < minValue ? 'error' : ''} /><small>{moneyInWords(maxValue)}</small></label></div></div>;
}

export default function GlobalAnalysisFilter({ activeMenu }) {
  const scope = useAnalysisScope();
  const [open, setOpen] = useState(false);
  if (!C360_PAGES.has(activeMenu) || !scope) return null;
  const { draft, applied, options, periods, metadataLoading } = scope;
  const advancedCount = Object.values(draft.advanced || {}).filter((value) => Array.isArray(value) ? value.length : value != null && value !== '').length;
  const apply = () => {
    const invalidRange = [['Tiền gửi', draft.advanced.minDeposit, draft.advanced.maxDeposit], ['Tiền vay', draft.advanced.minLoan, draft.advanced.maxLoan], ['CASA', draft.advanced.minCasa, draft.advanced.maxCasa]].find(([, min, max]) => min != null && max != null && max < min);
    if (invalidRange) return message.error(`Giá trị Đến của ${invalidRange[0]} phải lớn hơn hoặc bằng giá trị Từ`);
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
    <Drawer rootClassName="global-filter-drawer" title={<div><strong>Bộ lọc phân tích nâng cao</strong><small>Điều kiện được áp dụng đồng bộ cho tất cả màn hình và danh sách chi tiết</small></div>} width="min(900px, 96vw)" open={open} onClose={() => setOpen(false)} extra={<Space><Button onClick={scope.reset}>Đặt lại</Button><Button type="primary" icon={<SearchOutlined />} onClick={apply}>Áp dụng & xem dữ liệu</Button></Space>}>
      <div className="global-scope-advanced">
        <section className="global-filter-section is-customer"><header><TeamOutlined /><span><strong>Khách hàng & quản lý</strong><small>Nhận diện và phạm vi quan hệ</small></span></header><div className="global-filter-grid"><label className="is-wide">Tìm khách hàng<Input allowClear placeholder="Mã KH, tên, số điện thoại..." value={draft.advanced.keyword} onChange={(event) => scope.updateAdvanced({ keyword: event.target.value })} /></label><label>Loại khách hàng<Select mode="multiple" allowClear maxTagCount="responsive" value={draft.advanced.customerTypes} onChange={(customerTypes) => scope.updateAdvanced({ customerTypes })} options={(options.customer_types || []).map((item) => ({ value: optionValue(item), label: optionLabel(item) }))} /></label><label>Cán bộ quản lý<Select allowClear showSearch optionFilterProp="label" value={draft.advanced.officerCode} onChange={(officerCode) => scope.updateAdvanced({ officerCode: officerCode || null })} options={(options.officers || []).map((item) => ({ value: item.code || item.value, label: item.name ? `${item.name} (${item.code})` : optionLabel(item) }))} /></label><label>Quan hệ chi nhánh<Select allowClear value={draft.advanced.relationshipStatus} onChange={(relationshipStatus) => scope.updateAdvanced({ relationshipStatus: relationshipStatus || null })} options={[{ value: 'single', label: 'Một chi nhánh' }, { value: 'multi', label: 'Đa chi nhánh' }]} /></label><label>Thông tin liên hệ<Select allowClear value={draft.advanced.contactStatus} onChange={(contactStatus) => scope.updateAdvanced({ contactStatus: contactStatus || null })} options={[{ value: 'available', label: 'Có số điện thoại' }, { value: 'missing', label: 'Thiếu số điện thoại' }]} /></label></div></section>
        <section className="global-filter-section is-deposit"><header><WalletOutlined /><span><strong>Tiền gửi & CASA</strong><small>Nhập trực tiếp số tiền theo VNĐ</small></span></header><div className="global-filter-grid"><label>Trạng thái tiền gửi<Select allowClear value={draft.advanced.depositStatus} onChange={(depositStatus) => scope.updateAdvanced({ depositStatus: depositStatus || null })} options={[{ value: 'yes', label: 'Có tiền gửi' }, { value: 'no', label: 'Không có tiền gửi' }]} /></label><MoneyRange label="Tổng tiền gửi" minValue={draft.advanced.minDeposit} maxValue={draft.advanced.maxDeposit} onMin={(minDeposit) => scope.updateAdvanced({ minDeposit })} onMax={(maxDeposit) => scope.updateAdvanced({ maxDeposit })} /><MoneyRange label="TGTT bình quân (CASA)" minValue={draft.advanced.minCasa} maxValue={draft.advanced.maxCasa} onMin={(minCasa) => scope.updateAdvanced({ minCasa })} onMax={(maxCasa) => scope.updateAdvanced({ maxCasa })} /></div></section>
        <section className="global-filter-section is-loan"><header><BankOutlined /><span><strong>Tiền vay</strong><small>Dư nợ và loại hình vay</small></span></header><div className="global-filter-grid"><label>Trạng thái tiền vay<Select allowClear value={draft.advanced.loanStatus} onChange={(loanStatus) => scope.updateAdvanced({ loanStatus: loanStatus || null })} options={[{ value: 'yes', label: 'Có tiền vay' }, { value: 'no', label: 'Không có tiền vay' }]} /></label><label>Loại hình vay<Select mode="multiple" allowClear maxTagCount="responsive" value={draft.advanced.loanTypes} onChange={(loanTypes) => scope.updateAdvanced({ loanTypes })} options={(options.loan_types || []).map((item) => ({ value: optionValue(item), label: optionLabel(item) }))} /></label><MoneyRange label="Tổng dư nợ" minValue={draft.advanced.minLoan} maxValue={draft.advanced.maxLoan} onMin={(minLoan) => scope.updateAdvanced({ minLoan })} onMax={(maxLoan) => scope.updateAdvanced({ maxLoan })} /></div></section>
        <section className="global-filter-section is-service"><header><CustomerServiceOutlined /><span><strong>Sản phẩm dịch vụ</strong><small>Có thể chọn đồng thời nhiều sản phẩm</small></span></header><div className="global-filter-grid"><label className="is-wide">Sản phẩm đang sử dụng<Select mode="multiple" allowClear maxTagCount="responsive" value={draft.advanced.serviceCodes} onChange={(serviceCodes) => scope.updateAdvanced({ serviceCodes })} options={ACTIVE_SERVICES.map((item) => ({ value: item.key, label: item.label }))} /></label><label>Trạng thái sử dụng<Select allowClear value={draft.advanced.serviceStatus} onChange={(serviceStatus) => scope.updateAdvanced({ serviceStatus: serviceStatus || null })} options={[{ value: 'none', label: 'Chưa sử dụng sản phẩm nào' }]} /></label><label>Số sản phẩm tối thiểu<InputNumber min={0} max={ACTIVE_SERVICES.length} precision={0} controls={false} value={draft.advanced.minServiceCount} onChange={(minServiceCount) => scope.updateAdvanced({ minServiceCount })} style={{ width: '100%' }} /></label></div></section>
      </div>
    </Drawer>
  </>;
}
