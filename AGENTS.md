# AGENTS.md

This repo turns one JSON file per offer into a photographer's offer pages. The rules for editing it
are in `docs/PROJECT-INSTRUCTIONS.md`, the same text the photographer's ChatGPT Project uses. Read
it first and follow it exactly: which files you may touch, the branch and pull request flow, the slug
rule, the offer JSON shape, booked and lost, photos, and what to do when the check fails.

Template files, never edited from a photographer's repo: `build.mjs`, `lib/`, `templates/`,
`verticals/`, `test/`, `test-template/`, `scripts/`, `docs/`, `.github/`, `AGENTS.md`,
`package.json`, `.node-version`, `UPSTREAM`. Upstream updates overwrite them.
`.github/workflows/` is the exception: BeeDigital updates it by hand. The rest of `.github/` is
copied automatically. Never merge a `Template update` pull request; BeeDigital merges those.

On a laptop you can also run the check yourself before pushing:

```sh
npm test && node build.mjs --allow-empty
```

Node 22, no dependencies, nothing to install. Errors name the file and the field.
