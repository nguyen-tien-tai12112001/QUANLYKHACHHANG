# Report API Contract

Tài liệu bàn giao cho tab **Báo cáo** (`CustomerReport`) — truy vấn chi tiết toàn bộ khách hàng đã xử lý theo kỳ, có phân trang và lọc server-side.

## Nguyên tắc

- Frontend **không** lọc lại dữ liệu trên client sau khi nhận từ API.
- Mọi filter chạy SQL trên bảng `customer_period_profiles`.
- Phân quyền CN/PGD enforce ở backend qua `get_report_branch_scope`.
- Response danh sách chỉ trả **một trang** (25–200 dòng), không gửi 300k rows.

---

## `GET /api/customer-processing/profiles`

### Query parameters

| Param | Bắt buộc | Mô tả |
|-------|----------|--------|
| `period_key` | Có | Kỳ dữ liệu, ví dụ `20240630` |
| `page` | Không | Trang (mặc định 1) |
| `page_size` | Không | 1–500 (mặc định 100) |
| `include_total` | Không | `true` để trả `total` |
| `keyword` | Không | Tên KH / CIF / mã CB / SĐT |
| `branch_code` | Không | Mã chi nhánh |
| `pgd_code` | Không | Mã PGD |
| `customer_type` | Không | `KHCN` hoặc `KHDN` |
| `loan_type` | Không | Danh sách loại vay, phân tách bằng `,` |
| `officer_code` | Không | Mã cán bộ |
| `unused_service` | Không | DV chưa dùng (AND), keys phân tách `,` |
| `used_service` | Không | DV đã dùng (OR), keys phân tách `,` |
| `loan_min` / `loan_max` | Không | Khoảng dư nợ (đồng) |
| `deposit_min` / `deposit_max` | Không | Khoảng tiền gửi CKH |
| `casa_min` / `casa_max` | Không | Khoảng TGTT bình quân |
| `service_count_min` / `service_count_max` | Không | Số dịch vụ CN05 đã dùng |
| `cross_sell_rule` | Không | `deposit_plus`, `loan_sms`, `casa_card`, `multi_branch` |
| `multi_branch` | Không | `true` / `false` |
| `no_service` | Không | `true` — KH chưa dùng DV nào |
| `sort_by` | Không | `ma_kh`, `ten_kh`, `so_du_tien_vay`, `so_du_tgtt_binh_quan`, `so_du_tien_gui`, `branch_count` |
| `sort_order` | Không | `asc` / `desc` |

### Response 200 (có `include_total=true`)

```json
{
  "items": [{ "ma_kh": "KH001", "ten_kh": "...", "branch_codes": "CN01", "...": "..." }],
  "total": 300000,
  "page": 1,
  "page_size": 25
}
```

---

## `GET /api/customer-processing/profile-summary`

Cùng bộ filter với `/profiles` (trừ phân trang/sort).

### Response 200

```json
{
  "total_customers": 300000,
  "total_loan": 27600000000000,
  "total_deposit": 8500000000000,
  "total_casa": 1620000000000,
  "no_service_customers": 12500
}
```

---

## `GET /api/customer-processing/profile-analytics`

Aggregate cho tab **Tổng hợp nhanh** — cùng bộ filter.

### Response 200

```json
{
  "period_key": "20240630",
  "kpis": {
    "total_customers": 300000,
    "total_loan": 27600000000000,
    "total_deposit": 8500000000000,
    "total_casa": 1620000000000,
    "no_service_customers": 12500
  },
  "segment": { "cn": 250000, "dn": 50000, "cn_loan": 0, "dn_loan": 0 },
  "loan_type_breakdown": [{ "type": "Ngắn hạn", "count": 1000, "amt": 0, "pct": 54 }],
  "service_penetration": [{ "key": "agribank_plus", "label": "Agribank Plus", "group": "Digital", "count": 180000, "pct": 60 }],
  "officer_top10": [{ "code": "CB01", "name": "Nguyễn Văn A", "custCount": 450, "totalLoan": 0, "totalCASA": 0, "avgCrossSell": 3.2 }]
}
```

---

## `GET /api/customer-processing/profile-filter-options`

Trả danh sách CN, PGD, loại vay, cán bộ theo kỳ + scope.

---

## SLA đề xuất (300k KH)

| Endpoint | Mục tiêu |
|----------|----------|
| `/profiles` (1 trang) | < 2 giây |
| `/profile-summary` | < 2 giây |
| `/profile-analytics` | < 3 giây |

## Quy tắc hiệu năng backend

- **Cấm** `query.all()` trên toàn bộ profiles.
- Filter `period_key` trước, sau đó mới filter phụ.
- Index đề xuất: `(period_key)`, `(period_key, loai_khach_hang)`, `(period_key, ma_cb)`.

## Phân quyền

- User tỉnh: có thể chọn CN/PGD qua query (nếu có quyền).
- User CN/PGD: backend override `branch_code`/`pgd_code` theo scope user — không bypass bằng query param.
