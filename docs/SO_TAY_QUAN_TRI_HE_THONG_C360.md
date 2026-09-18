# Sổ tay quản trị hệ thống C360

> Phiên bản tài liệu: 17/09/2026. Dành cho quản trị viên ứng dụng và người vận hành dữ liệu. Tài liệu mô tả **luồng hiện có trong mã nguồn**, không thay thế quy trình phê duyệt nội bộ hoặc hướng dẫn hạ tầng của đơn vị.

## 1. Bức tranh toàn hệ thống

```text
Người dùng LAN → Nginx/React → API FastAPI → PostgreSQL
                                   ├─ Redis: cache phiên phân tích, không phải nguồn dữ liệu gốc
                                   └─ Job nền: import CIF, import nguồn, xử lý KH

Kho CIF (khách hàng nền, không theo tháng)
     + file nguồn theo kỳ, chi nhánh
     → kiểm tra nguồn → xử lý KH → hồ sơ KH theo kỳ và theo chi nhánh
     → đối chiếu/chất lượng → Dashboard, danh sách KH, phân tích nghiệp vụ
```

PostgreSQL giữ dữ liệu nghiệp vụ, cấu hình, người dùng, job và nhật ký. CIF xác định tập khách hàng khi **xử lý kỳ**; import DP01 hay nguồn khác không tự tạo/cập nhật khách hàng CIF. Nguồn không khớp CIF vẫn được giữ trong kho nguồn và được ghi vào **Đối chiếu CIF** khi xử lý. Một mã KH lõi có thể có nhiều mã CIF đầy đủ tại các chi nhánh; hồ sơ tổng hợp theo mã lõi, chi tiết vẫn tách theo chi nhánh.

Đường dẫn kỹ thuật: [README](../README.md), [triển khai Docker LAN offline](TRIEN_KHAI_DOCKER_LAN_OFFLINE_WINDOWS.md), [CI/CD Windows](TRIEN_KHAI_CICD_WINDOWS.md), [từ điển số liệu](TU_DIEN_DU_LIEU_BAO_CAO.md). Một số tài liệu phân tích cũ còn ghi DP01 là tập KH nền hoặc chỉ có bốn nguồn bắt buộc; **không dùng nhận định đó để vận hành phiên bản hiện tại**.

## 2. Thứ tự triển khai/vận hành từ đầu đến cuối

| Bước | Người phụ trách | Thao tác trong C360 | Kết quả cần kiểm tra |
|---|---|---|---|
| 1 | Quản trị hạ tầng | Khởi động Docker, kiểm tra API/DB/Redis, migration, dung lượng và backup | Các container `healthy`; truy cập được từ máy người dùng |
| 2 | Quản trị hệ thống | Chuẩn hóa **Chi nhánh → Phòng ban → Nhóm quyền → Người dùng** | Mã đơn vị, cán bộ và phạm vi dữ liệu đúng |
| 3 | Quản trị dữ liệu | Import **Kho dữ liệu CIF**; xem lịch sử, bản ghi chờ duyệt và xung đột | CIF nền có bản ghi hợp lệ, các thay đổi đã được xử lý |
| 4 | Quản trị dữ liệu | Import nguồn theo kỳ tại **Kho dữ liệu** | File đúng loại/kỳ/chi nhánh; job thành công hoặc lỗi có lý do |
| 5 | Quản trị dữ liệu | Xem **Giám sát nguồn dữ liệu** và độ sẵn sàng theo chi nhánh | Biết chính xác file/ngày còn thiếu hoặc job kẹt |
| 6 | Người có quyền xử lý | Chạy **Xử lý dữ liệu KH** cho kỳ đã chọn | Job thành công; số KH, chất lượng và cảnh báo xử lý hợp lý |
| 7 | Người rà soát | Xem **Đối chiếu CIF**, xuất Excel, cập nhật trạng thái rà soát | Nguồn không khớp được giải thích và theo dõi, không âm thầm bỏ qua |
| 8 | Người dùng nghiệp vụ | Chọn bộ lọc chung, bấm **Xem dữ liệu**, khai thác các trang | Các số liệu cùng kỳ/phạm vi; bảng và hồ sơ chi tiết có thể mở |
| 9 | Quản trị/kiểm soát | Xem nhật ký, tình trạng phiên, backup; rà soát quyền định kỳ | Biết ai đã làm gì, có thể khôi phục khi xảy ra sự cố |

Nếu CIF hoặc nguồn của kỳ được cập nhật sau lần xử lý thành công, trang **Xử lý dữ liệu KH** có cảnh báo cần chạy lại. Import vào kho chỉ lưu nguồn; **không** tự tính lại hồ sơ và Dashboard. Trước khi công bố số liệu, chạy lại kỳ bị đánh dấu và đối chiếu kết quả.

## 3. Khởi động, kiểm tra và bảo vệ dữ liệu

Trên máy chủ Windows, vào thư mục dự án bằng PowerShell. Với cấu hình Docker thông thường:

```powershell
docker compose ps
docker compose logs --tail 100 backend
docker compose logs --tail 100 postgres
docker compose exec backend alembic current
Invoke-RestMethod http://localhost/api/health
```

Với mạng nội bộ không Internet, dùng quy trình và script trong [TRIEN_KHAI_DOCKER_LAN_OFFLINE_WINDOWS.md](TRIEN_KHAI_DOCKER_LAN_OFFLINE_WINDOWS.md); máy người dùng truy cập tên miền/IP LAN đã cấu hình, **không dùng `localhost` trên máy trạm**. Kiểm tra đồng thời DNS, cổng 80, frontend, API và PostgreSQL.

Trước nâng cấp có migration, xóa dữ liệu theo kỳ hoặc di chuyển máy chủ: tạo backup PostgreSQL, kiểm tra file backup đã tồn tại và lưu ở vị trí khác volume DB. Tham khảo [hướng dẫn triển khai máy khác](TRIEN_KHAI_DOCKER_MAY_KHAC.md) và [CI/CD](TRIEN_KHAI_CICD_WINDOWS.md). Không đưa `.env`, file CIF/nguồn, dữ liệu KH hay bản backup lên Git. Không dùng `docker compose down -v`, xóa volume, hay `alembic downgrade` trên DB thật như một cách sửa lỗi nhanh.

## 4. Quản trị tổ chức, tài khoản và quyền

### 4.1. Thiết lập đúng thứ tự

1. **Chi nhánh:** khai báo mã/tên/cấp đơn vị; 2600 là Hội sở, các chi nhánh loại II trực thuộc được quản lý riêng.
2. **Phòng ban/PGD:** gắn đúng chi nhánh, mã phòng và trạng thái. Danh mục này là cơ sở lọc phòng ban; không tạo tên đơn vị giả từ dữ liệu nguồn.
3. **Nhóm quyền:** xem dạng ma trận hoặc danh sách, rà quyền theo chức năng và phạm vi mặc định/được phép.
4. **Người dùng:** gán chi nhánh, phòng ban, mã nhân viên, mã CBTD nếu có, nhóm quyền và phạm vi. Mã KH/CIF gắn với cán bộ (nếu được cấu hình) dùng cho logic phân công KH, không phải mật khẩu hay quyền truy cập.
5. Dùng **Kiểm tra quyền thực tế** để thử một người dùng, một quyền và một phạm vi trước khi bàn giao tài khoản.

Năm nhóm mặc định là `ADMIN`, `HEAD_OFFICE_LEADER`, `BRANCH_MANAGER`, `DEPARTMENT_MANAGER`, `USER`. Phạm vi dữ liệu hiện có: **toàn tỉnh**, **chi nhánh**, **phòng ban**, **KH được phân công**. Nhóm quyết định chức năng được dùng; phạm vi quyết định phần dữ liệu người đó được xem. Một nút/menu bị ẩn hoặc API trả 403 có thể do thiếu quyền chức năng, quyền chi tiết nhạy cảm hoặc phạm vi không cho phép.

Quyền hiệu lực được tính từ quyền nhóm cộng quyền cấp riêng (**ALLOW**) rồi trừ quyền bị từ chối (**DENY**); DENY được ưu tiên và có thể làm vô hiệu quyền phụ thuộc. Quyền xem CCCD/MST, liên hệ, tài khoản, giao dịch, LDS và sao chép dữ liệu nhạy cảm được tách riêng. Chỉ cấp đúng nhu cầu công việc; một số quyền rủi ro cao cần siêu quản trị thao tác. Cấu hình quyền mới có thể kết thúc phiên hiện tại của người dùng để buộc đăng nhập lại.

### 4.2. Tạo, sửa và xử lý tài khoản

- **Tạo người dùng:** nhập các thông tin nhận diện/đơn vị, chọn nhóm và phạm vi, đặt mật khẩu tạm. Người dùng phải đổi mật khẩu ở lần đăng nhập đầu.
- **Sửa đơn vị hoặc quyền:** kiểm tra chi nhánh–phòng ban khớp nhau và quyền thực tế sau lưu; báo người dùng đăng nhập lại nếu phiên bị thu hồi.
- **Reset mật khẩu:** đặt mật khẩu tạm qua màn hình quản trị; người dùng đổi mật khẩu sau đăng nhập. Không gửi mật khẩu qua kênh công khai.
- **Khóa/mở khóa thủ công:** khác với tạm khóa do nhập sai. Tài khoản bị tạm khóa sau 5 lần sai trong 15 phút; quản trị có nút mở tạm khóa riêng. Tài khoản ADMIN không áp dụng giới hạn đăng nhập sai này.
- **Phiên đăng nhập:** tài khoản thường chỉ có một phiên; đăng nhập trên máy thứ hai sẽ chấm dứt phiên trước. Quản trị có thể xem/thu hồi phiên. Phiên không hoạt động 30 phút sẽ hết hiệu lực (theo cấu hình mặc định).

### 4.3. Thao tác nhiều người dùng cùng lúc

Tại **Quản trị hệ thống → Người dùng**: lọc danh sách → chọn từng dòng hoặc **Chọn tất cả kết quả** (tối đa 500 người/lô) → **Thao tác hàng loạt** → chọn hành động/quyền/nhóm/phạm vi → **Xem trước** từng người → chỉ bấm **Áp dụng** khi không có dòng lỗi. Các hành động hiện có: cấp quyền, từ chối quyền, gỡ ngoại lệ, gán nhóm, đổi phạm vi, khóa, mở khóa và buộc đăng nhập lại. Không thao tác hàng loạt trên chính tài khoản đang dùng hoặc tài khoản `ADMIN`/siêu quản trị. Một dòng không hợp lệ làm **toàn lô không được ghi**. Nhật ký ghi từng người và mã lô chung để truy vết.

### 4.4. Rà soát định kỳ

Hằng tháng hoặc khi chuyển công tác: tìm tài khoản nghỉ/chuyển đơn vị, quyền cấp riêng/DENY, người dùng có phạm vi rộng, quyền nhạy cảm, người có đồng thời quyền import và duyệt đối chiếu, các phiên lạ, danh sách cảnh báo cấu hình người dùng. Dùng **Kiểm tra quyền thực tế**, không suy đoán chỉ từ tên nhóm. Tránh cho cùng một người vừa nhập/sửa nguồn vừa tự xác nhận đối chiếu nếu quy trình đơn vị yêu cầu tách nhiệm vụ.

## 5. Kho CIF: tập khách hàng nền

Vào **Quản trị dữ liệu → Kho dữ liệu CIF**. Các tab hiện có: **Tổng quan, Import CIF, Danh sách khách hàng, Duyệt thay đổi, Đối chiếu & xung đột, Lịch sử cập nhật**.

1. Chọn một hoặc nhiều file CIF CSV/XLS/XLSX đúng cấu trúc; file có thể chứa nhiều chi nhánh.
2. Theo dõi trạng thái import từng file/job đến khi hoàn tất; nếu lỗi, mở lịch sử để xem bước và lý do.
3. Kiểm tra số KH lõi, số mã CIF, dữ liệu thiếu định danh và KH đa chi nhánh.
4. Mã `CUSTNO` trùng sau lần đầu được bỏ qua, không tự ghi đè. Nếu bản ghi đã tồn tại nhưng có trường thay đổi, mở **Duyệt thay đổi**, so sánh giá trị cũ/mới, chọn trường cần áp dụng hoặc từ chối. Hành động được ghi thời gian và người thực hiện.
5. Xem **Đối chiếu & xung đột**, xuất Excel nếu cần điều tra. Không sửa trực tiếp DB để “cho khớp” khi chưa xác định nguồn đúng.
6. Sau khi duyệt thay đổi CIF, rà các kỳ có cảnh báo **cần chạy lại xử lý**.

## 6. Kho nguồn theo kỳ và giám sát

**Kho dữ liệu** nhận DP01, LN01, CN05, PF10, PF14, BC06, BC29, KH02, FTPLN, RR01, GL02 với quy tắc tên tương ứng. Ví dụ `2600_DP01_20260731.csv`, `2600_RR01_20260731.csv`, `2600_GL02_2026070120260731.csv`. KH02/GL02 là khoảng ngày tháng; FTPLN là file theo ngày; BC06 có hậu tố theo cấu trúc riêng. Kiểm tra mẫu tên trong màn hình import trước khi tải. File Bill Payment và nguồn bổ sung khác được đính vào **Xử lý dữ liệu KH → Thêm file bổ sung cho kỳ** nếu đúng loại màn hình hỗ trợ; không đổi tên tùy ý để ép vào nguồn chuẩn.

Quy trình import:

1. Chọn đúng kỳ và file. Kiểm tra loại nguồn, chi nhánh, phần mở rộng và quy tắc tên; CSV/XLSX là định dạng thông thường của kho nguồn.
2. Xem cảnh báo trùng/thay thế trước khi xác nhận. Không thay thế file cũ khi chưa biết kỳ đó đã xử lý và báo cáo hay chưa.
3. Theo dõi trạng thái **chờ → đang xử lý → thành công/lỗi**, số dòng hợp lệ/lỗi và thông báo lỗi.
4. Trong **Giám sát nguồn dữ liệu**, xem ma trận theo chi nhánh; FTPLN cho biết ngày còn thiếu, GL02/RR01 có kiểm tra đặc thù. “Có file” không đồng nghĩa “đủ toàn bộ phạm vi”.
5. Khi file thay thế hoặc mới được thêm vào kỳ đã xử lý, ghi nhận kỳ **cần chạy lại**. Không coi Dashboard cũ là số liệu mới.

Danh sách nguồn **bắt buộc chuẩn** trong mã xử lý hiện tại là DP01, LN01, CN05, PF10, PF14, BC06, BC29, KH02, FTPLN. RR01 và GL02 được giám sát/khai thác riêng nhưng không nằm trong hằng số bắt buộc đó. Độ sẵn sàng tính cả nguồn–chi nhánh; FTPLN cần kiểm tra đủ ngày. Chỉ xử lý khi đầu vào đạt yêu cầu; các tùy chọn bỏ qua nguồn thiếu/FTPLN là ngoại lệ kỹ thuật, không phải quy trình mặc định để công bố báo cáo.

## 7. Xử lý KH, đối chiếu và công bố số liệu

1. Vào **Xử lý dữ liệu KH**, chọn dòng kỳ. Xem nguồn bắt buộc, phạm vi chi nhánh, file bổ sung, tỷ giá và cảnh báo CIF/nguồn đã thay đổi.
2. Khi kỳ sẵn sàng, bấm **Chạy xử lý dữ liệu**. Job chạy nền; có thể chuyển tab nhưng phải quay lại xem kết quả. Nếu lỗi hoặc nghi bị kẹt, đọc trạng thái/thời gian cập nhật trước khi dùng **Chạy lại job kẹt**; không tạo nhiều job trùng kỳ.
3. Sau thành công, kiểm tra số KH đã xử lý, hồ sơ theo chi nhánh, chất lượng, đối soát chỉ tiêu và **Đối chiếu CIF**. Mã KH không khớp CIF được liệt kê cùng nguồn/lý do; có thể xuất Excel và đánh dấu đã rà soát/đã xử lý/bỏ qua theo thực tế.
4. Kiểm tra KPI trọng yếu bằng hồ sơ mẫu, số liệu chi nhánh, kỳ trước và công thức trong **Từ điển & mapping**. Cùng một KH đa chi nhánh: số tổng toàn quan hệ và số theo từng chi nhánh là hai phạm vi khác nhau.
5. Chỉ thông báo kỳ đã sẵn sàng cho người dùng khi job thành công, các nguồn quan trọng đủ/ngoại lệ được ghi nhận và chênh lệch lớn đã được giải thích.

Xử lý lại kỳ là cập nhật kết quả của kỳ đó theo dữ liệu nguồn/CIF đang có, **không** tạo thêm một “tháng mới”. Vì vậy phải giữ nguyên file nguồn và nhật ký, backup trước các thay đổi lớn. Khi nguồn thiếu hoặc chưa khớp, không tự điền số 0 vào báo cáo như thể đã xác nhận là không phát sinh.

## 8. Cấu hình, nhật ký và xử lý sự cố

**Quản trị hệ thống → Cấu hình hệ thống** có quy tắc nhận diện sản phẩm/dịch vụ (ví dụ Bill Payment), cấu hình tài khoản/công thức và danh mục nghiệp vụ. Màn hình cho phép sửa quy tắc và lưu cấu hình trong DB, nhưng **không phải mọi công thức cũ đã chuyển khỏi mã nguồn**. Trước khi sửa mã dịch vụ, ngưỡng tiền hoặc tài khoản cân đối: ghi lại cấu hình cũ, kỳ hiệu lực, người phê duyệt; thử một kỳ/mẫu KH; chạy lại kỳ liên quan nếu logic chỉ áp dụng ở bước xử lý. Không sửa cấu hình chỉ để một con số đơn lẻ “khớp”.

**Nhật ký thao tác** dùng để tra ai đã sửa tài khoản, vai trò, cấu hình hoặc dữ liệu, thời điểm và giá trị trước/sau. Với phân quyền hàng loạt, dùng mã lô để nối các bản ghi. Dữ liệu nhạy cảm phải được xử lý theo chính sách bảo mật của đơn vị; không gửi file Excel KH hoặc ảnh màn hình có CCCD/STK qua kênh không được phép.

| Triệu chứng | Kiểm tra đầu tiên | Cách xử lý an toàn |
|---|---|---|
| Máy trạm không mở được C360 | DNS, IP LAN, cổng 80, `docker compose ps` | Theo tài liệu LAN offline; không sửa URL frontend thành `localhost` |
| Backend/API lỗi | Health check, log backend, DB/Redis, migration | Xác định nguyên nhân; không xóa volume/DB |
| Import dừng/lỗi | Tên file, định dạng, trạng thái job, số dòng lỗi, ổ đĩa | Sửa file nguồn hoặc chạy phục hồi theo chức năng; tránh tải trùng |
| Kỳ báo thiếu nguồn | Ma trận chi nhánh, FTPLN ngày thiếu, trạng thái thành công | Bổ sung đúng file rồi chạy xử lý lại nếu cần |
| Dashboard chưa đổi sau import | Cảnh báo `needs_reprocess`, job gần nhất | Chạy lại kỳ và đối soát, không chỉ tải lại trình duyệt |
| KH không thấy trong hồ sơ | Kho CIF, mã lõi, đối chiếu CIF, phạm vi quyền | Rà nguồn và CIF; không tự tạo hồ sơ ngoài quy trình |
| Người dùng không thấy menu/số liệu | Quyền nhóm, ALLOW/DENY, phạm vi, trạng thái phiên | Kiểm tra quyền thực tế; nếu quyền vừa đổi, đăng nhập lại |
| Chậm/hết dung lượng | Dung lượng host/volume, job, log, backup, tải đồng thời | Lập kế hoạch dọn dẹp/di chuyển và backup; không xóa thủ công dữ liệu DB |

## 9. Checklist ngắn trước khi bàn giao kỳ

- [ ] Hạ tầng và backup kiểm tra được; còn đủ dung lượng cho import, DB và backup.
- [ ] Danh mục chi nhánh/phòng ban và người dùng đúng; quyền nhạy cảm được rà soát.
- [ ] CIF nền import thành công; xung đột/bản ghi chờ duyệt đã xử lý hoặc có ghi chú.
- [ ] Nguồn theo kỳ/chi nhánh đúng và job import hoàn tất; ngày FTPLN thiếu được xác định.
- [ ] Job xử lý KH thành công sau lần cập nhật nguồn/CIF mới nhất.
- [ ] Đối chiếu CIF, số KH, tiền gửi, dư nợ, phí và chênh lệch trọng yếu đã được rà soát.
- [ ] Người dùng thử một tài khoản đúng phạm vi; Dashboard, danh sách KH và chi tiết cùng kỳ.
- [ ] Ghi lại ngoại lệ, người xác nhận và thời điểm chốt dữ liệu.
