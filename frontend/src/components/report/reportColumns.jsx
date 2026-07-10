import { useMemo } from 'react';
import { Button, Space, Tag, Tooltip, Typography } from 'antd';
import { AimOutlined } from '@ant-design/icons';

import { CN_NAMES } from '../../constants/branches';
import { ACTIVE_SERVICE_COUNT } from '../../constants/services';
import { money } from '../../utils/customerMetrics';
import {
  countUsedServices,
  formatPgdLabel,
  getCrossSellOpportunities,
  normalizePgdCodes,
} from '../../utils/reportHelpers';

const { Text } = Typography;

export function buildReportColumns({ onDetailClick, pgdNameMap = {} }) {
  return [
    {
      title: 'STT',
      key: 'stt',
      width: 44,
      align: 'center',
      render: (_, __, index) => <Text type="secondary" style={{ fontSize: 11 }}>{index + 1}</Text>,
    },
    {
      title: 'Mã CN',
      dataIndex: 'ma_cn',
      key: 'ma_cn',
      width: 120,
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text>,
    },
    {
      title: 'Tên CN',
      key: 'ten_cn',
      width: 160,
      render: (_, row) => (
        <Text style={{ fontSize: 12 }}>
          {String(row.ma_cn || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
            .map((code) => CN_NAMES[code] || code)
            .join(', ') || '—'}
        </Text>
      ),
    },
    {
      title: 'PGD',
      dataIndex: 'ma_pgd',
      key: 'ma_pgd',
      width: 180,
      render: (value) => {
        const items = normalizePgdCodes(value);
        if (!items.length) return <Text type="secondary">—</Text>;
        return (
          <Space size={[4, 4]} wrap>
            {items.slice(0, 3).map((item) => (
              <Tooltip key={item} title={item}>
                <Tag>{formatPgdLabel(item, pgdNameMap)}</Tag>
              </Tooltip>
            ))}
            {items.length > 3 && <Tag>+{items.length - 3}</Tag>}
          </Space>
        );
      },
    },
    {
      title: 'Mã KH chuẩn',
      dataIndex: 'ma_kh_chuan',
      key: 'ma_kh_chuan',
      width: 120,
      fixed: 'left',
      render: (v) => <Text code style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: 'Tên khách hàng',
      dataIndex: 'ten_kh',
      key: 'ten_kh',
      width: 210,
      fixed: 'left',
      render: (v, row) => (
        <Button type="link" size="small" className="kh-name-link" onClick={() => onDetailClick(row)}>
          {v || '—'}
        </Button>
      ),
    },
    {
      title: 'Loại KH',
      dataIndex: 'loai_khach_hang',
      key: 'loai_khach_hang',
      width: 100,
      render: (v) => (v ? <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>{v}</Tag> : <Text type="secondary">—</Text>),
    },
    {
      title: 'Số dư tiền vay',
      dataIndex: 'so_du_tien_vay',
      key: 'so_du_tien_vay',
      width: 130,
      align: 'right',
      sorter: true,
      render: (v) => <Text style={{ fontSize: 12 }}>{money(v) || <span style={{ color: '#cbd5e1' }}>—</span>}</Text>,
    },
    {
      title: 'Số dư gửi CKH',
      dataIndex: 'so_du_tien_gui_ckh',
      key: 'so_du_tien_gui_ckh',
      width: 130,
      align: 'right',
      render: (v) => <Text style={{ fontSize: 12 }}>{money(v) || <span style={{ color: '#cbd5e1' }}>—</span>}</Text>,
    },
    {
      title: 'Loại vay',
      dataIndex: 'loai_vay',
      key: 'loai_vay',
      width: 120,
      render: (v) => (v ? <Tag style={{ fontSize: 11, margin: 0 }}>{v}</Tag> : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>),
    },
    {
      title: 'Số dư TGTT BQ',
      dataIndex: 'so_du_tgtt_binh_quan',
      key: 'so_du_tgtt_binh_quan',
      width: 130,
      align: 'right',
      sorter: true,
      render: (v) => <Text style={{ fontSize: 12 }}>{money(v) || <span style={{ color: '#cbd5e1' }}>—</span>}</Text>,
    },
    {
      title: 'Cán bộ quản lý',
      key: 'can_bo',
      width: 170,
      render: (_, row) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 500 }}>{row.ten_can_bo || <Text type="secondary" style={{ fontSize: 11 }}>—</Text>}</div>
          {row.ma_cb && <Text type="secondary" style={{ fontSize: 10 }}>{row.ma_cb}</Text>}
        </div>
      ),
    },
    {
      title: 'Cơ hội bán chéo',
      key: 'cross_sell',
      width: 220,
      render: (_, row) => {
        const opportunities = getCrossSellOpportunities(row);
        if (!opportunities.length) return <Text type="secondary">—</Text>;
        return (
          <Space size={[4, 4]} wrap>
            {opportunities.slice(0, 2).map((item) => (
              <Tag key={item.key} color={item.color} className="cross-sell-tag">
                {item.label}
              </Tag>
            ))}
            {opportunities.length > 2 && (
              <Tooltip title={opportunities.map((item) => item.label).join(', ')}>
                <Tag color="gold">+{opportunities.length - 2}</Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: 'SPDV',
      key: 'spdv',
      width: 90,
      align: 'center',
      render: (_, row) => {
        const used = countUsedServices(row);
        return <Tag color="purple">{used}/{ACTIVE_SERVICE_COUNT}</Tag>;
      },
    },
  ];
}

export function useReportColumns(onDetailClick, pgdNameMap) {
  return useMemo(
    () => buildReportColumns({ onDetailClick, pgdNameMap }),
    [onDetailClick, pgdNameMap],
  );
}
