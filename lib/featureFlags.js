/**
 * Feature flags for the 2-year upgrade path.
 * Override via env FEATURE_* = "1" | "0".
 */
function flag(name, defaultOn = false) {
  const v = process.env[name];
  if (v === undefined || v === "") return defaultOn;
  return v === "1" || v === "true" || v === "yes";
}

module.exports = {
  longPollEnabled: () => flag("FEATURE_LONG_POLL", true),
  /** Always false on Vercel mesh-only deploy — kept for API shape compatibility. */
  sfuEnabled: () => false,
  meshSoftCap: () => Number(process.env.MESH_SOFT_CAP || 10),
  sfuThreshold: () => Number(process.env.SFU_THRESHOLD || 12),
  auditEnabled: () => flag("FEATURE_AUDIT", true),
  orgsEnabled: () => flag("FEATURE_ORGS", false),
  ssoEnabled: () => flag("FEATURE_SSO", false),
  sfuVendor: () => null,
};
