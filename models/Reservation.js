const mongoose = require('mongoose');
const ReservationSchema = new mongoose.Schema({
  reservationDate: { type: Date, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  // Internal capacity slot, NOT a physical table number. Deleting releases it.
  slot: { type: Number, required: true, enum: [1, 2, 3], select: false },
  createdAt: { type: Date, default: Date.now }
}, { toJSON: { transform(doc, ret) { delete ret.slot; delete ret.__v; return ret; } } });
// Enforces the three-record rule even when many requests arrive together.
ReservationSchema.index({ user: 1, slot: 1 }, { unique: true, name: 'user_slot_unique' });
module.exports = mongoose.model('Reservation', ReservationSchema);
