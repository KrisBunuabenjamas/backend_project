const User = require('../models/User');
const { ApiError, asyncHandler } = require('../middleware/errors');
const { fields } = require('../middleware/validate');

function cookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' };
}
function sendToken(user, status, res) {
  const token = user.getSignedJwtToken();
  const days = Number(process.env.JWT_COOKIE_EXPIRE || 30);
  res.status(status).cookie('token', token, {
    ...cookieOptions(), expires: new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  }).json({ success: true, token });
}
exports.register = asyncHandler(async (req, res) => {
  fields(req.body, ['name', 'tel', 'email', 'password']);
  const { name, tel, email, password } = req.body;
  // Never read role from the public registration payload.
  const user = await User.create({ name, tel, email, password });
  sendToken(user, 201, res);
});
exports.login = asyncHandler(async (req, res) => {
  fields(req.body, ['email', 'password']);
  const user = await User.findOne({ email: req.body.email.trim().toLowerCase() }).select('+password');
  if (!user || !await user.matchPassword(req.body.password)) throw new ApiError(401, 'Invalid credentials');
  sendToken(user, 200, res);
});
exports.getMe = (req, res) => res.status(200).json({ success: true, data: req.user });
exports.logout = (req, res) => {
  // Course-style logout: copied Bearer tokens remain valid until expiry.
  res.clearCookie('token', cookieOptions()).status(200).json({ success: true, data: {} });
};
