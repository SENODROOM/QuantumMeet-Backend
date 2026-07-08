require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const { connectDB } = require("./lib/db");

const app = express();

const allowedOrigins = [
  "https://meet.quantumlogicslimited.com",
  "https://www.meet.quantumlogicslimited.com",
  "http://localhost:3000",
  "http://localhost:5001",
];

// ── Security headers ──────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS: origin not allowed → " + origin));
      }
    },
    credentials: true,
  }),
);
app.options("*", cors());

app.use(express.json());

// ── DB connection (cached across warm serverless invocations) ────────────────
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.warn("⚠️  DB unavailable:", err.message);
    next();
  }
});

// ── Auth routes (public — no JWT required) ────────────────────────────────────
const authRouter = require("./routes/authRoutes");
app.use("/api/auth", authRouter);

// ── Classroom API (JWT protected — see classroom.js) ─────────────────────────
const classroomRouter = require("./classroom");
app.use("/api/classrooms", classroomRouter);

// ── Meeting rooms (login-free) ────────────────────────────────────────────────
const roomRealtimeRouter = require("./roomRealtime");
app.use("/api/rooms", roomRealtimeRouter);

// ── SecretMeet random pairing ─────────────────────────────────────────────────
const secretMeetRouter = require("./secretMeet");
app.use("/api/secret", secretMeetRouter);

// ── Ably token minting ────────────────────────────────────────────────────────
const realtimeTokenRouter = require("./realtimeToken");
app.use("/api/realtime", realtimeTokenRouter);

// Health check
app.get("/api/health", (_, res) =>
  res.json({ status: "ok", time: new Date() }),
);

// ─── Start (local dev only — Vercel imports `app` as the request handler) ────
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  connectDB()
    .then(() => {
      console.log("✅ MongoDB connected");
      app.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));
    })
    .catch((err) => {
      console.warn("⚠️  No DB, running without persistence:", err.message);
      app.listen(PORT, () =>
        console.log(`🚀 Server on http://localhost:${PORT} (no DB)`),
      );
    });
}

module.exports = app;
