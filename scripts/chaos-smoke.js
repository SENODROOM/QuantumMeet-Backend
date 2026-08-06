/**
 * Light chaos smoke — hit health/ice/sfu without requiring a live call.
 * Usage: node scripts/chaos-smoke.js [baseUrl]
 */
const base = process.argv[2] || "http://localhost:5000";

async function check(path) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}${path}`);
    const body = await res.json().catch(() => ({}));
    return { path, status: res.status, ms: Date.now() - t0, body };
  } catch (err) {
    return { path, status: 0, ms: Date.now() - t0, error: err.message };
  }
}

async function main() {
  const rows = await Promise.all([
    check("/api/health"),
    check("/api/ice"),
    check("/api/sfu/health"),
    check("/api/growth/cost/mau"),
  ]);
  const ok =
    rows.every((r) => r.status) &&
    rows.find((r) => r.path === "/api/sfu/health")?.body?.policy === "mesh_only";
  console.log(JSON.stringify({ ok, rows }, null, 2));
  if (!ok) process.exit(1);
}

main();
