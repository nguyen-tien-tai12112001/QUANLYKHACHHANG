import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import client, { clearApiCache } from '../api/client';

const AnalysisScopeContext = createContext(null);

export const EMPTY_ADVANCED_SCOPE = {
  customerTypes: [], loanTypes: [], officerCode: null,
  depositStatus: null, loanStatus: null, relationshipStatus: null,
  minDeposit: null, maxDeposit: null, minLoan: null, maxLoan: null,
};

export function AnalysisScopeProvider({ children }) {
  const [periods, setPeriods] = useState([]);
  const [options, setOptions] = useState({ branches: [], pgd_options: [], officers: [], customer_types: [], loan_types: [] });
  const [draft, setDraft] = useState({ periodKey: '', branchCode: null, pgdCode: null, advanced: EMPTY_ADVANCED_SCOPE });
  const [applied, setApplied] = useState(null);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [sessionVersion, setSessionVersion] = useState(0);

  useEffect(() => {
    client.get('/customer-processing/periods', { cacheTtl: 300000, hideGlobalLoading: true })
      .then(({ data }) => setPeriods((Array.isArray(data) ? data : []).filter((item) => Number(item.profile_count || 0) > 0)))
      .finally(() => setMetadataLoading(false));
  }, []);

  useEffect(() => {
    if (!draft.periodKey) {
      setOptions({ branches: [], pgd_options: [], officers: [], customer_types: [], loan_types: [] });
      return;
    }
    client.get('/customer-processing/profile-filter-options', {
      params: { period_key: draft.periodKey, branch_code: draft.branchCode || undefined },
      cacheTtl: 300000,
      hideGlobalLoading: true,
    }).then(({ data }) => setOptions(data || {})).catch(() => setOptions({}));
  }, [draft.branchCode, draft.periodKey]);

  useEffect(() => {
    if (!applied?.periodKey) return;
    const profileParams = scopeToProfileParams(applied);
    const orgParams = {
      period_key: applied.periodKey,
      branch_code: applied.branchCode || undefined,
      pgd_code: applied.pgdCode || undefined,
    };
    // Nạp trước các tập tổng hợp dùng chung. Khi chuyển tab, request trùng sẽ lấy
    // từ cache của phiên thay vì truy vấn lại database.
    Promise.allSettled([
      client.get('/dashboard/summary', { params: orgParams }),
      client.get('/dashboard/insights', { params: orgParams }),
      client.get('/dashboard/business-analytics', { params: orgParams }),
      client.get('/dashboard/business-trends', { params: { periods: 12, branch_code: orgParams.branch_code, pgd_code: orgParams.pgd_code } }),
      client.get('/customer-processing/profile-summary', { params: profileParams }),
      client.get('/customer-processing/profile-groups', { params: orgParams }),
      client.get('/customer-processing/profiles', { params: { ...profileParams, page: 1, page_size: 15, include_total: true, sort_by: 'so_du_tien_gui', sort_dir: 'desc' } }),
    ]);
  }, [applied, sessionVersion]);

  const value = useMemo(() => ({
    periods, options, draft, applied, metadataLoading, sessionVersion,
    updateDraft: (patch) => setDraft((current) => ({ ...current, ...patch })),
    updateAdvanced: (patch) => setDraft((current) => ({ ...current, advanced: { ...current.advanced, ...patch } })),
    apply: () => {
      if (!draft.periodKey) return false;
      clearApiCache();
      const next = { ...draft, advanced: { ...draft.advanced } };
      setApplied(next);
      setSessionVersion((value) => value + 1);
      localStorage.setItem('c360_applied_scope', JSON.stringify(next));
      return true;
    },
    reset: () => {
      setDraft({ periodKey: '', branchCode: null, pgdCode: null, advanced: EMPTY_ADVANCED_SCOPE });
      setApplied(null);
      localStorage.removeItem('c360_applied_scope');
      clearApiCache();
    },
    refresh: () => { clearApiCache(); setSessionVersion((value) => value + 1); },
  }), [applied, draft, metadataLoading, options, periods, sessionVersion]);
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
    min_deposit: advanced.minDeposit != null ? advanced.minDeposit * 1000000 : undefined,
    max_deposit: advanced.maxDeposit != null ? advanced.maxDeposit * 1000000 : undefined,
    min_loan: advanced.minLoan != null ? advanced.minLoan * 1000000 : undefined,
    max_loan: advanced.maxLoan != null ? advanced.maxLoan * 1000000 : undefined,
  };
}
