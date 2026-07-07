import { memo, useMemo } from 'react';
import {
  AimOutlined,
  CrownOutlined,
  TeamOutlined,
  TrophyOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Card, Col, Empty, Row, Space, Tag } from 'antd';

import { GROUP_COLORS } from '../../constants/services';
import { formatLoan } from '../../utils/customerMetrics';
import { resolveDashboardView } from '../../utils/dashboardView';
import TrendChart from './TrendChart';

function MedalIcon({ index }) {
  if (index === 0) return <CrownOutlined style={{ color: '#eab308', fontSize: 18 }} />;
  if (index === 1) return <TrophyOutlined style={{ color: '#94a3b8', fontSize: 16 }} />;
  if (index === 2) return <TrophyOutlined style={{ color: '#b45309', fontSize: 16 }} />;
  return <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>#{index + 1}</span>;
}

function VisualDashboard({
  aggregate,
  rows = [],
  trends,
  trendsLoading,
  loading = false,
  emptyDescription,
  showTrend = true,
}) {
  const view = useMemo(() => resolveDashboardView(aggregate, rows), [aggregate, rows]);

  if (!view || view.total === 0) {
    return (
      <Card
        loading={loading}
        style={{ textAlign: 'center', padding: '40px 0', border: '1px dashed #e2e8f0', borderRadius: '12px' }}
      >
        <Empty description={emptyDescription || 'Chưa có dữ liệu để hiển thị biểu đồ phân tích'} />
      </Card>
    );
  }

  const { serviceStats, segmentStats, officerLeaderboard, loanTypeStats, total } = view;

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <Card
          loading={loading}
          title={
            <span>
              <AimOutlined style={{ color: '#7c3aed', marginRight: 6 }} />
              Xếp hạng thâm nhập dịch vụ (Bán chéo)
            </span>
          }
          variant="borderless"
          style={{ borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}
        >
          <div style={{ maxHeight: '340px', overflowY: 'auto', paddingRight: '8px' }}>
            {serviceStats.map((s, index) => {
              const color = GROUP_COLORS[s.group] || '#1890ff';
              return (
                <div key={s.key} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span>
                      <strong style={{ color: '#475569', marginRight: 4 }}>#{index + 1}</strong>
                      {s.label}{' '}
                      <Tag color={color} style={{ fontSize: 9, lineHeight: '14px', height: '16px', padding: '0 4px', border: 'none', marginLeft: 4 }}>
                        {s.group}
                      </Tag>
                    </span>
                    <strong style={{ color: '#1e293b' }}>
                      {s.pct}% <span style={{ color: '#64748b', fontWeight: 500, fontSize: 11 }}>({s.count}/{total.toLocaleString()} KH)</span>
                    </strong>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`${s.label}: ${s.pct}%`}
                    aria-valuenow={s.pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}
                  >
                    <div
                      style={{
                        width: `${s.pct}%`,
                        height: '100%',
                        background: `linear-gradient(to right, ${color}90, ${color})`,
                        borderRadius: '4px',
                        transition: 'width 0.5s ease-in-out',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </Col>

      <Col xs={24} lg={12}>
        <Card
          loading={loading}
          title={
            <span>
              <TeamOutlined style={{ color: '#0ea5e9', marginRight: 6 }} />
              Bảng vàng Cán bộ tín dụng (Dư nợ & Bán chéo)
            </span>
          }
          variant="borderless"
          style={{ borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}
        >
          <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
            {officerLeaderboard.map((o, index) => (
              <div
                key={o.code}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderBottom: '1px solid #f1f5f9',
                  background: index < 3 ? '#faf5ff' : 'transparent',
                  borderRadius: '6px',
                  marginBottom: 4,
                }}
              >
                <Space size={12}>
                  <span style={{ width: 24, textAlign: 'center', display: 'inline-block' }}>
                    <MedalIcon index={index} />
                  </span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{o.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      Mã CB: {o.code} | {o.custCount} KH
                    </div>
                  </div>
                </Space>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0369a1' }}>{formatLoan(o.totalLoan)}</div>
                  <div style={{ fontSize: 11, color: '#7c3aed' }}>
                    CASA: {formatLoan(o.totalCASA)} | Chỉ số BC:{' '}
                    <strong style={{ color: '#15803d' }}>{o.avgCrossSell}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </Col>

      {showTrend && (
        <Col xs={24} lg={12}>
          <TrendChart trends={trends} loading={trendsLoading} />
        </Col>
      )}

      <Col xs={24} lg={showTrend ? 12 : 24} md={showTrend ? 12 : 12}>
        <Card
          loading={loading}
          title={
            <span>
              <WalletOutlined style={{ color: '#f59e0b', marginRight: 6 }} />
              Phân bổ Dư nợ theo Loại Vay
            </span>
          }
          variant="borderless"
          style={{ borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}
        >
          <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
            {loanTypeStats.map((l) => (
              <div key={l.type} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                  <span style={{ fontWeight: 600, color: '#475569' }}>{l.type}</span>
                  <span style={{ fontWeight: 700, color: '#1e293b' }}>
                    {formatLoan(l.amt)} <span style={{ color: '#64748b', fontWeight: 500 }}>({l.pct}%)</span>
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`${l.type}: ${l.pct}%`}
                  aria-valuenow={l.pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  style={{ width: '100%', height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}
                >
                  <div style={{ width: `${l.pct}%`, height: '100%', background: '#f59e0b', borderRadius: '3px' }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </Col>

      <Col xs={24}>
        <Card
          loading={loading}
          title={
            <span>
              <UserOutlined style={{ color: '#10b981', marginRight: 6 }} />
              Cơ cấu tỷ trọng Khách hàng (KHCN vs KHDN)
            </span>
          }
          variant="borderless"
          style={{ borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}
        >
          <Row gutter={[24, 16]}>
            <Col xs={24} md={12}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                <span>Cơ cấu Số lượng KH</span>
                <span>
                  KHCN: {segmentStats.cn.toLocaleString()} KH | KHDN: {segmentStats.dn.toLocaleString()} KH
                </span>
              </div>
              <div style={{ display: 'flex', width: '100%', height: '24px', borderRadius: '6px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${total > 0 ? (segmentStats.cn / total) * 100 : 0}%`,
                    background: '#10b981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  KHCN: {total > 0 ? Math.round((segmentStats.cn / total) * 100) : 0}%
                </div>
                <div
                  style={{
                    width: `${total > 0 ? (segmentStats.dn / total) * 100 : 0}%`,
                    background: '#3b82f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  KHDN: {total > 0 ? Math.round((segmentStats.dn / total) * 100) : 0}%
                </div>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                <span>Cơ cấu Quy mô Dư nợ vay</span>
                <span>
                  KHCN: {formatLoan(segmentStats.cnLoan)} | KHDN: {formatLoan(segmentStats.dnLoan)}
                </span>
              </div>
              {segmentStats.cnLoan + segmentStats.dnLoan > 0 ? (
                <div style={{ display: 'flex', width: '100%', height: '24px', borderRadius: '6px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${(segmentStats.cnLoan / (segmentStats.cnLoan + segmentStats.dnLoan)) * 100}%`,
                      background: '#059669',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    KHCN: {Math.round((segmentStats.cnLoan / (segmentStats.cnLoan + segmentStats.dnLoan)) * 100)}%
                  </div>
                  <div
                    style={{
                      width: `${(segmentStats.dnLoan / (segmentStats.cnLoan + segmentStats.dnLoan)) * 100}%`,
                      background: '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    KHDN: {Math.round((segmentStats.dnLoan / (segmentStats.cnLoan + segmentStats.dnLoan)) * 100)}%
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    height: '24px',
                    background: '#f1f5f9',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#94a3b8',
                    fontSize: 11,
                  }}
                >
                  Chưa có dữ liệu dư nợ
                </div>
              )}
            </Col>
          </Row>
        </Card>
      </Col>
    </Row>
  );
}

export default memo(VisualDashboard);

