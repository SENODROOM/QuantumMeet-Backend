const {
  RoomEvent,
  SecretInbox,
  Presence,
} = require("../models/realtime");

// Presence rows older than this are treated as left (missed heartbeats).
const PRESENCE_STALE_MS = 20_000;

function staleCutoff() {
  return new Date(Date.now() - PRESENCE_STALE_MS);
}

async function publish(roomId, event, payload = {}, opts = {}) {
  const to = opts.to ?? payload?.to ?? null;
  const from = opts.from ?? null;
  const doc = await RoomEvent.create({
    roomId,
    event,
    payload,
    to: to || null,
    from: from || null,
  });
  return doc;
}

async function publishSecret(userId, event, payload = {}) {
  return SecretInbox.create({ userId, event, payload });
}

async function listEvents(roomId, since, userId) {
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 60_000);
  const query = {
    roomId,
    createdAt: { $gt: sinceDate },
    $and: [
      { $or: [{ to: null }, { to: userId }] },
      { $or: [{ from: null }, { from: { $ne: userId } }] },
    ],
  };
  const docs = await RoomEvent.find(query).sort({ createdAt: 1 }).limit(500);
  return docs.map((d) => ({
    id: d._id.toString(),
    event: d.event,
    payload: d.payload,
    createdAt: d.createdAt.toISOString(),
  }));
}

async function listSecretInbox(userId, since) {
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 60_000);
  const docs = await SecretInbox.find({
    userId,
    createdAt: { $gt: sinceDate },
  })
    .sort({ createdAt: 1 })
    .limit(50);
  return docs.map((d) => ({
    id: d._id.toString(),
    event: d.event,
    payload: d.payload,
    createdAt: d.createdAt.toISOString(),
  }));
}

async function enterPresence({ roomId, userId, userName, connectionId }) {
  const now = new Date();
  const prior = await Presence.find({
    roomId,
    userId,
    lastSeen: { $gte: staleCutoff() },
  });
  const hadOther = prior.some((p) => p.connectionId !== connectionId);

  await Presence.findOneAndUpdate(
    { roomId, userId, connectionId },
    { roomId, userId, userName, connectionId, lastSeen: now },
    { upsert: true, new: true },
  );

  await publish(
    roomId,
    hadOther || prior.length > 0 ? "user-rejoined" : "user-joined",
    { socketId: userId, userId, userName },
    { from: userId },
  );
}

async function heartbeatPresence({ roomId, userId, userName, connectionId }) {
  const now = new Date();
  await Presence.findOneAndUpdate(
    { roomId, userId, connectionId },
    { roomId, userId, userName, connectionId, lastSeen: now },
    { upsert: true, new: true },
  );
}

async function leavePresence({ roomId, userId, userName, connectionId }) {
  if (connectionId) {
    await Presence.deleteOne({ roomId, userId, connectionId });
  } else {
    await Presence.deleteMany({ roomId, userId });
  }
  const remaining = await Presence.countDocuments({
    roomId,
    userId,
    lastSeen: { $gte: staleCutoff() },
  });
  if (remaining === 0) {
    await publish(
      roomId,
      "user-left",
      { socketId: userId, userId, userName },
      { from: userId },
    );
  }
}

async function listPresence(roomId) {
  await Presence.deleteMany({ roomId, lastSeen: { $lt: staleCutoff() } });
  const rows = await Presence.find({
    roomId,
    lastSeen: { $gte: staleCutoff() },
  });
  // One entry per userId (multi-tab → same peer id for WebRTC)
  const byUser = new Map();
  for (const r of rows) {
    if (!byUser.has(r.userId)) {
      byUser.set(r.userId, {
        socketId: r.userId,
        userId: r.userId,
        userName: r.userName,
        connectionId: r.connectionId,
      });
    }
  }
  return [...byUser.values()];
}

async function countPresence(roomId) {
  await Presence.deleteMany({ roomId, lastSeen: { $lt: staleCutoff() } });
  const rows = await Presence.find({
    roomId,
    lastSeen: { $gte: staleCutoff() },
  }).select("userId");
  return new Set(rows.map((r) => r.userId)).size;
}

async function activePublicRoomIds() {
  await Presence.deleteMany({ lastSeen: { $lt: staleCutoff() } });
  return Presence.distinct("roomId", {
    lastSeen: { $gte: staleCutoff() },
  });
}

async function removeUserFromRoom(roomId, userId) {
  await Presence.deleteMany({ roomId, userId });
}

module.exports = {
  publish,
  publishSecret,
  listEvents,
  listSecretInbox,
  enterPresence,
  heartbeatPresence,
  leavePresence,
  listPresence,
  countPresence,
  activePublicRoomIds,
  removeUserFromRoom,
  PRESENCE_STALE_MS,
};
