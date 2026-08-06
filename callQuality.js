/**
 * Lightweight call-quality / reconnect counters (client reports via POST).
 */
const express = require("express");
const metrics = require("./lib/metrics");

const router = express.Router();

router.post("/call-quality", (req, res) => {
  const { event } = req.body || {};
  const key =
    event === "join_ok"
      ? "callJoinOk"
      : event === "join_fail"
        ? "callJoinFail"
        : event === "reconnect_ok"
          ? "callReconnectOk"
          : event === "reconnect_fail"
            ? "callReconnectFail"
            : null;
  if (!key) {
    return res.status(400).json({ error: "event required" });
  }
  metrics.inc(key);
  res.json({ ok: true });
});

router.get("/call-quality", (_req, res) => {
  const s = metrics.snapshot();
  const ok = s.callJoinOk || 0;
  const fail = s.callJoinFail || 0;
  const total = ok + fail;
  res.json({
    joinOk: ok,
    joinFail: fail,
    successRate: total ? Number(((ok / total) * 100).toFixed(1)) : null,
    reconnectOk: s.callReconnectOk || 0,
    reconnectFail: s.callReconnectFail || 0,
  });
});

module.exports = router;
