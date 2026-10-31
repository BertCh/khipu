# Khipu

A browser for recorded khipus: 684 khipus, 61,961 cords and
126,530 knots, drawn cord by cord with their recorded colours, knot types and
values. A static single-page app: React 19, [TanStack Router](https://tanstack.com/router),
Tailwind 4 and a little d3, built with Vite. There is no server — the route
loaders fetch the JSON in `public/data`.

## Build and deploy

```bash
npm run dev       # dev server on http://localhost:3000
npm run build     # static site in dist/ (index.html, hashed assets, public/data)
npm run preview   # serve dist/ locally
```

`dist/` is self-contained and can go on any static host (GitHub Pages, S3,
Netlify, an institutional web server). Two things to know:

- **Deep links.** Routes like `/khipus/KH0279` are resolved in the browser, so
  the host must serve `index.html` for paths it does not have. The build emits
  `dist/404.html` (a copy of `index.html`), which is how GitHub Pages does it;
  Netlify wants `/* /index.html 200` in a `_redirects` file, Cloudflare Pages and
  Vercel have equivalent rewrite rules. A request for a data file that does not
  exist then gets a 404 (or, under a rewrite, the HTML shell) — either way the
  fetch fails and the app shows its not-found page.
- **Sub-path hosting.** If the site lives under a prefix (a GitHub Pages project
  site at `https://<user>.github.io/khipu/`), build with `BASE_PATH=/khipu/
  npm run build`; the router and the data fetches follow it.

## Data

Two open sources, joined on their shared KH numbers:

| Source | What we take from it | Where it lands |
|---|---|---|
| [Khipu Field Guide](https://khipufieldguide.com/) (Ashok Khosla, MIT) — one Excel workbook per khipu | cord structure: groups, cords, knots, colours, values | `data/kfg/xlsx/` |
| [Open Khipu Repository](https://github.com/khipulab/open-khipu-repository) (Zenodo [10.5281/zenodo.18025748](https://doi.org/10.5281/zenodo.18025748)) — SQLite archive | code tables, the Ascher colour chart with ISCC–NBS colour values, archival metadata | `data/okr/` |

`data/` is git-ignored. The built JSON the app reads is committed in `public/data/`
(about 24 MB) so the app runs without re-fetching.

```bash
# re-fetch the raw sources (clones the OKR, downloads every KFG workbook)
scripts/fetch_data.sh

# rebuild public/data from them (needs python3 + openpyxl)
python3 scripts/build_data.py
```

`build_data.py` parses the KFG knot grammar (`3S(5.0,Z),30;8L(13.5,S),8`), the
cord-name hierarchy (`p13s1s2`), the group lines, and the Ascher colour strings
(`W:MB`, `W-KB`, `SR(0.0-1.5)/W(1.5-41.0)`), and writes:

| File | Contents |
|---|---|
| `khipus.json` | one summary row per khipu (index for browsing) |
| `khipus/KH0279.json` | full structure of one khipu: primary cord, groups, cords, knots |
| `corpus.json` | corpus-wide aggregates for the overview charts |
| `silhouettes.json` | pendant lengths and colours per khipu, for thumbnails |
| `cords.json` | every cord as a flat columnar table, for ad-hoc analysis |
| `colors.json` | Ascher colour code → name, hex, family |
| `codes.json` | code tables: knot types, attachment, termination, fibre, … |
| `stories/links.json` | for the `/network` map: every pair of khipus sharing a run of four or more consecutive values (forward or reversed) with the shuffled-corpus noise floor, khipus under one museum number, and khipus with one find-spot (`python3 scripts/build_links.py`; the curated links are `src/lib/stories/links.ts`; the discovery screens behind them are `scripts/link_screens.py`) |
| `profiles.json` | per-khipu profile for the khipu page: scale, arithmetic against a within-khipu value shuffle (group totals, adjacent sums, top-cord totals, Medrano & Khosla 2024's sums; observed vs chance, p, verdict), colour layout (KFG 2024 banded/seriated counts from `scripts/reference/kfg_colour_clusters_2024.csv`, else approximate) and structure (`python3 scripts/build_profiles.py`, fixed seed, ~2 min; rerun after `build_data.py`) |

Two things are computed rather than recorded: a pendant's position along the
primary cord (group start + ordinal × spacing) and a subsidiary's position on its
parent (from the parent's `Position` column). A long knot counts as one knot
however many turns it has; for `L`/`LL`/`BL`/`SP` the leading number in the knot
string is the number of turns, for `S`/`E`/`EE`/`TF` it is the number of knots.

### City khipus

`public/data/cities/` is a third, synthetic collection: one census khipu per US
metro, tied from the Growth Lab Cities Tool atlas (the built JSON of the
`cities-prototypes/app` repo next door — `index.json`, `national.json`,
`metros/*.json`), plus one for the country whose pendants are the metros.

```bash
# needs ../cities-prototypes/app/public/data (built there with `pnpm data`);
# or pass the directory / set CITIES_DATA
python3 scripts/build_cities.py
```

The files have the same shape as `khipus/KHxxxx.json` plus a `city` block and a
`places` map keyed by cord name, so the diagram draws them unchanged. The
encoding (documented at the top of the script and on the `/cities` page):

| | |
|---|---|
| pendant | one place; knots = its resident workers in Inka decimal (rows of single knots for tens and up, a long knot or figure-eight in the units row; rows line up across the khipu) |
| `p{n}s1`, `p{n}s2` | jobs located in the place (moderate brown); population where the atlas counts it (light grey — incorporated places only, so cities carry three cords and CDPs two) |
| colour | the place's diagnosis quadrant: Magnet strong red, Fortress strong yellow, Sponge deep blue, Leak dark brown; undyed white when undiagnosed; barber-poled with white when borderline |
| length | the units row plus 1 cm per $4,000 of the residents' mean wage |
| groups | the metro's states, principal state first; the principal city leads its group, the rest follow by size |
| attachment, knot direction | recto / verso = incorporated / CDP; S / Z = cost / amenity side |
| national khipu | a pendant per metro (its population), grouped by census division |

The metro's own population is deliberately not a top cord: it would need seven
or eight knot rows hung upward, and it is not the sum of the places anyway.
It is the metro's pendant on the national khipu, which is how the levels join.

The third level goes one step further down the atlas. Every place has a
yearly series there (population, the commute counts, mean wage, home value),
so every place gets a khipu with a group per year, 2010 to the window's end,
the same cords in the same order each year:

| | |
|---|---|
| residents who work | the year's first cord, in the place's own verdict colour, its tail that year's mean wage; beneath it `s1` = those who also work in the place (light yellowish brown) and `s2` = those who commute out (moderate greenish blue) — the pendant is their sum |
| jobs located here | the second cord (moderate brown); beneath it the same stay-at-home count and those who commute in — again the sum |
| population | the third cord (light grey), incorporated places only |
| home value | the last cord (grayish green), in dollars |

The last commute year's residents cord is the place's pendant on the metro
khipu, the jobs cord its first subsidiary, the latest population its second.
Sixteen thousand place khipus written out in full would run past a gigabyte,
so `build_cities.py` writes only each metro's place series
(`places/{metro slug}.json`, 16 MB for all 16,943 places) and
`src/lib/cities/tie.ts` ties a place's khipu when its page is asked for, with
the same cord builders and the constants from `index.json`'s `encoding` block.
The collection is about 44 MB, twice the real corpus.

### Analysis scripts

The stories quote figures that `scripts/` recomputes from `public/data`, so
they can be re-derived when the data is refreshed:

| script | what it reproduces |
|---|---|
| `corpus_discovery.py` | corpus-wide screens for uncommon structure (duplicates, proportional groups, column summaries, colour periods, shared value windows) |
| `group_grammar.py` | lone-cord sums and periodic group-size templates (behind `twin-falls`) |
| `cross_khipu_analysis.py`, `tied_twice.py` | the cross-khipu copies and the Berlin matched pair |
| `kh0081_analysis.py`, `kh0028_analysis.py`, `kh0135_analysis.py`, `kh0100_analysis.py`, `registers_analysis.py`, `kh0699_ledger.py` | the single-khipu stories, figure by figure |
| `check_sums.mts` | the coloured pendant sum search against the Field Guide's pages |
| `nonnumeric/` | **the non-decimal khipus** (19 September 2026): a grammar scan of every cord, the four families the breaks fall into (Wari-style canuto khipus, long knots at every height, the `nL E` spelling and knot direction, rare knot forms), rival readings scored by arithmetic, and a sign-inventory / entropy comparison. Findings, data caveats and follow-ups are in `scripts/nonnumeric/README.md`; in short, no code-breaking reading held up, and the Field Guide values the seven Ascher-declared unreadable khipus under three different rules |

## App

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # → .output/ (nitro); run with: node .output/server/index.mjs
npm run check      # biome lint + format
```

Routes:

- `/` — overview: a rendered khipu, corpus stats, and charts (cords per khipu,
  museums, provenance, cord colours, knot types, Benford's law on cord values,
  cord lengths, hierarchy depth)
- `/khipus` — searchable, sortable table of every khipu with a to-scale thumbnail
- `/khipus/KH0279` — one khipu: metadata, the diagram in either style
  (schematic or physical) at four sizes up to *Close*, where the rope, hitches
  and knots are drawn large enough to read; hover a cord for its record with
  the physical reading of each code, click one for a close-up of that cord
  with callouts (its hitch, twist, every knot cluster, its end); the coloured
  pendant sums (below), and the cord table
- `/stories` — seventeen data stories that add one layer of reading at a
  time (knot → cord → group → khipu → paired khipus → find-spot → document),
  each claim tagged by confidence. Accounts: `inkawasi` (the storehouse
  ledgers UR267A/UR255 and UR268, their fixed deductions checked group by
  group), `santa-valley` (six khipus matched to the 1670 Corongo revisita),
  `twin-falls` (KH0699, read as a three-section ledger whose sums cross-check),
  `mirror-ledger` (KH0081, possibly one form kept twice), `where-the-big-number-sits`
  (the corpus-wide grammar of where a group's total goes). Copies and pairs:
  `tied-twice` (AS175 against the spliced Huacho pair UR233/UR232;
  `scripts/tied_twice.py` reproduces the tables), `tied-in-two-cities`
  (KH0097 Paris and KH0586 Lima), `rounded-copy` (KH0049 and KH0362),
  `brown-eight` (KH0377 and KH0590), `six-fields` (KH0358 and KH0602),
  `pachacamac-fragment` (the Basel fragments against two Berlin khipus).
  Templates and registers: `proportional-template` (KH0028, one shape at
  five scales), `counting-to-two` (KH0034 and KH0670, values of 0, 1, 2),
  `colour-without-numbers` (KH0135, seventy colour triads and almost no
  knots). Signs: `knots-that-are-not-decimal` (KH0100, the Munich khipu the
  Aschers declined to read), `which-way-the-knot` (knot direction as a
  binary sign, and the corpus evidence that it tracks knot type and
  recorder), `collata` (Hyland's knotless letter khipus, transcribed from
  her 2017 paper since they are in neither database)
- `/cities` — the city khipus: the national khipu (hover names a metro, click
  opens it), a sortable gallery of the 387 metro khipus with to-scale
  thumbnails, and the reader's key to the encoding
- `/cities/boston-ma` — one metro: its verdict and numbers, the diagram with
  place names or values under the cords, the principal city's pendant read
  row by row, and the places table (each name opens the place's own khipu)
- `/cities/boston-ma/cambridge` — one place: a group per year, the commute
  split beneath every work cord, the last year's two work cords read row by
  row, and the years table; prev/next walk the metro's places in khipu order
- `/colors` — the Ascher colour chart as used in the corpus
- `/anatomy` — reading the drawing: every recorded feature (twist, attachment,
  knots and their direction, long-knot axis, decimal places, colour
  patterns, cord and primary-cord ends) shown schematic → physical, drawn by
  the real glyph code, with the corpus count for each
- `/about` — where the data comes from and what was computed
- `/lab` — the 3D renderer: plied cords, hitches and knots built in luma.gl,
  with a contact-resolving simulation so the cords hang and touch

### Rendering

The same laid-out khipu (`src/lib/khipu/layout.ts`) is drawn by two
renderers, switched on the khipu page; the overview hero, the Inkawasi
stages and the Santa Valley excerpt use the physical one, the browse
thumbnails and the city khipus the schematic:

- **Schematic** (`src/components/khipu/schematic.tsx`, the default): a cord
  is a coloured line over a contrast casing, a single knot a dot, a long knot
  a bar with a hairline per turn, a figure-eight a small 8. It carries the
  recorded codes as small marks: a knot's direction leans its mark (a dot is
  scratched, a bar's hairlines slope, an 8's waist slants), a long knot with a
  recorded axis gets a notch at the end where the wrapping strand enters, the
  attachment is a collar (recto) or a V (verso) with a slash beside it for the
  cord's twist (`SchematicHitch`), and the cord's end is marked at the tip
  (`SchematicEnd`).
- **Physical** (`src/components/khipu/physical.tsx` for ropes, hitches and
  knots, `physicalEnds.tsx` for cord ends and the primary cord with its
  structure and two ends; `PhysicalBody.tsx` assembles the layers back to
  front): drawn as the record describes the object — plied rope with the
  ridges of its twist, the half-hitch with its recto or verso face, overhand,
  long and figure-eight knots whose crossing strand leans the recorded way,
  the wrapping strand's oblique entry when the axis is recorded, and the
  recorded ends. All
  marks scale with the cord diameter `w`, so the same code draws the diagram
  and a close-up.

The conventions are set down once in `src/lib/khipu/anatomy.ts`, with the
plain-language readings the hover card, tables and captions use
(`describe.ts` turns them into sentences: "long knot, 5 turns (S), axis
down, at 17.5 cm → 5", "begins knotted, ends broken"):

- **S / Z**: twist and knot direction are named after the middle stroke of
  the letter — S leans `\`, Z leans `/` — for a plied cord's ridges and for
  the strand crossing the face of a knot. On a horizontal cord (the primary)
  the same twist shows the opposite diagonal.
- **Recto / verso**: the pendant's half-hitch seen from the front. Recto: the
  cord passes over the front of the primary and its loop sits behind, showing
  as a small collar. Verso: the loop hangs in front as a V below the primary
  and the cord passes behind, emerging from the choke at the bottom. Top
  cords take the recto form running upward.
- **Axis**: one strand runs straight through a long knot's coil, the other
  wraps. AXD (axis down): the straight strand is the lower one, so the
  wrapping strand enters at the top; AXU the reverse. Only 437 knots record
  it.
- **Not recorded draws nothing**: an unknown twist is a smooth cord, an
  unknown attachment hangs from the primary without a hitch, an unknown end
  just stops.

`/anatomy` is the reader's guide: each feature drawn schematic → physical by
the same glyph code as the diagrams, with the
corpus count. On the khipu page, `CordAnatomy.tsx` draws the selected cord
close up with callouts, and `DiagramKey.tsx` / `PhysicalKey.tsx` are the
compact keys for each style.

Sources: the Khipu Field Guide's [Reading a Khipu](https://www.khipufieldguide.com/databook/ReadingKhipu.html)
recording guide (photographs of each knot tied S and Z and with its axis up
or down; "if the cord comes from the bottom of the primary cord it is verso,
from the top it's recto") and [Khipu Signs](https://www.khipufieldguide.com/guidebook/KhipuSigns.html);
the Harvard Khipu Database's "Khipu Explained" page with Julia Meyerson's
drawings of the two attachment faces and of ply twist (the site is offline;
an [archived copy](https://web.archive.org/web/2020/http://khipukamayuq.fas.harvard.edu/Khipu-Explained.html)
survives); Gary Urton, *Signs of the Inka Khipu* (2003), for S/Z and
recto/verso as recorded variables; Marcia and Robert Ascher's databooks for
the knot and colour conventions.

### Coloured pendant sums

The khipu page also carries the Khipu Field Guide's *coloured pendant sum*
fieldmark — a cord whose value is the sum of a run of consecutive cords of the
same colour elsewhere on the khipu, one of the summation relationships Marcia
Ascher noted in her databooks. `src/lib/khipu/fieldmarks.ts` searches for them
live (about 2 ms for the largest khipu) with the Field Guide's own rule, reverse
engineered from its pages: level-1 cords in khipu order, top cords included;
cords without a value dropped, so a run may step over them; a cord's colour is
its Ascher string, or its longest stretch when spliced; a sum cord must be 11
or more; a run must be three or more cords entirely to the sum cord's right
(*right-handed*) or left (*left-handed*); where several runs fit, the fewest
summands win, the leftmost on a tie. `scripts/check_sums.mts` compares the
result with the Field Guide's page for a khipu, cord for cord (fifteen khipus
and 981 sums match, including KH0082's 283); run it after touching the search.

The section shows the Field Guide's x-ray (a square per cord, a column per
group, arrowheads on the sum cords pointing at their summands; hover to fan the
lines out, click to pin), the statistics per hand, and the sortable detail
table with an equation per sum. Whatever is lit there is also ringed on the
main diagram above. 268 of the 684 khipus have at least one such sum.

Key code:

- `src/lib/khipu/layout.ts` — schematic layout: ordinal columns for pendants,
  gaps between groups, extra columns for subsidiaries; metric vertical scale
- `src/components/khipu/KhipuDiagram.tsx` — the SVG renderer (cords with a
  contrast casing so white cotton reads on any surface, knot glyphs by type,
  colour patterns for mottled / barber-pole / spliced cords, tooltip); the
  drawing itself is `KhipuBody`, a `<g>` shared with the stage
- `src/components/khipu/schematic.tsx` — the schematic glyphs (cord stroke,
  knot glyph with direction and axis marks, `SchematicHitch`,
  `SchematicEnd`); `physical.tsx` and `physicalEnds.tsx` — the physical
  glyphs (rope patterns, `CordRope`, `PendantHitch`, `PhysicalKnot`,
  `CordEnd`, `PrimaryRope`), assembled by `PhysicalBody.tsx`;
  `CordAnatomy.tsx` the one-cord close-up with callouts on the khipu page;
  `DiagramKey.tsx` and `PhysicalKey.tsx` the keys, drawn with the same code
- `src/lib/khipu/anatomy.ts` — the physical reading of every recorded code
  (slants, attachment faces, terminations, beginnings, axis) and its
  plain-language text; `describe.ts` turns cords and knots into sentences
  for the hover card, the tables and the captions; `src/routes/anatomy.tsx`
  is the reader's guide built from both
- `src/lib/khipu/fieldmarks.ts` — the coloured pendant sum search, the
  Field Guide's group-relative cord names (`g3p2`), and the per-hand
  statistics; `src/components/khipu/CordSums.tsx` is the section on the
  khipu page, `SumXray.tsx` the grid drawing and `SumTable.tsx` the table
- `src/components/khipu/KhipuStage.tsx` — a khipu under a d3-zoom camera:
  frames any box (whole khipu, group, cord, a few cm of knots) and glides
  between frames; labels, callouts, brackets and connectors are drawn in
  screen space so they keep their size at any zoom
- `src/components/story/Scenes.tsx` — the scene player the stories drive it
  with (autoplays on scroll into view, prev/next, captions); the Inkawasi
  scenes are in `src/components/story/InkawasiStages.tsx`
- `src/components/charts/` — small bar-list and column-chart primitives
- `src/lib/khipu/data.ts` — server functions that read `public/data`;
  `src/lib/cities/data.ts` does the same for `public/data/cities` (and ties
  a place's khipu on request through `src/lib/cities/tie.ts`), and
  `src/components/cities/CityBits.tsx` holds the verdict chip, the hover
  cards and the reading key
- `src/lib/stories/derive.ts` — what the stories compute from the record
  (ledger groups and their balances, six-cord groups, shared values, khipu
  slices); `src/lib/stories/collata.ts` holds the Collata transcription
- `src/components/story/` — story shell, steps and confidence pills, the
  four-layer observed / derived / context / interpretation panel, the
  single-cord reader, ledger and paired-ledger tables, the six-cord "people"
  grid, and the knotless Collata cord renderer
