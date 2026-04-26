# Releasing

How to ship a new version of `archik` to npm. Not shipped in the
published tarball — this is a contributor-facing doc.

## TL;DR

```bash
npm version patch                      # 0.1.1 → 0.1.2 (or `minor` / `major`)
git push origin main --follow-tags     # pushes the commit AND the tag
```

The tag push triggers `.github/workflows/publish.yml`, which runs
`prepublishOnly` (typecheck + tests + build) and then `npm publish
--access public --provenance`. You don't run `npm publish` from
your laptop — CI does it via OIDC.

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

When the workflow turns green, verify:

```bash
npm view archik version    # should print the version you just pushed
npx -y archik@latest --help
```

## Why there's no NPM_TOKEN

Authentication runs through **npm Trusted Publishing** (OIDC). Configured
once on https://www.npmjs.com/package/archik/access — GitHub Actions /
`bacharSalleh` / `archik` / `publish.yml` / no environment.

When the workflow runs, GitHub mints a short-lived OIDC token, the npm
CLI exchanges it for publish credentials, the publish happens, the
credentials evaporate. Nothing long-lived sits in the repo or CI
secrets. If your laptop or `~/.npmrc` ever leaks, no one can publish
to `archik` from it.

## First-publish bootstrap (historical)

`v0.1.0` had to be published manually from the laptop with a granular
access token, because Trusted Publishing can only be configured for a
package that already exists. The token was deleted from npm immediately
after, and Trusted Publishing was wired before `v0.1.1`. Nothing to
remember unless you ever republish under a new package name.

## Troubleshooting

**"You must be logged in to publish packages"** in CI →
Trusted Publishing isn't wired. Check
https://www.npmjs.com/package/archik/access has the GitHub Actions
publisher row with workflow `publish.yml` and **no** environment
field set.

**OIDC works but `--provenance` fails** →
Older Node images sometimes ship an npm CLI with flaky OIDC support.
Bump `node-version: "20"` to `"22"` in
`.github/workflows/publish.yml` and re-run.

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
