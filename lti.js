/**
 * LTI 1.3 stub (E-704). Full launch/OIDC login not implemented.
 */
const express = require("express");
const router = express.Router();

router.get("/config", (_req, res) => {
  res.json({
    status: "planned",
    version: "1.3",
    toolName: "QuantumMeet Classroom",
    loginUrl: "/api/lti/login",
    launchUrl: "/api/lti/launch",
    jwksUrl: "/api/lti/jwks",
  });
});

router.get("/login", (_req, res) => {
  res.status(501).json({
    error: "LTI login not implemented",
    code: "LTI_NOT_IMPLEMENTED",
  });
});

router.post("/launch", (_req, res) => {
  res.status(501).json({
    error: "LTI launch not implemented",
    code: "LTI_NOT_IMPLEMENTED",
  });
});

router.get("/jwks", (_req, res) => {
  res.json({ keys: [] });
});

module.exports = router;
