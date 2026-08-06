/**
 * Realtime media policy endpoint.
 * QuantumMeet on Vercel = WebRTC mesh + Mongo HTTP signaling only.
 * No hosted SFU (LiveKit/etc.) — those are paid/external and not part of this deploy.
 */
const express = require("express");
const flags = require("./lib/featureFlags");

const router = express.Router();

router.get("/token", (_req, res) => {
  res.status(501).json({
    error: "No SFU on this deployment",
    code: "SFU_NOT_USED",
    policy: "mesh_only",
    hint: "Media is WebRTC P2P mesh; signaling is Mongo/HTTP on Vercel serverless.",
  });
});

router.get("/health", (_req, res) => {
  res.json({
    policy: "mesh_only",
    enabled: false,
    vendor: null,
    configured: false,
    meshSoftCap: flags.meshSoftCap(),
    sfuThreshold: flags.sfuThreshold(),
    note: "Vercel deploy stays mesh WebRTC + serverless API — no hosted SFU.",
  });
});

router.get("/deploy-check", (_req, res) => {
  res.json({
    ok: true,
    policy: "mesh_only",
    checks: {
      serverlessApi: true,
      meshWebRtc: true,
      hostedSfu: false,
    },
  });
});

module.exports = router;
