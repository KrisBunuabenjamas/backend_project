class ApiError extends Error {
  constructor(statusCode, message) { super(message); this.statusCode = statusCode; }
}

// Express 4 does not forward rejected async controller promises by itself.
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function errorHandler(err, req, res, next) {
  let status = err.statusCode || 500;
  let message = err.statusCode ? err.message : 'Server error';
  if (err.code === 11000) { status = 400; message = 'A record with these unique details already exists'; }
  if (err.name === 'ValidationError') { status = 400; message = 'Invalid or missing field values'; }
  if (err.name === 'CastError') { status = 400; message = 'Invalid resource ID or field value'; }
  if (err.type === 'entity.parse.failed') { status = 400; message = 'Invalid JSON body'; }
  if (err.type === 'entity.too.large') { status = 413; message = 'Request body too large'; }
  res.status(status).json({ success: false, message });
}
module.exports = { ApiError, asyncHandler, errorHandler };
