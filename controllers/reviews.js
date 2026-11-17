const mongoose = require('mongoose');
const Review = require('../models/Review');
const Reservation = require('../models/Reservation');
const Restaurant = require('../models/Restaurant');
const { ApiError, asyncHandler } = require('../middleware/errors');
const { objectId, shape, text, integer } = require('../middleware/validate');
const author = { path: 'user', select: 'name' };

function reviewInput(body, { partial }) {
  shape(body, ['rating', 'comment'], partial ? [] : ['rating']);
  if (partial && !Object.keys(body).length) throw new ApiError(400, 'Provide a rating or comment');
  const input = {};
  if (body.rating !== undefined) input.rating = integer(body.rating, 'rating', 1, 5);
  if (body.comment !== undefined) input.comment = text(body.comment, 'comment', { max: 1000, optional: true });
  return input;
}
async function ownReview(req) {
  objectId(req.params.id);
  const review = await Review.findById(req.params.id);
  if (!review) throw new ApiError(404, 'Review not found');
  // Only the author may change a review; admins included.
  if (review.user.toString() !== req.user.id) throw new ApiError(403, 'Only the author can change this review');
  return review;
}

exports.createReview = asyncHandler(async (req, res) => {
  objectId(req.params.id);
  const input = reviewInput(req.body, { partial: false });
  const reservation = await Reservation.findById(req.params.id);
  if (!reservation) throw new ApiError(404, 'Reservation not found');
  if (reservation.user.toString() !== req.user.id) throw new ApiError(403, 'You can only review your own reservation');
  if (reservation.status !== 'completed') throw new ApiError(409, 'You can only review a completed reservation');
  if (await Review.exists({ reservation: reservation.id })) throw new ApiError(409, 'This reservation already has a review');
  try {
    const review = await Review.create({ ...input, reservation: reservation.id, user: req.user.id, restaurant: reservation.restaurant });
    res.status(201).json({ success: true, data: review });
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'This reservation already has a review');
    throw err;
  }
});

// Reviews and the average rating calculated from the existing reviews.
exports.getRestaurantReviews = asyncHandler(async (req, res) => {
  objectId(req.params.restaurantId);
  if (!await Restaurant.exists({ _id: req.params.restaurantId })) throw new ApiError(404, 'Restaurant not found');
  const restaurant = new mongoose.Types.ObjectId(String(req.params.restaurantId));
  const [data, [stats]] = await Promise.all([
    Review.find({ restaurant }).populate(author).sort({ createdAt: -1, _id: -1 }),
    Review.aggregate([{ $match: { restaurant } }, { $group: { _id: null, average: { $avg: '$rating' } } }])
  ]);
  const averageRating = stats ? Math.round(stats.average * 100) / 100 : null;
  res.status(200).json({ success: true, count: data.length, averageRating, data });
});
exports.getReview = asyncHandler(async (req, res) => {
  objectId(req.params.id);
  const data = await Review.findById(req.params.id).populate(author);
  if (!data) throw new ApiError(404, 'Review not found');
  res.status(200).json({ success: true, data });
});
exports.updateReview = asyncHandler(async (req, res) => {
  const review = await ownReview(req);
  Object.assign(review, reviewInput(req.body, { partial: true }));
  await review.save();
  res.status(200).json({ success: true, data: review });
});
exports.deleteReview = asyncHandler(async (req, res) => {
  const review = await ownReview(req);
  await review.deleteOne();
  res.status(200).json({ success: true, data: {} });
});
