import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiOutlined,
  BankOutlined,
  CopyOutlined,
  DatabaseOutlined,
  PhoneOutlined,
  RiseOutlined,
  UserOutlined,
  WalletOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Col, Modal, Row, Select, Skeleton, Space, Spin, Tag, Tooltip, Typography, message } from 'antd';

import CampaignList from '../components/dashboard/CampaignList';
import VisualDashboard from '../components/dashboard/VisualDashboard';
import { getScopeLabel, resolveBranchScope, toApiBranchParams, useAuth } from '../auth';
import client from '../api/client';
import {
  generateCallScript,
  loadContactedIds,
  money,
  saveContactedId,
} from '../utils/customerMetrics';
import { formatPeriodKey } from '../utils/periodUtils';
import { useCustomerSummary } from '../hooks/useCustomerSummary';

const { Paragraph, Text, Title } = Typography;

function compactMoney(value) {
  const amount = Math.abs(Number(value || 0));
  const sign = Number(value || 0) < 0 ? '-' : '';
  if (amount >= 1_000_000_000_000) return `${sign}${(amount / 1_000_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} nghìn tỷ`;
  if (amount >= 1_000_000_000) return `${sign}${(amount / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
  if (amount >= 1_000_000) return `${sign}${(amount / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu`;
  return `${sign}${amount.toLocaleString('vi-VN')}`;
}

function StatusIndicator({ title, status, icon }) {
  const isOk = status === 'connected' || status === 'ok';
  const color = status === 'checking' ? 'processing' : isOk ? 'success' : 'error';
  const text = status === 'checking' ? 'Đang check' : isOk ? 'Hoạt động' : 'Ngoại tuyến';

  return (
    <Tag color={color} style={{ fontSize: 11, padding: '2px 8px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      {icon}
      <span>
        {title}: <strong>{text}</strong>
      </span>
    </Tag>
  );
}

function KpiCard({ loading, label, value, icon, borderColor, bgGradient, valueColor }) {
  const content = (
    <>
      {loading ? (
        <Skeleton.Input active size="small" style={{ width: '80%', height: 28 }} />
      ) : (
        <span className="dashboard-kpi-value" style={{ color: valueColor }}>{value}</span>
      )}
    </>
  );

  return (
    <div
      className="dashboard-kpi-card"
      style={{
        background: bgGradient,
        border: '1px solid #e2e8f0',
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: '8px',
        padding: '12px 14px',
        boxShadow: `0 2px 8px ${borderColor}14`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: borderColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {label}
        </span>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            backgroundColor: `${borderColor}18`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: borderColor,
          }}
        >
          {icon}
        </div>
      </div>
      {content}
    </div>
  );
}

function Dashboard() {
  const { user } = useAuth();
  const {
    status,
    rows,
    periods,
    periodKey,
    isDemo,
    reload,
    dashboardAggregate,
    trends,
    trendsLoading,
  } = useCustomerSummary();

  const [filterCn, setFilterCn] = useState(null);
  const [filterPgd, setFilterPgd] = useState(null);
  const [scopeOptions, setScopeOptions] = useState({ branches: [], pgds: [] });

  const branchScope = useMemo(
    () => resolveBranchScope(user, filterCn, filterPgd),
    [user, filterCn, filterPgd],
  );
  const effectiveFilterCn = branchScope.filterCn;
  const effectiveFilterPgd = branchScope.filterPgd;
  const branchSelectValue = effectiveFilterCn || undefined;

  const cnOptions = useMemo(() => {
    const allowed = new Set(branchScope.allowedBranches || []);
    const source = scopeOptions.branches || [];
    const visible = branchScope.canViewProvince || allowed.size === 0
      ? source
      : source.filter((code) => allowed.has(code));
    return visible.map((code) => ({ value: code, label: code }));
  }, [branchScope.allowedBranches, branchScope.canViewProvince, scopeOptions.branches]);

  const pgdOptions = useMemo(() => {
    const allowed = new Set(branchScope.allowedPgds || []);
    const source = scopeOptions.pgds || [];
    const visible = branchScope.canViewProvince || allowed.size === 0
      ? source
      : source.filter((item) => allowed.has(typeof item === 'string' ? item : item.value));
    return visible.map((item) => ({
      value: typeof item === 'string' ? item : item.value,
      label: typeof item === 'string' ? item : item.label,
    }));
  }, [branchScope.allowedPgds, branchScope.canViewProvince, scopeOptions.pgds]);

  const reloadWithScope = useCallback(
    (nextPeriod = periodKey, cn = effectiveFilterCn, pgd = effectiveFilterPgd) => {
      if (nextPeriod) reload(nextPeriod, toApiBranchParams(cn, pgd));
    },
    [effectiveFilterCn, effectiveFilterPgd, periodKey, reload],
  );

  const handleCnChange = useCallback((value) => {
    const resolved = resolveBranchScope(user, value || null, null);
    if (resolved.denied) {
      message.warning('Bạn không có quyền xem chi nhánh này');
      setFilterCn(resolved.defaultCn);
      setFilterPgd(resolved.defaultPgd);
      reloadWithScope(periodKey, resolved.defaultCn, resolved.defaultPgd);
      return;
    }
    setFilterCn(resolved.filterCn);
    setFilterPgd(resolved.filterPgd);
    reloadWithScope(periodKey, resolved.filterCn, resolved.filterPgd);
  }, [periodKey, reloadWithScope, user]);

  const handlePgdChange = useCallback((value) => {
    const resolved = resolveBranchScope(user, effectiveFilterCn, value || null);
    if (resolved.denied) {
      message.warning('Bạn không có quyền xem phòng giao dịch này');
      return;
    }
    setFilterCn(resolved.filterCn);
    setFilterPgd(resolved.filterPgd);
    reloadWithScope(periodKey, resolved.filterCn, resolved.filterPgd);
  }, [effectiveFilterCn, periodKey, reloadWithScope, user]);

  const [contactOpen, setContactOpen] = useState(false);
  const [selectedCust, setSelectedCust] = useState(null);
  const [contactedIds, setContactedIds] = useState(() => loadContactedIds(null));

  useEffect(() => {
    if (periodKey) {
      setContactedIds(loadContactedIds(periodKey));
    }
  }, [periodKey]);

  useEffect(() => {
    if (!periodKey || isDemo) return;
    let mounted = true;
    client
      .get('/customer-processing/profile-filter-options', {
        params: {
          period_key: periodKey,
          branch_code: effectiveFilterCn || undefined,
        },
      })
      .then(({ data }) => {
        if (!mounted) return;
        setScopeOptions({
          branches: data?.branches || [],
          pgds: data?.pgd_options || data?.pgds || [],
        });
      })
      .catch(() => {
        if (mounted) setScopeOptions({ branches: [], pgds: [] });
      });
    return () => {
      mounted = false;
    };
  }, [effectiveFilterCn, isDemo, periodKey]);

  const kpis = dashboardAggregate?.kpis;
  const metrics = useMemo(
    () => ({
      loan: kpis?.total_loan ?? 0,
      deposit: kpis?.total_deposit ?? 0,
      casa: kpis?.total_casa ?? 0,
      noService: kpis?.no_service_count ?? 0,
      totalCustomers: kpis?.total_customers ?? 0,
    }),
    [kpis],
  );

  const campaignCandidates = useMemo(
    () => dashboardAggregate?.campaign_top5 || [],
    [dashboardAggregate],
  );

  const periodOptions = useMemo(
    () =>
      periods.map((p) => ({
        value: p.period_key,
        label: formatPeriodKey(p.period_key),
      })),
    [periods],
  );

  const handlePeriodChange = (value) => {
    setContactedIds(loadContactedIds(value));
    reload(value, toApiBranchParams(effectiveFilterCn, effectiveFilterPgd));
  };

  const handleContactClick = useCallback((cust) => {
    setSelectedCust(cust);
    setContactOpen(true);
  }, []);

  const handleMarkContacted = useCallback(
    (cust) => {
      if (!periodKey) return;
      const ids = saveContactedId(periodKey, cust.ma_kh_chuan);
      setContactedIds(new Set(ids));
      message.success(`Đã đánh dấu đã tiếp cận: ${cust.ten_kh}`);
    },
    [periodKey],
  );

  const generatedCallScript = useMemo(() => generateCallScript(selectedCust), [selectedCust]);

  const copyToClipboard = useCallback((text) => {
    navigator.clipboard.writeText(text);
    message.success('Đã sao chép kịch bản vào bộ nhớ tạm!');
  }, []);

  const dataLoading = status.loading;

  return (
    <Space orientation="vertical" size={20} className="page-stack">
      <section
        className="brand-panel"
        style={{ padding: '16px 24px', minHeight: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div style={{ flex: 1 }}>
          <Space align="center" style={{ marginBottom: 4 }} wrap>
            <Tag color="gold">Agribank Bắc Ninh</Tag>
            <StatusIndicator title="Backend" status={status.backend} icon={<ApiOutlined />} />
            <StatusIndicator title="Database" status={status.database} icon={<DatabaseOutlined />} />
          </Space>
          <Title level={2} style={{ margin: 0 }}>
            Báo cáo phân tích dữ liệu khách hàng
          </Title>
          <Paragraph style={{ margin: 0, opacity: 0.85, fontSize: 13 }}>
            Phân tích thâm nhập dịch vụ, cross-sell và quy mô tài sản toàn chi nhánh
            {!dataLoading && metrics.totalCustomers > 0 && (
              <span> — Dữ liệu: <strong>{metrics.totalCustomers.toLocaleString('vi-VN')}</strong> khách hàng</span>
            )}
          </Paragraph>
          <Space wrap style={{ marginTop: 12 }}>
            <Select
              placeholder="Chọn kỳ dữ liệu"
              style={{ minWidth: 180 }}
              value={periodKey}
              onChange={handlePeriodChange}
              options={periodOptions}
              loading={dataLoading}
              allowClear={false}
              disabled={isDemo && !periodOptions.length}
            />
            <Select
              placeholder="Phạm vi xem"
              style={{ minWidth: 200 }}
              value={branchSelectValue}
              onChange={handleCnChange}
              options={cnOptions}
              allowClear
              disabled={dataLoading || !branchScope.canChangeBranch}
            />
            <Select
              placeholder={effectiveFilterCn ? 'Lọc PGD thuộc chi nhánh' : 'Lọc toàn bộ PGD'}
              style={{ minWidth: 140 }}
              value={effectiveFilterPgd}
              onChange={handlePgdChange}
              options={pgdOptions}
              allowClear
              disabled={dataLoading || !branchScope.canChangePgd}
            />
            <Tag color="blue">{getScopeLabel(effectiveFilterCn, effectiveFilterPgd)}</Tag>
          </Space>
        </div>
        <BankOutlined className="brand-panel-icon" style={{ fontSize: 44, opacity: 0.2 }} />
      </section>

      {isDemo && (
        <Alert
          type="info"
          showIcon
          icon={<WarningOutlined />}
          message="Đang hiển thị dữ liệu mẫu (Demo). Khi backend kết nối, Dashboard sẽ nhận dữ liệu tổng hợp từ API."
          style={{ borderRadius: '8px' }}
        />
      )}

      <Spin spinning={dataLoading} tip="Đang tải dữ liệu Dashboard...">
        <Row gutter={[12, 12]} className="dashboard-kpi-grid">
          <Col xs={24} sm={12} lg={8} xl={5}>
            <KpiCard
              loading={dataLoading}
              label="Tổng số khách hàng"
              value={
                <>
                  {metrics.totalCustomers.toLocaleString('vi-VN')}{' '}
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>khách hàng</span>
                </>
              }
              icon={<UserOutlined style={{ fontSize: 14 }} />}
              borderColor="#3b82f6"
              bgGradient="linear-gradient(to bottom right, #ffffff, #f8fafc)"
              valueColor="#1e3a8a"
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={5}>
            <KpiCard
              loading={dataLoading}
              label="Tổng dư nợ cho vay"
              value={
                <Tooltip title={`${money(metrics.loan)} đ`}>
                  <span>{compactMoney(metrics.loan)} <span className="dashboard-kpi-unit">đ</span></span>
                </Tooltip>
              }
              icon={<WalletOutlined style={{ fontSize: 14 }} />}
              borderColor="#f43f5e"
              bgGradient="linear-gradient(to bottom right, #ffffff, #fff1f2)"
              valueColor="#9f1239"
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={5}>
            <KpiCard
              loading={dataLoading}
              label="Tổng tiền gửi CKH"
              value={
                <Tooltip title={`${money(metrics.deposit)} đ`}>
                  <span>{compactMoney(metrics.deposit)} <span className="dashboard-kpi-unit">đ</span></span>
                </Tooltip>
              }
              icon={<BankOutlined style={{ fontSize: 14 }} />}
              borderColor="#10b981"
              bgGradient="linear-gradient(to bottom right, #ffffff, #ecfdf5)"
              valueColor="#064e3b"
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={5}>
            <KpiCard
              loading={dataLoading}
              label="Tổng CASA (TGTT bình quan)"
              value={
                <Tooltip title={`${money(metrics.casa)} đ`}>
                  <span>{compactMoney(metrics.casa)} <span className="dashboard-kpi-unit">đ</span></span>
                </Tooltip>
              }
              icon={<RiseOutlined style={{ fontSize: 14 }} />}
              borderColor="#06b6d4"
              bgGradient="linear-gradient(to bottom right, #ffffff, #ecfeff)"
              valueColor="#164e63"
            />
          </Col>
          <Col xs={24} sm={12} lg={8} xl={4}>
            <KpiCard
              loading={dataLoading}
              label="Chưa dùng dịch vụ nào"
              value={
                <>
                  {metrics.noService.toLocaleString('vi-VN')}{' '}
                  <span style={{ fontSize: 12, fontWeight: 600 }}>KH</span>
                </>
              }
              icon={<WarningOutlined style={{ fontSize: 14 }} />}
              borderColor="#d97706"
              bgGradient="linear-gradient(to bottom right, #ffffff, #fffbeb)"
              valueColor="#78350f"
            />
          </Col>
        </Row>
      </Spin>

      <VisualDashboard
        aggregate={dashboardAggregate}
        rows={isDemo ? rows : []}
        trends={trends}
        trendsLoading={trendsLoading}
        loading={dataLoading}
        emptyDescription="Hãy liên kết cơ sở dữ liệu để hiển thị biểu đồ phân tích trực quan"
        showTrend
      />

      <CampaignList
        candidates={campaignCandidates}
        contactedIds={contactedIds}
        loading={dataLoading}
      />

      <Modal
        title={
          <Space>
            <span>
              📞 Hướng dẫn tiếp cận: <strong>{selectedCust?.ten_kh}</strong>
            </span>
          </Space>
        }
        open={contactOpen}
        onCancel={() => setContactOpen(false)}
        footer={[
          <Button key="close" onClick={() => setContactOpen(false)}>
            Đóng
          </Button>,
          <Button
            key="copy"
            type="primary"
            icon={<CopyOutlined />}
            style={{ background: '#7c3aed', borderColor: '#7c3aed' }}
            onClick={() => copyToClipboard(generatedCallScript)}
          >
            Sao chép kịch bản
          </Button>,
        ]}
        width={600}
      >
        {selectedCust && (
          <Space orientation="vertical" size={16} style={{ width: '100%', paddingTop: 10 }}>
            <Card size="small" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <Row gutter={[16, 12]}>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Số điện thoại liên hệ
                  </Text>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginTop: 2 }}>
                    <PhoneOutlined style={{ marginRight: 6, color: '#10b981' }} />
                    {selectedCust.telephone || '0912 345 678'}
                  </div>
                </Col>
                <Col span={12}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Dư nợ cho vay
                  </Text>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#b91c1c', marginTop: 2 }}>
                    {money(selectedCust.so_du_tien_vay)} đ
                  </div>
                </Col>
                <Col span={24}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Sản phẩm chưa đăng ký (Đề xuất tư vấn)
                  </Text>
                  <div style={{ marginTop: 4 }}>
                    {selectedCust.unused?.slice(0, 5).map((s) => (
                      <Tag key={s.key} color="orange" style={{ border: 'none', marginBottom: 4 }}>
                        {s.label}
                      </Tag>
                    ))}
                  </div>
                </Col>
              </Row>
            </Card>

            <div>
              <Text strong style={{ fontSize: 13, color: '#475569', display: 'block', marginBottom: 6 }}>
                💡 Kịch bản gọi điện gợi ý (Tùy biến tự động theo sản phẩm thiếu):
              </Text>
              <pre
                style={{
                  background: '#f5f3ff',
                  border: '1px solid #ddd6fe',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  fontSize: '12px',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'inherit',
                  color: '#4c1d95',
                  lineHeight: '1.6',
                  margin: 0,
                }}
              >
                {generatedCallScript}
              </pre>
            </div>
          </Space>
        )}
      </Modal>
    </Space>
  );
}

export default Dashboard;

