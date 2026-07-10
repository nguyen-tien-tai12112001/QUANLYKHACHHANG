# Tính điểm nơi giao dịch chính của khách hàng

## Mục tiêu

Xác định khách hàng đang phát sinh giao dịch và sử dụng dịch vụ nhiều nhất tại chi nhánh/PGD nào.

Kết quả dùng để:

- Biết **chi nhánh/PGD giao dịch chính** của từng khách hàng.
- Hỗ trợ phân công nơi chăm sóc khách hàng chính.
- Nhận diện khách hàng phát sinh nhiều chi nhánh nhưng chưa rõ đầu mối quản lý.
- Làm rõ trong modal chi tiết: khách hàng vay, gửi, dùng dịch vụ ở đâu.

## Nguồn dữ liệu

Hệ thống tính trên bảng:

```text
customer_period_branch_details
```

Bảng này được tạo sau khi đối chiếu các file:

- `DP01`: số dòng tài khoản, doanh số CR/DR, thông tin chi nhánh/PGD.
- `LN01`: dư nợ vay, loại vay, cán bộ quản lý khoản vay.
- `PF14`: tiền gửi CKH, TGTT bình quân.
- `CN05`: dịch vụ tài khoản, Agribank Plus, SMS, thẻ.
- File bổ sung Bảo lãnh/OAB: bảo lãnh, LC, loa biến động số dư.

Sau đó kết quả chính được lưu vào bảng:

```text
customer_period_profiles
```

Các cột mới:

| Cột | Ý nghĩa |
|---|---|
| `primary_branch_code` | Mã chi nhánh giao dịch chính |
| `primary_pgd_code` | Mã PGD/phòng giao dịch chính |
| `primary_pgd_name` | Tên PGD/phòng giao dịch chính |
| `primary_location_score` | Điểm gắn bó tại nơi giao dịch chính |
| `primary_location_reason` | Lý do nơi đó được chọn |

## Công thức tính điểm

Mỗi khách hàng có thể phát sinh tại nhiều chi nhánh/PGD. Hệ thống tính điểm cho từng điểm phát sinh.

```text
Điểm gắn bó =
  40% điểm giá trị tài chính
+ 20% điểm doanh số chuyển tiền về tài khoản
+ 30% điểm số lượng dịch vụ đang dùng
+ 10% điểm số dòng DP01 phát sinh
```

Công thức kỹ thuật hiện tại:

```text
financial_value = dư nợ vay + tiền gửi CKH + TGTT bình quân

service_count =
  thấu chi
+ TK số đẹp
+ Agribank Plus
+ Tin nhắn OTT
+ e-Banking
+ SMS nhắc nợ vay
+ SMS tiền gửi
+ Thẻ ghi nợ nội địa
+ Thẻ tín dụng nội địa
+ Thẻ tín dụng quốc tế
+ Thẻ tín dụng Lộc Việt
+ Bảo lãnh
+ Loa biến động số dư
+ Phát hành LC

primary_location_score =
  financial_value / 1.000.000 * 0.40
+ doanh_so_cramt / 1.000.000 * 0.20
+ service_count * 10 * 0.30
+ dp_record_count * 2 * 0.10
```

## Quy tắc chọn nơi giao dịch chính

Với mỗi khách hàng, hệ thống sắp xếp các chi nhánh/PGD theo thứ tự:

1. Điểm gắn bó cao nhất.
2. Nếu bằng điểm, ưu tiên nơi có giá trị tài chính lớn hơn.
3. Nếu vẫn bằng, ưu tiên nơi có nhiều dịch vụ hơn.
4. Nếu vẫn bằng, ưu tiên nơi có nhiều dòng DP01 hơn.
5. Cuối cùng sắp xếp theo mã chi nhánh/PGD để kết quả ổn định.

Dòng đứng đầu được chọn là:

```text
Nơi giao dịch chính
```

## Hiển thị trên giao diện

### Trang Báo cáo

Bảng khách hàng không hiển thị điểm gắn bó trực tiếp để tránh rối giao diện.

Các cột có sẵn được dùng để gắn nhãn:

- Cột **Mã CN**: chi nhánh chính có tag `Chính`, các chi nhánh còn lại có tag `Phụ`.
- Cột **PGD**: PGD chính có tag `Chính`, các PGD còn lại có tag `Phụ`.
- Nếu kỳ dữ liệu chưa chạy lại xử lý hoặc chưa xác định được nơi chính thì không gắn nhãn.

Điểm gắn bó vẫn được tính và lưu trong DB để hệ thống xác định đâu là nơi chính, nhưng mặc định không phơi điểm ra bảng báo cáo.

### Modal chi tiết khách hàng

Phần **Chi tiết theo chi nhánh / PGD**:

- Dòng giao dịch chính được đưa lên đầu.
- Dòng giao dịch chính được highlight nền vàng nhạt.
- Có tag **Chính**.
- Các điểm phát sinh còn lại có tag **Phụ**.
- Không hiển thị điểm gắn bó, chỉ dùng điểm nội bộ để sắp xếp và xác định chính/phụ.

### Phân nhóm khách hàng

Trong tab **Phân nhóm KH** có thêm nhóm:

```text
KH cần phân công nơi chăm sóc chính
```

Nhóm này gồm khách hàng phát sinh nhiều chi nhánh và đã xác định được nơi giao dịch nổi trội.

## Cách cập nhật dữ liệu kỳ cũ

Các kỳ đã chạy xử lý trước khi có chức năng này sẽ chưa có điểm giao dịch chính.

Cách cập nhật:

1. Vào trang **Xử lý dữ liệu khách hàng**.
2. Chọn kỳ dữ liệu cần cập nhật.
3. Bấm **Chạy dữ liệu** hoặc **Chạy lại xử lý**.
4. Sau khi job hoàn thành, vào trang **Báo cáo** để xem cột mới.

## Gợi ý nâng cấp sau

- Cho cấu hình trọng số điểm trên giao diện Cấu hình.
- Thêm báo cáo top chi nhánh/PGD đang giữ nhiều khách hàng chính nhất.
- Cảnh báo khách hàng có dư nợ ở một chi nhánh nhưng tiền gửi lớn ở chi nhánh khác.
- Gắn cán bộ chăm sóc chính theo nơi giao dịch chính.
- Cho phép lãnh đạo duyệt/chốt lại chi nhánh quản lý chính nếu muốn khác kết quả tự động.
