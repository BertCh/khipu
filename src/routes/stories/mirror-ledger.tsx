import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import KhipuDiagram from "#/components/khipu/KhipuDiagram";
import KhipuSilhouette from "#/components/khipu/KhipuSilhouette";
import { SlotGrid } from "#/components/story/Kh0081Stages";
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
import { hexFor, nameFor } from "#/lib/khipu/colors";
import { getColors, getKhipus, getSilhouettes } from "#/lib/khipu/data";
import type { GroupBox } from "#/lib/khipu/layout";
import type { ColorTable, Cord, Khipu } from "#/lib/khipu/types";
import { sliceKhipu } from "#/lib/stories/derive";
import {
	AS47_POSITION_6,
	ASCHERS_RATIO,
	ASCHERS_TABLE_1,
	altSources,
	aschersRatios,
	type Baseline,
	colourCensus,
	columnBaseline,
	columnMatches,
	columnThreads,
	cordNamed,
	cordState,
	firstValues,
	fiveSum,
	groupSizes,
	groupsOpeningWith,
	groupTotals,
	KFG_CATALOG,
	kfgSums,
	MIRROR_LEDGER_ID,
	type OpeningRow,
	openingRows,
	PARTS,
	pairCompare,
	partCords,
	partRanges,
	partShape,
	placePositions,
	runSumBaselines,
	SHUFFLE_SEED,
	sharedBetweenParts,
	slotFates,
	slotIndex,
	slotRows,
	summaryCordMatches,
	summaryGroupPairs,
	summaryVsDetail,
	tierOf,
	type Verdict,
	wDifferences,
	wLargest,
} from "#/lib/stories/kh0081";
import "#/styles/stories/mirror-ledger.css";

export const Route = createFileRoute("/stories/mirror-ledger")({
	loader: async () => {
		const [khipus, colors, silhouettes] = await Promise.all([
			getKhipus([MIRROR_LEDGER_ID]),
			getColors(),
			getSilhouettes(),
		]);
		const s = silhouettes[MIRROR_LEDGER_ID];
		return {
			khipu: khipus[MIRROR_LEDGER_ID],
			colors,
			sil: s ? s.l.map((l, i) => ({ length: l, color: s.c[i] })) : [],
		};
	},
	head: () => ({ meta: [{ title: "One form, kept twice — Khipu" }] }),
	component: MirrorLedger,
});

type OverviewLayer = "recorded" | "tiers" | "parts";

const OVERVIEW = { slot: 5, gap: 10, subOffset: 3, pxPerCm: 1.5, cordW: 1.4 };
const SLICE = { slot: 12, gap: 16, subOffset: 4, pxPerCm: 2.6, cordW: 2.2 };
const SHUFFLES = 1000;
const [A, B] = PARTS;

/** Column heads for the part-shape table: opening, five summary, marker, ten detail. */
const SHAPE_HEADS = [
	"open",
	...[1, 2, 3, 4, 5].map((i) => `s${i}`),
	"p40",
	...Array.from({ length: 10 }, (_, i) => `d${i + 1}`),
];

const VERDICT_TEXT: Record<Verdict, string> = {
	exact: "exact",
	near: "near",
	no: "no",
	blank: "blank",
	none: "no cord",
};

function verdictClass(v: Verdict) {
	return v === "exact" ? "ok" : v === "no" ? "no" : "muted";
}

function fmt(n: number, d = 2) {
	return n.toFixed(d);
}

/** How much of a cord survives, in words. */
function stateText(c: Cord): string {
	const s = cordState(c);
	if (s.state === "stub") return `stub, ${c.length} cm`;
	if (s.state === "broken") return `broken at ${c.length} cm`;
	return `complete, ${c.length} cm`;
}

/** A column as its summands: chips, then the sum. */
function ColumnSum({
	row,
	colors,
	reading,
}: {
	row: OpeningRow;
	colors: ColorTable;
	reading: (c: Cord) => number;
}) {
	return (
		<span className="chips" style={{ gap: "0.15rem" }}>
			{row.column.cords.map((c, i) => (
				<span key={c.name} className="chips" style={{ gap: "0.15rem" }}>
					{i > 0 && <span className="muted">+</span>}
					<Chip cord={{ ...c, value: reading(c) }} colors={colors} />
				</span>
			))}
			<span className="muted">=</span>
			<strong>{row.column.sum}</strong>
		</span>
	);
}

function BaselineRows({ items }: { items: Baseline[] }) {
	return (
		<>
			{items.map((b) => (
				<tr key={b.label}>
					<td>{b.label}</td>
					<td className="num">{b.observed}</td>
					<td className="num">
						{fmt(b.mean, b.mean < 0.1 ? 3 : 2)} ±{" "}
						{fmt(b.sd, b.sd < 0.1 ? 3 : 2)}
					</td>
					<td className="num">{b.max}</td>
					<td className={`num ${Math.abs(b.z) < 2 ? "muted" : ""}`}>
						{b.z > 0 ? "+" : ""}
						{fmt(b.z)}
					</td>
					<td className="num">
						{b.atLeast} / {b.shuffles}
					</td>
				</tr>
			))}
		</>
	);
}

function MirrorLedger() {
	const { khipu, colors, sil } = Route.useLoaderData();
	const [layer, setLayer] = useState<OverviewLayer>("recorded");
	const sizes = useMemo(() => groupSizes(khipu), [khipu]);
	const silCords = useMemo(() => silhouetteOf(khipu), [khipu]);
	const colThreads = useMemo(() => columnThreads(khipu), [khipu]);
	const parts = useMemo(() => partRanges(khipu), [khipu]);
	const openings = useMemo(() => groupsOpeningWith(khipu, 5000), [khipu]);
	const shapes = useMemo(
		() => PARTS.map((p) => ({ key: p.key, sizes: partShape(khipu, p) })),
		[khipu],
	);
	const cordsA = useMemo(() => partCords(khipu, A), [khipu]);
	const cordsB = useMemo(() => partCords(khipu, B), [khipu]);
	const rowsA = useMemo(() => slotRows(khipu, A), [khipu]);
	const rowsB = useMemo(() => slotRows(khipu, B), [khipu]);
	const slotOf = useMemo(() => slotIndex(khipu), [khipu]);
	const openA = useMemo(() => openingRows(khipu, A), [khipu]);
	const openB = useMemo(() => openingRows(khipu, B), [khipu]);
	const openAU = useMemo(() => openingRows(khipu, A, "urton"), [khipu]);
	const openBU = useMemo(() => openingRows(khipu, B, "urton"), [khipu]);
	const openBAs = useMemo(() => openingRows(khipu, B, "ascher"), [khipu]);
	const matches = useMemo(() => columnMatches(khipu), [khipu]);
	const matchesU = useMemo(() => columnMatches(khipu, "urton"), [khipu]);
	const svdA = useMemo(() => summaryVsDetail(khipu, A), [khipu]);
	const svdB = useMemo(() => summaryVsDetail(khipu, B), [khipu]);
	const pairsA = useMemo(() => summaryGroupPairs(khipu, A), [khipu]);
	const cordMatches = useMemo(() => summaryCordMatches(khipu), [khipu]);
	const ratiosA = useMemo(() => aschersRatios(khipu, A), [khipu]);
	const ratiosB = useMemo(() => aschersRatios(khipu, B), [khipu]);
	const totals = useMemo(() => groupTotals(khipu), [khipu]);
	const compare = useMemo(
		() => [0, 1, 2].map((s) => pairCompare(khipu, s)),
		[khipu],
	);
	const wd = useMemo(() => wDifferences(khipu), [khipu]);
	const shared = useMemo(() => sharedBetweenParts(khipu), [khipu]);
	const largest = useMemo(() => wLargest(khipu), [khipu]);
	const places = useMemo(() => placePositions(khipu), [khipu]);
	const alts = useMemo(() => altSources(khipu), [khipu]);
	const kfg = useMemo(() => kfgSums(khipu), [khipu]);
	const cbDetail = useMemo(() => slotFates(khipu, B, "detail", 5), [khipu]);
	const cbSummary = useMemo(() => slotFates(khipu, B, "summary", 5), [khipu]);
	const slice = useMemo(
		() =>
			sliceKhipu(
				khipu,
				(c) =>
					c.group !== undefined && [A.opening, ...A.summary].includes(c.group),
			),
		[khipu],
	);

	// the shuffles take about half a second; run them after first paint
	const [chance, setChance] = useState<{
		runs: ReturnType<typeof runSumBaselines>;
		column: Baseline;
	} | null>(null);
	useEffect(() => {
		const id = window.setTimeout(() => {
			setChance({
				runs: runSumBaselines(khipu, SHUFFLES),
				column: columnBaseline(khipu, SHUFFLES),
			});
		}, 50);
		return () => window.clearTimeout(id);
	}, [khipu]);

	const p1 = cordNamed(khipu, "p1");
	const p40 = cordsA.marker[0];
	const p17 = cordMatches.matches[0];
	const openingSizes = openings.map((gi) => sizes[gi]);
	const firsts = firstValues(khipu);
	const firstSummaryA = A.summary.map((gi) => firsts[gi]);
	const firstSummaryB = B.summary.map((gi) => firsts[gi]);
	const firstDetailA = A.detail.map((gi) => firsts[gi]);
	const firstDetailB = B.detail.map((gi) => firsts[gi]);
	const startsA = [A.opening, ...A.summary, ...A.detail].map(
		(gi) => khipu.groups[gi].start,
	);
	const startsB = [B.opening, ...B.summary, ...B.detail].map(
		(gi) => khipu.groups[gi].start,
	);
	const gapFrom = khipu.groups[B.summary[4]];
	const gapTo = khipu.groups[B.detail[0]];
	const shortGroups = [...rowsA, ...rowsB].filter((r) => r.missing.length > 0);
	// the three the Aschers flagged by a space: g2, g3 and g31 (0-based 1, 2, 30)
	const aschersSpaced = new Set([1, 2, 30]);
	const otherShort = shortGroups.filter((r) => !aschersSpaced.has(r.gi));
	const otherShortSix = otherShort.filter(
		(r) => r.missing.length === 1 && r.missing[0] === 5,
	);
	const otherShortRest = otherShort.filter((r) => !otherShortSix.includes(r));
	const fullRows = [...rowsA, ...rowsB].filter((r) => r.missing.length === 0);
	const fullGroups = fullRows.length;
	const fullOnTemplate = fullRows.filter(
		(r) => r.offTemplate.length === 0,
	).length;
	const otherSizes = sizes.filter(
		(_, gi) => !openings.includes(gi) && gi !== A.marker,
	);
	const shapePairs = shapes[0].sizes
		.map((n, i) => [n, shapes[1].sizes[i]] as const)
		.filter(([a, b]) => a !== null && b !== null);
	const shapeCompared = shapePairs.length;
	const shapeAgree = shapePairs.filter(([a, b]) => a === b).length;
	const templateColours = new Set([...A.template, ...B.template]).size;
	const offTemplate = [...rowsA, ...rowsB].flatMap((r) => r.offTemplate);
	const wA = openA[0];
	const mbA = openA[1];
	const mbB = openB[1];
	const wB = openB[0];
	const ybB = openB[6];
	const p131 = cordNamed(khipu, "p131");
	const p136 = cordNamed(khipu, "p136");
	const p117 = cordNamed(khipu, "p117");
	const p141 = cordNamed(khipu, "p141");
	const p6 = cordNamed(khipu, "p6");
	const p7 = cordNamed(khipu, "p7");
	const p4 = cordNamed(khipu, "p4");
	const p113 = cordNamed(khipu, "p113");
	const p125 = cordNamed(khipu, "p125");
	const p128 = cordNamed(khipu, "p128");
	const nineA = fiveSum(khipu, A, 4, "first");
	const nineB = fiveSum(khipu, B, 3, "last");
	const as47Sum = AS47_POSITION_6.reduce((a, b) => a + b, 0);
	const attachR = khipu.cords.filter(
		(c) => c.kind === "pendant" && c.attach === "R",
	).length;
	const twistZ = khipu.cords.filter(
		(c) => c.kind === "pendant" && c.twist === "Z",
	).length;
	const knotDirs = new Set(
		khipu.cords.flatMap((c) => c.knots.map((k) => k.dir)),
	);
	const sub = khipu.cords.find((c) => c.kind === "subsidiary");
	const meanRatioA = ratiosA.reduce((a, r) => a + r.ratio, 0) / ratiosA.length;
	const anyGlobal = chance?.runs.any[0];
	const anyTier = chance?.runs.any[1];
	const colGlobal = chance?.runs.coloured[0];
	const colTier = chance?.runs.coloured[2];

	const paint = (c: Cord): string | null => {
		if (layer !== "tiers" || c.level > 1) return null;
		const t = tierOf(c.group ?? -1);
		if (t === "opening") return "var(--accent)";
		if (t === "summary") return "var(--moiety-r)";
		return null;
	};
	const groupBand = (g: GroupBox): string | null => {
		if (layer === "parts")
			return g.index >= B.opening ? "var(--band-b)" : "var(--band-a)";
		if (layer === "tiers")
			return tierOf(g.index) === "detail" ? "var(--band-b)" : null;
		return null;
	};
	const groupLabel = (g: GroupBox): string | null => {
		if (layer !== "parts") return null;
		if (g.index === A.opening) return "Part A";
		if (g.index === B.opening) return "Part B";
		return null;
	};
	const ring = (c: Cord): string | null => {
		const s = slotOf.get(c.name);
		if (s === 0) return "var(--accent)";
		if (s === 1) return "var(--moiety-r)";
		return null;
	};

	return (
		<StoryPage
			kicker="Cacatilla, Nazca valley"
			title="One form, kept twice"
			standfirst={
				<>
					A khipu from a Nazca-valley burial, recorded by the Aschers in the
					1970s and later by Gary Urton, is built as two parts of one design: an
					opening group of thousands, five groups of hundreds, ten groups of
					tens, all on the same seven colour slots. Three opening cords equal
					the column sums of the groups that follow, a fourth does on Urton's
					reading of one knot, and the rest are of the right size but match no
					sum we found. The Aschers described the structure in 1978. This page
					adds a test against chance and an account of what has been lost since.
				</>
			}
			meta={
				<>
					<span>
						Object:{" "}
						<Link to="/khipus/$id" params={{ id: khipu.id }}>
							{khipu.aliases.join(" · ")} · {khipu.id}
						</Link>
					</span>
					<span>
						{khipu.museum.canonical}, {khipu.museum.city}, no.{" "}
						{khipu.museum.number} (the Aschers' no. 3882)
					</span>
					<span>
						Recorded by Marcia and Robert Ascher (AS68) and Gary Urton (UR281);
						merged by the Khipu Field Guide, 2025
					</span>
				</>
			}
		>
			<Step n={1} title="An object recorded twice">
				<Prose>
					<p>
						The khipu is held in Lima under museum number {khipu.museum.number}.
						Its listed provenance is {khipu.provenance}; the Open Khipu
						Repository's note adds that it came from a burial, and that the
						tassel at the start of the primary cord is yellow. No date is
						recorded. The primary cord is {khipu.primary.length} cm of cotton,
						tasselled at the beginning and knotted at the end, and carries{" "}
						{khipu.stats.nPendants} pendants and {khipu.stats.nSubsidiaries}{" "}
						subsidiary in {khipu.stats.nGroups} groups by spacing, with{" "}
						{khipu.stats.nKnots} knots: {khipu.stats.knotTypes.S} single,{" "}
						{khipu.stats.knotTypes.L} long, {khipu.stats.knotTypes.E}{" "}
						figure-eight. Every knot is tied {[...knotDirs].join("/")}.{" "}
						{attachR} of the {khipu.stats.nPendants} pendants are attached recto
						and {twistZ} are Z-plied; the one exception, {p128.name}, has
						neither recorded. The values total{" "}
						{khipu.stats.totalValue.toLocaleString()}; the largest cord reads{" "}
						{khipu.stats.maxValue}. <Conf level="firm">Recorded structure</Conf>
					</p>
					<p>
						Marcia and Robert Ascher published it in 1978 as AS68, with a full
						cord table and ten observations, under a museum number they say it
						shared with another khipu, AS47. Gary Urton later recorded it as
						UR281 for what became the Open Khipu Repository. In 2025 the Khipu
						Field Guide merged the two: values and colours mostly follow the
						Aschers, one cord ({p40.name}, {p40.color}, {p40.value}) is Urton's
						alone, one ({p128.name}, {p128.color}, {p128.value}) the Aschers'
						alone, and where the two disagree the file keeps one alternative
						reading on {alts.total} cords: {alts.urton.length} of them Urton's,{" "}
						{alts.ascher.length} the Aschers' (
						{alts.ascher.map((c) => c.name).join(", ")}), and one (
						{alts.unknown.map((c) => c.name).join(", ")}) matching neither as
						published. {alts.byOne.length} of the {alts.total} differ by exactly
						one, which on these cords is one turn of a long knot. Each balance
						below states whose reading it rests on.{" "}
						<Conf level="firm">Two recordings, one file</Conf>
					</p>
				</Prose>
				<Wide caption="KH0081 as a silhouette: pendant lengths and recorded colours along the primary cord, the six stubs of part B's lost slot among them.">
					<div className="ml-sil">
						<KhipuSilhouette
							cords={sil}
							colors={colors}
							width={900}
							height={120}
						/>
					</div>
				</Wide>
			</Step>

			<Step n={2} title="Two parts, three tiers">
				<Prose>
					<p>
						Group sizes: {sizes.slice(0, B.opening).join(" ")} |{" "}
						{sizes.slice(B.opening).join(" ")}. The only two cords of five
						thousand or more open groups{" "}
						{openings.map((gi) => gi + 1).join(" and ")} (
						{openings.map((gi) => firsts[gi]).join(" and ")}
						). After each come five groups whose first cords are in the hundreds
						({firstSummaryA.join(", ")}; {firstSummaryB.join(", ")}) and then
						ten whose first cords are in the tens ({firstDetailA.join(", ")};{" "}
						{firstDetailB.join(", ")}). The two opening groups have{" "}
						{openingSizes.join(" and ")} cords; the rest have between{" "}
						{Math.min(...otherSizes)} and {Math.max(...otherSizes)} cords, and
						one is a single cord.
					</p>
					<p>
						The Aschers said this in 1978: the quipu is in two parts, each of
						three sections, "section A is 1 group; section B is the next 5
						groups; and section C is the last 10 groups". They counted sixteen
						groups a part. The seventeenth of part A is {p40.name}, a single{" "}
						{p40.color} cord reading {p40.value} that Urton recorded at{" "}
						{p40.pos} cm, in the 2 cm space the Aschers noted after their sixth
						group; they did not record it. Part A's groups start between{" "}
						{startsA[0]} and {startsA[startsA.length - 1]} cm and part B's
						between {startsB[0]} and {startsB[startsB.length - 1]} cm. The{" "}
						{gapTo.start - gapFrom.start} cm between the starts of groups{" "}
						{B.summary[4] + 1} and {B.detail[0] + 1} is the Aschers' "then space
						of 11.5 cm" after their twenty-second group, between part B's
						summary and detail tiers.{" "}
						<Conf level="firm">Two parts of 1 + 5 + 10 groups</Conf>
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Group sizes by template position. Of the {shapeCompared} positions
							where both parts have a group, {shapeAgree} agree; every
							difference is a single cord. Part B has no counterpart to Urton's
							singleton.
						</>
					}
				>
					<div className="ledger">
						<table className="ledger-table">
							<thead>
								<tr>
									<th />
									{SHAPE_HEADS.map((h) => (
										<th key={h} className="num">
											{h}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{shapes.map((row) => (
									<tr key={row.key}>
										<th>Part {row.key}</th>
										{row.sizes.map((n, i) => {
											const other = shapes.find((o) => o.key !== row.key)
												?.sizes[i];
											const cls =
												n === null
													? "muted"
													: other === n
														? "ok"
														: other === null
															? "muted"
															: "no";
											return (
												<td key={SHAPE_HEADS[i]} className={`num ${cls}`}>
													{n === null ? "—" : n}
												</td>
											);
										})}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Wide>
				<Wide
					caption={
						<>
							The whole khipu, cords drawn to their recorded lengths. Tiers:
							opening groups in blue, summary groups in orange, detail groups
							shaded. Parts as bands. Cord positions along the primary are the
							recorder's group starts, not measured cord by cord.
						</>
					}
				>
					<LayerTabs
						value={layer}
						onChange={setLayer}
						options={[
							{ value: "recorded", label: "As recorded" },
							{ value: "tiers", label: "Tiers" },
							{ value: "parts", label: "Parts" },
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
					{layer === "tiers" && (
						<Legend
							items={[
								{ color: "var(--accent)", label: "opening group" },
								{ color: "var(--moiety-r)", label: "summary groups" },
								{ color: "var(--band-b)", label: "detail groups" },
							]}
						/>
					)}
				</Wide>
			</Step>

			<Step n={3} title="One form in seven slots">
				<Prose>
					<p>
						{fullOnTemplate} of the {fullGroups} seven-cord groups run the same
						sequence of colours. In part A's ten detail groups the census is{" "}
						{colourCensus(cordsA.detail)
							.map(([k, n]) => `${k} ${n}`)
							.join(", ")}
						: one white, one moderate brown, two mottled light-yellowish and
						dark-greyish brown, two light yellowish brown and one greyish olive
						per group, in the order {A.template.join(", ")}. Part B's detail
						groups run {B.template.join(", ")} (
						{colourCensus(cordsB.detail)
							.map(([k, n]) => `${k} ${n}`)
							.join(", ")}
						): the fourth slot is bluish grey instead of a second mottled cord,
						and the sixth is dark greyish brown instead of greyish olive. The
						Aschers' Observation 5 gives the same seven positions.
					</p>
					<p>
						Assign each cord to the first template slot, at or after the
						previous cord's, that has its colour; a cord of a colour not in the
						template takes the next slot. Under that rule {shortGroups.length}{" "}
						groups are short of a cord:{" "}
						{shortGroups
							.map(
								(r) =>
									`g${r.gi + 1} lacks slot${r.missing.length > 1 ? "s" : ""} ${r.missing.map((s) => s + 1).join(" and ")}`,
							)
							.join("; ")}
						. The Aschers' first three observations record spaces between their
						pendants 10 and 11, 11 and 12, 15 and 16, and 197 and 198: the
						second, third and thirty-first groups here, missing the slots the
						colours predict. The other {otherShort.length} short groups are all
						in part B's opening and summary tiers: {otherShortSix.length} lack
						the sixth slot and{" "}
						{otherShortRest
							.map(
								(r) =>
									`g${r.gi + 1} slot ${r.missing.map((s) => s + 1).join(" and ")}`,
							)
							.join(", ")}
						; the Aschers recorded no space in any of them, and their
						Observation 5 has position 6 "CB or omitted" and position 4 LA "with
						one exception" there, so those cords were probably never tied. Three
						cords are of a colour their slot does not call for (
						{offTemplate.map((c) => `${c.name} ${c.color}`).join(", ")}), all
						dark greyish brown, all in part A, where the template has a mottled
						or a greyish-olive cord.{" "}
						<Conf level="likely">Seven slots; the assignment is a rule</Conf>
					</p>
					<p>
						Values fall steeply from the first cord of a group. The white cord
						is the largest of its group in {largest.opening.yes} of{" "}
						{largest.opening.of} opening groups, {largest.summary.yes} of{" "}
						{largest.summary.of} summary groups and {largest.detail.yes} of{" "}
						{largest.detail.of} detail groups; the exceptions are{" "}
						{[...largest.summary.exceptions, ...largest.detail.exceptions]
							.map(
								(e) =>
									`g${e.gi + 1}, where ${e.largest.name} (${e.largest.color}) reads ${e.largest.value}`,
							)
							.join(", and ")}
						.
					</p>
				</Prose>
				<Wide caption="The slot matrix of each part: one row per group, one column per colour slot, each cell in the cord's recorded colour with its value. A dashed cell is a missing cord; a cell outlined in orange is a cord of an off-template colour; a notched corner is a broken cord; a dot is a stub under 1 cm. Read down a column to see the tiers: thousands, hundreds, tens.">
					<div className="ml-panels">
						{[
							{ part: A, rows: rowsA },
							{ part: B, rows: rowsB },
						].map(({ part, rows }) => (
							<figure key={part.key} className="ml-panel">
								<figcaption>Part {part.key}</figcaption>
								<SlotGrid
									rows={rows}
									template={part.template}
									colors={colors}
									title={`Part ${part.key} of KH0081 as a slot matrix`}
								/>
							</figure>
						))}
					</div>
				</Wide>
			</Step>

			<Step n={4} title="The columns that add up">
				<Prose>
					<p>
						Part A's first column: the opening white cord, {p1.name}, reads{" "}
						{p1.value}; the five white cords that open the summary groups read{" "}
						{wA.column.cords.map((c) => c.value).join(", ")}, which sum to{" "}
						{wA.column.sum}. In the second column the opening moderate-brown
						cord reads {mbA.value} and the five summary moderate-brown cords{" "}
						{mbA.column.cords.map((c) => c.value).join(" + ")} ={" "}
						{mbA.column.sum}. Both recorders agree on all twelve cords. In part
						B the moderate-brown column balances too: {mbB.opening?.name} reads{" "}
						{mbB.value} and its five summary cords{" "}
						{mbB.column.cords.map((c) => c.value).join(" + ")} ={" "}
						{mbB.column.sum}. One of those, {p131.name} ({p131.value}), was{" "}
						{p131.length} cm long with three knot clusters when the Aschers
						recorded it; Urton found a 6.5 cm stub with no knots, so this
						balance rests on the earlier recording. The Field Guide lists all
						three as coloured pendant sums.{" "}
						<Conf level="firm">Three exact columns</Conf>
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Each opening cord with a value, threaded to the five summary cords
							of its colour slot. Solid: the column balances. Dashed: off by one
							or two ({ybB.opening?.name} is exact on Urton's reading of{" "}
							{p141.name}; {wB.opening?.name} is not exact on any reading). Grey
							stubs: the{" "}
							{matches.tested - matches.exact.length - matches.near.length}{" "}
							columns that do not balance. {matches.exact.length} of{" "}
							{matches.tested} balance as recorded; with the summary values
							permuted within each part, the count averages{" "}
							{chance ? fmt(chance.column.mean, 2) : "…"} and reaches{" "}
							{matches.exact.length} in {chance?.column.atLeast ?? "…"} of{" "}
							{chance?.column.shuffles ?? SHUFFLES} shuffles (Step 6). No thread
							joins part A to part B: the halves share a form, not values.
						</>
					}
				>
					<ThreadedSilhouette
						cords={silCords}
						colors={colors}
						threads={colThreads}
						bands={parts.map((r) => ({
							from: r.from,
							to: r.to,
							label: `Part ${r.key}`,
						}))}
						silHeight={60}
						arcHeight={80}
						title="KH0081 with each opening cord threaded to its colour column in the summary groups: three exact, two near, the rest not balancing"
						legendText={{ near: "off by one or two", stub: "does not balance" }}
					/>
				</Wide>
				<Prose>
					<p>
						Part B's white column is not exact. {wB.opening?.name} reads{" "}
						{wB.value}; the five summary white cords{" "}
						{wB.column.cords.map((c) => c.value).join(" + ")} = {wB.column.sum},{" "}
						{Math.abs(wB.diff)} short. With Urton's reading of {p136.name} (
						{p136.altValue} for {p136.value}, one turn on the long knot) the
						column is {openBU[0].column.sum}, {Math.abs(openBU[0].diff)} short.
						The Aschers printed the column as 4521 and did not claim a sum; they
						had read {p117.name} as {p117.altValue}, without the thousands knot
						at {p117.knots[0].pos} cm that Urton recorded, and with that reading
						the column is {openBAs[0].column.sum}. The near-balance exists only
						in the merged record, and is off by one or two across five cords
						whose units are long knots.{" "}
						<Conf level="likely">A near miss in the merged record</Conf>
					</p>
					<p>
						The last slot of part B's opening is a fourth case.{" "}
						{ybB.opening?.name} reads {ybB.value}; the five summary cords in the
						seventh slot, {ybB.column.cords.map((c) => c.value).join(" + ")},
						sum to {ybB.column.sum} as recorded. The Aschers' Table 1 prints 686
						over 685 and lets it stand. One of the five, {p141.name}, is read{" "}
						{p141.value} in the file from a {p141.knots[1].n}-turn long knot at{" "}
						{p141.knots[1].pos} cm; Urton counted{" "}
						{(p141.altValue ?? 0) - (p141.value ?? 0)} turn more and read{" "}
						{p141.altValue}, and with his reading the column is{" "}
						{openBU[6].column.sum}: exact. One-turn disagreements on long knots
						are the commonest difference between the two recordings, and the
						record cannot say which count is right; the balance is the only
						evidence, and it favours Urton's count.{" "}
						<Conf level="likely">A fourth column, on Urton's reading</Conf>
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Each opening cord against the same colour slot summed over the
							five summary groups, as recorded and with Urton's readings where
							the file keeps them (the Aschers' four alternatives are not
							applied). The last column is the Aschers' own Table 1 (Databook I,
							p. 396), transcribed: their section-A value over their sum of
							section B.
						</>
					}
				>
					<div className="ledger ml-tall">
						<table className="ledger-table">
							<thead>
								<tr>
									<th>Part</th>
									<th className="num">Slot</th>
									<th>Opening cord</th>
									<th>State</th>
									<th>Summary column, as recorded</th>
									<th className="num">Diff.</th>
									<th className="num">With Urton's readings</th>
									<th>Check</th>
									<th>Aschers 1978</th>
								</tr>
							</thead>
							<tbody>
								{[
									{ part: A, rows: openA, urton: openAU },
									{ part: B, rows: openB, urton: openBU },
								].flatMap(({ part, rows, urton }) =>
									rows.map((r, i) => {
										const u = urton[i];
										const best =
											r.verdict === "exact" ? r : u.verdict === "exact" ? u : r;
										return (
											<tr key={`${part.key}${r.slot}`}>
												<td>{part.key}</td>
												<td className="num">
													{r.slot + 1} <span className="muted">{r.colour}</span>
												</td>
												<td>
													{r.opening ? (
														<>
															<Chip cord={r.opening} colors={colors} />{" "}
															<span className="muted">{r.opening.name}</span>
														</>
													) : (
														<span className="muted">none</span>
													)}
												</td>
												<td className="muted">
													{r.opening ? stateText(r.opening) : "—"}
												</td>
												<td className="ml-wrap">
													<ColumnSum
														row={r}
														colors={colors}
														reading={(c) => c.value ?? 0}
													/>{" "}
													<span className="muted">
														({r.column.nGroups} of {r.column.ofGroups} groups)
													</span>
												</td>
												<td className="num">
													{r.verdict === "none" || r.verdict === "blank"
														? "—"
														: r.diff > 0
															? `+${r.diff}`
															: r.diff}
												</td>
												<td className="num">
													{u.column.sum === r.column.sum ? (
														<span className="muted">same</span>
													) : (
														<>
															{u.column.sum}{" "}
															{r.verdict !== "none" &&
																r.verdict !== "blank" && (
																	<span className="muted">
																		({u.diff > 0 ? `+${u.diff}` : u.diff})
																	</span>
																)}
														</>
													)}
												</td>
												<td className={verdictClass(best.verdict)}>
													{VERDICT_TEXT[best.verdict]}
													{best !== r && (
														<span className="muted"> with Urton's reading</span>
													)}
													{r.verdict === "near" && best === r && (
														<span className="muted">
															{" "}
															({Math.abs(r.diff)} off)
														</span>
													)}
												</td>
												<td className="muted">
													{ASCHERS_TABLE_1[part.key].opening[r.slot]} /{" "}
													{ASCHERS_TABLE_1[part.key].sums[r.slot]}
												</td>
											</tr>
										);
									}),
								)}
							</tbody>
						</table>
					</div>
				</Wide>
				<Wide caption="Part A's opening group and its five summary groups, drawn to their recorded lengths with values. The white cords of slot 1 are ringed in blue and the moderate-brown cords of slot 2 in orange: the opening cord of each colour is the sum of the five below it.">
					<KhipuDiagram
						khipu={slice}
						colors={colors}
						layout={SLICE}
						style="physical"
						ring={ring}
						showValues
						showGroups
						fit
					/>
					<Legend
						items={[
							{
								color: "var(--accent)",
								label: `slot 1, W: ${wA.column.nGroups} cords = ${wA.opening?.name}`,
							},
							{
								color: "var(--moiety-r)",
								label: `slot 2, MB: ${mbA.column.nGroups} cords = ${mbA.opening?.name}`,
							},
						]}
					/>
				</Wide>
			</Step>

			<Step n={5} title="The columns that do not">
				<Prose>
					<p>
						The middle opening cords are of the same order as their columns but
						do not equal them. In part A, {openA[2].opening?.name} reads{" "}
						{openA[2].value} (the Aschers read it as 2002 with a query; Urton as
						2200) against a column of {openA[2].column.sum}; {p4.name} is broken
						at {p4.length} cm below a tens cluster at{" "}
						{p4.knots[p4.knots.length - 1].pos} cm, so its {p4.value} has lost
						its units, and its column has only {openA[3].column.nGroups} cords
						summing to {openA[3].column.sum}; {openA[4].opening?.name} reads{" "}
						{openA[4].value} against {openA[4].column.sum}, {openA[4].diff}{" "}
						over. The sixth and seventh opening cords are blank: {p6.name} is
						broken at {p6.length} cm and {p7.name} is complete at {p7.length} cm
						with no knots, while their columns are {openA[5].column.sum} and{" "}
						{openA[6].column.sum}. On this khipu the thousands and hundreds
						clusters sit about {fmt(places.mean[1000], 0)} and{" "}
						{fmt(places.mean[100], 0)} cm from the attachment (the mean over the{" "}
						{places.cords.length} complete four-place cords) and the tens about{" "}
						{fmt(places.mean[10], 0)} cm, so a value like {openA[5].column.sum}{" "}
						would have left knots on the {p6.length} cm of {p6.name} that
						survive, so {p6.name} read under a hundred, if anything. Part A's
						opening probably did not total its last two slots.{" "}
						<Conf level="likely">Two blank slots</Conf>
					</p>
					<p>
						Part B is the same shape. {p113.name} carries two single knots at{" "}
						{p113.knots[0].pos} cm and is broken at {p113.length} cm, so it read
						between 2000 and 2999; its column is {openB[2].column.sum} as
						recorded, {openBU[2].column.sum} with Urton's {p125.name} (
						{p125.altValue} for {p125.value}). {openB[3].opening?.name} reads{" "}
						{openB[3].value} against {openB[3].column.sum} from the{" "}
						{openB[3].column.nGroups} summary groups that have a bluish-grey
						cord; {openB[4].opening?.name} reads {openB[4].value} against{" "}
						{openB[4].column.sum}, {Math.abs(openB[4].diff)} under. A search in
						the analysis script over every group, tier, colour and slot total
						and every run of three or more consecutive cords, under both
						readings, finds nothing equal to any of these six cords except
						cross-tier coincidences of the kind the next step shows to be
						expected. The Aschers described them as "the order of magnitude of
						the sums", and we find nothing more.{" "}
						<Conf level="firm">Six opening cords unread</Conf>
					</p>
					<p>
						The summary tier is not a total of the detail tier. By slot, the
						five summary cords sum to between{" "}
						{fmt(Math.min(...svdA.map((s) => s.ratio ?? 0)), 1)} and{" "}
						{fmt(Math.max(...svdA.map((s) => s.ratio ?? 0)), 1)} times the ten
						detail cords in part A and{" "}
						{fmt(Math.min(...svdB.map((s) => s.ratio ?? 0)), 1)} to{" "}
						{fmt(Math.max(...svdB.map((s) => s.ratio ?? 0)), 1)} times in part
						B; no summary group equals the two detail groups in its rank (
						{pairsA
							.map((p) => `${p.total} against ${p.detailTotal}`)
							.join(", ")}{" "}
						in part A). Of the {cordMatches.tested} summary cords, exactly one
						equals the detail column of its slot:{" "}
						{p17 ? (
							<>
								{p17.cord.name} ({p17.cord.color}, {p17.cord.value}) is the sum
								of the ten greyish-olive cords of part A,{" "}
								{p17.column.cords.map((c) => c.value).join(" + ")}
							</>
						) : (
							"none"
						)}
						. The Aschers found it (Observation 7c). Their 7(d), a ratio of{" "}
						{ASCHERS_RATIO} between the summary column and the last five detail
						groups for the first three slots of Part I, reproduces as{" "}
						{ratiosA.map((r) => fmt(r.ratio)).join(", ")} (mean{" "}
						{fmt(meanRatioA)}); in part B the same ratios are{" "}
						{ratiosB.map((r) => fmt(r.ratio)).join(", ")}, and their 11.84 for
						Part II rests on the 4521.{" "}
						<Conf level="firm">Summary tier is not a total</Conf>{" "}
						<Conf level="open">What the tiers count</Conf>
					</p>
				</Prose>
				<Wide caption="Each slot's summary column against its detail column. The ratios are neither one nor any constant; the one exact equality is a single summary cord, not a column.">
					<div className="ledger ml-tall">
						<table className="ledger-table">
							<thead>
								<tr>
									<th>Part</th>
									<th className="num">Slot</th>
									<th>Colour</th>
									<th className="num">Summary column</th>
									<th className="num">Detail column</th>
									<th className="num">Ratio</th>
								</tr>
							</thead>
							<tbody>
								{[
									{ part: A, rows: svdA },
									{ part: B, rows: svdB },
								].flatMap(({ part, rows }) =>
									rows.map((s) => (
										<tr key={`${part.key}${s.slot}`}>
											<td>{part.key}</td>
											<td className="num">{s.slot + 1}</td>
											<td>{s.colour}</td>
											<td className="num">
												{s.summary.sum}{" "}
												<span className="muted">
													({s.summary.nGroups}/{s.summary.ofGroups})
												</span>
											</td>
											<td className="num">
												{s.detail.sum}{" "}
												<span className="muted">
													({s.detail.nGroups}/{s.detail.ofGroups})
												</span>
											</td>
											<td className="num">
												{s.ratio === null ? "—" : fmt(s.ratio)}
											</td>
										</tr>
									)),
								)}
							</tbody>
						</table>
					</div>
				</Wide>
			</Step>

			<Step n={6} title="How much of this is chance">
				<Prose>
					<p>
						The Field Guide's catalogue credits this khipu with{" "}
						{KFG_CATALOG.ascherSums} Ascher sums, {KFG_CATALOG.coloured} of them
						coloured pendant sums: cords equal to a run of three or more
						consecutive cords of the same colour, anywhere on the khipu. Its
						rule, reproduced here, finds {kfg.n} ({kfg.right} to the right,{" "}
						{kfg.left} to the left), and only {kfg.openingSums.length} of them
						have an opening cord as the sum: {kfg.openingSums.join(", ")}, the
						three exact columns above. Drop the colour condition and there are{" "}
						{anyGlobal?.observed ?? "…"} such run sums. That density is what a
						corpus scan of run sums against a global shuffle
						(scripts/corpus_discovery.py) picks out, and most of it is layout,
						not arithmetic.
					</p>
					<p>
						Shuffle the values among all the cords and count again, a thousand
						times with a fixed seed: the any-colour count averages{" "}
						{anyGlobal
							? `${fmt(anyGlobal.mean, 1)} ± ${fmt(anyGlobal.sd, 1)}`
							: "…"}
						, and the observed {anyGlobal?.observed ?? "…"} is{" "}
						{anyGlobal ? fmt(anyGlobal.z, 1) : "…"} standard deviations above
						it. Shuffle the values only within their tier, so that the opening
						cords stay large, the summary cords in the hundreds and the detail
						cords in the tens, and the average is{" "}
						{anyTier ? `${fmt(anyTier.mean, 1)} ± ${fmt(anyTier.sd, 1)}` : "…"}:
						the khipu's own count is exactly typical. The same holds for the
						Field Guide's coloured sums (
						{colGlobal ? fmt(colGlobal.mean, 1) : "…"} expected under a global
						shuffle, {colTier ? fmt(colTier.mean, 1) : "…"} within tier, against{" "}
						{kfg.n} observed). A tiered layout with many small values after a
						few large ones produces dozens of run sums by chance.{" "}
						<Conf level="firm">Run-sum density is the tier layout</Conf>
					</p>
					<p>
						The column test is different. Keep the opening cords and the slot
						layout fixed, permute the summary-tier values within each part, and
						count opening cords that equal their column. As recorded,{" "}
						{matches.exact.length} of the {matches.tested} opening cords with a
						value do ({matches.exact.map((r) => r.opening?.name).join(", ")});
						with Urton's readings, {matchesU.exact.length}. Over{" "}
						{chance?.column.shuffles ?? SHUFFLES} shuffles the count averages{" "}
						{chance ? fmt(chance.column.mean, 3) : "…"}, never exceeds{" "}
						{chance?.column.max ?? "…"}, and reaches {matches.exact.length} in{" "}
						{chance?.column.atLeast ?? "…"} of them, so the three columns are
						unlikely to be a coincidence of the layout.{" "}
						<Conf level="firm">Column sums are not chance</Conf>
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Run-sum counts against shuffled versions of the khipu: {SHUFFLES}{" "}
							permutations, seed {SHUFFLE_SEED}, a small seeded generator in the
							browser (the analysis script's Python generator gives figures
							within a few tenths of these). z is (observed − mean) / sd; the
							last column is how many shuffles scored at least the observed
							count.
						</>
					}
				>
					<div className="ledger ml-tall">
						<table className="ledger-table">
							<thead>
								<tr>
									<th>Test</th>
									<th className="num">Observed</th>
									<th className="num">Shuffled mean ± sd</th>
									<th className="num">Max</th>
									<th className="num">z</th>
									<th className="num">≥ observed</th>
								</tr>
							</thead>
							<tbody>
								{chance ? (
									<>
										<tr>
											<th colSpan={6}>
												Same-colour run sums, ≥ 3 summands, sum ≥ 11 (the Field
												Guide's rule)
											</th>
										</tr>
										<BaselineRows items={chance.runs.coloured} />
										<tr>
											<th colSpan={6}>Any-colour run sums, ≥ 3 summands</th>
										</tr>
										<BaselineRows items={chance.runs.any} />
										<tr>
											<th colSpan={6}>Any-colour run sums, ≥ 2 summands</th>
										</tr>
										<BaselineRows items={[chance.runs.any2]} />
										<tr>
											<th colSpan={6}>
												Opening cords equal to their summary column
											</th>
										</tr>
										<BaselineRows items={[chance.column]} />
									</>
								) : (
									<tr>
										<td colSpan={6} className="muted">
											Shuffling…
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</Wide>
			</Step>

			<Step n={7} title="What is read and what is not">
				<Prose>
					<p>
						The two parts share a form, not figures. Pair by pair, part A is
						larger in slot 1 in {compare[0].aGreater} of {compare[0].pairs}{" "}
						pairs and in slot 2 in {compare[1].aGreater} of {compare[1].pairs},
						while part B is larger in slot 3 in {compare[2].bGreater} of the{" "}
						{compare[2].pairs} pairs that have both cords. (The Aschers'
						Observation 8 has positions 2 and 3 the other way round.) Only{" "}
						{shared.length} values above 20 occur in both parts, and one group
						total recurs:{" "}
						{totals.repeats
							.map(
								(r) =>
									`groups ${r.groups.map((g) => g + 1).join(" and ")} both total ${r.value}`,
							)
							.join("; ")}
						. One relation the Aschers found does hold, with its indices
						corrected: subtract the ten detail white cords of part B from those
						of part A, group by group ({wd.diffs.join(", ")}); the first five
						differences sum to {wd.firstFive}, which is {wd.tenthB?.name}, part
						B's tenth detail white cord, and the last five to {wd.lastFive},
						which is {wd.tenthA?.name}, part A's; all ten come to {wd.all} ={" "}
						{wd.sumA} − {wd.sumB}. Their 9(a) does not: {nineA} against {nineB}.
						They also report that part A's fifth detail column,{" "}
						{svdA[4].detail.sum}, equals position 6 of the ten groups of the
						associated khipu AS47, whose values as they tabulated them (
						{AS47_POSITION_6.join(", ")}) sum to {as47Sum}; our file for that
						khipu, KH0058, is a different recording with a different cord order
						and cannot check it.{" "}
						<Conf level="open">Relations between the parts</Conf>
					</p>
					<p>
						The object deteriorated between the two recordings. Part B's sixth
						slot, the dark greyish brown cord, survives in the detail tier as{" "}
						{cbDetail.stubs.length} stubs of a centimetre or less (
						{cbDetail.stubs.map((c) => c.name).join(", ")}) and{" "}
						{cbDetail.broken.length} broken cords (
						{cbDetail.broken.map((c) => `${c.name} ${c.value}`).join(", ")}); in
						the summary tier it is {cbSummary.broken.length} broken cords (
						{cbSummary.broken.map((c) => `${c.name} ${c.value}`).join(", ")})
						and {cbSummary.missing} groups with none, and the opening group has
						none. {p128.name}, which the Aschers recorded as {p128.value} on{" "}
						{p128.length} cm of cord, Urton did not find. Five other cords with
						values in the Aschers' table are bare or stubs in his. The sixth
						slot is the most depleted part of the record.{" "}
						<Conf level="likely">A slot lost between recordings</Conf>
					</p>
				</Prose>
				<Wide>
					<Layers
						heading="KH0081, read in layers"
						layers={explain(
							khipu,
							wA,
							mbA,
							mbB,
							ybB,
							wB,
							matches.tested,
							sub,
							attachR,
							templateColours,
						)}
					/>
				</Wide>
				<Prose>
					<p>
						What is read: a khipu in two parts of one design, each an opening
						group over five summary groups over ten detail groups, in seven
						colour slots; and in the first two slots of part A and the second of
						part B, an opening cord that is the exact total of the five summary
						cords of its colour, with a fourth in part B's last slot on Urton's
						reading of one knot. The Aschers had all but the fourth; the
						shuffles indicate the three are not an artefact of a tiered layout.
					</p>
					<p>
						Most of the object is not read. The middle opening cords are of the
						order of their columns and equal nothing; the last two slots of part
						A's opening carry no total, though their columns are not empty. The
						summary tier is not a total of the detail tier in any slot, no
						pairing of detail groups makes a summary group, and why the detail
						tier is roughly an order of magnitude smaller is unknown; the
						Aschers' ratio is an observation, not a reading. Part B's
						bluish-grey column has four cords and its dark-brown column is
						mostly gone, so neither can be tested. Open: what the seven slots
						categorise; why part A exceeds part B in two slots and falls short
						in a third; what the W differences summing to {wd.firstFive} and{" "}
						{wd.lastFive} mean; what {p40.name} marks between part A's tiers;
						what the 11.5 cm of empty primary cord separates in part B; how the
						khipu relates to AS47 beyond a shared museum number and one shared
						sum; and why a two-part ledger in seven categories was in a
						Nazca-valley grave.{" "}
						<Conf level="open">A two-part ledger of unknown subject</Conf>
					</p>
				</Prose>
			</Step>

			<Sources
				items={[
					{
						who: "Marcia Ascher and Robert Ascher",
						what: "Code of the Quipu: Databook I, entry AS68 (pp. 384–398): cord table and Observations 1–10",
						where:
							"University Microfilms, Ann Arbor, 1978; Cornell 'Code of the Quipu' site",
						href: "https://courses.cit.cornell.edu/quipu/data/as68.pdf",
					},
					{
						who: "Marcia Ascher and Robert Ascher",
						what: "Code of the Quipu: Databook I, entry AS47 (pp. 256–267): the associated khipu, Observations 6–7 comparing it with AS68",
						where: "University Microfilms, Ann Arbor, 1978; Cornell site",
						href: "https://courses.cit.cornell.edu/quipu/data/as47.pdf",
					},
					{
						who: "Marcia Ascher and Robert Ascher",
						what: "Code of the Quipu: Databooks, index page",
						where: "Cornell University",
						href: "https://courses.cit.cornell.edu/quipu/",
					},
					{
						who: "Khipu Field Guide (Ashok Khosla)",
						what: "Catalogue page KH0081 (AS068, UR281): museum, provenance, 33 groups, 217 cords, 9 colours, Benford 0.9756, 227 Ascher sums, bibliography",
						where: "khipufieldguide.com",
						href: "https://www.khipufieldguide.com/catalog/KH0081.html",
					},
					{
						who: "Khipu Field Guide",
						what: "Coloured pendant sums for KH0081: 20 right-handed, 12 left-handed",
						where: "khipufieldguide.com notebook",
						href: "https://www.khipufieldguide.com/notebook/fieldmarks/colored_pendant_sum/html/KH0081.html",
					},
					{
						who: "Khipu Field Guide",
						what: "Indexed pendant sums for KH0081",
						where: "khipufieldguide.com notebook",
						href: "https://www.khipufieldguide.com/notebook/fieldmarks/indexed_pendant_sum/html/KH0081.html",
					},
					{
						who: "Khipu Field Guide",
						what: "Group-group sums for KH0081: group 17 = group 29 = 254",
						where: "khipufieldguide.com notebook",
						href: "https://www.khipufieldguide.com/notebook/fieldmarks/group_group_sum/html/KH0081.html",
					},
					{
						who: "Khipu Field Guide",
						what: "Ascher sum relationships: definitions of pendant, coloured and indexed pendant sums",
						where: "khipufieldguide.com notebook analyses",
						href: "https://www.khipufieldguide.com/notebook/analyses/ascher_sums_overview.html",
					},
					{
						who: "Khipu Field Guide",
						what: "Data file KH0081.xlsx: change log 'Combined AS068 and UR281' (2025-09-25), cord notes for p40 and p128, Alt_Value column",
						where: "khipufieldguide.com databook",
						href: "https://www.khipufieldguide.com/databook/excel_khipus/KH0081.xlsx",
					},
					{
						who: "Open Khipu Repository",
						what: "khipu_main 1000648 (UR281): provenance note 'from burial', beginning tassel SY; Urton's cord and knot records",
						where: "khipu.db, compared in scripts/kh0081_analysis.py",
					},
					{
						who: "Gary Urton",
						what: "Inka History in Knots: Reading Khipus as Primary Sources, p. 263",
						where:
							"University of Texas Press, 2017 — as listed in the Field Guide's bibliography",
					},
					{
						who: "Olaf Witkowski",
						what: "Essai de décryptage des cordelettes quipus, pp. 87–89, 96–97",
						where:
							"Université Catholique de Louvain, 2007 — as listed in the Field Guide's bibliography",
					},
				]}
			/>
			<Legend
				items={[
					...["W", "MB", "YB", "CB", "LA", "0G"].map((code) => ({
						color: hexFor(code, colors),
						label: `${code} ${nameFor(code, colors)}`,
						outline: code === "W",
					})),
				]}
			/>
		</StoryPage>
	);
}

function explain(
	khipu: Khipu,
	wA: OpeningRow,
	mbA: OpeningRow,
	mbB: OpeningRow,
	ybB: OpeningRow,
	wB: OpeningRow,
	tested: number,
	sub: Cord | undefined,
	attachR: number,
	templateColours: number,
): Layer[] {
	return [
		{
			title: "Observed",
			body: (
				<>
					{khipu.stats.nPendants} pendants and {khipu.stats.nSubsidiaries}{" "}
					subsidiary
					{sub ? ` (${sub.name}, ${sub.color}, ${sub.value})` : ""} on an{" "}
					{khipu.primary.length} cm cotton primary cord, {khipu.stats.nGroups}{" "}
					groups by spacing, {khipu.stats.nKnots} knots all tied S, {attachR} of
					the {khipu.stats.nPendants} pendants recto and Z-plied;{" "}
					{templateColours} colour codes in seven slots. Recorded by the Aschers
					before 1978 and by Urton later; merged 2025.
				</>
			),
			level: "firm",
		},
		{
			title: "Derived",
			body: (
				<>
					Two parts of 1 + 5 + 10 groups, the two cords over 5000 opening them.
					Column sums: {wA.value} ={" "}
					{wA.column.cords.map((c) => c.value).join(" + ")}; {mbA.value} ={" "}
					{mbA.column.cords.map((c) => c.value).join(" + ")}; {mbB.value} ={" "}
					{mbB.column.cords.map((c) => c.value).join(" + ")}; {ybB.value}{" "}
					against {ybB.column.sum} as recorded and exact on Urton's reading;{" "}
					{wB.value} against {wB.column.sum}. {tested} opening cords tested; a
					within-part shuffle never gives three. Run-sum density is explained by
					the tier layout. The summary tier is not a total of the detail tier.
				</>
			),
			level: "firm",
		},
		{
			title: "Context",
			body: "A burial at Monte de Cacatilla in the Nazca valley, undated; museum number shared with AS47 (KH0058), which the Aschers describe as associated and whose eight positions per group they map onto these seven. Urton (2017) and Witkowski (2007) cite the khipu; neither could be consulted here.",
			level: "likely",
		},
		{
			title: "Interpretation",
			body: "One reading: a two-part account in seven categories, each part totalling its five summary groups by category on the first cords of its opening group, with the rest of the opening as approximate figures; the ten detail groups may be a finer breakdown of the same categories at a tenth the scale, by a relation not recovered. What the categories and parts are, and why the form was kept twice, is unknown.",
			level: "open",
		},
	];
}
