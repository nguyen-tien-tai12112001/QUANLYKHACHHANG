# Xử lý file bổ sung Bảo lãnh và OAB/Loa thần tài

## Mục tiêu

Hai file bổ sung được dùng để nhặt thêm dịch vụ cho hồ sơ khách hàng sau khi đã có dữ liệu nền từ DP01:

- `BaoLanh...xls`: xác định khách hàng có sử dụng Bảo lãnh hoặc phát hành LC.
- `OAB...xlsx`: xác định khách hàng có dùng Loa biến động số dư/Loa thần tài.

Các file này được đưa vào phần **Xử lý dữ liệu khách hàng > File bổ sung theo kỳ**. Khi chạy lại xử lý kỳ dữ liệu, hệ thống sẽ đọc file bổ sung, lưu bảng nguồn riêng và cập nhật cờ dịch vụ vào hồ sơ báo cáo.

## Bảng dữ liệu nguồn mới

### `supplemental_bao_lanh_records`

Nguồn từ file `BaoLanhT62026.xls`.

Các cột chính:

| Cột DB | Cột file nguồn | Ý nghĩa |
|---|---|---|
| `period_key` | Kỳ đang chọn khi upload | Kỳ dữ liệu xử lý |
| `branch_code` | `Ma_CN` | Mã chi nhánh |
| `ma_kh` | `Ma_Kh` | Mã khách hàng, đã bỏ dấu nháy/khoảng trắng |
| `ma_kh_chuan` | `Ma_CN + Ma_Kh` | Mã khách hàng chuẩn theo chi nhánh |
| `ten_kh` | `Ten_KH` | Tên khách hàng |
| `tai_khoan` | `Tai_Khoan` | Tài khoản |
| `so_hdbl` | `So_HDBL` | Số hợp đồng bảo lãnh/LC |
| `loai_bllc` | `Loaibllc` | Mã loại nghiệp vụ |
| `tien_te` | `tien_te` | Loại tiền |
| `nguyen_te` | `Nguyete` | Số tiền nguyên tệ |
| `ty_gia` | `Ty_gia` | Tỷ giá |
| `vnd` | `VND` | Giá trị VND nếu có trong file |
| `so_tien` | `SoTien` | Số tiền |
| `is_bao_lanh` | Từ `Loaibllc` | Cờ dịch vụ Bảo lãnh |
| `is_lc` | Từ `Loaibllc` | Cờ dịch vụ Phát hành LC |

Quy tắc phân loại hiện tại:

- `Loaibllc` thuộc `ILU`, `ILS` => `phat_hanh_lc = 1`.
- `Loaibllc` thuộc `VPB`, `VMB`, `VAB`, `VBB`, `VSB`, `VRT` hoặc bắt đầu bằng `V` => `bao_lanh = 1`.

### `supplemental_oab_records`

Nguồn từ file `OAB-ThongKeLoaDangKyT62026.xlsx`.

Các cột chính:

| Cột DB | Cột file nguồn | Ý nghĩa |
|---|---|---|
| `period_key` | Kỳ đang chọn khi upload | Kỳ dữ liệu xử lý |
| `branch_code` | Tách từ `Chi nhánh` | Mã chi nhánh |
| `branch_name` | Tách từ `Chi nhánh` | Tên chi nhánh |
| `provider` | `Nhà cung cấp Loa` | Nhà cung cấp |
| `ten_kh` | `Tên KH` | Tên khách hàng |
| `tk_ao` | `TK ảo` | Tài khoản ảo |
| `tk_agribank` | `TK Agribank` | Số tài khoản Agribank dùng để đối chiếu DP01 |
| `phone` | `SĐT` | Số điện thoại |
| `id_number` | `Số căn cước` | Số giấy tờ |

Quy tắc đối chiếu:

- Lấy `tk_agribank` trong OAB.
- So với `dp01_deposit_accounts.so_tai_khoan` cùng kỳ.
- Nếu khớp thì lấy được `ma_kh`, `ma_cn` từ DP01.
- Cập nhật `loa_bien_dong_so_du = 1` cho khách hàng/chi nhánh tương ứng.

## Luồng xử lý khi chạy kỳ dữ liệu

1. Xóa kết quả xử lý cũ của kỳ trong:
   - `customer_period_profiles`
   - `customer_period_branch_details`
   - `customer_period_exchange_rates`
2. Đọc lại các file bổ sung đã upload của kỳ.
3. Nếu tên file chứa `baolanh` thì lưu vào `supplemental_bao_lanh_records`.
4. Nếu tên file chứa `oab` hoặc `loa` thì lưu vào `supplemental_oab_records`.
5. Tạo bảng tỷ giá theo DP01.
6. Đối chiếu DP01 với LN01, CN05, PF14 để tạo chi tiết theo chi nhánh/PGD.
7. Đối chiếu thêm Bảo lãnh/OAB để cập nhật:
   - `bao_lanh`
   - `phat_hanh_lc`
   - `loa_bien_dong_so_du`
8. Gom dữ liệu chi tiết thành hồ sơ khách hàng tổng ở `customer_period_profiles`.

## Cách sử dụng trên giao diện

1. Vào **Xử lý dữ liệu khách hàng**.
2. Chọn kỳ dữ liệu cần xử lý.
3. Thêm file bổ sung:
   - `BaoLanhT62026.xls`
   - `OAB-ThongKeLoaDangKyT62026.xlsx`
4. Bấm chạy xử lý dữ liệu của kỳ.
5. Mở **Báo cáo** và chọn lại kỳ đó.
6. Các dịch vụ sau sẽ được hiển thị như dữ liệu thật:
   - Bảo lãnh
   - Phát hành LC
   - Loa biến động số dư

## Cài đặt thư viện cần có

Backend cần thêm `xlrd` để đọc file `.xls`.

```bat
cd backend
.venv\Scripts\activate
pip install -r requirements.txt
```

Sau khi cài xong, restart backend:

```bat
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Ghi chú mở rộng

- Sau này nếu có nhiều loại file bổ sung khác, nên tạo bảng cấu hình nhận diện file gồm: mã loại file, mẫu tên file, danh sách header bắt buộc, bảng đích, key đối chiếu và cột dịch vụ cần cập nhật.
- Với file không có `MA_KH`, ưu tiên đối chiếu qua số tài khoản DP01 để tìm lại khách hàng.
- Với file có cả `MA_CN` và `MA_KH`, ưu tiên đối chiếu trực tiếp theo `MA_CN + MA_KH`.
- Nên bổ sung màn hình xem “dòng nguồn” trong modal chi tiết khách hàng để biết một dịch vụ được tích từ file nào, dòng nào.
