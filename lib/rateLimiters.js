const rateLimit = require("express-rate-limit");
const { MongoRateLimitStore } = require("./mongoRateLimitStore");

/**
 * Shared rate limiters (E-107).
 * Uses Mongo store by default so limits apply across Vercel instances.
 * Set RATE_LIMIT_STORE=memory to force in-memory (local unit tests).
 */
function createLimiter({ windowMs, max, message }) {
  const useMemory = process.env.RATE_LIMIT_STORE === "memory";
  const opts = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message || "Too many requests" },
  };
  if (!useMemory) {
    opts.store = new MongoRateLimitStore(windowMs);
  }
  return rateLimit(opts);
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
