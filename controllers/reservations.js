const Reservation = require('../models/Reservation');
const Restaurant = require('../models/Restaurant');
const PreOrder = require('../models/PreOrder');
const { ApiError, asyncHandler } = require('../middleware/errors');
const { fields, objectId, reservationDate, shape, text } = require('../middleware/validate');
const { bangkokDay } = require('../utils/bangkokTime');
const restaurantInfo = { path: 'restaurant', select: 'name address tel openTime closeTime' };

async function existingRestaurant(id) {
  objectId(id);
  if (!await Restaurant.exists({ _id: id })) throw new ApiError(404, 'Restaurant not found');
}
async function accessibleReservation(req, { withCode = false } = {}) {
  objectId(req.params.id);
  const query = Reservation.findById(req.params.id);
  if (withCode) query.select('+checkInCode');
  const reservation = await query;
  if (!reservation) throw new ApiError(404, 'Reservation not found');
  if (req.user.role !== 'admin' && reservation.user.toString() !== req.user.id) {
    throw new ApiError(403, 'You may only access your own reservations');
  }
  return reservation;
}
// The check-in code is visible only to the reservation owner.
function present(reservation, user) {
  const data = reservation.toJSON();
  if (reservation.user.toString() !== user.id) delete data.checkInCode;
  return data;
}
exports.getReservations = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'admin' ? {} : { user: req.user.id };
  const data = await Reservation.find(filter).select('+checkInCode').populate(restaurantInfo).sort({ createdAt: 1, _id: 1 });
  res.status(200).json({ success: true, count: data.length, data: data.map(r => present(r, req.user)) });
});
exports.getReservation = asyncHandler(async (req, res) => {
  const reservation = await accessibleReservation(req, { withCode: true });
  await reservation.populate(restaurantInfo);
  res.status(200).json({ success: true, data: present(reservation, req.user) });
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
  if (reservation.status !== 'reserved') throw new ApiError(409, 'A reservation cannot be edited after check-in');
  const updates = {};
  if (req.body.reservationDate !== undefined) updates.reservationDate = reservationDate(req.body.reservationDate);
  if (req.body.restaurant !== undefined) {
    await existingRestaurant(req.body.restaurant); updates.restaurant = req.body.restaurant;
    // Pre-ordered dishes belong to the current restaurant's menu.
    if (req.body.restaurant !== reservation.restaurant.toString()
      && await PreOrder.exists({ reservation: reservation.id, status: 'active', 'items.0': { $exists: true } })) {
      throw new ApiError(409, 'Remove all pre-ordered items before changing the restaurant');
    }
  }
  const data = await Reservation.findOneAndUpdate({ _id: reservation.id, status: 'reserved' }, { $set: updates },
    { returnDocument: 'after', runValidators: true }).populate(restaurantInfo);
  if (!data) throw new ApiError(409, 'A reservation cannot be edited after check-in');
  res.status(200).json({ success: true, data });
});
exports.deleteReservation = asyncHandler(async (req, res) => {
  const reservation = await accessibleReservation(req);
  if (req.user.role !== 'admin' && reservation.status !== 'reserved') {
    throw new ApiError(409, 'Checked-in or completed reservations can only be deleted by an admin');
  }
  const deleted = await Reservation.deleteOne({ _id: reservation.id });
  if (!deleted.deletedCount) throw new ApiError(404, 'Reservation not found');
  // Deleting a reservation cancels its pre-order; the record is kept for history.
  await PreOrder.updateOne({ reservation: reservation.id, status: 'active' }, { $set: { status: 'cancelled', cancelledAt: new Date() } });
  res.status(200).json({ success: true, data: {} });
});

// Admin: validate a check-in code on the reservation date (reserved -> checked-in).
exports.checkIn = asyncHandler(async (req, res) => {
  shape(req.body, ['code'], ['code']);
  const code = text(req.body.code, 'code', { max: 32 }).toUpperCase();
  if (!/^[A-F0-9]{10}$/.test(code)) throw new ApiError(400, 'Invalid check-in code format');
  // A deleted reservation's code no longer exists, so it is rejected here.
  const reservation = await Reservation.findOne({ checkInCode: code });
  if (!reservation) throw new ApiError(404, 'Check-in code not found (invalid, or its reservation was deleted)');
  if (reservation.status !== 'reserved') throw new ApiError(409, 'This check-in code has already been used');
  const day = bangkokDay(reservation.reservationDate);
  if (day !== bangkokDay()) throw new ApiError(400, `Check-in is only allowed on the reservation date (${day})`);
  // The status condition makes the code single-use even under concurrent requests.
  const data = await Reservation.findOneAndUpdate({ _id: reservation.id, status: 'reserved' },
    { $set: { status: 'checked-in', checkedInAt: new Date() } }, { returnDocument: 'after' }).populate(restaurantInfo);
  if (!data) throw new ApiError(409, 'This check-in code has already been used');
  res.status(200).json({ success: true, data });
});

// Admin: mark a checked-in reservation as completed after dining (checked-in -> completed).
exports.completeReservation = asyncHandler(async (req, res) => {
  objectId(req.params.id);
  const existing = await Reservation.findById(req.params.id);
  if (!existing) throw new ApiError(404, 'Reservation not found');
  // Completing frees the user's slot so it no longer counts toward the 3-reservation limit.
  const data = await Reservation.findOneAndUpdate({ _id: existing.id, status: 'checked-in' },
    { $set: { status: 'completed', completedAt: new Date() }, $unset: { slot: 1 } }, { returnDocument: 'after' }).populate(restaurantInfo);
  if (!data) {
    throw new ApiError(409, existing.status === 'completed' ? 'This reservation is already completed'
      : 'Only checked-in reservations can be completed');
  }
  res.status(200).json({ success: true, data });
});
