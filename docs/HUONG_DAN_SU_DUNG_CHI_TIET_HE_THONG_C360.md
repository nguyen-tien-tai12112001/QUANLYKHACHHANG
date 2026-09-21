# HƯỚNG DẪN SỬ DỤNG CHI TIẾT HỆ THỐNG C360

**Tên hệ thống:** C360 – Quản lý và phân tích quan hệ khách hàng  
**Phiên bản tài liệu:** 1.0  
**Ngày cập nhật:** 21/09/2026  
**Đối tượng đọc:** Người dùng nghiệp vụ, cán bộ quản lý khách hàng, lãnh đạo đơn vị và quản trị viên  
**Phạm vi:** Hướng dẫn từ đăng nhập, khai thác dữ liệu tới các chức năng quản trị đang có trên hệ thống

> Tài liệu này mô tả giao diện và chức năng theo phiên bản mã nguồn tại ngày cập nhật. Người dùng chỉ nhìn thấy menu, nút thao tác và dữ liệu nằm trong quyền được cấp. Khi giao diện thay đổi, cần cập nhật lại ảnh minh họa, tên nút và lịch sử phiên bản của tài liệu.

## Kiểm soát tài liệu

| Nội dung | Thông tin |
|---|---|
| Đơn vị sở hữu tài liệu | **CẦN ĐIỀN** |
| Người biên soạn | **CẦN ĐIỀN** |
| Người kiểm tra nghiệp vụ | **CẦN ĐIỀN** |
| Người phê duyệt | **CẦN ĐIỀN** |
| Mức độ lưu hành | Nội bộ; có chứa mô tả về dữ liệu khách hàng và cơ chế phân quyền |
| Chu kỳ rà soát | Khi thay đổi menu, quyền, nguồn dữ liệu, công thức hoặc tối thiểu 06 tháng/lần |

## Mục lục nhanh

1. Tổng quan hệ thống
2. Đăng nhập, phiên làm việc và bảo mật
3. Giao diện và thao tác chung
4. Bộ lọc phạm vi phân tích
5. Dashboard điều hành
6. Cảnh báo và phân nhóm khách hàng
7. Danh sách khách hàng C360
8. Hồ sơ chi tiết khách hàng
9. Phân tích nghiệp vụ
10. Không gian làm việc cá nhân
11. Xuất Excel
12. Quản trị dữ liệu
13. Quản trị hệ thống
14. Nguồn và cách hiểu chỉ tiêu chính
15. Tình huống sử dụng mẫu
16. Lỗi thường gặp
17. Danh sách ảnh cần bổ sung
18. Checklist đào tạo và bàn giao
19. Lịch sử phiên bản tài liệu

## Quy ước sử dụng tài liệu

- **Kỳ dữ liệu:** tháng/ngày chốt của dữ liệu nghiệp vụ đang xem.
- **KH:** khách hàng.
- **KH lõi:** khách hàng được nhận diện bằng phần mã khách hàng lõi, không phụ thuộc chi nhánh phát sinh.
- **CN:** chi nhánh.
- **Phòng ban/PGD:** đơn vị trực thuộc chi nhánh đã được cấu hình trong hệ thống.
- **CBQL:** cán bộ quản lý khách hàng.
- **Toàn bộ quan hệ:** số liệu của khách hàng được tổng hợp từ tất cả chi nhánh người dùng có quyền xem.
- **Số liệu theo CN:** chỉ phần số liệu phát sinh tại chi nhánh được chọn.

Các ghi chú cần người biên soạn hoàn thiện tiếp:

> **[CẦN BỔ SUNG ẢNH]**: vị trí cần chụp màn hình thực tế, che toàn bộ dữ liệu nhạy cảm trước khi đưa vào tài liệu.  
> **[CẦN XÁC NHẬN NGHIỆP VỤ]**: nội dung cần chủ nguồn hoặc người có thẩm quyền xác nhận bằng văn bản.  
> **[PHỤ THUỘC QUYỀN]**: chức năng chỉ xuất hiện khi tài khoản có quyền tương ứng.

---

# Chương 1. Tổng quan hệ thống

## 1.1. C360 là gì?

C360 là hệ thống tập hợp dữ liệu khách hàng từ Kho CIF và nhiều nguồn nghiệp vụ theo kỳ. Hệ thống giúp người dùng đi từ bức tranh điều hành tổng hợp xuống danh sách khách hàng và hồ sơ chi tiết, đồng thời vẫn giữ khả năng xem số liệu riêng tại từng chi nhánh.

Thông điệp cốt lõi:

> **Một khách hàng – một mã khách hàng lõi – một góc nhìn tổng hợp; vẫn truy được quan hệ và số liệu tại từng chi nhánh.**

C360 không thay thế hệ thống giao dịch lõi. Số liệu trên C360 phản ánh các file nguồn đã được tiếp nhận và kỳ đã được xử lý, không phải số liệu phát sinh thời gian thực.

## 1.2. Mục đích của hệ thống

1. Hợp nhất thông tin nhận diện khách hàng từ Kho CIF.
2. Tổng hợp tiền gửi, tiền vay, phí, sản phẩm, rủi ro và lịch sử kỳ trên cùng một hồ sơ.
3. Hỗ trợ lãnh đạo xem quy mô, cơ cấu, biến động và kết quả theo đơn vị/cán bộ.
4. Hỗ trợ cán bộ tra cứu nhanh khách hàng đang quản lý và nhận biết khoảng trống sản phẩm.
5. Kiểm soát độ đầy đủ của file nguồn và danh sách mã chưa khớp CIF.
6. Cho phép truy vết nguồn, cột và công thức của các chỉ tiêu đã cấu hình.
7. Giới hạn chức năng và dữ liệu theo vai trò, chi nhánh, phòng ban hoặc cán bộ.

## 1.3. Đối tượng sử dụng

| Đối tượng | Công việc chính trên C360 |
|---|---|
| Cán bộ quản lý KH | Tra cứu KH phụ trách, xem quan hệ, số dư, sản phẩm và biến động |
| Lãnh đạo phòng/PGD | Xem danh mục KH và kết quả của phòng/cán bộ thuộc phạm vi quản lý |
| Lãnh đạo chi nhánh | Theo dõi quy mô, cơ cấu, rủi ro, phí và hiệu quả của chi nhánh |
| Lãnh đạo hội sở | Theo dõi toàn hệ thống và so sánh giữa các đơn vị |
| Người vận hành dữ liệu | Import CIF, file nguồn, giám sát độ sẵn sàng và xử lý kỳ |
| Quản trị viên | Quản lý tổ chức, người dùng, quyền, cấu hình và nhật ký |

## 1.4. Phạm vi dữ liệu

- Kho CIF là tập khách hàng nền dùng khi xử lý mọi kỳ.
- Dữ liệu nghiệp vụ được gắn theo kỳ và chi nhánh.
- Một KH lõi có thể có quan hệ tại nhiều chi nhánh.
- Số toàn bộ quan hệ và số riêng từng chi nhánh là hai phạm vi khác nhau.
- Người dùng chỉ được truy cập phạm vi đã cấp: toàn hệ thống, chi nhánh, phòng ban hoặc danh mục do chính cán bộ quản lý.
- Quyền xem màn hình, quyền xem trường nhạy cảm và quyền xuất Excel là các quyền độc lập.

## 1.5. Luồng dữ liệu tổng quát

```text
Kho CIF + file nghiệp vụ theo kỳ + file bổ sung
                 ↓
      Kiểm tra và lưu vào kho nguồn
                 ↓
      Giám sát độ sẵn sàng theo kỳ/CN
                 ↓
    Xử lý kỳ và ghép với Kho CIF hiện hành
                 ↓
Chi tiết KH–CN–kỳ → Hồ sơ tổng hợp KH–kỳ
                 ↓
Dashboard → Phân tích → Danh sách KH → Hồ sơ chi tiết
```

Import file chỉ đưa dữ liệu vào kho. Dashboard chỉ thay đổi sau khi kỳ được xử lý hoặc xử lý lại thành công.

> **[CẦN BỔ SUNG ẢNH 01]** Sơ đồ tổng thể hoặc ảnh trang đăng nhập kèm tên chương trình. Không dùng thông tin KH thật.

## 1.6. Các nhóm menu

| Nhóm menu | Màn hình |
|---|---|
| Tổng quan | Dashboard điều hành; Cảnh báo & phân nhóm |
| Quản lý khách hàng | Danh sách khách hàng |
| Phân tích nghiệp vụ | Tiền gửi & dòng tiền; Tiền vay & rủi ro; Thu nhập & sản phẩm; Đơn vị & cán bộ |
| Quản trị dữ liệu | Kho dữ liệu; Kho dữ liệu CIF; Xử lý dữ liệu KH; Giám sát nguồn dữ liệu; Đối chiếu CIF; Từ điển & mapping |
| Quản trị hệ thống | Chi nhánh; Phòng ban; Người dùng; Nhóm quyền; Cấu hình hệ thống; Nhật ký thao tác |

Nếu không thấy một menu, trước tiên hãy kiểm tra quyền trong **Hồ sơ cá nhân → Quyền truy cập**. Không tự kết luận chương trình bị lỗi.

---

# Chương 2. Đăng nhập, phiên làm việc và bảo mật

## 2.1. Đăng nhập

1. Mở địa chỉ do quản trị viên cung cấp. Trong LAN có thể dùng tên miền nội bộ, ví dụ `http://c360.agribank.com.vn` khi DNS/proxy đã được cấu hình.
2. Nhập tên đăng nhập hoặc mã người dùng được cấp.
3. Nhập mật khẩu; dùng biểu tượng con mắt nếu cần kiểm tra ký tự.
4. Kiểm tra cảnh báo Caps Lock.
5. Bấm **Đăng nhập**.

Không nhập `localhost` trên máy người dùng vì địa chỉ đó chỉ trỏ tới chính máy đang sử dụng.

> **[CẦN BỔ SUNG ẢNH 02]** Trang đăng nhập; đánh số ô tài khoản, mật khẩu, hiện/ẩn mật khẩu và nút Đăng nhập.

## 2.2. Đổi mật khẩu lần đầu

Sau khi quản trị viên tạo hoặc reset mật khẩu, hệ thống có thể yêu cầu đổi mật khẩu trước khi dùng chức năng khác:

1. Nhập mật khẩu tạm.
2. Nhập mật khẩu mới và xác nhận lại.
3. Thực hiện theo yêu cầu độ dài/ký tự được hiển thị trên form.
4. Hoàn tất đổi mật khẩu rồi đăng nhập lại nếu hệ thống yêu cầu.

Không chia sẻ mật khẩu qua ảnh chụp màn hình, email hoặc nhóm trao đổi không được phép.

## 2.3. Các trạng thái đăng nhập

| Thông báo | Ý nghĩa | Cách xử lý |
|---|---|---|
| Tài khoản hoặc mật khẩu không đúng | Thông tin xác thực không khớp | Kiểm tra Caps Lock và nhập lại |
| Tài khoản tạm khóa | Nhập sai quá số lần cho phép | Chờ hết thời gian hoặc đề nghị quản trị viên mở tạm khóa |
| Tài khoản đã bị khóa | Quản trị viên khóa thủ công | Liên hệ quản trị viên |
| Phiên đăng nhập đã kết thúc | Hết thời gian, đăng nhập nơi khác hoặc quyền thay đổi | Đăng nhập lại |
| Bắt buộc đổi mật khẩu | Đang dùng mật khẩu tạm/reset | Hoàn thành đổi mật khẩu |

Tài khoản thông thường chỉ duy trì một phiên đăng nhập. Nếu đăng nhập trên máy khác, phiên cũ có thể bị kết thúc. Tài khoản không hoạt động khoảng 30 phút sẽ tự đăng xuất theo cấu hình hiện hành. Nhập sai mật khẩu 5 lần liên tiếp có thể tạm khóa 15 phút; quản trị viên có thể mở sớm.

## 2.4. Hồ sơ cá nhân

Bấm tên hoặc ảnh đại diện ở góc trên để mở hồ sơ cá nhân. Các nhóm thông tin gồm:

- Thông tin cá nhân và liên hệ.
- Chi nhánh, phòng ban, mã nhân viên/mã CBTD.
- Nhóm quyền và phạm vi dữ liệu.
- Quyền được cấp thêm hoặc bị từ chối riêng.
- Đổi mật khẩu.

Người dùng có thể sửa các trường cá nhân mà giao diện cho phép. Chi nhánh, phòng ban, nhóm quyền và phạm vi dữ liệu do quản trị viên quản lý.

> **[CẦN BỔ SUNG ẢNH 03]** Hồ sơ cá nhân ở trạng thái cuộn đầu và cuối để minh họa đầy đủ các phần.

---

# Chương 3. Giao diện và thao tác chung

## 3.1. Thành phần chính

| Thành phần | Công dụng |
|---|---|
| Sidebar | Chuyển giữa các nhóm chức năng được cấp quyền |
| Header | Hiện trang đang xem, phạm vi phân tích, người đăng nhập và tiện ích cá nhân |
| Breadcrumb | Cho biết vị trí hiện tại trong hệ thống |
| Bộ lọc chung | Chọn kỳ và phạm vi dùng cho các trang C360 |
| Vùng nội dung | Card, biểu đồ, bảng và drawer/modal chi tiết |
| Thông báo | Báo thành công, cảnh báo, lỗi hoặc tiến độ nền |

Nhóm menu đang mở được ghi nhớ khi tải lại trang. URL thay đổi theo màn hình để có thể tải lại hoặc gửi đường dẫn; người nhận vẫn phải có quyền phù hợp.

> **[CẦN BỔ SUNG ẢNH 04]** Toàn bộ màn hình sau đăng nhập; đánh số Sidebar, Header, Breadcrumb, bộ lọc, nội dung, hồ sơ và danh sách ghim.

## 3.2. Loading và tác vụ nền

- Truy vấn nghiệp vụ lớn có thể hiện vòng loading giữa màn hình.
- Các card tải độc lập có thể hiện loading riêng, dữ liệu cũ không được coi là kết quả của bộ lọc mới khi card còn đang tải.
- Import và xử lý dữ liệu chạy nền; người vận hành có thể chuyển tab nhưng phải quay lại kiểm tra trạng thái job.
- Xuất Excel chạy nền ở phía giao diện: góc dưới phải hiển thị tên file/báo cáo, giai đoạn, phần trăm và thời gian. Người dùng vẫn có thể chuyển trang và thực hiện nghiệp vụ khác.

Không bấm lặp lại nút chạy/xuất nhiều lần chỉ vì chưa thấy kết quả ngay.

## 3.3. Quy tắc đọc bảng

- Bảng lớn có vùng cuộn riêng; tiêu đề được cố định khi cuộn dọc.
- Thanh cuộn ngang dùng khi có nhiều cột.
- Tiêu đề cột có thể hỗ trợ sắp xếp/lọc tùy bảng.
- Phân trang chỉ thay đổi phần đang hiển thị; không làm thay đổi tổng kết quả.
- Bấm một dòng KH thường mở hồ sơ C360.
- Chuột phải dòng KH tại bảng được hỗ trợ để ghim KH.
- Các dấu `…` cần được di chuột hoặc mở rộng để đọc đầy đủ nội dung.

## 3.4. Quy tắc đọc số tiền

- Card có thể rút gọn thành triệu/tỷ/nghìn tỷ để dễ nhìn.
- Tooltip, bảng chi tiết và Excel phải dùng số đầy đủ khi đối soát.
- Không cộng các số đã được làm tròn trên card để so với báo cáo gốc.
- Xác định rõ đơn vị tiền và trạng thái quy đổi ngoại tệ.
- Số âm ở phí hoặc biến động dự phòng có thể là hoàn/điều chỉnh, không mặc nhiên là lỗi.

---

# Chương 4. Bộ lọc phạm vi phân tích

## 4.1. Trình tự sử dụng

1. Chọn **Kỳ dữ liệu**.
2. Chọn **Chi nhánh** nếu tài khoản được phép thay đổi chi nhánh.
3. Chọn **Phòng ban** sau khi đã chọn chi nhánh.
4. Mở **Nâng cao** nếu cần thêm điều kiện.
5. Bấm **Xem dữ liệu** hoặc **Áp dụng & xem dữ liệu**.
6. Kiểm tra nhãn kỳ, chi nhánh và phạm vi đã áp dụng trên Header/trang.

Chỉ thay đổi ô chọn mà chưa bấm **Xem dữ liệu** thì các bảng vẫn thuộc phạm vi đã áp dụng trước đó.

> **[CẦN BỔ SUNG ẢNH 05]** Bộ lọc chung khi chưa chọn kỳ và sau khi đã áp dụng thành công.

## 4.2. Các nhóm điều kiện nâng cao

### Khách hàng và quản lý

- Tên hoặc mã KH: chỉ tìm tên KH hoặc mã KH lõi, không tìm tên CBQL.
- Loại khách hàng: có thể chọn nhiều loại.
- Cán bộ quản lý: danh sách phụ thuộc chi nhánh/phòng ban đã chọn.
- Trạng thái CBQL: đã có hoặc chưa có CBQL hợp lệ.
- Quan hệ chi nhánh: một CN hoặc đa CN.
- Trạng thái chi nhánh chính: đã xác định hoặc chưa rõ.
- KH mới trong kỳ/đã có từ kỳ trước.
- Có/thiếu thông tin liên hệ.

### Tiền gửi và TGTT bình quân

- Có/không có tiền gửi.
- Khoảng tổng tiền gửi từ–đến.
- Khoảng TGTT bình quân từ–đến.
- Giá trị không được âm; giá trị Đến phải lớn hơn hoặc bằng giá trị Từ.

### Tiền vay

- Có/không có tiền vay.
- Loại hình vay.
- Khoảng tổng dư nợ từ–đến.

### Sản phẩm dịch vụ

- Chọn một hoặc nhiều sản phẩm đang sử dụng.
- Lọc KH chưa sử dụng sản phẩm nào.
- Lọc theo số sản phẩm tối thiểu.

Khi chọn nhiều sản phẩm, hệ thống lọc các KH thỏa đồng thời những sản phẩm đã chọn. Ví dụ chọn Agribank Plus và SMS tiền gửi nghĩa là KH phải có cả hai cờ sử dụng.

> **[CẦN BỔ SUNG ẢNH 06]** Drawer bộ lọc nâng cao, chụp đủ bốn nhóm điều kiện.

## 4.3. Ví dụ lọc thực tế

**Mục tiêu:** Tìm KH tại CN 2600 đang dùng Agribank Plus trong kỳ 07/2026.

1. Chọn kỳ 07/2026.
2. Chọn chi nhánh 2600.
3. Mở **Nâng cao**.
4. Tại **Sản phẩm đang sử dụng**, chọn **Agribank Plus**.
5. Bấm **Áp dụng & xem dữ liệu**.
6. Vào **Danh sách khách hàng** để xem hoặc xuất Excel.

File Excel phải giữ cùng kỳ, chi nhánh và điều kiện Agribank Plus. Nếu muốn tìm KH chưa dùng sản phẩm, phải chọn điều kiện phù hợp thay vì suy ra từ một bảng đã lọc khác.

## 4.4. Hiệu lực của bộ lọc

Bộ lọc chung áp dụng cho Dashboard, Cảnh báo & phân nhóm, Danh sách KH và các trang Phân tích nghiệp vụ. Một số bảng drill-down hoặc hồ sơ chi tiết gọi thêm API khi mở, nhưng vẫn phải tuân theo kỳ, phạm vi quyền và điều kiện liên quan.

Khi đóng trình duyệt/đăng xuất, phiên phân tích phía trình duyệt được xóa. Lần đăng nhập sau cần chọn phạm vi lại.

---

# Chương 5. Dashboard điều hành

## 5.1. Mục đích

Dashboard cung cấp bức tranh nhanh về quy mô khách hàng, nguồn vốn, dư nợ, cơ cấu, biến động và nhóm cần xử lý trong kỳ/phạm vi đang chọn.

## 5.2. Cách sử dụng chung

1. Áp dụng bộ lọc chung.
2. Chờ các card/khối hoàn thành tải.
3. Đọc kỳ, phạm vi và đơn vị trước khi so sánh.
4. Bấm card có hỗ trợ để mở danh sách hoặc thành phần cấu thành đúng chỉ tiêu.
5. Dùng bộ lọc trong drawer/bảng nếu cần thu hẹp tiếp.
6. Xuất Excel nếu có quyền.

## 5.3. Các nhóm thông tin

| Nhóm | Nội dung cần đọc |
|---|---|
| KPI khách hàng | Tổng KH, KH mới và các nhóm có quan hệ/sản phẩm |
| Nguồn vốn | Tổng nguồn vốn huy động, không kỳ hạn, các dải kỳ hạn và so với kỳ trước |
| Dư nợ | Tổng dư nợ, cá nhân/pháp nhân, ngắn hạn, trung dài hạn và thấu chi |
| Kết quả kỳ | Nhóm KH có tiền gửi, có tiền vay, có sản phẩm, đa chi nhánh |
| Cần xử lý | Nguồn thiếu, KH chưa có CBQL, biến động hoặc dữ liệu cần rà soát |
| Theo đơn vị | Kết quả chi tiết theo chi nhánh trong phạm vi xem |
| Biến động | KH có biến động bất thường và top tăng/giảm trong kỳ |

## 5.4. Khi bấm một KPI

Drawer chi tiết phải thể hiện đúng ý nghĩa của KPI, không phải lúc nào cũng là cùng một danh sách chung. Kiểm tra:

- Tên chỉ tiêu và kỳ.
- Tổng số KH/bản ghi.
- Chi nhánh và CBQL.
- Cột giá trị chính của KPI.
- Bộ lọc tìm kiếm/sắp xếp trong drawer.
- Công thức và nguồn nếu tooltip cung cấp.

Nếu số trên card và tổng danh sách khác nhau, kiểm tra xem card đang đếm **KH**, **sản phẩm**, **tài khoản** hay đang hiển thị **giá trị tiền**.

> **[CẦN BỔ SUNG ẢNH 07]** Dashboard toàn trang sau khi tải xong.  
> **[CẦN BỔ SUNG ẢNH 08]** Một drawer KPI, ví dụ KH có Agribank Plus hoặc tổng dư nợ.

## 5.5. Kết quả theo chi nhánh

Mỗi dòng phản ánh số phát sinh tại chi nhánh, không dồn toàn bộ số của KH đa chi nhánh về chi nhánh chính. Khi bấm chi nhánh, các khối liên quan có thể được lọc chéo theo đơn vị đó.

Không dùng số **Toàn bộ quan hệ** để quy trách nhiệm cho một chi nhánh đơn lẻ.

---

# Chương 6. Cảnh báo và phân nhóm khách hàng

## 6.1. Mục đích

Màn hình tập trung các nhóm cần chú ý hoặc khai thác, ví dụ:

- KH có tiền gửi/dư nợ lớn.
- KH quan hệ nhiều chi nhánh.
- KH chưa có CBQL hợp lệ.
- KH đa chi nhánh nhưng chưa rõ chi nhánh chính.
- KH mới xuất hiện trong kỳ.
- KH có biến động đáng chú ý.

Cảnh báo là tín hiệu để người dùng kiểm tra, không phải kết luận tự động về sai phạm hoặc rủi ro.

## 6.2. Thao tác

1. Áp dụng bộ lọc chung.
2. Chọn nhóm cảnh báo/phân nhóm.
3. Tìm theo tên hoặc mã KH khi bảng hỗ trợ.
4. Sắp xếp theo giá trị phù hợp.
5. Bấm dòng để mở hồ sơ.
6. Chuột phải để ghim KH nếu bảng hỗ trợ.
7. Xuất Excel theo nhóm và bộ lọc hiện tại nếu có quyền.

> **[CẦN BỔ SUNG ẢNH 09]** Trang Cảnh báo & phân nhóm với một nhóm đã chọn.

---

# Chương 7. Danh sách khách hàng C360

## 7.1. Vai trò của màn hình

Đây là nơi tra cứu đầy đủ nhất theo kỳ và phạm vi đã áp dụng. Danh sách hỗ trợ tìm kiếm, lọc, sắp xếp, lựa chọn cột, phân trang, mở hồ sơ, ghim KH và xuất dữ liệu.

## 7.2. Các cột thông dụng

- Tên và mã KH lõi.
- Chi nhánh chính/các chi nhánh quan hệ.
- Loại khách hàng.
- CBQL và đơn vị quản lý.
- Quan hệ gần nhất.
- Tiền gửi CKH.
- TGTT bình quân.
- Tổng dư nợ.
- Số sản phẩm.
- Trạng thái hồ sơ/liên hệ.

## 7.3. Tìm kiếm và lọc

- Ô tìm KH chỉ dùng tên hoặc mã KH.
- CBQL được lọc ở trường riêng.
- Bộ lọc riêng của bảng phải bổ sung cho bộ lọc chung, không được làm người dùng nhầm phạm vi đã áp dụng.
- Khi thay đổi bộ lọc/sắp xếp, bảng quay về trang đầu.
- Nút đặt lại chỉ xóa điều kiện của màn hình theo thiết kế, không mặc nhiên mở rộng phạm vi quyền.

## 7.4. Mở và ghim KH

- Bấm dòng để mở hồ sơ chi tiết.
- Chuột phải dòng và chọn **Ghim KH** để lưu vào không gian làm việc cá nhân.
- Danh sách ghim riêng cho từng người dùng.
- Ghim chỉ giúp truy cập nhanh, không mở rộng quyền xem KH.

## 7.5. Xuất Excel

**[PHỤ THUỘC QUYỀN]** Nút **Xuất Excel** chỉ hiện khi người dùng có quyền xuất khách hàng.

- File xuất toàn bộ kết quả phù hợp bộ lọc, không chỉ các dòng của trang hiện tại.
- Tối đa hiện hành: 100.000 KH; nếu vượt giới hạn, thu hẹp CN/PGD/CBQL hoặc điều kiện nghiệp vụ.
- Các trường cơ bản gồm mã CN/quan hệ CN, mã KH, tên KH, loại KH, địa chỉ, SĐT, CBQL và các chỉ tiêu phù hợp.
- Địa chỉ/SĐT được che nếu tài khoản không có quyền dữ liệu liên hệ.
- Quá trình xuất hiển thị ở góc dưới phải; người dùng vẫn có thể thao tác chức năng khác.

> **[CẦN BỔ SUNG ẢNH 10]** Danh sách KH có bộ lọc/cột và nút Xuất Excel.  
> **[CẦN BỔ SUNG ẢNH 11]** Thông báo tiến độ xuất Excel ở góc dưới phải.

---

# Chương 8. Hồ sơ chi tiết khách hàng

## 8.1. Chọn phạm vi quan hệ

Nếu KH có nhiều chi nhánh, hồ sơ cho phép chọn:

- **Toàn bộ quan hệ:** cộng/tổng hợp trong phần phạm vi người dùng được phép xem.
- **Một chi nhánh:** chỉ số liệu phát sinh tại CN đó.

Chi nhánh chính được đánh dấu nổi bật. CBQL có thể khác nhau theo từng CN; CBQL ở CN này không được tự sao chép sang CN khác.

## 8.2. Card tổng quan

Các card chính có thể gồm tổng tiền gửi, tổng tiền vay, doanh thu/phí trong kỳ, số sản phẩm đang dùng và số chi nhánh có quan hệ. Khi đổi phạm vi chi nhánh, card, bảng, biểu đồ và chi tiết LDS phải đổi đồng bộ.

Di chuột vào chỉ tiêu có hỗ trợ để xem nguồn file, cột nguồn, công thức, kỳ dữ liệu và thông tin quy đổi ngoại tệ.

## 8.3. Tab Thông tin khách hàng

Nội dung có thể gồm:

- Mã KH lõi và tên KH.
- Loại KH, ngày sinh/ngày thành lập, giới tính/ngành nghề.
- CCCD/đăng ký, mã số thuế, địa chỉ, điện thoại theo quyền.
- Chi nhánh/phòng ban và CBQL.
- Quan hệ theo từng chi nhánh.
- Nguồn xác định đơn vị/CBQL.
- Quan hệ gần nhất.

Tên CBQL hiển thị gọn; chi tiết mã nhân viên, mã CBTD, chi nhánh và phòng ban có thể xem qua hover. Chỉ công nhận CBQL/phòng ban tồn tại trong danh mục hệ thống.

## 8.4. Tab Tiền gửi

Nội dung thường có:

- Tiền gửi thanh toán/không kỳ hạn.
- Tiền gửi có kỳ hạn.
- TGTT bình quân.
- Danh sách tài khoản hoặc sổ tiết kiệm.
- Số dư cuối kỳ, kỳ trước và biến động.
- Tài khoản mới mở/đã đóng khi đủ dữ liệu đối chiếu kỳ.
- Giao dịch TKTT gần nhất ở cấp KH/chi nhánh.
- Dòng tiền TKTT theo ngày từ GL02 khi nguồn hiện có.

Lưu ý:

- Số tài khoản và số sổ tiết kiệm cần đọc theo nhãn của bảng.
- OSB vẫn thuộc nhóm tài khoản thanh toán theo logic hiện tại.
- GL02 không có số tài khoản KH chi tiết trong mọi trường hợp; giao dịch gần nhất không được khẳng định thuộc một tài khoản cụ thể nếu không có khóa ghép.

## 8.5. Tab Tiền vay và rủi ro

Nội dung có thể gồm:

- Tổng dư nợ cuối kỳ.
- Dư nợ ngắn hạn, trung dài hạn và thấu chi.
- Danh sách LDS/LAV, ngày giải ngân và ngày đáo hạn.
- Trạng thái còn hiệu lực, sắp đến hạn, đến hạn hoặc đã đóng.
- Nhóm nợ, quá hạn gốc/lãi và tài sản bảo đảm.
- Dự phòng chung, dự phòng cụ thể.
- Dư nợ đã XLRR và thu nợ XLRR.
- Dòng thời gian khoản vay.

LN01 cung cấp tổng dư nợ chính; PF10 dùng để phân rã loại vay và chi tiết LDS. Không cộng hai nguồn với nhau như hai phần dư nợ độc lập.

## 8.6. Tab Phí thu được

Các nhóm phí có thể gồm:

- Phí bảo lãnh.
- Phí chuyển tiền.
- Phí ngân hàng điện tử.
- Phí kinh doanh ngoại tệ.
- Phí LC/TTQT.
- Phí thẻ.
- ABIC/BATD.
- Phí khác đã có quy tắc phân loại.

Phí KH02 thường được tính theo công thức `SUM(CRAMT) − SUM(DRAMT)` sau khi lọc tài khoản cân đối theo nhóm. Một mã tài khoản chỉ được vào một nhóm phí chính. Phần chưa phân loại không được tự gán vào phí khác.

## 8.7. Tab Sản phẩm dịch vụ

Trạng thái xanh/đỏ thể hiện có hoặc chưa có dữ liệu sử dụng theo kỳ. Các sản phẩm có thể gồm Agribank Plus, OTT/SMS, thẻ, TK số đẹp, Bill Payment, ABIC, bảo lãnh/LC và các cờ khác đã có nguồn.

Số sản phẩm khác số tài khoản và số KH. Khi bấm một sản phẩm, danh sách phải phản ánh đúng KH có cờ sử dụng sản phẩm đó.

## 8.8. Lịch sử các kỳ

- Chọn kỳ để xem hồ sơ ở thời điểm tương ứng.
- So sánh biến động tiền gửi, dư nợ, phí và sản phẩm giữa các kỳ.
- Theo dõi thay đổi CBQL hoặc chi nhánh chính nếu dữ liệu hỗ trợ.
- Một CN có thể chỉ xuất hiện ở các kỳ mà KH thực sự có quan hệ tại CN đó.
- KH vắng ở một kỳ chưa đủ để kết luận đã rời bỏ; phải kiểm tra CIF, nguồn và phạm vi.

Khi bấm tab, modal/drawer phải giữ vùng nhìn hợp lý và cho phép cuộn toàn bộ nội dung.

> **[CẦN BỔ SUNG ẢNH 12]** Phần đầu hồ sơ với phạm vi Toàn bộ quan hệ và CN chính.  
> **[CẦN BỔ SUNG ẢNH 13–17]** Mỗi tab một ảnh: Thông tin KH, Tiền gửi, Tiền vay, Phí, Sản phẩm/Lịch sử. Dùng KH demo và che CCCD/STK/SĐT.

---

# Chương 9. Phân tích nghiệp vụ

## 9.1. Tiền gửi & dòng tiền

Mục tiêu: theo dõi quy mô nguồn vốn, cơ cấu kỳ hạn, TGTT, biến động tài khoản và dòng tiền.

Thao tác:

1. Áp dụng kỳ/phạm vi.
2. Đọc các KPI tiền gửi.
3. Xem biểu đồ nhiều kỳ và cơ cấu kỳ hạn.
4. Xem tài khoản mở mới/đã đóng hoặc biến động mạnh.
5. Bấm nhóm được hỗ trợ để xem KH cấu thành.
6. Xuất Excel theo đúng phạm vi nếu có quyền.

Không đồng nhất tiền gửi CKH với TGTT bình quân. Tổng nguồn vốn huy động từ DP01 có thể có phạm vi nghiệp vụ khác số tiền gửi CKH trên hồ sơ PF14.

## 9.2. Tiền vay & rủi ro

Mục tiêu: theo dõi tổng dư nợ, cơ cấu loại vay, nhóm nợ, dự phòng và XLRR.

- Bấm nhóm nợ để xem danh sách KH thuộc nhóm.
- Đọc số DPRR lũy kế và biến động tháng riêng biệt.
- Số DPRR biến động âm có thể là hoàn nhập do dư nợ/giá trị dự phòng giảm so với kỳ trước.
- Khi so sánh phải dùng hai kỳ đã xử lý và cùng phạm vi.

## 9.3. Thu nhập & sản phẩm

Mục tiêu: xem cơ cấu phí, các nguồn thu và mức độ sử dụng sản phẩm.

- Đọc số tiền phí và tỷ trọng theo nhóm.
- Xem độ phủ sản phẩm và khoảng trống bán chéo.
- Kiểm tra số đếm là KH hay số sản phẩm.
- Các mã tài khoản/dịch vụ phải theo cấu hình hoặc quy tắc nghiệp vụ hiệu lực của kỳ.

## 9.4. Đơn vị & cán bộ

Mục tiêu: so sánh danh mục theo chi nhánh/phòng/cán bộ.

- Số KH đang quản lý.
- Tổng tiền gửi, dư nợ và phí.
- KH mới nhận/chuyển đi giữa hai kỳ.
- Tăng/giảm tiền gửi và dư nợ.
- Xếp hạng/danh mục hiệu quả theo cán bộ.

Bấm dòng cán bộ để mở danh sách KH thuộc cán bộ đó. Drawer có thể lọc nhanh theo có tiền gửi, có tiền vay, có phí hoặc đa chi nhánh.

> **[CẦN BỔ SUNG ẢNH 18–21]** Mỗi trang phân tích nghiệp vụ một ảnh toàn trang và một ảnh drill-down tiêu biểu.

---

# Chương 10. Không gian làm việc cá nhân

## 10.1. Ghim khách hàng

1. Tại bảng được hỗ trợ, bấm chuột phải dòng KH.
2. Chọn **Ghim KH**.
3. Quan sát số lượng ở biểu tượng ghim trên Header.
4. Bấm biểu tượng để mở danh sách ghim.

Danh sách ghim được lưu riêng theo tài khoản. Khi chưa chọn kỳ, hệ thống có thể thử mở bằng kỳ xử lý mới nhất mà người dùng được phép xem.

## 10.2. Bỏ ghim và vừa xem

- Bấm **Bỏ ghim** tại KH không cần theo dõi nữa.
- Tab **Vừa xem** giúp quay lại màn hình/phạm vi gần đây.
- Có thể xóa lịch sử vừa xem.
- Ghim/lịch sử không lưu thêm bản sao số liệu nghiệp vụ và không vượt quyền hiện tại.

> **[CẦN BỔ SUNG ẢNH 22]** Menu chuột phải và drawer Không gian làm việc cá nhân.

---

# Chương 11. Xuất Excel

## 11.1. Nguyên tắc chung

**[PHỤ THUỘC QUYỀN]** Chỉ tài khoản có quyền xuất của màn hình mới thấy hoặc sử dụng được nút xuất.

File Excel phải căn cứ vào:

- Kỳ đã áp dụng.
- Phạm vi quyền của người dùng.
- Chi nhánh/phòng ban/CBQL.
- Bộ lọc chung.
- Bộ lọc riêng và sắp xếp của bảng khi endpoint hỗ trợ.
- Nhóm KPI hoặc sản phẩm đang chọn.

Xuất Excel không có nghĩa xuất các dòng đang nhìn thấy trên trang. Hệ thống lấy toàn bộ kết quả phù hợp trong giới hạn của loại báo cáo.

## 11.2. Tiến độ xuất nền

1. Bấm **Xuất Excel**.
2. Hộp nhỏ ở góc dưới phải hiển thị giai đoạn chuẩn bị, số dòng đã ghi khi có, phần trăm và thời gian.
3. Tiếp tục dùng hệ thống trong lúc xuất; không có loading che toàn màn hình.
4. Khi máy chủ tạo xong, trạng thái chuyển sang tải file về máy.
5. Thông báo hoàn tất tự ẩn sau một khoảng thời gian.

Phần trăm giai đoạn tạo file do backend cập nhật; phần tải về dựa trên dung lượng file khi máy chủ cung cấp. Không đóng tab trình duyệt nếu muốn nhận file đang xuất trong tab đó.

## 11.3. Nội dung file khách hàng

Tùy bảng, file KH nên có tối thiểu:

- Mã chi nhánh/phạm vi quan hệ.
- Mã KH lõi.
- Tên KH.
- Loại KH.
- Địa chỉ và SĐT theo quyền.
- CBQL/đơn vị quản lý.
- Các cột tiền gửi, tiền vay, phí hoặc sản phẩm liên quan tới bảng.
- Kỳ và điều kiện lọc ở sheet thông tin hoặc tên file.

Ví dụ lọc **Có Agribank Plus** thì file chỉ chứa KH phù hợp và phải có cột Agribank Plus để kiểm tra.

## 11.4. An toàn dữ liệu sau khi xuất

- Không gửi file có CCCD, STK, điện thoại hoặc dư nợ ra ngoài phạm vi được phép.
- Không đổi số trong Excel rồi coi đó là số liệu C360.
- Ghi rõ kỳ, chi nhánh và điều kiện lọc khi gửi báo cáo.
- Xóa file tạm trên máy dùng chung sau khi hoàn thành công việc.
- Nếu file vượt giới hạn, thu hẹp bộ lọc; không chia thủ công theo cách làm trùng KH.

---

# Chương 12. Quản trị dữ liệu

> Phần này dành cho người được cấp quyền vận hành dữ liệu. Người dùng nghiệp vụ thông thường có thể bỏ qua.

## 12.1. Kho dữ liệu

Kho nhận các nguồn chuẩn DP01, LN01, CN05, PF10, PF14, BC06, BC29, KH02, FTPLN, RR01 và GL02 theo quy tắc tên.

Quy trình:

1. Chọn một hoặc nhiều file.
2. Kiểm tra kết quả nhận diện loại nguồn, CN và kỳ.
3. Xác nhận import/thay thế theo quyền.
4. Theo dõi trạng thái chờ, đang xử lý, thành công hoặc lỗi.
5. Mở chi tiết lỗi nếu file không đạt.
6. Kiểm tra card kỳ và danh sách file sau import.

Không chép file thẳng vào thư mục ứng dụng để thay cho thao tác import.

## 12.2. Kho dữ liệu CIF

Các chức năng chính:

- Import nhiều file CSV/XLS/XLSX; một file có thể chứa nhiều CN.
- Xem tiến độ từng bước và lịch sử import.
- Tra cứu master KH và các mã CIF theo CN.
- Duyệt thay đổi khi bản ghi mới khác bản ghi đang dùng.
- Kiểm tra trùng/xung đột định danh.
- Xuất danh sách xung đột nếu có quyền.

Mã `CUSTNO` trùng sau bản ghi đầu được bỏ qua theo logic hiện hành. Thay đổi thông tin không được tự ghi đè âm thầm; người có quyền phải rà soát.

## 12.3. Xử lý dữ liệu KH

1. Chọn kỳ trong danh sách kỳ có thể xử lý.
2. Kiểm tra độ sẵn sàng, nguồn bắt buộc, phạm vi CN và file bổ sung.
3. Nếu nút chạy bị mờ, đọc nguồn/lý do còn thiếu.
4. Bấm chạy một lần và theo dõi job nền.
5. Nếu job lâu không cập nhật, dùng chức năng khôi phục/chạy lại job kẹt theo quyền; không tạo nhiều job trùng.
6. Sau thành công, kiểm tra số KH, tổng chỉ tiêu và đối chiếu CIF.

Chạy lại một kỳ thay kết quả đã xử lý của kỳ đó, không cộng thêm một bộ kết quả mới.

## 12.4. File bổ sung

Bill Payment, bảo lãnh/LC hoặc OAB được thêm ở kỳ phù hợp. Có thể xóa/thay file trước khi xử lý lại khi giao diện cho phép. File phải đi qua phần mềm để có bản ghi DB và trạng thái; chỉ sao chép file vào ổ đĩa không làm dữ liệu xuất hiện trên báo cáo.

## 12.5. Giám sát nguồn dữ liệu

- Xem độ sẵn sàng theo kỳ và CN.
- Dấu xanh: nguồn đáp ứng điều kiện hiện hành.
- Dấu đỏ/thiếu: chưa có hoặc chưa đủ.
- FTPLN hiển thị ngày còn thiếu.
- Có file không đồng nghĩa file đủ cột, đủ ngày hoặc import thành công.
- Dùng công tắc chỉ hiện nguồn còn thiếu để xử lý nhanh.

## 12.6. Đối chiếu CIF

Danh sách thể hiện mã từ file nguồn chưa ghép được với Kho CIF, kèm nguồn, CN và lý do. Người có quyền có thể lọc, xuất Excel và cập nhật trạng thái rà soát. Không sửa trực tiếp DB chỉ để làm mất cảnh báo.

## 12.7. Từ điển & mapping

Tra cứu:

- Tên trường đích.
- Nhóm nghiệp vụ.
- Nguồn/cột nguồn.
- Công thức và điều kiện.
- Trạng thái đã có/chưa có dữ liệu.
- Độ phủ.
- Tùy chọn hiển thị.

Từ điển cần được cập nhật khi logic, DB hoặc nguồn thay đổi.

> **[CẦN BỔ SUNG ẢNH 23–28]** Mỗi màn Quản trị dữ liệu một ảnh, ưu tiên ảnh có trạng thái thành công và một ví dụ lỗi đã ẩn dữ liệu.

---

# Chương 13. Quản trị hệ thống

> Phần này chỉ dành cho quản trị viên hoặc tài khoản được cấp quyền cụ thể. Tham khảo [Quy trình vận hành](QUY_TRINH_VAN_HANH_HE_THONG_C360.md) và [Ma trận phân quyền](MA_TRAN_PHAN_QUYEN_VA_BAO_MAT_C360.md).

## 13.1. Chi nhánh và phòng ban

- Tạo/cập nhật danh mục tổ chức.
- Gắn phòng ban đúng chi nhánh.
- Chỉ đơn vị đang hoạt động được đưa vào bộ lọc người dùng.
- Không dùng đơn vị xuất hiện trong file nguồn để tự mở rộng phạm vi hệ thống.

## 13.2. Người dùng

- Tạo và cập nhật tài khoản.
- Gán chi nhánh, phòng ban, mã nhân viên/mã CBTD.
- Chọn nhóm quyền và phạm vi dữ liệu.
- Cấp thêm hoặc từ chối quyền riêng.
- Reset mật khẩu, khóa/mở tài khoản, mở tạm khóa.
- Thu hồi phiên đăng nhập.
- Thao tác hàng loạt sau khi xem trước ảnh hưởng.

Phạm vi phải phù hợp tổ chức: phạm vi CN cần chi nhánh; phạm vi phòng cần chi nhánh và phòng; phạm vi cá nhân cần mã cán bộ hợp lệ.

## 13.3. Nhóm quyền

- Xem ma trận chức năng theo nhóm.
- Mở ma trận toàn màn hình khi cần so sánh.
- Chỉnh quyền nhóm theo nguyên tắc tối thiểu cần thiết.
- Quyền cấp thêm/từ chối riêng dùng cho ngoại lệ, không thay thế thiết kế nhóm quyền.
- Sau khi sửa quyền, phiên người dùng liên quan có thể bị thu hồi và yêu cầu đăng nhập lại.

## 13.4. Cấu hình hệ thống

Quản lý mã sản phẩm/dịch vụ, tài khoản cân đối, công thức và danh mục nghiệp vụ đã được chuyển sang cấu hình. Trước khi sửa phải xác định kỳ hiệu lực, người phê duyệt và các kỳ cần chạy lại.

## 13.5. Nhật ký thao tác

Tra cứu người thực hiện, hành động, đối tượng, thời gian, IP/phiên và nội dung thay đổi. Nhật ký phục vụ kiểm tra, không dùng để thay dữ liệu nghiệp vụ.

> **[CẦN BỔ SUNG ẢNH 29–34]** Các trang Chi nhánh, Phòng ban, Người dùng, Nhóm quyền toàn màn hình, Cấu hình và Nhật ký.

---

# Chương 14. Nguồn và cách hiểu một số chỉ tiêu chính

| Chỉ tiêu | Nguồn/cách hiểu tóm tắt |
|---|---|
| Tổng KH | Đếm mã KH lõi trong hồ sơ kỳ theo phạm vi; tập nền từ CIF |
| Tổng nguồn vốn huy động | DP01 số dư dương × tỷ giá; số dư âm không cộng vào tiền gửi |
| Tiền gửi CKH | PF14 `MONTHLYENDBALANCE × tỷ giá`, `MONTERM > 0` |
| TGTT bình quân | PF14 `AVERAGEBALANCE × tỷ giá`, `MONTERM = 0` |
| Tổng dư nợ | Tổng LN01 `DU_NO`; PF10 phân rã loại vay/LDS |
| Dư nợ theo loại | PF10 `EOMBAL` theo `LNTYPE` |
| DPRR chung | Dư nợ LN01 nhóm 1–4 × 0,75% |
| DPRR cụ thể | BC29 nhóm 2–5 theo quy tắc nghiệp vụ hiện hành |
| Phí KH02 | Lọc `ACCTCD`, tính `SUM(CRAMT) − SUM(DRAMT)` |
| Doanh số TKTT | GL02 `SUM(CRAMOUNT)` với tài khoản/loại giao dịch hợp lệ |
| Dư nợ XLRR | RR01 `SUM(DUNO_GOC_HIENTAI)` |
| Thu nợ XLRR | RR01 `SUM(THU_GOC) + SUM(THU_LAI)` |
| Cờ Agribank Plus | CN05 `DK_AGRIBANK_PLUS > 0` theo kỳ |

> **[CẦN XÁC NHẬN NGHIỆP VỤ]** Cách diễn giải `BC29.SO_TRICH_LAP_TRONG_KY` đang dùng như giá trị dự phòng cụ thể lũy kế cuối kỳ cần chủ nguồn xác nhận chính thức.  
> **[CẦN XÁC NHẬN NGHIỆP VỤ]** FTPLN đã được lưu và giám sát ngày thiếu nhưng chưa được công bố là nguồn KPI chính thức cho gốc/lãi phải thu.

Xem chi tiết tại [Báo cáo chức năng và nguồn dữ liệu](BAO_CAO_CHUC_NANG_NGUON_DU_LIEU_HA_TANG_C360.md) và [Từ điển dữ liệu báo cáo](TU_DIEN_DU_LIEU_BAO_CAO.md).

---

# Chương 15. Tình huống sử dụng mẫu

## 15.1. Tra cứu một khách hàng

1. Chọn kỳ và phạm vi.
2. Vào Danh sách KH.
3. Tìm bằng tên hoặc mã KH lõi.
4. Bấm dòng KH.
5. Kiểm tra phạm vi Toàn bộ quan hệ/từng CN.
6. Xem lần lượt Thông tin, Tiền gửi, Tiền vay, Phí, Sản phẩm và lịch sử kỳ.

## 15.2. Lọc và xuất KH dùng Agribank Plus

1. Chọn kỳ và CN.
2. Nâng cao → Sản phẩm đang sử dụng → Agribank Plus.
3. Áp dụng bộ lọc.
4. Vào Danh sách KH, kiểm tra tổng số.
5. Bấm Xuất Excel.
6. Theo dõi tiến độ ở góc dưới phải.
7. Mở file, kiểm tra kỳ, CN, mã KH và cột Agribank Plus.

## 15.3. Rà khách hàng chưa có CBQL

1. Chọn kỳ/phạm vi.
2. Nâng cao → Trạng thái CBQL → Chưa có CBQL hợp lệ.
3. Xem Cảnh báo hoặc Danh sách KH.
4. Xuất danh sách nếu được phép.
5. Đối chiếu mã cán bộ với danh mục user/phòng ban; không tự lấy tên lạ từ file nguồn làm CBQL hợp lệ.

## 15.4. Kiểm tra kỳ có đủ nguồn chưa

1. Vào Giám sát nguồn dữ liệu.
2. Chọn kỳ.
3. Bật chỉ hiện nguồn còn thiếu.
4. Xem CN/nguồn/ngày FTPLN còn thiếu.
5. Vào Kho dữ liệu để import file đúng chuẩn.
6. Chờ import thành công rồi kiểm tra lại.
7. Chạy xử lý lại kỳ nếu nguồn/CIF thay đổi.

---

# Chương 16. Lỗi thường gặp và cách xử lý

| Hiện tượng | Kiểm tra trước | Thông tin gửi quản trị viên |
|---|---|---|
| Không đăng nhập được | Caps Lock, thông báo khóa/tạm khóa | User, thời điểm, lỗi nguyên văn; không gửi mật khẩu |
| Không thấy menu/nút | Hồ sơ cá nhân → Quyền truy cập | Tên menu/quyền cần dùng và ảnh đã che dữ liệu |
| Không thấy kỳ | Kỳ đã import/xử lý chưa, phạm vi có được cấp không | Kỳ, CN và trang đang dùng |
| Không thấy KH | Kỳ, CN, lọc nâng cao, mã KH lõi | Mã KH, kỳ và điều kiện lọc |
| KPI khác bảng | Cùng kỳ/CN/đơn vị chưa; chỉ tiêu đếm KH hay SP | Tên KPI, số, ảnh/Excel và bộ lọc |
| Số liệu bằng 0 | Nguồn thiếu hay thực sự không phát sinh | Kỳ, nguồn, mã KH/chỉ tiêu |
| Loading lâu | Mạng LAN, bộ lọc quá rộng, máy chủ đang xử lý job | URL, thời điểm, kỳ/phạm vi, lỗi console nếu có |
| Xuất Excel thất bại | Quyền, số dòng, bộ lọc | Tên bảng, kỳ, phạm vi, thông báo lỗi |
| Dữ liệu mới chưa lên | Đã xử lý lại kỳ chưa | Tên file, giờ import, kỳ và trạng thái job |
| Báo 403 | Tài khoản không có quyền hoặc ngoài phạm vi | User, chức năng, kỳ/CN; không thử đổi URL để vượt quyền |
| Network Error | Kết nối LAN/tên miền/backend | URL, IP máy, thời điểm và ảnh lỗi |

Không chạy job nhiều lần, không sửa Excel để làm số “khớp” và không thao tác trực tiếp DB khi chưa xác định nguyên nhân.

---

# Chương 17. Danh sách ảnh cần người biên soạn bổ sung

| STT | Ảnh cần chụp | Yêu cầu |
|---:|---|---|
| 01 | Sơ đồ/tổng quan C360 | Không có dữ liệu thật |
| 02 | Đăng nhập | Không để mật khẩu |
| 03 | Hồ sơ cá nhân | Che email/SĐT nếu là dữ liệu thật |
| 04 | Giao diện chung | Đánh số vùng chức năng |
| 05–06 | Bộ lọc chung/nâng cao | Dùng kỳ và điều kiện demo |
| 07–08 | Dashboard và drawer KPI | Che tên/mã KH thật |
| 09 | Cảnh báo & phân nhóm | Dùng dữ liệu được phép |
| 10–11 | Danh sách KH và tiến độ Excel | Che thông tin liên hệ |
| 12–17 | Hồ sơ KH và các tab | Dùng KH demo; che CCCD/STK/SĐT |
| 18–21 | Bốn trang phân tích | Chọn cùng kỳ/phạm vi để nhất quán |
| 22 | Ghim/vừa xem | Không để lịch sử nhạy cảm |
| 23–28 | Sáu trang quản trị dữ liệu | Chụp cả trạng thái tốt và lỗi mẫu |
| 29–34 | Sáu trang quản trị hệ thống | Không để mật khẩu tạm/quyền nhạy cảm không cần thiết |

Quy trình chụp ảnh đề xuất:

1. Dùng tài khoản demo có đúng quyền cần minh họa.
2. Chọn một kỳ và phạm vi thống nhất cho toàn bộ tài liệu.
3. Thu gọn dữ liệu không liên quan.
4. Che tên, CCCD, mã số thuế, số tài khoản, điện thoại và địa chỉ thật.
5. Cắt ảnh đúng vùng chức năng; không chụp cả desktop.
6. Đặt tên `HDSD_01_Dang_nhap.png`, `HDSD_02_Bo_loc.png`…
7. Chèn chú thích dưới mỗi ảnh và cập nhật mục lục hình.

---

# Chương 18. Checklist đào tạo và bàn giao người dùng

Người dùng được coi là hoàn thành hướng dẫn cơ bản khi thực hiện được:

- [ ] Đăng nhập và đổi mật khẩu.
- [ ] Mở hồ sơ cá nhân, kiểm tra phạm vi/quyền.
- [ ] Chọn kỳ, CN, phòng ban và áp dụng bộ lọc.
- [ ] Phân biệt phạm vi toàn bộ quan hệ và từng CN.
- [ ] Đọc card, bảng và tooltip nguồn/công thức.
- [ ] Tìm một KH bằng tên/mã KH lõi.
- [ ] Mở hồ sơ và xem các tab chính.
- [ ] Lọc KH theo một sản phẩm, ví dụ Agribank Plus.
- [ ] Ghim/bỏ ghim một KH.
- [ ] Xuất Excel theo bộ lọc và kiểm tra phạm vi file.
- [ ] Nhận biết nguồn thiếu không đồng nghĩa số bằng 0.
- [ ] Biết thông tin cần gửi khi báo lỗi.
- [ ] Hiểu trách nhiệm bảo mật file đã tải xuống.

Người vận hành dữ liệu cần thực hiện thêm:

- [ ] Import CIF/file nguồn và đọc lỗi.
- [ ] Kiểm tra ma trận độ sẵn sàng.
- [ ] Theo dõi/khôi phục job đúng cách.
- [ ] Đối chiếu danh sách chưa khớp CIF.
- [ ] Kiểm tra số liệu trước khi công bố kỳ.

---

# Chương 19. Lịch sử phiên bản tài liệu

| Phiên bản | Ngày | Nội dung thay đổi | Người cập nhật |
|---|---|---|---|
| 1.0 | 21/09/2026 | Khởi tạo hướng dẫn chi tiết theo chức năng hiện có | Cần điền |

Khi cập nhật hệ thống, cần rà ít nhất: tên menu, quyền, bộ lọc, công thức, giới hạn xuất, quy trình import/xử lý, thông báo lỗi và ảnh minh họa.

## Tài liệu liên quan

- [Giới thiệu C360 phục vụ thuyết trình](GIOI_THIEU_CHUONG_TRINH_C360_CHO_THUYET_TRINH.md)
- [Quy trình vận hành hệ thống](QUY_TRINH_VAN_HANH_HE_THONG_C360.md)
- [Quy trình sao lưu và khôi phục](QUY_TRINH_SAO_LUU_KHOI_PHUC_C360.md)
- [Đặc tả nguồn dữ liệu](DAC_TA_NGUON_DU_LIEU_C360.md)
- [Ma trận phân quyền và bảo mật](MA_TRAN_PHAN_QUYEN_VA_BAO_MAT_C360.md)
- [Kiến trúc hệ thống và ERD](KIEN_TRUC_HE_THONG_VA_ERD_C360.md)
- [Báo cáo chức năng, nguồn dữ liệu và hạ tầng](BAO_CAO_CHUC_NANG_NGUON_DU_LIEU_HA_TANG_C360.md)
- [Từ điển dữ liệu báo cáo](TU_DIEN_DU_LIEU_BAO_CAO.md)
