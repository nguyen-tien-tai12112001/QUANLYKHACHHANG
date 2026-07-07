import { memo } from 'react';
import { LineChartOutlined } from '@ant-design/icons';
import { Card, Space } from 'antd';

function TrendChart({ trends, loading }) {
  const labels = trends?.labels?.length
    ? trends.labels
    : ['T1', 'T2', 'T3', 'T4', 'T5', 'T6 (Hiện tại)'];
  const loans = trends?.loans?.length ? trends.loans : [24.5, 25.1, 26.0, 26.5, 27.2, 27.6];
  const casa = trends?.casa?.length ? trends.casa : [1.2, 1.3, 1.4, 1.45, 1.55, 1.62];
  const isDemo = !trends?.labels?.length;

  const mapPoints = (arr, minVal, maxVal) =>
    arr.map((val, i) => {
      const x = 30 + i * (labels.length > 1 ? 400 / (labels.length - 1) : 0);
      const range = maxVal - minVal || 1;
      const y = 110 - ((val - minVal) / range) * 80;
      return { x, y, val };
    });

  const loanMin = Math.min(...loans) * 0.95;
  const loanMax = Math.max(...loans) * 1.05;
  const casaMin = Math.min(...casa) * 0.9;
  const casaMax = Math.max(...casa) * 1.1;

  const loanPoints = mapPoints(loans, loanMin, loanMax);
  const casaPoints = mapPoints(casa, casaMin, casaMax);

  const getPath = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const getAreaPath = (pts) => `${getPath(pts)} L ${pts[pts.length - 1].x} 110 L ${pts[0].x} 110 Z`;

  return (
    <Card
      title={
        <span>
          <LineChartOutlined style={{ color: '#0ea5e9', marginRight: 6 }} />
          Xu hướng Tăng trưởng Chi nhánh ({labels.length} kỳ gần nhất)
          {isDemo && !loading ? ' — Demo' : ''}
        </span>
      }
      variant="borderless"
      style={{ borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}
      loading={loading}
    >
      <div style={{ position: 'relative', width: '100%' }}>
        <svg viewBox="0 0 460 140" style={{ width: '100%', height: '180px', overflow: 'visible' }}>
          <defs>
            <linearGradient id="loanGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="casaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          <line x1="30" y1="30" x2="430" y2="30" stroke="#f1f5f9" strokeDasharray="3" />
          <line x1="30" y1="70" x2="430" y2="70" stroke="#f1f5f9" strokeDasharray="3" />
          <line x1="30" y1="110" x2="430" y2="110" stroke="#e2e8f0" strokeWidth="1" />

          <path d={getAreaPath(loanPoints)} fill="url(#loanGrad)" />
          <path d={getAreaPath(casaPoints)} fill="url(#casaGrad)" />
          <path d={getPath(loanPoints)} fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" />
          <path d={getPath(casaPoints)} fill="none" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" />

          {loanPoints.map((p, i) => (
            <g key={`l-dot-${i}`}>
              <circle cx={p.x} cy={p.y} r="4" fill="#ffffff" stroke="#f43f5e" strokeWidth="2" />
              <text x={p.x} y={p.y - 8} fontSize="9" fontWeight="700" textAnchor="middle" fill="#9f1239">
                {p.val} Tỷ
              </text>
            </g>
          ))}

          {casaPoints.map((p, i) => (
            <g key={`c-dot-${i}`}>
              <circle cx={p.x} cy={p.y} r="4" fill="#ffffff" stroke="#06b6d4" strokeWidth="2" />
              <text x={p.x} y={p.y + 14} fontSize="9" fontWeight="700" textAnchor="middle" fill="#0891b2">
                {p.val} Tỷ
              </text>
            </g>
          ))}

          {labels.map((m, i) => (
            <text
              key={`lbl-${i}`}
              x={30 + i * (labels.length > 1 ? 400 / (labels.length - 1) : 0)}
              y="130"
              fontSize="10"
              fontWeight="600"
              textAnchor="middle"
              fill="#64748b"
            >
              {m}
            </text>
          ))}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '10px' }}>
          <Space>
            <span style={{ display: 'inline-block', width: 12, height: 6, background: '#f43f5e', borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: '#64748b' }}>Dư nợ tín dụng</span>
          </Space>
          <Space>
            <span style={{ display: 'inline-block', width: 12, height: 6, background: '#06b6d4', borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: '#64748b' }}>CASA nguồn vốn</span>
          </Space>
        </div>
      </div>
    </Card>
  );
}

export default memo(TrendChart);

