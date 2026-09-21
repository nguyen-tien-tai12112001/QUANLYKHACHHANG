# DANH MỤC BỘ HỒ SƠ TÀI LIỆU C360

- **Mã tài liệu:** C360-REG-00
- **Phiên bản:** 2.0
- **Ngày cập nhật:** 21/09/2026

## 1. Nguyên tắc tổ chức

Bộ tài liệu được tinh gọn theo nguyên tắc **một chủ đề – một tài liệu chuẩn**. Tài liệu cập nhật cũ, hướng dẫn ngắn hoặc bản tổng quan trùng nội dung đã được loại bỏ. Các tài liệu chuyên sâu chỉ được giữ khi có phạm vi riêng và còn phù hợp với mã nguồn hiện tại.

Tài liệu Markdown là nguồn duy trì. Bản Word trong `docs/word` dùng kiểm tra, ký và lưu hồ sơ; phải được tạo lại sau khi Markdown thay đổi.

## 2. Bộ tài liệu chuẩn bắt buộc

| Mã | Tài liệu | Đối tượng | Nội dung |
|---|---|---|---|
| C360-USR-01 | `HUONG_DAN_SU_DUNG_CHI_TIET_HE_THONG_C360.md` | Người dùng, lãnh đạo, vận hành | Hướng dẫn từ đăng nhập đến từng màn hình |
| C360-OPS-01 | `QUY_TRINH_VAN_HANH_HE_THONG_C360.md` | Vận hành máy chủ/dữ liệu | Khởi động, giám sát, job, dung lượng, sự cố |
| C360-DBA-02 | `QUY_TRINH_SAO_LUU_KHOI_PHUC_C360.md` | Quản trị DB/hệ thống | Backup, restore, kiểm tra và diễn tập |
| C360-DATA-03 | `DAC_TA_NGUON_DU_LIEU_C360.md` | Chủ nguồn, phát triển, vận hành dữ liệu | Tên file, cột, kiểm tra, công thức và ghép CIF |
| C360-SEC-05 | `MA_TRAN_PHAN_QUYEN_VA_BAO_MAT_C360.md` | Quản trị quyền, kiểm soát | Role, scope, quyền nhạy cảm, phiên và audit |
| C360-ARC-10 | `KIEN_TRUC_HE_THONG_VA_ERD_C360.md` | Phát triển, quản trị kỹ thuật | Kiến trúc, luồng dữ liệu, ERD và mở rộng |
| C360-REG-00 | `BO_HO_SO_TAI_LIEU_C360.md` | Người lưu trữ/bàn giao | Danh mục và kiểm soát phiên bản tài liệu |

## 3. Tài liệu nghiệp vụ và triển khai bổ trợ

| Tài liệu | Phạm vi riêng |
|---|---|
| `GIOI_THIEU_CHUONG_TRINH_C360_CHO_THUYET_TRINH.md` | Nội dung giới thiệu và tạo slide/NotebookLM |
| `BAO_CAO_CHUC_NANG_NGUON_DU_LIEU_HA_TANG_C360.md` | Báo cáo hiện trạng cho lãnh đạo |
| `TU_DIEN_DU_LIEU_BAO_CAO.md` | Trạng thái và mapping từng trường báo cáo |
| `PHAN_TICH_VA_THIET_KE_NGUON_PF10.md` | Đặc tả chuyên sâu PF10 |
| `DOI_CHIEU_CAN_BO_PHU_TRACH_THEO_USER_DB.md` | Quy tắc đối chiếu cán bộ |
| `TINH_DIEM_NOI_GIAO_DICH_CHINH_KHACH_HANG.md` | Quy tắc chọn chi nhánh/nơi giao dịch chính |
| `TRIEN_KHAI_DOCKER_LAN_OFFLINE_WINDOWS.md` | Cài đặt máy chủ LAN offline |
| `TRIEN_KHAI_CICD_WINDOWS.md` | CI/CD Windows qua GitHub/GHCR |
| `GHI_IP_THAT_PHIEN_DANG_NHAP_LAN_WINDOWS.md` | Reverse proxy và ghi IP máy trạm |

Các tài liệu bổ trợ không được lặp lại toàn bộ tài liệu chuẩn; khi có xung đột, tài liệu chuẩn mới hơn và mã nguồn đang chạy là căn cứ.

## 4. Thứ tự đọc

### Người dùng

1. Hướng dẫn sử dụng chi tiết.
2. Từ điển dữ liệu khi cần hiểu trường/chỉ tiêu.

### Người vận hành

1. Quy trình vận hành.
2. Quy trình sao lưu–khôi phục.
3. Đặc tả nguồn dữ liệu.
4. Hướng dẫn triển khai LAN hoặc CI/CD theo môi trường.

### Người quản trị quyền/kiểm soát

1. Ma trận phân quyền và bảo mật.
2. Hướng dẫn sử dụng phần quản trị hệ thống.
3. Nhật ký và biên bản phê duyệt nội bộ.

### Nhóm phát triển

1. Kiến trúc và ERD.
2. Đặc tả nguồn.
3. Từ điển/mapping và tài liệu chuyên sâu liên quan.

## 5. Kiểm soát phát hành

- [ ] Tên menu, quyền và scope khớp phiên bản phần mềm.
- [ ] Tên file, cột bắt buộc và công thức khớp importer/processor.
- [ ] Sơ đồ/bảng trong Word không tràn trang.
- [ ] Không có mật khẩu, token, backup, dữ liệu KH hoặc ảnh CCCD thật.
- [ ] Người nghiệp vụ xác nhận phần công thức.
- [ ] Người kỹ thuật xác nhận lệnh vận hành/restore.
- [ ] Cập nhật phiên bản, ngày, người biên soạn/kiểm tra/phê duyệt.
- [ ] Các liên kết nội bộ không bị hỏng.

## 6. Tạo bộ Word

Tại thư mục gốc dự án:

```powershell
python tools/build_word_manuals.py
```

Sau đó mở từng file trong `docs/word`, nhấn `Ctrl+A`, `F9`, kiểm tra mục lục, bảng, ngắt trang và điền thông tin ký xác nhận. Không sửa riêng Word mà không cập nhật Markdown nguồn.

## 7. Quản lý thay đổi

Mỗi thay đổi chức năng cần xác định tài liệu bị ảnh hưởng:

| Thay đổi | Tài liệu phải rà |
|---|---|
| Menu/giao diện | Hướng dẫn sử dụng |
| Nguồn/cột/công thức | Đặc tả nguồn + từ điển |
| Role/quyền/scope | Ma trận phân quyền |
| Bảng/API/cache | Kiến trúc & ERD |
| Docker/đường dẫn/job | Quy trình vận hành |
| DB/backup/retention | Quy trình sao lưu–khôi phục |
