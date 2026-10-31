import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import KhipuDiagram from "#/components/khipu/KhipuDiagram";
import CordReader from "#/components/story/CordReader";
import { Chip } from "#/components/story/Ledger";
import {
	Conf,
	type Layer,
	Layers,
	LayerTabs,
	Legend,
	Prose,
	Sources,
	Step,
	StoryPage,
	Wide,
} from "#/components/story/Story";
import ThreadedSilhouette, {
	silhouetteOf,
} from "#/components/story/ThreadedSilhouette";
import { TiersStage } from "#/components/story/TwinFallsStages";
import { hexFor } from "#/lib/khipu/colors";
import { getColors, getKhipus } from "#/lib/khipu/data";
import type { GroupBox } from "#/lib/khipu/layout";
import type { ColorTable, Cord, Khipu } from "#/lib/khipu/types";
import { pendantGroups } from "#/lib/stories/derive";
import {
	asTens,
	childrenOf,
	cordNamed,
	cordTotal,
	hairCords,
	hundredsReading,
	ledgerThreads,
	markerPendants,
	markers,
	numericSubs,
	quotaUnits,
	roleOfGroup,
	SECTIONS,
	type SumRow,
	sectionRanges,
	sectionShape,
	splitDigits,
	sumRows,
	TEMPLATE,
	TWIN_FALLS_ID,
	tensReading,
	totalRows,
	type Verdict,
} from "#/lib/stories/twinfalls";

export const Route = createFileRoute("/stories/twin-falls")({
	loader: async () => {
		const [khipus, colors] = await Promise.all([
			getKhipus([TWIN_FALLS_ID]),
			getColors(),
		]);
		return { khipu: khipus[TWIN_FALLS_ID], colors };
	},
	head: () => ({ meta: [{ title: "A ledger that checks itself — Khipu" }] }),
	component: TwinFalls,
});

type OverviewLayer = "recorded" | "roles" | "sections";

const OVERVIEW = { slot: 6, gap: 12, subOffset: 3, pxPerCm: 1.8, cordW: 1.6 };

/** Column heads for the section-shape table, one per TEMPLATE position. */
const HEADS = TEMPLATE.map((role, i) => ({
	id: `${role}${i}`,
	label:
		role === "total" || role === "total2"
			? "total"
			: role === "sums" || role === "sums2"
				? "sums"
				: `d${i - 3}`,
}));

const VERDICT_TEXT: Record<Verdict, string> = {
	exact: "exact",
	near: "off by one",
	no: "no",
};

function verdictClass(v: Verdict) {
	return v === "exact" ? "ok" : v === "near" ? "muted" : "no";
}

function knotsText(c: Cord) {
	return c.knots.map((k) => `${k.n}${k.type} at ${k.pos} cm`).join(", ");
}

/** A pendant's value as chips: the pendant, then any numeric subsidiary. */
function EntryChips({
	cord,
	kids,
	colors,
}: {
	cord: Cord;
	kids: Map<string, Cord[]>;
	colors: ColorTable;
}) {
	const subs = numericSubs(cord, kids);
	return (
		<span className="chips" style={{ gap: "0.15rem" }}>
			<Chip cord={cord} colors={colors} />
			{subs.map((s) => (
				<span key={s.name} className="chips" style={{ gap: "0.15rem" }}>
					<span className="muted">+</span>
					<Chip cord={s} colors={colors} />
				</span>
			))}
		</span>
	);
}

function TwinFalls() {
	const { khipu, colors } = Route.useLoaderData();
	const [layer, setLayer] = useState<OverviewLayer>("recorded");
	const [register, setRegister] = useState<"hundreds" | "tens">("hundreds");
	const groups = useMemo(() => pendantGroups(khipu), [khipu]);
	const silCords = useMemo(() => silhouetteOf(khipu), [khipu]);
	const ledger = useMemo(() => ledgerThreads(khipu), [khipu]);
	const screenFans = useMemo(
		() =>
			ledger
				.filter((t) => t.tier === "total" && t.kind === "exact")
				.map((t) => ({ ...t, label: t.vFrom.toLocaleString() })),
		[ledger],
	);
	const registerThreads = useMemo(
		() =>
			ledgerThreads(khipu, register).filter(
				(t) => t.section === "A" && t.tier === "sum",
			),
		[khipu, register],
	);
	const ranges = useMemo(() => sectionRanges(khipu), [khipu]);
	const labelMarks = useMemo(
		() =>
			markerPendants(khipu).map((m) => ({
				i: m.i,
				title: `${m.name}: a lone figure-eight subsidiary, read as a label and left out of the sums`,
			})),
		[khipu],
	);
	const kids = useMemo(() => childrenOf(khipu), [khipu]);
	const [A, B, C] = SECTIONS;
	const rowsC = useMemo(() => sumRows(khipu, C), [khipu]);
	const rowsA = useMemo(() => sumRows(khipu, A), [khipu]);
	const totalsC = useMemo(() => totalRows(khipu, C), [khipu]);
	const totalsA = useMemo(() => totalRows(khipu, A), [khipu]);
	const totalsB = useMemo(() => totalRows(khipu, B), [khipu]);
	const units = useMemo(() => quotaUnits(khipu), [khipu]);
	const splits = useMemo(() => splitDigits(khipu), [khipu]);
	const labels = useMemo(() => markers(khipu), [khipu]);
	const hair = useMemo(() => hairCords(khipu), [khipu]);
	const shapes = useMemo(
		() =>
			SECTIONS.map((sec) => ({
				key: sec.key,
				sizes: sectionShape(khipu, sec),
			})),
		[khipu],
	);

	const p1 = cordNamed(khipu, "p1");
	const p1tens = useMemo(() => asTens(p1), [p1]);
	const p145 = cordNamed(khipu, "p145");
	const total1006 = totalsC[0];
	const total1007 = totalsC[1];
	const total504 = totalsA[0];
	const quotaCord = groups[B.total as number][0];
	const quotaSub = numericSubs(quotaCord, kids)[0];
	const unitsPendants = units.reduce((a, u) => a + u.pendantValue, 0);
	const unitsSubs = units.reduce((a, u) => a + u.subValue, 0);
	const g3 = groups[A.sums2];
	const g16 = groups[15];
	const exact = [...rowsA, ...rowsC, ...totalsA, ...totalsC].filter(
		(r) => r.verdict === "exact",
	).length;
	const near = [...rowsA, ...rowsC].filter((r) => r.verdict === "near").length;

	const paint = (c: Cord): string | null => {
		if (layer !== "roles" || c.level > 1) return null;
		const { role } = roleOfGroup(c.group ?? -1);
		if (role === "total" || role === "total2") return "var(--accent)";
		if (role === "sums" || role === "sums2") return "var(--moiety-r)";
		return null;
	};
	const groupBand = (g: GroupBox): string | null => {
		const { section, role } = roleOfGroup(g.index);
		if (layer === "sections")
			return section.key === "B" ? "var(--band-b)" : "var(--band-a)";
		if (layer === "roles") return role === "detail" ? "var(--band-b)" : null;
		return null;
	};
	const groupLabel = (g: GroupBox): string | null => {
		if (layer !== "sections") return null;
		const { section } = roleOfGroup(g.index);
		return g.index === (section.total ?? section.sums)
			? `Section ${section.key}`
			: null;
	};

	return (
		<StoryPage
			kicker="Twin Falls"
			title="A ledger that checks itself"
			standfirst={
				<>
					An Inka khipu in a small Idaho college museum, recorded in 2024 and
					not previously published, carries three accounts of the same shape: a
					grand total, six unit totals, and six groups of entries that add up to
					them. This is this project's own reading and has not been reviewed.
					The sums resolve a register question its recorder left open, are
					consistent with six units of 200 each, and show knotting habits that
					suggest the record was updated as amounts came in.
				</>
			}
			meta={
				<>
					<span>
						Object:{" "}
						<Link to="/khipus/$id" params={{ id: khipu.id }}>
							{khipu.aliases[0]} · {khipu.id}
						</Link>
					</span>
					<span>
						Herrett Center for Arts and Science, College of Southern Idaho,
						accession P.85.6
					</span>
					<span>Recorded by Karen Thompson, 2024; re-examined April 2026</span>
				</>
			}
		>
			<Step n={1} title="An unpublished khipu">
				<Prose>
					<p>
						In December 2025 the Open Khipu Repository issued KH numbers to 72
						khipus whose cord-by-cord data had never been public. Among them was
						one from the Herrett Center in Twin Falls, Idaho. The Khipu Field
						Guide lists no publication for it. Its provenance is recorded only
						as likely near Lima.
					</p>
					<p>
						The object: a white cotton primary cord, {khipu.primary.length} cm
						long and cut at both ends, carrying {khipu.stats.nPendants} pendants
						and {khipu.stats.nSubsidiaries} subsidiaries in{" "}
						{khipu.stats.nGroups} groups, with {khipu.stats.nKnots} knots. Every
						pendant is attached recto. Six colours cover the cords, plus mottled
						cords that play a role below.{" "}
						<Conf level="firm">Recorded structure</Conf>
					</p>
					<p>
						It was selected by a screen. Across all 684 khipus with published
						cords there are 165 places where a single knotted cord worth ten or
						more stands alone before a group of three or more. In twelve of them
						the lone cord's value is the group's total. Three of the twelve are
						on this khipu.
					</p>
				</Prose>
				<Wide caption="KH0699 as a silhouette: pendant lengths and recorded colours along the primary cord. The three threads are the screen's three hits on this khipu, each lone cord fanning onto the group after it.">
					<ThreadedSilhouette
						cords={silCords}
						colors={colors}
						threads={screenFans}
						silHeight={110}
						arcHeight={40}
						title="KH0699 silhouette with the three lone-cord totals the corpus screen found: 504, 1,006 and 1,007"
						legend={false}
					/>
				</Wide>
			</Step>

			<Step n={2} title="Three accounts, one grammar">
				<Prose>
					<p>
						Read left to right, the khipu divides into three sections with the
						same pattern. Each opens with a lone cord of mottled colour carrying
						a total, then a six-cord group, then a second lone total with its
						own group, then six detail groups of eight to ten cords. The first
						section has lost its opening total: the primary cord is cut just
						before it.
					</p>
					<p>
						The group count agrees. Ten groups a section, three sections, one
						lost to the cut: 29, which is what the recorder counted by spacing.
						Stacked, the three sections' group sizes line up.
					</p>
				</Prose>
				<Wide caption="Group sizes by template position. Sections A and B match at every position; C differs at two, where its second summary group has a seventh cord and the next group one fewer.">
					<div className="ledger">
						<table className="ledger-table">
							<thead>
								<tr>
									<th />
									{HEADS.map((h) => (
										<th key={h.id} className="num">
											{h.label}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{shapes.map((row) => (
									<tr key={row.key}>
										<th>Section {row.key}</th>
										{row.sizes.map((n, i) => {
											const others = shapes
												.filter((o) => o.key !== row.key)
												.map((o) => o.sizes[i]);
											const cls =
												n === null
													? "muted"
													: others.every((o) => o === null || o === n)
														? "ok"
														: "";
											return (
												<td key={HEADS[i].id} className={`num ${cls}`}>
													{n === null ? "cut" : n}
												</td>
											);
										})}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Wide>
				<Prose>
					<p>
						We screened the corpus for this kind of regularity. Write each khipu
						as its sequence of group sizes, try every period and every phase,
						and score how many template positions agree in every repeat; then
						shuffle the khipu's own groups and ask how often chance does as
						well. Of the 158 khipus with twelve or more groups, nine repeat a
						template at least three times with nine tenths agreement and a
						shuffle probability under one in twenty. Seven of the nine are the
						plain alternation of a lone cord and a group of six or eight; one
						runs five groups then a lone cord, three times. In this screen
						KH0699 is the only one whose template is ten positions long with
						four distinct roles. The sizes alone cannot say which end lost a
						group; the arithmetic can, since each lone cord carries the total of
						the group after it.{" "}
						<Conf level="likely">Period-10 template, opening total lost</Conf>
					</p>
					<p>
						Switch layers to see the roles this reading assigns, then the three
						sections.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							The whole khipu. Roles: lone total cords in blue, six-cord sum
							groups in orange, detail groups shaded. Sections A, B and C as
							bands.
						</>
					}
				>
					<LayerTabs
						value={layer}
						onChange={setLayer}
						options={[
							{ value: "recorded", label: "As recorded" },
							{ value: "roles", label: "Roles" },
							{ value: "sections", label: "Sections" },
						]}
					/>
					<KhipuDiagram
						khipu={khipu}
						colors={colors}
						layout={OVERVIEW}
						style="physical"
						paint={paint}
						groupBand={groupBand}
						groupLabel={groupLabel}
						showGroups
						tooltip={layer === "recorded"}
						fit
					/>
					{layer === "roles" && (
						<Legend
							items={[
								{ color: "var(--accent)", label: "lone total cord" },
								{ color: "var(--moiety-r)", label: "six-cord sum group" },
								{ color: "var(--band-b)", label: "detail groups" },
							]}
						/>
					)}
				</Wide>
			</Step>

			<Step n={3} title="Section C">
				<Prose>
					<p>
						The last section is the least damaged. A lone cord at 51 cm reads{" "}
						{total1006.value.toLocaleString()}. The six white cords beside it
						read {rowsC.map((r) => r.read).join(", ")}, which sum to{" "}
						{rowsC.reduce((a, r) => a + r.read, 0).toLocaleString()}. Each of
						those six is the total of one of the six detail groups at the end of
						the khipu, in order. Play the figure to step through it.
					</p>
				</Prose>
				<Wide caption="Section C read from the top down: the lone total, the six sums, then each detail group against its sum cord.">
					<TiersStage khipu={khipu} colors={colors} />
				</Wide>
				<Wide caption="The six detail groups of section C against the six-cord sum group. Subsidiaries are added to their pendant; the lone figure-eight subsidiary on p202 is read as a label, not a 1.">
					<div className="ledger">
						<table className="ledger-table">
							<thead>
								<tr>
									<th>Group</th>
									<th>Entries, as recorded</th>
									<th className="num">Total</th>
									<th className="num">Sum cord</th>
									<th>Check</th>
								</tr>
							</thead>
							<tbody>
								{rowsC.map((r) => (
									<tr key={r.cord.name}>
										<td>
											g{r.detail + 1} · {groups[r.detail].length} cords
										</td>
										<td>
											<span className="chips">
												{groups[r.detail].map((c) => (
													<EntryChips
														key={c.name}
														cord={c}
														kids={kids}
														colors={colors}
													/>
												))}
											</span>
										</td>
										<td className="num">{r.detailTotal}</td>
										<td className="num">
											{r.read} <span className="muted">({r.cord.name})</span>
										</td>
										<td className={verdictClass(r.verdict)}>
											{VERDICT_TEXT[r.verdict]}
										</td>
									</tr>
								))}
								<tr>
									<td>Σ</td>
									<td className="muted">six groups</td>
									<td className="num">
										{rowsC.reduce((a, r) => a + r.detailTotal, 0)}
									</td>
									<td className="num">
										{rowsC.reduce((a, r) => a + r.read, 0)} ={" "}
										{total1006.cord.name} {total1006.value.toLocaleString()}
									</td>
									<td className={verdictClass(total1006.verdict)}>
										{VERDICT_TEXT[total1006.verdict]}
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</Wide>
				<Prose>
					<p>
						Two features of the detail groups matter later. The six units are
						listed in descending order of their totals, which suggests the khipu
						was arranged rather than simply accumulated. Every group ends in one
						or two blank cords, consistent with each unit having a fixed number
						of slots, some unfilled. The second lone cord,{" "}
						{total1007.value.toLocaleString()}, is followed by seven
						grayish-brown cords reading{" "}
						{groups[C.sums2].map((c) => c.value ?? 0).join(", ")}: they sum to{" "}
						{total1007.groupTotal.toLocaleString()}. The first repeats the first
						unit's {rowsC[0].read}. <Conf level="firm">Sums verified</Conf>{" "}
						<Conf level="open">What the second column counts</Conf>
					</p>
				</Prose>
			</Step>

			<Step n={4} title="Hundreds or tens">
				<Prose>
					<p>
						The khipu opens with six long white cords. Four of them carry the
						same knots: eight single knots at 5 cm and a six-turn long knot at
						18 cm. The recorder wrote two of them down as 806 and two as 86, and
						logged after her second examination that she "proposed a register
						shift from 100s to 10s" for all six. From the knots alone the
						question is open: with 13 cm between the two clusters, the upper one
						could be hundreds over an empty tens place, or tens with nothing
						above.
					</p>
				</Prose>
				<Wide caption="Pendant 1 read both ways. The knots are the same; only the place assigned to the single knots changes.">
					<div className="figures">
						<div className="figure">
							<figcaption>
								<h3>As recorded: hundreds and units</h3>
							</figcaption>
							<CordReader
								cord={p1}
								colors={colors}
								pxPerCm={5}
								title="Pendant 1 read as hundreds and units"
							/>
						</div>
						<div className="figure">
							<figcaption>
								<h3>Shifted: tens and units</h3>
							</figcaption>
							<CordReader
								cord={p1tens}
								colors={colors}
								pxPerCm={5}
								title="Pendant 1 read as tens and units"
							/>
						</div>
					</div>
				</Wide>
				<Prose>
					<p>
						The six detail groups that follow resolve it. Each of the six cords
						should be the total of one group, in order. Switch the reading and
						watch the threads.
					</p>
				</Prose>
				<Wide caption="Section A, cropped. Each thread runs from one of the six opening cords to a bracket over the detail group it should total. The knots are the same in both views; only the place given to the single knots changes. As hundreds, every thread breaks; as tens, five close exactly and one is a knot short.">
					<LayerTabs
						value={register}
						onChange={setRegister}
						options={[
							{ value: "hundreds", label: "As hundreds" },
							{ value: "tens", label: "As tens" },
						]}
					/>
					<ThreadedSilhouette
						cords={silCords}
						colors={colors}
						threads={registerThreads}
						range={[ranges[0].from, ranges[0].to]}
						silHeight={80}
						arcHeight={100}
						title={`Section A: the six opening cords read as ${register} against their detail groups`}
						legendText={{ no: "does not match" }}
					/>
				</Wide>
				<Wide caption="The opening six cords against the six detail groups of section A. Under the tens reading five match exactly and one is a single knot short; under the hundreds reading none match.">
					<div className="ledger">
						<table className="ledger-table">
							<thead>
								<tr>
									<th>Cord</th>
									<th>Knots</th>
									<th className="num">As hundreds</th>
									<th className="num">As tens</th>
									<th>Detail group</th>
									<th className="num">Group total</th>
									<th>Check</th>
								</tr>
							</thead>
							<tbody>
								{rowsA.map((r) => {
									const subs = numericSubs(r.cord, kids);
									const subText = subs.length
										? ` + ${subs.map((s) => `${s.color} ${s.value}`).join(" + ")}`
										: "";
									return (
										<tr key={r.cord.name}>
											<td>
												<Chip cord={r.cord} colors={colors} /> {r.cord.name}
											</td>
											<td>
												{knotsText(r.cord)}
												{subText && <span className="muted">{subText}</span>}
											</td>
											<td className="num">
												{hundredsReading(r.cord) +
													(r.read - tensReading(r.cord))}
											</td>
											<td className="num">{r.read}</td>
											<td>
												g{r.detail + 1} · {groups[r.detail].length} cords
											</td>
											<td className="num">{r.detailTotal}</td>
											<td className={verdictClass(r.verdict)}>
												{VERDICT_TEXT[r.verdict]}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</Wide>
				<Prose>
					<p>
						Four groups of nine or ten small entries each summing to exactly 86
						is unlikely to be chance, so we read the opening cords in the tens
						register. The fifth also copies the structure of its group. Group 8
						has one grayish-brown subsidiary of 8, and the fifth summary cord
						carries one grayish-brown subsidiary of 8. Between the sums and the
						details sits the second total, {total504.value}, on a cord mottled
						white and brown, followed by six cords of 84, one of them written as
						60 on the pendant and 24 on a subsidiary. Six times 84 is{" "}
						{total504.groupTotal}.{" "}
						<Conf level="firm">Tens register, from the sums</Conf>
					</p>
					<p>
						Knot place is positional, but the spacing is not fixed in
						centimetres. On this khipu the hundreds of the total cords sit 0.5
						to 5 cm from the primary cord, the tens of the detail cords 3 to 5.5
						cm from it. A knot at 5 cm is hundreds on one cord and tens on
						another. The number of clusters, the cord's length and the sums
						determine the reading.
					</p>
				</Prose>
			</Step>

			<Step n={5} title="Quotas of two hundred">
				<Prose>
					<p>
						The middle section is the most damaged. Its lone total reads{" "}
						{quotaCord.value} on the pendant and {quotaSub?.value} on a
						dark-brown subsidiary: together{" "}
						{(quotaCord.value ?? 0) + (quotaSub?.value ?? 0)}. We read the six
						cords that follow as units of a fixed 200, each split between a
						white pendant and a brown subsidiary.
					</p>
				</Prose>
				<Wide caption="The six units of section B. On this khipu the units cluster of a three-place cord sits 18 to 20 cm from the primary cord and the tens of a subsidiary near 11 cm; a cord cut above that line has lost a digit.">
					<div className="ledger">
						<table className="ledger-table">
							<thead>
								<tr>
									<th>Unit</th>
									<th>Pendant</th>
									<th>Subsidiary</th>
									<th className="num">Recorded</th>
									<th>Reading</th>
								</tr>
							</thead>
							<tbody>
								{units.map((u, i) => (
									<tr key={u.pendant.name}>
										<td>{i + 1}</td>
										<td>
											<Chip cord={u.pendant} colors={colors} />{" "}
											<span className="muted">
												{u.pendant.length} cm,{" "}
												{u.pendant.term === "C"
													? "cut"
													: u.pendant.term === "B"
														? "broken"
														: "knotted end"}
											</span>
										</td>
										<td>
											{u.sub ? (
												<>
													<Chip cord={u.sub} colors={colors} />{" "}
													<span className="muted">
														{u.sub.length} cm,{" "}
														{u.sub.term === "C"
															? "cut"
															: u.sub.term === "B"
																? "broken"
																: "knotted end"}
													</span>
												</>
											) : (
												<span className="muted">none</span>
											)}
										</td>
										<td className="num">{u.sum}</td>
										<td className={u.sum === 200 ? "ok" : "muted"}>
											{u.sum === 200
												? "200"
												: u.pendantCut || u.subCut
													? `${u.sum}, units lost on the ${[u.pendantCut ? "pendant" : "", u.subCut ? "subsidiary" : ""].filter(Boolean).join(" and ")}`
													: `${u.sum}`}
										</td>
									</tr>
								))}
								<tr>
									<td>Σ</td>
									<td className="num">{unitsPendants}</td>
									<td className="num">{unitsSubs}</td>
									<td className="num">{unitsPendants + unitsSubs}</td>
									<td>
										total cord {quotaCord.value} + {quotaSub?.value} ={" "}
										{(quotaCord.value ?? 0) + (quotaSub?.value ?? 0)} = 6 × 200
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</Wide>
				<Prose>
					<p>
						Every cord in this group that ends in a cut is cut above its units
						register, and every recorded value on a cut cord is a round number.
						The pendants are {(quotaCord.value ?? 0) - unitsPendants} short of
						the total cord and the subsidiaries{" "}
						{(quotaSub?.value ?? 0) - unitsSubs} short. Six units of exactly 200
						need {1200 - unitsPendants - unitsSubs} more than was recorded. The
						lost units digits can account for the difference.{" "}
						<Conf level="likely">Six units of 200</Conf>
					</p>
					<p>
						A similar pattern appears one level down and one section back. In
						detail group 16 each yellowish-brown cord carries a brown
						subsidiary, and pendant plus subsidiary is{" "}
						{g16
							.filter((c) => c.value)
							.map((c) => cordTotal(c, kids))
							.join(", ")}
						. In section A the six cords after the 504 read{" "}
						{g3.map((c) => cordTotal(c, kids)).join(", ")}, one of them as 60 on
						the pendant and 24 on a subsidiary. One reading: a quota, with a
						subsidiary carrying the balance where a unit fell short on its main
						cord.
					</p>
					<p>
						Section B's six detail groups do not match its summary cords by any
						sum we found. Every detail total there is under 200. If the summary
						cords are assessments and the details are deliveries, that is what
						one would expect; it is not demonstrated. The second total of the
						section, {totalsB[1].value}, precedes a group recorded as{" "}
						{totalsB[1].groupTotal} with four cords cut below their tens, so it
						can only be found consistent.{" "}
						<Conf level="open">Section B details</Conf>
					</p>
				</Prose>
			</Step>

			<Step n={6} title="How the numbers are written">
				<Prose>
					<p>
						A units digit from 2 to 9 is normally one long knot with that many
						turns, and 1 is a figure-eight.{" "}
						{splits.filter((s) => s.kind === "long+eight").length} cords here
						write a digit as a long knot followed by a figure-eight, 7 + 1 for
						8, 4 + 1 for 5, and{" "}
						{splits.filter((s) => s.kind === "long+long").length} write it as
						two long knots. No other khipu in the corpus does the first as
						often: 9 cords in a hundred against 0.7 across all 684. The grand
						total {p145.value?.toLocaleString()} has its 7 tied as a four-turn
						and a three-turn long knot.
					</p>
				</Prose>
				<Wide caption="Pendant 145, the second grand total of section C. The units place holds two long knots, 4 and 3, that read together as 7.">
					<div className="figures">
						<div className="figure">
							<figcaption>
								<h3>A digit in two knots</h3>
							</figcaption>
							<CordReader
								cord={p145}
								colors={colors}
								pxPerCm={5}
								title="Pendant 145, 1007, with its units digit tied as 4 + 3"
							/>
						</div>
						<div className="figure">
							<figcaption>
								<h3>Every split digit on the khipu</h3>
							</figcaption>
							<div className="chips">
								{splits.map((s) => (
									<span
										key={s.cord.name}
										className="chip"
										title={`${s.cord.name}: ${knotsText(s.cord)}`}
									>
										<i
											style={{
												background: hexFor(
													s.cord.colorParsed?.[0]?.codes[0],
													colors,
												),
											}}
											aria-hidden="true"
										/>
										{s.cord.name} · {s.cord.value} · {s.text}
									</span>
								))}
							</div>
						</div>
					</div>
				</Wide>
				<Prose>
					<p>
						These are numerically valid: the sums only work if 7 + 1 counts as
						8. One reading is that the figure-eight was added later, as an
						increment to a value already tied. The split totals fit the same
						reading: 84 written 60 + 24, 15 written 6 + 9, 47 written 27 + 20,
						200 written 128 + 72. In each case the subsidiary brings the pendant
						up to what its neighbours show, as a second delivery would.{" "}
						<Conf level="likely">Increments</Conf>
					</p>
					<p>
						Four subsidiaries carry one figure-eight knot and nothing else:{" "}
						{labels.map((c) => `${c.name} (${c.color})`).join(", ")}. Two of
						them are the same cord in the same colour, white and brown plied
						together; one hangs from the first summary cord, the other from the
						first cord of the group it totals. Read as the number 1 they break
						two sums; read as labels, both are exact.{" "}
						<Conf level="likely">Labels, not ones</Conf>
					</p>
					<p>
						The recorder also noted hair (black, brown or reddish-brown) wrapped
						into the ply or a knot on {hair.length} cords:{" "}
						{hair.map((c) => c.name).join(", ")}. Most are in the detail groups
						of section C; one is the seventh cord of the 1007 column. Hyland et
						al. (2025) used isotope analysis of hair in a khipu to study who
						made it. Similar work here could test whether the hair belongs to
						the people the cords count.{" "}
						<Conf level="open">Hair as signature</Conf>
					</p>
				</Prose>
			</Step>

			<Step n={7} title="What it records">
				<Prose>
					<p>
						{exact} equalities hold exactly and {near} are a single knot short.
						Hierarchies of sums are known: Urton and Brezine's seven Puruchuco
						khipus pass totals up three administrative levels across separate
						objects. Fixed per-unit values are known from Inkawasi, where the
						same figure recurs in every group of a ledger. Six-cord groups,
						proposed as households, structure the Santa valley khipus. What we
						have not seen described elsewhere is one khipu carrying all three
						levels of its own account, with the totals on visibly marked cords,
						and what may be quotas being filled.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							The whole ledger, threaded. Low fans: each lone total onto the
							cords it totals. Tall arcs: each summary cord onto a bracket over
							its detail group, section A read as tens. Section B's total is
							dotted because 6 × 200 is a reading of cut cords, and its six
							summary cords rise and stop: no sum onto its details was found.
							Diamonds mark the four figure-eight subsidiaries read as labels.
							The exact sums rest on the recorder's April 2026 re-examination,
							which revised about twenty values.
						</>
					}
				>
					<ThreadedSilhouette
						cords={silCords}
						colors={colors}
						threads={ledger}
						bands={ranges.map((r) => ({
							from: r.from,
							to: r.to,
							label: `Section ${r.key}`,
						}))}
						marks={labelMarks}
						silHeight={70}
						arcHeight={130}
						title="KH0699 with every checked sum drawn as a thread: three sections of the same three-tier shape, section B's details unmatched"
					/>
				</Wide>
				<Wide>
					<Layers
						heading="KH0699, read in layers"
						layers={explain(khipu, rowsC, total1006.value, exact, near)}
					/>
				</Wide>
				<Prose>
					<p>
						Our preferred reading: a quota account for six units, kept as
						deliveries came in. Section B sets 200 per unit and 1,200 in all;
						section A sets 84 per unit and 86 per detail group; section C
						records what six units actually produced, 1,006, listed largest
						first. Six units of eight to ten entries each, under a grand total
						within a handful of a thousand, is consistent with Inka decimal
						administration as Julien reconstructed it: an idealised figure set
						from above and apportioned downward, with a thousand households as a
						standard unit and its subdivisions counted in tens. A second reading
						is compatible: the 1007 column, opening with the same 204 and
						totalling within one of the 1006, could be a second count of the
						same six units a period later, with the seventh cord a unit added
						between counts.
					</p>
					<p>
						A caveat: the exact sums rest on the recorder's April 2026
						re-examination, which revised about twenty values, several in cords
						the sums depend on. The change log presents them as corrections
						after seeing the object again. In our judgement the consistency
						across three levels is hard to produce by sum-guided recounting, but
						until the object is photographed cord by cord the exact matches are
						not certain. <Conf level="open">Quota account near Lima</Conf>
					</p>
				</Prose>
			</Step>

			<Sources
				items={[
					{
						who: "Karen Thompson / Khipu Field Guide",
						what: "KH0699 (KT001), catalogue, drawings and workbook with change log",
						where:
							"khipufieldguide.com, recorded November 2024, re-examined April 2026",
						href: "https://www.khipufieldguide.com/catalog/KH0699.html",
					},
					{
						who: "Open Khipu Repository",
						what: "KH number assignments of 19 December 2025",
						where: "Zenodo 10.5281/zenodo.18025748",
						href: "https://doi.org/10.5281/zenodo.18025748",
					},
					{
						who: "Catherine Julien",
						what: "How Inca decimal administration worked",
						where: "Ethnohistory 35(3), 1988",
					},
					{
						who: "Gary Urton & Carrie Brezine",
						what: "Khipu accounting in ancient Peru",
						where: "Science 309, 2005 — the Puruchuco hierarchy",
					},
					{
						who: "Gary Urton & Alejandro Chu",
						what: "The invention of taxation in the Inka Empire",
						where:
							"Latin American Antiquity 30(1), 2019 — the Inkawasi fixed values",
					},
					{
						who: "Sabine Hyland et al.",
						what: "Stable isotope evidence for the participation of commoners in Inka khipu production",
						where: "Science Advances 11(33), 2025",
					},
					{
						who: "Viviana Moscovich",
						what: "El khipu como registro textil en el imperio inca: ¿herramienta de trabajo reutilizable o informe final?",
						where: "Iberoamérica Global 1(2), 2008",
					},
				]}
			/>
			<Legend
				items={[
					{ color: hexFor("W", colors), label: "W white", outline: true },
					{ color: hexFor("YB", colors), label: "YB light yellowish brown" },
					{ color: hexFor("EB", colors), label: "EB grayish yellowish brown" },
					{ color: hexFor("HB", colors), label: "HB grayish brown" },
					{ color: hexFor("BB", colors), label: "BB dark yellowish brown" },
					{ color: hexFor("RD", colors), label: "RD grayish reddish brown" },
				]}
			/>
		</StoryPage>
	);
}

function explain(
	khipu: Khipu,
	rowsC: SumRow[],
	grand: number,
	exact: number,
	near: number,
): Layer[] {
	return [
		{
			title: "Observed",
			body: (
				<>
					{khipu.stats.nPendants} pendants, {khipu.stats.nSubsidiaries}{" "}
					subsidiaries, {khipu.stats.nKnots} knots on an {khipu.primary.length}{" "}
					cm cotton primary cord cut at both ends; {khipu.stats.nGroups} groups
					by spacing, five of them a single cord. Recorded by one person, on two
					visits.
				</>
			),
			level: "firm",
		},
		{
			title: "Derived",
			body: (
				<>
					Three sections of one grammar, 29 groups = three tens less the one cut
					away. Lone cord {grand.toLocaleString()} = six sums{" "}
					{rowsC.map((r) => r.read).join(" + ")}; each sum = one detail group.
					504 = 6 × 84; 778 + 422 = 1,200 = 6 × 200; four groups of 86. {exact}{" "}
					exact equalities, {near} off by one. The opening cords read as tens,
					not hundreds.
				</>
			),
			level: "firm",
		},
		{
			title: "Context",
			body: "Provenance 'likely near Lima', nothing more. Puruchuco (Urton & Brezine 2005) shows sums passed between administrative levels; Inkawasi (Urton & Chu 2019) shows fixed per-unit values; Julien (1988) describes quotas set from above and apportioned in decimal units.",
			level: "likely",
		},
		{
			title: "Interpretation",
			body: "This project's reading, unreviewed: possibly a working quota account for six units, kept as deliveries came in, with assessments of 200 and 84 per unit, four groups of 86, actual production of 1,006 listed largest first, and a second count of 1,007. The units may be the ayllus or pachakas of a thousand-household district; the entries, their heads of tens.",
			level: "open",
		},
	];
}
