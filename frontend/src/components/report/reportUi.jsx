import { Button, Checkbox, Popover } from 'antd';
import { FilterOutlined } from '@ant-design/icons';

export function CheckboxPopoverFilter({ title, placeholder, options, value, onChange, className = '' }) {
  const selected = Array.isArray(value) ? value : [];
  const buttonText = selected.length ? `${selected.length} đã chọn` : placeholder;

  const content = (
    <div className={`report-checkbox-filter ${className}`}>
      <Checkbox.Group value={selected} onChange={onChange} options={options} />
      {selected.length > 0 && (
        <Button type="link" size="small" onClick={() => onChange([])} style={{ paddingLeft: 0, marginTop: 6 }}>
          Bỏ chọn tất cả
        </Button>
      )}
    </div>
  );

  return (
    <Popover trigger="click" placement="bottomLeft" title={title} content={content} overlayClassName="report-filter-popover">
      <Button className={selected.length ? 'report-filter-button is-active' : 'report-filter-button'}>
        <span>{buttonText}</span>
        <FilterOutlined />
      </Button>
    </Popover>
  );
}

export function ReportStatCard({ tone, icon, label, value, unit, tooltip, onClick }) {
  const content = (
    <div className={`report-stat-card report-stat-card--${tone}${onClick ? ' is-clickable' : ''}`} onClick={onClick}>
      <div className="report-stat-card-head">
        <span className="report-stat-label">{label}</span>
        <span className="report-stat-icon">{icon}</span>
      </div>
      <div className="report-stat-number-wrap">
        <span className="report-stat-value">{value}</span>
        {unit && <span className="report-stat-unit">{unit}</span>}
      </div>
    </div>
  );

  return tooltip ? <span title={tooltip}>{content}</span> : content;
}
