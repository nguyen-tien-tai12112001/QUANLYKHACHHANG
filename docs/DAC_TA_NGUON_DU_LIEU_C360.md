# ĐẶC TẢ NGUỒN DỮ LIỆU C360

- **Mã tài liệu:** C360-DATA-03
- **Phiên bản:** 1.0
- **Ngày cập nhật:** 21/09/2026
- **Nguồn chuẩn kỹ thuật:** `backend/app/imports/filename_parser.py`, `mappings.py`, `importer.py`, `cif_importer.py`, `customer_processing.py`, `fee_rules.py`

> Tài liệu này là đầu mối duy nhất mô tả file đầu vào. Từ điển trường báo cáo tiếp tục được duy trì tại `TU_DIEN_DU_LIEU_BAO_CAO.md`; logic PF10 chuyên sâu nằm tại `PHAN_TICH_VA_THIET_KE_NGUON_PF10.md`.

## 1. Nguyên tắc dữ liệu

1. Kho CIF là tập khách hàng nền khi xử lý mọi kỳ; CIF không phụ thuộc tháng đang xem.
2. Import chỉ nạp nguồn vào kho, không tự cập nhật Dashboard/hồ sơ đã xử lý.
3. Chỉ khi chạy **Xử lý dữ liệu KH**, các nguồn mới được ghép CIF và tạo kết quả theo kỳ.
4. Nguồn không khớp CIF vẫn được giữ trong kho và đưa vào danh sách đối chiếu; không tự tạo master KH từ DP01.
5. Một mã KH lõi có thể có CIF/quan hệ tại nhiều chi nhánh. Ví dụ `2600xxxxxxxxx` và `2602xxxxxxxxx` có cùng chín số lõi là một khách hàng lõi.
6. Tiền ngoại tệ phải quy đổi theo tỷ giá hợp lệ; không được cộng trực tiếp số nguyên tệ khác nhau.
7. Số dư DP01 âm không tính vào tiền gửi vì được xem là thấu chi và đã phản ánh ở tín dụng.
8. Mỗi công thức phải có nguồn, cột, bộ lọc, grain, kỳ và trạng thái quy đổi ngoại tệ.

## 2. Danh mục nguồn

| Nguồn | Tần suất | Định dạng | Vai trò chính | Trạng thái độ sẵn sàng hiện tại |
|---|---|---|---|---|
| CIF | Không theo kỳ | CSV/XLS/XLSX | Master khách hàng | Kho riêng; không thuộc ma trận kỳ |
| DP01 | Cuối kỳ | CSV/XLSX | Tài khoản tiền gửi, nguồn vốn, tỷ giá hỗ trợ | Bắt buộc |
| LN01 | Cuối kỳ | CSV/XLSX | Dư nợ, nhóm nợ, CBTD | Bắt buộc |
| CN05 | Cuối kỳ | CSV/XLSX | Sản phẩm/dịch vụ | Bắt buộc |
| PF10 | Cuối kỳ | CSV/XLSX | Chi tiết LDS và cơ cấu dư nợ | Bắt buộc |
| PF14 | Cuối kỳ | CSV/XLSX | Số dư cuối kỳ/bình quân tài khoản | Bắt buộc |
| BC06 | Cuối kỳ, có thể nhiều phần | CSV/XLSX | Phân hạng, phân khúc, đơn vị đầu mối | Bắt buộc |
| BC29 | Cuối kỳ | CSV/XLSX | Nhóm nợ, tài sản bảo đảm, dự phòng | Bắt buộc |
| KH02 | Cả tháng | CSV/XLSX | Phát sinh thu phí | Bắt buộc |
| FTPLN | Hằng ngày | CSV/XLSX | FTP khoản vay/ngày | Bắt buộc và kiểm tra đủ ngày |
| RR01 | Cuối kỳ | CSV/XLSX | Dư nợ và thu nợ đã XLRR | Hỗ trợ; chưa chặn độ sẵn sàng |
| GL02 | Cả tháng, có thể nhiều phần | CSV/XLSX | Dòng tiền/giao dịch TKTT | Hỗ trợ; chưa chặn độ sẵn sàng |
| Bill Payment | File bổ sung | XLS/XLSX | Thu hộ và ABIC | Tùy chọn |
| Bảo lãnh/LC, OAB | File bổ sung | Theo mẫu đã cấu hình | Cờ sản phẩm bổ sung | Tùy chọn |

Nếu chính sách nghiệp vụ yêu cầu RR01/GL02 trở thành bắt buộc, phải đổi cấu hình/code độ sẵn sàng và kiểm thử; không chỉ sửa nhãn giao diện.

## 3. Quy tắc tên file

### 3.1. Nguồn snapshot cuối kỳ

```text
MACN_LOAIFILE_yyyymmdd.csv
MACN_LOAIFILE_yyyymmdd.xlsx
```

Áp dụng cho `DP01`, `LN01`, `CN05`, `PF10`, `PF14`, `BC29`, `RR01`.

Ví dụ:

```text
2600_DP01_20260731.csv
2602_PF10_20260731.xlsx
2604_RR01_20260731.csv
```

### 3.2. BC06 nhiều phần

```text
2600_BC06_20260731.csv
2602_BC06_20260731_2600_2602_0_001.csv
```

Hệ thống lấy ba thành phần đầu `MACN_BC06_yyyymmdd`; hậu tố được chấp nhận.

### 3.3. KH02 cả tháng

```text
MACN_KH02_yyyymmddyyyymmdd.csv
```

Ví dụ `2600_KH02_2026070120260731.csv`. Ngày đầu phải là ngày 01 và ngày cuối phải là ngày cuối cùng của cùng tháng.

### 3.4. GL02 cả tháng và nhiều phần

```text
MACN_GL02_yyyymmddyyyymmdd.csv
MACN_GL02_yyyymmddyyyymmdd_1.csv
```

Ngày bắt đầu/kết thúc phải hợp lệ và cùng tháng. Hậu tố số dùng cho file chia phần.

### 3.5. FTPLN theo ngày

```text
MACN_FTPLN_yyyymmdd.csv
```

Kỳ được quy về ngày cuối tháng. Hệ thống kiểm tra từng ngày trong tháng và chỉ ra ngày thiếu theo chi nhánh.

### 3.6. CIF

CIF hỗ trợ `.csv`, `.xls`, `.xlsx`, nhiều sheet và có thể chứa nhiều chi nhánh trong một file. Tên thường dùng `2600CIF.xlsx` hoặc tên mô tả tương đương; chi nhánh chuẩn lấy từ `CUSTNO`, không bắt buộc toàn file chỉ có một chi nhánh.

## 4. Kiểm tra chung trước import

- Đúng loại file và phần mở rộng hệ thống hỗ trợ.
- Không đổi tên header, không thêm khoảng trắng/ký tự ẩn.
- Mã, số tài khoản, CCCD, mã số thuế phải đọc dưới dạng text để giữ số 0 đầu và dấu `-`.
- Kỳ trong tên khớp kỳ trong nội dung nếu nguồn có cột ngày.
- File không rỗng, không hỏng và không bị khóa bởi Excel.
- Ghi nhận tên file, dung lượng, checksum, người import và thời điểm.
- Bản ghi lỗi không được sửa trực tiếp trong DB; sửa file nguồn rồi import lại đúng quy trình.

## 5. Kho CIF

### 5.1. Cột tối thiểu bắt buộc

`custno`, `nm`, `nmloc`, `custtpcd`, `custdtltpcd`, `regno`, `stscd`.

### 5.2. Chuẩn hóa và sử dụng

| Thông tin | Cột CIF | Xử lý |
|---|---|---|
| Mã CIF đầy đủ | `custno` | Đúng 13 chữ số; bốn số đầu là CN, chín số sau là mã KH lõi |
| Tên KH | `nmloc` (fallback `nm`) | Trim; lưu cả giá trị nguồn |
| Tên chủ doanh nghiệp | `GD_TEN` nếu có | Dùng cho tổ chức |
| Loại KH | `custtpcd`, `custdtltpcd` | Giữ mã; diễn giải bằng danh mục |
| CCCD/ĐKKD | `regno` | Bỏ khoảng trắng; giữ dạng text |
| Mã số thuế | `taxno` | Giữ nguyên text, kể cả dấu `-` |
| Địa chỉ | `addr1loc`, `addr2loc`, `addr3loc` | Bỏ rỗng và ghép bằng `, ` |
| Điện thoại | ưu tiên `name_4`, sau đó các cột `telno*` | Ghép/chuẩn hóa text |
| Ngày thành lập | `issuedt4` | `yyyymmdd` → kiểu ngày |
| Giới tính | `name_3` | Chỉ áp dụng KH cá nhân |
| Ngày sinh | `name_1` hoặc `GD_NGAYSINH` theo loại KH | Chuẩn hóa kiểu ngày |
| Nghề nghiệp/ngành nghề | `profnm` | Trim |
| Trạng thái | `stscd` | Mapping active/inactive/invalid/unverified/unknown |

### 5.3. Trùng lặp và xung đột

- `CUSTNO` trùng trong cùng file: giữ bản đầu, các bản sau bỏ qua và ghi warning.
- `CUSTNO` đã tồn tại nhưng nguồn mới thay đổi: lưu source record/xung đột để người có quyền rà soát; không tự ghi đè master.
- Trùng `regno` giữa nhiều KH lõi: tạo xung đột định danh.
- Quyết định ghi đè phải lưu người thực hiện, thời gian, giá trị cũ/mới và nguồn.

## 6. DP01 – tiền gửi và tỷ giá hỗ trợ

**Cột yêu cầu:** `MA_CN`, `MA_KH`, `TEN_KH`, `DP_TYPE_NAME`, `CCY`, `CURRENT_BALANCE`, `SO_TAI_KHOAN`, `OPENING_DATE`, `MATURITY_DATE`, `MONTH_TERM`, `MA_PGD`, `TEN_PGD`, `DP_TYPE_CODE`, `CUST_TYPE`, `CUST_TYPE_NAME`, `ID_NUMBER`, `SEX_TYPE`, `BIRTH_DATE`, `TELEPHONE`, `DRAMT`, `CRAMT`, `EMPLOYEE_NUMBER`, `EMPLOYEE_NAME`, `TYGIA`.

**Khai thác chính:**

- Tài khoản tiền gửi, loại tiền gửi, kỳ hạn, ngày mở/đến hạn và số dư hiện tại.
- Tỷ giá theo `CCY` phục vụ quy đổi nguồn khác.
- Tài khoản thanh toán dùng để đối chiếu Bill Payment.
- `CUST_TYPE = 570` dùng nhận diện tài khoản hộ kinh doanh theo cấu hình hiện hành.
- CBQL từ `EMPLOYEE_NUMBER` chỉ là nguồn ưu tiên sau user gắn KH, BC06 và LN01.

**Kiểm soát:** `CURRENT_BALANCE < 0` không cộng vào nguồn vốn huy động; tài khoản/số tiền phải phân nhóm theo trạng thái, kỳ hạn và loại tiền.

## 7. LN01 – tiền vay và dự phòng chung

**Cột yêu cầu:** `BRCD`, `CUSTSEQ`, `CUSTNM`, `CCY`, `DU_NO`, `DSBSSEQ`, `TRANSACTION_DATE`, `INTEREST_RATE`, `APPRSEQ`, `LOAN_TYPE`, `OFFICER_ID`, `OFFICER_NAME`, `TRCTCD`, `TRCTNM`, `ACCRUAL_AMOUNT`, `ACCRUAL_AMOUNT_END_OF_MONTH`, `TY_GIA`, `OFFICER_IPCAS`.

**Khai thác chính:** dư nợ cuối kỳ, khoản/LDS tham chiếu, nhóm nợ nếu file có trường mở rộng, lãi suất và CBTD.

**DPRR chung:**

```text
DPRR_CHUNG_LK = SUM(DU_NO của nhóm nợ 1–4) × 0,75%
DPRR_CHUNG_TT = DPRR_CHUNG_LK kỳ này − DPRR_CHUNG_LK kỳ trước
```

Tính trước theo KH lõi–chi nhánh rồi mới cộng lên hồ sơ toàn bộ quan hệ. Giá trị tháng âm nghĩa là mức lũy kế giảm so với kỳ trước, không mặc nhiên là lỗi.

## 8. PF10 – chi tiết LDS và cơ cấu dư nợ

**Cột yêu cầu:** `TRDATE`, `TRBRCD`, `ACCTNO`, `CUSTSEQ`, `CUSTNAME`, `LNTYPE`, `BSACCTCD`, `AVGBAL`, `EOMBAL`, `MONTERM`, `OPNDT`, `MATDT`, `CLSDT`, `CONTRATE`, `MMTOTINT`, `BVCORRINT`, `ACCRUALS`, `INTEREST`, `RATIO`, `CCY`.

Chuẩn hóa `CUSTSEQ` bằng cách bỏ dấu `'` và trim. `TRBRCD + CUSTSEQ` là mã quan hệ chi nhánh; `CUSTSEQ` là mã lõi dùng ghép CIF.

| `LNTYPE` | Nhóm |
|---|---|
| `100` | Ngắn hạn |
| `110`, `120` | Trung/dài hạn |
| `241` | Thấu chi |

Chỉ tiêu:

```text
Dư nợ cuối kỳ theo loại = SUM(EOMBAL × tỷ giá)
Dư nợ bình quân theo loại = SUM(AVGBAL × tỷ giá)
```

PF10 dùng phân rã loại vay/LDS; tổng dư nợ chính đối chiếu LN01. Không cộng LN01 và PF10 với nhau.

## 9. PF14 – số dư cuối kỳ và bình quân

**Cột yêu cầu:** `TRBRCD`, `PRODUCTCODE`, `ACCOUNTNO`, `CUSTSEQ`, `CUSTNAME`, `AVERAGEBALANCE`, `MONTHLYENDBALANCE`, `OPERATIONALFUNDS`, `MONTERM`, `CCY`.

| Nhóm | Điều kiện/công thức |
|---|---|
| TG không kỳ hạn/TKTT | `MONTERM = 0` |
| TG có kỳ hạn | `MONTERM > 0` |
| Số dư cuối kỳ | `SUM(MONTHLYENDBALANCE × tỷ giá)` |
| Số dư bình quân | `SUM(AVERAGEBALANCE × tỷ giá)` |

`ACCOUNTNO` là số tài khoản/sổ của PF14; không tự coi mọi giá trị là tài khoản thanh toán nếu chưa xét kỳ hạn/sản phẩm.

## 10. CN05 – sản phẩm dịch vụ

**Cột yêu cầu:** `MA_CN`, `MA_KH`, `TEN_KH`, `TKTT_SO_TK`, `TKTT_TK_SODEP`, `TK_OSB`, `TG_TIEN_GUI_LOI_THONG_MINH`, `TG_TIEN_GUI_TRUC_TUYEN`, `TG_TIEN_GUI_TAI_QUAY`, `TG_SMS_TIEN_GUI`, `VV_TONG_SO_LDS`, `VV_SMS_TIEN_VAY`, `VV_TONG_SO_LDS_CENTERCUT`, `THE_GHI_NO_NOI_DIA`, `THE_GHI_NO_QUOC_TE`, `THE_TIN_DUNG_NOI_DIA`, `THE_TIN_DUNG_QUOC_TE`, `VISA`, `MASTER`, `JCB`, `DK_AGRIBANK_PLUS`, `DK_AGRIBANK_PLUS_OTT`, `SMS_BANKING`, `TIEN_VAY`.

Giá trị lớn hơn 0 thể hiện có sử dụng/số lượng theo ý nghĩa cột. Không suy diễn số thẻ hoặc số đăng ký chi tiết nếu nguồn chỉ cung cấp cờ/số lượng tổng hợp.

## 11. BC06 – phân hạng và đơn vị đầu mối

**Cột yêu cầu:** 28 cột từ `MA_CHI_NHANH`, `TEN_CHI_NHANH`, `MA_KHACH_HANG`, `TEN_KHACH_HANG`, `LOAI_KHACH_HANG` tới `DON_VI_DIEU_CHINH`, `DON_VI_DAU_MOI`; danh sách chính xác nằm trong `backend/app/imports/mappings.py`.

Khai thác: phân khúc/hạng tại chi nhánh và toàn hệ thống, điểm lợi ích/số dư, đơn vị đầu mối. `DON_VI_DAU_MOI` được mapping bằng danh mục chi nhánh; không hard-code tên rời rạc trong giao diện.

## 12. BC29 – rủi ro tín dụng và DPRR cụ thể

**Cột chính:** `MA_CN`, `MA_KH`, `TEN_KH`, `NHOM_NO`, `TONG_DN`, `TONG_DN_PHAI_TRICH`, `SO_TRICH_LAP_TRONG_KY`, các nhóm tài sản bảo đảm, ngày quá hạn, lãi dự thu, dư nợ ngoại bảng/tín dụng/thấu chi, số tiền đã XLRR và cán bộ/đơn vị.

```text
DPRR_CUTHE_LK = SUM(SO_TRICH_LAP_TRONG_KY của nhóm nợ 2–5)
DPRR_CUTHE_TT = DPRR_CUTHE_LK kỳ này − DPRR_CUTHE_LK kỳ trước
```

> **CẦN XÁC NHẬN NGHIỆP VỤ:** tên cột `SO_TRICH_LAP_TRONG_KY` đang được dùng như giá trị lũy kế cuối kỳ theo quy tắc đã thống nhất trong dự án. Chủ nguồn cần xác nhận bằng văn bản.

## 13. KH02 – phí theo khách hàng

**Cột yêu cầu:** `TRDATE`, `TRBRCD`, `CUSTSEQ`, `CUSTNAME`, `USERHT`, `DYSEQ`, `DYTRSEQ`, `ACCTCD`, `BUSCD`, `UNITBUSCD`, `TRCD`, `TRREF`, `TRSEQ`, `TRCTCD`, `CBTD`, `DRAMT`, `CRAMT`.

Công thức chung theo KH lõi–chi nhánh:

```text
Phí = SUM(CRAMT) − SUM(DRAMT)
```

Phân loại tài khoản chuẩn, không chồng lặp:

| Chỉ tiêu | Prefix `ACCTCD` |
|---|---|
| Phí bảo lãnh | `7040` |
| Phí chuyển tiền | `711001`, `711002` |
| Phí NHĐT | `711036`, `711037`, `711039` |
| ABIC/BATĐ | `714` |
| Phí KDNT | `721001` |
| Phí LC | `709002` |
| Phí TTQT | `711003`–`711014`, `711096` |
| Phí thẻ | `711015`, `711016`, `711022`–`711028`, `711051`, `711052`, `711059` |
| Phí khác | `711031`, `711035`, `711042`, `711044`, `711098` |

Mã đã thuộc một nhóm không được tính lại ở nhóm khác. Các tài khoản họ `7040`, `709`, `711`, `714`, `721` chưa phân loại phải xuất báo cáo đối soát thay vì bị ẩn.

## 14. FTPLN – dữ liệu FTP theo ngày

**Cột yêu cầu:** 31 cột từ `TRDT`, `BRCD`, `PRNTBRCD`, hợp đồng/tham chiếu, `CUSTSEQ`, `FTP`, `INTRT`, `OPNDT`, `MATDT`, `CCY`, `LDRBAL`, chi phí vốn đến `HANGFINAL`.

Kiểm soát đặc thù:

- `TRDT` phải khớp ngày trên tên file.
- Mỗi chi nhánh cần đủ từng ngày lịch trong tháng theo quy tắc hiện hành.
- Màn giám sát phải hiển thị cụ thể ngày thiếu.
- Chưa công bố FTPLN là nguồn chính thức cho gốc/lãi phải thu nếu nghiệp vụ chưa xác nhận.

## 15. RR01 – xử lý rủi ro

**Cột yêu cầu:** thông tin chi nhánh/KH/LDS/LAV, ngày giải ngân/đến hạn/XLRR, dư nợ gốc/lãi ban đầu và hiện tại, dư nợ theo kỳ hạn, `THU_GOC`, `THU_LAI`, tài sản bảo đảm.

```text
DUNO_XLRR = SUM(DUNO_GOC_HIENTAI)
DS_THUNO_XLRR = SUM(THU_GOC) + SUM(THU_LAI)
```

Tổng ngoài card theo KH; drill-down giữ chi tiết LAV/LDS và chi nhánh.

## 16. GL02 – dòng tiền tài khoản thanh toán

**Cột yêu cầu:** `TRDATE`, `TRBRCD`, `USERID`, `JOURSEQ`, `DYTRSEQ`, `LOCAC`, `CCY`, `BUSCD`, `UNIT`, `TRCD`, `CUSTOMER`, `TRTP`, `REFERENCE`, `REMARK`, `DRAMOUNT`, `CRAMOUNT`, `CRTDTM`.

Chuẩn hóa `CUSTOMER` dạng `2600-012345678` thành mã KH lõi sau dấu `-`. Loại `CUSTOMER = xxxx-000000000`.

```text
DS_TKTT = SUM(CRAMOUNT) khi LOCAC = 421101 và giao dịch hợp lệ
NGAY_UPDATE = MAX(TRDATE hoặc CRTDTM)
```

`REMARK` dùng mô tả giao dịch; cần phân biệt diễn giải tự động hệ thống với nội dung do KH nhập. Hoạt động TKTT phải dựa trên tài khoản/giao dịch hợp lệ, không chỉ đếm dòng.

## 17. Bill Payment và file bổ sung

Bill Payment lưu vào bảng bổ sung theo kỳ; mã dịch vụ phải quản lý bằng cấu hình nghiệp vụ, không viết cứng rải rác.

| Cờ | Mã/điều kiện hiện hành | Cách ghép KH |
|---|---|---|
| `THUHO_DIEN` | `994,995,996,997,999,1003` | `STK chuyển` ↔ DP01 `SO_TAI_KHOAN` |
| `THUHO_NUOC` | `1235,6626,10929,10930,10931,10932,6541` | Như trên |
| `THUHO_DT` | `312,333,360,409,363` | DP01; tài khoản `8888...` qua CN05; `user deposit` tách CCCD từ nội dung rồi đối chiếu CIF |
| `ABIC_BATK` | DV `1218`, số tiền `77.000` | STK chuyển ↔ DP01 |
| `ABIC_BATHE` | DV `1218`, số tiền `18.000` | STK chuyển ↔ DP01 |

File bổ sung phải được import qua phần mềm để có metadata, người tải, trạng thái và liên kết kỳ; chỉ copy vào ổ D không làm hệ thống tự xử lý.

## 18. Ghép mã khách hàng và quản lý

### 18.1. Ghép CIF

- Mọi nguồn chuẩn hóa về mã KH lõi rồi ghép `cif_customers.customer_core_code` khi xử lý kỳ.
- Đối chiếu dùng Kho CIF hiện hành tại thời điểm chạy, không dùng “CIF của tháng”.
- Không khớp CIF: lưu `customer_source_reconciliations` với nguồn, CN, mã, tên, số dòng, số tiền và lý do.

### 18.2. Ưu tiên CBQL

1. User hệ thống được gắn trực tiếp một mã KH đầy đủ/lõi phù hợp.
2. BC06 `DON_VI_DAU_MOI` để xác định đơn vị quản lý.
3. LN01 `OFFICER_ID/OFFICER_NAME`, chỉ công nhận khi mã CBTD khớp user.
4. DP01 `EMPLOYEE_NUMBER/EMPLOYEE_NAME`, chỉ công nhận khi mã nhân viên khớp user.
5. Quan hệ chi nhánh CIF; nếu không xác định được cán bộ thì để trống/chưa xác định.

CBQL phải theo từng quan hệ chi nhánh; không sao chép một cán bộ sang chi nhánh khác nếu nguồn/danh mục không chứng minh.

## 19. Quy đổi ngoại tệ

- Chuẩn hóa `CCY` trước khi tra tỷ giá.
- Ưu tiên tỷ giá của kỳ từ DP01 theo logic hệ thống.
- Lưu/hiển thị rõ giá trị nguyên tệ, tỷ giá và VNĐ quy đổi khi cần truy vết.
- Thiếu tỷ giá không được mặc định bằng 1, trừ VND hoặc quy tắc đã được phê duyệt.
- Báo cáo phải nêu “đã quy đổi” hay “nguyên tệ”.

## 20. Kiểm soát chất lượng và nghiệm thu nguồn

Mỗi nguồn cần kiểm tra:

- Đủ chi nhánh/file/ngày.
- Đủ cột bắt buộc và kiểu dữ liệu.
- Số dòng nguồn = thành công + cảnh báo/bỏ qua + lỗi.
- Tỷ lệ mã KH khớp CIF.
- Mã KH rỗng/không hợp lệ.
- Trùng khóa nghiệp vụ, trùng file/checksum.
- Tổng số tiền trước và sau import.
- Tỷ lệ ngoại tệ thiếu tỷ giá.
- Biến động bất thường so với kỳ trước.
- Truy được import batch/file và raw record.

## 21. Quy trình thêm nguồn mới

1. Lập phiếu đặc tả: chủ nguồn, grain, khóa, kỳ, tên file, cột và mẫu dữ liệu.
2. Xác định nguồn bắt buộc hay bổ sung.
3. Tạo bảng staging/raw riêng; không nhét tùy ý vào bảng nguồn khác.
4. Viết parser, chuẩn hóa và kiểm tra chất lượng.
5. Xác định cách ghép CIF, chi nhánh, tỷ giá và xử lý mã không khớp.
6. Đưa mã/danh mục có thể đổi vào cấu hình nghiệp vụ.
7. Tạo migration, index theo truy vấn và chính sách lưu giữ.
8. Viết test import, test công thức và test đối soát.
9. Cập nhật tài liệu này, từ điển mapping và ma trận quyền.
10. Chỉ công bố KPI sau khi chủ nguồn/nghiệp vụ ký xác nhận.

## 22. Nội dung cần chủ nguồn xác nhận

| Nội dung | Trạng thái |
|---|---|
| Ý nghĩa chính thức toàn bộ mã `DP_TYPE_CODE`, `CUST_TYPE`, `PRODUCTCODE` | Chưa đủ danh mục |
| BC29 `SO_TRICH_LAP_TRONG_KY` là kỳ hay lũy kế | Cần xác nhận |
| FTPLN dùng chính thức cho chỉ tiêu nào | Cần xác nhận |
| Ngưỡng hoạt động/ít hoạt động TKTT | Cần phê duyệt |
| Tỷ giá áp dụng cho từng nguồn và trường hợp thiếu | Cần phê duyệt |
| SLA cung cấp file và người chịu trách nhiệm từng nguồn | Cần điền |
