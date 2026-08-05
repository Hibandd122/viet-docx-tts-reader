# Chạy trên panel hosting

Panel cần hỗ trợ Node.js 18 trở lên.

1. Upload toàn bộ thư mục dự án, gồm `api`, `assets`, `chapters` và các file `.js`, `.html`, `.css`.
2. Chạy `npm install --omit=dev`.
3. Đặt lệnh khởi động là `node server.mjs`.
4. Đặt biến môi trường `PORT` theo port mà panel cấp. Có thể đặt `HOST=0.0.0.0`.

Server này đã tích hợp sẵn `/api/tts` và `/api/chapter`, nên web dùng được Edge TTS và audio liên tục theo chương.
