import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ChapterShell } from "#/components/matching/ChapterShell";
import NumberTape from "#/components/matching/NumberTape";
import { CorpusFindings } from "#/components/matching/seed-and-extend/CorpusFindings";
import { DotterFigure } from "#/components/matching/seed-and-extend/DotterFigure";
import { ExtendTrace } from "#/components/matching/seed-and-extend/ExtendTrace";
import { FlipReverse } from "#/components/matching/seed-and-extend/FlipReverse";
import { IndexLookup } from "#/components/matching/seed-and-extend/IndexLookup";
import { KnotExamples } from "#/components/matching/seed-and-extend/KnotExamples";
import { WindowSlider } from "#/components/matching/seed-and-extend/WindowSlider";
import { Conf, Prose, Step, Wide } from "#/components/story/Story";
import { pairRun } from "#/lib/engine/tests/passages";
import { getColors, getKhipus, readJson } from "#/lib/khipu/data";
import { tapeOf, valuesOf } from "#/lib/matching/tape";
import type { ScanFile } from "#/lib/stories/links";
import "#/styles/matching/base.css";
import "#/styles/matching/seed-and-extend.css";

const IDS = [
	"KH0303",
	"KH0304",
	"KH0121",
	"KH0473",
	"KH0097",
	"KH0586",
] as const;

export const Route = createFileRoute("/matching/seed-and-extend")({
	loader: async () => {
		const [colors, khipus, scan] = await Promise.all([
			getColors(),
			getKhipus([...IDS]),
			readJson<ScanFile>("stories/links.json").catch(() => null),
		]);
		return { colors, khipus, scan };
	},
	head: () => ({
		meta: [
			{ title: "Seed and extend — How matching works" },
			{
				name: "description",
				content:
					"How the matching scan turns khipu cords into numbers, finds a short informative window shared by two khipus, and grows it into the longest run they agree on.",
			},
		],
	}),
	component: SeedAndExtend,
});

function SeedAndExtend() {
	const { colors, khipus, scan } = Route.useLoaderData();
	const k0303 = khipus.KH0303;
	const k0304 = khipus.KH0304;
	const k0121 = khipus.KH0121;
	const k0473 = khipus.KH0473;
	const k0097 = khipus.KH0097;
	const k0586 = khipus.KH0586;

	const cords0303 = useMemo(() => (k0303 ? tapeOf(k0303) : []), [k0303]);
	const cords0304 = useMemo(() => (k0304 ? tapeOf(k0304) : []), [k0304]);
	const v0303 = useMemo(() => (k0303 ? valuesOf(k0303) : []), [k0303]);
	const v0304 = useMemo(() => (k0304 ? valuesOf(k0304) : []), [k0304]);
	const v0121 = useMemo(() => (k0121 ? valuesOf(k0121) : []), [k0121]);
	const v0473 = useMemo(() => (k0473 ? valuesOf(k0473) : []), [k0473]);
	const v0097 = useMemo(() => (k0097 ? valuesOf(k0097) : []), [k0097]);
	const v0586 = useMemo(() => (k0586 ? valuesOf(k0586) : []), [k0586]);

	const run0303 = useMemo(
		() => (v0303.length && v0304.length ? pairRun(v0303, v0304) : null),
		[v0303, v0304],
	);

	const knotExamples = useMemo(() => {
		if (!k0303) return [];
		const want = ["p1", "p13", "p17", "p29"];
		return want
			.map((name) => k0303.cords.find((c) => c.level === 1 && c.name === name))
			.filter((c): c is NonNullable<typeof c> => Boolean(c))
			.map((c) => ({
				name: c.name,
				value: c.value ?? 0,
				color: c.color,
				knots: c.knots.map((k) => ({
					n: k.n,
					type: k.type,
					dir: k.dir,
					value: k.value,
				})),
			}));
	}, [k0303]);

	return (
		<ChapterShell
			slug="seed-and-extend"
			title="Seed and extend"
			standfirst="Cords become a number tape; a short window seeds a search, and a seed grows into the longest run two khipus agree on."
		>
			<Step n={1} title="Cords into numbers">
				<Prose>
					<p>
						Every figure below reads a khipu as a tape of numbers: its level-1
						cords (the pendants tied to the primary cord, top cords included) in
						the order they were tied, each one's value the decimal number its
						knots encode. A cord with no knots is a 0 on the tape, not a gap.
					</p>
					<p>
						Knot clusters sit at positions along the cord, one register each —
						the cluster nearest the primary cord is the highest power of ten,
						the one furthest from it the units — and the cord's value is their
						sum.{" "}
						{knotExamples[2] && (
							<>
								{knotExamples[2].name} on KH0303 carries a single knot (10)
								nearer the primary cord and a cluster of 9 long-knot turns (9,
								the units) further down, giving 19.
							</>
						)}{" "}
						<Link to="/anatomy">/anatomy</Link> has the full rule, including the
						subsidiary cords this tape leaves out.{" "}
						<Conf level="firm">Read directly from the cord</Conf>
					</p>
				</Prose>
				{knotExamples.length > 0 && (
					<Wide
						caption={
							<>
								Four of KH0303's 32 level-1 cords, knot cluster by knot cluster,
								to the value the tape below uses.{" "}
								<span className="sae-source">
									Source: public/data/khipus/KH0303.json, Cord.knots
								</span>
							</>
						}
					>
						<KnotExamples examples={knotExamples} />
					</Wide>
				)}
				{cords0303.length > 0 && (
					<Wide
						caption={
							<>
								KH0303's full tape: 32 cords, colour swatch over value, wider
								gaps where a group of cords ends.{" "}
								<span className="sae-source">
									Source: tapeOf(), src/lib/matching/tape.ts
								</span>
							</>
						}
					>
						<NumberTape
							cords={cords0303}
							colors={colors}
							label="KH0303, 32 cords, in order"
						/>
					</Wide>
				)}
			</Step>

			<Step n={2} title="The window">
				<Prose>
					<p>
						The scan never compares two khipus cord by cord from the start —
						most khipus don't line up that simply. Instead it slides a window of
						five values along one tape and asks whether that window is worth
						indexing at all: at least four of the five cords nonzero, at least
						four distinct values among them, and the largest at least 15. A
						window like 0, 0, 1, 0, 1 fails on the first count alone — windows
						that dull occur constantly on a khipu thick with zeros and small
						counts, and indexing them would just fill every bucket with half the
						tape.
					</p>
					<p>
						A stricter rule applies to a four-wide window: every one of the four
						must be nonzero <em>and</em> distinct, with the largest still at
						least 15. Width four catches shorter matches, but only where there
						is no room at all for coincidence — one zero or one repeat anywhere
						in the four and it is skipped.{" "}
						<Conf level="firm">An exact rule, not a guess</Conf>
					</p>
				</Prose>
				{cords0303.length > 0 && (
					<Wide
						caption={
							<>
								The window sliding along KH0303's tape, width 5 or width 4. Grey
								cords were checked and found dull; the reason is named under the
								figure.{" "}
								<span className="sae-source">
									Source: windowDiagnostics(),
									src/lib/matching/seed-and-extend/windowDiagnostics.ts, calling
									informative5 / informative4 directly
								</span>
							</>
						}
					>
						<WindowSlider
							cords={cords0303}
							values={v0303}
							colors={colors}
							label="KH0303"
						/>
					</Wide>
				)}
			</Step>

			<Step n={3} title="The index">
				<Prose>
					<p>
						Every informative window on one khipu is filed under a key made of
						its five values in order. The other khipu's windows are then checked
						against that index, one at a time; a window whose key is already
						there is a hit. The key has to match exactly — not every informative
						window on the second khipu finds a partner, even one that looks
						promising on its own.
					</p>
					<p>
						On KH0303 and KH0304 the same thirteen window positions are
						informative on both tapes (cords 15 and 17 through 28), but only
						eight of them find a match: cord 15, then 17 through 23. From cord
						24 on, the windows stay informative on both sides, yet their keys no
						longer agree — because by cord 28 the window has swept past the one
						cord where the two khipus actually differ (5 against 0). Informative
						is not the same as matching.{" "}
						<Conf level="firm">A hit needs an exact key match</Conf>
					</p>
				</Prose>
				{cords0303.length > 0 && cords0304.length > 0 && (
					<Wide
						caption={
							<>
								KH0303 fills the index on top; KH0304's windows are checked
								against it below. A hit is boxed in both tapes.{" "}
								<span className="sae-source">
									Source: seedTrace(), src/lib/matching/seedTrace.ts (window and
									index/lookup steps)
								</span>
							</>
						}
					>
						<IndexLookup
							a={v0303}
							b={v0304}
							aCords={cords0303}
							bCords={cords0304}
							colors={colors}
							aLabel="KH0303"
							bLabel="KH0304"
						/>
					</Wide>
				)}
			</Step>

			<Step n={4} title="Extend">
				<Prose>
					<p>
						A hit is a seed, not a verdict: the two windows might agree for five
						cords and disagree on the sixth. From the seed, the scan steps
						outward one cord at a time in both directions, as long as the two
						tapes keep agreeing, and keeps the longest stretch it reaches.
						KH0303 and KH0304 are 32-cord tapes that differ at only four cords —
						5, 7, 28 and 31; the run the scan finds runs from cord 8 to cord 27
						— {run0303?.longest ?? 20} cords — stopping exactly where cord 7
						(before) and cord 28 (after) disagree.
					</p>
					<p>
						Eight different seed windows sit inside that stretch, each one hit
						separately as the scan works along KH0304's tape, and every one of
						them extends out to the very same 20-cord span — a run is a property
						of the two tapes, not of which window happened to find it first.{" "}
						<Conf level="firm">A run, not just a seed</Conf>
					</p>
				</Prose>
				{cords0303.length > 0 && cords0304.length > 0 && (
					<Wide
						caption={
							<>
								The complete pass, width 5: window, index, lookup, extend, run —
								scrub or play through every step the scan takes.{" "}
								<span className="sae-source">
									Source: seedTrace(), src/lib/matching/seedTrace.ts — spans
									verified equal to pairRun() in
									scripts/matching/check_traces.mts
								</span>
							</>
						}
					>
						<ExtendTrace
							a={v0303}
							b={v0304}
							aCords={cords0303}
							bCords={cords0304}
							colors={colors}
							aLabel="KH0303"
							bLabel="KH0304"
						/>
					</Wide>
				)}
			</Step>

			<Step n={5} title="The dot plot">
				<Prose>
					<p>
						Plot every cord of one khipu against every cord of another, and mark
						a dot wherever the two hold the same nonzero value: a shared run
						then draws itself as a line of dots along a diagonal. KH0303 against
						KH0304 has only 32 such cells to begin with, and the one real run
						stands out on its own.
					</p>
					<p>
						A much bigger khipu makes the opposite point. KH0097 (Paris) and
						KH0586 (Lima) repeat a short template — 12, 22, 100, 40, 33 and a
						handful of others — in nearly every one of their units, so the two
						values alone produce thousands of equal cells scattered off any one
						diagonal. The filter exists for this plot: raise the minimum maximum
						or widen the window and most of the clutter disappears, because a
						dull template value like 12 or 33 can satisfy an exact match without
						ever being part of an informative window.{" "}
						<Conf level="firm">
							The filter removes the clutter, not the data
						</Conf>
					</p>
				</Prose>
				{v0303.length > 0 &&
					v0304.length > 0 &&
					v0097.length > 0 &&
					v0586.length > 0 && (
						<Wide
							caption={
								<>
									Dots: equal nonzero values. Blue diagonals: runs that pass the
									current window and minimum-maximum settings — adjust them and
									the plot recomputes.{" "}
									<span className="sae-source">
										Source: dotPlot() and seedTrace(),
										src/lib/matching/seedTrace.ts
									</span>
								</>
							}
						>
							<DotterFigure
								pairs={[
									{
										id: "0303-0304",
										a: v0303,
										b: v0304,
										aLabel: "KH0303",
										bLabel: "KH0304",
										width: 320,
										height: 320,
									},
									{
										id: "0097-0586",
										a: v0097,
										b: v0586,
										aLabel: "KH0097",
										bLabel: "KH0586",
										width: 520,
										height: 340,
									},
								]}
							/>
						</Wide>
					)}
			</Step>

			<Step n={6} title="Reading backwards">
				<Prose>
					<p>
						KH0121 and KH0473 are both in the Ethnologisches Museum, Berlin.
						Read forward against each other they share nothing — the scan finds
						no run of even four values. Their dots on a plot cluster along the{" "}
						<em>anti</em>-diagonal instead: a large value near the start of
						KH0121 sits near the <em>end</em> of KH0473, and a small one near
						the end of KH0121 sits near its start. One of the two was tied, or
						at least recorded, from the opposite end.
					</p>
					<p>
						The scan checks for exactly this: every pair is also compared with
						one side reversed. Flip KH0473's axis — the same transform — and the
						anti-diagonal becomes a diagonal: a run of 17 cords, then a second
						of 9, both confirmed by the same window-and-extend pass as step 4's,
						just run against the reversed tape.{" "}
						<Conf level="firm">One tape read from the other end</Conf>
					</p>
				</Prose>
				{v0121.length > 0 && v0473.length > 0 && (
					<Wide
						caption={
							<>
								KH0121 against KH0473. Flip to read KH0473 from its last cord
								backward.{" "}
								<span className="sae-source">
									Source: seedTrace() with reverseB,
									src/lib/matching/seedTrace.ts
								</span>
							</>
						}
					>
						<FlipReverse a={v0121} b={v0473} aLabel="KH0121" bLabel="KH0473" />
					</Wide>
				)}
			</Step>

			<Step n={7} title="What the scan found">
				<Prose>
					<p>
						Run across every pair in the corpus, the same scan is the{" "}
						<Link to="/network">network page</Link>'s source: every pair of
						khipus sharing a run of at least four values, forward or with one
						reversed, with no judgement yet attached to what it means. Most runs
						of four are what thousands of small counts produce on their own;
						runs of six or more are rarer and the next chapters start from a
						handful of them, including KH0303/KH0304 and KH0121/KH0473 above.
					</p>
					<p>
						Whether a count like these is more than the values alone would give
						is a question about chance, not about the scan — that is chapter 5,{" "}
						<Link to="/matching/against-chance">against chance</Link>.
					</p>
				</Prose>
				{scan && (
					<Wide
						caption={
							<>
								Every scanned pair by its longest shared run, against the mean
								of {scan.shuffles} shuffled corpora.{" "}
								<span className="sae-source">
									Source: public/data/stories/links.json, written by
									scripts/build_links.py
								</span>
							</>
						}
					>
						<CorpusFindings scan={scan} />
					</Wide>
				)}
			</Step>

			<Prose>
				<p className="sae-closing">
					<strong>What this step can and cannot tell you.</strong> Seed and
					extend finds exact agreement — the same values in the same order,
					forward or reversed. It says nothing about values that are close but
					not equal, cords inserted or dropped between two otherwise matching
					runs, or a passage whose order has been shuffled or regrouped; those
					are the next three chapters. And a run found is not yet a run that
					means something: a four-value match is common by chance alone, which
					is why the filter above exists and why chapter 5 checks every count
					here against shuffled copies of the same khipus.
				</p>
			</Prose>
		</ChapterShell>
	);
}
