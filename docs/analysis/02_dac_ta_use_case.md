# 02. Đặc tả Use Case

## UC-01 Xem thông tin khoá học / lớp học (CN1)
- **Tác nhân:** Khách. **Tiền điều kiện:** không.
- **Luồng chính:** 1) Khách mở trang chủ. 2) Hệ thống hiển thị danh mục khoá học (chứng chỉ, mục tiêu, số giờ, học phí, chuẩn đầu ra). 3) Khách chọn một khoá. 4) Hệ thống hiển thị lộ trình và danh sách lớp của khoá kèm hình thức, lịch, phòng, giảng viên, sĩ số / ngưỡng mở lớp.
- **Hậu điều kiện:** không thay đổi dữ liệu.

## UC-02 Tra cứu danh sách lớp (CN3)
- **Tác nhân:** Khách.
- **Luồng chính:** 1) Khách nhập từ khoá và/hoặc chọn bộ lọc: chứng chỉ, hình thức, ca, trình độ, khai giảng từ ngày, chỉ lớp còn chỗ. 2) Hệ thống truy vấn `GET /api/classes?...`. 3) Hiển thị kết quả kèm tình trạng sĩ số (Chưa đủ / Đủ điều kiện mở / Đã đầy / Chờ duyệt).
- **Luồng phụ:** 3a) Không có kết quả → thông báo, gợi ý xoá bộ lọc.

## UC-03 Đăng ký học (CN2)
- **Tác nhân:** Khách.
- **Luồng chính:** 1) Khách mở form (có thể từ nút "Đăng ký lớp này"). 2) Nhập họ tên, ngày sinh, SĐT, email, khoá, hình thức, ca, lớp mong muốn, ghi chú. 3) Hệ thống kiểm tra hợp lệ ở client và server. 4) Tìm học viên theo email/SĐT (nếu có thì dùng lại, không thì tạo mới). 5) Tạo hồ sơ `PENDING_PAYMENT`, cấp mã `DK-YYYY-NNNN`. 6) Hiển thị mã + số tiền cần nộp.
- **Ngoại lệ:** 3a) Thiếu/ sai định dạng → báo lỗi từng trường. 4a) Học viên đã có hồ sơ đang hiệu lực cho cùng khoá → từ chối (409).

## UC-04 Thanh toán học phí
- **Tác nhân:** Học viên, Cổng thanh toán; hoặc Giáo vụ (tiền mặt).
- **Tiền điều kiện:** hồ sơ `PENDING_PAYMENT`.
- **Luồng chính:** 1) Học viên tra cứu hồ sơ (mã + SĐT). 2) Chọn phương thức. 3) Cổng xác nhận (mô phỏng). 4) Hệ thống tạo `payments` (số tiền = học phí khoá), hồ sơ → `PAID`.
- **Ngoại lệ:** hồ sơ đã thanh toán → 409.

## UC-05 Làm bài kiểm tra đầu vào
- **Tiền điều kiện:** hồ sơ `PAID` (BR-01), chưa thi.
- **Luồng chính:** 1) Học viên bấm "Làm bài". 2) Hệ thống tạo lượt thi, chọn ngẫu nhiên 20 câu (không gửi đáp án). 3) Học viên nộp bài trong 20 phút. 4) Hệ thống chấm, quy đổi CEFR, lưu kết quả, hồ sơ → `TESTED`, kết quả hiển thị ở văn phòng.
- **Ngoại lệ:** chưa thanh toán → 403; đã nộp → 409; quá giờ → 410.

## UC-06 Tư vấn trực tuyến (CN4)
- **Tác nhân:** Khách, Tư vấn viên.
- **Luồng chính:** 1) Khách mở widget chat, nhập tên, liên hệ, chủ đề. 2) Hệ thống tạo phiên `WAITING`, đưa vào hàng đợi, thông báo cho tư vấn viên trực tuyến. 3) Tư vấn viên nhận phiên → `ACTIVE`, hệ thống gửi tin hệ thống "Tư vấn viên X đã tham gia". 4) Hai bên trao đổi realtime; mọi tin nhắn được lưu. 5) Tư vấn viên (hoặc khách) kết thúc → `CLOSED`.
- **Luồng phụ:** khách tải lại trang → khôi phục phiên và lịch sử từ `sessionId` đã lưu.

## UC-07 Xếp lớp
- **Tác nhân:** Giáo vụ. **Tiền điều kiện:** hồ sơ `TESTED`.
- **Luồng chính:** 1) Giáo vụ mở hồ sơ, hệ thống gợi ý lớp phù hợp (cùng khoá, đúng trình độ, ưu tiên hình thức/ca/lớp mong muốn, sĩ số hiện tại). 2) Chọn lớp. 3) Hệ thống kiểm tra sĩ số: Online < tối đa → `ENROLLED`; Offline < 30 → `ENROLLED`.
- **Luồng rẽ nhánh:** 3a) Offline đã đủ 30 → hồ sơ `WAITING_APPROVAL`, tạo/bổ sung tờ trình (BR-04). 3b) Online đầy → từ chối, chọn lớp khác. 1a) Lệch trình độ → bắt buộc nhập lý do.

## UC-08 Phê duyệt tờ trình vượt sĩ số
- **Tác nhân:** Lãnh đạo. **Tiền điều kiện:** tờ trình `PENDING`.
- **Luồng chính:** 1) Lãnh đạo xem tờ trình: lớp, sĩ số 30, số hồ sơ chờ k, sức chứa phòng, phương án hệ thống đề xuất. 2) Chọn quyết định + ghi chú. 3) Hệ thống thực thi trong một giao dịch:
  - *Tách lớp*: tạo lớp mới (cùng khoá, trình độ, hình thức, lịch; chưa có phòng); nếu 30 + k ≥ 40 thì chuyển bớt học viên để hai lớp chia đều, ngược lại chuyển k hồ sơ chờ sang lớp mới.
  - *Giữ ngoại lệ*: xếp k hồ sơ vào lớp (yêu cầu sức chứa phòng ≥ 30 + k).
  - *Từ chối*: k hồ sơ về `TESTED`.
- **Hậu điều kiện:** tờ trình `APPROVED`/`REJECTED`, ghi người duyệt, thời điểm.

## UC-09 Lập lịch, phân phòng, mở lớp
- **Tác nhân:** Giáo vụ.
- **Luồng chính:** 1) Chọn lớp, gán phòng/giảng viên/lịch (thứ – ca). 2) Hệ thống kiểm tra BR-05 (trùng phòng, trùng giảng viên, sức chứa). 3) Bấm "Mở lớp" → kiểm tra BR-08 → `IN_PROGRESS`.
- **Ngoại lệ:** vi phạm → thông báo cụ thể lớp/ca bị trùng.
