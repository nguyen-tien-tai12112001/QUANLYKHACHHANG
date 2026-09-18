# Hướng dẫn sử dụng C360 cho người dùng

> Phiên bản tài liệu: 17/09/2026. Dành cho cán bộ, lãnh đạo phòng/chi nhánh và người xem báo cáo. Tên menu/nút dưới đây dựa trên giao diện hiện tại. Bạn chỉ thấy những chức năng được cấp quyền; số liệu luôn chịu giới hạn phạm vi tài khoản của bạn.

## 1. Bắt đầu trong 2 phút

1. Mở địa chỉ C360 do quản trị viên cung cấp. Trong mạng LAN đã cấu hình có thể là `http://c360.agribank.com.vn`; **không nhập `localhost` trên máy cá nhân**.
2. Đăng nhập bằng tên đăng nhập/mã nhân viên hoặc user IPCAS được cấp và mật khẩu. Nếu được yêu cầu đổi mật khẩu lần đầu, hoàn thành trước khi dùng hệ thống.
3. Trên thanh **Phạm vi phân tích**, chọn **Kỳ dữ liệu** trước. Sau đó chọn chi nhánh, phòng ban và **Nâng cao** nếu cần. Bấm **Xem dữ liệu**.
4. Chờ thông báo phiên phân tích hoàn tất hoặc sẵn sàng một phần. Các trang Dashboard, cảnh báo, danh sách KH và phân tích nghiệp vụ dùng chung phạm vi vừa chọn. Một số bảng lớn và hồ sơ chi tiết chỉ truy vấn thêm khi bạn mở chúng.
5. Di chuột lên chỉ tiêu để xem nguồn/cách tính nếu có; bấm thẻ KPI để xem danh sách KH hoặc bảng chi tiết đúng chỉ tiêu. Không cộng các số đã làm tròn trên thẻ để đối soát; xem số đầy đủ trong bảng/tooltip.

Nếu hệ thống báo **“Chọn điều kiện trên bộ lọc chung và bấm Xem dữ liệu”**, đó là trạng thái bình thường trước khi truy vấn, không phải mất dữ liệu. Nếu không có kỳ hoặc menu mong đợi, liên hệ quản trị viên để kiểm tra dữ liệu/quyền.

## 2. Đăng nhập, hồ sơ cá nhân và bảo mật

- Bấm tên/ảnh đại diện trên header để mở **Hồ sơ cá nhân**. Các tab: **Tổng quan** (đơn vị, thông tin liên hệ), **Quyền truy cập** (quyền đang có, quyền cấp thêm/bị từ chối), **Bảo mật** (đổi mật khẩu).
- Bạn có thể sửa họ tên, email, số điện thoại theo form; chi nhánh, phòng ban, mã nhân viên, nhóm quyền và phạm vi phải do quản trị viên sửa.
- Mật khẩu mới cần tối thiểu 10 ký tự, có chữ hoa, chữ thường, số, ký tự đặc biệt và không chứa khoảng trắng/tên đăng nhập/nguyên họ tên. Không dùng lại mật khẩu hiện tại.
- Không hoạt động khoảng 30 phút sẽ bị đăng xuất theo cấu hình mặc định. Tài khoản thường chỉ có một phiên; đăng nhập ở máy khác sẽ kết thúc phiên cũ. Nếu quản trị sửa quyền hoặc thu hồi phiên, bạn cần đăng nhập lại.
- Nhập sai mật khẩu 5 lần liên tiếp sẽ tạm khóa 15 phút; quản trị viên có thể mở tạm khóa sớm. Tài khoản bị khóa thủ công cần quản trị mở khóa, không tự hết sau 15 phút.
- Luôn **Đăng xuất** sau khi dùng máy chung; không cho người khác dùng phiên của mình.

## 3. Bộ lọc chung: bước quan trọng nhất

**Kỳ** là bắt buộc. **Chi nhánh** và **Phòng ban** thu hẹp theo quyền tài khoản; có tài khoản bị cố định chi nhánh nên không chọn “tất cả” được. Bộ lọc **Nâng cao** có nhóm điều kiện về khách hàng, cán bộ, quan hệ nhiều chi nhánh, tiền gửi, tiền vay, sản phẩm/dịch vụ và nhiều tiêu chí khác. Ô “Tên hoặc mã khách hàng” chỉ tìm KH, không tìm cán bộ; cán bộ có ô riêng.

Quy tắc thao tác:

1. Chọn kỳ → chi nhánh → phòng ban (nếu cần) → điều kiện nâng cao.
2. Bấm **Xem dữ liệu** hoặc **Áp dụng & xem dữ liệu**. Chỉ thay đổi ô chọn mà chưa bấm nút thì các bảng vẫn thuộc **phạm vi đã áp dụng trước đó**.
3. Nhìn nhãn kỳ/chi nhánh ở header và trên trang để chắc mình đang xem đúng phạm vi. Nếu cần thay đổi, sửa bộ lọc rồi bấm xem lại.
4. Nếu hệ thống báo phiên “sẵn sàng một phần”, một số khối phân tích đã lỗi/chưa tải xong; không lấy số còn thiếu làm 0 để báo cáo. Làm mới hoặc báo quản trị viên.

Khi bạn bấm **Xem dữ liệu**, hệ thống chuẩn bị KPI và các khối nền cho nhiều trang. Chuyển trang thông thường sẽ dùng kết quả phiên này; **danh sách trang sau, bảng drill-down, lọc/sắp xếp riêng từng bảng và chi tiết một KH** có thể gọi API thêm. Đây không phải việc xử lý lại toàn bộ kỳ. Đóng trình duyệt/đăng xuất sẽ xóa phiên phân tích trên trình duyệt; lần đăng nhập sau cần chọn phạm vi lại.

## 4. Menu chính và việc nên làm ở từng nơi

| Menu | Dùng để làm gì | Thao tác thường gặp |
|---|---|---|
| **Tổng quan → Dashboard điều hành** | Xem quy mô KH, nguồn vốn, dư nợ, rủi ro, phí và kết quả kỳ | Chọn kỳ/phạm vi, di chuột để xem công thức, bấm KPI/bảng để đi sâu |
| **Tổng quan → Cảnh báo & phân nhóm** | Tìm nhóm KH cần chú ý, biến động, cơ hội theo phạm vi | Lọc nhóm, xem bảng, mở hồ sơ KH |
| **Quản lý KH → Danh sách khách hàng** | Tra cứu đầy đủ KH theo kỳ/phạm vi | Tìm tên hoặc mã KH, lọc, sắp xếp, xem chi tiết, xuất nếu có quyền |
| **Phân tích nghiệp vụ → Tiền gửi & dòng tiền** | So sánh quy mô, cơ cấu, tài khoản và dòng tiền | Chuyển biểu đồ/bảng, xem biến động và KH tạo ra chỉ tiêu nếu có |
| **Phân tích nghiệp vụ → Tiền vay & rủi ro** | Cơ cấu dư nợ, nhóm nợ, rủi ro theo kỳ | Bấm nhóm/chỉ tiêu để xem danh sách liên quan |
| **Phân tích nghiệp vụ → Thu nhập & sản phẩm** | Phí, doanh thu và độ phủ sản phẩm | Xem cơ cấu, so sánh kỳ, lọc KH liên quan |
| **Phân tích nghiệp vụ → Đơn vị & cán bộ** | So sánh đơn vị/cán bộ, danh mục KH đang quản lý | Chọn cán bộ trong bảng để mở danh sách KH thuộc cán bộ đó |
| **Quản trị dữ liệu/Quản trị hệ thống** | Import, xử lý kỳ, CIF, cấu hình, tài khoản | Chỉ hiện khi quản trị viên đã cấp quyền tương ứng |

Các thẻ tổng quan không nhất thiết mở cùng một kiểu bảng: danh sách/bảng chi tiết được thiết kế theo ý nghĩa từng chỉ tiêu. Hãy đọc **tên, đơn vị và phạm vi** của bảng trước khi diễn giải. “Số khách hàng”, “số sản phẩm” và “số tài khoản” là ba đại lượng khác nhau.

## 5. Tìm và đọc một hồ sơ khách hàng

1. Vào **Danh sách khách hàng** sau khi áp dụng bộ lọc chung. Gõ **tên hoặc mã KH lõi** vào ô tìm KH; dùng bộ lọc cán bộ riêng khi muốn tìm theo người quản lý.
2. Bấm dòng KH để mở hồ sơ. Nếu KH có quan hệ nhiều chi nhánh, chọn **Toàn bộ quan hệ** để xem số tổng hoặc chọn một chi nhánh để xem số của chi nhánh đó. Chi nhánh chính được đánh dấu; cán bộ quản lý có thể khác theo chi nhánh.
3. Xem các tab **Thông tin KH, Tiền gửi, Tiền vay, Phí thu được, Sản phẩm dịch vụ, Lịch sử các kỳ** và các phần phụ đang hiển thị. Dữ liệu nhạy cảm có thể bị che hoặc không xuất hiện nếu chưa được cấp quyền riêng.
4. Bấm loại tiền gửi/khoản vay hoặc dòng tài khoản để xem chi tiết được hỗ trợ. Di chuột lên số tiền/thẻ để xem số đầy đủ, nguồn và cách tính; một số thông tin chi tiết tải thêm khi mở.
5. So sánh **kỳ này với kỳ trước** tại phần lịch sử. Một KH không xuất hiện ở một kỳ không mặc nhiên nghĩa là đã rời bỏ; cần kiểm tra nguồn, CIF và quyền/phạm vi.

“Tiền gửi cuối kỳ” khác “TGTT bình quân”; “doanh thu/phí trong kỳ” không phải tổng dư nợ. Khi chọn một chi nhánh, không dùng số **Toàn bộ quan hệ** để quy trách nhiệm cho chi nhánh đó. Ngoại tệ chỉ so sánh sau khi xác nhận chỉ tiêu đã quy đổi VNĐ theo tỷ giá kỳ.

## 6. Ghim KH, lịch sử vừa xem và xuất dữ liệu

- Tại bảng KH có hỗ trợ, bấm **chuột phải dòng KH → Ghim KH**. Biểu tượng ghim trên header có số lượng; bấm để mở **Không gian làm việc của tôi**.
- Danh sách ghim lưu riêng theo tài khoản. Bấm KH đã ghim để mở lại; nếu chưa chọn kỳ, hệ thống thử dùng kỳ đã xử lý mới nhất bạn được phép xem. Có thể **Bỏ ghim** từng KH. Tab **Vừa xem** giúp trở lại màn hình/bộ lọc gần đây và có nút xóa lịch sử.
- Nút **Xuất Excel** chỉ hiện khi bạn có quyền xuất của màn hình đó. File xuất chịu cùng điều kiện/phạm vi đang áp dụng hoặc bộ lọc của bảng. Mở file để kiểm tra kỳ, chi nhánh, điều kiện lọc và đơn vị tiền trước khi gửi đi.
- Không chia sẻ file Excel chứa KH, CCCD, tài khoản, giao dịch hoặc dư nợ ngoài phạm vi được phép. Ghim chỉ giúp tra nhanh, **không mở rộng quyền dữ liệu**.

## 7. Khi nào cần báo quản trị viên

| Tình huống | Bạn tự kiểm tra | Gửi quản trị viên thông tin gì |
|---|---|---|
| Không đăng nhập được | Tên đăng nhập, Caps Lock, tài khoản có bị khóa/tạm khóa không | Thông báo lỗi nguyên văn, thời điểm, tên đăng nhập; **không gửi mật khẩu** |
| Menu/nút bị thiếu hoặc báo 403 | Hồ sơ cá nhân → Quyền truy cập; đúng tài khoản chưa | Menu, quyền cần dùng, kỳ/chi nhánh, ảnh màn hình đã che dữ liệu nhạy cảm |
| Không thấy KH mong đợi | Kỳ, chi nhánh, lọc nâng cao, mã KH lõi; có đang xem một CN thay vì toàn bộ không | Mã KH, kỳ, phạm vi, điều kiện lọc và KH có trong CIF/nguồn nào nếu biết |
| KPI và bảng chi tiết khác nhau | Có cùng kỳ, cùng CN, cùng đơn vị, đã mở đúng chỉ tiêu chưa | Tên KPI, số hiển thị, kỳ, phạm vi, ảnh/Excel có giới hạn truy cập |
| Dữ liệu mới import nhưng màn hình chưa đổi | Đã bấm Xem dữ liệu lại chưa | Kỳ, tên file nguồn, thời điểm import; quản trị kiểm tra job xử lý lại |
| Tải lâu hoặc lỗi 500/Network Error | Mạng LAN, tải lại một lần, chờ trạng thái | URL trang, thời điểm, kỳ/phạm vi, lỗi nguyên văn; không thử bấm chạy job nhiều lần |

Không tự sửa số liệu bằng Excel để “khớp” báo cáo. Nếu cần kiểm tra nguồn/công thức chi tiết, nhờ người có quyền xem **Từ điển & mapping** hoặc quản trị truy vết số liệu.

## 8. Quy tắc đọc và sử dụng số liệu

- Luôn nêu **kỳ dữ liệu, phạm vi chi nhánh/phòng ban và điều kiện lọc** khi gửi số liệu.
- Số trên thẻ có thể được rút gọn để dễ đọc; đối soát bằng số đầy đủ trong tooltip/bảng/file xuất.
- Chênh lệch tháng trước chỉ có ý nghĩa khi cả hai kỳ đã được xử lý và cùng cách lọc.
- Nguồn thiếu, CIF chưa khớp, job lỗi hoặc phiên chỉ sẵn sàng một phần là **cảnh báo chất lượng**, không phải số 0 chắc chắn.
- Với KH đa chi nhánh, xem cả quan hệ tổng và chi tiết chi nhánh trước khi kết luận ai đang quản lý hoặc số liệu thuộc đơn vị nào.

Muốn hiểu nguồn cột và công thức sâu hơn, xem [trình bày nguồn số liệu](TRINH_BAY_NGUON_SO_LIEU_VA_HIEN_THI.md), [từ điển số liệu](TU_DIEN_DU_LIEU_BAO_CAO.md) hoặc liên hệ quản trị dữ liệu. Những tài liệu phân tích cũ có thể mô tả quy tắc trước khi chuyển tập KH nền sang CIF; giao diện và quy tắc đã triển khai là căn cứ vận hành hiện tại.
