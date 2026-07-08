# Báo cáo - Chi tiết khách hàng theo chi nhánh/PGD

## 1. Mục tiêu

Trang báo cáo vẫn giữ nguyên nguyên tắc:

```text
1 khách hàng = 1 dòng tổng hợp
```

Khi bấm vào tên khách hàng, modal chi tiết sẽ hiển thị thông tin tổng quan của khách hàng. Bổ sung thêm khối:

```text
Chi tiết theo chi nhánh / PGD
```

Mục tiêu là xem rõ khách hàng đó:

- Vay ở chi nhánh/PGD nào.
- Gửi tiền ở chi nhánh/PGD nào.
- Có TGTT bình quân ở chi nhánh/PGD nào.
- Phát sinh doanh số CR/DR ở đâu.
- Đang dùng dịch vụ nào tại từng chi nhánh/PGD.

## 2. Logic hiển thị

Bên ngoài báo cáo:

```text
Mã KH 123456789 chỉ hiển thị 1 dòng tổng hợp.
```

Trong modal chi tiết:

```text
Khách hàng
  ├─ Chi nhánh 2600 / PGD A
  │  ├─ Dư nợ vay
  │  ├─ Loại vay
  │  ├─ Tiền gửi CKH
  │  ├─ TGTT bình quân
  │  ├─ Doanh số CR/DR
  │  └─ Dịch vụ đang dùng
  │
  ├─ Chi nhánh 2602 / PGD B
  │  ├─ Dư nợ vay
  │  ├─ Tiền gửi CKH
  │  └─ Dịch vụ đang dùng
  │
  └─ ...
```

Như vậy người dùng nhìn được tổng thể ở bảng báo cáo, nhưng vẫn drill-down được xuống từng chi nhánh/PGD khi cần.

## 3. API sử dụng

Frontend gọi API:

```http
GET /api/customer-processing/branch-details
```

Tham số:

```text
period_key: kỳ dữ liệu đang xem
ma_kh: mã khách hàng gốc
```

Ví dụ:

```http
GET /api/customer-processing/branch-details?period_key=20260630&ma_kh=123456789
```

API trả về danh sách dòng theo từng chi nhánh/PGD từ bảng:

```text
CustomerPeriodBranchDetail
```

Các trường quan trọng:

```text
branch_code
ma_pgd
ten_pgd
so_du_tien_gui
doanh_so_cramt
doanh_so_dramt
so_du_tien_vay
loai_vay
so_du_tgtt_binh_quan
thau_chi
tk_so_dep
agribank_plus
tin_nhan_ott
sms_nhac_no_vay
sms_tien_gui
the_ghi_no_noi_dia
the_td_quoc_te
the_td_loc_viet
```

## 4. Thay đổi frontend

File sửa:

```text
frontend/src/pages/CustomerReport.jsx
frontend/src/styles.css
```

Trong modal chi tiết khách hàng, thêm component:

```text
BranchDetailSection
```

Component này:

1. Hiển thị nút `Xem chi tiết`.
2. Khi bấm nút thì gọi API `branch-details`.
3. Hiển thị bảng chi tiết theo chi nhánh/PGD.
4. Hiển thị tổng nhanh:
   - Dư nợ.
   - Tiền gửi CKH.
   - TGTT bình quân.
5. Hiển thị dịch vụ đang dùng theo từng chi nhánh.

## 5. Giao diện mới trong modal

Trong modal chi tiết khách hàng có thêm card:

```text
Chi tiết theo chi nhánh / PGD
```

Bảng gồm các cột:

```text
Chi nhánh / PGD
Dư nợ vay
Loại vay
Tiền gửi CKH
TGTT bình quân
Doanh số CR
Doanh số DR
Dịch vụ tại chi nhánh
```

Nếu PGD có tên, giao diện hiển thị tên PGD thay vì chỉ mã.

Nếu thiếu PGD, hiển thị:

```text
Chưa có PGD
```

## 6. Cách test

### 6.1. Chạy backend

```powershell
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 6.2. Chạy frontend

```powershell
cd frontend
npm run dev -- --host 0.0.0.0 --port 3000
```

### 6.3. Test trên giao diện

1. Mở trang báo cáo.
2. Chọn kỳ dữ liệu đã xử lý.
3. Bấm vào tên một khách hàng.
4. Trong modal chi tiết, bấm:

```text
Xem chi tiết
```

5. Kiểm tra bảng chi tiết theo chi nhánh/PGD.

### 6.4. Test API trực tiếp

Ví dụ:

```http
http://localhost:8000/api/customer-processing/branch-details?period_key=20260630&ma_kh=123456789
```

Kết quả kỳ vọng:

- Trả về danh sách chi nhánh/PGD của khách hàng.
- Có số dư vay/gửi/TGTT theo từng điểm phát sinh.
- Có thông tin dịch vụ theo từng điểm phát sinh.

## 7. Lưu ý

- Dữ liệu tổng hợp bên ngoài báo cáo lấy theo khách hàng.
- Dữ liệu trong modal chi tiết lấy theo chi nhánh/PGD.
- Nếu khách hàng dùng dịch vụ ở nhiều chi nhánh, bảng chi tiết sẽ giúp phân biệt rõ phát sinh nằm ở đâu.
- Nếu tên PGD thiếu trong nguồn dữ liệu, hệ thống fallback sang mã PGD hoặc `Chưa có PGD`.

## 8. Gợi ý phát triển tiếp

Nên bổ sung tiếp:

- Tab riêng `Khoản vay` liệt kê từng khoản vay từ LN01 nếu cần chi tiết hơn.
- Tab riêng `Tiền gửi` liệt kê tài khoản/từng loại tiền gửi nếu cần.
- Tab riêng `Dịch vụ` hiển thị dịch vụ theo chi nhánh dưới dạng ma trận.
- Nút xuất Excel riêng cho chi tiết khách hàng.
- Lịch sử so sánh khách hàng đó qua nhiều kỳ.
