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
  sfuEnabled: () => flag("FEATURE_SFU", false),
  meshSoftCap: () => Number(process.env.MESH_SOFT_CAP || 10),
  sfuThreshold: () => Number(process.env.SFU_THRESHOLD || 12),
  auditEnabled: () => flag("FEATURE_AUDIT", true),
  orgsEnabled: () => flag("FEATURE_ORGS", false),
};
