const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

process.env.RATE_LIMIT_STORE = "memory";
process.env.JWT_SECRET = "test-secret";

describe("health module contract", () => {
  it("exports an express app", () => {
    const app = require("../index");
    assert.equal(typeof app, "function");
    assert.equal(typeof app.handle, "function");
  });
});
