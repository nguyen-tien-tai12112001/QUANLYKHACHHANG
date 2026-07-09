# Cập nhật Báo cáo: phân nhóm khách hàng và so sánh 2 kỳ

## Ngày cập nhật

2026-07-08

## Mục tiêu

Nâng trang **Báo cáo** từ màn hình liệt kê dữ liệu thành màn hình phân tích trọng tâm:

- Tự động phân nhóm khách hàng theo giá trị kinh doanh.
- So sánh biến động giữa 2 kỳ dữ liệu.
- Xem lịch sử từng khách hàng qua các kỳ.
- Giữ modal chi tiết gọn hơn bằng tab và khối sổ xuống.

## Phân nhóm khách hàng tự động

Các nhóm hiện có:

| Nhóm | Điều kiện |
| --- | --- |
| Nhóm tiền gửi lớn | `so_du_tien_gui + so_du_tgtt_binh_quan >= 1.000.000.000` |
| Nhóm dư nợ lớn | `so_du_tien_vay >= 1.000.000.000` |
| Nhóm CASA cao | `so_du_tgtt_binh_quan >= 500.000.000` |
| Nhóm khách hàng nhiều chi nhánh | `branch_count > 1` |
| Nhóm tiềm năng bán chéo | Thỏa ít nhất một rule bán chéo |

Rule bán chéo hiện có:

- Có tiền gửi lớn nhưng chưa dùng Agribank Plus.
- Có dư nợ nhưng chưa có SMS nhắc nợ.
- Có TGTT bình quân cao nhưng chưa có thẻ.
- Khách hàng nhiều chi nhánh cần phân công quản lý chính.

## So sánh 2 kỳ

Trang Báo cáo có thêm trường **So sánh với kỳ**.

Hệ thống so sánh:

- Số lượng khách hàng tăng/giảm.
- Tiền gửi CKH tăng/giảm.
- Dư nợ tăng/giảm.
- TGTT bình quân tăng/giảm.
- Khách hàng mới xuất hiện.
- Khách hàng không còn phát sinh.
- Dịch vụ mới phát sinh.
- Dịch vụ bị mất.

## Modal chi tiết khách hàng

Modal chi tiết được chia thành tab:

- **Dịch vụ**: tình hình sử dụng dịch vụ.
- **Chi nhánh / PGD**: chi tiết khoản vay, tiền gửi, TGTT, dịch vụ theo từng chi nhánh/PGD. Khu vực này được để dạng sổ xuống để gọn màn hình.
- **Lịch sử qua kỳ**: liệt kê dữ liệu của cùng khách hàng qua các kỳ đã xử lý.

## API backend mới

### `GET /api/customer-processing/profile-groups`

Tính số lượng khách hàng theo các nhóm tự động.

Tham số chính:

- `period_key`
- `keyword`
- `branch_code`
- `pgd_code`
- `loan_type`
- `officer_code`
- `unused_service`
- `multi_branch`

### `GET /api/customer-processing/period-comparison`

So sánh 2 kỳ dữ liệu.

Tham số:

- `current_period`
- `previous_period`
- `branch_code`
- `pgd_code`

### `GET /api/customer-processing/profile-history`

Lấy lịch sử một khách hàng qua các kỳ.

Tham số:

- `ma_kh`

## File code liên quan

- `backend/app/api/customer_processing.py`
- `frontend/src/pages/CustomerReport.jsx`
- `frontend/src/styles.css`

## Ghi chú phát triển tiếp

- Có thể đưa các ngưỡng phân nhóm vào bảng cấu hình để admin tự chỉnh.
- Có thể bổ sung xuất Excel riêng cho từng nhóm khách hàng.
- Có thể thêm danh sách drill-down khi bấm vào từng nhóm tự động.
- Có thể bổ sung biểu đồ biến động qua nhiều kỳ thay vì chỉ so sánh 2 kỳ.

## Cập nhật bổ sung

### Ngày cập nhật

2026-07-08

### Nội dung

- Khu vực **Chi tiết theo chi nhánh / PGD** trong modal khách hàng tự động tải và hiển thị ngay, không cần bấm nút xem chi tiết hoặc tải lại.
- Các card **phân nhóm khách hàng tự động** có thể bấm để mở danh sách khách hàng thuộc nhóm đó.
- Danh sách khách hàng theo nhóm dùng API phân trang, không chỉ lọc trên dữ liệu đang hiển thị ở trang hiện tại.
- Khối **Phân nhóm khách hàng tự động** và **So sánh 2 kỳ** được gom vào một card tab **Phân tích trọng tâm** để giảm chiều dài trang Báo cáo.

### API cập nhật

`GET /api/customer-processing/profiles` hỗ trợ thêm tham số:

| Tham số | Ý nghĩa |
| --- | --- |
| `group_key=large_deposit` | Lọc nhóm tiền gửi lớn |
| `group_key=large_loan` | Lọc nhóm dư nợ lớn |
| `group_key=high_casa` | Lọc nhóm CASA cao |
| `group_key=multi_branch` | Lọc nhóm khách hàng nhiều chi nhánh |
| `group_key=cross_sell` | Lọc nhóm tiềm năng bán chéo |

### File code liên quan

- `backend/app/api/customer_processing.py`
- `frontend/src/pages/CustomerReport.jsx`
- `frontend/src/styles.css`

## Cập nhật bộ lọc checkbox

### Ngày cập nhật

2026-07-08

### Nội dung

- Bộ lọc **Loại vay** có thêm checkbox **Chọn tất cả**.
- Bộ lọc **KH chưa dùng dịch vụ** có thêm checkbox **Chọn tất cả**.
- Danh sách checkbox được căn theo dạng grid để các ô chọn thẳng hàng, dễ nhìn hơn.
- Phần header chọn tất cả luôn cố định phía trên nội dung popover, danh sách checkbox có vùng cuộn riêng khi nhiều lựa chọn.
