class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (msg, details) => new AppError(400, 'BAD_REQUEST', msg, details);
const notFound = (msg = 'Không tìm thấy dữ liệu.') => new AppError(404, 'NOT_FOUND', msg);
const conflict = (code, msg, details) => new AppError(409, code, msg, details);
const forbidden = (code, msg) => new AppError(403, code, msg);
const unprocessable = (code, msg, details) => new AppError(422, code, msg, details);

module.exports = { AppError, badRequest, notFound, conflict, forbidden, unprocessable };
