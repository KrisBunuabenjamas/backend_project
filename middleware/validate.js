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
// Typed body validation for the additional features (menu, pre-order, review),
// which accept numbers and booleans as well as strings.
function shape(body, allowed, required = []) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'A JSON object is required');
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new ApiError(400, 'Unexpected field in request');
  for (const key of required) if (body[key] === undefined) throw new ApiError(400, `${key} is required`);
}
function text(value, key, { max, optional = false }) {
  if (typeof value !== 'string') throw new ApiError(400, `${key} must be a string`);
  const trimmed = value.trim();
  if (!trimmed && !optional) throw new ApiError(400, `${key} must be a nonempty string`);
  if (trimmed.length > max) throw new ApiError(400, `${key} must be at most ${max} characters`);
  if (/[<>]/.test(trimmed)) throw new ApiError(400, `${key} must not contain HTML`);
  return trimmed;
}
function price(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000000) {
    throw new ApiError(400, 'price must be a number from 0 to 1,000,000');
  }
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) throw new ApiError(400, 'price may have at most 2 decimal places');
  return Math.round(value * 100) / 100;
}
function integer(value, key, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw new ApiError(400, `${key} must be an integer from ${min} to ${max}`);
  return value;
}
function boolean(value, key) {
  if (typeof value !== 'boolean') throw new ApiError(400, `${key} must be true or false`);
  return value;
}
function calendarDay(value, key = 'date') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(400, `${key} must use the format YYYY-MM-DD`);
  const day = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== value) throw new ApiError(400, `Invalid ${key}`);
  return value;
}
module.exports = { fields, objectId, reservationDate, shape, text, price, integer, boolean, calendarDay };
