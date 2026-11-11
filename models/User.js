const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  tel: { type: String, required: true, trim: true, maxlength: 30 },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, maxlength: 254 },
  password: { type: String, required: true, minlength: 6, select: false,
    validate: { validator: value => Buffer.byteLength(value, 'utf8') <= 72, message: 'Password must not exceed 72 UTF-8 bytes' } },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  createdAt: { type: Date, default: Date.now }
}, { toJSON: { transform(doc, ret) { delete ret.password; delete ret.__v; return ret; } } });

UserSchema.pre('save', async function () {
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 10);
});
UserSchema.methods.matchPassword = function (password) { return bcrypt.compare(password, this.password); };
UserSchema.methods.getSignedJwtToken = function () {
  return jwt.sign({ id: this._id }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRE || '30d' });
};
module.exports = mongoose.model('User', UserSchema);
