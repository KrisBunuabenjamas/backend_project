const mongoose = require('mongoose');
const { ApiError } = require('./errors');

function fields(body, allowed, required = allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'A JSON object is required');
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new ApiError(400, 'Unexpected field in request');
  for (const key of required) {
    if (typeof body[key] !== 'string' || !body[key].trim()) throw new ApiError(400, `${key} is required and must be a string`);
  }
  for (const key of Object.keys(body)) {
    if (typeof body[key] !== 'string' || !body[key].trim()) throw new ApiError(400, `${key} must be a nonempty string`);
    if (key === 'password' && Buffer.byteLength(body[key], 'utf8') > 72) throw new ApiError(400, 'Password must not exceed 72 UTF-8 bytes');
    // These API fields are plain text. Reject markup rather than rewriting input.
    // Passwords must retain their literal characters for bcrypt comparison.
    if (key !== 'password' && /[<>]/.test(body[key])) throw new ApiError(400, `${key} must not contain HTML`);
  }
}
function objectId(value) {
  if (!mongoose.isObjectIdOrHexString(value)) throw new ApiError(400, 'Invalid resource ID');
}
function reservationDate(value) {
  const format = /^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/;
  if (typeof value !== 'string' || !format.test(value)) throw new ApiError(400, 'Use an ISO date or date-time with timezone');
  const calendar = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  const date = new Date(value);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== value.slice(0, 10) || !Number.isFinite(date.getTime())) {
    throw new ApiError(400, 'Invalid reservation date');
  }
  return date;
}
module.exports = { fields, objectId, reservationDate };
