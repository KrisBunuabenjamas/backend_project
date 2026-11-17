const json = schema => ({ 'application/json': { schema } });
const string = { type: 'string' };
const id = { type: 'string', pattern: '^[a-fA-F0-9]{24}$', example: '700000000000000000000001' };
const date = { type: 'string', description: 'ISO date YYYY-MM-DD (UTC midnight), or ISO date-time with explicit timezone', example: '2026-12-01T18:30:00+07:00' };
const body = (properties, required) => ({ required: true, content: json({ type: 'object', additionalProperties: false, properties,
  ...(required.length ? { required } : { minProperties: 1 }) }) });
const parameter = name => ({ name, in: 'path', required: true, schema: id });
const response = (description, schema) => ({ description, ...(schema ? { content: json(schema) } : {}) });
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const dataResponse = (name, list = false) => ({ type: 'object', properties: {
  success: { type: 'boolean' }, ...(list ? { count: { type: 'integer' } } : {}),
  data: list ? { type: 'array', items: ref(name) } : ref(name)
} });
function operation(tag, summary, { private: isPrivate = false, invalidCredentials = false, conflict = false, parameters, requestBody, status = 200, schema, description } = {}) {
  return { tags: [tag], summary, ...(description ? { description } : {}),
    security: isPrivate ? [{ bearerAuth: [] }, { cookieAuth: [] }] : [],
    ...(parameters ? { parameters } : {}), ...(requestBody ? { requestBody } : {}),
    responses: { [status]: response('Success', schema), 400: response('Invalid input / maximum 3 reservations reached', ref('Error')),
      ...(isPrivate || invalidCredentials ? { 401: response('Missing or invalid credentials', ref('Error')) } : {}),
      ...(isPrivate ? { 403: response('Permission denied', ref('Error')) } : {}),
      404: response('Resource not found', ref('Error')),
      ...(conflict ? { 409: response('Conflict with the current status (e.g. already checked in, code already used, duplicate review)', ref('Error')) } : {}),
      429: response('Too many requests', ref('Error')), 500: response('Server error', ref('Error')) }
  };
}
module.exports = {
  openapi: '3.0.3', info: { title: 'Restaurant Reservation API', version: '1.0.0',
    description: 'SW Development final project #5. One reservation represents one table; maximum 3 active (not completed) records per user across all dates and restaurants. Owners access their own records; admins can manage all records. Additional features: menu items, pre-orders, reviews and check-in codes.' },
  servers: [{ url: '/api/v1', description: 'Current server' }],
  tags: [{ name: 'Auth' }, { name: 'Restaurants' }, { name: 'Reservations' }, { name: 'Check-in' }, { name: 'Menu' }, { name: 'Pre-orders' }, { name: 'Reviews' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, cookieAuth: { type: 'apiKey', in: 'cookie', name: 'token' } },
    schemas: {
      Error: { type: 'object', properties: { success: { type: 'boolean', example: false }, message: string } },
      Token: { type: 'object', properties: { success: { type: 'boolean' }, token: string } },
      Empty: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object' } } },
      User: { type: 'object', properties: { _id: id, name: string, tel: string, email: { type: 'string', format: 'email' }, role: { type: 'string', enum: ['user', 'admin'] } } },
      Restaurant: { type: 'object', properties: { _id: id, name: string, address: string, tel: string,
        openTime: { type: 'string', example: '10:00' }, closeTime: { type: 'string', example: '22:00' } } },
      Reservation: { type: 'object', properties: { _id: id, reservationDate: { type: 'string', format: 'date-time' }, user: id,
        restaurant: { oneOf: [id, ref('Restaurant')] }, status: { type: 'string', enum: ['reserved', 'checked-in', 'completed'] },
        checkInCode: { type: 'string', example: '3F9A0C12BE', description: 'Single-use code; returned only to the reservation owner' },
        checkedInAt: { type: 'string', format: 'date-time' }, completedAt: { type: 'string', format: 'date-time' },
        createdAt: { type: 'string', format: 'date-time' } } },
      MenuItem: { type: 'object', properties: { _id: id, restaurant: id, name: string, description: string, price: { type: 'number', example: 120 },
        availableForPreorder: { type: 'boolean' }, isActive: { type: 'boolean' }, deactivatedAt: { type: 'string', format: 'date-time' } } },
      PreOrder: { type: 'object', properties: { _id: id, reservation: { oneOf: [id, ref('Reservation')] }, user: { oneOf: [id, ref('User')] },
        restaurant: { oneOf: [id, ref('Restaurant')] }, status: { type: 'string', enum: ['active', 'cancelled'] }, totalPrice: { type: 'number' },
        items: { type: 'array', items: { type: 'object', properties: { menuItem: id, name: string,
          unitPrice: { type: 'number', description: 'Price when the item was first added' }, quantity: { type: 'integer', minimum: 1, maximum: 100 } } } } } },
      Review: { type: 'object', properties: { _id: id, reservation: id, restaurant: id, user: { oneOf: [id, ref('User')] },
        rating: { type: 'integer', minimum: 1, maximum: 5 }, comment: string, createdAt: { type: 'string', format: 'date-time' } } },
      ReviewList: { type: 'object', properties: { success: { type: 'boolean' }, count: { type: 'integer' },
        averageRating: { type: 'number', nullable: true, example: 4.5 }, data: { type: 'array', items: ref('Review') } } },
      PreOrderList: { type: 'object', properties: { success: { type: 'boolean' }, date: string, count: { type: 'integer' },
        data: { type: 'array', items: ref('PreOrder') } } }
    }
  },
  paths: {
    '/auth/register': { post: operation('Auth', 'Register a regular user', { status: 201, schema: ref('Token'),
      requestBody: body({ name: string, tel: string, email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 6, format: 'password', description: 'At most 72 UTF-8 bytes (bcrypt limit)' } }, ['name', 'tel', 'email', 'password']) }) },
    '/auth/login': { post: operation('Auth', 'Login with email and password', { schema: ref('Token'), invalidCredentials: true,
      requestBody: body({ email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password' } }, ['email', 'password']) }) },
    '/auth/logout': { get: operation('Auth', 'Clear the authentication cookie', { schema: ref('Empty'),
      description: 'Course-style stateless logout. Clears the HttpOnly cookie; copied Bearer tokens remain valid until expiry and must be removed from Postman manually.' }) },
    '/auth/me': { get: operation('Auth', 'Get your profile', { private: true, schema: dataResponse('User') }) },
    '/restaurants': { get: operation('Restaurants', 'List restaurants', { schema: dataResponse('Restaurant', true) }) },
    '/restaurants/{id}': { get: operation('Restaurants', 'Get restaurant details', { parameters: [parameter('id')], schema: dataResponse('Restaurant') }) },
    '/restaurants/{restaurantId}/reservations': { post: operation('Reservations', 'Reserve one table for yourself (maximum 3)', { private: true, status: 201,
      parameters: [parameter('restaurantId')], requestBody: body({ reservationDate: date }, ['reservationDate']), schema: dataResponse('Reservation') }) },
    '/reservations': { get: operation('Reservations', 'List your reservations (admin: all reservations)', { private: true, schema: dataResponse('Reservation', true) }) },
    '/reservations/{id}': {
      get: operation('Reservations', 'Get a reservation (owner or admin)', { private: true, parameters: [parameter('id')], schema: dataResponse('Reservation') }),
      put: operation('Reservations', 'Edit date and/or restaurant (owner or admin)', { private: true, conflict: true, parameters: [parameter('id')],
        requestBody: body({ reservationDate: date, restaurant: id }, []), schema: dataResponse('Reservation'), description: 'At least one field is required. Ownership cannot be reassigned.' }),
      delete: operation('Reservations', 'Delete a reservation (owner or admin)', { private: true, conflict: true, parameters: [parameter('id')], schema: ref('Empty'),
        description: 'Owners may delete only reservations that are not yet checked in. Deleting cancels the pre-order and invalidates the check-in code.' })
    },
    '/reservations/check-in': { post: operation('Check-in', 'Validate a check-in code on the reservation date (admin)', { private: true, conflict: true,
      requestBody: body({ code: { type: 'string', example: '3F9A0C12BE' } }, ['code']), schema: dataResponse('Reservation'),
      description: 'reserved -> checked-in. Rejects used codes (409), codes of deleted reservations (404) and other dates (400). Dates use Bangkok time.' }) },
    '/reservations/{id}/complete': { patch: operation('Check-in', 'Mark a checked-in reservation completed (admin)', { private: true, conflict: true,
      parameters: [parameter('id')], schema: dataResponse('Reservation'), description: 'checked-in -> completed. Frees the slot toward the 3-reservation limit.' }) },
    '/restaurants/{restaurantId}/menu': {
      get: operation('Menu', 'List active menu items (admin: all items)', { private: true, parameters: [parameter('restaurantId')], schema: dataResponse('MenuItem', true) }),
      post: operation('Menu', 'Create a menu item (admin)', { private: true, status: 201, parameters: [parameter('restaurantId')], schema: dataResponse('MenuItem'),
        requestBody: body({ name: string, description: string, price: { type: 'number', minimum: 0 }, availableForPreorder: { type: 'boolean' } }, ['name', 'price']) })
    },
    '/menu-items/{id}': {
      get: operation('Menu', 'Get a menu item', { private: true, parameters: [parameter('id')], schema: dataResponse('MenuItem') }),
      put: operation('Menu', 'Update a menu item (admin)', { private: true, parameters: [parameter('id')], schema: dataResponse('MenuItem'),
        requestBody: body({ name: string, description: string, price: { type: 'number', minimum: 0 }, availableForPreorder: { type: 'boolean' } }, []) })
    },
    '/menu-items/{id}/deactivate': { patch: operation('Menu', 'Deactivate a menu item (admin)', { private: true, parameters: [parameter('id')], schema: dataResponse('MenuItem'),
      description: 'Soft delete: hidden from members; existing pre-orders keep the item name and price.' }) },
    '/reservations/{id}/preorder': { get: operation('Pre-orders', 'Get the pre-order of a reservation (owner or admin)', { private: true,
      parameters: [parameter('id')], schema: dataResponse('PreOrder') }) },
    '/reservations/{id}/preorder/items': { post: operation('Pre-orders', 'Add a menu item to your pre-order (owner, before check-in)', { private: true, conflict: true, status: 201,
      parameters: [parameter('id')], schema: dataResponse('PreOrder'), requestBody: body({ menuItem: id, quantity: { type: 'integer', minimum: 1, maximum: 100 } }, ['menuItem', 'quantity']),
      description: 'Adding an item already in the pre-order increases its quantity and keeps the original unit price.' }) },
    '/reservations/{id}/preorder/items/{menuItemId}': {
      put: operation('Pre-orders', 'Set the quantity of a pre-ordered item (owner, before check-in)', { private: true, conflict: true,
        parameters: [parameter('id'), parameter('menuItemId')], schema: dataResponse('PreOrder'), requestBody: body({ quantity: { type: 'integer', minimum: 1, maximum: 100 } }, ['quantity']) }),
      delete: operation('Pre-orders', 'Remove an item from your pre-order (owner, before check-in)', { private: true, conflict: true,
        parameters: [parameter('id'), parameter('menuItemId')], schema: dataResponse('PreOrder') })
    },
    '/preorders': { get: operation('Pre-orders', 'List pre-orders by reservation date (admin)', { private: true, schema: ref('PreOrderList'),
      parameters: [{ name: 'date', in: 'query', required: true, schema: { type: 'string', format: 'date', example: '2026-12-01' }, description: 'Bangkok calendar day' }] }) },
    '/reservations/{id}/review': { post: operation('Reviews', 'Review your completed reservation (one per reservation)', { private: true, conflict: true, status: 201,
      parameters: [parameter('id')], schema: dataResponse('Review'), requestBody: body({ rating: { type: 'integer', minimum: 1, maximum: 5 }, comment: string }, ['rating']) }) },
    '/restaurants/{restaurantId}/reviews': { get: operation('Reviews', 'List reviews with the average rating', { private: true,
      parameters: [parameter('restaurantId')], schema: ref('ReviewList') }) },
    '/reviews/{id}': {
      get: operation('Reviews', 'Get a review', { private: true, parameters: [parameter('id')], schema: dataResponse('Review') }),
      put: operation('Reviews', 'Edit your review (author only)', { private: true, parameters: [parameter('id')], schema: dataResponse('Review'),
        requestBody: body({ rating: { type: 'integer', minimum: 1, maximum: 5 }, comment: string }, []) }),
      delete: operation('Reviews', 'Delete your review (author only)', { private: true, parameters: [parameter('id')], schema: ref('Empty') })
    }
  }
};
