const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const {
  signRoomToken,
  isHostToken,
  verifyRoomToken,
} = require("../lib/roomAuth");

describe("roomAuth", () => {
  const prev = process.env.JWT_SECRET;
  before(() => {
    process.env.JWT_SECRET = "test-secret";
  });
  after(() => {
    process.env.JWT_SECRET = prev;
  });

  it("signs and verifies host token", () => {
    const token = signRoomToken({
      roomId: "abc",
      userId: "u1",
      role: "host",
    });
    assert.equal(isHostToken("abc", "u1", token), true);
    assert.equal(isHostToken("abc", "u2", token), false);
    assert.equal(isHostToken("xyz", "u1", token), false);
    const claims = verifyRoomToken(token);
    assert.equal(claims.role, "host");
  });

  it("rejects garbage token", () => {
    assert.equal(isHostToken("abc", "u1", "not-a-jwt"), false);
  });
});
