const mongoose = require('mongoose');
const { randomBytes } = require('node:crypto');

const STATUSES = ['reserved', 'checked-in', 'completed'];
// 10 uppercase hex characters (40 random bits); uniqueness is enforced by an index.
const generateCheckInCode = () => randomBytes(5).toString('hex').toUpperCase();

const ReservationSchema = new mongoose.Schema({
  reservationDate: { type: Date, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  // Internal capacity slot, NOT a physical table number. Deleting or completing releases it.
  slot: { type: Number, enum: [1, 2, 3], select: false },
  // reserved -> checked-in -> completed. No other transitions are allowed.
  status: { type: String, enum: STATUSES, default: 'reserved' },
  // Single-use code shown only to the owner; admins validate it at the restaurant.
  checkInCode: { type: String, select: false, default: generateCheckInCode },
  checkedInAt: Date,
  completedAt: Date,
  createdAt: { type: Date, default: Date.now }
}, { toJSON: { transform(doc, ret) { delete ret.slot; delete ret.__v; return ret; } } });

// Enforces the three-active-records rule even when many requests arrive together.
// Completed reservations have no slot, so they no longer count toward the limit.
ReservationSchema.index({ user: 1, slot: 1 }, { unique: true, name: 'user_active_slot_unique',
  partialFilterExpression: { slot: { $exists: true } } });
ReservationSchema.index({ checkInCode: 1 }, { unique: true, name: 'check_in_code_unique',
  partialFilterExpression: { checkInCode: { $type: 'string' } } });
ReservationSchema.index({ reservationDate: 1 });

// Gives reservations created before the check-in feature a status and a code.
ReservationSchema.statics.backfillLegacy = async function () {
  await this.updateMany({ status: { $exists: false } }, { $set: { status: 'reserved' } });
  const missing = await this.find({ checkInCode: { $exists: false } }).select('_id').lean();
  for (const { _id } of missing) {
    await this.updateOne({ _id, checkInCode: { $exists: false } }, { $set: { checkInCode: generateCheckInCode() } });
  }
};

module.exports = mongoose.model('Reservation', ReservationSchema);
module.exports.STATUSES = STATUSES;
