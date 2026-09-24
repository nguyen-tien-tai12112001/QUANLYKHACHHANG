# BÁO CÁO CHỨC NĂNG, NGUỒN DỮ LIỆU VÀ HIỆN TRẠNG HẠ TẦNG C360

**Thời điểm rà soát:** 22/09/2026
**Hệ thống:** Quản lý và phân tích khách hàng C360  
**Phạm vi báo cáo:** Chức năng đang có, nguồn dữ liệu, cách hình thành chỉ tiêu, hiện trạng máy chủ và kiến nghị triển khai production

**Căn cứ rà soát:** code nhánh `TAI`, migration đến `20260914_0037`, database và các container đang chạy trên máy hiện tại.

> Tài liệu này được đối chiếu theo code, cấu trúc database và dữ liệu đang chạy tại thời điểm rà soát. Các số liệu về dung lượng và số lượng bản ghi là ảnh chụp hiện trạng, sẽ thay đổi sau mỗi lần import hoặc xử lý lại dữ liệu.

## 1. Tóm tắt dành cho lãnh đạo

C360 là hệ thống tập trung dữ liệu khách hàng từ Kho CIF và các nguồn nghiệp vụ theo kỳ. Hệ thống thực hiện toàn bộ chu trình:

```text
Tiếp nhận file → Kiểm tra đầu vào → Lưu kho nguồn → Kiểm tra độ sẵn sàng
       → Đối chiếu Kho CIF → Tổng hợp hồ sơ khách hàng
       → Dashboard / Phân tích nghiệp vụ / Tra cứu C360 / Xuất báo cáo
```

Giá trị chính của hệ thống:

- Một mã khách hàng lõi được quản lý như một khách hàng duy nhất, kể cả khi có quan hệ tại nhiều chi nhánh.
- Vẫn giữ chi tiết số liệu theo từng chi nhánh để lãnh đạo đơn vị chỉ xem đúng phần thuộc phạm vi quản lý.
- Có thể đi từ chỉ tiêu tổng hợp tới danh sách khách hàng, tài khoản, LDS/LAV và một số bút toán nguồn.
- Kho CIF là tập khách hàng nền; các nguồn nghiệp vụ không tự tạo hoặc ghi đè master khách hàng khi import.
- File nguồn không khớp CIF không bị bỏ âm thầm mà được lưu để đối chiếu, giải trình.
- Công thức và nguồn của các chỉ tiêu trọng yếu được quản lý trong Từ điển & mapping.

### 1.1. Hiện trạng dữ liệu

| Chỉ tiêu | Hiện trạng ngày 22/09/2026 |
|---|---:|
| Khách hàng trong Kho CIF | **520.532** |
| File nguồn import thành công | **495** |
| Loại nguồn định kỳ đã hỗ trợ | **11** |
| Khoảng kỳ đã import | **05/2026–08/2026** |
| Kỳ đã xử lý thành hồ sơ C360 | **05/2026, 06/2026, 07/2026** |
| Hồ sơ ở mỗi kỳ đã xử lý | **518.672** |
| Kích thước PostgreSQL | **khoảng 31 GB** |
| Thời gian xử lý kỳ gần nhất | **17,72–21,93 phút** |
| Người dùng / nhóm quyền / quyền chi tiết | **370 / 5 / 54** |
| File bổ sung đã đọc và sẵn sàng | **01 file Bill Payment của kỳ 06/2026** |

Kho CIF hiện nhiều hơn tập hồ sơ đã xử lý **1.860 khách hàng**. Điều này cho thấy CIF đã được cập nhật sau lần xử lý gần nhất; các kỳ cần sử dụng phải chạy lại để nhận tập CIF mới theo đúng quy tắc hiện hành.

> **Cảnh báo hạ tầng:** ổ C chỉ còn khoảng **8,00 GB**, ổ D chỉ còn khoảng **5,18 GB**, trong khi database đã khoảng **31 GB**, volume PostgreSQL khoảng **33,58 GB** và file Docker VHDX khoảng **48,63 GB** vẫn nằm trên ổ C. Mức trống hiện tại không đủ an toàn để nhập thêm một kỳ lớn, tạo backup cục bộ hoặc vận hành production.

## 2. Kiến trúc và nguyên tắc dữ liệu

### 2.1. Kiến trúc kỹ thuật

| Thành phần | Công nghệ | Vai trò |
|---|---|---|
| Frontend | ReactJS, Vite, Ant Design | Giao diện, bộ lọc, biểu đồ, bảng và hồ sơ C360 |
| Backend | Python FastAPI | API, phân quyền, import, xử lý nghiệp vụ và xuất báo cáo |
| Database | PostgreSQL 16 | Lưu CIF, dữ liệu nguồn, kết quả xử lý, cấu hình và nhật ký |
| Cache | Redis 7 | Cache kết quả phân tích theo phiên; không phải nơi lưu dữ liệu gốc |
| Reverse proxy | Nginx | Phục vụ frontend, proxy `/api`, giới hạn upload 500 MB và chuyển tiếp IP |
| DNS LAN tùy chọn | CoreDNS | Trỏ `c360.agribank.com.vn` về IP nội bộ khi profile `lan-dns` được bật |
| Triển khai | Docker Desktop/WSL2 trên Windows 11 | Chạy frontend, backend, PostgreSQL và Redis |
| Migration | Alembic | Quản lý thay đổi cấu trúc database |

### 2.2. Ba lớp dữ liệu

```text
┌───────────────────────────────────────────────────────────────┐
│ Lớp 1: Dữ liệu gốc                                            │
│ CIF + DP01/LN01/PF10/PF14/CN05/BC06/BC29/KH02/FTPLN/RR01/GL02│
└──────────────────────────────┬────────────────────────────────┘
                               ▼
┌───────────────────────────────────────────────────────────────┐
│ Lớp 2: Dữ liệu theo KH – chi nhánh – kỳ                       │
│ customer_period_branch_details                                │
└──────────────────────────────┬────────────────────────────────┘
                               ▼
┌───────────────────────────────────────────────────────────────┐
│ Lớp 3: Một hồ sơ / một mã KH lõi / một kỳ                     │
│ customer_period_profiles                                      │
└──────────────────────────────┬────────────────────────────────┘
                               ▼
             Dashboard – phân tích – danh sách – C360
```

### 2.3. Nguyên tắc phạm vi

| Phạm vi người dùng chọn | Cách đọc dữ liệu |
|---|---|
| Toàn hệ thống | Dùng `customer_period_profiles`; một mã KH lõi được đếm một lần |
| Một chi nhánh | Dùng `customer_period_branch_details`; chỉ cộng số phát sinh tại chi nhánh đó |
| Một phòng ban/PGD | Tiếp tục giới hạn theo phòng ban hợp lệ trong danh mục tổ chức |
| Phạm vi cá nhân | Chỉ lấy khách hàng gắn với cán bộ đang đăng nhập |

Các bộ lọc chi nhánh, phòng ban và cán bộ phải tuân theo danh mục `org_branches`, `org_departments`, `system_users`; dữ liệu “lạ” chỉ có trong file nguồn không được tự động mở rộng phạm vi truy cập.

### 2.4. Nguyên tắc bảo mật và phiên truy cập

Hệ thống áp dụng đồng thời ba lớp kiểm soát:

1. **Quyền chức năng:** quyết định người dùng được xem màn hình, xem chi tiết, chạy xử lý, sửa cấu hình hay xuất dữ liệu.
2. **Phạm vi dữ liệu:** giới hạn theo toàn tỉnh, chi nhánh, phòng ban hoặc khách hàng của chính cán bộ.
3. **Quyền dữ liệu nhạy cảm:** tách riêng CCCD/MST, thông tin liên hệ, số tài khoản, giao dịch, khoản vay và quyền sao chép.

Quyền hiệu lực được tính theo công thức:

```text
Quyền hiệu lực = Quyền của nhóm + Quyền ALLOW cấp riêng − Quyền DENY cấp riêng
```

`DENY` có hiệu lực ưu tiên và lan truyền theo quan hệ phụ thuộc. Ví dụ, từ chối quyền xem hồ sơ sẽ đồng thời làm mất hiệu lực các quyền xem tiền gửi, tiền vay và dữ liệu nhạy cảm phụ thuộc hồ sơ.

Phiên đăng nhập được lưu tại `user_sessions`, gắn thiết bị, IP, user-agent, thời điểm đăng nhập và hoạt động cuối. Tài khoản thường chỉ duy trì một phiên; đăng nhập mới thu hồi phiên cũ. Tài khoản quản trị được phép nhiều phiên để phục vụ vận hành. Mặc định không hoạt động 30 phút sẽ bị đăng xuất, có cảnh báo trước 120 giây và heartbeat 30 giây khi người dùng còn thao tác.

## 3. Các nhóm chức năng đang có

### 3.1. Đăng nhập và hồ sơ cá nhân

- Đăng nhập bằng tên tài khoản, mã nhân viên hoặc user IPCAS; thông báo riêng cho tài khoản không tồn tại, sai mật khẩu, tạm khóa và khóa bởi quản trị viên.
- Tài khoản thường nhập sai mật khẩu 5 lần liên tiếp sẽ bị tạm khóa 15 phút; quản trị viên có thể mở khóa ngay. Tài khoản quản trị không áp dụng giới hạn số lần sai này nhưng mọi lần thất bại vẫn được ghi nhật ký.
- Tài khoản thường chỉ được có một phiên đăng nhập; phiên cũ bị thu hồi khi đăng nhập ở máy khác. Quản trị viên có thể xem và chủ động thu hồi phiên.
- Không hoạt động 30 phút sẽ tự đăng xuất; giao diện cảnh báo trước 120 giây và cho phép tiếp tục phiên.
- Khi quản trị viên sửa nhóm quyền, quyền cấp riêng, phạm vi, mật khẩu hoặc khóa tài khoản, phiên hiện tại của người bị tác động bị thu hồi và phải đăng nhập lại.
- Bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên/reset mật khẩu.
- Cảnh báo Caps Lock, hiện/ẩn mật khẩu và trạng thái đang đăng nhập.
- Hồ sơ cá nhân thể hiện đơn vị, phòng ban, nhóm quyền, quyền cấp thêm, quyền bị từ chối và phạm vi dữ liệu.
- Người dùng có thể đổi mật khẩu; quản trị viên có thể khóa/mở khóa và reset mật khẩu.

### 3.2. Bộ lọc phạm vi phân tích dùng chung

- Bắt buộc chọn kỳ trước khi xem dữ liệu.
- Lọc theo chi nhánh, phòng ban, cán bộ, tên/mã khách hàng, loại khách hàng, loại vay, số dư, sản phẩm và trạng thái dữ liệu.
- Danh sách cán bộ thay đổi theo chi nhánh/phòng ban đã chọn.
- Kết quả bộ lọc được chuẩn bị dùng chung cho Dashboard, cảnh báo, danh sách khách hàng và các trang phân tích nghiệp vụ. Các bảng phân trang, drill-down và hồ sơ một KH chỉ truy vấn bổ sung đúng phần người dùng mở.
- Redis cache kết quả đọc theo người dùng + phiên phân tích + đường dẫn + bộ tham số; TTL mặc định 15 phút, tối đa 20 MB cho một phản hồi. Redis lỗi thì API tự quay về PostgreSQL, không làm mất dữ liệu nghiệp vụ.
- Đóng phiên, đăng xuất hoặc áp dụng bộ lọc mới sẽ tạo phạm vi mới; không dùng lại dữ liệu của người dùng hoặc phiên khác.

### 3.3. Dashboard điều hành

- Tổng khách hàng, nguồn vốn huy động, tiền gửi theo kỳ hạn, TGTT, dư nợ và cơ cấu dư nợ.
- So sánh tăng/giảm với kỳ trước.
- Kết quả theo chi nhánh, biến động bất thường và các nhóm cần xử lý.
- Bấm KPI để xem tập khách hàng hoặc thành phần cấu thành đúng với chỉ tiêu.
- Biểu đồ theo kỳ và xuất Excel theo bộ lọc.

### 3.4. Cảnh báo và phân nhóm khách hàng

- Khách hàng tiền gửi lớn, dư nợ lớn, CASA cao, quan hệ nhiều chi nhánh.
- Khách hàng chưa có cán bộ quản lý hoặc chưa rõ chi nhánh chính.
- Khách hàng mới xuất hiện, thay đổi cán bộ/chi nhánh và biến động số dư đáng chú ý.
- Tra cứu từ nhóm cảnh báo sang hồ sơ C360.

### 3.5. Danh sách và hồ sơ khách hàng C360

- Danh sách phân trang, tìm kiếm, sắp xếp, chọn cột và xuất dữ liệu.
- Có thể bấm chuột phải để ghim KH cần theo dõi. Danh sách ghim lưu riêng trong database theo từng user và không mở rộng quyền xem dữ liệu.
- Bấm KH đã ghim chỉ truy vấn đúng một mã KH; không tải toàn bộ Danh sách KH hoặc khởi tạo phiên phân tích lớn. Nếu chưa chọn kỳ, hệ thống dùng kỳ mới nhất mà user được phép xem.
- Một hồ sơ khách hàng gồm thông tin nhận diện, quan hệ chi nhánh, cán bộ quản lý và lịch sử kỳ.
- Tab Tiền gửi: tài khoản/sổ tiết kiệm, số dư cuối kỳ/bình quân, vòng đời và giao dịch TKTT.
- Tab Tiền vay: tổng dư nợ, loại vay, LDS/LAV, ngày giải ngân/đáo hạn, lãi và trạng thái khoản vay.
- Tab Rủi ro: nhóm nợ, quá hạn, tài sản bảo đảm, dự phòng và dư nợ đã xử lý rủi ro.
- Tab Phí thu được và Sản phẩm dịch vụ: phí theo nhóm, NHĐT, thẻ, Bill Payment, ABIC và các cờ sử dụng.
- Chuyển phạm vi “toàn bộ quan hệ” hoặc từng chi nhánh sẽ đổi đồng bộ card, bảng, biểu đồ và LDS.

### 3.6. Phân tích nghiệp vụ

| Trang | Nội dung chính |
|---|---|
| Tiền gửi & dòng tiền | Quy mô nguồn vốn, cơ cấu kỳ hạn, dòng tiền TKTT, tài khoản mở mới/đã đóng và biến động số dư |
| Tiền vay & rủi ro | Cơ cấu loại vay, nhóm nợ, dự phòng, dư nợ XLRR và diễn biến tín dụng |
| Thu nhập & sản phẩm | Cơ cấu phí, đối soát phân loại KH02, độ phủ/khoảng trống sản phẩm |
| Đơn vị & cán bộ | Số khách hàng, tiền gửi, dư nợ, phí, thay đổi danh mục và xếp hạng theo cán bộ/đơn vị |

### 3.7. Quản trị dữ liệu

- Kho dữ liệu: import nhiều file, kiểm tra tên, kỳ, chi nhánh, cấu trúc, trùng file và tiến độ job.
- Kho CIF: import XLS/XLSX/CSV, kiểm tra trùng, thay đổi và xung đột định danh.
- Xử lý dữ liệu KH: kiểm tra sẵn sàng, chạy nền, lưu tiến độ và khôi phục job lỗi/kẹt.
- Giám sát nguồn: ma trận nguồn theo kỳ/chi nhánh, chỉ rõ file hoặc ngày FTPLN/GL02 còn thiếu.
- Đối chiếu CIF: danh sách mã từ nguồn chưa khớp CIF, lý do và xuất Excel.
- Từ điển & mapping: trường đích, nguồn, cột nguồn, công thức, trạng thái và độ phủ.

### 3.8. Quản trị hệ thống

- Quản lý chi nhánh, phòng ban, người dùng, nhóm quyền, quyền cấp thêm `ALLOW` và quyền từ chối `DENY` từng người.
- Phạm vi dữ liệu: toàn hệ thống, chi nhánh, phòng ban hoặc khách hàng thuộc cán bộ; mỗi nhóm quyền có chính sách phạm vi mặc định và danh sách phạm vi được phép gán.
- Thao tác hàng loạt tối đa 500 user/lần: cấp quyền, từ chối quyền, gỡ ngoại lệ, đổi nhóm, đổi phạm vi, khóa/mở tài khoản hoặc buộc đăng xuất. Hệ thống cho xem trước tác động và loại các cấu hình không hợp lệ trước khi áp dụng.
- Bảo vệ quản trị: không tự thay đổi quyền/phạm vi của chính mình, không khóa siêu quản trị cuối cùng, thay đổi quyền rủi ro cao chỉ do siêu quản trị thực hiện.
- Cấu hình mã sản phẩm/dịch vụ, tài khoản và công thức đang dùng trong nghiệp vụ.
- Kiểm tra cấu hình người dùng sai phạm vi.
- Nhật ký thao tác lưu before/after, trường thay đổi, người thực hiện, IP, mã batch và nguyên nhân thu hồi phiên.

Hiện database có **370 người dùng hoạt động**, **5 nhóm quyền**, **54 quyền chi tiết** thuộc 11 nhóm nghiệp vụ. Năm nhóm quyền chuẩn gồm:

| Nhóm quyền | Phạm vi mặc định | Phạm vi được phép |
|---|---|---|
| Quản trị hệ thống | Toàn tỉnh | Toàn tỉnh |
| Lãnh đạo Hội sở | Toàn tỉnh | Toàn tỉnh |
| Lãnh đạo chi nhánh loại II | Chi nhánh | Chi nhánh |
| Lãnh đạo phòng/PGD | Phòng ban | Phòng ban |
| Cán bộ quản lý khách hàng | Cá nhân | Cá nhân hoặc phòng ban khi được cấp |

Sáu quyền dữ liệu nhạy cảm được tách riêng gồm: định danh, liên hệ, tài khoản, giao dịch, khoản vay và sao chép. Quyền truy vết công thức/con số (`customer:view_calculation_trace`) là quyền riêng, không tự động có chỉ vì người dùng xem được hồ sơ.

Tại thời điểm chụp số liệu có 57 phiên đã được ghi nhận, trong đó 7 phiên chưa bị thu hồi. Đây là số động, dùng để minh họa khả năng giám sát phiên chứ không phải số người truy cập đồng thời đã được load test.

### 3.9. Xuất Excel và không gian làm việc cá nhân

- Các bảng nghiệp vụ trọng yếu có nút xuất Excel theo đúng bộ lọc, phạm vi dữ liệu và quyền của người đang đăng nhập.
- File khách hàng tối thiểu có mã chi nhánh, mã KH, tên KH, loại KH, địa chỉ, điện thoại và bổ sung chỉ tiêu riêng của bảng khi có dữ liệu/quyền.
- Xuất Excel không bật loading toàn màn hình. Tiến độ, phần trăm và thời gian xử lý hiển thị ở góc dưới bên phải; người dùng vẫn tiếp tục thao tác trên hệ thống.
- Tiến độ được theo dõi theo mã tác vụ xuất; tối đa bốn tác vụ gần nhất được hiển thị trên giao diện.
- “Không gian làm việc của tôi” gồm KH đã ghim và nội dung vừa xem. KH ghim lưu trong PostgreSQL; lịch sử vừa xem lưu cục bộ theo tài khoản trên trình duyệt.

## 4. Quy tắc file nguồn và độ sẵn sàng

### 4.1. Nguồn theo snapshot cuối kỳ

```text
MACN_LOAIFILE_yyyymmdd.csv|xlsx
```

Áp dụng cho `DP01`, `LN01`, `CN05`, `PF10`, `PF14`, `BC29`, `RR01`.

### 4.2. BC06 có thể chia nhiều phần

```text
2600_BC06_20260630[_phan_bo_sung].csv|xlsx
```

Hệ thống quan tâm mã chi nhánh, loại nguồn và ngày kỳ; phần hậu tố được lưu để phân biệt các phần file.

### 4.3. KH02 là dữ liệu cả tháng

```text
2600_KH02_2026060120260630.csv|xlsx
```

Ngày bắt đầu phải là ngày đầu tháng, ngày kết thúc phải là ngày cuối cùng cùng tháng.

### 4.4. GL02 là dữ liệu cả tháng và có thể chia phần

```text
2600_GL02_2026060120260630[_1].csv|xlsx
```

Hệ thống cho phép hậu tố số để nhận nhiều phần, đồng thời kiểm tra khoảng ngày nằm trong cùng tháng.

### 4.5. FTPLN là dữ liệu theo ngày

```text
2600_FTPLN_20260601.csv|xlsx
...
2600_FTPLN_20260630.csv|xlsx
```

Hệ thống kiểm tra ngày nào còn thiếu theo từng chi nhánh. Đây là nguồn dễ phát sinh nhiều file nhất.

### 4.6. Nguồn bắt buộc khi xử lý

Logic hiện tại coi các nguồn sau là bộ chính: `DP01`, `LN01`, `CN05`, `PF10`, `PF14`, `BC06`, `BC29`, `KH02`, `FTPLN`. `RR01` và `GL02` được import, giám sát và khai thác nghiệp vụ nhưng chưa nằm trong `REQUIRED_FILE_TYPES` dùng để chặn nút xử lý.

Mặc định, kỳ thiếu bất kỳ nguồn chính nào sẽ không được chạy. API có hai mức ngoại lệ có kiểm soát:

- `allow_missing_ftpln`: chỉ cho phép thiếu FTPLN.
- `allow_missing_sources`: cho phép xử lý kỳ chưa đủ một hoặc nhiều nguồn chính khi người có quyền `processing:run` xác nhận.

Kết quả xử lý thiếu nguồn vẫn phải hiển thị trạng thái sẵn sàng và không được diễn giải trường không có nguồn thành số 0 chắc chắn.

### 4.7. File CIF và file bổ sung

- CIF chấp nhận `.csv`, `.xls`, `.xlsx`; một file có thể chứa nhiều chi nhánh. Mã chi nhánh được suy ra từ từng `CUSTNO`, không bắt buộc toàn file chỉ có một mã chi nhánh.
- Import CIF trùng `CUSTNO` giữ bản ghi đầu tiên hợp lệ và bỏ qua các dòng trùng sau; bản ghi đã tồn tại nhưng thay đổi được đưa vào lịch sử/xung đột để duyệt thủ công.
- File bổ sung cho kỳ được đăng ký trong `customer_processing_optional_files`. Dữ liệu đã đọc được chuẩn hóa vào bảng Bill Payment/Bảo lãnh/OAB trong PostgreSQL; file gốc vẫn nằm tại thư mục upload gắn volume/bind mount và phải được backup cùng database.
- Khi xóa hoặc thay file bổ sung, hệ thống phải xóa cả bản ghi parsed liên quan theo `optional_file_id`, sau đó chạy lại kỳ để phản ánh thay đổi vào hồ sơ.

## 5. Nguồn dữ liệu và cách hình thành số liệu

### 5.1. Kho CIF – danh mục khách hàng nền

**Vai trò:** nguồn nhận diện chính, không phụ thuộc kỳ báo cáo.

| Nội dung | Cột nguồn/quy tắc |
|---|---|
| Mã CIF đầy đủ | `CUSTNO`, bắt buộc 13 chữ số |
| Mã chi nhánh của bản ghi CIF | 4 số đầu `CUSTNO` |
| Mã khách hàng lõi | 9 số cuối `CUSTNO` |
| Tên khách hàng | ưu tiên `NMLOC`, sau đó `NM` |
| Loại khách hàng | `CUSTTPCD`, chi tiết `CUSTDTLTPCD` |
| CCCD/đăng ký | `REGNO`; nếu hồ sơ kỳ thiếu có thể fallback `DP01.ID_NUMBER` |
| Mã số thuế | `TAXNO`, giữ kiểu text |
| Địa chỉ | ghép `ADDR1LOC, ADDR2LOC, ADDR3LOC`, bỏ phần rỗng |
| Điện thoại | ưu tiên `NAME_4`, sau đó ghép các thành phần số điện thoại |
| Ngày sinh | cá nhân lấy `NAME_1`, chuẩn hóa `YYYYMMDD` |
| Giới tính | cá nhân lấy `NAME_3`; tổ chức để trống |
| Nghề nghiệp/ngành nghề | `PROFNM` |
| Trạng thái | `STSCD`, chuẩn hóa active/inactive/invalid/unverified/unknown |
| Tên chủ doanh nghiệp | trường `GD_TEN` trong raw CIF |
| Ngày thành lập | hồ sơ kỳ ưu tiên `ISSUEDT4`; master cũng lưu `INCRDT` để đối chiếu |

Quy tắc kiểm soát:

- Một khách hàng lõi có thể có nhiều `CUSTNO` tại nhiều chi nhánh nhưng chỉ tạo một master `cif_customers`.
- `CUSTNO` trùng trong cùng file: giữ dòng đầu, dòng sau được ghi cảnh báo và bỏ qua.
- Bản ghi đã tồn tại nhưng nguồn mới thay đổi thông tin: lưu lịch sử/staging và xung đột để người có quyền xác nhận, không tự ghi đè âm thầm.
- Kiểm tra trùng giấy tờ định danh, sai định dạng ngày, sai mã CIF và độ phủ cột.

### 5.2. DP01 – tài khoản tiền gửi, nguồn vốn và dữ liệu hỗ trợ

**Khóa chính nghiệp vụ:** `MA_KH + MA_CN + SO_TAI_KHOAN` trong một kỳ.

| Chỉ tiêu/thông tin | Cách lấy |
|---|---|
| Tổng nguồn vốn huy động sau quy đổi | `SUM(CURRENT_BALANCE × TYGIA)` với `CURRENT_BALANCE > 0` |
| Tiền gửi không kỳ hạn | `MONTH_TERM = 0` |
| KKH | `MONTH_TERM = 0` và tên loại có KKH/không kỳ hạn hoặc `DP_TYPE_CODE = 401` |
| TGTT | Phần `MONTH_TERM = 0` còn lại sau khi loại KKH |
| Tiền gửi có kỳ hạn | `MONTH_TERM > 0` |
| CKH dưới 6 tháng | `0 < MONTH_TERM < 6` |
| CKH từ 6 đến dưới 12 tháng | `6 <= MONTH_TERM < 12` |
| CKH từ 12 tháng trở lên | `MONTH_TERM >= 12` |
| Tỷ giá | VND = 1; ngoại tệ lấy `TYGIA` trên từng dòng DP01 |
| Doanh số Có/Nợ nguồn | `SUM(CRAMT)`, `SUM(DRAMT)` theo KH/chi nhánh |
| Danh sách tài khoản, loại tiền gửi | `SO_TAI_KHOAN`, `DP_TYPE_CODE`, `DP_TYPE_NAME` |
| Vòng đời tài khoản | `OPENING_DATE`, `MATURITY_DATE` và sự xuất hiện giữa các kỳ |
| Phòng phát sinh | `MA_PGD`, `TEN_PGD`; chỉ công nhận khi khớp danh mục phòng ban |
| Cán bộ fallback | `EMPLOYEE_NUMBER` đối chiếu `system_users.employee_code`; chỉ lấy tài khoản có số dư dương và đúng chi nhánh của user |
| Hộ kinh doanh | `CUST_TYPE = 570`; lưu cả danh sách tài khoản HKD |
| Đối chiếu Bill Payment/OAB | Dùng `SO_TAI_KHOAN` để suy ra mã KH từ tài khoản thanh toán |

**Lưu ý bắt buộc:** số dư DP01 âm không được cộng vào tiền gửi vì được xem là thấu chi và đã phản ánh ở nguồn tiền vay.

Dashboard điều hành dùng DP01 cho **tổng nguồn vốn huy động**, vì DP01 bao phủ cả tài khoản OSB. PF14 được dùng cho số dư bình quân và đối soát chi tiết tài khoản/kỳ hạn.

### 5.3. LN01 – khoản vay, nhóm nợ và cán bộ tín dụng

| Chỉ tiêu/thông tin | Cách lấy |
|---|---|
| Tổng dư nợ cuối kỳ | `SUM(DU_NO)` theo `CUSTSEQ` và `BRCD` |
| Loại vay | `LOAN_TYPE`: thấu chi, ngắn hạn TK 211, trung hạn TK 212, dài hạn TK 213 |
| Nhóm nợ | `NHOM_NO` trong dữ liệu/raw, nhóm 1–5 |
| Cán bộ quản lý khoản vay | `OFFICER_ID` đối chiếu `system_users.credit_officer_code` |
| Cán bộ đại diện tại chi nhánh | Cán bộ hợp lệ quản lý khoản vay có `DU_NO` lớn nhất tại chi nhánh |
| Lãi suất và thông tin khoản vay | `INTEREST_RATE`, `DSBSSEQ`, `TRANSACTION_DATE`, `APPRSEQ` và raw nguồn |
| DPRR chung lũy kế | `SUM(DU_NO nhóm 1–4) × 0,75%` theo KH và chi nhánh |
| Tăng/giảm DPRR chung trong tháng | `(Dư nợ đủ điều kiện kỳ này − kỳ trước) × 0,75%` |

Số DPRR trong tháng có thể âm. Âm có nghĩa là mức dự phòng chung giảm/được hoàn nhập so với kỳ trước, không có nghĩa là hệ thống “trích lập âm”.

### 5.4. PF10 – chi tiết LDS và cơ cấu dư nợ theo loại vay

**Chuẩn hóa mã:** `TRBRCD` là chi nhánh; `CUSTSEQ` bỏ ký tự `'` và trim để lấy mã KH lõi; `ACCTNO` là LDS/tài khoản khoản vay.

| LNTYPE | Nhóm nghiệp vụ |
|---|---|
| `100` | Ngắn hạn |
| `110`, `120` | Trung và dài hạn |
| `241` | Thấu chi |

| Chỉ tiêu | Công thức sau quy đổi |
|---|---|
| `DUNO_NHTT` | `SUM(EOMBAL)` với `LNTYPE = 100` |
| `DUNO_NHTTBQ` | `SUM(AVGBAL)` với `LNTYPE = 100` |
| `DUNO_TDHTT` | `SUM(EOMBAL)` với `LNTYPE IN (110,120)` |
| `DUNO_TDHTTBQ` | `SUM(AVGBAL)` với `LNTYPE IN (110,120)` |
| `DUNO_TC` | `SUM(EOMBAL)` với `LNTYPE = 241` |
| `DUNO_TCBQ` | `SUM(AVGBAL)` với `LNTYPE = 241` |

- Ngoại tệ được quy đổi bằng bảng tỷ giá tạo từ DP01 cùng kỳ; VND dùng tỷ giá 1.
- `OPNDT`, `MATDT`, `CLSDT` phục vụ trạng thái còn hiệu lực, sắp đến hạn, đến hạn trong tháng hoặc đã đóng.
- `INTEREST`, `ACCRUALS`, `BVCORRINT` được tổng hợp và giữ ở cấp khoản vay/khách hàng để giải trình lãi, dự thu và điều chỉnh sổ.
- Tổng dư nợ chính trên hồ sơ hiện lấy từ LN01; PF10 dùng để phân rã loại vay và chi tiết LDS. Khi xác định quan hệ chính, hệ thống dùng giá trị lớn hơn giữa dư nợ LN01 và tổng các nhóm PF10 để tránh cộng trùng.

### 5.5. PF14 – số dư tiền gửi bình quân và cuối kỳ

| Chỉ tiêu | Công thức |
|---|---|
| Tiền gửi CKH trên hồ sơ C360 | `SUM(MONTHLYENDBALANCE × tỷ giá)` với `MONTERM > 0` |
| TGTT bình quân | `SUM(AVERAGEBALANCE × tỷ giá)` với `MONTERM = 0` |
| Số tài khoản/sổ tiết kiệm | `ACCOUNTNO` |
| Phân tích sản phẩm/kỳ hạn | `PRODUCTCODE`, `MONTERM` |

Khóa ghép gồm `CUSTSEQ + TRBRCD`; `CUSTSEQ` được bỏ dấu `'` và trim. Tỷ giá lấy từ bảng tỷ giá DP01 theo `CCY`; VND = 1.

### 5.6. CN05 – sản phẩm và dịch vụ

Giá trị lớn hơn 0 được hiểu là có sử dụng trong kỳ; khi gom toàn khách hàng, dùng `MAX` để chỉ cần có ở một chi nhánh là được ghi nhận có dùng.

| Sản phẩm/dịch vụ | Cột nguồn |
|---|---|
| Số TKTT | `TKTT_SO_TK` |
| TK số đẹp | `TKTT_TK_SODEP` |
| TK OSB | `TK_OSB` và vẫn thuộc nhóm TKTT |
| Agribank Plus | `DK_AGRIBANK_PLUS` |
| Tin nhắn OTT | `DK_AGRIBANK_PLUS_OTT` |
| SMS Banking/e-Banking | `SMS_BANKING` |
| SMS tiền gửi | `TG_SMS_TIEN_GUI` |
| SMS nhắc nợ vay | `VV_SMS_TIEN_VAY` |
| Số LDS | `VV_TONG_SO_LDS`, `VV_TONG_SO_LDS_CENTERCUT` |
| Thẻ ghi nợ nội địa/quốc tế | `THE_GHI_NO_NOI_DIA`, `THE_GHI_NO_QUOC_TE` |
| Thẻ tín dụng nội địa/quốc tế | `THE_TIN_DUNG_NOI_DIA`, `THE_TIN_DUNG_QUOC_TE` |
| Tổ chức thẻ | `VISA`, `MASTER`, `JCB` |

CN05 cho biết số lượng/cờ sử dụng sản phẩm; không được dùng thay cho số tài khoản chi tiết nếu nguồn không cung cấp danh sách tài khoản tương ứng.

### 5.7. BC06 – phân hạng và phân khúc khách hàng

| Nhóm thông tin | Cột nguồn |
|---|---|
| Khóa khách hàng | `MA_KHACH_HANG` |
| Xếp hạng/phân nhóm tại chi nhánh | `NHOM_TAI_CN`, `HANG_TAI_CN` |
| Xếp hạng/phân nhóm toàn hệ thống | `NHOM_AGR`, `HANG_AGR` |
| Phân khúc | `NHOM_TT_CN`, `HANG_TT_CN`, `NHOM_TT_AGR`, `HANG_TT_AGR` |
| Lợi ích và số dư bình quân | `LOI_ICH_*`, `SDBQ_*` |
| Đơn vị đầu mối | `DON_VI_DAU_MOI` |

BC06 phục vụ diễn biến phân hạng qua các kỳ. `DON_VI_DAU_MOI` được đối chiếu tên trong danh mục chi nhánh để hỗ trợ xác định đơn vị quản lý khi các mức ưu tiên cao hơn không có dữ liệu.

### 5.8. BC29 – rủi ro tín dụng và dự phòng cụ thể

| Chỉ tiêu/thông tin | Cách lấy |
|---|---|
| Nhóm nợ | `NHOM_NO` |
| Dư nợ/đối tượng phải trích | `TONG_DN`, `TONG_DN_PHAI_TRICH` |
| Quá hạn gốc/lãi | `SO_NGAY_QHG`, `SO_NGAY_QHL` |
| Tài sản bảo đảm | `TONG_GTKT_TSDB`, `TONG_TSDB`, `BDS`, `DS`, `GTCG`, `KHAC` |
| Dư nợ/giá trị đã XLRR | `SO_TIEN_DA_XLRR`, `NGAY_XLRR` |
| DPRR cụ thể lũy kế | `SUM(SO_TRICH_LAP_TRONG_KY)` cho nhóm nợ 2–5 |
| Tăng/giảm DPRR cụ thể trong tháng | Giá trị lũy kế kỳ này trừ giá trị lũy kế kỳ trước |

Tên cột `SO_TRICH_LAP_TRONG_KY` của nguồn đang được nghiệp vụ sử dụng như số dự phòng cụ thể lũy kế tại cuối kỳ. Đây là điểm cần tiếp tục được chủ nguồn xác nhận bằng văn bản để tránh hiểu sai tên cột.

### 5.9. KH02 – phát sinh thu phí theo khách hàng

**Công thức chung:** sau khi lọc `ACCTCD`, gom theo `CUSTSEQ + TRBRCD`:

```text
Phí thuần = SUM(CRAMT) - SUM(DRAMT)
```

| Chỉ tiêu | Đầu mã ACCTCD |
|---|---|
| `PHI_BAOLANH` | `7040xx` |
| `PHI_CHUYENTIEN` | `711001`, `711002` |
| `PHI_NHDT` | `711036`, `711037`, `711039` |
| `ABIC_BATD` | `714xxx` |
| `PHI_KDNT` | `721001` |
| `PHI_LC` | `709002` |
| `PHI_TTQT` | `711003–711014`, `711096` |
| `PHI_THE` | `711015`, `711016`, `711022–711028`, `711051`, `711052`, `711059` |
| `PHI_KHAC` | `711031`, `711035`, `711042`, `711044`, `711098` |

Quy tắc loại trùng:

- `711002` chỉ thuộc phí chuyển tiền, không cộng lại vào TTQT.
- `711037`, `711039` chỉ thuộc phí NHĐT.
- `711096` chỉ thuộc TTQT.
- Mỗi mã tài khoản chỉ vào một nhóm phí chính.
- Phần tài khoản thuộc họ ứng viên phí nhưng chưa có mapping được hiển thị ở đối soát “chưa phân loại”, không tự đẩy vào `PHI_KHAC`.

Hệ thống hỗ trợ truy vết: nhóm phí → ACCTCD → khách hàng → bút toán KH02. Chi tiết bút toán gốc chỉ dành cho quản trị viên.

### 5.10. FTPLN – lịch FTP khoản vay theo ngày

Nguồn lưu các trường `LDRBAL`, `CPAMT`, `CPLKAMT`, lãi suất, FTP, ngày mở/đáo hạn, hợp đồng và khách hàng theo từng ngày.

Hiện trạng sử dụng:

- Đã import vào `ftpln_daily_loan_ftp`.
- Đã kiểm tra đủ ngày trong tháng theo từng chi nhánh và hiển thị ngày thiếu.
- Được dùng trong kiểm soát độ sẵn sàng và đối chiếu mã khách hàng.
- Chưa đưa `CPAMT/CPLKAMT` thành chỉ tiêu tổng hợp chính thức trong hồ sơ C360; các khoản gốc/lãi phải thu đang còn phụ thuộc trường chi tiết LN01/raw. Cần chốt định nghĩa nghiệp vụ trước khi công bố KPI từ FTPLN.

### 5.11. RR01 – dư nợ đã xử lý rủi ro

| Chỉ tiêu | Công thức |
|---|---|
| `DUNO_XLRR` | `SUM(DUNO_GOC_HIENTAI)` theo mã KH lõi |
| `DS_THUNO_XLRR` trong kỳ | `SUM(THU_GOC) + SUM(THU_LAI)` |
| Thu gốc/lãi lũy kế | Cộng số thu của các kỳ đến kỳ đang xem |

Chi tiết hiển thị theo `SO_LAV`, `SO_LDS`, chi nhánh, loại khách hàng, ngày giải ngân/đáo hạn, ngày XLRR, dư nợ ban đầu/hiện tại, số thu và tài sản bảo đảm.

### 5.12. GL02 – giao dịch sổ cái và dòng tiền TKTT

`CUSTOMER` dạng `2600-012345678` được chuẩn hóa thành mã chi nhánh khách hàng và mã KH lõi.

| Chỉ tiêu | Công thức/quy tắc |
|---|---|
| `DS_TKTT` | `SUM(CRAMOUNT)` với `LOCAC = 421101`, `TRTP = Normal`, bỏ KH `000000000` |
| Giao dịch gần nhất | `MAX(TRDATE hoặc CRTDTM)` của giao dịch TKTT hợp lệ |
| Trạng thái hoạt động | Cách cuối kỳ <= 7 ngày: hoạt động; <= 30 ngày: ít hoạt động; lớn hơn 30 ngày: không hoạt động |
| Dòng tiền theo ngày | Gom `SUM(CRAMOUNT)` và `SUM(DRAMOUNT)` theo ngày |
| Diễn giải giao dịch | Dựa `REMARK`, nhưng chiều tiền luôn dựa vào số phát sinh Có/Nợ, không suy đoán từ câu tiếng Anh |

GL02 không có số tài khoản khách hàng chi tiết; vì vậy giao dịch gần nhất chỉ được khẳng định ở cấp khách hàng/chi nhánh, không gắn chắc chắn với một `ACCOUNTNO` riêng trong DP01/PF14.

### 5.13. Bill Payment – file bổ sung

Các mã dịch vụ được lưu trong bảng cấu hình `business_matching_rules`, không hard-code trực tiếp vào giao diện.

| Cờ dịch vụ | Mã dịch vụ/điều kiện |
|---|---|
| `THUHO_DIEN` | `994, 995, 996, 997, 999, 1003` |
| `THUHO_NUOC` | `1235, 6626, 10929, 10930, 10931, 10932, 6541` |
| `THUHO_DT` | `312, 333, 360, 409, 363` |
| `ABIC_BATK` | Mã `1218`, số tiền đúng `77.000` |
| `ABIC_BATHE` | Mã `1218`, số tiền đúng `18.000` |

Cách tìm khách hàng:

1. Tài khoản chuyển thông thường: đối chiếu `STK chuyển` với `DP01.SO_TAI_KHOAN`.
2. Tài khoản Plus dạng `8888xxxxxxxxx`: bỏ tiền tố `8888`, đối chiếu mã KH trong CN05.
3. `user deposit`: tách CCCD 9–12 số trong `Nội dung`, đối chiếu `CIF.REGNO`.

File bổ sung được đăng ký trong `customer_processing_optional_files`; dữ liệu sau đọc được lưu vào `supplemental_billpayment_transactions`. Hiện database có **01 file Bill Payment trạng thái ready**.

### 5.14. File bổ sung Bảo lãnh/LC và OAB

| Nguồn | Cách xử lý |
|---|---|
| Bảo lãnh/LC | Đọc `Ma_CN`, `Ma_Kh`, `Loaibllc`, hợp đồng, ngày hiệu lực và số tiền; map loại bảo lãnh hoặc LC thành cờ sử dụng |
| OAB/Loa biến động số dư | Đối chiếu `TK_AGRIBANK` với `DP01.SO_TAI_KHOAN` để tìm KH và bật cờ `loa_bien_dong_so_du` |

Đây là file bổ sung theo kỳ, không thuộc bộ tên file chuẩn. Tên file phải chứa từ khóa nhận diện `baolanh/bao_lanh`, `oab/loa`, `billpayment/list_transaction` hoặc từ `POS` đứng độc lập.

### 5.15. Báo cáo POS toàn tỉnh

Nguồn POS chỉ dùng để xác định quan hệ sử dụng POS và vòng đời thiết bị; hệ thống không lấy doanh số hoặc phí POS từ file này.

```text
POS.SỐ_TÀI_KHOẢN
    → DP01.SO_TAI_KHOAN cùng kỳ
    → DP01.MA_KH
    → CIF.customer_core_code tại bước xử lý khách hàng
```

- `POS = 1` khi có ít nhất một quan hệ tài khoản POS khớp được DP01, kể cả không phát sinh giao dịch.
- `SO_THIET_BI_POS` lấy số thiết bị sau khi gộp các dòng cùng tài khoản/Merchant.
- `POS_MOI` là quan hệ có kỳ này nhưng không có ở sheet liền trước.
- `POS_KHONG_HOAT_DONG` là quan hệ còn tồn tại nhưng số món giao dịch trong tháng bằng 0.
- `POS_NGUNG_HOAT_DONG` là quan hệ có ở sheet kỳ trước nhưng không còn ở kỳ này.
- File hiện hành áp dụng cho 06–08/2026: kỳ 06 dùng T6, kỳ 07 dùng T7, kỳ 08 kế thừa ảnh chụp T7 và không tự suy diễn POS mới/ngừng khi chưa có T8.
- Merchant ID, mã thiết bị và tên cửa hàng không được dùng để đoán mã khách hàng.

## 6. Xác định chi nhánh, phòng ban và cán bộ quản lý

### 6.1. Cán bộ quản lý hồ sơ

Thứ tự hiện hành:

1. **USER_CIF:** user đang hoạt động có `customer_cif_code` khớp đúng một `CUSTNO` trong Kho CIF; đây là gán quản lý trực tiếp có ưu tiên cao nhất.
2. **LN01:** `OFFICER_ID` khớp `system_users.credit_officer_code`; chọn khoản vay có dư nợ lớn nhất.
3. **DP01:** tại chi nhánh có tổng số dư dương lớn nhất, `EMPLOYEE_NUMBER` khớp `system_users.employee_code` và user thuộc đúng chi nhánh đó.
4. **BC06:** dùng `DON_VI_DAU_MOI` để xác định chi nhánh khi không có cán bộ hợp lệ ở các mức trên.
5. **CIF_BRANCH/nơi quan hệ:** dùng chi nhánh CIF hoặc chi nhánh quan hệ chính; có thể để trống cán bộ nếu không có user hợp lệ.

Mã cán bộ/phòng ban không tồn tại trong danh mục hệ thống không được hiển thị như một cán bộ quản lý hợp lệ.

### 6.2. Chi nhánh quan hệ chính

Nếu không có gán trực tiếp USER_CIF, thứ tự chọn quan hệ chính là:

1. Chi nhánh có dư nợ; ưu tiên dư nợ lớn nhất.
2. Tiền gửi CKH lớn nhất.
3. TGTT bình quân lớn nhất.
4. Điểm gắn bó gồm quy mô tài chính, doanh số Có, số sản phẩm và số tài khoản/dòng DP01.
5. Mã chi nhánh dùng làm tiêu chí cuối để kết quả ổn định.

Mỗi chi nhánh trong hồ sơ vẫn giữ cán bộ riêng; cán bộ ở chi nhánh này không được tự sao chép sang chi nhánh khác.

## 7. Kiểm soát chất lượng và đối chiếu

- Kiểm tra tên file, định dạng, kỳ, chi nhánh và bộ cột bắt buộc.
- Hash file để nhận biết import trùng.
- Import theo job nền, có trạng thái từng bước và cơ chế khôi phục job kẹt.
- File nguồn chỉ lưu vào kho, không đối chiếu CIF ngay khi import.
- Khi chạy xử lý KH, tất cả nguồn mới ghép với Kho CIF hiện hành.
- Mã nguồn không khớp CIF được lưu trong `customer_source_reconciliations` kèm nguồn, chi nhánh, số dòng, giá trị và lý do.
- Sau xử lý có kiểm tra số hồ sơ, mã trùng, liên kết CIF và tổng các chỉ tiêu tài chính trọng yếu.
- Báo cáo chất lượng của từng job được lưu trong `customer_processing_jobs.quality_report`; lịch sử job không bị mất khi đổi tab hoặc khởi động lại giao diện.
- Job kẹt chỉ được khôi phục khi PostgreSQL không còn query xử lý thật; job cũ được đánh dấu lỗi trước khi tạo job mới để tránh chạy trùng.
- Đối soát phí KH02 kiểm tra phương trình:

```text
Tổng phí ứng viên KH02 = Phí đã phân loại + Phí chưa phân loại
```

- Chạy lại một kỳ sẽ xóa kết quả tổng hợp cũ của đúng kỳ rồi tái tạo theo từng bước, không cộng nối lên kết quả cũ. Dữ liệu nguồn đã import vẫn được giữ nguyên. Hiện các bước có `commit` trung gian, vì vậy nếu job lỗi sau bước xóa thì kỳ có thể tạm thời chưa có hoặc chưa đủ kết quả cho đến khi chạy lại thành công.
- Cache Redis và cache trình duyệt chỉ là lớp tăng tốc; không phải nguồn số liệu và có thể xóa/restart mà không làm mất dữ liệu nghiệp vụ.

## 8. Hiện trạng nguồn theo kỳ

Số file thành công hiện có:

| Kỳ | DP01 | LN01 | PF10 | PF14 | CN05 | BC06 | BC29 | KH02 | FTPLN | RR01 | GL02 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 05/2026 | 7 | 7 | 7 | 7 | 7 | 0 | 7 | 7 | 0 | 7 | 16 |
| 06/2026 | 7 | 7 | 7 | 7 | 7 | 7 | 7 | 7 | 210 | 7 | 15 |
| 07/2026 | 7 | 7 | 7 | 7 | 7 | 7 | 7 | 7 | 0 | 7 | 16 |
| 08/2026 | 7 | 7 | 7 | 7 | 7 | 0 | 7 | 7 | 0 | 7 | 0 |

Nhận xét:

- Tháng 06/2026 là kỳ đầy đủ nhất, gồm 210 file FTPLN tương ứng 30 ngày × 7 chi nhánh.
- Tháng 05/2026 thiếu BC06 và FTPLN.
- Tháng 07/2026 thiếu FTPLN.
- Tháng 08/2026 đã đủ 7 chi nhánh đối với DP01, LN01, CN05, PF10, PF14, BC29, KH02 và RR01; còn thiếu toàn bộ BC06, FTPLN và GL02, đồng thời chưa có hồ sơ C360 đã xử lý.
- Tổng số file trạng thái `success` hiện là **495**. Lịch sử xử lý có 24 job thành công và 7 job lỗi; ba kết quả hiện hành gần nhất mất khoảng 17,72 phút (07/2026), 21,93 phút (06/2026) và 21,41 phút (05/2026).
- Khi báo cáo lãnh đạo phải gắn nhãn độ sẵn sàng của kỳ, tránh so sánh trực tiếp hai kỳ có phạm vi nguồn khác nhau.

## 9. Hiện trạng và điểm yếu máy chủ

### 9.1. Cấu hình đo tại ngày 22/09/2026

| Thành phần | Hiện trạng |
|---|---|
| Thiết bị | HP EliteBook 840 G5 – máy tính xách tay |
| CPU | Intel Core i7-8550U, 4 nhân/8 luồng, 1,80 GHz cơ bản |
| RAM vật lý | 15,8 GB |
| Tài nguyên Docker | 8 CPU logic, khoảng 8 GB RAM |
| Ổ C | 157,86 GB, còn **8,00 GB (5,1%)** |
| Ổ D | 78,09 GB, còn **5,18 GB (6,6%)** |
| Docker VHDX | `C:\Users\Administrator\AppData\Local\Docker\wsl\disk\docker_data.vhdx`, khoảng **48,63 GB** |
| Volume PostgreSQL của C360 | khoảng **33,58 GB** |
| PostgreSQL | khoảng **31 GB** |
| Docker build cache | khoảng **2,52 GB** |
| Redis | giới hạn RAM 1 GB, chính sách `allkeys-lru`, không persistence |

### 9.2. Thành phần database chiếm dung lượng lớn

| Bảng | Dung lượng gần đúng | Nhận xét |
|---|---:|---|
| `gl02_ledger_transactions` | **17 GB** | Nguồn tăng dung lượng lớn nhất |
| `customer_period_profiles` | **3,0 GB** | Hồ sơ theo kỳ; tăng theo số kỳ × số CIF |
| `dp01_deposit_accounts` | **1,86 GB** | Dữ liệu tài khoản tiền gửi |
| `cif_source_records` | **1,41 GB** | Giữ raw CIF và lịch sử nguồn |
| `cif_customer_identifiers` | **1,25 GB** | Quan hệ CIF theo chi nhánh |
| `kh02_customer_transactions` | **1,21 GB** | Phát sinh phí theo tháng |
| `customer_period_branch_details` | **1,06 GB** | Chi tiết KH theo chi nhánh/kỳ |
| `ftpln_daily_loan_ftp` | **1,04 GB** | Nguồn hằng ngày, tăng rất nhanh nếu nhập đủ kỳ |

### 9.3. Các điểm yếu và tác động

| Mức độ | Điểm yếu | Tác động có thể xảy ra |
|---|---|---|
| **Rất cao** | Ổ C chỉ còn 5,1% trống, trong khi Docker VHDX 48,63 GB vẫn nằm trên C | PostgreSQL/Docker có thể dừng ghi, import lỗi, migration thất bại hoặc không tạo được file tạm |
| **Rất cao** | Ổ D chỉ còn 5,18 GB (6,6%), thấp hơn nhiều so với DB 31 GB | Không đủ vùng an toàn để backup đầy đủ, chuyển DB hoặc nhập thêm các nguồn lớn tháng mới |
| **Cao** | Máy chủ thực tế là laptop 4 nhân, RAM 16 GB; Docker chỉ được 8 GB | Truy vấn phân tích và xử lý kỳ cạnh tranh CPU/RAM, chậm rõ khi nhiều người dùng |
| **Cao** | GL02 đã chiếm 17 GB, hơn một nửa quy mô DB | Mỗi tháng GL02 mới có thể làm dung lượng tăng nhanh; index và VACUUM cũng cần thêm không gian |
| **Cao** | Một máy duy nhất chạy DB, backend, frontend và cache | Hỏng máy, lỗi Windows, Docker hoặc ổ đĩa sẽ dừng toàn bộ hệ thống; chưa có dự phòng nóng |
| **Cao** | Chưa có bằng chứng về backup tự động đã được kiểm thử phục hồi định kỳ | Có backup nhưng không restore thử thì vẫn có nguy cơ không sử dụng được khi sự cố |
| **Trung bình–cao** | Import/xử lý dữ liệu lớn chạy cùng thời điểm người dùng truy vấn | Dashboard chậm, timeout hoặc job kéo dài; kỳ gần đây mất khoảng 18–22 phút xử lý |
| **Trung bình–cao** | Kho CIF tăng làm mỗi kỳ tạo hơn 500 nghìn hồ sơ | Mỗi kỳ mới tiếp tục tăng dung lượng cho profile, branch detail và index nếu không có chính sách lưu trữ |
| **Trung bình–cao** | Xử lý lại kỳ xóa kết quả cũ rồi commit theo nhiều chặng | Nếu lỗi giữa chừng, kỳ đang chạy có thể tạm mất hoặc thiếu dữ liệu tổng hợp; cần chạy lại thành công mới khôi phục đầy đủ |
| **Trung bình** | File bổ sung vẫn có đường dẫn file local dù dữ liệu parsed được lưu DB | Khi chuyển máy hoặc xóa file gốc, chạy lại kỳ có thể thiếu nguồn bổ sung nếu không sao chép đúng thư mục |
| **Trung bình** | Redis cấu hình không persistence | Không mất dữ liệu nghiệp vụ nhưng cache mất sau restart, lượt truy vấn đầu tiên sẽ chậm |
| **Trung bình** | Không có Internet | Hệ thống LAN vẫn chạy nếu image đã có, nhưng GitHub Actions/GHCR, tải image và cập nhật thư viện không hoạt động trực tiếp |
| **An toàn thông tin** | PostgreSQL đang publish cổng `5432` ra mọi interface host | Nếu firewall mở rộng, máy không được phép có thể thử kết nối DB; cần giới hạn IP/mạng và tài khoản |
| **An toàn thông tin** | Ứng dụng dùng HTTP trong LAN | Nội dung và token chưa được mã hóa trên đường truyền; cần HTTPS nội bộ hoặc reverse proxy có TLS trước production |

### 9.4. Đánh giá khả năng phục vụ

Cấu hình hiện tại phù hợp cho **phát triển, kiểm thử và demo nội bộ có kiểm soát**. Cấu hình này chưa nên được coi là máy chủ production ổn định cho khoảng 100 người truy cập đồng thời, đặc biệt khi vừa truy vấn phân tích vừa import hoặc xử lý kỳ.

Chưa có kết quả load test chính thức nên không nên cam kết số người dùng đồng thời chỉ dựa trên việc hệ thống chạy được ở hiện tại.

### 9.5. Trạng thái triển khai LAN/offline

- Frontend/Nginx publish cổng 80 ra LAN; backend chỉ bind `127.0.0.1:8000` trên host và được Nginx proxy qua `/api`, giảm việc lộ trực tiếp cổng ứng dụng.
- CORS đã cấu hình cho `localhost`, `10.8.0.119` và `http://c360.agribank.com.vn`.
- CoreDNS đã có cấu hình ánh xạ `c360.agribank.com.vn → 10.8.0.119`, nhưng container DNS thuộc profile `lan-dns` và tại thời điểm rà soát **không chạy**. Muốn các máy trạm dùng tên miền này phải bật CoreDNS và cấu hình DNS tập trung/DHCP hoặc DNS trên từng máy.
- Nginx truyền `X-Real-IP` và `X-Forwarded-For`; backend chỉ tin proxy khi `TRUSTED_PROXY_HOSTNAME` được cấu hình đúng. Nếu thiếu cấu hình này, nhật ký có thể ghi IP gateway/container thay vì IP máy trạm.
- Hệ thống có thể chạy không Internet nếu các Docker image đã tồn tại cục bộ. GitHub Actions, GHCR, tải image và cập nhật thư viện sẽ không hoạt động trực tiếp trong thời gian máy chủ offline.

## 10. Kiến nghị hạ tầng

### 10.1. Việc cần làm ngay

1. Dừng nhập thêm nguồn lớn nếu chưa bảo đảm tối thiểu 20% dung lượng trống.
2. Chuyển Docker data/VHDX khỏi ổ C sang ổ dữ liệu đủ lớn bằng chức năng Docker Desktop hoặc quy trình WSL đã kiểm thử.
3. Trang bị ổ dữ liệu mới; không sử dụng ổ D 78 GB hiện tại làm nơi production lâu dài.
4. Tạo backup PostgreSQL ra thiết bị/ổ khác máy chủ và thử restore thực tế.
5. Lập cảnh báo khi ổ đĩa còn dưới 20%, dưới 15% và dưới 10%.
6. Giới hạn cổng 5432 bằng Windows Firewall cho đúng máy quản trị/ứng dụng; không mở toàn LAN nếu không cần.
7. Lên lịch import và xử lý kỳ ngoài giờ sử dụng cao điểm.
8. Bật HTTPS nội bộ trước khi đưa dữ liệu nhạy cảm vào sử dụng rộng rãi; không gửi token/CCCD/tài khoản qua HTTP trên mạng không kiểm soát.
9. Chuyển quy trình chạy lại kỳ sang mô hình staging + kiểm định + thay thế nguyên tử, để job lỗi không làm mất kết quả kỳ đang phục vụ.
10. Kiểm thử phục hồi cả database và thư mục file bổ sung trên một máy khác, không chỉ kiểm tra việc tạo được file backup.

### 10.2. Cấu hình đề xuất tối thiểu cho production nội bộ

| Thành phần | Khuyến nghị |
|---|---|
| CPU | Tối thiểu 8 nhân thực; ưu tiên CPU máy chủ/desktop hiệu năng ổn định |
| RAM | Tối thiểu 32 GB; khuyến nghị 64 GB nếu có khoảng 100 người dùng và xử lý GL02/FTPLN |
| Ổ hệ điều hành | SSD 200–250 GB, luôn giữ trên 20% trống |
| Ổ database | NVMe tối thiểu 1 TB; nên có RAID1/mirror nếu thiết bị hỗ trợ |
| Ổ backup | Tách khỏi ổ database, tối thiểu 1 TB hoặc NAS nội bộ |
| Mạng | IP tĩnh, LAN Gigabit, DNS nội bộ, firewall giới hạn cổng |
| Nguồn điện | UPS và cấu hình tự khởi động dịch vụ sau mất điện |

Kích thước cuối cùng phải được chốt sau khi đo tốc độ tăng dữ liệu ít nhất 3 kỳ liên tiếp và chạy load test theo số người dùng thực tế.

### 10.3. Chính sách lưu trữ đề xuất

- Giữ dữ liệu tổng hợp online lâu hơn dữ liệu giao dịch raw dung lượng lớn.
- Với GL02/FTPLN, cân nhắc partition theo tháng và chính sách archive kỳ cũ sang kho lạnh.
- Không xóa dữ liệu chỉ để giảm dung lượng nếu chưa có backup và biên bản lưu trữ.
- Chạy `VACUUM/ANALYZE` theo lịch; chỉ compact Docker VHDX sau khi đã reclaim trong PostgreSQL/Docker và có backup.
- Backup theo nguyên tắc 3-2-1 nếu dữ liệu được coi là production: 3 bản, 2 loại thiết bị, 1 bản tách khỏi máy chủ.
- Bản ghi đã parse của Bill Payment/Bảo lãnh/OAB nằm trong PostgreSQL, nhưng file gốc vẫn cần được lưu trên vùng dùng chung/backup cùng database để có thể chạy lại và kiểm toán nguồn.

## 11. Điểm yếu dữ liệu và nghiệp vụ cần báo cáo minh bạch

1. Kết quả là dữ liệu theo kỳ/file, không phải số realtime trực tiếp từ hệ thống lõi.
2. Độ chính xác phụ thuộc tính đầy đủ, đúng cột, đúng kỳ và đúng phạm vi của file nguồn.
3. Tháng 08/2026 hiện đã đủ CN05 nhưng còn thiếu BC06, FTPLN và GL02; chưa có hồ sơ C360 đã xử lý và chưa nên dùng làm kỳ báo cáo hoàn chỉnh.
4. FTPLN đã có kho và kiểm tra đủ ngày nhưng chưa chốt toàn bộ KPI gốc/lãi phải thu trên hồ sơ.
5. `SO_TRICH_LAP_TRONG_KY` của BC29 đang được dùng như giá trị lũy kế cuối kỳ theo yêu cầu nghiệp vụ; cần văn bản xác nhận từ chủ nguồn.
6. Một số đầu mã tài khoản/dịch vụ có thể thay đổi; phải cập nhật cấu hình và kiểm thử đối soát trước khi chạy kỳ mới.
7. Khách hàng không khớp CIF vẫn giữ ở kho nguồn nhưng không đi vào chỉ tiêu C360 cho tới khi được đối chiếu.
8. Khi Kho CIF thay đổi, các kỳ đã xử lý không tự cập nhật tức thời; cần chạy lại kỳ.
9. Số âm của phí hoặc biến động DPRR có thể là hoàn/điều chỉnh, không mặc định là lỗi dữ liệu.
10. So sánh hai kỳ chỉ có ý nghĩa khi hai kỳ có cùng phạm vi chi nhánh và mức độ đầy đủ nguồn tương đương.
11. Quy trình xử lý lại hiện commit theo nhiều chặng sau khi xóa kết quả cũ; job lỗi giữa chừng có thể làm kỳ tạm thời không phục vụ đủ dữ liệu.
12. 370 tài khoản đang hoạt động nhưng mới có rất ít quyền ngoại lệ cấp trực tiếp; cần rà soát định kỳ nhóm quyền, phạm vi và user đã chuyển đơn vị/nghỉ công tác thay vì coi cấu hình hiện tại là đúng vĩnh viễn.
13. Danh sách ghim và API mở nhanh một KH vẫn tuân theo phạm vi hiện tại. KH đã ghim có thể không mở được sau khi quyền/phạm vi của user bị thu hẹp; đây là hành vi bảo mật đúng, không phải mất dữ liệu ghim.
14. Xuất Excel chạy nền ở góc giao diện nhưng việc tạo workbook vẫn tiêu thụ CPU/RAM backend; nhiều người xuất tập lớn cùng lúc cần được load test và giới hạn nếu cần.

## 12. Lộ trình ưu tiên đề xuất

### Giai đoạn 1 – Bảo đảm an toàn vận hành

- Mở rộng ổ đĩa, chuyển Docker data, thiết lập backup/restore và cảnh báo dung lượng.
- Rà firewall, tài khoản DB, secret, HTTPS và quyền truy cập LAN.
- Chốt lịch import/xử lý, người chịu trách nhiệm và quy trình xử lý job lỗi.
- Thực hiện staging/swap an toàn khi xử lý lại kỳ để giữ được kết quả cũ nếu job mới thất bại.

### Giai đoạn 2 – Chốt chất lượng dữ liệu

- Hoàn thiện nguồn tháng 08/2026.
- Chạy lại các kỳ cần dùng theo Kho CIF mới.
- Xử lý danh sách chưa khớp CIF và các trường cán bộ/phòng ban chưa xác định.
- Xác nhận nghiệp vụ FTPLN, BC29 và danh mục tài khoản phí.
- Rà soát 370 user theo đơn vị, nhóm quyền, phạm vi dữ liệu, quyền nhạy cảm và phiên đang hoạt động; xuất biên bản rà soát định kỳ.

### Giai đoạn 3 – Tối ưu production

- Partition các bảng GL02, KH02, FTPLN theo kỳ.
- Tạo bảng tổng hợp/materialized summary cho Dashboard thay vì quét raw.
- Chạy load test theo 20/50/100 người dùng và đo thời gian phản hồi.
- Tách worker xử lý khỏi API nếu tài nguyên cho phép.
- Tách worker xuất Excel khỏi API hoặc giới hạn hàng đợi khi số người dùng tăng.
- Chuẩn hóa gói triển khai offline và quy trình cập nhật khi máy chủ không có Internet.

## 13. Kết luận

C360 đã có nền tảng nghiệp vụ tương đối đầy đủ: Kho CIF, 11 nguồn định kỳ, xử lý khách hàng đa chi nhánh, Dashboard, phân tích nghiệp vụ, hồ sơ C360, đối chiếu, xuất báo cáo, quản lý phiên và phân quyền chi tiết. Điểm cần ưu tiên nhất trước khi vận hành production không phải bổ sung thêm giao diện mà là:

1. **Bảo đảm dung lượng và backup**, vì cả ổ C và D đều đang ở mức thấp.
2. **Nâng cấu hình máy chủ**, do database đã khoảng 31 GB và GL02 tăng nhanh.
3. **Chốt độ đầy đủ nguồn và công thức**, nhất là các kỳ chưa đủ dữ liệu.
4. **Làm an toàn quy trình xử lý lại kỳ**, tránh mất kết quả đang phục vụ nếu job mới lỗi.
5. **Kiểm thử tải, bảo mật đường truyền và phục hồi**, trước khi cam kết phục vụ số lượng lớn người dùng.

Nếu hoàn thành năm nhóm việc trên, hệ thống có thể chuyển từ trạng thái demo/kiểm thử nghiệp vụ sang vận hành nội bộ ổn định và có khả năng giải trình số liệu tốt hơn.

---

## Phụ lục – Bảng DB chính

| Bảng | Vai trò |
|---|---|
| `cif_customers` | Một master cho mỗi mã KH lõi |
| `cif_customer_identifiers` | Các CUSTNO/quan hệ chi nhánh của khách hàng |
| `cif_source_records` | Bản ghi CIF raw và lịch sử nguồn |
| `import_files`, `import_batches` | Quản lý file và kỳ import |
| `dp01_deposit_accounts` | DP01 |
| `ln01_loans` | LN01 |
| `pf10_loan_profitability` | PF10 |
| `pf14_account_balances` | PF14 |
| `cn05_customer_services` | CN05 |
| `bc06_customer_classifications` | BC06 |
| `bc29_customer_credit_risks` | BC29 |
| `kh02_customer_transactions` | KH02 |
| `ftpln_daily_loan_ftp` | FTPLN |
| `rr01_handled_risk_loans` | RR01 |
| `gl02_ledger_transactions` | GL02 |
| `supplemental_billpayment_transactions` | Bill Payment đã đọc từ file bổ sung |
| `customer_processing_optional_files` | Đăng ký file bổ sung, đường dẫn file gốc và trạng thái đọc |
| `supplemental_bao_lanh_records`, `supplemental_oab_records` | Bảo lãnh/LC và OAB đã chuẩn hóa |
| `customer_period_exchange_rates` | Tỷ giá theo kỳ và loại tiền, nguồn DP01 |
| `customer_period_branch_details` | Kết quả KH theo chi nhánh và kỳ |
| `customer_period_profiles` | Hồ sơ duy nhất theo mã KH lõi và kỳ |
| `customer_source_reconciliations` | Mã nguồn chưa khớp CIF |
| `profile_metric_definitions` | Từ điển chỉ tiêu |
| `business_matching_rules` | Mã dịch vụ và điều kiện đối chiếu |
| `system_configuration_entries` | Cấu hình nghiệp vụ |
| `system_users`, `system_roles`, `system_permissions` | Người dùng, nhóm quyền và danh mục quyền |
| `system_role_permissions`, `system_user_permissions` | Quyền theo nhóm và ngoại lệ ALLOW/DENY từng user |
| `role_scope_policies` | Phạm vi mặc định/được phép theo nhóm quyền |
| `user_sessions` | Phiên đăng nhập, thiết bị, IP, hoạt động cuối và trạng thái thu hồi |
| `user_pinned_customers` | Danh sách KH ghim riêng của từng người dùng |
| `audit_logs` | Nhật ký thao tác |
