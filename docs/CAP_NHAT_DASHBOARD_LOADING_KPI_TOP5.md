# Cập nhật Dashboard: KPI, loading và Top 5 khách hàng ưu tiên

## Mục tiêu

Tối ưu lại trang Dashboard để:

- Các card KPI không bị chồng chữ hoặc tràn số dài.
- Số tiền lớn hiển thị dạng rút gọn như `24,5 nghìn tỷ`, `850 tỷ`, `120 triệu`.
- Khi tải dữ liệu có loading rõ ràng để người dùng biết hệ thống đang xử lý.
- Bảng **Top 5 Khách hàng ưu tiên tiếp cận** bỏ cột thao tác và thay bằng cột thông tin hữu ích hơn.

## Nội dung đã chỉnh

### 1. KPI Dashboard

Các chỉ tiêu tiền tệ:

- Tổng dư nợ cho vay.
- Tổng tiền gửi CKH.
- Tổng CASA/TGTT bình quân.

Được đổi sang dạng rút gọn:

```text
24,5 nghìn tỷ đ
850 tỷ đ
120 triệu đ
```

Khi rê chuột vào số tiền, tooltip vẫn hiển thị số đầy đủ theo VND.

### 2. Sửa bố cục card KPI

Card KPI được bổ sung class CSS riêng:

```text
dashboard-kpi-card
dashboard-kpi-value
dashboard-kpi-unit
```

Mục đích:

- Giữ chiều cao ổn định.
- Không để số dài đè/chồng lên nhau.
- Tự rút gọn bằng dấu `...` nếu màn hình hẹp.
- Responsive tốt hơn trên desktop và mobile.

### 3. Loading khi tải Dashboard

Khi Dashboard đang tải dữ liệu:

- Có `Spin` bao quanh khu KPI.
- Có nội dung:

```text
Đang tải dữ liệu Dashboard...
```

- Dropdown kỳ dữ liệu cũng có trạng thái loading.
- Các KPI tiếp tục dùng skeleton trong lúc chờ API.

### 4. Top 5 khách hàng ưu tiên

Bảng **Top 5 Khách hàng ưu tiên tiếp cận** đã bỏ cột:

```text
Hành động
```

Thay bằng cột:

```text
Quy mô ưu tiên
```

Cột này hiển thị:

- Tổng quy mô tài sản của khách hàng ở dạng rút gọn.
- Tooltip số tiền đầy đủ.
- Số dịch vụ còn thiếu.
- Số dịch vụ đang dùng trên tổng dịch vụ.

## File đã thay đổi

- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/components/dashboard/CampaignList.jsx`
- `frontend/src/styles.css`

## Cách kiểm tra

Chạy frontend:

```bash
cd frontend
npm run dev -- --host 0.0.0.0 --port 3000
```

Mở:

```text
http://localhost:3000
```

Kiểm tra:

1. Vào trang **Dashboard**.
2. Đổi kỳ dữ liệu và xem trạng thái loading.
3. Kiểm tra các KPI tiền tệ đã hiển thị dạng rút gọn.
4. Rê chuột vào KPI tiền tệ để xem số đầy đủ.
5. Kiểm tra bảng Top 5 không còn cột hành động.
6. Kiểm tra cột **Quy mô ưu tiên** có hiển thị tổng quy mô và số dịch vụ còn thiếu.
