const PreOrder = require('../models/PreOrder');
const MenuItem = require('../models/MenuItem');
const Reservation = require('../models/Reservation');
const { ApiError, asyncHandler } = require('../middleware/errors');
const { objectId, shape, integer, calendarDay } = require('../middleware/validate');
const { bangkokDayRange } = require('../utils/bangkokTime');
const { MAX_QUANTITY } = PreOrder;

async function findReservation(id) {
  objectId(id);
  const reservation = await Reservation.findById(id);
  if (!reservation) throw new ApiError(404, 'Reservation not found');
  return reservation;
}
// Only the reservation owner may change its pre-order, and only before check-in.
async function editableReservation(req) {
  const reservation = await findReservation(req.params.id);
  if (reservation.user.toString() !== req.user.id) throw new ApiError(403, 'Only the reservation owner can change its pre-order');
  if (reservation.status !== 'reserved') throw new ApiError(409, 'Pre-orders can only be changed before check-in');
  return reservation;
}
async function availableMenuItem(menuItemId, reservation) {
  objectId(menuItemId);
  const item = await MenuItem.findById(menuItemId);
  if (!item) throw new ApiError(404, 'Menu item not found');
  if (item.restaurant.toString() !== reservation.restaurant.toString()) throw new ApiError(400, 'This menu item belongs to a different restaurant');
  if (!item.isActive || !item.availableForPreorder) throw new ApiError(400, 'This menu item is not available for pre-ordering');
  return item;
}
const quantity = value => integer(value, 'quantity', 1, MAX_QUANTITY);
const findLine = (preOrder, menuItemId) => preOrder?.items.find(line => line.menuItem.toString() === menuItemId);

exports.getPreOrder = asyncHandler(async (req, res) => {
  const reservation = await findReservation(req.params.id);
  if (req.user.role !== 'admin' && reservation.user.toString() !== req.user.id) throw new ApiError(403, 'You may only access your own reservations');
  const data = await PreOrder.findOne({ reservation: reservation.id, status: 'active' });
  if (!data) throw new ApiError(404, 'This reservation has no pre-order yet');
  res.status(200).json({ success: true, data });
});

// Adds an item, or increases its quantity if it is already in the pre-order.
// The unit price recorded when the item was first added is kept.
exports.addItem = asyncHandler(async (req, res) => {
  shape(req.body, ['menuItem', 'quantity'], ['menuItem', 'quantity']);
  const reservation = await editableReservation(req);
  const amount = quantity(req.body.quantity);
  if (typeof req.body.menuItem !== 'string') throw new ApiError(400, 'menuItem must be a menu item ID');
  const item = await availableMenuItem(req.body.menuItem, reservation);
  let preOrder = await PreOrder.findOne({ reservation: reservation.id, status: 'active' });
  if (!preOrder) preOrder = new PreOrder({ reservation: reservation.id, user: reservation.user, restaurant: reservation.restaurant });
  if (!preOrder.items.length) preOrder.restaurant = reservation.restaurant;
  const line = findLine(preOrder, item.id);
  if (line) {
    if (line.quantity + amount > MAX_QUANTITY) throw new ApiError(400, `quantity must be an integer from 1 to ${MAX_QUANTITY}`);
    line.quantity += amount;
  } else {
    preOrder.items.push({ menuItem: item.id, name: item.name, unitPrice: item.price, quantity: amount });
  }
  await preOrder.save();
  res.status(201).json({ success: true, data: preOrder });
});

exports.updateItem = asyncHandler(async (req, res) => {
  shape(req.body, ['quantity'], ['quantity']);
  const reservation = await editableReservation(req);
  const amount = quantity(req.body.quantity);
  objectId(req.params.menuItemId);
  const preOrder = await PreOrder.findOne({ reservation: reservation.id, status: 'active' });
  const line = findLine(preOrder, req.params.menuItemId);
  if (!line) throw new ApiError(404, 'This item is not in the pre-order');
  await availableMenuItem(req.params.menuItemId, reservation);
  line.quantity = amount;
  await preOrder.save();
  res.status(200).json({ success: true, data: preOrder });
});

// Removing is always allowed before check-in, even if the item was deactivated.
exports.removeItem = asyncHandler(async (req, res) => {
  const reservation = await editableReservation(req);
  objectId(req.params.menuItemId);
  const preOrder = await PreOrder.findOne({ reservation: reservation.id, status: 'active' });
  const line = findLine(preOrder, req.params.menuItemId);
  if (!line) throw new ApiError(404, 'This item is not in the pre-order');
  preOrder.items.pull(line);
  await preOrder.save();
  res.status(200).json({ success: true, data: preOrder });
});

// Admin: active pre-orders for reservations on one Bangkok calendar day.
exports.getPreOrdersByDate = asyncHandler(async (req, res) => {
  const day = calendarDay(req.query.date);
  const { start, end } = bangkokDayRange(day);
  const reservations = await Reservation.find({ reservationDate: { $gte: start, $lt: end } }).select('_id');
  const data = await PreOrder.find({ reservation: { $in: reservations.map(r => r._id) }, status: 'active' })
    .populate([{ path: 'reservation', select: 'reservationDate status' }, { path: 'user', select: 'name tel email' },
      { path: 'restaurant', select: 'name' }])
    .sort({ createdAt: 1, _id: 1 });
  res.status(200).json({ success: true, date: day, count: data.length, data });
});
