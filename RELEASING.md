# Releasing

How to ship a new version of `archik` to npm. Not shipped in the
published tarball — this is a contributor-facing doc.

## TL;DR

```bash
npm version patch                      # 0.1.1 → 0.1.2 (or `minor` / `major`)
git push origin main --follow-tags     # pushes the commit AND the tag
```

The tag push triggers `.github/workflows/publish.yml`, which:

1. Runs `prepublishOnly` (typecheck + tests + build).
2. Runs `npm publish --access public` over OIDC (Trusted Publishing).
3. Creates a **GitHub Release** on the tag, with notes auto-pulled
   from the matching `## [x.y.z]` section in [`CHANGELOG.md`](./CHANGELOG.md).
   Falls back to GitHub's auto-generated PR/commit summary when the
   changelog has no matching section.

You don't run `npm publish` from your laptop. CI does it.

## Bump levels

| Command | Example | Use when |
|---|---|---|
| `npm version patch` | 0.1.1 → 0.1.2 | bug fixes, doc tweaks, no API change |
| `npm version minor` | 0.1.1 → 0.2.0 | new commands / features, backwards compatible |
| `npm version major` | 0.1.1 → 1.0.0 | breaking changes (renamed flag, removed command, schema bump) |

`npm version` does four things atomically:

1. Updates `version` in `package.json`
2. Updates `package-lock.json`
3. Creates a commit named `v0.1.2`
4. Creates an annotated git tag `v0.1.2`

## Pushing

```bash
# Push commit + tag in one go (recommended)
git push origin main --follow-tags

# Or two separate pushes if you prefer being explicit
git push origin main
git push origin v0.1.2
```

To make `--follow-tags` the default everywhere:
```bash
git config --global push.followTags true
```

## Watching the publish

- Workflow runs: https://github.com/bacharSalleh/archik/actions
- npm package: https://www.npmjs.com/package/archik
- GitHub Releases: https://github.com/bacharSalleh/archik/releases

When the workflow turns green, verify:

```bash
npm view archik version    # should print the version you just pushed
npx -y archik@latest --help
```

## Releases page (auto-populated)

Every successful `publish.yml` run also creates a GitHub Release
on the tag. The body is built from:

1. The matching `## [x.y.z] - YYYY-MM-DD` section in
   `CHANGELOG.md`. **Update the changelog before tagging** so the
   release page mirrors what shipped.
2. GitHub's auto-generated PR/commit list for the range
   `prev-tag..this-tag`, appended below the changelog excerpt.

If you forget the changelog update, you can edit the release on
GitHub later — `gh release edit v0.6.x --notes-file -` reads from
stdin if you pipe in a fresh excerpt.

## Manual release (rarely needed)

If CI is down or you need to ship from your laptop, the same steps
manually:

```bash
npm run typecheck && npm test && npm run build
npm publish --access public
gh release create v0.6.x --generate-notes --latest
```

You'll need npm CLI ≥ 11.5.1 and a granular access token (Trusted
Publishing only works from CI). Avoid this path — leak risk.

## Why there's no NPM_TOKEN

Authentication runs through **npm Trusted Publishing** (OIDC). Configured
once on https://www.npmjs.com/package/archik/access — GitHub Actions /
`bacharSalleh` / `archik` / `publish.yml` / no environment.

When the workflow runs, GitHub mints a short-lived OIDC token, the npm
CLI exchanges it for publish credentials, the publish happens, the
credentials evaporate. Nothing long-lived sits in the repo or CI
secrets. If your laptop or `~/.npmrc` ever leaks, no one can publish
to `archik` from it.

**Hard requirement: npm CLI ≥ 11.5.1.** Trusted Publishing's OIDC
handshake landed there. Node 20 ships with npm 10.x, which signs
provenance and then 404s on the actual `PUT` (because it doesn't yet
know how to fetch the GitHub OIDC token). The publish workflow
therefore runs `npm install -g npm@latest` before `npm publish`. Don't
remove that step.

## Provenance (sigstore attestations)

We pass `--provenance` to `npm publish`. Each release gets a
sigstore-signed attestation linking the tarball to the exact commit
+ workflow run that produced it, surfaced on npmjs.com under a
"Provenance" badge below the package name.

Provenance requires the source repo to be **public** — npm rejects
private-repo provenance with `E422 "Unsupported GitHub Actions
source repository visibility: 'private'"`. If you ever flip the
repo back to private, drop the `--provenance` flag from
`publish.yml` first or the publish will fail.

The `id-token: write` workflow permission is required for both
Trusted Publishing and provenance, so it's set unconditionally.

## First-publish bootstrap (historical)

`v0.1.0` had to be published manually from the laptop with a granular
access token, because Trusted Publishing can only be configured for a
package that already exists. The token was deleted from npm right
after, and Trusted Publishing was wired up.

`v0.1.1` was tagged but never made it to npm — it failed the OIDC
handshake (npm CLI too old, see above) and then failed the
`--provenance` check (private repo, see above). The two fixes landed
across `v0.1.2`. Nothing to remember unless you republish under a new
package name.

## Troubleshooting

**"You must be logged in to publish packages"** in CI →
Trusted Publishing isn't wired. Check
https://www.npmjs.com/package/archik/access has the GitHub Actions
publisher row with workflow `publish.yml` and **no** environment
field set.

**404 Not Found - PUT https://registry.npmjs.org/archik** →
The npm CLI in CI is too old for Trusted Publishing's OIDC exchange.
Confirm `npm install -g npm@latest` is still in `publish.yml` before
the publish step. If it is, the runner image may have a broken
update; pin to a known-good npm: `npm install -g npm@11.5.1`.

**E422 "Unsupported GitHub Actions source repository visibility:
'private'"** → You re-added `--provenance` to the publish command
without first making the repo public. Either drop the flag again
(see "Why we don't pass --provenance") or flip the repo to public.

**Tag points at the wrong commit (CI runs old code)** →
`git tag -l` lists tags. Move one with
`git tag -fa v0.1.2 -m "v0.1.2"` (force-replace the annotated tag),
then `git push origin v0.1.2 --force` (only do this if the tag was
**never published** to npm — npm versions are immutable, so a
re-tag of an already-published version is meaningless).

**Forgot to bump the version, tagged anyway** →
Delete the tag locally and on origin, bump properly, re-tag:
```bash
git tag -d v0.1.2
git push origin :refs/tags/v0.1.2
npm version patch                 # bumps + retags
git push origin main --follow-tags
```
