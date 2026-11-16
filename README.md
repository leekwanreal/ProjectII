# Hệ thống hỗ trợ quản lý trung tâm luyện thi chứng chỉ ngoại ngữ

**Học phần:** Project II – Đề tài 1A
**Giảng viên hướng dẫn:** TS. Nguyễn Thị Thu Hương
**Sinh viên thực hiện:** Nguyễn Lê Quân – MSSV 20235199 – Khoa học Máy tính 07 – K68, Đại học Bách khoa Hà Nội

Ứng dụng web gồm **Cổng học viên** (quảng bá khoá/lớp, tra cứu lớp, đăng ký, nộp học phí, kiểm tra đầu vào, chat tư vấn) và **Dashboard văn phòng** (thống kê, xếp lớp, lập lịch – phân phòng, phê duyệt vượt sĩ số, console tư vấn). Các quy tắc sĩ số của đề bài được cưỡng chế ở cả mã nguồn và CSDL:

| Mã | Quy tắc |
|---|---|
| BR-01 | Chỉ hồ sơ đã nộp học phí mới được làm bài kiểm tra đầu vào |
| BR-02 | Lớp Online mở khi ≥ 10 học viên |
| BR-03 | Lớp Offline mở khi ≥ 20, chuẩn ≤ 30 |
| BR-04 | Offline vượt 30 → lập tờ trình, Lãnh đạo quyết định (tách lớp / giữ ngoại lệ / từ chối) |
| BR-05 | Lớp Offline phải có phòng đủ chỗ, không trùng phòng/giảng viên |

## Chạy thử

Yêu cầu: Node.js ≥ 22, Chrome hoặc Edge.

```bash
npm install
npm start            # http://localhost:3000  (cổng học viên)
                     # http://localhost:3000/admin  (văn phòng)
npm test             # 78 ca kiểm thử tự động
npm run seed         # tạo lại CSDL mẫu (chạy được cả khi máy chủ đang bật)
npm run diagrams     # render 21 biểu đồ (Mermaid + swimlane) -> docs/diagrams/png
npm run screenshots  # chụp ảnh giao diện cho báo cáo (máy chủ phải đang chạy)
```

CSDL SQLite (`database.sqlite`) được tự tạo và nạp dữ liệu mẫu ở lần chạy đầu.

**Tài khoản văn phòng** (mật khẩu `123456`): `tuvan1`, `tuvan2` (tư vấn viên), `giaovu` (giáo vụ), `lanhdao` (lãnh đạo).
**Học viên demo** để tra cứu hồ sơ: SĐT `0912345678` (chờ nộp phí), `0987654321` (chờ thi), `0905123456` (chờ xếp lớp) – mã hồ sơ in ra khi chạy `npm run seed`.

## Cấu trúc

```
server/   index.js, app.js, config.js
          domain/rules.js      quy tắc nghiệp vụ (hàm thuần)
          services/            catalog, registration, placement, enrollment, chat, stats, auth
          routes/              public.js, admin.js
          sockets/chat.js      chat realtime (Socket.IO)
          db/                  schema.sql (14 bảng + view), seed.js, questions.js
public/   index.html (cổng học viên), admin.html (dashboard), css/, js/
tests/    rules.test.js, api.test.js, chat.test.js
docs/     analysis/ (phân tích đề bài, đặc tả use case), diagrams/src/*.mmd -> diagrams/png/
tools/    render-diagrams.js, render-swimlanes.js, screenshots.js
report/   Báo cáo LaTeX (XeLaTeX) -> Bao_Cao_Project2_NguyenLeQuan_20235199.pdf
```

## Biên dịch báo cáo

```bash
cd report
latexmk -xelatex main.tex
```

Hoặc dùng recipe **latexmk (XeLaTeX)** của LaTeX Workshop đã cấu hình trong `.vscode/settings.json`.
