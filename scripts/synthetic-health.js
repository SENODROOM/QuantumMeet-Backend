/**
 * Synthetic staging/prod probe (E-108 light).
 * Usage: BASE_URL=https://api.example.com node scripts/synthetic-health.js
 */
const base = (process.env.BASE_URL || "http://localhost:5000").replace(/\/$/, "");

async function check(path) {
  const res = await fetch(`${base}${path}`);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { path, status: res.status, body, requestId: res.headers.get("x-request-id") };
}

async function main() {
  const health = await check("/api/health");
  const ice = await check("/api/ice");
  const ok =
    health.status === 200 &&
    health.body?.status === "ok" &&
    ice.status === 200 &&
    Array.isArray(ice.body?.iceServers);

  console.log(JSON.stringify({ ok, health, ice }, null, 2));
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, err: String(err.message || err) }));
  process.exit(1);
});
