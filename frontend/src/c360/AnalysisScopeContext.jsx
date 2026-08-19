import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { notification } from 'antd';
import client, { clearApiCache } from '../api/client';

const AnalysisScopeContext = createContext(null);

export const EMPTY_ADVANCED_SCOPE = {
  keyword: '',
  customerTypes: [], loanTypes: [], officerCode: null,
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
  const [sessionSummary, setSessionSummary] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [orgCatalog, setOrgCatalog] = useState({ branches: [], departments: [] });

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
    if (!draft.periodKey) {
      setOptions((current) => ({ ...current, officers: [], customer_types: [], loan_types: [] }));
      return;
    }
    client.get('/customer-processing/profile-filter-options', {
      params: { period_key: draft.periodKey, branch_code: draft.branchCode || undefined },
      cacheTtl: 300000,
      hideGlobalLoading: true,
    }).then(({ data }) => setOptions((current) => ({
      ...current,
      officers: data?.officers || [],
      customer_types: data?.customer_types || [],
      loan_types: data?.loan_types || [],
    }))).catch(() => {});
  }, [draft.branchCode, draft.periodKey]);

  useEffect(() => {
    if (!applied?.periodKey) return;
    let active = true;
    const loadStartedAt = performance.now();
    const profileParams = scopeToProfileParams(applied);
    // Nạp trước các tập tổng hợp dùng chung. Khi chuyển tab, request trùng sẽ lấy
    // từ cache của phiên thay vì truy vấn lại database.
    setSessionLoading(true);
    const coreRequests = [
      client.get('/customer-processing/profile-summary', { params: profileParams }),
      client.get('/customer-processing/profiles', { params: { ...profileParams, page: 1, page_size: 15, include_total: true, sort_by: 'so_du_tien_gui', sort_dir: 'desc' } }),
    ];
    Promise.allSettled(coreRequests).then((results) => {
      if (!active) return;
      const failed = results.filter((item) => item.status === 'rejected');
      const coreFailed = failed;
      const summaryResponse = results[0]?.status === 'fulfilled' ? results[0].value?.data : null;
      if (coreFailed.length) {
        notification.warning({ message: 'Phiên dữ liệu tải chưa đầy đủ', description: `${failed.length} khối dữ liệu chưa tải được. Hệ thống sẽ thử lại khi bạn bấm Làm mới.`, placement: 'topRight' });
      } else {
        const summary = { customers: Number(summaryResponse?.total_customers || 0), periodKey: applied.periodKey };
        setSessionSummary(summary);
        setSessionData({
          periodKey: applied.periodKey,
          scopeKey: JSON.stringify(profileParams),
          summary: summaryResponse,
          profiles: results[1]?.status === 'fulfilled' ? results[1].value?.data : null,
        });
        const elapsedSeconds = Math.max((performance.now() - loadStartedAt) / 1000, 0.1);
        notification.success({
          message: 'Dữ liệu phân tích đã sẵn sàng',
          description: `Kỳ ${applied.periodKey} · ${summary.customers.toLocaleString('vi-VN')} khách hàng · Hoàn tất trong ${elapsedSeconds.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} giây. Các phân tích chuyên sâu tiếp tục được chuẩn bị ở chế độ nền.`,
          placement: 'topRight',
          duration: 5,
        });

        // Không bắn đồng thời các truy vấn tổng hợp lớn: PostgreSQL từng phải
        // spill ra file tạm và chậm hơn khi 12-16 request tranh tài nguyên.
        // Dashboard tự nạp các khối đang nhìn thấy; hàng đợi này chỉ làm ấm
        // những trang còn lại, từng request một, vào cùng Redis session.
        const background = { hideGlobalLoading: true, timeout: 180_000 };
        const warmQueue = [
          () => client.get('/dashboard/business-analytics', { params: profileParams, ...background }),
          () => client.get('/dashboard/business-trends', { params: { periods: 12, ...profileParams }, ...background }),
          () => client.get('/customer-processing/profile-groups', { params: profileParams, ...background }),
          () => client.get('/customer-processing/profiles', { params: { ...profileParams, group_key: 'large_deposit', page: 1, page_size: 15, include_total: true, sort_by: 'so_du_tien_gui', sort_dir: 'desc' }, ...background }),
        ];
        (async () => {
          for (const warm of warmQueue) {
            if (!active) break;
            try { await warm(); } catch { /* Trang tương ứng có thể tự tải lại. */ }
          }
        })();
      }
    }).finally(() => { if (active) setSessionLoading(false); });
    return () => { active = false; };
  }, [applied, periods, sessionVersion]);

  const value = useMemo(() => ({
    periods, options, draft, applied, metadataLoading, sessionVersion, sessionLoading, sessionSummary, sessionData, fixedBranchCode,
    updateDraft: (patch) => setDraft((current) => ({
      ...current,
      ...patch,
      branchCode: fixedBranchCode || (Object.prototype.hasOwnProperty.call(patch, 'branchCode') ? patch.branchCode : current.branchCode),
    })),
    updateAdvanced: (patch) => setDraft((current) => ({ ...current, advanced: { ...current.advanced, ...patch } })),
    apply: () => {
      if (!draft.periodKey) return false;
      clearApiCache();
      sessionStorage.setItem('c360_analysis_session', crypto.randomUUID());
      const next = { ...draft, branchCode: fixedBranchCode || draft.branchCode, advanced: { ...draft.advanced } };
      setApplied(next);
      setSessionData(null);
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
      sessionStorage.setItem('c360_analysis_session', crypto.randomUUID());
      setSessionVersion((value) => value + 1);
    },
  }), [applied, draft, fixedBranchCode, metadataLoading, options, periods, sessionData, sessionLoading, sessionSummary, sessionVersion]);
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
    officer_code: advanced.officerCode || undefined,
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
    no_service: advanced.serviceStatus === 'none' || undefined,
    service_codes: advanced.serviceCodes?.join(',') || undefined,
    min_service_count: advanced.minServiceCount ?? undefined,
    keyword: advanced.keyword?.trim() || undefined,
  };
}
