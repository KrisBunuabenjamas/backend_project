// Builds postman/Demo.postman_collection.json: a short, click-through demo of the
// additional requirements. Uses the same environment (baseUrl, adminEmail, adminPassword).
const fs = require('node:fs');
const path = require('node:path');
const items = [];
function add(name, method, route, { auth, body, tests = [], description } = {}) {
  items.push({
    name,
    request: {
      method, url: '{{baseUrl}}' + route, description,
      header: [{ key: 'Content-Type', value: 'application/json' }],
      auth: auth ? { type: 'bearer', bearer: [{ key: 'token', value: `{{${auth}}}`, type: 'string' }] } : { type: 'noauth' },
      ...(body ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } } } : {})
    },
    protocolProfileBehavior: { disableCookies: true },
    event: tests.length ? [{ listen: 'test', script: { type: 'text/javascript', exec: tests } }] : []
  });
}
const save = (name, expr) => `if (pm.response.code < 300) pm.collectionVariables.set('${name}', ${expr});`;
const status = code => `pm.test('Status ${code}', () => pm.response.to.have.status(${code}));`;
const R = '700000000000000000000001';

add('1. Admin logs in', 'POST', '/auth/login', { body: { email: '{{adminEmail}}', password: '{{adminPassword}}' },
  tests: [status(200), save('adminToken', 'pm.response.json().token')] });
add('2. Customer registers', 'POST', '/auth/register', { body: { name: 'Demo Customer', tel: '0812345678', email: 'customer-{{demoRun}}@example.com', password: 'Demo-pass-123' },
  tests: [status(201), save('userToken', 'pm.response.json().token')] });
add('3. [Req 1] Admin adds Som Tum 80 baht to the menu', 'POST', `/restaurants/${R}/menu`, { auth: 'adminToken',
  body: { name: 'Som Tum', description: 'Spicy papaya salad', price: 80 }, tests: [status(201), save('menuItemId', 'pm.response.json().data._id')] });
add('4. [Req 1] Customer cannot add menu items', 'POST', `/restaurants/${R}/menu`, { auth: 'userToken', body: { name: 'Hack', price: 1 }, tests: [status(403)] });
add('5. [Req 1] Customer views the active menu', 'GET', `/restaurants/${R}/menu`, { auth: 'userToken', tests: [status(200)] });
add('6. [Req 4] Customer books for today and receives a check-in code', 'POST', `/restaurants/${R}/reservations`, { auth: 'userToken',
  body: { reservationDate: '{{today}}' }, tests: [status(201), save('reservationId', 'pm.response.json().data._id'), save('checkInCode', 'pm.response.json().data.checkInCode')] });
add('7. [Req 2] Customer pre-orders 2 x Som Tum (total 160)', 'POST', '/reservations/{{reservationId}}/preorder/items', { auth: 'userToken',
  body: { menuItem: '{{menuItemId}}', quantity: 2 }, tests: [status(201), "pm.test('Total 160', () => pm.expect(pm.response.json().data.totalPrice).to.eql(160));"] });
add('8. [Req 2] Quantity must be a positive integer', 'POST', '/reservations/{{reservationId}}/preorder/items', { auth: 'userToken',
  body: { menuItem: '{{menuItemId}}', quantity: 0 }, tests: [status(400)] });
add('9. [Req 1] Admin raises Som Tum to 120 baht', 'PUT', '/menu-items/{{menuItemId}}', { auth: 'adminToken', body: { price: 120 }, tests: [status(200)] });
add('10. [Req 2] Pre-order still uses the original 80 baht', 'GET', '/reservations/{{reservationId}}/preorder', { auth: 'userToken',
  tests: [status(200), "pm.test('Unit price kept at 80', () => pm.expect(pm.response.json().data.items[0].unitPrice).to.eql(80));"] });
add('11. [Req 2] Admin views pre-orders for today', 'GET', '/preorders?date={{today}}', { auth: 'adminToken', tests: [status(200)] });
add('12. [Req 3] Review before dining is rejected', 'POST', '/reservations/{{reservationId}}/review', { auth: 'userToken', body: { rating: 5 }, tests: [status(409)] });
add('13. [Req 4] Admin checks in with the code', 'POST', '/reservations/check-in', { auth: 'adminToken', body: { code: '{{checkInCode}}' },
  tests: [status(200), "pm.test('Checked in', () => pm.expect(pm.response.json().data.status).to.eql('checked-in'));"] });
add('14. [Req 4] Same code again is rejected (single-use)', 'POST', '/reservations/check-in', { auth: 'adminToken', body: { code: '{{checkInCode}}' }, tests: [status(409)] });
add('15. [Req 2] Pre-order is locked after check-in', 'PUT', '/reservations/{{reservationId}}/preorder/items/{{menuItemId}}', { auth: 'userToken', body: { quantity: 3 }, tests: [status(409)] });
add('16. [Req 4] Admin marks the reservation completed', 'PATCH', '/reservations/{{reservationId}}/complete', { auth: 'adminToken',
  tests: [status(200), "pm.test('Completed', () => pm.expect(pm.response.json().data.status).to.eql('completed'));"] });
add('17. [Req 3] Customer reviews 5 stars', 'POST', '/reservations/{{reservationId}}/review', { auth: 'userToken',
  body: { rating: 5, comment: 'Som Tum was amazing!' }, tests: [status(201), save('reviewId', 'pm.response.json().data._id')] });
add('18. [Req 3] Only one review per reservation', 'POST', '/reservations/{{reservationId}}/review', { auth: 'userToken', body: { rating: 4 }, tests: [status(409)] });
add('19. [Req 3] Admin cannot edit the customer\'s review', 'PUT', '/reviews/{{reviewId}}', { auth: 'adminToken', body: { rating: 1 }, tests: [status(403)] });
add('20. [Req 3] Restaurant reviews with average rating', 'GET', `/restaurants/${R}/reviews`, { auth: 'userToken', tests: [status(200)] });
add('21. [Req 1] Admin deactivates Som Tum', 'PATCH', '/menu-items/{{menuItemId}}/deactivate', { auth: 'adminToken', tests: [status(200)] });
add('22. [Req 1] Pre-order still shows Som Tum after deactivation', 'GET', '/reservations/{{reservationId}}/preorder', { auth: 'adminToken',
  tests: [status(200), "pm.test('Som Tum kept', () => pm.expect(pm.response.json().data.items[0].name).to.eql('Som Tum'));"] });

const collection = {
  info: { name: 'Restaurant Reservation - Demo (Additional Requirements)', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description: 'Click Send on each request from top to bottom. Tokens, IDs and the check-in code are saved automatically. Use the "Restaurant Reservation - Local" environment with adminEmail/adminPassword set. Run after npm run seed (uses demo restaurant 700000000000000000000001).' },
  event: [{ listen: 'prerequest', script: { type: 'text/javascript', exec: [
    "if (!pm.collectionVariables.get('demoRun') || pm.info.requestName.startsWith('2.')) pm.collectionVariables.set('demoRun', Date.now().toString());",
    "pm.collectionVariables.set('today', new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10));"
  ] } }],
  variable: [], item: items
};
fs.writeFileSync(path.join(__dirname, '../postman/Demo.postman_collection.json'), JSON.stringify(collection, null, 2) + '\n');
console.log(`Demo collection generated (${items.length} requests).`);
