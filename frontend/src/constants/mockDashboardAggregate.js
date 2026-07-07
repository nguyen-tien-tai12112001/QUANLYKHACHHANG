import { MOCK_ROWS } from './mockData';
import { buildCampaignCandidates, computeDashboardMetrics } from '../utils/customerMetrics';

export function buildMockDashboardAggregate(periodKey = null) {
  const metrics = computeDashboardMetrics(MOCK_ROWS);
  const { kpis, serviceStats, segmentStats, officerLeaderboard, loanTypeStats } = metrics;

  return {
    period_key: periodKey,
    kpis: {
      total_customers: kpis.totalCustomers,
      total_loan: kpis.loan,
      total_deposit: kpis.deposit,
      total_casa: kpis.casa,
      no_service_count: kpis.noService,
    },
    service_penetration: serviceStats,
    officer_leaderboard: officerLeaderboard,
    loan_type_breakdown: loanTypeStats.map((item) => ({
      type: item.type,
      amt: item.amt,
      pct: item.pct,
    })),
    segment: {
      cn: segmentStats.cn,
      dn: segmentStats.dn,
      cn_loan: segmentStats.cnLoan,
      dn_loan: segmentStats.dnLoan,
    },
    campaign_top5: buildCampaignCandidates(MOCK_ROWS),
  };
}

export const MOCK_DASHBOARD_AGGREGATE = buildMockDashboardAggregate();
