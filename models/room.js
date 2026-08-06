const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now, expires: 86400 },
  host: { type: String },
  hostName: { type: String, default: "Host" },
  isPublic: { type: Boolean, default: true },
  title: { type: String, default: "" },
  classroomId: { type: String },
  accountUserId: { type: String },
  participants: [String],
  participantCount: { type: Number, default: 0 },
});

let Room;
try {
  Room = mongoose.model("Room");
} catch {
  Room = mongoose.model("Room", roomSchema);
}

module.exports = Room;
