const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { getIceConfig, parseIceServers } = require("../lib/ice");

describe("ice", () => {
  it("defaults to STUN without ICE_SERVERS", () => {
    const prev = process.env.ICE_SERVERS;
    delete process.env.ICE_SERVERS;
    const cfg = getIceConfig();
    assert.equal(cfg.hasTurn, false);
    assert.ok(cfg.iceServers.length >= 1);
    if (prev !== undefined) process.env.ICE_SERVERS = prev;
  });

  it("detects TURN from env JSON", () => {
    const servers = parseIceServers(
      JSON.stringify([
        { urls: "stun:stun.l.google.com:19302" },
        {
          urls: "turn:turn.example.com:3478",
          username: "u",
          credential: "p",
        },
      ]),
    );
    assert.equal(
      servers.some((s) => String(s.urls).startsWith("turn:")),
      true,
    );
  });
});
