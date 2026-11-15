const mongoose = require('mongoose');
async function connectDB(uri) {
  if (!uri) throw new Error('MONGO_URI is required in config/config.env');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  // syncIndexes (not init) so an existing database drops the old reservation
  // slot index, which did not let completed reservations free their slot.
  await Promise.all(Object.values(mongoose.models).map(model => model.syncIndexes()));
  if (mongoose.models.Reservation) await mongoose.models.Reservation.backfillLegacy();
}
module.exports = connectDB;
