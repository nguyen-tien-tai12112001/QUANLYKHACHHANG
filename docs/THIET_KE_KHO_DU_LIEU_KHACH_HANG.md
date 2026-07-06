# Thiet Ke Kho Du Lieu Khach Hang

Tai lieu nay mo ta y tuong, nghiep vu, cau truc du lieu va logic code du kien cho phan mem QUANLYKHACHHANG.

## 1. Muc Tieu

Phan mem dung de import cac file du lieu theo ky, luu vao PostgreSQL, chuan hoa va tong hop thanh kho du lieu khach hang.

Muc tieu chinh:

- Import du lieu tu file CSV/Excel theo tung ky.
- Luu file goc tren server de doi chieu lai khi can.
- Doc va luu du lieu da chuan hoa vao database.
- Quan ly du lieu theo ky, chi nhanh, loai file.
- Doi chieu du lieu giua cac ky.
- Tong hop du lieu theo khach hang.
- Moi khach hang trong bao cao tong hop cuoi cung chi co mot dong chinh.
- Ho tro them cac loai file moi trong tuong lai.

## 2. Nguyen Tac Import

Khong nen chi doc file truc tiep moi lan can phan tich. Huong dung la:

1. Upload file len server.
2. Luu file goc vao thu muc `backend/uploads`.
3. Tao ban ghi quan ly file import trong database.
4. Doc du lieu tu file.
5. Kiem tra dung dinh dang file.
6. Chuan hoa ten cot va gia tri.
7. Tao cac cot chuan, dac biet la `ma_kh_chuan`.
8. Luu du lieu chi tiet vao cac bang import rieng.
9. Tong hop du lieu vao bang bao cao theo ky.

Ly do nen luu du lieu vao database:

- De quan ly lich su import.
- De so sanh giua cac ky.
- De truy van, loc, tong hop nhanh hon.
- De kiem tra file nao da import.
- De xu ly lai khi co loi.
- De sau nay lam bao cao, dashboard va xuat Excel.

File goc van can duoc giu lai de doi chieu, nhung database moi la nguon du lieu chinh de phan tich.

## 3. Quy Uoc Ten File

Truoc mat he thong ho tro cac file:

```text
MACN_CN05_yyyymmdd.csv
MACN_DP01_yyyymmdd.csv
MACN_LN01_yyyymmdd.csv
MACN_PF14_yyyymmdd.csv
```

Trong do:

- `MACN`: ma chi nhanh, vi du `2600`, `2602`, ..., `2609`.
- `CN05`, `DP01`, `LN01`, `PF14`: loai file du lieu.
- `yyyymmdd`: ngay/ky du lieu.

Vi du:

```text
2600_CN05_20240630.csv
2602_CN05_20240630.csv
2600_DP01_20240630.csv
2602_LN01_20240630.csv
```

Quy tac parse ten file:

```text
branch_code = phan truoc dau gach duoi dau tien
file_type = phan giua
period_key = phan ngay dang yyyymmdd
```

Neu ten file khong dung mau, he thong khong import va tra loi ro loi.

## 4. Khai Niem Ky Du Lieu

Moi file import phai gan voi mot ky du lieu.

Vi du:

```text
period_key = 20240630
period_date = 2024-06-30
branch_code = 2600
file_type = DP01
```

Can quan ly de biet:

- Ky nao da import.
- Chi nhanh nao da import.
- Loai file nao da import.
- File nao thanh cong.
- File nao loi.
- So dong import thanh cong.
- So dong loi.

## 5. File DP01 La Nguon Khach Hang Chinh

File `DP01` duoc xem la nguon chinh de xac dinh khach hang chuan trong he thong.

Cot can luu tu DP01:

```text
MA_CN
MA_KH
TEN_KH
DP_TYPE_NAME
CCY
CURRENT_BALANCE
SO_TAI_KHOAN
OPENING_DATE
MATURITY_DATE
MONTH_TERM
MA_PGD
TEN_PGD
DP_TYPE_CODE
CUST_TYPE
CUST_TYPE_NAME
ID_NUMBER
SEX_TYPE
BIRTH_DATE
TELEPHONE
DRAMT
CRAMT
EMPLOYEE_NUMBER
EMPLOYEE_NAME
TYGIA
```

Tu `MA_CN` va `MA_KH`, he thong tao cot:

```text
MA_KH_CHUAN = MA_CN + MA_KH
```

Vi du:

```text
MA_CN = 2600
MA_KH = '123456789
MA_KH_CHUAN = 2600123456789
```

Quy tac lam sach `MA_KH`:

- Bo dau `'`.
- Trim khoang trang trai/phai.
- Khong ep kieu number.
- Giu nguyen so 0 dau neu co.
- Neu rong thi danh dau loi dong du lieu.

Ly do can `MA_KH_CHUAN`:

- `MA_KH` co the trung giua cac chi nhanh.
- `2600 + 123456789` khac `2602 + 123456789`.
- Can khoa chuan de noi du lieu giua DP01, CN05, LN01, PF14 va cac file moi sau nay.

## 6. Nguyen Tac Tong Hop Theo Khach Hang

Mot khach hang co the:

- Co nhieu tai khoan tien gui.
- Co nhieu khoan vay.
- Co nhieu san pham dich vu.
- Xuat hien o nhieu file.
- Xuat hien o nhieu ky.
- Co du lieu tai nhieu chi nhanh.

Khi len bao cao tong hop theo ky, moi `ma_kh_chuan` chi nen co mot dong.

Nguyen tac tong hop:

- Cot tien/sodu: tinh `SUM`.
- Cot trang thai dich vu: neu co su dung o bat ky nguon nao thi gan `1`, nguoc lai `0`.
- Cot ten khach hang: uu tien tu DP01, neu khong co thi lay tu file khac.
- Cot can bo quan ly: uu tien theo quy tac nghiep vu sau nay, truoc mat lay tu DP01 hoac LN01 neu co.
- Cot chi nhanh/PGD: luu ma chi nhanh chinh va co the luu danh sach chi nhanh phat sinh.

## 7. Cac File Dau Vao Hien Tai

### 7.1. DP01

Vai tro:

- Nguon chinh xac dinh danh muc khach hang.
- Nguon thong tin tien gui/tai khoan.
- Nguon thong tin nhan su quan ly neu co.

Cot chinh:

```text
MA_CN, MA_KH, TEN_KH, DP_TYPE_NAME, CCY, CURRENT_BALANCE,
SO_TAI_KHOAN, OPENING_DATE, MATURITY_DATE, MONTH_TERM,
MA_PGD, TEN_PGD, DP_TYPE_CODE, CUST_TYPE, CUST_TYPE_NAME,
ID_NUMBER, SEX_TYPE, BIRTH_DATE, TELEPHONE, DRAMT, CRAMT,
EMPLOYEE_NUMBER, EMPLOYEE_NAME, TYGIA
```

Cot sinh them:

```text
ma_kh_chuan
period_key
period_date
branch_code
file_id
import_batch_id
```

### 7.2. CN05

Vai tro:

- Nguon du lieu ve tinh hinh su dung san pham dich vu.

Cot chinh:

```text
MA_CN, MA_KH, TEN_KH, TKTT_SO_TK, TKTT_TK_SODEP, TK_OSB,
TG_TIEN_GUI_LOI_THONG_MINH, TG_TIEN_GUI_TRUC_TUYEN,
TG_TIEN_GUI_TAI_QUAY, TG_SMS_TIEN_GUI, VV_TONG_SO_LDS,
VV_SMS_TIEN_VAY, VV_TONG_SO_LDS_CENTERCUT, THE_GHI_NO_NOI_DIA,
THE_GHI_NO_QUOC_TE, THE_TIN_DUNG_NOI_DIA, THE_TIN_DUNG_QUOC_TE,
VISA, MASTER, JCB, DK_AGRIBANK_PLUS, DK_AGRIBANK_PLUS_OTT,
SMS_BANKING, TIEN_VAY
```

Mapping du kien sang mau bao cao:

```text
TK_OSB -> Thau chi
TKTT_TK_SODEP -> TK so dep
DK_AGRIBANK_PLUS -> Agribank plus
DK_AGRIBANK_PLUS_OTT -> Tin nhan OTT
VV_SMS_TIEN_VAY -> SMS nhac no vay
TG_SMS_TIEN_GUI -> SMS tien gui
THE_GHI_NO_NOI_DIA -> The ghi no noi dia
THE_TIN_DUNG_QUOC_TE -> The TD quoc te
```

### 7.3. LN01

Vai tro:

- Nguon du lieu ve khoan vay.
- Lay du no, loai vay, can bo quan ly.

Cot chinh:

```text
BRCD, CUSTSEQ, CUSTNM, CCY, DU_NO, DSBSSEQ,
TRANSACTION_DATE, INTEREST_RATE, APPRSEQ, LOAN_TYPE,
OFFICER_ID, OFFICER_NAME, TRCTCD, TRCTNM, ACCRUAL_AMOUNT,
ACCRUAL_AMOUNT_END_OF_MONTH, TY_GIA, OFFICER_IPCAS
```

Mapping chuan hoa:

```text
BRCD -> ma_cn
CUSTSEQ -> ma_kh
CUSTNM -> ten_kh
DU_NO -> so_du_tien_vay
LOAN_TYPE -> loai_vay
OFFICER_ID -> ma_cb
OFFICER_NAME -> ten_can_bo
```

Tao `ma_kh_chuan`:

```text
ma_kh_chuan = BRCD + CUSTSEQ_da_lam_sach
```

### 7.4. PF14

Vai tro:

- Nguon du lieu ve so du binh quan va so du cuoi thang.

Cot chinh:

```text
TRBRCD, PRODUCTCODE, ACCOUNTNO, CUSTSEQ, CUSTNAME,
AVERAGEBALANCE, MONTHLYENDBALANCE, OPERATIONALFUNDS,
MONTERM, CCY
```

Mapping chuan hoa:

```text
TRBRCD -> ma_cn
CUSTSEQ -> ma_kh
CUSTNAME -> ten_kh
AVERAGEBALANCE -> so_du_tgtt_binh_quan
MONTHLYENDBALANCE -> so_du_cuoi_thang
OPERATIONALFUNDS -> so_du_hoat_dong
```

Luu y:

- Neu file PF14 co cot ngay giao dich/snapshot nhu `TRDATE` du khong duoc highlight vang, nen can nhac luu lai vi huu ich cho bao cao theo ky.

## 8. Mau Bao Cao Dich

File `BANG QUAN LY KHACH HANG.xlsx` la mau bao cao dau ra.

Cac nhom du lieu can sinh:

### 8.1. Thong tin khach hang

```text
STT
Ma CN
Ma PGD
Ma khach hang
Ten khach hang
Loai khach hang
```

### 8.2. Thong tin vay, tien gui, CASA

```text
So du tien vay
So du tien gui CKH
Loai vay
Doanh so chuyen tien ve tai khoan
So du TGTT binh quan trong thang
```

### 8.3. Dich vu Agribank

```text
Thau chi
TK so dep
Agribank plus
Tin nhan OTT
e-Banking
SMS nhac no vay
SMS tien gui
The ghi no noi dia
The TD quoc te
The TD Loc Viet
TT tien dien
TT tien nuoc
TT cuoc vien thong
Tra luong qua the
BATD
BATK
BH oto, xe may
BH khac
Bao lanh
Loa bien dong so du
Phan mem ban hang
POS
Chi tra kieu hoi
Phat hanh LC
Thanh toan quoc te
Mua ban ngoai te
```

### 8.4. Hieu qua va can bo quan ly

```text
Tong loi ich thu duoc cua KH trong thang
Ma CB
Ten can bo
Ghi chu
```

## 9. Cac Cot Chua Co Nguon Ro

Hien tai chua thay nguon ro rang trong 4 file da phan tich cho cac cot:

```text
e-Banking
TT tien dien
TT tien nuoc
TT cuoc vien thong
Tra luong qua the
BATD
BATK
BH oto, xe may
BH khac
Bao lanh
Loa bien dong so du
Phan mem ban hang
POS
Chi tra kieu hoi
Phat hanh LC
Thanh toan quoc te
Mua ban ngoai te
Tong loi ich thu duoc cua KH trong thang
```

Huong xu ly:

- Cho phep de trong hoac mac dinh `0`.
- Cho phep nguoi dung bo sung thu cong sau khi tong hop.
- Sau nay khi co file nguon moi thi bo sung mapping.

## 10. Thiet Ke Database Du Kien

### 10.1. Bang `import_batches`

Quan ly mot dot import/ky import.

Cot du kien:

```text
id
period_key
period_date
description
created_at
created_by
status
note
```

### 10.2. Bang `import_files`

Quan ly tung file da upload.

Cot du kien:

```text
id
import_batch_id
original_filename
stored_filename
file_path
file_type
branch_code
period_key
period_date
file_ext
file_size
total_rows
success_rows
error_rows
status
error_message
uploaded_at
uploaded_by
```

Unique de tranh import trung:

```text
branch_code + file_type + period_key + original_filename
```

### 10.3. Bang `customers`

Danh muc khach hang chuan.

Cot du kien:

```text
id
ma_kh_chuan
ma_cn
ma_kh
ten_kh
id_number
birth_date
sex_type
telephone
first_seen_period
last_seen_period
created_at
updated_at
```

Unique:

```text
ma_kh_chuan
```

### 10.4. Bang `dp01_deposit_accounts`

Luu chi tiet file DP01.

Cot du kien:

```text
id
import_file_id
import_batch_id
period_key
period_date
branch_code
ma_kh_chuan
ma_cn
ma_kh
ten_kh
dp_type_name
ccy
current_balance
so_tai_khoan
opening_date
maturity_date
month_term
ma_pgd
ten_pgd
dp_type_code
cust_type
cust_type_name
id_number
sex_type
birth_date
telephone
dramt
cramt
employee_number
employee_name
tygia
raw_data
created_at
```

### 10.5. Bang `cn05_customer_services`

Luu chi tiet file CN05.

Cot du kien:

```text
id
import_file_id
import_batch_id
period_key
period_date
branch_code
ma_kh_chuan
ma_cn
ma_kh
ten_kh
tktt_so_tk
tktt_tk_sodep
tk_osb
tg_tien_gui_loi_thong_minh
tg_tien_gui_truc_tuyen
tg_tien_gui_tai_quay
tg_sms_tien_gui
vv_tong_so_lds
vv_sms_tien_vay
vv_tong_so_lds_centercut
the_ghi_no_noi_dia
the_ghi_no_quoc_te
the_tin_dung_noi_dia
the_tin_dung_quoc_te
visa
master
jcb
dk_agribank_plus
dk_agribank_plus_ott
sms_banking
tien_vay
raw_data
created_at
```

### 10.6. Bang `ln01_loans`

Luu chi tiet file LN01.

Cot du kien:

```text
id
import_file_id
import_batch_id
period_key
period_date
branch_code
ma_kh_chuan
brcd
custseq
custnm
ccy
du_no
dsbsseq
transaction_date
interest_rate
apprseq
loan_type
officer_id
officer_name
trctcd
trctnm
accrual_amount
accrual_amount_end_of_month
ty_gia
officer_ipcas
raw_data
created_at
```

### 10.7. Bang `pf14_account_balances`

Luu chi tiet file PF14.

Cot du kien:

```text
id
import_file_id
import_batch_id
period_key
period_date
branch_code
ma_kh_chuan
trbrcd
productcode
accountno
custseq
custname
averagebalance
monthlyendbalance
operationalfunds
monterm
ccy
raw_data
created_at
```

### 10.8. Bang `customer_period_summary`

Bang tong hop theo khach hang theo ky.

Cot du kien:

```text
id
period_key
period_date
ma_kh_chuan
ma_cn
ma_pgd
ma_kh
ten_kh
loai_khach_hang
so_du_tien_vay
so_du_tien_gui_ckh
loai_vay
doanh_so_chuyen_tien_ve_tai_khoan
so_du_tgtt_binh_quan
thau_chi
tk_so_dep
agribank_plus
tin_nhan_ott
e_banking
sms_nhac_no_vay
sms_tien_gui
the_ghi_no_noi_dia
the_td_quoc_te
the_td_loc_viet
tt_tien_dien
tt_tien_nuoc
tt_cuoc_vien_thong
tra_luong_qua_the
batd
batk
bh_oto_xe_may
bh_khac
bao_lanh
loa_bien_dong_so_du
phan_mem_ban_hang
pos
chi_tra_kieu_hoi
phat_hanh_lc
thanh_toan_quoc_te
mua_ban_ngoai_te
tong_loi_ich_thang
ma_cb
ten_can_bo
ghi_chu
created_at
updated_at
```

Unique:

```text
period_key + ma_kh_chuan
```

## 11. Kieu Du Lieu PostgreSQL Du Kien

Nguyen tac:

- Ma, so tai khoan, so giay to, so dien thoai: `VARCHAR`.
- So tien, so du: `NUMERIC(20,2)`.
- Lai suat, ty gia: `NUMERIC(18,6)`.
- Ngay: `DATE`.
- Trang thai dich vu: `SMALLINT` hoac `BOOLEAN`.
- Du lieu raw: `JSONB`.

Vi du:

```text
ma_kh_chuan VARCHAR(32)
ma_cn VARCHAR(10)
ma_kh VARCHAR(32)
ten_kh VARCHAR(255)
current_balance NUMERIC(20,2)
opening_date DATE
tygia NUMERIC(18,6)
raw_data JSONB
```

## 12. Logic Lam Sach Du Lieu

### 12.1. Lam sach text

```python
def clean_text(value):
    if value is None:
        return None
    text = str(value).strip()
    if text.startswith(\"'\"):
        text = text[1:]
    text = text.strip()
    return text or None
```

### 12.2. Lam sach ma khach hang

```python
def clean_customer_code(value):
    text = clean_text(value)
    if text is None:
        return None
    return text.replace(\" \", \"\")
```

### 12.3. Tao ma khach hang chuan

```python
def build_ma_kh_chuan(branch_code, customer_code):
    branch = clean_text(branch_code)
    customer = clean_customer_code(customer_code)
    if not branch or not customer:
        return None
    return f\"{branch}{customer}\"
```

### 12.4. Parse ngay dang yyyymmdd

```python
from datetime import datetime

def parse_yyyymmdd(value):
    text = clean_text(value)
    if not text or text == \"00000000\":
        return None
    return datetime.strptime(text, \"%Y%m%d\").date()
```

### 12.5. Parse so tien

```python
from decimal import Decimal

def parse_decimal(value):
    text = clean_text(value)
    if text is None:
        return None
    text = text.replace(\",\", \"\")
    if text == \"\":
        return None
    return Decimal(text)
```

### 12.6. Parse co dich vu

```python
def parse_service_flag(value):
    number = parse_decimal(value)
    if number is None:
        return 0
    return 1 if number > 0 else 0
```

## 13. Logic Import Code Du Kien

### 13.1. Cau truc module

```text
backend/app/
  imports/
    __init__.py
    filename_parser.py
    readers.py
    cleaners.py
    mappings.py
    importer.py
    summarizer.py
```

### 13.2. Parse ten file

```python
import re

FILE_PATTERN = re.compile(
    r\"^(?P<branch_code>\\d+)_(?P<file_type>CN05|DP01|LN01|PF14)_(?P<period_key>\\d{8})\\.(?P<ext>csv|xlsx)$\",
    re.IGNORECASE,
)

def parse_import_filename(filename):
    match = FILE_PATTERN.match(filename)
    if not match:
        raise ValueError(\"Ten file khong dung dinh dang MACN_LOAIFILE_yyyymmdd.csv/xlsx\")
    data = match.groupdict()
    data[\"file_type\"] = data[\"file_type\"].upper()
    return data
```

### 13.3. Chon reader theo dinh dang

```python
def read_file_to_dataframe(file_path):
    if file_path.endswith(\".csv\"):
        return read_csv(file_path)
    if file_path.endswith(\".xlsx\"):
        return read_excel(file_path)
    raise ValueError(\"Dinh dang file chua ho tro\")
```

CSV hien tai doc bang Polars va ep tat ca cot ve text de khong mat ma khach hang, so tai khoan, so 0 dau hoac dau `'` cua Excel:

```python
import polars as pl

df = pl.read_csv(file_path, infer_schema_length=0)
```

### 13.4. Validate cot bat buoc

```python
def validate_required_columns(df, required_columns):
    missing = [col for col in required_columns if col not in df.columns]
    if missing:
        raise ValueError(f\"Thieu cot bat buoc: {missing}\")
```

### 13.5. Import DP01

Pseudo flow:

```python
def import_dp01(file, batch):
    meta = parse_import_filename(file.filename)
    import_file = create_import_file_record(meta)
    df = read_file_to_dataframe(file.path)
    validate_required_columns(df, DP01_COLUMNS)

    rows = []
    for item in df.rows():
        ma_cn = clean_text(item[\"MA_CN\"])
        ma_kh = clean_customer_code(item[\"MA_KH\"])
        ma_kh_chuan = build_ma_kh_chuan(ma_cn, ma_kh)

        row = {
            \"import_file_id\": import_file.id,
            \"import_batch_id\": batch.id,
            \"period_key\": meta[\"period_key\"],
            \"period_date\": parse_yyyymmdd(meta[\"period_key\"]),
            \"branch_code\": meta[\"branch_code\"],
            \"ma_kh_chuan\": ma_kh_chuan,
            \"ma_cn\": ma_cn,
            \"ma_kh\": ma_kh,
            \"ten_kh\": clean_text(item[\"TEN_KH\"]),
            \"current_balance\": parse_decimal(item[\"CURRENT_BALANCE\"]),
            \"opening_date\": parse_yyyymmdd(item[\"OPENING_DATE\"]),
            \"maturity_date\": parse_yyyymmdd(item[\"MATURITY_DATE\"]),
            \"raw_data\": item,
        }
        rows.append(row)

    bulk_insert_dp01(rows)
    upsert_customers_from_dp01(rows)
    update_import_file_success(import_file, len(rows))
```

### 13.6. Import CN05/LN01/PF14

Moi loai file co mapping rieng nhung dung chung flow:

```text
parse filename
save file record
read dataframe
validate required columns
clean row
build ma_kh_chuan
bulk insert detail table
update import status
```

## 14. Logic Tong Hop Bao Cao Theo Ky

Input:

```text
period_key
```

Output:

```text
customer_period_summary
```

Flow:

```text
1. Lay danh sach ma_kh_chuan tu DP01 trong ky.
2. Bo sung ma_kh_chuan co trong LN01/CN05/PF14 nhung khong co DP01 neu can.
3. Tong hop DP01 theo ma_kh_chuan.
4. Tong hop LN01 theo ma_kh_chuan.
5. Tong hop PF14 theo ma_kh_chuan.
6. Tong hop CN05 theo ma_kh_chuan.
7. Join cac nguon lai.
8. Upsert vao customer_period_summary.
```

Cong thuc du kien:

```text
so_du_tien_vay = SUM(LN01.du_no)
so_du_tien_gui_ckh = SUM(DP01.current_balance) voi dieu kien loai tien gui phu hop
doanh_so_chuyen_tien_ve_tai_khoan = SUM(DP01.dramt + DP01.cramt) hoac theo quy tac nghiep vu sau
so_du_tgtt_binh_quan = SUM(PF14.averagebalance)
thau_chi = MAX(CN05.tk_osb > 0)
tk_so_dep = MAX(CN05.tktt_tk_sodep > 0)
agribank_plus = MAX(CN05.dk_agribank_plus > 0)
tin_nhan_ott = MAX(CN05.dk_agribank_plus_ott > 0)
sms_nhac_no_vay = MAX(CN05.vv_sms_tien_vay > 0)
sms_tien_gui = MAX(CN05.tg_sms_tien_gui > 0)
the_ghi_no_noi_dia = MAX(CN05.the_ghi_no_noi_dia > 0)
the_td_quoc_te = MAX(CN05.the_tin_dung_quoc_te > 0)
```

## 15. Nguyen Tac Them, Xoa, Sua

### 15.1. Them/import moi

- Neu file cung `branch_code + file_type + period_key` da ton tai, can hoi nguoi dung:
  - Bo qua.
  - Import lai va thay the.
  - Import thanh phien ban moi.

### 15.2. Xoa file import

Khi xoa mot file import:

1. Cap nhat `import_files.status = deleted`.
2. Xoa hoac danh dau inactive cac dong du lieu chi tiet lien quan.
3. Chay lai tong hop ky do.

### 15.3. Sua du lieu

Nen han che sua truc tiep du lieu import goc.

Huong tot hon:

- Du lieu import goc la bat bien.
- Neu can chinh sua, tao bang adjustment/manual_override.
- Khi tong hop bao cao, ap dung adjustment sau cung.

## 16. Huong API Du Kien

```text
POST /api/imports/upload
GET  /api/imports/files
GET  /api/imports/files/{id}
DELETE /api/imports/files/{id}

GET  /api/periods
POST /api/periods/{period_key}/summarize

GET  /api/customers
GET  /api/customers/{ma_kh_chuan}
GET  /api/reports/customer-period-summary?period_key=yyyymmdd
```

Da trien khai trong giai doan hien tai:

```text
POST /api/imports/upload
GET  /api/imports/files
GET  /api/imports/periods
DELETE /api/imports/files/{file_id}
POST /api/imports/summarize/{period_key}
GET  /api/imports/summary?period_key=yyyymmdd
```

Luu y hieu nang:

- CSV la dinh dang nen uu tien cho file lon trong giai doan hien tai.
- CSV da duoc doc bang Polars, tat ca cot doc dang text truoc khi clean theo mapping.
- Excel `.xlsx` da duoc ho tro bang `openpyxl`, nhung file lon co the cham.
- Giai doan tiep theo nen bo sung calamine hoac pipeline convert Excel sang CSV truoc khi import.

## 17. Huong Frontend Du Kien

Menu:

```text
Dashboard
Import CSV
Kho du lieu
Khach hang
Bao cao
Cau hinh
```

Man hinh Import:

- Chon ky du lieu.
- Keo tha nhieu file.
- Hien file type, branch code, period key doc tu ten file.
- Validate ten file truoc khi upload.
- Hien ket qua import.

Man hinh Kho du lieu:

- Danh sach file da import.
- Loc theo ky, chi nhanh, loai file.
- Xem so dong thanh cong/loi.
- Xoa/import lai file.
- Quan ly file theo ky du lieu, vi du `20260630` hien thi la `Thang 6/2026`.
- Xoa file la xoa mem: du lieu chi tiet cua file bi go khoi bao cao, nhung lich su import van duoc giu lai.
- Khi xoa hoac thay file, he thong chay lai tong hop cua ky do.

Man hinh Bao cao:

- Chon ky.
- Xem bang tong hop khach hang.
- Loc theo chi nhanh, can bo, san pham chua dung.
- Xuat Excel theo mau `BANG QUAN LY KHACH HANG.xlsx`.

## 18. Thu Tu Trien Khai De Xuat

1. Tao migration/database schema.
2. Tao bang `import_batches`, `import_files`.
3. Tao bang chi tiet cho DP01, CN05, LN01, PF14.
4. Viet module parse filename.
5. Viet module clean data.
6. Viet import DP01 truoc.
7. Tao bang `customers` tu DP01.
8. Viet import CN05, LN01, PF14.
9. Viet summarizer tao `customer_period_summary`.
10. Tao API upload va danh sach file import.
11. Tao frontend man hinh Import CSV.
12. Tao frontend man hinh Bao cao tong hop.
13. Bo sung xuat Excel theo mau.

## 19. Cac TODO Quan Trong

- TODO: Ho tro import nhieu file cung luc.
- TODO: Ho tro CSV va Excel.
- DONE: Dung Polars de doc CSV lon va giu cot dang text.
- TODO: Tao migration bang database.
- TODO: Tao log loi theo tung dong import.
- TODO: Tao co che import lai/thay the file da import.
- TODO: Tao bang adjustment de sua du lieu ma khong sua du lieu goc.
- TODO: Tao bao cao tong hop theo ky.
- TODO: Xuat Excel dung mau `BANG QUAN LY KHACH HANG.xlsx`.
- TODO: Dong goi chay offline.
