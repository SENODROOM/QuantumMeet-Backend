const mongoose = require("mongoose");

// Vercel functions run as separate lambda invocations that can be reused
// while "warm" — caching the connection on `global` survives across warm
// invocations instead of reconnecting (and leaking connections) every request.
let cached = global.__mongooseConn;
if (!cached) {
  cached = global.__mongooseConn = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    const MONGO_URI =
      process.env.MONGO_URI || "mongodb://localhost:27017/quantummeet";
    cached.promise = mongoose
      .connect(MONGO_URI, {
        // Each concurrent lambda instance opens its own pool — keep it small
        // so many warm instances don't exhaust Atlas's connection limit.
        maxPoolSize: 5,
      })
      .then((m) => m);
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = { connectDB };
