import { useMemo, useState } from "react";
import { useMeasure } from "#/components/charts/useMeasure";
import type { SilhouetteCord } from "#/components/khipu/KhipuSilhouette";
import { hexFor } from "#/lib/khipu/colors";
import type { ColorTable, Khipu } from "#/lib/khipu/types";
import "#/styles/threaded.css";

/**
 * One khipu drawn as its silhouette, with the sums a story has checked drawn
 * as threads above the primary cord: a total cord arcs over to the cords it
 * totals, gathering them in a small fan (or a bracket when the summands are a
 * whole group). The same visual language as the /network shelf, turned on
 * one khipu: a thread is a value relationship that has been verified, never a
 * resemblance. Exact is solid, one knot off is dashed, a reading that needs an
 * assumption is dotted, and a sum that was looked for and not found is a grey
 * stub that stops (or, with `to` drawn, a thread broken in the middle).
 *
 * Cord indexes are 0-based positions among the level-1 cords in ordinal
 * order, as in strands.json; subsidiaries fold into their pendant.
 */

export type SelfThreadKind = "exact" | "near" | "reading" | "no";

export interface SelfThread {
	/** stable key; defaults to the from/to indexes */
	key?: string;
	/** the total cord(s) */
	from: number[];
	/** the summands: single cords (fan) or one whole group (bracket) */
	to: number[];
	toKind?: "cords" | "group";
	vFrom: number;
	vTo: number;
	kind: SelfThreadKind;
	/** "no" only: draw the rising stub and nothing at the far end */
	stub?: boolean;
	/** short text printed over the arc, e.g. "6 × 200" */
	label?: string;
	/** what hover and the readout say; defaults to the values */
	title?: string;
}

export interface SilBand {
	/** level-1 cord range [from, to) */
	from: number;
	to: number;
	label: string;
}

export interface SilMark {
	i: number;
	title: string;
}

const KIND_TEXT: Record<SelfThreadKind, string> = {
	exact: "exact",
	near: "one knot off",
	reading: "on a reading",
	no: "no sum found",
};

const PAD = 6;
const LABEL_ROOM = 16;

/** Level-1 cords of a loaded khipu, in order, as silhouette cords. */
export function silhouetteOf(khipu: Khipu): SilhouetteCord[] {
	return level1(khipu).map((c) => ({ length: c.length, color: c.color }));
}

/** Level-1 cords in ordinal order; the index is the thread index. */
export function level1(khipu: Khipu) {
	return khipu.cords
		.filter((c) => c.level === 1)
		.sort((a, b) => a.ordinal - b.ordinal);
}

/** Level-1 index of every cord by name, subsidiaries mapped to their pendant. */
export function level1Index(khipu: Khipu): Map<string, number> {
	const m = new Map<string, number>();
	level1(khipu).forEach((c, i) => {
		m.set(c.name, i);
	});
	const byName = new Map(khipu.cords.map((c) => [c.name, c]));
	for (const c of khipu.cords) {
		if (m.has(c.name)) continue;
		let p = c;
		while (p.parent && !m.has(p.name)) {
			const up = byName.get(p.parent);
			if (!up) break;
			p = up;
		}
		const i = m.get(p.name);
		if (i !== undefined) m.set(c.name, i);
	}
	return m;
}

interface Drawn {
	key: string;
	t: SelfThread;
	arc: string;
	far: string;
	joint: [number, number] | null;
	head: [number, number];
	apex: [number, number];
	title: string;
}

export default function ThreadedSilhouette({
	cords,
	colors,
	threads,
	bands = [],
	marks = [],
	range,
	silHeight = 70,
	arcHeight = 110,
	title,
	legend = true,
	legendText,
	hint = "Hover or tap a thread for its values.",
}: {
	cords: SilhouetteCord[];
	colors: ColorTable;
	threads: SelfThread[];
	bands?: SilBand[];
	/** small glyphs under cords that need a word (e.g. label subsidiaries) */
	marks?: SilMark[];
	/** crop to level-1 cords [from, to) */
	range?: [number, number];
	silHeight?: number;
	arcHeight?: number;
	/** accessible name of the drawing */
	title: string;
	legend?: boolean;
	/** override the legend's words for a kind */
	legendText?: Partial<Record<SelfThreadKind | "stub", string>>;
	hint?: string;
}) {
	const { ref, width } = useMeasure<HTMLDivElement>(900);
	const [active, setActive] = useState<string | null>(null);
	const [r0, r1] = range ?? [0, cords.length];
	const n = Math.max(1, r1 - r0);
	const W = Math.max(200, Math.floor(width));
	const pitch = (W - PAD * 2) / n;
	// narrow screens: shorter arcs, so the figure keeps its proportions
	const arcH = Math.round(Math.min(arcHeight, Math.max(56, W * 0.16)));
	const silH = Math.round(Math.min(silHeight, Math.max(40, W * 0.12)));
	const yP = LABEL_ROOM + arcH;
	const hasBandLabels = bands.length > 0;
	const H = yP + silH + 6 + (marks.length ? 8 : 0) + (hasBandLabels ? 16 : 0);
	const x = (i: number) => PAD + (i - r0 + 0.5) * pitch;
	const inView = (i: number) => i >= r0 && i < r1;

	const shown = useMemo(
		() => cords.slice(r0, r1).map((c, k) => ({ ...c, i: r0 + k })),
		[cords, r0, r1],
	);
	const maxLen = Math.max(1, ...shown.map((c) => c.length ?? 0));
	const sw = Math.max(0.6, Math.min(2.2, pitch * 0.55));

	// biome-ignore lint/correctness/useExhaustiveDependencies: x and inView are rebuilt each render from pitch, r0 and r1
	const drawn = useMemo(() => {
		const out: Drawn[] = [];
		const y0 = yP - 1.5;
		const fan = Math.min(10, Math.max(5, pitch * 1.4));
		const list = threads.filter(
			(t) => t.from.every(inView) && t.to.every(inView),
		);
		const spans = list.map((t) =>
			Math.abs(
				t.from.reduce((a, i) => a + x(i), 0) / t.from.length -
					t.to.reduce((a, i) => a + x(i), 0) / t.to.length,
			),
		);
		const maxSpan = Math.max(1, ...spans);
		list.forEach((t, k) => {
			const key = t.key ?? `${t.from.join(",")}>${t.to.join(",")}`;
			const x0 = t.from.reduce((a, i) => a + x(i), 0) / t.from.length;
			let x1: number;
			let y1: number;
			let far = "";
			let joint: [number, number] | null = null;
			const lo = Math.min(...t.to);
			const hi = Math.max(...t.to);
			if (t.toKind === "group") {
				// a bracket over the whole group
				const xa = x(lo) - pitch * 0.35;
				const xb = x(hi) + pitch * 0.35;
				y1 = yP - fan * 0.8;
				x1 = (xa + xb) / 2;
				far = `M${xa},${y0}L${xa},${y1}L${xb},${y1}L${xb},${y0}`;
				joint = [x1, y1];
			} else if (t.to.length > 1) {
				x1 = t.to.reduce((a, i) => a + x(i), 0) / t.to.length;
				// a wide fan gathers higher, so its branches do not lie flat
				const spread = x(hi) - x(lo);
				y1 = yP - Math.min(arcH * 0.4, Math.max(fan, spread * 0.22));
				for (const i of t.to) {
					const xi = x(i);
					far += `M${x1},${y1}Q${xi},${y1} ${xi},${y0}`;
				}
				joint = [x1, y1];
			} else {
				x1 = x(t.to[0]);
				y1 = y0;
			}
			const span = spans[k];
			// short arcs stay low (a fan reads as a fan), long ones nest by span
			const h = Math.max(
				6,
				Math.min(span * 0.55, 8 + (arcH - 12) * (span / maxSpan) ** 0.65),
			);
			const yc = y0 - (h * 4) / 3;
			const arc = `M${x0},${y0}C${x0},${yc} ${x1},${yc} ${x1},${y1}`;
			const apex: [number, number] = [
				(x0 + x1) / 2,
				0.125 * y0 + 0.75 * yc + 0.125 * y1,
			];
			const vals =
				t.kind === "no"
					? `${t.vFrom} against ${t.vTo}`
					: `${t.vFrom} = ${t.vTo}`;
			out.push({
				key,
				t,
				arc,
				far,
				joint,
				head: [x0, y0],
				apex,
				title: t.title ?? `${vals} (${KIND_TEXT[t.kind]})`,
			});
		});
		// long arcs first, so the short ones draw over them
		return out.sort(
			(a, b) =>
				Math.abs(b.head[0] - b.apex[0]) - Math.abs(a.head[0] - a.apex[0]),
		);
	}, [threads, pitch, yP, arcH, r0, r1]);

	// arc labels, left to right, dropping any that would overlap
	const labels = useMemo(() => {
		const withText = drawn
			.filter((d) => d.t.label)
			.map((d) => ({
				key: d.key,
				x: d.apex[0],
				y: Math.max(11, d.apex[1] - 4),
				text: d.t.label as string,
			}))
			.sort((a, b) => a.x - b.x);
		const out: typeof withText = [];
		const placed: { l: number; r: number; y: number }[] = [];
		for (const l of withText) {
			const half = (l.text.length * 5.6 + 4) / 2;
			const clash = placed.some(
				(p) => l.x - half < p.r && l.x + half > p.l && Math.abs(p.y - l.y) < 12,
			);
			if (clash) continue;
			out.push({ ...l, x: Math.min(W - half, Math.max(half, l.x)) });
			placed.push({ l: l.x - half, r: l.x + half, y: l.y });
		}
		return out;
	}, [drawn, W]);

	const kinds = new Set(
		drawn.map((d) =>
			d.t.kind === "no" && d.t.stub ? "stub" : (d.t.kind as string),
		),
	);
	const current = drawn.find((d) => d.key === active);

	return (
		<div className="thr" ref={ref}>
			<svg
				width={W}
				height={H}
				viewBox={`0 0 ${W} ${H}`}
				role="img"
				aria-label={title}
				className={`thr-svg${active ? " has-active" : ""}`}
				onPointerLeave={() => setActive(null)}
			>
				{bands.map((b) => {
					const a = Math.max(b.from, r0);
					const z = Math.min(b.to, r1);
					if (z <= a) return null;
					const xa = x(a) - pitch / 2;
					const xb = x(z - 1) + pitch / 2;
					return (
						<g key={`${b.from}-${b.label}`} className="thr-band">
							<rect
								x={xa}
								y={yP - 3}
								width={xb - xa}
								height={silH + 7}
								rx={2}
							/>
							<text
								x={(xa + xb) / 2}
								y={H - 4}
								textAnchor="middle"
								className="thr-band-label"
							>
								{b.label}
							</text>
						</g>
					);
				})}
				<line
					x1={PAD - 3}
					x2={W - PAD + 3}
					y1={yP}
					y2={yP}
					className="thr-primary"
				/>
				<g className="thr-cords">
					{shown.map((c) => {
						const xi = x(c.i);
						const h = Math.max(1, ((c.length ?? 0) / maxLen) * silH);
						return (
							<g key={c.i}>
								<line
									x1={xi}
									x2={xi}
									y1={yP + 1}
									y2={yP + 1 + h}
									stroke="var(--cord-casing)"
									strokeWidth={sw + 1}
								/>
								<line
									x1={xi}
									x2={xi}
									y1={yP + 1}
									y2={yP + 1 + h}
									stroke={hexFor(c.color?.split(/[-:%^/(]/)[0], colors)}
									strokeWidth={sw}
								/>
							</g>
						);
					})}
				</g>
				{marks
					.filter((m) => inView(m.i))
					.map((m) => {
						const xi = x(m.i);
						const y = yP + silH + 8;
						return (
							<path
								key={m.i}
								className="thr-mark"
								d={`M${xi},${y - 3.2}L${xi + 3},${y}L${xi},${y + 3.2}L${xi - 3},${y}Z`}
							>
								<title>{m.title}</title>
							</path>
						);
					})}
				<g className="thr-threads">
					{drawn.map((d) => {
						const cls = [
							"thr-thread",
							`thr-${d.t.kind}`,
							d.t.stub ? "thr-stub" : "",
							active === d.key ? "is-active" : "",
						]
							.filter(Boolean)
							.join(" ");
						const showFar = !(d.t.kind === "no" && d.t.stub);
						return (
							// biome-ignore lint/a11y/noStaticElementInteractions: svg hover target; the readout below repeats every value in text
							<g
								key={d.key}
								className={cls}
								onPointerEnter={() => setActive(d.key)}
								onClick={() => setActive(active === d.key ? null : d.key)}
							>
								<title>{d.title}</title>
								<path className="thr-hit" d={d.arc + (showFar ? d.far : "")} />
								<path
									className="thr-line"
									d={d.arc}
									pathLength={d.t.kind === "no" ? 100 : undefined}
								/>
								{showFar && d.far && <path className="thr-far" d={d.far} />}
								{d.t.kind !== "no" && (
									<circle
										className="thr-dot"
										cx={d.head[0]}
										cy={d.head[1]}
										r={1.8}
									/>
								)}
								{d.joint && showFar && d.t.kind !== "no" && (
									<circle
										className="thr-dot"
										cx={d.joint[0]}
										cy={d.joint[1]}
										r={1.8}
									/>
								)}
							</g>
						);
					})}
				</g>
				{labels.map((l) => (
					<text
						key={l.key}
						x={l.x}
						y={l.y}
						textAnchor="middle"
						className={`thr-label${active === l.key ? " is-active" : ""}`}
					>
						{l.text}
					</text>
				))}
			</svg>
			<div className="thr-foot">
				<p className="thr-readout" aria-live="polite">
					{current ? current.title : hint}
				</p>
				{legend && (
					<div className="thr-legend">
						{(["exact", "near", "reading", "no", "stub"] as const)
							.filter((k) => kinds.has(k))
							.map((k) => (
								<span key={k}>
									<svg width={26} height={10} aria-hidden="true">
										<path
											className={`thr-key thr-key-${k}`}
											d={k === "stub" ? "M2,9 Q6,1 25,1" : "M1,5 L25,5"}
											pathLength={k === "no" || k === "stub" ? 100 : undefined}
										/>
									</svg>
									{legendText?.[k] ??
										(k === "stub" ? "no sum found" : KIND_TEXT[k])}
								</span>
							))}
					</div>
				)}
			</div>
		</div>
	);
}
