# Cập nhật Kho dữ liệu: xóa kỳ/file, backup và nhật ký thao tác

## Mục tiêu

Kho dữ liệu hiện hỗ trợ quản lý dữ liệu theo kỳ chặt chẽ hơn:

- Import xong hiển thị tổng thời gian import thành công.
- Xóa file là xóa thật dữ liệu chi tiết khỏi DB, không để trạng thái `removed` hoặc `replaced` cho file mới.
- Xóa kỳ là xóa toàn bộ file, dữ liệu nguồn, dữ liệu bổ sung, trạng thái nguồn và kết quả xử lý của kỳ đó.
- Bắt buộc nhập lý do khi xóa file hoặc xóa kỳ.
- Ghi nhật ký thao tác: ai xóa, xóa lúc nào, xóa gì, lý do gì.
- Chặn xóa nếu kỳ đang có job import hoặc job xử lý dữ liệu khách hàng đang chạy.
- Nếu thêm/xóa file trong kỳ đã xử lý, kỳ đó được đánh dấu `Cần chạy lại xử lý`.
- Khi chạy lại xử lý thành công, trạng thái `Cần chạy lại xử lý` tự hết.
- Có tùy chọn backup toàn bộ database trước khi xóa kỳ.

## API chính

### Xóa file khỏi kho dữ liệu

```http
DELETE /api/imports/files/{file_id}
```

Body:

```json
{
  "reason": "Import nhầm file, cần xóa để nạp lại file đúng",
  "backup_before_delete": false,
  "backup_dir": null
}
```

### Xóa toàn bộ kỳ dữ liệu

```http
DELETE /api/imports/periods/{period_key}
```

Body:

```json
{
  "reason": "Xóa kỳ test do import sai dữ liệu",
  "backup_before_delete": true,
  "backup_dir": "D:/Backup/C360"
}
```

Nếu `backup_dir` để trống, backend lưu backup tại:

```text
backend/exports/backups
```

## Điều kiện chặn xóa

Backend không cho xóa file hoặc xóa kỳ nếu:

- File/kỳ đang có trạng thái import `queued`, `processing`, `deleting`.
- Kỳ đang có job xử lý dữ liệu khách hàng `queued`, `processing`, `running`.

Thông báo trả về sẽ là:

```text
Không thể xóa vì kỳ dữ liệu đang có job import hoặc xử lý đang chạy
```

## Backup trước khi xóa kỳ

Backup dùng công cụ PostgreSQL:

```bash
pg_dump
```

File backup được tạo dạng `.dump`, ví dụ:

```text
c360_backup_truoc_xoa_ky_20260630_20260709_153000.dump
```

Lưu ý:

- Máy chạy backend phải cài PostgreSQL client hoặc có `pg_dump` trong `PATH`.
- Nếu bật backup nhưng không có `pg_dump`, backend sẽ báo lỗi và không xóa kỳ.
- Backup hiện tại là backup toàn bộ database để đảm bảo có thể khôi phục an toàn trước khi xóa dữ liệu nghiệp vụ quan trọng.

## Nhật ký thao tác

Mọi thao tác xóa được ghi vào bảng:

```text
audit_logs
```

Các thông tin chính:

- `actor_username`: tài khoản thao tác.
- `actor_name`: tên người thao tác.
- `action`: `delete_import_file` hoặc `delete_import_period`.
- `entity_type`: `import_file` hoặc `import_period`.
- `entity_id`: ID file hoặc kỳ dữ liệu.
- `description`: mô tả chi tiết, số file, kỳ liên quan, backup, lý do.
- `created_at`: thời điểm thao tác.

Có thể xem ở trang Nhật ký thao tác trong Quản trị hệ thống.

## Trạng thái cần chạy lại xử lý

Nếu kỳ đã có dữ liệu khách hàng sau xử lý mà người dùng thêm hoặc xóa file nguồn, backend đánh dấu kỳ:

```text
needs_reprocess
```

Trên giao diện hiển thị:

```text
Cần chạy lại xử lý
```

Sau khi chạy lại xử lý dữ liệu khách hàng thành công, trạng thái này được trả về `active`.

## Cách kiểm tra nhanh

1. Import một kỳ dữ liệu.
2. Chạy xử lý dữ liệu khách hàng cho kỳ đó.
3. Quay lại Kho dữ liệu, xóa hoặc import thay thế một file trong kỳ.
4. Kỳ phải hiển thị cảnh báo `Cần chạy lại xử lý`.
5. Vào Quản trị hệ thống -> Nhật ký thao tác để kiểm tra log xóa.
6. Nếu bật backup, kiểm tra file backup trong thư mục đã chọn.

## Lệnh kiểm tra sau cập nhật

Backend:

```powershell
python -m compileall backend/app
```

Frontend:

```powershell
cd frontend
npm run build
```

## Gợi ý bước tiếp theo

- Tách xóa kỳ lớn thành job nền riêng nếu dữ liệu một kỳ lên tới nhiều triệu dòng.
- Thêm chức năng khôi phục kỳ từ file backup ngay trên giao diện quản trị.
- Thêm quyền riêng: `Xóa file dữ liệu`, `Xóa kỳ dữ liệu`, `Backup dữ liệu`.
- Thêm cảnh báo bắt nhập lại mật khẩu hoặc OTP nội bộ trước khi xóa kỳ đã xử lý.
