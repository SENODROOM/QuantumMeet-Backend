/**
 * Server-side ICE config (E-101 light).
 * Prefer ICE_SERVERS JSON in server env so TURN creds are not baked into the SPA.
 */

const DEFAULT_STUN = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

function parseIceServers(raw = process.env.ICE_SERVERS) {
  if (!raw || !String(raw).trim()) return DEFAULT_STUN;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return DEFAULT_STUN;
    return parsed.filter((s) => s && (s.urls || s.url));
  } catch {
    return DEFAULT_STUN;
  }
}

function hasTurn(servers) {
  return servers.some((s) => {
    const u = s.urls || s.url;
    const list = Array.isArray(u) ? u : [u];
    return list.some(
      (x) => String(x).startsWith("turn:") || String(x).startsWith("turns:"),
    );
  });
}

function getIceConfig() {
  const iceServers = parseIceServers();
  return {
    iceServers,
    hasTurn: hasTurn(iceServers),
  };
}

module.exports = { getIceConfig, parseIceServers, DEFAULT_STUN };
