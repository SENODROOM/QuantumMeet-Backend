const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const flags = require("../lib/featureFlags");

describe("featureFlags", () => {
  it("mesh soft cap defaults", () => {
    assert.ok(flags.meshSoftCap() > 0);
    assert.ok(flags.sfuThreshold() >= flags.meshSoftCap());
  });
});
