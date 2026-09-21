# QUY TRÌNH SAO LƯU VÀ KHÔI PHỤC C360

- **Mã tài liệu:** C360-DBA-02
- **Phiên bản:** 1.0
- **Ngày cập nhật:** 21/09/2026
- **Đối tượng:** Quản trị hệ thống, quản trị PostgreSQL và người được giao quản lý backup

## 1. Mục tiêu

Quy trình bảo vệ ba nhóm tài sản:

1. PostgreSQL: CIF, dữ liệu nguồn, kết quả xử lý, người dùng, quyền, cấu hình và nhật ký.
2. File host: uploads, exports cần lưu, documents/danh mục và file cấu hình vận hành.
3. Cấu hình triển khai: `.env`, image tag/digest, Docker Compose và migration đang áp dụng.

Backup chỉ được coi là hợp lệ khi đã kiểm tra đọc được và định kỳ phục hồi thử trên môi trường tách biệt.

## 2. Mục tiêu phục hồi cần phê duyệt

| Chỉ tiêu | Đề xuất ban đầu | Đơn vị phê duyệt |
|---|---:|---|
| RPO – lượng dữ liệu tối đa có thể mất | 24 giờ; trước thao tác lớn phải backup ngay | **CẦN XÁC NHẬN** |
| RTO – thời gian khôi phục mục tiêu | 4 giờ trong giờ làm việc | **CẦN XÁC NHẬN** |
| Giữ backup ngày | 14 bản | **CẦN XÁC NHẬN** |
| Giữ backup tuần | 8 bản | **CẦN XÁC NHẬN** |
| Giữ backup tháng | 12 bản | **CẦN XÁC NHẬN** |
| Số vị trí lưu | Ít nhất 2, không cùng một ổ vật lý | **CẦN XÁC NHẬN** |

## 3. Nguyên tắc bắt buộc

- Không lưu bản backup duy nhất trong chính Docker volume DB.
- Không đẩy backup, `.env`, dữ liệu KH hoặc khóa bí mật lên Git.
- Thư mục backup phải nằm trên ổ D hoặc thiết bị lưu trữ riêng, có phân quyền NTFS.
- Mã hóa bản backup khi sao chép ra ngoài máy chủ.
- Chỉ người được giao quyền mới được đọc/phục hồi backup.
- Ghi checksum, dung lượng, thời gian, DB nguồn và người tạo.
- Không ghi mật khẩu DB trực tiếp vào tài liệu hoặc tên file.

## 4. Vị trí lưu chuẩn

Với `docker-compose.prod.yml`:

```text
Host:      D:\Apps\QUANLYKHACHHANG\data\backups
Container: /backups
```

Biến `APP_DATA_DIR` phải trỏ tới `D:/Apps/QUANLYKHACHHANG/data` hoặc đường dẫn đã được đơn vị phê duyệt.

## 5. Sao lưu PostgreSQL thủ công

### 5.1. Tạo backup định dạng custom trực tiếp ra ổ D

Đặt tên file không có dấu cách, ví dụ `c360_20260921_220000.dump`:

```powershell
docker compose -f docker-compose.prod.yml exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /backups/c360_20260921_220000.dump'
```

Cách này không tạo file tạm trong ổ C và hỗ trợ `pg_restore` linh hoạt hơn file SQL thuần.

### 5.2. Kiểm tra file trên host

```powershell
Get-Item D:\Apps\QUANLYKHACHHANG\data\backups\c360_20260921_220000.dump
Get-FileHash D:\Apps\QUANLYKHACHHANG\data\backups\c360_20260921_220000.dump -Algorithm SHA256
docker compose -f docker-compose.prod.yml exec -T postgres pg_restore --list /backups/c360_20260921_220000.dump
```

Kết quả hợp lệ khi file có dung lượng hợp lý, lệnh checksum thành công và `pg_restore --list` đọc được danh mục đối tượng.

### 5.3. Ghi biên bản backup

| Thuộc tính | Nội dung |
|---|---|
| Tên file |  |
| Thời điểm bắt đầu/kết thúc |  |
| Dung lượng |  |
| SHA-256 |  |
| Alembic revision |  |
| Image tag/digest |  |
| Người thực hiện |  |
| Kết quả kiểm tra |  |

## 6. Sao lưu file và cấu hình

Cần sao lưu riêng:

- `data/documents` nếu có danh mục riêng của máy chủ.
- File bổ sung còn cần đối chiếu và file upload chưa xử lý xong.
- File export bắt buộc lưu hồ sơ; không cần giữ toàn bộ export tạm.
- `.env` bằng kho bí mật nội bộ hoặc bản mã hóa; không đặt chung bản sao công khai.
- `docker-compose.prod.yml`, tag/digest image và danh sách migration.
- Tài liệu cấu hình DNS/proxy/firewall.

Không sao chép nóng thư mục dữ liệu vật lý PostgreSQL khi container vẫn chạy để thay cho `pg_dump`.

## 7. Lịch sao lưu đề xuất

| Thời điểm | Loại | Ghi chú |
|---|---|---|
| Hằng đêm | PostgreSQL custom dump | Chạy ngoài giờ import/xử lý |
| Trước migration | PostgreSQL + cấu hình | Bắt buộc |
| Trước xóa/thay thế kỳ lớn | PostgreSQL | Bắt buộc |
| Cuối tháng sau chốt kỳ | DB + tài liệu đối soát | Giữ dài hạn |
| Hằng tuần | Sao chép sang vị trí thứ hai | Có checksum |
| Hằng quý | Diễn tập restore | Trên DB/máy tách biệt |

## 8. Khôi phục toàn bộ PostgreSQL

### 8.1. Điều kiện trước khi phục hồi

1. Có phê duyệt và xác định chính xác điểm phục hồi.
2. Giữ nguyên bản backup hiện tại trước khi ghi đè.
3. Ghi lại image tag, migration và `.env` đang chạy.
4. Đảm bảo file dump đọc được bằng `pg_restore --list`.
5. Thông báo thời gian gián đoạn.

### 8.2. Dừng luồng ghi dữ liệu

```powershell
docker compose -f docker-compose.prod.yml stop frontend backend
docker compose -f docker-compose.prod.yml ps
```

Giữ PostgreSQL chạy để thực hiện restore.

### 8.3. Tạo bản backup an toàn cuối cùng

Nếu DB vẫn đọc được, tạo một dump trước phục hồi với hậu tố `before_restore`.

### 8.4. Phục hồi dump

```powershell
docker compose -f docker-compose.prod.yml exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB" /backups/c360_20260921_220000.dump'
```

Nếu có kết nối khác làm cản trở, phải xác định và ngắt có kiểm soát; không kill bừa tiến trình khi chưa biết tác vụ đang chạy.

### 8.5. Đồng bộ schema và khởi động lại

```powershell
docker compose -f docker-compose.prod.yml start backend
docker compose -f docker-compose.prod.yml exec backend alembic current
docker compose -f docker-compose.prod.yml start frontend
docker compose -f docker-compose.prod.yml ps
```

Chỉ chạy `alembic upgrade head` nếu bản code được phê duyệt yêu cầu revision cao hơn DB vừa phục hồi.

## 9. Kiểm tra sau phục hồi

- [ ] `/api/health` thành công.
- [ ] Đăng nhập được bằng tài khoản kiểm thử.
- [ ] Số người dùng, chi nhánh và nhóm quyền hợp lý.
- [ ] Kỳ dữ liệu gần nhất còn tồn tại.
- [ ] Một KH mẫu mở đủ tiền gửi, tiền vay, phí và sản phẩm.
- [ ] Job không bị treo ở trạng thái chạy từ thời điểm backup.
- [ ] Xuất thử một file nhỏ.
- [ ] Nhật ký ghi rõ việc phục hồi.

Đối soát thêm tối thiểu ba KPI trọng yếu với biên bản chốt kỳ trước khi mở lại cho người dùng.

## 10. Phục hồi trên máy chủ mới

1. Cài Docker Desktop và chuẩn bị image offline nếu không có Internet.
2. Tạo đúng cấu trúc thư mục ổ D.
3. Khôi phục `.env` an toàn; không dùng lại `AUTH_SECRET` mẫu.
4. Khởi động riêng PostgreSQL/Redis.
5. Chép file dump vào `data/backups`.
6. Phục hồi DB.
7. Khởi động backend, kiểm tra migration rồi khởi động frontend.
8. Cấu hình IP tĩnh, firewall, DNS và tên miền LAN.
9. Kiểm tra từ ít nhất một máy trạm khác.

Nếu thay `AUTH_SECRET`, toàn bộ phiên cũ phải đăng nhập lại; đây là hành vi đúng.

## 11. Diễn tập phục hồi

Diễn tập không được ghi đè DB production. Dùng máy/DB tách biệt và lập biên bản:

| Nội dung | Kết quả |
|---|---|
| File dump và checksum |  |
| Thời gian restore |  |
| Alembic revision |  |
| Số bảng/record mẫu |  |
| Kiểm tra đăng nhập |  |
| Kiểm tra KPI mẫu |  |
| Sai lệch/phát hiện |  |
| Người xác nhận |  |

## 12. Dọn backup an toàn

1. Liệt kê file theo ngày, dung lượng và checksum.
2. Áp dụng chính sách ngày/tuần/tháng đã phê duyệt.
3. Bảo đảm còn ít nhất một bản ở vị trí thứ hai.
4. Không xóa bản cuối tháng đã dùng chốt số liệu khi chưa hết thời hạn lưu hồ sơ.
5. Ghi nhật ký tên file đã xóa, lý do, người thực hiện.

## 13. Trường hợp backup/restore thất bại

- Dừng thao tác tiếp theo; không ghi đè file dump lỗi.
- Lưu nguyên log, dung lượng, checksum và thông báo lỗi.
- Kiểm tra dung lượng ổ đĩa, quyền NTFS, health PostgreSQL và đường mount.
- Nếu restore dở dang trên DB production, không mở lại hệ thống trước khi đánh giá tính nhất quán.
- Báo ngay sự cố P1 nếu không còn bản backup đọc được hoặc nghi mất dữ liệu.

## 14. Những điểm cần cải tiến tiếp

- Tạo tác vụ Windows Task Scheduler cho backup đêm và log riêng.
- Tự động kiểm tra `pg_restore --list` và SHA-256.
- Cảnh báo khi backup quá hạn hoặc ổ D dưới ngưỡng.
- Mã hóa và sao chép backup sang thiết bị/máy lưu trữ thứ hai.
- Theo dõi thời gian backup/restore để chốt RPO/RTO thực tế.
