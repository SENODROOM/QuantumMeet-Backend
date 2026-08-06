const { randomUUID } = require("crypto");

/**
 * Attach X-Request-Id and echo it on the response (E-106 light).
 */
function requestIdMiddleware(req, res, next) {
  const id =
    (typeof req.headers["x-request-id"] === "string" &&
      req.headers["x-request-id"].slice(0, 64)) ||
    randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}

module.exports = { requestIdMiddleware };
