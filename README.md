# SearchLocal — searchlocal.live

A free directory of real local businesses. Static site, **zero dependencies**: a Node script
(`build.mjs`) turns the JSON in `src/data/` into plain HTML in `dist/`.

```
node build.mjs        # build → dist/
node serve.mjs        # preview at http://localhost:4321
```

## Layout
- `src/data/site.json`: name, domain, region, contact email, `formEndpoint`, `minListingsToIndex`
- `src/data/categories.json`, `towns.json`, `listings.json`: the directory itself
- `src/icons.mjs`: line icons; `src/assets/`: CSS, JS and images, copied as-is
- `.github/workflows/pages.yml`: builds and deploys to GitHub Pages on every push to `main`

## Adding a business
Add an object to `listings.json`. `hours` is either a preset name (`restaurant`, `early`,
`trades`, `office`, `salon`, `gym`, `retail`) or an object like
`{"mon":"08:00-17:00", …, "sun":null}`. `website` gets a normal followed link.

## Sample data (important)
Every listing currently in the repo is **fictional** (`"sample": true`, phones in the
reserved 555-01xx range, no websites). Sample listings show a "Sample" badge, are `noindex`,
stay out of the sitemap and carry no LocalBusiness schema. Delete them before launch.

## Thin-content guard
A category or town page is `noindex` and stays out of the sitemap until it has at least
`minListingsToIndex` (3) real listings. Don't lower this to mint more pages.

## Submissions
No backend yet. With `formEndpoint` empty, the "Add your business" form validates, then opens
the visitor's email app pre-filled to `site.email`. Set `formEndpoint` to any JSON POST
endpoint (Formspree, a Worker, your own API) to switch over.

## Deploy (GitHub Pages)
1. Push to a GitHub repo, then go to Settings → Pages → Source: **GitHub Actions**.
2. DNS for searchlocal.live: four `A` records to 185.199.108.153 / .109 / .110 / .111
   (plus `www` CNAME → `<user>.github.io`). `dist/CNAME` is written by the build.
3. Enable "Enforce HTTPS" once the certificate is issued.

## Automatic listings (1 a day)

LaunchAgent `com.searchlocal.weekly-add` runs `scripts/weekly-add.sh` every day at 10:00
(missed runs fire on next wake). Each run adds at most one business:

1. `scripts/pick-candidates.mjs` — picks 6 untried independent businesses from OpenStreetMap
   (pool refreshed monthly, cached in `automation/osm-pool.json`), favouring the emptiest categories.
2. `claude -p` with `automation/verify-prompt.md` — checks them against each business's own website
   and writes `automation/result.json`. Only WebFetch and that one file are allowed.
3. `scripts/apply-candidate.mjs` — the gate. Re-fetches the business site and requires the phone
   number and street number to appear on it, rejects marketing claims, duplicates and bad formats.
4. Build, commit, push. Deploy + IndexNow follow via GitHub Actions.

Every candidate looked at is recorded in `src/data/osm-tried.json` and never retried.
Logs: `automation/logs/`. The run skips itself if `src/` has uncommitted edits.
Pause: `launchctl unload ~/Library/LaunchAgents/com.searchlocal.weekly-add.plist`.
Run now: `bash scripts/weekly-add.sh`.

## Blog (1 post a week)

Posts live in `src/posts/<slug>.html`: a JSON front-matter comment (title, h1, description, lead, date,
businesses) followed by HTML. `{{card:<listing-slug>}}` on its own line embeds a listing card. Posts dated
in the future stay hidden until their day. The build makes `/blog/`, each article, and `/blog/feed.xml`,
and business pages link back to articles that mention them.

LaunchAgent `com.searchlocal.weekly-post` runs `scripts/weekly-post.sh` on Wednesdays at 11:00:

1. `scripts/pick-topic.mjs` picks a topic from verified listings (a category, a town, opening hours, or
   new this month) with at least 3 businesses, 2 or more never featured before. Champion Auto Finance is
   kept out of editorial posts.
2. `claude -p` with `automation/post-prompt.md` writes `automation/post-draft.html` from the listings and
   each business's own website.
3. `scripts/apply-post.mjs` is the gate. It rejects businesses outside the brief, links outside the
   allow-list, non-whitelisted markup, superlatives ("best", "fastest", "must-try"…), phone numbers that
   aren't the businesses', prices, and missing disclosure. A rejected draft gets one rewrite with the reasons.
4. Build, commit, push.

Both jobs share `scripts/lock.sh`, so they never push at the same time.
Try without publishing: `DRY_RUN=1 bash scripts/weekly-post.sh` (draft kept at `automation/last-dry-run.html`).
Pause: `launchctl unload ~/Library/LaunchAgents/com.searchlocal.weekly-post.plist`.
