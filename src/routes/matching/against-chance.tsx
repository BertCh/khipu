import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import DotRows, { DotKey, type DotRow } from "#/components/charts/DotRows";
import { StatTile } from "#/components/charts/Figure";
import NullModelCard from "#/components/matching/against-chance/NullModelCard";
import PairChance from "#/components/matching/against-chance/PairChance";
import PowerControl from "#/components/matching/against-chance/PowerControl";
import ShuffleDemo from "#/components/matching/against-chance/ShuffleDemo";
import { ChapterShell } from "#/components/matching/ChapterShell";
import NumberTape from "#/components/matching/NumberTape";
import { Conf, Prose, Step, Wide } from "#/components/story/Story";
import { loadCorpus } from "#/lib/engine/load";
import { NULL_BLURB, NULL_LABEL } from "#/lib/engine/nulls";
import { getColors, getKhipu, readJson } from "#/lib/khipu/data";
import { tapeOf } from "#/lib/matching/tape";
import type { ScanFile } from "#/lib/stories/links";
import "#/styles/matching/base.css";
import "#/styles/matching/against-chance.css";

const DEMO_ID = "KH0303";
const PAIR_CLAIM = "pair:KH0303|KH0304";

export const Route = createFileRoute("/matching/against-chance")({
	loader: async () => {
		const [colors, khipu, corpus, scan] = await Promise.all([
			getColors(),
			getKhipu(DEMO_ID),
			loadCorpus(),
			readJson<ScanFile>("stories/links.json"),
		]);
		return { colors, khipu, corpus, scan };
	},
	head: () => ({
		meta: [
			{ title: "Against chance — How matching works" },
			{
				name: "description",
				content:
					"Every match the method finds is checked against shuffled copies of the same khipus, live in the browser, so a run means more than the numbers alone could give.",
			},
		],
	}),
	component: AgainstChance,
});

const ONE = (v: number) =>
	v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString();

function AgainstChance() {
	const { colors, khipu, corpus, scan } = Route.useLoaderData();
	const cords = useMemo(() => (khipu ? tapeOf(khipu) : []), [khipu]);
	const groups = useMemo(() => cords.map((c) => c.group), [cords]);

	const nPairs = corpus.khipus.length;
	const searchSize = (nPairs * (nPairs - 1)) / 2;
	const scanStats = useMemo(() => {
		const ids = new Set<string>();
		for (const p of scan.pairs) {
			ids.add(p.a);
			ids.add(p.b);
		}
		return { rows: scan.pairs.length, khipus: ids.size };
	}, [scan]);

	const floorRows: DotRow[] = (["6", "5", "4"] as const).map((k) => {
		const f = scan.baseline[k];
		const nearChance = f.observed < 2 * f.shuffled;
		return {
			key: k,
			label: `Longest shared run ${k === "6" ? "≥ 6" : `= ${k}`}`,
			value: f.observed,
			ref: f.shuffled,
			note: `${f.observed} vs ${ONE(f.shuffled)}`,
			emphasis: k === "6",
			muted: nearChance,
			tip: (
				<>
					<div className="chart-tip-title">
						Longest shared run {k === "6" ? "of six or more" : `of ${k}`}
					</div>
					<div className="chart-tip-row">
						<strong>{f.observed}</strong>
						<span>pairs of khipus in the corpus</span>
					</div>
					<div className="chart-tip-row">
						<strong>{ONE(f.shuffled)}</strong>
						<span>on average in {scan.shuffles} shuffled corpora</span>
					</div>
				</>
			),
		};
	});
	const floorMax = Math.max(...floorRows.map((r) => r.value), 1);
	const floorTop = Math.ceil(floorMax / 10) * 10;
	const floorTicks = Array.from(
		{ length: floorTop / 10 + 1 },
		(_, i) => i * 10,
	);

	const VISUALIZED_MODELS = [
		{
			model: "sequence" as const,
			why: "Keeps nothing but the multiset of values on the tape — the strictest null, and the one most of this project's pair and corpus shuffles use by default.",
		},
		{
			model: "seqWithin" as const,
			why: "Keeps each group's own values inside that group's own stretch of the tape — stricter than a whole-sequence shuffle whenever a finding could ride on which group a value sits in, not just on the value itself.",
		},
		{
			model: "groupOrder" as const,
			why: "Keeps every group intact, contents and all, and only reorders whole groups — the right null when the question is which group sits where, not what is inside it.",
		},
	];

	return (
		<ChapterShell
			slug="against-chance"
			title="Against chance"
			standfirst="Every match above is checked against shuffled copies of the same khipus, so a run means more than numbers alone."
		>
			<Step n={1} title="Shuffling, fairly">
				<Prose>
					<p>
						Every chance check on this site starts from the same shuffle:
						Fisher&ndash;Yates, high index to low, each position drawing one
						candidate from everything not yet placed. It is not a vague notion
						of "randomise it" &mdash; it is one specific loop, and this project
						runs the exact same loop everywhere it shuffles anything, from a
						single pair's cords to a whole corpus of pendant values.
					</p>
					<p>
						The loop takes its randomness from a seeded generator, not the
						system clock, so a shuffle is reproducible: the same seed retraces
						the same swaps, in the same order, every time.{" "}
						<Conf level="firm">fisherYates(), shuffleInPlace()</Conf> That is
						what lets a p-value be quoted at all: "shuffled 1,000 times" only
						means something if a reader, or this project's own checker script
						(scripts/matching/check_traces.mts), can rerun those exact 1,000
						shuffles and get the exact same answer.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Sixteen tiles, Fisher&ndash;Yates swap by swap: an arc over the
							row for each swap drawn, the strip below coloured by where each
							tile started.{" "}
							<span className="ac-source">
								Source: fisherYates(), src/lib/matching/shuffleTrace.ts
								(instrumented copy of shuffleInPlace, src/lib/engine/rng.ts)
							</span>
						</>
					}
				>
					<ShuffleDemo />
				</Wide>
			</Step>

			<Step n={2} title="What a shuffle keeps">
				<Prose>
					<p>
						A shuffle is only as strict as what it refuses to move. This project
						uses six named chance models (<code>src/lib/engine/nulls.ts</code>),
						each keeping a different piece of a khipu's structure fixed while it
						randomises the rest. Three move values along the tape every chapter
						above reads; the other three move whole pendants &mdash; colour,
						subsidiaries and value together &mdash; among slots, which this tape
						view does not picture, so they are named but not drawn below.
					</p>
					<p>
						<strong>{NULL_LABEL.values}</strong>: &ldquo;{NULL_BLURB.values}
						&rdquo; <strong>{NULL_LABEL.pendants}</strong>: &ldquo;
						{NULL_BLURB.pendants}&rdquo; <strong>{NULL_LABEL.within}</strong>:
						&ldquo;{NULL_BLURB.within}&rdquo; All three are the Medrano &amp;
						Khosla sum-count nulls this project's own re-check used;{" "}
						<Link to="/stories/what-chance-can-do">what chance can do</Link>{" "}
						walks through them on real sums.
					</p>
				</Prose>
				{cords.length > 0 && (
					<Wide
						caption={
							<>
								{DEMO_ID}, 32 cords in six groups of 4, 12, 4, 4, 4 and 4
								&mdash; the tape every panel below reshuffles.{" "}
								<span className="ac-source">
									Source: tapeOf(), src/lib/matching/tape.ts
								</span>
							</>
						}
					>
						<NumberTape
							cords={cords}
							colors={colors}
							label={`${DEMO_ID}, ${cords.length} cords, in order`}
						/>
					</Wide>
				)}
				<div className="ac-null-cards">
					{VISUALIZED_MODELS.map(({ model, why }) => (
						<NullModelCard
							key={model}
							model={model}
							groups={groups}
							label={NULL_LABEL[model]}
							blurb={NULL_BLURB[model]}
							why={why}
						/>
					))}
				</div>
				<p className="ac-source ac-source-block">
					Source: nullPerm() / biasMatrix(), src/lib/matching/shuffleTrace.ts;
					labels and blurbs quoted directly from NULL_LABEL / NULL_BLURB,
					src/lib/engine/nulls.ts. The group-order picture above groups the
					tape's own unbroken runs of one group id; the engine's real
					group-order null instead reorders pendant clusters sorted by (group,
					ordinal). For {DEMO_ID}, whose six groups already sit in ascending,
					unbroken blocks with no top cords, the two agree; a khipu with a top
					cord breaking up a group, or groups recorded out of order, could
					differ &mdash; see shuffleTrace.ts's own note on
					nullPerm('groupOrder', &hellip;).
				</p>
			</Step>

			<Step n={3} title="One pair against its own chance">
				<Prose>
					<p>
						Chapter 1 found a run of 20 matching cords between KH0303 and
						KH0304, out of 32. Chapter 2 scored how well the two align once
						slips and gaps are allowed. Is either number unusual, or is it what
						32 cords of these values would produce against almost any partner?
						The only way to answer that is to ask the same question of partners
						that definitely don't match: shuffle KH0304's cords and recompute.
					</p>
					<p>
						This figure runs live, in this browser, the same{" "}
						<code>pair:KH0303|KH0304</code> hypothesis{" "}
						<Link to="/next/proving-ground" search={{ claim: PAIR_CLAIM }}>
							the Proving Ground
						</Link>{" "}
						re-runs for every claim on the site: the real pair test (
						<code>src/lib/engine/tests/pair.ts</code>), seeded exactly as{" "}
						<code>src/lib/engine/hypothesis.ts</code> seeds every replicate, so
						the p-value below is not a dramatisation &mdash; it is the number
						this project would report.{" "}
						<Conf level="firm">pairExecFrom(), DEFAULT_SEED</Conf>
					</p>
				</Prose>
				<Wide
					caption={
						<>
							KH0303 fixed; KH0304 shuffled, live, up to 1,000 times. Each
							shuffle drops one dot; the vertical line is the real pair.{" "}
							<span className="ac-source">
								Source: useLiveNull() calling pairExecFrom(),
								src/lib/engine/tests/pair.ts, through getHypothesis() /
								getExecutor(), src/lib/engine/registry.ts
							</span>
						</>
					}
				>
					<PairChance corpus={corpus} />
				</Wide>
				<Prose>
					<p>
						Run it: at the default measure and the default thousand shuffles, no
						shuffle of KH0304 comes close to either the alignment score or the
						exact-run length KH0303 and KH0304 actually share &mdash; the
						p-value sits at the floor this test can report,{" "}
						<code>1 / (R + 1)</code>, about 0.001 at R = 1,000. That floor is a
						property of R, not of the pair: a thousand shuffles can never report
						a p smaller than one in a thousand-and-one, however decisively the
						real pair wins. Switching KH0304's shuffle to "within its own
						groups" barely moves the answer here either: every cord still moves,
						just inside its own group instead of the whole tape, and the longest
						run that produces reaches only 6 cords across 1,000 such shuffles
						&mdash; nowhere near the 20 the real pair shares.
					</p>
				</Prose>
			</Step>

			<Step n={4} title="The corpus's noise floor">
				<Prose>
					<p>
						The same idea, run once over the whole corpus instead of one pair:{" "}
						<Link to="/network">the network page</Link>'s scan flags every pair
						of khipus sharing a run of values in order, four or more, forward or
						with one side reversed. Its floor comes from running that scan again
						over {scan.shuffles} copies of the corpus with every khipu's values
						shuffled &mdash; not read live here (a full corpus scan is not
						something to rerun on every page load), but quoted directly from the
						same file the network page itself reads.
					</p>
					<p>
						Runs of six or more: {scan.baseline["6"].observed} pairs found,{" "}
						{ONE(scan.baseline["6"].shuffled)} on average once the corpus is
						shuffled. Runs of exactly five: {scan.baseline["5"].observed}{" "}
						against {ONE(scan.baseline["5"].shuffled)}. Runs of exactly four:{" "}
						{scan.baseline["4"].observed} against{" "}
						{ONE(scan.baseline["4"].shuffled)} &mdash; close enough to chance
						that a four-value match alone is weak evidence of anything.{" "}
						<Conf level="firm">Runs of six are not chance</Conf> The floor
						itself rests on only {scan.shuffles} shuffled corpora, so it is a
						rough mean and it wobbles: rerun the shuffle and the count of
						four-runs would move by several pairs either way.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Pairs of khipus by their longest shared run, against the mean of{" "}
							{scan.shuffles} shuffled corpora.{" "}
							<span className="ac-source">
								Source: public/data/stories/links.json "baseline", written by
								scripts/build_links.py
							</span>
						</>
					}
				>
					<DotRows
						rows={floorRows}
						domain={[0, floorTop]}
						ticks={floorTicks}
						format={(v) => String(v)}
						axisLabel="pairs of khipus"
					/>
					<DotKey
						observed="pairs found"
						ring={`mean of ${scan.shuffles} shuffled corpora`}
					/>
				</Wide>
			</Step>

			<Step n={5} title="Does the test have power?">
				<Prose>
					<p>
						A test that never finds anything would also pass every check above
						&mdash; chance is only half the question. The other half is whether
						the test can find a real match when one is actually there, and this
						project keeps one fixed pair to check exactly that:{" "}
						<Link to="/stories/what-chance-can-do">
							KH0097 and KH0586, Paris and Lima
						</Link>
						, against a seeded shuffle of KH0586 that destroys whatever the two
						once shared (the decoy, a negative control), and the same shuffle
						with the pair's own longest run written back in at its place (the
						planted copy, a positive control).{" "}
						<Conf level="firm">CONTROL_A/B, CONTROL_SEED = 777</Conf>
					</p>
					<p>
						Both run below exactly as{" "}
						<code>src/lib/engine/tests/controls.ts</code> defines them. The
						project expects the decoy to fall &mdash; to land inside its own
						null, unremarkable &mdash; and the planted copy to stand out.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Two null distributions, 1,000 shuffles each, from the same base
							pair. Left: no real signal. Right: the longest shared run spliced
							back in before any further shuffling.{" "}
							<span className="ac-source">
								Source: decoyExec / plantedExec,
								src/lib/engine/tests/controls.ts
							</span>
						</>
					}
				>
					<PowerControl corpus={corpus} />
				</Wide>
				<Prose>
					<p>
						Run it: the decoy's own score lands well inside its null &mdash; p
						around 0.27, nothing a reader should call a finding. The planted
						copy's score stands out, but not by a wide margin: p around 0.01 at
						a thousand shuffles, the modest end of what this site calls
						significant. That is an honest weakness, not a hidden one &mdash;
						this positive control plants exactly one copy, at one strength, in
						one position. It shows the test <em>can</em> find a real passage; it
						does not show how reliably it would find a fainter one, or one
						broken by more slips than this one carries.
					</p>
				</Prose>
			</Step>

			<Step n={6} title="The size of the search">
				<Prose>
					<p>
						Everything above asks one question at a time: is <em>this</em>{" "}
						pair's score unusual against reshuffles of <em>this</em> pair? It
						does not ask whether finding some such pair, among every pair the
						corpus could offer, would be unusual &mdash; and those are different
						questions. The corpus below holds {nPairs.toLocaleString()} khipus,
						which makes {searchSize.toLocaleString()} possible pairs; the
						network scan flagged {scanStats.rows} of them, touching{" "}
						{scanStats.khipus} khipus, as sharing a run of four values or more.
					</p>
					<p>
						A single pair's shuffle cannot account for a search over{" "}
						{searchSize.toLocaleString()} candidates &mdash; a run found by a
						corpus-wide screen is shown on this site but not judged by its own
						pair-shuffle p-value alone, for exactly this reason.{" "}
						<Conf level="firm">registry.ts's SCREEN_WHY / SCAN_WHY</Conf> Every
						claim this project makes, including every number on this page, can
						be re-run and varied at{" "}
						<Link to="/next/proving-ground">/next/proving-ground</Link>; the two
						pair tests above are also searchable there by name.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Computed from the corpus actually loaded by this page.{" "}
							<span className="ac-source">
								Source: loadCorpus(), src/lib/engine/load.ts;
								n&middot;(n&minus;1)/2 computed here; scan counts from
								public/data/stories/links.json
							</span>
						</>
					}
				>
					<div className="stats ac-search-stats">
						<StatTile label="khipus in the corpus" value={nPairs} />
						<StatTile
							label="possible pairs"
							value={searchSize}
							hint="n · (n − 1) / 2"
						/>
						<StatTile
							label="pairs the scan flagged"
							value={scanStats.rows}
							hint="shared run of 4 or more"
						/>
						<StatTile
							label="khipus touched by a flagged pair"
							value={scanStats.khipus}
						/>
					</div>
				</Wide>
			</Step>

			<Prose>
				<p className="ac-closing">
					<strong>What this step can and cannot tell you.</strong> A chance
					check tells you whether a number could plausibly be what random values
					alone would produce &mdash; nothing about whether the values mean what
					a story built on them claims, and nothing about a coincidence that
					genuinely is a coincidence, since some pairs will clear even a strict
					shuffle by chance alone. It needs a positive control to show it can
					find a real match at all, and a sense of how large the search was to
					know whether finding one pair among many is itself unremarkable. None
					of that makes a single khipu's values mean anything on its own &mdash;
					it only says, as plainly as the numbers allow, which of this project's
					matches are more than the numbers alone would give, and which are not
					yet shown to be.
				</p>
			</Prose>
		</ChapterShell>
	);
}
