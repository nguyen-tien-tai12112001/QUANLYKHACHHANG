export const SERVICE_DEFS = [
  { key: 'thau_chi', label: 'Thấu chi', group: 'Tài khoản', pending: false },
  { key: 'tk_so_dep', label: 'TK số đẹp', group: 'Tài khoản', pending: false },
  { key: 'agribank_plus', label: 'Agribank Plus', group: 'Digital', pending: false },
  { key: 'tin_nhan_ott', label: 'Tin nhắn OTT', group: 'Digital', pending: false },
  { key: 'e_banking', label: 'e-Banking', group: 'Digital', pending: true },
  { key: 'sms_nhac_no_vay', label: 'SMS nhắc nợ vay', group: 'Digital', pending: false },
  { key: 'sms_tien_gui', label: 'SMS tiền gửi', group: 'Digital', pending: false },
  { key: 'the_ghi_no_noi_dia', label: 'Thẻ ghi nợ nội địa', group: 'Thẻ', pending: false },
  { key: 'the_ghi_no_quoc_te', label: 'Thẻ ghi nợ quốc tế', group: 'Thẻ', pending: false },
  { key: 'the_td_quoc_te', label: 'Thẻ TD quốc tế', group: 'Thẻ', pending: false },
  { key: 'the_td_loc_viet', label: 'Thẻ TD Lộc Việt', group: 'Thẻ', pending: false },
  { key: 'tt_tien_dien', label: 'TT tiền điện', group: 'Thanh toán', pending: true },
  { key: 'tt_tien_nuoc', label: 'TT tiền nước', group: 'Thanh toán', pending: true },
  { key: 'tt_cuoc_vien_thong', label: 'TT cước viễn thông', group: 'Thanh toán', pending: true },
  { key: 'tra_luong_qua_the', label: 'Trả lương qua thẻ', group: 'Thanh toán', pending: true },
  { key: 'batd', label: 'BATD', group: 'Bảo hiểm', pending: true },
  { key: 'batk', label: 'BATK', group: 'Bảo hiểm', pending: true },
  { key: 'bh_oto_xe_may', label: 'BH ô tô, xe máy', group: 'Bảo hiểm', pending: true },
  { key: 'bh_khac', label: 'BH khác', group: 'Bảo hiểm', pending: true },
  { key: 'bao_lanh', label: 'Bảo lãnh', group: 'Bảo lãnh/TTQT', pending: true },
  { key: 'loa_bien_dong_so_du', label: 'Loa Thần Tài', group: 'Digital', pending: false },
  { key: 'phan_mem_ban_hang', label: 'Phần mềm bán hàng', group: 'Khác', pending: true },
  { key: 'pos', label: 'POS', group: 'Thẻ', pending: false },
  { key: 'chi_tra_kieu_hoi', label: 'Chi trả kiều hối', group: 'Bảo lãnh/TTQT', pending: true },
  { key: 'phat_hanh_lc', label: 'Phát hành LC', group: 'Bảo lãnh/TTQT', pending: true },
  { key: 'thanh_toan_quoc_te', label: 'Thanh toán quốc tế', group: 'Bảo lãnh/TTQT', pending: true },
  { key: 'mua_ban_ngoai_te', label: 'Mua bán ngoại tệ', group: 'Bảo lãnh/TTQT', pending: true },
];

export const TOTAL_SERVICES = SERVICE_DEFS.length;
export const ACTIVE_SERVICES = SERVICE_DEFS.filter((s) => !s.pending);
export const ACTIVE_SERVICE_COUNT = ACTIVE_SERVICES.length;

export const SERVICE_GROUPS_ORDER = ['Tài khoản', 'Digital', 'Thẻ', 'Thanh toán', 'Bảo hiểm', 'Bảo lãnh/TTQT', 'Khác'];

export const SERVICE_BY_GROUP = SERVICE_GROUPS_ORDER.reduce((acc, group) => {
  acc[group] = ACTIVE_SERVICES.filter((s) => s.group === group);
  return acc;
}, {});

export const GROUP_COLORS = {
  'Tín dụng': '#d4380d',
  'Tài khoản': '#0369a1',
  Digital: '#7c3aed',
  'Thẻ': '#b45309',
  'Thanh toán': '#0891b2',
  'Bảo hiểm': '#15803d',
  'Bảo lãnh/TTQT': '#9333ea',
  'Khác': '#64748b',
};

const CAMPAIGN_GROUP_PRIORITY = {
  KHCN: ['Digital', 'Thẻ', 'Thanh toán', 'Tài khoản', 'Bảo hiểm', 'Bảo lãnh/TTQT', 'Khác'],
  KHDN: ['Bảo lãnh/TTQT', 'Digital', 'Thanh toán', 'Tài khoản', 'Thẻ', 'Bảo hiểm', 'Khác'],
  DEFAULT: ['Digital', 'Thanh toán', 'Tài khoản', 'Thẻ', 'Bảo hiểm', 'Bảo lãnh/TTQT', 'Khác'],
};

export function getCampaignGroupPriority(loaiKhachHang) {
  return CAMPAIGN_GROUP_PRIORITY[loaiKhachHang] || CAMPAIGN_GROUP_PRIORITY.DEFAULT;
}
