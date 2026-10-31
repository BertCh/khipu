import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { ChapterShell } from "#/components/matching/ChapterShell";
import PrefixSearchFigure from "#/components/matching/sums/PrefixSearchFigure";
import ShuffleWarning from "#/components/matching/sums/ShuffleWarning";
import SumArcs from "#/components/matching/sums/SumArcs";
import SumGrowth from "#/components/matching/sums/SumGrowth";
import SummaryConverge from "#/components/matching/sums/SummaryConverge";
import TotalsPreview from "#/components/matching/sums/TotalsPreview";
import { Conf, Prose, Step, Wide } from "#/components/story/Story";
import { getColors, getKhipus, readJson } from "#/lib/khipu/data";
import { pendantTape } from "#/lib/matching/sums/pendantTape";
import { stepsForTarget } from "#/lib/matching/sums/targetSteps";
import { sumTrace } from "#/lib/matching/sumTrace";
import { CHANCE_JSON, type ChanceData, DEMO_IDS } from "#/lib/stories/chance";
import {
	HUACHO_A_ID,
	PACHACAMAC_ID,
	summaryRows,
} from "#/lib/stories/tiedtwice";
import {
	LEDGER_HEADS_ID,
	LEDGER_TOTALS_ID,
	totalsToHeads,
} from "#/lib/stories/totals";
import "#/styles/matching/base.css";
import "#/styles/matching/sums.css";

const HERO_ID = "KH0081";
const BIG_ID = "KH0698";
const TARGET_I = 42; // KH0081, p43 = 35
const BIG_TARGET_I = 0; // KH0081, p1 = 5928, the khipu's biggest sum

const CHAPTER_IDS = [
	...new Set([
		HERO_ID,
		BIG_ID,
		PACHACAMAC_ID,
		HUACHO_A_ID,
		LEDGER_TOTALS_ID,
		LEDGER_HEADS_ID,
		...DEMO_IDS,
	]),
];

export const Route = createFileRoute("/matching/sums")({
	loader: async () => {
		const [colors, khipus, chance] = await Promise.all([
			getColors(),
			getKhipus(CHAPTER_IDS),
			readJson<ChanceData>(CHANCE_JSON),
		]);
		return { colors, khipus, chance };
	},
	head: () => ({
		meta: [{ title: "Sums inside a khipu — How matching works" }],
	}),
	component: Sums,
});

function Sums() {
	const { colors, khipus, chance } = Route.useLoaderData();

	const hero = useMemo(() => pendantTape(khipus[HERO_ID]), [khipus]);
	const heroTrace = useMemo(() => sumTrace(hero.values), [hero]);
	const targetSteps = useMemo(
		() => stepsForTarget(heroTrace.steps, TARGET_I, "right"),
		[heroTrace],
	);

	const bigSum = useMemo(
		() => heroTrace.sums.find((s) => s.at === BIG_TARGET_I && s.right),
		[heroTrace],
	);

	const summary = useMemo(
		() => summaryRows(khipus[PACHACAMAC_ID], khipus[HUACHO_A_ID]),
		[khipus],
	);

	const totals = useMemo(
		() => totalsToHeads(khipus[LEDGER_TOTALS_ID], khipus[LEDGER_HEADS_ID]),
		[khipus],
	);

	const heroSumCount = heroTrace.sums.length;

	return (
		<ChapterShell
			slug="sums"
			title="Sums inside a khipu"
			standfirst="A cord can match a run of its own neighbours — the running sum that finds a total next to its parts."
		>
			<Prose>
				<p>
					Every chapter before this one matched a run of cords to another run of
					cords. This one matches a single cord to the cords around it: one
					pendant whose value equals the sum of a run of its neighbours. The
					rule is Marcia and Robert Ascher&rsquo;s relation 1, the one that
					Medrano and Khosla (2024) searched the whole Field Guide for; the code
					is <code>pendantSums</code> in <code>src/lib/stories/chance.ts</code>,
					and every figure below runs it, or a step-by-step port of it, on real
					cords.
				</p>
				<p>
					The rule: a cord worth more than 10 is checked against the first run
					of at least two cords, starting on the next nonzero cord, that adds up
					to it exactly — searched both to the right and to the left, and kept
					only if the run has fewer cords than the value itself (so a value of
					20 can be a sum of two to nineteen cords, never twenty or more). The
					first run found wins; the search does not keep looking for a better
					one.
				</p>
			</Prose>

			<Step n={1} title="The running sum">
				<Prose>
					<p>
						{HERO_ID} is a Cacatilla ledger of {hero.values.length} pendants.
						Its {heroSumCount} pendant&ndash;pendant sums include cord{" "}
						{hero.cords[TARGET_I]?.name}, worth {hero.cords[TARGET_I]?.value}.
						Step through the search for it: each attempt starts on the next
						nonzero cord and grows one cord at a time. Most attempts pass the
						target without ever landing on it exactly — a <em>miss</em> — and
						the search moves its start along. The one that lands on it exactly
						is recorded.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Every attempt the search makes for cord{" "}
							{hero.cords[TARGET_I]?.name} (value {hero.cords[TARGET_I]?.value}
							), in order. The bar is one stacked block per cord, coloured by
							its own swatch; the dashed line is the target. A block that ends
							past the line is a miss; one that ends exactly on it is the hit.
						</>
					}
				>
					<SumGrowth
						cords={hero.cords}
						colors={colors}
						steps={targetSteps}
						targetI={TARGET_I}
						targetValue={hero.values[TARGET_I]}
					/>
				</Wide>
			</Step>

			<Step n={2} title="All of them at once">
				<Prose>
					<p>
						{HERO_ID} alone carries {heroSumCount} such sums — not unusual for a
						khipu this size with these values, as chapter 5 will show, but
						enough that drawing every one of them over the tape says something
						on its own. A sum whose target reads to the left of the cords it
						totals (so the total comes first and the run follows, which{" "}
						<Conf level="firm">this project calls right-handed</Conf>) arcs
						above the line; one whose target follows its run arcs below.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Every pendant&ndash;pendant sum on {HERO_ID}, drawn as a bracket
							from its target cord to the far end of the run it totals. Dense
							regions are cords that take part in several sums at once.
						</>
					}
				>
					<SumArcs cords={hero.cords} sums={heroTrace.sums} />
				</Wide>
			</Step>

			{bigSum && (
				<Step n={3} title="The fast version">
					<Prose>
						<p>
							Growing a sum one cord at a time, as Figure 1 did, costs as many
							steps as the run is long. The code does not do that: it keeps a
							running prefix sum for the whole tape and asks, by halving the
							search range each time, for the first index whose cumulative total
							reaches the target. Cord {hero.cords[BIG_TARGET_I]?.name}, worth{" "}
							{hero.values[BIG_TARGET_I]?.toLocaleString()}, is the largest sum
							on this khipu: its run is {bigSum.to - bigSum.from + 1} cords
							long, {hero.cords[bigSum.from]?.name} to{" "}
							{hero.cords[bigSum.to]?.name} — long enough that the saving is
							easy to see.
						</p>
					</Prose>
					<Wide
						caption={
							<>
								The same search as Figure 1&rsquo;s, for a bigger target:
								narrowing a bracket over the whole tape&rsquo;s prefix sums
								instead of adding cords one at a time.
							</>
						}
					>
						<PrefixSearchFigure
							cords={hero.cords}
							values={hero.values}
							targetI={BIG_TARGET_I}
							start={bigSum.from}
						/>
					</Wide>
				</Step>
			)}

			<Step n={4} title="A summary across khipus">
				<Prose>
					<p>
						A sum does not have to stay on one khipu. AS175 (Berlin VA 42518,
						KH0192) has a short middle part — three five-field groups — that the
						Aschers read as a summary of the twenty-one five-field groups either
						side of it: field by field, the k-th summary group holds the sum of
						the k-th group of each of seven three-group sets in part 3.
						UR233/UR232, the two Huacho pieces spliced to the same accession
						number, restate parts 1 and 3 field for field in six-cord units (one
						blank cord added to every unit). That gives two independent checks
						of every summary cord: against AS175&rsquo;s own part 3, and against
						UR232&rsquo;s matching units.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							One summary field, both checks: seven part-3 cords converging on
							their sum, read from AS175 itself and separately from UR232.
							Choose another summary field above the figure.
						</>
					}
				>
					<SummaryConverge rows={summary} />
				</Wide>
			</Step>

			<Step n={5} title="Totals that travel">
				<Prose>
					<p>
						A sum can also leave the khipu it was added on. At Inkawasi, UR278
						(KH0517) totals its own nine-cord groups; walked in order against
						UR266 (KH0502), several of those totals land exactly on a head cord
						— the first knotted cord of a group — further along UR266. The first
						group&rsquo;s total of {totals[0]?.total.toLocaleString()} is
						UR266&rsquo;s own {totals[0]?.head?.name}.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							UR278&rsquo;s first {Math.min(14, totals.length)} group totals
							against the next unused head on UR266, in order.
						</>
					}
				>
					<TotalsPreview rows={totals} totalsLabel="UR278" headsLabel="UR266" />
				</Wide>
			</Step>

			<Step n={6} title="A warning">
				<Prose>
					<p>
						A count of sums, on its own, proves nothing: a khipu full of numbers
						will contain some cords that happen to equal a run of their
						neighbours, with no recorder intending it. The only way to tell a
						found sum from an accidental one is to ask what a shuffled copy of
						the same khipu would give. Shuffle {HERO_ID} and the count falls —
						every shuffle so far has found fewer sums than the real tie. Shuffle{" "}
						{BIG_ID}, the khipu with the most such sums anywhere in this data,
						and the opposite happens: every shuffle finds even more.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							{chance.R} shuffles already run for each khipu (grey dots), plus
							any more a click adds now. The dashed line is the real count.
						</>
					}
				>
					<ShuffleWarning data={chance} khipus={khipus} ids={DEMO_IDS} />
				</Wide>
			</Step>

			<Prose>
				<p>
					<strong>What this step can and cannot tell you.</strong> The running
					sum and its fast version say exactly which cords a target adds up to,
					on the real tape, with no approximation — that part is arithmetic, not
					inference. Drawing every sum at once, and matching sums across khipus,
					says where the same kind of pattern recurs. None of it says whether a
					given sum was intended: a dense arc diagram and a khipu whose shuffles
					beat its own tally are the same shape of evidence, read two different
					ways. Chapter 5 is the check that tells them apart.
				</p>
			</Prose>
		</ChapterShell>
	);
}
