# Cập nhật import file lớn không làm treo hệ thống

## Ngày cập nhật

2026-07-08

## Vấn đề gặp phải

Khi import nhiều file cùng lúc, ví dụ 28 file với tổng dung lượng gần 1GB, hệ thống có thể bị treo hoặc phản hồi rất chậm.

Nguyên nhân chính:

- Mỗi file sau khi upload được xử lý bằng `BackgroundTasks` của FastAPI.
- Nếu nhiều file lớn được upload liên tiếp, nhiều tác vụ xử lý import có thể chạy chồng lên nhau trong cùng process backend.
- Mỗi tác vụ đọc file CSV/Excel lớn, chuẩn hóa dữ liệu và ghi DB, gây tải nặng cho RAM, CPU và PostgreSQL.
- Khi nhiều tác vụ cùng chạy, backend web bị nghẽn nên frontend cảm giác đơ hoặc không phản hồi.

## Cách xử lý đã cập nhật

Đã chuyển import file lớn sang cơ chế **hàng chờ import tuần tự + đọc chunk + PostgreSQL COPY**.

Luồng mới:

```text
Người dùng chọn nhiều file
        ↓
Frontend upload từng file lên server
        ↓
Backend lưu file vào thư mục uploads
        ↓
Tạo bản ghi ImportFile với trạng thái queued
        ↓
Đưa file vào hàng chờ import
        ↓
Import worker xử lý từng file một
        ↓
Đọc file theo từng chunk
        ↓
Chuẩn hóa dữ liệu theo loại file DP01/LN01/CN05/PF14
        ↓
Ghi vào PostgreSQL bằng COPY
        ↓
Cập nhật trạng thái success/error trong Kho dữ liệu
```

Mặc định hệ thống chỉ chạy:

```env
IMPORT_WORKER_COUNT=1
```

Điều này giúp tránh tình trạng 28 file lớn cùng xử lý một lúc.

## Cấu hình mới

File:

```text
backend/.env
```

Thêm hoặc giữ mặc định:

```env
IMPORT_WORKER_COUNT=1
```

Ý nghĩa:

| Giá trị | Ý nghĩa |
| --- | --- |
| `1` | An toàn nhất, xử lý từng file một |
| `2` | Chạy song song 2 file, chỉ nên dùng nếu máy khỏe và DB chịu tải tốt |
| `3+` | Không khuyến nghị ở máy cá nhân khi file lớn |

Sau khi đổi `IMPORT_WORKER_COUNT`, cần restart backend.

## Cấu hình chunk import

File:

```text
backend/.env
```

Thêm hoặc giữ mặc định:

```env
IMPORT_CHUNK_SIZE=20000
```

Ý nghĩa:

| Giá trị | Ý nghĩa |
| --- | --- |
| `10000` | Ít RAM hơn, phù hợp máy yếu |
| `20000` | Mặc định cân bằng tốc độ và RAM |
| `50000` | Nhanh hơn nhưng tốn RAM hơn |

Sau khi đổi `IMPORT_CHUNK_SIZE`, cần restart backend.

## Tự xóa file nguồn sau khi import thành công

Mục tiêu vận hành hiện tại là **DB là nguồn dữ liệu chính**, folder `backend/uploads` chỉ là nơi lưu tạm trong lúc worker import.

Cấu hình:

```env
DELETE_UPLOAD_AFTER_SUCCESS=true
```

Khi bật cấu hình này:

1. File được upload vào `backend/uploads`.
2. Worker đọc file theo chunk.
3. Dữ liệu được ghi vào PostgreSQL bằng COPY.
4. Nếu import thành công, trạng thái file trong DB là `success`.
5. Backend tự xóa file vật lý trong `backend/uploads`.

Không xóa file nếu:

- File đang `queued`.
- File đang `processing`.
- File import lỗi.
- Đường dẫn file không nằm trong thư mục `backend/uploads`.

Nếu muốn giữ lại file nguồn sau import, đổi:

```env
DELETE_UPLOAD_AFTER_SUCCESS=false
```

Sau đó restart backend.

## PostgreSQL COPY

Worker import hiện dùng `COPY ... FROM STDIN` thông qua driver `psycopg`.

Các bảng raw đang ghi bằng COPY:

- `dp01_deposit_accounts`
- `ln01_loans`
- `cn05_customer_services`
- `pf14_account_balances`

Lợi ích:

- Ghi dữ liệu vào PostgreSQL nhanh hơn `bulk_insert_mappings`.
- Không cần giữ toàn bộ file lớn trong RAM.
- Mỗi chunk được ghi và commit dần, giúp trạng thái số dòng import cập nhật theo tiến trình xử lý.

## Tự khôi phục hàng chờ khi restart backend

Khi backend khởi động:

- Các file đang `queued` sẽ được đưa lại vào hàng chờ.
- Các file đang `processing` dở do backend tắt giữa chừng sẽ được đưa lại về `queued`.
- Worker nền tiếp tục xử lý các file còn lại.

## Thay đổi giao diện Kho dữ liệu

Ở khu vực chọn file import, giao diện hiển thị thêm:

- Số lượng file đang chọn.
- Tổng dung lượng file.
- Ghi chú backend xử lý theo hàng chờ tuần tự.

Khi upload xong một file, thông báo sẽ cho biết:

```text
File đã tải lên máy chủ và được đưa vào hàng chờ import tuần tự.
Có thể chuyển trang khác, backend vẫn xử lý tiếp.
```

## File code liên quan

- `backend/app/config.py`
- `backend/app/main.py`
- `backend/app/api/imports.py`
- `backend/app/imports/importer.py`
- `frontend/src/pages/ImportData.jsx`
- `backend/.env.example`

## Khuyến nghị vận hành

Với file tổng gần 1GB:

1. Giữ `IMPORT_WORKER_COUNT=1`.
2. Upload toàn bộ file vào kho.
3. Không cần chờ từng file xử lý xong ở trình duyệt.
4. Theo dõi trạng thái ở bảng Kho dữ liệu.
5. Khi tất cả file chuyển sang `Đã import`, mới chạy xử lý dữ liệu khách hàng.

## Hướng tối ưu tiếp theo

Hiện tại hệ thống đã tránh treo bằng hàng chờ tuần tự, đọc chunk và ghi PostgreSQL bằng COPY. Để tối ưu sâu hơn nữa, có thể làm tiếp:

- Tách worker import thành process riêng, ví dụ Celery/RQ/Dramatiq.
- Thêm trang theo dõi hàng chờ import: file nào đang chạy, file nào chờ, thời gian dự kiến.
- Thêm nút tạm dừng/hủy job import.
- Dùng bảng staging riêng rồi `INSERT SELECT` sang bảng nghiệp vụ để tăng tốc làm sạch dữ liệu bằng SQL.
