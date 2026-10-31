import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
	ComparisonTable,
	EvidenceDeck,
	ValueRun,
} from "#/components/story/CrossLink";
import {
	Conf,
	Layers,
	Prose,
	Sources,
	Step,
	StoryPage,
	Wide,
} from "#/components/story/Story";
import StrandWeave, {
	type StrandWeaveProps,
} from "#/components/story/StrandWeave";
import TotalsCascade, {
	type CascadeThread,
} from "#/components/story/TotalsCascade";
import { getColors, getKhipus, getSilhouettes } from "#/lib/khipu/data";
import { compareRuns } from "#/lib/stories/crosslinks";
import { pairKey } from "#/lib/stories/links";
import { getStrands, type StrandFile } from "#/lib/stories/strands";
import {
	BERLIN_A_ID,
	BERLIN_B_ID,
	CONFOUNDS,
	EMPTY,
	GRAMMAR,
	groupEnd,
	groupStarting,
	groupValues,
	LEDGER_HEADS_ID,
	LEDGER_MIRROR_ID,
	LEDGER_TOTALS_ID,
	named,
	PASSAGE_IDS,
	pendantList,
	RELAID_COPY_ID,
	RELAID_SOURCE_ID,
	relaid,
	SCALED_A_ID,
	SCALED_B_ID,
	SECOND_HEADS_ID,
	SECOND_LEADERS_ID,
	SECOND_TOTALS_ID,
	SERIES_THIRD_ID,
	sharedPassage,
	TOTALS_IDS,
	type TotalToHead,
	TRIAD_A_ID,
	TRIAD_B_ID,
	totalsCascade,
	totalsToHeads,
} from "#/lib/stories/totals";
import "#/styles/stories/totals-that-travel.css";

export const Route = createFileRoute("/stories/totals-that-travel")({
	loader: async () => {
		const [khipus, colors, silhouettes, strands] = await Promise.all([
			getKhipus(TOTALS_IDS),
			getColors(),
			getSilhouettes(),
			getStrands(),
		]);
		return { khipus, colors, silhouettes, strands };
	},
	head: () => ({ meta: [{ title: "Totals that travel — Khipu" }] }),
	component: TotalsThatTravel,
});

function TotalsTable({
	rows,
	left,
	right,
}: {
	rows: TotalToHead[];
	left: string;
	right: string;
}) {
	return (
		<div className="ledger match-ledger">
			<table className="ledger-table">
				<thead>
					<tr>
						<th className="num">{left} group</th>
						<th className="num">cords</th>
						<th className="num">group total</th>
						<th>{right} head</th>
						<th className="num">value</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((r) => (
						<tr
							key={r.group}
							className={r.head ? "match-exact" : "match-missing"}
						>
							<td className="num">{r.group}</td>
							<td className="num">{r.cords}</td>
							<td className="num">{r.total.toLocaleString()}</td>
							<td className={r.head ? "ok" : "muted"}>
								{r.head ? `${r.head.name} · group ${r.head.group}` : "—"}
							</td>
							<td className="num">
								{r.head ? r.head.value.toLocaleString() : ""}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

/** the cord-for-cord threads of one strands link, turned so `a` is `from`'s cord */
function threadsFrom(
	strands: StrandFile | undefined,
	from: string,
	to: string,
): CascadeThread[] {
	const l = strands?.links[pairKey(from, to)];
	if (!l) return [];
	const flip = l.a !== from;
	return l.threads
		.filter((t) => t.kind === "exact" || t.kind === "near")
		.map((t) => ({
			a: (flip ? t.b : t.a)[0],
			b: (flip ? t.a : t.b)[0],
			kind: t.kind as "exact" | "near",
			va: flip ? t.vb : t.va,
			vb: flip ? t.va : t.vb,
		}));
}

const NAMES: Record<string, string> = {
	[LEDGER_TOTALS_ID]: "UR278",
	[LEDGER_HEADS_ID]: "UR266",
	[SECOND_TOTALS_ID]: "UR270",
	[SECOND_HEADS_ID]: "UR274B",
	[RELAID_SOURCE_ID]: "UR053B",
	[RELAID_COPY_ID]: "UR053C",
	KH0242: "UR006",
	KH0245: "UR009",
	KH0257: "UR021",
};

const HERO_LINKS = [
	pairKey(LEDGER_TOTALS_ID, LEDGER_HEADS_ID),
	pairKey(SECOND_TOTALS_ID, SECOND_HEADS_ID),
];

/** the relaid copy: a thread that leaves a subsidiary is drawn bold */
const subsidiaryFirst: StrandWeaveProps["emphasis"] = (t) =>
	t.subA?.length || t.subB?.length ? "strong" : undefined;

function TotalsThatTravel() {
	const { khipus, colors, silhouettes, strands } = Route.useLoaderData();
	const k = khipus;

	const ledger = useMemo(
		() => totalsToHeads(k[LEDGER_TOTALS_ID], k[LEDGER_HEADS_ID]),
		[k],
	);
	const mirror = useMemo(
		() => totalsToHeads(k[LEDGER_TOTALS_ID], k[LEDGER_MIRROR_ID]),
		[k],
	);
	const second = useMemo(
		() => totalsToHeads(k[SECOND_TOTALS_ID], k[SECOND_HEADS_ID]),
		[k],
	);
	const relaidRows = useMemo(
		() => relaid(k[RELAID_SOURCE_ID], k[RELAID_COPY_ID]),
		[k],
	);
	const passage = useMemo(() => sharedPassage(k), [k]);

	const ledgerHits = ledger.filter((r) => r.head);
	const shown = ledger.slice(0, 17);

	// step 1: KH0517's first 17 groups onto KH0502, and KH0514 by the mirror
	const cascade = useMemo(() => {
		const groups = totalsCascade(k[LEDGER_TOTALS_ID], k[LEDGER_HEADS_ID], {
			near: true,
		}).slice(0, 17);
		const lastHead = Math.max(
			...groups.map((g) => g.head ?? g.near?.cord ?? 0),
		);
		const headsTo = groupEnd(k[LEDGER_HEADS_ID], lastHead);
		const mirror = threadsFrom(
			strands,
			LEDGER_HEADS_ID,
			LEDGER_MIRROR_ID,
		).filter((t) => t.a < headsTo);
		const mirrorTo = groupEnd(
			k[LEDGER_MIRROR_ID],
			Math.max(0, ...mirror.map((t) => t.b)),
		);
		return { groups, headsTo, mirror, mirrorTo };
	}, [k, strands]);

	// step 2: KH0507 onto KH0513, with KH0511 hung by the shared leaders
	const cascade2 = useMemo(() => {
		const all = totalsCascade(k[SECOND_TOTALS_ID], k[SECOND_HEADS_ID]);
		const last = Math.max(
			...all.filter((g) => g.head != null).map((g) => g.group),
		);
		const groups = all.slice(0, last + 2);
		const leaders = threadsFrom(strands, SECOND_HEADS_ID, SECOND_LEADERS_ID);
		const headsTo = groupEnd(
			k[SECOND_HEADS_ID],
			Math.max(...groups.map((g) => g.head ?? 0), ...leaders.map((t) => t.a)),
		);
		const belowTo = groupEnd(
			k[SECOND_LEADERS_ID],
			Math.max(...leaders.map((t) => t.b)),
		);
		const unmatched = all.filter((g) => g.total >= 1000 && g.head == null);
		return { groups, leaders, headsTo, belowTo, unmatched };
	}, [k, strands]);
	const secondHits = second.filter((r) => r.head);
	const relaidExact = relaidRows.filter((r) => r.verdict === "exact");
	const fromSubs = relaidExact.filter((r) => r.wasSubsidiary).length;
	const firstGroup = groupValues(k[LEDGER_TOTALS_ID], 1);

	const berlinGroupA = groupStarting(k[BERLIN_A_ID], [1430, 670]);
	const berlinGroupB = groupStarting(k[BERLIN_B_ID], [1430, 670]);
	const berlinA = groupValues(k[BERLIN_A_ID], berlinGroupA);
	const berlinB = groupValues(k[BERLIN_B_ID], berlinGroupB);
	const berlinRepeats = [0, 1, 2, 3, 4, 5].filter(
		(d) =>
			groupValues(k[BERLIN_A_ID], berlinGroupA + d).join() === berlinA.join(),
	).length;
	const triad = compareRuns(
		groupValues(k[TRIAD_A_ID], 5),
		groupValues(k[TRIAD_B_ID], 1),
	);
	const scaledA = named(k[SCALED_A_ID], ["p153", "p154", "p155", "p156"]);
	const scaledB = named(k[SCALED_B_ID], ["p52", "p53", "p54", "p55"]);

	const series = (id: string) =>
		k[id].cords
			.filter((c) => c.value === 1505 || c.value === 1458)
			.map((c) => c.name)
			.join(", ");

	return (
		<StoryPage
			kicker="Deep analysis · September 2026"
			title="Totals that travel"
			standfirst={
				<>
					This project ran eight kinds of search over all 684 khipus, each
					result recomputed independently: slip-tolerant alignment, arithmetic
					between khipus, graph link prediction, pattern-isomorph analysis,
					cycles, vocabulary, metadata and tree matching. A small number of
					links survived. Two re-find pairs Gary Urton had already published;
					one, not previously published as far as we know, suggests totals were
					carried from one khipu to another. These are our own, unreviewed
					results.
				</>
			}
			meta={
				<>
					<span>16 links on the network map, 4 already in print</span>
					<span>7 firm · 6 likely · 3 open</span>
					<span>scripts in scripts/deep/</span>
				</>
			}
		>
			<StrandWeave
				top={[LEDGER_TOTALS_ID, SECOND_TOTALS_ID]}
				bottom={[LEDGER_HEADS_ID, SECOND_HEADS_ID]}
				links={HERO_LINKS}
				names={NAMES}
			/>
			<EvidenceDeck
				items={[
					{
						value: `${ledgerHits.length}`,
						label: "group totals carried over",
						note: `${LEDGER_TOTALS_ID} → ${LEDGER_HEADS_ID}, in order`,
					},
					{
						value: "1 of 84,042",
						label: "ordered pairs this strong",
						note: "shuffled heads reach at most 2",
					},
					{
						value: `${relaidExact.length}`,
						label: "values in a retied copy",
						note: `${fromSubs} moved from subsidiary to pendant`,
					},
					{
						value: "3",
						label: "khipus holding one passage",
						note: "… 20 · 61 · 20",
					},
				]}
			/>

			<Step n={1} title="One khipu’s totals head another’s groups">
				<Prose>
					<p>
						{LEDGER_TOTALS_ID} (UR278) and {LEDGER_HEADS_ID} (UR266) were
						excavated at Inkawasi, and the museum gave them neighbouring numbers
						(13833 and 13829). The sum of each group of UR278 (the first reads{" "}
						{firstGroup.join(" + ")} ={" "}
						{firstGroup.reduce((a, b) => a + b, 0).toLocaleString()}) is the
						first knotted cord of a group on UR266. This holds for{" "}
						{ledgerHits.length} groups, in order. Each total is a four-digit
						number that occurs only one to three times in the corpus.{" "}
						<Conf level="firm">{ledgerHits.length} ordered exact totals</Conf>
					</p>
					<p>
						Of 84,042 ordered pairs of khipus, this one ranked first. Shifting
						the heads against the totals never gives more than 2 matches. It is
						the only pair of 445,000 to pass a Bonferroni correction (Poisson p
						= 1.3 × 10⁻¹⁰). Two independent methods found it: slip-tolerant
						alignment of totals against heads, and an ordered chain of equal
						sums.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							{LEDGER_TOTALS_ID}’s first {shown.length} groups, drawn at one
							pitch with {LEDGER_HEADS_ID} and {LEDGER_MIRROR_ID}. Each group of
							nine cords gathers into its total; where {LEDGER_HEADS_ID} has a
							group headed by that number, the strand lands on it. Two totals
							miss a head by one digit (3,095 against 3,096; 2,533 against
							2,633) and are not counted. Hover over a strand for its cords.
						</>
					}
				>
					<TotalsCascade
						label={`${LEDGER_TOTALS_ID} groups 1 to ${shown.length}: ${ledgerHits.filter((r) => r.group <= shown.length).length} group totals equal, in order, the heads of ${LEDGER_HEADS_ID}'s groups; ${LEDGER_MIRROR_ID} mirrors ${LEDGER_HEADS_ID} below.`}
						totals={{
							id: LEDGER_TOTALS_ID,
							label: "UR278 · group totals",
							from: 0,
							to: cascade.groups.at(-1)?.to ?? 0,
							groups: cascade.groups,
						}}
						heads={{
							id: LEDGER_HEADS_ID,
							label: "UR266 · the ledger",
							from: 0,
							to: cascade.headsTo,
							pendants: pendantList(k[LEDGER_HEADS_ID]),
							fixed: 47,
						}}
						below={{
							id: LEDGER_MIRROR_ID,
							label: "UR275 · its mirror",
							from: 0,
							to: cascade.mirrorTo,
							threads: cascade.mirror,
							note: "known mirror of UR266: expected, not extra evidence",
						}}
						sils={silhouettes}
						colors={colors}
					/>
					<details className="ttt-details">
						<summary>The same {shown.length} groups as a table</summary>
						<TotalsTable
							rows={shown}
							left={LEDGER_TOTALS_ID}
							right={LEDGER_HEADS_ID}
						/>
					</details>
				</Wide>
				<Prose>
					<p>
						The same totals head {mirror.filter((r) => r.head).length} groups of{" "}
						{LEDGER_MIRROR_ID} (UR275). That is expected rather than extra
						evidence, because UR275 is already known to mirror UR266. In the
						Inkawasi story each group of UR266 is gross, a deduction of 47, then
						a remainder. This result suggests where the gross figure came from:
						a third khipu whose groups add up to it. The data do not say which
						record was knotted first.
					</p>
				</Prose>
			</Step>

			<Step n={2} title="A second chain, and a third record">
				<Prose>
					<p>
						The same relation appears in the other half of the archive.{" "}
						{SECOND_TOTALS_ID} (UR270) totals{" "}
						{secondHits.map((r) => r.total.toLocaleString()).join(", ")} head
						groups of {SECOND_HEADS_ID} (UR274B) at{" "}
						{secondHits.map((r) => r.head?.name).join(", ")}, in order. The
						value 1402 occurs nowhere else.{" "}
						<Conf level="likely">{secondHits.length} ordered totals</Conf>
					</p>
					<p>
						{SERIES_THIRD_ID} (UR269) belongs with UR266 and UR275. All three
						hold the entry 1505 · 47 · 1458, a gross, the standard deduction and
						the net ({LEDGER_MIRROR_ID}: {series(LEDGER_MIRROR_ID)};{" "}
						{SERIES_THIRD_ID}: {series(SERIES_THIRD_ID)}; {LEDGER_HEADS_ID}:{" "}
						{series(LEDGER_HEADS_ID)}). The values 1458, 1505, 1653 and 2633
						occur only in these three khipus. UR269 does not keep their order,
						so it is a third record of the series, not a copy.{" "}
						<Conf level="likely">Third record</Conf>
					</p>
					<p>
						With these links, eight of the nine Inkawasi accession numbers from
						13828 to 13836 are joined to another khipu by values. The exception
						is 13834 (KH0516, 247 cords).
					</p>
				</Prose>
				<Wide
					caption={
						<>
							{SECOND_TOTALS_ID}’s first {cascade2.groups.length} groups over{" "}
							{SECOND_HEADS_ID}. {SECOND_LEADERS_ID} (UR273B) hangs below by the
							group leaders it shares with {SECOND_HEADS_ID}: six exact, three
							within ten (dotted). The totals are not drawn to{" "}
							{SECOND_LEADERS_ID} as well. Three of its matches are these same
							leaders, so they would count one piece of evidence twice.
						</>
					}
				>
					<TotalsCascade
						label={`${SECOND_TOTALS_ID}'s group totals ${secondHits.map((r) => r.total).join(", ")} head groups of ${SECOND_HEADS_ID} in order; ${SECOND_LEADERS_ID} shares ${SECOND_HEADS_ID}'s group leaders.`}
						totals={{
							id: SECOND_TOTALS_ID,
							label: "UR270 · group totals",
							from: 0,
							to: cascade2.groups.at(-1)?.to ?? 0,
							groups: cascade2.groups,
						}}
						heads={{
							id: SECOND_HEADS_ID,
							label: "UR274B",
							from: 0,
							to: cascade2.headsTo,
							pendants: pendantList(k[SECOND_HEADS_ID]),
						}}
						below={{
							id: SECOND_LEADERS_ID,
							label: "UR273B",
							from: 0,
							to: cascade2.belowTo,
							threads: cascade2.leaders,
							note: "same group leaders as UR274B (dotted: within ten)",
						}}
						sils={silhouettes}
						colors={colors}
					/>
					<TotalsTable
						rows={second.filter((r) => r.head)}
						left={SECOND_TOTALS_ID}
						right={SECOND_HEADS_ID}
					/>
					<p className="ttt-note">
						{cascade2.unmatched.length} more totals of 1,000 or over (
						{cascade2.unmatched.map((r) => r.total.toLocaleString()).join(", ")}
						) have no head on {SECOND_HEADS_ID}.
					</p>
				</Wide>
			</Step>

			<Step n={3} title="A copy that moved its subsidiaries">
				<Prose>
					<p>
						{RELAID_SOURCE_ID} and {RELAID_COPY_ID} (UR053B and UR053C) share
						one accession number. Read UR053B cord by cord, with each subsidiary
						straight after its pendant. The sequence is then UR053C’s pendants
						from p11: {relaidExact.length} of {relaidRows.length} values exact
						on one unbroken diagonal. Shuffled, the expectation is 5.6 ± 0.9.{" "}
						{fromSubs} of the matches are UR053B subsidiaries that UR053C ties
						as pendants.{" "}
						<Conf level="firm">
							{relaidExact.length}/{relaidRows.length} exact
						</Conf>
					</p>
					<p>
						The exact-run scan behind the network map could not see this pair.
						Its interleaved cords break every run of consecutive pendants.
						Slip-tolerant alignment and a colour-subsequence test each found it
						independently.
					</p>
					<p>
						It was not new. Gary Urton described UR053B and UR053C as a matching
						pair in 2005 and again in <em>Inka History in Knots</em> (2017, pp.
						146–150): from UR053C’s eleventh cord the values are “identical, or
						(generally) quite close”, and he noted a subsidiary on UR053B where
						UR053C has a pendant. Our alignment agrees with his reading cord by
						cord.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							UR053B above, UR053C below. Where two threads leave one UR053B
							pendant, the bold one starts on its subsidiary: the copy ties that
							value as a pendant of its own. Struck threads are pairs the
							alignment lays side by side whose values differ.
						</>
					}
				>
					<StrandWeave
						top={[RELAID_SOURCE_ID]}
						bottom={[RELAID_COPY_ID]}
						names={NAMES}
						emphasis={subsidiaryFirst}
					/>
				</Wide>
				<Wide>
					<ComparisonTable
						rows={relaidRows}
						left={`${RELAID_SOURCE_ID} (pendant + subsidiary)`}
						right={`${RELAID_COPY_ID} pendants from p11`}
						positionLabel="Step"
					/>
				</Wide>
			</Step>

			<Step n={4} title="One passage on three khipus">
				<Prose>
					<p>
						The exact scan paired KH0245 (read backwards) with KH0257 on a short
						run of small numbers. Alignment that steps into subsidiaries finds
						the same passage on a third khipu, KH0242 (UR006). There it runs
						along fifteen pendants and then into the nine subsidiaries of p292.
						The closing 20 · 61 · 20 occurs in these three khipus and nowhere
						else. A nested subsidiary “1” is kept in all three places.{" "}
						<Conf level="firm">Three witnesses</Conf>
					</p>
					<p>
						Urton published this triad in 2004. UR9 (KH0245) and UR21 (KH0257)
						repeat a four-month segment of the Laguna de los Cóndores calendar
						khipu UR6, and his table underlines this very run, 2, 1, 8, 4, 3, 1,
						1, 20, 61, 20. He reads the two smaller khipus as ayllu records
						summed into UR6 (<em>Inka History in Knots</em>, ch. 4). Our scan
						found it without that input. It adds that UR9 holds the passage in
						reverse and that the nested subsidiary is kept on all three.
					</p>
				</Prose>
				<Wide caption="Where the passage sits on each whole khipu. UR006 (KH0242, 571 pendants) above; UR009 (KH0245, drawn reversed) and UR021 (KH0257) below. On UR006 the last threads all leave one pendant, p292, because the passage runs on into its nine subsidiaries.">
					<StrandWeave
						top={[PASSAGE_IDS[0]]}
						bottom={[PASSAGE_IDS[1], PASSAGE_IDS[2]]}
						reversed={[PASSAGE_IDS[1]]}
						names={NAMES}
					/>
				</Wide>
				<Wide caption="Values in stored order, each subsidiary after its pendant. KH0245 is read from p143 back to p119, so all three end on 20 · 61 · 20.">
					<div className="ttt-scroll">
						{passage.map((p) => (
							<ValueRun
								key={p.id}
								values={p.values}
								label={
									<>
										<strong>{p.id}</strong> {p.label}
									</>
								}
							/>
						))}
					</div>
				</Wide>
			</Step>

			<Step n={5} title="Berlin families and a block times five">
				<Prose>
					<p>
						{BERLIN_A_ID} (AS149) ties the group {berlinA.join(" · ")}{" "}
						{berlinRepeats} times in a row. {BERLIN_B_ID} (AS179) opens with{" "}
						{berlinB.join(" · ")} on the same brown-and-green colour plan. Only
						five same-size groups match like this in the whole corpus: four were
						already curated, and this is the fifth.{" "}
						<Conf level="firm">Shared entry</Conf>
					</p>
					<p>
						{TRIAD_A_ID} (AS136) group 5 and {TRIAD_B_ID} (UR194) group 1 agree
						on {triad.filter((r) => r.verdict === "exact").length} of{" "}
						{triad.length} cords (p = 0.001). UR194 is already paired with
						KH0156, so the three form a family. The same dye appears as “W:BB”
						in the Aschers’ records and “W:KB” in Urton’s.{" "}
						<Conf level="likely">Triad</Conf>
					</p>
					<p>
						{SCALED_A_ID} p153–p156 reads {scaledA.join(", ")}. Five times these
						gives {SCALED_B_ID}’s last group, {scaledB.join(", ")}.{" "}
						<Conf level="likely">×5, one window</Conf>
					</p>
				</Prose>
				<Wide>
					<ComparisonTable
						rows={triad}
						left={`${TRIAD_A_ID} group 5`}
						right={`${TRIAD_B_ID} group 1`}
						positionLabel="Cord"
					/>
				</Wide>
			</Step>

			<Step n={6} title="The grammar these links rest on">
				<Prose>
					<p>
						The corpus-wide screens found no broad network of arithmetic between
						khipus. The one relation that repeats is a local pattern, which the
						Inkawasi chains show across khipus: a total leads its group, and a
						top cord closes the group before it.
					</p>
					<p>
						Counts of sums alone say little. Medrano and Khosla (2024) find
						internal sums on 66–74% of khipus, but shuffling each khipu’s own
						values gives about as many. So each pattern below is set against
						what chance produces.
					</p>
				</Prose>
				<Wide>
					<div className="ledger">
						<table className="ledger-table ttt-grammar">
							<thead>
								<tr>
									<th>Pattern</th>
									<th className="num">observed</th>
									<th className="num">by chance</th>
									<th>detail</th>
								</tr>
							</thead>
							<tbody>
								{GRAMMAR.map((g) => (
									<tr key={g.claim}>
										<td>
											{g.claim}
											<div>
												<Conf level={g.level} />
											</div>
										</td>
										<td className="num">{g.observed}</td>
										<td className="num">{g.expected}</td>
										<td className="wrap">
											{g.note} <code>{g.script}</code>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Wide>
				<Wide>
					<Layers
						layers={[
							{
								title: "Observed",
								body: "Group totals of one Inkawasi khipu equal, in order, the leading cords of another’s groups; a group’s total usually sits on its first cord.",
								level: "firm",
							},
							{
								title: "Derived",
								body: "Two independent chains (UR278 → UR266, UR270 → UR274B) plus the known mirrors join two blocks of accessions into tiers of summary and detail.",
								level: "firm",
							},
							{
								title: "Context",
								body: "Inkawasi was an Inca storehouse; the khipus lay together in one excavated archive.",
								level: "firm",
							},
							{
								title: "Interpretation",
								body: "Totals may have been passed up a chain of records: detail khipus summed into the gross figures that another khipu then reduced by a fixed deduction.",
								level: "likely",
							},
						]}
					/>
				</Wide>
			</Step>

			<Step n={7} title="What was looked for and not found">
				<Prose>
					<ul className="ttt-list">
						{EMPTY.map((e) => (
							<li key={e}>{e}</li>
						))}
					</ul>
					<p>
						Links that fell on independent recomputation include a “calendar
						twin” (KH0068–KH0242), a third record of KH0132/KH0456, and
						constant-difference pairs among the Gothenburg format twins. Pairs
						that share a layout but no values (KH0152/KH0156, KH0358/KH0359,
						KH0535/KH0544) are not drawn as links.
					</p>
					<h3 className="ttt-h3">Confounds for future screens</h3>
					<ul className="ttt-list">
						{CONFOUNDS.map((c) => (
							<li key={c}>{c}</li>
						))}
					</ul>
					<p>
						Every link found here is drawn on{" "}
						<Link to="/network">the network map</Link>, with the source “Deep
						analysis, September 2026”.
					</p>
				</Prose>
			</Step>

			<Sources
				items={[
					{
						who: "This site",
						what: "Slip-tolerant alignment and totals-to-heads chains",
						where: "scripts/deep/align_*.py, scripts/deep/arith_*.py",
					},
					{
						who: "This site",
						what: "Graph layers and link prediction",
						where: "scripts/deep/graph_*.py",
					},
					{
						who: "This site",
						what: "Isomorph, periodicity and vocabulary screens",
						where: "scripts/deep/iso_*.py, period_*.py, vocab_*.py",
					},
					{
						who: "This site",
						what: "Metadata, recorder confounds and tree matching",
						where: "scripts/deep/meta_*.py, tree_*.py",
					},
					{
						who: "Urton 2004",
						what: "“Concordancias y afinidades en archivos de registros de khipus procedentes de Chachapoyas e Ica”, Boletín de Arqueología PUCP 8: 289–303 — UR6, UR9 and UR21",
						where: "pp. 298–302, table 1 and fig. 9",
						href: "https://doi.org/10.18800/boletindearqueologiapucp.200401.015",
					},
					{
						who: "Urton 2017",
						what: "Inka History in Knots — UR6/UR9/UR21 (ch. 4) and the matching pair UR53B/UR53C (ch. 8)",
						where: "University of Texas Press; pp. 78–82, 146–150",
					},
					{
						who: "Medrano & Khosla 2024",
						what: "“How Can Data Science Contribute to Understanding the Khipu Code?”, Latin American Antiquity — sum relations, top cords and handedness across the corpus",
						where: "data and code: Zenodo 10.5281/zenodo.10472429",
						href: "https://doi.org/10.1017/laq.2024.5",
					},
					{
						who: "Khipu Field Guide",
						what: "Databook",
						where: "one workbook per khipu",
						href: "https://www.khipufieldguide.com/",
					},
				]}
			/>
			<p className="story-next">
				<Link to="/stories/inkawasi">Read the Inkawasi story →</Link>{" "}
				<Link to="/stories">All stories →</Link>
			</p>
		</StoryPage>
	);
}
