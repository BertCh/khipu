import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import BarList from "#/components/charts/BarList";
import Columns from "#/components/charts/Columns";
import KhipuDiagram from "#/components/khipu/KhipuDiagram";
import KhipuSilhouette from "#/components/khipu/KhipuSilhouette";
import { EvidenceDeck } from "#/components/story/CrossLink";
import {
	Conf,
	type Layer,
	Layers,
	Legend,
	Prose,
	Sources,
	Step,
	StoryPage,
	Wide,
} from "#/components/story/Story";
import { hexFor } from "#/lib/khipu/colors";
import {
	getColors,
	getKhipus,
	getSilhouettes,
	readJson,
} from "#/lib/khipu/data";
import type { Cord, Khipu } from "#/lib/khipu/types";
import { pendantGroups, sliceKhipu } from "#/lib/stories/derive";
import {
	BLANK_COLUMN_ID,
	blankColumnCases,
	columnMode,
	endsTail,
	GRAMMAR_JSON,
	type GroupGrammar,
	knottedCount,
	LADDER_ID,
	ladderRungs,
	lastDigitHistogram,
	matrixRows,
	multiplesOf,
	PACHACAMAC_TABLE_ID,
	PER_HEAD_ID,
	positionCounts,
	roundShare,
	rungsReading,
	SCHEDULE_ID,
	SIXTIES_ID,
	slotOfMax,
	slotProfile,
	strongCases,
	TABLE_ID,
	value,
	valueCounts,
} from "#/lib/stories/groupgrammar";
import "#/styles/stories/where-the-big-number-sits.css";

const IDS = [
	TABLE_ID,
	PACHACAMAC_TABLE_ID,
	BLANK_COLUMN_ID,
	LADDER_ID,
	SIXTIES_ID,
	SCHEDULE_ID,
	PER_HEAD_ID,
];

export const Route = createFileRoute("/stories/where-the-big-number-sits")({
	loader: async () => {
		const [khipus, colors, silhouettes, grammar] = await Promise.all([
			getKhipus(IDS),
			getColors(),
			getSilhouettes(),
			readJson<GroupGrammar>(GRAMMAR_JSON),
		]);
		const sil = (id: string) => {
			const s = silhouettes[id];
			return s ? s.l.map((l, i) => ({ length: l, color: s.c[i] })) : [];
		};
		return {
			khipus,
			colors,
			grammar,
			sils: Object.fromEntries(IDS.map((id) => [id, sil(id)])),
		};
	},
	head: () => ({ meta: [{ title: "Where the big number sits — Khipu" }] }),
	component: WhereTheBigNumberSits,
});

const SLICE = { slot: 9, gap: 14, subOffset: 4, pxPerCm: 2.2, cordW: 1.8 };
const LADDER = { slot: 14, gap: 18, subOffset: 6, pxPerCm: 3.2, cordW: 2 };
const WHOLE = { slot: 7, gap: 12, subOffset: 3, pxPerCm: 2.2, cordW: 1.6 };

const SEVEN = [1, 2, 3, 4, 5, 6, 7];
const TEN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const ACCENT = "var(--accent)";
const SECOND = "var(--moiety-r)";

const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;
const list = (xs: (string | number)[]) => xs.join(", ");

/** cord name → 1-based slot in its group, for the diagram callbacks */
function slotIndex(khipu: Khipu): Map<string, { slot: number; n: number }> {
	const m = new Map<string, { slot: number; n: number }>();
	for (const g of pendantGroups(khipu))
		g.forEach((c, i) => {
			m.set(c.name, { slot: i + 1, n: g.length });
		});
	return m;
}

/** drop every subsidiary so a slice shows the pendants alone */
function pendantsOnly(khipu: Khipu): Khipu {
	return { ...khipu, cords: khipu.cords.filter((c) => c.level === 1) };
}

/** cord names that hold the maximum of their group (groups of size n only) */
function maxCordNames(khipu: Khipu, n: number): Set<string> {
	const out = new Set<string>();
	for (const g of pendantGroups(khipu)) {
		if (g.length !== n || g.filter((c) => value(c) > 0).length < 3) continue;
		out.add(g[slotOfMax(g) - 1].name);
	}
	return out;
}

function WhereTheBigNumberSits() {
	const { khipus, colors, grammar, sils } = Route.useLoaderData();
	const table = khipus[TABLE_ID];
	const pacha = khipus[PACHACAMAC_TABLE_ID];
	const blank = khipus[BLANK_COLUMN_ID];
	const ladder = khipus[LADDER_ID];
	const sixties = khipus[SIXTIES_ID];
	const schedule = khipus[SCHEDULE_ID];
	const perHead = khipus[PER_HEAD_ID];

	// step 1: the two forms
	const tableProfile = useMemo(() => slotProfile(table, 9), [table]);
	const pachaProfile = useMemo(() => slotProfile(pacha, 10), [pacha]);
	const tableSlice = useMemo(
		() => sliceKhipu(table, (c) => (c.group ?? 99) < 8),
		[table],
	);
	const pachaSlice = useMemo(
		() => pendantsOnly(sliceKhipu(pacha, (c) => (c.group ?? 99) <= 6)),
		[pacha],
	);
	const tableMax = useMemo(() => maxCordNames(table, 9), [table]);
	const pachaMax = useMemo(() => maxCordNames(pacha, 10), [pacha]);
	const pachaSlots = useMemo(() => slotIndex(pacha), [pacha]);

	// step 2: the corpus
	const strong = useMemo(() => strongCases(grammar), [grammar]);
	const counts = useMemo(() => positionCounts(strong), [strong]);
	const tail = endsTail(counts.first, counts.last);
	const topCases = useMemo(
		() => [...strong].sort((a, b) => b.z - a.z).slice(0, 12),
		[strong],
	);
	const lastCases = useMemo(
		() => strong.filter((c) => c.position === "last"),
		[strong],
	);

	// step 3: the blank column
	const blankCases = useMemo(() => blankColumnCases(grammar), [grammar]);
	const blankRows = useMemo(() => matrixRows(blank, 7), [blank]);
	const blankProfile = useMemo(() => slotProfile(blank, 7), [blank]);
	const blankSevens = useMemo(
		() => pendantGroups(blank).filter((g) => g.length === 7).length,
		[blank],
	);
	const blankBig = useMemo(
		() => blankRows.filter((r) => Math.max(...r.values) >= 100).length,
		[blankRows],
	);

	// step 4: round numbers
	const digits = grammar.lastDigits;
	const digitCols = digits.counts.map((c, d) => ({
		key: String(d),
		label: String(d),
		value: c,
		marker: digits.total / 10,
	}));
	const roundBins = useMemo(() => {
		const bins = Array<number>(10).fill(0);
		for (const r of grammar.roundShare)
			bins[Math.min(9, Math.floor(r.round * 10))] += 1;
		return bins.map((n, i) => ({
			key: String(i),
			label: `${i * 10}–${i * 10 + 10}%`,
			value: n,
		}));
	}, [grammar]);
	const roundSorted = useMemo(
		() => [...grammar.roundShare].sort((a, b) => a.round - b.round),
		[grammar],
	);
	const medianRound = roundSorted[Math.floor(roundSorted.length / 2)]?.round;
	const veryRound = useMemo(
		() => grammar.roundShare.filter((r) => r.round >= 0.8),
		[grammar],
	);
	const veryRoundBin = String(Math.floor((medianRound ?? 0) * 10));

	// step 5: tariffs
	const sixtyCounts = useMemo(() => valueCounts(sixties), [sixties]);
	const sixtyKnotted = knottedCount(sixties);
	const sixtyGroups = useMemo(() => pendantGroups(sixties), [sixties]);
	const rungs = useMemo(() => ladderRungs(ladder), [ladder]);
	const rungs2448 = useMemo(() => rungsReading(rungs, 24, 48), [rungs]);
	const ladderCounts = useMemo(() => valueCounts(ladder), [ladder]);
	const ladderKnotted = knottedCount(ladder);
	const ladderFives = multiplesOf(ladder, 5);
	const ladderTens = multiplesOf(ladder, 10);
	const ladderRound = roundShare(ladder);
	const scheduleRows = useMemo(() => matrixRows(schedule, 10), [schedule]);
	const scheduleModes = useMemo(
		() => Array.from({ length: 10 }, (_, i) => columnMode(scheduleRows, i)),
		[scheduleRows],
	);
	const scheduleFours = useMemo(() => matrixRows(schedule, 4, 2), [schedule]);
	const scheduleSix = useMemo(() => matrixRows(schedule, 6, 3), [schedule]);
	const scheduleSlice = useMemo(
		() =>
			pendantsOnly(
				sliceKhipu(schedule, (c) =>
					scheduleRows.some((r) => r.index === c.group),
				),
			),
		[schedule, scheduleRows],
	);
	const perHeadCounts = useMemo(() => valueCounts(perHead), [perHead]);
	const perHeadHist = useMemo(() => lastDigitHistogram(perHead), [perHead]);
	const constantsHere = grammar.constants.filter((c) =>
		[SIXTIES_ID, LADDER_ID, PER_HEAD_ID].includes(c.id),
	);

	const paintTable = (c: Cord) => (tableMax.has(c.name) ? ACCENT : null);
	const paintPacha = (c: Cord) => {
		if (pachaMax.has(c.name)) return ACCENT;
		const s = pachaSlots.get(c.name);
		return s && s.n === 10 && s.slot === 7 ? SECOND : null;
	};
	const paintSixties = (c: Cord) =>
		value(c) === 60 ? ACCENT : value(c) === 50 ? SECOND : null;
	const paintLadder = (c: Cord) =>
		value(c) === 24 ? ACCENT : value(c) === 48 ? SECOND : null;
	const paintSchedule = (c: Cord) => {
		if (c.level > 1 || c.group == null) return null;
		const row = scheduleRows.find((r) => r.index === c.group);
		if (!row) return null;
		const i = row.cords.findIndex((x) => x.name === c.name);
		return i >= 0 && value(c) === scheduleModes[i].value ? ACCENT : SECOND;
	};

	const layers: Layer[] = [
		{
			title: "Observed",
			level: "firm",
			body: (
				<>
					In {strong.length} of {grammar.cases.length} same-size group templates
					one slot carries the group's largest value far more often than a
					uniform 1/n would give: the first slot in {counts.first}, a middle
					slot in {counts.middle}, the last slot in {counts.last}.{" "}
					{blankCases.length} templates leave one slot knotless in at least{" "}
					{pct(grammar.screen.blankShare)} of their groups. Of{" "}
					{digits.total.toLocaleString()} values of ten or more,{" "}
					{pct(digits.counts[0] / digits.total)} end in zero.
				</>
			),
		},
		{
			title: "Derived",
			level: "likely",
			body: (
				<>
					Under any null that treats a group's two ends alike, first and last
					are equally likely to hold the maximum; {counts.first} against{" "}
					{counts.last} has a tail probability of{" "}
					{tail.toExponential(1).replace("e-", " × 10⁻")}. The big number
					opening a group is a convention, not an accident of which khipus
					survive. The always-empty slot is a field on the form that this record
					did not fill.
				</>
			),
		},
		{
			title: "Context",
			level: "likely",
			body: (
				<>
					Documented khipus with a known referent — the Inkawasi storehouse
					ledgers, the Santa valley census — open each unit with its total or
					head figure. The round-number share fits assessments and allotments
					(so much per household, per storehouse) better than tallies of things
					counted one by one.
				</>
			),
		},
		{
			title: "Interpretation",
			level: "open",
			body: (
				<>
					Calling KH0457's sixties and KH0454's twenty-fours a tariff — a fixed
					rate applied to a list of units — is the simplest reading of a value
					repeated on most of a khipu's cords, but no document names the units
					or the goods. The five templates that put the maximum last, KH0147
					among them, may be a different form or a different reading direction.
				</>
			),
		},
	];

	return (
		<StoryPage
			kicker="The whole corpus"
			title="Where the big number sits"
			standfirst={
				<>
					Read one khipu and a group of cords is a list of numbers. Read all{" "}
					{grammar.nKhipus} and the group turns out to have a grammar: the
					largest value opens it or sits inside it, almost never closes it; some
					forms keep one field permanently empty; a third of all values of ten
					or more end in zero; and a few khipus repeat a single rate down their
					whole length. None of this says what a group counted. It says how a
					recorder laid a count out.
				</>
			}
			meta={
				<>
					<span>
						Corpus screen: {grammar.cases.length} khipu × group-size templates
						with at least {grammar.screen.minGroups} groups of one size (
						{grammar.screen.minGroup}+ cords, {grammar.screen.minKnotted}+
						knotted)
					</span>
					<span>
						Examples drawn from {list(IDS)}; every figure about them is
						recomputed from their cords
					</span>
				</>
			}
		>
			<EvidenceDeck
				items={[
					{
						value: `${counts.first} · ${counts.middle} · ${counts.last}`,
						label: "templates whose maximum is first · middle · last",
						note: `of ${strong.length} at z > ${grammar.screen.zThreshold}`,
					},
					{
						value: blankCases.length,
						label: "templates with an always-empty slot",
						note: `knotless in ≥ ${pct(grammar.screen.blankShare)} of groups`,
					},
					{
						value: pct(digits.counts[0] / digits.total),
						label: "of values ≥ 10 end in 0",
						note: "10% if digits were even",
					},
					{
						value: grammar.constants.length,
						label: "khipus with one value on ≥ 30% of cords",
						note: "the tariff khipus",
					},
				]}
			/>

			<Step n={1} title="A group is a form">
				<Prose>
					<p>
						Two khipus show the two ways a group can be filled in. {table.id} (
						{table.aliases[0]}, formerly of the Maiman collection) is a table of{" "}
						{tableProfile.groups} nine-cord groups on a {table.primary.length}{" "}
						cm primary cord. In {tableProfile.maxCount} of them the largest
						value is the first cord; the second cord is often blank, and the
						rest are small.{" "}
						<Conf level="firm">
							{tableProfile.maxCount}/{tableProfile.groups} first
						</Conf>
					</p>
					<p>
						{pacha.id} ({pacha.aliases[0]}, Berlin {pacha.museum.number},
						Pachacamac) does the opposite. Its {pachaProfile.groups} ten-cord
						groups put the largest value <em>last</em> in{" "}
						{pachaProfile.maxCount}, and leave the seventh cord knotless in{" "}
						{pachaProfile.blankCount}. Same idea — one figure standing out from
						the rest — placed at the other end of the group, with a field nobody
						filled.{" "}
						<Conf level="firm">
							{pachaProfile.maxCount}/{pachaProfile.groups} last
						</Conf>
					</p>
				</Prose>
				<Wide
					caption={
						<>
							{table.id}, the first eight of its {tableProfile.groups} nine-cord
							groups. The cord carrying each group's maximum is blue: it is the
							first cord in {tableProfile.maxCount} of {tableProfile.groups}{" "}
							groups, z = {tableProfile.z.toFixed(1)} against a uniform ninth.
						</>
					}
				>
					<KhipuDiagram
						khipu={tableSlice}
						colors={colors}
						layout={SLICE}
						paint={paintTable}
						showValues
						showGroups
						tooltip
						fit
					/>
				</Wide>
				<Wide
					caption={
						<>
							{pacha.id}, its first four ten-cord groups and the single cords
							between them. Blue: the group maximum, the tenth cord in{" "}
							{pachaProfile.maxCount} of {pachaProfile.groups}. Orange: the
							seventh cord, knotless in {pachaProfile.blankCount} of{" "}
							{pachaProfile.groups}. Subsidiaries are hidden here.
						</>
					}
				>
					<KhipuDiagram
						khipu={pachaSlice}
						colors={colors}
						layout={SLICE}
						paint={paintPacha}
						showValues
						showGroups
						tooltip
						fit
					/>
					<Legend
						items={[
							{ color: ACCENT, label: "largest value in the group" },
							{ color: SECOND, label: "the seventh cord, always blank" },
						]}
					/>
				</Wide>
			</Step>

			<Step n={2} title="First or inside, almost never last">
				<Prose>
					<p>
						The screen takes every khipu that has at least{" "}
						{grammar.screen.minGroups} groups of one size (four cords or more,
						three or more of them knotted) and asks which slot most often holds
						the group's largest value. That gives {grammar.cases.length}{" "}
						templates. In {strong.length} of them one slot wins so often that
						the count is more than {grammar.screen.zThreshold} standard
						deviations above the uniform expectation of one group in n.
					</p>
					<p>
						Among those {strong.length}: the first slot in {counts.first}, a
						middle slot in {counts.middle}, the last slot in {counts.last}. The
						middle bucket is wide — for a ten-cord group it is eight of the ten
						slots — so the fair comparison is between the ends, which any null
						treats alike. {counts.first} first against {counts.last} last has a
						tail probability of about{" "}
						{tail.toExponential(1).replace("e-", " × 10⁻")}.{" "}
						<Conf level="likely">Opening figure as a convention</Conf>
					</p>
					<p>
						The five templates that put the maximum last are{" "}
						{list(lastCases.map((c) => `${c.id} (${c.n}-cord)`))}. {pacha.id} is
						one; the others are worth a look for whether they were recorded from
						the far end.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Templates by where their winning slot sits, {strong.length} cases
							at z &gt; {grammar.screen.zThreshold}. Under a uniform null the
							first and last slots each expect one template in n; the middle
							expects the other n − 2.
						</>
					}
				>
					<div className="gg-bars">
						<BarList
							rows={[
								{ key: "first", label: "first slot", value: counts.first },
								{ key: "middle", label: "a middle slot", value: counts.middle },
								{ key: "last", label: "last slot", value: counts.last },
							]}
							share
						/>
					</div>
				</Wide>
				<Wide
					caption={
						<>
							The twelve strongest templates. "Slot" is the 1-based position
							that most often carries the group maximum; "blank" the slot most
							often knotless, where one exists.
						</>
					}
				>
					<div className="ledger gg-matrix">
						<table className="ledger-table">
							<thead>
								<tr>
									<th>Khipu</th>
									<th>Provenance</th>
									<th className="num">Cords per group</th>
									<th className="num">Groups</th>
									<th className="num">Max slot</th>
									<th className="num">Hits</th>
									<th className="num">z</th>
									<th className="num">Blank slot</th>
								</tr>
							</thead>
							<tbody>
								{topCases.map((c) => (
									<tr key={`${c.id}-${c.n}`}>
										<td>
											<Link to="/khipus/$id" params={{ id: c.id }}>
												{c.id}
											</Link>{" "}
											<span className="muted">{c.alias}</span>
										</td>
										<td>{c.provenance ?? "—"}</td>
										<td className="num">{c.n}</td>
										<td className="num">{c.groups}</td>
										<td className="num">
											{c.maxSlot} <span className="muted">({c.position})</span>
										</td>
										<td className="num">{c.maxCount}</td>
										<td className="num">{c.z.toFixed(1)}</td>
										<td className="num">
											{c.blankSlot !== null &&
											c.blankCount >= grammar.screen.blankShare * c.groups
												? `${c.blankSlot} (${c.blankCount}/${c.groups})`
												: "—"}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Wide>
			</Step>

			<Step n={3} title="The field nobody filled">
				<Prose>
					<p>
						The same screen records, for each template, the slot most often left
						without knots. In {blankCases.length} templates one slot is knotless
						in at least {pct(grammar.screen.blankShare)} of the groups. The
						clearest is {blank.id} ({blank.aliases[0]}), a very long khipu from
						the Lluta valley: {blank.stats.nPendants.toLocaleString()} pendants
						on a {blank.primary.length} cm primary cord, most of them knotless,
						in {blank.groups.length} groups by spacing. Of its {blankSevens}{" "}
						seven-cord groups, {blankProfile.groups} carry three or more values,
						and in {blankProfile.blankCount} of those the seventh cord is blank.{" "}
						<Conf level="firm">
							{blankProfile.blankCount}/{blankProfile.groups}
						</Conf>
					</p>
					<p>
						This is a form with an empty column. The recorder tied seven cords
						because the form had seven fields, then knotted six. It is the same
						thing the two Huacho pieces do in{" "}
						<Link to="/stories/tied-twice">An account tied twice</Link>: six
						cords per unit where the source has five, the extra one always
						knotless, at the third position on one piece and the fourth on the
						other. Which field stays empty differs from khipu to khipu — the
						seventh of seven here, the fourth of eighteen on KH0061, the
						eleventh of eleven on KH0183 — but the habit of tying the cord
						anyway is shared.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							{blank.id}: the {blankProfile.groups} seven-cord groups with three
							or more knotted cords, one row each, in order along the primary
							cord. Slot 7 is knotless in {blankProfile.blankCount} rows.{" "}
							{blankBig} rows carry values in the hundreds.
						</>
					}
				>
					<div className="ledger gg-matrix">
						<table className="ledger-table">
							<thead>
								<tr>
									<th>Group</th>
									{SEVEN.map((p) => (
										<th key={p} className={`num ${p === 7 ? "blank-col" : ""}`}>
											{p}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{blankRows.map((r) => (
									<tr key={r.index}>
										<td className="group">G{r.index + 1}</td>
										{r.values.map((v, i) => (
											<td
												// biome-ignore lint/suspicious/noArrayIndexKey: fixed 7 columns
												key={i}
												className={`num ${i === 6 ? "blank-col" : ""} ${v === 0 ? "zero" : ""}`}
											>
												{v === 0 ? "·" : v}
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Wide>
				<Wide
					caption={
						<>
							All {blankCases.length} templates with an always-empty slot.
							KH0469 and KH0470 are the Huacho pieces; KH0097 is the Paris khipu
							of the Paris–Lima pair; KH0699 is Twin Falls.
						</>
					}
				>
					<div className="ledger gg-matrix">
						<table className="ledger-table">
							<thead>
								<tr>
									<th>Khipu</th>
									<th>Provenance</th>
									<th className="num">Cords per group</th>
									<th className="num">Groups</th>
									<th className="num">Blank slot</th>
									<th className="num">Blank in</th>
								</tr>
							</thead>
							<tbody>
								{blankCases.map((c) => (
									<tr key={`${c.id}-${c.n}`}>
										<td>
											<Link to="/khipus/$id" params={{ id: c.id }}>
												{c.id}
											</Link>{" "}
											<span className="muted">{c.alias}</span>
										</td>
										<td>{c.provenance ?? "—"}</td>
										<td className="num">{c.n}</td>
										<td className="num">{c.groups}</td>
										<td className="num">{c.blankSlot}</td>
										<td className="num">
											{c.blankCount}/{c.groups}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Wide>
			</Step>

			<Step n={4} title="Round numbers">
				<Prose>
					<p>
						Take every value of ten or more on every cord in the corpus —{" "}
						{digits.total.toLocaleString()} of them — and look at the last
						digit. If the numbers were counts of things, the last digit would be
						spread roughly evenly, a tenth each. Instead{" "}
						{pct(digits.counts[0] / digits.total)} end in zero.{" "}
						<Conf level="firm">Corpus count</Conf>
					</p>
					<p>
						The bias is not one khipu's. Of the {grammar.roundShare.length}{" "}
						khipus with at least {grammar.screen.roundMinValues} such values,
						the median has {pct(medianRound ?? 0)} of them ending in zero, and{" "}
						{veryRound.length} are at least 80% round:{" "}
						{list(veryRound.map((r) => r.id))}. Zero is the only digit that
						stands out; the mild slope from 1 down to 9 is what Benford's law
						predicts within each decade (there are more 11s than 19s because
						there are more small numbers), and is not a finding.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Last digit of every value ≥ 10 in the corpus. The grey marker is
							the count each digit would have if all ten were equally common (
							{Math.round(digits.total / 10).toLocaleString()}).
						</>
					}
				>
					<Columns
						data={digitCols}
						series="values"
						markerSeries="even split"
						unit="values"
						highlight="0"
						labelEvery={1}
						height={220}
					/>
				</Wide>
				<Wide
					caption={
						<>
							Khipus by the share of their values ≥ 10 that end in zero (
							{grammar.roundShare.length} khipus with{" "}
							{grammar.screen.roundMinValues}+ such values). The median bin is
							emphasised.
						</>
					}
				>
					<Columns
						data={roundBins}
						series="khipus"
						unit="khipus"
						highlight={veryRoundBin}
						labelEvery={1}
						height={200}
					/>
				</Wide>
			</Step>

			<Step n={5} title="One rate, many cords">
				<Prose>
					<p>
						At the round end of that distribution sit khipus that do not vary at
						all. The screen lists {grammar.constants.length} on which a single
						value of eleven or more occupies at least{" "}
						{pct(grammar.screen.constantShare)} of the knotted cords. Three of
						them are drawn here. <Conf level="firm">Counts</Conf>{" "}
						<Conf level="open">Tariff</Conf>
					</p>
					<p>
						{sixties.id} ({sixties.aliases[0]}, Berlin {sixties.museum.number},
						Ica) opens with two cords,{" "}
						{sixtyGroups[0]?.map(value).join(" and ")}, then a run of{" "}
						{sixtyGroups[1]?.length} cords in every colour the recorder had, of
						which {sixtyCounts[0]?.count} read {sixtyCounts[0]?.value} and{" "}
						{sixtyCounts.find((v) => v.value === 100)?.count} read 100, then{" "}
						{sixtyGroups[2]?.filter((c) => value(c) === 50).length} cords of 50
						and four blank ones. {sixtyCounts[0]?.count} of its {sixtyKnotted}{" "}
						knotted cords say {sixtyCounts[0]?.value}. The colours change from
						cord to cord and the number does not: whatever each cord stands for,
						it was assessed at the same figure.
					</p>
					<p>
						{ladder.id} ({ladder.aliases[0]}, Berlin {ladder.museum.number},
						Pachacamac) has {ladder.stats.nPendants} white pendants, all
						knotless, in two groups of sixteen. Each carries a ladder of
						subsidiaries; on {rungs2448.length} of the {rungs.length} pendants
						one subsidiary reads 24 and a subsidiary of that subsidiary reads 48
						— a two-to-one pair repeated {rungs2448.length} times. The khipu
						holds {ladderKnotted} knotted cords; {ladderFives} of them are
						multiples of five (two cords reading 5) and{" "}
						{ladderTens === 0 ? "none" : ladderTens} is a multiple of ten (
						{pct(ladderRound)} end in zero). A rate of 24 with a double at 48,
						on a record that never rounds to ten, is a different kind of number
						from the sixties: a duodecimal one.
					</p>
					<p>
						{schedule.id} ({schedule.aliases[0]}, Berlin{" "}
						{schedule.museum.number}, Ica) repeats a schedule. Its{" "}
						{scheduleRows.length} ten-cord groups read{" "}
						{list(scheduleModes.map((m) => m.value))} with only a few cords
						departing from it, in three colourings; then come{" "}
						{scheduleFours.length} four-cord groups of fifties and a six-cord
						group of larger figures. And {perHead.id} ({perHead.aliases[0]}) is
						twenty white cords in ten pairs of which {perHeadCounts[0]?.count}{" "}
						read {perHeadCounts[0]?.value}, the rest{" "}
						{list(perHeadCounts.slice(1).map((v) => v.value))}: a per-head
						figure with a little variation, or a count that happened to land
						near 22 twenty times.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							{sixties.id}, all {sixties.stats.nPendants} pendants. Blue: cords
							reading {sixtyCounts[0]?.value} ({sixtyCounts[0]?.count}). Orange:
							cords reading 50 ({sixtyCounts.find((v) => v.value === 50)?.count}
							). Colours are the recorder's; the two opening cords read{" "}
							{sixtyGroups[0]?.map(value).join(" and ")}.
						</>
					}
				>
					<KhipuDiagram
						khipu={sixties}
						colors={colors}
						layout={WHOLE}
						paint={paintSixties}
						showValues
						showGroups
						tooltip
						fit
					/>
					<Legend
						items={[
							{ color: ACCENT, label: `reads ${sixtyCounts[0]?.value}` },
							{ color: SECOND, label: "reads 50" },
						]}
					/>
				</Wide>
				<Wide
					caption={
						<>
							{ladder.id}, all {ladder.stats.nCords} cords. Every pendant is
							white and knotless; its subsidiaries hang to the right. Blue: the
							subsidiary reading 24; orange: the sub-subsidiary reading 48.{" "}
							{rungs2448.length} of {rungs.length} pendants carry the pair. The
							other values on the khipu are{" "}
							{list(
								ladderCounts
									.filter((v) => v.value !== 24 && v.value !== 48)
									.map((v) => `${v.value} (×${v.count})`),
							)}
							.
						</>
					}
				>
					<KhipuDiagram
						khipu={ladder}
						colors={colors}
						layout={LADDER}
						paint={paintLadder}
						showValues
						showGroups
						tooltip
						fit
					/>
					<Legend
						items={[
							{ color: ACCENT, label: "subsidiary reads 24" },
							{ color: SECOND, label: "sub-subsidiary reads 48" },
						]}
					/>
				</Wide>
				<Wide
					caption={
						<>
							{schedule.id}: its {scheduleRows.length} ten-cord groups as rows.
							The bottom row is the value each column takes most often; cells
							that depart from it are orange. Then the {scheduleFours.length}{" "}
							four-cord groups and the six-cord group that follow.
						</>
					}
				>
					<div className="ledger gg-matrix">
						<table className="ledger-table">
							<thead>
								<tr>
									<th>Group</th>
									<th>Colour</th>
									{TEN.map((p) => (
										<th key={p} className="num">
											{p}
										</th>
									))}
									<th className="num">Σ</th>
								</tr>
							</thead>
							<tbody>
								{scheduleRows.map((r) => (
									<tr key={r.index}>
										<td className="group">G{r.index + 1}</td>
										<td>
											<i
												className="swatch"
												style={{
													background: hexFor(
														r.cords[0]?.colorParsed?.[0]?.codes[0],
														colors,
													),
												}}
											/>
											{r.cords[0]?.color}
										</td>
										{r.values.map((v, i) => (
											<td
												// biome-ignore lint/suspicious/noArrayIndexKey: fixed 10 columns
												key={i}
												className={`num ${v === scheduleModes[i].value ? "" : "miss"}`}
											>
												{v === 0 ? "·" : v}
											</td>
										))}
										<td className="num">
											{r.values.reduce((a, b) => a + b, 0)}
										</td>
									</tr>
								))}
								<tr className="mode">
									<td className="group">schedule</td>
									<td />
									{scheduleModes.map((m, i) => (
										<td
											// biome-ignore lint/suspicious/noArrayIndexKey: fixed 10 columns
											key={i}
											className="num"
										>
											{m.value}
											<span className="muted"> ×{m.count}</span>
										</td>
									))}
									<td className="num">
										{scheduleModes.reduce((a, m) => a + m.value, 0)}
									</td>
								</tr>
								{scheduleFours.map((r) => (
									<tr key={`f${r.index}`} className="after">
										<td className="group">G{r.index + 1}</td>
										<td>{r.cords[0]?.color}</td>
										{r.values.map((v, i) => (
											<td
												// biome-ignore lint/suspicious/noArrayIndexKey: fixed columns
												key={i}
												className="num"
											>
												{v === 0 ? "·" : v}
											</td>
										))}
										{Array.from({ length: 10 - r.values.length }, (_, i) => (
											// biome-ignore lint/suspicious/noArrayIndexKey: padding
											<td key={`pad${i}`} />
										))}
										<td className="num">
											{r.values.reduce((a, b) => a + b, 0)}
										</td>
									</tr>
								))}
								{scheduleSix.map((r) => (
									<tr key={`s${r.index}`} className="after">
										<td className="group">G{r.index + 1}</td>
										<td>{r.cords[0]?.color}</td>
										{r.values.map((v, i) => (
											<td
												// biome-ignore lint/suspicious/noArrayIndexKey: fixed columns
												key={i}
												className="num"
											>
												{v === 0 ? "·" : v}
											</td>
										))}
										{Array.from({ length: 10 - r.values.length }, (_, i) => (
											// biome-ignore lint/suspicious/noArrayIndexKey: padding
											<td key={`pad${i}`} />
										))}
										<td className="num">
											{r.values.reduce((a, b) => a + b, 0)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Wide>
				<Wide
					caption={
						<>
							{schedule.id}, the six ten-cord groups only (subsidiaries and the
							single cords between groups hidden). Blue: a cord reading its
							column's schedule value; orange: a departure.
						</>
					}
				>
					<KhipuDiagram
						khipu={scheduleSlice}
						colors={colors}
						layout={SLICE}
						paint={paintSchedule}
						showValues
						showGroups
						tooltip
						fit
					/>
				</Wide>
				<Wide
					caption={
						<>
							The {grammar.constants.length} khipus the screen lists, as the
							share of knotted cords carrying the dominant value:{" "}
							{list(
								grammar.constants.map(
									(c) => `${c.id} ${c.value} on ${c.count}/${c.knotted}`,
								),
							)}
							. Four are Inkawasi ledgers whose repeated value is the fixed
							deduction read in{" "}
							<Link to="/stories/inkawasi">
								Accounting in the king's storehouse
							</Link>
							.
						</>
					}
				>
					<div className="gg-bars">
						<BarList
							rows={grammar.constants.map((c) => ({
								key: c.id,
								label: c.id,
								sublabel: `${c.alias.split(",")[0]} · ${c.value}`,
								value: Math.round((100 * c.count) / c.knotted),
								color: constantsHere.some((x) => x.id === c.id)
									? ACCENT
									: "var(--series-context)",
							}))}
							format={(v) => `${v}%`}
							max={100}
						/>
					</div>
				</Wide>
			</Step>

			<Step n={6} title="What the grammar says">
				<Prose>
					<p>
						None of this reads a khipu. It describes the form a recorder filled
						in: a leading figure, some fields, sometimes a field left empty,
						values that are assessed rather than counted. Where a khipu's
						subject is known from elsewhere the form fits — the Inkawasi ledgers
						open each unit with the total from which the fixed amount is taken;
						the Twin Falls ledger puts its section totals before the groups they
						sum. The grammar is what lets a reader of an unprovenanced khipu
						guess which cord is the total before checking the arithmetic.
					</p>
					<p>
						The per-head figure on {perHead.id} ({perHeadHist.total} values,{" "}
						{pct(perHeadHist.counts[0] / perHeadHist.total)} round) and the
						duodecimal ladder on {ladder.id} pull in opposite directions: one
						looks like a count that varied a little, the other like a rate that
						never did. The word "tariff" is a hypothesis about both.
					</p>
				</Prose>
				<Layers heading="Four layers of the reading" layers={layers} />
				<Wide
					caption={
						<>
							The three tariff khipus as silhouettes: {sixties.id} (top),{" "}
							{ladder.id} (middle; its knotted subsidiaries are not drawn), and{" "}
							{schedule.id}.
						</>
					}
				>
					<div className="gg-sils">
						{[SIXTIES_ID, LADDER_ID, SCHEDULE_ID].map((id) => (
							<div key={id}>
								<div className="linked-silhouette-label">
									<strong>{id}</strong> <span>{khipus[id].aliases[0]}</span>
								</div>
								<KhipuSilhouette
									cords={sils[id]}
									colors={colors}
									width={900}
									height={56}
								/>
							</div>
						))}
					</div>
				</Wide>
			</Step>

			<Sources
				items={[
					{
						who: "Khipu Field Guide (Ashok Khosla), release of 2026-09-17",
						what: "the 684 khipu databooks from which every count on this page is computed",
						where:
							"khipufieldguide.com/databook; screen in scripts/corpus_grammar_stats.py",
						href: "https://www.khipufieldguide.com/",
					},
					{
						who: "Karen Thompson, William Scannell & Ashok Khosla",
						what: "recording of AK003 (KH0698), Maiman collection MC935",
						where: "Khipu Field Guide catalogue page KH0698",
						href: "https://www.khipufieldguide.com/catalog/KH0698.html",
					},
					{
						who: "Marcia Ascher & Robert Ascher (1978), as transcribed by the Khipu Field Guide",
						what: "Code of the Quipu: Databook, AS069 (KH0082, Dauelsberg collection, Lluta valley), AS126 (KH0141), AS131 (KH0147), AS141 (KH0157)",
						where: "Khipu Field Guide catalogue pages",
						href: "https://www.khipufieldguide.com/catalog/KH0082.html",
					},
					{
						who: "Gary Urton, Khipu Database Project",
						what: "recordings of UR216 (KH0454, Berlin VA42586) and UR219 (KH0457, Berlin VA47084)",
						where:
							"Open Khipu Repository / Khipu Field Guide catalogue pages KH0454, KH0457",
						href: "https://www.khipufieldguide.com/catalog/KH0454.html",
					},
					{
						who: "Marcia Ascher & Robert Ascher (1981)",
						what: "Code of the Quipu: A Study in Media, Mathematics, and Culture — on group structure and leading positions",
						where: "University of Michigan Press",
					},
				]}
			/>
		</StoryPage>
	);
}
