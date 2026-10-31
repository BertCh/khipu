import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import DotRows, { DotKey, type DotRow } from "#/components/charts/DotRows";
import { useMeasure } from "#/components/charts/useMeasure";
import { EvidenceDeck } from "#/components/story/CrossLink";
import {
	Conf,
	type Confidence,
	LayerTabs,
	Prose,
	Sources,
	Step,
	StoryPage,
	Wide,
} from "#/components/story/Story";
import StrandWeave from "#/components/story/StrandWeave";
import { getKhipuIndex, getKhipus, readJson } from "#/lib/khipu/data";
import {
	CHANCE_JSON,
	type ChanceData,
	DEMO_IDS,
	type DemoId,
	FIXED,
	type KhipuScore,
	lowerP,
	pendantSums,
	pendantValues,
	REJOIN_ID,
	RELATIONS,
	shuffled,
	upperP,
} from "#/lib/stories/chance";
import { type ScanFile, shortAlias } from "#/lib/stories/links";
import "#/styles/stories/what-chance-can-do.css";

/** Step 8's two woven pairs: a firm account and an unexamined run of five. */
const WEAVE_FIRM = { top: "KH0097", bottom: "KH0586" } as const;
const WEAVE_SCAN = { top: "KH0228", bottom: "KH0424" } as const;

export const Route = createFileRoute("/stories/what-chance-can-do")({
	loader: async () => {
		const [data, khipus, scan, index] = await Promise.all([
			readJson<ChanceData>(CHANCE_JSON),
			getKhipus([...DEMO_IDS]),
			// the network scan's shuffled floor (Step 8); the page stands without it
			readJson<ScanFile>("stories/links.json").catch(() => null),
			getKhipuIndex().catch(() => []),
		]);
		const names: Record<string, string> = {};
		for (const k of index)
			if (
				[WEAVE_FIRM, WEAVE_SCAN].some(
					(w) => w.top === k.id || w.bottom === k.id,
				)
			)
				names[k.id] = shortAlias(k);
		return { data, khipus, scan, names };
	},
	head: () => ({ meta: [{ title: "What chance can do — Khipu" }] }),
	component: WhatChanceCanDo,
});

const n = (x: number) => Math.round(x).toLocaleString();
const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
const times = (x: number) => `${x.toFixed(x >= 2 ? 1 : 2)}×`;
const pFmt = (p: number) => (p < 0.01 ? "< 0.01" : p.toFixed(2));

// ---------------------------------------------------------------- between khipus

const RUN_LABEL = { "6": "six or more", "5": "five", "4": "four" } as const;

/** The /network scan's floor: pairs by longest shared run, against shuffles. */
function ChanceBetweenKhipus({
	scan,
	names,
}: {
	scan: ScanFile;
	names: Record<string, string>;
}) {
	const b = scan.baseline;
	const one = (v: number) => (v < 10 ? v.toFixed(1) : n(v));
	const rows: DotRow[] = (["6", "5", "4"] as const).map((k) => {
		const f = b[k];
		// within twice the shuffled mean: what values alone produce
		const nearChance = f.observed < 2 * f.shuffled;
		return {
			key: k,
			label: `Longest shared run ${k === "6" ? "≥ 6" : `= ${k}`}`,
			sub: `values in order, ${RUN_LABEL[k]}`,
			value: f.observed,
			ref: f.shuffled,
			note: `${f.observed} vs ${one(f.shuffled)}`,
			emphasis: k === "6",
			muted: nearChance,
			tip: (
				<>
					<div className="chart-tip-title">
						Longest run {k === "6" ? "of six or more" : `of ${RUN_LABEL[k]}`}
					</div>
					<div className="chart-tip-row">
						<strong>{f.observed}</strong>
						<span>pairs of khipus in the corpus</span>
					</div>
					<div className="chart-tip-row">
						<strong>{one(f.shuffled)}</strong>
						<span>on average in {scan.shuffles} shuffled corpora</span>
					</div>
				</>
			),
		};
	});
	const max = Math.max(...rows.map((r) => r.value), 1);
	const top = Math.ceil(max / 10) * 10;
	const ticks = Array.from({ length: top / 10 + 1 }, (_, i) => i * 10);
	const nm = (id: string) => names[id] ?? id;
	return (
		<Step n={8} title="Chance between khipus">
			<Prose>
				<p>
					The same check applies between khipus. The{" "}
					<Link to="/network">network page</Link> links khipus that share a run
					of values in the same order, found by a scan of every pair. Its floor
					comes from running the scan again on {scan.shuffles} copies of the
					corpus with every khipu&rsquo;s values shuffled. The shuffle is
					different from the one above: values move between khipus, not only
					between the cords of one khipu.
				</p>
				<p>
					Pairs whose longest shared run is six values or more:{" "}
					{b["6"].observed} in the corpus, {one(b["6"].shuffled)} on average in
					the shuffles. A longest run of five: {b["5"].observed} against{" "}
					{one(b["5"].shuffled)}. A longest run of four: {b["4"].observed}{" "}
					against {one(b["4"].shuffled)}, close to chance. Most of those are
					what the values produce on their own, with perhaps a real pair or two
					among them. <Conf level="firm">Runs of six are not chance</Conf>
				</p>
				<p>
					The floor rests on only {scan.shuffles} shuffled corpora, so it is a
					rough mean, not a band: the count for runs of four moves by several
					pairs from one shuffle to the next. {DEMO_IDS[0]}, the khipu of Step
					2, shares a run of four with three other khipus. None of them has been
					examined, and the network does not draw them unless asked (
					<Link to="/network" search={{ run: 4 }}>
						runs of four
					</Link>
					).
				</p>
			</Prose>
			<Wide
				caption={
					<>
						Pairs of khipus by the longest run of level-1 values they share in
						order (forward or with one khipu reversed), from{" "}
						<code>scripts/build_links.py</code>. Ring: the mean over{" "}
						{scan.shuffles} corpora with the values shuffled across khipus. Grey
						dot: within twice the shuffled count.
					</>
				}
			>
				<DotRows
					rows={rows}
					domain={[0, top]}
					ticks={ticks}
					format={(v) => String(v)}
					axisLabel="pairs of khipus"
				/>
				<DotKey
					observed="pairs found"
					ring={`mean of ${scan.shuffles} shuffled corpora`}
				/>
			</Wide>
			<Prose>
				<p>
					What the two ends of the scale look like, cord by cord. Above, the
					account Paris and Lima both hold ({nm(WEAVE_FIRM.top)} over{" "}
					{nm(WEAVE_FIRM.bottom)}): runs of six recur along both khipus, and
					read field by field they agree. Below, a run of five no one has read (
					{nm(WEAVE_SCAN.top)} over {nm(WEAVE_SCAN.bottom)}, one of them
					reversed), drawn grey: five values in a row, where a shuffled corpus
					holds {one(b["5"].shuffled)} such pairs on average.
				</p>
			</Prose>
			<div className="wcc-weaves">
				<StrandWeave
					variant="divider"
					top={[WEAVE_FIRM.top]}
					bottom={[WEAVE_FIRM.bottom]}
					names={names}
				/>
				<StrandWeave
					variant="divider"
					top={[WEAVE_SCAN.top]}
					bottom={[WEAVE_SCAN.bottom]}
					reversed={[WEAVE_SCAN.bottom]}
					names={names}
					includeScan
				/>
			</div>
		</Step>
	);
}

// ---------------------------------------------------------------- scatter

/** Every khipu: sums found (y) against the mean of its shuffles (x), log(1+n) axes. */
function ExcessScatter({
	rows,
	mark,
}: {
	rows: KhipuScore[];
	mark: Set<string>;
}) {
	const [hover, setHover] = useState<string | null>(null);
	const W = 560;
	const H = 380;
	const L = 46;
	const B = 36;
	const T = 24;
	const Rt = 14;
	const max = Math.max(...rows.map((r) => Math.max(r[3], r[4])));
	const lg = (v: number) => Math.log10(1 + v);
	const sx = (v: number) => L + (lg(v) / lg(max)) * (W - L - Rt);
	const sy = (v: number) => T + (1 - lg(v) / lg(max)) * (H - B - T);
	const ticks = [0, 3, 10, 30, 100, 300, 1000].filter((t) => t <= max);
	const hovered = rows.find((r) => r[0] === hover);
	const sig = (r: KhipuScore) => r[6] <= 0.01;
	// draw grey first, then the significant ones, then the marked ones on top
	const ordered = [...rows].sort(
		(a, b) =>
			Number(sig(a)) - Number(sig(b)) ||
			Number(mark.has(a[0])) - Number(mark.has(b[0])),
	);
	return (
		<div className="wcc-plot-wrap">
			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="wcc-plot"
				role="img"
				aria-label={`Scatter of ${rows.length} khipus: sums found against sums found in shuffled copies of the same khipu`}
				onPointerLeave={() => setHover(null)}
			>
				{ticks.map((t) => (
					<g key={t}>
						<line
							x1={L}
							x2={W - Rt}
							y1={sy(t)}
							y2={sy(t)}
							className="wcc-grid"
						/>
						<text x={L - 6} y={sy(t) + 3} textAnchor="end" className="wcc-tk">
							{t.toLocaleString()}
						</text>
						<text
							x={sx(t)}
							y={H - B + 16}
							textAnchor="middle"
							className="wcc-tk"
						>
							{t.toLocaleString()}
						</text>
					</g>
				))}
				<line
					x1={sx(0)}
					y1={sy(0)}
					x2={sx(max)}
					y2={sy(max)}
					className="wcc-diag"
				/>
				<text x={W - Rt} y={sy(10)} className="wcc-tk" textAnchor="end">
					↖ diagonal: as many as chance
				</text>
				<text x={L} y={12} className="wcc-axis-t">
					sums found on the khipu ↑
				</text>
				<text x={W - Rt} y={H - 4} textAnchor="end" className="wcc-axis-t">
					average of its shuffled copies →
				</text>
				{ordered.map((r) => {
					const marked = mark.has(r[0]);
					const isHover = hover === r[0];
					return (
						<circle
							key={r[0]}
							cx={sx(r[4])}
							cy={sy(r[3])}
							r={marked || isHover ? 6 : 4}
							className={`wcc-pt${sig(r) ? " is-sig" : ""}${marked ? " is-marked" : ""}${isHover ? " is-hover" : ""}`}
							onPointerEnter={() => setHover(r[0])}
						>
							<title>
								{r[0]}: {r[3]} sums, {r[4]} expected by chance
							</title>
						</circle>
					);
				})}
			</svg>
			<div className="wcc-plot-caption" aria-live="polite">
				{hovered ? (
					<>
						<strong>{hovered[0]}</strong> · {hovered[1]} pendants · mean value{" "}
						{n(10 ** hovered[2])} · {hovered[3]} sums against {hovered[4]} in
						shuffles · z {hovered[5].toFixed(1)} · p {pFmt(hovered[6])}
					</>
				) : (
					<>
						Hover a dot for the khipu. Blue: more sums than 99% of its shuffles.
						Ringed: {[...mark].join(" and ")}.
					</>
				)}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------- demo

const DEMO_LABEL: Record<DemoId, string> = {
	KH0698: "KH0698 · most sums in the paper",
	KH0081: "KH0081 · the Cacatilla ledger",
};

function Barcode({ values, sumAt }: { values: number[]; sumAt: Set<number> }) {
	const { ref, width } = useMeasure<HTMLDivElement>(640);
	const H = 64;
	const maxLog = Math.log10(1 + Math.max(1, ...values));
	const step = width / values.length;
	const w = Math.max(0.6, Math.min(4, step - (step > 2.5 ? 1 : 0)));
	return (
		<div ref={ref} className="wcc-barcode">
			<svg
				width={width}
				height={H}
				viewBox={`0 0 ${width} ${H}`}
				role="img"
				aria-label={`${values.length} pendant values in order; ${sumAt.size} are sums of a run of neighbours`}
			>
				<line
					x1={0}
					x2={width}
					y1={1}
					y2={1}
					stroke="var(--rule)"
					strokeWidth={1.5}
				/>
				{values.map((v, i) => {
					const h = 4 + (Math.log10(1 + v) / maxLog) * (H - 8);
					return (
						<rect
							// biome-ignore lint/suspicious/noArrayIndexKey: cords are positional
							key={i}
							x={i * step + (step - w) / 2}
							y={2}
							width={w}
							height={v > 0 ? h : 3}
							rx={Math.min(1, w / 2)}
							fill={sumAt.has(i) ? "var(--series-1)" : "var(--series-context)"}
							opacity={v > 0 ? 1 : 0.4}
						/>
					);
				})}
			</svg>
		</div>
	);
}

/** Stacked dots: each shuffle is one dot in its count's column; the real count is a line. */
function NullStrip({
	nulls,
	mine,
	obs,
}: {
	nulls: number[];
	mine: number[];
	obs: number;
}) {
	const { ref, width } = useMeasure<HTMLDivElement>(640);
	const all = [...nulls, ...mine, obs];
	const lo = Math.min(...all);
	const hi = Math.max(...all);
	const r = 3.2;
	const cols = Math.max(10, Math.floor((width - 24) / (2 * r + 1)));
	const bin = Math.max(1, Math.ceil((hi - lo + 1) / cols));
	const nb = Math.floor((hi - lo) / bin) + 1;
	const sx = (v: number) =>
		12 + ((Math.floor((v - lo) / bin) + 0.5) / nb) * (width - 24);
	const heights = new Map<number, number>();
	const place = (v: number) => {
		const b = Math.floor((v - lo) / bin);
		const k = heights.get(b) ?? 0;
		heights.set(b, k + 1);
		return k;
	};
	const pts = [
		...nulls.map((v) => ({ v, k: place(v), mine: false })),
		...mine.map((v) => ({ v, k: place(v), mine: true })),
	];
	const tallest = Math.max(1, ...heights.values());
	const base = 22 + tallest * (2 * r + 1);
	const H = base + 30;
	const ticks = [lo, Math.round((lo + hi) / 2), hi];
	return (
		<div ref={ref} className="wcc-strip">
			<svg
				width={width}
				height={H}
				viewBox={`0 0 ${width} ${H}`}
				role="img"
				aria-label={`Pendant-pendant sums in ${nulls.length} shuffled copies, from ${Math.min(...nulls)} to ${Math.max(...nulls)}; the khipu as tied has ${obs}`}
			>
				<line
					x1={12}
					x2={width - 12}
					y1={base + 1}
					y2={base + 1}
					stroke="var(--rule)"
				/>
				{pts.map((p, i) => (
					<circle
						// biome-ignore lint/suspicious/noArrayIndexKey: dots are positional
						key={i}
						cx={sx(p.v)}
						cy={base - r - p.k * (2 * r + 1)}
						r={r}
						className={p.mine ? "wcc-mine" : "wcc-null"}
					/>
				))}
				<line
					x1={sx(obs)}
					x2={sx(obs)}
					y1={14}
					y2={base + 1}
					stroke="var(--series-1)"
					strokeWidth={2}
				/>
				<text
					x={sx(obs)}
					y={10}
					textAnchor={
						sx(obs) > width - 90 ? "end" : sx(obs) < 90 ? "start" : "middle"
					}
					className="wcc-strip-label"
				>
					as tied: {obs}
				</text>
				{ticks.map((t) => (
					<text
						key={t}
						x={sx(t)}
						y={base + 18}
						textAnchor="middle"
						className="wcc-tk"
					>
						{t}
					</text>
				))}
			</svg>
		</div>
	);
}

function ShuffleDemo({
	values: valuesById,
	data,
}: {
	values: Record<DemoId, number[]>;
	data: ChanceData;
}) {
	const [id, setId] = useState<DemoId>("KH0698");
	const [seed, setSeed] = useState(0);
	const [mine, setMine] = useState<Record<DemoId, number[]>>({
		KH0698: [],
		KH0081: [],
	});
	const original = valuesById[id];
	const values = useMemo(
		() => (seed === 0 ? original : shuffled(original, seed * 7919 + 13)),
		[original, seed],
	);
	const sums = useMemo(() => pendantSums(values), [values]);
	const obsSums = useMemo(() => pendantSums(original).length, [original]);
	const sumAt = useMemo(() => new Set(sums.map((s) => s.at)), [sums]);
	const nulls = data.demo[id].null;
	const above = nulls.filter((x) => x >= obsSums).length;
	const below = nulls.filter((x) => x <= obsSums).length;

	const shuffle = () => {
		const next = seed + 1 + Math.floor(Math.random() * 1000);
		const count = pendantSums(shuffled(original, next * 7919 + 13)).length;
		setSeed(next);
		setMine((m) => ({ ...m, [id]: [...m[id], count] }));
	};

	return (
		<div className="wcc-demo">
			<div className="wcc-demo-tools">
				<LayerTabs
					value={id}
					onChange={(v) => {
						setId(v);
						setSeed(0);
					}}
					options={DEMO_IDS.map((d) => ({ value: d, label: DEMO_LABEL[d] }))}
				/>
				<div className="diagram-tools">
					<button type="button" className="btn wcc-shuffle" onClick={shuffle}>
						Shuffle the cords
					</button>
					<button
						type="button"
						className="btn"
						aria-pressed={seed === 0}
						onClick={() => setSeed(0)}
					>
						As tied
					</button>
				</div>
			</div>
			<div className="wcc-demo-count" aria-live="polite">
				<strong>{sums.length}</strong>{" "}
				{seed === 0 ? (
					<>pendant-pendant sums on {id} as tied</>
				) : (
					<>
						sums after shuffle {mine[id].length} (as tied: {obsSums})
					</>
				)}
			</div>
			<Barcode values={values} sumAt={sumAt} />
			<div className="wcc-demo-caption">
				{values.length} pendants in order, bar height by log value; blue cords
				equal the sum of a run of their neighbours.
			</div>
			<NullStrip nulls={nulls} mine={mine[id]} obs={obsSums} />
			<div className="chart-legend">
				<span>
					<i
						className="legend-dot"
						style={{ background: "var(--series-context)" }}
					/>
					{data.R} shuffles, precomputed
				</span>
				<span>
					<i className="legend-dot wcc-legend-mine" />
					your shuffles
				</span>
				<span>
					<i
						className="legend-rect"
						style={{ background: "var(--series-1)" }}
					/>
					as tied
				</span>
			</div>
			<p className="wcc-demo-verdict">
				{above === 0 ? (
					<>
						None of {nulls.length} shuffles reaches {obsSums} (p{" "}
						{pFmt(upperP(obsSums, nulls))}): the order on this khipu makes sums
						that chance does not.
					</>
				) : below === 0 ? (
					<>
						Every one of {nulls.length} shuffles finds more than {obsSums} (p{" "}
						{pFmt(lowerP(obsSums, nulls))}): shuffled, this khipu produces{" "}
						<em>more</em> sums than as tied.
					</>
				) : below < nulls.length / 2 ? (
					<>
						Only {below} of {nulls.length} shuffles find {obsSums} or fewer (p{" "}
						{pFmt(lowerP(obsSums, nulls))}): shuffled, this khipu produces{" "}
						<em>more</em> sums than as tied.
					</>
				) : (
					<>
						{above} of {nulls.length} shuffles find {obsSums} or more: the count
						is what the values alone produce.
					</>
				)}
			</p>
		</div>
	);
}

// ---------------------------------------------------------------- scorecard

const SCORECARD: {
	claim: string;
	paper: string;
	recheck: string;
	level: Confidence;
	verdict: string;
}[] = [
	{
		claim: "Ascher sums on most khipus",
		paper: "74% of 650",
		recheck: "74% as tied, 71% shuffled",
		level: "firm",
		verdict: "Mostly chance",
	},
	{
		claim: "Sum next to its parts",
		paper: "(within relation 1)",
		recheck: "more than shuffles, 27% more",
		level: "firm",
		verdict: "Holds",
	},
	{
		claim: "Top-cord sums",
		paper: "29 khipus",
		recheck: "about 3× shuffles",
		level: "firm",
		verdict: "Holds",
	},
	{
		claim: "Khipus with real arithmetic",
		paper: "—",
		recheck: "about 40 beyond chance",
		level: "firm",
		verdict: "Holds, for fewer khipus",
	},
	{
		claim: "Sums are right-handed",
		paper: "54 / 46",
		recheck: "54 / 46, from falling magnitudes",
		level: "likely",
		verdict: "Real, differently explained",
	},
	{
		claim: "White pendants start sum groups",
		paper: "41% vs 32%",
		recheck: "gone once value size is held fixed",
		level: "likely",
		verdict: "Does not hold",
	},
	{
		claim: "Working vs summary khipus",
		paper: "two classes",
		recheck: "one continuum; excess rises with size",
		level: "likely",
		verdict: "Does not hold",
	},
	{
		claim: "Rejoining by cross-break sums",
		paper: "KH0468 rejoined",
		recheck: "test finds 0 of 197 true joins",
		level: "firm",
		verdict: "Test has no power",
	},
	{
		claim: "Top cords on banded khipus",
		paper: "~96% banded",
		recheck: "65% vs 37% for the rest",
		level: "likely",
		verdict: "Holds",
	},
	{
		claim: "Higher levels carry larger values",
		paper: "hierarchy by magnitude",
		recheck: "10 of 12 linked pairs",
		level: "likely",
		verdict: "Holds",
	},
];

// ---------------------------------------------------------------- page

function WhatChanceCanDo() {
	const { data, khipus, scan, names } = Route.useLoaderData();
	const rel = data.relations;
	const values = useMemo(
		() =>
			Object.fromEntries(
				DEMO_IDS.map((id) => [id, pendantValues(khipus[id])]),
			) as Record<DemoId, number[]>,
		[khipus],
	);

	const ratio = (k: keyof typeof rel) => rel[k].obs / rel[k].null;
	const relRows: DotRow[] = RELATIONS.map((r) => {
		const c = rel[r.key];
		return {
			key: r.key,
			label: r.name,
			sub: r.what,
			value: c.obs / c.null,
			lo: (c.null - 2 * c.sd) / c.null,
			hi: (c.null + 2 * c.sd) / c.null,
			note: `${n(c.obs)} vs ${n(c.null)}`,
			emphasis: r.key === "r1adj" || r.key === "r9",
			tip: (
				<>
					<div className="chart-tip-title">{r.name}</div>
					<div className="chart-tip-row">
						<strong>{n(c.obs)}</strong>
						<span>found on {c.khipus} khipus</span>
					</div>
					<div className="chart-tip-row">
						<strong>{n(c.null)}</strong>
						<span>
							in shuffles (± {n(c.sd)}), on {n(c.nullKhipus)} khipus
						</span>
					</div>
					{r.paper && (
						<div className="chart-tip-row">
							<strong>{r.paper}</strong>
							<span>khipus in the paper's Table 1</span>
						</div>
					)}
				</>
			),
		};
	});

	const h = data.handedness;
	const GRAD_LABEL = {
		decreasing: "Values fall along the cord",
		flat: "No trend",
		increasing: "Values rise along the cord",
	} as const;
	const handRows: DotRow[] = [
		{
			key: "all",
			label: "All pendant-pendant sums",
			sub: `${n(h.n)} sums`,
			value: h.right,
			lo: h.nullRight - 2 * h.nullSd,
			hi: h.nullRight + 2 * h.nullSd,
			note: pct(h.right),
			emphasis: true,
			tip: (
				<>
					<div className="chart-tip-title">All khipus</div>
					<div className="chart-tip-row">
						<strong>{pct(h.right, 1)}</strong>
						<span>right-handed; shuffles {pct(h.nullRight, 1)}</span>
					</div>
				</>
			),
		},
		...h.byGradient.map((g) => ({
			key: g.key,
			label: GRAD_LABEL[g.key],
			sub: `${g.khipus} khipus, ${n(g.sums)} sums`,
			value: g.right,
			note: pct(g.right),
			tip: (
				<>
					<div className="chart-tip-title">{GRAD_LABEL[g.key]}</div>
					<div className="chart-tip-row">
						<strong>{pct(g.right, 1)}</strong>
						<span>
							of {n(g.sums)} sums right-handed, {g.khipus} khipus
						</span>
					</div>
				</>
			),
		})),
	];

	const magRows: DotRow[] = data.magnitude.map((m) => ({
		key: m.label,
		label: `Mean value ${m.label}`,
		sub: `${m.khipus} khipus · ${m.sig} beat chance`,
		value: m.obs / m.null,
		note: `${n(m.obs)} vs ${n(m.null)}`,
		emphasis: m.label === "1,000+",
		tip: (
			<>
				<div className="chart-tip-title">Mean pendant value {m.label}</div>
				<div className="chart-tip-row">
					<strong>{n(m.obs)}</strong>
					<span>sums found</span>
				</div>
				<div className="chart-tip-row">
					<strong>{n(m.null)}</strong>
					<span>in shuffles</span>
				</div>
				<div className="chart-tip-row">
					<strong>
						{m.sig} of {m.khipus}
					</strong>
					<span>khipus beat chance (p ≤ 0.05)</span>
				</div>
			</>
		),
	}));
	const bigBin = data.magnitude[data.magnitude.length - 1];

	const sig01 = data.khipus.filter((r) => r[6] <= 0.01);
	const sig05 = data.khipus.filter((r) => r[6] <= 0.05);
	const top = [...data.khipus].sort((a, b) => b[5] - a[5]).slice(0, 6);
	const k698 = data.khipus.find((r) => r[0] === "KH0698");
	const mark = useMemo(() => new Set<string>(DEMO_IDS), []);
	const any = data.anyRelation;
	const W = FIXED.white;
	const J = FIXED.kh0468;

	return (
		<StoryPage
			kicker="A re-check · September 2026"
			title="What chance can do"
			standfirst={
				<>
					Medrano and Khosla (2024) searched 650 khipus for the sum relations
					Marcia Ascher described and found them on about three quarters. They
					published their data and code, which made this re-check possible. We
					ran the same searches on shuffled copies of each khipu. Most of the
					sums still appear, but some do not, and those are the ones that tell
					us something.
				</>
			}
			meta={
				<>
					<span>
						{data.nKhipus} khipus · {data.R} shuffles each · our port of their
						relations 1–9
					</span>
					<span>scripts/build_chance.py, scripts/mk/</span>
				</>
			}
		>
			<EvidenceDeck
				items={[
					{
						value: `${pct(any.obs / any.of)} · ${pct(any.null / any.of)}`,
						label: "khipus with a sum: as tied · shuffled",
						note: `${any.obs} against ${n(any.null)} of ${any.of}`,
					},
					{
						value: times(ratio("r1")),
						label: "pendant-pendant sums vs chance",
						note: `${n(rel.r1.obs)} against ${n(rel.r1.null)}`,
					},
					{
						value: times(ratio("r9")),
						label: "top-cord sums vs chance",
						note: `${rel.r9.obs} against ${n(rel.r9.null)}`,
					},
					{
						value: sig01.length,
						label: "khipus with more sums than chance",
						note: `p ≤ 0.01; about ${Math.round(data.khipus.length * 0.01)} expected by luck`,
					},
				]}
			/>

			<Step n={1} title="Sums at scale">
				<Prose>
					<p>
						Marcia and Robert Ascher showed in the 1970s that some cords on a
						khipu hold the sum of others. Manuel Medrano and Ashok Khosla
						generalized their observations to nine search rules and ran them on
						650 khipus from the Khipu Field Guide. At least one rule matched on
						74% of the khipus. From this they proposed that a khipu&rsquo;s
						handedness, colours and magnitude sort khipus into working and
						summary accounts, and that sums running across a break could rejoin
						a broken khipu.
					</p>
					<p>
						Their data and code are public (Zenodo and OSF), so the searches can
						be repeated. Our Python port reproduces their instances exactly on
						the {FIXED.port.unchanged} khipus whose records have not changed
						since 2024; the other {FIXED.port.changed} have been edited in the
						Field Guide since then.{" "}
						<Conf level="firm">Port reproduces the paper</Conf>
					</p>
					<p>
						A count of sums is only useful next to what chance would give. A
						khipu with hundreds of small values will contain many cords that
						happen to equal a run of their neighbours. So for each khipu we
						shuffled its pendant cords among its own slots {data.R} times,
						keeping the group sizes, the values, the colours and the
						subsidiaries, and ran the same searches again.
					</p>
				</Prose>
			</Step>

			<Step n={2} title="Shuffle one khipu">
				<Prose>
					<p>
						{k698?.[0]} (AK003, Maiman collection) has more sums than any other
						khipu in the paper&rsquo;s count. Shuffling its cords almost always
						produces <em>more</em> pendant-pendant sums. {DEMO_IDS[1]}, from
						Cacatilla in the Nazca valley, is different: no shuffle comes close
						to the number found on the khipu as tied.{" "}
						<Conf level="firm">Recomputed here, live</Conf>
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Relation 1 is recomputed in your browser from the cords, with the
							same rule as the published code: a pendant over 10 equals the
							first run of at least two following (or preceding) pendants that
							adds up to it. The grey dots are {data.R} shuffles computed by{" "}
							<code>scripts/build_chance.py</code>.
						</>
					}
				>
					<ShuffleDemo values={values} data={data} />
				</Wide>
			</Step>

			<Step n={3} title="Relation by relation">
				<Prose>
					<p>
						Across the corpus, pendant-pendant sums, the most common relation,
						are found {n(rel.r1.obs)} times; the shuffled copies give{" "}
						{n(rel.r1.null)}. Sums by colour exceed chance by{" "}
						{pct(ratio("r2") - 1)} and sums by index by {pct(ratio("r3") - 1)}.
						The share of khipus with at least one relation,{" "}
						{pct(any.obs / any.of)}, falls only to {pct(any.null / any.of)} when
						the cords are shuffled. Most of the 74% is what khipus full of
						numbers produce by chance.{" "}
						<Conf level="firm">Relations 1–3 near chance</Conf>
					</p>
					<p>
						Two patterns do stand well above their shuffles. A sum cord directly
						beside the run it totals is found {n(rel.r1adj.obs)} times against{" "}
						{n(rel.r1adj.null)}. Top cords that total a neighbouring group are
						found {rel.r9.obs} times against {n(rel.r9.null)}, about three times
						chance. These are the placements a recorder would choose, and a
						shuffle breaks them.{" "}
						<Conf level="firm">Adjacent sums and top cords</Conf>
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Each relation&rsquo;s count across {data.nKhipus} khipus, divided
							by the average over {data.R} shuffled copies (log scale). Grey:
							the range of 95% of the shuffles. Relation numbers follow the
							paper&rsquo;s Table 1; relations 6 and 8 were not ported.
						</>
					}
				>
					<DotRows
						rows={relRows}
						domain={[0.85, 4]}
						log
						ticks={[1, 1.5, 2, 3, 4]}
						format={(v) => `${v}×`}
						reference={1}
						referenceLabel="chance"
						axisLabel="found ÷ shuffled"
					/>
					<DotKey observed="found on the khipus" band="95% of shuffles" />
				</Wide>
			</Step>

			<Step n={4} title="The khipus that beat chance">
				<Prose>
					<p>
						Tested one at a time, {sig01.length} khipus have more pendant sums
						(relations 1, 2, 3 and 5) than 99% of their own shuffles, and{" "}
						{sig05.length} more than 95%; at those thresholds about{" "}
						{Math.round(data.khipus.length * 0.01)} and{" "}
						{Math.round(data.khipus.length * 0.05)} would pass by luck. So
						roughly thirty-five to forty khipus carry arithmetic that chance
						does not explain, led by{" "}
						{top
							.slice(0, 4)
							.map((r) => r[0])
							.join(", ")}
						. The khipus with the most sums, {k698?.[0]} among them, mostly sit
						on the diagonal. <Conf level="firm">About forty khipus</Conf>
					</p>
					<p>
						A search the paper did not run points the same way. In{" "}
						<Link to="/stories/totals-that-travel">Totals that travel</Link>, a
						group&rsquo;s total written on its own first cord is found{" "}
						{FIXED.firstCord.obs} times against about {FIXED.firstCord.null} by
						chance, most of them at Inkawasi.{" "}
						<Conf level="firm">First-cord totals</Conf>
					</p>
				</Prose>
				<Wide
					caption={
						<>
							One dot per khipu with pendant values ({data.khipus.length}). A
							dot on the diagonal has as many sums as its shuffles; a dot above
							it has more. Both axes count relations 1, 2, 3 and 5, on a log(1 +
							n) scale.
						</>
					}
				>
					<ExcessScatter rows={data.khipus} mark={mark} />
				</Wide>
			</Step>

			<Step n={5} title="Right-handed, because values fall">
				<Prose>
					<p>
						The paper found that sum cords more often sit to the left of their
						summands, so the sum reads to the right: 54 to 46. We find the same
						split, {pct(h.right)} of {n(h.n)}, where shuffles give{" "}
						{pct(h.nullRight)}. The asymmetry is real.
					</p>
					<p>
						It follows from magnitude rather than a writing direction. On most
						khipus values fall along the primary cord, and a large value can
						only be the sum of smaller ones, which then lie to its right. Where
						values fall, {pct(h.byGradient[0].right)} of sums are right-handed;
						where they rise, only {pct(h.byGradient[2].right)}. Shuffling cords
						only within their groups, which keeps the trend between groups,
						leaves the split almost as it is.{" "}
						<Conf level="likely">Handedness = magnitude gradient</Conf>
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Share of pendant-pendant sums whose summands lie to the right.
							Khipus with at least five sums and four groups with values,
							classed by the rank correlation of group position with mean log
							value (below −0.1 falling, above 0.1 rising).
						</>
					}
				>
					<DotRows
						rows={handRows}
						domain={[0.4, 0.65]}
						ticks={[0.4, 0.45, 0.5, 0.55, 0.6, 0.65]}
						format={(v) => pct(v)}
						reference={0.5}
						referenceLabel="even"
						axisLabel="right-handed"
					/>
					<DotKey observed="share right-handed" band="95% of shuffles" />
				</Wide>
			</Step>

			<Step n={6} title="No working and summary classes">
				<Prose>
					<p>
						The paper noticed that khipus with mean values of 1,000 or more have
						almost no internal sums, and proposed that they are summary
						accounts, above the working khipus that check their own figures. The
						mean values form one continuum with no gap between classes. Few sums
						on large-number khipus is also what chance predicts: a run of
						four-digit values rarely adds up to another value on the same khipu.
					</p>
					<p>
						Measured against shuffles, the pattern reverses. Khipus with small
						values have as many sums as chance; khipus averaging {bigBin.label}{" "}
						have {times(bigBin.obs / bigBin.null)} as many, and {bigBin.sig} of{" "}
						{bigBin.khipus} beat chance on their own. Their sums are rare but
						intended. <Conf level="likely">Continuum, not two classes</Conf>
					</p>
				</Prose>
				<Wide
					caption={
						<>
							Sums (relations 1, 2, 3, 5) on khipus with at least ten pendants,
							grouped by the mean of their nonzero pendant values, divided by
							the same count in their shuffles.
						</>
					}
				>
					<DotRows
						rows={magRows}
						domain={[0.85, 2.5]}
						log
						ticks={[1, 1.5, 2, 2.5]}
						format={(v) => `${v}×`}
						reference={1}
						referenceLabel="chance"
						axisLabel="found ÷ shuffled"
					/>
				</Wide>
			</Step>

			<Step n={7} title="Two claims that fell, one test without power">
				<Prose>
					<p>
						<strong>White first cords.</strong> The paper found that sum groups
						start with a white pendant more often than other groups (41% against
						32%). In our port the figures are {pct(W.sumClusters)} and{" "}
						{pct(W.allGroups)}. White pendants carry larger values, and larger
						values are more often sums. Comparing groups within the same khipu
						and value range, the difference is no longer significant (p{" "}
						{W.pWithinKhipuAndValue.toFixed(2)}). The paper&rsquo;s 86% of sum
						groups flanked by knotted groups is {pct(W.flankSum)} here, and{" "}
						{pct(W.flankNonSum)} for groups without sums.{" "}
						<Conf level="likely">Explained by value size</Conf>
					</p>
					<p>
						<strong>Rejoining across a break.</strong> The paper rejoined the
						two parts of {REJOIN_ID} (Berlin VA16135a/b) by sums that cross the
						break. To measure the test&rsquo;s power, we cut{" "}
						{FIXED.joinPower.cuts} intact khipus at their middle group and asked
						whether the halves scored better with each other than with
						same-sized partners. The test recognized {FIXED.joinPower.detected}{" "}
						of {FIXED.joinPower.cuts} true joins. On {REJOIN_ID} itself, A then
						B gives {J.ab} sums and B then A gives {J.ba}; khipus of matching
						size as partners score as high about one time in five (p ≈{" "}
						{J.partnersP.toFixed(1)}). The halves may well belong together, as
						the museum number suggests, but the arithmetic does not show it.{" "}
						<Conf level="firm">No power to rejoin</Conf>
					</p>
				</Prose>
			</Step>

			{scan && <ChanceBetweenKhipus scan={scan} names={names} />}

			<Step n={scan ? 9 : 8} title="Where they were right">
				<Prose>
					<p>
						Top cords are real and belong to a particular form. Khipus with top
						cords are mostly colour-banded, as the paper observed: on average{" "}
						{pct(FIXED.topBanded.withTop)} of their groups are banded rather
						than seriated, against {pct(FIXED.topBanded.rest)} on other khipus,
						and their sums are well above chance. The idea of an accounting
						hierarchy also holds where khipus are linked by shared values: in{" "}
						{FIXED.hierarchy.upperLarger} of {FIXED.hierarchy.pairs} pairs where
						one khipu restates another, the upper one has the larger values.{" "}
						<Conf level="likely">Top cords and banding; hierarchy</Conf>
					</p>
					<p>
						None of this would be known without their corpus-scale search and
						its public code. Shuffled copies of each khipu, the check added
						here, show which sums a recorder placed and which the values produce
						on their own.
					</p>
				</Prose>
				<div className="ledger wcc-score">
					<table className="ledger-table">
						<thead>
							<tr>
								<th>Claim</th>
								<th>Paper</th>
								<th>Against shuffles</th>
								<th>Verdict</th>
							</tr>
						</thead>
						<tbody>
							{SCORECARD.map((s) => (
								<tr key={s.claim}>
									<td>{s.claim}</td>
									<td className="muted">{s.paper}</td>
									<td>{s.recheck}</td>
									<td>
										<Conf level={s.level}>{s.verdict}</Conf>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</Step>

			<Sources
				items={[
					{
						who: "Manuel Medrano & Ashok Khosla (2024)",
						what: "How Can Data Science Contribute to Understanding the Khipu Code?",
						where: "Latin American Antiquity 35(4), doi 10.1017/laq.2024.5",
						href: "https://doi.org/10.1017/laq.2024.5",
					},
					{
						who: "Manuel Medrano & Ashok Khosla",
						what: "data and code for the article",
						where:
							"Zenodo, doi 10.5281/zenodo.10472429; preprint on OSF (rsa95)",
						href: "https://doi.org/10.5281/zenodo.10472429",
					},
					{
						who: "Marcia Ascher & Robert Ascher (1978)",
						what: "Code of the Quipu: Databook",
						where:
							"University of Michigan Press — the sum relations generalized in the paper",
					},
					{
						who: "Gary Urton & Carrie Brezine (2005)",
						what: "Khipu Accounting in Ancient Peru",
						where: "Science 309:1065–1067 — the Puruchuco hierarchy",
					},
					{
						who: "Khipu Field Guide (Ashok Khosla), release of 2026-09-17",
						what: "the khipu databooks every count here is computed from",
						where:
							"scripts/build_chance.py (this page), scripts/mk/mk_sig_*, mk_join_*, mk_type_* (the re-check)",
						href: "https://www.khipufieldguide.com/",
					},
				]}
			/>
		</StoryPage>
	);
}
