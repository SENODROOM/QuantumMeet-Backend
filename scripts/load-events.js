/**
 * Lightweight event-bus load harness (Y2).
 * Usage: node scripts/load-events.js [baseUrl] [roomId] [concurrency]
 */
const base = process.argv[2] || "http://localhost:5000";
const roomId = process.argv[3] || "load-test-room";
const n = Number(process.argv[4] || 20);

async function one(i) {
  const from = "load-" + i;
  const t0 = Date.now();
  await fetch(`${base}/api/rooms/${roomId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "ice-candidate",
      from,
      payload: { candidate: "fake", to: "load-0" },
    }),
  });
  const res = await fetch(
    `${base}/api/rooms/${roomId}/events?userId=load-0&since=${new Date(0).toISOString()}`,
  );
  const ms = Date.now() - t0;
  return { ok: res.ok, ms };
}

(async () => {
  const results = await Promise.all(
    Array.from({ length: n }, (_, i) => one(i)),
  );
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95)] || times[times.length - 1];
  console.log(
    JSON.stringify(
      {
        n,
        ok: results.filter((r) => r.ok).length,
        p50: times[Math.floor(times.length * 0.5)],
        p95,
      },
      null,
      2,
    ),
  );
})();
