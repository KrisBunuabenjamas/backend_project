const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const { rateLimit } = require('express-rate-limit');
const hpp = require('hpp');
const swaggerUI = require('swagger-ui-express');
const swagger = require('./config/swagger');
const { ApiError, errorHandler } = require('./middleware/errors');

function createApp({ rateLimitMax = 100 } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    if (mongoSanitize.has(req.body)) return next(new ApiError(400, 'MongoDB operator keys and dotted field names are not allowed'));
    next();
  });
  app.use(mongoSanitize());
  app.use(hpp());
  app.use('/api', rateLimit({ windowMs: 10 * 60 * 1000, limit: rateLimitMax,
    standardHeaders: 'draft-7', legacyHeaders: false,
    message: { success: false, message: 'Too many requests; try again later' } }));
  app.get('/api-docs.json', (req, res) => res.json(swagger));
  app.use('/api-docs', swaggerUI.serve, swaggerUI.setup(swagger, {
    swaggerOptions: { validatorUrl: null, persistAuthorization: false }
  }));
  app.use('/api/v1/auth', require('./routes/auth'));
  app.use('/api/v1/restaurants', require('./routes/restaurants'));
  app.use('/api/v1/reservations', require('./routes/reservations'));
  app.use('/api/v1/menu-items', require('./routes/menuItems'));
  app.use('/api/v1/preorders', require('./routes/preorders'));
  app.use('/api/v1/reviews', require('./routes/reviews'));
  app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
  app.use(errorHandler);
  return app;
}
module.exports = { createApp };
