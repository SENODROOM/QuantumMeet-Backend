/**
 * Event-bus load harness (short poll + optional long-poll).
 * Usage:
 *   node scripts/load-events.js [baseUrl] [roomId] [concurrency] [rounds]
 *   LONG_POLL=1 node scripts/load-events.js
 *   MODE=longpoll node scripts/load-events.js http://localhost:5000
 */
const base = (process.argv[2] || "http://localhost:5000").replace(/\/$/, "");
const roomId = process.argv[3] || "load-test-room";
const n = Number(process.argv[4] || 20);
const rounds = Number(process.argv[5] || 3);
const mode =
  process.env.MODE ||
  (process.env.LONG_POLL === "1" ? "longpoll" : "short");
const waitMs = Number(process.env.WAIT_MS || 15000);

function percentile(sorted, q) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

async function shortOne(i, round) {
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
  return { ok: post.ok && res.ok, ms: Date.now() - t0, status: post.status };
}

async function longPollOne(i) {
  const from = `lp-${i}`;
  const since = new Date().toISOString();
  // Fire a delayed publish so the waiter usually wakes with data
  const publishAt = setTimeout(() => {
    fetch(`${base}/api/rooms/${roomId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "offer",
        from,
        payload: { sdp: `probe-${i}`, to: "load-0" },
      }),
    }).catch(() => {});
  }, 200 + (i % 5) * 50);

  const t0 = Date.now();
  let ok = false;
  let status = 0;
  try {
    const res = await fetch(
      `${base}/api/rooms/${roomId}/events?userId=load-0&since=${encodeURIComponent(since)}&wait=${waitMs}`,
    );
    status = res.status;
    ok = res.ok;
  } catch {
    ok = false;
  }
  clearTimeout(publishAt);
  return { ok, ms: Date.now() - t0, status };
}

(async () => {
  const all = [];
  if (mode === "longpoll") {
    for (let r = 0; r < rounds; r++) {
      const results = await Promise.all(
        Array.from({ length: Math.min(n, 10) }, (_, i) => longPollOne(i + r * 10)),
      );
      all.push(...results);
    }
  } else {
    for (let r = 0; r < rounds; r++) {
      const results = await Promise.all(
        Array.from({ length: n }, (_, i) => shortOne(i, r)),
      );
      all.push(...results);
    }
  }

  const times = all.map((x) => x.ms).sort((a, b) => a - b);
  const p50 = percentile(times, 0.5);
  const p95 = percentile(times, 0.95);
  const p99 = percentile(times, 0.99);
  const slo =
    mode === "longpoll"
      ? {
          target: "hold ≤ 15–20s; wake promptly after publish",
          holdOk: p95 != null && p95 <= waitMs + 3000,
        }
      : {
          target: "list p95 < 300ms (no wait)",
          listOk: p95 != null && p95 < 300,
        };

  console.log(
    JSON.stringify(
      {
        mode,
        base,
        roomId,
        n,
        rounds,
        waitMs: mode === "longpoll" ? waitMs : undefined,
        samples: all.length,
        ok: all.filter((x) => x.ok).length,
        fail: all.filter((x) => !x.ok).length,
        p50,
        p95,
        p99,
        slo,
        verdict:
          mode === "longpoll"
            ? slo.holdOk
              ? "GO — long-poll within SLO budget"
              : "NO-GO — long-poll hold/latency over budget"
            : slo.listOk
              ? "GO — short list within SLO"
              : "NO-GO — short list p95 over 300ms (or server down)",
      },
      null,
      2,
    ),
  );
})();
