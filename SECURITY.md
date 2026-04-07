# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in SLM Mesh, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities.
2. Open a GitHub issue with the `security` label and a brief, non-detailed description.
3. Alternatively, contact the maintainer directly via the repository.

## Response Timeline

- **Acknowledgment:** Within 48 hours
- **Assessment:** Within 1 week
- **Fix:** Depends on severity (Critical: 48h, High: 1 week, Medium: 2 weeks)

## Security Model

SLM Mesh is designed for single-machine, single-user use. See [docs/security.md](docs/security.md) for the full security model, threat model, and architecture decisions.

## Key Security Features

- Localhost-only binding (cannot bind to 0.0.0.0)
- Bearer token authentication on all API endpoints
- No shell injection (execFileSync with argument arrays)
- Input validation (UUID peer IDs, payload size limits, rate limiting)
- File permissions (0o600 for sensitive files, 0o700 for directories)
- No telemetry or external data transmission
