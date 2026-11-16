# 01. Phân tích đề bài – Đề tài 1A

> Hệ thống hỗ trợ quản lý trung tâm luyện thi lấy chứng chỉ ngoại ngữ theo chuẩn quốc gia, quốc tế.
> GVHD: TS. Nguyễn Thị Thu Hương · SV: Nguyễn Lê Quân – 20235199 – KHMT 07 – K68

## 1. Bóc tách đề bài

| # | Câu trong đề bài | Hiểu thành yêu cầu | Mã |
|---|---|---|---|
| 1 | "Đăng tải thông tin các lớp học, phân loại Online/Offline" | Danh mục khoá học, lớp học; mỗi lớp có hình thức ONLINE/OFFLINE | FR-01, FR-02 |
| 2 | "Phòng chat để tư vấn trực tuyến" | Chat thời gian thực học viên ↔ tư vấn viên, lưu lịch sử | FR-08..FR-10 |
| 3 | "Khi học viên đồng ý học: thu học phí, chuyển sang hệ thống kiểm tra trình độ" | Đăng ký → thanh toán → bài thi đầu vào (chỉ khi đã thanh toán) | FR-03..FR-07, BR-01 |
| 4 | "Kết quả kiểm tra chuyển về văn phòng để phân loại, xếp lớp" | Lưu kết quả, xếp lớp theo trình độ | FR-11, BR-06 |
| 5 | "Offline: đủ 20 mới mở lớp, tối đa 30, > 30 thì lãnh đạo quyết định tách" | Ràng buộc sĩ số + tờ trình phê duyệt | BR-03, BR-04, FR-13 |
| 6 | "Online: có thể < 20 nhưng không ít hơn 10" | Ngưỡng mở lớp online = 10 | BR-02 |
| 7 | "Lập lịch học, phân phòng cho lớp offline, quản lý quá trình đào tạo" | Lịch học theo ca, phòng, kiểm tra trùng | FR-12, BR-05 |
| 8 | "Code 4 chức năng: quảng bá, đăng ký, tra cứu lớp, chat room" | Phạm vi bắt buộc của prototype | — |

## 2. Tác nhân

| Tác nhân | Mô tả | Quyền chính |
|---|---|---|
| Khách / Học viên | Người xem thông tin, đăng ký học | Xem khoá/lớp, tra cứu lớp, đăng ký, thanh toán, thi đầu vào, chat |
| Tư vấn viên (CONSULTANT) | Nhân viên tư vấn | Nhận & trả lời phiên chat |
| Giáo vụ (ACADEMIC) | Nhân viên văn phòng đào tạo | Quản lý lớp, lịch, phòng; xếp lớp; mở/huỷ lớp; ghi nhận thu tiền mặt |
| Lãnh đạo trung tâm (DIRECTOR) | Ban giám đốc | Phê duyệt / từ chối tờ trình vượt sĩ số; xem báo cáo |
| Hệ thống thanh toán (ngoài) | Cổng VNPay/MoMo (mô phỏng) | Xác nhận giao dịch |

## 3. Yêu cầu chức năng

| Mã | Chức năng | Tác nhân | Phạm vi code |
|---|---|---|---|
| FR-01 | Xem danh mục khoá học (lộ trình, chuẩn đầu ra, học phí) | Khách | ✔ (CN1) |
| FR-02 | Xem chi tiết lớp: hình thức, lịch, phòng, giảng viên, sĩ số | Khách | ✔ (CN1) |
| FR-03 | Tra cứu/lọc lớp theo từ khoá, chứng chỉ, hình thức, ca, trình độ, ngày khai giảng, còn chỗ | Khách | ✔ (CN3) |
| FR-04 | Đăng ký học trực tuyến (thông tin cá nhân, khoá, hình thức, ca, lớp mong muốn) | Khách | ✔ (CN2) |
| FR-05 | Tra cứu hồ sơ đăng ký bằng mã hồ sơ + SĐT | Học viên | ✔ |
| FR-06 | Thanh toán học phí (mô phỏng cổng thanh toán / tiền mặt tại quầy) | Học viên, Giáo vụ | ✔ |
| FR-07 | Làm bài kiểm tra đầu vào, chấm tự động, quy đổi CEFR | Học viên | ✔ |
| FR-08 | Mở phiên chat tư vấn | Khách | ✔ (CN4) |
| FR-09 | Nhận phiên chat từ hàng đợi, trao đổi realtime | Tư vấn viên | ✔ (CN4) |
| FR-10 | Đóng phiên, xem lịch sử chat | Tư vấn viên | ✔ (CN4) |
| FR-11 | Xếp học viên vào lớp theo kết quả thi | Giáo vụ | ✔ |
| FR-12 | Lập lịch học, phân phòng, phân giảng viên; mở/huỷ lớp | Giáo vụ | ✔ |
| FR-13 | Phê duyệt tờ trình vượt sĩ số (tách lớp / giữ ngoại lệ / từ chối) | Lãnh đạo | ✔ |
| FR-14 | Dashboard thống kê: doanh thu, phễu tuyển sinh, tình trạng sĩ số | Nhân viên | ✔ |

## 4. Quy tắc nghiệp vụ (Business Rules)

| Mã | Quy tắc |
|---|---|
| **BR-01** | Hồ sơ chỉ được làm bài thi đầu vào khi đã thanh toán (`PAID`). Mỗi hồ sơ thi đúng **1 lần**, thời gian 20 phút. |
| **BR-02** | Lớp **Online** đủ điều kiện mở khi sĩ số **≥ 10**. Sĩ số tối đa của lớp online là tham số cấu hình (mặc định 40 – giới hạn nền tảng học trực tuyến; đề bài không quy định). |
| **BR-03** | Lớp **Offline** đủ điều kiện mở khi sĩ số **≥ 20**; sĩ số chuẩn **≤ 30**. |
| **BR-04** | Khi xếp học viên vào lớp Offline đã đủ 30: hệ thống **không tự xếp**, hồ sơ chuyển `WAITING_APPROVAL`, hệ thống lập (hoặc bổ sung vào) **tờ trình** gửi Lãnh đạo. Lãnh đạo chọn: **(a) Tách lớp** – nếu 30 + k ≥ 40 thì chia đều thành 2 lớp đều đủ điều kiện mở; nếu < 40 thì tách phần dư sang lớp mới ở trạng thái tuyển sinh; **(b) Giữ ngoại lệ** – cho vượt sĩ số (phải ≤ sức chứa phòng); **(c) Từ chối** – các hồ sơ chờ trở về `TESTED` để giáo vụ xếp lớp khác. |
| **BR-05** | Lớp Offline phải có phòng trước khi mở; sức chứa phòng ≥ sĩ số; không được trùng phòng hoặc giảng viên cùng thứ – ca trong khoảng thời gian học giao nhau. |
| **BR-06** | Xếp lớp: lớp phải thuộc đúng khoá đã đăng ký và đóng phí, có trình độ = trình độ đánh giá (CEFR); ưu tiên hình thức/ca mong muốn. Lệch trình độ chỉ được xếp khi giáo vụ ghi lý do. |
| **BR-07** | Sĩ số lớp = số hồ sơ `ENROLLED` thuộc lớp (giá trị tính toán, không lưu bộ đếm). |
| **BR-08** | Chỉ mở lớp (`RECRUITING → IN_PROGRESS`) khi: đủ ngưỡng tối thiểu, không có tờ trình đang chờ, (Offline) đã có phòng hợp lệ. Huỷ lớp → các hồ sơ trong lớp trở về `TESTED`. |

Quy đổi điểm thi (20 câu) → CEFR: < 30 % A1 · < 50 % A2 · < 70 % B1 · < 85 % B2 · còn lại C1.

## 5. Yêu cầu phi chức năng
- Giao diện tiếng Việt, responsive (desktop/mobile).
- Chat độ trễ < 1 giây (WebSocket), lưu bền vững vào CSDL, khôi phục phiên khi tải lại trang.
- Dữ liệu cá nhân: tra cứu hồ sơ yêu cầu đủ mã hồ sơ + SĐT; mật khẩu nhân viên băm scrypt; API quản trị yêu cầu token có hạn.
- Toàn vẹn dữ liệu: khoá ngoại, CHECK, giao dịch (transaction) cho các thao tác nhiều bước (xếp lớp, phê duyệt tách lớp).
- Chạy offline hoàn toàn (không phụ thuộc CDN).

## 6. Ma trận phân quyền

| Chức năng | Khách | Tư vấn viên | Giáo vụ | Lãnh đạo |
|---|:-:|:-:|:-:|:-:|
| Xem / tra cứu / đăng ký | ✔ | ✔ | ✔ | ✔ |
| Chat tư vấn (trả lời) | | ✔ | | ✔ |
| Dashboard | | ✔ | ✔ | ✔ |
| Thu tiền mặt, xếp lớp, lịch – phòng, mở/huỷ lớp | | | ✔ | ✔ |
| Phê duyệt tờ trình | | | | ✔ |
