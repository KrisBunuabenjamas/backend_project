const mongoose = require('mongoose');
const MenuItemSchema = new mongoose.Schema({
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  price: { type: Number, required: true, min: 0, max: 1000000 },
  availableForPreorder: { type: Boolean, default: true },
  // Deactivated items are hidden from members but never deleted, so pre-orders keep their data.
  isActive: { type: Boolean, default: true },
  deactivatedAt: Date
}, { timestamps: true, toJSON: { transform(doc, ret) { delete ret.__v; return ret; } } });
MenuItemSchema.index({ restaurant: 1, isActive: 1, name: 1 });
module.exports = mongoose.model('MenuItem', MenuItemSchema);
