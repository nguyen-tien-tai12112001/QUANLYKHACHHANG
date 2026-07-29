const rows = [
  ['MCN', 'Mã IPCAS chi nhánh', 'Thông tin KH', 'C', 'CIF', 1],
  ['MPGD', 'Mã IPCAS phòng giao dịch', 'Thông tin KH', 'C', 'CIF', 1],
  ['MKH', 'Mã khách hàng trên IPCAS', 'Thông tin KH', 'C', 'CIF', 1],
  ['TENKH', 'Tên khách hàng', 'Thông tin KH', 'C', 'CIF', 1],
  ['TEN_CHUDN', 'Tên người đại diện/chủ doanh nghiệp', 'Thông tin KH', 'C', 'MSPL06', 2],
  ['CCCD', 'Số CCCD hoặc hộ chiếu', 'Thông tin KH', 'C', 'CIF', 1],
  ['MST', 'Mã số thuế', 'Thông tin KH', 'C', 'CIF', 1],
  ['NGAY_THANHLAP', 'Ngày thành lập doanh nghiệp/tổ chức', 'Thông tin KH', 'D', 'CIF', 1],
  ['DIACHI', 'Địa chỉ khách hàng', 'Thông tin KH', 'C', 'CIF', 1],
  ['LOAIKH', 'Loại khách hàng IPCAS', 'Thông tin KH', 'N', 'CIF', 1],
  ['PHAN_LOAIKH', 'Phân khúc khách hàng', 'Thông tin KH', 'C', 'MSPL06', 2],
  ['GIOITINH', 'Giới tính khách hàng cá nhân', 'Thông tin KH', 'C', 'CIF', 1],
  ['NAM_SINH', 'Ngày sinh khách hàng cá nhân', 'Thông tin KH', 'D', 'CIF', 1],
  ['NGHE NGHIEP', 'Nghề nghiệp/ngành nghề kinh doanh', 'Thông tin KH', 'C', 'CIF', 1],
  ['DIEN_THOAI', 'Số điện thoại liên hệ', 'Thông tin KH', 'C', 'CIF/MSPL06', 2],
  ['MACB', 'Mã cán bộ quản lý khách hàng', 'Thông tin KH', 'C', 'CIF', null],
  ['TENCB', 'Tên cán bộ quản lý khách hàng', 'Thông tin KH', 'C', 'CIF', null],

  ['NGAY_UPDATE', 'Ngày giao dịch gần nhất trên TKTT', 'Tiền gửi', 'D', 'DP01', null],
  ['TKTT1', 'Tài khoản thanh toán chính thứ nhất', 'Tiền gửi', 'C', 'DP01', 2],
  ['TKTT2', 'Tài khoản thanh toán chính thứ hai', 'Tiền gửi', 'C', 'DP01', 2],
  ['TKTT3', 'Tài khoản thanh toán chính thứ ba', 'Tiền gửi', 'C', 'DP01', 2],
  ['SODU_TKTT', 'Số dư tiền gửi thanh toán cuối kỳ', 'Tiền gửi', 'N', 'PF14', 1],
  ['SODU_TKTTBQ', 'Số dư tiền gửi thanh toán bình quân', 'Tiền gửi', 'N', 'PF14', 1],
  ['DS_TKTT', 'Doanh số chuyển tiền đến tài khoản', 'Tiền gửi', 'N', 'DP01', 4],
  ['SODU_TGCKH', 'Số dư tiền gửi có kỳ hạn', 'Tiền gửi', 'N', 'PF14', 1],
  ['SODU_TGCKHBQ', 'Tiền gửi có kỳ hạn bình quân', 'Tiền gửi', 'N', 'PF14', 1],
  ['FTP_NGUONVON', 'Lợi ích FTP từ huy động vốn', 'Tiền gửi', 'N', 'FTP', 4],
  ['TKSODEP', 'Sử dụng tài khoản số đẹp', 'Tiền gửi', 'L', 'CN05', 1],
  ['CN_TRALUONG', 'Cá nhân nhận lương qua tài khoản', 'Tiền gửi', 'L', 'CSSO01', 2],
  ['PN_TRALUONG', 'Pháp nhân trả lương qua tài khoản', 'Tiền gửi', 'L', 'DP01/CSSO01', 1],
  ['LOATHANTAI', 'Sử dụng Loa thần tài', 'Tiền gửi', 'L', 'OABE', 1],
  ['HKD_TK', 'Tài khoản hộ kinh doanh', 'Tiền gửi', 'L', 'DP01', 1],
  ['HKD_ETAX', 'Phần mềm bán hàng/E-Tax Mobile', 'Tiền gửi', 'L', 'Chưa chốt', 4],

  ['DS_LC', 'Doanh số thanh toán LC trong tháng', 'Tiền vay', 'N', 'LN/TTQT', null],
  ['DUNO_NHTT', 'Dư nợ ngắn hạn thông thường', 'Tiền vay', 'N', 'PF10', null],
  ['DUNO_NHTTBQ', 'Dư nợ ngắn hạn bình quân', 'Tiền vay', 'N', 'PF10', null],
  ['DUNO_TDHTT', 'Dư nợ trung dài hạn thông thường', 'Tiền vay', 'N', 'PF10', null],
  ['DUNO_TDHTTBQ', 'Dư nợ trung dài hạn bình quân', 'Tiền vay', 'N', 'PF10', null],
  ['DUNO_TC', 'Dư nợ thấu chi cuối kỳ', 'Tiền vay', 'N', 'PF10', null],
  ['DUNO_TCBQ', 'Dư nợ thấu chi bình quân', 'Tiền vay', 'N', 'PF10', null],
  ['DUNO_XAU', 'Dư nợ nhóm 3, 4, 5', 'Tiền vay', 'N', 'LN01', null],
  ['DUNO_XAUBQ', 'Dư nợ xấu bình quân', 'Tiền vay', 'N', 'LN01', null],
  ['DUNO_XLRR', 'Dư nợ xử lý rủi ro', 'Tiền vay', 'N', 'LN01', null],
  ['DUNO_XLRRBQ', 'Dư nợ XLRR bình quân', 'Tiền vay', 'N', 'LN01', null],
  ['DPRR_TT', 'Dự phòng rủi ro trong tháng', 'Tiền vay', 'N', 'LN01', null],
  ['DPRR_LK', 'Dự phòng rủi ro lũy kế', 'Tiền vay', 'N', 'LN01', null],
  ['FTP_DUNO', 'Lợi ích FTP từ dư nợ', 'Tiền vay', 'N', 'FTP', null],

  ['DS_TTQT', 'Doanh số thanh toán quốc tế', 'KDNH', 'N', 'TTQT', null],
  ['KIEUHOI', 'Sử dụng dịch vụ chi trả kiều hối', 'KDNH', 'L', 'KDNH', null],
  ['TTQT', 'Sử dụng LC/TTQT/mua bán ngoại tệ', 'KDNH', 'L', 'KDNH', null],

  ['PHI_BAOLANH', 'Phí bảo lãnh', 'Phí thu được', 'N', 'PHI', null],
  ['PHI_CHUYENTIEN', 'Phí chuyển tiền', 'Phí thu được', 'N', 'PHI', null],
  ['PHI_KDNT', 'Phí/lãi mua bán ngoại tệ', 'Phí thu được', 'N', 'PHI', null],
  ['PHI_TTQT', 'Phí thanh toán quốc tế', 'Phí thu được', 'N', 'PHI', null],
  ['PHI_LC', 'Phí LC', 'Phí thu được', 'N', 'PHI', null],
  ['PHI_NHDT', 'Phí ngân hàng điện tử', 'Phí thu được', 'N', 'PHI', null],
  ['PHI_THE', 'Phí dịch vụ thẻ', 'Phí thu được', 'N', 'PHI', null],
  ['PHI_POS', 'Phí đơn vị chấp nhận thẻ', 'Phí thu được', 'N', 'PHI', null],
  ['PHI_KHAC', 'Các loại phí dịch vụ khác', 'Phí thu được', 'N', 'PHI', null],

  ['AGRIBANKPLUS', 'Agribank Plus', 'SPDV NHĐT', 'L', 'CN05', 1],
  ['OTT', 'Dịch vụ OTT', 'SPDV NHĐT', 'L', 'CN05', 1],
  ['EBANKING', 'E-Banking', 'SPDV NHĐT', 'L', 'CN05', 1],
  ['SMS_TKTV', 'SMS nhắc nợ vay', 'SPDV NHĐT', 'L', 'CN05', 1],
  ['SMS_TKTG', 'SMS nhắc tiền gửi', 'SPDV NHĐT', 'L', 'CN05', 1],

  ['THE_GNND', 'Thẻ ghi nợ nội địa', 'SP Thẻ', 'L', 'CN05', 1],
  ['THE_LOCVIET', 'Thẻ Lộc Việt', 'SP Thẻ', 'L', 'CN05', 1],
  ['THE_GNQT', 'Thẻ ghi nợ quốc tế', 'SP Thẻ', 'L', 'CN05', 1],
  ['THE_TDQT', 'Thẻ tín dụng quốc tế', 'SP Thẻ', 'L', 'CN05', 1],
  ['DS_TTPOS', 'Doanh số thanh toán POS', 'SP Thẻ', 'N', 'POS', 3],
  ['POS', 'Đơn vị chấp nhận thẻ POS', 'SP Thẻ', 'L', 'KHCN', 1],

  ['THUHO_DIEN', 'Thu hộ tiền điện', 'Bill Payment', 'L', 'Bill Payment', 3],
  ['THUHO_NUOC', 'Thu hộ tiền nước', 'Bill Payment', 'L', 'Bill Payment', 3],
  ['THUHO_DT', 'Thu hộ cước viễn thông', 'Bill Payment', 'L', 'Bill Payment', 4],
  ['THUHO_HOCPHI', 'Thu hộ học phí', 'Bill Payment', 'L', 'KHCN', 1],
  ['THUHO_VIENPHI', 'Thu hộ viện phí', 'Bill Payment', 'L', 'KHCN', 1],

  ['ABIC_BATD', 'Bảo an tín dụng', 'ABIC', 'L', 'KH02', 1],
  ['ABIC_BATK', 'Bảo an tài khoản', 'ABIC', 'L', 'ABIC', 1],
  ['ABIC_BATHE', 'Bảo an chủ thẻ', 'ABIC', 'L', 'ABIC', 3],
  ['ABIC_BHTS', 'Bảo hiểm tài sản', 'ABIC', 'L', 'ABIC', 5],
  ['ABIC_BHPC', 'Bảo hiểm cháy nổ', 'ABIC', 'L', 'ABIC', 5],
  ['ABIC_BHXM', 'Bảo hiểm xe máy', 'ABIC', 'L', 'ABIC', 5],
  ['ABIC_BHOTO', 'Bảo hiểm ô tô', 'ABIC', 'L', 'ABIC', 5],
  ['ABIC_BHNHAO', 'Bảo hiểm nhà ở', 'ABIC', 'L', 'ABIC', 5],
  ['ABIC_BHYT', 'Bảo hiểm y tế/sức khỏe', 'ABIC', 'L', 'ABIC', 5],
];

const typeNames = { C: 'Chuỗi', D: 'Ngày', N: 'Số', L: 'Có/không' };
const statusNames = {
  1: 'Xác định rõ ràng',
  2: 'Đang lựa chọn PA',
  3: 'Đang nghiên cứu',
  4: 'Cần hỏi nghiệp vụ',
  5: 'Khó xác định',
};

export const fieldDictionary = rows.map(([code, label, group, type, source, status], index) => ({
  order: index + 1,
  code,
  label,
  group,
  type,
  typeName: typeNames[type],
  source,
  status,
  statusName: statusNames[status] || 'Chưa đánh giá',
  targetTable: group === 'Thông tin KH'
    ? 'customers'
    : `customer_period_${group
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')}`,
  nullable: status !== 1,
}));

export const fieldGroups = [...new Set(fieldDictionary.map((item) => item.group))];

export const determinationStatuses = [
  { value: 'all', label: 'Tất cả trạng thái' },
  ...Object.entries(statusNames).map(([value, label]) => ({ value: Number(value), label })),
  { value: 'unrated', label: 'Chưa đánh giá' },
];
