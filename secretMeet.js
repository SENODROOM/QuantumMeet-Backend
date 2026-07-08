const express = require("express");
const { v4: uuidv4 } = require("uuid");

const { publish } = require("./lib/ably");
const { SecretQueueEntry } = require("./models/realtime");

const router = express.Router();

// Random-pairing queue. No persistent connection to push the "matched"
// notice to whichever side is still waiting, so the waiting client
// subscribes to its own personal Ably channel (secret:{userId}) and this
// endpoint publishes to it once someone else claims the queue entry.
router.post("/join", async (req, res) => {
  try {
    const { userId, userName } = req.body;
    await SecretQueueEntry.deleteMany({ userId }); // clear any stale entry (rejoin)

    const partner = await SecretQueueEntry.findOneAndDelete({
      userId: { $ne: userId },
    });

    if (partner) {
      const roomId = "secret-" + uuidv4().slice(0, 8);
      await publish("secret:" + partner.userId, "secret-matched", {
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

module.exports = router;
