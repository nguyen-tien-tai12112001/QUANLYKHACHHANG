# Ghi IP LAN thật vào phiên đăng nhập C360 trên Windows 11

## Mục đích và nguyên nhân

Hiện Docker Desktop chuyển tiếp cổng 80 qua mạng ảo. Nginx trong container chỉ nhìn thấy gateway `172.22.0.1`, nên phiên đăng nhập cũng lưu IP đó thay vì IP máy người dùng. Chỉ thay đổi code lấy `X-Forwarded-For` ở backend **không giải quyết được** và còn cho phép giả mạo IP nếu tin header từ mọi nguồn.

Luồng mới:

```text
Máy người dùng 10.8.0.x
  -> Windows 10.8.0.119:80 (Caddy, nhận IP thật và ghi đè header IP)
  -> 127.0.0.1:8080 (frontend Nginx trong Docker)
  -> backend:8000 (chỉ trong mạng Docker)
  -> phiên đăng nhập: IP 10.8.0.x
```

Tên miền nội bộ `c360.agribank.com.vn` vẫn trỏ đến `10.8.0.119`; người dùng không cần đổi URL. Caddy chạy trên **Windows host**, không chạy trong Docker. File cấu hình là [`proxy/windows/Caddyfile`](../proxy/windows/Caddyfile). Caddy **thay thế** header `X-Forwarded-For` do trình duyệt gửi, Nginx chuyển tiếp header này đến backend. Backend chỉ tin header nếu kết nối trực tiếp đến từ đúng container `frontend`.

## Điều kiện trước khi chuyển đổi

1. Máy chủ thật có IP LAN tĩnh `10.8.0.119`. Máy đang viết code không có IP này thì **không chạy script cài service trên đó**.
2. Có bản Caddy Windows x64 chính thức (`caddy.exe`) đã kiểm tra nguồn và chép vào thư mục cố định, ví dụ `D:\Apps\QUANLYKHACHHANG\proxy\caddy.exe`. Nếu máy chủ không có Internet, tải trên máy có Internet rồi chép bản nhị phân sang bằng phương tiện được quản lý. Không cần Internet khi chạy.
3. Đã đưa lên máy chủ phiên bản **backend mới** có kiểm tra proxy tin cậy, cùng file Compose mới. Nếu dùng image GHCR offline, nạp image mới trước khi chuyển cổng. Không dùng image backend cũ với cấu hình mới.
4. Sao lưu `.env` vào nơi an toàn ngoài repo; file này chứa bí mật. Không commit `.env` hoặc bản sao lên Git.
5. Thực hiện lúc ít người dùng vì khi chuyển cổng sẽ có khoảng ngắt truy cập ngắn. Các phiên đã lưu IP `172.22.0.1` **không thể sửa hồi tố**; cần đăng nhập lại để tạo phiên mới có IP thật.

Tham khảo tài liệu gốc: [Caddy reverse proxy và cách xử lý `X-Forwarded-*`](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [Caddy chạy như Windows service](https://caddyserver.com/docs/running), [Docker Desktop chuyển tiếp cổng](https://docs.docker.com/desktop/features/networking/networking-how-tos/).

## Các bước trên máy chủ `10.8.0.119`

Mở PowerShell **Run as administrator** tại thư mục dự án.

### 1. Cập nhật `.env`

Thêm hoặc chỉnh đúng một lần các biến sau:

```dotenv
FRONTEND_BIND_ADDR=127.0.0.1
FRONTEND_HOST_PORT=8080
BACKEND_BIND_ADDR=127.0.0.1
TRUSTED_PROXY_HOSTNAME=frontend
```

`BACKEND_BIND_ADDR` chỉ áp dụng cho `docker-compose.yml`; bản production vốn không xuất bản cổng backend. Không thay `AUTH_SECRET`, `DATABASE_URL`, volume PostgreSQL hoặc dữ liệu.

### 2. Chuyển frontend Docker sang cổng nội bộ

Nếu máy chủ dùng image production đã có sẵn:

```powershell
docker compose -f docker-compose.prod.yml up -d --pull never --no-build --no-deps backend frontend
```

Nếu dùng `docker-compose.yml` và máy có đủ image/nguồn để build:

```powershell
docker compose up -d --build --no-deps backend frontend
```

Kiểm tra `docker compose ps`: frontend phải có `127.0.0.1:8080->80/tcp`; backend bản development phải có `127.0.0.1:8000->8000/tcp`, production không xuất bản cổng `8000`. Kiểm tra API qua cổng nội bộ:

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/health
Get-NetTCPConnection -State Listen -LocalPort 80 -ErrorAction SilentlyContinue
```

Lệnh thứ hai không nên trả về listener đang chiếm cổng 80. Nếu còn, kiểm tra tiến trình trước khi cài Caddy; không dừng dịch vụ khác một cách tùy tiện.

### 3. Cài Caddy làm Windows service

Giả sử đã chép `caddy.exe` vào `D:\Apps\QUANLYKHACHHANG\proxy\caddy.exe`:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\install-c360-lan-proxy.ps1 -CaddyExe 'D:\Apps\QUANLYKHACHHANG\proxy\caddy.exe'
```

Script kiểm tra IP máy chủ, kiểm tra frontend `8080`, kiểm tra cổng `80`, validate Caddyfile, rồi cài service `C360LanProxy` khởi động trễ cùng Windows và tự thử khởi động lại khi lỗi. Nó **không ghi đè** Caddyfile hoặc service đã tồn tại. Bản Caddyfile dùng thực tế được chép cạnh `caddy.exe` để không phụ thuộc vị trí clone repo. Nếu thay Caddyfile sau này, phải cập nhật bản cạnh `caddy.exe` rồi dùng `caddy reload` hoặc khởi động lại service có kiểm soát.

### 4. Xác nhận từ một máy LAN khác

Máy người dùng ví dụ có IP `10.8.0.120`. Trên máy đó:

```powershell
Test-NetConnection 10.8.0.119 -Port 80
Invoke-RestMethod http://c360.agribank.com.vn/api/health
Test-NetConnection 10.8.0.119 -Port 8080
Test-NetConnection 10.8.0.119 -Port 8000
```

Hai phép thử cổng `8080` và `8000` từ máy khác phải trả về `TcpTestSucceeded: False`; nếu không, chưa khóa được đường truy cập tắt. Sau đó đăng nhập **một phiên mới** từ máy `10.8.0.120`, vào trang quản trị phiên đăng nhập để xác nhận IP hiện `10.8.0.120` (hoặc IP thực tế của máy đó). Thử từ hai máy LAN khác nhau. Trên máy chủ, kiểm tra Caddy và container:

```powershell
Get-Service C360LanProxy
docker compose ps
Get-NetTCPConnection -State Listen -LocalPort 80,8080,8000 | Select-Object LocalAddress,LocalPort,OwningProcess
```

Cổng `8080` và `8000` chỉ nên nghe trên `127.0.0.1`; cổng `80` do Caddy nghe trên `10.8.0.119` và `127.0.0.1`. Windows Firewall vẫn chỉ mở TCP `80` cho LAN được phép. Caddy không thay cơ chế DNS hiện tại.

## Nếu có lỗi: khôi phục truy cập cũ

Chỉ dùng tạm để người dùng vào lại hệ thống; cách cũ sẽ tiếp tục ghi gateway Docker thay vì IP thật.

```powershell
Stop-Service C360LanProxy
```

Đặt lại trong `.env`: `FRONTEND_BIND_ADDR=0.0.0.0`, `FRONTEND_HOST_PORT=80`, `TRUSTED_PROXY_HOSTNAME=`. Chạy lại frontend/backend với đúng file Compose đã dùng ở bước 2; kiểm tra `http://10.8.0.119/api/health`. Không xóa volume hoặc chạy lệnh xóa DB. Sau khi xử lý sự cố, quay lại cấu hình proxy theo các bước trên.

## Giới hạn cần biết

- IP hiển thị là IP **kết nối đến Windows host**. Nếu mạng có NAT hoặc một reverse proxy khác đứng trước Caddy, IP thấy được có thể là IP của thiết bị đó; chỉ tin header từ proxy trước khi đã cấu hình danh sách proxy tin cậy và chống giả mạo.
- Không dùng IP làm căn cứ duy nhất để nhận diện hoặc cấp quyền người dùng. IP có thể đổi theo DHCP, VPN hoặc chính sách mạng.
- Luồng này vẫn là HTTP nội bộ như hiện tại. Với dữ liệu nhạy cảm, bước tiếp theo nên là HTTPS bằng chứng thư nội bộ, không phụ thuộc Internet.
