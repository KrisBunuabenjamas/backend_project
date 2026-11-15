const User = require('../models/User');
const Restaurant = require('../models/Restaurant');
const { fields } = require('../middleware/validate');
const { ApiError } = require('../middleware/errors');
const MenuItem = require('../models/MenuItem');
const restaurants = require('../data/restaurants.json');
const menuItems = require('../data/menu-items.json');

async function seedRestaurants() {
  for (const record of restaurants) {
    // Stable IDs and $setOnInsert make this additive and safe to repeat.
    await Restaurant.updateOne({ _id: record._id }, { $setOnInsert: record }, { upsert: true, runValidators: true });
  }
  return Restaurant.countDocuments();
}
async function seedMenuItems() {
  for (const record of menuItems) {
    await MenuItem.updateOne({ _id: record._id }, { $setOnInsert: record }, { upsert: true, runValidators: true });
  }
  return MenuItem.countDocuments();
}
async function createAdmin(credentials) {
  fields(credentials, ['name', 'tel', 'email', 'password']);
  const email = credentials.email.trim().toLowerCase();
  if (await User.exists({ email })) throw new ApiError(409, 'This email already exists; no account was changed');
  return User.create({ ...credentials, email, role: 'admin' });
}
module.exports = { seedRestaurants, seedMenuItems, createAdmin };
