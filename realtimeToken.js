const express = require("express");
const { createTokenRequest } = require("./lib/ably");

const router = express.Router();

// Meeting rooms are login-free, so identity here is just the client-generated
// userId (uuid) — same trust model the room REST endpoints use. The token
// only grants capability on the caller's own inbox channel and, if joining a
// room, that room's channel — never other users' inboxes or other rooms.
router.post("/token", async (req, res) => {
  try {
    const { userId, roomId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const capability = {
      ["secret:" + userId]: ["subscribe"],
    };
    if (roomId) {
      capability["room:" + roomId] = ["publish", "subscribe", "presence"];
    }

    const tokenRequest = await createTokenRequest(userId, capability);
    res.json(tokenRequest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
