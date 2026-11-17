const mongoose = require('mongoose');
const MAX_QUANTITY = 100;

// name and unitPrice are snapshots taken when the item is first added, so later
// menu edits or deactivation never change an existing pre-order.
const PreOrderItemSchema = new mongoose.Schema({
  menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
  name: { type: String, required: true },
  unitPrice: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 1, max: MAX_QUANTITY,
    validate: { validator: Number.isInteger, message: 'Quantity must be a positive integer' } }
}, { _id: false });

const PreOrderSchema = new mongoose.Schema({
  reservation: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  items: { type: [PreOrderItemSchema], default: [] },
  totalPrice: { type: Number, default: 0 },
  // A pre-order is cancelled (kept for records) when its reservation is deleted.
  status: { type: String, enum: ['active', 'cancelled'], default: 'active' },
  cancelledAt: Date
}, { timestamps: true, optimisticConcurrency: true,
  toJSON: { transform(doc, ret) { delete ret.__v; return ret; } } });

PreOrderSchema.index({ reservation: 1 }, { unique: true });
PreOrderSchema.pre('validate', function () {
  const cents = this.items.reduce((sum, item) => sum + Math.round(item.unitPrice * 100) * item.quantity, 0);
  this.totalPrice = cents / 100;
});
module.exports = mongoose.model('PreOrder', PreOrderSchema);
module.exports.MAX_QUANTITY = MAX_QUANTITY;
