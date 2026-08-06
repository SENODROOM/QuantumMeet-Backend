/**
 * Tiny in-process counters for /api/health.
 * Per-instance only on serverless — still useful for smoke + local SLO checks.
 */
const counts = {
  eventsPublished: 0,
  eventsListed: 0,
  eventsRejected: 0,
  wbDrawSegments: 0,
  wbDrawEvents: 0,
  cronPublished: 0,
  cronRuns: 0,
  startedAt: new Date().toISOString(),
};

function inc(key, n = 1) {
  if (counts[key] == null) counts[key] = 0;
  counts[key] += n;
}

function snapshot() {
  return { ...counts };
}

module.exports = { inc, snapshot };
