# Setup runbook (BeeDigital, once per photographer)

One call of about 30 minutes. The photographer clicks, in their own accounts; BeeDigital prepares
everything that needs typing. Their GitHub, Cloudflare, ChatGPT and Gmail stay theirs.

## Before the call (BeeDigital)
- [ ] Scaffold the client record (`/new-client`).
- [ ] Check they have: Gmail or Google Workspace for inquiries, a paid ChatGPT plan, a laptop for
      the call.
- [ ] Collect: studio name, WhatsApp number, email, packages with prices and what each includes,
      add-ons with prices, terms (deposit, balance, delivery time, travel). Colours are optional.
- [ ] Ask for 10–12 portfolio photos through Drive or WeTransfer, exported from their own editor:
      JPEG, sRGB, long edge 2048 px, at most 1.5 MB each. Ask which ones are not weddings
      (baptism, ...).
- [ ] Ask them to forward one real past inquiry, as it arrived.
- [ ] Prepare `brand/brand.json` (text in `el` and `en`, `"vertical": "photographer"`, every photo
      listed in `brand.portfolio` with its event types). `offersBaseUrl` is filled in on the call.
- [ ] Prepare the Gmail filter: criteria that match their inquiries and nothing else, for example
      `from:(wordpress@<their-domain>) subject:(Νέο μήνυμα)` or `to:(booking@<their-domain>)`.
      Search the forwarded inquiry with it. A loose `subject:` search also matched GitHub mail in the
      spike.
- [ ] Prepare the inbox prompt from `docs/INBOX-TASK.md` in their language, with `<owner>/<repo>`
      left to fill in.

## On the call
1. **GitHub.** They sign up, open `github.com/beedigital-gr/offers-template` → "Use this template"
   → name `offers` → **switch the visibility to Private** (the form starts on Public) → Create.
   Then, in the new repo:
   - Settings → Actions → General → tick "Allow GitHub Actions to create and approve pull
     requests" → Save. Only the owner can do this, and template updates need it.
   - Settings → Collaborators → add `MikeKoulouras` (BeeDigital).
2. **Cloudflare.** They sign up → Workers & Pages → Create → Pages → "Import an existing Git
   repository" → Connect GitHub. A GitHub window opens (allow pop-ups): "Only select
   repositories" → their `offers` repo → Install. If GitHub shows the app's settings page instead,
   pick the repo there and press Save. Back in Cloudflare, pick the repo:
   - Project name `offers-<studio>`. Their offers live at `https://offers-<studio>.pages.dev`.
   - Build command `node build.mjs`, output directory `dist/public`. Leave everything else as it
     is: the defaults already turn on preview deployments for every branch and the pull request
     comment with the preview link, which the chat reads.
   - Save and Deploy. The first deploy fails with "No offers yet". That is expected.
3. **BeeDigital, while they wait.** Accept the invite. Put the `pages.dev` address in
   `offersBaseUrl` (no trailing slash), delete the three sample photos and
   `photos/_portfolio/CREDITS.md`, add their photos to `photos/_portfolio/`, open a pull request.
   `check` goes green; the red Cloudflare mark next to it is expected until the first offer is
   merged. Merge.
4. **ChatGPT.** Connect the GitHub app (only their `offers` repo) and the Gmail app. Create a
   Project named "Offers" and paste `docs/PROJECT-INSTRUCTIONS.md` into its instructions.
5. **Gmail.** Create the labels `Offers/new` and `Offers/needs-you`. Settings → Filters → Create a
   filter with the prepared criteria → "Apply the label" `Offers/new` and "Never send it to Spam".
   Write the inquiry address in the client record.
6. **Inbox task.** In a new chat inside Offers, paste the prepared prompt with their repo filled in
   and ask for it to run every hour, Europe/Athens. Then send one test inquiry from a second
   address (through their contact form if they have one) and say "check my inquiries". Tap "Always
   allow" on every Gmail and GitHub prompt, so the hourly run never stops on one. Expect one pull
   request with a green check, `gmail-thread:` in its body and a Cloudflare comment with the
   preview link (open it: the offer shows), and one reply draft in that thread with `[LINK]`. Close
   the test pull request without merging and delete the draft.
7. **First real offer.** They make it themselves from `docs/HOWTO.el.md` (or `.en.md`) while we
   watch. Write down every place they got stuck.
8. **Tell them:** check the To: of each reply draft before sending (contact forms send from the
   site's own address); look at `Offers/needs-you` now and then; a day with no summary or
   notification means something is stuck, so say "check my inquiries" in Offers to see why.

Accepted risk: `main` is not protected. Rulesets are not enforced on a free personal account's
private repo, and the chat is told never to commit to `main`.

## After the call
- [ ] Their first real offer becomes `offers/_example.json` in the template (fresh slug, private
      fields emptied). Fix what they got stuck on.
- [ ] Log the interaction and update the client README the same day.
- [ ] They remove `MikeKoulouras` from Settings → Collaborators once they have made offers on their
      own.

## Add-on: their own domain
Cloudflare Pages → the project → Custom domains → `offers.<domain>`, then the CNAME it shows at their
DNS host (their DNS does not have to move to Cloudflare). Change `offersBaseUrl` to
`https://offers.<domain>` in a pull request. Offers already sent keep working on `pages.dev`.

## Template files
These are overwritten by upstream updates; neither the photographer nor the chat edits them:
`build.mjs`, `lib/`, `templates/`, `verticals/`, `test/`, `test-template/`, `scripts/`,
`docs/`, `.github/`, `AGENTS.md`, `package.json`, `.node-version`, `UPSTREAM`. The update workflow
copies all of them except `.github/workflows/`, which BeeDigital copies by hand. The photographer owns
`offers/`, `photos/` and `brand/`. `test-template/` (the sample-data self-test) runs only in
`beedigital-gr/offers-template`, so deleting the samples does not turn their checks red.

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
