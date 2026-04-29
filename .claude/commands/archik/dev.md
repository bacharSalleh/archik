---
description: Open the live canvas
---

# /archik:dev — open the archik canvas

The user wants the live archik canvas running so they can see the
diagram and review suggestions visually.

Run the CLI — do NOT spawn dev servers any other way:

```
npx archik status
```

If nothing is running for this project, start it detached:

```
npx archik start
```

Surface the URL it prints (or the existing URL from `status`) so the
user can click straight to it. Do not try to open the browser
yourself.
