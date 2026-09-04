export const PASSWORD_RULES = [
  { key: 'length', label: 'Tối thiểu 10 ký tự', test: (value) => value.length >= 10 },
  { key: 'upper', label: 'Có chữ hoa', test: (value) => /[A-Z]/.test(value) },
  { key: 'lower', label: 'Có chữ thường', test: (value) => /[a-z]/.test(value) },
  { key: 'digit', label: 'Có chữ số', test: (value) => /\d/.test(value) },
  { key: 'special', label: 'Có ký tự đặc biệt', test: (value) => /[^A-Za-z0-9\s]/.test(value) },
  { key: 'spaces', label: 'Không chứa khoảng trắng', test: (value) => value.length > 0 && !/\s/.test(value) },
];

export function evaluatePassword(value = '') {
  const results = PASSWORD_RULES.map((rule) => ({ ...rule, passed: rule.test(value) }));
  const passed = results.filter((item) => item.passed).length;
  const level = passed <= 2 ? 'weak' : passed <= 4 ? 'medium' : passed < results.length ? 'good' : 'strong';
  return { results, passed, level, valid: passed === results.length };
}

export function apiErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  return detail?.message || fallback;
}
