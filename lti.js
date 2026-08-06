/**
 * LTI 1.3 tool config + JWKS scaffold (production login still platform-owned).
 */
const express = require("express");
const crypto = require("crypto");
const router = express.Router();

function toolBase() {
  return (
    process.env.LTI_TOOL_BASE ||
    process.env.CLIENT_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function apiBase(req) {
  if (process.env.LTI_API_BASE) return process.env.LTI_API_BASE.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}`;
}

router.get("/config", (req, res) => {
  const api = apiBase(req);
  res.json({
    status: process.env.LTI_ENABLED === "1" ? "enabled" : "planned",
    version: "1.3",
    toolName: "QuantumMeet Classroom",
    loginUrl: `${api}/api/lti/login`,
    launchUrl: `${api}/api/lti/launch`,
    jwksUrl: `${api}/api/lti/jwks`,
    redirectUris: [`${toolBase()}/classroom`],
    claims: ["sub", "email", "name", "https://purl.imsglobal.org/spec/lti/claim/roles"],
  });
});

router.get("/login", (req, res) => {
  if (process.env.LTI_ENABLED !== "1") {
    return res.status(501).json({
      error: "LTI login not enabled",
      code: "LTI_NOT_ENABLED",
      hint: "Set LTI_ENABLED=1 and configure platform registration",
    });
  }
  const target = `${toolBase()}/login?lti=1`;
  res.redirect(302, target);
});

router.post("/launch", (req, res) => {
  if (process.env.LTI_ENABLED !== "1") {
    return res.status(501).json({
      error: "LTI launch not enabled",
      code: "LTI_NOT_ENABLED",
    });
  }
  // Production: validate id_token JWT against platform JWKS.
  res.status(501).json({
    error: "LTI id_token validation pending platform keys",
    code: "LTI_TOKEN_PENDING",
  });
});

router.get("/jwks", (_req, res) => {
  // Optional static key for tool-side signing when LTI_PRIVATE_JWK is set.
  try {
    if (process.env.LTI_PUBLIC_JWK) {
      return res.json({ keys: [JSON.parse(process.env.LTI_PUBLIC_JWK)] });
    }
  } catch {
    /* fall through */
  }
  res.json({
    keys: [],
    note: "Provide LTI_PUBLIC_JWK for production tool JWKS",
  });
});

module.exports = router;
