<div align="center">

# LivePass

**Real-time, concurrency-safe event check-in for large-scale events.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.x-000000?logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

## Overview

LivePass is a full-stack event registration and check-in platform built for high-traffic events and hackathons. Organizers publish events, attendees register and receive a rotating QR ticket, and volunteers scan tickets at the gate from a web app that keeps working when the venue network does not.

The system is designed around three hard problems:

1. **Overselling under load** — hundreds of attendees racing for the last seats must never exceed capacity.
2. **Unreliable venue connectivity** — scans must be queued locally and reconciled later.
3. **Ticket fraud** — static QR screenshots must become useless within seconds.

## Key Features

- **Concurrency-safe registration** — capacity is enforced inside a PostgreSQL transaction using row-level locking (`SELECT ... FOR UPDATE`), so simultaneous registrations cannot oversell an event.
- **Rotating QR tickets** — each active registration exposes a short-lived signed token that the attendee app refreshes automatically; previously issued tokens are rejected as outdated.
- **Offline-first scanning** — the scanner stores pending check-ins in IndexedDB and drains the queue when connectivity returns, with retry limits and per-scan status tracking.
- **Live organizer dashboard** — Flask-SocketIO rooms push `checkin_success`, `new_registration`, and ticket validation events to open dashboards without polling.
- **Role-based access control** — JWT authentication with `ORGANIZER` and `ATTENDEE` roles enforced per route.
- **Manual check-in and cancellation** — organizers can check in walk-ups or recover missed scans; attendees can cancel registrations.
- **CSV export and audit trail** — attendance export for organizers and an `AuditLog` record for every check-in action.
- **AI insights (optional)** — a Gemini-backed summary of capacity and turnout, with a deterministic rule-based fallback when no API key is configured.

## Architecture

```mermaid
flowchart LR
    subgraph Browser
        UI[React 19 + Vite SPA]
        IDB[(IndexedDB\nscan queue)]
    end

    subgraph Server
        API[Flask REST API\n/api/*]
        WS[Flask-SocketIO]
        AI[AI insights service]
    end

    DB[(PostgreSQL)]
    LLM[Google Gemini API\noptional]

    UI -- HTTPS / JSON --> API
    UI <-- WebSocket events --> WS
    UI --- IDB
    API --> DB
    WS --> DB
    API --> AI
    AI --> LLM
```

**Request flow**

1. An organizer creates an event (`POST /api/events`); the capacity is stored on the event row.
2. An attendee registers (`POST /api/events/:id/register`). The handler locks the event row, re-checks capacity, and commits a registration + audit entry.
3. The attendee app requests a rotating token (`GET /api/registrations/:id/token`) and renders it as a QR code.
4. A volunteer scans the QR. If the network is available the scan posts immediately; otherwise it is written to IndexedDB with a local idempotency key and replayed by the queue worker.
5. The backend validates the token against the stored record and expiry, records the check-in, and emits `checkin_success` to the organizer dashboard room.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, React Router 7, Vite 8, Tailwind CSS 3 |
| QR & storage | `html5-qrcode`, `qrcode`, IndexedDB via `idb` |
| Realtime | Socket.IO (client + Flask-SocketIO) |
| Backend | Python 3.10+, Flask, Flask-JWT-Extended, Flask-SQLAlchemy |
| Database | PostgreSQL 15 |
| AI | Google Gemini API (optional, rule-based fallback) |
| Tooling | oxlint, pip / venv, npm |

## Repository Structure

```text
LivePass/
├── backend/
│   ├── app/
│   │   ├── __init__.py          # App factory, JWT/Socket.IO setup, blueprint registration
│   │   ├── models.py            # SQLAlchemy models and enums
│   │   ├── routes/              # auth, events, registrations, scan blueprints
│   │   ├── services/            # AI insight generation
│   │   └── utils/               # Auth decorators and helpers
│   ├── prisma/                  # Legacy schema/migrations (not used by the Flask app)
│   ├── requirements.txt
│   └── run.py                   # Socket.IO development server (port 5000)
├── frontend/
│   ├── src/
│   │   ├── pages/               # Login, Register, dashboards, scanner, ticket view
│   │   ├── hooks/useScanQueue.js
│   │   ├── lib/idb.js
│   │   └── services/api.js
│   └── package.json
├── scripts/                     # Optional TypeScript API/load-test utilities
├── docker-compose.yml           # Legacy compose file (see Deployment)
└── README.md
```

## Getting Started

### Prerequisites

| Requirement | Version |
| --- | --- |
| Python | 3.10+ |
| Node.js | `^20.19.0` or `>=22.12.0` (required by Vite 8) |
| PostgreSQL | 14+ (15 recommended) |
| npm | 10+ |

### 1. Clone the repository

```bash
git clone https://github.com/ishanvaidya01/LivePass.git
cd LivePass
```

### 2. Create the database

```bash
createdb livepass_db
# or: psql -U postgres -c "CREATE DATABASE livepass_db;"
```

Tables are created automatically on the first backend start (`db.create_all()`), so no manual migration step is required.

### 3. Configure and run the backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env        # then edit the values
python run.py
```

The API and Socket.IO server listen on **http://localhost:5000**.

### 4. Configure and run the frontend

```bash
cd frontend
npm install
cp .env.example .env        # then edit the values if your API is elsewhere
npm run dev
```

Open **http://localhost:5173**. Create an `ORGANIZER` account to publish events and open the scanner, or an `ATTENDEE` account to register and receive a ticket.

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string, e.g. `postgresql://postgres:password@localhost:5432/livepass_db` |
| `JWT_SECRET` | Yes | Secret used to sign access tokens and QR payloads. Use a long random value in production. |
| `GEMINI_API_KEY` | No | Enables AI-generated organizer insights. Without it, the rule-based fallback is used. |
| `QWEN_API_KEY` | No | Alternative key read as a fallback by the insights service. |
| `PORT` | No | Reserved for deployment; `run.py` binds port 5000. |
| `FRONTEND_URL` | No | Reserved for deployment/CORS configuration. |

> **Security:** the app falls back to a development JWT secret if `JWT_SECRET` is missing. Always set a strong value outside local development.

### Frontend (`frontend/.env`)

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_API_URL` | Yes | REST base URL, e.g. `http://127.0.0.1:5000/api` |
| `VITE_SOCKET_URL` | Yes | Socket.IO origin, e.g. `http://127.0.0.1:5000` |

## API Reference

All endpoints are prefixed with `/api`. Protected routes expect `Authorization: Bearer <token>`; the JWT is also accepted as a `token` query parameter for QR links.

### Authentication

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `POST` | `/auth/signup` | Public | Create an account (`name`, `email`, `password`, `role`) and receive a JWT |
| `POST` | `/auth/login` | Public | Authenticate and receive a JWT |

### Events

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/events` | Public | List events |
| `GET` | `/events/:id` | Public | Get event details and registration count |
| `POST` | `/events` | Organizer | Create an event |
| `DELETE` | `/events/:id` | Organizer | Delete an event and its registrations |
| `POST` | `/events/:id/register` | Attendee | Register for an event (capacity-locked) |
| `GET` | `/events/:id/checkins` | Organizer | Recent check-ins for the dashboard |
| `GET` | `/events/:id/insights` | Organizer | AI or rule-based attendance insights |
| `GET` | `/events/:id/export` | Organizer | Download attendance as CSV |

### Registrations

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/registrations/me` | Authenticated | List the caller's registrations |
| `POST` | `/registrations/:id/cancel` | Authenticated | Cancel a registration |
| `POST` | `/registrations/:id/manual-checkin` | Organizer | Manually check in an attendee |
| `GET` | `/registrations/:id/token` | Authenticated | Issue/refresh the rotating QR token |

### Scanning

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `POST` | `/events/:id/scan` | Organizer | Validate a QR token and record a check-in |

### Socket.IO events

| Direction | Event | Room | Purpose |
| --- | --- | --- | --- |
| Client → server | `join_event` | `event:<id>:dashboard` | Subscribe the organizer dashboard to live updates |
| Client → server | `join_ticket` | `ticket:<registrationId>` | Subscribe a ticket view to validation errors |
| Server → client | `checkin_success` | event dashboard | A ticket was checked in |
| Server → client | `new_registration` | event dashboard | A new attendee registered |
| Server → client | `event_created` | broadcast | An event was published |
| Server → client | `ticket_verified` | ticket room | The attendee's ticket was accepted |
| Server → client | `ticket_error` | ticket room | The token was invalid, expired, or from another event |

## Data Model

| Model | Purpose |
| --- | --- |
| `User` | Account with hashed password and `ORGANIZER` / `ATTENDEE` role |
| `Event` | Event metadata, capacity, status, and denormalized registration count |
| `Registration` | Attendee ↔ event link with status (`REGISTERED`, `CANCELLED`, `NO_SHOW`, `WAITLISTED`) |
| `CheckInToken` | Current rotating token and expiry for a registration |
| `CheckIn` | Immutable check-in record with source (`SCAN`, `MANUAL`) |
| `AuditLog` | Action history for check-ins and administrative operations |

## Development

```bash
# Frontend lint
cd frontend && npm run lint

# Frontend production build
cd frontend && npm run build

# Backend syntax check
cd backend && python -m compileall app
```

There is currently no automated backend test suite. The optional TypeScript utilities under `scripts/` can be used for API smoke testing and load experiments; install them with `npm install` inside `scripts/`.

## Deployment

- **Backend:** run behind a WSGI server with WebSocket support (the pinned `gunicorn` + `gevent-websocket` dependencies are included) or a platform that supports Flask-SocketIO.
- **Frontend:** `npm run build` emits a static bundle in `frontend/dist/` that can be served by any static host. Set `VITE_API_URL` and `VITE_SOCKET_URL` to the public backend origin at build time.
- **Database:** managed PostgreSQL with automatic backups. Run `db.create_all()` on first boot or manage the schema with your migration tool of choice.
- **Realtime:** if the frontend and backend are on different origins, terminate TLS at a proxy that supports WebSocket upgrades and configure CORS/Socket.IO origins for production.

> **Note:** the committed `docker-compose.yml` predates the current Flask/Vite architecture (it references Node-style volumes and a backend Dockerfile that is not present). It is not a supported deployment path today; use the manual setup above.

## Security Notes

- QR payloads are signed and bound to a registration and event; stale tokens are rejected by comparing the stored token value.
- Registration capacity checks and check-in writes run inside database transactions.
- JWTs carry `userId` and `role` claims and are validated by route decorators.
- Never commit `backend/.env` or `frontend/.env`; only the `.env.example` files belong in git.

To report a vulnerability, follow [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before opening a pull request.

1. Fork the repository and create a branch: `feat/short-description` or `fix/short-description`.
2. Keep changes focused and run the lint/build checks above.
3. Describe the behavior change and how you verified it in the pull request.

## License

Released under the [MIT License](LICENSE).

## Acknowledgements

- [Flask](https://flask.palletsprojects.com/), [Flask-SocketIO](https://flask-socketio.readthedocs.io/), [SQLAlchemy](https://www.sqlalchemy.org/)
- [React](https://react.dev/), [Vite](https://vite.dev/), [Tailwind CSS](https://tailwindcss.com/)
- [html5-qrcode](https://github.com/mebjas/html5-qrcode) and [idb](https://github.com/jakearchibald/idb)

## Contact

Maintainer: **Ishan Vaidya** — [ishan.vaidya01@gmail.com](mailto:ishan.vaidya01@gmail.com)

Repository: [github.com/ishanvaidya01/LivePass](https://github.com/ishanvaidya01/LivePass)
