## Summary
<!-- One or two sentences. What does this PR change and why? -->

## Test plan
<!-- Markdown checklist of how you verified this works. Run them before opening the PR. -->

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `node bin/archik.js validate` passes (after any YAML edit)
- [ ] Manual sanity check in `npm run dev` (for canvas / UI changes)

## Architecture (`.archik/main.archik.yaml`) updated?
<!-- Did this PR add, remove, rename, or rewire a node/edge in the project? -->

- [ ] N/A — this PR doesn't change the component graph
- [ ] Yes — updated `.archik/main.archik.yaml` and re-ran `archik validate`

## Related issues
<!-- Closes #123, refs #456 -->
