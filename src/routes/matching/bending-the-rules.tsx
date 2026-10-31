import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import BrokenRunsFigure from "#/components/matching/bending-the-rules/BrokenRunsFigure";
import ChanceTeaser, {
	N_SHUFFLES,
} from "#/components/matching/bending-the-rules/ChanceTeaser";
import ClickTraceback from "#/components/matching/bending-the-rules/ClickTraceback";
import GapSliders from "#/components/matching/bending-the-rules/GapSliders";
import GridFill from "#/components/matching/bending-the-rules/GridFill";
import ScoreExplainer from "#/components/matching/bending-the-rules/ScoreExplainer";
import { ChapterShell } from "#/components/matching/ChapterShell";
import { Prose, Sources, Step, Wide } from "#/components/story/Story";
import { icOf } from "#/lib/engine/corpus";
import { loadCorpus } from "#/lib/engine/load";
import { getColors, getKhipu } from "#/lib/khipu/data";
import { brokenRuns } from "#/lib/matching/bending-the-rules/brokenRuns";
import "#/styles/matching/base.css";
import "#/styles/matching/bending-the-rules.css";

export const Route = createFileRoute("/matching/bending-the-rules")({
	loader: async () => {
		const [colors, k303, k304, k192, k470, corpus] = await Promise.all([
			getColors(),
			getKhipu("KH0303"),
			getKhipu("KH0304"),
			getKhipu("KH0192"),
			getKhipu("KH0470"),
			loadCorpus(),
		]);
		return { colors, k303, k304, k192, k470, corpus };
	},
	head: () => ({ meta: [{ title: "Bending the rules — How matching works" }] }),
	component: BendingTheRules,
});

function FigSource({ children }: { children: string }) {
	return (
		<p className="muted btr-source">
			Source: <code>{children}</code>
		</p>
	);
}

function BendingTheRules() {
	const { colors, k303, k304, k192, k470, corpus } = Route.useLoaderData();
	const ic = useMemo(() => icOf(corpus), [corpus]);
	const br = useMemo(
		() => (k303 && k304 ? brokenRuns(k303, k304) : null),
		[k303, k304],
	);

	if (!k303 || !k304 || !k192 || !k470 || !br) {
		return (
			<ChapterShell slug="bending-the-rules" title="Bending the rules">
				<p className="prose">
					One of the khipus this chapter needs (KH0303, KH0304, KH0192 or
					KH0470) did not load.
				</p>
			</ChapterShell>
		);
	}

	const span = br.spans[0];
	const diffCount = br.compared - br.agree;

	return (
		<ChapterShell
			slug="bending-the-rules"
			title="Bending the rules"
			standfirst="A tolerant alignment bridges mismatches, slips and gaps that an exact run can't — and says what it cost."
		>
			<Step n={1} title="Why exact runs are brittle">
				<Prose>
					<p>
						KH0303 and KH0304 both carry {br.tapeA.length} level-1 cords and
						agree at {br.agree} of {br.compared} positions. The exact scan from
						the last chapter (<code>pairRun</code>) still reports only one
						shared run, {span[0]} cords long, starting at cord {span[1] + 1} of
						KH0303 and cord {span[2] + 1} of KH0304. The {diffCount} cords where
						the two disagree are all the same kind of difference — one side
						blank where the other holds a value — and they cut what would
						otherwise be a near-total match into pieces too short for the scan
						to notice.
					</p>
					<p>
						The scan is exact: a single differing cord ends a run outright. A
						tolerant alignment can instead pay a small cost to cross a mismatch
						or a gap and keep going, which is what the rest of this chapter
						builds.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							KH0303 and KH0304, cord by cord. Solid: the one run{" "}
							<code>pairRun</code> finds. Dashed: cords where the two tapes
							disagree, breaking the run on either side of it.
						</>
					}
				>
					<BrokenRunsFigure data={br} colors={colors} />
				</Wide>
				<FigSource>
					src/lib/engine/tests/passages.ts,
					src/lib/matching/bending-the-rules/brokenRuns.ts
				</FigSource>
			</Step>

			<Step n={2} title="Scoring a pair of cords">
				<Prose>
					<p>
						A tolerant alignment needs a score for every pair of cords it might
						line up, not just "same" or "different". <code>align.ts</code>'s
						rule: two equal nonzero values score by how surprising that value is
						across the whole corpus — its <em>information content</em>,{" "}
						<code>IC(v)</code>, which runs from 0 for the most common values up
						to a cap of 13 for the rarest values, seen three times or fewer in
						the whole corpus. Two blanks score 0; a blank against a value scores
						−1.5. A <em>slip</em> — off by one, a single digit off by one, a
						value times ten, two digits swapped, or one digit dropped — scores a
						fraction of the mean information content of the two values, floored
						at −3 so a slip never scores worse than an unrelated pair. Anything
						else scores a flat −3.
					</p>
					<p>
						Try your own pair below, or click one of the worked examples. Two of
						them — a digit off by one, and an unrelated pair — are cords that
						actually appear against each other in step 5.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Live score for any pair of values, from <code>subScoreP</code>, a
							parameterised copy of <code>align.ts</code>'s{" "}
							<code>subScore</code>.
						</>
					}
				>
					<ScoreExplainer ic={ic} />
				</Wide>
				<p className="muted btr-source">
					IC here is <code>corpus-lite.json</code>'s whole-corpus{" "}
					<code>icOf</code> — <code>align.ts</code> notes that this differs
					slightly from <code>scripts/deep/align_scan.py</code>'s version, which
					smooths every frequency by +0.5.
				</p>
				<FigSource>
					src/lib/engine/tests/align.ts, src/lib/matching/swTrace.ts
				</FigSource>
			</Step>

			<Step n={3} title="The grid">
				<Prose>
					<p>
						Smith–Waterman–Gotoh fills a grid of {br.tapeA.length + 1} by{" "}
						{br.tapeB.length + 1} cells, one row per cord of KH0303, one column
						per cord of KH0304. Each cell's score is the best way to end a local
						alignment there: extend a diagonal match or slip, open or extend a
						gap on either side, or start over at zero. The grid below fills row
						by row, exactly as <code>align.ts</code>'s kernel does; once it's
						full, the brightest cell is traced back to where its alignment
						began.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							KH0303 (rows) against KH0304 (columns). Brightness = running score
							at that cell. Once filled, the best cell's traceback is drawn over
							the grid and read out below as two tapes.
						</>
					}
				>
					<GridFill k303={k303} k304={k304} ic={ic} />
				</Wide>
				<FigSource>
					src/lib/matching/swTrace.ts, src/lib/engine/tests/align.ts
					(`swEncoded`)
				</FigSource>
			</Step>

			<Step n={4} title="Click any cell">
				<Prose>
					<p>
						The best score isn't the only local alignment on the grid — it's
						only the brightest. Any cell's own value is itself the best score of
						some local alignment ending exactly there. Click a cell to trace
						that one back instead.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							The same grid, fully filled. Click a cell to see the local
							alignment ending there; the reading below updates to match.
						</>
					}
				>
					<ClickTraceback k303={k303} k304={k304} ic={ic} />
				</Wide>
				<FigSource>src/lib/matching/swTrace.ts (`traceFrom`)</FigSource>
			</Step>

			<Step n={5} title="Gaps, and the cost of opening one">
				<Prose>
					<p>
						A gap costs <code>GO</code> = 4 to open and <code>GE</code> = 1 for
						every further cord it covers — an affine cost, cheaper per cord the
						longer it runs, the way a recording that skips several cords at once
						should be. AS175 (KH0192) is a Pachacamac khipu read as 5-cord
						groups; the Huacho khipu UR233 (KH0470) restates its first part as
						6-cord units with a blank cord spliced in at a fixed slot, so the
						other five fields land one slot later from there on. Aligning the
						two raw tapes — nothing told the algorithm where the blank sits —
						finds a gap at the same relative point in every one of the six
						units, by default.
					</p>
					<p>
						The sliders change the cost of a gap and the credit for a slip and
						re-run the alignment on a window of six groups against six units.
						Push the gap-open cost high enough and it stops paying to skip the
						blank at all; push slip credit to zero and a slip scores the same as
						an unrelated pair.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							AS175 groups 2–7 against UR233 units 2–7, realigned on every
							slider move. Wherever a gap appears it is always at the same
							relative position, next to the blank cord UR233's recorder added;
							raising the gap-open cost only makes some of the six disappear, it
							never moves one elsewhere.
						</>
					}
				>
					<GapSliders k192={k192} k470={k470} colors={colors} ic={ic} />
				</Wide>
				<FigSource>
					src/lib/matching/swTrace.ts, src/lib/stories/tiedtwice.ts
				</FigSource>
			</Step>

			<Step n={6} title="A score alone means nothing">
				<Prose>
					<p>
						50-odd, 60-odd — is that a lot? Not on its own. A score only means
						something next to what the same pair would score if one side's order
						were scrambled. That's exactly what{" "}
						<code>src/lib/engine/tests/pair.ts</code>'s executor does: it keeps
						KH0303 fixed, shuffles KH0304's sequence, and recomputes the same
						alignment. Below is a quick preview — {N_SHUFFLES} shuffles, not the
						full run — of KH0303 against KH0304 this way.
					</p>
					<p>
						The p below already uses the same +1-corrected tail the rest of the
						site does, but with only {N_SHUFFLES} shuffles it can't read out any
						finer than 1/{N_SHUFFLES + 1}.{" "}
						<Link to="/matching/against-chance">Against chance</Link>, the last
						chapter in this series, runs this properly: far more shuffles, a
						dozen more pairs, and a correction for testing all of them at once.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							KH0303×KH0304's alignment score against 24 shuffles of KH0304's
							sequence (whole-sequence model). Real p-value, small sample — too
							few shuffles to read as more than a rough floor.
						</>
					}
				>
					<ChanceTeaser corpus={corpus} />
				</Wide>
				<FigSource>
					src/lib/engine/tests/pair.ts, src/lib/engine/nulls.ts
				</FigSource>
			</Step>

			<Prose>
				<h3>What this chapter can and cannot tell you</h3>
				<p>
					A high alignment score says two tapes can be lined up, tolerating a
					bounded number of slips, mismatches and gaps, more cheaply than chance
					would predict — it does not by itself say the two cords mean the same
					thing, or that a recorder meant to relate them. The scoring constants
					(−3 for a mismatch, 4 to open a gap, and so on) are fixed choices
					tuned once for the whole corpus, not learned per pair; a different
					pair might deserve different tolerances. And a single score, as step 6
					showed, needs a shuffle to be worth anything at all.
				</p>
			</Prose>

			<Sources
				items={[
					{
						who: "src/lib/engine/tests/align.ts",
						what: "the substitution rule, isSlip, and the Gotoh fill (swEncoded)",
						where:
							"a port of scripts/deep/align_scan.py's Scorer and align_sw.c",
					},
					{
						who: "src/lib/matching/swTrace.ts",
						what: "the full H/E/F matrices and traceback this chapter's figures read",
						where: "swTrace, traceFrom, subScoreP",
					},
					{
						who: "src/lib/engine/tests/passages.ts",
						what: "pairRun, the exact scan step 1 shows breaking",
						where: "also the subject of the previous chapter",
					},
					{
						who: "src/lib/stories/tiedtwice.ts",
						what: "AS175/UR233's field map and blank-cord position",
						where: "FIELDS, HUACHO, unitsOf",
					},
					{
						who: "src/lib/engine/tests/pair.ts, src/lib/engine/nulls.ts",
						what: "the pair-vs-shuffle executor behind step 6's preview",
						where: "pairExecFrom, drawNull",
					},
				]}
			/>
		</ChapterShell>
	);
}
