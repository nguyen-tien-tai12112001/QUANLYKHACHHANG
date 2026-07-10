import { PGD_NAMES } from '../constants/branches';
import { ACTIVE_SERVICES } from '../constants/services';
import { money } from './customerMetrics';

const moneyFormatter = new Intl.NumberFormat('vi-VN');

export const CROSS_SELL_RULES = [
  {
    key: 'deposit_plus',
    label: 'TG lớn chưa dùng Agribank Plus',
    color: 'green',
    test: (row) =>
      Number(row.so_du_tien_gui_ckh || 0) + Number(row.so_du_tgtt_binh_quan || 0) >= 1_000_000_000
      && Number(row.agribank_plus || 0) === 0,
  },
  {
    key: 'loan_sms',
    label: 'Có dư nợ thiếu SMS nhắc nợ',
    color: 'volcano',
    test: (row) => Number(row.so_du_tien_vay || 0) > 0 && Number(row.sms_nhac_no_vay || 0) === 0,
  },
  {
    key: 'casa_card',
    label: 'TGTT cao chưa có thẻ',
    color: 'blue',
    test: (row) =>
      Number(row.so_du_tgtt_binh_quan || 0) >= 500_000_000
      && Number(row.the_ghi_no_noi_dia || 0) === 0
      && Number(row.the_td_quoc_te || 0) === 0
      && Number(row.the_td_loc_viet || 0) === 0,
  },
  {
    key: 'multi_branch_owner',
    label: 'Nhiều CN cần quản lý chính',
    color: 'purple',
    test: (row) => Number(row.branch_count || 0) > 1,
  },
];

export function compactMoney(value) {
  const amount = Math.abs(Number(value || 0));
  const sign = Number(value || 0) < 0 ? '-' : '';
  if (amount >= 1_000_000_000_000) {
    return `${sign}${moneyFormatter.format(Number((amount / 1_000_000_000_000).toFixed(1)))} nghìn tỷ`;
  }
  if (amount >= 1_000_000_000) {
    return `${sign}${moneyFormatter.format(Number((amount / 1_000_000_000).toFixed(1)))} tỷ`;
  }
  if (amount >= 1_000_000) {
    return `${sign}${moneyFormatter.format(Number((amount / 1_000_000).toFixed(1)))} triệu`;
  }
  return `${sign}${moneyFormatter.format(amount)}`;
}

export function moneyTooltip(value) {
  return `${money(value || 0)} đ`;
}

export function splitList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizePgdCodes(value) {
  return splitList(value).map((item) => {
    if (!item.includes(':')) return item;
    const [branch, pgd] = item.split(':').map((part) => part.trim());
    return pgd ? `${branch}:${pgd}` : `${branch}: Chưa có PGD`;
  });
}

export function formatPgdLabel(value, pgdNameMap = {}) {
  if (!value || String(value).includes('Chưa có PGD')) return value;
  const text = String(value).trim();
  if (pgdNameMap[text]) return pgdNameMap[text];
  if (text.includes(':')) {
    const [, pgd] = text.split(':').map((part) => part.trim());
    return pgdNameMap[pgd] || PGD_NAMES[text]?.name || PGD_NAMES[pgd]?.name || text;
  }
  return pgdNameMap[text] || PGD_NAMES[text]?.name || text;
}

export function normalizeProcessedProfile(row) {
  return {
    ...row,
    ma_kh_chuan: row.ma_kh,
    ma_cn: row.branch_codes,
    ma_pgd: row.pgd_codes,
    so_du_tien_gui_ckh: row.so_du_tien_gui,
    doanh_so_chuyen_tien_ve_tai_khoan: row.doanh_so_chuyen_tien_ve_tk,
    ghi_chu: Number(row.branch_count || 0) > 1 ? `Phát sinh tại ${row.branch_count} chi nhánh` : row.ghi_chu,
  };
}

export function getCrossSellOpportunities(row) {
  return CROSS_SELL_RULES.filter((rule) => rule.test(row));
}

export function countUsedServices(row) {
  return ACTIVE_SERVICES.filter((s) => Number(row[s.key] || 0) > 0).length;
}

export function analyticsToDashboardAggregate(analytics) {
  if (!analytics?.kpis) return null;
  return {
    period_key: analytics.period_key,
    kpis: {
      total_customers: analytics.kpis.total_customers,
      total_loan: analytics.kpis.total_loan,
      total_deposit: analytics.kpis.total_deposit,
      total_casa: analytics.kpis.total_casa,
      no_service_count: analytics.kpis.no_service_customers,
    },
    service_penetration: analytics.service_penetration || [],
    officer_leaderboard: analytics.officer_top10 || [],
    loan_type_breakdown: (analytics.loan_type_breakdown || []).map((item) => ({
      type: item.type,
      amt: item.amt,
      pct: item.pct,
    })),
    segment: analytics.segment || {},
  };
}
