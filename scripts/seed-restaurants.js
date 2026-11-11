const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../config/config.env'), quiet: true });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { seedRestaurants } = require('./setup-data');

(async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    const count = await seedRestaurants();
    console.log(`Sample restaurants ready. Total restaurants: ${count}. No existing records were deleted.`);
  } catch (err) {
    console.error(`Seed failed (${err.name}); check config/config.env and database connectivity`); process.exitCode = 1;
  } finally { await mongoose.disconnect(); }
})();
