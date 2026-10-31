import {
	type KeyboardEvent,
	type PointerEvent,
	type RefObject,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useMeasure } from "#/components/charts/useMeasure";
import {
	exactDots,
	nearDots,
	type PairSide,
	rowGhost,
} from "#/lib/next/pairdata";
import {
	type StrandThread,
	THREAD_LABEL,
	type ThreadKind,
} from "#/lib/stories/strands";
import "#/styles/next/pair.css";

/** a window of the dotplot: A cords [x0, x1), B cords [y0, y1) */
export interface PlotView {
	x0: number;
	x1: number;
	y0: number;
	y1: number;
}

/* ─────────── canvas colours from the page tokens ─────────── */

const TOKENS = [
	"--thread-exact",
	"--thread-near",
	"--thread-differ",
	"--thread-sum",
	"--ink",
	"--ink-2",
	"--ink-3",
	"--hairline",
	"--surface",
	"--accent",
	"--null-band",
] as const;
export type Token = (typeof TOKENS)[number];
export type Palette = Record<Token, string>;

const FALLBACK: Palette = {
	"--thread-exact": "#2a5fc4",
	"--thread-near": "#6f82a8",
	"--thread-differ": "#c2662a",
	"--thread-sum": "#2a5fc4",
	"--ink": "#1c1a17",
	"--ink-2": "#57534c",
	"--ink-3": "#8a857c",
	"--hairline": "#dfdcd4",
	"--surface": "#f7f6f3",
	"--accent": "#2a5fc4",
	"--null-band": "rgba(138,133,124,0.16)",
};

function readPalette(el: HTMLElement): Palette {
	const probe = document.createElement("span");
	probe.style.display = "none";
	el.appendChild(probe);
	const out = { ...FALLBACK };
	for (const t of TOKENS) {
		probe.style.color = "";
		probe.style.color = `var(${t})`;
		const c = getComputedStyle(probe).color;
		if (c) out[t] = c;
	}
	probe.remove();
	return out;
}

/**
 * Token colours resolved for a canvas (color-mix included), re-read when the
 * theme attribute or the system scheme changes.
 */
export function usePalette(ref: RefObject<HTMLElement | null>): Palette {
	const [pal, setPal] = useState<Palette>(FALLBACK);
	useEffect(() => {
		const read = () => {
			if (ref.current) setPal(readPalette(ref.current));
		};
		read();
		const mo = new MutationObserver(read);
		mo.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-theme", "class"],
		});
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		mq.addEventListener("change", read);
		return () => {
			mo.disconnect();
			mq.removeEventListener("change", read);
		};
	}, [ref]);
	return pal;
}

const KIND_TOKEN: Record<ThreadKind, Token> = {
	exact: "--thread-exact",
	near: "--thread-near",
	scaled: "--thread-near",
	sum: "--thread-sum",
	differ: "--thread-differ",
	dropped: "--ink-3",
	blank: "--ink-3",
};

/* ─────────── drawing ─────────── */

export interface DotLayer {
	a: ArrayLike<number>;
	b: ArrayLike<number>;
	exact: Int32Array;
	near?: Int32Array;
	ghost?: Float32Array;
	spans?: [number, number, number][];
	dir?: "fwd" | "rev";
	threads?: StrandThread[];
	ic?: (v: number) => number;
}

interface Frame {
	/** plot rect in CSS px */
	left: number;
	top: number;
	w: number;
	h: number;
	view: PlotView;
}

const cellX = (f: Frame, i: number) =>
	f.left + ((i - f.view.x0 + 0.5) / (f.view.x1 - f.view.x0)) * f.w;
const cellY = (f: Frame, j: number) =>
	f.top + ((j - f.view.y0 + 0.5) / (f.view.y1 - f.view.y0)) * f.h;
const inView = (f: Frame, i: number, j: number) =>
	i >= f.view.x0 && i < f.view.x1 && j >= f.view.y0 && j < f.view.y1;

/** Paint a dotplot's layers into `ctx` (CSS px already scaled for DPR). */
export function paintDots(
	ctx: CanvasRenderingContext2D,
	f: Frame,
	d: DotLayer,
	pal: Palette,
	opts: { dotScale?: number; threads?: boolean; selected?: number } = {},
) {
	const nx = f.view.x1 - f.view.x0;
	const ny = f.view.y1 - f.view.y0;
	const cw = f.w / nx;
	const ch = f.h / ny;
	const scale = opts.dotScale ?? 1;
	// the row ghost: where chance matches would land (rows are B's cords)
	if (d.ghost) {
		ctx.fillStyle = pal["--null-band"];
		let max = 0;
		for (let j = f.view.y0; j < f.view.y1; j++) max = Math.max(max, d.ghost[j]);
		if (max > 0)
			for (let j = f.view.y0; j < f.view.y1; j++) {
				const g = d.ghost[j];
				if (!g) continue;
				ctx.globalAlpha = Math.min(1, 0.25 + 0.75 * Math.sqrt(g / max));
				ctx.fillRect(
					f.left,
					f.top + (j - f.view.y0) * ch,
					f.w,
					Math.max(ch, 0.6),
				);
			}
		ctx.globalAlpha = 1;
	}
	// exact runs as thick translucent segments
	if (d.spans?.length) {
		ctx.strokeStyle = pal["--thread-exact"];
		ctx.globalAlpha = 0.28;
		ctx.lineCap = "round";
		ctx.lineWidth = Math.max(4, Math.min(cw, ch) * 1.1) * scale;
		for (const [len, sa, sb] of d.spans) {
			const x0 = f.left + (sa - f.view.x0) * cw;
			const x1 = f.left + (sa + len - f.view.x0) * cw;
			const yA = f.top + (sb - f.view.y0) * ch;
			const yB = f.top + (sb + len - f.view.y0) * ch;
			ctx.beginPath();
			if (d.dir === "rev") {
				ctx.moveTo(x0, yB);
				ctx.lineTo(x1, yA);
			} else {
				ctx.moveTo(x0, yA);
				ctx.lineTo(x1, yB);
			}
			ctx.stroke();
		}
		ctx.globalAlpha = 1;
	}
	// near dots, hollow
	if (d.near) {
		ctx.strokeStyle = pal["--thread-near"];
		ctx.lineWidth = 1;
		const r = Math.max(1, 1.6 * scale);
		for (let k = 0; k < d.near.length; k += 2) {
			const i = d.near[k];
			const j = d.near[k + 1];
			if (!inView(f, i, j)) continue;
			ctx.beginPath();
			ctx.arc(cellX(f, i), cellY(f, j), r, 0, Math.PI * 2);
			ctx.stroke();
		}
	}
	// exact dots, sized by information content
	ctx.fillStyle = pal["--thread-exact"];
	for (let k = 0; k < d.exact.length; k += 2) {
		const i = d.exact[k];
		const j = d.exact[k + 1];
		if (!inView(f, i, j)) continue;
		const bits = d.ic ? d.ic(d.a[i]) : 6;
		const r = (1 + 2.2 * Math.sqrt(Math.max(0, bits) / 13)) * scale;
		// common small values say little: fade them, so rare matches carry the eye
		ctx.globalAlpha = 0.18 + 0.82 * Math.min(1, Math.max(0, bits) / 13) ** 1.5;
		ctx.beginPath();
		ctx.arc(cellX(f, i), cellY(f, j), r, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.globalAlpha = 1;
	if (opts.threads === false || !d.threads) return;
	// strands.json threads
	d.threads.forEach((t, k) => {
		const col = pal[KIND_TOKEN[t.kind]];
		const sel = opts.selected === k;
		ctx.strokeStyle = col;
		ctx.fillStyle = col;
		ctx.lineWidth = sel ? 2.2 : 1.2;
		if (t.a.length === 1 && t.b.length === 1) {
			const i = t.a[0];
			const j = t.b[0];
			if (!inView(f, i, j)) return;
			const x = cellX(f, i);
			const y = cellY(f, j);
			const s = sel ? 5 : 3.2;
			ctx.beginPath();
			ctx.moveTo(x - s, y - s);
			ctx.lineTo(x + s, y + s);
			ctx.moveTo(x - s, y + s);
			ctx.lineTo(x + s, y - s);
			ctx.stroke();
			// a subsidiary end: a half-dot on that side (A → right, B → below)
			if (t.subA?.length || t.subB?.length) {
				ctx.beginPath();
				if (t.subA?.length)
					ctx.arc(x + s + 1.5, y, 2.6, -Math.PI / 2, Math.PI / 2);
				if (t.subB?.length) ctx.arc(x, y + s + 1.5, 2.6, 0, Math.PI);
				ctx.fill();
			}
			return;
		}
		// a sum: a bracket over the summands, a joint dot, a line to the total
		const bSide = t.b.length > 1;
		const many = bSide ? t.b : t.a;
		const one = bSide ? t.a : t.b;
		const at = one.reduce((s, v) => s + v, 0) / one.length;
		if (bSide) {
			const x = cellX(f, at);
			const ys = many.map((j) => cellY(f, j));
			const y0 = Math.min(...ys);
			const y1 = Math.max(...ys);
			const bx = x + 7;
			ctx.beginPath();
			ctx.moveTo(bx, y0);
			ctx.lineTo(bx, y1);
			for (const y of ys) {
				ctx.moveTo(bx, y);
				ctx.lineTo(x, y);
			}
			ctx.stroke();
			ctx.beginPath();
			ctx.arc(bx, (y0 + y1) / 2, sel ? 3.6 : 2.6, 0, Math.PI * 2);
			ctx.fill();
		} else {
			const y = cellY(f, at);
			const xs = many.map((i) => cellX(f, i));
			const x0 = Math.min(...xs);
			const x1 = Math.max(...xs);
			const by = y - 7;
			ctx.beginPath();
			ctx.moveTo(x0, by);
			ctx.lineTo(x1, by);
			for (const x of xs) {
				ctx.moveTo(x, by);
				ctx.lineTo(x, y);
			}
			ctx.stroke();
			ctx.beginPath();
			ctx.arc((x0 + x1) / 2, by, sel ? 3.6 : 2.6, 0, Math.PI * 2);
			ctx.fill();
		}
	});
}

/** A DPR-aware canvas sized to (w, h) CSS px; returns a context or null. */
export function prepCanvas(
	c: HTMLCanvasElement | null,
	w: number,
	h: number,
	sized = true,
): CanvasRenderingContext2D | null {
	if (!c) return null;
	const dpr = Math.min(3, window.devicePixelRatio || 1);
	const W = Math.round(w * dpr);
	const H = Math.round(h * dpr);
	if (c.width !== W) c.width = W;
	if (c.height !== H) c.height = H;
	if (sized) {
		c.style.width = `${w}px`;
		c.style.height = `${h}px`;
	}
	const ctx = c.getContext("2d");
	if (!ctx) return null;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, w, h);
	return ctx;
}

/* ─────────── the component ─────────── */

export interface PairDotplotProps {
	a: PairSide;
	b: PairSide;
	/** exact runs in the (a, b) frame: [len, startA, startB] */
	spans: [number, number, number][];
	dir: "fwd" | "rev";
	/** threads oriented to `a` */
	threads: StrandThread[];
	ic?: (v: number) => number;
	blind?: boolean;
	/** display value in blind mode (a rank) */
	shown: (v: number) => string;
	view: PlotView | null;
	onView: (v: PlotView | null) => void;
	selected?: number;
	onThread: (k: number | undefined) => void;
	/** "A" / "B" in blind mode, else aliases */
	labelA: string;
	labelB: string;
}

const MARGIN = { left: 50, top: 34, right: 8, bottom: 8 };
const LONG = 120;
const MINI = 132;

interface HoverInfo {
	x: number;
	y: number;
	text: string;
}

export default function PairDotplot(p: PairDotplotProps) {
	const { a, b } = p;
	const { ref: wrap, width } = useMeasure<HTMLDivElement>(480);
	const pal = usePalette(wrap);
	const canvas = useRef<HTMLCanvasElement>(null);
	const mini = useRef<HTMLCanvasElement>(null);
	const [hover, setHover] = useState<HoverInfo | null>(null);
	const [brush, setBrush] = useState<{
		sx: number;
		sy: number;
		x: number;
		y: number;
		mini: boolean;
	} | null>(null);

	const layer = useMemo<DotLayer>(
		() => ({
			a: a.values,
			b: b.values,
			exact: exactDots(a.values, b.values),
			near: nearDots(a.values, b.values),
			ghost: rowGhost(b.values, a.values),
			spans: p.spans,
			dir: p.dir,
			threads: p.threads,
			ic: p.ic,
		}),
		[a.values, b.values, p.spans, p.dir, p.threads, p.ic],
	);

	const full: PlotView = useMemo(
		() => ({ x0: 0, x1: a.values.length, y0: 0, y1: b.values.length }),
		[a.values.length, b.values.length],
	);
	const view = p.view ?? full;
	const size = Math.max(200, Math.min(560, Math.floor(width)));
	const frame: Frame = {
		left: MARGIN.left,
		top: MARGIN.top,
		w: size - MARGIN.left - MARGIN.right,
		h: size - MARGIN.top - MARGIN.bottom,
		view,
	};
	const long = a.values.length > LONG || b.values.length > LONG;
	const miniFrame = useMemo<Frame>(
		() => ({ left: 2, top: 2, w: MINI - 4, h: MINI - 4, view: full }),
		[full],
	);

	// main canvas
	// biome-ignore lint/correctness/useExhaustiveDependencies: frame derives from size and view
	useEffect(() => {
		const ctx = prepCanvas(canvas.current, size, size);
		if (!ctx) return;
		ctx.fillStyle = pal["--surface"];
		ctx.fillRect(frame.left, frame.top, frame.w, frame.h);
		ctx.save();
		ctx.beginPath();
		ctx.rect(frame.left, frame.top, frame.w, frame.h);
		ctx.clip();
		paintDots(ctx, frame, layer, pal, {
			selected: p.selected,
			// dots scale with the cell: about a cell wide when zoomed out
			dotScale: Math.min(
				1.4,
				Math.max(
					0.45,
					Math.min(
						frame.w / (frame.view.x1 - frame.view.x0),
						frame.h / (frame.view.y1 - frame.view.y0),
					) / 3.2,
				),
			),
		});
		ctx.restore();
		ctx.strokeStyle = pal["--hairline"];
		ctx.lineWidth = 1;
		ctx.strokeRect(frame.left + 0.5, frame.top + 0.5, frame.w - 1, frame.h - 1);
		// axes: cord names at a few ticks; x along the top, y down the left
		ctx.fillStyle = pal["--ink-2"];
		ctx.font = "10px 'IBM Plex Sans', system-ui, sans-serif";
		const ticks = (n0: number, n1: number, px: number) => {
			const n = n1 - n0;
			const k = Math.max(2, Math.min(6, Math.floor(px / 70)));
			const step = Math.max(1, Math.ceil(n / k));
			const out: number[] = [];
			for (let i = n0; i < n1; i += step) out.push(i);
			return out;
		};
		const nameOf = (s: PairSide, i: number) =>
			p.blind ? String(i + 1) : (s.names[i] ?? String(i + 1));
		ctx.textAlign = "center";
		ctx.textBaseline = "bottom";
		for (const i of ticks(view.x0, view.x1, frame.w)) {
			const x = cellX(frame, i);
			ctx.fillText(nameOf(a, i), x, frame.top - 4);
			ctx.fillRect(x - 0.5, frame.top - 3, 1, 3);
		}
		// axis titles on their own row above the ticks
		ctx.font = "500 10.5px 'IBM Plex Sans', system-ui, sans-serif";
		ctx.fillStyle = pal["--ink"];
		ctx.textBaseline = "top";
		ctx.textAlign = "right";
		ctx.fillText(`${p.labelA} →`, frame.left + frame.w, 1);
		ctx.textAlign = "left";
		ctx.fillText(`${p.labelB} ↓`, 0, 1);
		ctx.font = "10px 'IBM Plex Sans', system-ui, sans-serif";
		ctx.fillStyle = pal["--ink-2"];
		ctx.textAlign = "right";
		ctx.textBaseline = "middle";
		for (const j of ticks(view.y0, view.y1, frame.h)) {
			const y = cellY(frame, j);
			ctx.fillText(nameOf(b, j), frame.left - 5, y);
			ctx.fillRect(frame.left - 3, y - 0.5, 3, 1);
		}
	}, [layer, pal, size, view, p.selected, p.blind, a, b, p.labelA, p.labelB]);

	// minimap
	useEffect(() => {
		if (!long) return;
		const ctx = prepCanvas(mini.current, MINI, MINI);
		if (!ctx) return;
		ctx.fillStyle = pal["--surface"];
		ctx.fillRect(0, 0, MINI, MINI);
		paintDots(
			ctx,
			miniFrame,
			{ ...layer, near: undefined, ghost: undefined },
			pal,
			{
				dotScale: 0.3,
				threads: false,
			},
		);
		ctx.strokeStyle = pal["--hairline"];
		ctx.strokeRect(0.5, 0.5, MINI - 1, MINI - 1);
		if (p.view) {
			const sx = miniFrame.w / (full.x1 - full.x0);
			const sy = miniFrame.h / (full.y1 - full.y0);
			ctx.strokeStyle = pal["--accent"];
			ctx.lineWidth = 1.5;
			ctx.strokeRect(
				miniFrame.left + p.view.x0 * sx,
				miniFrame.top + p.view.y0 * sy,
				Math.max(2, (p.view.x1 - p.view.x0) * sx),
				Math.max(2, (p.view.y1 - p.view.y0) * sy),
			);
		}
	}, [long, layer, pal, p.view, full, miniFrame]);

	/* ─── pointer: hover, click and brush ─── */

	const toCell = (f: Frame, x: number, y: number) => ({
		i: f.view.x0 + ((x - f.left) / f.w) * (f.view.x1 - f.view.x0),
		j: f.view.y0 + ((y - f.top) / f.h) * (f.view.y1 - f.view.y0),
	});
	const local = (e: PointerEvent<HTMLCanvasElement>) => {
		const r = e.currentTarget.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	};

	const threadAt = (i: number, j: number): number | undefined => {
		let best: number | undefined;
		let bestD = 1.6;
		p.threads.forEach((t, k) => {
			for (const ti of t.a)
				for (const tj of t.b) {
					const dd = Math.hypot(ti + 0.5 - i, tj + 0.5 - j);
					if (dd < bestD) {
						bestD = dd;
						best = k;
					}
				}
		});
		return best;
	};

	const describe = (i: number, j: number): string | null => {
		const ci = Math.floor(i);
		const cj = Math.floor(j);
		if (ci < 0 || cj < 0 || ci >= a.values.length || cj >= b.values.length)
			return null;
		const k = threadAt(i, j);
		const bits = (v: number) =>
			p.ic && v ? ` · ${p.ic(v).toFixed(1)} bits` : "";
		if (k !== undefined) {
			const t = p.threads[k];
			const na = t.subA?.join("+") ?? t.a.map((x) => nm(a, x)).join("+");
			const nb = t.subB?.join("+") ?? t.b.map((x) => nm(b, x)).join("+");
			return `${p.labelA} ${na} = ${p.shown(t.va)} · ${p.labelB} ${nb} = ${p.shown(t.vb)} · ${THREAD_LABEL[t.kind]}${t.how ? ` (${t.how})` : ""}${t.kind === "exact" ? bits(t.va) : ""}`;
		}
		const va = a.values[ci];
		const vb = b.values[cj];
		return `${p.labelA} ${nm(a, ci)} = ${p.shown(va)} · ${p.labelB} ${nm(b, cj)} = ${p.shown(vb)}${va && va === vb ? bits(va) : ""}`;
	};
	const nm = (s: PairSide, i: number) =>
		p.blind ? `cord ${i + 1}` : (s.names[i] ?? `cord ${i + 1}`);

	const onMove = (e: PointerEvent<HTMLCanvasElement>, isMini: boolean) => {
		const { x, y } = local(e);
		if (brush) {
			setBrush({ ...brush, x, y });
			return;
		}
		if (isMini) return;
		const { i, j } = toCell(frame, x, y);
		const text = describe(i, j);
		setHover(text ? { x, y, text } : null);
	};
	const onDown = (e: PointerEvent<HTMLCanvasElement>, isMini: boolean) => {
		const { x, y } = local(e);
		e.currentTarget.setPointerCapture(e.pointerId);
		setBrush({ sx: x, sy: y, x, y, mini: isMini });
	};
	const onUp = (e: PointerEvent<HTMLCanvasElement>, isMini: boolean) => {
		if (!brush) return;
		const f = isMini ? miniFrame : frame;
		const { x, y } = local(e);
		setBrush(null);
		const dx = Math.abs(x - brush.sx);
		const dy = Math.abs(y - brush.sy);
		if (dx < 4 && dy < 4) {
			if (isMini) {
				// a click on the minimap centres a window there
				const c = toCell(f, x, y);
				const hx = Math.max(20, (view.x1 - view.x0) / 2);
				const hy = Math.max(20, (view.y1 - view.y0) / 2);
				p.onView(
					clampView(
						{ x0: c.i - hx, x1: c.i + hx, y0: c.j - hy, y1: c.j + hy },
						full,
					),
				);
				return;
			}
			const { i, j } = toCell(f, x, y);
			p.onThread(threadAt(i, j));
			return;
		}
		const c0 = toCell(f, Math.min(x, brush.sx), Math.min(y, brush.sy));
		const c1 = toCell(f, Math.max(x, brush.sx), Math.max(y, brush.sy));
		p.onView(
			clampView(
				{
					x0: Math.floor(c0.i),
					x1: Math.ceil(c1.i),
					y0: Math.floor(c0.j),
					y1: Math.ceil(c1.j),
				},
				full,
			),
		);
	};

	const brushBox =
		brush && !brush.mini
			? {
					left: Math.min(brush.sx, brush.x),
					top: Math.min(brush.sy, brush.y),
					width: Math.abs(brush.x - brush.sx),
					height: Math.abs(brush.y - brush.sy),
				}
			: null;

	return (
		<div className="pd" ref={wrap}>
			<div className="pd-row">
				<div className="pd-main" style={{ width: size, height: size }}>
					<canvas
						ref={canvas}
						className="pd-canvas"
						role="img"
						aria-label={`Dotplot of ${p.labelA} (across) against ${p.labelB} (down): equal values as dots, shared runs as bands. The list below says the same.`}
						onPointerMove={(e) => onMove(e, false)}
						onPointerDown={(e) => onDown(e, false)}
						onPointerUp={(e) => onUp(e, false)}
						onPointerLeave={() => setHover(null)}
					/>
					{brushBox && <div className="pd-brush" style={brushBox} />}
					{hover && !brush && (
						<div
							className="pd-tip"
							style={{
								left: Math.min(hover.x + 12, size - 220),
								top: hover.y + 14,
							}}
						>
							{hover.text}
						</div>
					)}
				</div>
				{long && (
					<div className="pd-mini">
						<canvas
							ref={mini}
							className="pd-canvas"
							role="img"
							aria-label="Overview of the whole dotplot; drag to choose a window"
							onPointerDown={(e) => onDown(e, true)}
							onPointerMove={(e) => onMove(e, true)}
							onPointerUp={(e) => onUp(e, true)}
						/>
						<span className="pd-mini-label">whole pair · drag to zoom</span>
					</div>
				)}
			</div>
			<div className="pd-tools">
				<span className="pd-key">
					<span>
						<i className="pd-key-exact" /> equal value
					</span>
					<span>
						<i className="pd-key-near" /> near (±2% or one digit)
					</span>
					<span>
						<i className="pd-key-run" /> shared run
					</span>
					<span>
						<i className="pd-key-ghost" /> where chance matches would land
					</span>
				</span>
				{p.view && (
					<button type="button" className="btn" onClick={() => p.onView(null)}>
						Whole pair
					</button>
				)}
			</div>
		</div>
	);
}

function clampView(v: PlotView, full: PlotView): PlotView {
	const x0 = Math.max(full.x0, Math.round(v.x0));
	const y0 = Math.max(full.y0, Math.round(v.y0));
	const x1 = Math.min(full.x1, Math.max(x0 + 2, Math.round(v.x1)));
	const y1 = Math.min(full.y1, Math.max(y0 + 2, Math.round(v.y1)));
	return { x0, x1, y0, y1 };
}

/* ─────────── the text twin: runs and threads as buttons ─────────── */

export interface RunItem {
	len: number;
	startA: number;
	startB: number;
}

export function EvidenceList(props: {
	a: PairSide;
	b: PairSide;
	labelA: string;
	labelB: string;
	runs: RunItem[];
	dir: "fwd" | "rev";
	threads: StrandThread[];
	shown: (v: number) => string;
	blind?: boolean;
	selected?: number;
	onThread: (k: number | undefined) => void;
	onRun: (r: RunItem) => void;
}) {
	const { a, b, runs, threads, labelA, labelB } = props;
	const list = useRef<HTMLDivElement>(null);
	const nm = (s: PairSide, i: number) =>
		props.blind ? `cord ${i + 1}` : (s.names[i] ?? `cord ${i + 1}`);
	const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
		if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(e.key))
			return;
		const btns = [
			...(list.current?.querySelectorAll<HTMLButtonElement>("button") ?? []),
		];
		const at = btns.indexOf(document.activeElement as HTMLButtonElement);
		if (at < 0) return;
		e.preventDefault();
		const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
		btns[Math.max(0, Math.min(btns.length - 1, at + step))]?.focus();
	};
	const span = (s: PairSide, from: number, len: number) =>
		`${nm(s, from)}–${nm(s, from + len - 1)}`;
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: arrow keys step between the buttons inside
		<div className="pd-list" ref={list} onKeyDown={onKey}>
			{runs.length > 0 && (
				<div className="pd-list-block">
					<h4>
						Exact runs ({runs.length})
						{props.dir === "rev" ? ", read in reverse" : ""}
					</h4>
					<ul>
						{runs.map((r) => (
							<li key={`${r.len}-${r.startA}-${r.startB}`}>
								<button type="button" onClick={() => props.onRun(r)}>
									<b>{r.len}</b> values · {labelA} {span(a, r.startA, r.len)} ↔{" "}
									{labelB} {span(b, r.startB, r.len)}
								</button>
							</li>
						))}
					</ul>
				</div>
			)}
			<div className="pd-list-block">
				<h4>Threads read cord by cord ({threads.length})</h4>
				{threads.length === 0 ? (
					<p className="cell-muted">
						No cord-by-cord reading of this pair in strands.json.
					</p>
				) : (
					<ul>
						{threads.map((t, k) => {
							const na =
								t.subA?.join("+") ?? t.a.map((x) => nm(a, x)).join("+");
							const nb =
								t.subB?.join("+") ?? t.b.map((x) => nm(b, x)).join("+");
							return (
								// biome-ignore lint/suspicious/noArrayIndexKey: threads are positional (the URL's ?thread=)
								<li key={k}>
									<button
										type="button"
										aria-pressed={props.selected === k}
										onClick={() =>
											props.onThread(props.selected === k ? undefined : k)
										}
									>
										<i className={`pd-kind pd-kind-${t.kind}`} />
										{labelA} {na} = {props.shown(t.va)} · {labelB} {nb} ={" "}
										{props.shown(t.vb)}
										<span className="cell-muted">
											{" "}
											{THREAD_LABEL[t.kind]}
											{t.how ? `, ${t.how}` : ""}
										</span>
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</div>
	);
}
