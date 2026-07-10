# Xử lý job xử lý dữ liệu khách hàng bị kẹt

## Hiện tượng

Ở trang **Xử lý dữ liệu khách hàng**, khi chạy kỳ dữ liệu như `20260531`, tiến trình có thể đứng lâu ở:

```text
Gom khách hàng trùng MA_KH trên nhiều chi nhánh thành một hồ sơ
78%
```

Trường hợp kiểm tra kỳ `20260531`:

- Kỳ có đủ 28 file.
- Đủ 4 nhóm file bắt buộc: DP01, LN01, CN05, PF14.
- Job cũ `#8` đứng ở trạng thái `processing` từ lâu, nhưng PostgreSQL không còn query xử lý nào chạy.
- Đây là job bị kẹt do backend reload hoặc tiến trình nền bị rơi giữa chừng.

## Cập nhật đã làm

### 1. Thêm API chạy lại job bị kẹt

```http
POST /api/customer-processing/jobs/{period_key}/recover
```

Ví dụ:

```http
POST /api/customer-processing/jobs/20260531/recover
```

API sẽ:

- Đánh dấu các job `queued/processing` cũ của kỳ đó thành `error`.
- Ghi lý do: job cũ bị kẹt hoặc backend reload giữa chừng.
- Tạo job mới cho kỳ dữ liệu.
- Chạy lại xử lý trong background.

Từ bản cập nhật sau, API recover sẽ kiểm tra `pg_stat_activity` trước. Nếu PostgreSQL vẫn còn query xử lý thật sự đang chạy, API trả về lỗi `409` và không tạo job mới. Việc này tránh tình huống hai job cùng gom hồ sơ một kỳ và khóa nhau.

### 2. Thêm nút trên giao diện

Trong khung **Chạy xử lý dữ liệu**, nếu kỳ đang xem có job đang `queued/processing`, giao diện hiển thị nút:

```text
Chạy lại job kẹt
```

Nút này dùng API recover ở trên.

### 3. Đồng bộ kỳ đang xem

Khi chọn kỳ trong bảng hoặc trong ô chọn kỳ:

- `selectedPeriod` được cập nhật.
- `currentJob` được đổi theo đúng `last_job` của kỳ đó.
- Khung **Chạy xử lý dữ liệu** hiển thị tag:

```text
Đang xem kỳ YYYYMMDD
```

Như vậy không còn tình trạng bấm xem kỳ này nhưng khung chạy số liệu vẫn hiển thị job/kỳ khác.

### 4. Cảnh báo job có thể bị kẹt

Nếu job vẫn `queued/processing` nhưng `updated_at` không đổi quá 15 phút, giao diện hiển thị:

```text
Job có thể bị kẹt
```

Lưu ý: bước 78% là bước nặng, có thể chạy vài phút nếu kỳ có nhiều khách hàng. Chỉ nên coi là kẹt khi không có query active trong PostgreSQL hoặc đứng quá lâu bất thường.

## Cách kiểm tra job còn chạy thật không

Chạy trong thư mục `backend`:

```powershell
$env:PYTHONIOENCODING='utf-8'
@'
from sqlalchemy import create_engine, text
from app.config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)

with engine.connect() as conn:
    for row in conn.execute(text("""
        select id, period_key, status, stage, progress_percent,
               total_customers, processed_customers, updated_at
        from customer_processing_jobs
        where period_key = '20260531'
        order by created_at desc
        limit 5
    """)):
        print(dict(row._mapping))

    print("Active queries:")
    for row in conn.execute(text("""
        select pid, state, wait_event_type, wait_event,
               now() - query_start as running_for,
               left(query, 220) as query
        from pg_stat_activity
        where datname = current_database()
          and pid <> pg_backend_pid()
          and state = 'active'
        order by query_start nulls last
    """)):
        print(dict(row._mapping))
'@ | .\.venv\Scripts\python.exe -
```

Nếu có query active liên quan đến `customer_period_branch_details` hoặc `customer_period_profiles`, nghĩa là job vẫn đang chạy.

Nếu job `processing` nhưng không có query active trong PostgreSQL, có thể dùng **Chạy lại job kẹt**.

Nếu vẫn có query active thì không bấm chạy lại. Hãy để query chạy hết hoặc chỉ can thiệp khi chắc chắn query đó đã treo bất thường.

## Sự cố đã gặp ở kỳ 20260531

Kỳ tháng 5 không lớn hơn tháng 6 đáng kể:

```text
20260531:
DP01: 368.507 dòng
LN01: 29.064 dòng
CN05: 570.661 dòng
PF14: 267.645 dòng
Branch detail: 276.891 dòng

20260630:
DP01: 373.022 dòng
LN01: 29.294 dòng
CN05: 570.241 dòng
PF14: 271.507 dòng
Branch detail: 277.921 dòng
```

Nguyên nhân lâu bất thường không phải do dữ liệu tháng 5 lớn hơn, mà do có hai query gom hồ sơ chạy/tranh lock cùng lúc sau khi bấm recover trong lúc query cũ vẫn còn active.

Đã xử lý:

- Hủy query cũ bằng `pg_cancel_backend`.
- Để lại một job mới chạy tiếp.
- Vá API recover để chặn tạo job mới nếu DB vẫn đang chạy query xử lý.

## Lưu ý vận hành

- Không nên restart backend khi job xử lý dữ liệu đang chạy.
- Không nên mở nhiều cửa sổ backend `uvicorn --reload` cùng lúc.
- Khi chạy dữ liệu lớn, nên để job hoàn tất rồi mới chuyển code/reload backend.
- Bước 78% là bước gom hồ sơ khách hàng, thường là bước nặng nhất.

## Việc đã kiểm tra

```powershell
python -m compileall backend/app
cd frontend
npm run build
```

Cả backend compile và frontend build đều thành công.
