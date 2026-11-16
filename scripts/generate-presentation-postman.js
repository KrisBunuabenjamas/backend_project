const fs = require('node:fs');
const path = require('node:path');
const folders = [];
let current;
function stage(name, description) { current = { name, description, item: [] }; folders.push(current); }
function request(name, method, route, status, { token, cookie, body, tests = [] } = {}) {
  const header = [{ key: 'Content-Type', value: 'application/json' }];
  if (token) header.push({ key: 'Authorization', value: `Bearer {{${token}}}` });
  if (cookie) header.push({ key: 'Cookie', value: `token={{${cookie}}}` });
  const events = [];
  if (body) events.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: [
    `const payload = ${JSON.stringify(body)};`,
    'for (const key of Object.keys(payload)) if (typeof payload[key] === "string") payload[key] = pm.variables.replaceIn(payload[key]);',
    'pm.variables.set("requestBody", JSON.stringify(payload));'
  ] } });
  events.push({ listen: 'test', script: { type: 'text/javascript', exec: [
    `pm.test('HTTP ${status}', () => pm.response.to.have.status(${status}));`,
    `pm.test('success flag', () => pm.expect(pm.response.json().success).to.eql(${status < 400}));`,
    ...tests
  ] } });
  current.item.push({ name, protocolProfileBehavior: { disableCookies: true }, request: {
    method, auth: { type: 'noauth' }, header, url: '{{baseUrl}}' + route,
    ...(body ? { body: { mode: 'raw', raw: '{{requestBody}}', options: { raw: { language: 'json' } } } } : {})
  }, event: events });
}
const saveToken = key => `if (pm.response.code < 300) pm.variables.set('${key}', pm.response.json().token);`;
const saveId = key => `if (pm.response.code < 300) pm.variables.set('${key}', pm.response.json().data._id);`;
const owner = { token: 'ownerToken' }, other = { token: 'otherToken' }, admin = { token: 'adminToken' };
const registration = { name: 'Presentation Member', tel: '0812345678', email: '{{ownerEmail}}', password: '{{testPassword}}' };
const booking = n => ({ reservationDate: `2026-12-0${n}T18:30:00+07:00` });

stage('01 User registration and validation', 'Step 1: invalid payloads must fail; valid registration creates an ordinary user.');
const { tel, ...withoutTel } = registration;
request('01.1 Missing telephone rejected', 'POST', '/auth/register', 400, { body: withoutTel });
request('01.2 Invalid email rejected', 'POST', '/auth/register', 400, { body: { ...registration, email: 'not-an-email' } });
request('01.3 Register member', 'POST', '/auth/register', 201, { body: registration, tests: [saveToken('ownerToken')] });
request('01.4 Duplicate email rejected', 'POST', '/auth/register', 400, { body: registration });
request('01.5 Public admin registration rejected', 'POST', '/auth/register', 400, { body: { ...registration, email: 'blocked-{{runId}}@example.com', role: 'admin' } });

stage('02 User login', 'Step 2: reject a wrong password, log in, and check the current user.');
request('02.1 Wrong password rejected', 'POST', '/auth/login', 401, { body: { email: '{{ownerEmail}}', password: 'wrong-{{testPassword}}' } });
request('02.2 Login member', 'POST', '/auth/login', 200, { body: { email: '{{ownerEmail}}', password: '{{testPassword}}' }, tests: [saveToken('ownerToken')] });
request('02.3 Current user is an ordinary member', 'GET', '/auth/me', 200, { ...owner, tests: [saveId('ownerId'),
  "pm.test('Role is user', () => pm.expect(pm.response.json().data.role).to.eql('user'));",
  "pm.test('Password not exposed', () => pm.expect(pm.response.json().data).not.to.have.property('password'));"
] });

stage('03 User view product - restaurants', 'Step 3: product in the presentation checklist means restaurant in Project 5.');
request('03.1 List restaurants', 'GET', '/restaurants', 200, { tests: [
  "pm.test('At least two demo restaurants', () => pm.expect(pm.response.json().data.length).to.be.at.least(2));",
  "if (pm.response.json().data.length >= 2) { pm.variables.set('restaurantId', pm.response.json().data[0]._id); pm.variables.set('secondRestaurantId', pm.response.json().data[1]._id); }",
  "pm.test('Restaurant information complete', () => pm.expect(pm.response.json().data[0]).to.include.all.keys('name','address','tel','openTime','closeTime'));"
] });
request('03.2 View selected restaurant', 'GET', '/restaurants/{{restaurantId}}', 200);

stage('04 User create booking and condition checks', 'Step 4: authentication, calendar validation and maximum three records across dates.');
request('04.1 Booking without login rejected', 'POST', '/restaurants/{{restaurantId}}/reservations', 401, { body: booking(1) });
request('04.2 Invalid calendar date rejected', 'POST', '/restaurants/{{restaurantId}}/reservations', 400, { ...owner, body: { reservationDate: '2026-02-30' } });
request('04.3 Create member booking A', 'POST', '/restaurants/{{restaurantId}}/reservations', 201, { ...owner, body: booking(1), tests: [saveId('memberBookingId'),
  "pm.test('Owner comes from token', () => pm.expect(pm.response.json().data.user).to.eql(pm.variables.get('ownerId')));",
  "pm.test('Internal slot hidden', () => pm.expect(pm.response.json().data).not.to.have.property('slot'));"
] });
request('04.4 Create member booking B for admin demo', 'POST', '/restaurants/{{restaurantId}}/reservations', 201, { ...owner, body: booking(2), tests: [saveId('adminTargetId')] });
request('04.5 Create member booking C', 'POST', '/restaurants/{{secondRestaurantId}}/reservations', 201, { ...owner, body: booking(3), tests: [saveId('quotaBookingId')] });
request('04.6 Fourth booking rejected', 'POST', '/restaurants/{{restaurantId}}/reservations', 400, { ...owner, body: booking(4) });

stage('05 User view own booking and privacy', 'Step 5: the owner can view three bookings; another member cannot access them.');
request('05.1 Owner sees three bookings', 'GET', '/reservations', 200, { ...owner, tests: [
  "pm.test('Owner has exactly three', () => pm.expect(pm.response.json().count).to.eql(3));",
  "pm.test('All belong to owner', () => pm.expect(pm.response.json().data.every(r => r.user === pm.variables.get('ownerId'))).to.eql(true));",
  "pm.test('Restaurant populated', () => pm.expect(pm.response.json().data[0].restaurant).to.include.all.keys('name','address','tel','openTime','closeTime'));"
] });
request('05.2 Owner reads booking A', 'GET', '/reservations/{{memberBookingId}}', 200, owner);
request('05.3 Register second member for permission checks', 'POST', '/auth/register', 201, { body: { ...registration, name: 'Other Presentation Member', email: '{{otherEmail}}' }, tests: [saveToken('otherToken')] });
request('05.4 Other member list is private', 'GET', '/reservations', 200, { ...other, tests: ["pm.test('Other member sees zero', () => pm.expect(pm.response.json().count).to.eql(0));"] });
request('05.5 Other member cannot read owner booking', 'GET', '/reservations/{{memberBookingId}}', 403, other);
request('05.6 Other member cannot update owner booking', 'PUT', '/reservations/{{memberBookingId}}', 403, { ...other, body: booking(5) });
request('05.7 Other member cannot delete owner booking', 'DELETE', '/reservations/{{memberBookingId}}', 403, other);

stage('06 User update own booking', 'Step 6: update date and verify saved data; owner reassignment is forbidden.');
request('06.1 Owner updates booking A', 'PUT', '/reservations/{{memberBookingId}}', 200, { ...owner, body: { reservationDate: '2026-12-02T19:00:00+07:00' }, tests: [
  "pm.test('Updated date in UTC', () => pm.expect(pm.response.json().data.reservationDate).to.eql('2026-12-02T12:00:00.000Z'));"
] });
request('06.2 Read saved update', 'GET', '/reservations/{{memberBookingId}}', 200, { ...owner, tests: [
  "pm.test('Saved date verified', () => pm.expect(pm.response.json().data.reservationDate).to.eql('2026-12-02T12:00:00.000Z'));"
] });
request('06.3 Changing owner rejected', 'PUT', '/reservations/{{memberBookingId}}', 400, { ...owner, body: { user: '{{ownerId}}' } });

stage('07 User delete own booking', 'Step 7: delete A only. Keep B and C owned by this member for admin demonstration.');
request('07.1 Owner deletes booking A', 'DELETE', '/reservations/{{memberBookingId}}', 200, owner);
request('07.2 Deleted booking A is missing', 'GET', '/reservations/{{memberBookingId}}', 404, owner);
request('07.3 Two member bookings remain for admin demo', 'GET', '/reservations', 200, { ...owner, tests: [
  "pm.test('Two member records remain', () => pm.expect(pm.response.json().count).to.eql(2));",
  "pm.test('Admin target still exists', () => pm.expect(pm.response.json().data.some(r => r._id === pm.variables.get('adminTargetId'))).to.eql(true));"
] });

stage('08 User logout', 'Step 8: cookie login works; logout clears cookie; a subsequent request with no credentials is unauthorized. Copied Bearer JWTs are not revoked.');
request('08.1 Cookie identifies the member', 'GET', '/auth/me', 200, { cookie: 'ownerToken' });
request('08.2 Logout clears token cookie', 'GET', '/auth/logout', 200, { cookie: 'ownerToken', tests: [
  "pm.test('Set-Cookie clears token', () => pm.expect(pm.response.headers.get('Set-Cookie')).to.include('token=;'));",
  "pm.variables.unset('ownerToken');"
] });
request('08.3 No credentials after logout', 'GET', '/auth/me', 401);

stage('09 Admin login', 'Step 9: use local admin environment credentials, not the Atlas database user credentials.');
request('09.1 Login admin', 'POST', '/auth/login', 200, { body: { email: '{{adminEmail}}', password: '{{adminPassword}}' }, tests: [saveToken('adminToken')] });
request('09.2 Current user has admin role', 'GET', '/auth/me', 200, { ...admin, tests: [
  "pm.test('Role is admin', () => pm.expect(pm.response.json().data.role).to.eql('admin'));"
] });

stage('10 Admin view any booking', 'Step 10: admin sees and reads booking B owned by the ordinary member.');
request('10.1 Admin lists member bookings', 'GET', '/reservations', 200, { ...admin, tests: [
  "pm.test('Contains member booking B', () => pm.expect(pm.response.json().data.some(r => r._id === pm.variables.get('adminTargetId') && r.user === pm.variables.get('ownerId'))).to.eql(true));"
] });
request('10.2 Admin reads booking B', 'GET', '/reservations/{{adminTargetId}}', 200, { ...admin, tests: [
  "pm.test('Target owned by ordinary member', () => pm.expect(pm.response.json().data.user).to.eql(pm.variables.get('ownerId')));"
] });

stage('11 Admin update any booking', 'Step 11: change another user\'s date and restaurant, then verify persisted values.');
request('11.1 Admin updates member booking B', 'PUT', '/reservations/{{adminTargetId}}', 200, { ...admin, body: { reservationDate: '2026-12-07T18:30:00+07:00', restaurant: '{{secondRestaurantId}}' }, tests: [
  "pm.test('Owner preserved', () => pm.expect(pm.response.json().data.user).to.eql(pm.variables.get('ownerId')));"
] });
request('11.2 Verify admin update', 'GET', '/reservations/{{adminTargetId}}', 200, { ...admin, tests: [
  "pm.test('Admin date saved', () => pm.expect(pm.response.json().data.reservationDate).to.eql('2026-12-07T11:30:00.000Z'));",
  "pm.test('Admin restaurant saved', () => pm.expect(pm.response.json().data.restaurant._id).to.eql(pm.variables.get('secondRestaurantId')));"
] });

stage('12 Admin delete any booking', 'Step 12: delete member booking B, verify 404, then remove only booking C created by this run. Test users are retained.');
request('12.1 Admin deletes member booking B', 'DELETE', '/reservations/{{adminTargetId}}', 200, admin);
request('12.2 Deleted booking B returns 404', 'GET', '/reservations/{{adminTargetId}}', 404, admin);
request('12.3 Cleanup booking C from this run', 'DELETE', '/reservations/{{quotaBookingId}}', 200, admin);
request('12.4 Verify this run has no bookings left', 'GET', '/reservations', 200, { ...admin, tests: [
  "pm.test('Demo owner has no reservations left', () => pm.expect(pm.response.json().data.filter(r => r.user === pm.variables.get('ownerId')).length).to.eql(0));"
] });

const collection = {
  info: { name: 'Restaurant Final - Presentation Steps 01-12', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description: 'Run the FULL collection in order, one iteration. Mirrors presentation checklist steps 1-12. Runtime variables keep tokens and test passwords local to the run. Requires seeded restaurants and an existing application admin. Creates two unique ordinary test users per run; deletes only its own three demo reservations. Leaves all pre-existing users and bookings intact. Logout clears cookie, not copied Bearer JWTs.' },
  event: [
    { listen: 'prerequest', script: { type: 'text/javascript', exec: [
      "if (!pm.variables.get('runId')) {",
      "const id = Date.now().toString() + Math.random().toString(16).slice(2);",
      "pm.variables.set('runId', id);",
      "pm.variables.set('ownerEmail', 'presentation-owner-' + id + '@example.com');",
      "pm.variables.set('otherEmail', 'presentation-other-' + id + '@example.com');",
      "pm.variables.set('testPassword', pm.variables.replaceIn('{{$guid}}') + '-Demo1!');",
      "}"
    ] } },
    { listen: 'test', script: { type: 'text/javascript', exec: ["pm.test('Response under 3 seconds', () => pm.expect(pm.response.responseTime).to.be.below(3000));"] } }
  ], item: folders
};
const environment = { name: 'Restaurant Final - Presentation Local', values: [
  { key: 'baseUrl', value: 'http://localhost:5000/api/v1', enabled: true },
  { key: 'adminEmail', value: '', enabled: true },
  { key: 'adminPassword', value: '', type: 'secret', enabled: true }
], _postman_variable_scope: 'environment' };
function write() {
  const dir = path.join(__dirname, '../postman');
  fs.writeFileSync(path.join(dir, 'Presentation.postman_collection.json'), JSON.stringify(collection, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'Presentation.postman_environment.json'), JSON.stringify(environment, null, 2) + '\n');
  console.log(`Presentation collection: ${folders.length} stages, ${folders.reduce((n,f)=>n+f.item.length,0)} requests; blank credentials.`);
}
if (require.main === module) write();
module.exports = { collection, environment, write };
