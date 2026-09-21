# MA TRẬN PHÂN QUYỀN VÀ BẢO MẬT C360

- **Mã tài liệu:** C360-SEC-05
- **Phiên bản:** 1.0
- **Ngày cập nhật:** 21/09/2026
- **Phân loại:** Nội bộ – mô tả cơ chế truy cập dữ liệu khách hàng

## 1. Mục tiêu

C360 áp dụng đồng thời:

- **RBAC:** quyền chức năng theo nhóm quyền.
- **Data scope:** phạm vi dữ liệu theo tổ chức/cán bộ.
- **Quyền cấp thêm/từ chối riêng:** ngoại lệ theo từng user.
- **Field-level permission:** tách dữ liệu nhận diện, liên hệ, tài khoản, giao dịch và khoản vay.
- **Session control:** một phiên cho user thường, timeout không hoạt động, thu hồi khi thay đổi quyền.
- **Audit:** ghi nhận thay đổi quyền, cấu hình và thao tác quản trị.

Có quyền mở màn hình không đồng nghĩa được xem mọi chi nhánh, mọi trường nhạy cảm hoặc được xuất dữ liệu.

## 2. Cấu trúc tổ chức

```text
Hội sở 2600
├─ Các phòng/ban thuộc Hội sở
└─ Chi nhánh loại II 2602, 2604, 2606, 2607, 2608, 2609...
   ├─ Phòng nghiệp vụ
   └─ Phòng giao dịch
      └─ Cán bộ quản lý khách hàng
```

Danh mục chi nhánh, phòng ban và user là nguồn chuẩn cho bộ lọc và phân quyền. Đơn vị/cán bộ không tồn tại hoặc ngừng hoạt động trong danh mục không được tự xuất hiện chỉ vì có tên trong file nguồn.

## 3. Năm nhóm quyền chuẩn

| Mã | Tên | Phạm vi mặc định | Phạm vi cho phép |
|---|---|---|---|
| `ADMIN` | Quản trị hệ thống | `province` | `province` |
| `HEAD_OFFICE_LEADER` | Lãnh đạo Hội sở | `province` | `province` |
| `BRANCH_MANAGER` | Lãnh đạo chi nhánh loại II | `branch` | `branch` |
| `DEPARTMENT_MANAGER` | Lãnh đạo phòng/PGD | `department` | `department` |
| `USER` | Cán bộ quản lý khách hàng | `own` | `own`, `department` |

`ADMIN` toàn quyền kỹ thuật nhưng vẫn phải dùng tài khoản cá nhân quản trị khi triển khai production; không dùng chung một mật khẩu giữa nhiều người.

## 4. Ý nghĩa phạm vi dữ liệu

| Scope | Dữ liệu được xem |
|---|---|
| `province` | Toàn bộ chi nhánh trong hệ thống |
| `branch` | Chi nhánh gắn với user và các phòng thuộc chi nhánh đó |
| `department` | Phòng/PGD gắn với user |
| `own` | Khách hàng được xác định do chính cán bộ quản lý |

Điều kiện bắt buộc:

- Scope khác `province` cần có chi nhánh hợp lệ.
- `department` và `own` cần có phòng ban hợp lệ.
- `own` cần có mã nhân viên/CBTD đủ để đối chiếu.
- Nhóm lãnh đạo chi nhánh loại II chỉ gắn chi nhánh `LEVEL_2`.
- Nhóm lãnh đạo Hội sở phải thuộc mô hình Hội sở 2600 theo quy định tổ chức.

## 5. Công thức quyền hiệu lực

```text
Quyền hiệu lực = (Quyền của nhóm ∪ Quyền cấp thêm) − Quyền từ chối
```

Quyền từ chối có ưu tiên cao hơn quyền cho phép. Nếu từ chối quyền cha, các quyền con phụ thuộc cũng mất hiệu lực. Ví dụ từ chối `customer:profile:view` đồng thời làm mất quyền xem tiền gửi, tín dụng và các trường nhạy cảm phụ thuộc hồ sơ.

Nguyên tắc sử dụng ngoại lệ:

- Cấp thêm chỉ khi một user thực sự cần chức năng ngoài vai trò chuẩn.
- Từ chối dùng để thu hẹp rủi ro mà không phải tạo nhóm quyền mới.
- Nếu nhiều user có cùng ngoại lệ lâu dài, cập nhật nhóm quyền hoặc tạo nhóm mới thay vì cấp riêng hàng loạt.
- Mọi thay đổi phải preview tác động trước khi áp dụng hàng loạt.

## 6. Ma trận quyền chức năng mặc định

Ký hiệu: `X` là có mặc định; `–` là không có mặc định. Quyền thực tế còn phụ thuộc quyền cấp thêm/từ chối và phạm vi.

| Nhóm chức năng | ADMIN | LĐ Hội sở | LĐ CN II | LĐ phòng/PGD | Cán bộ |
|---|:---:|:---:|:---:|:---:|:---:|
| Xem Dashboard | X | X | X | X | X |
| Drill-down KPI | X | X | X | X | X |
| Xuất Dashboard | X | X | X | X | – |
| Xem danh sách/hồ sơ KH | X | X | X | X | X |
| Xem tiền gửi, tín dụng, thu nhập | X | X | X | X | X |
| Xuất danh sách KH | X | X | X | X | – |
| Xem phân tích nghiệp vụ | X | X | X | X | X |
| Xuất phân tích | X | X | X | X | – |
| Kho dữ liệu/CIF/xử lý/đối chiếu | X | – | – | – | – |
| Quản trị tổ chức, user, nhóm quyền | X | – | – | – | – |
| Cấu hình nghiệp vụ và audit | X | – | – | – | – |

Ma trận trên phản ánh bộ seed mặc định. Database là nguồn chuẩn sau lần cấu hình đầu; backend restart không được ghi đè nhóm quyền người quản trị đã chỉnh.

## 7. Danh mục quyền chi tiết

### 7.1. Tổng quan và khách hàng

| Quyền | Ý nghĩa | Phụ thuộc |
|---|---|---|
| `dashboard:view` | Xem Dashboard | – |
| `dashboard:drilldown` | Xem danh sách tạo KPI | `dashboard:view` |
| `dashboard:export` | Xuất dữ liệu Dashboard | `dashboard:view` |
| `dashboard:health` | Xem trạng thái hệ thống | – |
| `customer:view` | Xem danh sách KH | – |
| `customer:profile:view` | Mở hồ sơ KH | `customer:view` |
| `customer:deposit:view` | Xem tiền gửi | `customer:profile:view` |
| `customer:credit:view` | Xem tiền vay/rủi ro | `customer:profile:view` |
| `customer:income:view` | Xem phí/thu nhập | `customer:profile:view` |
| `customer:export` | Xuất dữ liệu KH | `customer:view` |
| `customer:view_calculation_trace` | Truy vết nguồn/công thức | `customer:profile:view` |

### 7.2. Dữ liệu nhạy cảm

| Quyền | Cho phép |
|---|---|
| `customer:sensitive:identity` | Xem đầy đủ CCCD và mã số thuế |
| `customer:sensitive:contact` | Xem đầy đủ điện thoại và địa chỉ |
| `customer:sensitive:account` | Xem đầy đủ số tài khoản/sổ tiết kiệm |
| `customer:sensitive:transaction` | Xem nội dung giao dịch |
| `customer:sensitive:loan` | Xem đầy đủ LDS và chi tiết khoản vay |
| `customer:sensitive:copy` | Sao chép trường nhạy cảm |

Quyền xem không mặc nhiên bao gồm quyền sao chép hoặc xuất. API phải che dữ liệu, không chỉ ẩn cột ở frontend.

### 7.3. Phân tích và dữ liệu

| Quyền | Ý nghĩa |
|---|---|
| `analytics:view`, `analytics:export` | Xem/xuất phân tích nghiệp vụ |
| `warehouse:view/import/replace/delete/summarize` | Xem, import, thay, xóa và tổng hợp kho nguồn |
| `cif:view/import/review/override` | Xem/import/rà soát/ghi đè Kho CIF |
| `processing:view/run/recover` | Xem/chạy/phục hồi job xử lý |
| `reconciliation:view/review` | Xem/cập nhật đối chiếu CIF |
| `mapping:view/write` | Xem/sửa từ điển, mapping, công thức |
| `report:view/summarize/export` | Xem/tổng hợp/xuất báo cáo |

`warehouse:delete`, `cif:override`, `processing:recover`, `mapping:write` là quyền rủi ro cao, không cấp đại trà.

### 7.4. Quản trị hệ thống

| Nhóm | Quyền xem | Quyền sửa |
|---|---|---|
| Chi nhánh | `admin:branch:view` | `admin:branch:write` |
| Phòng ban | `admin:department:view` | `admin:department:write` |
| Người dùng | `admin:user:view` | `admin:user:write` |
| Nhóm quyền | `admin:role:view` | `admin:role:write` |
| Cấu hình | `admin:config:view` | `admin:config:write` |
| Nhật ký | `admin:audit:view` | Không có quyền sửa nhật ký |
| Kiểm tra quyền | `admin:access_test` | Phụ thuộc `admin:user:view` |

## 8. Gợi ý tách nhiệm vụ

| Nghiệp vụ | Người đề nghị | Người thực hiện | Người kiểm tra |
|---|---|---|---|
| Tạo/sửa user | Lãnh đạo đơn vị | Quản trị user | Quản trị bảo mật/đầu mối được giao |
| Cấp quyền nhạy cảm | Quản lý nghiệp vụ | Quản trị quyền | Người phê duyệt độc lập |
| Import nguồn | Vận hành dữ liệu | Người có `warehouse:import` | Chủ nguồn |
| Xóa/thay nguồn | Chủ nguồn đề nghị | Người có quyền rủi ro cao | Quản trị dữ liệu |
| Ghi đè CIF | Người rà soát | Người có `cif:override` | Người phê duyệt |
| Sửa công thức | Nghiệp vụ phê duyệt | Quản trị cấu hình | Người đối soát độc lập |

Trong quy mô nhỏ, một người có thể kiêm nhiệm nhưng hệ thống vẫn phải ghi audit và có xác nhận sau thao tác.

## 9. Quy trình cấp mới tài khoản

1. Xác nhận danh tính, mã nhân viên, chi nhánh, phòng và chức danh.
2. Chọn một nhóm quyền gần nhất; không bắt đầu bằng ADMIN rồi thu hẹp sau.
3. Hệ thống áp dụng scope mặc định của nhóm.
4. Chỉ thêm ngoại lệ đã được phê duyệt.
5. Mật khẩu tạm do quản trị nhập; user bắt buộc đổi lần đầu.
6. Kiểm tra bằng chức năng **Kiểm tra quyền thực tế**.
7. Đăng nhập thử và xác nhận chỉ thấy đúng menu/dữ liệu.
8. Lưu yêu cầu/phê duyệt và audit.

## 10. Thay đổi hàng loạt

Khi phân quyền nhiều user:

1. Lọc đúng chi nhánh/phòng/nhóm/trạng thái.
2. Chọn user và hành động: gán nhóm, đổi scope, cấp thêm, từ chối hoặc bỏ ngoại lệ.
3. Dùng bước preview để xem user hợp lệ, user lỗi và quyền trước/sau.
4. Không áp dụng nếu còn user ngoài phạm vi dự kiến.
5. Thực hiện và xuất/lưu kết quả.
6. Các user bị thay quyền phải bị thu hồi phiên và đăng nhập lại.

## 11. Vòng đời tài khoản

### Chuyển phòng/chi nhánh

- Cập nhật tổ chức trước, sau đó scope/nhóm quyền.
- Rà quyền cấp thêm và quyền nhạy cảm.
- Thu hồi phiên hiện tại.
- Kiểm tra khách hàng cũ không còn nằm ngoài phạm vi mới.

### Nghỉ việc/không còn nhiệm vụ

- Khóa tài khoản ngay, không xóa lịch sử.
- Thu hồi toàn bộ phiên.
- Bàn giao KH ghim/danh mục nghiệp vụ theo quy định; danh sách ghim cá nhân không tự chuyển.
- Giữ audit theo thời hạn lưu trữ.

### Tạm khóa do đăng nhập sai

- Sau 5 lần sai, user thường tạm khóa 15 phút.
- ADMIN không bị giới hạn sai mật khẩu theo logic hiện tại; vì vậy tài khoản quản trị cần bảo vệ vật lý/mạng nghiêm ngặt hơn.
- Quản trị có thể mở tạm khóa sau khi xác minh người dùng; thao tác phải ghi audit.
- Khóa hành chính (`is_active = false`) khác tạm khóa và phải báo đúng nguyên nhân khi đăng nhập.

## 12. Kiểm soát phiên

- User thường chỉ được một phiên hoạt động; đăng nhập mới thu hồi phiên cũ.
- ADMIN có thể có nhiều phiên phục vụ vận hành.
- Không hoạt động quá `SESSION_IDLE_MINUTES` (mặc định 30 phút) thì phiên hết hạn.
- Đổi/reset mật khẩu, khóa tài khoản hoặc thay quyền làm `auth_version` thay đổi/thu hồi phiên; user phải đăng nhập lại.
- Phiên lưu device id, IP, user-agent, thời gian đăng nhập/hoạt động và lý do thu hồi.
- Khi dùng reverse proxy, chỉ tin `X-Forwarded-For` từ proxy đã cấu hình; không tin header do máy trạm tự gửi.

## 13. Chính sách mật khẩu

Người dùng tự đổi mật khẩu phải tuân theo policy trong `backend/app/security.py`; không chứa tài khoản/tên, không dùng danh sách mật khẩu quá phổ biến và có độ dài theo cấu hình hiện tại. Mật khẩu tạm đơn giản chỉ được dùng nếu chính sách nội bộ chấp thuận và bắt buộc đổi ngay lần đầu.

Không gửi mật khẩu qua nhóm chat đông người, không ghi vào Excel danh sách nhân sự và không lưu mật khẩu rõ trong DB/log.

## 14. Xuất dữ liệu và chống rò rỉ

- Xuất Excel phải áp dụng lại scope, bộ lọc và quyền tại backend.
- Không dựa vào dữ liệu đã ẩn trên giao diện để bảo vệ file export.
- Trường nhạy cảm bị mask nếu thiếu quyền tương ứng.
- File xuất chỉ chứa đúng mục đích nghiệp vụ; hạn chế giữ bản tải xuống trên máy cá nhân.
- Tác vụ xuất lớn chạy nền nhưng không được bỏ kiểm tra quyền khi người dùng chuyển trang.
- Ghi audit người xuất, loại báo cáo, kỳ, phạm vi và thời điểm.

## 15. Rà soát quyền định kỳ

### Hằng tháng

- User bị khóa/tạm khóa, user không đăng nhập lâu.
- User thiếu chi nhánh/phòng/nhóm quyền.
- User có scope không phù hợp nhóm.
- Quyền cấp thêm/từ chối trực tiếp.
- User có quyền nhạy cảm hoặc quyền rủi ro cao.
- Phiên bất thường, nhiều IP/thiết bị.

### Hằng quý

- Lãnh đạo từng đơn vị xác nhận lại danh sách user.
- Kiểm tra tất cả ADMIN và người có quyền sửa nhóm quyền.
- Kiểm tra quyền xuất và dữ liệu nhạy cảm.
- Kiểm tra vai trò không còn người dùng hoặc quyền không còn được sử dụng.
- Lưu biên bản rà soát và hành động khắc phục.

## 16. Cảnh báo cấu hình sai phạm vi

Một user bị cảnh báo khi xảy ra một trong các tình huống:

- Thiếu role, chi nhánh hoặc phòng bắt buộc.
- Scope không nằm trong `allowed_scopes` của role.
- Scope phòng/cá nhân nhưng user không có phòng.
- Scope cá nhân nhưng thiếu mã nhân viên/CBTD.
- Lãnh đạo CN II gắn sai cấp chi nhánh.
- Phòng ban không thuộc chi nhánh của user.

Admin phải sửa được chi nhánh/phòng/scope trong form user; không để trường bị disable khiến cảnh báo không thể khắc phục.

## 17. Audit bắt buộc

Các hành động cần lưu before/after/changed fields:

- Tạo/sửa/khóa/mở khóa/reset mật khẩu user.
- Gán role, scope, quyền thêm hoặc deny.
- Thay ma trận role và policy scope.
- Import, thay, xóa file/kỳ; phục hồi job.
- Rà soát/ghi đè CIF.
- Sửa cấu hình tài khoản, dịch vụ và công thức.
- Xuất dữ liệu nhạy cảm hoặc truy vết chi tiết nếu chính sách yêu cầu.

Nhật ký không được có mật khẩu/token và người dùng không được sửa/xóa qua giao diện.

## 18. Ma trận phê duyệt cần đơn vị chốt

| Quyền/nhóm quyền | Người đề nghị | Người phê duyệt | Chu kỳ rà soát |
|---|---|---|---|
| ADMIN | **CẦN ĐIỀN** | **CẦN ĐIỀN** | Hằng tháng |
| Dữ liệu nhạy cảm | **CẦN ĐIỀN** | **CẦN ĐIỀN** | Hằng quý |
| Xuất Excel | **CẦN ĐIỀN** | **CẦN ĐIỀN** | Hằng quý |
| Xóa/thay nguồn | **CẦN ĐIỀN** | **CẦN ĐIỀN** | Hằng tháng |
| Ghi đè CIF | **CẦN ĐIỀN** | **CẦN ĐIỀN** | Hằng tháng |
| Sửa mapping/công thức | **CẦN ĐIỀN** | **CẦN ĐIỀN** | Theo thay đổi |

## 19. Kiểm thử phân quyền trước production

Với mỗi role, cần tài khoản mẫu và kiểm tra:

- Menu nhìn thấy/không nhìn thấy.
- API gọi trực tiếp trả 403 khi thiếu quyền.
- Branch/department/own scope đúng cả dashboard, danh sách, drill-down, hồ sơ và export.
- Trường nhạy cảm được mask đúng.
- Thay quyền đang đăng nhập làm phiên bị thu hồi.
- User bị khóa nhận đúng thông báo.
- Đăng nhập máy thứ hai thu hồi phiên máy thứ nhất đối với user thường.
- Audit ghi đầy đủ người thực hiện và thay đổi.
