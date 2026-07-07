import { useCallback, useEffect, useState } from 'react';
import { message } from 'antd';

import { cnFromSelectValue, cnSelectValue } from '../constants/branches';
import { resolveBranchScope, toApiBranchParams } from '../auth/branchScope';
import { useAuth } from '../auth/AuthProvider';
import { useBranchScope, useBranchSelectOptions, usePgdSelectOptions } from '../auth/useAuthHooks';

/**
 * Hook gom logic lọc CN/PGD + phân quyền.
 * Dashboard / CustomerReport chỉ cần gọi hook này.
 */
export function useBranchFilters(rows, { onScopeApply } = {}) {
  const { user } = useAuth();
  const [filterCn, setFilterCn] = useState(null);
  const [filterPgd, setFilterPgd] = useState(null);
  const [initialized, setInitialized] = useState(false);

  const scope = useBranchScope(filterCn, filterPgd);
  const cnOptions = useBranchSelectOptions(rows, scope);
  const pgdOptions = usePgdSelectOptions(rows, filterCn, scope);

  useEffect(() => {
    if (!user || initialized) return;
    const initial = resolveBranchScope(user, null, null);
    setFilterCn(initial.filterCn);
    setFilterPgd(initial.filterPgd);
    setInitialized(true);
    onScopeApply?.(toApiBranchParams(initial.filterCn, initial.filterPgd));
  }, [user, initialized, onScopeApply]);

  useEffect(() => {
    if (scope.denied) {
      message.warning('Bạn không có quyền xem chi nhánh này');
      setFilterCn(scope.defaultCn);
      setFilterPgd(scope.defaultPgd);
      onScopeApply?.(toApiBranchParams(scope.defaultCn, scope.defaultPgd));
    }
  }, [scope.denied, scope.defaultCn, scope.defaultPgd, onScopeApply]);

  const applyScope = useCallback(
    (cn, pgd) => {
      const resolved = resolveBranchScope(user, cn, pgd);
      setFilterCn(resolved.filterCn);
      setFilterPgd(resolved.filterPgd);
      onScopeApply?.(toApiBranchParams(resolved.filterCn, resolved.filterPgd));
      return resolved;
    },
    [user, onScopeApply],
  );

  const handleCnChange = useCallback(
    (value) => {
      const cn = cnFromSelectValue(value);
      applyScope(cn, null);
    },
    [applyScope],
  );

  const handlePgdChange = useCallback(
    (value) => {
      applyScope(filterCn, value || null);
    },
    [applyScope, filterCn],
  );

  const resetScope = useCallback(() => {
    const initial = resolveBranchScope(user, null, null);
    setFilterCn(initial.filterCn);
    setFilterPgd(initial.filterPgd);
    onScopeApply?.(toApiBranchParams(initial.filterCn, initial.filterPgd));
  }, [user, onScopeApply]);

  const filteredRows = rows.filter((row) => {
    if (filterCn && row.ma_cn !== filterCn) return false;
    if (filterPgd && row.ma_pgd !== filterPgd) return false;
    return true;
  });

  return {
    filterCn,
    filterPgd,
    scope,
    cnOptions,
    pgdOptions,
    cnSelectValue: cnSelectValue(filterCn),
    filteredRows,
    handleCnChange,
    handlePgdChange,
    resetScope,
    branchSelectDisabled: !scope.canChangeBranch,
    pgdSelectDisabled: !scope.canChangePgd,
  };
}
