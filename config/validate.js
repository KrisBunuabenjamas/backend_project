const jwt = require('jsonwebtoken');
function configurationError(message) {
  const err = new Error(message); err.name = 'ConfigurationError'; return err;
}
function validateConfig(env = process.env) {
  if (!env.JWT_SECRET || env.JWT_SECRET === 'REPLACE_WITH_RANDOM_SECRET' || env.JWT_SECRET.length < 32) {
    throw configurationError('Set JWT_SECRET to a locally generated secret of at least 32 characters');
  }
  try {
    const probe = jwt.decode(jwt.sign({ configurationCheck: true }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRE || '30d' }));
    if (!Number.isFinite(probe.exp) || probe.exp <= probe.iat) throw new Error('Nonpositive lifetime');
  } catch { throw configurationError('Invalid JWT_EXPIRE; use a positive lifetime such as 30d'); }
  const days = Number(env.JWT_COOKIE_EXPIRE || 30);
  if (!Number.isFinite(days) || days <= 0 || !Number.isFinite(new Date(Date.now() + days * 86400000).getTime())) {
    throw configurationError('Invalid JWT_COOKIE_EXPIRE; use a positive number of days such as 30');
  }
}
module.exports = validateConfig;
