# TRUY VẾT CHỈ TIÊU HIỂN THỊ TRÊN GIAO DIỆN C360

- **Mã tài liệu:** C360-LIN-04
- **Phiên bản:** 1.0
- **Ngày cập nhật:** 21/09/2026
- **Đối tượng sử dụng:** Người dùng nghiệp vụ, lãnh đạo, quản trị dữ liệu, kiểm soát nội bộ và nhóm phát triển
- **Nguồn chuẩn kỹ thuật:** `backend/app/api/dashboard.py`, `backend/app/api/customer_processing.py`, `backend/app/customer_processing.py`, `backend/app/fee_rules.py`, `backend/app/models.py`, `frontend/src/c360/C360App.jsx`

> Đây là tài liệu chuẩn để trả lời câu hỏi: **“Con số hoặc thông tin đang thấy trên giao diện lấy từ đâu và được tính như thế nào?”**. Đặc tả cấu trúc file đầu vào xem tại [Đặc tả nguồn dữ liệu C360](DAC_TA_NGUON_DU_LIEU_C360.md). Khi tài liệu và chương trình khác nhau, mã nguồn đang triển khai là căn cứ kỹ thuật; sai khác phải được ghi nhận và cập nhật lại tài liệu trước khi công bố số liệu.

---

# 1. Cách đọc tài liệu

Mỗi chỉ tiêu được mô tả theo chuỗi truy vết:

```text
File nguồn và cột nguồn
        ↓ import, kiểm tra và chuẩn hóa
Bảng nguồn trong PostgreSQL
        ↓ xử lý theo kỳ, mã KH lõi và chi nhánh
customer_period_branch_details
        ↓ tổng hợp toàn bộ quan hệ của một mã KH lõi
customer_period_profiles
        ↓ áp dụng quyền, phạm vi và bộ lọc
Card / bảng / biểu đồ / Excel trên giao diện
```

Các khái niệm quan trọng:

- **Grain hồ sơ tổng:** một dòng `customer_period_profiles` tương ứng một `period_key + ma_kh`.
- **Grain theo chi nhánh:** một dòng `customer_period_branch_details` tương ứng một `period_key + ma_kh + branch_code`.
- **Mã KH lõi:** mã khách hàng đã bỏ phần mã chi nhánh; dùng để hợp nhất một khách hàng có quan hệ tại nhiều chi nhánh.
- **Toàn bộ quan hệ:** cộng dữ liệu các chi nhánh người dùng được phép xem của cùng mã KH lõi.
- **Một chi nhánh:** chỉ lấy dòng chi tiết của chi nhánh đang chọn; không được giữ số tổng toàn bộ quan hệ.
- **Kỳ trước:** kỳ dữ liệu đã xử lý gần nhất nhỏ hơn kỳ đang xem, không mặc định luôn là tháng liền trước nếu tháng đó chưa có dữ liệu.
- **Giá trị bằng 0:** chỉ khẳng định không phát sinh khi nguồn tương ứng đã sẵn sàng và xử lý thành công. Nguồn thiếu phải hiển thị là thiếu/chưa có nguồn, không được diễn giải thành không phát sinh.

---

# 2. Quy tắc chung áp dụng cho mọi màn hình

## 2.1. Kỳ, phạm vi và bộ lọc

| Thành phần giao diện | Nguồn | Cách áp dụng |
|---|---|---|
| Kỳ dữ liệu | `period_key` của kết quả xử lý | Bắt buộc chọn trước khi xem dữ liệu nghiệp vụ |
| Chi nhánh | Danh mục `org_branches` và phạm vi user | Chỉ hiện chi nhánh người dùng được cấp quyền; tài khoản chi nhánh không được tự mở rộng ra toàn hệ thống |
| Phòng ban/PGD | Danh mục phòng ban đang hoạt động | Chỉ hiện phòng thuộc chi nhánh đã chọn; không lấy tên PGD tự do từ file nguồn làm danh mục lọc |
| Cán bộ quản lý | User đang hoạt động và thuộc CN/phòng đã chọn | Không hiển thị cán bộ ngoài danh mục hoặc ngoài phạm vi đang chọn |
| Tên/mã KH | `customer_period_profiles.ten_kh`, `ma_kh` | Tìm đúng theo khách hàng; không trộn với tên cán bộ quản lý |
| Loại KH | `loai_khach_hang` đã chuẩn hóa từ CIF | Có thể chọn nhiều giá trị theo danh mục hiện có |
| Tiền gửi/tiền vay/sản phẩm | Các trường tổng hợp của hồ sơ kỳ | Điều kiện lọc được áp dụng trước khi tính KPI, danh sách và Excel |

Một bộ lọc chỉ hợp lệ khi cùng điều kiện được truyền đến KPI, bảng chi tiết, biểu đồ, drawer và file Excel. Không được tính card theo một phạm vi nhưng mở danh sách theo phạm vi khác.

## 2.2. Khách hàng nền và ghép nguồn

- Kho CIF hiện hành là tập khách hàng nền khi xử lý **mọi kỳ**.
- Các nguồn DP01, LN01, PF10, PF14, CN05, BC06, BC29, KH02, RR01, GL02 và file bổ sung được chuẩn hóa về mã KH lõi rồi ghép CIF tại bước **Xử lý dữ liệu KH**.
- Import DP01 không tự sinh hoặc cập nhật master khách hàng.
- Bản ghi nguồn không khớp CIF vẫn được lưu trong kho nguồn và xuất ở **Đối chiếu CIF**, nhưng không tự tạo hồ sơ C360 chính thức.

## 2.3. Quy đổi ngoại tệ

- Số tiền ngoại tệ của PF14/PF10 và các nguồn hỗ trợ được quy đổi sang VNĐ theo tỷ giá DP01 của cùng kỳ theo logic hiện hành.
- DP01 dùng `TYGIA` trên từng tài khoản.
- Không cộng trực tiếp các số nguyên tệ khác nhau.
- Thiếu tỷ giá phải được cảnh báo; không tự coi tỷ giá bằng 1, ngoại trừ VND hoặc quy tắc đã được phê duyệt.
- `CURRENT_BALANCE < 0` của DP01 không được cộng vào nguồn vốn vì được xem là thấu chi và đã phản ánh ở tiền vay.

## 2.4. So sánh kỳ

```text
Biến động số tiền = Giá trị kỳ đang xem − Giá trị kỳ trước
Tỷ lệ biến động (%) = Biến động / |Giá trị kỳ trước| × 100
```

Nếu kỳ trước bằng 0 hoặc không tồn tại, giao diện phải ghi “không có cơ sở so sánh”, không hiển thị phần trăm gây hiểu nhầm.

---

# 3. Dashboard điều hành

## 3.1. Các card KPI chính

| Nhãn trên giao diện | Trường/API trung gian | File và cột nguồn | Công thức/điều kiện | Drill-down |
|---|---|---|---|---|
| Tổng khách hàng | `customer.total`, `total_customers` | CIF `CUSTNO`; kết quả `customer_period_profiles.ma_kh` | `COUNT(DISTINCT ma_kh)` sau quyền, phạm vi và bộ lọc | Các KH thuộc đúng tập đã đếm |
| Khách hàng mới trong kỳ | so sánh hồ sơ kỳ hiện tại/kỳ trước | `customer_period_profiles` | KH có ở kỳ này nhưng không có ở kỳ trước trong cùng phạm vi | Danh sách KH mới xuất hiện |
| Tổng nguồn vốn huy động sau quy đổi | `funding.total` | DP01 `CURRENT_BALANCE`, `MONTH_TERM`, `DP_TYPE_NAME`, `DP_TYPE_CODE`, `CCY`, `TYGIA` | `SUM(CURRENT_BALANCE dương × TYGIA)`; bằng CKH + KKH + TGTT | Danh sách tài khoản/KH tạo số liệu theo nhóm |
| Tiền gửi không kỳ hạn | `funding.demand` | DP01 `CURRENT_BALANCE`, `MONTH_TERM`, `DP_TYPE_NAME`, `TYGIA` | `MONTH_TERM = 0`; gồm KKH và TGTT; chỉ số dư dương | Danh sách KH có giá trị KKH/TGTT dương |
| Tiền gửi có kỳ hạn | `funding.term` hoặc `deposit.term` tùy khối | DP01 hoặc PF14 `MONTHLYENDBALANCE`, `MONTERM`, `CCY` | DP01: phần CKH trong tổng nguồn vốn; PF14: `SUM(MONTHLYENDBALANCE × tỷ giá)` với `MONTERM > 0` | Phải ghi rõ card dùng DP01 hay PF14; không trộn hai tổng |
| TGTT bình quân | `deposit.casa_average`, `so_du_tgtt_binh_quan` | PF14 `AVERAGEBALANCE`, `MONTERM`, `CCY`; hỗ trợ DP01 | `SUM(AVERAGEBALANCE × tỷ giá)` của TKTT hợp lệ; không cộng DP01 âm | KH có TGTT bình quân khác 0 |
| Tổng tiền gửi trong hồ sơ KH | `so_du_tien_gui + so_du_tgtt_binh_quan` | PF14/DP01 | Tiền gửi CKH cuối kỳ + TGTT bình quân; không đồng nhất với “tổng nguồn vốn huy động cuối kỳ” | Chi tiết tiền gửi của KH/phạm vi |
| Tổng dư nợ | `credit.total`, `so_du_tien_vay` | LN01 `DU_NO`; PF10 `EOMBAL`, `LNTYPE`, `CCY` để phân rã/đối soát | `Dư nợ ngắn hạn + trung dài hạn + thấu chi`; LN01 là tổng tham chiếu, PF10 phân chi tiết LDS | KH có `so_du_tien_vay > 0` |
| Dư nợ ngắn hạn | `credit.short` | PF10/LN01 `EOMBAL/DU_NO`, `LNTYPE` | `LNTYPE = 100` hoặc phân loại khoản vay ngắn hạn | KH/LDS ngắn hạn |
| Dư nợ trung dài hạn | `credit.medium_long` | PF10/LN01 `EOMBAL/DU_NO`, `LNTYPE` | `LNTYPE IN (110,120)` | KH/LDS trung/dài hạn |
| Dư nợ thấu chi | `credit.overdraft` | PF10/LN01 `EOMBAL/DU_NO`, `LNTYPE` | `LNTYPE = 241` | KH/LDS thấu chi |
| Dư nợ KH cá nhân/pháp nhân | `credit.individual/corporate` | Tổng dư nợ + loại KH từ CIF | Cộng dư nợ sau khi phân nhóm loại KH đã chuẩn hóa | KH đúng loại và có dư nợ |
| Tổng phí trong kỳ | `income.total_fee` | KH02 `ACCTCD`, `CRAMT`, `DRAMT`, `CUSTSEQ` | Tổng các nhóm phí hợp lệ, mỗi tài khoản chỉ thuộc tối đa một nhóm | KH có nhóm phí được chọn khác 0 |
| KH sử dụng sản phẩm | `customer.with_service` | CN05, DP01, Bill Payment, KH02 | `COUNT(DISTINCT ma_kh)` có ít nhất một cờ sản phẩm hợp lệ; đây là **số KH**, không phải tổng số sản phẩm | KH có ít nhất một sản phẩm |
| Số tài khoản mở mới/đã đóng trong kỳ | so sánh vòng đời tài khoản | PF14 `ACCOUNTNO`, DP01 ngày mở/đóng nếu có | So tập tài khoản kỳ này với kỳ trước theo CN + KH + số tài khoản | KH/tài khoản mới hoặc không còn ở kỳ này |

### Lưu ý về hai khái niệm tiền gửi

| Khái niệm | Công thức | Mục đích |
|---|---|---|
| Nguồn vốn huy động cuối kỳ | CKH + KKH + TGTT từ số dư cuối kỳ dương DP01 | Báo cáo quy mô nguồn vốn tại ngày cuối kỳ |
| Tổng tiền gửi trên hồ sơ KH | CKH cuối kỳ + TGTT bình quân | Đánh giá quan hệ và mức duy trì số dư của một KH |

Hai số này có thể khác nhau và không được đối chiếu như cùng một KPI.

## 3.2. Khối Kết quả kỳ

| Chỉ tiêu | Cách xác định |
|---|---|
| Có tiền gửi | `so_du_tien_gui + so_du_tgtt_binh_quan > 0` |
| Có tiền vay | `so_du_tien_vay > 0` |
| Có sản phẩm dịch vụ | Tổng các cờ dịch vụ đang hoạt động `> 0`; đếm duy nhất KH |
| Quan hệ đa chi nhánh | `branch_count > 1` trong phạm vi người dùng được phép xem |
| Biến động số dư | Giá trị kỳ hiện tại trừ kỳ trước trên cùng mã KH và cùng phạm vi |

Khi bấm card, drawer phải dùng đúng điều kiện trên và ghi tổng số bản ghi thực tế. Phân trang không được làm người dùng hiểu số dòng đang thấy là toàn bộ tập dữ liệu.

## 3.3. Bảng kết quả theo chi nhánh

| Cột | Nguồn/cách tính |
|---|---|
| Chi nhánh | `customer_period_branch_details.branch_code` + `org_branches.branch_name` |
| Số KH | Đếm duy nhất `ma_kh` trong chi nhánh sau bộ lọc |
| Tiền gửi CKH | Tổng `so_du_tien_gui` theo chi nhánh |
| TGTT bình quân | Tổng `so_du_tgtt_binh_quan` theo chi nhánh |
| Dư nợ | Tổng `so_du_tien_vay` theo chi nhánh |
| Phí | Tổng các trường phí KH02 theo chi nhánh |
| Số cán bộ | Đếm cán bộ hợp lệ trong danh mục user, không đếm tên tự do từ nguồn |

---

# 4. Cảnh báo và phân nhóm khách hàng

| Nhóm/cảnh báo | Dữ liệu dùng | Logic hiện hành cần thể hiện rõ |
|---|---|---|
| KH chưa có CBQL | Hồ sơ kỳ + danh mục user | Không tìm được cán bộ hợp lệ theo quan hệ chi nhánh sau toàn bộ thứ tự ưu tiên |
| KH đa chi nhánh chưa rõ CN chính | `branch_count`, `primary_branch_code`, lý do/chấm điểm nơi giao dịch chính | Có nhiều quan hệ nhưng chưa xác định được CN chính hợp lệ |
| KH mới xuất hiện | Hồ sơ kỳ này so với kỳ trước | Có kỳ này, không có kỳ trước trong cùng phạm vi |
| KH giảm tiền gửi/dư nợ mạnh | Hồ sơ kỳ này/kỳ trước | Biến động vượt ngưỡng cảnh báo được cấu hình; phải ghi ngưỡng đang áp dụng |
| KH chuyển nhóm nợ | LN01 `NHOM_NO/debt_group` kỳ này và kỳ trước | Tập nhóm nợ khác nhau giữa hai kỳ |
| KH mất/thêm dịch vụ | Các cờ sản phẩm kỳ này/kỳ trước | So từng cờ, không chỉ so tổng số lượng |
| KH chưa khớp CIF | `customer_source_reconciliations` | Mã nguồn không tìm thấy trong Kho CIF hiện hành; hiển thị nguồn, CN, mã, tên, số dòng/số tiền và lý do |

Các cảnh báo phải chịu cùng bộ lọc chung, quyền và phạm vi dữ liệu. “Chi nhánh chính” là thuộc tính của hồ sơ hợp nhất; “chi nhánh đang xem” là phạm vi báo cáo, hai khái niệm phải được ghi riêng.

---

# 5. Danh sách khách hàng C360

| Cột/điều kiện | Trường kết quả | Nguồn ban đầu và cách lấy |
|---|---|---|
| Mã KH | `ma_kh` | Mã lõi từ CIF `CUSTNO`; các nguồn được chuẩn hóa về mã này |
| Tên KH | `ten_kh` | CIF `NMLOC`, fallback `NM` |
| Loại KH | `loai_khach_hang` | CIF `CUSTTPCD/CUSTDTLTPCD`, diễn giải theo danh mục |
| Chi nhánh chính | `primary_branch_code` | Thuật toán chọn nơi giao dịch chính trên các quan hệ; xem tài liệu `TINH_DIEM_NOI_GIAO_DICH_CHINH_KHACH_HANG.md` |
| Chi nhánh đang xem | `branch_code` | Dòng `customer_period_branch_details` trong phạm vi lọc |
| Phòng/cán bộ quản lý | `managing_*`, `ma_cb`, `ten_can_bo`, `officer_employee_code` | Chỉ công nhận khi khớp danh mục user/phòng ban; theo từng chi nhánh |
| Tiền gửi CKH | `so_du_tien_gui` | PF14 `MONTHLYENDBALANCE`, `MONTERM > 0`, quy đổi VNĐ |
| TGTT bình quân | `so_du_tgtt_binh_quan` | PF14 `AVERAGEBALANCE`, tài khoản không kỳ hạn/TKTT hợp lệ, quy đổi VNĐ |
| Tổng dư nợ | `so_du_tien_vay` | LN01 `DU_NO`, phân rã/đối soát PF10 |
| Tổng phí | Tổng các trường phí | KH02 `SUM(CRAMT)-SUM(DRAMT)` theo nhóm mã tài khoản |
| Số sản phẩm | Tổng số cờ sản phẩm `> 0` | CN05/DP01/Bill Payment/KH02 |
| Quan hệ gần nhất | ngày gần nhất khả dụng | `MAX` ngày giao dịch GL02, ngày mở tài khoản hoặc ngày khoản vay tùy dữ liệu hợp lệ |
| Điện thoại | `telephone` | CIF ưu tiên `NAME_4`, sau đó các cột `TELNO*`; có thể bị che theo quyền nhạy cảm |
| Địa chỉ | `dia_chi` | Ghép CIF `ADDR1LOC, ADDR2LOC, ADDR3LOC`, bỏ rỗng và khoảng trắng thừa |

Excel từ trang này phải xuất đúng toàn bộ tập sau bộ lọc, không chỉ các dòng đang hiển thị trên một trang. Tối thiểu gồm CN, mã KH, tên KH, loại KH, địa chỉ, điện thoại và các trường nghiệp vụ phù hợp với ngữ cảnh lọc.

---

# 6. Hồ sơ chi tiết khách hàng

## 6.1. Thông tin khách hàng

| Thông tin | Nguồn ưu tiên | Xử lý |
|---|---|---|
| Mã KH lõi | CIF `CUSTNO` | Lấy chín số lõi; cho phép sao chép nếu có quyền |
| Tên KH | CIF `NMLOC`, fallback `NM` | Trim, giữ Unicode |
| Tên chủ doanh nghiệp | CIF `GD_TEN` | Chỉ hiển thị khi có dữ liệu |
| CCCD/ĐKKD | CIF `REGNO`; fallback DP01 `ID_NUMBER` | Giữ dạng text; che/mở theo quyền định danh nhạy cảm |
| Mã số thuế | CIF `TAXNO` | Giữ nguyên dấu `-`, không ép số |
| Ngày thành lập | CIF `ISSUEDT4` | Chuyển `yyyymmdd` sang ngày hiển thị |
| Địa chỉ | CIF `ADDR1LOC, ADDR2LOC, ADDR3LOC` | Ghép bằng `, ` sau khi bỏ giá trị rỗng |
| Giới tính | CIF `NAME_3` | Chỉ lấy khi `CUSTTPCD` là cá nhân |
| Ngày sinh | CIF `NAME_1` với cá nhân; `GD_NGAYSINH` với tổ chức | Chuẩn hóa ngày |
| Nghề nghiệp/ngành nghề | CIF `PROFNM` | Lấy nguyên giá trị đã trim |
| Cán bộ quản lý | User gắn KH → BC06 → LN01 → DP01 → quan hệ CIF | Chỉ công nhận user/phòng ban tồn tại; hiển thị theo từng chi nhánh |
| Phòng quản lý | Danh mục phòng của user CBQL | Không dùng phòng phát sinh tài khoản DP01 thay cho phòng của cán bộ |

## 6.2. Các card tổng quan hồ sơ

| Card | Cách tính trong phạm vi đang chọn |
|---|---|
| Tổng tiền gửi | `so_du_tien_gui + so_du_tgtt_binh_quan` |
| Tổng tiền vay | `so_du_tien_vay` |
| Doanh thu/phí trong kỳ | Tổng các trường phí KH02; chỉ cộng thêm khoản thu nhập khác khi giao diện ghi rõ nguồn/công thức, không gộp âm thầm |
| Sản phẩm đang sử dụng | Đếm số cờ sản phẩm có giá trị `> 0` |
| Số chi nhánh có quan hệ | Số dòng quan hệ chi nhánh được phép xem có phát sinh dữ liệu hợp lệ |

Chuyển từ “Toàn bộ quan hệ” sang một chi nhánh phải cập nhật đồng thời toàn bộ card, bảng, biểu đồ, danh sách tài khoản và LDS.

## 6.3. Tab Tiền gửi

| Nội dung | Nguồn/cột | Công thức/cách hiểu |
|---|---|---|
| Tiền gửi CKH cuối kỳ | PF14 `ACCOUNTNO`, `MONTHLYENDBALANCE`, `MONTERM`, `CCY` | `MONTERM > 0`; tổng sau quy đổi; chi tiết theo số tài khoản/sổ tiết kiệm |
| TGTT bình quân | PF14 `AVERAGEBALANCE`, `MONTERM`, `CCY` | Tài khoản không kỳ hạn/TKTT hợp lệ; tổng sau quy đổi |
| Số dư cuối kỳ tài khoản | PF14 `MONTHLYENDBALANCE` hoặc DP01 `CURRENT_BALANCE` theo bảng đang xem | Hiển thị đến đồng; ghi rõ nguồn trên tooltip |
| Kỳ trước | Cùng số tài khoản ở kỳ xử lý trước | Dùng so sánh biến động/mới mở/tất toán |
| Doanh số TKTT | GL02 `CRAMOUNT`, `LOCAC`, `CUSTOMER` | `SUM(CRAMOUNT)` khi `LOCAC = 421101` và giao dịch hợp lệ |
| Giao dịch gần nhất | GL02 `TRDATE/CRTDTM`, `REMARK` | `MAX(TRDATE hoặc CRTDTM)`; `REMARK` là diễn giải, có thể là mô tả hệ thống chứ không phải nội dung KH nhập |
| Dòng tiền theo ngày | GL02 `TRDATE`, `DRAMOUNT`, `CRAMOUNT` | Tổng Nợ/Có theo ngày của tài khoản/KH hợp lệ trong tháng |
| Tài khoản mới mở/đã đóng | PF14/DP01 giữa hai kỳ | So tập số tài khoản; phải cùng CN và KH |

Không dùng “số dòng bút toán” làm chỉ tiêu kinh doanh nếu không giải thích; một giao dịch có thể tạo nhiều bút toán hệ thống.

## 6.4. Tab Tiền vay và rủi ro

| Nội dung | Nguồn/cột | Công thức/điều kiện |
|---|---|---|
| Số LDS | LN01 `DSBSSEQ`; PF10 `ACCTNO` dùng đối chiếu | Đếm duy nhất LDS hợp lệ, không dùng số tài khoản thanh toán |
| Dư nợ LDS | LN01 `DU_NO`; PF10 `EOMBAL` | Theo chi nhánh và LDS; số tổng không cộng lặp hai nguồn |
| Dư nợ bình quân | PF10 `AVGBAL` | Cộng theo loại vay sau quy đổi |
| Loại vay | PF10 `LNTYPE` | `100` ngắn hạn; `110,120` trung/dài hạn; `241` thấu chi |
| Ngày giải ngân/đến hạn | PF10 `OPNDT`, `MATDT`; LN01 lịch trả nợ | Chuẩn hóa kiểu ngày |
| Trạng thái khoản vay | ngày mở/đến hạn/đóng | Còn hiệu lực, sắp đến hạn, đến hạn trong tháng hoặc đã đóng theo ngày kỳ |
| Nhóm nợ | LN01/BC29 `NHOM_NO` | Hiển thị theo khoản và mức nghiêm trọng nhất khi tổng hợp KH |
| Ngày quá hạn/TSBĐ | BC29 các cột ngày quá hạn và tài sản bảo đảm | Tổng hợp theo KH–chi nhánh; drill-down giữ chi tiết nguồn |
| Gốc phải thu tháng kế tiếp | LN01 `NEXT_REPAYMENT_DATE`, `NEXT_REPAYMENT_AMOUNT` | Tổng khoản có ngày trả gốc trong tháng kế tiếp kỳ đang xem |
| Lãi phải thu tháng kế tiếp | LN01 `NEXT_INTEREST_REPAYMENT_DATE`, `TOTAL_INTEREST_REPAYMENT_AMOUNT`; fallback `INTEREST_AMOUNT` | Tổng khoản có ngày trả lãi trong tháng kế tiếp |
| Lãi quá hạn | LN01 `PASTDUE_INTEREST_AMOUNT` | Tổng theo KH/phạm vi |
| DPRR chung lũy kế | LN01 `DU_NO`, `NHOM_NO` | Nhóm 1–4: `SUM(DU_NO) × 0,75%` |
| DPRR chung trong tháng | LN01 kỳ này/kỳ trước | DPRR chung lũy kế kỳ này − kỳ trước; có thể âm khi dư nợ đủ điều kiện giảm |
| DPRR cụ thể lũy kế | BC29 `SO_TRICH_LAP_TRONG_KY`, `NHOM_NO` | Nhóm 2–5: giá trị cuối kỳ theo quy tắc hiện hành |
| DPRR cụ thể trong tháng | BC29 kỳ này/kỳ trước | DPRR cụ thể lũy kế kỳ này − kỳ trước; có thể âm do hoàn nhập/giảm mức trích |
| Dư nợ XLRR | RR01 `DUNO_GOC_HIENTAI` | `SUM(DUNO_GOC_HIENTAI)` theo KH lõi |
| Doanh số thu nợ XLRR trong kỳ | RR01 `THU_GOC`, `THU_LAI` | `SUM(THU_GOC) + SUM(THU_LAI)` |

Nếu lịch trả nợ LN01 không có ngày/số tiền, giao diện phải ghi “nguồn chưa cung cấp lịch/số tiền”, không kết luận nghĩa vụ bằng 0.

## 6.5. Tab Phí thu được

Công thức chung cho từng mã KH lõi–chi nhánh:

```text
Phí = SUM(KH02.CRAMT) − SUM(KH02.DRAMT)
```

| Nhóm phí | Prefix `KH02.ACCTCD` |
|---|---|
| Phí bảo lãnh | `7040*` |
| Phí chuyển tiền | `711001`, `711002` |
| Phí ngân hàng điện tử | `711036`, `711037`, `711039` |
| ABIC/BATĐ | `714*` |
| Phí kinh doanh ngoại tệ | `721001` |
| Phí LC | `709002` |
| Phí thanh toán quốc tế | `711003`–`711014`, `711096` |
| Phí thẻ | `711015`, `711016`, `711022`–`711028`, `711051`, `711052`, `711059` |
| Phí khác | `711031`, `711035`, `711042`, `711044`, `711098` |

Quy tắc chống tính trùng:

1. Một `ACCTCD` chỉ được xếp vào tối đa một nhóm phí.
2. `711002` thuộc phí chuyển tiền nên không tính lại vào TTQT.
3. Mã đã thuộc NHĐT/TTQT không tính lại vào phí khác.
4. Các mã thuộc họ `7040`, `709`, `711`, `714`, `721` nhưng chưa phân loại phải đưa vào đối soát, không tự bỏ qua.
5. `TTQT = có sử dụng` khi ít nhất một trong `PHI_KDNT`, `PHI_LC`, `PHI_TTQT` khác 0.

## 6.6. Tab Sản phẩm dịch vụ

| Sản phẩm/cờ | Nguồn và quy tắc chính |
|---|---|
| Agribank Plus, OTT, SMS Banking, thẻ | CN05; giá trị cột tương ứng `> 0` |
| Thấu chi | PF10/LN01 có loại vay `241` hoặc cờ nguồn hợp lệ |
| Tài khoản số đẹp | CN05 `TKTT_TK_SODEP > 0` |
| SMS tiền gửi/nhắc nợ vay | CN05 các cột SMS tương ứng `> 0` |
| Bảo lãnh | Có phí bảo lãnh KH02 hoặc nguồn sản phẩm đã cấu hình |
| Phát hành LC/TTQT | Có `PHI_LC`, `PHI_TTQT` hoặc `PHI_KDNT` |
| Thu hộ điện | Bill Payment mã `994,995,996,997,999,1003`; STK chuyển ghép DP01 |
| Thu hộ nước | Bill Payment mã `1235,6626,10929,10930,10931,10932,6541`; STK chuyển ghép DP01 |
| Thu hộ điện thoại | Bill Payment mã `312,333,360,409,363`; ghép DP01, tài khoản `8888...` qua CN05 hoặc `user deposit` qua CCCD trong nội dung |
| Tài khoản hộ kinh doanh | DP01 `CUST_TYPE = 570`; lưu cả danh sách số tài khoản |
| Bảo an tài khoản | Bill Payment mã DV `1218`, số tiền `77.000`; STK chuyển ghép DP01 |
| Bảo an thẻ | Bill Payment mã DV `1218`, số tiền `18.000`; STK chuyển ghép DP01 |

Card sản phẩm chỉ thể hiện có/không hoặc số lượng theo đúng ý nghĩa nguồn. Không suy diễn số thẻ/số đăng ký chi tiết nếu nguồn chỉ có cờ tổng hợp.

## 6.7. Lịch sử các kỳ và quan hệ chi nhánh

| Nội dung | Nguồn/cách tính |
|---|---|
| Dòng lịch sử kỳ | Các dòng `customer_period_profiles` cùng `ma_kh`, sắp xếp `period_key` |
| Lịch sử một chi nhánh | `customer_period_branch_details` cùng `ma_kh + branch_code` |
| Thêm/bỏ dịch vụ | So từng cờ sản phẩm giữa hai kỳ |
| Thay đổi CBQL/CN chính | So `officer_employee_code`, `primary_branch_code` giữa hai kỳ |
| Quan hệ theo chi nhánh | Tổng hợp tiền gửi, TGTT bình quân, dư nợ, số tài khoản, số LDS và sản phẩm trên từng dòng chi nhánh |
| Chi nhánh chính | Dòng có `branch_code = primary_branch_code`; phải highlight và hiển thị lý do khi có quyền |

---

# 7. Các trang Phân tích nghiệp vụ

## 7.1. Tiền gửi và dòng tiền

| Khối hiển thị | Nguồn/công thức |
|---|---|
| Quy mô nguồn vốn qua các kỳ | DP01 số dư dương sau quy đổi, phân CKH/KKH/TGTT |
| Tiền gửi CKH | PF14 `MONTHLYENDBALANCE`, `MONTERM > 0` |
| TGTT bình quân | PF14 `AVERAGEBALANCE`, nhóm TKTT/không kỳ hạn |
| Doanh số TKTT | GL02 `SUM(CRAMOUNT)`, `LOCAC = 421101` |
| Tài khoản mở mới/đã đóng | So tập `ACCOUNTNO` giữa hai kỳ |
| Số dư cuối kỳ cao nhưng bình quân thấp | So `MONTHLYENDBALANCE` và `AVERAGEBALANCE` theo ngưỡng/ratio đang cấu hình |
| Bình quân cao nhưng cuối kỳ giảm mạnh | So hai cột PF14 và kỳ trước; phải ghi ngưỡng |
| Tỷ lệ duy trì số dư | `Số dư cuối kỳ / số dư bình quân` khi mẫu số khác 0 |

## 7.2. Tiền vay và rủi ro

| Khối hiển thị | Nguồn/công thức |
|---|---|
| Cơ cấu dư nợ theo loại vay | PF10/LN01 theo LNTYPE 100, 110/120, 241 |
| Phân bổ nhóm nợ | LN01/BC29 `NHOM_NO`; bấm nhóm mở đúng KH thuộc nhóm đó |
| DPRR chung/cụ thể | Công thức tại mục 6.4 |
| Nghĩa vụ sắp tới | LN01 ngày/số tiền trả gốc, trả lãi của tháng kế tiếp |
| Lãi quá hạn | LN01 `PASTDUE_INTEREST_AMOUNT` |
| XLRR và thu nợ XLRR | RR01 theo công thức tại mục 6.4 |

## 7.3. Thu nhập và sản phẩm

| Khối hiển thị | Nguồn/công thức |
|---|---|
| Cơ cấu thu phí | KH02, tổng từng nhóm phí tại mục 6.5 |
| Tỷ trọng nhóm phí | `Giá trị nhóm / tổng giá trị các nhóm phí × 100` khi tổng khác 0 |
| Độ phủ sản phẩm | `Số KH có sản phẩm / tập KH đủ điều kiện × 100` |
| Khoảng trống sản phẩm | KH trong mẫu số nhưng cờ sản phẩm được chọn bằng 0 |
| Sản phẩm thêm/bỏ | So từng cờ giữa kỳ hiện tại và kỳ trước |

Mẫu số phải được ghi rõ. Ví dụ độ phủ SMS nhắc nợ vay nên dùng tập KH có tiền vay; độ phủ Agribank Plus dùng tập KH phù hợp theo quy tắc sản phẩm, không mặc định mọi KPI có cùng mẫu số.

## 7.4. Đơn vị và cán bộ

| Khối hiển thị | Nguồn/công thức |
|---|---|
| Số KH theo cán bộ | Đếm duy nhất `ma_kh` được gán cho user hợp lệ trong phạm vi |
| Tiền gửi/dư nợ/phí theo cán bộ | Tổng các trường hồ sơ/chi nhánh được giao cán bộ đó quản lý |
| KH mới nhận/chuyển đi | So cán bộ quản lý của cùng KH giữa hai kỳ |
| Tăng/giảm tiền gửi, dư nợ | Tổng kỳ này − tổng kỳ trước theo cùng cán bộ và phạm vi |
| Danh sách KH của cán bộ | Các dòng có `officer_employee_code` tương ứng; hỗ trợ lọc có tiền gửi, tiền vay, phí, đa chi nhánh |

Không tính tên cán bộ từ file nguồn nếu không khớp user hệ thống. KH chưa có CBQL phải được tách riêng, không gán tạm cho một cán bộ khác.

---

# 8. Quản trị dữ liệu

## 8.1. Kho dữ liệu theo kỳ

| Thông tin hiển thị | Nguồn/cách tính |
|---|---|
| Số file, số dòng, dung lượng | `import_files`, `import_batches` và metadata file |
| Kỳ dữ liệu | Parse từ tên file và ngày nguồn |
| Trạng thái import | Trạng thái batch/file: chờ, đang chạy, hoàn thành, lỗi |
| Chi nhánh đã có | Mã CN parse từ tên/file hoặc trường nguồn chuẩn |
| Nguồn bắt buộc còn thiếu | So ma trận nguồn thực tế với danh sách nguồn bắt buộc |
| FTPLN thiếu ngày | So danh sách ngày file đã có với toàn bộ ngày lịch của tháng theo từng CN |
| Độ sẵn sàng | Số ô nguồn/chi nhánh đạt yêu cầu chia tổng ô bắt buộc; không chỉ kiểm tra bốn nguồn cũ |

Nguồn bắt buộc hiện hành: DP01, LN01, CN05, PF10, PF14, BC06, BC29, KH02 và FTPLN. RR01/GL02 đang là nguồn hỗ trợ và chưa chặn độ sẵn sàng nếu chưa thay đổi chính sách.

## 8.2. Kho CIF

| Thông tin | Cách lấy |
|---|---|
| Tổng KH lõi | Đếm `cif_customers.customer_core_code` duy nhất |
| Số CIF đầy đủ | Đếm `cif_customer_identifiers.full_cif_code` |
| Số chi nhánh quan hệ | Đếm `branch_code` duy nhất trên identifier |
| Trùng trong file | Các dòng sau CUSTNO đầu tiên được đánh dấu/bỏ qua theo batch |
| Xung đột với kho | So source record mới với snapshot hiện tại; lưu `changed_fields`, giá trị cũ/mới và trạng thái duyệt |
| Lịch sử cập nhật | Import batch, file, người import, thời gian, số dòng thành công/bỏ qua/lỗi/xung đột |

## 8.3. Xử lý dữ liệu KH

- Job xử lý lại một kỳ xóa/thay thế kết quả tổng hợp của kỳ đó trong giao dịch phù hợp, không cộng chồng thành một bộ số liệu mới.
- Sau khi Kho CIF hoặc nguồn của một kỳ thay đổi, kỳ đã xử lý phải được đánh dấu cần chạy lại.
- Nút chạy phải bị vô hiệu hóa nếu nguồn bắt buộc chưa đủ, trừ luồng bỏ qua nguồn đã được người có quyền xác nhận rõ.
- Tiến độ phải phản ánh các bước: chuẩn bị → chuẩn hóa/ghép CIF → tính theo nguồn → tổng hợp chi nhánh → tổng hợp KH → đối soát → hoàn thành.

## 8.4. Đối chiếu CIF

| Cột | Nguồn |
|---|---|
| Loại nguồn | Bảng nguồn phát sinh mã chưa khớp |
| Chi nhánh | CN của bản ghi nguồn |
| Mã KH nguồn | Mã trước/sau chuẩn hóa |
| Tên KH nguồn | Tên trên file nguồn |
| Số dòng/số tiền | Tổng ảnh hưởng của nhóm bản ghi |
| Lý do | Mã rỗng, sai định dạng, không tồn tại CIF, không xác định được mã lõi hoặc nguyên nhân kiểm tra khác |

Excel đối chiếu phải xuất đúng danh sách và lý do đang lọc để chủ nguồn xử lý.

---

# 9. Quản trị hệ thống

Các số liệu ở đây không lấy từ file nghiệp vụ khách hàng:

| Màn hình/chỉ tiêu | Nguồn hệ thống |
|---|---|
| Chi nhánh/phòng ban | `org_branches`, `org_departments` |
| Người dùng, trạng thái khóa | Bảng user, trường trạng thái, thất bại đăng nhập và thời gian khóa tạm |
| Nhóm quyền/ma trận quyền | Role, permission và bảng liên kết role–permission |
| Quyền bổ sung riêng | Grant/deny trực tiếp của user ngoài nhóm quyền |
| Phạm vi dữ liệu | Scope toàn hệ thống/CN/phòng/cá nhân và danh sách đơn vị được phép |
| Phiên đăng nhập | Bảng session: user, IP đã chuẩn hóa qua reverse proxy tin cậy, thời gian hoạt động, trạng thái |
| Nhật ký truy cập dữ liệu nhạy cảm | Security/audit log: ai, lúc nào, thao tác, đối tượng, phạm vi và kết quả |

Các card tổng hợp quản trị phải mở được danh sách tạo ra số lượng đó; không chỉ hiển thị con số không truy vết được.

---

# 10. Truy vết cán bộ quản lý và chi nhánh chính

## 10.1. Cán bộ quản lý

Thứ tự xác định hiện hành:

1. User hệ thống được gắn trực tiếp với mã KH phù hợp.
2. BC06 `DON_VI_DAU_MOI` xác định đơn vị quản lý.
3. LN01 `OFFICER_ID/OFFICER_NAME`, chỉ nhận khi mã CBTD khớp user.
4. DP01 `EMPLOYEE_NUMBER/EMPLOYEE_NAME`, chỉ nhận khi mã nhân viên khớp user.
5. Quan hệ chi nhánh CIF; không đủ căn cứ cán bộ thì để trống/chưa xác định.

CBQL phải được xác định riêng trên từng quan hệ chi nhánh. Không sao chép cán bộ của CN chính sang tất cả CN còn lại.

## 10.2. Chi nhánh chính

- Tính trên các quan hệ chi nhánh hợp lệ của KH trong kỳ.
- Quan hệ có tiền vay được ưu tiên theo quy tắc chấm điểm hiện hành; số dư DP01 âm không được dùng để tăng điểm tiền gửi.
- Sau đó xét quy mô tiền vay, tiền gửi, sản phẩm, cán bộ/đơn vị quản lý và tiêu chí tie-break đã quy định.
- Giao diện phải highlight CN chính và có tooltip/lý do; khi người dùng chỉ có quyền một CN, vẫn phải phân biệt “CN chính toàn hồ sơ” với “CN đang xem”.

Chi tiết thuật toán xem [Tính điểm nơi giao dịch chính khách hàng](TINH_DIEM_NOI_GIAO_DICH_CHINH_KHACH_HANG.md).

---

# 11. Kiểm tra một con số trên giao diện

Khi nghi ngờ một số liệu, thực hiện theo thứ tự:

1. Ghi lại tài khoản đăng nhập, kỳ, CN, phòng, cán bộ và toàn bộ bộ lọc.
2. Xác định đang xem **toàn bộ quan hệ** hay **một chi nhánh**.
3. Mở tooltip để kiểm tra nguồn, cột, công thức, kỳ và trạng thái quy đổi.
4. Mở drill-down; kiểm tra tổng các dòng có bằng card hay không.
5. Xuất Excel đúng bộ lọc để đối chiếu toàn bộ tập, không chỉ một trang.
6. Kiểm tra nguồn tương ứng đã đủ và job kỳ đã chạy lại sau lần import cuối chưa.
7. Đối chiếu bảng tổng hợp với bảng theo chi nhánh; tổng các chi nhánh được phép xem phải bằng hồ sơ tổng trong cùng phạm vi.
8. Với ngoại tệ, kiểm tra CCY và tỷ giá DP01 của kỳ.
9. Với phí, kiểm tra `ACCTCD` có thuộc đúng một nhóm và phép tính Có trừ Nợ.
10. Với số chênh lệch kỳ, kiểm tra kỳ trước mà hệ thống thực tế đã chọn.

Mẫu biên bản đối chiếu tối thiểu:

| Nội dung | Giá trị cần ghi |
|---|---|
| Chỉ tiêu/màn hình | Tên card, bảng hoặc biểu đồ |
| Kỳ và phạm vi | Kỳ, CN, phòng, cán bộ, bộ lọc |
| Giá trị giao diện | Số đầy đủ, không chỉ số làm tròn |
| Nguồn và cột | File/bảng/cột theo tài liệu này |
| Giá trị tính lại | Kết quả truy vấn/Excel đối chiếu |
| Chênh lệch | Giá trị và tỷ lệ |
| Nguyên nhân | Thiếu nguồn, khác phạm vi, tỷ giá, kỳ trước, trùng mã hoặc lỗi công thức |
| Kết luận/người xác nhận | Nghiệp vụ và kỹ thuật cùng xác nhận |

---

# 12. Các điểm chưa được phép suy diễn

- Không coi nguồn thiếu là giá trị 0.
- Không coi mọi `ACCOUNTNO` PF14 là tài khoản thanh toán; phải xét kỳ hạn/sản phẩm.
- Không coi `OFFICER_IPCAS` là mã CBTD hoặc user quản lý.
- Không lấy phòng phát sinh giao dịch/tài khoản làm phòng công tác của CBQL.
- Không cộng LN01 và PF10 để ra tổng dư nợ; đây là hai góc dữ liệu dùng tổng hợp và đối soát.
- Không cộng số nguyên tệ khi chưa quy đổi.
- Không cộng số dư DP01 âm vào tiền gửi.
- Không coi tổng số cờ sản phẩm là tổng số khách hàng sử dụng sản phẩm.
- Không dùng số dòng bút toán GL02 làm số giao dịch kinh doanh nếu chưa định nghĩa grain.
- Không hiển thị số tài khoản, LDS, CCCD, điện thoại đầy đủ nếu user thiếu quyền dữ liệu nhạy cảm.
- Không công bố KPI FTPLN hoặc ý nghĩa BC29 chưa được chủ nguồn xác nhận bằng văn bản.

---

# 13. Ma trận cập nhật tài liệu

| Khi thay đổi | Phải cập nhật |
|---|---|
| Thêm/sửa card, cột, biểu đồ | Tài liệu này + hướng dẫn sử dụng |
| Thay file/cột/công thức | Tài liệu này + đặc tả nguồn + từ điển dữ liệu |
| Thay logic phạm vi/quyền nhạy cảm | Tài liệu này + ma trận phân quyền |
| Thay bảng tổng hợp/API | Tài liệu này + kiến trúc/ERD |
| Thay danh mục mã phí/sản phẩm | Tài liệu này + cấu hình nghiệp vụ + test đối soát |

Checklist trước khi phát hành:

- [ ] Card và drill-down dùng cùng kỳ/phạm vi/bộ lọc.
- [ ] Tổng dòng drill-down khớp giá trị card đến đơn vị công bố.
- [ ] Tooltip ghi nguồn, cột, công thức, kỳ và quy đổi ngoại tệ.
- [ ] Excel dùng cùng điều kiện với bảng.
- [ ] Các trường nhạy cảm tuân thủ quyền xem/xuất.
- [ ] Công thức có test tự động và mẫu đối chiếu nghiệp vụ.
- [ ] Người dùng phân biệt được 0, thiếu nguồn và chưa xử lý.
- [ ] Tài liệu đã được cập nhật cùng phiên bản phần mềm.

---

# 14. Lịch sử phiên bản

| Phiên bản | Ngày | Nội dung | Người cập nhật |
|---|---|---|---|
| 1.0 | 21/09/2026 | Khởi tạo truy vết từ toàn bộ nhóm giao diện đến nguồn, cột và công thức hiện hành | Cần điền |
