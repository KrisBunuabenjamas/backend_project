const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../config/config.env'), quiet: true });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { createAdmin } = require('./setup-data');

(async () => {
  try {
    const credentials = { name: process.env.ADMIN_NAME, tel: process.env.ADMIN_TEL,
      email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };
    if (Object.values(credentials).some(value => !value)) throw new Error('Set ADMIN_NAME, ADMIN_TEL, ADMIN_EMAIL and ADMIN_PASSWORD locally in config/config.env');
    await connectDB(process.env.MONGO_URI);
    await createAdmin(credentials);
    console.log('Admin created. Login using the credentials you configured locally.');
  } catch (err) {
    console.error(err.statusCode ? err.message : err.message.startsWith('Set ADMIN_') ? err.message : `Admin setup failed (${err.name}); check configuration. No existing account was overwritten.`);
    process.exitCode = 1;
  } finally { await mongoose.disconnect(); }
})();
