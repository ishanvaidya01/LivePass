# Contributing to LivePass

Thanks for taking the time to improve LivePass. This document covers the local setup, conventions, and pull-request expectations.

## Code of Conduct

By participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Report unacceptable behavior to ishan.vaidya01@gmail.com.

## Getting Started

1. Fork the repository and clone your fork.
2. Follow the setup instructions in [README.md](README.md#getting-started).
3. Create a branch from `main`:

   ```bash
   git checkout -b feat/event-waitlist
   # or
   git checkout -b fix/scanner-queue-retry
   ```

## Development Checks

Run these before opening a pull request:

```bash
# Frontend
cd frontend
npm install
npm run lint
npm run build

# Backend
cd backend
python -m compileall app
```

Manual smoke test (recommended for any behavior change):

1. Start PostgreSQL, the Flask server, and the Vite dev server.
2. Sign up as an organizer and create a small-capacity event.
3. Sign up as an attendee in another browser profile and register.
4. Open the scanner and verify a successful check-in appears on the organizer dashboard in real time.
5. Disable the network in DevTools during a scan and confirm the scan is queued and later synced.

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add waitlist promotion for full events
fix: reject expired QR tokens on manual check-in
docs: clarify environment variables
refactor: extract capacity guard into a service
test: add registration concurrency test
chore: bump frontend dependencies
```

Keep the subject in the imperative mood and under ~72 characters. Reference issues in the body when relevant.

## Coding Guidelines

### Backend (Python / Flask)

- Keep route handlers thin; put business logic in `app/services/` or focused helpers.
- Register new endpoints on the existing blueprints in `app/routes/`.
- Use the existing `require_auth` / `require_role` decorators instead of ad-hoc JWT parsing.
- Wrap multi-row writes in a transaction and preserve the locking strategy used by registration.
- Never log secrets or full tokens.

### Frontend (React / Vite)

- Use function components and hooks; keep data fetching in `src/services/api.js`.
- Keep the offline scan queue logic in `src/hooks/useScanQueue.js` and `src/lib/idb.js`.
- Prefer small, composable components and Tailwind utility classes consistent with the existing design.
- Run `npm run lint` before committing.

## Pull Request Checklist

- [ ] The change is focused on one problem.
- [ ] `npm run lint` and `npm run build` pass.
- [ ] New environment variables are documented in the relevant `.env.example` and README table.
- [ ] No `.env`, credentials, database dumps, or build artifacts are committed.
- [ ] The PR description explains the change, the motivation, and how it was tested.
- [ ] Screenshots or a short recording are attached for UI changes.

## Reporting Bugs and Requesting Features

Use the GitHub issue templates. Include reproduction steps, expected vs. actual behavior, browser/OS versions, and relevant logs with secrets removed.

## Security

Do not open public issues for security problems. Follow [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the project's [MIT License](LICENSE).
