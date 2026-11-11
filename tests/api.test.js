const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.NODE_ENV = 'test';
const { createApp } = require('../app');
const User = require('../models/User');
let mongo, app;
const profile = { name: 'Student', tel: '0812345678', email: 'student@example.com', password: 'Test-pass-123' };

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'restaurant_final_test' });
  app = createApp({ rateLimitMax: 10000 });
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
});
after(async () => { await mongoose.disconnect(); if (mongo) await mongo.stop(); });
beforeEach(async () => { for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({}); });

async function register(data = profile) { return request(app).post('/api/v1/auth/register').send(data); }
async function account(email, role = 'user') {
  const u = await User.create({ ...profile, email, role });
  const r = await request(app).post('/api/v1/auth/login').send({ email, password: profile.password });
  assert.equal(r.status, 200);
  return { id: u.id, token: r.body.token };
}
const auth = token => ({ Authorization: `Bearer ${token}` });

test('registration requires name, telephone, email and password', async () => {
  for (const key of Object.keys(profile)) {
    const body = { ...profile }; delete body[key];
    assert.equal((await register(body)).status, 400, key);
  }
  assert.equal(await User.countDocuments(), 0);
});
test('registration normalizes email, hashes password and sets HttpOnly cookie', async () => {
  const r = await register({ ...profile, email: ' STUDENT@EXAMPLE.COM ' });
  assert.equal(r.status, 201); assert.equal(typeof r.body.token, 'string');
  assert.match(r.headers['set-cookie'][0], /HttpOnly/);
  assert.match(r.headers['set-cookie'][0], /SameSite=Lax/);
  const u = await User.findOne().select('+password');
  assert.equal(u.email, profile.email); assert.notEqual(u.password, profile.password);
  assert.equal(await u.matchPassword(profile.password), true);
  assert.equal(u.role, 'user');
  assert.equal(r.body.password, undefined);
  assert.equal((await register()).status, 400);
});
test('registration rejects admin role, unknown fields, short password and invalid email', async () => {
  for (const body of [{ ...profile, role: 'admin' }, { ...profile, other: true },
    { ...profile, password: '12345' }, { ...profile, email: 'bad' }, { ...profile, tel: 123 }]) {
    assert.equal((await register(body)).status, 400);
  }
  assert.equal(await User.countDocuments(), 0);
});
test('login requires actual credentials and rejects NoSQL operator payloads', async () => {
  await register();
  for (const body of [{ email: profile.email, password: 'wrong' },
    { email: 'missing@example.com', password: profile.password },
    { email: { $ne: null }, password: profile.password },
    { email: profile.email, password: { $ne: null } }, {}]) {
    const r = await request(app).post('/api/v1/auth/login').send(body);
    assert.ok([400, 401].includes(r.status)); assert.equal(r.body.token, undefined);
  }
  const r = await request(app).post('/api/v1/auth/login').send({ email: ' STUDENT@EXAMPLE.COM ', password: profile.password });
  assert.equal(r.status, 200); assert.ok(r.body.token);
});
test('profile requires valid JWT and never exposes password', async () => {
  assert.equal((await request(app).get('/api/v1/auth/me')).status, 401);
  assert.equal((await request(app).get('/api/v1/auth/me').set(auth('invalid'))).status, 401);
  const r = await register();
  const me = await request(app).get('/api/v1/auth/me').set(auth(r.body.token));
  assert.equal(me.status, 200); assert.equal(me.body.data.email, profile.email);
  assert.equal(me.body.data.password, undefined);
  const u = await User.findOne(); await u.deleteOne();
  assert.equal((await request(app).get('/api/v1/auth/me').set(auth(r.body.token))).status, 401);
});
test('cookie login works and logout clears cookie (stateless Bearer remains valid)', async () => {
  const agent = request.agent(app);
  const r = await agent.post('/api/v1/auth/register').send(profile);
  assert.equal((await agent.get('/api/v1/auth/me')).status, 200);
  const out = await agent.get('/api/v1/auth/logout');
  assert.equal(out.status, 200); assert.match(out.headers['set-cookie'][0], /token=;/);
  assert.equal((await agent.get('/api/v1/auth/me')).status, 401);
  assert.equal((await request(app).get('/api/v1/auth/me').set(auth(r.body.token))).status, 200);
});

test('passwords retain literal special characters while profile fields reject HTML', async () => {
  const password = 'Safe<script>literal</script>123';
  assert.equal((await register({ ...profile, password })).status, 201);
  const user = await User.findOne().select('+password');
  assert.equal(await user.matchPassword(password), true);
  const login = await request(app).post('/api/v1/auth/login').send({ email: profile.email, password });
  assert.equal(login.status, 200);
  const malicious = await register({ ...profile, email: 'xss@example.com', name: '<script>alert(1)</script>Student' });
  assert.equal(malicious.status, 400);
});

test('bcrypt passwords are limited to 72 UTF-8 bytes on register, login and admin setup', async () => {
  const { createAdmin } = require('../scripts/setup-data');
  const exactly72 = 'ก'.repeat(24); // 24 Thai characters = 72 UTF-8 bytes.
  assert.equal((await register({ ...profile, password: exactly72 })).status, 201);
  assert.equal((await request(app).post('/api/v1/auth/login').send({ email: profile.email, password: exactly72 })).status, 200);
  const overflow = await request(app).post('/api/v1/auth/login').send({ email: profile.email, password: exactly72 + 'WRONG' });
  assert.ok([400, 401].includes(overflow.status)); assert.equal(overflow.body.token, undefined);
  assert.equal((await register({ ...profile, email: 'long@example.com', password: exactly72 + 'ก' })).status, 400);
  await assert.rejects(createAdmin({ ...profile, email: 'admin@example.com', password: exactly72 + 'ก' }));
  await assert.rejects(User.create({ ...profile, email: 'direct@example.com', password: exactly72 + 'ก' }), { name: 'ValidationError' });
});

test('mixed valid fields with forbidden MongoDB keys fail instead of being silently accepted', async () => {
  assert.equal((await register({ ...profile, $set: { role: 'admin' } })).status, 400);
  const u = await account('owner@example.com'); const r = await restaurant();
  assert.equal((await reserve(u.token, r.id, { reservationDate: '2026-12-01', 'user.id': u.id })).status, 400);
  const booked = await reserve(u.token, r.id); assert.equal(booked.status, 201);
  const changed = await request(app).put(`/api/v1/reservations/${booked.body.data._id}`).set(auth(u.token))
    .send({ reservationDate: '2026-12-02', $set: { user: u.id } });
  assert.equal(changed.status, 400);
  assert.equal((await require('../models/Reservation').findById(booked.body.data._id)).reservationDate.toISOString(), '2026-12-01T00:00:00.000Z');
});
test('invalid JSON and unknown routes return clean JSON errors', async () => {
  const r = await request(app).post('/api/v1/auth/register').set('Content-Type', 'application/json').send('{');
  assert.equal(r.status, 400); assert.equal(r.body.success, false); assert.equal(r.body.stack, undefined);
  const missing = await request(app).get('/missing');
  assert.equal(missing.status, 404); assert.equal(missing.body.success, false);
});
test('Helmet headers and rate limiter are active', async () => {
  const limited = createApp({ rateLimitMax: 1 });
  const r = await request(limited).get('/api/v1/auth/me');
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal((await request(limited).get('/api/v1/auth/me')).status, 429);
});

test('restaurant catalog is public and returns required restaurant information', async () => {
  const empty = await request(app).get('/api/v1/restaurants');
  assert.equal(empty.status, 200); assert.equal(empty.body.count, 0);
  const Restaurant = require('../models/Restaurant');
  const r = await Restaurant.create({ name: 'Night Kitchen', address: 'Bangkok', tel: '021234567', openTime: '18:00', closeTime: '02:00' });
  const list = await request(app).get('/api/v1/restaurants');
  assert.equal(list.body.count, 1);
  const detail = await request(app).get(`/api/v1/restaurants/${r.id}`);
  assert.equal(detail.status, 200);
  for (const key of ['name', 'address', 'tel', 'openTime', 'closeTime']) assert.equal(detail.body.data[key], r[key]);
});
test('restaurant lookup distinguishes malformed and missing IDs', async () => {
  assert.equal((await request(app).get('/api/v1/restaurants/not-an-id')).status, 400);
  assert.equal((await request(app).get('/api/v1/restaurants/000000000000000000000001')).status, 404);
});
test('restaurant setup refuses missing fields and invalid opening hours', async () => {
  const Restaurant = require('../models/Restaurant');
  await assert.rejects(Restaurant.create({ name: 'Incomplete' }), { name: 'ValidationError' });
  await assert.rejects(Restaurant.create({ name: 'Bad time', address: 'Bangkok', tel: '02', openTime: '25:00', closeTime: '12:00' }), { name: 'ValidationError' });
});

async function restaurant() {
  return require('../models/Restaurant').create({ name: 'Siam Table', address: 'Bangkok', tel: '021111111', openTime: '09:00', closeTime: '22:00' });
}
const reserve = (token, restaurantId, body = { reservationDate: '2026-12-01' }) =>
  request(app).post(`/api/v1/restaurants/${restaurantId}/reservations`).set(auth(token)).send(body);

test('reservations require login and allow exactly three records across restaurants and dates', async () => {
  const u = await account('owner@example.com'); const r = await restaurant();
  assert.equal((await request(app).post(`/api/v1/restaurants/${r.id}/reservations`).send({ reservationDate: '2026-12-01' })).status, 401);
  const ids = [];
  for (const date of ['2026-12-01', '2026-12-02', '2025-01-01']) {
    const response = await reserve(u.token, r.id, { reservationDate: date });
    assert.equal(response.status, 201); ids.push(response.body.data._id);
    assert.equal(response.body.data.user, u.id); assert.equal(response.body.data.slot, undefined);
  }
  const other = await restaurant();
  assert.equal((await reserve(u.token, other.id)).status, 400);
  assert.equal((await request(app).delete(`/api/v1/reservations/${ids[1]}`).set(auth(u.token))).status, 200);
  assert.equal((await reserve(u.token, other.id)).status, 201);
  const list = await request(app).get('/api/v1/reservations').set(auth(u.token));
  assert.equal(list.status, 200); assert.equal(list.body.count, 3);
  assert.equal(list.body.data[0].restaurant.name, 'Siam Table');
});
test('members can only list, read, edit or delete their own reservations', async () => {
  const owner = await account('owner@example.com'); const stranger = await account('other@example.com');
  const r = await restaurant(); const booked = await reserve(owner.token, r.id);
  assert.equal(booked.status, 201); const id = booked.body.data._id;
  const hidden = await request(app).get('/api/v1/reservations').set(auth(stranger.token));
  assert.equal(hidden.status, 200); assert.equal(hidden.body.count, 0);
  for (const method of ['get', 'put', 'delete']) {
    const response = await request(app)[method](`/api/v1/reservations/${id}`).set(auth(stranger.token)).send({ reservationDate: '2026-12-02' });
    assert.equal(response.status, 403, method);
  }
  assert.equal((await request(app).get(`/api/v1/reservations/${id}`).set(auth(owner.token))).status, 200);
  const newRestaurant = await restaurant();
  const changed = await request(app).put(`/api/v1/reservations/${id}`).set(auth(owner.token)).send({ reservationDate: '2026-12-02T18:30:00+07:00', restaurant: newRestaurant.id });
  assert.equal(changed.status, 200); assert.equal(changed.body.data.reservationDate, '2026-12-02T11:30:00.000Z');
  assert.equal(changed.body.data.restaurant._id, newRestaurant.id);
});
test('admins can list, read, edit and delete any reservation', async () => {
  const owner = await account('owner@example.com'); const admin = await account('admin@example.com', 'admin');
  const r = await restaurant(); const booked = await reserve(owner.token, r.id);
  assert.equal(booked.status, 201); const id = booked.body.data._id;
  const all = await request(app).get('/api/v1/reservations').set(auth(admin.token));
  assert.equal(all.status, 200); assert.equal(all.body.count, 1);
  assert.equal((await request(app).get(`/api/v1/reservations/${id}`).set(auth(admin.token))).status, 200);
  const changed = await request(app).put(`/api/v1/reservations/${id}`).set(auth(admin.token)).send({ reservationDate: '2026-12-03' });
  assert.equal(changed.status, 200); assert.equal(changed.body.data.user, owner.id);
  assert.equal((await request(app).delete(`/api/v1/reservations/${id}`).set(auth(admin.token))).status, 200);
  assert.equal((await request(app).get(`/api/v1/reservations/${id}`).set(auth(admin.token))).status, 404);
});
test('reservation updates cannot reassign owner, slot or protected fields', async () => {
  const u = await account('owner@example.com'); const r = await restaurant();
  assert.equal((await reserve(u.token, r.id, { reservationDate: '2026-12-01', user: u.id })).status, 400);
  const booked = await reserve(u.token, r.id); assert.equal(booked.status, 201);
  for (const body of [{ user: '000000000000000000000001' }, { slot: '3' }, { createdAt: '2026-01-01' }, {}, { $set: { user: u.id } }]) {
    assert.equal((await request(app).put(`/api/v1/reservations/${booked.body.data._id}`).set(auth(u.token)).send(body)).status, 400);
  }
});
test('reservations reject calendar-invalid dates, invalid IDs and nonexistent restaurants', async () => {
  const u = await account('owner@example.com'); const r = await restaurant();
  for (const date of ['bad', '2026-02-30', '2026-13-01', '2026-01-01T25:00:00Z', '2026-01-01T10:00:00', '2026-04-31', 123, { $ne: null }]) {
    assert.equal((await reserve(u.token, r.id, { reservationDate: date })).status, 400, JSON.stringify(date));
  }
  assert.equal((await reserve(u.token, 'bad')).status, 400);
  assert.equal((await reserve(u.token, '000000000000000000000001')).status, 404);
  const booked = await reserve(u.token, r.id); assert.equal(booked.status, 201);
  assert.equal((await request(app).put(`/api/v1/reservations/${booked.body.data._id}`).set(auth(u.token)).send({ restaurant: '000000000000000000000001' })).status, 404);
  for (const method of ['get', 'put', 'delete']) {
    assert.equal((await request(app)[method]('/api/v1/reservations/bad').set(auth(u.token)).send({ reservationDate: '2026-12-02' })).status, 400);
    assert.equal((await request(app)[method]('/api/v1/reservations/000000000000000000000001').set(auth(u.token)).send({ reservationDate: '2026-12-02' })).status, 404);
  }
});
test('concurrent creates cannot exceed three reservations and deletion frees a slot', async () => {
  const u = await account('race@example.com'); const r = await restaurant();
  const responses = await Promise.all(Array.from({ length: 12 }, () => reserve(u.token, r.id)));
  assert.equal(responses.filter(r => r.status === 201).length, 3);
  assert.equal(responses.filter(r => r.status === 400).length, 9);
  assert.equal(await require('../models/Reservation').countDocuments({ user: u.id }), 3);
  const id = responses.find(r => r.status === 201).body.data._id;
  assert.equal((await request(app).delete(`/api/v1/reservations/${id}`).set(auth(u.token))).status, 200);
  assert.equal((await reserve(u.token, r.id)).status, 201);
});

test('restaurant seeding is additive, repeatable and preserves existing records', async () => {
  const { seedRestaurants } = require('../scripts/setup-data');
  const custom = await restaurant();
  await seedRestaurants(); await seedRestaurants();
  const Restaurant = require('../models/Restaurant');
  assert.equal(await Restaurant.countDocuments(), 4);
  assert.equal((await Restaurant.findById(custom.id)).name, 'Siam Table');
});
test('admin setup requires credentials and never overwrites an existing user', async () => {
  const { createAdmin } = require('../scripts/setup-data');
  await assert.rejects(createAdmin({}), err => err.statusCode === 400);
  const admin = await createAdmin({ ...profile, email: 'ADMIN@EXAMPLE.COM' });
  assert.equal(admin.role, 'admin');
  assert.equal(await admin.matchPassword(profile.password), true);
  await assert.rejects(createAdmin({ ...profile, email: 'admin@example.com', password: 'Replacement123' }), err => err.statusCode === 409);
  const same = await User.findById(admin.id).select('+password');
  assert.equal(await same.matchPassword(profile.password), true);
});
test('OpenAPI documents every operation and is served with Swagger UI', async () => {
  const r = await request(app).get('/api-docs.json'); assert.equal(r.status, 200);
  assert.equal(r.body.openapi, '3.0.3');
  const operations = {
    '/auth/register': ['post'], '/auth/login': ['post'], '/auth/logout': ['get'], '/auth/me': ['get'],
    '/restaurants': ['get'], '/restaurants/{id}': ['get'],
    '/restaurants/{restaurantId}/reservations': ['post'], '/reservations': ['get'],
    '/reservations/{id}': ['get', 'put', 'delete']
  };
  for (const [path, verbs] of Object.entries(operations)) {
    for (const verb of verbs) assert.ok(r.body.paths[path]?.[verb], `${verb} ${path}`);
  }
  assert.equal(r.body.paths['/auth/register'].post.requestBody.content['application/json'].schema.required.includes('tel'), true);
  assert.equal((await request(app).get('/api-docs/')).status, 200);
  await require('@apidevtools/swagger-parser').validate(r.body);
});

test('startup rejects invalid JWT and cookie lifetimes before opening a database connection', async () => {
  const { startServer } = require('../server');
  const saved = { JWT_EXPIRE: process.env.JWT_EXPIRE, JWT_COOKIE_EXPIRE: process.env.JWT_COOKIE_EXPIRE, MONGO_URI: process.env.MONGO_URI };
  delete process.env.MONGO_URI;
  try {
    for (const invalid of ['not-a-lifetime', '-1d', '0s', '1ms']) {
      process.env.JWT_EXPIRE = invalid; process.env.JWT_COOKIE_EXPIRE = '30';
      await assert.rejects(startServer(), /JWT_EXPIRE/);
    }
    process.env.JWT_EXPIRE = '30d';
    for (const invalid of ['bad', '0', '-1', 'Infinity', '1e300']) {
      process.env.JWT_COOKIE_EXPIRE = invalid;
      await assert.rejects(startServer(), /JWT_COOKIE_EXPIRE/);
    }
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
