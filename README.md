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
