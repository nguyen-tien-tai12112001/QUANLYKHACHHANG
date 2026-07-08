# Cập nhật trang Xử lý dữ liệu khách hàng

## Ngày cập nhật

2026-07-08

## Nội dung thay đổi

Đã bỏ khu vực **Kiểm tra nhanh hồ sơ sau xử lý** khỏi trang Xử lý dữ liệu khách hàng.

Lý do:

- Trang Xử lý dữ liệu nên tập trung vào chọn kỳ, kiểm tra file đầu vào, chạy job xử lý và theo dõi tiến trình.
- Việc xem danh sách hồ sơ khách hàng, lọc hồ sơ, xem chi tiết khách hàng đã được chuyển về trang Báo cáo khách hàng.
- Tránh gọi API `/customer-processing/profiles` thừa khi chỉ cần theo dõi xử lý dữ liệu.
- Giao diện trang xử lý dữ liệu gọn hơn, giảm trùng chức năng với trang Báo cáo.

## Phần còn giữ lại

- Danh sách kỳ dữ liệu có thể xử lý.
- Trạng thái đủ/thiếu nhóm file bắt buộc `DP01`, `LN01`, `CN05`, `PF14`.
- Thêm file bổ sung cho kỳ dữ liệu.
- Tỷ giá quy đổi lấy từ DP01.
- Nút chạy dữ liệu theo kỳ.
- Tiến trình job xử lý dữ liệu khách hàng.
- Thời gian xử lý và số lượng khách hàng đã xử lý.

## Nguồn xem hồ sơ sau xử lý

Sau khi chạy xử lý dữ liệu xong, người dùng xem kết quả tại:

- Menu **Báo cáo**
- Chọn kỳ dữ liệu đã xử lý
- Lọc theo chi nhánh, PGD, loại vay, cán bộ phụ trách, khách hàng chưa dùng dịch vụ
- Bấm **Chi tiết** từng khách hàng để xem thông tin theo chi nhánh/PGD

## File code liên quan

- `frontend/src/pages/CustomerProcessing.jsx`
- `frontend/src/pages/CustomerReport.jsx`

