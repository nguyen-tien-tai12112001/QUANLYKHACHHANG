export const ALL_BRANCHES_VALUE = '__ALL__';
export const PROVINCE_LABEL = 'Toàn tỉnh Bắc Ninh';

export const CN_NAMES = {
  CN01: 'Chi nhánh Đông Hà Nội',
  CN02: 'Chi nhánh Láng Hạ',
  CN03: 'Chi nhánh Tây Hồ',
  CN04: 'Chi nhánh Cầu Giấy',
};

export const PGD_NAMES = {
  PGD01: { name: 'PGD Gia Lâm', parent: 'CN01' },
  PGD02: { name: 'PGD Long Biên', parent: 'CN01' },
  PGD03: { name: 'PGD Đống Đa', parent: 'CN02' },
  PGD04: { name: 'PGD Láng Hạ', parent: 'CN02' },
  PGD05: { name: 'PGD Tây Hồ', parent: 'CN03' },
  PGD06: { name: 'PGD Nhật Tân', parent: 'CN03' },
  PGD07: { name: 'PGD Cầu Giấy', parent: 'CN04' },
};

export function cnFromSelectValue(value) {
  if (!value || value === ALL_BRANCHES_VALUE) return null;
  return value;
}

export function cnSelectValue(filterCn) {
  return filterCn ?? ALL_BRANCHES_VALUE;
}

export function buildCnSelectOptions(rows, { includeProvince = true } = {}) {
  const uniqueCns = [...new Set(rows.map((row) => row.ma_cn).filter(Boolean))].sort();
  const branchOptions = uniqueCns.map((cn) => ({
    value: cn,
    label: CN_NAMES[cn] || cn,
  }));

  if (!includeProvince) return branchOptions;
  return [{ value: ALL_BRANCHES_VALUE, label: PROVINCE_LABEL }, ...branchOptions];
}

/**
 * @deprecated Dùng resolveBranchScope từ ../auth/branchScope
 */
export { resolveBranchScope } from '../auth/branchScope';
