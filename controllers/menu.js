const MenuItem = require('../models/MenuItem');
const Restaurant = require('../models/Restaurant');
const { ApiError, asyncHandler } = require('../middleware/errors');
const { objectId, shape, text, price, boolean } = require('../middleware/validate');

const EDITABLE = ['name', 'description', 'price', 'availableForPreorder'];
function menuInput(body, { partial }) {
  shape(body, EDITABLE, partial ? [] : ['name', 'price']);
  if (partial && !Object.keys(body).length) throw new ApiError(400, `Provide at least one of: ${EDITABLE.join(', ')}`);
  const input = {};
  if (body.name !== undefined) input.name = text(body.name, 'name', { max: 100 });
  if (body.description !== undefined) input.description = text(body.description, 'description', { max: 500, optional: true });
  if (body.price !== undefined) input.price = price(body.price);
  if (body.availableForPreorder !== undefined) input.availableForPreorder = boolean(body.availableForPreorder, 'availableForPreorder');
  return input;
}
async function existingRestaurant(id) {
  objectId(id);
  if (!await Restaurant.exists({ _id: id })) throw new ApiError(404, 'Restaurant not found');
}

// Members see active items only; admins also see deactivated ones.
exports.getMenu = asyncHandler(async (req, res) => {
  await existingRestaurant(req.params.restaurantId);
  const filter = { restaurant: req.params.restaurantId };
  if (req.user.role !== 'admin') filter.isActive = true;
  const data = await MenuItem.find(filter).sort({ name: 1, _id: 1 });
  res.status(200).json({ success: true, count: data.length, data });
});
exports.getMenuItem = asyncHandler(async (req, res) => {
  objectId(req.params.id);
  const item = await MenuItem.findById(req.params.id);
  if (!item || (!item.isActive && req.user.role !== 'admin')) throw new ApiError(404, 'Menu item not found');
  res.status(200).json({ success: true, data: item });
});
exports.createMenuItem = asyncHandler(async (req, res) => {
  const input = menuInput(req.body, { partial: false });
  await existingRestaurant(req.params.restaurantId);
  const data = await MenuItem.create({ ...input, restaurant: req.params.restaurantId });
  res.status(201).json({ success: true, data });
});
exports.updateMenuItem = asyncHandler(async (req, res) => {
  objectId(req.params.id);
  const input = menuInput(req.body, { partial: true });
  const data = await MenuItem.findByIdAndUpdate(req.params.id, { $set: input }, { returnDocument: 'after', runValidators: true });
  if (!data) throw new ApiError(404, 'Menu item not found');
  res.status(200).json({ success: true, data });
});
// Soft delete: the item stays in the database so existing pre-orders keep its details.
exports.deactivateMenuItem = asyncHandler(async (req, res) => {
  objectId(req.params.id);
  const existing = await MenuItem.findById(req.params.id);
  if (!existing) throw new ApiError(404, 'Menu item not found');
  if (!existing.isActive) return res.status(200).json({ success: true, data: existing });
  const data = await MenuItem.findByIdAndUpdate(req.params.id, { $set: { isActive: false, deactivatedAt: new Date() } }, { returnDocument: 'after' });
  res.status(200).json({ success: true, data });
});
