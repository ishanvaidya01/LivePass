# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| `main` (latest commit) | Yes |
| Older commits / tags | No |

LivePass is maintained on a best-effort basis. Security fixes are applied to the latest `main` branch.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Use one of the following private channels:

1. **GitHub Security Advisories** — open a private report from the repository's *Security* tab.
2. **Email** — [ishan.vaidya01@gmail.com](mailto:ishan.vaidya01@gmail.com) with the subject `[LivePass Security]`.

Please include:

- A description of the issue and its impact.
- Steps to reproduce or a proof of concept.
- Affected endpoint, component, or commit.
- Any suggested remediation.

You can expect an acknowledgement within a few days. Please give the maintainer a reasonable window to investigate and release a fix before disclosing the issue publicly.

## Scope

In scope:

- Authentication and authorization bypasses (JWT handling, role checks).
- QR token forgery, replay, or cross-event reuse.
- Capacity/overselling races and check-in idempotency flaws.
- Injection, SSRF, and unsafe file handling in the API.
- Leakage of secrets or personal data through the application or repository.

Out of scope:

- Denial of service through extreme traffic without a concrete application-level flaw.
- Issues in third-party dependencies that are already publicly known (report upstream).
- Findings that require physical access to an attendee's unlocked device.
- Social engineering of maintainers or users.

## Secure Deployment Checklist

- Set a strong, unique `JWT_SECRET`; the built-in fallback is for local development only.
- Serve the API and frontend over HTTPS; use `wss://` for Socket.IO.
- Restrict CORS and Socket.IO origins to trusted frontend domains.
- Store `backend/.env` and `frontend/.env` outside version control.
- Rotate the Gemini/Qwen API keys if they are ever exposed.
- Back up PostgreSQL and restrict network access to the database.

## Disclosure Policy

Once a fix is available, the maintainer will publish a patched release and credit the reporter unless anonymity is requested.
