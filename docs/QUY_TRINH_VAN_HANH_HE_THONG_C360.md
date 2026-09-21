# QUY TRÌNH VẬN HÀNH HỆ THỐNG C360

- **Mã tài liệu:** C360-OPS-01
- **Phiên bản:** 1.0
- **Ngày cập nhật:** 21/09/2026
- **Đối tượng:** Quản trị hệ thống, quản trị dữ liệu và cán bộ kỹ thuật vận hành máy chủ

> Đây là tài liệu vận hành chuẩn. Hướng dẫn triển khai máy mới nằm tại `TRIEN_KHAI_DOCKER_LAN_OFFLINE_WINDOWS.md`; quy trình sao lưu và phục hồi nằm tại `QUY_TRINH_SAO_LUU_KHOI_PHUC_C360.md`.

## 1. Mục đích và phạm vi

Tài liệu quy định cách khởi động, dừng, kiểm tra, giám sát và xử lý sự cố thường gặp của C360 trên máy chủ Windows 11 chạy Docker. Mục tiêu là:

- Duy trì hệ thống ổn định trong mạng LAN, kể cả khi không có Internet.
- Phát hiện sớm lỗi dịch vụ, thiếu dung lượng, job kẹt hoặc dữ liệu chưa sẵn sàng.
- Không làm mất dữ liệu khi khởi động lại, nâng cấp hoặc xử lý sự cố.
- Ghi nhận đầy đủ người thực hiện, thời gian, nguyên nhân và kết quả.

Tài liệu không cho phép người vận hành tự sửa công thức nghiệp vụ hoặc thao tác trực tiếp vào bảng dữ liệu để làm số liệu khớp.

## 2. Thành phần phải được giám sát

| Thành phần | Container | Vai trò | Dữ liệu bền vững |
|---|---|---|---|
| Frontend | `qlkh_frontend` | Nginx phục vụ React và proxy `/api` | Không |
| Backend | `qlkh_backend` | FastAPI, import, xử lý và xuất báo cáo | Upload/export gắn với `APP_DATA_DIR` |
| PostgreSQL | `qlkh_postgres` | Kho dữ liệu chính | Docker volume `quanlykhachhang_postgres_data` |
| Redis | `qlkh_redis` | Cache phân tích theo phiên | Không; cấu hình không persistence |
| DNS nội bộ | `qlkh_dns` | Phân giải tên miền LAN khi bật profile | File `dns/Corefile` |

Redis bị xóa hoặc khởi động lại chỉ làm mất cache; PostgreSQL, file import và file backup mới là dữ liệu cần bảo vệ.

## 3. Thông tin môi trường chuẩn

Thư mục ví dụ trên máy chủ:

```text
D:\Apps\QUANLYKHACHHANG\
├─ source\                  mã nguồn hoặc bộ triển khai
└─ data\
   ├─ uploads\              file đang chờ/đang xử lý
   ├─ exports\              file xuất do hệ thống tạo
   ├─ backups\              backup PostgreSQL
   └─ documents\            danh mục/file seed chỉ đọc
```

Các biến quan trọng trong `.env`:

| Biến | Ý nghĩa | Yêu cầu |
|---|---|---|
| `DATABASE_URL` | Kết nối PostgreSQL | Trong Docker dùng host `postgres` |
| `AUTH_SECRET` | Ký token đăng nhập | Riêng từng máy, tối thiểu 32 ký tự |
| `CORS_ORIGINS` | Các URL được phép gọi API | Khai báo URL LAN/tên miền nội bộ |
| `APP_DATA_DIR` | Gốc dữ liệu file trên host | Nên đặt tại ổ D |
| `SESSION_IDLE_MINUTES` | Thời gian tự thoát khi không hoạt động | Mặc định 30 phút |
| `ANALYSIS_CACHE_TTL` | Thời gian sống cache | Mặc định 900 giây |
| `IMPORT_WORKER_COUNT` | Số worker import | Chỉ tăng sau khi đo CPU/RAM/IO |

`APP_DATA_DIR` không tự di chuyển Docker volume PostgreSQL. Phải kiểm tra vị trí Docker disk image/volume riêng trước khi kết luận DB đã nằm trên ổ D.

## 4. Khởi động hệ thống

### 4.1. Kiểm tra trước khi khởi động

1. Kiểm tra ổ D còn dung lượng cho DB, upload và backup.
2. Kiểm tra `.env` tồn tại và không dùng mật khẩu/`AUTH_SECRET` mẫu.
3. Kiểm tra Docker Desktop đã chạy.
4. Nếu máy chủ không có Internet, kiểm tra đủ bốn image frontend, backend, PostgreSQL và Redis.
5. Không khởi động thêm một bộ C360 khác dùng cùng cổng hoặc cùng volume.

### 4.2. Khởi động production

Chạy PowerShell tại thư mục dự án:

```powershell
docker compose -f docker-compose.prod.yml config
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

Kết quả đạt khi bốn service đều ở trạng thái `Up`; PostgreSQL, Redis, backend và frontend lần lượt chuyển thành `healthy`.

### 4.3. Kiểm tra sau khởi động

```powershell
Invoke-WebRequest http://127.0.0.1/api/health -UseBasicParsing
docker compose -f docker-compose.prod.yml exec backend alembic current
docker compose -f docker-compose.prod.yml logs --tail 100 backend
```

Từ một máy người dùng trong LAN, kiểm tra:

```powershell
Resolve-DnsName c360.agribank.com.vn
Test-NetConnection 10.8.0.119 -Port 80
```

Sau đó đăng nhập bằng tài khoản kiểm thử, chọn một kỳ nhỏ và mở Dashboard, danh sách KH, hồ sơ KH.

## 5. Dừng và khởi động lại

### 5.1. Khởi động lại một dịch vụ

```powershell
docker compose -f docker-compose.prod.yml restart backend
docker compose -f docker-compose.prod.yml restart frontend
```

Chỉ khởi động lại PostgreSQL khi không có import, xử lý kỳ hoặc backup đang chạy.

### 5.2. Dừng toàn bộ có kiểm soát

```powershell
docker compose -f docker-compose.prod.yml stop
```

### 5.3. Chạy lại sau khi dừng

```powershell
docker compose -f docker-compose.prod.yml start
docker compose -f docker-compose.prod.yml ps
```

### 5.4. Lệnh bị cấm trên máy production

Không chạy nếu chưa có phê duyệt và backup đã kiểm tra:

```powershell
docker compose down -v
docker volume rm quanlykhachhang_postgres_data
docker system prune --volumes
```

Không dùng `git reset --hard`, xóa thư mục dữ liệu, `alembic downgrade` hoặc SQL `DROP/TRUNCATE` như một cách sửa lỗi nhanh.

## 6. Kiểm tra vận hành hằng ngày

### 6.1. Đầu ngày

```powershell
docker compose -f docker-compose.prod.yml ps
docker stats --no-stream
docker compose -f docker-compose.prod.yml logs --since 24h --tail 300 backend
Get-PSDrive C,D
```

Checklist:

- [ ] Các container đều chạy và healthy.
- [ ] `/api/health` trả về thành công.
- [ ] Không có chuỗi lỗi lặp lại trong log backend/PostgreSQL.
- [ ] Không có job import/xử lý ở trạng thái chạy quá lâu.
- [ ] Ổ chứa Docker và ổ D còn dung lượng an toàn.
- [ ] Người dùng thử đăng nhập và truy vấn được một kỳ.

### 6.2. Cuối ngày

- Kiểm tra các job import/xử lý đã kết thúc.
- Kiểm tra file upload thành công đã được dọn theo `DELETE_UPLOAD_AFTER_SUCCESS`.
- Kiểm tra tác vụ xuất Excel bất thường hoặc file export tồn tại quá lâu.
- Ghi nhật ký nếu có restart, phục hồi job, xóa file/kỳ hoặc thay đổi cấu hình.

## 7. Kiểm tra hằng tuần và hằng tháng

### Hằng tuần

- Kiểm tra backup gần nhất và dung lượng thư mục backup.
- Kiểm tra một bản backup bằng `pg_restore --list`.
- Rà phiên đăng nhập bất thường, tài khoản bị khóa và quyền cấp trực tiếp.
- Kiểm tra dung lượng Docker bằng `docker system df -v`.
- Không xóa image/volume khi chưa phân biệt rõ thành phần đang sử dụng.

### Trước khi xử lý kỳ tháng

- Kiểm tra ma trận nguồn theo chi nhánh.
- Kiểm tra ngày thiếu của FTPLN.
- Kiểm tra file CIF mới có làm thay đổi tập nền hay không.
- Đảm bảo không còn job kẹt của kỳ trước.
- Tạo backup trước khi xóa/thay thế nhiều file hoặc xử lý lại kỳ quan trọng.

### Sau khi xử lý kỳ

- Kiểm tra trạng thái job là thành công và báo cáo chất lượng đạt.
- Kiểm tra danh sách không khớp CIF.
- Đối soát KPI trọng yếu với nguồn/báo cáo chuẩn.
- Chỉ công bố kỳ sau khi người phụ trách nghiệp vụ xác nhận.

## 8. Theo dõi log và sức khỏe hệ thống

```powershell
docker compose -f docker-compose.prod.yml logs -f --tail 200 backend
docker compose -f docker-compose.prod.yml logs -f --tail 200 postgres
docker compose -f docker-compose.prod.yml logs -f --tail 200 frontend
docker compose -f docker-compose.prod.yml logs -f --tail 200 redis
```

Các dấu hiệu cần xử lý ngay:

| Dấu hiệu | Khả năng | Hành động đầu tiên |
|---|---|---|
| Backend unhealthy | Migration, DB hoặc cấu hình sai | Xem log backend và PostgreSQL |
| API 500 | SQL, dữ liệu hoặc code | Ghi URL, thời điểm, request và trace log |
| Network Error mọi máy | Frontend/backend/cổng 80 | Kiểm tra container, firewall và IP |
| Chỉ một máy lỗi | DNS/cache/trình duyệt máy trạm | Kiểm tra `Resolve-DnsName`, ping và cache |
| Dashboard chậm | Query rộng, cache lạnh, DB bận | Kiểm tra CPU/RAM/IO và truy vấn đang chạy |
| Job import đứng | File lớn, lỗi parser hoặc worker chết | Xem tiến trình job và log; không chạy trùng |
| Ổ đĩa tăng nhanh | PostgreSQL/WAL/upload/export/image | Đo từng vùng trước khi xóa |

## 9. Quản lý dung lượng

### 9.1. Đo trước khi dọn

```powershell
docker system df -v
docker volume inspect quanlykhachhang_postgres_data
Get-ChildItem D:\Apps\QUANLYKHACHHANG\data -Directory | ForEach-Object {
  [PSCustomObject]@{Name=$_.Name; GB=[math]::Round((Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum/1GB,2)}
}
```

### 9.2. Có thể dọn có kiểm soát

- File export hết hạn sau khi xác nhận người dùng không còn cần.
- File upload thành công đã được lưu vào DB và không còn job tham chiếu.
- Image Docker không còn được container nào dùng.
- Backup cũ theo chính sách lưu giữ, sau khi còn đủ bản ngày/tuần/tháng.

Không xóa trực tiếp file trong Docker volume PostgreSQL.

## 10. Vận hành import và xử lý dữ liệu

1. Import file qua giao diện, không copy thẳng vào thư mục upload để mong hệ thống tự nhận.
2. Theo dõi từng bước của job cho tới khi thành công/thất bại.
3. Nếu file lỗi, lưu nguyên thông báo, tên file, checksum/thời điểm và số dòng.
4. Không sửa tên/cột tùy ý để vượt kiểm tra.
5. Chỉ chạy xử lý KH sau khi đánh giá độ sẵn sàng nguồn.
6. Khi CIF hoặc nguồn thay đổi sau lần xử lý, phải xử lý lại kỳ liên quan.
7. Chức năng phục hồi job chỉ dùng cho job đã thực sự kẹt; không tạo job thứ hai song song.

## 11. Quy trình nâng cấp phiên bản

1. Chốt phạm vi thay đổi và migration.
2. Chạy kiểm thử ở máy phát triển/UAT.
3. Tạo backup DB và ghi lại image tag hiện tại.
4. Thông báo thời gian bảo trì nếu migration lớn.
5. Pull image đã duyệt hoặc chạy pipeline triển khai.
6. Backend chạy `alembic upgrade head` trước khi phục vụ request.
7. Kiểm tra health, revision, đăng nhập, quyền và một bộ số liệu mẫu.
8. Nếu lỗi, dừng triển khai; quay lại image cũ chỉ khi schema còn tương thích. Nếu không tương thích, phục hồi DB theo quy trình riêng.

Không dùng tag `latest` làm bằng chứng phiên bản khi nghiệm thu; cần ghi lại digest hoặc tag bất biến của image.

## 12. Xử lý sự cố theo mức độ

| Mức | Ví dụ | Phản ứng |
|---|---|---|
| P1 | Mất DB, toàn hệ thống ngừng, nghi rò rỉ dữ liệu | Dừng thay đổi, cô lập, báo phụ trách ngay, bảo toàn log |
| P2 | Import/xử lý kỳ thất bại, số KPI sai diện rộng | Ngừng công bố kỳ, thu thập bằng chứng, xử lý trong ngày |
| P3 | Một chức năng/nhóm người dùng lỗi | Ghi ticket, có phương án tạm thời, sửa theo bản phát hành |
| P4 | Lỗi giao diện nhỏ/đề xuất | Đưa backlog và ưu tiên theo kế hoạch |

Biên bản sự cố tối thiểu gồm: thời điểm, người phát hiện, tài khoản/phạm vi, chức năng, thông báo lỗi, log liên quan, dữ liệu/kỳ bị ảnh hưởng, hành động đã làm và kết quả.

## 13. Checklist bàn giao ca/vận hành

- [ ] Trạng thái bốn container chính.
- [ ] Dung lượng ổ C/D và Docker.
- [ ] Backup gần nhất và kết quả kiểm tra.
- [ ] Job import/xử lý đang chạy hoặc bị lỗi.
- [ ] Kỳ đang được chuẩn bị/công bố.
- [ ] Sự cố chưa hoàn thành và người tiếp nhận.
- [ ] Thay đổi cấu hình/quyền trong ca.
- [ ] Image tag, migration hiện tại nếu vừa nâng cấp.

## 14. Nội dung cần đơn vị điền trước khi ban hành

| Nội dung | Giá trị |
|---|---|
| Người phụ trách chính | **CẦN ĐIỀN** |
| Người thay thế | **CẦN ĐIỀN** |
| Thư mục triển khai thực tế | **CẦN ĐIỀN** |
| Nơi lưu backup thứ hai | **CẦN ĐIỀN** |
| Ngưỡng cảnh báo dung lượng | **CẦN ĐIỀN** |
| Kênh báo sự cố P1/P2 | **CẦN ĐIỀN** |
