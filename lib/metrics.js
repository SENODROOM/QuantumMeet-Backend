/**
 * Tiny in-process counters for /api/health (E-105 light).
 * Per-instance only on serverless — still useful for smoke + local SLO checks.
 */
const counts = {
  eventsPublished: 0,
  eventsListed: 0,
  eventsRejected: 0,
  startedAt: new Date().toISOString(),
};

function inc(key, n = 1) {
  if (counts[key] != null) counts[key] += n;
}

function snapshot() {
  return { ...counts };
}

module.exports = { inc, snapshot };
