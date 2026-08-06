const mongoose = require("mongoose");

/**
 * E-111 helpers — meeting/classroom APIs fail closed when Mongo is down.
 */
function isDbReady() {
  return mongoose.connection.readyState === 1;
}

function requireDb(req, res, next) {
  if (isDbReady()) return next();
  return res.status(503).json({
    error: "Database unavailable",
    code: "DB_UNAVAILABLE",
  });
}

module.exports = { isDbReady, requireDb };
