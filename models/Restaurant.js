const mongoose = require('mongoose');
const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const RestaurantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  address: { type: String, required: true, trim: true, maxlength: 500 },
  tel: { type: String, required: true, trim: true, maxlength: 30 },
  openTime: { type: String, required: true, match: time },
  closeTime: { type: String, required: true, match: time },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Restaurant', RestaurantSchema);
