const Reservation = require('../models/Reservation');
const Restaurant = require('../models/Restaurant');
const { ApiError, asyncHandler } = require('../middleware/errors');
const { fields, objectId, reservationDate } = require('../middleware/validate');
const restaurantInfo = { path: 'restaurant', select: 'name address tel openTime closeTime' };

async function existingRestaurant(id) {
  objectId(id);
  if (!await Restaurant.exists({ _id: id })) throw new ApiError(404, 'Restaurant not found');
}
async function accessibleReservation(req) {
  objectId(req.params.id);
  const reservation = await Reservation.findById(req.params.id);
  if (!reservation) throw new ApiError(404, 'Reservation not found');
  if (req.user.role !== 'admin' && reservation.user.toString() !== req.user.id) {
    throw new ApiError(403, 'You may only access your own reservations');
  }
  return reservation;
}
exports.getReservations = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'admin' ? {} : { user: req.user.id };
  const data = await Reservation.find(filter).populate(restaurantInfo).sort({ createdAt: 1, _id: 1 });
  res.status(200).json({ success: true, count: data.length, data });
});
exports.getReservation = asyncHandler(async (req, res) => {
  const reservation = await accessibleReservation(req);
  await reservation.populate(restaurantInfo);
  res.status(200).json({ success: true, data: reservation });
});
exports.addReservation = asyncHandler(async (req, res) => {
  fields(req.body, ['reservationDate']);
  const date = reservationDate(req.body.reservationDate);
  await existingRestaurant(req.params.restaurantId);
  // Unlike count-then-create, the unique index cannot race past three records.
  for (const slot of [1, 2, 3]) {
    try {
      const reservation = await Reservation.create({ reservationDate: date, user: req.user.id, restaurant: req.params.restaurantId, slot });
      return res.status(201).json({ success: true, data: reservation });
    } catch (err) {
      if (err.code !== 11000 || !err.keyPattern?.user || !err.keyPattern?.slot) throw err;
    }
  }
  throw new ApiError(400, 'You already have 3 reservations; delete one before booking again');
});
exports.updateReservation = asyncHandler(async (req, res) => {
  const reservation = await accessibleReservation(req);
  fields(req.body, ['reservationDate', 'restaurant'], []);
  if (!Object.keys(req.body).length) throw new ApiError(400, 'Provide a reservation date or restaurant');
  const updates = {};
  if (req.body.reservationDate !== undefined) updates.reservationDate = reservationDate(req.body.reservationDate);
  if (req.body.restaurant !== undefined) {
    await existingRestaurant(req.body.restaurant); updates.restaurant = req.body.restaurant;
  }
  const data = await Reservation.findByIdAndUpdate(reservation.id, { $set: updates }, { returnDocument: 'after', runValidators: true }).populate(restaurantInfo);
  if (!data) throw new ApiError(404, 'Reservation not found');
  res.status(200).json({ success: true, data });
});
exports.deleteReservation = asyncHandler(async (req, res) => {
  const reservation = await accessibleReservation(req);
  const deleted = await Reservation.deleteOne({ _id: reservation.id });
  if (!deleted.deletedCount) throw new ApiError(404, 'Reservation not found');
  res.status(200).json({ success: true, data: {} });
});
