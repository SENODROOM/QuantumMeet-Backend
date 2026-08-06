# QuantumMeet Server

Express REST API for **QuantumMeet**. Runs locally with `node`/`nodemon` and deploys as a **Vercel serverless** function. Signaling and room fan-out use a **Mongo-backed event bus** (clients short-poll); durable meeting state also lives in MongoDB. Media is peer-to-peer WebRTC — not relayed here.

## Responsibilities

1. **REST API** — rooms, chat, polls, Q&A, breakouts, knocks, SecretMeet queue, classroom LMS
2. **Event bus** — `POST/GET /api/rooms/:roomId/events` for WebRTC signaling, whiteboard, and post-write fan-out
3. **Presence** — heartbeat membership for peer discovery and public room counts
4. **SecretMeet inbox** — `GET /api/secret/inbox` for match notifications
5. **Persistence** — Mongo models with TTL; connection cached for warm lambdas
6. **Classroom uploads** — Vercel Blob client upload tokens

## Built With

- Node.js + Express
- Mongoose / MongoDB
- `@vercel/blob` (classroom files)
- JWT (classroom auth)

## Local setup

```bash
npm install
cp .env.example .env
```

Required env (see `.env.example`):

| Variable | Purpose |
|---|---|
| `MONGO_URI` | Mongo connection (required for signaling + shared state) |
| `CLIENT_URL` | CORS primary origin |
| `JWT_SECRET` | Classroom auth |
| `BLOB_READ_WRITE_TOKEN` | Classroom uploads (local) |
| `EXTRA_ALLOWED_ORIGINS` | Optional extra CORS origins |

```bash
npm run dev   # nodemon → http://localhost:5000
npm start     # node
```

Health check: `GET /api/health`

## Vercel deploy

- Project root: `server/`
- Config: `vercel.json` rewrites all paths to `index.js`
- Set the same env vars in the Vercel project (Blob token is injected when Blob storage is enabled)

Login rate limiting uses the default in-memory store (per instance, not shared across lambdas).

---

<p align="center">The API powering QuantumMeet on Vercel</p>
