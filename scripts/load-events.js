/**
 * Lightweight event-bus load harness (E-104).
 * Usage: node scripts/load-events.js [baseUrl] [roomId] [concurrency] [rounds]
 */
const base = process.argv[2] || "http://localhost:5000";
const roomId = process.argv[3] || "load-test-room";
const n = Number(process.argv[4] || 20);
const rounds = Number(process.argv[5] || 3);

async function one(i, round) {
  const from = `load-${i}`;
  const t0 = Date.now();
  const post = await fetch(`${base}/api/rooms/${roomId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "ice-candidate",
      from,
      payload: { candidate: `fake-${round}`, to: "load-0" },
    }),
  });
  const res = await fetch(
    `${base}/api/rooms/${roomId}/events?userId=load-0&since=${new Date(Date.now() - 60000).toISOString()}`,
  );
  const ms = Date.now() - t0;
  return { ok: post.ok && res.ok, ms, status: post.status };
}

(async () => {
  const all = [];
  for (let r = 0; r < rounds; r++) {
    const results = await Promise.all(
      Array.from({ length: n }, (_, i) => one(i, r)),
    );
    all.push(...results);
  }
  const times = all.map((x) => x.ms).sort((a, b) => a - b);
  const p = (q) => times[Math.min(times.length - 1, Math.floor(times.length * q))];
  console.log(
    JSON.stringify(
      {
        base,
        roomId,
        n,
        rounds,
        samples: all.length,
        ok: all.filter((x) => x.ok).length,
        fail: all.filter((x) => !x.ok).length,
        p50: p(0.5),
        p95: p(0.95),
        p99: p(0.99),
      },
      null,
      2,
    ),
  );
})();
