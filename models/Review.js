const mongoose = require('mongoose');
const ReviewSchema = new mongoose.Schema({
  // Unique: at most one review per reservation.
  reservation: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  rating: { type: Number, required: true, min: 1, max: 5,
    validate: { validator: Number.isInteger, message: 'Rating must be an integer from 1 to 5' } },
  comment: { type: String, trim: true, maxlength: 1000, default: '' }
}, { timestamps: true, toJSON: { transform(doc, ret) { delete ret.__v; return ret; } } });
ReviewSchema.index({ reservation: 1 }, { unique: true });
ReviewSchema.index({ restaurant: 1, createdAt: -1 });
module.exports = mongoose.model('Review', ReviewSchema);
