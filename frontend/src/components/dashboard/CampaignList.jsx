import { memo, useMemo } from 'react';
import { Card, Empty, Space, Table, Tag, Tooltip, Typography } from 'antd';

import { ACTIVE_SERVICE_COUNT } from '../../constants/services';
import { compactMoney, money } from '../../utils/customerMetrics';

const { Text } = Typography;

function formatOfficer(row) {
  if (!row?.ma_cb && !row?.ten_can_bo) return 'Chưa gán';
  return `${row.ten_can_bo || row.ma_cb} (${row.officer_employee_code || '-'} - ${row.ma_cb || '-'})`;
}

function CampaignList({ candidates = [], contactedIds, loading = false }) {
  const campaignCandidates = useMemo(
    () => candidates.filter((item) => !contactedIds?.has(item.ma_kh_chuan)),
    [candidates, contactedIds],
  );

  const columns = [
    {
      title: 'Khách hàng',
      key: 'kh',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, color: '#1e293b' }}>{r.ten_kh}</div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            CIF: {r.ma_kh_chuan} | {r.loai_khach_hang}
          </Text>
        </div>
      ),
    },
    {
      title: 'Dư nợ & CASA',
      key: 'asset',
      render: (_, r) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c' }}>Vay: {money(r.so_du_tien_vay)} đ</div>
          <div style={{ fontSize: 11, color: '#0891b2' }}>CASA: {money(r.so_du_tgtt_binh_quan)} đ</div>
        </div>
      ),
    },
    {
      title: 'Bán chéo',
      key: 'crosssell',
      render: (_, r) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#15803d' }}>
            {r.usedCount}/{ACTIVE_SERVICE_COUNT} DV ({r.crossSellPct}%)
          </div>
          <div
            role="progressbar"
            aria-label={`Bán chéo ${r.crossSellPct}%`}
            aria-valuenow={r.crossSellPct}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{ width: '100%', height: 4, background: '#f1f5f9', borderRadius: 2, marginTop: 4 }}
          >
            <div style={{ width: `${r.crossSellPct}%`, height: '100%', background: '#15803d', borderRadius: 2 }} />
          </div>
        </div>
      ),
    },
    {
      title: 'Cán bộ quản lý',
      key: 'cb',
      render: (_, r) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 500 }}>{formatOfficer(r)}</div>
        </div>
      ),
    },
    {
      title: 'Sản phẩm đề xuất bán chéo',
      key: 'recommend',
      render: (_, r) => (
        <Space size={[4, 4]} wrap>
          {(r.unused || []).slice(0, 3).map((s) => (
            <Tag key={s.key} color="orange" style={{ border: 'none', fontSize: 11 }}>
              +{s.label}
            </Tag>
          ))}
          {(r.unused || []).length > 3 && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              +{r.unused.length - 3} khác
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Quy mô ưu tiên',
      key: 'priority',
      width: 150,
      render: (_, r) => (
        <div>
          <Tooltip title={`${money(r.totalAssets)} đ`}>
            <Tag color="green" style={{ marginBottom: 4 }}>
              {compactMoney(r.totalAssets)} đ
            </Tag>
          </Tooltip>
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Thiếu {(r.unused || []).length} DV · Đang dùng {r.usedCount}/{ACTIVE_SERVICE_COUNT}
            </Text>
          </div>
        </div>
      ),
    },
  ];

  return (
    <Card
      loading={loading}
      title={
        <Space>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: '#fef3c7',
              color: '#d97706',
            }}
          >
            🎯
          </span>
          <strong>Top 5 Khách hàng ưu tiên tiếp cận (Bán chéo trong ngày)</strong>
        </Space>
      }
      variant="borderless"
      style={{ borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}
    >
      <Table
        dataSource={campaignCandidates}
        columns={columns}
        rowKey="ma_kh_chuan"
        pagination={false}
        size="middle"
        locale={{ emptyText: <Empty description="Không có khách hàng tiềm năng cần bán chéo gấp" /> }}
      />
    </Card>
  );
}

export default memo(CampaignList);

