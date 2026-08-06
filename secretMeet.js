const express = require("express");
const { v4: uuidv4 } = require("uuid");

const { publishSecret, listSecretInbox } = require("./lib/events");
const { SecretQueueEntry } = require("./models/realtime");
const { secretJoinLimiter } = require("./lib/rateLimiters");
const { audit } = require("./lib/audit");

const router = express.Router();

router.post("/join", secretJoinLimiter, async (req, res) => {
  try {
    const { userId, userName } = req.body;
    const { SecretBlock } = require("./models/platform");
    await SecretQueueEntry.deleteMany({ userId }); // clear any stale entry (rejoin)

    const blocked = await SecretBlock.find({
      $or: [{ blockerId: userId }, { blockedId: userId }],
    }).lean();
    const blockedIds = new Set();
    for (const b of blocked) {
      blockedIds.add(b.blockerId);
      blockedIds.add(b.blockedId);
    }
    blockedIds.delete(userId);

    const candidates = await SecretQueueEntry.find({
      userId: { $ne: userId, $nin: [...blockedIds] },
    }).limit(20);
    let partner = null;
    for (const c of candidates) {
      const mutual = await SecretBlock.findOne({
        $or: [
          { blockerId: userId, blockedId: c.userId },
          { blockerId: c.userId, blockedId: userId },
        ],
      });
      if (!mutual) {
        partner = await SecretQueueEntry.findOneAndDelete({ userId: c.userId });
        if (partner) break;
      }
    }

    if (partner) {
      const roomId = "secret-" + uuidv4().slice(0, 8);
      await publishSecret(partner.userId, "secret-matched", {
        roomId,
        partnerName: userName,
      });
      return res.json({ status: "matched", roomId, partnerName: partner.userName });
    }

    await SecretQueueEntry.create({ userId, userName });
    res.json({ status: "waiting" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/leave", async (req, res) => {
  try {
    await SecretQueueEntry.deleteMany({ userId: req.body.userId });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/inbox", async (req, res) => {
  try {
    const { userId, since } = req.query;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const events = await listSecretInbox(userId, since);
    res.json({
      events,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/report", async (req, res) => {
  try {
    const { userId, targetUserId, reason } = req.body;
    await audit({
      action: "secret-report",
      actorId: userId || "anonymous",
      targetId: targetUserId,
      meta: { reason: (reason || "").slice(0, 500) },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/block", async (req, res) => {
  try {
    const { userId, targetUserId, reason } = req.body;
    if (!userId || !targetUserId) {
      return res.status(400).json({ error: "userId and targetUserId required" });
    }
    const { SecretBlock } = require("./models/platform");
    await SecretBlock.findOneAndUpdate(
      { blockerId: userId, blockedId: targetUserId },
      {
        blockerId: userId,
        blockedId: targetUserId,
        reason: (reason || "").slice(0, 500),
      },
      { upsert: true, new: true },
    );
    await audit({
      action: "secret-block",
      actorId: userId,
      targetId: targetUserId,
      meta: { reason: (reason || "").slice(0, 500) },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/blocked", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const { SecretBlock } = require("./models/platform");
    const rows = await SecretBlock.find({ blockerId: userId })
      .select("blockedId reason createdAt")
      .lean();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
