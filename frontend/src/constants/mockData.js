const MOCK_NAMES_KHCN = [
  'Nguyễn Văn Hùng', 'Trần Thị Mai', 'Lê Minh Triết', 'Phạm Hoàng Nam', 'Hoàng Thu Trang',
  'Bùi Minh Khôi', 'Vũ Hồng Vân', 'Dương Quốc Anh', 'Phan Thanh Thảo', 'Đỗ Trung Đức',
  'Nguyễn Thị Kim Chi', 'Lê Hữu Đạt', 'Trần Giang Nam', 'Phạm Minh Tuyết', 'Ngô Quốc Bảo',
  'Vũ Việt Dũng', 'Lý Thu Thảo', 'Đinh Công Thành', 'Hoàng Bảo Ngọc', 'Phan Văn Trị',
  'Trịnh Quốc Hoài', 'Đặng Thùy Linh', 'Mai Thanh Hải', 'Võ Hoài An', 'Nguyễn Bích Diệp',
  'Trần Anh Tuấn', 'Lê Hồng Nhung', 'Phạm Quốc Khánh', 'Bùi Ngọc Trâm', 'Vũ Đình Phong',
  'Hoàng Xuân Hợp', 'Đỗ Hải Yến', 'Nguyễn Mạnh Hùng', 'Trần Thị Thúy', 'Phạm Thế Anh',
  'Vũ Thu Hà', 'Lê Trường Giang', 'Bùi Phương Nam', 'Đỗ Ngọc Long', 'Hoàng Minh Châu'
];

const MOCK_NAMES_KHDN = [
  'CÔNG TY TNHH CƠ KHÍ CHÍNH XÁC AN BÌNH', 'CÔNG TY CP MAY MẶC XUẤT KHẨU HOÀNG GIA',
  'CÔNG TY TNHH ĐẦU TƯ & THƯƠNG MẠI TIẾN PHÁT', 'CÔNG TY CP NÔNG SẢN BẮC NINH',
  'CÔNG TY TNHH LOGISTICS HOÀN CẦU', 'CÔNG TY CP SẢN XUẤT BAO BÌ VĨNH PHÁT',
  'CÔNG TY TNHH DỊCH VỤ DU LỊCH BẢO MINH', 'CÔNG TY CP DƯỢC PHẨM ĐÔNG Á',
  'CÔNG TY CỔ PHẦN ĐẦU TƯ XÂY DỰNG KINH BẮC', 'CÔNG TY TNHH THƯƠNG MẠI DỊCH VỤ GIA HƯNG',
  'CÔNG TY TNHH SẢN XUẤT VÀ XNK MINH ANH', 'CÔNG TY CỔ PHẦN CÔNG NGHỆ CAO BẮC NINH'
];

const CAN_BO_LIST = [
  { ma_cb: 'CB01', ten_can_bo: 'Nguyễn Văn A' },
  { ma_cb: 'CB02', ten_can_bo: 'Lê Thị B' },
  { ma_cb: 'CB03', ten_can_bo: 'Phạm Văn C' },
  { ma_cb: 'CB04', ten_can_bo: 'Bùi Thị D' }
];

const LOAI_VAY_LIST = ['Ngắn hạn', 'Trung hạn', 'Dài hạn', 'Thấu chi', 'Tiêu dùng'];

// Hằng số 10 dòng đầu cứng để giữ các dữ liệu quan trọng trước đó
const BASE_MOCKS = [
  {
    ma_kh_chuan: 'KH001', ten_kh: 'CÔNG TY CP TẬP ĐOÀN ĐỈNH CAO', ma_cn: 'CN01', ma_pgd: 'PGD01', loai_khach_hang: 'KHDN',
    so_du_tien_vay: 12000000000, so_du_tien_gui_ckh: 5000000000, loai_vay: 'Ngắn hạn', doanh_so_chuyen_tien_ve_tai_khoan: 25000000000,
    so_du_tgtt_binh_quan: 800000000, ma_cb: 'CB01', ten_can_bo: 'Nguyễn Văn A', telephone: '0912345678',
    thau_chi: 1, e_banking: 1, sms_nhac_no_vay: 1, phan_mem_ban_hang: 1, pos: 1, thanh_toan_quoc_te: 1, phat_hanh_lc: 1, mua_ban_ngoai_te: 1,
  },
  {
    ma_kh_chuan: 'KH002', ten_kh: 'Trần Thị Thu Thủy', ma_cn: 'CN01', ma_pgd: 'PGD02', loai_khach_hang: 'KHCN',
    so_du_tien_vay: 4500000000, so_du_tien_gui_ckh: 0, loai_vay: 'Trung hạn', doanh_so_chuyen_tien_ve_tai_khoan: 0,
    so_du_tgtt_binh_quan: 150000000, ma_cb: 'CB02', ten_can_bo: 'Lê Thị B', telephone: '0988888888',
    tk_so_dep: 1, agribank_plus: 1, the_ghi_no_noi_dia: 1, the_td_quoc_te: 1, bh_oto_xe_may: 1,
  },
  {
    ma_kh_chuan: 'KH003', ten_kh: 'Lê Hoàng Long', ma_cn: 'CN02', ma_pgd: 'PGD03', loai_khach_hang: 'KHCN',
    so_du_tien_vay: 80000000, so_du_tien_gui_ckh: 120000000, loai_vay: 'Tiêu dùng', doanh_so_chuyen_tien_ve_tai_khoan: 10000000,
    so_du_tgtt_binh_quan: 5000000, ma_cb: 'CB03', ten_can_bo: 'Phạm Văn C', telephone: '0901234567',
    agribank_plus: 1, the_ghi_no_noi_dia: 1, tt_tien_dien: 1,
  },
  {
    ma_kh_chuan: 'KH004', ten_kh: 'CÔNG TY TNHH VẬN TẢI XANH', ma_cn: 'CN02', ma_pgd: 'PGD04', loai_khach_hang: 'KHDN',
    so_du_tien_vay: 500000000, so_du_tien_gui_ckh: 0, loai_vay: 'Ngắn hạn', doanh_so_chuyen_tien_ve_tai_khoan: 200000000,
    so_du_tgtt_binh_quan: 20000020, ma_cb: 'CB01', ten_can_bo: 'Nguyễn Văn A', telephone: '0944556677',
    e_banking: 1, the_ghi_no_noi_dia: 1,
  },
  {
    ma_kh_chuan: 'KH005', ten_kh: 'Hoàng Quốc Việt', ma_cn: 'CN03', ma_pgd: 'PGD05', loai_khach_hang: 'KHCN',
    so_du_tien_vay: 25000000, so_du_tien_gui_ckh: 0, loai_vay: 'Thấu chi', doanh_so_chuyen_tien_ve_tai_khoan: 5000000,
    so_du_tgtt_binh_quan: 200000, ma_cb: 'CB04', ten_can_bo: 'Bùi Thị D', telephone: '0977112233',
    agribank_plus: 1,
  },
  {
    ma_kh_chuan: 'KH006', ten_kh: 'Dương Mỹ Linh', ma_cn: 'CN03', ma_pgd: 'PGD06', loai_khach_hang: 'KHCN',
    so_du_tien_vay: 350000000, so_du_tien_gui_ckh: 0, loai_vay: 'Trung hạn', doanh_so_chuyen_tien_ve_tai_khoan: 0,
    so_du_tgtt_binh_quan: 0, ma_cb: 'CB04', ten_can_bo: 'Bùi Thị D', telephone: '0966554433',
  },
  {
    ma_kh_chuan: 'KH007', ten_kh: 'CỬA HÀNG ĐIỆN MÁY TUẤN TÀI', ma_cn: 'CN01', ma_pgd: 'PGD01', loai_khach_hang: 'KHDN',
    so_du_tien_vay: 1500000000, so_du_tien_gui_ckh: 300000000, loai_vay: 'Ngắn hạn', doanh_so_chuyen_tien_ve_tai_khoan: 400000000,
    so_du_tgtt_binh_quan: 45000000, ma_cb: 'CB02', ten_can_bo: 'Lê Thị B', telephone: '0933221100',
    e_banking: 1, sms_tien_gui: 1, pos: 1,
  },
  {
    ma_kh_chuan: 'KH008', ten_kh: 'Vũ Đức Đam', ma_cn: 'CN02', ma_pgd: 'PGD03', loai_khach_hang: 'KHCN',
    so_du_tien_vay: 100000000, so_du_tien_gui_ckh: 0, loai_vay: 'Dài hạn', doanh_so_chuyen_tien_ve_tai_khoan: 0,
    so_du_tgtt_binh_quan: 1000000, ma_cb: 'CB03', ten_can_bo: 'Phạm Văn C', telephone: '0922446688',
  },
  {
    ma_kh_chuan: 'KH009', ten_kh: 'Đỗ Thị Quyên', ma_cn: 'CN01', ma_pgd: 'PGD02', loai_khach_hang: 'KHCN',
    so_du_tien_vay: 50000000, so_du_tien_gui_ckh: 0, loai_vay: 'Ngắn hạn', doanh_so_chuyen_tien_ve_tai_khoan: 0,
    so_du_tgtt_binh_quan: 500000, ma_cb: 'CB02', ten_can_bo: 'Lê Thị B', telephone: '0911335577',
    sms_nhac_no_vay: 1,
  },
  {
    ma_kh_chuan: 'KH010', ten_kh: 'CÔNG TY XNK TOÀN CẦU', ma_cn: 'CN03', ma_pgd: 'PGD05', loai_khach_hang: 'KHDN',
    so_du_tien_vay: 8500000000, so_du_tien_gui_ckh: 2000000000, loai_vay: 'Ngắn hạn', doanh_so_chuyen_tien_ve_tai_khoan: 15000000000,
    so_du_tgtt_binh_quan: 600000000, ma_cb: 'CB04', ten_can_bo: 'Bùi Thị D', telephone: '0955998877',
    e_banking: 1, thanh_toan_quoc_te: 1, phat_hanh_lc: 1, bao_lanh: 1, chi_tra_kieu_hoi: 1, tk_so_dep: 1, tra_luong_qua_the: 1,
  }
];

const generateMockRows = () => {
  const list = [...BASE_MOCKS];

  for (let i = 11; i <= 100; i++) {
    const isDN = i % 4 === 0; // 25% doanh nghiệp
    const rawName = isDN 
      ? MOCK_NAMES_KHDN[i % MOCK_NAMES_KHDN.length] 
      : MOCK_NAMES_KHCN[i % MOCK_NAMES_KHCN.length];
    
    // Thêm hậu tố để phân biệt
    const name = `${rawName} (Demo ${i})`;

    const canBo = CAN_BO_LIST[i % CAN_BO_LIST.length];
    const cnCode = `CN0${(i % 3) + 1}`;
    const pgdCode = `PGD0${(i % 6) + 1}`;
    
    const hasVay = i % 7 !== 0; // 85% có vay
    // Giá trị dư nợ dao động thực tế (từ vài chục triệu tới vài tỷ)
    const loanAmt = hasVay ? Math.floor(100 + (i * i * 3.7) % 4500) * 1000000 : 0;
    
    const hasDeposit = i % 5 === 0;
    const depAmt = hasDeposit ? Math.floor(20 + (i * 19.3) % 2000) * 1000000 : 0;

    const hasCASA = i % 3 !== 0;
    const casaAmt = hasCASA ? Math.floor(1 + (i * 13.7) % 150) * 1000000 : 0;

    const row = {
      ma_kh_chuan: `KH${String(i).padStart(3, '0')}`,
      ten_kh: name,
      ma_cn: cnCode,
      ma_pgd: pgdCode,
      loai_khach_hang: isDN ? 'KHDN' : 'KHCN',
      so_du_tien_vay: loanAmt,
      so_du_tien_gui_ckh: depAmt,
      loai_vay: hasVay ? LOAI_VAY_LIST[i % LOAI_VAY_LIST.length] : null,
      doanh_so_chuyen_tien_ve_tai_khoan: isDN ? Math.floor(loanAmt * 1.2) : 0,
      so_du_tgtt_binh_quan: casaAmt,
      ma_cb: canBo.ma_cb,
      ten_can_bo: canBo.ten_can_bo,
      telephone: `09${String(87654321 + (i * 97) % 9999999).padStart(8, '0')}`,
      // Sử dụng sản phẩm (dựa trên bitmask chia dư của chỉ số)
      thau_chi: (hasVay && i % 8 === 0) ? 1 : 0,
      tk_so_dep: (i % 6 === 0) ? 1 : 0,
      agribank_plus: (i % 3 !== 0) ? 1 : 0, 
      tin_nhan_ott: (i % 9 === 0) ? 1 : 0,
      sms_nhac_no_vay: (hasVay && i % 2 === 0) ? 1 : 0,
      sms_tien_gui: (depAmt > 0 && i % 3 === 0) ? 1 : 0,
      the_ghi_no_noi_dia: (i % 2 === 0) ? 1 : 0,
      the_td_quoc_te: (isDN || i % 7 === 0) ? 1 : 0,
      pos: (isDN && i % 2 === 0) ? 1 : 0,
    };

    list.push(row);
  }
  return list;
};

export const MOCK_ROWS = generateMockRows();
