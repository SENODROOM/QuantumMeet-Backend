const mongoose = require("mongoose");

const revocationSchema = new mongoose.Schema({
  jti: { type: String, required: true, unique: true },
  roomId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  reason: { type: String, default: "revoke" },
  createdAt: { type: Date, default: Date.now, expires: 86400 * 2 },
});

let RoomTokenRevocation;
try {
  RoomTokenRevocation = mongoose.model("RoomTokenRevocation");
} catch {
  RoomTokenRevocation = mongoose.model("RoomTokenRevocation", revocationSchema);
}

module.exports = { RoomTokenRevocation };
