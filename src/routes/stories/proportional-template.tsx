import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import KhipuDiagram from "#/components/khipu/KhipuDiagram";
import KhipuSilhouette from "#/components/khipu/KhipuSilhouette";
import CordReader from "#/components/story/CordReader";
import {
	MagnitudeLadder,
	TemplateStrip,
} from "#/components/story/Kh0028Stages";
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
import { hexFor } from "#/lib/khipu/colors";
import { getColors, getKhipus, getSilhouettes } from "#/lib/khipu/data";
import type { GroupBox } from "#/lib/khipu/layout";
import type { Cord } from "#/lib/khipu/types";
import { sliceKhipu } from "#/lib/stories/derive";
import {
	attachTwistTally,
	byVerdict,
	CORPUS,
	cellStats,
	colourSeries,
	cordNamed,
	evenHalves,
	type FitCell,
	type FitRow,
	type FitVerdict,
	fitRows,
	fittingGroups,
	formCount,
	groupTotalWithSubs,
	halfPositions,
	inLowestTerms,
	joinGeometry,
	KHIPU_ID,
	knotSignature,
	knotTally,
	loneMagnitudes,
	lowPositionTest,
	nSequence,
	oddForms,
	oddHalfStats,
	PAIR_ID,
	pairGroups,
	pendantTotal,
	ratioPairs,
	ratioText,
	sharedColours,
	shuffleTest,
	singleKnotSubs,
	subsetSums,
	templateTotal,
	testedGroups,
	unreadableCounts,
	valueCount,
	withSubsRows,
} from "#/lib/stories/kh0028";
import "#/styles/stories/proportional-template.css";

export const Route = createFileRoute("/stories/proportional-template")({
	loader: async () => {
		const [khipus, colors, silhouettes] = await Promise.all([
			getKhipus([KHIPU_ID, PAIR_ID]),
			getColors(),
			getSilhouettes(),
		]);
		const sil = (id: string) => {
			const s = silhouettes[id];
			return s ? s.l.map((l, i) => ({ length: l, color: s.c[i] })) : [];
		};
		return {
			khipu: khipus[KHIPU_ID],
			pair: khipus[PAIR_ID],
			colors,
			sil: sil(KHIPU_ID),
			pairSil: sil(PAIR_ID),
		};
	},
	head: () => ({ meta: [{ title: "One shape at five scales — Khipu" }] }),
	component: ProportionalTemplate,
});

type OverviewLayer = "recorded" | "template" | "colour";

const OVERVIEW = { slot: 6, gap: 12, subOffset: 3, pxPerCm: 1.8, cordW: 1.6 };
const CLOSEUP = { slot: 14, gap: 26, subOffset: 5, pxPerCm: 4.5, cordW: 2.2 };
const CLOSEUP_G0 = { slot: 30, gap: 30, subOffset: 9, pxPerCm: 7, cordW: 3 };

const VERDICT_TEXT: Record<FitVerdict, string> = {
	exact: "exact",
	"exact with rounding": "exact, halves rounded down",
	"fits where readable": "fits where readable",
	"does not fit": "does not fit",
	"not tested": "not a nine- or ten-cord group",
};

/** Short forms for the strip figure's row labels. */
const STRIP_VERDICT: Record<FitVerdict, string> = {
	exact: "exact",
	"exact with rounding": "exact, rounded",
	"fits where readable": "fits where readable",
	"does not fit": "does not fit",
	"not tested": "not tested",
};

function verdictClass(v: FitVerdict) {
	return v === "does not fit" ? "no" : v === "not tested" ? "muted" : "ok";
}

function colourWord(code: string) {
	return code === "W" ? "white" : code === "B" ? "brown" : code;
}

function gLabel(r: { index: number; ascher: number | null }) {
	return r.ascher === null ? `G${r.index}` : `G${r.index} · Ascher ${r.ascher}`;
}

function list(xs: (string | number)[]) {
	return xs.join(", ");
}

/** A value cell: the number, a dash for a broken stub, tinted by its fit. */
function cellText(v: number | null) {
	return v === null ? "—" : String(v);
}

function cellClass(cell: FitCell | undefined, half: boolean) {
	const cls: string[] = ["num"];
	if (half) cls.push("half");
	if (!cell) return cls.join(" ");
	if (cell.cls === "broken") cls.push("broken");
	if (cell.cls === "mismatch") cls.push("miss");
	return cls.join(" ");
}

function ProportionalTemplate() {
	const { khipu, pair, colors, sil, pairSil } = Route.useLoaderData();
	const [layer, setLayer] = useState<OverviewLayer>("recorded");

	const rows = useMemo(() => fitRows(khipu), [khipu]);
	const tested = useMemo(() => testedGroups(rows), [rows]);
	const fitting = useMemo(() => fittingGroups(rows), [rows]);
	const exactRows = byVerdict(rows, "exact");
	const roundedRows = byVerdict(rows, "exact with rounding");
	const readableRows = byVerdict(rows, "fits where readable");
	const noFitRows = byVerdict(rows, "does not fit");
	const allCells = useMemo(() => cellStats(rows), [rows]);
	const halfCells = useMemo(() => cellStats(rows, true), [rows]);
	const even = useMemo(() => evenHalves(rows), [rows]);
	const unread = useMemo(() => unreadableCounts(khipu), [khipu]);
	const pTotal = useMemo(() => pendantTotal(khipu), [khipu]);
	const attach = useMemo(() => attachTwistTally(khipu), [khipu]);

	const tally = useMemo(
		() =>
			knotTally(
				rows,
				tested.map((r) => r.index),
			),
		[rows, tested],
	);
	const subsRows = useMemo(() => withSubsRows(khipu), [khipu]);
	const oddSubs = useMemo(() => oddHalfStats(subsRows), [subsRows]);
	const seriesG0 = useMemo(() => colourSeries(khipu, 0), [khipu]);
	const seriesG7 = useMemo(() => colourSeries(khipu, 7), [khipu]);
	const seriesG11 = useMemo(() => colourSeries(khipu, 11), [khipu]);
	const oneKnot = useMemo(() => singleKnotSubs(khipu), [khipu]);

	const seq = useMemo(() => nSequence(rows), [rows]);
	const twice = useMemo(() => ratioPairs(seq, 2), [seq]);
	const thrice = useMemo(() => ratioPairs(seq, 3), [seq]);
	const lone = useMemo(() => loneMagnitudes(seq), [seq]);
	/** "24/9 is 8/3, 9/8 is 9/8, 9/4 is 9/4": the lone magnitude against each other N */
	const loneRatios = useMemo(() => {
		const others = [...new Set(seq.map((x) => x.N))]
			.filter((n) => !lone.includes(n))
			.sort((x, y) => y - x);
		return lone
			.flatMap((L) =>
				others.map((n) =>
					n > L
						? `${n}/${L} is ${ratioText(n, L)}`
						: `${L}/${n} is ${ratioText(L, n)}`,
				),
			)
			.join(", ");
	}, [seq, lone]);
	const ladder = useMemo(
		() =>
			fitting
				.filter((r) => r.fit.N !== null)
				.map((r) => ({
					key: `g${r.index}`,
					label: gLabel(r),
					N: r.fit.N as number,
					total: templateTotal(r.fit.N as number, r.n),
					lone: lone.includes(r.fit.N as number),
				})),
		[fitting, lone],
	);
	/** complete ten-cord fitting groups whose N shares a factor with the others */
	const powerRows = useMemo(
		() =>
			fitting.filter(
				(r) =>
					r.n === 10 &&
					r.broken === 0 &&
					r.fit.N !== null &&
					!lone.includes(r.fit.N),
			),
		[fitting, lone],
	);
	const powerTotals = powerRows.map((r) => r.total);
	const powerRatio = inLowestTerms(powerTotals);

	const multi = useMemo(
		() =>
			rows
				.filter((r) => r.n > 1)
				.map((r) => ({ index: r.index, total: r.total })),
		[rows],
	);
	const multiWithSubs = useMemo(
		() =>
			rows
				.filter((r) => r.n > 1)
				.map((r) => ({
					index: r.index,
					total: groupTotalWithSubs(khipu, r.index),
				})),
		[rows, khipu],
	);
	const p11 = cordNamed(khipu, "p11");
	const p47 = cordNamed(khipu, "p47");
	const s31 = useMemo(() => subsetSums(multi, p11.value ?? 0), [multi, p11]);
	const s406 = useMemo(() => subsetSums(multi, p47.value ?? 0), [multi, p47]);
	const s31s = useMemo(
		() => subsetSums(multiWithSubs, p11.value ?? 0),
		[multiWithSubs, p11],
	);
	const s406s = useMemo(
		() => subsetSums(multiWithSubs, p47.value ?? 0),
		[multiWithSubs, p47],
	);

	const low10 = useMemo(() => lowPositionTest(rows, 10), [rows]);
	const low9 = useMemo(() => lowPositionTest(rows, 9), [rows]);
	const shuffle = useMemo(
		() => shuffleTest(rows, low10.agreeing.length),
		[rows, low10],
	);

	const pairRows = useMemo(() => pairGroups(pair), [pair]);
	const join = useMemo(() => joinGeometry(khipu, pair), [khipu, pair]);
	const palette = useMemo(() => sharedColours(khipu, pair), [khipu, pair]);

	const g = (i: number) => rows[i];
	const g0 = g(0);
	const g2 = g(2);
	const g3 = g(3);
	const g4 = g(4);
	const g5 = g(5);
	const g7 = g(7);
	const g12 = g(12);
	const g7miss = g7.fit.cells.filter((c) => c.cls === "mismatch");
	const g4stubs = g4.cords
		.filter((_, i) => g4.values[i] === null)
		.map((c) => c.length ?? 0);
	const g12blank = g12.cords.filter((_, i) => g12.values[i] === 0);

	const p1 = cordNamed(khipu, "p1");
	const p3 = cordNamed(khipu, "p3");
	const p66 = cordNamed(khipu, "p66");
	const p68 = cordNamed(khipu, "p68");
	const fourFour = formCount(tally, 8, "4L+4L");
	const eights = valueCount(tally, 8);
	const fourL = formCount(tally, 4, "4L");
	const fours = valueCount(tally, 4);
	const oddFours = oddForms(tally, 4, "4L");
	const nines = valueCount(tally, 9);
	const nineL = formCount(tally, 9, "9L");
	const elsewhere = CORPUS.knotForms.eightElsewhere;

	/** cord name → its template cell, for painting the overview */
	const cellOf = useMemo(() => {
		const m = new Map<string, { row: FitRow; cell: FitCell }>();
		for (const r of tested)
			r.cords.forEach((c, i) => {
				m.set(c.name, { row: r, cell: r.fit.cells[i] });
			});
		return m;
	}, [tested]);

	const paint = (c: Cord): string | null => {
		if (layer !== "template" || c.level > 1) return null;
		const hit = cellOf.get(c.name);
		if (!hit) return null;
		if (hit.cell.cls === "mismatch") return "var(--moiety-r)";
		if (hit.cell.half) return "var(--accent)";
		return null;
	};
	const groupBand = (gb: GroupBox): string | null => {
		const r = rows[gb.index];
		if (!r) return null;
		if (layer === "colour") return r.colour === "W" ? null : "var(--band-b)";
		if (layer === "template")
			return fitting.some((f) => f.index === gb.index) ? "var(--band-b)" : null;
		return null;
	};
	const groupLabel = (gb: GroupBox): string | null => {
		const r = rows[gb.index];
		if (!r) return null;
		if (layer === "colour") return r.n > 1 ? colourWord(r.colour) : null;
		if (layer === "template") {
			if (r.n === 1) return String(r.values[0]);
			if (fitting.some((f) => f.index === gb.index)) return `N ${r.fit.N}`;
			return null;
		}
		return null;
	};

	const closeup = useMemo(
		() => sliceKhipu(khipu, (c) => [9, 10, 11].includes(c.group ?? -1)),
		[khipu],
	);
	const closeupG0 = useMemo(
		() => sliceKhipu(khipu, (c) => [0].includes(c.group ?? -1)),
		[khipu],
	);
	const closeupPaint = (c: Cord): string | null => {
		if (c.level > 1) return null;
		const hit = cellOf.get(c.name);
		return hit?.cell.half ? "var(--accent)" : null;
	};

	const stripRows = tested.map((r) => ({
		key: `g${r.index}`,
		label: gLabel(r),
		sub: `${colourWord(r.colour)} · ${r.n} cords · ${STRIP_VERDICT[r.fit.verdict]}`,
		n: r.n,
		N: r.fit.N ?? 1,
		cells: r.fit.cells,
		right: `N = ${r.fit.N}`,
		rightSub: `Σ ${r.total}${r.broken ? ` + ${r.broken} lost` : ""}`,
	}));
	const seriesStrip = [
		...seriesG0.map((s) => ({ gi: 0, s })),
		...seriesG7.map((s) => ({ gi: 7, s })),
		...seriesG11.filter((s) => s.colour === "W").map((s) => ({ gi: 11, s })),
	]
		.filter(({ s }) => s.fit.N !== null && (s.fit.N as number) >= 2)
		.map(({ gi, s }) => ({
			key: `g${gi}-${s.colour}`,
			label: `${gLabel(rows[gi])} · ${s.colour}`,
			sub: `under ${s.present} of ${rows[gi].n} pendants · ${STRIP_VERDICT[s.fit.verdict]}`,
			n: rows[gi].n,
			N: s.fit.N as number,
			cells: s.fit.cells,
			right: `N = ${s.fit.N}`,
			rightSub: `pendants N = ${rows[gi].fit.N}`,
		}));

	const g0wgg = seriesG0.find((s) => s.colour === "W:GG");
	const g0b = seriesG0.find((s) => s.colour === "B");
	const g7w = seriesG7.find((s) => s.colour === "W");
	const g11w = seriesG11.find((s) => s.colour === "W");
	const subsG7 = subsRows[7];
	const subsG9 = subsRows[9];

	const cols = Array.from({ length: 10 }, (_, i) => i + 1);
	const halves10 = halfPositions(10);

	return (
		<StoryPage
			kicker="Philadelphia"
			title="One shape at five scales"
			standfirst={
				<>
					A khipu of unknown origin in the Penn Museum has seven cord groups
					with the same pattern at different sizes: one value, with half of it
					at the third, ninth and tenth positions. Marcia and Robert Ascher
					described it in 1978. Recomputed cord by cord, the pattern holds more
					strictly than they reported in places and less in others, some
					subsidiary series repeat it, and our scan found no other published
					khipu with a proportional pair of groups of four cords or more.
				</>
			}
			meta={
				<>
					<span>
						Object:{" "}
						<Link to="/khipus/$id" params={{ id: khipu.id }}>
							{khipu.aliases[0]} · {khipu.id}
						</Link>
						, tied to{" "}
						<Link to="/khipus/$id" params={{ id: pair.id }}>
							{pair.aliases[0]} · {pair.id}
						</Link>
					</span>
					<span>
						{khipu.museum.name}, {khipu.museum.city}, accession{" "}
						{khipu.museum.number}
					</span>
					<span>Recorded by {khipu.contributors}</span>
				</>
			}
		>
			<Step n={1} title="Two khipus, one accession">
				<Prose>
					<p>
						Accession {khipu.museum.number} at the Penn Museum is two khipus
						tied together. The Aschers, who recorded both, report the main cords
						knotted 1.0 cm from the twisted end of the smaller and 15.0 cm from
						that of the larger. The recorded cord positions agree: on {pair.id}{" "}
						the second pendant is at {join.pairP2} cm and the third at{" "}
						{join.pairP3} cm, either side of the knot; on {khipu.id} the first
						pendant is at {join.mainFirstPendant} cm, just past the join.
						Neither has a provenance, region or date.{" "}
						<Conf level="firm">Join as recorded</Conf>
					</p>
					<p>
						The larger, {khipu.id}, is the subject here. Its primary cord is{" "}
						{khipu.primary.length} cm long, plied {khipu.primary.color} (white
						with grayish green and brownish black), and carries{" "}
						{khipu.stats.nCords} cords: {khipu.stats.nPendants} pendants in{" "}
						{khipu.groups.length} groups by spacing, and{" "}
						{khipu.stats.nSubsidiaries} subsidiaries, some hanging from
						subsidiaries. There are {khipu.stats.nKnots} knots. The largest
						value is {khipu.stats.maxValue}; all cords total{" "}
						{khipu.stats.totalValue.toLocaleString()}, the pendants{" "}
						{pTotal.toLocaleString()}. {unread.pendants} pendants and{" "}
						{unread.subsidiaries} subsidiaries are knotless broken stubs; the
						databook records them as 0, and this page treats them as unknown.
						Attachment and twist were not recorded: all {attach[0]?.count} cords
						are entered as U, U.
					</p>
					<p>
						The smaller, {pair.id}, has a {pair.primary.length} cm primary cord
						with {pair.stats.nPendants} pendants in {pair.groups.length} groups
						of {list(pairRows.map((r) => r.n))}, plus {pair.stats.nSubsidiaries}{" "}
						subsidiaries; all its cords sum to {pair.stats.totalValue}. Its
						first group holds its two largest values,{" "}
						{list(pairRows[0].values.map((v) => v ?? "—"))}. In the other five
						the first cord carries{" "}
						{list(
							pairRows
								.slice(1)
								.map((r) => (r.first === null ? "a broken cord" : r.first)),
						)}{" "}
						and nothing after it exceeds{" "}
						{Math.max(...pairRows.slice(1).map((r) => r.restMax ?? 0))}, as the
						Aschers noted. It does not show the pattern of the larger khipu and
						is left aside after this step.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							{khipu.id} above, {pair.id} below, as silhouettes: pendant lengths
							and recorded colours along each primary cord. The two share{" "}
							{palette.shared.length} colour codes ({list(palette.shared)});{" "}
							{khipu.id} alone has {list(palette.onlyA)} and {pair.id} alone{" "}
							{list(palette.onlyB)}.
						</>
					}
				>
					<div className="pt-sil">
						<KhipuSilhouette
							cords={sil}
							colors={colors}
							width={900}
							height={120}
						/>
					</div>
					<div className="pt-sil" style={{ marginTop: "0.5rem" }}>
						<KhipuSilhouette
							cords={pairSil}
							colors={colors}
							width={900}
							height={70}
						/>
					</div>
				</Wide>
			</Step>

			<Step n={2} title="Thirteen rows">
				<Prose>
					<p>
						The table below has one row per recorder group and one column per
						position. The Aschers counted eleven groups and two single pendants;
						the recorder's spacing gives thirteen groups including the singles,
						so both numberings are shown. Singles aside, group colour runs{" "}
						{list(rows.filter((r) => r.n > 1).map((r) => colourWord(r.colour)))}
						: white for the Aschers' first two groups, brown for the next three,
						then brown and white by turns, as they noted. The two lone cords,{" "}
						{p11.value} before the second group and {p47.value} before the
						sixth, are white.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Pendant values (databook decimal readings) by group and position.
							A dash is a knotless broken stub, value unknown. The half-position
							columns are tinted.
						</>
					}
				>
					<div className="ledger pt-matrix">
						<table className="ledger-table">
							<thead>
								<tr>
									<th>Group</th>
									<th>Colour</th>
									<th className="num">Cords</th>
									{cols.map((p) => (
										<th
											key={p}
											className={`num ${halves10.includes(p) ? "half" : ""}`}
										>
											{p}
										</th>
									))}
									<th className="num">Σ</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((r) => (
									<tr key={r.index}>
										<td className="group">
											G{r.index}
											{r.ascher !== null && <span>Ascher {r.ascher}</span>}
										</td>
										<td>
											<i
												className="swatch"
												style={{ background: hexFor(r.colour, colors) }}
											/>
											{r.colour}
										</td>
										<td className="num">{r.n}</td>
										{cols.map((p) => {
											const v = r.values[p - 1];
											const cell = r.fit.cells[p - 1];
											const half = halfPositions(r.n).includes(p);
											return (
												<td key={p} className={cellClass(cell, half)}>
													{p <= r.n ? cellText(v) : ""}
												</td>
											);
										})}
										<td className="num">
											{r.total}
											{r.broken > 0 && (
												<span className="muted"> +{r.broken} lost</span>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Wide>
				<Prose>
					<p>
						The Template layer shows the fitting groups, the half positions, and
						the values that break the ratio.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							The whole khipu, {khipu.stats.nCords} cords. Template: fitting
							groups shaded, their half-position cords in blue, the values that
							break the ratio in orange, N and the two lone values labelled.
							Colour: brown groups shaded.
						</>
					}
				>
					<LayerTabs
						value={layer}
						onChange={setLayer}
						options={[
							{ value: "recorded", label: "As recorded" },
							{ value: "template", label: "Template" },
							{ value: "colour", label: "Colour" },
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
					{layer === "template" && (
						<Legend
							items={[
								{ color: "var(--accent)", label: "half position (N/2)" },
								{
									color: "var(--moiety-r)",
									label: "value that breaks the ratio",
								},
								{ color: "var(--band-b)", label: "group fitting the template" },
							]}
						/>
					)}
				</Wide>
			</Step>

			<Step n={3} title="One shape, five magnitudes">
				<Prose>
					<p>
						The Aschers describe a group as reading N, N, N/2, N, N, N, N, N,
						N/2, N/2, with one of the five middle N positions absent in
						nine-cord groups. Tested as a template against every nine- or
						ten-cord group, with N the most common readable value at the seven N
						positions: of {tested.length} groups, {exactRows.length} fit at
						every position (N = {list(exactRows.map((r) => r.fit.N ?? 0))}),{" "}
						{roundedRows.length} fits once 9/2 is written as{" "}
						{roundedRows[0]?.fit.cells[2].value} (G
						{roundedRows[0]?.index}, N = {roundedRows[0]?.fit.N}), and{" "}
						{readableRows.length} fits at every readable position with{" "}
						{readableRows[0]?.broken} of its cords broken off (G
						{readableRows[0]?.index}, N = {readableRows[0]?.fit.N}). That is{" "}
						{fitting.length} groups and {fitting.reduce((a, r) => a + r.n, 0)}{" "}
						pendants: {allCells.exact} cells exact, {allCells.down} rounded
						down, {allCells.up === 0 ? "none" : allCells.up} rounded up,{" "}
						{allCells.broken} unreadable, none wrong.{" "}
						<Conf level="firm">Template fit, pendants only</Conf>
					</p>
					<p>
						Where N is even, the half is exact in {even.exact} of {even.total}{" "}
						cells. The only inexact halves are the three in G
						{roundedRows[0]?.index}, where N is {roundedRows[0]?.fit.N} and all
						three read {roundedRows[0]?.fit.cells[2].value}, rounded down.
						Across the {fitting.length} fitting groups the half positions hold{" "}
						{halfCells.exact} exact values, {halfCells.down} rounded down and{" "}
						{halfCells.up === 0 ? "none" : halfCells.up} rounded up.
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Every nine- or ten-cord group drawn to its own N: bar height is
							the value divided by N, so a full bar is N and a half bar is N/2.
							Half positions in blue. A dashed outline is a broken cord drawn at
							the height the template expects; an orange rule marks where a
							value should have been.
						</>
					}
				>
					<TemplateStrip
						rows={stripRows}
						title="Nine- and ten-cord groups of KH0028 against the halving template"
					/>
				</Wide>
				<Wide
					caption={
						<>
							Three fitting groups in a row, G9, G10 and G11 (N ={" "}
							{list([g(9), g(10), g(11)].map((r) => r.fit.N ?? 0))}), drawn
							larger with their subsidiaries. Half-position pendants in blue.
							Each group's N is half the one before.
						</>
					}
				>
					<KhipuDiagram
						khipu={closeup}
						colors={colors}
						layout={CLOSEUP}
						style="physical"
						paint={closeupPaint}
						showGroups
						showValues
						tooltip={false}
						fit
					/>
				</Wide>
				<Prose>
					<p>
						A half can be knotted in more than one way. In G0, 24 is two single
						knots (tens) over a four-turn long knot, and 12 is one single knot
						over a two-turn long knot: each cluster halved. Where N is 8 there
						is no eight-turn long knot: all {eights} pendants worth 8 in the
						tested groups are two four-turn long knots, and {fourL} of the{" "}
						{fours} worth 4 are one four-turn knot; the exception is{" "}
						{oddFours.map((c) => `${c.name} (${knotSignature(c)})`).join(", ")}.
						The Aschers called this the distributive axiom: 8 written as 4 + 4,
						so its half is one of the two. Elsewhere in the corpus 4 + 4 is
						rare: {elsewhere.asFourFour} of {elsewhere.total} pendants worth 8
						on other khipus (
						{((100 * elsewhere.asFourFour) / elsewhere.total).toFixed(1)} per
						cent), against {fourFour} of {eights} here. Where N is 9 the cord is
						a nine-turn long knot in {nineL} of {nines} cases and its half a
						four-turn one. <Conf level="firm">Knot forms</Conf>
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Four pendants read knot by knot: {p1.name} and {p3.name} from G0
							(N = {g0.fit.N}), {p66.name} and {p68.name} from G9 (N ={" "}
							{g(9).fit.N}). Knots are drawn where the recorder measured them.
						</>
					}
				>
					<div className="figures">
						{[p1, p3, p66, p68].map((c) => (
							<div className="figure" key={c.name}>
								<figcaption>
									<h3>
										{c.name} · {c.value} · {knotSignature(c)}
									</h3>
								</figcaption>
								<CordReader
									cord={c}
									colors={colors}
									pxPerCm={4}
									title={`${c.name}, ${c.value}, knotted ${knotSignature(c)}`}
								/>
							</div>
						))}
					</div>
				</Wide>
			</Step>

			<Step n={4} title="Where the reading stops">
				<Prose>
					<p>
						Two nine- or ten-cord groups fail. G{g7.index} (Ascher {g7.ascher})
						reads {list(g7.values.map(cellText))}: its low cords are in the
						template's places, but position {g7miss[0]?.pos} holds{" "}
						{g7miss[0]?.value} where N = {g7.fit.N} is expected, and the last
						two hold {g7miss[1]?.value}, a quarter of 8, not a half: the shape
						without the ratio. G{g12.index} (Ascher {g12.ascher}) reads{" "}
						{list(g12.values.map(cellText))}: the third and ninth cords are
						complete, knotted-end cords{" "}
						{g12blank.map((c) => c.length).join(" and ")} cm long with no knots,
						blanks rather than breaks, and the rest share no value. The Aschers
						listed eight groups as related by halving; the Khipu Field Guide's
						note says every group but 3 and 5. On the pendants alone, counted
						strictly, it is {fitting.length}.{" "}
						<Conf level="firm">
							G{g7.index} and G{g12.index} outside the ratio
						</Conf>
					</p>
				</Prose>
				<Wide
					caption={
						<>
							The groups the reading does not accept, as recorded. A dotted chip
							is a broken stub; the N shown for the two tested groups is the
							most common value at their N positions.
						</>
					}
				>
					<div className="ledger">
						<table className="ledger-table">
							<thead>
								<tr>
									<th>Group</th>
									<th className="num">Cords</th>
									<th>Pendants, as recorded</th>
									<th className="num">N</th>
									<th>Template</th>
								</tr>
							</thead>
							<tbody>
								{[...noFitRows, g3, g5].map((r) => (
									<tr key={r.index}>
										<td>{gLabel(r)}</td>
										<td className="num">{r.n}</td>
										<td>
											<span className="chips">
												{r.cords.map((c) => (
													<Chip key={c.name} cord={c} colors={colors} />
												))}
											</span>
										</td>
										<td className="num">{r.fit.N ?? "—"}</td>
										<td className={verdictClass(r.fit.verdict)}>
											{VERDICT_TEXT[r.fit.verdict]}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Wide>
				<Prose>
					<p>
						Two groups are the wrong size to test. G{g3.index} carries the only
						hundreds on the khipu, {list(g3.values.map(cellText))}: three of its
						eight cords survive to a value near 110, and the third, 12, is low
						where the template has a half but is far from half. G{g5.index}{" "}
						reads {list(g5.values.map(cellText))} with three of seven broken. G
						{g4.index} fits, but on {g4.fit.counts.exact} cells; its {g4.broken}{" "}
						middle cords are stubs of {Math.min(...g4stubs)} to{" "}
						{Math.max(...g4stubs)} cm, so the fit is consistent rather than
						proven.
					</p>
					<p>
						The two lone cords carry {p11.value} and {p47.value}. Neither is a
						meaningful sum of group totals. No choice among the eleven
						multi-cord groups' pendant totals sums to {p11.value} ({s31.hits} of{" "}
						{s31.subsets.toLocaleString()} subsets); {s406.hits} of them sum to{" "}
						{p47.value}, for instance G{s406.example?.[0]} and G
						{s406.example?.[1]} ({rows[s406.example?.[0] ?? 0].total} +{" "}
						{rows[s406.example?.[1] ?? 0].total}), but the same subsets reach{" "}
						{s406.reachable} of the integers from 1 to {s406.limit}, so a match
						is expected by chance. With subsidiaries added the counts are{" "}
						{s31s.hits} and {s406s.hits}. What the two cords record is open.{" "}
						<Conf level="open">The lone cords</Conf>
					</p>
				</Prose>
			</Step>

			<Step n={5} title="Underneath the pendants">
				<Prose>
					<p>
						{khipu.stats.nSubsidiaries} subsidiaries hang from the pendants,
						most of them tiny. {oneKnot.total} carry exactly one knot of one:{" "}
						{oneKnot.eight} a figure-eight, {oneKnot.singleAsOne} a single knot
						the databook reads as 1, and {oneKnot.singleAsTen.length} (
						{list(oneKnot.singleAsTen.map((c) => c.name))}) a single knot the
						databook places as 10. The Aschers read all such cords as 1, and
						that rule is used here. They then added each pendant's subsidiaries
						to it and reported that the pattern "remains the same" with more
						inconsistencies. Recomputed, it changes more than that: with
						subsidiaries added, G{subsG7.index} becomes{" "}
						{list(subsG7.values.map(cellText))} and G{subsG9.index} becomes{" "}
						{list(subsG9.values.map(cellText))}, and over all the odd-N groups
						the half positions round down {oddSubs.down} times, up {oddSubs.up}{" "}
						times, are broken {oddSubs.broken} times and fall outside rounding{" "}
						{oddSubs.mismatch} times. The pendant-only reading fits better.
					</p>
					<p>
						Summing hides that some subsidiary series fit the template on their
						own. Each of the ten pendants of G0 has a subsidiary plied white and
						grayish green, and those ten read{" "}
						{list(
							(g0wgg?.values ?? []).map((v) =>
								v === "absent" ? "·" : cellText(v),
							),
						)}
						: the template with N = {g0wgg?.fit.N}, exact at all ten positions.
						The brown subsidiaries of the same group read{" "}
						{list(
							(g0b?.values ?? []).map((v) =>
								v === "absent" ? "·" : cellText(v),
							),
						)}{" "}
						(a dot where a pendant has none), exact at every readable position.
						In G7, whose pendants break the ratio, the white subsidiaries read{" "}
						{list(
							(g7w?.values ?? []).map((v) =>
								v === "absent" ? "·" : cellText(v),
							),
						)}
						: N = {g7w?.fit.N}, exact at all {g7w?.fit.counts.exact} present
						positions, halved where the pendants above them are not. The
						Aschers' databook note gives only pendant-plus-subsidiary sums; the
						series by colour is not in it.{" "}
						<Conf level="firm">Subsidiary series</Conf>{" "}
						<Conf level="open">Why the second series is there</Conf>
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Subsidiary series with N of 2 or more, one colour at a time,
							against the template. A dot is a pendant with no subsidiary of
							that colour; a dashed outline is a broken one. G11's white
							subsidiaries are included as the series that does not fit (
							{g11w?.fit.counts.exact} of {g11w?.values.length} positions).
						</>
					}
				>
					<TemplateStrip
						rows={seriesStrip}
						title="Subsidiary series of KH0028 by colour, fitted to the halving template"
					/>
				</Wide>
				<Wide
					caption={
						<>
							G0 with its subsidiaries: pendants of {g0.fit.N} and{" "}
							{(g0.fit.N ?? 0) / 2}, a white-and-green subsidiary of{" "}
							{g0wgg?.fit.N} or {(g0wgg?.fit.N ?? 0) / 2} under each, and a
							brown one under most. Half-position pendants in blue; values as
							built.
						</>
					}
				>
					<KhipuDiagram
						khipu={closeupG0}
						colors={colors}
						layout={CLOSEUP_G0}
						style="physical"
						paint={closeupPaint}
						showGroups
						showValues
						tooltip={false}
					/>
				</Wide>
			</Step>

			<Step n={6} title="The magnitudes, the shape, and the corpus">
				<Prose>
					<p>
						In cord order the magnitudes of the fitting groups are{" "}
						{list(seq.map((s) => s.N))}, not a regular series. {thrice.length}{" "}
						pairs stand at three to one (
						{thrice.map(([a, b]) => `G${a}:G${b}`).join(", ")}), {twice.length}{" "}
						at two to one, and {lone.length === 1 ? "one value" : "some values"}{" "}
						({list(lone)}) {lone.length === 1 ? "is" : "are"} in no whole ratio
						with any other: {loneRatios}. A complete ten-cord group totals 7N +
						3⌊N/2⌋, so the four complete groups whose N share a factor total{" "}
						{list(powerTotals)}, which is {powerRatio.join(" : ")} exactly. G2's{" "}
						{g2.total} sits outside that. What N counts (a rate, a share, a
						quota) is not recoverable from the object: there are no label cords,
						no provenance, and no recorded attachment or twist.{" "}
						<Conf level="firm">Ratios</Conf>{" "}
						<Conf level="open">What N measures</Conf>
					</p>
				</Prose>
				<Wide caption="N of each fitting group, in cord order, with the total a complete group of that N would carry. The one magnitude in no whole ratio with the others is in orange.">
					<MagnitudeLadder
						items={ladder}
						title="Magnitudes of the fitting groups of KH0028"
					/>
				</Wide>
				<Prose>
					<p>
						The positional shape is more consistent than the arithmetic. There
						are {low10.tested.length} complete ten-cord groups (no broken cord),
						and all {low10.agreeing.length} have their three smallest values at
						positions {low10.want.join(", ")}, G12 included; the two complete
						nine-cord groups, G7 and G8, have theirs at {low9.want.join(", ")}.
						If six groups of ten values were arranged independently, the chance
						that all six agree on one set of three low positions is (1/120)
						<sup>{low10.tested.length - 1}</sup>, about{" "}
						{low10.chance.toExponential(1)}. Shuffling the six groups' own
						values {shuffle.trials.toLocaleString()} times with a fixed seed,
						the most that ever agreed was {shuffle.max}
						{shuffle.histogram[shuffle.max]
							? ` (${shuffle.histogram[shuffle.max].toLocaleString()} ${shuffle.histogram[shuffle.max] === 1 ? "trial" : "trials"})`
							: ""}
						;{" "}
						{shuffle.atLeastObserved === 0
							? "none"
							: shuffle.atLeastObserved.toLocaleString()}{" "}
						reached {low10.agreeing.length}.{" "}
						<Conf level="firm">Low positions shared</Conf>
					</p>
					<p>
						Our corpus scan: across the {CORPUS.khipus} khipus with published
						cords, take every recorder group of {CORPUS.minGroup} or more fully
						readable pendants, set aside groups whose values are all equal or
						hold one number among blanks (trivially proportional), divide the
						rest by their first value, and look for groups on one khipu that
						share a vector at different scales. Only this khipu has such a pair:
						all {CORPUS.proportionalPairs} proportional pairs found are among
						its groups. The same holds at minimum group sizes{" "}
						{list(CORPUS.pairStableAtSizes)}; at three cords one other khipu,{" "}
						{CORPUS.pairAtSize3.id}, has a single pair (
						{list(CORPUS.pairAtSize3.groups[0])} beside{" "}
						{list(CORPUS.pairAtSize3.groups[1])}), and with three or more groups
						required {khipu.id} is alone at sizes {list(CORPUS.stableAtSizes)}.
						The complete nine- and ten-cord groups anywhere in the corpus that
						fit the template with rounding number {CORPUS.templateGroups}, all
						on {khipu.id}. Khipus with three or more groups repeating one vector
						at the same scale do exist (at minimum group size{" "}
						{CORPUS.sameScaleMinGroup}: {list(CORPUS.sameScaleKhipus)}), but
						that is repetition, not proportion.{" "}
						<Conf level="firm">No other case in the corpus</Conf>
					</p>
					<p>
						The bare shape, three low cords at fixed positions in nine- or
						ten-cord groups, does recur. {CORPUS.positional.length} khipus have
						three or more complete groups whose three lowest cords share one
						position triple, led by {CORPUS.positional[0].id} (
						{CORPUS.positional[0].alias}, from {CORPUS.positional[0].where})
						with {CORPUS.positional[0].groups} nine-cord groups low at positions{" "}
						{CORPUS.positional[0].triple.join(", ")}, the same triple as this
						khipu's nine-cord groups. Its values are in the hundreds with no
						common multiple, not one value halved. The shape recurs elsewhere;
						the ratio scheme was not found elsewhere.{" "}
						<Conf level="likely">Shape relatives</Conf>
					</p>
				</Prose>
			</Step>

			<Step n={7} title="What is read and what is not">
				<Prose>
					<p>
						Established: {fitting.length} groups on one template at magnitudes{" "}
						{list(seq.map((s) => s.N))}, with every even half exact and every
						odd half rounded down; 8 always written 4 + 4; the same template on
						the subsidiaries of G0 at N = {g0wgg?.fit.N} and of G7 at N ={" "}
						{g7w?.fit.N}; low positions shared by every complete group,
						including the one that fails the ratio; and no proportional pair of
						groups of four cords or more found on any other published khipu. The
						Khipu Field Guide's transcription of the Aschers' N list gives one
						group as N = 5 with N/2 = 4, which contradicts the same note's N = 8
						for that group; the recorded cords of Ascher group 4 (G4) are{" "}
						{list(g4.values.map(cellText))}, so it is most likely a
						transcription error for 8.
					</p>
				</Prose>
				<Wide>
					<Layers
						heading={`${khipu.id}, read in layers`}
						layers={explain({
							khipu,
							pair,
							fitting,
							seq,
							allCells,
							powerRatio,
							unread,
						})}
					/>
				</Wide>
				<Prose>
					<p>
						Not established: what N stands for, and so what the khipu is for.
						There is no find-spot and no date. The two lone white cords,{" "}
						{p11.value} and {p47.value}, match no combination of group totals
						beyond chance. G{g7.index} has the template's low positions but a{" "}
						{g7miss[0]?.value} where 8 belongs and two quarters where halves
						belong, and the Aschers' rescue of it with subsidiaries (N = 14, N/2
						= 5) needs one 4 to be ignored. G{g12.index} keeps the low positions
						as blanks and no ratio. G{g3.index}, in the hundreds, and G
						{g5.index}, seven cords with three broken, are outside the scheme.
						Why the magnitudes run {list(seq.map((s) => s.N))}, a 9 among
						multiples of 2 and 3 in no monotone order, is open. {pair.id}, tied
						to this khipu's main cord, does not show the template; the KFG
						bibliography cites Urton on tied census khipus for it, but those
						pages were not consulted, and its relation to this khipu is unknown.{" "}
						<Conf level="open">Purpose, the lone cords, the pair</Conf>
					</p>
					<p>
						For a khipu whose sums close, see{" "}
						<Link to="/stories/twin-falls">the Twin Falls ledger</Link>; for a
						tied pair that restate one another, see{" "}
						<Link to="/stories/tied-twice">Tied twice</Link>.
					</p>
				</Prose>
			</Step>

			<Sources
				items={[
					{
						who: "Marcia Ascher & Robert Ascher (1978), as transcribed by the Khipu Field Guide",
						what: "Code of the Quipu: Databook, notes for AS26B — the join, the colours, the halving pattern, the knot forms, the readings with subsidiaries",
						where:
							"Khipu Field Guide catalogue page KH0028, with the KFG's own fieldmark note",
						href: "https://www.khipufieldguide.com/catalog/KH0028.html",
					},
					{
						who: "Marcia Ascher & Robert Ascher (1978), as transcribed by the Khipu Field Guide",
						what: "Code of the Quipu: Databook, notes for AS26A — join geometry, group sizes, value ranges, colour comparison",
						where: "Khipu Field Guide catalogue page KH0027",
						href: "https://www.khipufieldguide.com/catalog/KH0027.html",
					},
					{
						who: "Marcia Ascher & Robert Ascher (1981)",
						what: "Code of the Quipu: A Study in Media, Mathematics, and Culture, pp. 136–138",
						where: "cited in the KFG bibliography for KH0028; not consulted",
					},
					{
						who: "Gary Urton (2006)",
						what: "Censos registrados en cordeles con 'amarres', Revista Andina 42, pp. 164–165, 170–171",
						where: "cited in the KFG bibliography for KH0027; not consulted",
					},
					{
						who: "Gary Urton (2017)",
						what: "Inka History in Knots, pp. 189 and 263",
						where:
							"cited in the KFG bibliography for both khipus; not consulted",
					},
					{
						who: "Khipu Field Guide databook",
						what: "cord-level data for KH0028 and KH0027",
						where:
							"public/data/khipus/KH0028.json and KH0027.json, built from the KFG spreadsheets",
					},
					{
						who: "This site",
						what: "Reproducible analysis: template fit, subsidiary series, low-position shuffle, corpus screens",
						where: "scripts/kh0028_analysis.py",
					},
				]}
			/>
			<Legend
				items={[
					{ color: hexFor("W", colors), label: "W white", outline: true },
					{ color: hexFor("B", colors), label: "B moderate yellowish brown" },
					{ color: hexFor("GG", colors), label: "GG grayish green" },
					{ color: hexFor("KB", colors), label: "KB dark brown" },
					{ color: hexFor("FB", colors), label: "FB brownish black" },
				]}
			/>
		</StoryPage>
	);
}

function explain({
	khipu,
	pair,
	fitting,
	seq,
	allCells,
	powerRatio,
	unread,
}: {
	khipu: {
		id: string;
		stats: { nPendants: number; nSubsidiaries: number; nKnots: number };
		primary: { length: number | null };
		groups: unknown[];
	};
	pair: { id: string };
	fitting: FitRow[];
	seq: { index: number; N: number }[];
	allCells: { exact: number; down: number; broken: number };
	powerRatio: number[];
	unread: { pendants: number; subsidiaries: number };
}): Layer[] {
	return [
		{
			title: "Observed",
			body: (
				<>
					{khipu.stats.nPendants} pendants in {khipu.groups.length} groups and{" "}
					{khipu.stats.nSubsidiaries} subsidiaries on an {khipu.primary.length}{" "}
					cm primary cord, {khipu.stats.nKnots} knots, tied main cord to main
					cord to {pair.id}. {unread.pendants} pendants and{" "}
					{unread.subsidiaries} subsidiaries broken to knotless stubs.
					Attachment and twist unrecorded. Recorded once, by the Aschers.
				</>
			),
			level: "firm",
		},
		{
			title: "Derived",
			body: (
				<>
					{fitting.length} groups read N, N, N/2, N, N, N, N, N, N/2, N/2 at N ={" "}
					{seq.map((s) => s.N).join(", ")}: {allCells.exact} cells exact,{" "}
					{allCells.down} rounded down, {allCells.broken} broken, none wrong. 8
					is always 4 + 4. Template totals of the four complete groups whose N
					share a factor stand at {powerRatio.join(" : ")}. Subsidiary series on
					G0 and G7 fit the template. Every complete ten-cord group has its
					three lowest cords at the half positions. Our scan found no other
					khipu with a proportional pair of groups of four cords or more.
				</>
			),
			level: "firm",
		},
		{
			title: "Context",
			body: `No provenance, region or date. The Aschers (1978, 1981) published the halving pattern; the KFG bibliography cites Urton (2006, 2017, not consulted) for ${pair.id} among tied census khipus. The low-position shape recurs on an Incahuasi accounting khipu, UR278, where the values are not related by ratio.`,
			level: "likely",
		},
		{
			title: "Interpretation",
			body: "One reading: a record made to a fixed proportional scheme rather than accumulated, with ten slots, three at half weight, filled at magnitudes set group by group, and a smaller second series on some subsidiaries. Whether N is a quota, a rate or a share, and how the two lone cords and the tied khipu relate, cannot be recovered from the object.",
			level: "open",
		},
	];
}
