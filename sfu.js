/**
 * SFU token stub (E-304/E-501 light). Returns 501 until vendor wired.
 */
const express = require("express");
const flags = require("./lib/featureFlags");

const router = express.Router();

router.get("/token", (req, res) => {
  if (!flags.sfuEnabled()) {
    return res.status(503).json({
      error: "SFU disabled",
      code: "SFU_DISABLED",
      vendor: process.env.SFU_VENDOR || null,
    });
  }
  const vendor = process.env.SFU_VENDOR || "unset";
  res.status(501).json({
    error: "SFU token mint not implemented",
    code: "SFU_TOKEN_PENDING",
    vendor,
    roomId: req.query.roomId || null,
    hint: "Complete E-304 spike then wire LiveKit/mediasoup JWT here",
  });
});

router.get("/health", (_req, res) => {
  res.json({
    enabled: flags.sfuEnabled(),
    vendor: process.env.SFU_VENDOR || null,
    threshold: flags.sfuThreshold(),
    meshSoftCap: flags.meshSoftCap(),
  });
});

module.exports = router;
