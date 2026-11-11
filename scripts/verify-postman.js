// Test-only harness. Uses disposable local MongoDB, never Atlas or config.env.
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const newman = require('newman');
const assert = require('node:assert/strict');
const { createApp } = require('../app');
const { seedRestaurants, createAdmin } = require('./setup-data');
const collection = require('../postman/RestaurantReservation.postman_collection.json');

(async () => {
  let mongo, server;
  try {
    process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = randomBytes(32).toString('hex');
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri(), { dbName: 'restaurant_final_newman' });
    const app = createApp();
    await Promise.all(Object.values(mongoose.models).map(model => model.init()));
    await seedRestaurants();
    // Deliberately exercise JSON escaping for real user-chosen credentials.
    const password = randomBytes(20).toString('hex') + '"\\#';
    await createAdmin({ name: 'Disposable Test Admin', tel: '0811111111', email: 'admin@example.com', password });
    await new Promise((resolve, reject) => { server = app.listen(0, '127.0.0.1', resolve); server.once('error', reject); });
    const summary = await new Promise((resolve, reject) => newman.run({
      collection, reporters: ['cli'], reporter: { cli: { noBanner: true } },
      environment: { values: [
        { key: 'baseUrl', value: `http://127.0.0.1:${server.address().port}/api/v1` },
        { key: 'adminEmail', value: 'admin@example.com' }, { key: 'adminPassword', value: password }
      ] }, timeoutRequest: 5000
    }, (err, result) => err ? reject(err) : resolve(result)));
    const registered = JSON.parse(summary.run.executions[0].request.body.raw);
    const emailRunId = registered.email.slice('owner-'.length).split('@')[0];
    assert.ok(!registered.password.includes(emailRunId), 'Test account password must be independent of the public email identifier');
    // Store only aggregate evidence; never export tokens, passwords, bodies, or environment.
    const report = { verifiedAt: new Date().toISOString(), environment: 'Disposable local MongoDB + localhost HTTP; not Atlas',
      requests: summary.run.stats.requests, assertions: summary.run.stats.assertions,
      responseTimeMs: summary.run.timings.responseAverage, maxResponseTimeMs: Math.max(...summary.run.executions.map(e => e.response?.responseTime || 0)),
      failures: summary.run.failures.map(f => ({ source: f.source?.name, message: f.error?.message })) };
    fs.mkdirSync(path.join(__dirname, '../output'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, '../output/newman-summary.json'), JSON.stringify(report, null, 2) + '\n');
    if (report.failures.length) process.exitCode = 1;
  } catch (err) { console.error(`Postman verification failed: ${err.message}`); process.exitCode = 1; }
  finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect(); if (mongo) await mongo.stop();
  }
})();
