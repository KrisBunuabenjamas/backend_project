const mongoose = require('mongoose');
async function connectDB(uri) {
  if (!uri) throw new Error('MONGO_URI is required in config/config.env');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
}
module.exports = connectDB;
