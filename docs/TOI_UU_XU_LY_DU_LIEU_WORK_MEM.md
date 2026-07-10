# Tối ưu xử lý dữ liệu khách hàng bằng `PROCESSING_WORK_MEM`

## Vấn đề gặp ở kỳ 20260131

Khi chạy xử lý dữ liệu khách hàng tháng 1/2026, job đứng rất lâu ở bước:

```text
Gom khách hàng trùng MA_KH trên nhiều chi nhánh thành một hồ sơ
78%
```

Kiểm tra thực tế:

```text
Job #14
Kỳ: 20260131
Trạng thái: processing
Stage: Gom khách hàng trùng MA_KH...
Thời gian chạy query: hơn 30 phút
```

Dữ liệu tháng 1 không lớn bất thường:

```text
DP01: 341.979 dòng
LN01: 29.762 dòng
CN05: 570.660 dòng
PF14: 265.930 dòng
Branch detail: 276.629 dòng
```

Phân bố khách hàng cũng bình thường:

```text
Số khách hàng: 245.204
P50 detail/KH: 1
P95 detail/KH: 2
P99 detail/KH: 2
Max detail/KH: 7
```

## Nguyên nhân

PostgreSQL đang dùng:

```text
work_mem = 4MB
```

Trong khi bước gom hồ sơ cần `GROUP BY`, `DISTINCT`, `ORDER BY`, `string_agg` và `jsonb_agg` trên hơn 276 nghìn dòng chi tiết.

Do `work_mem` quá thấp, PostgreSQL phải ghi dữ liệu trung gian ra disk rất nhiều:

```text
temp_files: 6159
temp_bytes: 71 GB
```

Vì vậy query bị chậm bất thường.

## Cập nhật đã làm

Thêm cấu hình backend:

```env
PROCESSING_WORK_MEM=256MB
```

Trong job xử lý dữ liệu khách hàng, backend sẽ set riêng cho connection xử lý:

```sql
SET work_mem = '256MB';
SET temp_buffers = '64MB';
```

Cấu hình này chỉ áp dụng cho session xử lý của backend, không đổi global PostgreSQL.

## Kết quả sau tối ưu

Sau khi hủy query cũ và chạy lại job:

```text
Job #15
Kỳ: 20260131
Trạng thái: success
Khách hàng xử lý: 245.204
Thời gian: khoảng 2 phút 28 giây
```

## Cách chỉnh trên máy chủ

Trong `backend/.env`:

```env
PROCESSING_WORK_MEM=256MB
```

Nếu máy chủ ít RAM, có thể dùng:

```env
PROCESSING_WORK_MEM=128MB
```

Nếu máy chủ RAM khỏe và chỉ chạy một job xử lý tại một thời điểm, có thể thử:

```env
PROCESSING_WORK_MEM=512MB
```

Sau khi sửa `.env`, restart backend.

## Lưu ý

- Không nên chạy nhiều job xử lý dữ liệu cùng lúc.
- Không nên bấm `Chạy lại job kẹt` nếu PostgreSQL vẫn còn query active.
- Không nên restart backend khi job đang xử lý bước 78%.
- Nếu thấy job đứng lâu, kiểm tra `pg_stat_activity` trước khi tạo job mới.

## Lệnh kiểm tra

```powershell
python -m compileall backend/app
```

Nếu cần kiểm tra cấu hình PostgreSQL:

```sql
select name, setting, unit
from pg_settings
where name in ('work_mem', 'temp_buffers', 'shared_buffers');
```
