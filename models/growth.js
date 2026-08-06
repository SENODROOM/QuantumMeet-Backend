const mongoose = require("mongoose");

const meetingScheduleSchema = new mongoose.Schema({
  scheduleId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  hostUserId: { type: String, required: true, index: true },
  hostName: { type: String },
  classroomId: { type: String, index: true },
  startsAt: { type: Date, required: true, index: true },
  durationMin: { type: Number, default: 60 },
  roomId: { type: String },
  remindAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

const orgSchema = new mongoose.Schema({
  orgId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  ownerId: { type: String, required: true },
  seatLimit: { type: Number, default: 50 },
  billingPlan: { type: String, default: "pilot" },
  billingStatus: { type: String, default: "active" },
  members: [{ userId: String, role: { type: String, default: "member" } }],
  featureFlags: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
});

const webhookSchema = new mongoose.Schema({
  orgId: { type: String, index: true },
  url: { type: String, required: true },
  events: [String],
  secret: { type: String },
  createdAt: { type: Date, default: Date.now },
});

function model(name, schema) {
  try {
    return mongoose.model(name);
  } catch {
    return mongoose.model(name, schema);
  }
}

module.exports = {
  MeetingSchedule: model("MeetingSchedule", meetingScheduleSchema),
  Org: model("Org", orgSchema),
  WebhookEndpoint: model("WebhookEndpoint", webhookSchema),
};
