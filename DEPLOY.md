# GameHub Deployment Guide

## Architecture
- **Frontend**: React + Vite → Deploy to Netlify/Vercel
- **Backend**: Express + MongoDB → Deploy to Render/Railway
- **Database**: MongoDB Atlas (đã có sẵn)

---

## Step 1: Deploy Backend (Render.com - Free)

### 1.1 Tạo file `render.yaml` trong thư mục `server/`

```yaml
services:
  - type: web
    name: gamehub-api
    runtime: node
    buildCommand: npm install
    startCommand: node index.js
    envVars:
      - key: NODE_VERSION
        value: 20
      - key: PORT
        value: 10000
      - key: MONGO_URI
        sync: false  # Bạn sẽ nhập thủ công trong dashboard
      - key: JWT_SECRET
        generateValue: true
      - key: ADMIN_USERNAME
        value: admin
      - key: ADMIN_PASSWORD
        generateValue: true
      - key: AI_PROVIDER
        value: qwen
      - key: AI_API_KEY
        sync: false
      - key: AI_API_BASE_URL
        value: https://dashscope-intl.aliyuncs.com/compatible-mode/v1
      - key: AI_MODEL
        value: qwen3.5-flash
```

### 1.2 Deploy lên Render
1. Truy cập https://render.com → Sign up/login
2. Click "New" → "Blueprint" → Connect GitHub repo
3. Chọn repo GameHub, chọn branch `main`
4. Render sẽ đọc `render.yaml` và tạo service
5. Vào Environment Variables, thêm:
   - `MONGO_URI`: Copy từ `server/.env` hiện tại
   - `CLIENT_URL`: Để trống tạm thời (sẽ update sau khi deploy frontend)

### 1.3 Lấy Backend URL
Sau khi deploy xong, Render cấp URL dạng:
```
https://gamehub-api-xxx.onrender.com
```

---

## Step 2: Deploy Frontend (Netlify)

### 2.1 Update file `.env.production`
```
VITE_API_BASE_URL=https://gamehub-api-xxx.onrender.com/api
```
(Thay `xxx` bằng URL thực từ step 1)

### 2.2 Cách 1: Netlify CLI (Khuyến nghị)

```bash
# Install Netlify CLI
cd d:\code\GameHub
npm install -g netlify-cli

# Login
netlify login

# Build project
npm run build

# Deploy
netlify deploy --prod --dir=dist
```

### 2.3 Cách 2: Netlify Dashboard
1. Truy cập https://app.netlify.com
2. "Add new site" → "Import an existing project"
3. Connect GitHub → Chọn repo GameHub
4. Build settings:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
5. Add Environment Variables:
   - `VITE_API_BASE_URL`: `https://gamehub-api-xxx.onrender.com/api`
6. Deploy

---

## Step 3: Update Backend CORS

Sau khi có frontend URL (dạng `https://gamehub-xxx.netlify.app`):

1. Vào Render Dashboard → gamehub-api → Environment
2. Thêm biến:
   ```
   CLIENT_URL=https://gamehub-xxx.netlify.app
   ```
3. Render tự động redeploy

---

## Step 4: Tùy chọn - Tên miền tùy chỉnh

### Netlify (Frontend)
1. Dashboard → Domain settings → Add custom domain
2. Nhập domain (vd: `gamehub.yourdomain.com`)
3. Cấu hình DNS theo hướng dẫn

### Render (Backend)
1. Dashboard → Settings → Custom Domain
2. Nhập subdomain (vd: `api.yourdomain.com`)
3. Cấu hình DNS CNAME

---

## Chi phí ước tính (Free tier)

| Service | Giới hạn free |
|---------|--------------|
| MongoDB Atlas | 512MB storage |
| Render | 750 hours/month, sleep after 15min idle |
| Netlify | 100GB bandwidth, 300 build minutes/month |

**→ Tổng: $0/tháng cho traffic nhỏ-medium**

---

## Troubleshooting

### Lỗi CORS
Kiểm tra `CLIENT_URL` trong Render env vars phải khớp chính xác với frontend URL (không có `/` ở cuối)

### MongoDB timeout
Trong MongoDB Atlas → Network Access → Add IP `0.0.0.0/0` (cho phép tất cả IPs từ Render)

### Build fail
Kiểm tra `package.json` scripts phải có:
```json
"build": "vite build"
```

---

## Cấu trúc URLs sau deploy

```
Frontend: https://gamehub-xxx.netlify.app
Backend API: https://gamehub-api-xxx.onrender.com/api
MongoDB: (Atlas cluster - already configured)
```
