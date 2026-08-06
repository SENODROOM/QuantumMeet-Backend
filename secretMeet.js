const express = require("express");
const { v4: uuidv4 } = require("uuid");

const { publishSecret, listSecretInbox } = require("./lib/events");
const { SecretQueueEntry } = require("./models/realtime");

const router = express.Router();

// Random-pairing queue. The waiting client polls GET /inbox; this endpoint
// writes a SecretInbox row when someone else claims the queue entry.
router.post("/join", async (req, res) => {
  try {
    const { userId, userName } = req.body;
    await SecretQueueEntry.deleteMany({ userId }); // clear any stale entry (rejoin)

    const partner = await SecretQueueEntry.findOneAndDelete({
      userId: { $ne: userId },
    });

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

module.exports = router;
