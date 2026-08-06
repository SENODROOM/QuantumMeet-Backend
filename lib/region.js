/**
 * Region / multi-region helpers (E-601 / E-602).
 */
function primaryRegion() {
  return (
    process.env.ATLAS_PRIMARY_REGION ||
    process.env.QM_REGION ||
    process.env.VERCEL_REGION ||
    "unknown"
  );
}

function secondaryRegions() {
  return (process.env.ATLAS_SECONDARY_REGIONS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function regionSnapshot() {
  return {
    primary: primaryRegion(),
    secondaries: secondaryRegions(),
    multiRegionConfigured: secondaryRegions().length > 0,
  };
}

/** Attach X-QM-Region on every response */
function regionMiddleware(_req, res, next) {
  res.setHeader("X-QM-Region", primaryRegion());
  next();
}

module.exports = {
  primaryRegion,
  secondaryRegions,
  regionSnapshot,
  regionMiddleware,
};
