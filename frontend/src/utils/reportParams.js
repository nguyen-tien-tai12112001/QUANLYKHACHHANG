export const CROSS_SELL_PRESETS = [
  { value: 'deposit_plus', label: 'TG lớn chưa dùng Agribank Plus' },
  { value: 'loan_sms', label: 'Có dư nợ thiếu SMS nhắc nợ' },
  { value: 'casa_card', label: 'TGTT cao chưa có thẻ' },
  { value: 'multi_branch', label: 'Nhiều CN cần quản lý chính' },
];

export const INITIAL_REPORT_FILTERS = {
  searchText: '',
  filterOfficer: null,
  filterUnusedSvc: [],
  filterUsedSvc: [],
  filterLoanType: [],
  filterMultiBranch: null,
  filterCustomerType: null,
  loanMin: null,
  loanMax: null,
  depositMin: null,
  depositMax: null,
  casaMin: null,
  casaMax: null,
  serviceCountMin: null,
  serviceCountMax: null,
  crossSellRule: null,
  noService: false,
  sortBy: null,
  sortOrder: null,
};

function toReportBranchParams(filterCn, filterPgd) {
  const params = {};
  if (filterCn) params.branch_code = filterCn;
  if (filterPgd) params.pgd_code = filterPgd;
  return params;
}

function joinList(values) {
  return values?.length ? values.join(',') : undefined;
}

function millionToAmount(value) {
  if (value === null || value === undefined || value === '') return undefined;
  return Number(value) * 1_000_000;
}

export function buildReportParams(periodKey, filters, filterCn, filterPgd) {
  if (!periodKey) return null;

  const branchParams = toReportBranchParams(filterCn, filterPgd);

  return {
    period_key: periodKey,
    keyword: filters.searchText || undefined,
    ...branchParams,
    loan_type: joinList(filters.filterLoanType),
    officer_code: filters.filterOfficer || undefined,
    unused_service: joinList(filters.filterUnusedSvc),
    used_service: joinList(filters.filterUsedSvc),
    customer_type: filters.filterCustomerType || undefined,
    loan_min: millionToAmount(filters.loanMin),
    loan_max: millionToAmount(filters.loanMax),
    deposit_min: millionToAmount(filters.depositMin),
    deposit_max: millionToAmount(filters.depositMax),
    casa_min: millionToAmount(filters.casaMin),
    casa_max: millionToAmount(filters.casaMax),
    service_count_min: filters.serviceCountMin ?? undefined,
    service_count_max: filters.serviceCountMax ?? undefined,
    cross_sell_rule: filters.crossSellRule || undefined,
    multi_branch: filters.filterMultiBranch === null ? undefined : filters.filterMultiBranch,
    no_service: filters.noService || undefined,
    sort_by: filters.sortBy || undefined,
    sort_order: filters.sortOrder || undefined,
  };
}

export function hasActiveFilters(filters, filterCn, filterPgd) {
  return Boolean(
    filters.searchText
    || filters.filterOfficer
    || filters.filterUnusedSvc.length
    || filters.filterUsedSvc.length
    || filterCn
    || filterPgd
    || filters.filterLoanType.length
    || filters.filterMultiBranch !== null
    || filters.filterCustomerType
    || filters.loanMin != null
    || filters.loanMax != null
    || filters.depositMin != null
    || filters.depositMax != null
    || filters.casaMin != null
    || filters.casaMax != null
    || filters.serviceCountMin != null
    || filters.serviceCountMax != null
    || filters.crossSellRule
    || filters.noService,
  );
}
