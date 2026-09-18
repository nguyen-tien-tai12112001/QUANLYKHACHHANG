# Danh mục bộ hồ sơ tài liệu C360

## 1. Mục đích và phạm vi

Bộ hồ sơ dùng để lưu trữ, bàn giao và tra cứu cách vận hành hệ thống quản lý khách hàng C360. Nội dung được lập theo mã nguồn/giao diện tại thời điểm 17/09/2026; số liệu kinh doanh, mật khẩu và dữ liệu khách hàng thật không nằm trong bộ hồ sơ này.

Tài liệu mô tả cách sử dụng hệ thống hiện tại, không phải văn bản phê duyệt chính sách nghiệp vụ, phân quyền hoặc công bố số liệu. Các ô người biên soạn, kiểm tra, phê duyệt và ngày ký trong bản Word để trống để đơn vị tự xác nhận.

## 2. Danh mục tài liệu bàn giao

| Mã tài liệu | Tên tài liệu | Đối tượng sử dụng | Nội dung chính |
|---|---|---|---|
| C360-ADM-01 | Sổ tay quản trị hệ thống C360 | Quản trị ứng dụng, quản trị dữ liệu, vận hành máy chủ | Hạ tầng; tài khoản và phân quyền; CIF; kho nguồn; xử lý kỳ; đối chiếu; nhật ký; sự cố |
| C360-USR-02 | Hướng dẫn sử dụng C360 cho người dùng | Cán bộ, lãnh đạo đơn vị, người xem báo cáo | Đăng nhập; bộ lọc; Dashboard; hồ sơ KH; phân tích; ghim; xuất dữ liệu; xử lý lỗi thường gặp |
| C360-REG-00 | Danh mục bộ hồ sơ tài liệu C360 | Người lưu trữ/bàn giao hồ sơ | Danh mục, thứ tự lưu, kiểm tra tiếp nhận và quản lý phiên bản |

Các tài liệu Markdown cùng tên trong thư mục `docs` là nguồn để cập nhật nội dung; các file `.docx` trong `docs/word` là bản Word để kiểm tra, ký xác nhận và lưu hồ sơ. Khi giao diện hoặc logic thay đổi, cần cập nhật nguồn và xuất lại bản Word, không sửa riêng một bản mà bỏ quên bản còn lại.

## 3. Thứ tự đọc và tra cứu

1. Người quản trị đọc **Sổ tay quản trị** từ mô hình hệ thống đến checklist bàn giao kỳ, sau đó dùng tài liệu triển khai LAN/CI-CD khi thao tác máy chủ.
2. Người dùng đọc **Hướng dẫn sử dụng** theo thứ tự: đăng nhập → chọn phạm vi → tra cứu số liệu → mở hồ sơ KH → xử lý tình huống phát sinh.
3. Khi cần giải thích công thức/cột nguồn, tra **Từ điển số liệu** và **Trình bày nguồn số liệu** trong `docs`. Không sử dụng tài liệu cũ còn mô tả DP01 là tập khách hàng nền để giải thích phiên bản hiện tại.

## 4. Kiểm tra trước khi lưu hồ sơ

- [ ] Mã tài liệu, tên tài liệu, phiên bản và ngày phát hành thống nhất giữa danh mục và từng bản Word.
- [ ] Nội dung đã được người phụ trách nghiệp vụ và quản trị hệ thống kiểm tra theo phiên bản phần mềm đang chạy.
- [ ] Mục lục Word đã được cập nhật; số trang và bảng không tràn, không mất chữ.
- [ ] Đường dẫn đến các tài liệu liên quan còn tồn tại; tài liệu triển khai tương ứng môi trường đang dùng.
- [ ] Không có mật khẩu, token, file dữ liệu khách hàng, ảnh CCCD hoặc bản backup DB trong bộ hồ sơ.
- [ ] Chữ ký/ngày ký được bổ sung bởi đúng người có thẩm quyền của đơn vị.

## 5. Quản lý thay đổi và lưu trữ

Mỗi lần phát hành mới cần ghi phiên bản, ngày, nội dung thay đổi, người biên soạn và người phê duyệt. Giữ bản đã ký của phiên bản trước để đối chiếu; đặt tên file có mã tài liệu và phiên bản rõ ràng. Lưu ở nơi nội bộ có phân quyền, có backup. Không đưa bản đã điền thông tin phê duyệt hoặc tài liệu chứa dữ liệu nhạy cảm lên kho Git công khai.

Các cập nhật ưu tiên kiểm tra lại sau mỗi lần thay đổi phần mềm: danh sách nguồn bắt buộc; tập khách hàng nền CIF; công thức KPI; quy tắc phân quyền/phạm vi; thứ tự thao tác import–xử lý; tên menu/nút; cấu hình máy chủ và quy trình backup.

Để tạo lại DOCX từ nguồn Markdown tại thư mục gốc dự án, chạy `python tools/build_word_manuals.py`. Sau đó mở từng file bằng Microsoft Word, nhấn `Ctrl+A`, `F9` để cập nhật mục lục/số trang và lưu lại. Cần kiểm tra bản in xem bảng và chữ có tràn trang hay không trước khi ký.
