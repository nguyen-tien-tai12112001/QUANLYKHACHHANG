# Cập nhật giao diện trang Báo cáo

## Mục tiêu

Trang Báo cáo được bố trí lại theo hướng:

- Thanh điều khiển gọn và cố định khi cuộn.
- Bộ lọc chi tiết nằm trong Drawer để không chiếm màn hình.
- KPI tổng quan gọn hơn, chia 2 dòng rõ ràng.
- Phân tích trọng tâm để dạng xổ xuống, mặc định thu gọn.
- Bảng khách hàng là vùng làm việc chính.

## 1. Thanh điều khiển cố định

Thanh điều khiển nằm dưới header chính của ứng dụng và sticky khi cuộn.

Trường hiển thị trực tiếp:

- Kỳ dữ liệu.
- So sánh với kỳ.
- Chi nhánh.
- PGD/phòng ban.
- Cán bộ phụ trách.
- Nút Bộ lọc nâng cao.
- Nút tải lại báo cáo.

Đã rà lại để tránh sticky toolbar bị đè lên header hoặc bị table header đè khi cuộn.

Cập nhật thêm:

- Nền toolbar chuyển sang trắng đặc, không còn trong suốt.
- Thêm lớp nền phía sau toolbar để che nội dung đang lướt qua bên dưới.
- Hạ `z-index` các cột cố định của bảng để cột Mã KH/Tên KH không nổi lên trên bộ lọc.

## 2. Bộ lọc nâng cao

Bấm `Bộ lọc nâng cao` để mở Drawer bên phải.

Các trường trong Drawer:

- Tìm kiếm nhanh theo tên khách hàng, mã KH, mã cán bộ, số điện thoại.
- Loại vay.
- Phạm vi khách hàng: nhiều chi nhánh hoặc một chi nhánh.
- Khách hàng chưa dùng từng dịch vụ.
- Chế độ xem: Báo cáo hoặc Nguồn dữ liệu.
- Nút xóa lọc.
- Nút áp dụng.

## 3. KPI tổng quan

KPI được thiết kế thành 8 card gọn, chia 4 cột x 2 dòng trên màn hình rộng.

Dòng 1:

- Tổng khách hàng.
- Tổng dư nợ.
- Tổng tiền gửi.
- TGTT bình quân.

Dòng 2:

- KH nhiều chi nhánh.
- KH chưa dùng dịch vụ.
- KH tiềm năng bán chéo.
- Tỷ lệ phủ dịch vụ.

Các card đã được giảm chiều cao, padding, icon và cỡ chữ để phần dưới bộ lọc gọn hơn.

## 4. Phân tích trọng tâm

Khối Phân tích trọng tâm đã chuyển sang dạng xổ xuống, mặc định đóng.

Bên trong gồm các tab:

- Phân nhóm KH.
- Cơ hội bán chéo.
- So sánh 2 kỳ.
- Dịch vụ.
- Cảnh báo dữ liệu.

Mục tiêu là giữ màn hình báo cáo gọn, khi cần phân tích sâu mới mở khối này.

## 5. Bảng khách hàng

Bảng khách hàng là vùng trung tâm.

Đã tối ưu:

- Server-side pagination.
- Scroll ngang.
- Scroll dọc trong vùng bảng.
- Text không tự xuống dòng lung tung.
- Có nút chọn cột hiển thị.
- Bỏ cột Thao tác/Chi tiết vì bấm vào tên khách hàng đã mở modal chi tiết.
- Bỏ sticky riêng của table header để tránh chồng với thanh điều khiển sticky.

Các cột mặc định:

- STT.
- Mã KH.
- Tên khách hàng.
- Loại KH.
- Mã CN.
- PGD.
- Cán bộ quản lý.
- Dư nợ.
- Tiền gửi CKH.
- TGTT bình quân.
- Loại vay.
- Dịch vụ đang dùng.
- Cơ hội bán chéo.

Các cột ít dùng có thể bật thêm bằng `Chọn cột`.

## 6. File đã chỉnh

```text
frontend/src/pages/CustomerReport.jsx
frontend/src/styles.css
docs/CAP_NHAT_GIAO_DIEN_TRANG_BAO_CAO.md
```

## 7. Kiểm tra

Đã chạy:

```bat
cd frontend
npm run build
```

Kết quả: build thành công.

Đã chạy:

```bat
python -m compileall backend/app
```

Kết quả: backend compile thành công.
