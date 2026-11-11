const Restaurant = require('../models/Restaurant');
const { asyncHandler, ApiError } = require('../middleware/errors');
const { objectId } = require('../middleware/validate');

exports.getRestaurants = asyncHandler(async (req, res) => {
  const restaurants = await Restaurant.find().sort({ name: 1 });
  res.status(200).json({ success: true, count: restaurants.length, data: restaurants });
});
exports.getRestaurant = asyncHandler(async (req, res) => {
  objectId(req.params.id);
  const restaurant = await Restaurant.findById(req.params.id);
  if (!restaurant) throw new ApiError(404, 'Restaurant not found');
  res.status(200).json({ success: true, data: restaurant });
});
