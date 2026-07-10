import {
  AimOutlined,
  BankOutlined,
  DownloadOutlined,
  FilterOutlined,
  RiseOutlined,
  SearchOutlined,
  UserOutlined,
  WalletOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  Collapse,
  Empty,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Typography,
} from 'antd';

import { ALL_BRANCHES_VALUE, CN_NAMES, PROVINCE_LABEL } from '../../constants/branches';
import { ACTIVE_SERVICES } from '../../constants/services';
import { CROSS_SELL_PRESETS } from '../../utils/reportParams';
import { CheckboxPopoverFilter } from './reportUi';

const { Text } = Typography;

export default function ReportFilterBar({
  form,
  selectedPeriod,
  reportPeriods,
  onPeriodChange,
  loading,
  searchText,
  onSearchChange,
  filterCn,
  filterPgd,
  cnOptions,
  pgdOptions,
  branchSelectDisabled,
  pgdSelectDisabled,
  onCnChange,
  onPgdChange,
  filters,
  onFilterChange,
  loanTypeOptions,
  officerOptions,
  hasFilters,
  onApply,
  onReset,
}) {
  return (
    <Card
      className="report-filter-card"
      title={
        <Space>
          <FilterOutlined />
          <span>Bộ lọc báo cáo</span>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        <Row gutter={[16, 12]} align="bottom">
          <Col xs={24} sm={12} md={6}>
            <Form.Item label="Kỳ dữ liệu đã xử lý" style={{ marginBottom: 0 }}>
              <Select
                placeholder="Chọn kỳ dữ liệu"
                value={selectedPeriod}
                options={reportPeriods.map((item) => ({
                  value: item.period_key,
                  label: `${item.period_key} · ${Number(item.profile_count || 0).toLocaleString('vi-VN')} KH`,
                }))}
                onChange={onPeriodChange}
                notFoundContent={<Empty description="Chưa có kỳ đã xử lý" imageStyle={{ height: 34 }} />}
                showSearch
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={5}>
            <Form.Item label="Tìm kiếm nhanh" style={{ marginBottom: 0 }}>
              <Input
                placeholder="Tên KH / CIF / Mã CB / SĐT"
                value={searchText}
                onChange={(e) => onSearchChange(e.target.value)}
                allowClear
                prefix={<SearchOutlined style={{ color: '#cbd5e1' }} />}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Form.Item label="Chi nhánh" style={{ marginBottom: 0 }}>
              <Select
                placeholder={PROVINCE_LABEL}
                value={filterCn ?? ALL_BRANCHES_VALUE}
                onChange={onCnChange}
                options={[{ value: ALL_BRANCHES_VALUE, label: PROVINCE_LABEL }, ...cnOptions]}
                showSearch
                disabled={branchSelectDisabled}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Form.Item label="Phòng giao dịch" style={{ marginBottom: 0 }}>
              <Select
                placeholder="Tất cả PGD"
                value={filterPgd}
                onChange={onPgdChange}
                allowClear
                options={pgdOptions}
                showSearch
                disabled={pgdSelectDisabled || !filterCn}
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={5}>
            <Form.Item label=" " style={{ marginBottom: 0 }}>
              <Space wrap>
                <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={onApply}>
                  Tải báo cáo
                </Button>
                <Button icon={<DownloadOutlined />} disabled style={{ opacity: 0.65 }}>
                  Xuất Excel
                </Button>
                {hasFilters && (
                  <Button danger onClick={onReset}>
                    Xóa bộ lọc
                  </Button>
                )}
              </Space>
            </Form.Item>
          </Col>
        </Row>

        <Collapse
          className="report-filter-collapse"
          variant="borderless"
          defaultActiveKey={[]}
          items={[
            {
              key: 'advanced',
              label: 'Điều kiện lọc chi tiết',
              extra: <Text type="secondary">{hasFilters ? 'Đang có bộ lọc' : 'Bấm để mở'}</Text>,
              children: (
                <Row gutter={[12, 12]}>
                  <Col xs={24} sm={12} md={4}>
                    <Form.Item label="Loại KH" style={{ marginBottom: 0 }}>
                      <Select
                        placeholder="Tất cả"
                        value={filters.filterCustomerType}
                        onChange={(v) => onFilterChange('filterCustomerType', v || null)}
                        allowClear
                        options={[
                          { value: 'KHCN', label: 'KHCN' },
                          { value: 'KHDN', label: 'KHDN' },
                        ]}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={4}>
                    <Form.Item label="Loại vay" style={{ marginBottom: 0 }}>
                      <CheckboxPopoverFilter
                        title="Chọn loại vay"
                        placeholder="Tất cả loại vay"
                        options={loanTypeOptions}
                        value={filters.filterLoanType}
                        onChange={(v) => onFilterChange('filterLoanType', v)}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={5}>
                    <Form.Item label="Cán bộ phụ trách" style={{ marginBottom: 0 }}>
                      <Select
                        placeholder="Tất cả cán bộ"
                        value={filters.filterOfficer}
                        onChange={(v) => onFilterChange('filterOfficer', v || null)}
                        allowClear
                        options={officerOptions}
                        showSearch
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={4}>
                    <Form.Item label="Phạm vi KH" style={{ marginBottom: 0 }}>
                      <Select
                        placeholder="Tất cả"
                        value={filters.filterMultiBranch}
                        onChange={(v) => onFilterChange('filterMultiBranch', v ?? null)}
                        allowClear
                        options={[
                          { value: true, label: 'Nhiều chi nhánh' },
                          { value: false, label: 'Một chi nhánh' },
                        ]}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={5}>
                    <Form.Item label="Preset bán chéo" style={{ marginBottom: 0 }}>
                      <Select
                        placeholder="Tất cả"
                        value={filters.crossSellRule}
                        onChange={(v) => onFilterChange('crossSellRule', v || null)}
                        allowClear
                        options={CROSS_SELL_PRESETS}
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={5}>
                    <Form.Item label="KH chưa dùng dịch vụ" style={{ marginBottom: 0 }}>
                      <CheckboxPopoverFilter
                        title="Chọn dịch vụ khách hàng chưa dùng"
                        placeholder="Tất cả dịch vụ"
                        options={ACTIVE_SERVICES.map((item) => ({ value: item.key, label: item.label }))}
                        value={filters.filterUnusedSvc}
                        onChange={(v) => onFilterChange('filterUnusedSvc', v)}
                        className="report-checkbox-filter--services"
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={5}>
                    <Form.Item label="KH đã dùng dịch vụ" style={{ marginBottom: 0 }}>
                      <CheckboxPopoverFilter
                        title="Chọn dịch vụ khách hàng đã dùng"
                        placeholder="Tất cả dịch vụ"
                        options={ACTIVE_SERVICES.map((item) => ({ value: item.key, label: item.label }))}
                        value={filters.filterUsedSvc}
                        onChange={(v) => onFilterChange('filterUsedSvc', v)}
                        className="report-checkbox-filter--services"
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={4}>
                    <Form.Item label="Dư nợ (triệu)" style={{ marginBottom: 0 }}>
                      <Space.Compact style={{ width: '100%' }}>
                        <InputNumber
                          placeholder="Từ"
                          min={0}
                          value={filters.loanMin}
                          onChange={(v) => onFilterChange('loanMin', v)}
                          style={{ width: '50%' }}
                        />
                        <InputNumber
                          placeholder="Đến"
                          min={0}
                          value={filters.loanMax}
                          onChange={(v) => onFilterChange('loanMax', v)}
                          style={{ width: '50%' }}
                        />
                      </Space.Compact>
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={4}>
                    <Form.Item label="Tiền gửi CKH (triệu)" style={{ marginBottom: 0 }}>
                      <Space.Compact style={{ width: '100%' }}>
                        <InputNumber placeholder="Từ" min={0} value={filters.depositMin} onChange={(v) => onFilterChange('depositMin', v)} style={{ width: '50%' }} />
                        <InputNumber placeholder="Đến" min={0} value={filters.depositMax} onChange={(v) => onFilterChange('depositMax', v)} style={{ width: '50%' }} />
                      </Space.Compact>
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={4}>
                    <Form.Item label="TGTT BQ (triệu)" style={{ marginBottom: 0 }}>
                      <Space.Compact style={{ width: '100%' }}>
                        <InputNumber placeholder="Từ" min={0} value={filters.casaMin} onChange={(v) => onFilterChange('casaMin', v)} style={{ width: '50%' }} />
                        <InputNumber placeholder="Đến" min={0} value={filters.casaMax} onChange={(v) => onFilterChange('casaMax', v)} style={{ width: '50%' }} />
                      </Space.Compact>
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={4}>
                    <Form.Item label="Số DV đã dùng" style={{ marginBottom: 0 }}>
                      <Space.Compact style={{ width: '100%' }}>
                        <InputNumber placeholder="Từ" min={0} max={ACTIVE_SERVICES.length} value={filters.serviceCountMin} onChange={(v) => onFilterChange('serviceCountMin', v)} style={{ width: '50%' }} />
                        <InputNumber placeholder="Đến" min={0} max={ACTIVE_SERVICES.length} value={filters.serviceCountMax} onChange={(v) => onFilterChange('serviceCountMax', v)} style={{ width: '50%' }} />
                      </Space.Compact>
                    </Form.Item>
                  </Col>
                </Row>
              ),
            },
          ]}
        />
      </Form>
    </Card>
  );
}

export function ReportStatGrid({ summary, total, onNoServiceClick, filterActive }) {
  const cards = [
    {
      tone: 'blue',
      icon: <UserOutlined />,
      label: filterActive ? 'KH đã lọc' : 'Khách hàng',
      value: Number(total || summary.total_customers || 0).toLocaleString('vi-VN'),
      unit: 'toàn bộ',
    },
    {
      tone: 'red',
      icon: <WalletOutlined />,
      label: 'Tổng dư nợ',
      value: compact(summary.total_loan),
      unit: 'đ',
    },
    {
      tone: 'green',
      icon: <BankOutlined />,
      label: 'Tổng tiền gửi',
      value: compact(summary.total_deposit),
      unit: 'đ',
    },
    {
      tone: 'cyan',
      icon: <RiseOutlined />,
      label: 'TGTT bình quân',
      value: compact(summary.total_casa),
      unit: 'đ',
    },
    {
      tone: 'gold',
      icon: <WarningOutlined />,
      label: 'Chưa dùng DV nào',
      value: `${Number(summary.no_service_customers || 0).toLocaleString('vi-VN')} / ${Number(total || summary.total_customers || 0).toLocaleString('vi-VN')}`,
      unit: 'KH',
      onClick: onNoServiceClick,
    },
  ];

  return (
    <div className="report-stat-grid">
      {cards.map((item) => (
        <div key={item.label} className={`report-stat-card report-stat-card--${item.tone}${item.onClick ? ' is-clickable' : ''}`} onClick={item.onClick}>
          <div className="report-stat-card-head">
            <span className="report-stat-label">{item.label}</span>
            <span className="report-stat-icon">{item.icon}</span>
          </div>
          <div className="report-stat-number-wrap">
            <span className="report-stat-value">{item.value}</span>
            {item.unit && <span className="report-stat-unit">{item.unit}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function compact(value) {
  const amount = Math.abs(Number(value || 0));
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)} tỷ`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)} triệu`;
  return Number(value || 0).toLocaleString('vi-VN');
}
