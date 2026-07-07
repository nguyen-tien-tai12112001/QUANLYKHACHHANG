import { computeDashboardMetrics } from './customerMetrics';

/**
 * Chuẩn hóa aggregate API hoặc fallback rows demo thành shape VisualDashboard dùng.
 */
export function resolveDashboardView(aggregate, rows) {
  if (aggregate?.kpis) {
    const segment = aggregate.segment || {};
    return {
      total: aggregate.kpis.total_customers || 0,
      serviceStats: aggregate.service_penetration || [],
      officerLeaderboard: aggregate.officer_leaderboard || [],
      loanTypeStats: (aggregate.loan_type_breakdown || []).map((item) => ({
        type: item.type,
        amt: item.amt,
        pct: item.pct,
      })),
      segmentStats: {
        cn: segment.cn || 0,
        dn: segment.dn || 0,
        cnLoan: segment.cn_loan || 0,
        dnLoan: segment.dn_loan || 0,
      },
    };
  }

  if (rows?.length) {
    const metrics = computeDashboardMetrics(rows);
    return {
      total: metrics.kpis.totalCustomers,
      serviceStats: metrics.serviceStats,
      officerLeaderboard: metrics.officerLeaderboard,
      loanTypeStats: metrics.loanTypeStats,
      segmentStats: metrics.segmentStats,
    };
  }

  return null;
}

export function resolveCampaignCandidates(aggregate, rows, contactedIds = new Set()) {
  const source = aggregate?.campaign_top5?.length
    ? aggregate.campaign_top5
    : rows?.length
      ? rows
      : [];

  if (aggregate?.campaign_top5?.length) {
    return source.filter((item) => !contactedIds.has(item.ma_kh_chuan));
  }

  return [];
}
