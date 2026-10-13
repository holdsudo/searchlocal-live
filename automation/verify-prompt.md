You are adding ONE real local business to searchlocal.live, a free directory for Ocean County, NJ.

Read `automation/candidates.json`. It lists OpenStreetMap businesses in priority order. Go through them in order and stop at the FIRST one that passes every rule below. Look at no more than all of them; do not search for others.

For each candidate, open the business's OWN website with WebFetch (the home page, plus at most one contact/about/hours page). Rules:

- Use ONLY the business's own website. Never use Google Maps, Yelp, Facebook, Yellow Pages, BBB or any other directory.
- It must be a currently operating, independent local business (no chains or franchises with more than ~3 locations, no national companies, no online-only shops, no business without a public street address).
- The address and phone number must appear on the business's own site. If the site disagrees with OpenStreetMap, use the site. Dead, parked, "coming soon", closed, moved or unconfirmable sites are rejected.
- Skip adult, cannabis, vape/tobacco, firearms, payday/pawn/cash-for-gold, funeral, and anything sensitive.
- Hours: only if the site states them clearly and consistently. Format {"mon":"HH:MM-HH:MM" or null, ... "sun": ...} in 24h; use "23:59" for midnight. Otherwise `null`. Never guess.
- `since`: founding year as a number only if the site states it, else null.
- Write an ORIGINAL, neutral, factual `summary` (one sentence, max 140 characters) and `description` (2–3 sentences, 150–600 characters) in your own words. No copied sentences. No superlatives or marketing claims (best, #1, top-rated, award-winning, leading, premier, guaranteed, etc.). No accreditations, certifications, "kosher", "licensed" or similar claims unless the site states them word for word. No reviews or quotes.
- `services`: 3–5 short items the site says they offer.
- `category`: exactly one of: restaurants, cafes-bakeries, plumbing, hvac, electricians, auto-repair, salons-barbers, fitness, health-dental, legal, real-estate, landscaping, pets, shopping, cleaning, finance-insurance. If nothing fits reasonably, reject the candidate.
- `town`: the municipality name as written in the site's address (e.g. "Toms River", "Brick", "Point Pleasant" — which is different from "Point Pleasant Beach"). Drop "Township".
- `phone`: format "(732) 555-1234". `zip`: 5 digits. `website`: the https URL of their own site that shows the phone number.

Write your result to `automation/result.json` and nothing else:

{"accepted":[{"osm":"<osm id from candidates.json>","name":"","category":"","town":"","address":"","zip":"","phone":"","website":"","hours":null,"since":null,"summary":"","description":"","services":[]}],
 "rejected":[{"osm":"<osm id>","name":"","reason":"short reason"}]}

`accepted` has at most ONE entry. Every candidate you looked at and did not accept goes in `rejected`. Candidates you never reached are left out of both. Do not edit any other file.
