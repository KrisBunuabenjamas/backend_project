const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const { fields } = require('../middleware/validate');
const { ApiError } = require('../middleware/errors');
const restaurants = require('../data/restaurants.json');

async function seedRestaurants() {
  for (const record of restaurants) {
    // Stable IDs and $setOnInsert make this additive and safe to repeat.
    await Restaurant.updateOne({ _id: record._id }, { $setOnInsert: record }, { upsert: true, runValidators: true });
  }
  return Restaurant.countDocuments();
}
async function createAdmin(credentials) {
  fields(credentials, ['name', 'tel', 'email', 'password']);
  const email = credentials.email.trim().toLowerCase();
  if (await User.exists({ email })) throw new ApiError(409, 'This email already exists; no account was changed');
  return User.create({ ...credentials, email, role: 'admin' });
}
module.exports = { seedRestaurants, createAdmin };
