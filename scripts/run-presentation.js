const fs = require('node:fs');
const path = require('node:path');
const newman = require('newman');
require('dotenv').config({ path: path.join(__dirname, '../config/config.env'), quiet: true });
const collection = require('../postman/Presentation.postman_collection.json');
if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in local config/config.env before running the presentation.');
  process.exitCode = 1;
} else {
  newman.run({ collection, reporters: ['cli'], reporter: { cli: { noBanner: true } }, timeoutRequest: 5000,
    environment: { values: [
      { key: 'baseUrl', value: `http://localhost:${process.env.PORT || 5000}/api/v1` },
      { key: 'adminEmail', value: process.env.ADMIN_EMAIL },
      { key: 'adminPassword', value: process.env.ADMIN_PASSWORD }
    ] }
  }, (err, summary) => {
    if (err) { console.error(`Presentation runner failed (${err.name}). Check the backend is running.`); process.exitCode = 1; return; }
    const report = { verifiedAt: new Date().toISOString(), requests: summary.run.stats.requests,
      assertions: summary.run.stats.assertions, averageResponseTimeMs: summary.run.timings.responseAverage,
      maxResponseTimeMs: Math.max(...summary.run.executions.map(e => e.response?.responseTime || 0)),
      failures: summary.run.failures.map(f => ({ request: f.source?.name, message: f.error?.message })) };
    const dir = path.join(__dirname, '../output/presentation_demo'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'last-run.json'), JSON.stringify(report, null, 2) + '\n');
    if (report.failures.length) process.exitCode = 1;
  });
}
