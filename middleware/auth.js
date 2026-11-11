const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { ApiError, asyncHandler } = require('./errors');

exports.protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  const token = header ? header.match(/^Bearer\s+(\S+)$/i)?.[1] : req.cookies.token;
  if (!token) throw new ApiError(401, 'Not authorized to access this route');
  let decoded;
  try { decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] }); }
  catch { throw new ApiError(401, 'Not authorized to access this route'); }
  if (typeof decoded.id !== 'string' || !/^[a-f\d]{24}$/i.test(decoded.id)) throw new ApiError(401, 'Invalid token');
  req.user = await User.findById(decoded.id);
  if (!req.user) throw new ApiError(401, 'Not authorized to access this route');
  next();
});
exports.authorize = (...roles) => (req, res, next) => {
  if (!req.user) return next(new ApiError(401, 'Authentication required'));
  if (!roles.includes(req.user.role)) return next(new ApiError(403, 'Permission denied'));
  next();
};
