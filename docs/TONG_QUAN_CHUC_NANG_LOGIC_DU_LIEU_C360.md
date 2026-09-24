# Tổng quan chức năng, logic xử lý và từ điển dữ liệu C360

Tài liệu này mô tả các chức năng chính đã xây dựng trong dự án C360, luồng xử lý dữ liệu, các bảng DB quan trọng, logic nghiệp vụ đang áp dụng và nguồn gốc từng trường dữ liệu hiển thị trên Dashboard/Báo cáo.

## 1. Mục tiêu hệ thống

C360 là hệ thống quản lý và phân tích khách hàng theo kỳ dữ liệu.

Mục tiêu chính:

- Import dữ liệu định kỳ từ nhiều file CSV/Excel.
- Lưu dữ liệu nguồn vào PostgreSQL.
- Xử lý dữ liệu theo kỳ để gom mỗi khách hàng thành một hồ sơ duy nhất.
- Đối chiếu khách hàng với tiền gửi, tiền vay, dịch vụ, cán bộ phụ trách.
- Xem báo cáo, Dashboard, chi tiết khách hàng, phân nhóm khách hàng và cơ hội bán chéo.
- Quản trị chi nhánh, phòng ban, người dùng, nhóm quyền và phạm vi dữ liệu.

## 2. Công nghệ sử dụng

| Thành phần | Công nghệ |
|---|---|
| Frontend | ReactJS, Vite, Ant Design |
| Backend | Python FastAPI |
| Database | PostgreSQL |
| Kết nối DB | SQLAlchemy, psycopg |
| Import file lớn | Worker queue, đọc chunk, PostgreSQL COPY |
| Xử lý dữ liệu | SQL tổng hợp trong backend, có thể bổ sung Polars |
| Chạy DB dev | Docker Compose hoặc PostgreSQL local/server |

## 3. Nhóm chức năng đã có

### 3.1. Đăng nhập

Chức năng:

- Đăng nhập bằng mã nhân viên/user.
- Mật khẩu mặc định ban đầu theo cấu hình nội bộ.
- Giao diện login theo phong cách Agribank, logo C360.

Dữ liệu liên quan:

- `system_users`
- `system_roles`
- `system_permissions`

### 3.2. Dashboard

Dashboard hiển thị tổng quan theo kỳ dữ liệu đã xử lý.

Chức năng đã có:

- Chọn kỳ dữ liệu.
- Lọc theo chi nhánh/PGD theo phạm vi người dùng.
- KPI tổng khách hàng, tổng dư nợ, tổng tiền gửi CKH, tổng CASA/TGTT bình quân, khách hàng chưa dùng dịch vụ.
- Hiển thị số tiền dạng rút gọn như `24,5 nghìn tỷ`, khi hover hiển thị số đầy đủ.
- Loading khi tải dữ liệu.
- Biểu đồ/khối phân tích trực quan.
- Top 5 khách hàng ưu tiên bán chéo.
- Bảng vàng cán bộ tín dụng.

API chính:

```text
GET /api/dashboard/summary
GET /api/dashboard/trends
```

Nguồn dữ liệu chính:

```text
customer_period_profiles
```

### 3.3. Kho dữ liệu

Kho dữ liệu là nơi import và quản lý file theo kỳ.

Chức năng đã có:

- Import nhiều file cùng lúc.
- Tự nhận diện kỳ từ tên file dạng `yyyymmdd`.
- Nhận diện mã chi nhánh và loại file từ tên file, ví dụ `2600_dp01_20260630.csv`.
- Kiểm tra trùng file cùng chi nhánh, loại file, kỳ.
- Import file lớn bằng job nền để tránh treo trình duyệt.
- Hiển thị tiến trình job import.
- Ghi nhận file thành công/lỗi, lý do lỗi.
- Quản lý kỳ dữ liệu.
- Xóa file/kỳ dữ liệu, yêu cầu nhập lý do.
- Chặn xóa khi job import/xử lý đang chạy.
- Tự xóa file upload tạm sau khi import thành công.
- Có chức năng khôi phục job import bị kẹt.

Bảng DB liên quan:

| Bảng | Vai trò |
|---|---|
| `import_batches` | Kỳ dữ liệu |
| `import_files` | Danh sách file import |
| `dp01_deposit_accounts` | Dữ liệu DP01 |
| `ln01_loans` | Dữ liệu LN01 |
| `pf14_account_balances` | Dữ liệu PF14 |
| `cn05_customer_services` | Dữ liệu CN05 |
| `audit_logs` | Nhật ký thao tác |

### 3.4. Xử lý dữ liệu khách hàng

Trang xử lý dữ liệu dùng để gom dữ liệu nguồn thành hồ sơ khách hàng theo kỳ.

Chức năng đã có:

- Liệt kê các kỳ dữ liệu.
- Kiểm tra kỳ đủ file nguồn bắt buộc.
- Cho phép thêm file bổ sung theo kỳ.
- Chạy xử lý dữ liệu theo job nền.
- Hiển thị tiến trình xử lý.
- Cho phép chuyển trang trong lúc job chạy.
- Khôi phục/chạy lại job xử lý bị kẹt.

File bắt buộc hiện tại:

```text
DP01
LN01
CN05
PF14
```

File bổ sung hiện tại:

```text
Bảo lãnh/LC
OAB - Loa biến động số dư
```

Logic xử lý chính nằm ở:

```text
backend/app/customer_processing.py
```

Kết quả xử lý lưu vào:

```text
customer_period_branch_details
customer_period_profiles
customer_period_exchange_rates
```

### 3.5. Báo cáo khách hàng

Trang báo cáo là màn hình phân tích chính.

Chức năng đã có:

- Chọn kỳ dữ liệu.
- Chọn kỳ so sánh.
- Lọc theo chi nhánh, PGD/phòng ban, cán bộ phụ trách.
- Bộ lọc nâng cao: từ khóa, loại vay, khách hàng nhiều chi nhánh, khách hàng chưa dùng dịch vụ.
- KPI toàn kỳ/toàn bộ dữ liệu theo filter.
- Phân nhóm khách hàng.
- Cơ hội bán chéo.
- So sánh 2 kỳ.
- Cảnh báo dữ liệu.
- Bảng khách hàng phân trang server-side.
- Chọn cột hiển thị.
- Modal chi tiết khách hàng.
- Chi tiết theo chi nhánh/PGD.
- Lịch sử khách hàng qua các kỳ.
- Loading khi đổi kỳ hoặc đổi kỳ so sánh.

API chính:

```text
GET /api/customer-processing/profiles
GET /api/customer-processing/profile-summary
GET /api/customer-processing/profile-groups
GET /api/customer-processing/profile-filter-options
GET /api/customer-processing/period-comparison
GET /api/customer-processing/branch-details
GET /api/customer-processing/profile-history
```

### 3.6. Quản trị hệ thống

Chức năng đã có:

- Quản lý chi nhánh.
- Quản lý phòng ban.
- Quản lý người dùng.
- Quản lý nhóm quyền.
- Nhật ký thao tác.
- Cảnh báo cấu hình người dùng.
- Reset mật khẩu.
- Khóa/mở khóa tài khoản.
- Phân quyền phạm vi dữ liệu.
- Import danh sách chi nhánh/cán bộ từ Excel.

Bảng DB liên quan:

| Bảng | Vai trò |
|---|---|
| `org_branches` | Chi nhánh |
| `org_departments` | Phòng ban/PGD |
| `system_users` | Người dùng |
| `system_roles` | Nhóm quyền |
| `system_permissions` | Danh sách quyền |
| `system_role_permissions` | Quyền theo nhóm |
| `audit_logs` | Nhật ký thao tác |

## 4. Luồng dữ liệu tổng quát

```text
File CSV/Excel theo kỳ
  |
  |-- DP01: thông tin KH, tài khoản, tiền gửi, doanh số CR/DR
  |-- LN01: khoản vay, dư nợ, loại vay, cán bộ quản lý
  |-- PF14: số dư bình quân, số dư cuối tháng, kỳ hạn, ngoại tệ
  |-- CN05: dịch vụ khách hàng đang sử dụng
  |-- File bổ sung: Bảo lãnh, LC, OAB...
  |
Import vào bảng nguồn
  |
Chạy xử lý dữ liệu theo kỳ
  |
customer_period_branch_details
  |  1 khách hàng có thể có nhiều dòng theo chi nhánh/PGD
  |
customer_period_profiles
     1 khách hàng = 1 dòng tổng hợp trong 1 kỳ
  |
Dashboard / Báo cáo / Modal chi tiết
```

## 5. Quy ước kỳ dữ liệu

Kỳ dữ liệu lấy từ tên file.

Ví dụ:

```text
2600_dp01_20260630.csv
```

Suy ra:

| Thành phần | Giá trị |
|---|---|
| Mã chi nhánh | `2600` |
| Loại file | `DP01` |
| Kỳ dữ liệu | `20260630` |
| Diễn giải | Tháng 06/2026 |

Trong DB, kỳ được lưu ở:

```text
period_key = 20260630
period_date = 2026-06-30
```

## 6. Các bảng dữ liệu nguồn

### 6.1. DP01 - tiền gửi/thông tin khách hàng

Bảng DB:

```text
dp01_deposit_accounts
```

Vai trò:

- Là nguồn nền để xác định danh sách khách hàng.
- Lấy tên KH, loại KH, số điện thoại, chi nhánh, PGD.
- Lấy doanh số chuyển tiền về tài khoản.
- Lấy tỷ giá theo `CCY`, `TYGIA`.

Cột nguồn quan trọng:

| Cột file DP01 | Cột DB | Vai trò |
|---|---|---|
| `MA_CN` | `ma_cn` | Mã chi nhánh |
| `MA_KH` | `ma_kh` | Mã khách hàng |
| `TEN_KH` | `ten_kh` | Tên khách hàng |
| `CUST_TYPE_NAME` | `cust_type_name` | Loại khách hàng |
| `SO_TAI_KHOAN` | `so_tai_khoan` | Số tài khoản |
| `MA_PGD` | `ma_pgd` | Mã PGD |
| `TEN_PGD` | `ten_pgd` | Tên PGD |
| `TELEPHONE` | `telephone` | Số điện thoại |
| `CRAMT` | `cramt` | Doanh số chuyển tiền về tài khoản |
| `DRAMT` | `dramt` | Doanh số ghi nợ |
| `CCY` | `ccy` | Loại tiền |
| `TYGIA` | `tygia` | Tỷ giá |

Lưu ý:

- DP01 không còn dùng để xác định cán bộ phụ trách.
- Cán bộ phụ trách hiện lấy từ LN01 và đối chiếu User IPCAS.

### 6.2. LN01 - tiền vay

Bảng DB:

```text
ln01_loans
```

Vai trò:

- Lấy dư nợ vay.
- Lấy loại vay.
- Xác định thấu chi.
- Xác định cán bộ phụ trách thông qua User IPCAS.

Cột nguồn quan trọng:

| Cột file LN01 | Cột DB | Vai trò |
|---|---|---|
| `BRCD` | `brcd` | Mã chi nhánh khoản vay |
| `CUSTSEQ` | `custseq` | Mã khách hàng |
| `DU_NO` | `du_no` | Dư nợ vay |
| `LOAN_TYPE` | `loan_type` | Loại vay |
| `OFFICER_ID` | `officer_id` | Mã cán bộ nguồn, hiện không dùng làm khóa chính |
| `OFFICER_NAME` | `officer_name` | Tên cán bộ nguồn, chỉ tham khảo |
| `OFFICER_IPCAS` | `officer_ipcas` | User IPCAS cán bộ, dùng để đối chiếu User DB |

Logic cán bộ phụ trách:

```text
LN01.OFFICER_IPCAS
  -> đối chiếu system_users.ipcas_username
  -> nếu khớp thì lấy full_name, employee_code, ipcas_username từ User DB
```

Hiển thị:

```text
Tên cán bộ (Mã cán bộ - User IPCAS)
```

Ví dụ:

```text
Bùi Ngọc Hà (200902108 - LTABNHA)
```

### 6.3. PF14 - tiền gửi CKH và TGTT bình quân

Bảng DB:

```text
pf14_account_balances
```

Vai trò:

- Tính tiền gửi có kỳ hạn.
- Tính TGTT bình quân trong tháng.
- Quy đổi ngoại tệ sang VND theo tỷ giá từ DP01.

Cột nguồn quan trọng:

| Cột file PF14 | Cột DB | Vai trò |
|---|---|---|
| `CUSTSEQ` | `custseq` | Mã khách hàng |
| `TRBRCD` | `trbrcd` | Mã chi nhánh |
| `CCY` | `ccy` | Loại tiền |
| `MONTERM` | `monterm` | Kỳ hạn theo tháng |
| `AVERAGEBALANCE` | `averagebalance` | Số dư bình quân |
| `MONTHLYENDBALANCE` | `monthlyendbalance` | Số dư cuối tháng |

Logic:

```text
MONTERM = 0
  -> TGTT bình quân
  -> SUM(AVERAGEBALANCE * tỷ giá)

MONTERM > 0
  -> Tiền gửi CKH
  -> SUM(MONTHLYENDBALANCE * tỷ giá)
```

### 6.4. CN05 - dịch vụ khách hàng

Bảng DB:

```text
cn05_customer_services
```

Vai trò:

- Xác định khách hàng đang sử dụng dịch vụ nào.

Cột nguồn quan trọng:

| Dịch vụ | Cột file CN05 | Cột DB tổng hợp |
|---|---|---|
| TK số đẹp | `TKTT_TK_SODEP` | `tk_so_dep` |
| Agribank Plus | `DK_AGRIBANK_PLUS` | `agribank_plus` |
| Tin nhắn OTT | `DK_AGRIBANK_PLUS_OTT` | `tin_nhan_ott` |
| SMS nhắc nợ vay | `VV_SMS_TIEN_VAY` | `sms_nhac_no_vay` |
| SMS tiền gửi | `TG_SMS_TIEN_GUI` | `sms_tien_gui` |
| Thẻ ghi nợ nội địa | `THE_GHI_NO_NOI_DIA` | `the_ghi_no_noi_dia` |
| Thẻ tín dụng quốc tế | `THE_TIN_DUNG_QUOC_TE` | `the_td_quoc_te` |
| Thẻ tín dụng Lộc Việt | `THE_TIN_DUNG_NOI_DIA` | `the_td_loc_viet` |

Quy tắc:

```text
Giá trị > 0 hoặc = 1 -> có sử dụng dịch vụ
Không có giá trị -> chưa ghi nhận sử dụng
```

### 6.5. File bổ sung Bảo lãnh/LC

Bảng DB:

```text
supplemental_bao_lanh_records
```

Vai trò:

- Bổ sung dịch vụ bảo lãnh.
- Bổ sung dịch vụ phát hành LC.

Logic hiện tại:

| Nhóm | Logic |
|---|---|
| Bảo lãnh | `loai_bllc` thuộc nhóm mã bảo lãnh hoặc bắt đầu bằng `V` |
| LC | `loai_bllc` thuộc nhóm mã LC |

Cột tổng hợp:

```text
bao_lanh
phat_hanh_lc
```

### 6.6. File bổ sung OAB

Bảng DB:

```text
supplemental_oab_records
```

Vai trò:

- Bổ sung dịch vụ loa biến động số dư.

Logic hiện tại:

```text
OAB.TK_AGRIBANK
  -> đối chiếu DP01.SO_TAI_KHOAN
  -> tìm ra MA_KH và chi nhánh
  -> cập nhật loa_bien_dong_so_du = 1
```

## 7. Bảng kết quả xử lý

### 7.1. `customer_period_branch_details`

Mỗi dòng thể hiện dữ liệu của một khách hàng tại một chi nhánh/PGD trong một kỳ.

Vai trò:

- Dùng cho modal chi tiết khách hàng.
- Cho biết khách hàng vay/gửi/dùng dịch vụ ở chi nhánh nào.
- Là nguồn để gom lên `customer_period_profiles`.

Cột quan trọng:

| Cột DB | Ý nghĩa | Nguồn |
|---|---|---|
| `period_key` | Kỳ dữ liệu | Tên file |
| `ma_kh` | Mã khách hàng | DP01/LN01/PF14/CN05 |
| `branch_code` | Chi nhánh phát sinh | DP01/LN01/PF14/CN05 |
| `ma_pgd` | Mã PGD | DP01 |
| `ten_pgd` | Tên PGD | DP01/cấu hình phòng ban |
| `ten_kh` | Tên KH | DP01 |
| `loai_khach_hang` | Loại KH | DP01 |
| `dp_record_count` | Số dòng DP phát sinh | DP01 |
| `so_du_tien_gui` | Tiền gửi CKH | PF14 |
| `doanh_so_cramt` | Doanh số CR | DP01 |
| `doanh_so_dramt` | Doanh số DR | DP01 |
| `so_du_tien_vay` | Dư nợ vay | LN01 |
| `loai_vay` | Loại vay | LN01 |
| `so_du_tgtt_binh_quan` | TGTT bình quân | PF14 |
| `ma_cb` | User IPCAS cán bộ hợp lệ | LN01 + User DB |
| `ten_can_bo` | Tên cán bộ từ User DB | User DB |
| `officer_employee_code` | Mã cán bộ/mã nhân viên | User DB |
| Các cột dịch vụ | Dịch vụ đã dùng | CN05/LN01/file bổ sung |

### 7.2. `customer_period_profiles`

Mỗi dòng là một khách hàng duy nhất trong một kỳ.

Quy tắc:

```text
1 period_key + 1 ma_kh = 1 hồ sơ khách hàng
```

Vai trò:

- Nguồn chính cho Dashboard.
- Nguồn chính cho trang Báo cáo.
- Nguồn chính cho bộ lọc.
- Nguồn chính cho so sánh kỳ.

Cột quan trọng:

| Cột DB | Ý nghĩa |
|---|---|
| `period_key` | Kỳ dữ liệu |
| `ma_kh` | Mã khách hàng |
| `ten_kh` | Tên khách hàng |
| `loai_khach_hang` | Loại khách hàng |
| `branch_codes` | Danh sách chi nhánh phát sinh |
| `pgd_codes` | Danh sách PGD phát sinh |
| `branch_count` | Số chi nhánh phát sinh |
| `pgd_count` | Số PGD phát sinh |
| `so_du_tien_gui` | Tổng tiền gửi CKH |
| `doanh_so_chuyen_tien_ve_tk` | Tổng doanh số CR |
| `so_du_tien_vay` | Tổng dư nợ |
| `loai_vay` | Loại vay đã gom |
| `so_du_tgtt_binh_quan` | Tổng TGTT bình quân |
| `ma_cb` | User IPCAS cán bộ phụ trách hợp lệ |
| `ten_can_bo` | Tên cán bộ phụ trách từ User DB |
| `officer_employee_code` | Mã cán bộ/mã nhân viên |
| `telephone` | Số điện thoại |
| `primary_branch_code` | Chi nhánh giao dịch chính |
| `primary_pgd_code` | PGD giao dịch chính |
| `primary_pgd_name` | Tên PGD giao dịch chính |
| `primary_location_score` | Điểm nội bộ để chọn nơi giao dịch chính |
| `primary_location_reason` | Lý do chọn nơi giao dịch chính |
| `branch_details` | JSON chi tiết theo chi nhánh/PGD |

## 8. Logic nghiệp vụ quan trọng

### 8.1. Gom khách hàng theo MA_KH

Khách hàng có thể phát sinh ở nhiều chi nhánh.

Ví dụ:

```text
MA_KH = 123456789
Xuất hiện ở 2600, 2602, 2609
```

Báo cáo chỉ hiển thị một dòng khách hàng:

```text
ma_kh = 123456789
branch_codes = 2600, 2602, 2609
```

Chi tiết từng chi nhánh nằm ở:

```text
customer_period_branch_details
```

### 8.2. Tính dư nợ vay

Nguồn:

```text
LN01.DU_NO
```

Logic:

```text
SUM(DU_NO) theo CUSTSEQ
```

Nếu khách hàng vay ở nhiều chi nhánh:

- Bảng báo cáo hiển thị tổng.
- Modal chi tiết hiển thị từng chi nhánh/PGD.

### 8.3. Tính loại vay

Nguồn:

```text
LN01.LOAN_TYPE
```

Mapping:

| Giá trị nguồn | Giá trị hiển thị |
|---|---|
| Thấu chi trên TK khách hàng | Thấu chi |
| Vay ngắn hạn (TK 211) | Ngắn |
| Vay trung hạn (TK 212) | Trung |
| Vay dài hạn (TK 213) | Dài |

Nếu có nhiều loại vay:

```text
Thấu chi/Ngắn/Trung/Dài
```

### 8.4. Tính cán bộ phụ trách

Nguồn:

```text
LN01.OFFICER_IPCAS
```

Đối chiếu:

```text
system_users.ipcas_username
```

Nếu khớp:

```text
ten_can_bo = system_users.full_name
officer_employee_code = system_users.employee_code
ma_cb = system_users.ipcas_username
```

Hiển thị:

```text
Tên cán bộ (Mã cán bộ - User IPCAS)
```

Nếu không khớp:

```text
ma_cb = NULL
ten_can_bo = NULL
officer_employee_code = NULL
```

Nếu khách hàng có nhiều khoản vay:

```text
Chọn cán bộ hợp lệ của khoản vay có DU_NO lớn nhất
```

### 8.5. Tính tiền gửi CKH

Nguồn:

```text
PF14.MONTHLYENDBALANCE
PF14.MONTERM
PF14.CCY
```

Logic:

```text
MONTERM > 0 -> tiền gửi CKH
SUM(MONTHLYENDBALANCE * tỷ giá)
```

Tỷ giá lấy từ:

```text
DP01.CCY
DP01.TYGIA
```

Nếu VND:

```text
tỷ giá = 1
```

### 8.6. Tính TGTT bình quân

Nguồn:

```text
PF14.AVERAGEBALANCE
PF14.MONTERM
PF14.CCY
```

Logic:

```text
MONTERM = 0 -> TGTT bình quân
SUM(AVERAGEBALANCE * tỷ giá)
```

### 8.7. Tính doanh số chuyển tiền về tài khoản

Nguồn:

```text
DP01.CRAMT
```

Logic:

```text
SUM(CRAMT) theo khách hàng
```

### 8.8. Nơi giao dịch chính

Hệ thống tính điểm nội bộ theo từng chi nhánh/PGD để xác định nơi khách hàng phát sinh nổi trội nhất.

Điểm dựa trên:

- Dư nợ.
- Tiền gửi CKH.
- TGTT bình quân.
- Doanh số CR.
- Số dịch vụ đang dùng.
- Số dòng DP phát sinh.

Giao diện không hiển thị điểm chi tiết, chỉ hiển thị nhãn:

```text
Chính
Phụ
```

ở cột Mã CN và PGD.

### 8.9. Cơ hội bán chéo

Một số rule hiện có:

| Cơ hội | Điều kiện |
|---|---|
| Tiền gửi lớn chưa dùng Agribank Plus | Tiền gửi CKH + TGTT >= 1 tỷ và `agribank_plus = 0` |
| Có dư nợ thiếu SMS vay | `so_du_tien_vay > 0` và `sms_nhac_no_vay = 0` |
| TGTT cao chưa có thẻ | `so_du_tgtt_binh_quan >= 500 triệu` và chưa có thẻ |
| Nhiều chi nhánh cần phân công | `branch_count > 1` |

### 8.10. Phân nhóm khách hàng

Nhóm hiện có:

| Nhóm | Điều kiện |
|---|---|
| Nhóm tiền gửi lớn | Tiền gửi CKH + TGTT bình quân >= 1 tỷ |
| Nhóm dư nợ lớn | Dư nợ >= 1 tỷ |
| Nhóm CASA cao | TGTT bình quân >= 500 triệu |
| Nhóm nhiều chi nhánh | `branch_count > 1` |
| Nhóm tiềm năng bán chéo | Có ít nhất một cảnh báo bán chéo |
| KH cần phân công nơi chăm sóc chính | Nhiều chi nhánh và có nơi giao dịch chính |

### 8.11. So sánh hai kỳ

So sánh giữa kỳ hiện tại và kỳ trước/chọn kỳ so sánh.

Chỉ tiêu:

- Khách hàng tăng/giảm.
- Tiền gửi CKH tăng/giảm.
- Dư nợ tăng/giảm.
- TGTT bình quân tăng/giảm.
- Dịch vụ mới phát sinh.
- Dịch vụ bị mất.
- KH mới.
- KH không còn phát sinh.

## 9. Mapping trường báo cáo chính

| Trường hiển thị | Frontend field | Bảng DB | Cột DB | Nguồn file | Cột nguồn | Logic |
|---|---|---|---|---|---|---|
| Kỳ dữ liệu | `period_key` | `customer_period_profiles` | `period_key` | Tên file | `yyyymmdd` | Lấy từ tên file |
| Mã KH | `ma_kh_chuan`, `ma_kh` | `customer_period_profiles` | `ma_kh` | DP01 | `MA_KH` | Gom theo MA_KH |
| Tên KH | `ten_kh` | `customer_period_profiles` | `ten_kh` | DP01 | `TEN_KH` | Lấy tên từ DP |
| Loại KH | `loai_khach_hang` | `customer_period_profiles` | `loai_khach_hang` | DP01 | `CUST_TYPE_NAME` | Lấy loại KH từ DP |
| Mã CN | `ma_cn` | `customer_period_profiles` | `branch_codes` | DP01/LN01/PF14/CN05 | `MA_CN`, `BRCD`, `TRBRCD` | Ghép danh sách CN phát sinh |
| PGD | `ma_pgd` | `customer_period_profiles` | `pgd_codes` | DP01 | `MA_PGD`, `TEN_PGD` | Ghép `branch:pgd` |
| Cán bộ phụ trách | `ten_can_bo`, `ma_cb`, `officer_employee_code` | `customer_period_profiles` | `ten_can_bo`, `ma_cb`, `officer_employee_code` | LN01 + User DB | `OFFICER_IPCAS`, `system_users` | Đối chiếu IPCAS, hiển thị tên/mã CB/User IPCAS |
| Dư nợ | `so_du_tien_vay` | `customer_period_profiles` | `so_du_tien_vay` | LN01 | `DU_NO` | SUM theo KH |
| Loại vay | `loai_vay` | `customer_period_profiles` | `loai_vay` | LN01 | `LOAN_TYPE` | Map Thấu chi/Ngắn/Trung/Dài |
| Tiền gửi CKH | `so_du_tien_gui_ckh` | `customer_period_profiles` | `so_du_tien_gui` | PF14 | `MONTHLYENDBALANCE`, `MONTERM` | MONTERM > 0, quy đổi VND |
| TGTT bình quân | `so_du_tgtt_binh_quan` | `customer_period_profiles` | `so_du_tgtt_binh_quan` | PF14 | `AVERAGEBALANCE`, `MONTERM` | MONTERM = 0, quy đổi VND |
| Doanh số CR | `doanh_so_chuyen_tien_ve_tai_khoan` | `customer_period_profiles` | `doanh_so_chuyen_tien_ve_tk` | DP01 | `CRAMT` | SUM theo KH |
| Số điện thoại | `telephone` | `customer_period_profiles` | `telephone` | DP01 | `TELEPHONE` | Lấy từ DP |
| Số CN | `branch_count` | `customer_period_profiles` | `branch_count` | Tổng hợp | - | Đếm chi nhánh |
| Số PGD | `pgd_count` | `customer_period_profiles` | `pgd_count` | Tổng hợp | - | Đếm PGD |
| Nơi chính | `primary_branch_code`, `primary_pgd_code` | `customer_period_profiles` | `primary_*` | Tổng hợp | - | Tính điểm nội bộ |

## 10. Mapping dịch vụ

| Dịch vụ | Field frontend/DB | Nguồn | Cột nguồn/logic |
|---|---|---|---|
| Thấu chi | `thau_chi` | LN01 | `LOAN_TYPE = Thấu chi trên TK khách hàng` |
| TK số đẹp | `tk_so_dep` | CN05 | `TKTT_TK_SODEP` |
| Agribank Plus | `agribank_plus` | CN05 | `DK_AGRIBANK_PLUS` |
| Tin nhắn OTT | `tin_nhan_ott` | CN05 | `DK_AGRIBANK_PLUS_OTT` |
| SMS nhắc nợ vay | `sms_nhac_no_vay` | CN05 | `VV_SMS_TIEN_VAY` |
| SMS tiền gửi | `sms_tien_gui` | CN05 | `TG_SMS_TIEN_GUI` |
| Thẻ ghi nợ nội địa | `the_ghi_no_noi_dia` | CN05 | `THE_GHI_NO_NOI_DIA` |
| Thẻ tín dụng quốc tế | `the_td_quoc_te` | CN05 | `THE_TIN_DUNG_QUOC_TE` |
| Thẻ tín dụng Lộc Việt | `the_td_loc_viet` | CN05 | `THE_TIN_DUNG_NOI_DIA` |
| Bảo lãnh | `bao_lanh` | File bổ sung Bảo lãnh | `loai_bllc` thuộc nhóm bảo lãnh |
| Phát hành LC | `phat_hanh_lc` | File bổ sung Bảo lãnh | `loai_bllc` thuộc nhóm LC |
| Loa biến động số dư | `loa_bien_dong_so_du` | File OAB | Đối chiếu tài khoản OAB với DP01 |

Các trường đang chờ nguồn hoặc chưa chốt logic:

| Dịch vụ | Field | Trạng thái |
|---|---|---|
| e-Banking | `e_banking` | Chờ chốt nguồn chuẩn |
| Thanh toán tiền điện | `tt_tien_dien` | Chờ nguồn |
| Thanh toán tiền nước | `tt_tien_nuoc` | Chờ nguồn |
| Cước viễn thông | `tt_cuoc_vien_thong` | Chờ nguồn |
| Trả lương qua thẻ | `tra_luong_qua_the` | Chờ nguồn |
| BATD | `batd` | Chờ nguồn |
| BATK | `batk` | Chờ nguồn |
| Bảo hiểm ô tô/xe máy | `bh_oto_xe_may` | Chờ nguồn |
| POS | `pos` | Báo cáo POS bổ sung → đối chiếu số tài khoản với DP01 → lấy mã KH lõi → tham chiếu Kho CIF tại bước xử lý KH |
| Kiều hối | `chi_tra_kieu_hoi` | Chờ nguồn |
| Thanh toán quốc tế | `thanh_toan_quoc_te` | Chờ nguồn |
| Mua bán ngoại tệ | `mua_ban_ngoai_te` | Chờ nguồn |

## 11. Mapping Dashboard

| Chỉ tiêu | API field | Bảng DB | Logic |
|---|---|---|---|
| Tổng khách hàng | `kpis.total_customers` | `customer_period_profiles` | `COUNT(*)` |
| Tổng dư nợ | `kpis.total_loan` | `customer_period_profiles` | `SUM(so_du_tien_vay)` |
| Tổng tiền gửi CKH | `kpis.total_deposit` | `customer_period_profiles` | `SUM(so_du_tien_gui)` |
| Tổng TGTT bình quân | `kpis.total_casa` | `customer_period_profiles` | `SUM(so_du_tgtt_binh_quan)` |
| KH chưa dùng DV nào | `kpis.no_service_count` | `customer_period_profiles` | Tất cả dịch vụ active = 0 |
| Thâm nhập dịch vụ | `service_penetration` | `customer_period_profiles` | Count từng dịch vụ > 0 |
| Bảng cán bộ | `officer_leaderboard` | `customer_period_profiles` | Group by User IPCAS |
| Loại vay | `loan_type_breakdown` | `customer_period_profiles` | Group by `loai_vay` |
| KHCN/KHDN | `segment` | `customer_period_profiles` | Group by `loai_khach_hang` |
| Top 5 bán chéo | `campaign_top5` | `customer_period_profiles` | Tài sản >= 80 triệu và dịch vụ đang dùng <= 2 |

## 12. Phân quyền dữ liệu

Hệ thống có phạm vi dữ liệu theo người dùng.

Các phạm vi chính:

| Phạm vi | Ý nghĩa |
|---|---|
| Toàn hệ thống | Xem toàn bộ dữ liệu |
| Theo chi nhánh | Chỉ xem dữ liệu chi nhánh được cấp |
| Theo phòng ban/PGD | Chỉ xem dữ liệu phòng ban/PGD |
| Cá nhân | Chỉ xem dữ liệu cá nhân nếu cấu hình |

Frontend và backend đều truyền/lọc theo:

```text
branch_code
pgd_code
```

## 13. Các cơ chế an toàn dữ liệu

### 13.1. Import file lớn

Thiết kế:

```text
Upload -> job nền -> validate -> COPY/chunk -> bảng nguồn -> xóa file tạm
```

Mục tiêu:

- Không treo trình duyệt.
- Không giữ file upload nặng sau khi import thành công.
- Có thể khôi phục job bị kẹt.

### 13.2. Xóa file/kỳ dữ liệu

Chức năng:

- Xóa file sẽ xóa dữ liệu nguồn tương ứng trong DB.
- Xóa kỳ sẽ xóa các file và dữ liệu thuộc kỳ.
- Nếu kỳ đã xử lý thì yêu cầu xác nhận.
- Phải nhập lý do xóa.
- Có nhật ký thao tác.
- Chặn xóa nếu job import/xử lý đang chạy.

### 13.3. Chạy lại xử lý

Khi thêm/xóa file trong kỳ đã xử lý:

```text
Kỳ cần chạy lại xử lý
```

Sau khi chạy lại:

- Xóa kết quả cũ của kỳ.
- Tạo lại tỷ giá.
- Tạo lại chi tiết theo chi nhánh/PGD.
- Cập nhật file bổ sung.
- Gom lại hồ sơ khách hàng.

## 14. Các file code chính

Backend:

| File | Vai trò |
|---|---|
| `backend/app/main.py` | Khởi tạo FastAPI |
| `backend/app/config.py` | Cấu hình môi trường |
| `backend/app/database.py` | Kết nối DB, init/migration nhẹ |
| `backend/app/models.py` | Model SQLAlchemy |
| `backend/app/imports/importer.py` | Import file nguồn |
| `backend/app/api/imports.py` | API kho dữ liệu |
| `backend/app/customer_processing.py` | Logic xử lý dữ liệu khách hàng |
| `backend/app/api/customer_processing.py` | API xử lý/báo cáo khách hàng |
| `backend/app/api/dashboard.py` | API Dashboard |
| `backend/app/api/admin.py` | API quản trị hệ thống |

Frontend:

| File | Vai trò |
|---|---|
| `frontend/src/pages/Login.jsx` | Trang đăng nhập |
| `frontend/src/pages/Dashboard.jsx` | Dashboard |
| `frontend/src/pages/ImportData.jsx` | Kho dữ liệu |
| `frontend/src/pages/CustomerProcessing.jsx` | Xử lý dữ liệu KH |
| `frontend/src/pages/CustomerReport.jsx` | Báo cáo KH |
| `frontend/src/pages/SystemAdmin.jsx` | Quản trị hệ thống |
| `frontend/src/components/dashboard/VisualDashboard.jsx` | Biểu đồ Dashboard |
| `frontend/src/components/dashboard/CampaignList.jsx` | Top KH bán chéo |
| `frontend/src/api/client.js` | Axios client |

## 15. Lưu ý khi kiểm tra dữ liệu

Khi thay đổi logic xử lý, cần chạy lại kỳ dữ liệu để cập nhật kết quả.

Một số câu SQL kiểm tra nhanh:

### Tổng hợp toàn kỳ

```sql
SELECT
  COUNT(*) AS total_customers,
  SUM(so_du_tien_vay) AS total_loan,
  SUM(so_du_tien_gui) AS total_deposit,
  SUM(so_du_tgtt_binh_quan) AS total_casa
FROM customer_period_profiles
WHERE period_key = '20260630';
```

### Kiểm tra cán bộ không khớp User IPCAS

```sql
SELECT p.period_key, p.ma_cb, COUNT(*) AS so_kh
FROM customer_period_profiles p
LEFT JOIN system_users u
  ON UPPER(TRIM(u.ipcas_username)) = UPPER(TRIM(p.ma_cb))
WHERE p.ma_cb IS NOT NULL
  AND u.id IS NULL
GROUP BY p.period_key, p.ma_cb
ORDER BY so_kh DESC;
```

### Kiểm tra chi tiết theo chi nhánh

```sql
SELECT
  branch_code,
  COUNT(*) AS so_dong,
  SUM(so_du_tien_vay) AS tong_du_no,
  SUM(so_du_tien_gui) AS tong_tien_gui,
  SUM(so_du_tgtt_binh_quan) AS tong_tgtt
FROM customer_period_branch_details
WHERE period_key = '20260630'
GROUP BY branch_code
ORDER BY branch_code;
```

## 16. Hướng phát triển tiếp theo

Các việc nên làm tiếp:

- Tối ưu tốc độ báo cáo bằng index và cache summary.
- Tách bảng mapping chi nhánh/PGD để lọc nhanh hơn thay vì lọc chuỗi.
- Tạo bảng summary riêng cho Dashboard.
- Chuẩn hóa thêm file bổ sung phát sinh sau này bằng cấu hình mapping.
- Xuất Excel báo cáo.
- Cảnh báo dữ liệu sai lệch hoặc thiếu nguồn.
- Cấu hình trọng số điểm giao dịch chính trên giao diện.
- Cấu hình rule bán chéo động thay vì hard-code.
