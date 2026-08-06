const mongoose = require("mongoose");

const auditSchema = new mongoose.Schema({
  action: { type: String, required: true, index: true },
  roomId: { type: String, index: true },
  classroomId: { type: String, index: true },
  actorId: { type: String, required: true },
  targetId: { type: String },
  meta: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now, expires: 90 * 86400, index: true },
});

let AuditLog;
try {
  AuditLog = mongoose.model("AuditLog");
} catch {
  AuditLog = mongoose.model("AuditLog", auditSchema);
}

async function audit(entry) {
  try {
    const { auditEnabled } = require("./featureFlags");
    if (!auditEnabled()) return;
    await AuditLog.create(entry);
  } catch (err) {
    console.warn("[audit]", err.message);
  }
}

module.exports = { AuditLog, audit };
