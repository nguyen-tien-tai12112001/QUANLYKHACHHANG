# HƯỚNG DẪN CHUYỂN TOÀN BỘ C360 SANG MÁY CHỦ `10.8.0.14`

- **Mã tài liệu:** C360-OPS-MOVE-01
- **Phiên bản:** 1.2
- **Ngày cập nhật:** 24/09/2026
- **Máy đích:** Windows 11, IP tĩnh `10.8.0.14`
- **Phạm vi:** mã nguồn, Docker image, PostgreSQL, file upload/bổ sung, tài liệu nguồn, cấu hình LAN và kiểm tra sau chuyển

> Đây là quy trình chuyển toàn bộ hệ thống, không phải chỉ sao chép mã nguồn. Dữ liệu chính đang nằm trong PostgreSQL Docker volume; chỉ clone Git sẽ không có dữ liệu CIF, dữ liệu nguồn, kết quả xử lý, người dùng, quyền và cấu hình nghiệp vụ.

## 1. Kết quả cần đạt

Sau khi hoàn tất:

- Người dùng truy cập C360 tại `http://10.8.0.14`.
- Nếu dùng DNS nội bộ, `http://c360.agribank.com.vn` phải trỏ tới `10.8.0.14`.
- PostgreSQL trên máy mới có đầy đủ dữ liệu hiện tại.
- File bổ sung, uploads, documents và cấu hình nghiệp vụ còn nguyên.
- Backend tự chạy Alembic migration đến revision của phiên bản code được chuyển.
- PostgreSQL, Redis, backend và frontend đều ở trạng thái `healthy`.
- Số lượng CIF, hồ sơ theo kỳ, người dùng và các KPI mẫu khớp máy cũ.
- Máy cũ được giữ nguyên nhưng dừng phục vụ trong thời gian xác nhận để có thể quay lui.

## 2. Kiến trúc sau khi chuyển

```text
Máy người dùng trong LAN
        |
        | HTTP 80
        v
10.8.0.14 - Frontend/Nginx Docker
        |
        | /api qua mạng Docker nội bộ
        v
Backend FastAPI
   |-- PostgreSQL 16: dữ liệu bền vững
   `-- Redis 7: cache tạm, không cần chuyển dữ liệu Redis cũ
```

Các tài sản cần chuyển:

| Nhóm | Nội dung | Bắt buộc |
|---|---|---:|
| Code | Nhánh `TAI`, migration, Compose, script, tài liệu | Có |
| PostgreSQL | Một file `pg_dump` định dạng custom `.dump` | Có |
| Docker image | Backend, frontend, PostgreSQL, Redis, CoreDNS | Có nếu máy mới không có Internet |
| Upload | `backend/uploads`, gồm file bổ sung còn được DB tham chiếu | Có |
| Documents | Thư mục `documents` | Có |
| Export | `backend/exports` nếu cần lưu hồ sơ đã xuất | Tùy nhu cầu |
| Bí mật | File `.env` hoặc bộ giá trị cấu hình tương đương | Có, chuyển riêng an toàn |
| Redis | Cache phân tích theo phiên | Không; để Redis mới khởi tạo rỗng |

## 3. Thông tin dung lượng tại thời điểm lập tài liệu

Kết quả kiểm tra máy hiện tại ngày 24/09/2026:

| Hạng mục | Dung lượng |
|---|---:|
| PostgreSQL | Khoảng `33 GB` |
| `backend/uploads` | Khoảng `0,254 GB` |
| `documents` | Khoảng `0,190 GB` |
| Ổ C còn trống | Khoảng `11,7 GB` |
| Ổ D còn trống | Khoảng `4,5 GB` |

Vì vậy:

- Không tạo file dump chuyển máy trên ổ C hoặc D của máy cũ.
- Dùng ổ ngoài, thư mục mạng hoặc ổ Z đã được phê duyệt và còn ít nhất `50 GB`.
- Máy chủ mới cần tối thiểu `100 GB` trống; khuyến nghị `150 GB` trở lên để còn chỗ import các kỳ tiếp theo, tạo index, migration và backup.
- Cần cấu hình vị trí Docker disk image trên ổ dung lượng lớn **trước khi** tạo volume PostgreSQL mới. `APP_DATA_DIR` không tự chuyển Docker volume sang ổ D.

## 4. Quy tắc an toàn bắt buộc

1. Không sao chép nóng thư mục vật lý của PostgreSQL thay cho `pg_dump`.
2. Không xóa volume hoặc dữ liệu máy cũ sau khi máy mới vừa chạy được.
3. Không đưa `.env`, file dump, dữ liệu khách hàng hoặc mật khẩu lên GitHub.
4. Không để cả hai máy cùng nhận ghi dữ liệu production sau thời điểm chuyển chính thức.
5. Phải kiểm tra file dump bằng `pg_restore --list` và SHA-256 trước khi mang sang máy mới.
6. Phải chốt một khoảng dừng hệ thống để tạo bản dump cuối cùng, tránh máy cũ phát sinh dữ liệu sau backup.
7. Giữ máy cũ nguyên trạng tối thiểu đến khi hoàn thành biên bản đối soát máy mới.

## 5. Chuẩn bị máy chủ mới `10.8.0.14`

### 5.1. Cấu hình đề xuất

Để phục vụ khoảng 100 người dùng đồng thời:

- CPU: tối thiểu 8 nhân vật lý hoặc 8 vCPU; khuyến nghị 12–16 nhân.
- RAM: tối thiểu 32 GB; khuyến nghị 64 GB khi vừa import/xử lý vừa có người dùng truy vấn.
- Ổ hệ điều hành: còn tối thiểu 30 GB.
- Ổ dữ liệu Docker: SSD/NVMe, còn ít nhất 100–150 GB.
- Mạng: LAN ổn định, IP tĩnh `10.8.0.14`.
- Windows 11 64-bit, WSL2 và Docker Desktop.

### 5.2. Danh sách phần mềm cần cài

| Phần mềm/thành phần | Mức độ | Mục đích |
|---|---|---|
| Windows 11 64-bit được hỗ trợ | Bắt buộc | Hệ điều hành máy chủ hiện tại |
| BIOS/UEFI Hardware Virtualization | Bắt buộc | Điều kiện chạy WSL2 và Linux container |
| WSL2 | Bắt buộc | Backend Linux cho Docker Desktop |
| Docker Desktop for Windows | Bắt buộc | Chạy PostgreSQL, Redis, backend, frontend và CoreDNS |
| Git for Windows | Khuyến nghị | Clone/pull nhánh `TAI`, kiểm tra commit và cập nhật code |
| Caddy bản Windows x64 | Tùy chọn | Chỉ cần khi muốn nhật ký phiên nhận đúng IP máy trạm |
| Trình duyệt Microsoft Edge/Chrome | Khuyến nghị | Kiểm tra giao diện từ máy chủ |
| PowerShell, Robocopy, Windows Firewall | Có sẵn trong Windows | Chạy script, sao chép và cấu hình mạng |

Không cần cài riêng trên Windows:

- PostgreSQL Server hoặc pgAdmin: PostgreSQL đã chạy trong Docker. Chỉ cài pgAdmin/DBeaver nếu quản trị viên thật sự cần kết nối DB trực tiếp.
- Redis Server: Redis đã chạy trong Docker.
- Node.js/npm: frontend đã được build thành Docker image.
- Python/pip: backend đã nằm trong Docker image.
- Nginx: đã nằm trong Docker image frontend.
- CoreDNS: đã nằm trong Docker image.

### 5.3. Kiểm tra Windows và ảo hóa

Docker Desktop hiện yêu cầu Windows được hỗ trợ, WSL phiên bản phù hợp và ảo hóa phần cứng. Xem tài liệu chính thức tại:

- [Docker Desktop trên Windows](https://docs.docker.com/desktop/setup/install/windows-install/)
- [Cài đặt WSL của Microsoft](https://learn.microsoft.com/windows/wsl/install)

Kiểm tra phiên bản Windows:

```powershell
winver
Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsBuildNumber, OsArchitecture
```

Kiểm tra ảo hóa:

```powershell
Get-ComputerInfo -Property HyperVisorPresent, HyperVRequirementVirtualizationFirmwareEnabled
systeminfo | Select-String 'Virtualization|Hyper-V'
```

Nếu ảo hóa chưa bật, vào BIOS/UEFI bật Intel VT-x/VT-d hoặc AMD-V/SVM rồi khởi động lại máy. Nếu máy `10.8.0.14` bản thân là máy ảo, hạ tầng phải bật nested virtualization trước.

### 5.4. Cài WSL2

Mở PowerShell bằng `Run as administrator`:

```powershell
wsl --install --no-distribution
```

Khởi động lại Windows, sau đó kiểm tra:

```powershell
wsl --version
wsl --status
```

Docker Desktop yêu cầu WSL 2 hiện đại; tài liệu Docker hiện nêu WSL `2.1.5` trở lên. Nếu máy có Internet:

```powershell
wsl --update
```

Nếu Microsoft Store bị chặn hoặc máy sẽ chạy offline, tải trước bộ cài WSL `.msi` từ trang phát hành chính thức được liên kết trong [hướng dẫn Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/#wsl-verification-and-setup), chép sang máy `10.8.0.14`, cài và khởi động lại.

Không bắt buộc cài Ubuntu riêng; Docker Desktop có thể sử dụng WSL2 backend của chính Docker.

### 5.5. Cài Docker Desktop

Tải `Docker Desktop Installer.exe` bản Windows x86_64 từ [Docker Docs](https://docs.docker.com/desktop/setup/install/windows-install/). Với máy vận hành dùng chung, nên cài chế độ all-users bằng PowerShell Administrator:

```powershell
Set-Location 'D:\BoCai'
Start-Process '.\Docker Desktop Installer.exe' -Wait -ArgumentList 'install', '--backend=wsl-2', '--accept-license'
```

Hoặc mở file cài đặt, chọn WSL2 backend và làm theo trình cài đặt.

Sau khi cài:

1. Khởi động lại Windows nếu được yêu cầu.
2. Mở Docker Desktop ít nhất một lần.
3. Chọn Linux containers, không chuyển sang Windows containers.
4. Vào `Settings > General`, bật `Start Docker Desktop when you sign in`.
5. Vào phần tài nguyên/lưu trữ và đặt Docker disk image trên ổ dữ liệu đủ lớn trước khi restore DB.
6. Cấp RAM cho Docker tối thiểu 16 GB; khuyến nghị 24–32 GB nếu máy có 64 GB RAM.
7. Cấp CPU tối thiểu 6–8 core cho Docker nếu giao diện phiên bản đang dùng cho phép điều chỉnh.
8. Không bật Kubernetes vì dự án không sử dụng và sẽ tốn thêm tài nguyên.

Kiểm tra:

```powershell
docker version
docker compose version
docker info
docker run --rm hello-world
```

Nếu máy mới không có Internet, `hello-world` có thể bỏ qua vì image này chưa được tải. Khi đó chỉ cần `docker version`, `docker compose version` và sau này kiểm tra bằng các image C360 được nạp từ TAR.

> **Lưu ý giấy phép:** Docker nêu Docker Desktop có yêu cầu thuê bao trả phí với tổ chức lớn theo điều kiện giấy phép của họ. Trước khi dùng trên hạ tầng doanh nghiệp, đơn vị phải xác nhận phương án bản quyền/thuê bao. Nếu không được phê duyệt Docker Desktop, cần đổi phương án hạ tầng sang máy Linux chạy Docker Engine hoặc nền tảng container được đơn vị cho phép; không tự ý bỏ qua điều khoản sử dụng.

#### 5.5.1. Bố trí Docker trên ổ C và dữ liệu trên ổ D

Máy mới nên giữ đúng mô hình đang sử dụng:

```text
C:\Program Files\Docker\Docker\
    Docker Desktop và các tệp chương trình

D:\DockerData\
    Docker Linux disk image
    Image, container, build cache và named volume PostgreSQL

D:\Apps\QUANLYKHACHHANG\
    app\       Mã nguồn hoặc bộ file triển khai
    data\      Upload, export, documents và backup được bind mount
    transfer\  File dump/TAR dùng trong quá trình chuyển máy
```

`D:\DockerData` và `D:\Apps\QUANLYKHACHHANG\data` là hai khu vực khác nhau:

- `D:\DockerData` do Docker Desktop quản lý. Named volume `quanlykhachhang_postgres_data` nằm bên trong Docker Linux disk image ở đây.
- `D:\Apps\QUANLYKHACHHANG\data` là dữ liệu Windows có thể nhìn thấy trực tiếp, được cấu hình bởi `APP_DATA_DIR`; gồm uploads, exports, documents và backups.
- Không đặt mã nguồn, file dump hoặc file upload thủ công vào `D:\DockerData`.
- Không sao chép nguyên thư mục `D:\DockerData` từ máy cũ sang máy mới để thay cho backup/restore PostgreSQL.

Chuẩn bị thư mục trên máy mới bằng PowerShell Administrator:

```powershell
New-Item -ItemType Directory -Force -Path `
  'D:\DockerData', `
  'D:\Apps\QUANLYKHACHHANG\app', `
  'D:\Apps\QUANLYKHACHHANG\data\uploads', `
  'D:\Apps\QUANLYKHACHHANG\data\exports', `
  'D:\Apps\QUANLYKHACHHANG\data\documents', `
  'D:\Apps\QUANLYKHACHHANG\data\backups', `
  'D:\Apps\QUANLYKHACHHANG\transfer'
```

##### Cách khuyến nghị: chỉ định ổ D ngay khi cài Docker Desktop

Thực hiện trước khi Docker Desktop được mở lần đầu. Từ thư mục chứa bộ cài, chạy PowerShell Administrator:

```powershell
Set-Location 'D:\BoCai'
& '.\Docker Desktop Installer.exe' install `
  --backend=wsl-2 `
  --accept-license `
  --wsl-default-data-root='D:\DockerData'
```

Kết quả mong muốn:

- Phần mềm Docker Desktop vẫn được cài trên ổ C theo mặc định.
- Docker WSL data root được tạo trên `D:\DockerData`.
- Image và volume PostgreSQL tạo sau đó không làm phình đường dẫn mặc định `C:\Users\<user>\AppData\Local\Docker\wsl`.

Khởi động lại Windows nếu trình cài yêu cầu, mở Docker Desktop và kiểm tra `Use WSL 2 based engine` đang được bật.

##### Cách qua giao diện nếu đã cài Docker Desktop

Chỉ dùng khi Docker Desktop đã được cài nhưng chưa tạo dữ liệu C360:

1. Mở Docker Desktop.
2. Chọn `Settings`.
3. Mở `Resources > Advanced`.
4. Tại `Disk image location`, chọn `Browse`.
5. Chọn `D:\DockerData`.
6. Chọn `Apply & restart` và chờ Docker Desktop chuyển/khởi tạo disk image hoàn tất.
7. Mở lại đúng màn hình trên và xác nhận đường dẫn vẫn là `D:\DockerData`.

Không dùng File Explorer để cắt/dán file `docker_data.vhdx` hoặc toàn bộ thư mục WSL khi Docker đang chạy. Docker Desktop phải tự thực hiện việc đổi `Disk image location`.

##### Cấu hình dữ liệu bind mount của C360

Trong file `.env` đặt:

```dotenv
APP_DATA_DIR=D:/Apps/QUANLYKHACHHANG/data
```

Không dùng dấu `\\` trong giá trị trên. `docker-compose.prod.yml` sẽ ánh xạ:

| Dữ liệu | Đường dẫn máy Windows | Đường dẫn container |
|---|---|---|
| Upload/file bổ sung | `D:\Apps\QUANLYKHACHHANG\data\uploads` | `/app/uploads` |
| File Excel xuất | `D:\Apps\QUANLYKHACHHANG\data\exports` | `/app/exports` |
| Tài liệu nguồn | `D:\Apps\QUANLYKHACHHANG\data\documents` | `/documents` |
| Backup DB | `D:\Apps\QUANLYKHACHHANG\data\backups` | `/backups` |
| PostgreSQL | Docker named volume trong `D:\DockerData` | `/var/lib/postgresql/data` |

##### Kiểm tra trước khi restore dữ liệu

```powershell
Get-PSDrive -Name C,D | Select-Object Name,Used,Free
wsl --status
docker version
docker compose version
docker info --format 'Docker root trong Linux: {{.DockerRootDir}}'
Get-ChildItem 'D:\DockerData' -Force
```

`docker info` vẫn thường hiển thị `DockerRootDir=/var/lib/docker`; đây là đường dẫn **bên trong Linux VM**, không có nghĩa dữ liệu vẫn nằm trên ổ C. Vị trí trên Windows phải kiểm tra tại `Docker Desktop > Settings > Resources > Advanced > Disk image location` và bằng mức tăng dung lượng của `D:\DockerData` sau khi pull/restore.

Sau khi tạo hệ thống C360:

```powershell
Set-Location 'D:\Apps\QUANLYKHACHHANG\app'
docker compose -f docker-compose.prod.yml --env-file .env up -d
docker volume inspect quanlykhachhang_postgres_data
docker system df
Get-PSDrive -Name C,D | Select-Object Name,Used,Free
```

Tiêu chí đạt:

- Ổ C chỉ tăng chủ yếu do chương trình Docker Desktop, log và cấu hình người dùng; không chứa disk image PostgreSQL dung lượng lớn.
- `D:\DockerData` tăng dung lượng khi pull image và restore PostgreSQL.
- Upload, export, documents và backup xuất hiện tại `D:\Apps\QUANLYKHACHHANG\data`.
- Ổ D nên còn ít nhất `100 GB` sau khi chuyển xong; khuyến nghị còn `150 GB` trở lên để tiếp tục import kỳ mới và tạo backup.

### 5.6. Cài Git for Windows

Git không bắt buộc nếu máy hoàn toàn offline và chỉ giải nén `C360_CODE_TAI.zip`, nhưng nên cài để kiểm tra commit và cập nhật về sau.

Tải bản x64 từ [trang Git for Windows chính thức](https://git-scm.com/install/windows), sau đó cài với các lựa chọn mặc định. Nếu máy có Internet và được phép dùng `winget`:

```powershell
winget install --id Git.Git -e --source winget
```

Đóng và mở lại PowerShell rồi kiểm tra:

```powershell
git --version
git config --global core.autocrlf true
```

Không lưu GitHub token trực tiếp trong file `.env` của ứng dụng.

### 5.7. Cài Caddy khi cần ghi IP thật

Caddy là tùy chọn. Bản chạy cơ bản bằng Docker không cần Caddy. Chỉ cài sau khi hệ thống đã hoạt động ổn định nếu cần phiên đăng nhập ghi đúng IP máy người dùng.

Tải static binary Windows x64 từ [hướng dẫn cài đặt chính thức của Caddy](https://caddyserver.com/docs/install), giải nén ví dụ vào:

```text
D:\Apps\Caddy\caddy.exe
```

Kiểm tra:

```powershell
D:\Apps\Caddy\caddy.exe version
D:\Apps\Caddy\caddy.exe validate --config D:\Apps\QUANLYKHACHHANG\app\proxy\windows\Caddyfile --adapter caddyfile
```

Không cần cài WinSW hoặc NSSM vì dự án đã có `tools/install-c360-lan-proxy.ps1` để tạo Windows service bằng `New-Service`. Phần cài service thực hiện sau theo mục 17 của tài liệu này.

### 5.8. Bộ cài cần chuẩn bị nếu máy `10.8.0.14` không có Internet

Trước khi đưa máy vào mạng nội bộ, chuẩn bị trên USB/ổ mạng được phê duyệt:

| File | Bắt buộc |
|---|---:|
| Bộ cài WSL `.msi` nếu Windows chưa có WSL phù hợp | Có |
| `Docker Desktop Installer.exe` x86_64 | Có |
| Git for Windows x64 installer | Khuyến nghị |
| `caddy.exe` Windows x64 | Tùy chọn |
| `c360-docker-images.tar` | Có |
| `C360_CODE_TAI.zip` | Có nếu không clone Git |
| PostgreSQL dump `c360_full_*.dump` và SHA-256 | Có |
| Thư mục uploads/documents/exports | Có theo phạm vi ở mục 2 |
| `.env` đã chuyển bằng kênh an toàn | Có |

Nên lưu checksum SHA-256 của tất cả bộ cài và gói dữ liệu trước khi sao chép. Không tải bộ cài từ trang chia sẻ không rõ nguồn gốc.

### 5.9. Tài khoản Windows vận hành

- Dùng một tài khoản Windows chuyên vận hành C360, có mật khẩu mạnh.
- Chỉ cấp quyền Administrator khi cài đặt, cấu hình Firewall, service hoặc Docker; không cho người dùng nghiệp vụ dùng tài khoản này.
- Docker Desktop phải được khởi động sau khi Windows đăng nhập. `restart: unless-stopped` chỉ tự khởi động container sau khi Docker Engine đã chạy.
- Sau mỗi lần khởi động máy, quản trị viên phải kiểm tra `docker compose ps` cho đến khi có cơ chế giám sát/tự khởi động đã được nghiệm thu.
- Không chia sẻ quyền truy cập Docker cho người không làm vận hành; quyền điều khiển Docker gần tương đương quyền quản trị máy.

### 5.10. Cấu hình IP tĩnh

Không tự đặt gateway hoặc DNS khi chưa có thông tin của quản trị mạng. Cấu hình card LAN với:

- IP: `10.8.0.14`.
- Subnet/prefix: theo mạng thực tế; nếu mạng `/24` thì subnet mask là `255.255.255.0`.
- Gateway: theo thông tin của quản trị mạng.
- DNS: DNS nội bộ của đơn vị hoặc chính máy `10.8.0.14` nếu máy này chạy CoreDNS.

Kiểm tra sau khi cấu hình:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object IPAddress -eq '10.8.0.14'
Get-NetAdapter
ping 10.8.0.1
```

Trước khi gán IP, phải xác nhận `10.8.0.14` chưa được thiết bị khác sử dụng.

## 6. Chuẩn bị code trên máy cũ

### 6.1. Kiểm tra trạng thái Git

Tại thư mục dự án:

```powershell
Set-Location D:\Code\QUANLYKHACHHANG
git branch --show-current
git status --short
git log -1 --oneline
```

Nhánh phải là `TAI`. Tại thời điểm viết tài liệu, workspace hiện vẫn có nhiều file sửa đổi và migration mới chưa commit. Nếu máy mới clone nhánh `TAI` ngay lúc này thì **không nhận được các thay đổi chưa commit**.

Trước ngày chuyển chính thức, cần:

1. Kiểm thử code hiện tại.
2. Commit toàn bộ thay đổi hợp lệ.
3. Push lên `origin/TAI`.
4. Ghi lại commit dùng để triển khai:

```powershell
git rev-parse HEAD
```

Nếu máy mới không có Internet, sau khi commit có thể tạo gói code sạch:

```powershell
$TransferDir = 'Z:\C360_TRANSFER'
New-Item -ItemType Directory -Force $TransferDir
git archive --format=zip --output "$TransferDir\C360_CODE_TAI.zip" HEAD
git rev-parse HEAD | Set-Content "$TransferDir\C360_COMMIT.txt"
```

`git archive` chỉ đóng gói nội dung đã commit; nó không chứa `.env` và không chứa thay đổi chưa commit.

## 7. Chuẩn bị gói chuyển trên máy cũ

Ví dụ dưới đây dùng `Z:\C360_TRANSFER`. Có thể thay bằng ổ ngoài hoặc thư mục mạng khác đủ dung lượng.

```powershell
$TransferDir = 'Z:\C360_TRANSFER'
New-Item -ItemType Directory -Force $TransferDir
New-Item -ItemType Directory -Force "$TransferDir\files"
```

### 7.1. Lưu Docker image để chạy offline

Đảm bảo image hiện tại là bản vừa kiểm thử:

```powershell
docker compose ps
docker image ls
```

Tạo một file image TAR:

```powershell
# Gắn tag đúng với tên image mà docker-compose.prod.yml sử dụng.
docker tag quanlykhachhang-backend:latest `
  ghcr.io/nguyen-tien-tai12112001/quanlykhachhang-backend:transfer
docker tag quanlykhachhang-frontend:latest `
  ghcr.io/nguyen-tien-tai12112001/quanlykhachhang-frontend:transfer

docker save -o "$TransferDir\c360-docker-images.tar" `
  ghcr.io/nguyen-tien-tai12112001/quanlykhachhang-backend:transfer `
  ghcr.io/nguyen-tien-tai12112001/quanlykhachhang-frontend:transfer `
  postgres:16 `
  redis:7-alpine `
  coredns/coredns:latest
```

Kiểm tra:

```powershell
Get-Item "$TransferDir\c360-docker-images.tar"
Get-FileHash "$TransferDir\c360-docker-images.tar" -Algorithm SHA256
```

### 7.2. Sao chép uploads, documents và exports

```powershell
robocopy .\backend\uploads "$TransferDir\files\uploads" /E /COPY:DAT /DCOPY:DAT /R:2 /W:2
robocopy .\documents "$TransferDir\files\documents" /E /COPY:DAT /DCOPY:DAT /R:2 /W:2
robocopy .\backend\exports "$TransferDir\files\exports" /E /COPY:DAT /DCOPY:DAT /R:2 /W:2
```

Với `robocopy`, mã thoát từ 0 đến 7 không phải lỗi nghiêm trọng. Mã từ 8 trở lên phải xử lý trước khi tiếp tục.

### 7.3. Sao chép cấu hình bí mật

Sao chép `.env` riêng vào nơi được bảo vệ:

```powershell
Copy-Item .\.env "$TransferDir\C360.env.private"
```

Không gửi file này qua email công khai và không commit vào Git. Nên mã hóa ổ/USB hoặc dùng thư mục mạng có phân quyền NTFS.

## 8. Tạo bản PostgreSQL cuối cùng

### 8.1. Chốt thời gian dừng hệ thống

Trước bản backup cuối:

1. Thông báo người dùng ngừng thao tác.
2. Chờ các job import/xử lý đang chạy hoàn tất hoặc xác nhận dừng an toàn.
3. Dừng frontend và backend để không phát sinh ghi mới:

```powershell
docker compose stop frontend backend
docker compose ps
```

Giữ PostgreSQL và Redis chạy.

Kiểm tra lại đúng container và lấy tên database/user trực tiếp từ container, không ghi mật khẩu ra màn hình:

```powershell
Set-Location D:\Code\QUANLYKHACHHANG

$DbUser = (docker exec qlkh_postgres printenv POSTGRES_USER).Trim()
$DbName = (docker exec qlkh_postgres printenv POSTGRES_DB).Trim()

if (-not $DbUser -or -not $DbName) {
  throw 'Không đọc được POSTGRES_USER hoặc POSTGRES_DB từ qlkh_postgres.'
}

docker inspect --format '{{.State.Status}} / {{.State.Health.Status}}' qlkh_postgres
docker exec qlkh_postgres psql -U $DbUser -d $DbName -c `
  'SELECT current_database(), current_user, pg_size_pretty(pg_database_size(current_database()));'
docker exec qlkh_postgres psql -U $DbUser -d $DbName -c `
  'SELECT version_num AS alembic_revision FROM alembic_version;'
```

Ghi số kiểm soát trước khi backup để dùng đối chiếu trên máy mới:

```powershell
$TransferDir = 'Z:\C360_TRANSFER\database'
New-Item -ItemType Directory -Force $TransferDir | Out-Null

$ControlSql = @"
SELECT 'cif_customers' AS bang, COUNT(*) AS so_dong FROM cif_customers
UNION ALL SELECT 'customer_period_profiles', COUNT(*) FROM customer_period_profiles
UNION ALL SELECT 'customer_period_branch_details', COUNT(*) FROM customer_period_branch_details
UNION ALL SELECT 'import_batches', COUNT(*) FROM import_batches
UNION ALL SELECT 'system_users', COUNT(*) FROM system_users
ORDER BY bang;
"@

docker exec qlkh_postgres psql -U $DbUser -d $DbName -c $ControlSql |
  Tee-Object "$TransferDir\control-counts-before.txt"
```

Nếu một bảng trong câu lệnh kiểm soát chưa tồn tại ở phiên bản thực tế thì bỏ riêng dòng bảng đó; không được bỏ qua bước ghi số lượng các bảng còn lại.

### 8.2. Ghi dump trực tiếp ra ổ chuyển

Không tạo file tạm trong Docker disk hoặc ổ C/D đang thiếu dung lượng. Dùng container PostgreSQL tạm, ghi thẳng ra ổ ngoài hoặc thư mục mạng đã được phê duyệt. Nếu dùng thư mục mạng, nên dùng đường dẫn UNC mà tài khoản đang chạy Docker Desktop có quyền đọc/ghi; ổ mạng gán ký tự có thể không được Docker nhìn thấy trong một số phiên đăng nhập.

Kiểm tra đích trước khi chạy:

```powershell
$TransferDir = 'Z:\C360_TRANSFER\database'

if (-not (Test-Path $TransferDir)) {
  throw "Không truy cập được thư mục chuyển: $TransferDir"
}

Get-Item $TransferDir
Get-PSDrive -PSProvider FileSystem | Select-Object Name,Root,Used,Free
```

Tạo bản dump định dạng custom, có nén và có thể restore song song:

```powershell
$Stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$DumpName = "c360_full_$Stamp.dump"
$StartedAt = Get-Date

docker run --rm `
  --network qlkh_network `
  --env-file .\.env `
  -e DUMP_NAME=$DumpName `
  -v "${TransferDir}:/backup" `
  postgres:16 `
  sh -c 'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -Z 6 -f "/backup/$DUMP_NAME"'

if ($LASTEXITCODE -ne 0) {
  throw "pg_dump thất bại với mã lỗi $LASTEXITCODE. Không được dùng file dump này."
}

$FinishedAt = Get-Date
$Elapsed = $FinishedAt - $StartedAt
Write-Host "Backup hoàn tất sau $($Elapsed.ToString())."
Get-Item "$TransferDir\$DumpName" | Select-Object FullName,Length,LastWriteTime
```

Không đóng PowerShell, tắt Docker hoặc rút ổ chuyển khi lệnh chưa kết thúc. Với DB khoảng 33 GB, thời gian phụ thuộc CPU và tốc độ ghi của ổ đích. Có thể mở PowerShell thứ hai để theo dõi dung lượng file mà không can thiệp tiến trình:

```powershell
Get-Item 'Z:\C360_TRANSFER\database\c360_full_YYYYMMDD_HHMMSS.dump' |
  Select-Object Length,LastWriteTime
```

### 8.3. Kiểm tra dump

```powershell
Get-Item "$TransferDir\$DumpName"
$DumpHash = (Get-FileHash "$TransferDir\$DumpName" -Algorithm SHA256).Hash
$DumpHash | Set-Content "$TransferDir\$DumpName.sha256.txt"

docker run --rm `
  -v "${TransferDir}:/backup:ro" `
  postgres:16 `
  pg_restore --list "/backup/$DumpName" |
  Set-Content "$TransferDir\$DumpName.toc.txt"

if ($LASTEXITCODE -ne 0) {
  throw 'pg_restore --list không đọc được archive. Phải tạo lại bản dump.'
}

Get-Content "$TransferDir\$DumpName.sha256.txt"
Get-Content "$TransferDir\$DumpName.toc.txt" -TotalCount 20
```

Chỉ chuyển máy khi:

- File dump có dung lượng hợp lý và lớn hơn 0.
- `pg_restore --list` đọc được danh sách đối tượng.
- Đã lưu SHA-256.
- Có `control-counts-before.txt` và revision Alembic đã ghi nhận.
- Đã ghi tên dump vào biên bản chuyển máy.

> `pg_dump` định dạng custom là bản sao logic nhất quán tại thời điểm backup. Không sao chép file vật lý trong volume `quanlykhachhang_postgres_data`, không chép file VHDX và không dùng thao tác copy thư mục `D:\DockerData` để chuyển DB.

## 9. Đưa gói chuyển sang máy `10.8.0.14`

Tạo cấu trúc trên máy mới:

```powershell
New-Item -ItemType Directory -Force D:\Apps\QUANLYKHACHHANG\app
New-Item -ItemType Directory -Force D:\Apps\QUANLYKHACHHANG\transfer
```

Sao chép vào `D:\Apps\QUANLYKHACHHANG\transfer`:

- `C360_CODE_TAI.zip` hoặc clone Git.
- `C360_COMMIT.txt`.
- `c360-docker-images.tar`.
- File `c360_full_*.dump` và file SHA-256.
- Thư mục `files`.
- `C360.env.private`.

Ví dụ ổ ngoài được nhận là ổ `E:` trên máy mới:

```powershell
$TransferSource = 'E:\C360_TRANSFER'
$TransferTarget = 'D:\Apps\QUANLYKHACHHANG\transfer'

New-Item -ItemType Directory -Force $TransferTarget | Out-Null
robocopy $TransferSource $TransferTarget /E /COPY:DAT /DCOPY:DAT /Z /J /R:2 /W:5

if ($LASTEXITCODE -ge 8) {
  throw "Sao chép gói chuyển thất bại, mã robocopy: $LASTEXITCODE"
}
```

Không rút ổ ngoài cho đến khi `robocopy` kết thúc. Nếu dùng thư mục mạng, thay `$TransferSource` bằng đường dẫn UNC như `\\may-chia-se\C360_TRANSFER`; tài khoản Windows phải có quyền đọc.

Kiểm tra lại checksum trên máy mới:

```powershell
$DumpPath = 'D:\Apps\QUANLYKHACHHANG\transfer\database\c360_full_YYYYMMDD_HHMMSS.dump'
$ExpectedHash = (Get-Content "$DumpPath.sha256.txt").Trim()
$ActualHash = (Get-FileHash $DumpPath -Algorithm SHA256).Hash

if ($ActualHash -ne $ExpectedHash) {
  throw 'SHA-256 của file dump không khớp. Không được restore.'
}

Write-Host "SHA-256 hợp lệ: $ActualHash"
```

Hai giá trị phải trùng máy cũ.

## 10. Khôi phục code và file host trên máy mới

### 10.1. Nếu máy mới có GitHub

```powershell
Set-Location D:\Apps\QUANLYKHACHHANG
git clone -b TAI https://github.com/nguyen-tien-tai12112001/QUANLYKHACHHANG.git app
Set-Location .\app
git rev-parse HEAD
```

Commit phải trùng `C360_COMMIT.txt`.

### 10.2. Nếu máy mới offline

Giải nén `C360_CODE_TAI.zip` vào:

```text
D:\Apps\QUANLYKHACHHANG\app
```

### 10.3. Khôi phục thư mục file

Với cấu hình production và `APP_DATA_DIR=D:/Apps/QUANLYKHACHHANG/data`:

```powershell
Set-Location D:\Apps\QUANLYKHACHHANG\app
robocopy ..\transfer\files\uploads D:\Apps\QUANLYKHACHHANG\data\uploads /E /COPY:DAT /DCOPY:DAT /R:2 /W:2
robocopy ..\transfer\files\documents D:\Apps\QUANLYKHACHHANG\data\documents /E /COPY:DAT /DCOPY:DAT /R:2 /W:2
robocopy ..\transfer\files\exports D:\Apps\QUANLYKHACHHANG\data\exports /E /COPY:DAT /DCOPY:DAT /R:2 /W:2
Copy-Item ..\transfer\C360.env.private .\.env
```

Không dùng `frontend/node_modules` hoặc `frontend/dist` từ máy cũ; frontend chạy bằng Docker image đã build.

## 11. Nạp Docker image trên máy mới

```powershell
docker load -i D:\Apps\QUANLYKHACHHANG\transfer\c360-docker-images.tar

docker image inspect `
  ghcr.io/nguyen-tien-tai12112001/quanlykhachhang-backend:transfer `
  ghcr.io/nguyen-tien-tai12112001/quanlykhachhang-frontend:transfer `
  postgres:16 `
  redis:7-alpine `
  coredns/coredns:latest
```

Không chạy `docker compose build`, `docker pull`, `npm install` hoặc `pip install` nếu máy chủ không có Internet.

## 12. Thay cấu hình IP từ máy cũ sang `10.8.0.14`

### 12.1. File `.env`

Giữ nguyên tên DB, user DB và mật khẩu để phục hồi thuận lợi. Cập nhật tối thiểu:

```dotenv
CORS_ORIGINS=http://localhost,http://10.8.0.14,http://c360.agribank.com.vn
FRONTEND_BIND_ADDR=0.0.0.0
FRONTEND_HOST_PORT=80
BACKEND_BIND_ADDR=127.0.0.1
APP_DATA_DIR=D:/Apps/QUANLYKHACHHANG/data
IMAGE_TAG=transfer
```

`IMAGE_TAG=transfer` dùng cho gói image offline đã tạo ở mục 7.1. Nếu máy mới pull image từ GHCR theo commit, thay bằng SHA commit tương ứng.

`DATABASE_URL` trong Docker phải dùng hostname `postgres`, không dùng `localhost` hoặc `10.8.0.14`:

```dotenv
DATABASE_URL=postgresql+psycopg://<DB_USER>:<DB_PASSWORD>@postgres:5432/<DB_NAME>
```

Về `AUTH_SECRET`:

- Có thể giữ bí mật cũ để chuyển đổi ít thay đổi nhất.
- Khuyến nghị đổi sang bí mật mới trong đợt chuyển chính thức để vô hiệu toàn bộ token cũ; mật khẩu người dùng không bị thay đổi nhưng mọi người phải đăng nhập lại.
- Giá trị phải dài tối thiểu 32 ký tự và không được dùng giá trị mẫu.

### 12.2. Các file runtime đang chứa IP cũ

Thay `10.8.0.119` thành `10.8.0.14` trong các file runtime sau:

1. `docker-compose.yml`: hai dòng bind TCP/UDP 53 của service `dns`.
2. `dns/Corefile`: bản ghi `c360.agribank.com.vn`.
3. `start-lan-offline.ps1`: giá trị mặc định `ServerIp`.
4. `proxy/windows/Caddyfile`: nếu sử dụng Caddy để ghi IP thật.
5. `tools/install-c360-lan-proxy.ps1`: nếu cài Caddy service.

Kiểm tra không còn IP cũ trong file runtime:

```powershell
rg -n "10\.8\.0\.119" docker-compose.yml dns start-lan-offline.ps1 proxy tools
```

Các tài liệu lịch sử có thể còn IP cũ; chúng không ảnh hưởng việc chạy chương trình.

### 12.3. Giới hạn cổng PostgreSQL

`docker-compose.yml` hiện có ánh xạ `5432:5432`. Nếu chỉ ứng dụng C360 sử dụng DB, nên đổi thành:

```yaml
ports:
  - "127.0.0.1:5432:5432"
```

Nếu cán bộ kỹ thuật cần kết nối PostgreSQL trực tiếp từ máy khác, giữ cổng LAN nhưng Windows Firewall chỉ cho phép đúng các IP quản trị đã được phê duyệt; không mở 5432 cho toàn bộ mạng.

Trong `dns/Corefile`, dòng `forward . 10.8.0.1` chỉ đúng khi `10.8.0.1` thực sự là DNS/gateway có khả năng phân giải tên khác. Nếu hạ tầng dùng DNS nội bộ khác, thay bằng địa chỉ do quản trị mạng cung cấp.

## 13. Tạo PostgreSQL rỗng trên máy mới

Chỉ thực hiện sau khi đã xác nhận Docker disk image nằm trong `D:\DockerData`. Tại thư mục ứng dụng, dùng Compose production:

```powershell
Set-Location D:\Apps\QUANLYKHACHHANG\app
docker compose --env-file .env -f docker-compose.prod.yml up -d postgres redis
docker compose --env-file .env -f docker-compose.prod.yml ps
```

Chờ `qlkh_postgres` và `qlkh_redis` đạt `healthy`.

Xác nhận volume mới:

```powershell
docker volume inspect quanlykhachhang_postgres_data
```

Nếu Docker disk image đang nằm trên ổ không đủ dung lượng, dừng tại đây và cấu hình lại Docker trước khi restore. Không chờ đến khi DB đã phục hồi xong mới di chuyển volume.

## 14. Phục hồi PostgreSQL trên máy mới

### 14.1. Chặn thao tác nhầm máy và kiểm tra file

Các lệnh xóa/tạo lại database dưới đây **chỉ được chạy trên máy mới `10.8.0.14`**. Không chạy trên máy cũ.

```powershell
$TargetIp = '10.8.0.14'
$HasTargetIp = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object IPAddress -eq $TargetIp

if (-not $HasTargetIp) {
  throw "Máy hiện tại không có IP $TargetIp. Dừng để tránh thao tác nhầm máy."
}

$ProjectDir = 'D:\Apps\QUANLYKHACHHANG\app'
$TransferDir = 'D:\Apps\QUANLYKHACHHANG\transfer\database'
$DumpName = 'c360_full_YYYYMMDD_HHMMSS.dump'
$DumpPath = Join-Path $TransferDir $DumpName

if (-not (Test-Path $DumpPath)) {
  throw "Không tìm thấy dump: $DumpPath"
}

$ExpectedHash = (Get-Content "$DumpPath.sha256.txt").Trim()
$ActualHash = (Get-FileHash $DumpPath -Algorithm SHA256).Hash
if ($ActualHash -ne $ExpectedHash) {
  throw 'Checksum dump không khớp. Dừng restore.'
}

Get-PSDrive -Name C,D | Select-Object Name,Used,Free
```

Ổ D phải đủ chỗ cho database sau giải nén, index, WAL tạm và tăng trưởng tiếp theo. Với DB nguồn khoảng 33 GB, không bắt đầu nếu ổ D chỉ còn xấp xỉ dung lượng database.

### 14.2. Tạo lại database đích sạch

Backend và frontend trên máy mới chưa được chạy ở bước này. Đọc cấu hình từ container rồi xóa database rỗng/khôi phục dở dang và tạo lại:

```powershell
Set-Location $ProjectDir
$ComposeArgs = @('--env-file', '.env', '-f', 'docker-compose.prod.yml')

$DbUser = (docker compose @ComposeArgs exec -T postgres printenv POSTGRES_USER).Trim()
$DbName = (docker compose @ComposeArgs exec -T postgres printenv POSTGRES_DB).Trim()

if (-not $DbUser -or -not $DbName) {
  throw 'Không đọc được tên user/database từ PostgreSQL máy mới.'
}

docker compose @ComposeArgs exec -T postgres `
  psql -U $DbUser -d postgres -v ON_ERROR_STOP=1 -c `
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DbName' AND pid <> pg_backend_pid();"

docker compose @ComposeArgs exec -T postgres dropdb -U $DbUser --if-exists $DbName
if ($LASTEXITCODE -ne 0) { throw 'Không xóa được database đích.' }

docker compose @ComposeArgs exec -T postgres createdb -U $DbUser -O $DbUser $DbName
if ($LASTEXITCODE -ne 0) { throw 'Không tạo được database đích sạch.' }
```

Không dùng `docker volume rm` trong quy trình thông thường. Việc tạo lại đúng database an toàn và có phạm vi nhỏ hơn xóa toàn bộ volume.

### 14.3. Restore dump và lưu nhật ký

Ví dụ file dump nằm trong thư mục transfer:

```powershell
$RestoreJobs = 4
$RestoreLog = Join-Path $TransferDir "$DumpName.restore.log"
$RestoreStartedAt = Get-Date

docker run --rm `
  --network qlkh_network `
  --env-file .\.env `
  -e DUMP_NAME=$DumpName `
  -e RESTORE_JOBS=$RestoreJobs `
  -v "${TransferDir}:/backup:ro" `
  postgres:16 `
  sh -c 'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_restore -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error --no-owner --no-privileges --jobs="$RESTORE_JOBS" "/backup/$DUMP_NAME"' `
  2>&1 | Tee-Object $RestoreLog

if ($LASTEXITCODE -ne 0) {
  throw "Restore thất bại. Xem log: $RestoreLog. Phải tạo lại database sạch trước khi chạy lại."
}

$RestoreElapsed = (Get-Date) - $RestoreStartedAt
Write-Host "Restore hoàn tất sau $($RestoreElapsed.ToString())."
```

`--exit-on-error` bảo đảm tiến trình dừng ngay khi có lỗi SQL. Nếu máy mới có ít CPU/RAM hoặc ổ đĩa chậm, giảm `$RestoreJobs` từ `4` xuống `2`; không tăng quá cao vì restore song song có thể làm nghẽn I/O.

Nếu restore lỗi:

1. Không khởi động backend/frontend.
2. Giữ file dump và restore log.
3. Xử lý nguyên nhân như thiếu dung lượng, checksum sai hoặc container mất kết nối.
4. Chạy lại mục 14.2 để tạo database sạch.
5. Chạy lại restore từ đầu; không restore nối tiếp vào database đang dở dang.

### 14.4. Cập nhật thống kê, migration và kiểm tra DB

Cập nhật thống kê để PostgreSQL lập kế hoạch truy vấn phù hợp ngay sau khi chuyển:

```powershell
docker compose @ComposeArgs exec -T postgres `
  vacuumdb -U $DbUser -d $DbName --analyze-in-stages
```

Chạy migration của đúng phiên bản code trên máy mới:

```powershell
docker compose @ComposeArgs run --rm --no-deps backend alembic upgrade head
if ($LASTEXITCODE -ne 0) { throw 'Alembic migration thất bại.' }

docker compose @ComposeArgs run --rm --no-deps backend alembic current
```

Kiểm tra dung lượng DB sau restore:

```powershell
docker compose @ComposeArgs exec -T postgres `
  psql -U $DbUser -d $DbName -c `
  'SELECT current_database(), current_user, pg_size_pretty(pg_database_size(current_database()));'
```

Đối chiếu số dòng với `control-counts-before.txt`:

```powershell
$ControlSql = @"
SELECT 'cif_customers' AS bang, COUNT(*) AS so_dong FROM cif_customers
UNION ALL SELECT 'customer_period_profiles', COUNT(*) FROM customer_period_profiles
UNION ALL SELECT 'customer_period_branch_details', COUNT(*) FROM customer_period_branch_details
UNION ALL SELECT 'import_batches', COUNT(*) FROM import_batches
UNION ALL SELECT 'system_users', COUNT(*) FROM system_users
ORDER BY bang;
"@

docker compose @ComposeArgs exec -T postgres `
  psql -U $DbUser -d $DbName -c $ControlSql |
  Tee-Object "$TransferDir\control-counts-after.txt"
```

Số dòng từng bảng phải khớp bản trước chuyển. Migration chỉ được phép tạo/thay đổi cấu trúc theo revision; nếu migration chủ động biến đổi dữ liệu thì phải ghi rõ và đối soát riêng phần chênh lệch.

## 15. Khởi động toàn bộ hệ thống

### 15.1. Chạy trước bằng IP, chưa bật DNS

```powershell
$ComposeArgs = @('--env-file', '.env', '-f', 'docker-compose.prod.yml')
docker compose @ComposeArgs up -d backend frontend
docker compose @ComposeArgs ps
```

Backend tự chạy:

```text
alembic upgrade head
```

trước khi khởi động API.

Kiểm tra:

```powershell
Invoke-WebRequest -UseBasicParsing http://10.8.0.14/
Invoke-RestMethod http://10.8.0.14/api/health
docker compose @ComposeArgs run --rm --no-deps backend alembic current
```

### 15.2. Bật CoreDNS nếu máy này cung cấp DNS nội bộ

```powershell
docker compose --profile lan-dns up -d --no-build dns
Resolve-DnsName c360.agribank.com.vn -Server 10.8.0.14
```

Kết quả phải trả về `10.8.0.14`.

Nếu đơn vị đã có DNS tập trung, không bắt buộc chạy CoreDNS. Quản trị mạng chỉ cần sửa bản ghi:

```text
c360.agribank.com.vn -> 10.8.0.14
```

## 16. Mở Windows Firewall

Mở PowerShell bằng quyền Administrator.

Nếu mạng người dùng là `10.8.0.0/24`, có thể dùng script hiện có sau khi đã sửa IP runtime:

```powershell
powershell -ExecutionPolicy Bypass -File .\configure-lan-firewall.ps1
```

Script mở:

- TCP 80 cho giao diện.
- TCP/UDP 53 nếu dùng CoreDNS.

Không mở cổng backend 8000 ra LAN. Chỉ mở PostgreSQL 5432 khi có yêu cầu nghiệp vụ được phê duyệt; ứng dụng không cần truy cập PostgreSQL qua IP máy chủ.

Kiểm tra từ máy trạm:

```powershell
ping 10.8.0.14
Test-NetConnection 10.8.0.14 -Port 80
Resolve-DnsName c360.agribank.com.vn -Server 10.8.0.14
```

Sau đó mở:

```text
http://10.8.0.14
http://c360.agribank.com.vn
```

## 17. Ghi nhận IP thật của phiên đăng nhập

Chạy trực tiếp frontend Docker trên cổng 80 là phương án đơn giản nhất nhưng backend có thể nhìn thấy IP gateway Docker thay vì IP máy trạm.

Nếu cần nhật ký phiên ghi đúng IP người dùng:

1. Hoàn tất chuyển máy và kiểm tra bản chạy trực tiếp trước.
2. Sửa IP trong `proxy/windows/Caddyfile` và `tools/install-c360-lan-proxy.ps1` thành `10.8.0.14`.
3. Đặt trong `.env`:

```dotenv
FRONTEND_BIND_ADDR=127.0.0.1
FRONTEND_HOST_PORT=8080
BACKEND_BIND_ADDR=127.0.0.1
TRUSTED_PROXY_HOSTNAME=frontend
```

4. Thực hiện theo tài liệu `docs/GHI_IP_THAT_PHIEN_DANG_NHAP_LAN_WINDOWS.md`, nhưng sử dụng IP mới `10.8.0.14`.

Chỉ triển khai Caddy sau khi bản chạy cơ bản đã ổn định để dễ quay lui khi có lỗi.

## 18. Đối soát dữ liệu sau chuyển

### 18.1. Ghi số kiểm soát trên cả hai máy

Chạy trên máy cũ trước khi chuyển và máy mới sau restore:

```powershell
docker exec qlkh_postgres psql -U qlkh_user -d qlkh_db -c "
SELECT 'cif_customers' bang, COUNT(*) so_dong FROM cif_customers
UNION ALL SELECT 'customer_period_profiles', COUNT(*) FROM customer_period_profiles
UNION ALL SELECT 'customer_period_branch_details', COUNT(*) FROM customer_period_branch_details
UNION ALL SELECT 'import_batches', COUNT(*) FROM import_batches
UNION ALL SELECT 'system_users', COUNT(*) FROM system_users;
"
```

Nếu user hoặc database name khác, lấy từ `.env` thay vì dùng giá trị ví dụ.

### 18.2. Checklist nghiệp vụ

- [ ] Đăng nhập được bằng một tài khoản admin kiểm thử.
- [ ] Đăng nhập được bằng một tài khoản chi nhánh và phạm vi dữ liệu đúng.
- [ ] Danh sách chi nhánh, phòng ban, người dùng và nhóm quyền đầy đủ.
- [ ] Kỳ 08/2026 và các kỳ đang giữ hiển thị đúng.
- [ ] Mở được hồ sơ KH mẫu `018286880`.
- [ ] Mở được hồ sơ KH đa chi nhánh mẫu đã kiểm tra trước chuyển.
- [ ] Tiền gửi, tiền vay, phí, sản phẩm và lịch sử kỳ hiển thị.
- [ ] File bổ sung/POS/Billpayment còn được DB tham chiếu đúng.
- [ ] Chạy thử một truy vấn Dashboard theo kỳ và chi nhánh.
- [ ] Xuất thử một Excel nhỏ ở chế độ nền.
- [ ] Kiểm tra danh sách KH ghim của một người dùng.
- [ ] Kiểm tra phiên đăng nhập, khóa tài khoản và phân quyền.
- [ ] Không có job cũ bị hiểu nhầm là vẫn đang chạy.
- [ ] `docker compose ps` không có container `unhealthy` hoặc `restarting`.

Xem log khi cần:

```powershell
docker compose logs --tail 200 postgres
docker compose logs --tail 200 backend
docker compose logs --tail 200 frontend
docker compose logs --tail 100 redis
docker compose logs --tail 100 dns
```

## 19. Chuyển chính thức và DNS

Chỉ chuyển người dùng sang máy mới sau khi đối soát đạt:

1. Giữ frontend/backend máy cũ ở trạng thái dừng.
2. Xác nhận máy mới đang phục vụ tại `10.8.0.14`.
3. Sửa DNS/DHCP để `c360.agribank.com.vn` trỏ về `10.8.0.14`.
4. Trên máy trạm chạy:

```powershell
ipconfig /flushdns
Resolve-DnsName c360.agribank.com.vn
```

5. Cho nhóm người dùng nhỏ kiểm tra trước.
6. Sau khi đạt mới thông báo mở hệ thống cho toàn bộ người dùng.

Không để DNS lúc trả máy cũ, lúc trả máy mới trong thời gian ghi dữ liệu vì có thể tạo hai nguồn production khác nhau.

## 20. Phương án quay lui

Nếu máy mới có lỗi nghiêm trọng trước khi phát sinh dữ liệu mới:

1. Dừng frontend/backend máy mới.
2. Đổi DNS về IP máy cũ.
3. Khởi động frontend/backend máy cũ.
4. Thông báo người dùng và ghi nhận nguyên nhân quay lui.

Nếu máy mới đã phát sinh dữ liệu mới thì không được tự ý quay về máy cũ, vì sẽ mất phần dữ liệu phát sinh sau chuyển. Khi đó phải:

1. Dừng ghi trên cả hai máy.
2. Backup máy mới.
3. Đánh giá dữ liệu phát sinh.
4. Lập phương án đồng bộ/khôi phục có phê duyệt.

## 21. Việc sau khi chuyển ổn định

- Tạo một backup mới ngay trên máy `10.8.0.14` và kiểm tra `pg_restore --list`.
- Thiết lập backup định kỳ sang vị trí thứ hai, không cùng ổ Docker.
- Theo dõi dung lượng Docker disk và ổ chứa backup.
- Giữ gói chuyển cùng checksum cho đến khi nghiệm thu.
- Sau thời gian lưu an toàn được phê duyệt mới xóa dữ liệu máy cũ.
- Cập nhật các tài liệu vận hành đang ghi IP `10.8.0.119` sang `10.8.0.14`.
- Cập nhật runner CI/CD nếu runner chuyển sang máy mới.
- Nếu máy mới không có Internet, lưu thêm một bản Docker image TAR ngoài máy chủ.

## 22. Biên bản chuyển máy tối thiểu

| Nội dung | Giá trị xác nhận |
|---|---|
| Commit triển khai |  |
| Tên file dump |  |
| SHA-256 file dump |  |
| Dung lượng DB máy cũ |  |
| Dung lượng DB máy mới |  |
| Alembic revision |  |
| Thời điểm dừng máy cũ |  |
| Thời điểm mở máy mới |  |
| Kết quả đối soát số dòng |  |
| Kết quả kiểm tra KPI mẫu |  |
| Người thực hiện |  |
| Người xác nhận nghiệp vụ |  |
| Kết luận |  |

## 23. Tóm tắt thứ tự thực hiện

```text
Hoàn thiện + commit/push nhánh TAI
        ↓
Chuẩn bị máy 10.8.0.14 và dung lượng Docker
        ↓
Đóng gói code + Docker image + uploads/documents
        ↓
Dừng ghi trên máy cũ
        ↓
pg_dump trực tiếp ra ổ chuyển + kiểm tra checksum
        ↓
Nạp image và tạo PostgreSQL trên máy mới
        ↓
pg_restore
        ↓
Backend tự chạy Alembic migration
        ↓
Khởi động frontend/backend
        ↓
Đối soát dữ liệu, quyền và KPI
        ↓
Chuyển DNS sang 10.8.0.14
        ↓
Theo dõi và nghiệm thu
```
