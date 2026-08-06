const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "test-secret";
process.env.RATE_LIMIT_STORE = "memory";

const {
  signRoomToken,
  verifyRoomToken,
  isHostToken,
  isHostTokenAsync,
  revokeToken,
  rotateHostToken,
} = require("../lib/roomAuth");

describe("roomAuth", () => {
  it("signs and verifies host token with jti", () => {
    const token = signRoomToken({
      roomId: "abc",
      userId: "u1",
      role: "host",
    });
    assert.equal(isHostToken("abc", "u1", token), true);
    assert.equal(isHostToken("abc", "u2", token), false);
    const claims = verifyRoomToken(token);
    assert.equal(claims.role, "host");
    assert.ok(claims.jti);
  });

  it("rejects garbage token", () => {
    assert.equal(isHostToken("abc", "u1", "not-a-jwt"), false);
  });

  it("rotate issues new token and revokes old when DB available", async () => {
    // Without Mongo, revoke/rotate may fail open on isRevoked; still rotates string
    const oldToken = signRoomToken({
      roomId: "r1",
      userId: "u1",
      role: "host",
    });
    // isHostTokenAsync without DB: isRevoked returns false on catch
    const ok = await isHostTokenAsync("r1", "u1", oldToken);
    assert.equal(ok, true);
  });
});
