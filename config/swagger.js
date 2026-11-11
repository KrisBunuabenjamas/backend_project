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
function operation(tag, summary, { private: isPrivate = false, invalidCredentials = false, parameters, requestBody, status = 200, schema, description } = {}) {
  return { tags: [tag], summary, ...(description ? { description } : {}),
    security: isPrivate ? [{ bearerAuth: [] }, { cookieAuth: [] }] : [],
    ...(parameters ? { parameters } : {}), ...(requestBody ? { requestBody } : {}),
    responses: { [status]: response('Success', schema), 400: response('Invalid input / maximum 3 reservations reached', ref('Error')),
      ...(isPrivate || invalidCredentials ? { 401: response('Missing or invalid credentials', ref('Error')) } : {}),
      ...(isPrivate ? { 403: response('Permission denied', ref('Error')) } : {}),
      404: response('Resource not found', ref('Error')), 429: response('Too many requests', ref('Error')), 500: response('Server error', ref('Error')) }
  };
}
module.exports = {
  openapi: '3.0.3', info: { title: 'Restaurant Reservation API', version: '1.0.0',
    description: 'SW Development final project #5. One reservation represents one table; maximum 3 records per user across all dates and restaurants. Owners access their own records; admins can manage all records.' },
  servers: [{ url: '/api/v1', description: 'Current server' }],
  tags: [{ name: 'Auth' }, { name: 'Restaurants' }, { name: 'Reservations' }],
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
        restaurant: { oneOf: [id, ref('Restaurant')] }, createdAt: { type: 'string', format: 'date-time' } } }
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
      put: operation('Reservations', 'Edit date and/or restaurant (owner or admin)', { private: true, parameters: [parameter('id')],
        requestBody: body({ reservationDate: date, restaurant: id }, []), schema: dataResponse('Reservation'), description: 'At least one field is required. Ownership cannot be reassigned.' }),
      delete: operation('Reservations', 'Delete a reservation (owner or admin)', { private: true, parameters: [parameter('id')], schema: ref('Empty') })
    }
  }
};
