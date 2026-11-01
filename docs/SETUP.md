# Setup runbook (BeeDigital, once per photographer)

Everything is created in the photographer's name, with them. At the end BeeDigital keeps no access.

## Before the session
- [ ] Mike picks the photographer; scaffold the client record (`/new-client`).
- [ ] Collect: studio name, WhatsApp number, email, the domain for offers (`offers.<domain>`), who
      runs their DNS, packages with prices and what each includes, add-ons with prices, terms
      (deposit, balance, delivery time, travel), brand colours (or keep the default palette).
- [ ] Ask them to pick ~20 portfolio photos in Lightroom and tag each with the event types it fits
      (`wedding`, `baptism`, ...).

## Accounts and repo
- [ ] GitHub account in their name. On `beedigital-gr/offers-template`: "Use this template" → a
      **private** repo in their account.
- [ ] Cloudflare account in their name. Workers & Pages → Create → Pages → connect the repo.
      - Build command: `node build.mjs` (strict; never `--allow-empty` here, so a deploy that
        would publish zero offers fails and the last good site stays up).
      - Output directory: `dist/public`. Environment variable `NODE_VERSION=22`.
      - Only the PR check (`.github/workflows/check.yml`) uses `--allow-empty`.
- [ ] Cloudflare Pages → Settings → Builds: preview deployments on for all non-production
      branches, and PR comments on (the Cloudflare GitHub app posts the preview link). The chat
      reads the preview link from that comment, so without it every reply stops short.
- [ ] Protect `main` in GitHub: a branch ruleset that requires a pull request and the `check`
      status before merging. If their GitHub plan cannot enforce rulesets on a private repo, write
      it in the client record as an accepted risk (the chat is told never to commit to `main`).
- [ ] Custom domain on the Pages project: `offers.<domain>`, a CNAME at their DNS host. Their DNS
      does not have to move to Cloudflare.

## Their data (replaces the samples)
- [ ] `brand/brand.json`: name, colours, `whatsapp`, `email`, `defaultLanguage`,
      `offersBaseUrl` (`https://offers.<domain>`, no trailing slash), packages, add-ons, terms in
      both `el` and `en`. Keep `"vertical": "photographer"`. The studio name is shown as text; there
      is no logo field.
- [ ] Install `setup/Web Offer Export.lrtemplate` in their Lightroom Classic (Export dialog →
      Preset → Import). Export the portfolio set with it.
- [ ] Delete the three sample photos and `photos/_portfolio/CREDITS.md`; upload their export to
      `photos/_portfolio/` (GitHub web upload, batches under 100 files). List every file in
      `brand.portfolio` with its event types.
- [ ] Replace `offers/_example.json` later, with their first real offer (see below). Until then the
      sample stays, so the chat has a shape to copy.
- [ ] Open a PR with the brand + portfolio changes; the `check` must go green. Merge. The
      Cloudflare preview on that PR and the production deploy after it both fail until the first
      real offer is merged (strict build, zero offers). That is expected.

## Template files
These are overwritten by upstream updates; neither the photographer nor the chat edits them:
`build.mjs`, `lib/`, `templates/`, `verticals/`, `test/`, `test-template/`, `scripts/`, `setup/`,
`docs/`, `.github/`, `AGENTS.md`, `package.json`, `.node-version`, `UPSTREAM`. The photographer owns
`offers/`, `photos/` and `brand/`. `test-template/` (the sample-data self-test) runs only in
`beedigital-gr/offers-template`, so deleting the samples does not turn their checks red.

## ChatGPT
- [ ] Connect the ChatGPT GitHub plugin to the repo, permission "Always allow".
- [ ] Connect Gmail, "Always allow" (needed by the inbox task).
- [ ] Create a ChatGPT Project named "Offers". Paste `docs/PROJECT-INSTRUCTIONS.md` into its
      instructions. Put the Project URL in `brand.chatgptProjectUrl`.
- [ ] Set up the inbox scheduled task (`docs/INBOX-TASK.md`, Task 6b).

## First real offer, together
- [ ] They make their first real offer themselves from `docs/HOWTO.el.md` (or `.en.md`) while we
      watch. Write down every place they got stuck.
- [ ] That offer becomes the new `offers/_example.json` (with a fresh slug and private fields
      emptied).
- [ ] Fix what they got stuck on in the template; release `v1.0.0`.

## Hand over
- [ ] Remove BeeDigital from their GitHub, Cloudflare and ChatGPT.
- [ ] Confirm the upstream update workflow is enabled in their repo (Actions tab).
- [ ] Log the interaction and update the client README the same day.

## Template checks Mike runs once (not per photographer)
- [ ] **Phone test (plan Task 6 Step 2b).** On the spike repo, in a ChatGPT Project holding
      `PROJECT-INSTRUCTIONS.md`, from the phone: "new offer for Maria & Nikos, wedding 14/6/2027,
      gold". Expect a PR with a valid offer file, check green, the preview link in the reply. Then
      break a field on purpose and confirm the chat reads the red check and fixes it.
- [ ] **Lightroom preset (plan Task 6 Step 3).** Verify by importing `setup/Web Offer Export.lrtemplate`
      into Lightroom Classic. Confirm the dialog shows JPEG, quality 75, sRGB, long edge 2048 px, sharpen
      for screen (standard), metadata "Copyright only". Export one 40 MP RAW and record the file
      size here; it must be at most 1.5 MB. If Lightroom rejects the file, rebuild the preset in the
      Export dialog with those settings and save it over this one.
      Result: _not yet tested_
