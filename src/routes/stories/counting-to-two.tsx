import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import KhipuDiagram from "#/components/khipu/KhipuDiagram";
import KhipuSilhouette from "#/components/khipu/KhipuSilhouette";
import CordReader from "#/components/story/CordReader";
import { Chip } from "#/components/story/Ledger";
import {
	type GridColumn,
	RegisterPlot,
	ShareBars,
	ValueBars,
	ValueGrid,
} from "#/components/story/RegistersStages";
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
import type { Cord, Khipu } from "#/lib/khipu/types";
import { sliceKhipu } from "#/lib/stories/derive";
import {
	ASCHER_AS32,
	ASCHER_SPOT_ROWS,
	ascherBoundsCheck,
	ascherNumber,
	attachCounts,
	CYCLE,
	childrenOf,
	colorCode,
	count,
	countBy,
	cycles34,
	dataPendants,
	disputedCords,
	endText,
	fmt,
	groups670,
	histogram,
	isDecreasing,
	isReadable,
	KFG_FIELDMARKS,
	KH0034_ID,
	KH0670_ID,
	knotSignatures,
	knotsText,
	markers,
	mendedCords,
	parts34,
	parts670,
	pct,
	positionTable34,
	positionTable670,
	profile,
	pText,
	RADIOCARBON,
	READ_LEN,
	RELATIVE_IDS,
	readValue,
	rectoPendants,
	register,
	registerPoints,
	SEED,
	SHUFFLES,
	shortZeros34,
	subStats34,
	sumBandSplit,
	templateSlots,
	tests34,
	tests670,
	topCordCheck,
	twistCounts,
} from "#/lib/stories/registers";
import "#/styles/stories/counting-to-two.css";

export const Route = createFileRoute("/stories/counting-to-two")({
	loader: async () => {
		const ids = [KH0034_ID, KH0670_ID, ...RELATIVE_IDS];
		const [khipus, colors, silhouettes] = await Promise.all([
			getKhipus(ids),
			getColors(),
			getSilhouettes(),
		]);
		const sil = (id: string) => {
			const s = silhouettes[id];
			return s ? s.l.map((l, i) => ({ length: l, color: s.c[i] })) : [];
		};
		return {
			a: khipus[KH0034_ID],
			b: khipus[KH0670_ID],
			relatives: RELATIVE_IDS.map((id) => khipus[id]).filter(Boolean),
			colors,
			silA: sil(KH0034_ID),
			silB: sil(KH0670_ID),
		};
	},
	head: () => ({ meta: [{ title: "Counting to two — Khipu" }] }),
	component: CountingToTwo,
});

type LayerA = "recorded" | "cycles" | "unknown";
type LayerB = "recorded" | "attach" | "weight";

const SLICE_LAYOUT = {
	slot: 8,
	gap: 10,
	subOffset: 4,
	pxPerCm: 2.2,
	cordW: 1.8,
};
const OVERVIEW = { slot: 6, gap: 12, subOffset: 3, pxPerCm: 3, cordW: 1.6 };
const COLOUR_A = "var(--accent)";
const COLOUR_B = "var(--moiety-r)";
/** KH0034 is drawn as one of its six parts; this one has the most readable cords. */
const SLICE_PART = 2;

const sigText = (m: Map<string, number> | undefined) =>
	m ? [...m.entries()].map(([sig, n]) => `${sig} × ${n}`).join(", ") : "—";

function CountingToTwo() {
	const { a, b, relatives, colors, silA, silB } = Route.useLoaderData();
	const [layerA, setLayerA] = useState<LayerA>("cycles");
	const [layerB, setLayerB] = useState<LayerB>("attach");

	// KH0034
	const cutA = READ_LEN.KH0034.pendant;
	const pendA = useMemo(() => dataPendants(a), [a]);
	const readA = useMemo(
		() => pendA.filter((c) => isReadable(c, cutA)),
		[pendA, cutA],
	);
	const histAll = useMemo(() => histogram(pendA), [pendA]);
	const histA = useMemo(() => histogram(readA), [readA]);
	const nA = readA.length;
	const knottedA = count(histA, (v) => v > 0);
	const kidsA = useMemo(() => childrenOf(a), [a]);
	const subs = useMemo(() => subStats34(a), [a]);
	const regA = useMemo(() => register(pendA), [pendA]);
	const sigA = useMemo(() => knotSignatures(pendA), [pendA]);
	const disputed = useMemo(() => disputedCords(a), [a]);
	const lone = disputed.filter((d) => d.cord.knots.length === 1);
	const p71 = disputed.find((d) => d.cord.knots.length > 1);
	const partsA = useMemo(() => parts34(a), [a]);
	const cycles = useMemo(() => cycles34(a), [a]);
	const slots = useMemo(() => templateSlots(a), [a]);
	const marks = useMemo(() => markers(a), [a]);
	const mended = useMemo(() => mendedCords(a), [a]);
	const recto = useMemo(() => rectoPendants(a), [a]);
	const ascherNo = useMemo(() => ascherNumber(a), [a]);
	const posA = useMemo(() => positionTable34(a), [a]);
	const bounds = useMemo(() => ascherBoundsCheck(a), [a]);
	const t34 = useMemo(() => tests34(a), [a]);
	const shortZeros = useMemo(() => shortZeros34(a), [a]);
	const offTemplate = slots.filter((s) => s.off);
	const extraLb = offTemplate.find((s) => colorCode(s.cord) === "LB");
	const oddColour = offTemplate.find((s) => colorCode(s.cord) !== "LB");
	const attachA = useMemo(() => attachCounts(pendA), [pendA]);
	const twistA = useMemo(() => twistCounts(a.cords), [a]);
	const notS = a.cords.filter((c) => c.twist !== "S");
	const groupSizesA = useMemo(() => countBy(a.groups, (g) => String(g.n)), [a]);
	const slice = useMemo(() => {
		const keep = new Set(partsA[SLICE_PART].map((c) => c.name));
		return sliceKhipu(a, (c) => keep.has(c.name));
	}, [a, partsA]);
	const cycleOfGroup = useMemo(() => {
		const m = new Map<number, number>();
		for (const s of slots)
			if (s.cord.group != null) m.set(s.cord.group, s.cycle);
		return m;
	}, [slots]);
	const slotOf = useMemo(
		() => new Map(slots.map((s) => [s.cord.name, s])),
		[slots],
	);

	// KH0670
	const cutB = READ_LEN.KH0670.pendant;
	const pendB = useMemo(() => dataPendants(b), [b]);
	const readB = useMemo(
		() => pendB.filter((c) => isReadable(c, cutB)),
		[pendB, cutB],
	);
	const histB = useMemo(() => histogram(readB), [readB]);
	const longestPendB = Math.max(...pendB.map((c) => c.length ?? 0));
	const meanPendB =
		pendB.reduce((s, c) => s + (c.length ?? 0), 0) / pendB.length;
	const histBAll = useMemo(() => histogram(pendB), [pendB]);
	const nB = readB.length;
	const knottedB = count(histB, (v) => v > 0);
	const regB = useMemo(() => register(pendB), [pendB]);
	const sigB = useMemo(() => knotSignatures(pendB), [pendB]);
	const partsB = useMemo(() => parts670(b), [b]);
	const groups = useMemo(() => groups670(b), [b]);
	const posB = useMemo(() => positionTable670(b), [b]);
	const t670 = useMemo(() => tests670(b), [b]);
	const top = useMemo(() => topCordCheck(b), [b]);
	const bands = groups.filter((g) => sumBandSplit(g.values) !== null);
	const decreasing = groups.filter((g) => isDecreasing(g.values));
	const fullGroups = groups.filter((g) => g.full);
	const heaviest = [...groups].sort((x, y) => y.sum - x.sum).slice(0, 3);
	const allZero = groups.filter((g) => g.full && g.sum === 0);
	const groupByIndex = useMemo(
		() => new Map(groups.map((g) => [g.index, g])),
		[groups],
	);
	const maxSum = Math.max(1, ...groups.map((g) => g.sum));

	const profiles = useMemo(
		() => [a, b, ...relatives].map(profile),
		[a, b, relatives],
	);
	const maxValue = Math.max(...histA.keys(), ...histB.keys());

	// figure data
	const gridA: GridColumn[] = useMemo(() => {
		const firstOfPart = new Map(partsA.map((p, i) => [p[0].name, i]));
		return cycles.map((cy, i) => {
			const cells: (GridColumn["cells"][number] | null)[] = CYCLE.map(
				() => null,
			);
			let partStart: string | undefined;
			for (const s of cy) {
				const pi = firstOfPart.get(s.cord.name);
				if (pi != null)
					partStart = pi === 0 ? "Part 1" : `Part ${pi + 1} (after M${6 - pi})`;
				const readable = isReadable(s.cord, cutA);
				const v = readable ? readValue(s.cord) : null;
				const kids = kidsA.get(s.cord.name) ?? [];
				cells[s.pos] = {
					name: s.cord.name,
					value: v,
					subs: kids.map((k) =>
						isReadable(k, READ_LEN.KH0034.subsidiary) ? readValue(k) : 0,
					),
					recto: s.cord.attach === "R",
					off: s.off,
					title: `${s.cord.name} (Ascher ${ascherNo.get(s.cord.name) ?? "—"}): ${colorCode(s.cord)}, ${endText(s.cord)}, ${knotsText(s.cord)}${v === null ? " — unreadable" : ` = ${v}`}${kids.length ? `; ${kids.length} subsidiar${kids.length > 1 ? "ies" : "y"}` : ""}`,
				};
			}
			return { label: String(i + 1), cells, partStart };
		});
	}, [cycles, partsA, kidsA, ascherNo, cutA]);

	const gridB: GridColumn[] = useMemo(() => {
		let lastPart = -1;
		return groups.map((g, i) => {
			const partStart = g.part !== lastPart ? `Part ${g.part + 1}` : undefined;
			lastPart = g.part;
			return {
				label: String(i + 1),
				partStart,
				cells: g.cords.map((c, j) => ({
					name: c.name,
					value: g.values[j],
					recto: false,
					title: `${c.name}: ${endText(c)}, ${knotsText(c)}${g.values[j] === null ? " — unreadable" : ` = ${g.values[j]}`}`,
				})),
			};
		});
	}, [groups]);

	// diagram overlays
	const groupBandA = (g: GroupBox): string | null => {
		if (layerA !== "cycles") return null;
		const cy = cycleOfGroup.get(g.index);
		if (cy == null) return null;
		return cy % 2 ? "color-mix(in srgb, var(--band-a) 22%, transparent)" : null;
	};
	const groupLabelA = (g: GroupBox): string | null => {
		if (layerA !== "cycles") return null;
		const first = g.pendants[0]?.cord;
		const s = first ? slotOf.get(first.name) : undefined;
		return s && s.pos === 0 ? `cycle ${s.cycle + 1}` : null;
	};
	const emphasisA = (c: Cord): boolean =>
		layerA !== "unknown" ||
		isReadable(c, c.level > 1 ? READ_LEN.KH0034.subsidiary : cutA);
	const ringA = (c: Cord): string | null =>
		c.level === 1 && c.attach === "R" ? "var(--moiety-r)" : null;

	const paintB = (c: Cord): string | null => {
		if (layerB !== "attach" || c.kind === "top") return null;
		return c.attach === "R"
			? "var(--moiety-r)"
			: c.attach === "V"
				? "var(--moiety-v)"
				: null;
	};
	const groupBandB = (g: GroupBox): string | null => {
		if (layerB === "weight") {
			const gr = groupByIndex.get(g.index);
			if (!gr) return null;
			const share = Math.round(8 + (gr.sum / maxSum) * 60);
			return `color-mix(in srgb, var(--accent) ${share}%, transparent)`;
		}
		return null;
	};
	const groupLabelB = (g: GroupBox): string | null => {
		const gr = groupByIndex.get(g.index);
		if (!gr)
			return g.group.n === 1 && g.pendants[0]?.cord.kind === "top"
				? "top cord"
				: null;
		if (layerB === "weight") return gr.sum >= 10 ? String(gr.sum) : null;
		const first = partsB[gr.part]?.[0];
		return first && gr.first.name === first.name ? `Part ${gr.part + 1}` : null;
	};

	const testRows = [
		{
			id: a.id,
			label: "position × value class, χ²",
			obs: fmt(t34.position.observed),
			mean: fmt(t34.position.mean),
			p: pText(t34.position.pGe),
		},
		{
			id: a.id,
			label: "colour × value class, χ²",
			obs: fmt(t34.colour.observed),
			mean: fmt(t34.colour.mean),
			p: pText(t34.colour.pGe),
		},
		{
			id: a.id,
			label: "variance of cycle means",
			obs: fmt(t34.cycleVariance.observed, 3),
			mean: fmt(t34.cycleVariance.mean, 3),
			p: pText(t34.cycleVariance.pGe),
		},
		{
			id: a.id,
			label: "adjacent equal pairs",
			obs: String(t34.adjacentEqual.observed),
			mean: fmt(t34.adjacentEqual.mean),
			p: pText(t34.adjacentEqual.pGe),
		},
		{
			id: a.id,
			label: "runs of blank / knotted (fewer than)",
			obs: String(t34.runs.observed),
			mean: fmt(t34.runs.mean),
			p: pText(t34.runs.pLe),
		},
		{
			id: b.id,
			label: "position in group × value class, χ²",
			obs: fmt(t670.position.observed),
			mean: fmt(t670.position.mean),
			p: pText(t670.position.pGe),
		},
		{
			id: b.id,
			label: "part × value class, χ²",
			obs: fmt(t670.part.observed),
			mean: fmt(t670.part.mean),
			p: pText(t670.part.pGe),
		},
		{
			id: b.id,
			label: "variance of group sums, free shuffle",
			obs: fmt(t670.groupVariance.observed),
			mean: fmt(t670.groupVariance.mean),
			p: pText(t670.groupVariance.pGe),
		},
		{
			id: b.id,
			label: "variance of group sums, within part",
			obs: fmt(t670.groupVarianceWithinPart.observed),
			mean: fmt(t670.groupVarianceWithinPart.mean),
			p: pText(t670.groupVarianceWithinPart.pGe),
		},
		{
			id: b.id,
			label: "longest run of knotted cords",
			obs: String(t670.longestKnotted.observed),
			mean: fmt(t670.longestKnotted.mean),
			p: pText(t670.longestKnotted.pGe),
		},
		{
			id: b.id,
			label: "KFG group sum bands",
			obs: String(t670.sumBands.observed),
			mean: fmt(t670.sumBands.mean, 2),
			p: pText(t670.sumBands.pGe),
		},
		{
			id: b.id,
			label: "KFG decreasing groups",
			obs: String(t670.decreasing.observed),
			mean: fmt(t670.decreasing.mean, 2),
			p: pText(t670.decreasing.pGe),
		},
		{
			id: b.id,
			label: "repeated five-value patterns, free shuffle",
			obs: String(t670.patterns.observed),
			mean: fmt(t670.patterns.mean, 2),
			p: pText(t670.patterns.pGe),
		},
		{
			id: b.id,
			label: "repeated patterns, within group",
			obs: String(t670.patternsWithinGroup.observed),
			mean: fmt(t670.patternsWithinGroup.mean, 2),
			p: pText(t670.patternsWithinGroup.pGe),
		},
	];
	const zeroShareAll = pct(histAll.get(0) ?? 0, pendA.length);
	const zeroShareRead = pct(histA.get(0) ?? 0, nA);

	return (
		<StoryPage
			kicker="KH0034 · KH0670"
			title="Counting to two"
			standfirst={
				<>
					Two khipus, one from Nazca and one with no provenance, carry hundreds
					of pendant cords whose values are almost all 0, 1 or 2. Neither
					contains sums. Read cord by cord, both look like registers of small
					counts on a fixed template: on one the value varies with a cord's
					column, on the other with its row. What was counted is not
					recoverable.
				</>
			}
			meta={
				<>
					<span>
						Objects:{" "}
						<Link to="/khipus/$id" params={{ id: a.id }}>
							{a.aliases.join(" / ")} · {a.id}
						</Link>{" "}
						and{" "}
						<Link to="/khipus/$id" params={{ id: b.id }}>
							{b.aliases.join(" / ")} · {b.id}
						</Link>
					</span>
					<span>
						{a.museum.canonical}, {a.museum.number}; {b.museum.canonical},{" "}
						{b.museum.number}
					</span>
					<span>
						Recorded by Marcia and Robert Ascher (1978) and Gary Urton (OKR); by
						Kylie Quave (2005; OKR record dated {b.created?.slice(-4)})
					</span>
				</>
			}
		>
			<div className="ctt-story">
				<Step n={1} title="Two khipus, one habit">
					<Prose>
						<p>
							KH0034 is a white cotton primary cord {a.primary.length} cm long
							from Nazca, in the Peabody Museum at Harvard. One end has a
							needlework bundle, the other is broken. It carries{" "}
							{a.stats.nCords} cords: {pendA.length} pendants, {marks.length}{" "}
							looped blank marker cords that divide them into {partsA.length}{" "}
							parts of {partsA.map((p) => p.length).join(", ")}, and{" "}
							{a.stats.nSubsidiaries} subsidiaries. The Aschers published its
							full listing in 1978; Urton re-recorded it for the Open Khipu
							Repository. KH0670 is a yellow-brown cord {b.primary.length} cm
							long in the Michael C. Carlos Museum at Emory, with no findspot.
							Its recorder, Kylie Quave, noted three parts tied together. It
							carries {b.stats.nCords} level-one cords: {pendB.length} pendants
							in {groups.length} groups of five, one top cord, and two
							zero-length entries she noted as knots between the parts. Every
							cord on it is the same colour.{" "}
							<Conf level="firm">Recorded structure</Conf>
						</p>
						<p>
							What they share is the values. Setting aside cords broken too
							short to have carried a knot, of the {nA} readable pendants on
							KH0034, {histA.get(0) ?? 0} carry no knot, {histA.get(1) ?? 0}{" "}
							read 1 and {histA.get(2) ?? 0} read 2;{" "}
							{count(histA, (v) => v <= 2)} of {nA}, or{" "}
							{pct(
								count(histA, (v) => v <= 2),
								nA,
							)}
							, read 0 to 2, and no pendant reads above{" "}
							{Math.max(...histA.keys())}. The Aschers wrote that{" "}
							{ASCHER_AS32.pct} were 0 to 2 on the {ASCHER_AS32.basis} they
							counted. Of the {nB} readable pendants on KH0670,{" "}
							{histB.get(0) ?? 0} are blank, {histB.get(1) ?? 0} read 1 and{" "}
							{histB.get(2) ?? 0} read 2; the largest pendant value is{" "}
							{Math.max(...histB.keys())}. Among knotted pendants the commonest
							value on both is 1, then 2, with a short tail:{" "}
							{pct(histA.get(1) ?? 0, knottedA)} and{" "}
							{pct(histB.get(1) ?? 0, knottedB)} of knotted cords read 1.
						</p>
					</Prose>
					<Wide caption="The two khipus as silhouettes: pendant lengths and recorded colours along the primary cord. KH0034 alternates white and light brown; KH0670 is one colour throughout, with the long top cord standing up between its first and second parts.">
						<div className="figures">
							<div className="figure">
								<figcaption>
									<h3>
										{a.id} · {a.aliases.join(" / ")}
									</h3>
								</figcaption>
								<KhipuSilhouette
									cords={silA}
									colors={colors}
									width={520}
									height={110}
								/>
							</div>
							<div className="figure">
								<figcaption>
									<h3>
										{b.id} · {b.aliases.join(" / ")}
									</h3>
								</figcaption>
								<KhipuSilhouette
									cords={silB}
									colors={colors}
									width={520}
									height={110}
								/>
							</div>
						</div>
					</Wide>
					<Wide caption="Pendant values on the two khipus, readable pendants only, as a share of each khipu's readable pendants. Counts are written over the bars.">
						<ValueBars
							title="Pendant value histograms of KH0034 and KH0670"
							maxValue={maxValue}
							series={[
								{ label: a.id, colour: COLOUR_A, hist: histA, n: nA },
								{ label: b.id, colour: COLOUR_B, hist: histB, n: nB },
							]}
						/>
						<Legend
							items={[
								{ color: COLOUR_A, label: `${a.id}, ${nA} readable pendants` },
								{ color: COLOUR_B, label: `${b.id}, ${nB} readable pendants` },
							]}
						/>
					</Wide>
					<Prose>
						<p>
							Neither is binary. On KH0034 {histA.get(2) ?? 0} pendants read 2
							and {count(histA, (v) => v >= 3)} read 3 to{" "}
							{Math.max(...histA.keys())}; on KH0670{" "}
							{count(histB, (v) => v >= 3)} read 3 to{" "}
							{Math.max(...histB.keys())}. They look like registers of small
							counts with a modal count of one, not ledgers: nothing on either
							khipu totals anything else on it (steps 5 and 6), and the one
							positional-decimal cord, KH0670's top cord, is not the sum of its
							pendants. <Conf level="likely">Small-count registers</Conf>
						</p>
					</Prose>
				</Step>

				<Step n={2} title="One knot, one height">
					<Prose>
						<p>
							Both khipus record each value as a single knot cluster at a fixed
							distance from the primary cord. On KH0034 the {regA.n}{" "}
							figure-eight and long knots on pendants sit {fmt(regA.mean)} ±{" "}
							{fmt(regA.sd)} cm from the attachment, between {regA.min} and{" "}
							{regA.max} cm, whatever the cord's length: the correlation between
							knot height and cord length is {fmt(regA.r, 2)}. On KH0670 the{" "}
							{regB.n} pendant knots sit at {fmt(regB.mean)} ± {fmt(regB.sd)} cm
							(correlation {fmt(regB.r, 2)}). No pendant on KH0670 carries two
							clusters; on KH0034 the only cord with a second cluster is{" "}
							{p71?.cord.name}, discussed below. There is no tens place on any
							pendant of either khipu. <Conf level="firm">Single register</Conf>
						</p>
					</Prose>
					<Wide
						caption={
							<>
								Every pendant knot on the two khipus at its measured height
								against its cord's length. The shaded band is the mean ± one
								standard deviation; the diagonal is the cord's end; the dashed
								line is the length below which a blank broken cord is scored
								unknown. On KH0034 the single knots Urton read as tens on{" "}
								{lone.map((d) => d.cord.name).join(" and ")} sit inside the
								band; the one point above it is the second knot of{" "}
								{p71?.cord.name} at {p71?.cord.knots.at(-1)?.pos} cm.
							</>
						}
					>
						<div className="ctt-pair">
							<RegisterPlot
								panel={{
									label: `${a.id} pendants`,
									points: registerPoints(pendA),
									cut: cutA,
									mean: regA.mean,
									sd: regA.sd,
									colour: COLOUR_A,
								}}
							/>
							<RegisterPlot
								panel={{
									label: `${b.id} pendants`,
									points: registerPoints(pendB),
									cut: cutB,
									mean: regB.mean,
									sd: regB.sd,
									colour: COLOUR_B,
								}}
							/>
						</div>
					</Wide>
					<Prose>
						<p>
							The notation is the usual khipu units notation: 1 is one
							figure-eight knot and 2 to{" "}
							{Math.max(...sigA.keys(), ...sigB.keys())} a long knot of that
							many turns. Across the whole corpus
							(scripts/registers_analysis.py), 6,061 cords whose only knot is
							one figure-eight read 1 and 20 do not.
						</p>
					</Prose>
					<Wide caption="How each value is written on the two khipus: knot type and count (E figure-eight, L long knot with its turns, S single knot), with the number of pendants written that way. The three KH0034 cords with a single knot are read as 1 here; see below.">
						<div className="ledger">
							<table className="ledger-table">
								<thead>
									<tr>
										<th className="num">Value</th>
										<th>{a.id} pendants</th>
										<th>{b.id} pendants</th>
									</tr>
								</thead>
								<tbody>
									{Array.from(
										{ length: Math.max(...sigA.keys(), ...sigB.keys()) },
										(_, i) => i + 1,
									)
										.filter((v) => sigA.has(v) || sigB.has(v))
										.map((v) => (
											<tr key={v}>
												<td className="num">{v}</td>
												<td>{sigText(sigA.get(v))}</td>
												<td>{sigText(sigB.get(v))}</td>
											</tr>
										))}
								</tbody>
							</table>
						</div>
					</Wide>
					<Prose>
						<p>
							A fixed register limits what a broken cord can show. A blank cord
							broken off below the register may once have carried a knot, so its
							0 is unknown, not zero; the Aschers scored such cords "?" and
							Quave's notes on KH0670 read "incomplete before knot plane". The
							rule used here: a blank pendant recorded as broken and shorter
							than {cutA} cm on KH0034 ({READ_LEN.KH0034.subsidiary} cm for a
							subsidiary) or {cutB} cm on KH0670 is unreadable; a blank cord
							that is not broken is a zero whatever its length (
							{shortZeros.length} short unbroken pendants on KH0034 are kept as
							zeros). That removes {pendA.length - nA} of {pendA.length}{" "}
							pendants and {subs.n - subs.readable} of {subs.n} subsidiaries on
							KH0034, and {pendB.length - nB} of {pendB.length} pendants on
							KH0670, most of them in its third part. It moves the share of
							zeros on KH0034 from {zeroShareAll} of all pendants to{" "}
							{zeroShareRead} of readable ones, and on KH0670 from{" "}
							{pct(histBAll.get(0) ?? 0, pendB.length)} to{" "}
							{pct(histB.get(0) ?? 0, nB)}. The Aschers instead discounted every
							broken cord; the Field Guide records 0 for all. The cut-offs are
							ours. <Conf level="likely">Readability rule</Conf>
						</p>
						<p>
							Three cords of KH0034 need a decision. Urton recorded a lone
							single knot on {disputed.map((d) => d.cord.name).join(", ")},
							which the Field Guide values as{" "}
							{disputed.map((d) => d.kfg).join(", ")}; the Aschers recorded
							figure-eights there. On{" "}
							{lone.map((d) => d.cord.name).join(" and ")} the single knot sits
							at{" "}
							{[...new Set(lone.map((d) => d.cord.knots[0]?.pos))].join(
								" and ",
							)}{" "}
							cm, inside the register that holds every other knot, with no tens
							place to read them in; they are read here as{" "}
							{lone.map((d) => `${d.cord.name} = ${d.read}`).join(", ")}. On{" "}
							{p71?.cord.name} a figure-eight at {p71?.cord.knots[0]?.pos} cm is
							followed by a single knot at {p71?.cord.knots.at(-1)?.pos} cm on a{" "}
							{p71?.cord.length} cm cord; the Databook lists that cord (its{" "}
							{ascherNo.get(p71?.cord.name ?? "")}) as 1E (17.0); 1E (31.0),
							value "1+1(?)", and Urton's note on it reads "Aschers 1E+1E, Urton
							1E+1S". Read as a unit, the second knot makes {p71?.cord.name} ={" "}
							{p71?.read}, the Aschers' reading with their query kept. With the
							single knots read as tens the khipu's maximum would be{" "}
							{Math.max(...disputed.map((d) => d.kfg))}; read as units it is{" "}
							{Math.max(...histA.keys())}, the Aschers' maximum.{" "}
							<Conf level="likely">Units, not tens</Conf>
						</p>
					</Prose>
				</Step>

				<Step n={3} title="KH0034: the eight-cord template">
					<Prose>
						<p>
							The pendants of KH0034 alternate in a fixed order: three white,
							then five light brown, {cycles.length} times over. Of the Field
							Guide's {a.stats.nGroups} spacing groups,{" "}
							{groupSizesA.get("3") ?? 0} are triplets and{" "}
							{groupSizesA.get("5") ?? 0} quintets; the rest are the markers,
							one sextet and the lone last cord. The Aschers' groups are the
							eight-cord cycles. {cycles.filter((c) => c.length === 8).length}{" "}
							cycles are complete; one has a sixth light-brown cord (
							{extraLb?.cord.name}), one white slot holds a cord recorded as{" "}
							{oddColour ? colorCode(oddColour.cord) : "—"} (
							{oddColour?.cord.name}), and those two are the only cords off the
							template; the last cycle is a single white cord at the broken end.
							The five looped markers M1–M5 (
							{marks.map((m) => m.name).join(", ")}) each stand alone between
							cycles, so the six parts hold{" "}
							{partsA
								.map(
									(p) =>
										cycles.filter(
											(c) =>
												c[0].cord.ordinal >= p[0].ordinal &&
												c[0].cord.ordinal <= p[p.length - 1].ordinal,
										).length,
								)
								.join(", ")}{" "}
							cycles. {twistA.get("S") ?? 0} of the {a.cords.length} cords are
							S-twist; the twist of {notS.map((c) => c.name).join(", ")} is
							unrecorded. {attachA.get("V") ?? 0} pendants are attached verso
							and {recto.length} recto ({recto.map((c) => c.name).join(", ")}:
							one of them a whole white triplet); the markers and all {subs.n}{" "}
							subsidiaries are recorded with attachment unknown.{" "}
							<Conf level="firm">Template</Conf>
						</p>
						<p>
							The Aschers numbered the khipu from the other end. Their cord n is
							the n-th level-one cord counted back from the Field Guide's p
							{pendA.at(-1)?.ordinal}, skipping the five markers and the{" "}
							{mended.length} cords in a mended stretch ({mended[0]?.name}–
							{mended.at(-1)?.name}) that Urton added and the Aschers did not
							list. The map holds on every cord checked, and puts the Databook's
							"broken end" at p{pendA.at(-1)?.ordinal} and its "cotton knob" at
							p1. Their position k in an eight-cord group is the Field Guide's
							position 9 − k: their group runs five light brown then three
							white. <Conf level="firm">Cord map</Conf>
						</p>
					</Prose>
					<Wide caption="The Aschers' listing against the Field Guide's cords. Their columns are knots (height in cm), length with b for broken, colour, value and any subsidiary; the Field Guide side is computed from the record.">
						<div className="ledger">
							<table className="ledger-table">
								<thead>
									<tr>
										<th className="num">Ascher cord</th>
										<th>Databook, transcribed</th>
										<th>KFG cord</th>
										<th>Recorded</th>
										<th>Subsidiary</th>
									</tr>
								</thead>
								<tbody>
									{ASCHER_SPOT_ROWS.map((row) => {
										const name = [...ascherNo.entries()].find(
											([, n]) => n === row.n,
										)?.[0];
										const cord = a.cords.find((c) => c.name === name);
										const kids = cord ? (kidsA.get(cord.name) ?? []) : [];
										return (
											<tr key={row.n}>
												<td className="num">{row.n}</td>
												<td className="wrap">{row.text}</td>
												<td>
													{cord ? <Chip cord={cord} colors={colors} /> : "—"}{" "}
													{name}
												</td>
												<td className="wrap">
													{cord
														? `${knotsText(cord)}; ${endText(cord)}; ${colorCode(cord)}; reads ${readValue(cord)}`
														: "—"}
												</td>
												<td className="wrap">
													{kids.length
														? kids
																.map(
																	(k) =>
																		`${knotsText(k)}; ${endText(k)}; ${colorCode(k)}; ${k.pos} cm along the pendant; reads ${readValue(k)}`,
																)
																.join(" / ")
														: "none"}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					</Wide>
					<Wide
						caption={
							<>
								Part {SLICE_PART + 1} of KH0034 ({partsA[SLICE_PART][0].name}–
								{partsA[SLICE_PART].at(-1)?.name}, {partsA[SLICE_PART].length}{" "}
								pendants between markers M{6 - SLICE_PART} and M{5 - SLICE_PART}
								), drawn to scale; the whole khipu is six such stretches.
								Cycles: alternate eight-cord cycles shaded. Unknown cords: blank
								cords broken below the register dimmed. The one recto pendant
								here is ringed.
							</>
						}
					>
						<LayerTabs
							value={layerA}
							onChange={setLayerA}
							options={[
								{ value: "recorded", label: "As recorded" },
								{ value: "cycles", label: "Cycles" },
								{ value: "unknown", label: "Unknown cords" },
							]}
						/>
						<KhipuDiagram
							khipu={slice}
							colors={colors}
							layout={SLICE_LAYOUT}
							style="physical"
							groupBand={groupBandA}
							groupLabel={groupLabelA}
							emphasis={emphasisA}
							ring={ringA}
							showGroups
							tooltip
							fit
						/>
					</Wide>
				</Step>

				<Step n={4} title="KH0034: columns, and the subsidiaries">
					<Prose>
						<p>
							With the {cycles.length} cycles as columns and the eight template
							positions as rows, values vary by template position. The first
							white cord (position 1, the Aschers' 8) is knotted{" "}
							{pct(posA[0].knotted, posA[0].readable)} of the time and never
							reads above {posA[0].max}; the last light brown (position 8, the
							Aschers' 1) is knotted {pct(posA[7].knotted, posA[7].readable)} of
							the time. The middle light-brown positions 5 to 7 are knotted{" "}
							{pct(posA[4].knotted, posA[4].readable)},{" "}
							{pct(posA[5].knotted, posA[5].readable)} and{" "}
							{pct(posA[6].knotted, posA[6].readable)} of the time, with mean
							values {fmt(posA[4].mean, 2)}, {fmt(posA[5].mean, 2)} and{" "}
							{fmt(posA[6].mean, 2)}. The cycles themselves do not differ beyond
							chance: a heavy cycle is one whose high-value positions happen to
							be filled.
						</p>
					</Prose>
					<Wide caption="KH0034 as its template: one column per eight-cord cycle in Field Guide order, one row per template position (W white, LB light brown; the Aschers' position in grey). Fill deepens with the value; a dotted box is a blank cord broken below the register; a dot is a subsidiary (filled if knotted); an orange ring is a recto pendant; * marks the two cords off the template. Rules mark the looped markers between parts.">
						<ValueGrid
							title="KH0034 pendant values by cycle and template position"
							colour={COLOUR_A}
							columns={gridA}
							rows={CYCLE.map((c, i) => ({
								label: `${i + 1} ${c}`,
								sub: `A${9 - (i + 1)}`,
							}))}
						/>
					</Wide>
					<Wide caption="Readable pendants by template position. Knotted share, mean and maximum value, and how many of the position's pendants carry a subsidiary. The Aschers' bounds are the values they list for each of their positions.">
						<div className="ledger">
							<table className="ledger-table">
								<thead>
									<tr>
										<th>Position (KFG)</th>
										{posA.map((r) => (
											<th key={r.pos} className="num">
												{r.pos + 1}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									<tr>
										<th>Colour</th>
										{posA.map((r) => (
											<td key={r.pos} className="num">
												<span className="chip">
													<i
														style={{ background: hexFor(r.colour, colors) }}
														aria-hidden="true"
													/>
													{r.colour}
												</span>
											</td>
										))}
									</tr>
									<tr>
										<th>Aschers' position</th>
										{posA.map((r) => (
											<td key={r.pos} className="num muted">
												{r.ascher}
											</td>
										))}
									</tr>
									<tr>
										<th>Pendants · readable</th>
										{posA.map((r) => (
											<td key={r.pos} className="num">
												{r.pendants} · {r.readable}
											</td>
										))}
									</tr>
									<tr>
										<th>Knotted</th>
										{posA.map((r) => (
											<td key={r.pos} className="num">
												{pct(r.knotted, r.readable)}
											</td>
										))}
									</tr>
									<tr>
										<th>Mean value</th>
										{posA.map((r) => (
											<td key={r.pos} className="num">
												{fmt(r.mean, 2)}
											</td>
										))}
									</tr>
									<tr>
										<th>Largest value</th>
										{posA.map((r) => (
											<td key={r.pos} className="num">
												{r.max}
											</td>
										))}
									</tr>
									<tr>
										<th>Aschers' bounds</th>
										{posA.map((r) => (
											<td key={r.pos} className="num muted">
												{ASCHER_AS32.bounds[r.ascher].join(" ")}
											</td>
										))}
									</tr>
									<tr>
										<th>With a subsidiary</th>
										{posA.map((r) => (
											<td key={r.pos} className="num">
												{r.withSub}
											</td>
										))}
									</tr>
								</tbody>
							</table>
						</div>
					</Wide>
					<Prose>
						<p>
							Tested against {SHUFFLES} shuffles of the readable values over the
							same positions (seed {SEED}), the chi-square of position against
							value class (0, 1, 2 or more) is {fmt(t34.position.observed)}{" "}
							where a shuffle gives {fmt(t34.position.mean)} on average (
							{pText(t34.position.pGe)}); colour alone gives{" "}
							{fmt(t34.colour.observed)} against {fmt(t34.colour.mean)} (
							{pText(t34.colour.pGe)}). The variance of the cycles' mean values,{" "}
							{fmt(t34.cycleVariance.observed, 3)}, is what a shuffle gives (
							{fmt(t34.cycleVariance.mean, 3)}, {pText(t34.cycleVariance.pGe)}).
							Serial structure is mild: {t34.adjacentEqual.observed} adjacent
							equal pairs against {fmt(t34.adjacentEqual.mean)} (
							{pText(t34.adjacentEqual.pGe)}), {t34.runs.observed} runs of blank
							and knotted cords against {fmt(t34.runs.mean)} (
							{pText(t34.runs.pLe)}); with several tests run, nothing near 0.05
							should be called significant. The Aschers' bounds by position,
							read from their listing, hold on every readable cord under the
							units reading:{" "}
							{bounds.every((x) => x.exceptions.length === 0)
								? "no exceptions"
								: bounds
										.filter((x) => x.exceptions.length)
										.map(
											(x) =>
												`position ${x.ascher}: ${x.exceptions.map((e) => `${e.cord.name} = ${e.value}`).join(", ")}`,
										)
										.join("; ")}
							. <Conf level="likely">Organised by column</Conf>
						</p>
						<p>
							The subsidiaries follow the same columns. {subs.pendantsWith} of
							the {pendA.length} pendants carry one ({subs.pendantsWithTwo}{" "}
							carry two; none carries more than {subs.maxPer}), and they hang
							from the white cords: {subs.byParentColour.get("W")?.[0]} of{" "}
							{subs.byParentColour.get("W")?.[1]} white pendants against{" "}
							{subs.byParentColour.get("LB")?.[0]} of{" "}
							{subs.byParentColour.get("LB")?.[1]} light brown, and by position{" "}
							{posA.map((r) => r.withSub).join(", ")}: most on the first two
							white positions, none on the last light brown. The subsidiary
							itself may be the mark: of the {subs.readable} readable ones,{" "}
							{subs.knotted} are knotted and {subs.hist.get(1) ?? 0} read 1 (
							{subs.hist.get(2) ?? 0} read 2, {subs.hist.get(3) ?? 0} reads 3);
							their knots sit in a register of their own at{" "}
							{fmt(subs.register.mean)} ± {fmt(subs.register.sd)} cm. A pendant
							with a subsidiary is knotted{" "}
							{pct(subs.knottedWith[0], subs.knottedWith[1])} of the time, one
							without {pct(subs.knottedWithout[0], subs.knottedWithout[1])}.{" "}
							<Conf level="firm">Subsidiaries as marks</Conf>
						</p>
						<p>
							The colours have not survived equally. Of the {subs.db.n}{" "}
							dark-brown subsidiaries {subs.db.broken} are broken and{" "}
							{subs.db.stubs} are stubs of a centimetre or less, so{" "}
							{subs.db.unreadable} are unreadable; of the {subs.lb.n}{" "}
							light-brown ones {subs.lb.broken} are broken and{" "}
							{subs.lb.unreadable} unreadable. Whether the dark-brown cords were
							cut or their fibre failed is not recorded.{" "}
							<Conf level="firm">Dark-brown subsidiaries lost</Conf>{" "}
							<Conf level="open">Why</Conf>
						</p>
					</Prose>
				</Step>

				<Step n={5} title="KH0670: three parts, one colour, one decimal cord">
					<Prose>
						<p>
							KH0670's primary cord is recorded as three parts tied together,
							and the attachment of its pendants flips with them: the{" "}
							{partsB[0].length} pendants of part 1 ({partsB[0][0].name}–
							{partsB[0].at(-1)?.name}) are all verso, the {partsB[1].length} of
							part 2 ({partsB[1][0].name}–{partsB[1].at(-1)?.name}) all recto,
							and part 3 ({partsB[2][0].name}–{partsB[2].at(-1)?.name}) verso
							again, with {attachCounts(partsB[2]).get("U") ?? 0} unrecorded.
							Twist is S throughout. Whether the flip reflects the maker's
							choice or a broken cord re-tied the other way up is not recorded.{" "}
							<Conf level="firm">Attachment by part</Conf>{" "}
							<Conf level="open">One document or three</Conf>
						</p>
						<p>
							Between parts 1 and 2 stands the top cord {top?.cord.name},{" "}
							{top?.cord.length} cm long, with three knot clusters at{" "}
							{top?.cord.knots.map((k) => k.pos).join(", ")} cm: {top?.value} in
							positional decimal, the only such cord on the khipu. It is not a
							total of any surviving cords. The pendants sum to{" "}
							{top?.pendantTotal} ({top?.byPart.join(" / ")} by part), so it
							would need {top?.deficit} more units on the {top?.unreadable}{" "}
							unreadable cords, which at the readable mean of{" "}
							{fmt(top?.readableMean ?? 0, 2)} would carry about{" "}
							{Math.round(top?.expectedOnUnreadable ?? 0)}. No contiguous run of
							pendants sums to it ({top?.runs} found). It divides evenly by the
							Field Guide's {b.stats.nGroups} spacing groups (
							{fmt(top?.perSpacingGroup ?? 0, 2)} each) only because the top
							cord and the two zero-length entries are counted as groups; by the{" "}
							{groups.length} real groups it is {fmt(top?.perGroup ?? 0, 2)}.{" "}
							<Conf level="firm">Not a sum</Conf>{" "}
							<Conf level="open">What 336 names</Conf>
						</p>
					</Prose>
					<Wide caption="KH0670 entire, to scale. Attachment: verso in blue, recto in orange; the flip falls at the joins of the primary cord. Group weight: each five-cord group shaded by the sum of its values, the heaviest labelled.">
						<LayerTabs
							value={layerB}
							onChange={setLayerB}
							options={[
								{ value: "recorded", label: "As recorded" },
								{ value: "attach", label: "Attachment" },
								{ value: "weight", label: "Group weight" },
							]}
						/>
						<KhipuDiagram
							khipu={b}
							colors={colors}
							layout={OVERVIEW}
							style="physical"
							paint={paintB}
							groupBand={groupBandB}
							groupLabel={groupLabelB}
							showGroups
							tooltip
							fit
						/>
						{layerB === "attach" && (
							<Legend
								items={[
									{ color: "var(--moiety-v)", label: "attached verso" },
									{ color: "var(--moiety-r)", label: "attached recto" },
								]}
							/>
						)}
					</Wide>
					{top && (
						<Wide
							caption={
								<>
									The top cord of KH0670, read out by place. Hundreds, tens and
									units sit in three clusters on a {top.cord.length} cm cord,
									longer than any pendant (the longest is {longestPendB} cm) and
									about twice the mean pendant length of {fmt(meanPendB, 0)} cm;
									every pendant carries one cluster at about {fmt(regB.mean, 0)}{" "}
									cm.
								</>
							}
						>
							<div className="figures">
								<div className="figure">
									<figcaption>
										<h3>{top.cord.name}, the top cord</h3>
									</figcaption>
									<CordReader
										cord={top.cord}
										colors={colors}
										pxPerCm={4}
										title={`Top cord ${top.cord.name}, ${top.value}`}
									/>
								</div>
							</div>
						</Wide>
					)}
				</Step>

				<Step n={6} title="KH0670: rows, and what is not a sum">
					<Prose>
						<p>
							On KH0670 a cord's position within its group of five does not
							predict its value. The five positions are knotted{" "}
							{posB.map((r) => pct(r.knotted, r.readable)).join(", ")} of the
							time, with means {posB.map((r) => fmt(r.mean, 2)).join(", ")}; the
							chi-square against value class is {fmt(t670.position.observed)}{" "}
							where a shuffle gives {fmt(t670.position.mean)} (
							{pText(t670.position.pGe)}). The part of the primary cord does
							little more ({pText(t670.part.pGe)}). Whole groups, however, are
							heavier or lighter than chance predicts. Among the{" "}
							{fullGroups.length} groups with all five cords readable, the
							variance of the group sums is {fmt(t670.groupVariance.observed)}{" "}
							against {fmt(t670.groupVariance.mean)} under a free shuffle (
							{pText(t670.groupVariance.pGe)}) and{" "}
							{fmt(t670.groupVarianceWithinPart.mean)} under a shuffle that
							keeps each value in its part (
							{pText(t670.groupVarianceWithinPart.pGe)}
							). The heaviest groups,{" "}
							{heaviest
								.map(
									(g) =>
										`${g.first.name} (${g.values.map((v) => v ?? "?").join(" ")} = ${g.sum})`,
								)
								.join(", ")}
							, are all in part 2; {allZero.length} fully readable groups are
							all zero. <Conf level="likely">Organised by row</Conf>
						</p>
					</Prose>
					<Wide caption="KH0670 as its template: one column per five-cord group, one row per position in the group, with the group sums beneath. A dotted box is a cord cut below the register; most are in part 3. Rules mark the joins of the primary cord.">
						<ValueGrid
							title="KH0670 pendant values by group and position"
							colour={COLOUR_B}
							columns={gridB}
							rows={[1, 2, 3, 4, 5].map((p) => ({ label: `${p}` }))}
							colSums
						/>
					</Wide>
					<Wide caption="Knotted share by position on the two khipus, readable pendants only, with the mean value over each bar. KH0034 varies by position; KH0670 does not.">
						<div className="ctt-pair">
							<ShareBars
								title={`${a.id}: knotted share by template position`}
								colour={COLOUR_A}
								items={posA.map((r) => ({
									label: `${r.pos + 1}`,
									sub: r.colour,
									share: r.readable ? r.knotted / r.readable : 0,
									mean: r.mean,
									n: r.readable,
								}))}
							/>
							<ShareBars
								title={`${b.id}: knotted share by position in the group`}
								colour={COLOUR_B}
								items={posB.map((r) => ({
									label: `${r.pos + 1}`,
									share: r.readable ? r.knotted / r.readable : 0,
									mean: r.mean,
									n: r.readable,
								}))}
							/>
						</div>
					</Wide>
					<Prose>
						<p>
							The Field Guide's fieldmark pages flag two "Ascher decreasing
							groups" on KH0670 (its spacing groups{" "}
							{KFG_FIELDMARKS.decreasing.join(" and ")}, counted from 1 over all{" "}
							{b.stats.nGroups}) and four "group sum bands" (groups{" "}
							{KFG_FIELDMARKS.sumBands.join(", ")}, halves{" "}
							{KFG_FIELDMARKS.sumBandHalves.join(", ")}). Both reproduce: the
							groups starting{" "}
							{decreasing.map((g) => g.first.name).join(" and ")} run{" "}
							{decreasing
								.map((g) => g.values.map((v) => v ?? 0).join(","))
								.join(" and ")}
							, and the groups starting{" "}
							{bands.map((g) => g.first.name).join(", ")} split into equal
							halves. Neither exceeds chance: shuffles give{" "}
							{fmt(t670.sumBands.mean, 2)} bands on average against the{" "}
							{t670.sumBands.observed} observed ({pText(t670.sumBands.pGe)}),
							and {fmt(t670.decreasing.mean, 2)} decreasing groups among the
							fully readable ones against {t670.decreasing.observed} (
							{pText(t670.decreasing.pGe)}). Repeated five-value patterns first
							appear significant, {t670.patterns.observed} among the{" "}
							{fullGroups.length} full groups against{" "}
							{fmt(t670.patterns.mean, 2)} expected ({pText(t670.patterns.pGe)}
							), but a shuffle that keeps each group's own five values expects{" "}
							{fmt(t670.patternsWithinGroup.mean, 2)} (
							{pText(t670.patternsWithinGroup.pGe)}
							): the repeats come from groups sharing the same handful of
							values, not from a repeated ordered code.{" "}
							<Conf level="likely">Fieldmarks at chance level</Conf>
						</p>
						<p>
							The same holds for KH0034's cycles, whose sums run from{" "}
							{Math.min(
								...cycles.map((c) =>
									c.reduce((s, x) => s + readValue(x.cord), 0),
								),
							)}{" "}
							to{" "}
							{Math.max(
								...cycles.map((c) =>
									c.reduce((s, x) => s + readValue(x.cord), 0),
								),
							)}{" "}
							with no fixed value, and whose white triplet equals its
							light-brown quintet in{" "}
							{
								cycles.filter((c) => {
									const w = c
										.filter((s) => s.pos < 3)
										.reduce((s, x) => s + readValue(x.cord), 0);
									const l = c
										.filter((s) => s.pos >= 3)
										.reduce((s, x) => s + readValue(x.cord), 0);
									return w === l;
								}).length
							}{" "}
							of {cycles.length} cycles. Neither khipu shows sums.
						</p>
					</Prose>
					<Wide caption="The shuffle tests in one place: each statistic as observed, its mean over the shuffles, and the share of shuffles that reach it (P). Free shuffles permute the readable values; stratified shuffles keep each value in its part or its group.">
						<div className="ledger">
							<table className="ledger-table">
								<thead>
									<tr>
										<th>Khipu</th>
										<th>Statistic</th>
										<th className="num">Observed</th>
										<th className="num">Shuffle mean</th>
										<th className="num">P</th>
									</tr>
								</thead>
								<tbody>
									{testRows.map((r) => (
										<tr key={`${r.id}-${r.label}`}>
											<td className="muted">{r.id}</td>
											<td>{r.label}</td>
											<td className="num">{r.obs}</td>
											<td className="num">{r.mean}</td>
											<td className="num">{r.p}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</Wide>
				</Step>

				<Step n={7} title="Relatives, dates, open questions">
					<Prose>
						<p>
							A screen over the corpus (scripts/registers_analysis.py) takes
							every khipu with 100 or more pendants, 124 of the 684, and keeps
							those whose knotted cords, at every level, read 5 or less at least
							95 per cent of the time. Five pass: these two and three others,
							profiled below. KH0084 from the {profiles[2].provenance}, in a
							private collection whose present location is unknown, keeps most
							of its knots on its {profiles[2].subsidiaries} subsidiaries in{" "}
							{profiles[2].colours} colours; KH0239 from{" "}
							{profiles[3].provenance} carries {profiles[3].subsidiaries}{" "}
							subsidiaries on {profiles[3].pendants} pendants, knotted at both
							levels; KH0297 from {profiles[4].provenance}, in the Puruchuco
							museum, has {profiles[4].colours} colours on{" "}
							{profiles[4].pendants} pendants. The screen matches a value
							profile, not a construction type: whether the three belong with
							these two or only share small values is open.{" "}
							<Conf level="open">Relatives</Conf>
						</p>
					</Prose>
					<Wide caption="The five khipus that pass the small-value screen. Level-one cords and subsidiaries as recorded; knotted cords at every level with the share reading 5 or less and 2 or less; the register is the height of figure-eight and long knots on level-one cords.">
						<div className="ledger">
							<table className="ledger-table">
								<thead>
									<tr>
										<th>Khipu</th>
										<th>Provenance</th>
										<th className="num">Level-1 cords (top excluded)</th>
										<th className="num">Subsidiaries</th>
										<th className="num">Knotted</th>
										<th className="num">≤ 5</th>
										<th className="num">≤ 2</th>
										<th className="num">Colours</th>
										<th>Group sizes</th>
										<th>Register, cm</th>
									</tr>
								</thead>
								<tbody>
									{profiles.map((p) => (
										<tr key={p.id}>
											<td>
												<Link to="/khipus/$id" params={{ id: p.id }}>
													{p.id}
												</Link>{" "}
												<span className="muted">{p.alias}</span>
											</td>
											<td>{p.provenance}</td>
											<td className="num">{p.pendants}</td>
											<td className="num">{p.subsidiaries}</td>
											<td className="num">{p.knotted}</td>
											<td className="num">{fmt(100 * p.shareLe5)} %</td>
											<td className="num">{fmt(100 * p.shareLe2)} %</td>
											<td className="num">{p.colours}</td>
											<td>{p.groupSizes}</td>
											<td>
												{fmt(p.register.mean)} ± {fmt(p.register.sd)}{" "}
												<span className="muted">(n {p.register.n})</span>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</Wide>
					<Prose>
						<p>
							Both khipus were dated in the same radiocarbon study, Cherkinsky
							and Urton's of 2014. Their Table 1 gives the Peabody sample{" "}
							{RADIOCARBON.KH0034.lab} as {RADIOCARBON.KH0034.bp} ±{" "}
							{RADIOCARBON.KH0034.pm} BP, calibrated {RADIOCARBON.KH0034.cal2}{" "}
							AD at two sigma, and the Carlos sample {RADIOCARBON.KH0670.lab} as{" "}
							{RADIOCARBON.KH0670.bp} ± {RADIOCARBON.KH0670.pm} BP,{" "}
							{RADIOCARBON.KH0670.cal2} AD, which the text gives as{" "}
							{RADIOCARBON.KH0670.text} "without provenance". The Peabody
							accession is printed there as {RADIOCARBON.KH0034.sample}; the
							museum number is {a.museum.number}, and the identification rests
							on the Field Guide citing that paper for KH0034 and on the other
							Peabody samples in the table matching Peabody khipus. The Open
							Khipu Repository has no date for either. The paper concludes that
							radiocarbon cannot separate Inka from early colonial khipus; both
							ranges straddle 1532, so neither can be called pre-conquest.{" "}
							<Conf level="firm">Dates as published</Conf>
						</p>
					</Prose>
					<Wide>
						<Layers
							heading="KH0034 and KH0670, read in layers"
							layers={explain({
								a,
								b,
								nA,
								nB,
								histA,
								histB,
								posA,
								subs,
								versoA: attachA.get("V") ?? 0,
								nGroups: groups.length,
								nFull: fullGroups.length,
								topValue: top?.value ?? 0,
							})}
						/>
					</Wide>
					<Prose>
						<p>
							Open questions. What is counted on either khipu, and by whom, is
							not recorded. On KH0034 the value depends on template position
							(the first white cord never above {posA[0].max}, the middle
							light-brown positions carrying most knots), but what the white
							triplet and light-brown quintet distinguish is open: the triplet
							may label the quintet or be entries of another kind. Also open:
							what the subsidiaries add, why the dark-brown ones are stubs, and
							what the eight recto pendants, one whole triplet among them, mark.
							On KH0670 the top cord is not a surviving total; why the groups
							differ in weight is unknown; and a flipped attachment does not
							settle whether the three parts are one document. The Field Guide's
							bibliography shows KH0034 described and pictured since 1981 and
							KH0670 studied in an undergraduate thesis; no published reading of
							either could be fetched. What they are not: binary, ledgers of
							sums, or decimal beyond one top cord. They are consistent with
							registers of small counts, varying by column on one and by row on
							the other. <Conf level="open">What was counted</Conf>
						</p>
					</Prose>
				</Step>

				<Sources
					items={[
						{
							who: "Khipu Field Guide",
							what: "Catalogue page KH0034 (UR1032, AS032): Ascher notes, bibliography, fieldmark counts",
							where: "khipufieldguide.com",
							href: "https://www.khipufieldguide.com/catalog/KH0034.html",
						},
						{
							who: "Khipu Field Guide",
							what: "Catalogue page KH0670 (QU024): Quave thesis note, bibliography, fieldmarks",
							where: "khipufieldguide.com",
							href: "https://www.khipufieldguide.com/catalog/KH0670.html",
						},
						{
							who: "Khipu Field Guide",
							what: "Fieldmark notebooks: Group Sum Bands and Ascher Decreasing Group pages for KH0670",
							where: "khipufieldguide.com/notebook/fieldmarks",
							href: "https://www.khipufieldguide.com/notebook/fieldmarks/group_sum_bands/html/KH0670.html",
						},
						{
							who: "Marcia Ascher and Robert Ascher",
							what: "Code of the Quipu: Databook (1978), entry AS32, pp. 124–153",
							where:
								"Cornell, courses.cit.cornell.edu/quipu — scanned PDF; cord listing 1–405 and observations 1–8 (pp. 128–153)",
							href: "https://courses.cit.cornell.edu/quipu/data/as32.pdf",
						},
						{
							who: "Alexander Cherkinsky and Gary Urton",
							what: "Radiocarbon chronology of Andean khipus",
							where:
								"Open Journal of Archaeometry 2:5260 (2014), pp. 32–36, Table 1 rows UGAMS-4276 and AA-64905 — Harvard DASH",
							href: "https://dash.harvard.edu/server/api/core/bitstreams/7312037d-8665-6bd4-e053-0100007fdf3b/content",
						},
						{
							who: "Open Khipu Repository",
							what: "khipu_main row for UR1032 (KH0034): no earliest or latest age; QU024 absent",
							where: "khipu.db, local copy",
						},
						{
							who: "Kylie E. Quave",
							what: "An Empire Written in String: Inka and Inka-related Khipu in Context (2005 Emory thesis); Confronting Anomaly in the Khipu Structure (2009) pp. 241–251; The Inka khipu, Smarthistory (2022)",
							where: "cited on the Field Guide's KH0670 page; not fetched",
						},
						{
							who: "Marcia Ascher and Robert Ascher",
							what: "Code of the Quipu: A Study in Media, Mathematics, and Culture (1981) pp. 15, 86, fig. 5.8",
							where: "cited on the Field Guide's KH0034 page; not fetched",
						},
						{
							who: "Gary Urton",
							what: "Inka History in Knots (2017) pp. 262–263",
							where: "cited on both Field Guide pages; not fetched",
						},
					]}
				/>
				<Legend
					items={[
						{ color: hexFor("W", colors), label: "W white", outline: true },
						{ color: hexFor("LB", colors), label: "LB light brown" },
						{ color: hexFor("DB", colors), label: "DB dark brown" },
						{ color: hexFor("YB", colors), label: "YB yellowish brown" },
					]}
				/>
			</div>
		</StoryPage>
	);
}

function explain({
	a,
	b,
	nA,
	nB,
	histA,
	histB,
	posA,
	subs,
	versoA,
	nGroups,
	nFull,
	topValue,
}: {
	a: Khipu;
	b: Khipu;
	nA: number;
	nB: number;
	histA: Map<number, number>;
	histB: Map<number, number>;
	posA: ReturnType<typeof positionTable34>;
	subs: ReturnType<typeof subStats34>;
	versoA: number;
	nGroups: number;
	nFull: number;
	topValue: number;
}): Layer[] {
	const hot = [...posA].sort((x, y) => y.mean - x.mean)[0];
	return [
		{
			title: "Observed",
			body: (
				<>
					{a.id}: {a.stats.nCords} cords on a {a.primary.length} cm white
					primary, {a.stats.nSubsidiaries} of them subsidiaries; two pendant
					colours in a three-and-five cycle; five looped markers; S-twist
					throughout where recorded, {versoA} pendants verso. {b.id}:{" "}
					{b.stats.nCords} level-one cords on a {b.primary.length} cm
					yellow-brown primary in three parts, all one colour, {nGroups} groups
					of five and one top cord of {topValue}. Recorded by the Aschers and
					Urton; by Quave.
				</>
			),
			level: "firm",
		},
		{
			title: "Derived",
			body: (
				<>
					Readable pendants {nA} and {nB}; of them{" "}
					{pct(
						count(histA, (v) => v <= 2),
						nA,
					)}{" "}
					and{" "}
					{pct(
						count(histB, (v) => v <= 2),
						nB,
					)}{" "}
					read 0–2, maxima {Math.max(...histA.keys())} and{" "}
					{Math.max(...histB.keys())}. One knot register per khipu, no tens
					place on any pendant; 1 as a figure-eight, 2–6 as a long knot. {a.id}{" "}
					organised by template position (position {hot.pos + 1} hottest, mean{" "}
					{fmt(hot.mean, 2)}; position 1 never above {posA[0].max});
					subsidiaries {subs.knotted} of {subs.readable} knotted, on white
					cords. {b.id} organised by group ({nFull} full groups, sum variance
					beyond every one of the shuffles), not by position. No sums; the top
					cord is not a total.
				</>
			),
			level: "likely",
		},
		{
			title: "Context",
			body: (
				<>
					Nazca for KH0034, nothing for KH0670. Both dated by Cherkinsky & Urton
					2014 to ranges spanning the conquest (2σ {RADIOCARBON.KH0034.cal2} and{" "}
					{RADIOCARBON.KH0670.cal2} AD). The Aschers' Databook observations
					describe the khipu and offer no reading; the Field Guide lists
					descriptions and pictures but no decipherment we could fetch. Three
					other large khipus share the value profile; whether they share the
					construction is open.
				</>
			),
			level: "firm",
		},
		{
			title: "Interpretation",
			body: "One reading: registers of small counts over a fixed template, kept as marks rather than amounts. On KH0034 each slot of an eight-cord cycle may record a count, with the slot mattering more than the cycle; on KH0670 the group of five may be the unit. What is tallied, what the colours and parts distinguish, and what 336 refers to are unknown.",
			level: "open",
		},
	];
}
