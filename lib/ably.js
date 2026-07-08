const Ably = require("ably");

let rest;
function getAbly() {
  if (!rest) rest = new Ably.Rest({ key: process.env.ABLY_API_KEY });
  return rest;
}

// One-off REST publish — safe to call per-request from a serverless handler,
// does not keep a connection open.
async function publish(channelName, event, payload) {
  await getAbly().channels.get(channelName).publish(event, payload);
}

// Scoped token for a client to subscribe/publish/enter-presence on exactly
// the channels it's allowed to touch. Short TTL (Ably default ~60min); the
// client SDK is configured with an authCallback so it re-hits our token
// endpoint before expiry instead of using a single throwaway token.
async function createTokenRequest(clientId, capability) {
  return getAbly().auth.createTokenRequest({
    clientId,
    capability: JSON.stringify(capability),
  });
}

module.exports = { getAbly, publish, createTokenRequest };
