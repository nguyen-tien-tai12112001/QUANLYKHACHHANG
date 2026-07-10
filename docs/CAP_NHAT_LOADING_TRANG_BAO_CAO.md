# Cập nhật loading cho trang Báo cáo

## Mục tiêu

Khi người dùng chọn lại **Kỳ dữ liệu** hoặc **So sánh với kỳ**, trang báo cáo phải hiển thị trạng thái đang tải rõ ràng để tránh cảm giác hệ thống bị treo hoặc dữ liệu chưa đổi.

## Nội dung đã cập nhật

### 1. Loading khi chọn kỳ dữ liệu

- Dropdown **Kỳ dữ liệu** có trạng thái đang tải.
- Khi chọn kỳ mới, khu vực báo cáo hiển thị thông báo:

```text
Đang cập nhật dữ liệu kỳ ...
```

- Các vùng KPI, phân tích trọng tâm và bảng khách hàng được bọc bằng loading overlay.
- Dữ liệu cũ vẫn tạm hiển thị phía dưới overlay cho tới khi dữ liệu kỳ mới tải xong.

### 2. Loading khi chọn kỳ so sánh

- Dropdown **So sánh với kỳ** có trạng thái đang tải.
- Tab **So sánh 2 kỳ** hiển thị loading riêng:

```text
Đang so sánh kỳ ... với ...
```

- Khi bỏ chọn kỳ so sánh, dữ liệu so sánh được xóa và loading tắt ngay.

### 3. Loading cho bộ lọc phụ thuộc kỳ

- Khi đổi kỳ, các danh sách lọc như chi nhánh, PGD/phòng ban, cán bộ phụ trách được tải lại.
- Trong lúc tải danh sách lọc, các select liên quan hiển thị loading để người dùng biết dữ liệu đang được đồng bộ theo kỳ mới.

### 4. Loading cho bảng khách hàng và nguồn dữ liệu

- Bảng khách hàng dùng loading có nội dung tiếng Việt.
- Bảng nguồn dữ liệu cũng dùng cùng trạng thái tải của kỳ hiện tại.

## File đã thay đổi

- `frontend/src/pages/CustomerReport.jsx`
- `frontend/src/styles.css`

## Cách kiểm tra

1. Chạy frontend:

```bash
cd frontend
npm run dev -- --host 0.0.0.0 --port 3000
```

2. Mở trang:

```text
http://localhost:3000
```

3. Vào **Báo cáo**.
4. Chọn một **Kỳ dữ liệu** khác.
5. Kiểm tra có thông báo đang cập nhật dữ liệu và bảng có loading.
6. Chọn **So sánh với kỳ**.
7. Mở phần **Phân tích trọng tâm** > tab **So sánh 2 kỳ** và kiểm tra loading riêng của phần so sánh.

## Ghi chú

Loading hiện tại chỉ xử lý trải nghiệm giao diện. Nếu API trả dữ liệu chậm bất thường, vẫn cần kiểm tra thêm backend, truy vấn PostgreSQL và index dữ liệu báo cáo.
