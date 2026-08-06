const express = require("express");
const { publishDueScheduledPosts } = require("./lib/scheduledPosts");

const router = express.Router();

function authorizeCron(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Local / unset: allow (dev). Production should set CRON_SECRET.
    if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
      return res.status(401).json({ error: "CRON_SECRET not configured" });
    }
    return next();
  }
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const query = req.query.secret;
  if (bearer === secret || query === secret) return next();
  return res.status(401).json({ error: "Unauthorized cron" });
}

router.get("/scheduled-posts", authorizeCron, async (_req, res) => {
  try {
    const metrics = require("./lib/metrics");
    metrics.inc("cronRuns");
    const result = await publishDueScheduledPosts();
    if (result.count) metrics.inc("cronPublished", result.count);
    require("./lib/log").info("cron_scheduled_posts", { count: result.count });
    res.json({ ok: true, ...result, at: new Date().toISOString() });
  } catch (err) {
    require("./lib/log").error("cron_scheduled_posts_failed", { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post("/scheduled-posts", authorizeCron, async (_req, res) => {
  try {
    const metrics = require("./lib/metrics");
    metrics.inc("cronRuns");
    const result = await publishDueScheduledPosts();
    if (result.count) metrics.inc("cronPublished", result.count);
    require("./lib/log").info("cron_scheduled_posts", { count: result.count });
    res.json({ ok: true, ...result, at: new Date().toISOString() });
  } catch (err) {
    require("./lib/log").error("cron_scheduled_posts_failed", { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
