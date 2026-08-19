# 📖 Việt DOCX TTS Reader Pro

> Trình đọc tiểu thuyết / tài liệu DOCX tiếng Việt cao cấp, tích hợp giọng đọc AI **Microsoft Edge Neural** chuẩn studio, đa dạng giao diện, bộ đệm audio tải trước mượt mà, hỗ trợ đánh dấu trang (Bookmarks), chế độ tập trung (Zen Mode) và PWA Offline.

---

## ✨ Tính Năng Nổi Bật

### 🎙 1. Hệ Thống Giọng Đọc Đa Nguồn (Multi-Engine TTS)
- **⚡ Microsoft Edge Neural AI Voice**: Giọng đọc siêu tự nhiên chuẩn phòng thu (**Hoài My - Nữ** & **Nam Minh - Nam**).
- **🌐 Web Speech API**: Sử dụng trực tiếp giọng đọc trên trình duyệt / thiết bị mà không cần server.
- **🧩 Chrome Extension TTS**: Hỗ trợ Chrome OS Vietnamese 2 và chạy nền.
- **⚡ Audio Pre-buffering Queue**: Tự động tải trước audio đoạn kế tiếp trong nền giúp chuyển câu/đoạn tức thì, không bị trễ hay ngắt quãng.
- **🌙 Hẹn Giờ Tắt (Sleep Timer)**: 15p, 30p, 45p, 60p hoặc tự dừng sau khi đọc hết chương.

### 🎨 2. Giao Diện Modern & Luxury UI/UX
- **5 Bộ Theme Tinh Tế**:
  - `Đêm OLED` (Deep Night)
  - `Xám Than` (Obsidian Slate)
  - `Giấy Ấm` (Warm Paper)
  - `Sepia Cổ Điển` (Antique Sepia)
  - `Trắng Sáng` (Clean White)
- **Typography Chuyên Sách**: Google Fonts (*Be Vietnam Pro*, *Literata*, *Lora*, *Merriweather*, *Montserrat*, *Quattrocento Sans*).
- **Tùy biến đa dạng**: Cỡ chữ, khoảng cách dòng (line-height), độ rộng khung đọc, căn lề (trái/đều), bật/tắt Drop Cap.
- **Chế độ Tập Trung (Zen / Focus Mode)**: Ẩn thanh công cụ để bạn hoàn toàn đắm chìm vào nội dung.
- **Phóng to hình ảnh (Lightbox)**: Nhấp vào ảnh minh họa để xem toàn màn hình sắc nét.

### 📑 3. Quản Lý Tiến Độ & Đánh Dấu
- **Đánh dấu trang (Bookmarks)**: Lưu lại các đoạn yêu thích và nhảy nhanh tới vị trí đã lưu.
- **Ghi nhớ chính xác**: Tự động lưu tiến độ đọc theo từng đoạn văn của từng chương.
- **Sao lưu & Phục hồi**: Xuất/Nhập dữ liệu tiến độ và bookmarks ra file JSON.

### ⌨ 4. Bộ Phím Tắt Tiện Lợi
- <kbd>Space</kbd>: Phát / Tạm dừng
- <kbd>←</kbd> <kbd>→</kbd>: Đoạn trước / Đoạn sau
- <kbd>Shift</kbd> + <kbd>←</kbd>/<kbd>→</kbd>: Chương trước / Chương sau
- <kbd>F</kbd>: Bật/Tắt chế độ tập trung (Zen Mode)
- <kbd>B</kbd>: Đánh dấu (Bookmark) đoạn hiện tại
- <kbd>M</kbd>: Đóng / Mở mục lục
- <kbd>T</kbd>: Mở bảng Tùy chỉnh & Cài đặt
- <kbd>?</kbd>: Xem bảng phím tắt
- <kbd>Esc</kbd>: Đóng cửa sổ phóng to / Dừng đọc

---

## 🚀 Hướng Dẫn Cài Đặt & Sử Dụng

### Yêu cầu
- Đã cài đặt [Node.js](https://nodejs.org/) (phiên bản 18 trở lên).

### Bước 1: Cài đặt thư viện
```bash
npm install
```

### Bước 2: Khởi động Server
```bash
npm start
```
Server sẽ chạy tại `http://localhost:8765`.

### Bước 3: Mở trình duyệt
Truy cập địa chỉ `http://localhost:8765` trên Google Chrome, Microsoft Edge, Safari hoặc Firefox để bắt đầu trải nghiệm đọc và nghe sách!

---

## 🛠 Tách Chương Từ File DOCX Mới
Nếu bạn có file DOCX mới (ví dụ: `VolX_VI.docx`), chỉ cần chạy lệnh PowerShell sau để tự động phân tách các chương, ảnh minh họa và trích xuất font:

```powershell
.\build.ps1 -Source "Đường_dẫn_tới_file.docx"
```

---

## 📜 Giấy Phép
Dự án được phân phối dưới giấy phép [MIT](LICENSE).
