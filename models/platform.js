/**
 * Recording metadata + retention purge (Blob URLs).
 */
const mongoose = require("mongoose");

const recordingSchema = new mongoose.Schema({
  recordingId: { type: String, required: true, unique: true },
  roomId: { type: String, required: true, index: true },
  classroomId: { type: String, index: true },
  actorId: { type: String },
  blobUrl: { type: String },
  durationSec: { type: Number },
  createdAt: { type: Date, default: Date.now, index: true },
});

const partnerKeySchema = new mongoose.Schema({
  keyId: { type: String, required: true, unique: true },
  keyHash: { type: String, required: true, index: true },
  ownerId: { type: String, required: true, index: true },
  name: { type: String, default: "default" },
  createdAt: { type: Date, default: Date.now },
});

const secretBlockSchema = new mongoose.Schema({
  blockerId: { type: String, required: true, index: true },
  blockedId: { type: String, required: true, index: true },
  reason: { type: String },
  createdAt: { type: Date, default: Date.now },
});
secretBlockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });

function model(name, schema) {
  try {
    return mongoose.model(name);
  } catch {
    return mongoose.model(name, schema);
  }
}

module.exports = {
  Recording: model("Recording", recordingSchema),
  PartnerApiKey: model("PartnerApiKey", partnerKeySchema),
  SecretBlock: model("SecretBlock", secretBlockSchema),
};
