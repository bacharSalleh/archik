# Security Policy

## Reporting a Vulnerability

Please report security issues **privately** via [GitHub Security
Advisories](https://github.com/bacharSalleh/archik/security/advisories/new).
Do not open a public issue.

If GitHub Security Advisories aren't accessible to you, email
**bacharsalehov@gmail.com** with the details and a way to reach you.

We aim to:

- **Acknowledge** within 7 days.
- **Ship a fix or coordinate disclosure** within 30 days for confirmed
  vulnerabilities.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.6.x   | ✓                  |
| < 0.6   | ✗                  |

## Scope

In scope (please report):

- Code execution from a malicious YAML file the user opens.
- Path traversal in the per-file dev-server endpoint
  (`/__archik/file?path=…`).
- Cross-origin write to the local dev server (we already enforce
  loopback Host + same-origin Origin checks; bypasses count).
- Schema validation gaps that let a crafted YAML corrupt downstream
  rendering or produce misleading diffs.

Out of scope (please don't):

- Issues that require an attacker already on the same machine as the
  dev server. Loopback is the trust boundary; we don't try to defend
  against local-user attacks.
- Bugs in dependencies — please report them upstream. If the bug is
  reachable through archik's surface, link the upstream report when
  you tell us.
