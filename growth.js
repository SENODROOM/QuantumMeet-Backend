const express = require("express");
const { v4: uuidv4 } = require("uuid");
const auth = require("./middleware/auth");
const { MeetingSchedule, Org, WebhookEndpoint } = require("./models/growth");
const flags = require("./lib/featureFlags");

const router = express.Router();

// Public feature snapshot for clients
router.get("/features", (_req, res) => {
  res.json({
    meshSoftCap: flags.meshSoftCap(),
    longPollEnabled: flags.longPollEnabled(),
    orgsEnabled: flags.orgsEnabled(),
    ssoEnabled: flags.ssoEnabled(),
    mediaPolicy: "mesh_only",
    deploy: "vercel-serverless",
  });
});

/** Cost / MAU draft snapshot (platform inputs via env). */
router.get("/cost/mau", (_req, res) => {
  const atlas = Number(process.env.COST_ATLAS_USD || 0);
  const vercel = Number(process.env.COST_VERCEL_USD || 0);
  const turn = Number(process.env.COST_TURN_USD || 0);
  const blob = Number(process.env.COST_BLOB_USD || 0);
  const mau = Number(process.env.COST_MAU || 0);
  const total = atlas + vercel + turn + blob;
  res.json({
    formula: "cost_per_mau = (atlas+vercel+turn+blob) / mau",
    inputs: { atlas, vercel, turn, blob, mau },
    monthlyInfraUsd: total,
    costPerMau: mau > 0 ? Number((total / mau).toFixed(4)) : null,
    region: require("./lib/region").regionSnapshot(),
    asOf: new Date().toISOString(),
  });
});

router.use(auth);

// ── Meeting schedules ─────────────────────────────────────────────────────────
router.get("/schedules", async (req, res) => {
  try {
    const rows = await MeetingSchedule.find({ hostUserId: req.user.id }).sort({
      startsAt: 1,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/schedules", async (req, res) => {
  try {
    const { title, startsAt, durationMin, classroomId } = req.body;
    const doc = await MeetingSchedule.create({
      scheduleId: uuidv4(),
      title: title || "Scheduled meeting",
      hostUserId: req.user.id,
      hostName: req.user.name,
      classroomId,
      startsAt: new Date(startsAt),
      durationMin: durationMin || 60,
      remindAt: new Date(new Date(startsAt).getTime() - 15 * 60 * 1000),
    });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/schedules/:scheduleId", async (req, res) => {
  try {
    await MeetingSchedule.deleteOne({
      scheduleId: req.params.scheduleId,
      hostUserId: req.user.id,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** ICS download for a schedule (E-705 light). */
router.get("/schedules/:scheduleId/ics", async (req, res) => {
  try {
    const doc = await MeetingSchedule.findOne({
      scheduleId: req.params.scheduleId,
    });
    if (!doc) return res.status(404).json({ error: "Not found" });
    const start = new Date(doc.startsAt);
    const end = new Date(start.getTime() + (doc.durationMin || 60) * 60_000);
    const fmt = (d) =>
      d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const uid = `${doc.scheduleId}@quantummeet`;
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//QuantumMeet//EN",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:${(doc.title || "Meeting").replace(/[,;\\]/g, " ")}`,
      doc.classroomId ? `DESCRIPTION:Classroom ${doc.classroomId}` : "DESCRIPTION:QuantumMeet",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="qm-${doc.scheduleId}.ics"`,
    );
    res.send(ics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Orgs / workspaces ─────────────────────────────────────────────────────────
router.post("/orgs", async (req, res) => {
  if (!flags.orgsEnabled()) {
    return res.status(503).json({ error: "Orgs feature flag disabled" });
  }
  try {
    const org = await Org.create({
      orgId: uuidv4(),
      name: req.body.name || "My workspace",
      ownerId: req.user.id,
      seatLimit: req.body.seatLimit || 50,
      members: [{ userId: req.user.id, role: "owner" }],
    });
    res.json(org);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/orgs", async (req, res) => {
  try {
    const orgs = await Org.find({ "members.userId": req.user.id });
    res.json(orgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/orgs/:orgId/invite", async (req, res) => {
  if (!flags.orgsEnabled()) {
    return res.status(503).json({ error: "Orgs feature flag disabled" });
  }
  try {
    const org = await Org.findOne({ orgId: req.params.orgId });
    if (!org) return res.status(404).json({ error: "Org not found" });
    const me = org.members.find((m) => m.userId === req.user.id);
    if (!me || !["owner", "admin"].includes(me.role)) {
      return res.status(403).json({ error: "Not authorized" });
    }
    const { userId, role } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const existing = org.members.find((m) => m.userId === userId);
    if (existing) {
      existing.role = role || existing.role;
    } else {
      if (org.members.length >= (org.seatLimit || 50)) {
        return res.status(403).json({ error: "Seat limit reached" });
      }
      org.members.push({ userId, role: role || "member" });
    }
    await org.save();
    try {
      const { audit } = require("./lib/audit");
      await audit({
        action: "org-invite",
        actorId: req.user.id,
        meta: { orgId: org.orgId, userId, role: role || "member" },
      });
    } catch {
      /* ignore */
    }
    res.json(org);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/orgs/:orgId/members/:memberId/role", async (req, res) => {
  if (!flags.orgsEnabled()) {
    return res.status(503).json({ error: "Orgs feature flag disabled" });
  }
  try {
    const org = await Org.findOne({ orgId: req.params.orgId });
    if (!org) return res.status(404).json({ error: "Org not found" });
    const me = org.members.find((m) => m.userId === req.user.id);
    if (!me || me.role !== "owner") {
      return res.status(403).json({ error: "Owner only" });
    }
    const m = org.members.find((x) => x.userId === req.params.memberId);
    if (!m) return res.status(404).json({ error: "Member not found" });
    m.role = req.body.role || m.role;
    await org.save();
    res.json(org);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/orgs/:orgId", async (req, res) => {
  if (!flags.orgsEnabled()) {
    return res.status(503).json({ error: "Orgs feature flag disabled" });
  }
  try {
    const org = await Org.findOne({ orgId: req.params.orgId });
    if (!org) return res.status(404).json({ error: "Org not found" });
    const me = org.members.find((m) => m.userId === req.user.id);
    if (!me || !["owner", "admin"].includes(me.role)) {
      return res.status(403).json({ error: "Not authorized" });
    }
    if (req.body.name != null) org.name = String(req.body.name).slice(0, 120);
    if (req.body.seatLimit != null) {
      const n = Number(req.body.seatLimit);
      if (!Number.isFinite(n) || n < 1) {
        return res.status(400).json({ error: "Invalid seatLimit" });
      }
      if (n < (org.members?.length || 0)) {
        return res.status(400).json({
          error: "seatLimit cannot be below current member count",
        });
      }
      org.seatLimit = n;
    }
    if (req.body.featureFlags && typeof req.body.featureFlags === "object") {
      org.featureFlags = { ...(org.featureFlags || {}), ...req.body.featureFlags };
    }
    if (req.body.billingPlan != null) {
      org.billingPlan = String(req.body.billingPlan).slice(0, 40);
    }
    if (req.body.billingStatus != null) {
      org.billingStatus = String(req.body.billingStatus).slice(0, 40);
    }
    await org.save();
    res.json(org);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Pilot billing: record an invoice event (no payment processor). */
router.post("/orgs/:orgId/billing/invoice", async (req, res) => {
  if (!flags.orgsEnabled()) {
    return res.status(503).json({ error: "Orgs feature flag disabled" });
  }
  try {
    const org = await Org.findOne({ orgId: req.params.orgId });
    if (!org) return res.status(404).json({ error: "Org not found" });
    const me = org.members.find((m) => m.userId === req.user.id);
    if (!me || !["owner", "admin"].includes(me.role)) {
      return res.status(403).json({ error: "Not authorized" });
    }
    const seats = org.seatLimit || 50;
    const unitUsd = Number(req.body.unitUsd || process.env.PILOT_SEAT_USD || 5);
    const amountUsd = Number((seats * unitUsd).toFixed(2));
    await require("./lib/audit").audit({
      action: "pilot-invoice",
      actorId: req.user.id,
      meta: {
        orgId: org.orgId,
        seats,
        unitUsd,
        amountUsd,
        plan: org.billingPlan || "pilot",
      },
    });
    org.billingStatus = "invoiced";
    await org.save();
    res.json({
      ok: true,
      orgId: org.orgId,
      seats,
      unitUsd,
      amountUsd,
      billingStatus: org.billingStatus,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Webhooks ──────────────────────────────────────────────────────────────────
router.post("/webhooks", async (req, res) => {
  try {
    const wh = await WebhookEndpoint.create({
      orgId: req.body.orgId,
      url: req.body.url,
      events: req.body.events || ["session.end"],
      secret: uuidv4(),
    });
    res.json(wh);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Fire session-end webhooks with HMAC signature + retry once (E-706 light). */
async function notifySessionEnd(payload) {
  const metrics = require("./lib/metrics");
  const crypto = require("crypto");
  try {
    const hooks = await WebhookEndpoint.find({
      events: "session.end",
    }).limit(20);
    const body = JSON.stringify({ event: "session.end", ...payload });
    await Promise.all(
      hooks.map(async (h) => {
        const sig = crypto
          .createHmac("sha256", h.secret || "")
          .update(body)
          .digest("hex");
        const headers = {
          "Content-Type": "application/json",
          "X-QM-Secret": h.secret || "",
          "X-QM-Signature": `sha256=${sig}`,
        };
        const send = () =>
          fetch(h.url, { method: "POST", headers, body });
        try {
          let res = await send();
          if (!res.ok) {
            await new Promise((r) => setTimeout(r, 250));
            res = await send();
          }
          if (res.ok) metrics.inc("webhookDeliveries");
          else {
            metrics.inc("webhookFailures");
            // DLQ stub: log only
            require("./lib/log").warn("webhook_dlq", {
              url: h.url,
              status: res.status,
            });
          }
        } catch (err) {
          metrics.inc("webhookFailures");
          require("./lib/log").warn("webhook_dlq", {
            url: h.url,
            err: err.message,
          });
        }
      }),
    );
  } catch (err) {
    console.warn("[webhook]", err.message);
  }
}

router.post("/webhooks/test-session-end", async (req, res) => {
  await notifySessionEnd({
    roomId: req.body.roomId,
    classroomId: req.body.classroomId,
    actorId: req.user.id,
  });
  res.json({ ok: true });
});

module.exports = router;
module.exports.notifySessionEnd = notifySessionEnd;
