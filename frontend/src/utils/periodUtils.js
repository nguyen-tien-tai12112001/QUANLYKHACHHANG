export function formatPeriodKey(periodKey) {
  if (!periodKey || periodKey.length !== 8) return periodKey || '';
  const year = periodKey.slice(0, 4);
  const month = periodKey.slice(4, 6);
  const day = periodKey.slice(6, 8);
  if (day === '01') return `Tháng ${Number(month)}/${year}`;
  return `${day}/${month}/${year}`;
}

export const DASHBOARD_PERIOD_STORAGE_KEY = 'dashboard_period_key';
