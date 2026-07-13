# Đối chiếu cán bộ phụ trách theo User IPCAS

## Mục tiêu

Cán bộ phụ trách trong Báo cáo phải hiển thị thống nhất theo dữ liệu người dùng đã cấu hình trong hệ thống.

Chuẩn hiển thị:

```text
Tên cán bộ (Mã cán bộ - User IPCAS)
```

Ví dụ:

```text
Bùi Ngọc Hà (200902108 - LTABNHA)
```

## Logic đã chốt

### 1. Nguồn lấy cán bộ

Chỉ lấy cán bộ từ file:

```text
LN01
```

Trường dùng để đối chiếu:

```text
LN01.OFFICER_IPCAS
```

Không dùng `DP01.EMPLOYEE_NUMBER`, `DP01.EMPLOYEE_NAME`.

Không dùng `LN01.OFFICER_ID` làm khóa đối chiếu chính.

### 2. Bảng người dùng đối chiếu

Đối chiếu với bảng:

```text
system_users
```

Trường đối chiếu:

```text
system_users.ipcas_username
```

Điều kiện khớp:

```text
UPPER(TRIM(LN01.OFFICER_IPCAS)) = UPPER(TRIM(system_users.ipcas_username))
```

### 3. Nếu khớp User DB

Hệ thống lấy dữ liệu chuẩn từ User DB:

```text
ten_can_bo = system_users.full_name
officer_employee_code = system_users.employee_code
ma_cb = system_users.ipcas_username
```

Trong đó:

- `ten_can_bo`: tên cán bộ.
- `officer_employee_code`: mã cán bộ/mã nhân viên.
- `ma_cb`: User IPCAS, dùng làm khóa lọc duy nhất.

### 4. Nếu không khớp User DB

Không công nhận cán bộ đó.

Kết quả:

```text
ma_cb = NULL
ten_can_bo = NULL
officer_employee_code = NULL
```

Khách hàng được xem là chưa có cán bộ quản lý hợp lệ.

### 5. Khách hàng có nhiều khoản vay

Nếu khách hàng có nhiều khoản vay, hệ thống chỉ xét các dòng LN01 có `OFFICER_IPCAS` khớp User DB.

Sau đó chọn cán bộ của khoản vay có dư nợ lớn nhất.

## Ảnh hưởng giao diện

### Trang Báo cáo

Cột **Cán bộ quản lý** hiển thị:

```text
Tên cán bộ
Mã cán bộ - User IPCAS
```

Ví dụ:

```text
Bùi Ngọc Hà
200902108 - LTABNHA
```

### Modal chi tiết khách hàng

Hiển thị theo chuẩn:

```text
Bùi Ngọc Hà (200902108 - LTABNHA)
```

### Bộ lọc Cán bộ phụ trách

Bộ lọc chỉ có một dòng duy nhất cho mỗi User IPCAS.

Ví dụ chỉ có một option:

```text
Bùi Ngọc Hà (200902108 - LTABNHA)
```

Không còn tình trạng một cán bộ bị tách thành nhiều dòng theo mã CBTD, mã nhân viên hoặc dữ liệu cũ.

## File đã thay đổi

- `backend/app/customer_processing.py`
- `backend/app/database.py`
- `backend/app/models.py`
- `backend/app/api/customer_processing.py`
- `backend/app/api/dashboard.py`
- `frontend/src/pages/CustomerReport.jsx`
- `frontend/src/components/dashboard/CampaignList.jsx`
- `frontend/src/components/dashboard/VisualDashboard.jsx`

## Cách cập nhật kỳ dữ liệu cũ

Các kỳ đã xử lý trước khi đổi logic cần chạy lại xử lý.

Thao tác:

1. Vào **Xử lý dữ liệu khách hàng**.
2. Chọn kỳ dữ liệu.
3. Bấm **Chạy dữ liệu** hoặc **Chạy lại xử lý**.
4. Sau khi job hoàn thành, vào **Báo cáo** kiểm tra lại cột **Cán bộ quản lý** và bộ lọc **Cán bộ phụ trách**.

## Cách kiểm tra bằng SQL

Kiểm tra hồ sơ có `ma_cb` không khớp User IPCAS:

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

Nếu logic đúng sau khi chạy lại xử lý, câu SQL trên phải trả về 0 dòng cho kỳ đã chạy lại.

Kiểm tra option bộ lọc cán bộ có duy nhất theo User IPCAS:

```sql
SELECT ma_cb, MAX(ten_can_bo) AS ten_can_bo, MAX(officer_employee_code) AS officer_employee_code
FROM customer_period_profiles
WHERE period_key = '20260630'
  AND ma_cb IS NOT NULL
GROUP BY ma_cb
ORDER BY ten_can_bo, ma_cb;
```

## Kết quả test trên dữ liệu thật

Đã chạy lại xử lý kỳ:

```text
20260630
```

Job:

```text
id = 17
status = success
processed_customers = 246.720
```

Kết quả kiểm tra:

```text
customer_period_profiles:
- Tổng hồ sơ: 246.720
- Hồ sơ có cán bộ hợp lệ theo User IPCAS: 12.374
- Hồ sơ chưa có cán bộ hợp lệ: 234.346
- Số User IPCAS hợp lệ khác nhau: 112
- Số mã cán bộ hợp lệ khác nhau: 112
- Hồ sơ có ma_cb không khớp User IPCAS: 0

Bộ lọc cán bộ:
- Số option: 112
- Số value User IPCAS duy nhất: 112
```

Ví dụ sau xử lý:

```text
Bùi Ngọc Hà (200902108 - LTABNHA)
Bùi Hà Chi (201400327 - LTABHCHI)
```
