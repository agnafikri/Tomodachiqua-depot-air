// Galat aplikasi dengan status HTTP dan kode yang stabil untuk frontend.
export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
