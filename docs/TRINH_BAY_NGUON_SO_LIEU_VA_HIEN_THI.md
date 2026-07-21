# Tài liệu trình bày C360 — Nguồn số liệu & ý nghĩa hiển thị

> Dùng để giải trình trước lãnh đạo: **số lấy từ đâu**, **ghép thế nào**, **màn hình thể hiện gì**.  
> Hệ thống: **C360 — Quản lý / phân tích khách hàng Agribank Bắc Ninh**  
> Kỳ dữ liệu minh họa: theo kỳ import (ví dụ `20260630` = 30/06/2026)  
>
> **Sổ tay Ctrl+F (tra nhanh từng ô màn hình):** [`SO_TAY_NHAT_DU_LIEU_C360.md`](./SO_TAY_NHAT_DU_LIEU_C360.md)

---

## 1. Tóm tắt một câu

Hệ thống **import 4 nhóm file nghiệp vụ IPCAS theo từng kỳ**, đối chiếu theo **mã khách hàng + chi nhánh + PGD**, lưu thành:

1. **Chi tiết theo từng nơi phát sinh** (`customer_period_branch_details`)
2. **Một hồ sơ / một mã KH** trên toàn tỉnh (`customer_period_profiles`)

Dashboard / Báo cáo đọc từ hai bảng này. Khi chọn **một chi nhánh** → lấy số **đúng tại chi nhánh đó**. Khi chọn **Tất cả** → lấy **1 mã KH = 1 lần** toàn tỉnh (không cộng trùng).

---

## 2. Các file nguồn (file “nhặt số”)

| Mã file | Tên nghiệp vụ gần đúng | Nội dung chính | Khóa ghép chính |
|---------|------------------------|----------------|-----------------|
| **DP01** | Thông tin KH & tiền gửi (tài khoản) | Mã KH, tên, loại KH, CN/PGD, số dư TK, CRAMT/DRAMT, SĐT, cán bộ DP | `MA_KH`, `MA_CN`, `MA_PGD` |
| **LN01** | Dư nợ vay | Dư nợ (`DU_NO`), loại vay, cán bộ quản lý khoản vay (`OFFICER_*`), chi nhánh vay (`BRCD`) | `CUSTSEQ` ≈ `MA_KH`, `BRCD` |
| **PF14** | Số dư tiền gửi / bình quân | CKH cuối kỳ, TGTT bình quân theo `MONTERM`, ngoại tệ + tỷ giá | `CUSTSEQ`, `TRBRCD`, `CCY` |
| **CN05** | Dịch vụ đang dùng | Cờ dùng dịch vụ: Agribank Plus, SMS, thẻ, TK số đẹp, thấu chi,… | `MA_KH`, `MA_CN` |

**File bổ sung (tùy chọn):** Bảo lãnh / OAB — gắn cờ bảo lãnh, LC, loa biến động số dư.

**Quy ước kỳ dữ liệu:** mỗi lần import gắn `period_key` dạng `yyyymmdd` (ví dụ `20260630`). Toàn bộ báo cáo luôn gắn theo **một kỳ**.

---

## 3. Cách ghép số liệu (pipeline xử lý)

```text
┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
│  DP01   │  │  LN01   │  │  PF14   │  │  CN05   │
└────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘
     │            │            │            │
     └────────────┴─────┬──────┴────────────┘
                        ▼
        Đối chiếu theo MA_KH + Chi nhánh (+ PGD từ DP01)
                        ▼
        customer_period_branch_details
        (1 dòng = 1 KH tại 1 CN + 1 PGD trong 1 kỳ)
                        ▼
        Gom theo MA_KH (toàn tỉnh)
                        ▼
        customer_period_profiles
        (1 dòng = 1 mã KH trong 1 kỳ)
```

### 3.1. Bước 1 — Import thô

Mỗi file được nạp vào bảng nguồn tương ứng (ví dụ `dp01_deposit_accounts`, `ln01_loans`, `pf14_account_balances`, `cn05_customer_services`), giữ nguyên cột nghiệp vụ.

### 3.2. Bước 2 — Tạo chi tiết theo chi nhánh/PGD

Với mỗi kỳ, hệ thống tạo bảng **`customer_period_branch_details`**:

| Phần dữ liệu | Lấy từ | Cách tính trong CN đó |
|--------------|--------|------------------------|
| Tên KH, loại KH, CN, PGD | DP01 | Theo tài khoản phát sinh tại CN/PGD |
| Tiền gửi CKH | PF14 | Cộng số dư CKH (`MONTERM > 0`) quy đổi VND |
| TGTT bình quân (CASA) | PF14 | Cộng bình quân (`MONTERM = 0`) quy đổi VND |
| Dư nợ vay, loại vay | LN01 | Cộng `DU_NO` theo CN vay |
| Cán bộ tại CN | LN01 | Cán bộ gắn khoản vay lớn nhất tại CN đó |
| Cờ dịch vụ tại CN | CN05 (+ file bổ sung) | Có / không dùng từng dịch vụ tại CN |

**Khóa dòng:** `period_key + ma_kh + branch_code + ma_pgd`

### 3.3. Bước 3 — Gom thành hồ sơ toàn tỉnh

Bảng **`customer_period_profiles`**:

| Trường hồ sơ | Cách gom |
|--------------|----------|
| `ma_kh` | 1 mã KH duy nhất / kỳ |
| `branch_codes` | Danh sách CN KH từng phát sinh (vd `2600, 2602`) |
| `so_du_tien_vay` / gửi / CASA | **Cộng tất cả CN** của KH đó |
| `loai_vay` | Ghép các loại: Thấu chi / Ngắn / Trung / Dài |
| Dịch vụ | Lấy **MAX** (đã dùng ở bất kỳ CN nào thì = đã dùng) |
| Nơi giao dịch chính | Chọn CN/PGD có **điểm gắn bó cao nhất** (xem mục 4) |
| Cán bộ phụ trách (hồ sơ) | Ưu tiên cán bộ LN01 có dư nợ lớn nhất; nếu không vay thì fallback DP01 |
| Doanh số chuyển tiền về TK | So sánh tổng số dư DP tháng này vs tháng trước (xem mục 5) |

### 3.4. Nơi giao dịch chính (điểm gắn bó)

Với mỗi CN/PGD của KH:

```text
Điểm =
  40% giá trị tài chính (vay + gửi CKH + CASA)
+ 20% doanh số (CRAMT tại chỗ)
+ 30% số dịch vụ đang dùng
+ 10% số dòng DP01 phát sinh
```

Nơi điểm cao nhất → `primary_branch_code` / `primary_pgd_*` trên hồ sơ.

---

## 4. Phân loại KHCN / KHDN trên hệ thống

Giá trị gốc lấy từ DP01 (`CUST_TYPE_NAME`), không còn chỉ `KHCN`/`KHDN` cứng.

| Nhóm hiển thị Dashboard | Loại KH trong dữ liệu |
|-------------------------|------------------------|
| **KHCN** | Chỉ **Cá nhân** |
| **KHDN** | Hộ kinh doanh, Hộ gia đình, Công ty TNHH, Công ty cổ phần, Tổ chức, HTX, DNNVV,… |

Áp dụng cho: cơ cấu tỷ trọng Dashboard, và quy tắc gợi ý thẻ / Agribank Plus (chỉ **Cá nhân**).

---

## 5. Các chỉ số đặc biệt đã chuẩn hóa nghiệp vụ

### 5.1. Doanh số chuyển tiền về TK

**Không** dùng `CRAMT` đơn thuần.

```text
Tổng số dư DP (kỳ) = SUM(current_balance × tỷ giá)
                    chỉ cộng tài khoản có số dư ≥ 0
                    (bỏ mọi TK số dư âm / thấu chi âm)

Doanh số = MAX(0, Tổng(kỳ này) − Tổng(kỳ trước))
```

- Kỳ đầu / KH mới chưa có kỳ trước → **0**
- Số dư giảm so tháng trước → **0** (chỉ đo tiền “về”)

### 5.2. Cơ hội bán chéo (Báo cáo)

| Nhãn | Điều kiện | Áp dụng |
|------|-----------|---------|
| TG lớn chưa dùng Agribank Plus | (CKH + CASA) ≥ 1 tỷ và chưa Plus | Chỉ **Cá nhân** |
| TGTT cao chưa có thẻ | CASA ≥ 500 triệu và chưa thẻ | Chỉ **Cá nhân** |
| Có dư nợ thiếu SMS nhắc nợ | Có dư nợ và chưa SMS vay | Cả CN và DN |
| ~~Nhiều CN cần quản lý chính~~ | Đã **bỏ** khỏi cơ hội bán chéo | — |

### 5.3. Phòng ban / PGD trên Dashboard

Dropdown PGD chỉ hiện mã PGD **đã khai báo trong Quản trị → Phòng ban** (`org_departments`), không lấy tên “lạ” chỉ có trong file DP01.

---

## 6. Quy tắc lọc phạm vi trên Dashboard / Báo cáo

| Người dùng chọn | Hệ thống lấy số như thế nào |
|-----------------|----------------------------|
| **Chọn tất cả** (Toàn tỉnh) | Từ `customer_period_profiles`: **1 mã KH = 1 lần**; cộng số liệu toàn tỉnh |
| **Một chi nhánh** (vd 2600) | Từ `customer_period_branch_details` **đúng `branch_code`**: dư nợ/gửi/CASA/dịch vụ **chỉ tại CN đó** |
| **Thêm lọc PGD** | Thu hẹp thêm theo `ma_pgd` trong CN đã chọn |

**Ý nghĩa khi nói chuyện với sếp:**

- Chọn CN 2600 → “Quy mô và dịch vụ **phát sinh tại chi nhánh Bắc Ninh**”.
- Chọn Tất cả → “Số lượng **mã khách hàng duy nhất** trên toàn hệ thống Bắc Ninh trong kỳ”.

---

## 7. Màn hình Dashboard — từng ô thể hiện gì

### 7.1. Bộ lọc đầu trang

| Ô | Ý nghĩa |
|---|--------|
| Kỳ dữ liệu | Kỳ import đã xử lý (vd 30/06/2026) |
| Phạm vi xem | Chi nhánh hoặc **Chọn tất cả** (toàn tỉnh) |
| Lọc PGD | Phòng giao dịch / phòng ban trong phạm vi đã chọn |
| Tag phạm vi | Nhắc đang xem toàn tỉnh hay CN/PGD nào |

### 7.2. Năm thẻ KPI phía trên

| Thẻ | Công thức / ý nghĩa | Nguồn khi chọn CN |
|-----|---------------------|-------------------|
| **Tổng số khách hàng** | Số mã KH (distinct) trong phạm vi | Distinct `ma_kh` tại CN |
| **Tổng dư nợ cho vay** | Sum dư nợ | Sum `so_du_tien_vay` tại CN |
| **Tổng tiền gửi CKH** | Sum tiền gửi có kỳ hạn (CKH) | Sum `so_du_tien_gui` tại CN |
| **Tổng CASA (TGTT bình quân)** | Sum tiền gửi thanh toán bình quân | Sum `so_du_tgtt_binh_quan` tại CN |
| **Chưa dùng dịch vụ nào** | KH không mở bất kỳ dịch vụ active nào (trong phạm vi) | Tất cả cờ DV tại CN = 0 |

Khi **Tất cả**: dùng hồ sơ tỉnh — 1 mã KH một lần.

### 7.3. Xếp hạng thâm nhập dịch vụ (bán chéo)

- Liệt kê từng dịch vụ (Agribank Plus, SMS, thẻ, TK thanh toán,…).
- **Số KH đã dùng / %** trên mẫu số phù hợp:
  - Mặc định (**độ phủ**): tổng KH trong phạm vi — áp dụng Agribank Plus, thẻ, TK số đẹp, **Tài khoản thanh toán**,…
  - **SMS nhắc nợ vay**: trên số **KH có dư nợ vay**.
  - **Tin nhắn OTT**: trên số **KH đã đăng ký Agribank Plus**.
- **Tài khoản thanh toán**: số KH có `CN05.TKTT_SO_TK > 0` / tổng KH phạm vi.
- Mục đích: thấy dịch vụ nào “thâm nhập” cao/thấp để định hướng bán chéo.

### 7.4. Bảng vàng cán bộ tín dụng

- **Chọn chi nhánh:** xếp theo dư nợ / CASA / bán chéo tại CN đó (`branch_details`).
- **Chọn tất cả:** xếp theo hồ sơ toàn tỉnh (`profiles`, 1 KH = 1 lần).
- Top tối đa 20 cán bộ.
- Cán bộ lấy từ LN01 (fallback DP01 trên hồ sơ khi không vay).

### 7.5. Xu hướng tăng trưởng (nhiều kỳ)

- Trục thời gian: các kỳ gần nhất (vd 6 kỳ).
- Hai đường: **Dư nợ** và **CASA**.
- Có chọn CN → từng kỳ lấy số **đúng CN đó** (không mang số CN khác của cùng KH).

### 7.6. Phân bổ dư nợ theo loại vay

- Thấu chi / Ngắn / Trung / Dài (từ `LOAN_TYPE` LN01).
- Theo CN đã chọn: chỉ khoản vay có `BRCD` = CN đó.

### 7.7. Cơ cấu tỷ trọng KHCN vs KHDN

| Phần | Ý nghĩa |
|------|--------|
| Cơ cấu số lượng | % / số KH cá nhân vs doanh nghiệp trong phạm vi |
| Cơ cấu dư nợ | Phân bổ dư nợ giữa hai nhóm |

Đã theo **từng CN** khi lọc CN; theo **toàn tỉnh** khi Chọn tất cả.

### 7.8. Top 5 KH ưu tiên tiếp cận (bán chéo trong ngày)

- Ưu tiên KH có **tài sản lớn** nhưng **ít dịch vụ** (tiềm năng bán thêm).
- Trong phạm vi CN: tính tài sản / dịch vụ **tại CN đó**.

---

## 8. Màn hình Báo cáo khách hàng — thể hiện gì

### 8.1. Bảng danh sách

Mỗi dòng = **1 mã KH trong kỳ**, các cột chính:

| Cột | Ý nghĩa |
|-----|--------|
| Mã KH chuẩn | Mã KH nghiệp vụ (`MA_KH`) |
| Tên KH | Từ DP01 |
| Loại KH | Cá nhân / công ty / hộ… |
| Chi nhánh / PGD | Các nơi KH từng phát sinh |
| Dư nợ / CKH / CASA | Tổng trên hồ sơ (toàn nơi phát sinh), hoặc theo bộ lọc báo cáo |
| Doanh số chuyển tiền về TK | Công thức so tháng (mục 5.1) |
| Cán bộ phụ trách | Cán bộ chính trên hồ sơ |
| Lưới dịch vụ | Các dịch vụ đã/chưa dùng |
| Cơ hội bán chéo | Nhãn quy tắc mục 5.2 |

### 8.2. Modal chi tiết khách hàng

| Khối | Nội dung |
|------|----------|
| Tổng quan | Dư nợ, CKH, CASA, SĐT, cán bộ, doanh số chuyển về TK |
| Tab Dịch vụ | Chi tiết từng dịch vụ đã/chưa |
| Tab Chi nhánh / PGD | **Số liệu từng CN/PGD** (đây là lớp `branch_details`) |
| Tab Lịch sử qua kỳ | So sánh các kỳ |

### 8.3. Nhóm thống kê báo cáo

- Tiềm năng bán chéo, tiền gửi lớn, dư nợ lớn, đa chi nhánh, so sánh kỳ,…  
  (lấy từ cùng bộ hồ sơ / nhóm đã định nghĩa trên backend/frontend).

---

## 9. Quản trị hệ thống (liên quan số liệu)

| Màn | Vai trò với số liệu báo cáo |
|-----|----------------------------|
| Phòng ban | Danh mục CN/PGD chính thức; Dashboard chỉ hiện PGD có trong danh mục |
| Chi nhánh / User / Vai trò | Phân quyền xem tỉnh / CN / PGD |
| Kho dữ liệu / Import | Nạp DP01, LN01, PF14, CN05 theo kỳ |
| Xử lý dữ liệu KH | Chạy job tạo `branch_details` + `profiles` |

---

## 10. Sơ đồ “Hỏi số nào → Trả lời thế nào” (cho buổi trình bày)

| Câu hỏi lãnh đạo thường gặp | Trả lời ngắn |
|-----------------------------|--------------|
| Tổng KH toàn tỉnh kỳ này? | Chọn **Tất cả** → KPI Tổng số KH = số **mã KH duy nhất** |
| Quy mô CN Bắc Ninh (2600)? | Chọn phạm vi **2600** → KPI/thâm nhập/cơ cấu = **phát sinh tại 2600** |
| Ai là cán bộ giỏi dư nợ? | Bảng vàng: chọn CN → tại CN; **Tất cả** → toàn tỉnh |
| Dịch vụ nào còn mỏng? | Biểu đồ thâm nhập + cơ hội bán chéo trên Báo cáo |
| KH dùng dịch vụ ở đâu? | Modal KH → tab Chi nhánh/PGD + nơi giao dịch chính |
| Doanh số chuyển tiền về TK là gì? | Chênh lệch số dư DP tháng này − tháng trước (bỏ TK âm), chỉ lấy phần tăng |

---

## 11. Ranh giới cần nói rõ với sếp (tránh hiểu nhầm)

1. **Số liệu theo kỳ snapshot** (cuối tháng/file), không phải realtime từng giây.  
2. **Một KH đa chi nhánh** khi xem toàn tỉnh vẫn là **1 khách**; khi xem từng CN thì đếm/cộng **phần tại CN đó**.  
3. Một số dịch vụ trên UI đánh dấu *pending* (chưa có nguồn file) — chưa đưa vào thâm nhập/thống kê active.  
4. Cán bộ hồ sơ (Báo cáo) có thể khác cán bộ từng dòng CN nếu KH vay nhiều nơi / hoặc chỉ có cán bộ trên DP01.  
5. Tên PGD trên Dashboard ưu tiên **danh mục tổ chức**; tên trong file DP01 chỉ dùng khi cần.

---

## 12. Checklist trình bày (5 phút)

1. **Nguồn:** 4 file DP01–LN01–PF14–CN05 theo kỳ.  
2. **Ghép:** theo mã KH + CN/PGD → chi tiết CN → gom hồ sơ tỉnh.  
3. **Lọc:** Tất cả = tổng mã KH tỉnh; chọn CN = số tại CN.  
4. **Dashboard:** KPI → thâm nhập → bảng vàng → xu hướng → loại vay → cơ cấu CN/DN → top bán chéo.  
5. **Báo cáo:** danh sách KH + cơ hội bán chéo + chi tiết từng CN trong modal.

---

*Tài liệu bám theo logic code hiện tại của hệ thống C360 (backend `customer_processing` / `dashboard`, frontend Dashboard & Báo cáo khách hàng). Có thể bổ sung số liệu minh họa thực tế của kỳ gần nhất khi deme live.*
