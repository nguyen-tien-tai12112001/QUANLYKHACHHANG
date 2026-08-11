# BÁO CÁO TỔNG HỢP DỰ ÁN QUẢN LÝ KHÁCH HÀNG C360

**Thời điểm báo cáo:** Tháng 08/2026
**Phạm vi:** Hệ thống quản lý, tổng hợp và phân tích dữ liệu khách hàng tập trung

## 1. Tóm tắt điều hành

Dự án C360 được xây dựng nhằm hình thành một nguồn thông tin khách hàng tập trung từ Kho CIF và các hệ thống nghiệp vụ. Hệ thống giúp đơn vị theo dõi toàn diện từng khách hàng theo mã khách hàng lõi, đồng thời cung cấp số liệu tổng hợp phục vụ điều hành, phân tích nghiệp vụ và kiểm soát chất lượng dữ liệu.

Đến thời điểm hiện tại, hệ thống đã hình thành được quy trình xuyên suốt từ tiếp nhận file nguồn, kiểm tra dữ liệu, xử lý và đối chiếu CIF đến tổng hợp hồ sơ khách hàng, Dashboard điều hành và các màn hình phân tích chuyên sâu.

Số liệu thực tế đang quản lý:

| Chỉ tiêu | Kết quả hiện tại |
|---|---:|
| Khách hàng trong Kho CIF | **518.338** |
| Chi nhánh | **7** |
| Phòng ban/phòng giao dịch | **48** |
| Người dùng đang hoạt động | **369** |
| File nguồn import thành công | **409** |
| Loại nguồn định kỳ đã hỗ trợ | **11 loại** |
| Kỳ dữ liệu khách hàng đã tổng hợp | **6 kỳ** |
| Hồ sơ C360 kỳ 06/2026 | **518.338 khách hàng** |
| Bản ghi cần đối chiếu CIF kỳ 06/2026 | **1.237** |

## 2. Bài toán cần giải quyết

Trước khi có hệ thống, dữ liệu khách hàng nằm phân tán tại nhiều file và nguồn nghiệp vụ, cấu trúc không đồng nhất và phải tổng hợp thủ công. Một khách hàng có thể phát sinh quan hệ tại nhiều chi nhánh, dẫn tới khó xác định đầy đủ quy mô quan hệ và dễ đếm trùng.

Các khó khăn chính gồm:

- Chưa có một hồ sơ tập trung thể hiện toàn bộ quan hệ của khách hàng.
- Mất nhiều thời gian tổng hợp dữ liệu từ các file nguồn khác nhau.
- Khó kiểm tra nguồn còn thiếu, sai kỳ, sai chi nhánh hoặc lỗi cấu trúc.
- Khó truy ngược một chỉ tiêu báo cáo về khách hàng và file nguồn tạo ra số liệu.
- Chưa có cơ chế thống nhất để xử lý khách hàng không khớp CIF và xung đột định danh.
- Phân quyền xem dữ liệu theo chi nhánh, phòng ban và cán bộ còn phức tạp.

## 3. Giải pháp tổng thể

Hệ thống sử dụng **Kho CIF làm tập khách hàng nền**. Các nguồn nghiệp vụ chỉ được ghép với CIF tại bước xử lý dữ liệu khách hàng; việc import file nguồn không phụ thuộc vào CIF và không tự ý thay đổi hồ sơ khách hàng gốc.

```text
Kho CIF + File nguồn nghiệp vụ + File bổ sung
                    │
                    ▼
       Kiểm tra tên file, kỳ, chi nhánh, cấu trúc
                    │
                    ▼
              Kho dữ liệu nguồn
                    │
                    ▼
          Xử lý theo mã khách hàng lõi
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
 Hồ sơ khách hàng C360    Danh sách chưa khớp CIF
        │
        ▼
 Dashboard – Phân tích – Tra cứu – Xuất báo cáo
```

Nguyên tắc quan trọng:

- Một khách hàng được nhận diện theo mã khách hàng lõi, kể cả khi có quan hệ tại nhiều chi nhánh.
- Dữ liệu chi tiết vẫn được giữ theo từng chi nhánh để phục vụ đối chiếu.
- Bản ghi không khớp CIF không bị loại bỏ khỏi kho nguồn mà được đưa vào hàng đợi rà soát.
- Mỗi chỉ tiêu có nguồn, cột dữ liệu, công thức và quy tắc đối chiếu cụ thể.

## 4. Các chức năng trọng tâm đã hoàn thành

### 4.1. Kho dữ liệu CIF

- Import đồng thời nhiều file CIF định dạng XLS, XLSX và CSV.
- Chuẩn hóa mã khách hàng, thông tin định danh, địa chỉ và dữ liệu liên hệ.
- Phát hiện bản ghi trùng, dữ liệu thay đổi và xung đột định danh.
- Lưu lịch sử nguồn, thời gian import và kết quả xử lý.
- Không tự ghi đè dữ liệu CIF đã tồn tại; thay đổi được đưa vào danh sách chờ xác nhận.
- Cho phép rà soát, áp dụng hoặc từ chối từng trường thay đổi.
- Xuất Excel danh sách xung đột để phối hợp kiểm tra.

### 4.2. Kho dữ liệu nguồn

Hệ thống đã hỗ trợ các nguồn:

| Nhóm nghiệp vụ | Nguồn tiêu biểu |
|---|---|
| Tiền gửi và tài khoản | DP01, PF14, GL02 |
| Tiền vay | LN01, PF10 |
| Phân hạng và rủi ro | BC06, BC29, RR01 |
| Phí và dòng tiền | KH02 |
| Sản phẩm dịch vụ | CN05 |
| Lịch trả nợ | FTPLN |
| File bổ sung | Bill Payment, bảo lãnh, OAB và nguồn mở rộng |

Chức năng quản trị gồm kiểm tra quy tắc tên file, kỳ dữ liệu, mã chi nhánh, định dạng, file trùng, cấu trúc cột và trạng thái import. Ma trận nguồn giúp nhận biết chi nhánh hoặc ngày dữ liệu còn thiếu trước khi xử lý.

### 4.3. Xử lý hồ sơ khách hàng C360

- Lấy CIF làm tập khách hàng nền cho mọi kỳ.
- Ghép dữ liệu các nguồn theo mã khách hàng lõi.
- Tổng hợp chi tiết theo chi nhánh và tổng hợp chung toàn khách hàng.
- Xác định chi nhánh, phòng và cán bộ quản lý theo thứ tự ưu tiên nghiệp vụ.
- Lưu trạng thái job, tiến độ, số khách hàng xử lý và nguyên nhân lỗi.
- Ngăn chạy xử lý khi kỳ chưa đạt điều kiện sẵn sàng.
- Theo dõi và khôi phục job lỗi hoặc bị kẹt.

### 4.4. Hồ sơ khách hàng 360 độ

Mỗi khách hàng có một hồ sơ tập trung gồm:

- Thông tin nhận diện và quan hệ quản lý.
- Tiền gửi thanh toán, tiền gửi có kỳ hạn và biến động tài khoản.
- Tiền vay theo loại vay, chi tiết LDS/LAV và trạng thái khoản vay.
- Nhóm nợ, dự phòng, dư nợ xử lý rủi ro và thu nợ xử lý rủi ro.
- Phí, thu nhập và hoạt động thanh toán.
- Sản phẩm dịch vụ ngân hàng điện tử, thẻ, Bill Payment và ABIC.
- Phân hạng khách hàng và lịch sử thay đổi qua các kỳ.
- Quan hệ tại từng chi nhánh và cán bộ quản lý tương ứng.

### 4.5. Dashboard và phân tích nghiệp vụ

- Tổng số khách hàng, tiền gửi, dư nợ và tiền gửi thanh toán bình quân.
- So sánh với kỳ trước và theo dõi biến động bất thường.
- Phân tích tiền gửi và dòng tiền.
- Phân tích tiền vay và rủi ro.
- Phân tích thu nhập và sản phẩm.
- Phân tích kết quả theo đơn vị và cán bộ.
- Bấm vào KPI để xem đúng danh sách khách hàng tạo ra chỉ tiêu, sau đó mới mở hồ sơ C360.
- Xuất dữ liệu theo kỳ và bộ lọc đang sử dụng.

### 4.6. Quản trị và kiểm soát

- Quản lý chi nhánh, phòng ban, người dùng và nhóm quyền.
- Giới hạn bộ lọc phòng và cán bộ theo danh mục tổ chức đang hoạt động.
- Thiết kế quyền chi tiết theo chức năng và thao tác.
- Hỗ trợ phạm vi dữ liệu toàn hệ thống, chi nhánh, phòng hoặc cán bộ.
- Lưu nhật ký thao tác quan trọng.
- Từ điển và mapping thể hiện nguồn, công thức, cách đối chiếu, trường đích và độ phủ thực tế.

## 5. Kết quả và giá trị mang lại

### Đối với công tác điều hành

- Lãnh đạo có một màn hình tổng hợp thay vì phải nhận nhiều bảng rời rạc.
- Có thể đi từ chỉ tiêu tổng quan tới danh sách khách hàng tạo ra số liệu.
- Hỗ trợ nhận biết đơn vị, khách hàng hoặc chỉ tiêu có biến động đáng chú ý.

### Đối với nghiệp vụ

- Giảm khối lượng tổng hợp và đối chiếu thủ công.
- Một khách hàng được nhìn nhận đầy đủ trên nhiều sản phẩm và nhiều chi nhánh.
- Công thức và nguồn dữ liệu được ghi nhận rõ, thuận tiện kiểm tra lại.
- Dữ liệu không khớp được giữ lại để rà soát thay vì bị loại bỏ âm thầm.

### Đối với quản trị dữ liệu

- Kiểm soát được nguồn nào đã đủ, nguồn nào còn thiếu và thiếu tại đâu.
- Theo dõi toàn bộ quá trình import và xử lý theo trạng thái.
- Tạo nền tảng dữ liệu có cấu trúc để tiếp tục bổ sung báo cáo mà không phải làm lại từ đầu.

## 6. Tồn tại và rủi ro cần tiếp tục xử lý

- Chất lượng đầu ra vẫn phụ thuộc trực tiếp vào tính đầy đủ và chính xác của file nguồn.
- Một số nguồn mới và file bổ sung chưa có quy tắc tên thống nhất.
- Các trường Profile chưa có nguồn hoặc công thức cần tiếp tục được bổ sung trong từ điển dữ liệu.
- Danh sách khách hàng chưa khớp CIF cần phối hợp nghiệp vụ để xác minh và làm sạch định kỳ.
- Bộ quyền chi tiết đã được thiết kế nhưng cần tiếp tục áp dụng bắt buộc trên toàn bộ API và thao tác giao diện.
- Cần hoàn thiện quy trình backup đồng thời PostgreSQL và thư mục lưu file gốc.
- Hệ thống hiện phục vụ trong phạm vi LAN/Tailscale; phương án tên miền và truy cập Internet công khai chưa triển khai.

## 7. Kế hoạch đề xuất

### Giai đoạn 1 – Hoàn thiện dữ liệu nền

- Chuẩn hóa đầy đủ Kho CIF cho các chi nhánh.
- Xử lý 1.237 bản ghi chưa khớp CIF của kỳ gần nhất.
- Hoàn thiện danh mục phòng ban, cán bộ và quan hệ quản lý khách hàng.
- Chốt danh sách nguồn bắt buộc và quy tắc sẵn sàng của từng kỳ.

### Giai đoạn 2 – Hoàn thiện khai thác và kiểm soát

- Tiếp tục bổ sung nguồn và chỉ tiêu theo nhu cầu nghiệp vụ.
- Hoàn thiện kiểm soát quyền tại cả frontend và backend.
- Chuẩn hóa bộ báo cáo điều hành và mẫu Excel/PDF.
- Bổ sung kiểm thử đối chiếu số liệu tự động cho các công thức trọng yếu.

### Giai đoạn 3 – Vận hành chính thức

- Hoàn thiện CI/CD và quy trình triển khai production.
- Tự động sao lưu database và file nguồn sang vị trí an toàn.
- Thiết lập giám sát hiệu năng, cảnh báo lỗi và dung lượng lưu trữ.
- Xem xét tự động tiếp nhận file qua thư mục chờ hoặc kho lưu trữ tập trung.

## 8. Kiến nghị

Để dự án phát huy hiệu quả, cần thống nhất đầu mối nghiệp vụ chịu trách nhiệm xác nhận công thức, nguồn dữ liệu và xử lý các trường hợp chưa khớp CIF. Đồng thời cần ban hành quy trình cung cấp file nguồn, thời hạn cập nhật và trách nhiệm của từng đơn vị.

Ưu tiên trước mắt là hoàn thiện chất lượng Kho CIF, xử lý danh sách chưa đối chiếu và chốt bộ chỉ tiêu điều hành cốt lõi. Sau khi dữ liệu nền ổn định, hệ thống có thể tiếp tục mở rộng báo cáo mà không làm thay đổi kiến trúc chính.

## 9. Kết luận

Dự án đã hình thành được nền tảng quản lý khách hàng C360 tương đối đầy đủ, từ quản trị dữ liệu đầu vào đến hồ sơ khách hàng và báo cáo điều hành. Giá trị quan trọng nhất của hệ thống là tạo được mối liên kết rõ ràng giữa **khách hàng – sản phẩm – chi nhánh – cán bộ – nguồn dữ liệu – chỉ tiêu báo cáo**.

Hệ thống hiện đã sẵn sàng cho giai đoạn tiếp theo: hoàn thiện chất lượng dữ liệu, chuẩn hóa vận hành và đưa các báo cáo trọng yếu vào sử dụng thường xuyên.
