const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, 'config/config.env'), quiet: true });
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { createApp } = require('./app');
const validateConfig = require('./config/validate');

async function startServer() {
  validateConfig();
  const app = createApp();
  await connectDB(process.env.MONGO_URI);
  const server = app.listen(process.env.PORT || 5000, () => console.log(`Restaurant API running on port ${process.env.PORT || 5000}`));
  server.on('error', async err => { console.error(`Server error: ${err.code || err.name}`); await mongoose.disconnect(); process.exitCode = 1; });
  return server;
}
if (require.main === module) {
  startServer().then(server => {
    const stop = () => server.close(async () => { await mongoose.disconnect(); process.exitCode = 0; });
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  }).catch(async err => {
    console.error(err.name === 'ConfigurationError' || err.message.startsWith('MONGO_URI') ? err.message : `Startup failed (${err.name}); check database configuration and connectivity`);
    await mongoose.disconnect(); process.exitCode = 1;
  });
}
module.exports = { startServer };
