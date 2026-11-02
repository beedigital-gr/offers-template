# Setup runbook (BeeDigital, once per photographer)

Everything is created in the photographer's name, with them. At the end BeeDigital keeps no access.

## Before the session
- [ ] Mike picks the photographer; scaffold the client record (`/new-client`).
- [ ] Collect: studio name, WhatsApp number, email, the domain for offers (`offers.<domain>`), who
      runs their DNS, packages with prices and what each includes, add-ons with prices, terms
      (deposit, balance, delivery time, travel), brand colours (or keep the default palette).
- [ ] Ask them to pick ~20 portfolio photos and tag each with the event types it fits
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
- [ ] Protect `main` in GitHub: a branch ruleset that requires a pull request before merging. Do
      not make `check` a required status: a pull request opened by the update workflow
      (`GITHUB_TOKEN`) never starts `check`, so a required `check` would block every template
      update. If their GitHub plan cannot enforce rulesets on a private repo, write it in the client
      record as an accepted risk (the chat is told never to commit to `main`).
- [ ] Custom domain on the Pages project: `offers.<domain>`, a CNAME at their DNS host. Their DNS
      does not have to move to Cloudflare.

## Their data (replaces the samples)
- [ ] `brand/brand.json`: name, colours, `whatsapp`, `email`, `defaultLanguage`,
      `offersBaseUrl` (`https://offers.<domain>`, no trailing slash), packages, add-ons, terms in
      both `el` and `en`. Keep `"vertical": "photographer"`. The studio name is shown as text; there
      is no logo field.
- [ ] Ask them to export the portfolio set from their own editor: JPEG, sRGB, long edge 2048 px,
      each at most 1.5 MB. The check rejects a bigger file and names it.
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
`build.mjs`, `lib/`, `templates/`, `verticals/`, `test/`, `test-template/`, `scripts/`,
`docs/`, `.github/`, `AGENTS.md`, `package.json`, `.node-version`, `UPSTREAM`. The update workflow
copies all of them except `.github/workflows/`, which BeeDigital copies by hand. The photographer owns
`offers/`, `photos/` and `brand/`. `test-template/` (the sample-data self-test) runs only in
`beedigital-gr/offers-template`, so deleting the samples does not turn their checks red.

## ChatGPT
- [ ] Connect the ChatGPT GitHub plugin to the repo, permission "Always allow".
- [ ] Connect Gmail, "Always allow" (needed by the inbox task).
- [ ] Create a ChatGPT Project named "Offers". Paste `docs/PROJECT-INSTRUCTIONS.md` into its
      instructions. Put the Project URL in `brand.chatgptProjectUrl`.

## Inbox to offer (`docs/INBOX-TASK.md`)
- [ ] Labels: create `Offers/new` and `Offers/needs-you` in the Gmail account the inquiries reach
      (write that account in the client record). In Gmail search they are `offers-new` and
      `offers-needs-you`.
- [ ] Gmail → Settings → Filters → Create a filter that matches only their inquiries, then "Apply
      the label" `Offers/new` and "Never send it to Spam". Use their real inquiry sources, for
      example `from:(wordpress@<their-domain>) subject:(Νέο μήνυμα)` for a contact form, or
      `to:(booking@<their-domain>)` for a booking address. Search a real past inquiry with the same
      criteria first and confirm it matches and nothing else does (GitHub notifications matched a
      loose `subject:` search in the spike).
- [ ] Pre-approve once, "Always allow", so the hourly run never stops on a prompt. Gmail: search,
      read, create draft, modify labels. GitHub: read files, create branch, commit, open pull
      request, read checks.
- [ ] ChatGPT → Scheduled → Create: every 1 hour, Europe/Athens, the prompt from
      `docs/INBOX-TASK.md` in their language, with `<owner>/<repo>` replaced by their repo. Create
      it inside the Offers Project if the form allows it. Open check for the spike: can a
      scheduled task live in a Project? _yes/no_
- [ ] Test: send one inquiry from a second address (not theirs) through
      their real contact form if they have one. Confirm `label:offers-new` finds it in Gmail
      search. Wait for the run, or say "check my inquiries" in Offers. Expect: one PR with a green
      check and `gmail-thread:` in its body, one reply draft in that thread with `[LINK]`, the
      label gone, no permission prompt. Record where the run summary shows up and whether a
      notification arrives on the phone: _where / yes-no_. Then send a mail that is not an
      inquiry and confirm it gets `Offers/needs-you`. Close the test PR without merging and delete
      the draft.
- [ ] Tell the photographer: check the To: of each reply draft before sending (contact forms send
      from the site's own address); look at `Offers/needs-you` now and then; a day with no
      summary or notification means something is stuck, so say "check my inquiries" in Offers to
      see the error.

## First real offer, together
- [ ] They make their first real offer themselves from `docs/HOWTO.el.md` (or `.en.md`) while we
      watch. Write down every place they got stuck.
- [ ] That offer becomes the new `offers/_example.json` (with a fresh slug and private fields
      emptied).
- [ ] Fix what they got stuck on in the template; release `v1.0.0`.

## Hand over
- [ ] Remove BeeDigital from their GitHub, Cloudflare and ChatGPT.
- [ ] The `upstream-update` workflow is enabled in Actions, and Settings → Actions → General →
      "Allow GitHub Actions to create and approve pull requests" is on.
- [ ] Log the interaction and update the client README the same day.

## Applying a needs-help template update
`beedigital-gr/offers-template` must stay public: every photographer repo reads its releases and
clones it without a login. If it goes private or is renamed, the weekly run finds no release and
quietly does nothing.
Every Monday the `upstream-update` workflow opens or refreshes a `Template update vX.Y.Z` pull
request. Its tests and build run inside the workflow and the result is in the pull request body.
Nobody merges it blindly, and the chat never merges it. A closed, unmerged update is not reopened;
the next release opens a new one. A failed run opens an issue (or comments on the open one) titled
"Template update failed".

When the pull request carries the `needs-help` label, BeeDigital finishes it. If the body lists
workflow files, copy them by hand from the upstream tag onto the `template-update` branch (delete
the ones upstream dropped), then merge. If the body says the tests or build failed, look at the
failure before merging anything.

## Template checks Mike runs once (not per photographer)
- [x] **Phone test (plan Task 6 Step 2b).** Passed 2026-11-02. On the spike repo, in a ChatGPT Project holding
      `PROJECT-INSTRUCTIONS.md`, from the phone: "new offer for Maria & Nikos, wedding 14/6/2027,
      gold". Expect a PR with a valid offer file, check green, the preview link in the reply. Then
      break a field on purpose and confirm the chat reads the red check and fixes it.
