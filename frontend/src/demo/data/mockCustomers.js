const firstNames = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Hải', 'Hạnh', 'Hiếu', 'Hùng', 'Lan', 'Linh', 'Long', 'Mai', 'Minh', 'Nam', 'Nga', 'Ngọc', 'Phương', 'Quân', 'Quang', 'Sơn', 'Thảo', 'Trang', 'Tuấn', 'Việt'];
const middleNames = ['Văn', 'Thị', 'Đức', 'Hoàng', 'Ngọc', 'Thanh', 'Minh', 'Quốc'];
const lastNames = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ'];
const companyForms = ['Công ty TNHH', 'Công ty Cổ phần', 'Hộ kinh doanh', 'Doanh nghiệp tư nhân', 'Hợp tác xã'];
const companyNames = ['An Phát', 'Bắc Việt', 'Đại Thành', 'Gia Hưng', 'Hòa Bình', 'Minh Anh', 'Nam Dương', 'Phú Gia', 'Quang Minh', 'Tân Tiến', 'Thành Công', 'Việt Hưng'];
const branches = [
  { code: '2600', name: 'Hội sở Bắc Ninh', pgds: ['Phòng KHDN', 'Phòng KHCN', 'Phòng KTNQ'] },
  { code: '2602', name: 'Chi nhánh Yên Phong', pgds: ['PGD Chờ', 'PGD Đông Phong'] },
  { code: '2604', name: 'Chi nhánh Quế Võ', pgds: ['PGD Phố Mới', 'PGD Đại Xuân'] },
  { code: '2606', name: 'Chi nhánh Tiên Du', pgds: ['PGD Lim', 'PGD Hoàn Sơn'] },
  { code: '2607', name: 'Chi nhánh Thuận Thành', pgds: ['PGD Hồ', 'PGD Trạm Lộ'] },
  { code: '2608', name: 'Chi nhánh Từ Sơn', pgds: ['PGD Đồng Kỵ', 'PGD Châu Khê'] },
];
const officers = ['Nguyễn Minh Anh', 'Trần Quốc Dũng', 'Lê Thu Hà', 'Phạm Đức Long', 'Vũ Hoàng Nam', 'Đặng Ngọc Mai', 'Bùi Quang Huy', 'Đỗ Thanh Tùng'];
const periods = ['20250731', '20250831', '20250930', '20251031', '20251130', '20251231', '20260131', '20260228', '20260331', '20260430', '20260531', '20260630'];

function seeded(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function pick(list, random) {
  return list[Math.floor(random() * list.length)];
}

function money(random, min, max, step = 1000000) {
  return Math.round((min + random() * (max - min)) / step) * step;
}

function service(random, likelihood = 0.55) {
  const value = random();
  if (value < 0.08) return null;
  return value < likelihood ? true : false;
}

function makeHistory(random, baseDeposit, baseLoan, baseFees) {
  return periods.map((period, index) => {
    const factor = 0.72 + index * 0.025 + (random() - 0.5) * 0.08;
    return {
      period,
      deposits: Math.max(0, Math.round(baseDeposit * factor)),
      loans: Math.max(0, Math.round(baseLoan * (0.9 + (random() - 0.5) * 0.18))),
      fees: Math.max(0, Math.round(baseFees * (0.7 + index * 0.03 + (random() - 0.5) * 0.12))),
    };
  });
}

function buildCustomer(index) {
  const random = seeded(index * 9973 + 37);
  const isBusiness = random() < 0.32;
  const branch = pick(branches, random);
  const pgd = pick(branch.pgds, random);
  const customerType = isBusiness ? (random() < 0.7 ? 'Doanh nghiệp' : 'Hộ kinh doanh') : 'Cá nhân';
  const customerName = isBusiness
    ? `${pick(companyForms, random)} ${pick(companyNames, random)} ${String(index).padStart(3, '0')}`
    : `${pick(lastNames, random)} ${pick(middleNames, random)} ${pick(firstNames, random)}`;
  const segmentRoll = random();
  const segment = segmentRoll > 0.94 ? 'PLATINUM' : segmentRoll > 0.78 ? 'GOLD' : segmentRoll > 0.5 ? 'SILVER' : 'PHỔ THÔNG';
  const deposits = {
    currentAccountBalance: money(random, 0, isBusiness ? 12000000000 : 2800000000),
    averageCurrentBalance: money(random, 0, isBusiness ? 9000000000 : 1800000000),
    termDepositBalance: money(random, 0, isBusiness ? 18000000000 : 6500000000),
    termDepositAverage: money(random, 0, isBusiness ? 15000000000 : 5200000000),
    incomingTurnover: money(random, 0, isBusiness ? 40000000000 : 8500000000),
    ftpIncome: money(random, 0, isBusiness ? 90000000 : 20000000, 100000),
  };
  const hasBadDebt = random() < 0.045;
  const loans = {
    shortTerm: money(random, 0, isBusiness ? 16000000000 : 2200000000),
    mediumLongTerm: money(random, 0, isBusiness ? 22000000000 : 4500000000),
    overdraft: random() < 0.22 ? money(random, 0, isBusiness ? 3000000000 : 500000000) : 0,
    badDebt: hasBadDebt ? money(random, 20000000, isBusiness ? 1600000000 : 500000000) : 0,
    writtenOffDebt: random() < 0.015 ? money(random, 10000000, 400000000) : 0,
    provision: hasBadDebt ? money(random, 10000000, 500000000) : money(random, 0, 50000000),
    ftpIncome: money(random, 0, isBusiness ? 120000000 : 25000000, 100000),
  };
  const fees = {
    guarantee: money(random, 0, isBusiness ? 25000000 : 2000000, 10000),
    transfer: money(random, 0, isBusiness ? 16000000 : 3000000, 10000),
    foreignExchange: money(random, 0, isBusiness ? 12000000 : 1000000, 10000),
    international: money(random, 0, isBusiness ? 18000000 : 500000, 10000),
    lc: money(random, 0, isBusiness ? 22000000 : 0, 10000),
    digital: money(random, 0, 3000000, 10000),
    card: money(random, 0, 2500000, 10000),
    pos: money(random, 0, isBusiness ? 8000000 : 1000000, 10000),
    other: money(random, 0, 5000000, 10000),
  };
  fees.total = Object.values(fees).reduce((sum, value) => sum + value, 0);

  const digital = {
    prettyAccount: service(random, 0.42),
    agribankPlus: service(random, 0.82),
    ott: service(random, 0.7),
    eBanking: service(random, 0.76),
    loanReminder: service(random, 0.48),
    depositReminder: service(random, 0.44),
    loaThanTai: service(random, isBusiness ? 0.34 : 0.12),
    businessAccount: isBusiness ? service(random, 0.7) : false,
    eTax: isBusiness ? service(random, 0.38) : false,
  };
  const cards = {
    domesticDebit: service(random, 0.8),
    locViet: service(random, 0.24),
    internationalDebit: service(random, 0.32),
    internationalCredit: service(random, 0.22),
    salaryIndividual: !isBusiness ? service(random, 0.4) : false,
    salaryBusiness: isBusiness ? service(random, 0.28) : false,
    pos: isBusiness ? service(random, 0.3) : false,
    posTurnover: isBusiness ? money(random, 0, 3000000000) : 0,
  };
  const billPayments = {
    electricity: service(random, 0.58),
    water: service(random, 0.42),
    telecom: service(random, 0.48),
    tuition: service(random, 0.2),
    hospital: service(random, 0.12),
  };
  const abic = {
    creditProtection: service(random, 0.22),
    accountProtection: service(random, 0.34),
    cardholderProtection: service(random, 0.18),
    property: service(random, isBusiness ? 0.26 : 0.08),
    fire: service(random, isBusiness ? 0.24 : 0.06),
    motorcycle: service(random, 0.34),
    automobile: service(random, 0.2),
    home: service(random, 0.12),
    health: service(random, 0.16),
  };
  const internationalBusiness = {
    internationalTurnover: isBusiness ? money(random, 0, 9000000000) : money(random, 0, 400000000),
    lcTurnover: isBusiness ? money(random, 0, 6500000000) : 0,
    remittance: service(random, isBusiness ? 0.2 : 0.16),
    internationalPayment: service(random, isBusiness ? 0.34 : 0.06),
  };
  const allServiceValues = [...Object.values(digital), ...Object.values(cards), ...Object.values(billPayments), ...Object.values(abic), internationalBusiness.remittance, internationalBusiness.internationalPayment]
    .filter((value) => typeof value === 'boolean');
  const productCount = allServiceValues.filter(Boolean).length;
  const missingDataCount = [...Object.values(digital), ...Object.values(cards), ...Object.values(billPayments), ...Object.values(abic)]
    .filter((value) => value === null).length;
  const opportunityCount = Math.max(0, allServiceValues.filter((value) => value === false).length - 8);
  const totalDeposits = deposits.currentAccountBalance + deposits.termDepositBalance;
  const totalLoans = loans.shortTerm + loans.mediumLongTerm + loans.overdraft;
  const history = makeHistory(random, totalDeposits, totalLoans, fees.total);

  return {
    id: index,
    customerCode: `KH${String(260000000 + index)}`,
    customerName,
    customerType,
    segment,
    branchCode: branch.code,
    branchName: branch.name,
    pgd,
    officer: pick(officers, random),
    phone: random() < 0.055 ? null : `09${String(10000000 + index * 7919).slice(-8)}`,
    idNumber: isBusiness ? `230${String(1000000 + index).slice(-7)}` : `02720${String(10000000 + index * 13).slice(-7)}`,
    address: `${1 + (index % 180)}, ${pgd}, Bắc Ninh`,
    birthOrEstablished: isBusiness ? `${1995 + (index % 28)}-01-01` : `${1965 + (index % 38)}-${String(1 + (index % 12)).padStart(2, '0')}-${String(1 + (index % 27)).padStart(2, '0')}`,
    gender: isBusiness ? null : index % 2 ? 'Nam' : 'Nữ',
    period: '20260630',
    lastTransactionDate: `2026-06-${String(1 + (index % 28)).padStart(2, '0')}`,
    deposits,
    loans,
    fees,
    digital,
    cards,
    billPayments,
    abic,
    internationalBusiness,
    totalDeposits,
    totalLoans,
    totalBenefits: deposits.ftpIncome + loans.ftpIncome + fees.total,
    productCount,
    missingDataCount,
    opportunityCount,
    riskLevel: loans.badDebt > 0 ? 'high' : missingDataCount > 5 || !isBusiness && !digital.agribankPlus ? 'medium' : 'low',
    history,
    sources: [
      { code: 'CIF', status: 'ready', records: 1, updatedAt: '30/06/2026 21:05' },
      { code: 'DP01', status: 'ready', records: 1 + (index % 5), updatedAt: '30/06/2026 21:12' },
      { code: 'PF14', status: index % 19 === 0 ? 'warning' : 'ready', records: 1 + (index % 4), updatedAt: '30/06/2026 21:18' },
      { code: 'LN01', status: 'ready', records: totalLoans > 0 ? 1 + (index % 3) : 0, updatedAt: '30/06/2026 21:25' },
      { code: 'CN05', status: index % 23 === 0 ? 'warning' : 'ready', records: 1, updatedAt: '30/06/2026 21:31' },
      { code: 'ABIC', status: index % 7 === 0 ? 'missing' : 'ready', records: index % 7 === 0 ? 0 : 1, updatedAt: index % 7 === 0 ? '—' : '30/06/2026 21:42' },
    ],
  };
}

export const demoCustomers = Array.from({ length: 1000 }, (_, index) => buildCustomer(index + 1));

export const demoMeta = {
  generatedAt: '30/06/2026 22:00',
  period: '20260630',
  periods,
  branches,
  recordCount: demoCustomers.length,
};

export function summarizeCustomers(customers = demoCustomers) {
  return customers.reduce((result, customer) => {
    result.totalCustomers += 1;
    result.totalDeposits += customer.totalDeposits;
    result.totalLoans += customer.totalLoans;
    result.totalFees += customer.fees.total;
    result.totalBenefits += customer.totalBenefits;
    result.opportunities += customer.opportunityCount;
    if (customer.loans.badDebt > 0) result.badDebtCustomers += 1;
    if (customer.missingDataCount > 0) result.incompleteCustomers += 1;
    result.byType[customer.customerType] = (result.byType[customer.customerType] || 0) + 1;
    result.bySegment[customer.segment] = (result.bySegment[customer.segment] || 0) + 1;
    return result;
  }, {
    totalCustomers: 0,
    totalDeposits: 0,
    totalLoans: 0,
    totalFees: 0,
    totalBenefits: 0,
    opportunities: 0,
    badDebtCustomers: 0,
    incompleteCustomers: 0,
    byType: {},
    bySegment: {},
  });
}

