# Xử lý import bị kẹt và khôi phục job

## Hiện tượng

Khi import nhiều file cùng lúc, giao diện Kho dữ liệu có thể hiển thị:

- Một file ở trạng thái `Đang xử lý` rất lâu.
- Các file còn lại ở trạng thái `Chờ xử lý`.
- Số dòng hợp lệ không tăng thêm trong nhiều phút.

Trường hợp kiểm tra kỳ `20260131` cho thấy:

- `2600_CN05_20260131.csv` bị đứng ở trạng thái `processing`.
- File đã ghi được `82.843` dòng nhưng không chuyển sang `success`.
- PostgreSQL không có lock chờ.
- Máy đang có nhiều process `uvicorn --reload` chạy cùng lúc.

## Nguyên nhân chính

Import hiện dùng worker queue trong RAM của backend. Nếu backend bị reload, mở nhiều cửa sổ backend, hoặc có nhiều process `uvicorn --reload` cùng lúc, job nền có thể bị mất worker trong khi DB vẫn ghi trạng thái `processing`.

Khi đó:

- File đang import có thể đứng ở `processing`.
- Các file phía sau vẫn ở `queued`.
- Nếu retry không dọn dữ liệu ghi dở thì có nguy cơ nhân đôi dòng dữ liệu.

## Cập nhật đã làm

### 1. Retry import an toàn hơn

Trước khi import lại một file đã từng ghi dở, backend sẽ xóa toàn bộ dòng cũ theo `import_file_id`:

- `dp01_deposit_accounts`
- `ln01_loans`
- `cn05_customer_services`
- `pf14_account_balances`

Sau đó mới import lại từ đầu file.

### 2. Chống nhiều worker xử lý cùng một file

Worker import phải claim job bằng DB trước khi xử lý:

```text
queued -> processing
```

Chỉ worker nào đổi trạng thái thành công mới được xử lý file. Worker khác gặp cùng `import_file_id` sẽ bỏ qua.

Việc này tránh lỗi:

```text
No such file or directory: backend/uploads/...
```

Nguyên nhân lỗi này là một worker import xong và xóa file tạm, trong khi worker khác vẫn cố xử lý lại cùng file đó.

### 3. Ghi thời gian bằng UTC

`started_at`, `finished_at` của import file được ghi bằng UTC để tránh lệch thời gian khi PostgreSQL lưu timestamp timezone.

### 4. Thêm API khôi phục job import bị kẹt

```http
POST /api/imports/jobs/recover
```

Khôi phục toàn bộ job bị kẹt:

```http
POST /api/imports/jobs/recover
```

Khôi phục riêng một kỳ:

```http
POST /api/imports/jobs/recover?period_key=20260131
```

API sẽ:

- Đưa file `processing` về `queued`.
- Xóa dữ liệu ghi dở của file đó.
- Enqueue lại các file `queued`.
- Trả về số job đã đưa lại vào hàng chờ.

### 5. Thêm nút trên giao diện

Trong trang Kho dữ liệu, bộ lọc có nút:

```text
Khôi phục job kẹt
```

Nếu đang chọn kỳ dữ liệu, nút này khôi phục job của kỳ đó.
Nếu chưa chọn kỳ, nút này khôi phục toàn bộ job import bị kẹt.

## Cách kiểm tra tiến trình bằng DB

Chạy trong thư mục `backend`:

```powershell
$env:PYTHONIOENCODING='utf-8'
@'
from sqlalchemy import create_engine, text
from app.config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)

with engine.connect() as conn:
    for row in conn.execute(text("""
        select status, count(*) files, coalesce(sum(success_rows),0) rows
        from import_files
        where period_key = '20260131'
        group by status
        order by status
    """)):
        print(dict(row._mapping))
        
    for row in conn.execute(text("""
        select id, original_filename, status, success_rows, started_at, finished_at, duration_seconds
        from import_files
        where period_key = '20260131'
        order by id
    """)):
        print(dict(row._mapping))
'@ | .\.venv\Scripts\python.exe -
```

## Cách xử lý khi thấy import bị kẹt

1. Không bấm import lại cùng bộ file ngay.
2. Chọn đúng kỳ dữ liệu trong Kho dữ liệu.
3. Bấm `Khôi phục job kẹt`.
4. Đợi vài giây rồi bấm `Tải lại kho`.
5. Kiểm tra file `processing` có chuyển sang file tiếp theo hay số file `success` có tăng không.

## Nếu file báo lỗi do mất file tạm

Nếu thấy lỗi dạng:

```text
No such file or directory: backend/uploads/...
```

thì file tạm đã bị xóa trước khi job lỗi được chạy lại. Cách xử lý:

1. Đợi các job còn lại của kỳ chạy xong.
2. Chọn lại đúng các file gốc bị lỗi.
3. Import lại riêng các file đó.
4. Sau khi đủ file, chạy xử lý dữ liệu khách hàng lại cho kỳ đó.

Không nên bấm khôi phục lại với các file đã mất file tạm, vì backend không còn file nguồn để đọc.

## Lưu ý vận hành

Không nên mở nhiều backend cùng lúc, đặc biệt khi đang import dữ liệu lớn.

Nên chỉ chạy một backend:

```powershell
cd backend
.\.venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Nếu lỡ mở nhiều cửa sổ backend, sau khi import xong nên đóng hết rồi mở lại một cửa sổ duy nhất.

## Gợi ý tối ưu tiếp theo

- Chuyển queue import sang bảng DB hoặc Redis/RQ/Celery để không phụ thuộc RAM của một process backend.
- Không dùng `--reload` khi import dữ liệu lớn trên máy chủ nội bộ.
- Tạo trang quản trị job import riêng: dừng job, chạy lại job, xem log theo từng file.
- Tăng `IMPORT_WORKER_COUNT` sau khi kiểm tra tài nguyên máy và cấu hình PostgreSQL đủ khỏe.
