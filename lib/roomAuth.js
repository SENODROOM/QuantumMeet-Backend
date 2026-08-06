const jwt = require("jsonwebtoken");

function roomSecret() {
  return (
    process.env.ROOM_TOKEN_SECRET ||
    process.env.JWT_SECRET ||
    "dev-room-token-secret"
  );
}

function signRoomToken({ roomId, userId, role }) {
  return jwt.sign({ roomId, userId, role }, roomSecret(), { expiresIn: "24h" });
}

function verifyRoomToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, roomSecret());
  } catch {
    return null;
  }
}

/** Host actions require a host-scoped room token for this room + userId. */
function isHostToken(roomId, userId, roomToken) {
  const claims = verifyRoomToken(roomToken);
  return (
    !!claims &&
    claims.roomId === roomId &&
    claims.userId === userId &&
    claims.role === "host"
  );
}

module.exports = { signRoomToken, verifyRoomToken, isHostToken, roomSecret };
