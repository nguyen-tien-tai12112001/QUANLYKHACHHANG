import { PERMISSIONS, SCOPES } from './permissions';

/**
 * Tính phạm vi chi nhánh từ user + lựa chọn UI.
 * Module quản trị chỉ cần đảm bảo /api/auth/me trả đúng shape user.
 */
export function resolveBranchScope(user, requestedCn = null, requestedPgd = null) {
  if (!user) {
    return {
      filterCn: requestedCn,
      filterPgd: requestedPgd,
      canViewProvince: true,
      canChangeBranch: true,
      canChangePgd: true,
      allowedBranches: [],
      allowedPgds: [],
      defaultCn: null,
      defaultPgd: null,
      denied: false,
    };
  }

  const permissions = user.permissions || [];
  const homeCn = user.ma_cn || user.branch_code || null;
  const homePgd = user.ma_pgd || user.department_code || null;
  const canViewAll =
    permissions.includes(PERMISSIONS.BRANCH_VIEW_ALL) ||
    permissions.includes(PERMISSIONS.ADMIN) ||
    user.scope === SCOPES.PROVINCE ||
    (!user.scope && !homeCn);
  const allowedBranches =
    user.allowed_branches?.length > 0
      ? user.allowed_branches
      : homeCn
        ? [homeCn]
        : [];

  const allowedPgds = user.allowed_pgds || (homePgd ? [homePgd] : []);

  if (canViewAll) {
    return {
      filterCn: requestedCn,
      filterPgd: requestedPgd,
      canViewProvince: true,
      canChangeBranch: true,
      canChangePgd: true,
      allowedBranches: [],
      allowedPgds: [],
      defaultCn: null,
      defaultPgd: null,
      denied: false,
    };
  }

  if (user.scope === SCOPES.PGD || user.scope === SCOPES.OWN) {
    const lockedCn = homeCn;
    const lockedPgd = homePgd;
    if (requestedCn && requestedCn !== lockedCn) {
      return deniedScope(lockedCn, lockedPgd, allowedBranches, allowedPgds);
    }
    if (requestedPgd && requestedPgd !== lockedPgd) {
      return deniedScope(lockedCn, lockedPgd, allowedBranches, allowedPgds);
    }
    return {
      filterCn: lockedCn,
      filterPgd: lockedPgd,
      canViewProvince: false,
      canChangeBranch: false,
      canChangePgd: false,
      allowedBranches,
      allowedPgds,
      defaultCn: lockedCn,
      defaultPgd: lockedPgd,
      denied: false,
    };
  }

  // scope branch (mặc định cán bộ chi nhánh)
  if (requestedCn && !allowedBranches.includes(requestedCn)) {
    return deniedScope(homeCn, null, allowedBranches, allowedPgds);
  }

  const filterCn = requestedCn ?? homeCn;
  let filterPgd = requestedPgd;
  if (filterPgd && allowedPgds.length > 0 && !allowedPgds.includes(filterPgd)) {
    filterPgd = null;
  }

  return {
    filterCn,
    filterPgd: filterPgd ?? null,
    canViewProvince: false,
    canChangeBranch: allowedBranches.length > 1,
    canChangePgd: allowedPgds.length === 0 || allowedPgds.length > 1,
    allowedBranches,
    allowedPgds,
    defaultCn: homeCn,
    defaultPgd: homePgd,
    denied: false,
  };
}

function deniedScope(cn, pgd, allowedBranches, allowedPgds) {
  return {
    filterCn: cn,
    filterPgd: pgd,
    canViewProvince: false,
    canChangeBranch: false,
    canChangePgd: false,
    allowedBranches,
    allowedPgds,
    defaultCn: cn,
    defaultPgd: pgd,
    denied: true,
  };
}

export function hasPermission(user, permission) {
  if (!user) return true;
  const permissions = user.permissions || [];
  return permissions.includes(PERMISSIONS.ADMIN) || permissions.includes(permission);
}

export function toApiBranchParams(filterCn, filterPgd) {
  const params = {};
  if (filterCn) params.ma_cn = filterCn;
  if (filterPgd) params.ma_pgd = filterPgd;
  return params;
}
