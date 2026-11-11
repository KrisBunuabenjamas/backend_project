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

const collection = {
  info: { name: 'Restaurant Reservation - Final Project', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description: 'Run the entire collection in order against a NEW final-project database after npm run seed and npm run create-admin. Set baseUrl/adminEmail/adminPassword locally. Creates two uniquely named test accounts per run; cleans their reservations. Does not delete accounts. Cookies disabled except explicitly supplied test headers. Each request asserts response time <3000ms. Tokens use run-local variables and are not exported.' },
  event: [
    { listen: 'prerequest', script: { type: 'text/javascript', exec: [
      "if (!pm.variables.get('runId')) {",
      "  const runId = Date.now().toString() + Math.random().toString(16).slice(2);",
      "  pm.variables.set('runId', runId);",
      "  pm.variables.set('ownerEmail', 'owner-' + runId + '@example.com');",
      "  pm.variables.set('otherEmail', 'other-' + runId + '@example.com');",
      "  if (!pm.variables.get('testPassword')) pm.variables.set('testPassword', pm.variables.replaceIn('{{$guid}}') + '-Test123!');",
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
