# GIỚI THIỆU CHƯƠNG TRÌNH C360

> Tài liệu nguồn để xây dựng bài thuyết trình/slide bằng NotebookLM. Cập nhật theo mã nguồn và tài liệu dự án ngày 18/09/2026. Đây là bản giới thiệu chương trình, không phải báo cáo số liệu chốt kỳ.

**Tên chương trình:** C360 – Quản lý và phân tích quan hệ khách hàng.

**Thông điệp cốt lõi:** Một khách hàng – một mã khách hàng lõi – một góc nhìn tổng hợp; vẫn truy được phần quan hệ và số liệu phát sinh tại từng chi nhánh.

## Tóm tắt dành cho người thuyết trình

C360 tập hợp Kho CIF và các file nghiệp vụ theo kỳ vào một quy trình kiểm tra, xử lý và khai thác thống nhất. Thay vì xem riêng từng file tiền gửi, tiền vay, phí hoặc dịch vụ, người được cấp quyền có thể bắt đầu từ chỉ tiêu điều hành, đi xuống danh sách khách hàng và xem hồ sơ chi tiết theo kỳ, chi nhánh. C360 **không phải hệ thống giao dịch lõi và không hiển thị số liệu thời gian thực**; độ tin cậy của báo cáo phụ thuộc vào độ đầy đủ, đúng kỳ và chất lượng của file nguồn.

```text
Kho CIF + file nghiệp vụ theo kỳ + file bổ sung
                 ↓
    Kiểm tra đầu vào và lưu kho nguồn
                 ↓
   Xử lý kỳ, ghép CIF, đối chiếu sai lệch
                 ↓
Hồ sơ KH theo chi nhánh/kỳ → Hồ sơ KH tổng hợp/kỳ
                 ↓
Dashboard → Phân tích → Danh sách KH → Chi tiết/Excel
```

# Chương 1. Tổng quan hệ thống

## 1.1. Bài toán và mục đích

Dữ liệu về một khách hàng đang nằm ở nhiều nguồn, nhiều kỳ và có thể phát sinh tại nhiều chi nhánh. Việc đọc từng file riêng lẻ khiến người dùng mất thời gian ghép mã, khó xác định cùng một khách hàng có những quan hệ nào, khó giải thích một con số tổng hợp và khó theo dõi biến động qua kỳ.

C360 hướng tới bốn mục đích:

1. **Hợp nhất nhận diện:** dùng Kho CIF làm tập khách hàng nền; cùng mã khách hàng lõi được nhận diện là một khách hàng dù có nhiều mã CIF theo chi nhánh.
2. **Tập hợp quan hệ:** đặt tiền gửi, tiền vay, phí, sản phẩm/dịch vụ, rủi ro và lịch sử kỳ trên cùng một hồ sơ.
3. **Hỗ trợ điều hành:** xem chỉ tiêu theo kỳ, chi nhánh, phòng ban, cán bộ và đi từ chỉ tiêu tổng hợp xuống khách hàng tạo ra số liệu.
4. **Có thể giải trình:** giữ nguồn, công thức, phạm vi, kỳ dữ liệu và danh sách chưa khớp CIF để kiểm tra khi số liệu có chênh lệch.

## 1.2. Đối tượng sử dụng

| Đối tượng | Nhu cầu chính | Phạm vi xem phụ thuộc vào |
|---|---|---|
| Lãnh đạo hội sở | Quy mô, cơ cấu, biến động và kết quả theo đơn vị | Nhóm quyền và phạm vi được cấp |
| Lãnh đạo chi nhánh/phòng | Danh mục khách hàng, kết quả của đơn vị/cán bộ, nhóm cần xử lý | Chi nhánh, phòng ban và quyền chức năng |
| Cán bộ quản lý khách hàng | Tra cứu khách hàng phụ trách, theo dõi quan hệ và biến động | Mã cán bộ, quan hệ quản lý và quyền được cấp |
| Quản trị dữ liệu/người được giao vận hành | Nhập CIF/file nguồn, kiểm tra độ sẵn sàng, chạy xử lý và đối chiếu | Quyền quản trị dữ liệu tương ứng |
| Quản trị hệ thống | Quản lý tổ chức, tài khoản, nhóm quyền, cấu hình và nhật ký | Quyền quản trị hệ thống tương ứng |

Thiết kế phân quyền hướng tới việc chỉ hiển thị menu và dữ liệu thuộc phạm vi được cấp. Quyền mở một màn hình không mặc nhiên là quyền xem mọi chi nhánh, mọi trường nhạy cảm hoặc xuất dữ liệu; việc thực thi quyền ở từng API vẫn cần được kiểm thử đầy đủ trước khi công bố vận hành chính thức.

## 1.3. Phạm vi chương trình

- **Không gian:** các chi nhánh, phòng ban và cán bộ đã được cấu hình trong hệ thống; một khách hàng có thể có quan hệ tại nhiều chi nhánh.
- **Thời gian:** Kho CIF là tập khách hàng nền dùng khi xử lý bất kỳ kỳ nào; số liệu nghiệp vụ được gắn theo kỳ tháng hoặc ngày nghiệp vụ của nguồn.
- **Nghiệp vụ:** nhận diện khách hàng; tiền gửi và dòng tiền; tiền vay và rủi ro; phí và sản phẩm; phân tích đơn vị/cán bộ; quản trị nguồn và đối chiếu.
- **Ngoài phạm vi:** C360 không thay thế hệ thống hạch toán/giao dịch nguồn, không tự bảo đảm file đầu vào luôn đủ, và không thể xem kết quả của một kỳ đã xử lý là tự cập nhật ngay sau khi CIF/file nguồn thay đổi. Khi nguồn đổi, cần xử lý lại kỳ liên quan.

## 1.4. Những chức năng đang có

| Nhóm giao diện | Chức năng chính | Giá trị khi trình bày |
|---|---|---|
| **Tổng quan** | Dashboard điều hành; Cảnh báo & phân nhóm | Từ quy mô chung nhìn thấy biến động, nhóm khách hàng cần chú ý |
| **Quản lý khách hàng** | Danh sách KH; hồ sơ chi tiết theo kỳ, toàn bộ quan hệ hoặc từng chi nhánh | Từ một mã KH lõi xem được tiền gửi, vay, phí, dịch vụ và lịch sử |
| **Phân tích nghiệp vụ** | Tiền gửi & dòng tiền; Tiền vay & rủi ro; Thu nhập & sản phẩm; Đơn vị & cán bộ | Phân tích cơ cấu, xu hướng và danh mục theo đúng mục tiêu nghiệp vụ |
| **Quản trị dữ liệu** | Kho nguồn, Kho CIF, Xử lý dữ liệu KH, Giám sát nguồn, Đối chiếu CIF, Từ điển & mapping | Kiểm soát file đầu vào, mức sẵn sàng và khả năng truy vết |
| **Quản trị hệ thống** | Chi nhánh, phòng ban, người dùng, nhóm quyền, cấu hình, nhật ký | Vận hành theo tổ chức và phân quyền truy cập |

Bộ lọc chung yêu cầu chọn kỳ trước, sau đó mới chọn phạm vi/điều kiện khác và bấm **Xem dữ liệu**. Nhiều khối dùng lại kết quả phiên phân tích; danh sách phân trang hoặc một hồ sơ chi tiết có thể truy vấn thêm khi mở. Các số trên card có thể được rút gọn để đọc nhanh; đối soát phải dùng số đầy đủ trong bảng, tooltip hoặc file xuất.

## 1.5. Nguyên tắc “một khách hàng, nhiều chi nhánh”

`CUSTNO` trong CIF gồm 13 chữ số: 4 chữ số đầu nhận diện chi nhánh của mã CIF và 9 chữ số cuối là **mã khách hàng lõi**. Hai mã CIF có phần chi nhánh khác nhau nhưng cùng 9 số lõi được gom thành một khách hàng trong góc nhìn tổng hợp. Hệ thống đồng thời giữ dữ liệu theo **khách hàng – chi nhánh – kỳ**, để số của một chi nhánh không bị nhầm với số của toàn bộ quan hệ.

Ví dụ minh họa bằng mã giả, không phải dữ liệu thật: `2600xxxxxxxxx` và `2602xxxxxxxxx` có cùng `xxxxxxxxx` là một khách hàng lõi, nhưng số dư và cán bộ quản lý tại 2600/2602 vẫn được thể hiện riêng.

## 1.6. Kiến trúc ở mức người nghe cần biết

Giao diện React/Vite gửi yêu cầu tới backend FastAPI; PostgreSQL lưu CIF, nguồn, kết quả xử lý, cấu hình và nhật ký; Redis hỗ trợ cache kết quả phân tích theo phiên, **không phải kho dữ liệu gốc**. Docker đóng gói dịch vụ và Alembic quản lý thay đổi cấu trúc database. Đây là hệ thống chạy trên hạ tầng nội bộ đã cấu hình, không đòi hỏi Internet cho các thao tác nghiệp vụ khi các thành phần cần thiết đã được cài đặt.

# Chương 2. Cách tiếp nhận và khai thác các nguồn dữ liệu hiện có

## 2.1. Cần phân biệt “nơi xuất file” và “nơi import file”

C360 **tiếp nhận file** do đơn vị/đầu mối nghiệp vụ cung cấp qua giao diện nhập liệu; mã nguồn hiện tại không chứng minh việc C360 tự đăng nhập vào từng hệ thống nguồn để kéo dữ liệu. Tài liệu dự án đã xác nhận định dạng, tên file, cột và cách import, nhưng **chưa xác nhận chính thức tên hệ thống xuất và đầu mối cung cấp của từng file**. Trước khi dùng tài liệu như quy trình ban hành, cần điền các thông tin còn thiếu sau:

| Thông tin cần chốt với chủ nguồn | Nội dung cần ghi |
|---|---|
| Hệ thống/báo cáo xuất file | Tên hệ thống, đường dẫn hoặc mã báo cáo, không suy đoán từ tên file |
| Đầu mối cung cấp/kiểm tra | Đơn vị và người chịu trách nhiệm cho từng nguồn |
| Tần suất và thời hạn | Thời điểm chốt kỳ, hạn gửi, quy tắc gửi lại file sửa |
| Biên bản đối soát | Chỉ tiêu gốc dùng so với số sau xử lý, người xác nhận ngoại lệ |

Phần dưới mô tả **cách C360 nhận, kiểm tra và sử dụng file** đã có căn cứ trong dự án; không thay thế hướng dẫn xuất file ở hệ thống nguồn.

## 2.2. Ba nhóm dữ liệu đi vào C360

| Nhóm | Cách tiếp nhận | Vai trò |
|---|---|---|
| **Kho CIF** | Tải một/nhiều file CSV, XLS hoặc XLSX vào màn **Kho dữ liệu CIF**; có thể một file chứa nhiều chi nhánh | Tập khách hàng nền, định danh và thông tin khách hàng |
| **Nguồn định kỳ chuẩn** | Tải CSV/XLSX vào **Kho dữ liệu**, theo quy tắc tên, chi nhánh và kỳ | Số liệu tiền gửi, khoản vay, phí, dịch vụ, rủi ro, giao dịch |
| **File bổ sung cho kỳ** | Đính file đúng loại tại **Xử lý dữ liệu KH → Thêm file bổ sung cho kỳ** | Các nghiệp vụ chưa thuộc bộ tên nguồn chuẩn, ví dụ Bill Payment, bảo lãnh/LC, OAB/loa biến động số dư |

Không nên lấy file mới bằng cách chép thẳng vào thư mục ứng dụng rồi coi như đã có dữ liệu. File phải đi qua luồng import để có bản ghi nguồn, trạng thái job, kiểm tra và dữ liệu có thể xử lý. File gốc bổ sung có thể còn phụ thuộc đường dẫn lưu trữ nội bộ; bản ghi đã đọc/chuẩn hóa được lưu vào DB theo loại nguồn được hỗ trợ.

## 2.3. Danh mục nguồn và thông tin lấy được

**Kho CIF – nguồn nền, không theo tháng**

| Dữ liệu chính | Cột/khóa tiêu biểu | Dùng để làm gì |
|---|---|---|
| Mã KH, tên, loại KH, định danh, liên hệ, địa chỉ | `CUSTNO`, `NMLOC`, `CUSTTPCD`, `REGNO`, `TAXNO`, `ADDR1LOC–ADDR3LOC` | Tạo tập KH nền và đối chiếu các mã KH từ nguồn định kỳ |

Một mã `CUSTNO` trùng được bỏ qua theo quy tắc import; thông tin thay đổi ở bản ghi đã tồn tại được lưu để người có quyền rà soát, không tự ghi đè âm thầm. CIF không phải “file của tháng 6” hay “file của tháng 7”: **khi xử lý bất kỳ kỳ nào, hệ thống ghép nguồn kỳ đó với Kho CIF hiện hành**.

**11 loại nguồn định kỳ chuẩn đang được hỗ trợ**

| Nguồn | Chu kỳ/tệp | Cột hoặc thông tin tiêu biểu | Đóng góp nổi bật |
|---|---|---|---|
| `DP01` | Ảnh chụp cuối kỳ theo chi nhánh | `MA_KH`, `SO_TAI_KHOAN`, `CURRENT_BALANCE`, `MONTH_TERM`, `CCY`, `TYGIA` | Tài khoản và nguồn vốn huy động, loại tiền gửi, tỷ giá; số dư âm không cộng vào tiền gửi |
| `LN01` | Ảnh chụp cuối kỳ | `CUSTSEQ`, `BRCD`, `DU_NO`, `NHOM_NO`, `OFFICER_ID` | Dư nợ, nhóm nợ, cán bộ tín dụng; cơ sở dự phòng chung |
| `PF10` | Ảnh chụp cuối kỳ | `TRBRCD`, `CUSTSEQ`, `ACCTNO`, `LNTYPE`, `AVGBAL`, `EOMBAL` | Cơ cấu dư nợ ngắn/trung-dài hạn/thấu chi, chi tiết LDS và bình quân |
| `PF14` | Ảnh chụp cuối kỳ | `CUSTSEQ`, `TRBRCD`, `ACCOUNTNO`, `MONTERM`, `AVERAGEBALANCE`, `MONTHLYENDBALANCE` | Số dư tiền gửi CKH cuối kỳ và TGTT bình quân trên hồ sơ |
| `CN05` | Ảnh chụp cuối kỳ | Các cột TKTT, Plus, OTT/SMS, thẻ, LDS | Cờ/số lượng sử dụng sản phẩm dịch vụ, không thay thế danh sách tài khoản chi tiết |
| `BC06` | Ảnh chụp cuối kỳ, có thể chia phần | `MA_KHACH_HANG`, các cột hạng/nhóm, `DON_VI_DAU_MOI` | Phân hạng, phân khúc và biến động hạng qua kỳ |
| `BC29` | Ảnh chụp cuối kỳ | `MA_KH`, `NHOM_NO`, quá hạn, tài sản bảo đảm, `SO_TRICH_LAP_TRONG_KY` | Rủi ro khoản vay và dự phòng cụ thể theo quy tắc nghiệp vụ hiện hành |
| `KH02` | Phát sinh cả tháng | `CUSTSEQ`, `TRBRCD`, `ACCTCD`, `CRAMT`, `DRAMT` | Phí bảo lãnh, chuyển tiền, NHĐT, thẻ, TTQT, KDNT và các nhóm phí khác |
| `FTPLN` | Theo **từng ngày** trong tháng | Ngày nghiệp vụ, khoản vay, `LDRBAL`, `CPAMT`, `CPLKAMT` | Kiểm tra đủ ngày, đối chiếu mã KH và dữ liệu FTP; chưa dùng làm KPI gốc/lãi phải thu chính thức |
| `RR01` | Ảnh chụp cuối kỳ | Mã KH, `DUNO_GOC_HIENTAI`, `THU_GOC`, `THU_LAI`, LAV/LDS | Dư nợ đã XLRR và doanh số thu nợ XLRR |
| `GL02` | Phát sinh trong tháng, có thể chia phần | `CUSTOMER`, `LOCAC`, `CRAMOUNT`, `DRAMOUNT`, `TRDATE`, `REMARK` | Doanh số TKTT, dòng tiền theo ngày và giao dịch gần nhất ở cấp KH/chi nhánh |

**Nguồn bổ sung:** Bill Payment dùng mã dịch vụ và tài khoản chuyển để xác định cờ thu hộ điện/nước/viễn thông, bảo an tài khoản/thẻ; tài khoản được đối chiếu DP01 hoặc CN05 theo dạng mã, trường hợp nộp tại quầy đối chiếu CCCD từ nội dung với CIF khi đủ dữ kiện. File bảo lãnh/LC bổ sung cung cấp quan hệ hợp đồng và cờ dịch vụ; OAB/loa biến động số dư đối chiếu tài khoản với DP01. Các nguồn này chỉ dùng được cho kỳ đã đính và đã xử lý hợp lệ.

**Phân loại độ sẵn sàng:** chín nguồn `DP01`, `LN01`, `CN05`, `PF10`, `PF14`, `BC06`, `BC29`, `KH02`, `FTPLN` thuộc bộ nguồn chuẩn phải kiểm tra theo chi nhánh/kỳ. `RR01` và `GL02` được hỗ trợ, giám sát và khai thác nhưng không nằm trong hằng số chín nguồn bắt buộc. Ngoại lệ xử lý khi thiếu nguồn phải được người có thẩm quyền xác nhận; không trình bày kỳ thiếu nguồn như kỳ đã đầy đủ.

## 2.4. Quy tắc tên file – minh họa ngắn gọn

| Kiểu | Ví dụ | Điểm cần kiểm tra |
|---|---|---|
| Nguồn ảnh chụp cuối kỳ | `2600_DP01_20260630.csv`, `2600_RR01_20260630.xlsx` | Mã CN, loại nguồn, ngày kỳ, đuôi CSV/XLSX |
| BC06 nhiều phần | `2600_BC06_20260630_2600_2600_0_001.csv` | Cùng CN/loại/kỳ; giữ hậu tố để phân biệt phần |
| KH02 cả tháng | `2600_KH02_2026060120260630.csv` | Từ ngày đầu tới ngày cuối cùng của cùng tháng |
| GL02 theo khoảng ngày | `2600_GL02_2026060120260630_1.csv` | Hai ngày thuộc cùng tháng; phần `_1` là file chia phần |
| FTPLN theo ngày | `2600_FTPLN_20260601.csv` … `2600_FTPLN_20260630.csv` | Đối chiếu từng ngày còn thiếu theo CN/tháng |

File CIF được nhận diện theo nội dung và quy tắc import CIF riêng, không áp dụng công thức tên `MACN_LOAIFILE_yyyymmdd`. Nguồn định kỳ chuẩn chỉ nhận CSV/XLSX; riêng CIF và một số file bổ sung có hỗ trợ XLS như danh mục ở trên.

## 2.5. Quy trình nhận và biến file thành số liệu

1. **Nhận file từ đầu mối nghiệp vụ:** xác định đúng kỳ, chi nhánh, loại file và phiên bản file. Việc xuất file từ hệ thống gốc phải có quy trình riêng do chủ nguồn xác nhận.
2. **Import vào kho tương ứng:** CIF vào Kho CIF; 11 nguồn chuẩn vào Kho dữ liệu; Bill Payment/bảo lãnh/OAB vào file bổ sung của kỳ.
3. **Kiểm tra đầu vào:** định dạng/tên file, kỳ/chi nhánh, cột bắt buộc, bản ghi trùng, mã và ngày không hợp lệ. Kho nguồn dùng hash nội dung để cảnh báo file trùng; trạng thái và lỗi được ghi theo job.
4. **Lưu nguồn và giám sát:** dữ liệu đọc được được lưu trong các bảng nguồn; theo dõi ma trận nguồn–chi nhánh, số file và số ngày FTPLN còn thiếu. **Import không tự ghép CIF hoặc tự làm mới Dashboard.**
5. **Chạy xử lý khách hàng cho kỳ:** hệ thống lấy tập KH từ Kho CIF hiện hành, ghép các nguồn cùng kỳ theo mã KH lõi và chi nhánh, chuẩn hóa tỷ giá/công thức, tạo kết quả theo KH–chi nhánh–kỳ rồi tổng hợp một hồ sơ/KH/kỳ.
6. **Đối chiếu và công bố:** KH có mã ở nguồn nhưng không khớp CIF vẫn được giữ ở kho và danh sách **Đối chiếu CIF**, không âm thầm tạo KH trong hồ sơ tổng hợp. Rà số hồ sơ, tổng chỉ tiêu, nguồn thiếu và chênh lệch trước khi dùng báo cáo. Khi CIF hoặc file nguồn thay đổi, kỳ liên quan cần chạy lại; chạy lại **thay kết quả kỳ cũ**, không cộng dồn.

## 2.6. Năm ví dụ “con số này lấy ở đâu?”

| Câu hỏi khi demo | Cách trả lời ngắn, có thể truy vết |
|---|---|
| Có bao nhiêu KH? | Đếm **mã KH lõi khác nhau** trong hồ sơ kỳ theo phạm vi được phép; tập nền là CIF, không đếm số dòng tài khoản DP01 |
| Tổng nguồn vốn huy động là bao nhiêu? | Cộng số dư dương `DP01.CURRENT_BALANCE × TYGIA` theo kỳ/phạm vi; không cộng số dư âm vào tiền gửi |
| Dư nợ cuối kỳ từ đâu? | Tổng `LN01.DU_NO` theo KH–CN; PF10 phân rã thành nhóm vay và LDS để xem sâu, không cộng chồng hai nguồn |
| Tiền gửi CKH và TGTT bình quân từ đâu? | Trên hồ sơ: PF14 `MONTHLYENDBALANCE` khi `MONTERM > 0`, `AVERAGEBALANCE` khi `MONTERM = 0`, có quy đổi ngoại tệ theo tỷ giá DP01 |
| Phí dịch vụ được tính thế nào? | KH02 lọc `ACCTCD` theo nhóm phí rồi tính `SUM(CRAMT) − SUM(DRAMT)`; mã trùng nhóm chỉ được phân vào một nhóm chính, phần chưa phân loại được đối soát riêng |

Ví dụ khác có thể trình bày: dự phòng chung từ dư nợ LN01 nhóm 1–4 nhân 0,75%; dự phòng cụ thể theo BC29 nhóm 2–5; dòng tiền TKTT từ GL02 `LOCAC = 421101`; dư nợ XLRR từ RR01. Khi so sánh, luôn ghi **kỳ – chi nhánh – đơn vị tiền – đã quy đổi hay chưa – công thức**. Một con số âm ở biến động dự phòng/phí có thể phản ánh hoàn nhập hoặc điều chỉnh, không mặc định là lỗi.

## 2.7. Những giới hạn cần nói thẳng

- Kết quả phản ánh **file và kỳ đã nhận/xử lý**, không phản ánh giao dịch thời gian thực. Thiếu file không đồng nghĩa chỉ tiêu bằng 0.
- Tổng hợp toàn bộ quan hệ KH khác với số chỉ thuộc một chi nhánh. Không dùng số toàn quan hệ để quy trách nhiệm cho một đơn vị.
- Thay đổi Kho CIF không tự tính lại các kỳ đã xử lý; cần chạy lại kỳ cần báo cáo.
- Tên cột BC29 `SO_TRICH_LAP_TRONG_KY` đang được dùng như mức dự phòng cụ thể lũy kế cuối kỳ theo quy tắc dự án; định nghĩa cần chủ nguồn xác nhận chính thức trước khi công bố rộng.
- GL02 không cung cấp số tài khoản KH chi tiết cho mọi bút toán; thông tin giao dịch gần nhất được khẳng định ở cấp KH/chi nhánh, không gán chắc chắn vào một tài khoản riêng.
- FTPLN đã được lưu và kiểm tra đủ ngày nhưng **chưa** là nguồn KPI gốc/lãi phải thu chính thức.

# Phần đề xuất để bài thuyết trình hoàn chỉnh

Hai chương trên trả lời **C360 là gì** và **số liệu đến từ đâu**. Để bài trình bày có mở đầu, minh chứng và kết luận rõ ràng, nên thêm các chương sau; chỉ điền số thực tế sau khi chốt một kỳ/phạm vi và đối soát.

## Chương 3 đề xuất. Một hành trình dữ liệu có thể kiểm tra

**Câu hỏi dẫn:** Từ một file được bàn giao, làm sao biết số trên Dashboard đáng tin?

Trình bày một hành trình duy nhất: nhận file → kiểm tra tên/cột/trùng → ma trận độ sẵn sàng theo chi nhánh → chạy xử lý → đối chiếu CIF → kiểm tra tổng và ngoại lệ → mở KPI/danh sách/hồ sơ. Minh họa bằng sơ đồ mũi tên và một ví dụ giả định; tránh đưa bản ghi KH thật vào slide. Nên có hình chụp màn **Giám sát nguồn**, **Xử lý dữ liệu KH**, **Đối chiếu CIF** đã che thông tin nhạy cảm.

## Chương 4 đề xuất. Giá trị sử dụng qua ba tình huống

1. **Lãnh đạo:** chọn kỳ và chi nhánh, xem quy mô tiền gửi/dư nợ, bấm một KPI để biết tập KH cấu thành, so với kỳ trước.
2. **Cán bộ:** tìm một KH trong phạm vi được giao, xem quan hệ tiền gửi–vay–dịch vụ và lịch sử nhiều kỳ để chuẩn bị chăm sóc KH.
3. **Người quản trị dữ liệu:** thấy một nguồn/chi nhánh còn thiếu, tìm đúng file/ngày thiếu hoặc mã KH chưa khớp CIF, rồi rà nguyên nhân trước khi công bố.

Mỗi tình huống nên có **một câu hỏi → hai thao tác → một kết quả → một lưu ý về phạm vi**. Chỉ dùng dữ liệu demo/đã được phép công bố.

## Chương 5 đề xuất. Điều kiện vận hành và bước tiếp theo

Nói ngắn gọn ba điều kiện để dùng C360 như nguồn báo cáo nội bộ ổn định: **nguồn đủ và được chủ nguồn xác nhận**, **quyền truy cập/nhật ký được kiểm thử**, **máy chủ có dung lượng, backup và khả năng phục hồi**. Việc rà soát backend còn ghi nhận điểm thiếu kiểm tra quyền ở thao tác cập nhật trạng thái đối chiếu CIF; điểm này cần khắc phục và kiểm thử trước khi xem hệ thống đã sẵn sàng production. Báo cáo hạ tầng ngày 08/09/2026 từng ghi nhận ổ C/D còn ít chỗ và máy chủ thử nghiệm là laptop; đây là **ảnh chụp tại ngày đó**, cần đo lại trước buổi thuyết trình, không đọc như hiện trạng chắc chắn của hôm nay. Chưa có load test chính thức cho 100 người dùng đồng thời nên không đưa ra cam kết chịu tải.

Kết bài bằng quyết định cụ thể cần lãnh đạo thống nhất: đầu mối cung cấp từng file và hạn gửi; người xác nhận công thức/chênh lệch; kỳ/phạm vi thí điểm; kế hoạch dung lượng, backup và kiểm thử tải. Không trình bày “đã hoàn tất production” khi các điều kiện này chưa được xác nhận.

## Dàn ý 12 slide gợi ý cho NotebookLM

| Slide | Tiêu đề đề xuất | Một thông điệp cần nhớ | Minh họa nên dùng |
|---:|---|---|---|
| 1 | C360 – góc nhìn thống nhất về khách hàng | Một KH lõi, nhiều quan hệ, một nơi tra cứu | Ảnh giao diện đã che dữ liệu nhạy cảm |
| 2 | Bài toán trước khi có C360 | File phân tán làm việc ghép và giải trình mất thời gian | Sơ đồ nhiều file → người dùng |
| 3 | Mục tiêu và đối tượng sử dụng | Hợp nhất – điều hành – chăm sóc – kiểm soát | Bốn biểu tượng vai trò |
| 4 | Phạm vi và nguyên tắc dữ liệu | CIF là nền; số nghiệp vụ theo kỳ và chi nhánh | Sơ đồ một KH nhiều CN |
| 5 | Các nhóm chức năng | Từ Dashboard tới chi tiết, từ import tới quản trị | Bản đồ menu, không liệt kê mọi nút |
| 6 | Nguồn dữ liệu hiện có | CIF + 11 nguồn định kỳ + file bổ sung | Nhóm nguồn theo tiền gửi/vay/phí/dịch vụ |
| 7 | Quy trình nhận file và kiểm tra | Có file chưa chắc đủ; import chưa phải xử lý KH | Timeline sáu bước ở mục 2.5 |
| 8 | Từ nguồn tới hồ sơ KH | Một KH/kỳ, giữ chi tiết theo từng CN | Sơ đồ ba lớp dữ liệu |
| 9 | Một chỉ tiêu được tạo ra thế nào | KPI có nguồn, cột, công thức, kỳ và phạm vi | Ví dụ tổng nguồn vốn hoặc dư nợ |
| 10 | Demo ba tình huống sử dụng | Thao tác cho ra quyết định/việc cần xử lý | Ba ảnh màn hình đã ẩn thông tin |
| 11 | Kiểm soát và giới hạn | Thiếu nguồn, chưa khớp CIF, ngoại lệ phải hiện rõ | Ma trận nguồn + ô cảnh báo |
| 12 | Kết luận và đề nghị | Chốt chủ nguồn, công thức, hạ tầng và kỳ thí điểm | Bốn quyết định cần phê duyệt |

**Nhịp trình bày đề xuất:** 12–15 phút thuyết trình, 3–5 phút demo, sau đó hỏi đáp. Mỗi slide nên có một câu kết luận, tối đa một sơ đồ/bảng chính; công thức chi tiết và mã cột để ở phụ lục hoặc ghi chú, không nhồi vào slide. Không dùng số liệu minh họa làm KPI chính thức.

## Đoạn yêu cầu có thể dán vào NotebookLM

> Hãy tạo bài thuyết trình 12 slide bằng tiếng Việt từ tài liệu này cho lãnh đạo và cán bộ nghiệp vụ. Bám sát trạng thái chức năng đã triển khai; tách riêng các phần “đề xuất”, “chưa xác nhận” và “ảnh chụp hiện trạng 08/09/2026”. Mỗi slide có một thông điệp chính, tối đa ba ý ngắn, gợi ý hình minh họa và ghi chú nói 30–60 giây. Giải thích rõ CIF là tập khách hàng nền, file nguồn được import rồi mới xử lý theo kỳ, khách hàng đa chi nhánh được gom theo mã lõi nhưng vẫn giữ số theo chi nhánh. Không tự bịa số liệu, tên hệ thống xuất file, người phụ trách, mức tiết kiệm thời gian hoặc khả năng chịu tải. Không hiển thị CCCD, số tài khoản hay thông tin khách hàng thật.

## Tài liệu đối chiếu trong dự án

- [Báo cáo chức năng, nguồn dữ liệu và hạ tầng](BAO_CAO_CHUC_NANG_NGUON_DU_LIEU_HA_TANG_C360.md): căn cứ chính về nguồn, công thức, hiện trạng tại ngày 08/09/2026.
- [Quy trình vận hành hệ thống](QUY_TRINH_VAN_HANH_HE_THONG_C360.md): vận hành Docker, import, xử lý và giám sát.
- [Hướng dẫn sử dụng chi tiết](HUONG_DAN_SU_DUNG_CHI_TIET_HE_THONG_C360.md): tên menu và cách dùng bộ lọc/hồ sơ.
- [Đặc tả nguồn dữ liệu](DAC_TA_NGUON_DU_LIEU_C360.md): tên file, cột, kiểm tra và công thức nguồn.
- [Bộ mã nhận diện file nguồn](../backend/app/imports/filename_parser.py) và [danh mục nguồn bắt buộc](../backend/app/customer_processing.py): quy tắc đang triển khai.

> **Lưu ý bảo mật:** trước khi tải tài liệu, ảnh màn hình hoặc dữ liệu lên NotebookLM hay dịch vụ bên ngoài, cần tuân thủ quy định phê duyệt dữ liệu của đơn vị. Không tải file nguồn, thông tin định danh KH, tài khoản, mật khẩu, cấu hình bí mật hoặc báo cáo chứa dữ liệu chưa được phép chia sẻ.
