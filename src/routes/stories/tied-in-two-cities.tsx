import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { EvidenceDeck, PairedPassage } from "#/components/story/CrossLink";
import { Chip } from "#/components/story/Ledger";
import {
	Conf,
	Layers,
	Prose,
	Sources,
	Step,
	StoryPage,
	Wide,
} from "#/components/story/Story";
import StrandWeave, { type WeaveTone } from "#/components/story/StrandWeave";
import { hexFor } from "#/lib/khipu/colors";
import { getColors, getKhipus } from "#/lib/khipu/data";
import type { ColorTable, Cord } from "#/lib/khipu/types";
import {
	alignReversed,
	type FieldColour,
	fieldColours,
	LEAD_TEXT,
	LIMA_ID,
	limaSeparators,
	OBJECT_ASCHER_ID,
	OBJECT_URTON_ID,
	PAIR_SCAN,
	PARIS_ID,
	pairStats,
	parisPart2,
	RANDOM_PAIRING,
	type UnitRow,
	unitRows,
} from "#/lib/stories/parislima";
import { cordAt, groupSpan, l1Index } from "#/lib/stories/storyIsland";
import type { StrandThread } from "#/lib/stories/strands";
import "#/styles/stories/pairs.css";
import "#/styles/stories/tied-in-two-cities.css";

export const Route = createFileRoute("/stories/tied-in-two-cities")({
	loader: async () => {
		const ids = [PARIS_ID, LIMA_ID, OBJECT_ASCHER_ID, OBJECT_URTON_ID];
		const [khipus, colors] = await Promise.all([getKhipus(ids), getColors()]);
		return {
			paris: khipus[PARIS_ID],
			lima: khipus[LIMA_ID],
			objectA: khipus[OBJECT_ASCHER_ID],
			objectB: khipus[OBJECT_URTON_ID],
			colors,
		};
	},
	head: () => ({ meta: [{ title: "Tied in two cities — Khipu" }] }),
	component: TiedInTwoCities,
});

/** The fifteen leading totals of each khipu as two strips, unit under unit. */
function LeadStrip({ rows }: { rows: UnitRow[] }) {
	const cell = (
		value: number | null,
		verdict: UnitRow["lead"]["verdict"],
		note?: string,
	) => (
		<div className={`ttc-cell is-${verdict}`}>
			<i aria-hidden="true" />
			{value == null ? "—" : value.toLocaleString()}
			{note && <small>{note}</small>}
		</div>
	);
	return (
		<div style={{ overflowX: "auto" }}>
			<div className="ttc-strip">
				<div />
				{rows.map((r) => (
					<div className="ttc-strip-head" key={r.unit}>
						{r.unit + 1}
					</div>
				))}
				<div className="ttc-strip-label">Paris · AS084</div>
				{rows.map((r) => (
					<div key={r.unit}>{cell(r.lead.a, r.lead.verdict)}</div>
				))}
				<div className="ttc-strip-label">Lima · HP055</div>
				{rows.map((r) => (
					<div key={r.unit}>
						{cell(
							r.lead.b,
							r.lead.verdict,
							r.lead.verdict === "register" ? `for ${r.lead.a}` : undefined,
						)}
					</div>
				))}
			</div>
			<div className="ttc-legend">
				<span>
					<i style={{ background: "var(--accent)" }} /> same total
				</span>
				<span>
					<i style={{ background: "var(--moiety-r)" }} /> same but for a lost
					register
				</span>
			</div>
		</div>
	);
}

/** One unit of each khipu as chips, with the values matched in order marked. */
function UnitReader({ row, colors }: { row: UnitRow; colors: ColorTable }) {
	const inA = new Set(row.pairs.map(([i]) => i));
	const inB = new Set(row.pairs.map(([, j]) => j));
	const chips = (cords: Cord[], matched: Set<number>) =>
		cords.map((c, i) => (
			<span
				key={c.name}
				className={
					i === 0 ? "ttc-lead" : matched.has(i) || !c.value ? "" : "ttc-dim"
				}
				style={{ display: "contents" }}
			>
				<Chip
					cord={c}
					colors={colors}
					role={i === 0 ? "total" : "rest"}
					match={i > 0 && matched.has(i)}
				/>
			</span>
		));
	return (
		<figure className="ttc-unit">
			<div className="ttc-unit-row">
				<span>Paris · group {row.unit + 1}</span>
				<span className="chips">{chips(row.a, inA)}</span>
			</div>
			<div className="ttc-unit-row">
				<span>Lima · unit {row.unit + 1}</span>
				<span className="chips">{chips(row.b, inB)}</span>
			</div>
			<figcaption style={{ fontSize: "0.8rem", color: "var(--ink-2)" }}>
				Leading totals {row.lead.a?.toLocaleString()} and{" "}
				{row.lead.b?.toLocaleString()} ({LEAD_TEXT[row.lead.verdict]});{" "}
				{row.pairs.length} of {row.knotted} knotted Paris values recur in order
				on the Lima unit. Dimmed chips have no counterpart in order.
			</figcaption>
		</figure>
	);
}

function Swatches({
	items,
	colors,
}: {
	items: FieldColour["paris"];
	colors: ColorTable;
}) {
	return (
		<>
			{items.map((s) => (
				<span className="ttc-swatch" key={s.color}>
					<i
						style={{
							background: hexFor(s.color.split(/[:\-%^(]/)[0], colors),
						}}
						aria-hidden="true"
					/>
					<b>{s.color.replace(/\(.*$/, "")}</b>
					<span>×{s.n}</span>
				</span>
			))}
		</>
	);
}

const WEAVE_NAMES = {
	[PARIS_ID]: "Paris · AS084",
	[LIMA_ID]: "Lima · HP055",
	[OBJECT_ASCHER_ID]: "AS107 · KH0121",
	[OBJECT_URTON_ID]: "UR237 · KH0473",
};

function TiedInTwoCities() {
	const { paris, lima, objectA, objectB, colors } = Route.useLoaderData();
	const rows = useMemo(() => unitRows(paris, lima), [paris, lima]);
	const stats = pairStats(rows);
	const fields = useMemo(() => fieldColours(rows), [rows]);
	const separators = useMemo(() => limaSeparators(lima), [lima]);
	const part2 = useMemo(() => parisPart2(paris), [paris]);
	const [unit, setUnit] = useState(0);
	const duplicate = useMemo(
		() => alignReversed(objectA, objectB),
		[objectA, objectB],
	);
	const dupExact = duplicate.filter((c) => c.a != null && c.a === c.b).length;
	const parisIndex = useMemo(() => l1Index(paris), [paris]);
	// the weave's cord index of each unit's leading total, and each unit's span
	const leads = useMemo(
		() => new Set(rows.map((r) => cordAt(parisIndex, r.a[0] ?? null))),
		[rows, parisIndex],
	);
	const part2Span = useMemo(() => groupSpan(paris, 15, 25), [paris]);
	const leadsOnly = useCallback(
		(t: StrandThread, pair: { a: string }): WeaveTone =>
			leads.has((pair.a === PARIS_ID ? t.a : t.b)[0]) ? "strong" : "faint",
		[leads],
	);
	// the leading totals in the story's own two colours: identical, and a
	// register apart
	const leadColor = useCallback(
		(t: StrandThread, pair: { a: string }): string | undefined =>
			!leads.has((pair.a === PARIS_ID ? t.a : t.b)[0])
				? undefined
				: t.kind === "exact"
					? "var(--accent)"
					: t.kind === "near"
						? "var(--moiety-r)"
						: undefined,
		[leads],
	);
	const unitSpan = useMemo(() => {
		const at = rows[unit].a.map((c) => cordAt(parisIndex, c));
		return { id: PARIS_ID, from: Math.min(...at), to: Math.max(...at) + 1 };
	}, [rows, unit, parisIndex]);

	return (
		<StoryPage
			kicker="KH0097 ↔ KH0586"
			title="Tied in two cities"
			standfirst={
				<>
					A khipu in Paris and a khipu in Lima, recorded about forty years apart
					by different people, open with fifteen units whose four-digit totals
					match in order. Under each total is the same template of fields, in
					different colours. Neither catalogue entry mentions the other.
				</>
			}
			meta={
				<>
					<span>KH0097 · AS084 · Musée du quai Branly 71.1930.19.470</span>
					<span>KH0586 · HP055 · MNAAHP 29934, Lima</span>
				</>
			}
		>
			<EvidenceDeck
				items={[
					{
						value: `${stats.exact}/${stats.units}`,
						label: "leading totals identical",
						note: "in the same sequence",
					},
					{
						value: stats.register,
						label: "totals a register apart",
						note: "78 for 1,078 and 187 for 1,087 on the Lima cords",
					},
					{
						value: `${stats.matched}/${stats.knotted}`,
						label: "field values recurring in order",
						note: `random unit pairing: at most ${RANDOM_PAIRING.max} of ${RANDOM_PAIRING.trials} trials`,
					},
					{
						value: part2.length,
						label: "further Paris units",
						note: "with no Lima counterpart",
					},
				]}
			/>

			<Step n={1} title="Two objects">
				<Prose>
					<p>
						The Paris khipu entered the Musée d'Ethnographie du Trocadéro in
						1930 and was recorded by Marcia and Robert Ascher, who described a
						rectangular structure of about fifteen pendants a group and noted
						differences between a first part, groups 1–15, and a second, groups
						16–26. The Lima khipu belongs to the Museo Nacional de Arqueología,
						Antropología e Historia del Perú and was recorded by Hugo Pereyra in
						2012. Its find-spot is unknown; so is the Paris khipu's.
					</p>
					<p>
						They are not the same object. Paris has {paris.stats.nCords} cords
						on a {paris.primary.length} cm primary of {paris.primary.color}, and
						Lima has {lima.stats.nCords} cords on {lima.primary.length} cm of{" "}
						{lima.primary.color}. Paris has 26 groups with no subsidiaries; Lima
						has 31, sixteen of them one or two brown cords long.{" "}
						<Conf level="firm">Recorded structure</Conf>
					</p>
					<p>
						This project's corpus scan for passages of {PAIR_SCAN.window}{" "}
						consecutive values shared between khipus ranks this pair first among
						those not already known to be one object or a published match:{" "}
						{PAIR_SCAN.runs} shared runs of five or more, {PAIR_SCAN.values}{" "}
						values. (The network map, which also counts runs of four, shows 21
						runs; a shuffled corpus produces runs of four about as often, so
						they are left out here.)
					</p>
				</Prose>
				<Wide
					caption={
						<>
							The two khipus at one spacing per cord, Paris above. The fifteen
							bold threads join the leading totals, unit for unit: {stats.exact}{" "}
							identical, and the {stats.register} dashed ones a register apart.
							The faint threads are the {stats.matched} field values that recur
							in order under them. Lima's short brown groups sit in the gaps
							between its units, and Paris runs on to a second part that Lima
							does not carry.
						</>
					}
				>
					<StrandWeave
						top={[PARIS_ID]}
						bottom={[LIMA_ID]}
						names={WEAVE_NAMES}
						emphasis={leadsOnly}
						threadColor={leadColor}
						className="ttc-leads"
						marks={[
							{
								id: PARIS_ID,
								from: part2Span.from,
								to: part2Span.to,
								label: "part 2 · no counterpart",
								tone: "key",
							},
						]}
					/>
				</Wide>
			</Step>

			<Step
				n={2}
				title={`${stats.exact} of ${stats.units} leading totals, in the same order`}
			>
				<Prose>
					<p>
						Take the first cord of each of the Aschers' fifteen part-1 groups
						and the first cord of each Lima group of nine cords or more. They
						read 1,080, 1,091, 1,078, 1,069, 1,077, 1,078, 1,179, 1,089 … on
						both khipus. Thirteen are identical. The other two differ by a
						register: where Paris has 1,078 the Lima cord carries 78, and where
						Paris has 1,087 Lima carries 187. Both are consistent with a worn
						thousands knot or a recorder missing a high position; the rest of
						each figure is intact.
					</p>
					<p>
						Fifteen four-digit values in the same order are very unlikely to
						match by chance. The simplest reading is that both khipus record the
						same account. <Conf level="firm">Computed from the cords</Conf>
					</p>
				</Prose>
				<Wide caption="The leading total of each unit, Paris above Lima. The two register slips are marked; every other total agrees to the last digit.">
					<LeadStrip rows={rows} />
				</Wide>
			</Step>

			<Step
				n={3}
				title="The same fields under each total, in different colours"
			>
				<Prose>
					<p>
						Under its total every unit carries a template: 12, 22, 100, 40 or
						50, 222, 22 or 23, 33, 66 and a 32 or 33. Matching the values in
						order, {stats.matched} of Paris's {stats.knotted} knotted
						non-leading values recur on the Lima unit in the same position of
						the sequence. Because the template repeats, a random pairing of
						units also scores well ({RANDOM_PAIRING.median} on average, never
						above {RANDOM_PAIRING.max} in{" "}
						{RANDOM_PAIRING.trials.toLocaleString()} trials), so the evidence
						rests on the totals, not the fields.
					</p>
					<p>
						The fields show the two makers' conventions. The 100 is a plain
						brown cord in Paris and a white-and-blue mottle in Lima; the 12 is
						white or white-and-yellow in Paris, white-and-brown in Lima; the 66
						is white-and-blue in Paris and plain white in Lima. The quantities
						match but the colour codes differ, which suggests two makers working
						from one source rather than a direct copy.{" "}
						<Conf level="likely">Supported reading</Conf>
					</p>
				</Prose>
				<Wide caption="Each template value with the colours the two recorders gave it, counted over the units where both carry the value. Codes are the Field Guide's Ascher colour codes; a colon is a mottle, a hyphen a barber pole.">
					<div className="ledger ttc-fields">
						<table className="ledger-table">
							<thead>
								<tr>
									<th className="num">Value</th>
									<th className="num">Units</th>
									<th>Paris colours</th>
									<th>Lima colours</th>
								</tr>
							</thead>
							<tbody>
								{fields.map((f) => (
									<tr key={f.value}>
										<td className="num">{f.value}</td>
										<td className="num">{f.units}</td>
										<td className="ttc-swatches">
											<Swatches items={f.paris} colors={colors} />
										</td>
										<td className="ttc-swatches">
											<Swatches items={f.lima} colors={colors} />
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Wide>
				<Wide caption="One unit read on both khipus. The first chip is the total; matched values are marked, values with no counterpart in order are dimmed. Unit 9 shows a register slip; unit 13 a unit where both keepers left the same fields blank.">
					<div className="ttc-unit-pick" role="tablist" aria-label="Unit">
						{rows.map((r) => (
							<button
								key={r.unit}
								type="button"
								className="btn"
								aria-pressed={unit === r.unit}
								onClick={() => setUnit(r.unit)}
							>
								{r.unit + 1}
							</button>
						))}
					</div>
					<StrandWeave
						top={[PARIS_ID]}
						bottom={[LIMA_ID]}
						names={WEAVE_NAMES}
						variant="divider"
						window={unitSpan}
						inset={false}
						reveal={false}
						caption={false}
						className="pair-lens ttc-unit-weave"
					/>
					<UnitReader row={rows[unit]} colors={colors} />
				</Wide>
			</Step>

			<Step n={4} title="What Lima puts between the units">
				<Prose>
					<p>
						Paris ends most units with a white cord of 42 or 43 and, on units 1,
						7, 8 and 9, a large closing value: 456, 400, 400 and 467. Lima
						carries no such cords inside its units. Instead, after each unit it
						ties one or two separate brown cords: 42 or 43 nearly every time,
						and after units 1, 3 and 6 a second large cord of 450, 120 and 432.
					</p>
					<p>
						The 42 is the same field in a different place: inside the unit on
						one khipu, between units on the other. The large values do not align
						unit for unit (Paris 456 on unit 1, Lima 450 after it; Paris 400 on
						unit 7, Lima 432 after unit 6). One possibility is a working figure
						kept and updated separately on the two records.{" "}
						<Conf level="open">Hypothesis</Conf>
					</p>
				</Prose>
				<Wide caption="Lima's short groups, with the unit each follows. Values are as recorded; the cord colour is the Field Guide's.">
					<div className="ttc-separators">
						{separators.map((s) => (
							<span
								className="ttc-sep"
								key={`${s.after}-${s.cords[0]?.name ?? "x"}`}
							>
								<span>after {s.after + 1}:</span>
								{s.cords.map((c) => (
									<Chip key={c.name} cord={c} colors={colors} />
								))}
							</span>
						))}
					</div>
				</Wide>
			</Step>

			<Step n={5} title="Paris goes on">
				<Prose>
					<p>
						After its fifteenth unit and a lone blank cord, Paris continues with{" "}
						{part2.length} more units of the same shape, opening{" "}
						{part2
							.slice(0, 5)
							.map((g) => (g[0]?.value ?? 0).toLocaleString())
							.join(", ")}{" "}
						… Their template is looser (a 200 in place of the 100, a 10 or 6 in
						place of the 40), and the Aschers marked the break themselves. Lima
						has nothing after unit 15 but a blank brown cord.
					</p>
					<p>
						So the Lima khipu restates part 1 of the Paris khipu, or both
						restate a common source; part 2 is on Paris only. What the fifteen
						units stand for (households, tribute categories, periods or
						something else) is not evident from either object.{" "}
						<Conf level="open">Meaning of the units</Conf>
					</p>
				</Prose>
				<Wide caption="The leading totals of Paris part 2, which Lima does not carry.">
					<div className="chips">
						{part2.map((g) => (
							<Chip key={g[0].name} cord={g[0]} colors={colors} />
						))}
					</div>
				</Wide>
			</Step>

			<Step n={6} title="For comparison: one object under two numbers">
				<Prose>
					<p>
						For comparison, here is one object recorded twice. The Aschers
						recorded AS107 in Berlin (VA 24370 B, "Marquez"): 26 pendants on a{" "}
						{objectA.primary.length} cm primary, plus three knot clusters on the
						primary cord that the Field Guide lists as cords 27–29. Gary Urton
						later recorded VA 66834 as UR237 ({objectB.stats.nCords} cords, a{" "}
						{objectB.primary.length} cm primary). Read from the other end, it
						appears to be the same object: {dupExact} of the Aschers' 29 values
						in reverse, one blank cord added between 207 and 210, and 500 where
						the Aschers read 50. The knotted end of the primary cord, where the
						Aschers' record ends, is where Urton's begins. Matched cord for
						cord, the two records' pendant lengths differ by about 3 cm;
						shuffled, the same cords differ by about 20. The accession is
						unexplained: the Aschers found AS107 loosely tied around the bar
						that carries AS106 under VA 24370, and UR237 has a number of its
						own.
					</p>
					<p>
						The Field Guide shows a third copy, AS119 (VA 42545), with the same
						29 values. That one is a data error, not a khipu: its workbook
						carries AS107's cords under AS119's name, while the Aschers'
						databook and the Open Khipu Repository record AS119 as seven
						pendants with subsidiaries on a 50.5 cm cord. The map leaves it out.
					</p>
					<p>
						Identical values and lengths, read in reverse, indicate one object.
						Identical totals under a different colour code, with fields placed
						differently, indicate one account kept twice. The Paris and Lima
						khipus look like the second kind.{" "}
						<Conf level="firm">Value-for-value</Conf>
					</p>
				</Prose>
				<Wide
					caption={
						<>
							AS107 above, UR237 below drawn from its far end, so the threads
							run straight. Thread for thread the values agree ({dupExact} of
							29); the one dashed thread is the Aschers' 50, which reads 500 on
							UR237, and the one UR237 cord with no thread is the blank cord
							between 207 and 210. The strip beneath lists the values; it
							scrolls sideways.
						</>
					}
				>
					<StrandWeave
						top={[OBJECT_ASCHER_ID]}
						bottom={[OBJECT_URTON_ID]}
						names={WEAVE_NAMES}
						reversed={[OBJECT_URTON_ID]}
					/>
					<div className="pair-scroll">
						<PairedPassage
							left="KH0121 · AS107"
							right="KH0473 · UR237, reversed"
							leftValues={duplicate.map((c) => c.a)}
							rightValues={duplicate.map((c) => c.b)}
							leftTone="yellow"
							rightTone="yellow"
							reversed
						/>
					</div>
				</Wide>
			</Step>

			<Step n={7} title="Summary">
				<Wide>
					<Layers
						layers={[
							{
								title: "Observed",
								body: "Fifteen groups on each khipu opening with a four-digit cord; a repeating template of small fields beneath; Lima's short brown groups between units; Paris's eleven further groups.",
								level: "firm",
							},
							{
								title: "Derived",
								body: `${stats.exact} of ${stats.units} leading totals identical in order, ${stats.register} a register apart; ${stats.matched} of ${stats.knotted} non-leading values recurring in order (random pairing: at most ${RANDOM_PAIRING.max}).`,
								level: "firm",
							},
							{
								title: "Context",
								body: "No find-spot for either. Paris was acquired by 1930 and recorded by the Aschers; Lima was recorded by Pereyra in 2012 and described in Pereyra Sánchez 2011. Pereyra 2011 has not been checked for a mention of the Paris object.",
								level: "likely",
							},
							{
								title: "Interpretation",
								body: "Two records of one fifteen-unit account, kept by two makers with their own colour codes and field layout; Paris part 2 has no counterpart on the Lima khipu.",
								level: "likely",
							},
						]}
					/>
				</Wide>
			</Step>

			<Sources
				items={[
					{
						who: "Khipu Field Guide",
						what: "KH0097 catalogue, recorded cords and the Aschers' notes",
						where:
							"AS084; the page notes Juliana Martins' proposal that it is an astronomical khipu, and the Aschers' part 1 / part 2 division",
						href: "https://www.khipufieldguide.com/catalog/KH0097.html",
					},
					{
						who: "Khipu Field Guide",
						what: "KH0586 catalogue and recorded cords",
						where:
							"HP055; bibliography Brokaw 2010 (image 16), Pancorvo Salicetti 2020 pp. 342–343, Pereyra Sánchez 2011 pp. 225–240, 265",
						href: "https://www.khipufieldguide.com/catalog/KH0586.html",
					},
					{
						who: "Khipu Field Guide",
						what: "KH0473 catalogue",
						where:
							"UR237; cites Urton 2017, Inka History in Knots, p. 261 (the book's inventory appendix; UR237 is not discussed)",
						href: "https://www.khipufieldguide.com/catalog/KH0473.html",
					},
					{
						who: "This site",
						what: "Unit alignment and permutation baseline",
						where: "scripts/paris_lima_pair.py",
					},
					{
						who: "This site",
						what: "Corpus scan for shared passages, forward and reversed",
						where: "scripts/shared_passages.py",
					},
				]}
			/>
			<p className="story-next">
				<Link to="/stories/tied-twice">
					Compare: the Berlin account tied twice →
				</Link>
			</p>
		</StoryPage>
	);
}
