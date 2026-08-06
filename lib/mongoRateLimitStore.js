const mongoose = require("mongoose");

/**
 * express-rate-limit store backed by Mongo (E-107).
 * Shared across serverless instances when they share the same Atlas cluster.
 * Falls back gracefully if DB is down (allows request — fail open for limits only).
 */
class MongoRateLimitStore {
  constructor(windowMs) {
    this.windowMs = windowMs;
    this.Model = null;
  }

  _model() {
    if (this.Model) return this.Model;
    const schema = new mongoose.Schema(
      {
        key: { type: String, required: true },
        points: { type: Number, default: 0 },
        expiresAt: { type: Date, required: true, index: true },
      },
      { collection: "rate_limit_hits" },
    );
    schema.index({ key: 1 }, { unique: true });
    schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    try {
      this.Model = mongoose.model("RateLimitHit");
    } catch {
      this.Model = mongoose.model("RateLimitHit", schema);
    }
    return this.Model;
  }

  async increment(key) {
    if (mongoose.connection.readyState !== 1) {
      return { totalHits: 1, resetTime: new Date(Date.now() + this.windowMs) };
    }
    const Model = this._model();
    const now = Date.now();
    const expiresAt = new Date(now + this.windowMs);
    try {
      const doc = await Model.findOneAndUpdate(
        { key, expiresAt: { $gt: new Date(now) } },
        { $inc: { points: 1 }, $setOnInsert: { expiresAt } },
        { upsert: true, new: true },
      );
      return {
        totalHits: doc.points,
        resetTime: doc.expiresAt,
      };
    } catch (err) {
      // race on upsert — retry once
      const doc = await Model.findOne({ key });
      if (doc) {
        doc.points += 1;
        await doc.save();
        return { totalHits: doc.points, resetTime: doc.expiresAt };
      }
      return { totalHits: 1, resetTime: expiresAt };
    }
  }

  async decrement(key) {
    if (mongoose.connection.readyState !== 1) return;
    const Model = this._model();
    await Model.updateOne({ key }, { $inc: { points: -1 } }).catch(() => {});
  }

  async resetKey(key) {
    if (mongoose.connection.readyState !== 1) return;
    const Model = this._model();
    await Model.deleteOne({ key }).catch(() => {});
  }
}

module.exports = { MongoRateLimitStore };
