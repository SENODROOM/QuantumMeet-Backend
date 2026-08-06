const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { RoomTokenRevocation } = require("../models/tokenRevocation");

function roomSecret() {
  return (
    process.env.ROOM_TOKEN_SECRET ||
    process.env.JWT_SECRET ||
    "dev-room-token-secret"
  );
}

function signRoomToken({ roomId, userId, role }) {
  const jti = uuidv4();
  const token = jwt.sign(
    { roomId, userId, role, jti },
    roomSecret(),
    { expiresIn: "24h" },
  );
  return { token, jti };
}

/** Back-compat: return string token when callers expect string. */
function signRoomTokenString(opts) {
  return signRoomToken(opts).token;
}

function verifyRoomToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, roomSecret());
  } catch {
    return null;
  }
}

async function isRevoked(jti) {
  if (!jti) return false;
  try {
    const mongoose = require("mongoose");
    if (mongoose.connection.readyState !== 1) return false;
    const row = await RoomTokenRevocation.findOne({ jti }).lean();
    return !!row;
  } catch {
    return false;
  }
}

/** Sync check used in hot paths — prefer isHostTokenAsync when possible. */
function isHostToken(roomId, userId, roomToken) {
  const claims = verifyRoomToken(roomToken);
  return (
    !!claims &&
    claims.roomId === roomId &&
    claims.userId === userId &&
    claims.role === "host"
  );
}

async function isHostTokenAsync(roomId, userId, roomToken) {
  const claims = verifyRoomToken(roomToken);
  if (
    !claims ||
    claims.roomId !== roomId ||
    claims.userId !== userId ||
    claims.role !== "host"
  ) {
    return false;
  }
  if (await isRevoked(claims.jti)) return false;
  return true;
}

async function revokeToken(token, reason = "revoke") {
  const claims = verifyRoomToken(token);
  if (!claims?.jti) return { ok: false, error: "invalid_token" };
  await RoomTokenRevocation.findOneAndUpdate(
    { jti: claims.jti },
    {
      jti: claims.jti,
      roomId: claims.roomId,
      userId: claims.userId,
      reason,
    },
    { upsert: true },
  );
  return { ok: true, jti: claims.jti };
}

async function rotateHostToken({ roomId, userId, oldToken }) {
  if (!(await isHostTokenAsync(roomId, userId, oldToken))) {
    return { ok: false, error: "not_host" };
  }
  await revokeToken(oldToken, "rotate");
  const { token, jti } = signRoomToken({ roomId, userId, role: "host" });
  return { ok: true, roomToken: token, jti };
}

module.exports = {
  signRoomToken: signRoomTokenString,
  signRoomTokenWithJti: signRoomToken,
  verifyRoomToken,
  isHostToken,
  isHostTokenAsync,
  revokeToken,
  rotateHostToken,
  roomSecret,
};
