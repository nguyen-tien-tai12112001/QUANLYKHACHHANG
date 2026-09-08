# BÁO CÁO TÓM TẮT DỰ ÁN C360

**Thời điểm báo cáo:** 08/09/2026  
**Phạm vi:** Quản lý, tổng hợp và phân tích dữ liệu khách hàng tập trung  
**Tài liệu giải trình chi tiết:** [Chức năng, nguồn dữ liệu và hiện trạng hạ tầng](./BAO_CAO_CHUC_NANG_NGUON_DU_LIEU_HA_TANG_C360.md)

## 1. Mục tiêu dự án

C360 được xây dựng để hình thành một hồ sơ khách hàng tập trung từ Kho CIF và các nguồn nghiệp vụ. Hệ thống giúp lãnh đạo, đơn vị và cán bộ:

- Xem đầy đủ quan hệ tiền gửi, tiền vay, phí và sản phẩm của từng khách hàng.
- Theo dõi khách hàng có quan hệ tại nhiều chi nhánh mà không đếm trùng.
- Phân tích số liệu theo kỳ, chi nhánh, phòng ban và cán bộ.
- Đi từ chỉ tiêu tổng hợp đến khách hàng và nguồn dữ liệu tạo ra chỉ tiêu.
- Kiểm soát file thiếu, dữ liệu sai và mã khách hàng chưa đối chiếu được với CIF.

## 2. Kết quả đã đạt được

| Nội dung | Kết quả hiện tại |
|---|---:|
| Khách hàng trong Kho CIF | **520.532** |
| File nguồn đã import thành công | **492** |
| Loại nguồn định kỳ được hỗ trợ | **11** |
| Kỳ dữ liệu đang có | **05/2026–08/2026** |
| Kỳ đã xử lý thành hồ sơ C360 | **05/2026, 06/2026, 07/2026** |
| Hồ sơ mỗi kỳ đã xử lý | **518.672** |
| Quy mô database | **khoảng 30 GB** |

Hệ thống đã hoàn thành các nhóm chức năng chính:

1. Kho dữ liệu CIF và quản trị xung đột định danh.
2. Kho dữ liệu nguồn theo kỳ và theo chi nhánh.
3. Giám sát mức độ đầy đủ của từng nguồn.
4. Xử lý dữ liệu khách hàng theo job nền.
5. Dashboard điều hành và cảnh báo khách hàng.
6. Hồ sơ khách hàng C360 theo mã khách hàng lõi.
7. Phân tích tiền gửi, tiền vay, rủi ro, thu nhập, sản phẩm, đơn vị và cán bộ.
8. Đối chiếu CIF, từ điển dữ liệu và truy vết công thức.
9. Quản lý người dùng, nhóm quyền và phạm vi dữ liệu.

## 3. Các nguồn dữ liệu đang khai thác

| Nguồn | Nội dung khai thác chính |
|---|---|
| Kho CIF | Tên, loại KH, CCCD, MST, ngày sinh/thành lập, địa chỉ, điện thoại, nghề nghiệp và trạng thái |
| DP01 | Nguồn vốn huy động, tài khoản, kỳ hạn, tỷ giá, doanh số Có/Nợ và cán bộ tiền gửi |
| LN01 | Tổng dư nợ, loại vay, nhóm nợ, cán bộ tín dụng và DPRR chung |
| PF10 | Chi tiết LDS, dư nợ cuối kỳ/bình quân theo ngắn hạn, trung dài hạn và thấu chi |
| PF14 | Tiền gửi CKH, TGTT bình quân, tài khoản/sổ tiết kiệm và kỳ hạn |
| CN05 | Agribank Plus, SMS, OTT, thẻ, TK số đẹp và các cờ sử dụng sản phẩm |
| BC06 | Phân hạng, phân khúc, lợi ích và đơn vị đầu mối |
| BC29 | Nhóm nợ, quá hạn, tài sản bảo đảm, DPRR cụ thể và dư nợ XLRR |
| KH02 | Phí bảo lãnh, chuyển tiền, NHĐT, ABIC, KDNT, LC, TTQT, thẻ và phí khác |
| FTPLN | Dữ liệu FTP khoản vay theo ngày và kiểm tra đủ ngày trong tháng |
| RR01 | Dư nợ XLRR, thu gốc và thu lãi XLRR |
| GL02 | Doanh số TKTT, dòng tiền theo ngày và giao dịch gần nhất |
| Bill Payment | Thu hộ điện, nước, viễn thông và Bảo an tài khoản/thẻ |

## 4. Nguyên tắc bảo đảm số liệu

- Kho CIF là tập khách hàng nền của mọi kỳ.
- Một mã khách hàng lõi chỉ được tính một lần khi xem toàn hệ thống.
- Khi xem một chi nhánh, hệ thống chỉ cộng phần quan hệ phát sinh tại chi nhánh đó.
- Các nguồn chỉ đối chiếu CIF tại bước xử lý khách hàng, không phải lúc import.
- Bản ghi không khớp CIF vẫn được giữ để kiểm tra, không bị loại âm thầm.
- Số dư DP01 âm không được tính vào tiền gửi vì được xem là thấu chi.
- Ngoại tệ được quy đổi theo tỷ giá DP01 của kỳ.
- Chỉ cán bộ và phòng ban tồn tại trong danh mục hệ thống mới được công nhận.
- Mỗi mã tài khoản KH02 chỉ thuộc một nhóm phí để tránh cộng trùng.
- Chạy lại kỳ sẽ tạo lại kết quả của kỳ đó, không cộng nối lên dữ liệu cũ.

## 5. Vấn đề cần lưu ý về dữ liệu

### 5.1. Kho CIF đã thay đổi

Kho CIF hiện có 520.532 khách hàng trong khi các kỳ đã xử lý có 518.672 hồ sơ. Chênh lệch **1.860 khách hàng** cho thấy CIF đã được cập nhật sau lần xử lý gần nhất.

**Đề xuất:** chạy lại các kỳ cần sử dụng sau khi chốt Kho CIF.

### 5.2. Kỳ tháng 08/2026 chưa hoàn chỉnh

Hiện kỳ 08/2026:

- Đủ 7 chi nhánh: DP01, LN01, PF10, PF14, BC29, KH02, RR01.
- CN05 mới có 4/7 chi nhánh.
- Chưa có BC06, FTPLN và GL02.
- Chưa xử lý thành hồ sơ C360.

**Đề xuất:** không dùng tháng 08/2026 làm kỳ báo cáo hoàn chỉnh cho tới khi nguồn được bổ sung hoặc lãnh đạo nghiệp vụ xác nhận phạm vi thiếu.

### 5.3. Một số công thức cần xác nhận nghiệp vụ

- BC29 có tên cột `SO_TRICH_LAP_TRONG_KY` nhưng hiện đang được dùng như số dự phòng cụ thể lũy kế cuối kỳ.
- FTPLN đã được lưu và kiểm tra đủ ngày nhưng chưa chốt toàn bộ công thức gốc/lãi phải thu trên C360.
- Danh mục mã tài khoản phí và mã dịch vụ cần có đầu mối nghiệp vụ phê duyệt mỗi khi thay đổi.

## 6. Cảnh báo hạ tầng máy chủ

### 6.1. Hiện trạng

| Thành phần | Hiện trạng |
|---|---|
| Máy | HP EliteBook 840 G5 – máy tính xách tay |
| CPU | Intel Core i7-8550U, 4 nhân/8 luồng |
| RAM vật lý | 15,8 GB |
| RAM Docker được cấp | Khoảng 8 GB |
| Ổ C | Còn **7,34 GB**, tương đương **4,7%** |
| Ổ D | Còn **9,49 GB**, tương đương **12,1%** |
| Docker VHDX | Gần **47 GB**, hiện vẫn nằm trên ổ C |
| PostgreSQL | Khoảng **30 GB** |
| Riêng bảng GL02 | Khoảng **17 GB** |

### 6.2. Rủi ro

1. Ổ C có thể hết dung lượng khi PostgreSQL ghi dữ liệu, Docker build image hoặc tạo file tạm.
2. Ổ D hiện không đủ vùng an toàn để chứa database và backup độc lập.
3. GL02 và FTPLN có tốc độ tăng nhanh theo số kỳ.
4. CPU 4 nhân và Docker chỉ có 8 GB RAM dễ quá tải khi nhiều người truy vấn cùng lúc.
5. DB, backend, frontend và cache cùng chạy trên một máy; máy lỗi sẽ dừng toàn hệ thống.
6. Chưa nên cam kết phục vụ khoảng 100 người đồng thời khi chưa load test.
7. Máy chủ không có Internet vẫn chạy được trong LAN, nhưng không thể trực tiếp kéo code/image từ GitHub khi cập nhật.

### 6.3. Kết luận về máy chủ hiện tại

Máy hiện tại phù hợp cho **demo, phát triển và kiểm thử nội bộ**. Máy chưa đáp ứng điều kiện an toàn để vận hành production lâu dài với dữ liệu tăng liên tục và nhiều người sử dụng đồng thời.

## 7. Nội dung đề nghị lãnh đạo phê duyệt

### 7.1. Hạ tầng

- Trang bị máy chủ hoặc workstation tối thiểu 8 nhân CPU, 32 GB RAM; khuyến nghị 64 GB RAM nếu phục vụ khoảng 100 người.
- Ổ NVMe lưu database tối thiểu 1 TB.
- Ổ/NAS backup riêng, không nằm cùng ổ database.
- UPS, IP tĩnh, DNS nội bộ và firewall giới hạn truy cập.
- Cho phép thực hiện load test trước khi đưa vào sử dụng chính thức.

### 7.2. Quản trị dữ liệu

- Chỉ định đầu mối chịu trách nhiệm cho từng nguồn dữ liệu.
- Chốt thời hạn cung cấp file hàng tháng và điều kiện một kỳ được coi là sẵn sàng.
- Phê duyệt danh mục mã tài khoản, mã dịch vụ và công thức chỉ tiêu.
- Phân công xử lý các mã chưa khớp CIF và thông tin cán bộ/phòng ban chưa xác định.
- Phê duyệt thời gian lưu dữ liệu raw, đặc biệt GL02 và FTPLN.

### 7.3. Vận hành

- Backup tự động và kiểm thử phục hồi định kỳ.
- Import/xử lý kỳ ngoài giờ cao điểm.
- Theo dõi dung lượng, CPU, RAM, job lỗi và thời gian phản hồi.
- Chỉ đưa kỳ dữ liệu lên báo cáo khi đã đạt điều kiện sẵn sàng hoặc có xác nhận ngoại lệ.

## 8. Kế hoạch 90 ngày đề xuất

| Giai đoạn | Công việc | Kết quả cần đạt |
|---|---|---|
| 0–30 ngày | Mở rộng ổ đĩa, chuyển Docker data, backup/restore thử, hoàn thiện tháng 08 | Không còn rủi ro hết ổ; có kỳ dữ liệu đủ điều kiện |
| 31–60 ngày | Chốt công thức, làm sạch CIF, xử lý mã chưa khớp, rà quyền | Số liệu có thể giải trình và đúng phạm vi |
| 61–90 ngày | Partition GL02/FTPLN, tối ưu summary, load test 20/50/100 người dùng | Có số đo năng lực và phương án production |

## 9. Kịch bản trình bày trong 5 phút

### Phút 1 – Bài toán

“Dữ liệu khách hàng hiện đến từ nhiều nguồn và nhiều chi nhánh. Một khách hàng có thể xuất hiện nhiều lần, việc tổng hợp thủ công mất thời gian và khó truy lại số liệu.”

### Phút 2 – Giải pháp

“C360 lấy Kho CIF làm danh mục nền, ghép 11 nguồn nghiệp vụ theo mã khách hàng lõi, giữ cả tổng toàn hệ thống và chi tiết từng chi nhánh.”

### Phút 3 – Kết quả

“Hệ thống đang quản lý hơn 520 nghìn khách hàng CIF, đã tiếp nhận 492 file và đã xử lý ba kỳ thành hồ sơ C360. Dashboard có thể đi từ KPI đến danh sách khách hàng và nguồn tạo số.”

### Phút 4 – Khả năng kiểm soát

“Hệ thống kiểm tra file thiếu, dữ liệu chưa khớp CIF, quyền theo chi nhánh/phòng/cán bộ, công thức phí và lịch sử thao tác. Dữ liệu sai không bị bỏ âm thầm.”

### Phút 5 – Nội dung cần hỗ trợ

“Điểm nghẽn hiện nay là máy chủ: ổ C và D gần đầy, database đã 30 GB, máy chỉ có 4 nhân CPU và Docker 8 GB RAM. Đề nghị nâng hạ tầng, chuẩn hóa đầu mối dữ liệu và cho phép kiểm thử tải trước khi vận hành chính thức.”

## 10. Các câu hỏi lãnh đạo có thể đặt ra

### Số liệu có đếm trùng khách hàng không?

Khi xem toàn hệ thống, một mã KH lõi chỉ được đếm một lần. Khi xem chi nhánh, hệ thống chỉ lấy quan hệ phát sinh tại chi nhánh được chọn.

### Có truy được số liệu từ đâu không?

Có. Hệ thống lưu nguồn, cột, công thức và kỳ; nhiều chỉ tiêu có thể drill-down tới khách hàng, tài khoản/LDS và bút toán nguồn.

### Nếu mã nguồn không có trong CIF thì sao?

Dữ liệu vẫn được giữ trong kho và đưa vào danh sách đối chiếu, nhưng chưa tính vào hồ sơ C360 cho tới khi xác minh được khách hàng.

### Hệ thống có chạy khi không có Internet không?

Có thể chạy trong LAN với IP tĩnh nếu Docker image đã được chuẩn bị. Tuy nhiên cập nhật từ GitHub/GHCR phải thực hiện qua gói offline hoặc máy trung gian.

### Máy hiện tại có dùng production được không?

Chưa nên. Dung lượng trống quá thấp, không có dự phòng máy và chưa có kết quả load test. Máy chỉ phù hợp cho demo/kiểm thử có kiểm soát.

### Việc cần làm đầu tiên là gì?

Mở rộng dung lượng, thiết lập backup có kiểm thử phục hồi, hoàn thiện nguồn tháng 08 và chạy lại các kỳ theo Kho CIF mới.
