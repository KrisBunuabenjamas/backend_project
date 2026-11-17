const fs = require('node:fs');
const path = require('node:path');
const items = [];
function add(name, method, route, status, { token, body, tests = [], cookie } = {}) {
  const header = [{ key: 'Content-Type', value: 'application/json' }];
  if (token) header.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
  if (cookie) header.push({ key: 'Cookie', value: cookie });
  items.push({ name, protocolProfileBehavior: { disableCookies: true }, request: {
    method, header, auth: { type: 'noauth' }, url: '{{baseUrl}}' + route,
    ...(body ? { body: { mode: 'raw', raw: '{{requestBody}}', options: { raw: { language: 'json' } } } } : {})
  }, event: [...(body ? [{ listen: 'prerequest', script: { type: 'text/javascript', exec: [
    `const payload = ${JSON.stringify(body)};`,
    'for (const key of Object.keys(payload)) { if (typeof payload[key] === "string") payload[key] = pm.variables.replaceIn(payload[key]); }',
    'pm.variables.set("requestBody", JSON.stringify(payload));'
  ] } }] : []), { listen: 'test', script: { type: 'text/javascript', exec: [
    `pm.test('HTTP ${status}', () => pm.response.to.have.status(${status}));`,
    `pm.test('success flag', () => pm.expect(pm.response.json().success).to.eql(${status < 400}));`,
    ...tests
  ] } }] });
}
const saveToken = name => `if (pm.response.code < 300) pm.variables.set('${name}', pm.response.json().token);`;
const saveId = name => `if (pm.response.code < 300) pm.variables.set('${name}', pm.response.json().data._id);`;
const owner = { token: 'ownerToken' };
const other = { token: 'otherToken' };
const admin = { token: 'adminToken' };
const registration = email => ({ name: 'Postman Student', tel: '0812345678', email, password: '{{testPassword}}' });
add('01 Register owner', 'POST', '/auth/register', 201, { body: registration('{{ownerEmail}}'), tests: [saveToken('ownerToken')] });
add('02 Login owner', 'POST', '/auth/login', 200, { body: { email: '{{ownerEmail}}', password: '{{testPassword}}' }, tests: [saveToken('ownerToken')] });
add('03 Owner profile', 'GET', '/auth/me', 200, { ...owner, tests: [saveId('ownerId'), "pm.test('Password hidden', () => pm.expect(pm.response.json().data).not.to.have.property('password'));"] });
add('04 Register another member', 'POST', '/auth/register', 201, { body: registration('{{otherEmail}}'), tests: [saveToken('otherToken')] });
add('05 Admin login (set local environment credentials)', 'POST', '/auth/login', 200, { body: { email: '{{adminEmail}}', password: '{{adminPassword}}' }, tests: [saveToken('adminToken')] });
add('06 List restaurants', 'GET', '/restaurants', 200, { tests: [
  "pm.test('Restaurants exist', () => pm.expect(pm.response.json().count).to.be.above(0));",
  "if (pm.response.json().data.length) pm.variables.set('restaurantId', pm.response.json().data[0]._id);",
  "pm.test('Restaurant fields', () => pm.expect(pm.response.json().data[0]).to.include.all.keys('name','address','tel','openTime','closeTime'));"
] });
add('07 Restaurant details', 'GET', '/restaurants/{{restaurantId}}', 200);
add('08 Unauthenticated reservation denied', 'POST', '/restaurants/{{restaurantId}}/reservations', 401, { body: { reservationDate: '2026-12-01' } });
for (let n = 1; n <= 3; n++) add(`09.${n} Reserve table ${n}`, 'POST', '/restaurants/{{restaurantId}}/reservations', 201,
  { ...owner, body: { reservationDate: `2026-12-0${n}` }, tests: [saveId(`reservation${n}`)] });
add('10 Fourth reservation rejected', 'POST', '/restaurants/{{restaurantId}}/reservations', 400, { ...owner, body: { reservationDate: '2026-12-04' } });
add('11 Owner list has three reservations', 'GET', '/reservations', 200, { ...owner, tests: ["pm.test('Three records', () => pm.expect(pm.response.json().count).to.eql(3));"] });
add('12 Other member list is private', 'GET', '/reservations', 200, { ...other, tests: ["pm.test('No other users records', () => pm.expect(pm.response.json().count).to.eql(0));"] });
add('13 Other member cannot read by ID', 'GET', '/reservations/{{reservation1}}', 403, other);
add('14 Other member cannot edit', 'PUT', '/reservations/{{reservation1}}', 403, { ...other, body: { reservationDate: '2026-12-05' } });
add('15 Other member cannot delete', 'DELETE', '/reservations/{{reservation1}}', 403, other);
add('16 Owner reads own reservation', 'GET', '/reservations/{{reservation1}}', 200, owner);
add('17 Owner edits own reservation', 'PUT', '/reservations/{{reservation1}}', 200, { ...owner, body: { reservationDate: '2026-12-05T18:30:00+07:00' } });
add('18 Ownership change rejected', 'PUT', '/reservations/{{reservation1}}', 400, { ...owner, body: { user: '{{ownerId}}' } });
add('19 Owner deletes one reservation', 'DELETE', '/reservations/{{reservation3}}', 200, owner);
add('20 Deletion allows rebooking', 'POST', '/restaurants/{{restaurantId}}/reservations', 201, { ...owner, body: { reservationDate: '2026-12-06' }, tests: [saveId('reservation3')] });
add('21 Admin sees owner reservation', 'GET', '/reservations', 200, { ...admin, tests: ["pm.test('Contains owner record', () => pm.expect(pm.response.json().data.some(r => r._id === pm.variables.get('reservation1'))).to.eql(true));"] });
add('22 Admin reads any reservation', 'GET', '/reservations/{{reservation1}}', 200, admin);
add('23 Admin edits any reservation', 'PUT', '/reservations/{{reservation1}}', 200, { ...admin, body: { reservationDate: '2026-12-07' } });
add('24 Admin deletes any reservation', 'DELETE', '/reservations/{{reservation1}}', 200, admin);
add('25 Deleted reservation is missing', 'GET', '/reservations/{{reservation1}}', 404, owner);
add('26 Cleanup owner reservation 2', 'DELETE', '/reservations/{{reservation2}}', 200, owner);
add('27 Cleanup owner reservation 3', 'DELETE', '/reservations/{{reservation3}}', 200, owner);
add('28 Cookie authentication', 'GET', '/auth/me', 200, { cookie: 'token={{ownerToken}}' });
add('29 Logout clears cookie', 'GET', '/auth/logout', 200, { cookie: 'token={{ownerToken}}', tests: [
  "pm.test('Cookie cleared', () => pm.expect(pm.response.headers.get('Set-Cookie')).to.include('token=;'));"
] });
add('30 No cookie after logout is unauthorized', 'GET', '/auth/me', 401);
add('31 Invalid calendar date rejected', 'POST', '/restaurants/{{restaurantId}}/reservations', 400, { ...owner, body: { reservationDate: '2026-02-30' } });
add('32 Cannot register as admin', 'POST', '/auth/register', 400, { body: { ...registration('blocked-{{runId}}@example.com'), role: 'admin' } });

// ---------- Additional requirements: menu, pre-orders, check-in codes, reviews ----------
const saveField = (name, field) => `if (pm.response.code < 300) pm.variables.set('${name}', pm.response.json().data.${field});`;
const expect = (label, expr) => `pm.test('${label}', () => pm.expect(${expr}).to.eql(true));`;
const json = 'pm.response.json()';
// Requirement 1: menu items
add('A01 Admin creates menu item', 'POST', '/restaurants/{{restaurantId}}/menu', 201, { ...admin,
  body: { name: 'Postman Pad Thai {{runId}}', description: 'Rice noodles', price: 120 }, tests: [saveId('menuItem1')] });
add('A02 Admin creates second menu item', 'POST', '/restaurants/{{restaurantId}}/menu', 201, { ...admin,
  body: { name: 'Postman Iced Tea {{runId}}', price: 45.5 }, tests: [saveId('menuItem2')] });
add('A03 Member cannot create menu item', 'POST', '/restaurants/{{restaurantId}}/menu', 403, { ...owner, body: { name: 'Blocked', price: 1 } });
add('A04 Invalid price rejected', 'POST', '/restaurants/{{restaurantId}}/menu', 400, { ...admin, body: { name: 'Bad price', price: -5 } });
add('A05 Member views active menu', 'GET', '/restaurants/{{restaurantId}}/menu', 200, { ...owner, tests: [
  expect('Contains new item', `${json}.data.some(i => i._id === pm.variables.get('menuItem1'))`)] });
add('A06 Menu requires login', 'GET', '/restaurants/{{restaurantId}}/menu', 401);
// Requirement 4 + 2: reservation for today with a check-in code, then a pre-order
add('A07 Owner reserves today', 'POST', '/restaurants/{{restaurantId}}/reservations', 201, { ...owner, body: { reservationDate: '{{today}}' }, tests: [
  saveId('todayReservation'), saveField('checkInCode', 'checkInCode'),
  expect('Status reserved', `${json}.data.status === 'reserved'`), expect('Has check-in code', `/^[A-F0-9]{10}$/.test(${json}.data.checkInCode)`)] });
add('A08 Admin cannot see check-in code', 'GET', '/reservations/{{todayReservation}}', 200, { ...admin, tests: [
  expect('Code hidden', `${json}.data.checkInCode === undefined`)] });
add('A09 Owner pre-orders 2 x item 1', 'POST', '/reservations/{{todayReservation}}/preorder/items', 201, { ...owner,
  body: { menuItem: '{{menuItem1}}', quantity: 2 }, tests: [expect('Total 240', `${json}.data.totalPrice === 240`)] });
add('A10 Admin raises item 1 price', 'PUT', '/menu-items/{{menuItem1}}', 200, { ...admin, body: { price: 150 } });
add('A11 Adding again keeps first unit price', 'POST', '/reservations/{{todayReservation}}/preorder/items', 201, { ...owner,
  body: { menuItem: '{{menuItem1}}', quantity: 1 }, tests: [expect('Unit price 120, quantity 3', `${json}.data.items[0].unitPrice === 120 && ${json}.data.items[0].quantity === 3`)] });
add('A12 Owner pre-orders 2 x item 2', 'POST', '/reservations/{{todayReservation}}/preorder/items', 201, { ...owner,
  body: { menuItem: '{{menuItem2}}', quantity: 2 }, tests: [expect('Total 451', `${json}.data.totalPrice === 451`)] });
add('A13 Zero quantity rejected', 'POST', '/reservations/{{todayReservation}}/preorder/items', 400, { ...owner, body: { menuItem: '{{menuItem1}}', quantity: 0 } });
add('A14 Other member cannot pre-order', 'POST', '/reservations/{{todayReservation}}/preorder/items', 403, { ...other, body: { menuItem: '{{menuItem1}}', quantity: 1 } });
add('A15 Owner sets item 1 quantity to 1', 'PUT', '/reservations/{{todayReservation}}/preorder/items/{{menuItem1}}', 200, { ...owner,
  body: { quantity: 1 }, tests: [expect('Total 211', `${json}.data.totalPrice === 211`)] });
add('A16 Admin deactivates item 2', 'PATCH', '/menu-items/{{menuItem2}}/deactivate', 200, { ...admin, tests: [expect('Inactive', `${json}.data.isActive === false`)] });
add('A17 Deactivated item cannot be added', 'POST', '/reservations/{{todayReservation}}/preorder/items', 400, { ...owner, body: { menuItem: '{{menuItem2}}', quantity: 1 } });
add('A18 Pre-order keeps deactivated item details', 'GET', '/reservations/{{todayReservation}}/preorder', 200, { ...owner, tests: [
  expect('Item 2 still listed', `${json}.data.items.some(i => i.menuItem === pm.variables.get('menuItem2') && i.unitPrice === 45.5)`)] });
add('A19 Owner removes item 2', 'DELETE', '/reservations/{{todayReservation}}/preorder/items/{{menuItem2}}', 200, { ...owner, tests: [
  expect('Total 120', `${json}.data.totalPrice === 120`)] });
add('A20 Admin views pre-orders by date', 'GET', '/preorders?date={{today}}', 200, { ...admin, tests: [
  expect('Contains reservation', `${json}.data.some(p => p.reservation._id === pm.variables.get('todayReservation'))`)] });
add('A21 Member cannot view pre-orders by date', 'GET', '/preorders?date={{today}}', 403, owner);
// Requirement 4: check-in flow
add('A22 Review before completion rejected', 'POST', '/reservations/{{todayReservation}}/review', 409, { ...owner, body: { rating: 5 } });
add('A23 Member cannot check in', 'POST', '/reservations/check-in', 403, { ...owner, body: { code: '{{checkInCode}}' } });
add('A24 Admin checks in with code', 'POST', '/reservations/check-in', 200, { ...admin, body: { code: '{{checkInCode}}' }, tests: [
  expect('Checked in', `${json}.data.status === 'checked-in'`)] });
add('A25 Reused code rejected', 'POST', '/reservations/check-in', 409, { ...admin, body: { code: '{{checkInCode}}' } });
add('A26 Pre-order locked after check-in', 'PUT', '/reservations/{{todayReservation}}/preorder/items/{{menuItem1}}', 409, { ...owner, body: { quantity: 2 } });
add('A27 Reservation locked after check-in', 'PUT', '/reservations/{{todayReservation}}', 409, { ...owner, body: { reservationDate: '{{today}}' } });
add('A28 Admin completes reservation', 'PATCH', '/reservations/{{todayReservation}}/complete', 200, { ...admin, tests: [
  expect('Completed', `${json}.data.status === 'completed'`)] });
add('A29 Completing twice rejected', 'PATCH', '/reservations/{{todayReservation}}/complete', 409, admin);
// Requirement 3: reviews
add('A30 Owner reviews completed reservation', 'POST', '/reservations/{{todayReservation}}/review', 201, { ...owner,
  body: { rating: 5, comment: 'Great food' }, tests: [saveId('reviewId')] });
add('A31 Second review rejected', 'POST', '/reservations/{{todayReservation}}/review', 409, { ...owner, body: { rating: 4 } });
add('A32 Invalid rating rejected', 'PUT', '/reviews/{{reviewId}}', 400, { ...owner, body: { rating: 6 } });
add('A33 Other member cannot edit review', 'PUT', '/reviews/{{reviewId}}', 403, { ...other, body: { rating: 1 } });
add('A34 Admin cannot delete review', 'DELETE', '/reviews/{{reviewId}}', 403, admin);
add('A35 Author edits review', 'PUT', '/reviews/{{reviewId}}', 200, { ...owner, body: { rating: 4 }, tests: [expect('Rating 4', `${json}.data.rating === 4`)] });
add('A36 Members see reviews and average', 'GET', '/restaurants/{{restaurantId}}/reviews', 200, { ...other, tests: [
  expect('Has average', `typeof ${json}.averageRating === 'number' && ${json}.data.some(r => r._id === pm.variables.get('reviewId'))`)] });
add('A37 Author deletes review', 'DELETE', '/reviews/{{reviewId}}', 200, owner);
// Requirement 4: deleted reservation's code is rejected; deleting cancels the pre-order
add('A38 Owner reserves again', 'POST', '/restaurants/{{restaurantId}}/reservations', 201, { ...owner, body: { reservationDate: '{{today}}' }, tests: [
  saveId('deletedReservation'), saveField('deletedCode', 'checkInCode')] });
add('A39 Owner deletes that reservation', 'DELETE', '/reservations/{{deletedReservation}}', 200, owner);
add('A40 Deleted reservation code rejected', 'POST', '/reservations/check-in', 404, { ...admin, body: { code: '{{deletedCode}}' } });
// Cleanup
add('A41 Cleanup completed reservation (admin)', 'DELETE', '/reservations/{{todayReservation}}', 200, admin);
add('A42 Cleanup deactivate menu item 1', 'PATCH', '/menu-items/{{menuItem1}}/deactivate', 200, admin);

const collection = {
  info: { name: 'Restaurant Reservation - Final Project', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description: 'Run the entire collection in order against a NEW final-project database after npm run seed and npm run create-admin. Set baseUrl/adminEmail/adminPassword locally. Creates two uniquely named test accounts per run; cleans their reservations and reviews. Does not delete accounts; test menu items are deactivated (not deleted). About 80 requests: the API allows 100 per 10 minutes, so wait before re-running. Cookies disabled except explicitly supplied test headers. Each request asserts response time <3000ms. Tokens use run-local variables and are not exported.' },
  event: [
    { listen: 'prerequest', script: { type: 'text/javascript', exec: [
      "if (!pm.variables.get('runId')) {",
      "  const runId = Date.now().toString() + Math.random().toString(16).slice(2);",
      "  pm.variables.set('runId', runId);",
      "  pm.variables.set('ownerEmail', 'owner-' + runId + '@example.com');",
      "  pm.variables.set('otherEmail', 'other-' + runId + '@example.com');",
      "  if (!pm.variables.get('testPassword')) pm.variables.set('testPassword', pm.variables.replaceIn('{{$guid}}') + '-Test123!');",
      "  // Today's date in Bangkok time, used for check-in (allowed only on the reservation date).",
      "  pm.variables.set('today', new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10));",
      "}"
    ] } },
    { listen: 'test', script: { type: 'text/javascript', exec: ["pm.test('Response under 3 seconds', () => pm.expect(pm.response.responseTime).to.be.below(3000));"] } }
  ], item: items
};
const environment = { name: 'Restaurant Reservation - Local', values: [
  { key: 'baseUrl', value: 'http://localhost:5000/api/v1', enabled: true },
  { key: 'adminEmail', value: '', enabled: true },
  { key: 'adminPassword', value: '', type: 'secret', enabled: true }
], _postman_variable_scope: 'environment' };
function writePostman() {
  const dir = path.join(__dirname, '../postman'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'RestaurantReservation.postman_collection.json'), JSON.stringify(collection, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'Local.postman_environment.json'), JSON.stringify(environment, null, 2) + '\n');
}
if (require.main === module) { writePostman(); console.log('Postman collection and blank local environment generated.'); }
module.exports = { collection, writePostman };
