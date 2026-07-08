const express = require("express");
const { v4: uuidv4 } = require("uuid");

const Room = require("./models/room");
const { publish, getAbly } = require("./lib/ably");
const {
  Message,
  Poll,
  Question,
  BreakoutSession,
  KnockRequest,
} = require("./models/realtime");

const router = express.Router();

// Meeting rooms are intentionally login-free (see classroom.js for the
// JWT-gated classroom surface) — identity here is whatever userId the
// client generated for itself, same trust model the old socket.io server
// used (roomHosts.get(roomId) === meta.userId, where meta.userId came from
// the client's join-room payload, not a verified token).
const channelFor = (roomId) => "room:" + roomId;

async function isHost(roomId, userId) {
  if (!userId) return false;
  const room = await Room.findOne({ roomId });
  return !!room && room.host === userId;
}

// ─── Rooms ────────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { userId, hostName, isPublic = true, title = "" } = req.body;
    const roomId =
      uuidv4().slice(0, 3) + "-" + uuidv4().slice(0, 4) + "-" + uuidv4().slice(0, 3);

    try {
      await Room.create({
        roomId,
        host: userId,
        hostName,
        isPublic,
        title,
        participantCount: 0,
      });
    } catch (dbErr) {
      // DB unavailable — room still usable, just not persisted/discoverable
    }
    res.json({
      roomId,
      isPublic,
      link: `${process.env.CLIENT_URL || "http://localhost:3000"}/room/${roomId}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:roomId", async (req, res) => {
  try {
    const roomData = await Room.findOne({ roomId: req.params.roomId }).catch(
      () => null,
    );
    let liveCount = 0;
    try {
      const presence = await getAbly()
        .channels.get(channelFor(req.params.roomId))
        .presence.get();
      liveCount = presence.length;
    } catch {}
    if (roomData)
      return res.json({ ...roomData.toObject(), participantCount: liveCount });
    if (liveCount > 0) {
      return res.json({
        roomId: req.params.roomId,
        isPublic: false,
        participantCount: liveCount,
      });
    }
    res.status(404).json({ error: "Room not found" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", async (req, res) => {
  try {
    let activeRoomIds = [];
    try {
      const result = await getAbly().request("get", "/channels", null, {
        prefix: "room:",
        limit: 200,
      });
      activeRoomIds = result.items.map((c) => c.channelId.replace(/^room:/, ""));
    } catch {}

    const dbRooms = await Room.find({
      roomId: { $in: activeRoomIds },
      isPublic: true,
    }).catch(() => []);

    const publicRooms = await Promise.all(
      dbRooms.map(async (r) => {
        let count = 0;
        try {
          const presence = await getAbly()
            .channels.get(channelFor(r.roomId))
            .presence.get();
          count = presence.length;
        } catch {}
        return {
          roomId: r.roomId,
          title: r.title || `${r.hostName}'s Meeting`,
          hostName: r.hostName,
          isPublic: r.isPublic,
          participantCount: count,
          createdAt: r.createdAt,
        };
      }),
    );
    res.json(publicRooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Knock / admit / reject / kick ───────────────────────────────────────
router.post("/:roomId/knock", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId, userName } = req.body;
    const room = await Room.findOne({ roomId });

    if (room && room.host === userId) {
      return res.json({ status: "accepted" });
    }

    await KnockRequest.findOneAndUpdate(
      { roomId, userId },
      { roomId, userId, userName },
      { upsert: true },
    );

    if (room?.host) {
      await publish(channelFor(roomId), "knock-request", {
        userId,
        userName,
        to: room.host,
      });
      return res.json({ status: "pending" });
    }
    res.json({ status: "waiting" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:roomId/knocks", async (req, res) => {
  try {
    // Host reconnecting/loading the room re-fetches pending knocks instead
    // of relying on the old in-memory replay-on-join behavior.
    const { userId } = req.query;
    if (!(await isHost(req.params.roomId, userId))) return res.json([]);
    res.json(await KnockRequest.find({ roomId: req.params.roomId }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:roomId/admit", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId, targetUserId } = req.body;
    if (!(await isHost(roomId, userId)))
      return res.status(403).json({ error: "Not authorized" });

    await KnockRequest.deleteOne({ roomId, userId: targetUserId });
    await publish(channelFor(roomId), "knock-accepted", { to: targetUserId });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:roomId/reject", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId, targetUserId } = req.body;
    if (!(await isHost(roomId, userId)))
      return res.status(403).json({ error: "Not authorized" });

    await KnockRequest.deleteOne({ roomId, userId: targetUserId });
    await publish(channelFor(roomId), "knock-rejected", { to: targetUserId });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:roomId/kick", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId, targetUserId, targetUserName } = req.body;
    if (!(await isHost(roomId, userId)))
      return res.status(403).json({ error: "Not authorized" });

    await publish(channelFor(roomId), "kicked", { to: targetUserId });
    await publish(channelFor(roomId), "user-left", {
      userId: targetUserId,
      userName: targetUserName,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Host controls (mute/unmute/mute-all/stop-video/wb/hands/transcribe) ──
const HOST_ACTIONS = {
  "mute-user": "force-mute",
  "unmute-user": "force-unmute",
  "stop-video": "force-stop-video",
  "mute-all": "force-mute",
  "lower-all-hands": "lower-hand",
};

router.post("/:roomId/host-action", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId, action, targetUserId, allowed } = req.body;
    if (!(await isHost(roomId, userId)))
      return res.status(403).json({ error: "Not authorized" });

    if (action === "wb-permission") {
      await publish(channelFor(roomId), "wb-permission", {
        to: targetUserId,
        allowed,
      });
    } else if (action === "grant-transcribe") {
      await publish(channelFor(roomId), "transcribe-permission", {
        to: targetUserId,
        allowed,
      });
    } else if (action === "mute-all" || action === "lower-all-hands") {
      await publish(channelFor(roomId), HOST_ACTIONS[action], {});
    } else if (HOST_ACTIONS[action]) {
      await publish(channelFor(roomId), HOST_ACTIONS[action], {
        to: targetUserId,
      });
    } else {
      return res.status(400).json({ error: "Unknown action" });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Chat ─────────────────────────────────────────────────────────────────
router.get("/:roomId/chat", async (req, res) => {
  try {
    const messages = await Message.find({ roomId: req.params.roomId })
      .sort({ createdAt: 1 })
      .limit(200);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:roomId/chat", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { message, userName, userId } = req.body;
    if (!message?.trim() || message.length > 2000)
      return res.status(400).json({ error: "Invalid message" });

    const doc = await Message.create({
      roomId,
      message: message.trim(),
      userName,
      userId,
    });

    const count = await Message.countDocuments({ roomId });
    if (count > 200) {
      const stale = await Message.find({ roomId })
        .sort({ createdAt: 1 })
        .limit(count - 200);
      await Message.deleteMany({ _id: { $in: stale.map((m) => m._id) } });
    }

    await publish(channelFor(roomId), "chat-message", doc);
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Polls ────────────────────────────────────────────────────────────────
router.get("/:roomId/polls", async (req, res) => {
  try {
    res.json(await Poll.find({ roomId: req.params.roomId }).sort({ createdAt: 1 }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:roomId/polls", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId, question, options, createdBy } = req.body;
    if (!(await isHost(roomId, userId)))
      return res.status(403).json({ error: "Not authorized" });

    const poll = await Poll.create({
      roomId,
      question,
      createdBy,
      options: options.map((text) => ({ text, votes: [] })),
    });
    await publish(channelFor(roomId), "poll-new", poll);
    res.json(poll);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:roomId/polls/:pollId/vote", async (req, res) => {
  try {
    const { roomId, pollId } = req.params;
    const { userId, optionIndex } = req.body;
    const poll = await Poll.findById(pollId);
    if (!poll || !poll.active || poll.roomId !== roomId)
      return res.status(404).json({ error: "Not found" });

    poll.options.forEach((o) => {
      o.votes = o.votes.filter((v) => v !== userId);
    });
    if (optionIndex >= 0 && optionIndex < poll.options.length)
      poll.options[optionIndex].votes.push(userId);
    await poll.save();

    await publish(channelFor(roomId), "poll-updated", poll);
    res.json(poll);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:roomId/polls/:pollId/end", async (req, res) => {
  try {
    const { roomId, pollId } = req.params;
    const { userId } = req.body;
    if (!(await isHost(roomId, userId)))
      return res.status(403).json({ error: "Not authorized" });

    const poll = await Poll.findById(pollId);
    if (!poll || poll.roomId !== roomId)
      return res.status(404).json({ error: "Not found" });
    poll.active = false;
    await poll.save();

    await publish(channelFor(roomId), "poll-updated", poll);
    res.json(poll);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Q&A ──────────────────────────────────────────────────────────────────
router.get("/:roomId/qna", async (req, res) => {
  try {
    res.json(await Question.find({ roomId: req.params.roomId }).sort({ createdAt: 1 }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:roomId/qna", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { text, askerId, askerName, anonymous } = req.body;
    const q = await Question.create({
      roomId,
      text,
      askerId,
      askerName: anonymous ? "Anonymous" : askerName,
      anonymous: !!anonymous,
    });
    await publish(channelFor(roomId), "qna-new", q);
    res.json(q);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:roomId/qna/:qId/upvote", async (req, res) => {
  try {
    const { roomId, qId } = req.params;
    const { userId } = req.body;
    const q = await Question.findOne({ _id: qId, roomId });
    if (!q) return res.status(404).json({ error: "Not found" });
    if (q.upvotes.includes(userId))
      q.upvotes = q.upvotes.filter((v) => v !== userId);
    else q.upvotes.push(userId);
    await q.save();
    await publish(channelFor(roomId), "qna-updated", q);
    res.json(q);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:roomId/qna/:qId/answered", async (req, res) => {
  try {
    const { roomId, qId } = req.params;
    const { userId } = req.body;
    if (!(await isHost(roomId, userId)))
      return res.status(403).json({ error: "Not authorized" });
    const q = await Question.findOne({ _id: qId, roomId });
    if (!q) return res.status(404).json({ error: "Not found" });
    q.answered = !q.answered;
    await q.save();
    await publish(channelFor(roomId), "qna-updated", q);
    res.json(q);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:roomId/qna/:qId/pin", async (req, res) => {
  try {
    const { roomId, qId } = req.params;
    const { userId } = req.body;
    if (!(await isHost(roomId, userId)))
      return res.status(403).json({ error: "Not authorized" });

    await Question.updateMany({ roomId }, { pinned: false });
    const q = await Question.findOne({ _id: qId, roomId });
    if (!q) return res.status(404).json({ error: "Not found" });
    q.pinned = true;
    await q.save();

    const all = await Question.find({ roomId }).sort({ createdAt: 1 });
    await publish(channelFor(roomId), "qna-all", all);
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:roomId/qna/:qId", async (req, res) => {
  try {
    const { roomId, qId } = req.params;
    const { userId } = req.body;
    if (!(await isHost(roomId, userId)))
      return res.status(403).json({ error: "Not authorized" });

    await Question.deleteOne({ _id: qId, roomId });
    const all = await Question.find({ roomId }).sort({ createdAt: 1 });
    await publish(channelFor(roomId), "qna-all", all);
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Breakout rooms ───────────────────────────────────────────────────────
router.get("/:roomId/breakout", async (req, res) => {
  try {
    res.json(await BreakoutSession.findOne({ roomId: req.params.roomId }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:roomId/breakout", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId, breakoutRooms } = req.body;
    if (!(await isHost(roomId, userId)))
      return res.status(403).json({ error: "Not authorized" });

    const session = await BreakoutSession.findOneAndUpdate(
      { roomId },
      { roomId, rooms: breakoutRooms, active: true },
      { upsert: true, new: true },
    );
    await publish(channelFor(roomId), "breakout-started", { breakoutRooms });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:roomId/breakout/assign", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId, targetUserId, breakoutRoomId } = req.body;
    if (!(await isHost(roomId, userId)))
      return res.status(403).json({ error: "Not authorized" });

    await publish(channelFor(roomId), "breakout-assigned", {
      to: targetUserId,
      breakoutRoomId,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:roomId/breakout", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId } = req.body;
    if (!(await isHost(roomId, userId)))
      return res.status(403).json({ error: "Not authorized" });

    await BreakoutSession.deleteOne({ roomId });
    await publish(channelFor(roomId), "breakout-ended", {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:roomId/breakout/broadcast", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId, message } = req.body;
    if (!(await isHost(roomId, userId)))
      return res.status(403).json({ error: "Not authorized" });

    await publish(channelFor(roomId), "breakout-broadcast-msg", {
      message,
      from: "Host",
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:roomId/breakout/callback", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId } = req.body;
    if (!(await isHost(roomId, userId)))
      return res.status(403).json({ error: "Not authorized" });

    await publish(channelFor(roomId), "breakout-callback", {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
