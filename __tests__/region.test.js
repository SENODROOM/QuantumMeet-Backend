const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { regionSnapshot, primaryRegion } = require("../lib/region");

describe("region", () => {
  it("exposes primary region from env", () => {
    const prev = process.env.ATLAS_PRIMARY_REGION;
    process.env.ATLAS_PRIMARY_REGION = "eu-west-1";
    assert.equal(primaryRegion(), "eu-west-1");
    const snap = regionSnapshot();
    assert.equal(snap.primary, "eu-west-1");
    if (prev === undefined) delete process.env.ATLAS_PRIMARY_REGION;
    else process.env.ATLAS_PRIMARY_REGION = prev;
  });
});
