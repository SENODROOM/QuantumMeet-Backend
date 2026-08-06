/**
 * Partner API keys — Mongo when available, memory fallback for local.
 */
const express = require("express");
const crypto = require("crypto");
const auth = require("./middleware/auth");
const rateLimit = require("express-rate-limit");
const { PartnerApiKey } = require("./models/platform");

const router = express.Router();

const memoryKeys = new Map();

function hashKey(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

const partnerLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.PARTNER_RATE_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.partnerKeyId || req.headers["x-api-key"] || req.ip || "anon",
  validate: { keyGeneratorIpFallback: false },
});

router.post("/keys", auth, async (req, res) => {
  try {
    const raw = `qm_${crypto.randomBytes(24).toString("hex")}`;
    const keyId = crypto.randomBytes(8).toString("hex");
    const entry = {
      keyId,
      keyHash: hashKey(raw),
      ownerId: req.user.id,
      name: req.body.name || "default",
      createdAt: new Date(),
    };
    try {
      await PartnerApiKey.create(entry);
    } catch {
      memoryKeys.set(keyId, entry);
    }
    res.status(201).json({
      keyId,
      apiKey: raw,
      name: entry.name,
      warning: "Store the apiKey now — it will not be shown again",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/keys", auth, async (req, res) => {
  try {
    let list = [];
    try {
      list = await PartnerApiKey.find({ ownerId: req.user.id })
        .select("keyId name createdAt")
        .lean();
    } catch {
      list = [...memoryKeys.values()]
        .filter((k) => k.ownerId === req.user.id)
        .map(({ keyId, name, createdAt }) => ({ keyId, name, createdAt }));
    }
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/keys/:keyId", auth, async (req, res) => {
  try {
    const deleted = await PartnerApiKey.findOneAndDelete({
      keyId: req.params.keyId,
      ownerId: req.user.id,
    });
    if (!deleted) {
      const k = memoryKeys.get(req.params.keyId);
      if (!k || k.ownerId !== req.user.id) {
        return res.status(404).json({ error: "Not found" });
      }
      memoryKeys.delete(req.params.keyId);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function requirePartnerKey(req, res, next) {
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const raw = bearer || req.headers["x-api-key"] || "";
  if (!raw || !String(raw).startsWith("qm_")) {
    return res.status(401).json({ error: "API key required" });
  }
  const hash = hashKey(raw);
  try {
    const entry = await PartnerApiKey.findOne({ keyHash: hash }).lean();
    if (entry) {
      req.partnerKeyId = entry.keyId;
      req.partnerOwnerId = entry.ownerId;
      return next();
    }
  } catch {
    /* fall through to memory */
  }
  for (const [keyId, entry] of memoryKeys) {
    if (entry.keyHash === hash) {
      req.partnerKeyId = keyId;
      req.partnerOwnerId = entry.ownerId;
      return next();
    }
  }
  return res.status(401).json({ error: "Invalid API key" });
}

router.get("/whoami", partnerLimiter, requirePartnerKey, (req, res) => {
  res.json({
    keyId: req.partnerKeyId,
    ownerId: req.partnerOwnerId,
  });
});

module.exports = router;
module.exports.requirePartnerKey = requirePartnerKey;
