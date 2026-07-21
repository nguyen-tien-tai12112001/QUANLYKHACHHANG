# Sổ tay nhặt dữ liệu C360 — Ctrl+F

> **Mục đích:** Tra nhanh khi deme/trình bày: **chữ trên màn hình → lấy từ đâu → bảng nào → cột file nào**.  
> **Cách dùng:** `Ctrl+F` gõ thẻ / cột / mã file (`DP01`, `LN01`, `PF14`, `CN05`, `CKH`, `CASA`…).  
> **Hệ thống:** C360 — Phân tích khách hàng Agribank Bắc Ninh  
> **Tài liệu liên quan:** `TRINH_BAY_NGUON_SO_LIEU_VA_HIEN_THI.md`, `TU_DIEN_DU_LIEU_BAO_CAO.md`

---

## MỤC LỤC NHANH (gõ từ khóa)

| Gõ Ctrl+F | Nhảy tới |
|-----------|----------|
| `4 FILE` `DP01` `LN01` `PF14` `CN05` | Cách nhặt từ 4 file nguồn |
| `DỮ LIỆU CHÍNH` `hồ sơ KH` | Các trường KH chính trên hệ thống |
| `profiles` `branch_details` | Hai bảng kết quả sau xử lý |
| `Tổng số khách hàng` `Tổng dư nợ` `CKH` `CASA` | 5 thẻ KPI Dashboard |
| `Thâm nhập` `OTT` `SMS nhắc` `TK thanh toán` | Xếp hạng dịch vụ + mẫu số |
| `Bảng vàng` | Cán bộ tín dụng |
| `Chính` `Phụ` | Nơi giao dịch chính |
| `Báo cáo` `Doanh số chuyển tiền` | Báo cáo KH |
| `Tất cả` `chi nhánh` `2600` | Quy tắc lọc phạm vi |
| `Hiển thị tiền` `tỷ` | Cách làm tròn tiền trên thẻ |

---

## 1. DỮ LIỆU CHÍNH VỀ KHÁCH HÀNG

| Từ khóa | `DỮ LIỆU CHÍNH` `hồ sơ KH` |

Sau khi **Import 4 file IPCAS theo kỳ** + bấm **Xử lý dữ liệu KH**, mỗi khách hàng trong một kỳ có **một bộ số chuẩn** lưu trong DB. Màn hình Dashboard / Báo cáo **chỉ đọc bộ này** (không đọc lại 4 file thô mỗi lần mở).

### 1.1. Nhận diện & phân loại

| Trường trên hệ thống | Ý nghĩa | File / cột gốc |
|----------------------|---------|----------------|
| `ma_kh` | Mã KH chuẩn (gom toàn tỉnh) | **DP01** `MA_KH` (khóa chính) |
| `ten_kh` | Tên khách hàng | **DP01** `TEN_KH` |
| `loai_khach_hang` | Cá nhân / Hộ KD / Tổ chức… | **DP01** `CUST_TYPE_NAME` (fallback `CUST_TYPE`) |
| `telephone` | Số điện thoại | **DP01** `TELEPHONE` |
| `branch_codes` | Danh sách CN có phát sinh | Ghép **DP01** `MA_CN` + **LN01** `BRCD` + **PF14** `TRBRCD` + **CN05** `MA_CN` |
| `pgd_codes` | Danh sách PGD | **DP01** `MA_PGD` (+ tên `TEN_PGD`) |
| `primary_branch_code` / `primary_pgd_*` | CN/PGD **chính** của KH | Điểm gắn bó (mục 5) |
| `ma_cb` / `ten_can_bo` | Cán bộ trên hồ sơ | **LN01** `OFFICER_IPCAS`/`OFFICER_NAME` (vay lớn nhất); không vay → **DP01** `EMPLOYEE_*` |

### 1.2. Số tiền & tín dụng (4 chỉ tiêu lõi)

| Trường DB / cột Báo cáo | Hiển thị thường gặp | Cách nhặt | File / cột gốc |
|-------------------------|---------------------|-----------|----------------|
| `so_du_tien_vay` | Dư nợ / Tổng dư nợ | `SUM(DU_NO)` theo KH (và theo CN khi lọc CN) | **LN01** `DU_NO` |
| `loai_vay` | Loại vay | Map `LOAN_TYPE` → Thấu chi / Ngắn / Trung / Dài (ghép `/`) | **LN01** `LOAN_TYPE` |
| `thau_chi` | Có thấu chi | Có khoản `Thấu chi trên TK khách hàng` | **LN01** `LOAN_TYPE` |
| `so_du_tien_gui` | Tiền gửi **CKH** | `SUM(MONTHLYENDBALANCE × tỷ giá)` nếu **`MONTERM > 0`** | **PF14** |
| `so_du_tgtt_binh_quan` | **CASA** / TGTT bình quân | `SUM(AVERAGEBALANCE × tỷ giá)` nếu **`MONTERM = 0`** | **PF14** |
| `doanh_so_chuyen_tien_ve_tk` | Doanh số chuyển tiền về TK | `MAX(0, số dư DP kỳ này − kỳ trước)` | **DP01** `CURRENT_BALANCE` (mục 9) |

**Tỷ giá ngoại tệ:** lấy từ **DP01** `TYGIA` / `CCY` → bảng `customer_period_exchange_rates` (thiếu thì coi = 1).

### 1.3. Cờ dịch vụ (dùng / chưa dùng)

| Trường DB | Tên trên màn | File / cột CN05 |
|-----------|--------------|-----------------|
| `agribank_plus` | Agribank Plus | `DK_AGRIBANK_PLUS` |
| `tin_nhan_ott` | Tin nhắn OTT | `DK_AGRIBANK_PLUS_OTT` |
| `sms_nhac_no_vay` | SMS nhắc nợ vay | `VV_SMS_TIEN_VAY` |
| `sms_tien_gui` | SMS tiền gửi | `TG_SMS_TIEN_GUI` |
| `the_ghi_no_noi_dia` | Thẻ ghi nợ nội địa | `THE_GHI_NO_NOI_DIA` |
| `the_td_quoc_te` | Thẻ TD quốc tế | `THE_TIN_DUNG_QUOC_TE` |
| `the_td_loc_viet` | Thẻ TD Lộc Việt | `THE_TIN_DUNG_NOI_DIA` |
| `tk_so_dep` | TK số đẹp | `TKTT_TK_SODEP` |
| `e_banking` | (cờ nội bộ từ SMS Banking) | `SMS_BANKING` |

**Đặc biệt (Dashboard, đọc live CN05):**  
**Tài khoản thanh toán** = đếm KH có **`CN05.TKTT_SO_TK > 0`** trong phạm vi — **không** lưu sẵn trên `profiles`.

Quy tắc cờ trên hồ sơ tỉnh: **MAX** qua các CN (CN nào có = đã dùng).

---

## 2. CÁCH NHẶT TỪ 4 FILE IPCAS

| Từ khóa | `4 FILE` `DP01` `LN01` `PF14` `CN05` |

### 2.1. Tên file & kỳ

```text
{mã_CN}_{loại}_{yyyymmdd}.csv|xlsx
ví dụ: 2600_DP01_20260630.csv , 2602_LN01_20260630.xlsx
```

| Mã | Tên nghiệp vụ | Bảng thô sau import | Vai trò ngắn |
|----|---------------|---------------------|--------------|
| **DP01** | Thông tin KH + TK tiền gửi | `dp01_deposit_accounts` | Xương KH, CN/PGD, SĐT, CR/DR, tỷ giá, doanh số chuyển tiền |
| **LN01** | Khoản vay | `ln01_loans` | Dư nợ, loại vay, thấu chi, cán bộ tín dụng |
| **PF14** | Số dư / bình quân tiền gửi | `pf14_account_balances` | **CKH** (`MONTERM>0`) + **CASA** (`MONTERM=0`) |
| **CN05** | Dịch vụ KH | `cn05_customer_services` | Cờ Plus, OTT, SMS, thẻ, TK số đẹp (+ TKTT trên Dashboard) |

`period_key` = `yyyymmdd` trên tên file (vd `20260630`). Mọi số trên màn gắn **một kỳ**.

**Bắt buộc đủ 4 loại** mới xử lý được kỳ. File bổ sung (Bảo lãnh / OAB) chỉ gắn thêm vài cờ DV.

### 2.2. Luồng xử lý (nói với sếp trong 20 giây)

```text
Import 4 file → bảng thô
       ↓
Xử lý dữ liệu KH (customer_processing.py)
       ↓
  (1) Tỷ giá từ DP01
  (2) customer_period_branch_details   ← 1 dòng = 1 KH + 1 CN (+ PGD)
  (3) customer_period_profiles         ← 1 dòng = 1 mã KH toàn tỉnh
  (4) Cập nhật doanh số chuyển tiền (so DP kỳ này − kỳ trước)
       ↓
Dashboard / Báo cáo chỉ đọc (2)+(3)  [+ CN05.TKTT live]
```

**Khóa ghép chung:** mã KH  
- DP01 / CN05: `MA_KH`  
- LN01 / PF14: `CUSTSEQ` ≈ `MA_KH`  
- CN: DP01 `MA_CN` · LN01 `BRCD` · PF14 `TRBRCD` · CN05 `MA_CN`

> **Lưu ý:** Chỉ KH **có trong DP01** mới được kéo đầy đủ dòng LN/PF/CN vào `branch_details`. KH chỉ xuất hiện ở file khác mà không có DP01 sẽ không vào xương hồ sơ chuẩn.

### 2.3. Từng file nhặt cái gì (chi tiết)

#### DP01 — Thông tin KH & tiền gửi

| Nhặt | Cột file | Đưa vào |
|------|----------|---------|
| Mã / tên / loại KH | `MA_KH`, `TEN_KH`, `CUST_TYPE_NAME` | profiles + branch_details |
| CN, PGD | `MA_CN`, `MA_PGD`, `TEN_PGD` | skeleton CN/PGD |
| SĐT | `TELEPHONE` | profiles |
| Doanh số CR / DR tại CN | `CRAMT`, `DRAMT` | branch_details (`doanh_so_cramt` / `dramt`) — dùng điểm “Chính” |
| Tỷ giá | `CCY`, `TYGIA` | `customer_period_exchange_rates` |
| Doanh số chuyển tiền về TK | `CURRENT_BALANCE` (MoM, mục 9) | profiles |
| Cán bộ fallback | `EMPLOYEE_NUMBER`, `EMPLOYEE_NAME` | profiles khi không có vay |

**Không** lấy CKH từ số dư DP01 cho Báo cáo/Dashboard — CKH lấy từ **PF14**.

#### LN01 — Khoản vay

| Nhặt | Cột file | Đưa vào |
|------|----------|---------|
| Dư nợ | `DU_NO` | `so_du_tien_vay` (SUM) |
| Loại vay | `LOAN_TYPE` | `loai_vay`, cờ `thau_chi` |
| Chi nhánh vay | `BRCD` | gắn theo CN |
| Cán bộ | `OFFICER_IPCAS` / `OFFICER_ID`, `OFFICER_NAME` | CB = khoản có `DU_NO` lớn nhất |

Chuỗi loại vay map trong code:

- `Thấu chi trên TK khách hàng` → Thấu chi  
- `Vay ngắn hạn (TK 211)` → Ngắn hạn  
- `Vay trung hạn (TK 212)` → Trung hạn  
- `Vay dài hạn (TK 213)` → Dài hạn  

#### PF14 — CKH & CASA

| Nhặt | Điều kiện `MONTERM` | Cột số | Đưa vào |
|------|---------------------|--------|---------|
| **CKH** (tiền gửi có kỳ hạn) | **`MONTERM > 0`** | `MONTHLYENDBALANCE × tỷ giá` | `so_du_tien_gui` |
| **CASA** (TGTT bình quân) | **`MONTERM = 0`** | `AVERAGEBALANCE × tỷ giá` | `so_du_tgtt_binh_quan` |
| Chi nhánh | — | `TRBRCD` | gắn theo CN |
| KH | — | `CUSTSEQ` | = `ma_kh` |

```text
MONTERM > 0  →  cộng vào CKH
MONTERM = 0  →  cộng vào CASA / TGTT BQ
```

#### CN05 — Dịch vụ

| Nhặt | Cột file | Field DB |
|------|----------|----------|
| Agribank Plus | `DK_AGRIBANK_PLUS` | `agribank_plus` |
| OTT | `DK_AGRIBANK_PLUS_OTT` | `tin_nhan_ott` |
| SMS vay | `VV_SMS_TIEN_VAY` | `sms_nhac_no_vay` |
| SMS gửi | `TG_SMS_TIEN_GUI` | `sms_tien_gui` |
| Thẻ GN nội địa | `THE_GHI_NO_NOI_DIA` | `the_ghi_no_noi_dia` |
| Thẻ TD quốc tế | `THE_TIN_DUNG_QUOC_TE` | `the_td_quoc_te` |
| Thẻ Lộc Việt | `THE_TIN_DUNG_NOI_DIA` | `the_td_loc_viet` |
| TK số đẹp | `TKTT_TK_SODEP` | `tk_so_dep` |
| TK thanh toán (Dashboard) | `TKTT_SO_TK > 0` | đếm live, không lưu profiles |

Ghép theo `MA_KH` + `MA_CN`. Trên hồ sơ tỉnh: MAX các CN.

### 2.4. Bảng “một nhìn” — chỉ tiêu ↔ file

| Chỉ tiêu nói với sếp | File chính | Cột chính |
|----------------------|------------|-----------|
| Có bao nhiêu KH? | Union sau ghép (xương DP01) | `MA_KH` |
| Dư nợ bao nhiêu? | **LN01** | `DU_NO` |
| Tiền gửi CKH? | **PF14** | `MONTHLYENDBALANCE` + `MONTERM>0` |
| CASA / TGTT BQ? | **PF14** | `AVERAGEBALANCE` + `MONTERM=0` |
| Dùng Plus / OTT / SMS / thẻ? | **CN05** | cột cờ tương ứng |
| Có TKTT không? | **CN05** | `TKTT_SO_TK` |
| Cán bộ vay? | **LN01** | `OFFICER_*` |
| CN/PGD chính? | Tính từ 4 file | điểm engagement (mục 5) |
| Doanh số tiền về TK? | **DP01** | chênh `CURRENT_BALANCE` 2 kỳ |

---

## 3. HAI BẢNG KẾT QUẢ (sau “Xử lý dữ liệu KH”)

| Từ khóa | `profiles` `branch_details` |

Code: `backend/app/customer_processing.py`

### 3.1. `customer_period_branch_details`

```text
Khóa: period_key + ma_kh + branch_code + ma_pgd
→ 1 KH tại 1 CN (kèm PGD) trong 1 kỳ
```

| Phần | File nhặt | Cách tính tại CN đó |
|------|-----------|---------------------|
| Tên, loại, PGD | DP01 | Theo phát sinh tại CN |
| CKH / CASA | PF14 | SUM đúng `TRBRCD` = CN |
| Dư nợ / loại vay | LN01 | SUM `DU_NO` theo `BRCD` |
| Cán bộ tại CN | LN01 | CB khoản vay lớn nhất tại CN |
| Cờ dịch vụ | CN05 | Có/không tại `MA_CN` |
| CRAMT / DRAMT | DP01 | SUM tại CN (phục vụ điểm Chính) |

### 3.2. `customer_period_profiles`

```text
Khóa: period_key + ma_kh
→ 1 mã KH = 1 dòng toàn tỉnh / kỳ
```

| Trường | Cách gom toàn tỉnh |
|--------|-------------------|
| Dư nợ / CKH / CASA | **SUM** mọi CN |
| Cờ dịch vụ | **MAX** (CN nào dùng cũng = đã dùng) |
| `branch_codes` / `pgd_codes` | Danh sách nơi phát sinh |
| `primary_*` | CN/PGD điểm gắn bó cao nhất |
| Cán bộ hồ sơ | LN01 dư nợ lớn nhất toàn tỉnh; không vay → DP01 |
| Doanh số chuyển tiền | Sau bước MoM từ DP01 |

### 3.3. Phạm vi lọc trên màn hình

| Người dùng chọn | Đọc từ | Ý nghĩa |
|-----------------|--------|---------|
| **Tất cả** | `profiles` | Mã KH **duy nhất** toàn Bắc Ninh |
| **Một CN** (vd 2600) | `branch_details` lọc `branch_code` | Chỉ phần phát sinh **tại CN đó** |
| **+ PGD** | Thu hẹp `ma_pgd` | Đúng phòng/PGD trong CN |

---

## 4. CHÍNH / PHỤ (Báo cáo — cột Mã CN, PGD)

| Từ khóa | `Chính` `Phụ` `primary_branch` |

**Không phải** cấp tổ chức ngân hàng (CN mẹ/con).

| Nhãn | Nghĩa |
|------|--------|
| **Chính** (đỏ) | CN/PGD **nơi giao dịch chính** của KH (`primary_*`) |
| **Phụ** | Các nơi khác cùng KH còn quan hệ |

**Điểm chọn nơi chính** (trên từng dòng branch_details):

```text
40% quy mô tài chính (vay + CKH + CASA) / 1e6
+ 20% doanh số CRAMT / 1e6
+ 30% số dịch vụ đang dùng × 10
+ 10% số dòng DP01 × 2
```

---

## 5. DASHBOARD — TỪNG Ô NHẶT Ở ĐÂU

API: `GET /api/dashboard/summary` · `GET /api/dashboard/trends`  
Code: `backend/app/api/dashboard.py`

### 5.1. Năm thẻ KPI

| Chữ trên màn | API / logic | Bảng khi **Tất cả** | Bảng khi **chọn CN** | File gốc |
|--------------|-------------|---------------------|----------------------|----------|
| **Tổng số khách hàng** | `kpis.total_customers` | COUNT profiles | COUNT distinct `ma_kh` trong branch_details | Xương DP01+… |
| **Tổng dư nợ cho vay** | `kpis.total_loan` | SUM `so_du_tien_vay` | SUM tại CN | **LN01** `DU_NO` |
| **Tổng tiền gửi CKH** | `kpis.total_deposit` | SUM `so_du_tien_gui` | SUM tại CN | **PF14** CKH |
| **Tổng CASA (TGTT bình quân)** | `kpis.total_casa` | SUM `so_du_tgtt_binh_quan` | SUM tại CN | **PF14** TGTT |
| **Chưa dùng dịch vụ nào** | `kpis.no_service_count` | Mọi cờ DV active = 0 | Cùng logic tại CN | **CN05**/LN01 |

### 5.2. Xếp hạng thâm nhập dịch vụ (bán chéo)

| Chữ trên màn | Tử số (đã dùng) | Mẫu số (độ phủ) | File / cột nguồn |
|--------------|-----------------|-----------------|------------------|
| **Tài khoản thanh toán** | KH có `CN05.TKTT_SO_TK > 0` | **Tổng KH** phạm vi | CN05 `TKTT_SO_TK` |
| **Agribank Plus** | `agribank_plus > 0` | **Tổng KH** | CN05 `DK_AGRIBANK_PLUS` |
| **Tin nhắn OTT** | `tin_nhan_ott > 0` **và** đã Plus | **KH Agribank Plus** | CN05 `DK_AGRIBANK_PLUS_OTT` |
| **SMS nhắc nợ vay** | `sms_nhac_no_vay > 0` **và** có dư nợ | **KH vay** | CN05 `VV_SMS_TIEN_VAY` |
| **SMS tiền gửi** | `sms_tien_gui > 0` | **Tổng KH** | CN05 `TG_SMS_TIEN_GUI` |
| **Thẻ ghi nợ nội địa** | `the_ghi_no_noi_dia > 0` | **Tổng KH** | CN05 |
| **TK số đẹp** | `tk_so_dep > 0` | **Tổng KH** | CN05 `TKTT_TK_SODEP` |
| **Thấu chi** | `thau_chi > 0` | **Tổng KH** | LN01 loại thấu chi |
| **Thẻ TD quốc tế / Lộc Việt** | cột thẻ tương ứng | **Tổng KH** | CN05 thẻ |

**Nói với sếp về mẫu số:** mặc định = toàn bộ KH trong phạm vi; hẹp hơn khi có điều kiện tiên quyết (OTT/Plus, SMS vay/KH vay).

### 5.3. Bảng vàng Cán bộ tín dụng

| Từ khóa | `Bảng vàng` `cán bộ` |

| Phạm vi | Nguồn | Xếp hạng |
|---------|-------|----------|
| **Chọn CN** | `branch_details` tại CN, group `ma_cb` | Top 20 dư nợ tại CN |
| **Tất cả** | `profiles` group `ma_cb` | Top 20 dư nợ toàn tỉnh (1 KH = 1 lần) |

### 5.4. Xu hướng / loại vay / KHCN–KHDN / Top 5

| Ô | Nguồn |
|---|--------|
| Xu hướng dư nợ / CASA | SUM theo kỳ từ profiles hoặc branch_details |
| Phân bổ loại vay | **LN01** `LOAN_TYPE` |
| KHCN / KHDN | DP01 loại KH (KHCN = chỉ **Cá nhân**) |
| Top 5 ưu tiên | Tài sản lớn + ít DV trong phạm vi |

---

## 6. BẢNG MAPPING DỊCH VỤ (CN05) — TRA CỘT GỐC

| Hiển thị | Field DB | Cột file CN05 / note |
|----------|----------|----------------------|
| TK thanh toán (Dashboard) | đếm live CN05 | `TKTT_SO_TK > 0` |
| TK số đẹp | `tk_so_dep` | `TKTT_TK_SODEP` |
| Agribank Plus | `agribank_plus` | `DK_AGRIBANK_PLUS` |
| Tin nhắn OTT | `tin_nhan_ott` | `DK_AGRIBANK_PLUS_OTT` |
| SMS nhắc nợ vay | `sms_nhac_no_vay` | `VV_SMS_TIEN_VAY` |
| SMS tiền gửi | `sms_tien_gui` | `TG_SMS_TIEN_GUI` |
| Thẻ ghi nợ nội địa | `the_ghi_no_noi_dia` | `THE_GHI_NO_NOI_DIA` |
| Thẻ TD quốc tế | `the_td_quoc_te` | `THE_TIN_DUNG_QUOC_TE` |
| Thẻ TD Lộc Việt | `the_td_loc_viet` | `THE_TIN_DUNG_NOI_DIA` |
| Thấu chi | `thau_chi` | LN01 loại thấu chi |

Một số DV trên UI = **Chờ DL** (chưa có cột nguồn chính thức): POS, BATD,… — xem `TU_DIEN_DU_LIEU_BAO_CAO.md`.

---

## 7. BÁO CÁO KHÁCH HÀNG — CỘT NHẶT Ở ĐÂU

Nguồn: **`customer_period_profiles`** (+ khi lọc CN: số tiền patch theo `branch_details`).  
API: `/api/customer-processing/profiles` (`sort_by` / `sort_dir` = **toàn bộ** tập đã lọc).

| Cột trên màn | Field DB | File gốc |
|--------------|----------|----------|
| Mã KH chuẩn | `ma_kh` | DP01 `MA_KH` |
| Tên KH | `ten_kh` | DP01 `TEN_KH` |
| Loại KH | `loai_khach_hang` | DP01 |
| Mã CN (+ Chính/Phụ) | `branch_codes` + `primary_branch_code` | Ghép 4 file |
| PGD | `pgd_codes` + `primary_pgd_*` | DP01 |
| Số dư tiền vay | `so_du_tien_vay` | LN01 |
| Số dư gửi CKH | `so_du_tien_gui` | PF14 |
| TGTT bình quân | `so_du_tgtt_binh_quan` | PF14 |
| Doanh số chuyển tiền về TK | `doanh_so_chuyen_tien_ve_tk` | DP01 MoM |
| Cán bộ quản lý | `ma_cb` / `ten_can_bo` | LN01 (+ fallback DP01) |
| Tab Chi nhánh/PGD (modal) | `branch_details` | API branch-details |

---

## 8. DOANH SỐ CHUYỂN TIỀN VỀ TK

| Từ khóa | `Doanh số chuyển tiền` `CURRENT_BALANCE` |

**Không** lấy `CRAMT` đơn thuần.

```text
Tổng DP kỳ = SUM(current_balance × tỷ giá) chỉ TK có số dư ≥ 0
Doanh số   = MAX(0, Tổng kỳ này − Tổng kỳ trước)
```

- Kỳ đầu / KH mới → **0**  
- Số dư giảm → **0** (chỉ đo tiền “về”)

---

## 9. CƠ HỘI BÁN CHÉO (nhãn báo cáo)

| Nhãn | Điều kiện | Ai áp dụng |
|------|-----------|------------|
| TG lớn chưa Agribank Plus | (CKH+CASA) ≥ 1 tỷ & chưa Plus | Chỉ **Cá nhân** |
| TGTT cao chưa thẻ | CASA ≥ 500 triệu & chưa thẻ | Chỉ **Cá nhân** |
| Có dư nợ thiếu SMS nhắc nợ | Có dư nợ & chưa SMS vay | Cả CN & DN |

---

## 10. HIỂN THỊ TIỀN (thẻ KPI / biểu đồ)

| Từ khóa | `tỷ` `compactMoney` |

- Tooltip: số đầy đủ (`vi-VN`) + `đ`.  
- Rút gọn: chia **10⁹** (tỷ đồng), có phân cách nghìn (vd `3.020 tỷ`, `28.476.601 tỷ`).

Code: `frontend/src/utils/customerMetrics.js` → `compactMoney`.

---

## 11. DROPDOWN PGD / PHÒNG BAN

PGD trên Dashboard chỉ hiện mã có trong **Quản trị → Phòng ban** (`org_departments`).

---

## 12. HỎI NHANH — TRẢ LỜI NHANH

| Sếp hỏi | Trả lời |
|---------|---------|
| Số từ đâu ra? | 4 file IPCAS theo kỳ → xử lý → profiles / branch_details |
| CKH khác CASA thế nào? | Cùng PF14: `MONTERM>0` = CKH; `=0` = CASA (average) |
| Tổng KH toàn tỉnh? | **Tất cả** → COUNT `profiles` |
| Quy mô CN 2600? | Chọn **2600** → đọc `branch_details` tại 2600 |
| OTT 63% trên ai? | Trên **KH Agribank Plus** |
| SMS nhắc nợ mẫu số? | **KH vay**, không phải toàn CN |
| TK thanh toán? | CN05 **`TKTT_SO_TK`** |
| Chính/Phụ? | Nơi giao dịch **chính của KH**, không phải HQ |
| Doanh số chuyển tiền? | Chênh số dư DP tháng này − tháng trước (≥0) |

---

## 13. RANH GIỚI CẦN NÓI RÕ

1. Snapshot **theo kỳ file**, không realtime.  
2. 1 KH nhiều CN: **Tất cả** = 1 khách; **CN** = phần tại CN.  
3. Một số DV *pending* chưa vào thâm nhập.  
4. CB hồ sơ có thể khác CB từng dòng CN.  
5. Sort Báo cáo = toàn bộ tập đã lọc (server).  
6. Bảng `customer_period_summaries` (summarizer) là đường cũ — **màn hình chính dùng** `profiles` + `branch_details`.

---

## 14. CHECKLIST DEMO 5 PHÚT

1. Nguồn: **DP01 · LN01 · PF14 · CN05** theo kỳ.  
2. Ghép → `branch_details` → `profiles`.  
3. Lọc: Tất cả vs CN.  
4. Dashboard: KPI → thâm nhập (nhắc mẫu số) → bảng vàng → xu hướng.  
5. Báo cáo: danh sách + Chính/Phụ + bán chéo + tab CN/PGD.

---

## 15. FILE CODE / DOC

```text
backend/app/customer_processing.py     # nhặt & gom từ 4 file → profiles / branch_details
backend/app/imports/importer.py        # import thô 4 file
backend/app/api/dashboard.py           # KPI, thâm nhập, bảng vàng
backend/app/api/customer_processing.py # báo cáo
frontend/src/pages/Dashboard.jsx
frontend/src/pages/CustomerReport.jsx
frontend/src/utils/customerMetrics.js
docs/TRINH_BAY_NGUON_SO_LIEU_VA_HIEN_THI.md
docs/TU_DIEN_DU_LIEU_BAO_CAO.md
docs/SO_TAY_NHAT_DU_LIEU_C360.md       # ← sổ tay này
```

---

*Cập nhật: làm rõ **dữ liệu chính KH** + **cách nhặt từ 4 file** theo pipeline `customer_processing` (CKH/CASA PF14 + MONTERM, DN LN01, DV CN05, MoM DP01).*
