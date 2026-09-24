import {
  ACTIVE_SERVICES,
  ACTIVE_SERVICE_COUNT,
  SERVICE_DEFS,
  getCampaignGroupPriority,
} from '../constants/services';

const moneyFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

export function money(value) {
  if (value === null || value === undefined || value === '') return '0';
  return moneyFormatter.format(Number(value || 0));
}

export function compactMoney(value) {
  const amount = Math.abs(Number(value || 0));
  const sign = Number(value || 0) < 0 ? '-' : '';
  // Luôn quy về đơn vị tỷ (= 10^9 đồng), làm tròn đến hàng tỷ — tránh chia 10^12 rồi vẫn ghi "tỷ"
  // khiến 3.020 tỷ hiện thành "3,02 tỷ" và lệch so với các dòng khác trên cùng biểu đồ.
  if (amount >= 1_000_000_000) {
    const roundedTy = Math.round(amount / 1_000_000_000);
    return `${sign}${roundedTy.toLocaleString('vi-VN')} tỷ`;
  }
  if (amount >= 1_000_000) {
    return `${sign}${(amount / 1_000_000).toLocaleString('vi-VN', {
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
    })} triệu`;
  }
  return `${sign}${amount.toLocaleString('vi-VN')}`;
}

export function formatLoan(val) {
  return compactMoney(val);
}

const LOAN_TYPE_ORDER = ['Thấu chi', 'Ngắn', 'Trung', 'Dài', 'Khác'];

function normalizeLoanTypeCategory(loanType) {
  const value = String(loanType || '').toLowerCase();
  if (value.includes('thấu chi')) return 'Thấu chi';
  if (value.includes('ngắn')) return 'Ngắn';
  if (value.includes('trung')) return 'Trung';
  if (value.includes('dài')) return 'Dài';
  return 'Khác';
}

export function countUsed(row) {
  let used = 0;
  for (const service of ACTIVE_SERVICES) {
    if (Number(row[service.key] || 0) > 0) used += 1;
  }
  return used;
}

export function getUnusedServices(row) {
  return ACTIVE_SERVICES.filter((s) => Number(row[s.key] || 0) === 0);
}

export function getUsedServices(row) {
  return ACTIVE_SERVICES.filter((s) => Number(row[s.key] || 0) > 0);
}

export function getPendingServices() {
  return SERVICE_DEFS.filter((s) => s.pending);
}

export function sortUnusedByPriority(row, unused) {
  const priority = getCampaignGroupPriority(row.loai_khach_hang);
  return [...unused].sort((a, b) => {
    const ai = priority.indexOf(a.group);
    const bi = priority.indexOf(b.group);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

export function calcTotalAssets(row) {
  return (
    Number(row.so_du_tien_vay || 0) +
    Number(row.so_du_tien_gui_ckh || 0) +
    Number(row.so_du_tgtt_binh_quan || 0)
  );
}

export function calcCrossSellPct(usedCount) {
  return Math.round((usedCount / ACTIVE_SERVICE_COUNT) * 100);
}

const EMPTY_METRICS = {
  kpis: { loan: 0, deposit: 0, casa: 0, noService: 0, totalCustomers: 0 },
  serviceStats: [],
  segmentStats: { cn: 0, dn: 0, cnLoan: 0, dnLoan: 0 },
  officerLeaderboard: [],
  loanTypeStats: [],
};

export function computeDashboardMetrics(rows) {
  const total = rows.length;
  if (total === 0) return EMPTY_METRICS;

  const serviceCounts = Object.fromEntries(ACTIVE_SERVICES.map((s) => [s.key, 0]));
  let loan = 0;
  let deposit = 0;
  let casa = 0;
  let noService = 0;
  let cn = 0;
  let dn = 0;
  let cnLoan = 0;
  let dnLoan = 0;
  const officerMap = new Map();
  const loanTypeMap = new Map();

  for (const row of rows) {
    const rowLoan = Number(row.so_du_tien_vay || 0);
    loan += rowLoan;
    deposit += Number(row.so_du_tien_gui_ckh || 0);
    casa += Number(row.so_du_tgtt_binh_quan || 0);

    let usedCount = 0;
    for (const service of ACTIVE_SERVICES) {
      if (Number(row[service.key] || 0) > 0) {
        serviceCounts[service.key] += 1;
        usedCount += 1;
      }
    }
    if (usedCount === 0) noService += 1;

    if (row.loai_khach_hang === 'KHCN') {
      cn += 1;
      cnLoan += rowLoan;
    } else if (row.loai_khach_hang === 'KHDN') {
      dn += 1;
      dnLoan += rowLoan;
    }

    if (row.ma_cb) {
      if (!officerMap.has(row.ma_cb)) {
        officerMap.set(row.ma_cb, {
          name: row.ten_can_bo || row.ma_cb,
          totalLoan: 0,
          totalCASA: 0,
          usedServicesCount: 0,
          custCount: 0,
        });
      }
      const officer = officerMap.get(row.ma_cb);
      officer.totalLoan += rowLoan;
      officer.totalCASA += Number(row.so_du_tgtt_binh_quan || 0);
      officer.usedServicesCount += usedCount;
      officer.custCount += 1;
    }

    const loanType = normalizeLoanTypeCategory(row.loai_vay);
    loanTypeMap.set(loanType, (loanTypeMap.get(loanType) || 0) + rowLoan);
  }

  const totalLoanForTypes = [...loanTypeMap.values()].reduce((sum, amt) => sum + amt, 0);

  return {
    kpis: { loan, deposit, casa, noService, totalCustomers: total },
    serviceStats: ACTIVE_SERVICES.map((service) => {
      const count = serviceCounts[service.key];
      return { ...service, count, pct: Math.round((count / total) * 100) };
    }).sort((a, b) => b.pct - a.pct),
    segmentStats: { cn, dn, cnLoan, dnLoan },
    officerLeaderboard: [...officerMap.entries()]
      .map(([code, data]) => ({
        code,
        ...data,
        avgCrossSell: Number((data.usedServicesCount / data.custCount).toFixed(1)),
      }))
      .sort((a, b) => b.totalLoan - a.totalLoan),
    loanTypeStats: [...loanTypeMap.entries()]
      .map(([type, amt]) => ({
        type,
        amt,
        pct: totalLoanForTypes > 0 ? Math.round((amt / totalLoanForTypes) * 100) : 0,
      }))
      .sort((a, b) => {
        const ai = LOAN_TYPE_ORDER.indexOf(a.type);
        const bi = LOAN_TYPE_ORDER.indexOf(b.type);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || b.amt - a.amt;
      }),
  };
}

export function buildCampaignCandidates(rows, contactedIds = new Set()) {
  return rows
    .filter((row) => !contactedIds.has(row.ma_kh_chuan))
    .map((row) => {
      const totalAssets = calcTotalAssets(row);
      const usedCount = countUsed(row);
      const unused = sortUnusedByPriority(row, getUnusedServices(row));
      const crossSellPct = calcCrossSellPct(usedCount);
      return { ...row, totalAssets, usedCount, unused, crossSellPct };
    })
    .filter((row) => row.totalAssets >= 80_000_000 && row.usedCount <= 2)
    .sort((a, b) => {
      if (b.totalAssets !== a.totalAssets) return b.totalAssets - a.totalAssets;
      return a.usedCount - b.usedCount;
    })
    .slice(0, 5);
}

export function generateCallScript(customer) {
  if (!customer) return '';

  const name = customer.ten_kh;
  const cb = customer.ten_can_bo || 'Cán bộ phụ trách';
  const missing = customer.unused || [];
  const targetProduct = missing.length > 0 ? missing[0].label : 'Dịch vụ số';

  let scriptDetail;
  if (targetProduct === 'Agribank Plus') {
    scriptDetail =
      'hiện tại gói sản phẩm vay tín dụng của anh/chị đang được hưởng ưu đãi lãi suất, và để tiện theo dõi lịch trả nợ cũng như số dư tài khoản vay mọi lúc mọi nơi hoàn toàn miễn phí, Agribank vừa nâng cấp ứng dụng Agribank Plus trên điện thoại với rất nhiều tiện ích thanh toán hóa đơn. Em xin phép hướng dẫn anh/chị kích hoạt chỉ trong 1 phút...';
  } else if (targetProduct === 'Thẻ ghi nợ nội địa' || targetProduct === 'Thẻ TD quốc tế') {
    scriptDetail =
      'em thấy anh/chị thường xuyên phát sinh giao dịch thanh toán nguồn vốn kinh doanh. Bên em đang có chương trình phát hành Thẻ tín dụng Lộc Việt / Thẻ quốc tế miễn phí thường niên năm đầu, kèm hạn mức dự phòng lên tới 100 triệu đồng để hỗ trợ anh/chị thanh toán nhanh hoặc rút tiền khi cần kíp...';
  } else {
    scriptDetail = `em thấy anh/chị đang có số dư tài khoản giao dịch rất tốt tại chi nhánh. Hiện Agribank đang hỗ trợ cài đặt gói dịch vụ ${targetProduct} tích hợp liên kết trực tiếp để giúp tối ưu hóa chi phí vận hành cho anh/chị...`;
  }

  return (
    `Dành cho cán bộ: [${cb}]\n\n` +
    `Chào hỏi:\n"Dạ em chào anh/chị ${name}, em là ${cb} - cán bộ quản lý tín dụng của anh/chị tại Agribank Bắc Ninh đây ạ. Em xin phép gọi điện hỏi thăm về tình hình sử dụng vốn vay của mình thời gian qua có thuận lợi không ạ?"\n\n` +
    `Dẫn dắt bán chéo:\n"Dạ, nhân tiện ${scriptDetail}"\n\n` +
    `Chốt cuộc hẹn:\n"Không biết chiều nay lúc 2h hoặc ngày mai em có thể hỗ trợ anh/chị kích hoạt dịch vụ này qua điện thoại, hoặc em gửi hướng dẫn qua Zalo số này cho anh/chị nhé?"`
  );
}

export const CONTACTED_STORAGE_PREFIX = 'dashboard_contacted_';

export function loadContactedIds(periodKey) {
  if (!periodKey) return new Set();
  try {
    const raw = localStorage.getItem(`${CONTACTED_STORAGE_PREFIX}${periodKey}`);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function saveContactedId(periodKey, maKhChuan) {
  const ids = loadContactedIds(periodKey);
  ids.add(maKhChuan);
  localStorage.setItem(`${CONTACTED_STORAGE_PREFIX}${periodKey}`, JSON.stringify([...ids]));
  return ids;
}
