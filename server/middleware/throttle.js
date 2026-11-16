// Chống dò mật khẩu / dò mã hồ sơ: khoá tạm một địa chỉ IP sau quá nhiều lần thất bại.
// Lưu trong bộ nhớ (đủ cho quy mô một trung tâm, một tiến trình).
const { AppError } = require('../services/errors');

function failureThrottle({ max = 10, windowMs = 10 * 60 * 1000, failStatuses = [401, 404] } = {}) {
  const hits = new Map(); // ip -> { n, until }
  const mw = (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const h = hits.get(key);
    if (h && h.until < now) hits.delete(key);
    else if (h && h.n >= max) {
      res.set('Retry-After', String(Math.ceil((h.until - now) / 1000)));
      return next(new AppError(429, 'TOO_MANY_ATTEMPTS', 'Bạn đã thử sai quá nhiều lần. Vui lòng thử lại sau ít phút.'));
    }
    res.on('finish', () => {
      if (failStatuses.includes(res.statusCode)) {
        const cur = hits.get(key) || { n: 0, until: Date.now() + windowMs };
        cur.n += 1;
        hits.set(key, cur);
      } else if (res.statusCode < 400) hits.delete(key); // thành công thì xoá bộ đếm
    });
    next();
  };
  mw.reset = () => hits.clear();
  return mw;
}

module.exports = { failureThrottle };
