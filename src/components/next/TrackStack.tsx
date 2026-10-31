import { useMeasure } from "#/components/charts/useMeasure";
import { hexFor } from "#/lib/khipu/colors";
import type { ColorTable } from "#/lib/khipu/types";
import type { PairSide } from "#/lib/next/pairdata";
import type { StrandThread, ThreadKind } from "#/lib/stories/strands";
import "#/styles/next/pair.css";

export interface TrackStackProps {
	a: PairSide;
	b: PairSide;
	labelA: string;
	labelB: string;
	/** cords [from, to) of each side to draw */
	rangeA: [number, number];
	rangeB: [number, number];
	colors: ColorTable | null;
	/** threads oriented to `a` */
	threads: StrandThread[];
	shown: (v: number) => string;
	blind?: boolean;
	/** reversed pair: draw B's range last cord first so the run lines up */
	mirrorB?: boolean;
}

const ROW = 86;
const BAR = 40;
const LABEL_W = 64;

/** which thread kind touches each cord of one side (first wins, match kinds first) */
function kindByCord(threads: StrandThread[], side: "a" | "b") {
	const rank: Record<ThreadKind, number> = {
		exact: 0,
		sum: 1,
		scaled: 2,
		near: 3,
		differ: 4,
		dropped: 5,
		blank: 6,
	};
	const m = new Map<number, ThreadKind>();
	for (const t of threads)
		for (const i of t[side]) {
			const cur = m.get(i);
			if (cur === undefined || rank[t.kind] < rank[cur]) m.set(i, t.kind);
		}
	return m;
}

/**
 * Two value tracks with one shared cord pitch: per khipu, value bars on a
 * log scale, the cord's colour, its subsidiaries, broken ends, cords whose
 * value differs from their knots, and the kind of thread that reaches it.
 */
export default function TrackStack(p: TrackStackProps) {
	const { ref, width } = useMeasure<HTMLDivElement>(560);
	const na = Math.max(1, p.rangeA[1] - p.rangeA[0]);
	const nb = Math.max(1, p.rangeB[1] - p.rangeB[0]);
	const W = Math.max(200, width);
	const pitch = (W - LABEL_W - 4) / Math.max(na, nb);
	const max = Math.max(
		1,
		...p.a.values.slice(p.rangeA[0], p.rangeA[1]),
		...p.b.values.slice(p.rangeB[0], p.rangeB[1]),
	);
	const logMax = Math.log10(max + 1);
	const kA = kindByCord(p.threads, "a");
	const kB = kindByCord(p.threads, "b");

	const track = (
		s: PairSide,
		label: string,
		range: [number, number],
		kinds: Map<number, ThreadKind>,
		y0: number,
		mirror: boolean,
	) => {
		const n = range[1] - range[0];
		const els = [];
		for (let k = 0; k < n; k++) {
			const i = range[0] + k;
			const pos = mirror ? n - 1 - k : k;
			const x = LABEL_W + pos * pitch;
			const v = s.values[i] ?? 0;
			const h = v > 0 ? Math.max(1.5, (Math.log10(v + 1) / logMax) * BAR) : 0;
			const w = Math.max(0.6, pitch * 0.72);
			const kind = kinds.get(i);
			const colour = s.colour[i];
			const subs = s.subs[i]?.length ?? 0;
			const name = p.blind ? `cord ${i + 1}` : s.names[i];
			els.push(
				<g key={i}>
					<title>
						{`${name} = ${v ? p.shown(v) : "blank"}${
							s.top[i] ? " · top cord" : ""
						}${subs ? ` · ${subs} subsidiar${subs === 1 ? "y" : "ies"}` : ""}${
							s.broken[i] ? " · broken end" : ""
						}${
							s.conflict[i] != null && !p.blind
								? ` · knots read ${s.conflict[i]?.toLocaleString("en")}`
								: ""
						}${kind ? ` · thread: ${kind}` : ""}`}
					</title>
					{/* hit target */}
					<rect
						x={x}
						y={y0}
						width={Math.max(pitch, 1)}
						height={ROW - 12}
						className="ts-hit"
					/>
					{h > 0 && (
						<rect
							x={x}
							y={y0 + BAR - h}
							width={w}
							height={h}
							className={`ts-bar${s.top[i] ? " ts-bar-top" : ""}`}
						/>
					)}
					{colour && p.colors && (
						<rect
							x={x}
							y={y0 + BAR + 3}
							width={w}
							height={6}
							fill={hexFor(colour, p.colors)}
							className="ts-dye"
						/>
					)}
					{subs > 0 && (
						<rect
							x={x + w / 2 - 0.5}
							y={y0 + BAR + 11}
							width={1}
							height={Math.min(3, subs) * 3}
							className="ts-sub"
						/>
					)}
					{s.broken[i] && (
						<path
							d={`M${x} ${y0 + BAR + 22}l${w / 2} -3l${w / 2} 3`}
							className="ts-broken"
						/>
					)}
					{s.conflict[i] != null && (
						<circle
							cx={x + w / 2}
							cy={y0 + BAR - h - 3}
							r={1.8}
							className="ts-conflict"
						/>
					)}
					{kind && (
						<rect
							x={x}
							y={y0 + BAR + 26}
							width={Math.max(pitch, 0.8)}
							height={4}
							className={`ts-kind pd-kind-${kind}`}
						/>
					)}
				</g>,
			);
		}
		const first = p.blind ? `cord ${range[0] + 1}` : s.names[range[0]];
		const last = p.blind ? `cord ${range[1]}` : s.names[range[1] - 1];
		return (
			<g>
				<text x={0} y={y0 + 12} className="ts-label">
					{label}
				</text>
				<text x={0} y={y0 + 26} className="ts-range">
					{mirror ? `${last}…${first}` : `${first}…${last}`}
				</text>
				<line
					x1={LABEL_W}
					x2={LABEL_W + n * pitch}
					y1={y0 + BAR + 0.5}
					y2={y0 + BAR + 0.5}
					className="ts-axis"
				/>
				{els}
			</g>
		);
	};

	const H = ROW * 2 + 6;
	return (
		<div className="ts" ref={ref}>
			<svg
				width={W}
				height={H}
				viewBox={`0 0 ${W} ${H}`}
				role="img"
				aria-label={`Value tracks of ${p.labelA} and ${p.labelB}, cords ${p.rangeA[0] + 1}–${p.rangeA[1]} and ${p.rangeB[0] + 1}–${p.rangeB[1]}`}
			>
				{track(p.a, p.labelA, p.rangeA, kA, 4, false)}
				{track(p.b, p.labelB, p.rangeB, kB, ROW + 6, !!p.mirrorB)}
			</svg>
			<p className="ts-key cell-muted">
				Bars: value on a log scale · strip: the cord's colour · tick:
				subsidiaries · caret: broken end · dot: the knots read a different value
				· coloured base: a thread reaches the cord
				{p.mirrorB ? ` · ${p.labelB} drawn last cord first` : ""}
			</p>
		</div>
	);
}
