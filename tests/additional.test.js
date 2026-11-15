// Additional requirements: menu items, pre-orders, reviews, check-in codes.
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
const Restaurant = require('../models/Restaurant');
const Reservation = require('../models/Reservation');
const PreOrder = require('../models/PreOrder');
const { bangkokDay } = require('../utils/bangkokTime');
let mongo, app;
const profile = { name: 'Student', tel: '0812345678', password: 'Test-pass-123' };
const today = () => bangkokDay();
const tomorrow = () => bangkokDay(new Date(Date.now() + 24 * 60 * 60 * 1000));

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'restaurant_additional_test' });
  app = createApp({ rateLimitMax: 10000 });
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
});
after(async () => { await mongoose.disconnect(); if (mongo) await mongo.stop(); });
beforeEach(async () => { for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({}); });

const auth = token => ({ Authorization: `Bearer ${token}` });
async function account(email, role = 'user') {
  const u = await User.create({ ...profile, email, role });
  const r = await request(app).post('/api/v1/auth/login').send({ email, password: profile.password });
  assert.equal(r.status, 200);
  return { id: u.id, token: r.body.token };
}
const restaurant = (name = 'Siam Table') => Restaurant.create({ name, address: 'Bangkok', tel: '021111111', openTime: '09:00', closeTime: '22:00' });
const api = (method, path, token, body) => {
  const r = request(app)[method](`/api/v1${path}`);
  if (token) r.set(auth(token));
  return body === undefined ? r : r.send(body);
};
async function reserve(token, restaurantId, reservationDate = today()) {
  const r = await api('post', `/restaurants/${restaurantId}/reservations`, token, { reservationDate });
  assert.equal(r.status, 201); return r.body.data;
}
async function menuItem(adminToken, restaurantId, body = { name: 'Pad Thai', description: 'Rice noodles', price: 120 }) {
  const r = await api('post', `/restaurants/${restaurantId}/menu`, adminToken, body);
  assert.equal(r.status, 201); return r.body.data;
}
async function setup() {
  const owner = await account('owner@example.com'); const other = await account('other@example.com');
  const admin = await account('admin@example.com', 'admin'); const r = await restaurant();
  return { owner, other, admin, r };
}
async function completedReservation({ owner, admin, r }) {
  const res = await reserve(owner.token, r.id);
  assert.equal((await api('post', '/reservations/check-in', admin.token, { code: res.checkInCode })).status, 200);
  assert.equal((await api('patch', `/reservations/${res._id}/complete`, admin.token)).status, 200);
  return res;
}

// ---------- Requirement 1: menu items ----------
test('admins create, update and deactivate menu items; members only view active items', async () => {
  const { owner, admin, r } = await setup();
  assert.equal((await api('post', `/restaurants/${r.id}/menu`, owner.token, { name: 'X', price: 1 })).status, 403);
  assert.equal((await api('get', `/restaurants/${r.id}/menu`)).status, 401);
  const item = await menuItem(admin.token, r.id);
  assert.equal(item.isActive, true); assert.equal(item.availableForPreorder, true); assert.equal(item.description, 'Rice noodles');
  const changed = await api('put', `/menu-items/${item._id}`, admin.token, { price: 135.5, availableForPreorder: false, description: '' });
  assert.equal(changed.status, 200); assert.equal(changed.body.data.price, 135.5); assert.equal(changed.body.data.availableForPreorder, false);
  assert.equal((await api('put', `/menu-items/${item._id}`, owner.token, { price: 1 })).status, 403);
  let menu = await api('get', `/restaurants/${r.id}/menu`, owner.token);
  assert.equal(menu.status, 200); assert.equal(menu.body.count, 1);
  assert.equal((await api('patch', `/menu-items/${item._id}/deactivate`, owner.token)).status, 403);
  const off = await api('patch', `/menu-items/${item._id}/deactivate`, admin.token);
  assert.equal(off.status, 200); assert.equal(off.body.data.isActive, false);
  menu = await api('get', `/restaurants/${r.id}/menu`, owner.token);
  assert.equal(menu.body.count, 0);
  assert.equal((await api('get', `/menu-items/${item._id}`, owner.token)).status, 404);
  assert.equal((await api('get', `/menu-items/${item._id}`, admin.token)).status, 200);
  assert.equal((await api('get', `/restaurants/${r.id}/menu`, admin.token)).body.count, 1);
});
test('menu item input is validated', async () => {
  const { admin, r } = await setup();
  for (const body of [{}, { name: 'A' }, { price: 10 }, { name: '', price: 10 }, { name: 'A', price: -1 }, { name: 'A', price: '10' },
    { name: 'A', price: 1.234 }, { name: '<b>A</b>', price: 1 }, { name: 'A', price: 1, availableForPreorder: 'yes' },
    { name: 'A', price: 1, isActive: false }, { name: 'A', price: 1, restaurant: r.id }]) {
    assert.equal((await api('post', `/restaurants/${r.id}/menu`, admin.token, body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await api('post', '/restaurants/000000000000000000000001/menu', admin.token, { name: 'A', price: 1 })).status, 404);
  const item = await menuItem(admin.token, r.id);
  assert.equal((await api('put', `/menu-items/${item._id}`, admin.token, {})).status, 400);
  assert.equal((await api('put', '/menu-items/000000000000000000000001', admin.token, { price: 1 })).status, 404);
  assert.equal((await api('put', '/menu-items/bad', admin.token, { price: 1 })).status, 400);
});

// ---------- Requirement 2: pre-orders ----------
test('owners add, update and remove pre-order items; total and first unit price are kept', async () => {
  const { owner, admin, r } = await setup();
  const res = await reserve(owner.token, r.id);
  const padThai = await menuItem(admin.token, r.id);
  const tea = await menuItem(admin.token, r.id, { name: 'Iced Tea', price: 45.5 });
  assert.equal((await api('get', `/reservations/${res._id}/preorder`, owner.token)).status, 404);
  let po = await api('post', `/reservations/${res._id}/preorder/items`, owner.token, { menuItem: padThai._id, quantity: 2 });
  assert.equal(po.status, 201); assert.equal(po.body.data.totalPrice, 240);
  // Price changes after the item is first added do not affect the pre-order.
  await api('put', `/menu-items/${padThai._id}`, admin.token, { price: 150 });
  po = await api('post', `/reservations/${res._id}/preorder/items`, owner.token, { menuItem: padThai._id, quantity: 1 });
  assert.equal(po.body.data.items[0].quantity, 3); assert.equal(po.body.data.items[0].unitPrice, 120);
  po = await api('post', `/reservations/${res._id}/preorder/items`, owner.token, { menuItem: tea._id, quantity: 2 });
  assert.equal(po.body.data.totalPrice, 451);
  po = await api('put', `/reservations/${res._id}/preorder/items/${padThai._id}`, owner.token, { quantity: 1 });
  assert.equal(po.status, 200); assert.equal(po.body.data.totalPrice, 211);
  po = await api('delete', `/reservations/${res._id}/preorder/items/${tea._id}`, owner.token);
  assert.equal(po.status, 200); assert.equal(po.body.data.items.length, 1); assert.equal(po.body.data.totalPrice, 120);
  assert.equal((await api('delete', `/reservations/${res._id}/preorder/items/${tea._id}`, owner.token)).status, 404);
  const view = await api('get', `/reservations/${res._id}/preorder`, owner.token);
  assert.equal(view.status, 200); assert.equal(view.body.data.items[0].name, 'Pad Thai');
  assert.equal((await api('get', `/reservations/${res._id}/preorder`, admin.token)).status, 200);
});
test('pre-orders validate quantity, availability, restaurant and ownership', async () => {
  const { owner, other, admin, r } = await setup();
  const res = await reserve(owner.token, r.id);
  const item = await menuItem(admin.token, r.id);
  const path = `/reservations/${res._id}/preorder/items`;
  for (const quantity of [0, -1, 1.5, '2', 101, null]) {
    assert.equal((await api('post', path, owner.token, { menuItem: item._id, quantity })).status, 400, String(quantity));
  }
  assert.equal((await api('post', path, owner.token, { menuItem: item._id })).status, 400);
  assert.equal((await api('post', path, owner.token, { menuItem: '000000000000000000000001', quantity: 1 })).status, 404);
  const elsewhere = await menuItem(admin.token, (await restaurant('Other')).id);
  assert.equal((await api('post', path, owner.token, { menuItem: elsewhere._id, quantity: 1 })).status, 400);
  const notForPreorder = await menuItem(admin.token, r.id, { name: 'Dine-in only', price: 10, availableForPreorder: false });
  assert.equal((await api('post', path, owner.token, { menuItem: notForPreorder._id, quantity: 1 })).status, 400);
  assert.equal((await api('post', path, other.token, { menuItem: item._id, quantity: 1 })).status, 403);
  assert.equal((await api('post', path, admin.token, { menuItem: item._id, quantity: 1 })).status, 403);
  assert.equal((await api('get', `/reservations/${res._id}/preorder`, other.token)).status, 403);
  assert.equal((await api('post', path, owner.token, { menuItem: item._id, quantity: 100 })).status, 201);
  assert.equal((await api('post', path, owner.token, { menuItem: item._id, quantity: 1 })).status, 400);
});
test('deactivated items keep their details in existing pre-orders but cannot be added or increased', async () => {
  const { owner, admin, r } = await setup();
  const res = await reserve(owner.token, r.id);
  const item = await menuItem(admin.token, r.id);
  const path = `/reservations/${res._id}/preorder/items`;
  assert.equal((await api('post', path, owner.token, { menuItem: item._id, quantity: 2 })).status, 201);
  await api('patch', `/menu-items/${item._id}/deactivate`, admin.token);
  const view = await api('get', `/reservations/${res._id}/preorder`, owner.token);
  assert.equal(view.body.data.items[0].name, 'Pad Thai'); assert.equal(view.body.data.totalPrice, 240);
  assert.equal((await api('post', path, owner.token, { menuItem: item._id, quantity: 1 })).status, 400);
  assert.equal((await api('put', `${path}/${item._id}`, owner.token, { quantity: 3 })).status, 400);
  assert.equal((await api('delete', `${path}/${item._id}`, owner.token)).status, 200);
});
test('pre-orders are locked after check-in and the restaurant cannot change while items exist', async () => {
  const { owner, admin, r } = await setup();
  const res = await reserve(owner.token, r.id);
  const item = await menuItem(admin.token, r.id);
  await api('post', `/reservations/${res._id}/preorder/items`, owner.token, { menuItem: item._id, quantity: 1 });
  const other = await restaurant('Other');
  assert.equal((await api('put', `/reservations/${res._id}`, owner.token, { restaurant: other.id })).status, 409);
  assert.equal((await api('put', `/reservations/${res._id}`, owner.token, { restaurant: r.id })).status, 200);
  assert.equal((await api('post', '/reservations/check-in', admin.token, { code: res.checkInCode })).status, 200);
  for (const [method, path, body] of [['post', '/preorder/items', { menuItem: item._id, quantity: 1 }],
    ['put', `/preorder/items/${item._id}`, { quantity: 2 }], ['delete', `/preorder/items/${item._id}`]]) {
    assert.equal((await api(method, `/reservations/${res._id}${path}`, owner.token, body)).status, 409, method);
  }
});
test('admins view pre-orders by reservation date; deleting a reservation cancels its pre-order', async () => {
  const { owner, other, admin, r } = await setup();
  const item = await menuItem(admin.token, r.id);
  const first = await reserve(owner.token, r.id, `${today()}T19:00:00+07:00`);
  const second = await reserve(other.token, r.id, tomorrow());
  for (const [res, who] of [[first, owner], [second, other]]) {
    assert.equal((await api('post', `/reservations/${res._id}/preorder/items`, who.token, { menuItem: item._id, quantity: 1 })).status, 201);
  }
  assert.equal((await api('get', `/preorders?date=${today()}`, owner.token)).status, 403);
  for (const date of ['', 'bad', '2026-02-30']) assert.equal((await api('get', `/preorders?date=${date}`, admin.token)).status, 400);
  let list = await api('get', `/preorders?date=${today()}`, admin.token);
  assert.equal(list.status, 200); assert.equal(list.body.count, 1);
  assert.equal(list.body.data[0].reservation._id, first._id); assert.equal(list.body.data[0].user.name, 'Student');
  assert.equal((await api('delete', `/reservations/${first._id}`, owner.token)).status, 200);
  const cancelled = await PreOrder.findOne({ reservation: first._id });
  assert.equal(cancelled.status, 'cancelled'); assert.ok(cancelled.cancelledAt);
  list = await api('get', `/preorders?date=${today()}`, admin.token);
  assert.equal(list.body.count, 0);
  assert.equal((await api('get', `/preorders?date=${tomorrow()}`, admin.token)).body.count, 1);
});

// ---------- Requirement 4: check-in codes ----------
test('each reservation gets a unique check-in code visible only to its owner', async () => {
  const { owner, admin, r } = await setup();
  const a = await reserve(owner.token, r.id); const b = await reserve(owner.token, r.id);
  assert.match(a.checkInCode, /^[A-F0-9]{10}$/); assert.notEqual(a.checkInCode, b.checkInCode);
  assert.equal(a.status, 'reserved');
  assert.equal((await api('get', `/reservations/${a._id}`, owner.token)).body.data.checkInCode, a.checkInCode);
  assert.equal((await api('get', '/reservations', owner.token)).body.data[0].checkInCode, a.checkInCode);
  assert.equal((await api('get', `/reservations/${a._id}`, admin.token)).body.data.checkInCode, undefined);
  assert.equal((await api('get', '/reservations', admin.token)).body.data[0].checkInCode, undefined);
});
test('admins check in on the reservation date, then complete; codes are single-use', async () => {
  const { owner, admin, r } = await setup();
  const res = await reserve(owner.token, r.id);
  assert.equal((await api('post', '/reservations/check-in', owner.token, { code: res.checkInCode })).status, 403);
  assert.equal((await api('patch', `/reservations/${res._id}/complete`, admin.token)).status, 409);
  const lower = await api('post', '/reservations/check-in', admin.token, { code: res.checkInCode.toLowerCase() });
  assert.equal(lower.status, 200); assert.equal(lower.body.data.status, 'checked-in'); assert.ok(lower.body.data.checkedInAt);
  assert.equal((await api('post', '/reservations/check-in', admin.token, { code: res.checkInCode })).status, 409);
  assert.equal((await api('put', `/reservations/${res._id}`, owner.token, { reservationDate: tomorrow() })).status, 409);
  assert.equal((await api('delete', `/reservations/${res._id}`, owner.token)).status, 409);
  assert.equal((await api('patch', `/reservations/${res._id}/complete`, owner.token)).status, 403);
  const done = await api('patch', `/reservations/${res._id}/complete`, admin.token);
  assert.equal(done.status, 200); assert.equal(done.body.data.status, 'completed');
  assert.equal((await api('patch', `/reservations/${res._id}/complete`, admin.token)).status, 409);
  assert.equal((await api('post', '/reservations/check-in', admin.token, { code: res.checkInCode })).status, 409);
  assert.equal((await api('delete', `/reservations/${res._id}`, admin.token)).status, 200);
});
test('check-in rejects wrong dates, invalid codes and codes of deleted reservations', async () => {
  const { owner, admin, r } = await setup();
  const later = await reserve(owner.token, r.id, tomorrow());
  const wrongDay = await api('post', '/reservations/check-in', admin.token, { code: later.checkInCode });
  assert.equal(wrongDay.status, 400); assert.match(wrongDay.body.message, /reservation date/);
  for (const body of [{}, { code: 123 }, { code: 'short' }, { code: 'ZZZZZZZZZZ' }, { code: 'A', extra: 1 }]) {
    assert.equal((await api('post', '/reservations/check-in', admin.token, body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await api('post', '/reservations/check-in', admin.token, { code: '0000000000' })).status, 404);
  const deleted = await reserve(owner.token, r.id);
  assert.equal((await api('delete', `/reservations/${deleted._id}`, owner.token)).status, 200);
  assert.equal((await api('post', '/reservations/check-in', admin.token, { code: deleted.checkInCode })).status, 404);
});
test('concurrent check-ins with the same code succeed only once', async () => {
  const { owner, admin, r } = await setup();
  const res = await reserve(owner.token, r.id);
  const responses = await Promise.all(Array.from({ length: 6 }, () => api('post', '/reservations/check-in', admin.token, { code: res.checkInCode })));
  assert.equal(responses.filter(x => x.status === 200).length, 1);
  assert.equal(responses.filter(x => x.status === 409).length, 5);
});
test('completed reservations free a slot toward the 3-reservation limit', async () => {
  const ctx = await setup();
  await completedReservation(ctx);
  for (let i = 0; i < 3; i++) await reserve(ctx.owner.token, ctx.r.id, tomorrow());
  assert.equal((await api('post', `/restaurants/${ctx.r.id}/reservations`, ctx.owner.token, { reservationDate: tomorrow() })).status, 400);
  assert.equal(await Reservation.countDocuments({ user: ctx.owner.id }), 4);
});
test('legacy reservations without status or code are backfilled', async () => {
  const { owner, r } = await setup();
  await Reservation.collection.insertOne({ reservationDate: new Date(), user: new mongoose.Types.ObjectId(owner.id), restaurant: r._id, slot: 1, createdAt: new Date() });
  await Reservation.backfillLegacy();
  const legacy = await Reservation.findOne().select('+checkInCode');
  assert.equal(legacy.status, 'reserved'); assert.match(legacy.checkInCode, /^[A-F0-9]{10}$/);
});

test('OpenAPI documents every additional operation', async () => {
  const r = await request(app).get('/api-docs.json'); assert.equal(r.status, 200);
  const operations = {
    '/restaurants/{restaurantId}/menu': ['get', 'post'], '/menu-items/{id}': ['get', 'put'], '/menu-items/{id}/deactivate': ['patch'],
    '/reservations/{id}/preorder': ['get'], '/reservations/{id}/preorder/items': ['post'],
    '/reservations/{id}/preorder/items/{menuItemId}': ['put', 'delete'], '/preorders': ['get'],
    '/reservations/{id}/review': ['post'], '/restaurants/{restaurantId}/reviews': ['get'], '/reviews/{id}': ['get', 'put', 'delete'],
    '/reservations/check-in': ['post'], '/reservations/{id}/complete': ['patch']
  };
  for (const [path, verbs] of Object.entries(operations)) {
    for (const verb of verbs) assert.ok(r.body.paths[path]?.[verb], `${verb} ${path}`);
  }
  await require('@apidevtools/swagger-parser').validate(r.body);
});

// ---------- Requirement 3: reviews ----------
test('reviews require the owner and a completed reservation, one per reservation', async () => {
  const ctx = await setup(); const { owner, other, admin, r } = ctx;
  const pending = await reserve(owner.token, r.id, tomorrow());
  assert.equal((await api('post', `/reservations/${pending._id}/review`, owner.token, { rating: 5 })).status, 409);
  const res = await completedReservation(ctx);
  assert.equal((await api('post', `/reservations/${res._id}/review`, other.token, { rating: 5 })).status, 403);
  assert.equal((await api('post', `/reservations/${res._id}/review`, admin.token, { rating: 5 })).status, 403);
  for (const body of [{}, { rating: 0 }, { rating: 6 }, { rating: 4.5 }, { rating: '5' }, { rating: 5, comment: 3 },
    { rating: 5, comment: '<script>' }, { rating: 5, user: owner.id }]) {
    assert.equal((await api('post', `/reservations/${res._id}/review`, owner.token, body)).status, 400, JSON.stringify(body));
  }
  const created = await api('post', `/reservations/${res._id}/review`, owner.token, { rating: 5 });
  assert.equal(created.status, 201); assert.equal(created.body.data.comment, ''); assert.equal(created.body.data.restaurant, r.id);
  assert.equal((await api('post', `/reservations/${res._id}/review`, owner.token, { rating: 4 })).status, 409);
});
test('only the author edits or deletes a review; members see reviews and the average rating', async () => {
  const ctx = await setup(); const { owner, other, admin, r } = ctx;
  assert.equal((await api('get', `/restaurants/${r.id}/reviews`, owner.token)).body.averageRating, null);
  const mine = await completedReservation(ctx);
  const review = (await api('post', `/reservations/${mine._id}/review`, owner.token, { rating: 5, comment: 'Great food' })).body.data;
  const theirs = await completedReservation({ owner: other, admin, r });
  assert.equal((await api('post', `/reservations/${theirs._id}/review`, other.token, { rating: 2 })).status, 201);
  assert.equal((await api('get', `/restaurants/${r.id}/reviews`)).status, 401);
  let list = await api('get', `/restaurants/${r.id}/reviews`, owner.token);
  assert.equal(list.status, 200); assert.equal(list.body.count, 2); assert.equal(list.body.averageRating, 3.5);
  assert.equal(list.body.data.find(x => x._id === review._id).user.name, 'Student');
  assert.equal(list.body.data[0].user.email, undefined);
  for (const who of [other, admin]) {
    assert.equal((await api('put', `/reviews/${review._id}`, who.token, { rating: 1 })).status, 403);
    assert.equal((await api('delete', `/reviews/${review._id}`, who.token)).status, 403);
  }
  const edited = await api('put', `/reviews/${review._id}`, owner.token, { rating: 4, comment: '' });
  assert.equal(edited.status, 200); assert.equal(edited.body.data.rating, 4);
  assert.equal((await api('put', `/reviews/${review._id}`, owner.token, {})).status, 400);
  assert.equal((await api('get', `/restaurants/${r.id}/reviews`, other.token)).body.averageRating, 3);
  assert.equal((await api('get', `/reviews/${review._id}`, other.token)).status, 200);
  assert.equal((await api('delete', `/reviews/${review._id}`, owner.token)).status, 200);
  list = await api('get', `/restaurants/${r.id}/reviews`, owner.token);
  assert.equal(list.body.count, 1); assert.equal(list.body.averageRating, 2);
  assert.equal((await api('get', `/reviews/${review._id}`, owner.token)).status, 404);
});
