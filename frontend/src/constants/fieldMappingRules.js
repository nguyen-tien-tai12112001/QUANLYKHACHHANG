const implemented = {
  MCN: {
    profileField: 'primary_branch_code',
    actualSource: 'DP01 + LN01 + PF14 + CN05',
    calculation: 'Chọn chi nhánh chính có primary_location_score cao nhất từ tổng quy mô tiền gửi, dư nợ và số dịch vụ của khách hàng.',
    reconciliation: 'Đối chiếu mã chi nhánh đã chọn với branch_details; kiểm tra chi nhánh có điểm cao nhất và tồn tại trong file nguồn.',
  },
  MPGD: {
    profileField: 'primary_pgd_code',
    actualSource: 'DP01',
    calculation: 'Lấy mã PGD của chi nhánh chính từ bản ghi DP01; tổng hợp theo MA_KH và chi nhánh.',
    reconciliation: 'Đối chiếu MPGD với MA_PGD của DP01 và danh mục phòng giao dịch.',
  },
  MKH: {
    profileField: 'ma_kh',
    actualSource: 'DP01',
    calculation: 'Chuẩn hóa TRIM(MA_KH_CHUAN); nếu trống dùng TRIM(MA_KH). DP01 là tập khách hàng nền.',
    reconciliation: 'Khóa duy nhất theo kỳ là period_key + MA_KH; dùng cùng khóa để nối LN01, PF14 và CN05.',
  },
  TENKH: {
    profileField: 'ten_kh',
    actualSource: 'DP01',
    calculation: 'Lấy MAX(TEN_KH) trong các tài khoản DP01 của cùng MA_KH tại chi nhánh.',
    reconciliation: 'So sánh tên với DP01 theo MA_KH; cảnh báo khi một MA_KH có nhiều tên khác nhau.',
  },
  LOAIKH: {
    profileField: 'loai_khach_hang',
    actualSource: 'DP01',
    calculation: 'Ưu tiên CUST_TYPE_NAME, nếu trống dùng CUST_TYPE; lấy MAX khi khách hàng có nhiều tài khoản.',
    reconciliation: 'Đối chiếu giá trị với danh mục loại khách hàng IPCAS và DP01.',
  },
  DIEN_THOAI: {
    profileField: 'telephone',
    actualSource: 'DP01',
    calculation: 'Lấy MAX(TELEPHONE) khác NULL của các bản ghi DP01 cùng MA_KH.',
    reconciliation: 'Chuẩn hóa số điện thoại, kiểm tra độ dài và các số khác nhau trên cùng MA_KH.',
  },
  MACB: {
    profileField: 'ma_cb',
    actualSource: 'LN01 + người dùng hệ thống',
    calculation: 'Chọn cán bộ của khoản vay có dư nợ lớn nhất; mã IPCAS được chuẩn hóa và nối với danh mục người dùng.',
    reconciliation: 'Đối chiếu OFFICER_IPCAS trong LN01 với IPCAS_USERNAME của người dùng đang hoạt động.',
  },
  TENCB: {
    profileField: 'ten_can_bo',
    actualSource: 'LN01 + người dùng hệ thống',
    calculation: 'Tên cán bộ lấy từ tài khoản hệ thống khớp OFFICER_IPCAS của khoản vay dư nợ lớn nhất.',
    reconciliation: 'Đối chiếu mã cán bộ, username IPCAS và họ tên trong danh mục người dùng.',
  },
  DS_TKTT: {
    profileField: 'doanh_so_chuyen_tien_ve_tk',
    actualSource: 'DP01 kỳ hiện tại + kỳ trước',
    calculation: 'MAX(0, tổng số dư DP01 quy đổi kỳ hiện tại - tổng số dư quy đổi kỳ trước) theo MA_KH.',
    reconciliation: 'Đối chiếu tổng số dư hai kỳ, tỷ giá từng CCY và bảo đảm kết quả không âm.',
  },
  SODU_TGCKH: {
    profileField: 'so_du_tien_gui',
    actualSource: 'PF14 + tỷ giá DP01',
    calculation: 'SUM(MONTHLYENDBALANCE × EXCHANGE_RATE) với MONTERM > 0, theo MA_KH và chi nhánh.',
    reconciliation: 'Đối chiếu tổng PF14 theo MA_KH/chi nhánh/CCY và bảng tỷ giá của kỳ.',
  },
  SODU_TKTTBQ: {
    profileField: 'so_du_tgtt_binh_quan',
    actualSource: 'PF14 + tỷ giá DP01',
    calculation: 'SUM(AVERAGEBALANCE × EXCHANGE_RATE) với MONTERM = 0, theo MA_KH và chi nhánh.',
    reconciliation: 'Đối chiếu tổng số dư bình quân PF14 theo MA_KH/chi nhánh và từng loại tiền.',
  },
  DUNO_NHTT: {
    profileField: 'so_du_tien_vay',
    actualSource: 'LN01',
    calculation: 'Hiện tại là tổng SUM(DU_NO) tất cả khoản vay của MA_KH; chưa tách riêng hoàn toàn dư nợ ngắn hạn thông thường.',
    reconciliation: 'Đối chiếu tổng dư nợ LN01 theo MA_KH/chi nhánh; cần tách LOAN_TYPE nếu dùng đúng chỉ tiêu DUNO_NHTT.',
  },
  DUNO_TC: {
    profileField: 'thau_chi',
    actualSource: 'LN01',
    calculation: 'Hiện lưu cờ 1/0 khi LOAN_TYPE là thấu chi, chưa lưu số dư thấu chi riêng.',
    reconciliation: 'Đối chiếu LOAN_TYPE trong LN01; chưa đủ để thay thế chỉ tiêu số tiền DUNO_TC.',
  },
  TKSODEP: {
    profileField: 'tk_so_dep',
    actualSource: 'CN05',
    calculation: 'MAX(CASE WHEN TKTT_TK_SODEP > 0 THEN 1 ELSE 0 END) theo MA_KH và chi nhánh.',
    reconciliation: 'Đối chiếu cờ sử dụng với CN05; một bản ghi dương thì khách hàng được xác định có sử dụng.',
  },
  AGRIBANKPLUS: {
    profileField: 'agribank_plus',
    actualSource: 'CN05',
    calculation: 'MAX(CASE WHEN DK_AGRIBANK_PLUS > 0 THEN 1 ELSE 0 END) theo MA_KH và chi nhánh.',
    reconciliation: 'Đối chiếu số lượng đăng ký trên CN05; tổng hợp toàn khách hàng bằng MAX qua các chi nhánh.',
  },
  OTT: {
    profileField: 'tin_nhan_ott',
    actualSource: 'CN05',
    calculation: 'MAX(CASE WHEN DK_AGRIBANK_PLUS_OTT > 0 THEN 1 ELSE 0 END).',
    reconciliation: 'Đối chiếu cờ OTT theo MA_KH/chi nhánh trong CN05.',
  },
  EBANKING: {
    profileField: 'e_banking',
    actualSource: 'CN05',
    calculation: 'MAX(CASE WHEN SMS_BANKING > 0 THEN 1 ELSE 0 END); tên trường đích hiện là e_banking.',
    reconciliation: 'Đối chiếu với SMS_BANKING của CN05; cần nghiệp vụ xác nhận phạm vi có đúng toàn bộ E-Banking hay không.',
  },
  SMS_TKTV: {
    profileField: 'sms_nhac_no_vay',
    actualSource: 'CN05',
    calculation: 'MAX(CASE WHEN VV_SMS_TIEN_VAY > 0 THEN 1 ELSE 0 END).',
    reconciliation: 'Đối chiếu cờ dịch vụ vay trên CN05 theo MA_KH/chi nhánh.',
  },
  SMS_TKTG: {
    profileField: 'sms_tien_gui',
    actualSource: 'CN05',
    calculation: 'MAX(CASE WHEN TG_SMS_TIEN_GUI > 0 THEN 1 ELSE 0 END).',
    reconciliation: 'Đối chiếu cờ dịch vụ tiền gửi trên CN05 theo MA_KH/chi nhánh.',
  },
  THE_GNND: {
    profileField: 'the_ghi_no_noi_dia',
    actualSource: 'CN05',
    calculation: 'MAX(CASE WHEN THE_GHI_NO_NOI_DIA > 0 THEN 1 ELSE 0 END).',
    reconciliation: 'Đối chiếu số lượng thẻ ghi nợ nội địa trong CN05.',
  },
  THE_LOCVIET: {
    profileField: 'the_td_loc_viet',
    actualSource: 'CN05',
    calculation: 'MAX(CASE WHEN THE_TIN_DUNG_NOI_DIA > 0 THEN 1 ELSE 0 END); hiện ánh xạ vào cờ thẻ Lộc Việt.',
    reconciliation: 'Đối chiếu THE_TIN_DUNG_NOI_DIA; cần xác nhận nghiệp vụ có đồng nhất với toàn bộ thẻ Lộc Việt.',
  },
  THE_TDQT: {
    profileField: 'the_td_quoc_te',
    actualSource: 'CN05',
    calculation: 'MAX(CASE WHEN THE_TIN_DUNG_QUOC_TE > 0 THEN 1 ELSE 0 END).',
    reconciliation: 'Đối chiếu số lượng thẻ tín dụng quốc tế trong CN05.',
  },
};

export function mappingRuleFor(field) {
  return implemented[field.code] || {
    profileField: null,
    actualSource: field.source,
    calculation: `Chưa có cột đích hoặc công thức xử lý trong customer_period_profiles. Nguồn dự kiến: ${field.source}.`,
    reconciliation: 'Chưa triển khai đối chiếu tự động; cần chốt nguồn, khóa nối và quy tắc nghiệp vụ trước khi đưa vào Profile.',
  };
}

