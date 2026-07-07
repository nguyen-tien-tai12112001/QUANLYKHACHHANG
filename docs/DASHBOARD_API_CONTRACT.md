# Dashboard API Contract

Tài liệu bàn giao cho **dev backend** — frontend Dashboard chỉ render JSON từ các endpoint này, không tự tính 300k khách hàng trên trình duyệt.

## Nguyên tắc

- Frontend **không** gọi `/api/imports/summary` cho Dashboard (endpoint đó dành cho Báo cáo chi tiết có phân trang).
- Response chỉ chứa **dữ liệu tổng hợp** (~50–100 KB), không gửi danh sách 300.000 KH.
- Mọi filter `ma_cn` / `ma_pgd` do backend enforce theo phân quyền (xem [AUTH_INTEGRATION.md](./AUTH_INTEGRATION.md)).

---

## `GET /api/dashboard/summary`

### Query parameters

| Param | Bắt buộc | Mô tả |
|-------|----------|--------|
| `period_key` | Có | Kỳ dữ liệu, ví dụ `20240630` |
| `ma_cn` | Không | Lọc chi nhánh |
| `ma_pgd` | Không | Lọc PGD |

Header: `Authorization: Bearer <token>` (khi đã bật auth).

### Response 200

```json
{
  "period_key": "20240630",
  "kpis": {
    "total_customers": 300000,
    "total_loan": 27600000000000,
    "total_deposit": 8500000000000,
    "total_casa": 1620000000000,
    "no_service_count": 12500
  },
  "service_penetration": [
    {
      "key": "agribank_plus",
      "label": "Agribank Plus",
      "group": "Digital",
      "count": 180000,
      "pct": 60
    }
  ],
  "officer_leaderboard": [
    {
      "code": "CB01",
      "name": "Nguyễn Văn A",
      "custCount": 450,
      "totalLoan": 500000000000,
      "totalCASA": 120000000000,
      "avgCrossSell": 3.2
    }
  ],
  "loan_type_breakdown": [
    {
      "type": "Ngắn hạn",
      "amt": 15000000000000,
      "pct": 54
    }
  ],
  "segment": {
    "cn": 250000,
    "dn": 50000,
    "cn_loan": 8000000000000,
    "dn_loan": 19600000000000
  },
  "campaign_top5": [
    {
      "ma_kh_chuan": "KH001",
      "ten_kh": "CÔNG TY ...",
      "ma_cn": "CN01",
      "ma_pgd": "PGD01",
      "loai_khach_hang": "KHDN",
      "so_du_tien_vay": 12000000000,
      "so_du_tgtt_binh_quan": 800000000,
      "ma_cb": "CB01",
      "ten_can_bo": "Nguyễn Văn A",
      "telephone": "0912345678",
      "usedCount": 2,
      "crossSellPct": 25,
      "unused": [
        { "key": "agribank_plus", "label": "Agribank Plus", "group": "Digital" }
      ]
    }
  ]
}
```

### Field notes

| Field | Frontend dùng cho |
|-------|-------------------|
| `kpis` | 4 thẻ KPI đầu trang |
| `service_penetration` | Biểu đồ thâm nhập dịch vụ |
| `officer_leaderboard` | Bảng vàng cán bộ |
| `loan_type_breakdown` | Phân bổ loại vay |
| `segment` | Cơ cấu KHCN/KHDN |
| `campaign_top5` | Bảng Top 5 tiếp cận + modal kịch bản |

`campaign_top5[].unused` — danh sách dịch vụ chưa dùng, đã sắp xếp ưu tiên theo loại KH.

### Lỗi

| HTTP | Khi nào |
|------|---------|
| 400 | Thiếu `period_key` |
| 403 | User không có quyền xem `ma_cn`/`ma_pgd` yêu cầu |
| 404 | Không có dữ liệu kỳ |

---

## `GET /api/dashboard/trends`

### Query parameters

| Param | Mặc định | Mô tả |
|-------|----------|--------|
| `periods` | 6 | Số kỳ gần nhất |
| `ma_cn` | — | Lọc chi nhánh |
| `ma_pgd` | — | Lọc PGD |

### Response 200

```json
{
  "period_keys": ["20240131", "20240229", "20240331", "20240430", "20240531", "20240630"],
  "labels": ["T01", "T02", "T03", "T04", "T05", "T06 (Hiện tại)"],
  "loans": [24.5, 25.1, 26.0, 26.5, 27.2, 27.6],
  "casa": [1.2, 1.3, 1.4, 1.45, 1.55, 1.62]
}
```

Giá trị `loans` và `casa` quy về **tỷ VNĐ**.

---

## SLA hiệu năng (300.000 KH toàn tỉnh)

| Endpoint | Mục tiêu | Ghi chú |
|----------|----------|---------|
| `/dashboard/summary` | < 3 giây | SQL aggregate, response < 100 KB |
| `/dashboard/trends` | < 2 giây | 6 query SUM theo kỳ |
| `campaign_top5` (trong summary) | < 3 giây | `ORDER BY ... LIMIT 5` trên DB |

### Cấm (anti-patterns)

- `query.all()` load toàn bộ 300k rows vào Python
- N+1 query trong officer leaderboard
- Gửi > 1000 rows JSON cho Dashboard

### Khuyến nghị SQL

- `SUM`, `COUNT`, `GROUP BY` trên `customer_period_summaries`
- Index: `(period_key)`, `(period_key, ma_cn)`, `(period_key, ma_pgd)`
- (Tùy chọn) Bảng `dashboard_cache` rebuild sau mỗi lần import

---

## Luồng frontend

```
GET /health
GET /imports/periods
GET /dashboard/summary?period_key=...&ma_cn=...
GET /dashboard/trends?periods=6&ma_cn=...
```

Frontend file tham chiếu: `frontend/src/hooks/useCustomerSummary.js`
