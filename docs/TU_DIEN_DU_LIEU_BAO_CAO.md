# Từ điển dữ liệu báo cáo C360

Tài liệu này mô tả các trường dữ liệu đang hiển thị trên Dashboard, trang Báo cáo khách hàng và modal Chi tiết khách hàng.

Mục tiêu:

- Biết mỗi trường hiển thị lấy từ bảng nào trong DB.
- Biết cột DB tương ứng.
- Biết cột/file nguồn ban đầu.
- Biết trường nào là dữ liệu tổng hợp, trường nào là dữ liệu chi tiết theo chi nhánh/PGD.

## 1. Luồng dữ liệu tổng quát

```text
File CSV/Excel import
  ├─ DP01: thông tin khách hàng, tiền gửi, doanh số DR/CR
  ├─ LN01: dư nợ vay, loại vay, cán bộ quản lý
  ├─ PF14: tiền gửi CKH, TGTT bình quân
  └─ CN05: dịch vụ khách hàng đang sử dụng

        ↓ Import vào DB raw/staging

customer_processing.py xử lý theo kỳ

        ↓

customer_period_branch_details
  Dữ liệu chi tiết theo từng khách hàng + chi nhánh + PGD

        ↓ Tổng hợp theo MA_KH

customer_period_profiles
  Dữ liệu 1 khách hàng = 1 dòng dùng cho Dashboard/Báo cáo
```

## 2. Bảng DB chính

### 2.1. `customer_period_profiles`

Bảng tổng hợp theo khách hàng trong một kỳ dữ liệu.

Quy tắc:

```text
1 period_key + 1 ma_kh = 1 dòng
```

Bảng này dùng cho:

- Trang Báo cáo khách hàng.
- Dashboard tổng hợp.
- Bộ lọc báo cáo.
- Modal chi tiết khách hàng phần tổng quan.

Model backend:

```text
backend/app/models.py
class CustomerPeriodProfile
```

### 2.2. `customer_period_branch_details`

Bảng chi tiết theo khách hàng, chi nhánh và PGD.

Quy tắc:

```text
1 period_key + 1 ma_kh + 1 branch_code + 1 ma_pgd = 1 dòng
```

Bảng này dùng cho:

- Modal chi tiết khách hàng.
- Khối `Chi tiết theo chi nhánh / PGD`.

Model backend:

```text
backend/app/models.py
class CustomerPeriodBranchDetail
```

### 2.3. Các bảng import nguồn

Tùy theo luồng import hiện tại, dữ liệu file nguồn được đưa vào các bảng raw/staging tương ứng với loại file:

```text
DP01 -> dữ liệu tiền gửi/thông tin KH
LN01 -> dữ liệu khoản vay
PF14 -> dữ liệu số dư bình quân/tiền gửi CKH
CN05 -> dữ liệu dịch vụ
```

Logic xử lý chính nằm tại:

```text
backend/app/customer_processing.py
```

## 3. Mapping trường tổng hợp trên trang Báo cáo

| Trường hiển thị | Frontend field | Bảng DB | Cột DB | File nguồn | Cột nguồn | Logic |
|---|---|---|---|---|---|---|
| Kỳ dữ liệu | `period_key` | `customer_period_profiles` | `period_key` | Tên file import | `yyyymmdd` trong tên file | Ví dụ `20260630` |
| Mã khách hàng | `ma_kh_chuan` / `ma_kh` | `customer_period_profiles` | `ma_kh` | DP01 | `MA_KH` | Mã KH gốc, gom toàn hệ thống theo MA_KH |
| Tên khách hàng | `ten_kh` | `customer_period_profiles` | `ten_kh` | DP01 | `TEN_KH` | Lấy từ DP01 |
| Loại khách hàng | `loai_khach_hang` | `customer_period_profiles` | `loai_khach_hang` | DP01 | `CUST_TYPE_NAME` | Cá nhân/doanh nghiệp hoặc tên loại KH từ DP01 |
| Mã chi nhánh | `ma_cn` | `customer_period_profiles` | `branch_codes` | DP01/LN01/PF14/CN05 | `MA_CN`, `BRCD`, `TRBRCD` | Ghép danh sách chi nhánh phát sinh |
| PGD | `ma_pgd` | `customer_period_profiles` | `pgd_codes` | DP01 | `MA_PGD`, `TEN_PGD` | Dạng `branch:pgd`, frontend hiển thị tên PGD nếu có |
| Số chi nhánh phát sinh | `branch_count` | `customer_period_profiles` | `branch_count` | Tổng hợp | Từ `branch_codes` | Đếm số chi nhánh khác nhau |
| Số PGD phát sinh | `pgd_count` | `customer_period_profiles` | `pgd_count` | Tổng hợp | Từ `pgd_codes` | Đếm số PGD khác nhau |
| Số dư tiền gửi CKH | `so_du_tien_gui_ckh` | `customer_period_profiles` | `so_du_tien_gui` | PF14 | `MONTHLYENDBALANCE`, `MONTERM`, `CCY` | Sum dòng `MONTERM > 0`, quy đổi theo tỷ giá |
| Số dư tiền vay | `so_du_tien_vay` | `customer_period_profiles` | `so_du_tien_vay` | LN01 | `DU_NO` | Sum dư nợ theo `CUSTSEQ` |
| Loại vay | `loai_vay` | `customer_period_profiles` | `loai_vay` | LN01 | `LOAN_TYPE` | Map loại vay sang Thấu chi/Ngắn/Trung/Dài rồi ghép `/` |
| TGTT bình quân | `so_du_tgtt_binh_quan` | `customer_period_profiles` | `so_du_tgtt_binh_quan` | PF14 | `AVERAGEBALANCE`, `MONTERM`, `CCY` | Sum dòng `MONTERM = 0`, quy đổi theo tỷ giá |
| Doanh số chuyển tiền về TK | `doanh_so_chuyen_tien_ve_tai_khoan` | `customer_period_profiles` | `doanh_so_chuyen_tien_ve_tk` | DP01 | `CRAMT` | Sum CRAMT theo khách hàng |
| Cán bộ quản lý | `ten_can_bo` | `customer_period_profiles` | `ten_can_bo` | LN01 | `OFFICER_NAME` | Nếu nhiều cán bộ, lấy cán bộ khoản vay có `DU_NO` lớn nhất |
| Mã cán bộ | `ma_cb` | `customer_period_profiles` | `ma_cb` | LN01 | `OFFICER_IPCAS` | Đi cùng cán bộ quản lý chính |
| Số điện thoại | `telephone` | `customer_period_profiles` | `telephone` | DP01 | `TELEPHONE` | Lấy từ DP01 |

## 4. Mapping dịch vụ từ CN05

Các trường dịch vụ đang dùng trên Báo cáo/Dashboard.

Quy tắc:

```text
1 = khách hàng có dùng dịch vụ
0 = chưa ghi nhận dùng dịch vụ
```

| Dịch vụ hiển thị | Frontend field | Bảng DB | Cột DB | File nguồn | Cột nguồn | Logic |
|---|---|---|---|---|---|---|
| Thấu chi | `thau_chi` | `customer_period_profiles` | `thau_chi` | LN01 | `LOAN_TYPE` | Có `Thấu chi trên TK khách hàng` thì = 1 |
| TK số đẹp | `tk_so_dep` | `customer_period_profiles` | `tk_so_dep` | CN05 | `TKTT_TK_SODEP` | Có giá trị `1` thì = 1 |
| Agribank Plus | `agribank_plus` | `customer_period_profiles` | `agribank_plus` | CN05 | `DK_AGRIBANK_PLUS` | Có giá trị `1` thì = 1 |
| Tin nhắn OTT | `tin_nhan_ott` | `customer_period_profiles` | `tin_nhan_ott` | CN05 | `DK_AGRIBANK_PLUS_OTT` | Có giá trị `1` thì = 1 |
| SMS nhắc nợ vay | `sms_nhac_no_vay` | `customer_period_profiles` | `sms_nhac_no_vay` | CN05 | `VV_SMS_TIEN_VAY` | Có giá trị `1` thì = 1 |
| SMS tiền gửi | `sms_tien_gui` | `customer_period_profiles` | `sms_tien_gui` | CN05 | `TG_SMS_TIEN_GUI` | Có giá trị `1` thì = 1 |
| Thẻ ghi nợ nội địa | `the_ghi_no_noi_dia` | `customer_period_profiles` | `the_ghi_no_noi_dia` | CN05 | `THE_GHI_NO_NOI_DIA` | Có giá trị `1` thì = 1 |
| Thẻ tín dụng quốc tế | `the_td_quoc_te` | `customer_period_profiles` | `the_td_quoc_te` | CN05 | `THE_TIN_DUNG_QUOC_TE` | Có giá trị `1` thì = 1 |
| Thẻ tín dụng Lộc Việt | `the_td_loc_viet` | `customer_period_profiles` | `the_td_loc_viet` | CN05 | `THE_TIN_DUNG_NOI_DIA` | Có giá trị `1` thì = 1 |
| Thẻ tín dụng nội địa | `the_td_noi_dia` | `customer_period_profiles` | `the_td_noi_dia` | CN05 | Chưa chốt | Hiện có cột DB, logic có thể bổ sung sau |

## 5. Các trường đang chờ dữ liệu

Các trường này đang hiển thị dạng `Chờ DL` hoặc chưa có logic lấy chính thức:

| Trường | Frontend field | Trạng thái |
|---|---|---|
| e-Banking | `e_banking` | Chờ xác định cột nguồn |
| Thanh toán tiền điện | `tt_tien_dien` | Chờ xác định cột nguồn |
| Thanh toán tiền nước | `tt_tien_nuoc` | Chờ xác định cột nguồn |
| Thanh toán cước viễn thông | `tt_cuoc_vien_thong` | Chờ xác định cột nguồn |
| Trả lương qua thẻ | `tra_luong_qua_the` | Chờ xác định cột nguồn |
| BATD | `batd` | Chờ xác định cột nguồn |
| BATK | `batk` | Chờ xác định cột nguồn |
| BH ô tô, xe máy | `bh_oto_xe_may` | Chờ xác định cột nguồn |
| BH khác | `bh_khac` | Chờ xác định cột nguồn |
| Bảo lãnh | `bao_lanh` | Chờ xác định cột nguồn |
| Loa biến động số dư | `loa_bien_dong_so_du` | Chờ xác định cột nguồn |
| Phần mềm bán hàng | `phan_mem_ban_hang` | Chờ xác định cột nguồn |
| POS | `pos` | Chờ xác định cột nguồn |
| Chi trả kiều hối | `chi_tra_kieu_hoi` | Chờ xác định cột nguồn |
| Phát hành LC | `phat_hanh_lc` | Chờ xác định cột nguồn |
| Thanh toán quốc tế | `thanh_toan_quoc_te` | Chờ xác định cột nguồn |
| Mua bán ngoại tệ | `mua_ban_ngoai_te` | Chờ xác định cột nguồn |

## 6. Mapping chi tiết theo chi nhánh/PGD

Khối `Chi tiết theo chi nhánh / PGD` trong modal khách hàng dùng bảng:

```text
customer_period_branch_details
```

API:

```http
GET /api/customer-processing/branch-details?period_key=...&ma_kh=...
```

| Trường hiển thị | Frontend field | Bảng DB | Cột DB | File nguồn | Cột nguồn | Logic |
|---|---|---|---|---|---|---|
| Chi nhánh | `branch_code` | `customer_period_branch_details` | `branch_code` | DP01/LN01/PF14/CN05 | `MA_CN`, `BRCD`, `TRBRCD` | Mã chi nhánh phát sinh |
| PGD | `ma_pgd` | `customer_period_branch_details` | `ma_pgd` | DP01 | `MA_PGD` | Mã PGD phát sinh |
| Tên PGD | `ten_pgd` | `customer_period_branch_details` | `ten_pgd` | DP01 hoặc cấu hình phòng ban | `TEN_PGD` | Ưu tiên tên trong DP01, fallback cấu hình phòng ban |
| Tên KH | `ten_kh` | `customer_period_branch_details` | `ten_kh` | DP01 | `TEN_KH` | Tên KH tại chi nhánh/PGD |
| Loại KH | `loai_khach_hang` | `customer_period_branch_details` | `loai_khach_hang` | DP01 | `CUST_TYPE_NAME` | Loại KH |
| Số dòng DP01 | `dp_record_count` | `customer_period_branch_details` | `dp_record_count` | DP01 | Số record | Đếm số record DP tại chi nhánh/PGD |
| Tiền gửi CKH | `so_du_tien_gui` | `customer_period_branch_details` | `so_du_tien_gui` | PF14 | `MONTHLYENDBALANCE`, `MONTERM` | Sum CKH theo chi nhánh/PGD |
| Doanh số CR | `doanh_so_cramt` | `customer_period_branch_details` | `doanh_so_cramt` | DP01 | `CRAMT` | Sum CRAMT theo chi nhánh/PGD |
| Doanh số DR | `doanh_so_dramt` | `customer_period_branch_details` | `doanh_so_dramt` | DP01 | `DRAMT` | Sum DRAMT theo chi nhánh/PGD |
| Dư nợ vay | `so_du_tien_vay` | `customer_period_branch_details` | `so_du_tien_vay` | LN01 | `DU_NO` | Sum dư nợ theo chi nhánh/PGD |
| Loại vay | `loai_vay` | `customer_period_branch_details` | `loai_vay` | LN01 | `LOAN_TYPE` | Map/gộp loại vay tại chi nhánh/PGD |
| TGTT bình quân | `so_du_tgtt_binh_quan` | `customer_period_branch_details` | `so_du_tgtt_binh_quan` | PF14 | `AVERAGEBALANCE`, `MONTERM` | Sum TGTT BQ theo chi nhánh/PGD |
| Mã cán bộ | `ma_cb` | `customer_period_branch_details` | `ma_cb` | LN01 | `OFFICER_IPCAS` | Cán bộ quản lý khoản vay tại chi nhánh |
| Tên cán bộ | `ten_can_bo` | `customer_period_branch_details` | `ten_can_bo` | LN01 | `OFFICER_NAME` | Tên cán bộ quản lý |
| Dịch vụ tại chi nhánh | các field dịch vụ | `customer_period_branch_details` | các cột dịch vụ | CN05/LN01 | các cột dịch vụ | Hiển thị các dịch vụ = 1 tại chi nhánh/PGD đó |

## 7. Mapping Dashboard

Dashboard dùng API:

```http
GET /api/dashboard/summary
GET /api/dashboard/trends
```

Nguồn DB chính:

```text
customer_period_profiles
```

| Chỉ số Dashboard | API field | Bảng DB | Cột DB/logic | File nguồn |
|---|---|---|---|---|
| Tổng khách hàng | `kpis.total_customers` | `customer_period_profiles` | `COUNT(id)` | Tổng hợp từ DP01 |
| Tổng dư nợ | `kpis.total_loan` | `customer_period_profiles` | `SUM(so_du_tien_vay)` | LN01 |
| Tổng tiền gửi CKH | `kpis.total_deposit` | `customer_period_profiles` | `SUM(so_du_tien_gui)` | PF14 |
| TGTT bình quân | `kpis.total_casa` | `customer_period_profiles` | `SUM(so_du_tgtt_binh_quan)` | PF14 |
| KH chưa dùng DV nào | `kpis.no_service_count` | `customer_period_profiles` | Tất cả service active = 0 | CN05/LN01 |
| Thâm nhập dịch vụ | `service_penetration` | `customer_period_profiles` | Count từng service field > 0 | CN05/LN01 |
| Bảng cán bộ | `officer_leaderboard` | `customer_period_profiles` | Group by `ma_cb`, `ten_can_bo` | LN01 |
| Phân bổ loại vay | `loan_type_breakdown` | `customer_period_profiles` | Group by `loai_vay` | LN01 |
| Cơ cấu KHCN/KHDN | `segment` | `customer_period_profiles` | Group by `loai_khach_hang` | DP01 |
| Top bán chéo | `campaign_top5` | `customer_period_profiles` | Dựa trên tổng tài sản và số dịch vụ đang dùng | Tổng hợp |
| Xu hướng dư nợ/CASA | `trends` | `customer_period_profiles` | Sum theo nhiều `period_key` | LN01/PF14 |

## 8. Mapping cơ hội bán chéo trên Báo cáo

Các nhãn cơ hội bán chéo hiện được tính ở frontend từ dòng `customer_period_profiles`.

| Nhãn hiển thị | Điều kiện | Cột DB liên quan | Nguồn |
|---|---|---|---|
| TG lớn chưa dùng Agribank Plus | `so_du_tien_gui + so_du_tgtt_binh_quan >= 1 tỷ` và `agribank_plus = 0` | `so_du_tien_gui`, `so_du_tgtt_binh_quan`, `agribank_plus` | PF14 + CN05 |
| Có dư nợ thiếu SMS nhắc nợ | `so_du_tien_vay > 0` và `sms_nhac_no_vay = 0` | `so_du_tien_vay`, `sms_nhac_no_vay` | LN01 + CN05 |
| TGTT cao chưa có thẻ | `so_du_tgtt_binh_quan >= 500 triệu` và chưa có thẻ | `so_du_tgtt_binh_quan`, `the_ghi_no_noi_dia`, `the_td_quoc_te`, `the_td_loc_viet` | PF14 + CN05 |
| Nhiều CN cần quản lý chính | `branch_count > 1` | `branch_count` | Tổng hợp |

## 9. Các file code liên quan

Backend:

```text
backend/app/models.py
backend/app/customer_processing.py
backend/app/api/customer_processing.py
backend/app/api/dashboard.py
```

Frontend:

```text
frontend/src/pages/CustomerReport.jsx
frontend/src/pages/Dashboard.jsx
frontend/src/components/dashboard/VisualDashboard.jsx
frontend/src/components/dashboard/CampaignList.jsx
```

## 10. Cách kiểm tra nhanh bằng SQL

Đếm số hồ sơ khách hàng theo kỳ:

```sql
SELECT period_key, COUNT(*)
FROM customer_period_profiles
GROUP BY period_key
ORDER BY period_key DESC;
```

Xem một khách hàng tổng hợp:

```sql
SELECT *
FROM customer_period_profiles
WHERE period_key = '20260630'
LIMIT 5;
```

Xem chi tiết theo chi nhánh/PGD:

```sql
SELECT *
FROM customer_period_branch_details
WHERE period_key = '20260630'
  AND ma_kh = '044465949';
```

Kiểm tra tổng Dashboard:

```sql
SELECT
  COUNT(*) AS total_customers,
  SUM(so_du_tien_vay) AS total_loan,
  SUM(so_du_tien_gui) AS total_deposit,
  SUM(so_du_tgtt_binh_quan) AS total_casa
FROM customer_period_profiles
WHERE period_key = '20260630';
```

## 11. Ghi chú quan trọng

- `customer_period_profiles` là bảng phục vụ báo cáo tổng hợp.
- `customer_period_branch_details` là bảng phục vụ drill-down theo chi nhánh/PGD.
- Nếu một khách hàng phát sinh ở nhiều chi nhánh, báo cáo ngoài vẫn chỉ hiện 1 dòng.
- Khi bấm chi tiết, dữ liệu được tách theo chi nhánh/PGD để biết khoản vay, tiền gửi, dịch vụ nằm ở đâu.
- Các trường `Chờ DL` cần bổ sung mapping nguồn khi xác định được cột từ file import.
