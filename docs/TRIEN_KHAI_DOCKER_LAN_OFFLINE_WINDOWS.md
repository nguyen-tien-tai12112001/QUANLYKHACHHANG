# Triển khai QUANLYKHACHHANG trong LAN không có Internet

> Để phiên đăng nhập ghi IP thật của máy người dùng thay vì gateway Docker `172.22.0.1`, triển khai thêm proxy trên Windows theo [hướng dẫn ghi IP thật](GHI_IP_THAT_PHIEN_DANG_NHAP_LAN_WINDOWS.md). Các bước bên dưới về DNS và truy cập LAN vẫn áp dụng.

## 1. Mô hình triển khai

Máy chủ Windows 11 sử dụng IP tĩnh `10.8.0.119/24`. Người dùng trong cùng mạng LAN truy cập:

```text
http://c360.agribank.com.vn
```

Luồng kết nối:

```text
Máy người dùng
    ↓ hỏi DNS TCP/UDP 53
CoreDNS: c360.agribank.com.vn → 10.8.0.119
    ↓ HTTP cổng 80
Windows Caddy (nhận IP người dùng)
    -> Nginx / Frontend Docker trên 127.0.0.1:8080
    ↓ /api qua mạng Docker nội bộ
Backend FastAPI
    ├─ PostgreSQL: postgres:5432
    └─ Redis: redis:6379
```

Trình duyệt không gọi `localhost:8000`. Frontend dùng đường dẫn `/api`, vì vậy mọi máy trong LAN đều sử dụng đúng backend trên máy chủ `10.8.0.119`.

## 2. Điều kiện cần có trước khi ngắt Internet

Máy chủ phải có sẵn:

- Docker Desktop đang hoạt động và được cấu hình tự khởi động cùng Windows.
- Image `quanlykhachhang-backend:latest`.
- Image `quanlykhachhang-frontend:latest`.
- Image `postgres:16`.
- Image `redis:7-alpine`.
- Image `coredns/coredns:latest`.
- Mã nguồn dự án và file `.env`.
- Docker volume chứa PostgreSQL hiện tại.

Kiểm tra image:

```powershell
docker image inspect quanlykhachhang-backend:latest quanlykhachhang-frontend:latest postgres:16 redis:7-alpine coredns/coredns:latest
```

Không chạy `docker compose build`, `docker pull`, `npm install` hoặc `pip install` khi máy đã mất Internet. Bản chạy offline sử dụng image đã build sẵn.

## 3. Cấu hình IP tĩnh Windows

Thông số của máy chủ:

- Card mạng: `Ethernet`.
- IP: `10.8.0.119`.
- Prefix: `/24`, tương đương subnet mask `255.255.255.0`.
- Gateway: `10.8.0.1` nếu hệ thống mạng nội bộ sử dụng gateway này.

Kiểm tra:

```powershell
Get-NetIPAddress -InterfaceAlias Ethernet -AddressFamily IPv4
Get-NetRoute -InterfaceAlias Ethernet -DestinationPrefix 0.0.0.0/0
Get-NetAdapter -Name Ethernet
```

Card Ethernet phải có trạng thái `Up`. Nếu là `Disconnected`, hãy cắm dây mạng vào switch LAN trước khi chạy dự án.

## 4. Cấu hình Windows Firewall

Mở PowerShell bằng quyền Administrator và chạy một lần:

```powershell
powershell -ExecutionPolicy Bypass -File .\configure-lan-firewall.ps1
```

Script mở TCP `80` cho giao diện và TCP/UDP `53` cho CoreDNS, chỉ nhận kết nối từ `10.8.0.0/24`. Không cần mở cổng backend `8000` vì Nginx đã proxy `/api` qua mạng Docker nội bộ.

Chỉ mở PostgreSQL `5432` khi máy nghiệp vụ thực sự cần kết nối DB trực tiếp. Không nên mở cho toàn bộ mạng nếu chỉ sử dụng giao diện C360.

## 5. Khởi động hoàn toàn offline

Mở PowerShell tại thư mục dự án và chạy:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-lan-offline.ps1
```

Script sẽ:

1. Kiểm tra máy có IP `10.8.0.119`.
2. Kiểm tra card Ethernet đang kết nối.
3. Kiểm tra đủ năm Docker image.
4. Chạy Docker profile `lan-dns` bằng `--no-build`, không tải dữ liệu Internet.
5. Chờ CoreDNS, PostgreSQL, Redis, backend và frontend đạt trạng thái `healthy`.
6. Kiểm tra DNS, frontend và API qua chính IP LAN.

## 6. Cấu hình DNS cho máy người dùng

CoreDNS chỉ ghi đè đúng bản ghi:

```text
c360.agribank.com.vn → 10.8.0.119
```

Các tên khác được chuyển tiếp tới DNS/gateway `10.8.0.1`. Tốt nhất cấu hình DHCP của mạng phát DNS chính `10.8.0.119` cho các máy người dùng.

Để thử trên một máy Windows, mở PowerShell bằng quyền Administrator:

```powershell
Set-DnsClientServerAddress -InterfaceAlias "Ethernet" -ServerAddresses 10.8.0.119
ipconfig /flushdns
Resolve-DnsName c360.agribank.com.vn
```

Khôi phục máy người dùng về nhận DNS tự động:

```powershell
Set-DnsClientServerAddress -InterfaceAlias "Ethernet" -ResetServerAddresses
```

## 7. Kiểm tra từ máy người dùng

Máy người dùng phải có IP cùng dải, ví dụ `10.8.0.120/24`. Chạy:

```powershell
ping 10.8.0.119
Test-NetConnection 10.8.0.119 -Port 80
Resolve-DnsName c360.agribank.com.vn -Server 10.8.0.119
```

Sau đó mở trình duyệt:

```text
http://c360.agribank.com.vn
```

Không sử dụng `localhost`, `127.0.0.1` hoặc cổng `8000` trên máy người dùng.

## 8. Kiểm tra khi có lỗi

Trên máy chủ:

```powershell
docker compose ps
docker compose logs --tail 100 frontend
docker compose logs --tail 100 backend
docker compose logs --tail 100 postgres
docker compose logs --tail 100 redis
docker compose logs --tail 100 dns
Invoke-WebRequest -UseBasicParsing http://10.8.0.119/
Invoke-RestMethod http://10.8.0.119/api/health
Resolve-DnsName c360.agribank.com.vn -Server 10.8.0.119
```

Nếu máy chủ truy cập được nhưng máy khác không truy cập được, kiểm tra theo thứ tự:

1. Card Ethernet có trạng thái `Up`.
2. Hai máy có cùng subnet `10.8.0.0/24`.
3. Máy người dùng ping được `10.8.0.119`.
4. Windows Firewall đã mở TCP 80 và TCP/UDP 53 cho `10.8.0.0/24`.
5. Không có thiết bị mạng chặn giao tiếp giữa các máy trong VLAN.

Nếu container `qlkh_dns` báo không bind được cổng 53:

```powershell
Get-NetUDPEndpoint -LocalPort 53 | Select-Object LocalAddress, OwningProcess
tasklist /svc /fi "PID eq <PID_VUA_TIM_DUOC>"
```

Trên máy hiện tại, dịch vụ `SharedAccess` có thể giữ UDP 53 khi Internet Connection Sharing/Mobile Hotspot đang bật. Hãy tắt Mobile Hotspot và chia sẻ Internet, sau đó khởi động lại Docker Desktop. Không tắt cưỡng bức dịch vụ này khi Docker đang chạy nếu chưa kiểm tra, vì Hyper-V/WSL có thể đang sử dụng nó.

## 9. Tự chạy lại sau khi khởi động máy

Các service đã dùng `restart: unless-stopped`. Cần bật Docker Desktop tự khởi động:

```text
Docker Desktop → Settings → General → Start Docker Desktop when you sign in
```

Sau khi Docker Engine hoạt động, các container sẽ tự khởi động lại. Có thể chạy `start-lan-offline.ps1` để kiểm tra toàn bộ trạng thái.

## 10. Cập nhật phiên bản khi máy chủ không có Internet

Trên máy có Internet và có mã nguồn mới:

```powershell
docker compose build backend frontend
docker save -o quanlykhachhang-images.tar quanlykhachhang-backend:latest quanlykhachhang-frontend:latest postgres:16 redis:7-alpine coredns/coredns:latest
```

Chuyển file TAR vào máy chủ qua USB hoặc ổ mạng nội bộ, sau đó chạy:

```powershell
docker load -i .\quanlykhachhang-images.tar
docker compose up -d --no-build --force-recreate backend frontend
```

Backend tự chạy `alembic upgrade head` trước khi khởi động, vì vậy migration đi kèm image mới sẽ được áp dụng tự động.

Luôn backup PostgreSQL trước khi cập nhật phiên bản có migration.
