import { useMemo } from 'react';

import { ALL_BRANCHES_VALUE, buildCnSelectOptions, CN_NAMES, PGD_NAMES, PROVINCE_LABEL } from '../constants/branches';
import { resolveBranchScope } from './branchScope';
import { useAuth } from './AuthProvider';

export function usePermissions() {
  const { user } = useAuth();

  return useMemo(
    () => ({
      user,
      hasPermission: (permission) => {
        if (!user) return true;
        return user.permissions?.includes('admin') || user.permissions?.includes(permission);
      },
    }),
    [user],
  );
}

export function useBranchScope(requestedCn = null, requestedPgd = null) {
  const { user } = useAuth();

  return useMemo(
    () => resolveBranchScope(user, requestedCn, requestedPgd),
    [user, requestedCn, requestedPgd],
  );
}

export function useBranchSelectOptions(rows, scope) {
  return useMemo(() => {
    const sourceRows =
      rows.length > 0 ? rows : Object.keys(CN_NAMES).map((ma_cn) => ({ ma_cn }));
    const allOptions = buildCnSelectOptions(sourceRows, { includeProvince: scope.canViewProvince });
    if (scope.canViewProvince) return allOptions;

    const allowed = new Set(scope.allowedBranches);
    return allOptions.filter((opt) => opt.value !== ALL_BRANCHES_VALUE && allowed.has(opt.value));
  }, [rows, scope]);
}

export function usePgdSelectOptions(rows, filterCn, scope) {
  return useMemo(() => {
    let source =
      rows.length > 0
        ? rows
        : Object.entries(PGD_NAMES).map(([ma_pgd, info]) => ({ ma_pgd, ma_cn: info.parent }));
    if (filterCn) source = source.filter((row) => row.ma_cn === filterCn);
    if (!scope.canViewProvince && scope.allowedPgds.length > 0) {
      source = source.filter((row) => scope.allowedPgds.includes(row.ma_pgd));
    }

    return [...new Set(source.map((row) => row.ma_pgd).filter(Boolean))]
      .sort()
      .map((pgd) => ({
        value: pgd,
        label: PGD_NAMES[pgd]?.name || pgd,
      }));
  }, [rows, filterCn, scope]);
}

export function getScopeLabel(filterCn, filterPgd) {
  if (!filterCn) return PROVINCE_LABEL;
  if (filterPgd) return `${filterCn} / ${PGD_NAMES[filterPgd]?.name || filterPgd}`;
  return filterCn;
}
