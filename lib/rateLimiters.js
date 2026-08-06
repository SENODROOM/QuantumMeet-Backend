const rateLimit = require("express-rate-limit");

/**
 * Shared-ish rate limiters. Default store is in-memory (per lambda).
 * Set RATE_LIMIT_STORE=memory explicitly; when UPSTASH_REDIS_REST_URL is
 * present later, swap store without changing call sites.
 */
function createLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message || "Too many requests" },
  });
}

const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many login attempts. Try again in 15 minutes.",
});

const eventsPostLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: "Too many signaling events. Slow down.",
});

const presenceLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many presence updates.",
});

const chatLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: "Too many chat messages.",
});

const secretJoinLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: "Too many SecretMeet join attempts.",
});

module.exports = {
  createLimiter,
  loginLimiter,
  eventsPostLimiter,
  presenceLimiter,
  chatLimiter,
  secretJoinLimiter,
};
