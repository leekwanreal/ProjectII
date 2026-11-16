const { verifyToken } = require('../services/auth');
const { AppError } = require('../services/errors');

/** Bắt buộc đăng nhập; tuỳ chọn giới hạn vai trò. */
function requireStaff(...roles) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const user = verifyToken(header.startsWith('Bearer ') ? header.slice(7) : null);
    if (!user) return next(new AppError(401, 'UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'));
    if (roles.length && !roles.includes(user.role)) {
      return next(new AppError(403, 'FORBIDDEN', 'Tài khoản của bạn không có quyền thực hiện thao tác này.'));
    }
    req.user = user;
    next();
  };
}

module.exports = { requireStaff };
