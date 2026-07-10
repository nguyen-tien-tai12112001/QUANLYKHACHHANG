# Xử lý lỗi truy cập qua LAN bị timeout

## Lỗi gặp phải

Khi mở frontend bằng IP LAN, trình duyệt báo:

```text
Failed to load resource: net::ERR_CONNECTION_TIMED_OUT
http://192.168.3.177:8000/api/auth/login
```

## Nguyên nhân trong lần kiểm tra này

Backend đang chạy và listen đúng port `8000` trên mọi card mạng:

```text
0.0.0.0:8000 LISTENING
```

Health API hoạt động:

```text
http://localhost:8000/api/health
http://192.168.1.189:8000/api/health
```

Nhưng IP `192.168.3.177` không phải IP hiện tại của máy đang chạy backend, nên truy cập:

```text
http://192.168.3.177:8000/api/health
```

bị timeout.

IP hiện tại kiểm tra được là:

```text
192.168.1.189
```

## File đã chỉnh

### `frontend/.env`

```env
VITE_API_URL=http://192.168.1.189:8000/api
```

### `backend/.env`

```env
CORS_ORIGINS=http://localhost:3000,http://192.168.3.177:3000,http://192.168.1.189:3000
```

## Cách chạy lại

Sau khi đổi `.env`, cần restart cả backend và frontend.

### Backend

```bat
cd backend
.venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bat
cd frontend
npm run dev -- --host 0.0.0.0 --port 3000
```

## Link truy cập đúng

Trên máy đang chạy dự án:

```text
http://localhost:3000
```

Trên máy khác cùng mạng LAN:

```text
http://192.168.1.189:3000
```

API backend:

```text
http://192.168.1.189:8000/api/health
```

## Nếu vẫn timeout

Kiểm tra firewall Windows trên máy chạy backend:

```bat
netsh advfirewall firewall add rule name="C360 Backend 8000" dir=in action=allow protocol=TCP localport=8000
netsh advfirewall firewall add rule name="C360 Frontend 3000" dir=in action=allow protocol=TCP localport=3000
```

Kiểm tra IP máy chủ:

```bat
ipconfig
```

Kiểm tra backend có đang listen không:

```bat
netstat -ano | findstr :8000
```

Kiểm tra API:

```bat
curl http://localhost:8000/api/health
curl http://192.168.1.189:8000/api/health
```

Nếu đổi sang IP khác, sửa lại:

```text
frontend/.env
backend/.env
```

rồi restart lại backend/frontend.
