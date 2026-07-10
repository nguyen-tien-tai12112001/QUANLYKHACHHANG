import { Typography } from 'antd';

import VisualDashboard from '../dashboard/VisualDashboard';
import { analyticsToDashboardAggregate } from '../../utils/reportHelpers';
import { ReportStatGrid } from './ReportFilterBar';

const { Paragraph } = Typography;

export default function ReportSummaryPanel({
  summary,
  analytics,
  loading,
  total,
  filterActive,
  onNoServiceClick,
}) {
  const aggregate = analyticsToDashboardAggregate(analytics);

  return (
    <div className="report-summary-panel">
      <Paragraph style={{ marginBottom: 12 }}>
        Đang xem: <strong>{Number(total || summary.total_customers || 0).toLocaleString('vi-VN')}</strong> khách hàng theo bộ lọc hiện tại
      </Paragraph>

      <ReportStatGrid
        summary={summary}
        total={total}
        filterActive={filterActive}
        onNoServiceClick={onNoServiceClick}
      />

      <VisualDashboard
        aggregate={aggregate}
        rows={[]}
        loading={loading}
        showTrend={false}
        emptyDescription="Chưa có dữ liệu tổng hợp cho bộ lọc này"
      />
    </div>
  );
}
