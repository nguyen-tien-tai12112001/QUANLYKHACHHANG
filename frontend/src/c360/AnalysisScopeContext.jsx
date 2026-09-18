import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { notification } from 'antd';
import client, { clearApiCache } from '../api/client';

const AnalysisScopeContext = createContext(null);

function createAnalysisSessionId() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `analysis-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export const EMPTY_ADVANCED_SCOPE = {
  keyword: '',
  customerTypes: [], loanTypes: [], officerCodes: [],
  officerStatus: null, primaryBranchStatus: null, newCustomerStatus: null,
  depositStatus: null, loanStatus: null, relationshipStatus: null,
  minDeposit: null, maxDeposit: null, minLoan: null, maxLoan: null,
  minCasa: null, maxCasa: null, contactStatus: null,
  serviceStatus: null, serviceCodes: [], minServiceCount: null,
};

export function AnalysisScopeProvider({ children, currentUser }) {
  const fixedBranchCode = currentUser?.scope !== 'province' ? (currentUser?.ma_cn || currentUser?.branch_code || null) : null;
  const [periods, setPeriods] = useState([]);
  const [options, setOptions] = useState({ branches: [], pgd_options: [], officers: [], customer_types: [], loan_types: [] });
  const [draft, setDraft] = useState({ periodKey: '', branchCode: fixedBranchCode, pgdCode: null, advanced: EMPTY_ADVANCED_SCOPE });
  const [applied, setApplied] = useState(null);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionProgress, setSessionProgress] = useState({ completed: 0, total: 0, stage: '' });
  const [sessionSummary, setSessionSummary] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [orgCatalog, setOrgCatalog] = useState({ branches: [], departments: [] });
  const filterOptionsRequestRef = useRef(0);

  useEffect(() => {
    const clearSession = () => {
      clearApiCache();
      sessionStorage.removeItem('c360_analysis_session');
    };
    window.addEventListener('pagehide', clearSession);
    return () => {
      window.removeEventListener('pagehide', clearSession);
      clearApiCache();
    };
  }, []);

  useEffect(() => {
    Promise.all([
      client.get('/admin/branches', { params: { status: 'active' }, cacheTtl: 600000, hideGlobalLoading: true }),
      client.get('/admin/departments', { params: { status: 'active' }, cacheTtl: 600000, hideGlobalLoading: true }),
    ]).then(([branchesRes, departmentsRes]) => {
      const allBranches = Array.isArray(branchesRes.data) ? branchesRes.data : [];
      const allowed = new Set(currentUser?.allowed_branches || []);
      const restrictToHome = currentUser?.scope !== 'province' && currentUser?.ma_cn;
      const branches = allBranches.filter((item) => !allowed.size
        ? (!restrictToHome || item.branch_code === currentUser.ma_cn)
        : allowed.has(item.branch_code));
      const branchCodes = new Set(branches.map((item) => item.branch_code));
      const departments = (Array.isArray(departmentsRes.data) ? departmentsRes.data : [])
        .filter((item) => branchCodes.has(item.branch_code));
      setOrgCatalog({ branches, departments });
    }).catch(() => setOrgCatalog({ branches: [], departments: [] }));
  }, [currentUser]);

  useEffect(() => {
    const branches = orgCatalog.branches.map((item) => ({ value: item.branch_code, label: `${item.branch_code} - ${item.branch_name}` }));
    const pgdOptions = draft.branchCode
      ? orgCatalog.departments.filter((item) => item.branch_code === draft.branchCode).map((item) => ({ value: item.department_code, label: `${item.department_code} - ${item.department_name}` }))
      : [];
    setOptions((current) => ({ ...current, branches, pgd_options: pgdOptions }));
  }, [draft.branchCode, orgCatalog]);

  useEffect(() => {
    client.get('/customer-processing/periods', { cacheTtl: 300000, hideGlobalLoading: true })
      .then(({ data }) => setPeriods((Array.isArray(data) ? data : []).filter((item) => Number(item.profile_count || 0) > 0)))
      .finally(() => setMetadataLoading(false));
  }, []);

  useEffect(() => {
    const requestId = ++filterOptionsRequestRef.current;
    if (!draft.periodKey) {
      setOptions((current) => ({ ...current, officers: [], customer_types: [], loan_types: [] }));
      return;
    }
    setOptions((current) => ({ ...current, officers: [], customer_types: [], loan_types: [] }));
    client.get('/customer-processing/profile-filter-options', {
      params: {
        period_key: draft.periodKey,
        branch_code: draft.branchCode || undefined,
        pgd_code: draft.pgdCode || undefined,
      },
      cacheTtl: 300000,
      hideGlobalLoading: true,
    }).then(({ data }) => {
      if (requestId !== filterOptionsRequestRef.current) return;
      setOptions((current) => ({
        ...current,
        officers: (data?.officers || []).filter((item) => (!draft.branchCode || item.branch_code === draft.branchCode)
          && (!draft.pgdCode || item.department_code === draft.pgdCode)),
        customer_types: data?.customer_types || [],
        loan_types: data?.loan_types || [],
      }));
    }).catch(() => {});
  }, [draft.branchCode, draft.periodKey, draft.pgdCode]);

  useEffect(() => {
    if (!applied?.periodKey) return;
    let active = true;
    const loadStartedAt = performance.now();
    const profileParams = scopeToProfileParams(applied);
    setSessionLoading(true);
    const previousPeriod = periods[periods.findIndex((item) => item.period_key === applied.periodKey) + 1]?.period_key;
    const totalRequests = previousPeriod ? 12 : 11;
    let completed = 0;
    const announce = (stage, isActive = true) => {
      const progress = { completed, total: totalRequests, stage };
      if (active) setSessionProgress(progress);
      window.dispatchEvent(new CustomEvent('c360:preload-state', {
        detail: { ...progress, active: isActive, startedAt: loadStartedAt },
      }));
    };
    const tracked = async (stage, request) => {
      announce(stage);
      try { return await request(); } finally { completed += 1; announce(stage); }
    };

    (async () => {
      const common = { timeout: 240_000 };
      const core = await Promise.allSettled([
        tracked('Đang tổng hợp KPI và phạm vi khách hàng', () => client.get('/customer-processing/profile-summary', { params: profileParams, ...common })),
        tracked('Đang chuẩn bị danh sách khách hàng', () => client.get('/customer-processing/profiles', { params: { ...profileParams, page: 1, page_size: 15, include_total: true, sort_by: 'so_du_tien_gui', sort_dir: 'desc' }, ...common })),
      ]);
      if (!active) return;
      const summaryResponse = core[0]?.status === 'fulfilled' ? core[0].value?.data : null;
      if (!summaryResponse || core[1]?.status !== 'fulfilled') {
        notification.error({ message: 'Không thể khởi tạo phiên phân tích', description: 'KPI hoặc danh sách khách hàng nền chưa tải được. Vui lòng bấm Làm mới.', placement: 'topRight', duration: 0 });
        return;
      }

      const detailDefinitions = [
        ['analytics', 'Đang tổng hợp phân tích nghiệp vụ', () => client.get('/dashboard/business-analytics', { params: profileParams, ...common })],
        ['insights', 'Đang phân tích cảnh báo và biến động', () => client.get('/dashboard/insights', { params: { ...profileParams, include_top_changes: true }, ...common })],
        ['trends', 'Đang chuẩn bị chuỗi số liệu các kỳ', () => client.get('/dashboard/business-trends', { params: { periods: 12, ...profileParams }, ...common })],
        ['groups', 'Đang tạo các nhóm khách hàng trọng điểm', () => client.get('/customer-processing/profile-groups', { params: profileParams, ...common })],
        ['groupProfiles', 'Đang chuẩn bị danh sách cảnh báo mặc định', () => client.get('/customer-processing/profiles', { params: { ...profileParams, group_key: 'large_deposit', page: 1, page_size: 15, include_total: true, sort_by: 'so_du_tien_gui', sort_dir: 'desc' }, ...common })],
        ['reconciliation', 'Đang kiểm tra đối chiếu CIF', () => client.get('/customer-processing/reconciliations', { params: { period_key: applied.periodKey, branch_code: applied.branchCode || undefined, latest_job_only: true, page: 1, page_size: 1 }, ...common })],
        ['accountReconciliation', 'Đang đối chiếu tài khoản tiền gửi', () => client.get('/customer-processing/dp01-pf14-reconciliation', { params: { period_key: applied.periodKey, branch_code: applied.branchCode || undefined, page: 1, page_size: 10 }, ...common })],
        ['quality', 'Đang kiểm tra chất lượng hồ sơ', () => client.get('/customer-processing/profile-quality', { params: { period_key: applied.periodKey, branch_code: applied.branchCode || undefined }, ...common })],
        ['readiness', 'Đang kiểm tra trạng thái nguồn dữ liệu', () => client.get('/imports/source-readiness', { params: { period_key: applied.periodKey }, ...common })],
      ];
      if (previousPeriod) detailDefinitions.push([
        'comparison', 'Đang so sánh với kỳ trước',
        () => client.get('/customer-processing/period-comparison', { params: { ...profileParams, period_key: undefined, current_period: applied.periodKey, previous_period: previousPeriod }, ...common }),
      ]);
      const details = await Promise.allSettled(detailDefinitions.map(([, stage, request]) => tracked(stage, request)));
      if (!active) return;
      const loaded = Object.fromEntries(detailDefinitions.map(([key], index) => [key, details[index]?.status === 'fulfilled' ? details[index].value?.data : null]));
      const failedCount = details.filter((item) => item.status === 'rejected').length;
      const summary = { customers: Number(summaryResponse?.total_customers || 0), periodKey: applied.periodKey };
      setSessionSummary(summary);
      setSessionData({
        periodKey: applied.periodKey,
        scopeKey: JSON.stringify(profileParams),
        ready: true,
        loadedAt: new Date().toISOString(),
        summary: summaryResponse,
        profiles: core[1].value?.data,
        ...loaded,
      });
      const elapsedSeconds = Math.max((performance.now() - loadStartedAt) / 1000, 0.1);
      const completionPercent = Math.round(((totalRequests - failedCount) / Math.max(1, totalRequests)) * 100);
      notification[failedCount ? 'warning' : 'success']({
        message: failedCount ? 'Phiên phân tích đã sẵn sàng một phần' : 'Toàn bộ C360 đã sẵn sàng',
        description: `${summary.customers.toLocaleString('vi-VN')} khách hàng · hoàn thành ${completionPercent}% · ${elapsedSeconds.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} giây. Chuyển trang sẽ dùng ngay dữ liệu của phiên này.`,
        placement: 'topRight', duration: failedCount ? 8 : 5,
      });
    })().finally(() => {
      if (active) {
        setSessionLoading(false);
        announce('Hoàn tất', false);
      }
    });
    return () => {
      active = false;
      window.dispatchEvent(new CustomEvent('c360:preload-state', { detail: { active: false } }));
    };
  }, [applied, periods, sessionVersion]);

  const value = useMemo(() => ({
    periods, options, draft, applied, metadataLoading, sessionVersion, sessionLoading, sessionProgress, sessionSummary, sessionData, fixedBranchCode,
    updateDraft: (patch) => setDraft((current) => ({
      ...current,
      ...patch,
      branchCode: fixedBranchCode || (Object.prototype.hasOwnProperty.call(patch, 'branchCode') ? patch.branchCode : current.branchCode),
    })),
    updateAdvanced: (patch) => setDraft((current) => ({ ...current, advanced: { ...current.advanced, ...patch } })),
    apply: () => {
      if (!draft.periodKey) return false;
      clearApiCache();
      setSessionLoading(true);
      setSessionProgress({ completed: 0, total: 0, stage: 'Đang khởi tạo phiên phân tích' });
      sessionStorage.setItem('c360_analysis_session', createAnalysisSessionId());
      const next = { ...draft, branchCode: fixedBranchCode || draft.branchCode, advanced: { ...draft.advanced } };
      setApplied(next);
      setSessionData(null);
      setSessionVersion((value) => value + 1);
      return true;
    },
    restore: (snapshot) => {
      if (!snapshot?.periodKey) return false;
      clearApiCache();
      const next = {
        ...snapshot,
        branchCode: fixedBranchCode || snapshot.branchCode || null,
        pgdCode: snapshot.pgdCode || null,
        advanced: { ...EMPTY_ADVANCED_SCOPE, ...(snapshot.advanced || {}) },
      };
      setDraft(next);
      setApplied(next);
      setSessionData(null);
      setSessionLoading(true);
      setSessionProgress({ completed: 0, total: 0, stage: 'Đang khôi phục phạm vi đã xem' });
      sessionStorage.setItem('c360_analysis_session', createAnalysisSessionId());
      setSessionVersion((value) => value + 1);
      return true;
    },
    reset: () => {
      setDraft({ periodKey: '', branchCode: fixedBranchCode, pgdCode: null, advanced: EMPTY_ADVANCED_SCOPE });
      setApplied(null);
      setSessionSummary(null);
      setSessionData(null);
      sessionStorage.removeItem('c360_analysis_session');
      clearApiCache();
    },
    refresh: () => {
      clearApiCache();
      setSessionLoading(true);
      setSessionProgress({ completed: 0, total: 0, stage: 'Đang làm mới toàn bộ dữ liệu' });
      sessionStorage.setItem('c360_analysis_session', createAnalysisSessionId());
      setSessionVersion((value) => value + 1);
    },
  }), [applied, draft, fixedBranchCode, metadataLoading, options, periods, sessionData, sessionLoading, sessionProgress, sessionSummary, sessionVersion]);
  return <AnalysisScopeContext.Provider value={value}>{children}</AnalysisScopeContext.Provider>;
}

export function useAnalysisScope() {
  return useContext(AnalysisScopeContext);
}

export function scopeToProfileParams(scope) {
  if (!scope) return {};
  const advanced = scope.advanced || {};
  return {
    period_key: scope.periodKey,
    branch_code: scope.branchCode || undefined,
    pgd_code: scope.pgdCode || undefined,
    customer_type: advanced.customerTypes?.join(',') || undefined,
    loan_type: advanced.loanTypes?.join(',') || undefined,
    officer_code: advanced.officerCodes?.join(',') || undefined,
    multi_branch: advanced.relationshipStatus === 'multi' ? true : advanced.relationshipStatus === 'single' ? false : undefined,
    has_deposit: advanced.depositStatus === 'yes' ? true : advanced.depositStatus === 'no' ? false : undefined,
    has_loan: advanced.loanStatus === 'yes' ? true : advanced.loanStatus === 'no' ? false : undefined,
    min_deposit: advanced.minDeposit ?? undefined,
    max_deposit: advanced.maxDeposit ?? undefined,
    min_loan: advanced.minLoan ?? undefined,
    max_loan: advanced.maxLoan ?? undefined,
    min_casa: advanced.minCasa ?? undefined,
    max_casa: advanced.maxCasa ?? undefined,
    missing_phone: advanced.contactStatus === 'missing' ? true : advanced.contactStatus === 'available' ? false : undefined,
    missing_officer: advanced.officerStatus === 'missing' ? true : advanced.officerStatus === 'assigned' ? false : undefined,
    unclear_primary_branch: advanced.primaryBranchStatus === 'unclear' ? true : advanced.primaryBranchStatus === 'clear' ? false : undefined,
    new_in_period: advanced.newCustomerStatus === 'new' ? true : advanced.newCustomerStatus === 'existing' ? false : undefined,
    no_service: advanced.serviceStatus === 'none' || undefined,
    service_codes: advanced.serviceCodes?.join(',') || undefined,
    min_service_count: advanced.minServiceCount ?? undefined,
    keyword: advanced.keyword?.trim() || undefined,
  };
}
