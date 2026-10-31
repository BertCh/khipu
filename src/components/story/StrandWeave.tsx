import { Link } from "@tanstack/react-router";
import {
	type CSSProperties,
	Fragment,
	memo,
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { hexFor } from "#/lib/khipu/colors";
import { getColors, getSilhouettes, type Silhouettes } from "#/lib/khipu/data";
import type { ColorTable } from "#/lib/khipu/types";
import { pairKey } from "#/lib/stories/links";
import {
	drawableLink,
	getStrands,
	MATCH_KINDS,
	type StrandFile,
	type StrandLevel,
	type StrandThread,
	THREAD_LABEL,
	type ThreadKind,
} from "#/lib/stories/strands";

/**
 * Two linked khipus woven together, strand by strand, as a quiet layer for
 * the stories that read them. The upper khipu's pendants hang down from its
 * primary cord; the lower khipu's hang up from its own; every cord pair that
 * strands.json lays side by side is joined across the gap by one thread,
 * coloured half by the cord it leaves and half by the cord it reaches.
 * Threads whose values disagree (differ), lose a value (dropped) or are both
 * blank are drawn in the IslandShelf's grammar and never as a match.
 * Nothing is invented: cords are the silhouette data (length, base colour)
 * and every thread is a thread of strands.json, or one the story supplies.
 *
 * Strength gate: only curated links (firm / likely / open) are drawn unless
 * `includeScan`; scan pairs are then grey and dashed, and a scan run under 5
 * is never drawn. When nothing qualifies the component renders nothing.
 *
 * The drawing is one SVG stretched to the container's width
 * (preserveAspectRatio none + non-scaling strokes), so it needs no measuring,
 * and cords and threads are merged into one path per colour and kind, so a
 * 250-cord pair is a few dozen elements. `highlight` does not rebuild the
 * base drawing: the lit threads are an overlay that fades in over a dimmed
 * base, so a story can move it step by step (see `useStepHighlight`).
 *
 * `marks` name passages where the threads alone do not: a bracket over a
 * run of cords, a small value label at one cord, or a label at the point
 * where a sum's cords gather. They are HTML over the drawing, placed from
 * the weave's own layout, so they follow windowing and resizing.
 *
 * Function props (`cordColor`, `emphasis`, `threadColor`) are memo
 * dependencies: define them at module level or wrap them in useCallback.
 */

export type WeaveVariant = "hero" | "divider" | "inline";
export type WeaveTone = "strong" | "faint";

/** a caller-supplied thread: strands.json's shape plus an optional tone */
export interface WeaveThread extends StrandThread {
	tone?: WeaveTone;
}

/** caller-supplied threads for one pair; `a`/`b` say which khipu each
 * thread's `a`/`b` cords index */
export interface WeavePair {
	a: string;
	b: string;
	threads: WeaveThread[];
}

export interface WeaveRange {
	id: string;
	/** first cord, 0-based */
	from: number;
	/** one past the last cord */
	to: number;
}

export type WeaveMarkTone = "quiet" | "key" | "miss";

/** a label over the drawing (decoration: say the same thing in the caption) */
export type WeaveMark =
	| {
			/** a bracket outside the khipu's primary over cords [from, to) */
			kind?: "bracket";
			id: string;
			from: number;
			to: number;
			label: ReactNode;
			/** quiet: context (hidden on phones); key: the passage the story is
			 * about; miss: a check that failed */
			tone?: WeaveMarkTone;
	  }
	| {
			/** a small label at one cord, just outside the khipu's primary */
			kind: "value";
			id: string;
			cord: number;
			label: ReactNode;
			tone?: WeaveMarkTone;
	  }
	| {
			/** a label beside the point where a thread's cords on this khipu
			 * gather (the fan point of a sum); drawn only if such a thread is */
			kind: "gather";
			id: string;
			cords: number[];
			label: ReactNode;
			tone?: WeaveMarkTone;
	  };

export interface StrandWeaveProps {
	/** khipus along the upper primary, left to right */
	top: string[];
	/** khipus along the lower primary; placed under the cords they answer */
	bottom: string[];
	/** strands.json pair keys to draw (pairKey order); default: every link
	 * joining a top khipu to a bottom one that passes the strength gate */
	links?: string[];
	variant?: WeaveVariant;
	/** display names, e.g. { KH0192: "AS175" }; default the KH number */
	names?: Record<string, string>;
	/** cords [from, to) of one khipu: the threads touching them are lit, the
	 * rest step back. Changing it fades between states (see useStepHighlight) */
	highlight?: WeaveRange | null;
	/** draw the row's khipus as one spliced primary cord */
	spliced?: "top" | "bottom" | "both";
	/** sweep the threads in when the weave first scrolls into view */
	reveal?: boolean;
	/** false hides the caption */
	caption?: false;
	/** false: no hover titles, no links, no pointer events (for cards) */
	interactive?: boolean;
	/** also draw unexamined scan pairs with a longest run ≥ 5 (grey, dashed) */
	includeScan?: boolean;
	/** crop to cords [from, to) of one khipu, with the partner cords its
	 * threads reach */
	window?: WeaveRange | null;
	/** with `window`: the whole weave drawn small above, with a bracket at the
	 * window. "auto" (default): only on narrow screens, and only when the
	 * weave is long */
	inset?: boolean | "auto";
	/** replace the threads of these pairs with the story's own */
	threads?: WeavePair[];
	/** per-thread tone: bold a subset, fade or hide the rest */
	emphasis?: (
		t: StrandThread,
		pair: { a: string; b: string },
	) => WeaveTone | "hidden" | undefined;
	/** a cord's colour in place of its base dye (undefined keeps the dye) */
	cordColor?: (khipuId: string, cordIndex: number) => string | undefined;
	/** khipus drawn mirrored (last cord first), so a reversed copy's threads
	 * run parallel instead of crossing */
	reversed?: string[];
	/** a thread's colour in place of its cords' dyes (any CSS colour, used
	 * as given, e.g. "var(--accent)"); undefined keeps the default */
	threadColor?: (
		t: StrandThread,
		pair: { a: string; b: string },
	) => string | undefined;
	/** brackets and labels over the drawing */
	marks?: WeaveMark[];
	className?: string;
}

interface WeaveData {
	strands: StrandFile;
	sils: Silhouettes;
	colors: ColorTable;
}

let loaded: Promise<WeaveData | null> | null = null;
function loadWeave(): Promise<WeaveData | null> {
	loaded ??= Promise.all([getStrands(), getSilhouettes(), getColors()]).then(
		([strands, sils, colors]) => (strands ? { strands, sils, colors } : null),
		() => null,
	);
	return loaded;
}

/** view-box height per variant; the CSS sets the drawn height */
const H: Record<WeaveVariant, number> = { hero: 200, divider: 64, inline: 48 };
/** how deep the longest pendant hangs, as a share of the height */
const BAND: Record<WeaveVariant, number> = {
	hero: 0.34,
	divider: 0.3,
	inline: 0.26,
};
/** where a sum's cords gather, as a share of the gap from their side */
const FAN: Record<WeaveVariant, number> = {
	hero: 0.22,
	divider: 0.22,
	inline: 0.12,
};
/** cords between two khipus in one row */
const GAP = 4;
const EDGE = 2.5;
/** plain (unmatched) cords an inline weave draws per row, at most */
const INLINE_CORDS = 120;
/** an inset overview is worth drawing past this many cords */
const LONG = 120;

interface Seg {
	id: string;
	start: number;
	n: number;
	/** view-box units per cord */
	pitch: number;
	rev: boolean;
}

interface Layer {
	key: string;
	d: string;
	/** null: the kind's CSS colour */
	color: string | null;
	cls: string;
	/** the colour is used as given, not mixed toward the ink */
	raw?: boolean;
}

interface ThreadRec {
	key: string;
	top: string;
	bottom: string;
	tc: number[];
	bc: number[];
	parts: { color: string | null; cls: string; d: string; raw?: boolean }[];
	hit: string;
	title: string;
	/** where the thread leaves the upper khipu and reaches the lower one (a
	 * sum's gathering point, or a single cord's tip) */
	ends: [[number, number], [number, number]];
}

interface LinkSum {
	top: string;
	bottom: string;
	level: StrandLevel;
	compared?: number;
	agree?: number;
	matched: number;
	drawn: number;
}

interface Weave {
	width: number;
	h: number;
	top: Seg[];
	bottom: Seg[];
	primaries: string;
	splices: string;
	cords: Layer[];
	threads: Layer[];
	strikes: string;
	rings: string;
	recs: ThreadRec[];
	links: LinkSum[];
	counts: Partial<Record<ThreadKind, number>>;
	total: number;
	/** the window's view-box x range, when cropped */
	view: [number, number] | null;
	cx: (id: string, i: number) => number;
	cordD: (id: string, i: number) => string;
	colourOf: (id: string, i: number) => string;
	segOf: (id: string) => Seg | undefined;
	isTop: (id: string) => boolean;
}

const cordName = (cords: number[]) =>
	cords.length === 1
		? `pendant ${cords[0] + 1}`
		: `pendants ${cords.map((i) => i + 1).join("+")}`;

const median = (xs: number[]) => {
	const s = [...xs].sort((p, q) => p - q);
	return s[Math.floor(s.length / 2)];
};
const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

/** kinds drawn in the kind's own colour rather than the cords' dyes */
const UNDYED: ReadonlySet<ThreadKind> = new Set(["differ", "dropped", "blank"]);

interface PlaceOpts {
	top: string[];
	bottom: string[];
	links?: string[];
	variant: WeaveVariant;
	names: Record<string, string>;
	includeScan: boolean;
	window: WeaveRange | null;
	threads?: WeavePair[];
	emphasis?: StrandWeaveProps["emphasis"];
	cordColor?: StrandWeaveProps["cordColor"];
	threadColor?: StrandWeaveProps["threadColor"];
	reversed: string[];
}

interface Pair {
	key: string;
	a: string;
	b: string;
	level: StrandLevel;
	compared?: number;
	agree?: number;
	threads: WeaveThread[];
}

function pairsFor(data: WeaveData, o: PlaceOpts): Pair[] {
	const topSet = new Set(o.top);
	const bottomSet = new Set(o.bottom);
	const joins = (a: string, b: string) =>
		(topSet.has(a) && bottomSet.has(b)) || (topSet.has(b) && bottomSet.has(a));
	const own = new Map((o.threads ?? []).map((p) => [pairKey(p.a, p.b), p]));
	const keys =
		o.links ?? o.top.flatMap((a) => o.bottom.map((b) => pairKey(a, b)));
	const out: Pair[] = [];
	for (const key of new Set([...keys, ...own.keys()])) {
		const l = data.strands.links[key];
		const mine = own.get(key);
		// the gate: a known link must pass it even with the story's own threads
		if (l && !drawableLink(l, o.includeScan)) continue;
		if (mine) {
			if (!joins(mine.a, mine.b)) continue;
			out.push({
				key,
				a: mine.a,
				b: mine.b,
				level: l?.level ?? "open",
				threads: mine.threads,
			});
		} else if (l && joins(l.a, l.b)) {
			out.push({
				key,
				a: l.a,
				b: l.b,
				level: l.level ?? "scan",
				compared: l.compared,
				agree: l.agree,
				threads: l.threads,
			});
		}
	}
	return out;
}

function place(data: WeaveData, o: PlaceOpts): Weave | null {
	const { sils, colors } = data;
	const { variant } = o;
	const n = (id: string) => sils[id]?.l.length ?? 0;
	const name = (id: string) => o.names[id] ?? id;
	const topSet = new Set(o.top);
	const rev = new Set(o.reversed);
	const pairs = pairsFor(data, o);
	if (pairs.length === 0) return null;
	const win = o.window;

	// the upper row in the given order, one view-box unit per cord
	const top: Seg[] = [];
	let x = 0;
	for (const id of o.top) {
		if (!n(id)) continue;
		top.push({ id, start: x, n: n(id), pitch: 1, rev: rev.has(id) });
		x += n(id) + GAP;
	}
	if (top.length === 0) return null;
	const segOf = new Map<string, Seg>(top.map((s) => [s.id, s]));
	const pos = (s: Seg, i: number) => (s.rev ? s.n - 1 - i : i);
	const cxs = (s: Seg, i: number) => s.start + (pos(s, i) + 0.5) * s.pitch;

	// each lower khipu slides (and, when its cords answer the upper ones at a
	// different pace — sums, a copy with fewer cords — stretches) under the
	// cords it answers: a line through (its cord position, the upper cord's x)
	const fit = new Map<string, { pitch: number; start: number }>();
	for (const id of o.bottom) {
		if (!n(id)) continue;
		const pts: [number, number][] = [];
		for (const p of pairs) {
			const topIsA = topSet.has(p.a);
			if ((topIsA ? p.b : p.a) !== id) continue;
			const ts = segOf.get(topIsA ? p.a : p.b);
			if (!ts) continue;
			for (const t of p.threads) {
				const tc = (topIsA ? t.a : t.b).filter((i) => i >= 0 && i < ts.n);
				const bc = (topIsA ? t.b : t.a).filter((i) => i >= 0 && i < n(id));
				if (!tc.length || !bc.length) continue;
				// windowed: fit to the window's own threads, so its partner
				// cords land under it
				if (win) {
					const wc = win.id === ts.id ? tc : win.id === id ? bc : null;
					if (wc && !wc.some((i) => i >= win.from && i < win.to)) continue;
				}
				const mb = mean(bc.map((i) => (rev.has(id) ? n(id) - 1 - i : i) + 0.5));
				pts.push([mb, mean(tc.map((i) => cxs(ts, i)))]);
			}
		}
		if (pts.length === 0) continue;
		const xs = pts.map((p) => p[0]);
		const ys = pts.map((p) => p[1]);
		const mx = mean(xs);
		const my = mean(ys);
		const vx = xs.reduce((s, v) => s + (v - mx) ** 2, 0);
		const slope =
			vx > 0
				? pts.reduce((s, [px, py]) => s + (px - mx) * (py - my), 0) / vx
				: 1;
		let pitch = 1;
		let start: number;
		if (slope < 0) {
			// a reversed match drawn unmirrored: centre the crossing
			start = my - mx;
		} else {
			if (slope < 0.8 || slope > 1.25)
				pitch = Math.min(3, Math.max(0.35, slope));
			start = median(pts.map(([px, py]) => py - pitch * px));
		}
		fit.set(id, { pitch, start });
	}
	const bottom: Seg[] = [];
	const placed = o.bottom
		.filter((id) => n(id))
		.map((id, k) => ({ id, f: fit.get(id), k }))
		.sort(
			(p, q) =>
				(p.f?.start ?? Infinity) - (q.f?.start ?? Infinity) || p.k - q.k,
		);
	let right = -Infinity;
	for (const p of placed) {
		const pitch = p.f?.pitch ?? 1;
		const start = p.f
			? Math.max(p.f.start, right + GAP)
			: Math.max(0, right + GAP);
		const s = { id: p.id, start, n: n(p.id), pitch, rev: rev.has(p.id) };
		bottom.push(s);
		segOf.set(p.id, s);
		right = start + s.n * pitch;
	}

	const all = [...top, ...bottom];
	const min = Math.min(...all.map((s) => s.start)) - EDGE;
	const max = Math.max(...all.map((s) => s.start + s.n * s.pitch)) + EDGE;
	for (const s of all) s.start -= min;
	const width = max - min;

	const h = H[variant];
	const yTop = 3;
	const yBot = h - 3;
	const band = h * BAND[variant];
	const maxLen = Math.max(
		1,
		...all.flatMap((s) => sils[s.id].l.map((v) => v ?? 0)),
	);
	const isTop = (id: string) => topSet.has(id);
	const depth = (id: string, i: number) =>
		Math.max(2, ((sils[id].l[i] ?? 0) / maxLen) * band);
	const cx = (id: string, i: number) => {
		const s = segOf.get(id);
		return s ? cxs(s, i) : 0;
	};
	const colourOf = (id: string, i: number) =>
		o.cordColor?.(id, i) ?? hexFor(sils[id].c[i] ?? undefined, colors);
	const f = (v: number) => Math.round(v * 100) / 100;
	const cordD = (id: string, i: number) => {
		const y0 = isTop(id) ? yTop : yBot;
		const sign = isTop(id) ? 1 : -1;
		const x0 = f(cx(id, i));
		return `M${x0},${y0}V${f(y0 + sign * depth(id, i))}`;
	};

	// threads, merged by (colour, kind, tone, scan)
	const threadPaths = new Map<string, Layer>();
	const add = (
		map: Map<string, Layer>,
		color: string | null,
		cls: string,
		d: string,
		raw?: boolean,
	) => {
		const key = `${color ?? "-"}|${cls}${raw ? "|raw" : ""}`;
		const l = map.get(key);
		if (l) l.d += d;
		else map.set(key, { key, d, color, cls, raw });
	};
	const matched = new Map<string, Set<number>>();
	const mark = (id: string, cords: number[]) => {
		const s = matched.get(id) ?? new Set<number>();
		matched.set(id, s);
		for (const i of cords) s.add(i);
	};
	const recs: ThreadRec[] = [];
	const sums: LinkSum[] = [];
	const counts: Partial<Record<ThreadKind, number>> = {};
	let strikes = "";
	let rings = "";
	const fan = FAN[variant];
	for (const p of pairs) {
		const topIsA = topSet.has(p.a);
		const tId = topIsA ? p.a : p.b;
		const bId = topIsA ? p.b : p.a;
		const ts = segOf.get(tId);
		const bs = segOf.get(bId);
		if (!ts || !bs) continue;
		const sum: LinkSum = {
			top: tId,
			bottom: bId,
			level: p.level,
			compared: p.compared,
			agree: p.agree,
			matched: 0,
			drawn: 0,
		};
		sums.push(sum);
		const scanCls = p.level === "scan" ? " is-scan" : "";
		p.threads.forEach((t, k) => {
			const tone =
				t.tone ?? (o.emphasis ? o.emphasis(t, { a: p.a, b: p.b }) : undefined);
			if (tone === "hidden") return;
			const tc = (topIsA ? t.a : t.b).filter((i) => i >= 0 && i < ts.n);
			const bc = (topIsA ? t.b : t.a).filter((i) => i >= 0 && i < bs.n);
			if (!tc.length || !bc.length) return;
			counts[t.kind] = (counts[t.kind] ?? 0) + 1;
			sum.drawn++;
			if (MATCH_KINDS.has(t.kind)) sum.matched++;
			mark(tId, tc);
			mark(bId, bc);
			const cls = `weave-t-${t.kind}${tone ? ` is-${tone}` : ""}${scanCls}`;
			const dyed = !UNDYED.has(t.kind) && !scanCls;
			const own = o.threadColor?.(t, { a: p.a, b: p.b });
			const parts: ThreadRec["parts"] = [];
			const put = (color: string | null, c: string, d: string) => {
				const col = own ?? (dyed ? color : null);
				const raw = own != null;
				parts.push({ color: col, cls: c, d, raw });
				add(threadPaths, col, c, d, raw);
			};
			// the ends: one cord's tip, or where the cords of a sum gather
			const tipT = (i: number) => yTop + depth(tId, i);
			const tipB = (j: number) => yBot - depth(bId, j);
			const lowT = Math.max(...tc.map(tipT));
			const highB = Math.min(...bc.map(tipB));
			const x0 = mean(tc.map((i) => cx(tId, i)));
			const x1 = mean(bc.map((j) => cx(bId, j)));
			const y0 = tc.length > 1 ? lowT + (highB - lowT) * fan : tipT(tc[0]);
			const y1 = bc.length > 1 ? highB - (highB - lowT) * fan : tipB(bc[0]);
			let hit = "";
			// a fan: each cord's tip straight to the gathering point
			if (tc.length > 1)
				for (const i of tc) {
					const d = `M${f(cx(tId, i))},${f(tipT(i))}L${f(x0)},${f(y0)}`;
					put(colourOf(tId, i), `${cls} weave-fan`, d);
					hit += d;
				}
			if (bc.length > 1)
				for (const j of bc) {
					const d = `M${f(x1)},${f(y1)}L${f(cx(bId, j))},${f(tipB(j))}`;
					put(colourOf(bId, j), `${cls} weave-fan`, d);
					hit += d;
				}
			// the crossing, split at its middle: the upper half in the upper
			// cord's colour, the lower half in the lower cord's
			const ym = (y0 + y1) / 2;
			const xm = (x0 + x1) / 2;
			put(
				colourOf(tId, tc[0]),
				cls,
				`M${f(x0)},${f(y0)}C${f(x0)},${f((y0 + ym) / 2)} ${f((3 * x0 + x1) / 4)},${f((y0 + 3 * ym) / 4)} ${f(xm)},${f(ym)}`,
			);
			put(
				colourOf(bId, bc[0]),
				cls,
				`M${f(xm)},${f(ym)}C${f((x0 + 3 * x1) / 4)},${f((3 * ym + y1) / 4)} ${f(x1)},${f((ym + y1) / 2)} ${f(x1)},${f(y1)}`,
			);
			hit += `M${f(x0)},${f(y0)}C${f(x0)},${f(ym)} ${f(x1)},${f(ym)} ${f(x1)},${f(y1)}`;
			const vt = topIsA ? t.va : t.vb;
			const vb = topIsA ? t.vb : t.va;
			// differ: a short bar across the middle; dropped: a hollow ring
			// at the blank end (zero-length round-capped segments stay round
			// under the stretched view box)
			if (t.kind === "differ") {
				const dx = Math.max(0.9, Math.min(2.2, width / 180));
				const bar = `M${f(xm - dx)},${f(ym - 2.2)}L${f(xm + dx)},${f(ym + 2.2)}`;
				strikes += bar;
				parts.push({ color: null, cls: "weave-strike", d: bar });
			}
			if (t.kind === "dropped") {
				const [rx, ry] = vt === 0 ? [x0, y0] : [x1, y1];
				const ring = `M${f(rx)},${f(ry)}h0`;
				rings += ring;
				parts.push({ color: null, cls: "weave-ring", d: ring });
			}
			const how =
				t.kind === "scaled" && t.va
					? `, ×${Math.round((t.vb / t.va) * 100) / 100}`
					: t.how
						? `: ${t.how}`
						: "";
			recs.push({
				key: `${tId}:${bId}:${k}`,
				top: tId,
				bottom: bId,
				tc,
				bc,
				parts,
				hit,
				ends: [
					[x0, y0],
					[x1, y1],
				],
				title: `${name(tId)} ${cordName(tc)} = ${vt.toLocaleString()} · ${name(bId)} ${cordName(bc)} = ${vb.toLocaleString()} (${THREAD_LABEL[t.kind]}${how})${p.level === "scan" ? " — scan pair, not yet read" : ""}${t.note ? ` — ${t.note}` : ""}`,
			});
		});
	}
	if (recs.length === 0) return null;

	// cords, merged by (colour, matched); a card-width weave samples its
	// plain cords so they do not pile into a smear
	const stride =
		variant === "inline" ? Math.max(1, Math.ceil(width / INLINE_CORDS)) : 1;
	const cordPaths = new Map<string, Layer>();
	let primaries = "";
	for (const [row, segs] of [
		["top", top],
		["bottom", bottom],
	] as const) {
		for (const s of segs) {
			const y0 = row === "top" ? yTop : yBot;
			primaries += `M${f(s.start)},${y0}H${f(s.start + s.n * s.pitch)}`;
			const m = matched.get(s.id);
			for (let i = 0; i < s.n; i++) {
				const hit = m?.has(i) ?? false;
				if (!hit && i % stride) continue;
				add(
					cordPaths,
					colourOf(s.id, i),
					hit ? "is-matched" : "is-plain",
					cordD(s.id, i),
				);
			}
		}
	}
	// a hairline across the gap between two pieces of one row
	let splices = "";
	for (const [segs, y] of [
		[top, yTop],
		[bottom, yBot],
	] as const)
		for (let k = 1; k < segs.length; k++) {
			const prev = segs[k - 1];
			splices += `M${f(prev.start + prev.n * prev.pitch)},${y}H${f(segs[k].start)}`;
		}

	// the window: its own cords plus the partner cords its threads reach
	let view: [number, number] | null = null;
	const w = o.window;
	const ws = w ? segOf.get(w.id) : undefined;
	if (w && ws) {
		const from = Math.max(0, Math.min(w.from, ws.n - 1));
		const to = Math.max(from + 1, Math.min(w.to, ws.n));
		const xs = [cxs(ws, from), cxs(ws, to - 1)];
		for (const r of recs) {
			const mine = r.top === w.id ? r.tc : r.bottom === w.id ? r.bc : null;
			if (!mine?.some((i) => i >= from && i < to)) continue;
			const other = r.top === w.id ? r.bc : r.tc;
			const oid = r.top === w.id ? r.bottom : r.top;
			for (const i of other) xs.push(cx(oid, i));
		}
		const lo = Math.min(...xs);
		const hi = Math.max(...xs);
		// never wider than four windows: past that, the crop keeps the window
		// and slides toward where its partner cords lie (a reversed or
		// stretched partner is not centred on the window)
		const span = Math.max(3, hi - lo);
		const wlo = Math.min(xs[0], xs[1]);
		const whi = Math.max(xs[0], xs[1]);
		const cap = Math.max(whi - wlo + 3, (to - from) * ws.pitch * 4);
		if (span > cap) {
			const partner = xs.length > 2 ? median(xs.slice(2)) : (wlo + whi) / 2;
			const c = Math.min(
				wlo - 1 + cap / 2,
				Math.max(whi + 1 - cap / 2, partner),
			);
			view = [c - cap / 2, c + cap / 2];
		} else view = [lo - 1.5, hi + 1.5];
	}

	return {
		width,
		h,
		top,
		bottom,
		primaries,
		splices,
		cords: [...cordPaths.values()],
		threads: [...threadPaths.values()],
		strikes,
		rings,
		recs,
		links: sums,
		counts,
		total: recs.length,
		view,
		cx,
		cordD,
		colourOf,
		segOf: (id) => segOf.get(id),
		isTop,
	};
}

/** The lit part of a weave: threads touching the range, and their cords. */
function overlay(w: Weave, hl: WeaveRange) {
	const inR = (id: string, cs: number[]) =>
		hl.id === id && cs.some((i) => i >= hl.from && i < hl.to);
	const threads = new Map<string, Layer>();
	const cords = new Map<string, Layer>();
	const seen = new Set<string>();
	for (const r of w.recs) {
		if (!inR(r.top, r.tc) && !inR(r.bottom, r.bc)) continue;
		for (const p of r.parts) {
			const key = `${p.color ?? "-"}|${p.cls}${p.raw ? "|raw" : ""}`;
			const l = threads.get(key);
			if (l) l.d += p.d;
			else
				threads.set(key, {
					key,
					d: p.d,
					color: p.color,
					cls: p.cls,
					raw: p.raw,
				});
		}
		for (const [id, cs] of [
			[r.top, r.tc],
			[r.bottom, r.bc],
		] as const)
			for (const i of cs) {
				if (seen.has(`${id}:${i}`)) continue;
				seen.add(`${id}:${i}`);
				const color = w.colourOf(id, i);
				const l = cords.get(color);
				const d = w.cordD(id, i);
				if (l) l.d += d;
				else cords.set(color, { key: color, d, color, cls: "is-matched" });
			}
	}
	const ring = threads.get("-|weave-ring");
	if (ring)
		threads.set("-|weave-ring-hole", {
			...ring,
			key: "-|weave-ring-hole",
			cls: "weave-ring-hole",
		});
	return { threads: [...threads.values()], cords: [...cords.values()] };
}

/** the data, and whether loading has finished (null data then = none) */
function useWeaveData(): [WeaveData | null, boolean] {
	const [data, setData] = useState<WeaveData | null>(null);
	const [done, setDone] = useState(false);
	useEffect(() => {
		let live = true;
		loadWeave().then((d) => {
			if (!live) return;
			setData(d);
			setDone(true);
		});
		return () => {
			live = false;
		};
	}, []);
	return [data, done];
}

/** true once the element has come within a little of the viewport */
function useSeen(on: boolean) {
	const ref = useRef<HTMLElement>(null);
	const [seen, setSeen] = useState(!on);
	useEffect(() => {
		if (!on || seen) return;
		const el = ref.current;
		if (!el || typeof IntersectionObserver === "undefined") {
			setSeen(true);
			return;
		}
		const io = new IntersectionObserver(
			(es) => {
				if (es.some((e) => e.isIntersecting)) {
					setSeen(true);
					io.disconnect();
				}
			},
			{ rootMargin: "0px 0px -15% 0px" },
		);
		io.observe(el);
		return () => io.disconnect();
	}, [on, seen]);
	return [ref, seen] as const;
}

/**
 * The value for the story step the reader is in: `map` is keyed by the
 * `<Step n>` number, and the step whose box crosses the line 45% down the
 * viewport is current. Returns null before any mapped step is reached;
 * keeps the last value while between mapped steps. Pair it with
 * `highlight` (which fades; instant under prefers-reduced-motion).
 */
export function useStepHighlight<T>(map: Record<number, T>): T | null {
	const [n, setN] = useState<number | null>(null);
	useEffect(() => {
		if (typeof IntersectionObserver === "undefined") return;
		const steps = [
			...document.querySelectorAll<HTMLElement>("section.step"),
		].filter((s) => s.getAttribute("aria-labelledby")?.startsWith("step-"));
		const io = new IntersectionObserver(
			(es) => {
				for (const e of es) {
					if (!e.isIntersecting) continue;
					const k = Number(e.target.getAttribute("aria-labelledby")?.slice(5));
					if (Number.isFinite(k)) setN(k);
				}
			},
			{ rootMargin: "-45% 0px -54% 0px" },
		);
		for (const s of steps) io.observe(s);
		return () => io.disconnect();
	}, []);
	const last = useRef<T | null>(null);
	if (n != null && n in map) last.current = map[n];
	else if (n != null && !Object.keys(map).some((k) => Number(k) <= n))
		last.current = null;
	return last.current;
}

function StrandWeave({
	top,
	bottom,
	links,
	variant = "hero",
	names = {},
	highlight = null,
	spliced,
	reveal = variant === "divider",
	caption,
	interactive = variant !== "inline",
	includeScan = false,
	window: win = null,
	inset = "auto",
	threads,
	emphasis,
	cordColor,
	threadColor,
	reversed = [],
	marks,
	className,
}: StrandWeaveProps) {
	const [data, done] = useWeaveData();
	const [ref, seen] = useSeen(reveal);
	const [frameRef, fw] = useWidth();
	const topKey = top.join(",");
	const bottomKey = bottom.join(",");
	const linkKey = links?.join(",");
	const namesKey = JSON.stringify(names);
	const revKey = reversed.join(",");
	const winKey = win ? `${win.id}:${win.from}:${win.to}` : "";
	const threadsKey = useMemo(
		() => (threads ? JSON.stringify(threads) : ""),
		[threads],
	);
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed by value, not by array identity
	const w = useMemo(
		() =>
			data
				? place(data, {
						top,
						bottom,
						links,
						variant,
						names,
						includeScan,
						window: win,
						threads,
						emphasis,
						cordColor,
						threadColor,
						reversed,
					})
				: null,
		[
			data,
			topKey,
			bottomKey,
			linkKey,
			variant,
			namesKey,
			includeScan,
			winKey,
			threadsKey,
			emphasis,
			cordColor,
			threadColor,
			revKey,
		],
	);
	const hl = highlight
		? `${highlight.id}:${highlight.from}:${highlight.to}`
		: "";
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed by value
	const lit = useMemo(
		() => (w && highlight ? overlay(w, highlight) : null),
		[w, hl],
	);
	// loaded, and nothing qualifies: nothing at all (safe inside cards)
	if (done && !w) return null;
	const h = H[variant];
	const name = (id: string) => names[id] ?? id;
	const x0 = w?.view?.[0] ?? 0;
	const vw = w ? (w.view ? w.view[1] - w.view[0] : w.width) : 1;
	const long = w ? w.width > LONG : false;
	const showInset = !!(
		w?.view &&
		(inset === true || (inset === "auto" && long))
	);
	const frac = (v: number) => (v - x0) / vw;
	const inView = (s: Seg) =>
		!w?.view || (s.start + s.n * s.pitch > w.view[0] && s.start < w.view[1]);
	const drawnWin = w?.view && win ? win : null;
	const label = (s: Seg) =>
		`${name(s.id)}${s.rev ? " ⟲" : ""}${drawnWin?.id === s.id ? ` · cords ${drawnWin.from + 1}–${drawnWin.to}` : ""}`;
	const placedMarks = w && marks?.length ? placeMarks(w, marks, frac, h) : [];
	const nameBoxes =
		w && variant === "hero"
			? layoutNames(
					[
						...w.top.filter(inView).map((s) => ({ s, top: true })),
						...w.bottom.filter(inView).map((s) => ({ s, top: false })),
					].map(({ s, top }) => ({
						key: s.id,
						top,
						text: label(s),
						x: frac(Math.max(s.start, x0)),
					})),
					fw,
					placedMarks.filter((m) => m.kind === "value"),
				)
			: [];
	const lane2 = (top: boolean) =>
		nameBoxes.some((n) => n.top === top && n.lane);
	const markRows = (top: boolean) =>
		placedMarks.filter(
			(m) =>
				m.top === top &&
				(m.kind === "bracket" || (m.kind === "value" && variant !== "hero")),
		);
	const cls = [
		"strand-weave",
		`strand-weave-${variant}`,
		lane2(true) ? "has-lane2-top" : "",
		lane2(false) ? "has-lane2-bottom" : "",
		markRows(true).length ? "has-marks-top" : "",
		markRows(false).length ? "has-marks-bottom" : "",
		markRows(true).some((m) => m.tone !== "quiet") ? "has-key-top" : "",
		markRows(false).some((m) => m.tone !== "quiet") ? "has-key-bottom" : "",
		lit ? "has-highlight" : "",
		spliced === "top" || spliced === "both" ? "is-spliced-top" : "",
		spliced === "bottom" || spliced === "both" ? "is-spliced-bottom" : "",
		reveal ? "is-reveal" : "",
		seen && w ? "is-seen" : "",
		w?.view ? "is-windowed" : "",
		showInset
			? inset === "auto"
				? "has-inset is-inset-auto"
				: "has-inset"
			: "",
		interactive ? "" : "is-static",
		className ?? "",
	]
		.filter(Boolean)
		.join(" ");
	const rowNames = (segs: Seg[]) =>
		segs.map((s) => name(s.id)).join(spliced ? " + " : ", ");
	const island = top[0];

	return (
		<figure className={cls} ref={ref}>
			{w && showInset && drawnWin && w.view && (
				<div className="strand-weave-inset" aria-hidden="true">
					<svg
						className="strand-weave-svg"
						style={INSET_SVG}
						viewBox={`0 0 ${w.width} ${h}`}
						preserveAspectRatio="none"
						aria-hidden="true"
					>
						<WeaveBody w={w} />
						<path
							className="weave-bracket"
							d={`M${w.view[0]},1V${h - 1}H${w.view[1]}V1Z`}
							vectorEffect="non-scaling-stroke"
						/>
					</svg>
					<svg
						className="strand-weave-funnel"
						viewBox="0 0 100 10"
						preserveAspectRatio="none"
						aria-hidden="true"
					>
						<path
							d={`M${(w.view[0] / w.width) * 100},0L0,10M${(w.view[1] / w.width) * 100},0L100,10`}
							vectorEffect="non-scaling-stroke"
						/>
					</svg>
				</div>
			)}
			<div className="strand-weave-frame" ref={frameRef}>
				{w && variant === "hero" && (
					<div className="strand-weave-names" aria-hidden="true">
						{nameBoxes.map((n) =>
							n.hidden ? null : (
								<span
									key={n.key}
									className={`strand-weave-name is-${n.top ? "top" : "bottom"}${n.lane ? " is-lane2" : ""}`}
									style={{ left: fw ? n.left : `${n.x * 100}%` }}
								>
									{n.text}
								</span>
							),
						)}
					</div>
				)}
				{w && (
					<svg
						className="strand-weave-svg"
						style={FULL_SVG}
						viewBox={`${x0} 0 ${vw} ${h}`}
						preserveAspectRatio="none"
						role="img"
						aria-label={`${rowNames(w.top)} above, ${rowNames(w.bottom)} below: ${summary(w, name)}`}
					>
						<g className="weave-base">
							<WeaveBody w={w} />
						</g>
						{lit && (
							<g className="weave-lit" key={hl}>
								<Layers layers={lit.cords} className="weave-cords" />
								<Layers layers={lit.threads} className="weave-threads" />
							</g>
						)}
						{interactive && <Hits w={w} />}
					</svg>
				)}
				{placedMarks.length > 0 && (
					<div className="strand-weave-marks" aria-hidden="true">
						{placedMarks.map((m) => (
							<div
								key={m.key}
								className={`weave-mark is-${m.kind} is-${m.top ? "top" : "bottom"} is-${m.tone} align-${m.align}`}
								style={m.style}
							>
								<span className="weave-mark-label">{m.label}</span>
							</div>
						))}
					</div>
				)}
			</div>
			{w && caption !== false && (
				<figcaption className="strand-weave-caption">
					{variant === "inline" ? (
						<span>
							<b>{w.total}</b> threads
						</span>
					) : (
						<span>
							{variant === "hero" ? (
								<>
									{rowNames(w.top)} above, {rowNames(w.bottom)} below
									{w.top.concat(w.bottom).some((s) => s.rev)
										? " (⟲ drawn reversed)"
										: ""}
									.{" "}
								</>
							) : null}
							{summary(w, name, true)}
							{w.links.some((l) => l.level === "scan") &&
								" Grey dashed threads are scan pairs no one has read yet."}
						</span>
					)}
					{interactive && (
						<Link
							to="/network/$id"
							params={{ id: island }}
							className="strand-weave-more"
						>
							see every thread ↗
						</Link>
					)}
				</figcaption>
			)}
		</figure>
	);
}

/** the svgs size themselves: a generic `svg { height: auto }` rule (card
 * art, prose) must not size them by their stretched view boxes */
const FULL_SVG = { height: "100%" } as const;
const INSET_SVG = { height: "var(--weave-inset-h)" } as const;

/** the frame's width in px (0 before the first layout) */
function useWidth() {
	const ref = useRef<HTMLDivElement>(null);
	const [px, setPx] = useState(0);
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		setPx(el.clientWidth);
		if (typeof ResizeObserver === "undefined") return;
		const ro = new ResizeObserver(() => setPx(el.clientWidth));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	return [ref, px] as const;
}

interface PlacedMark {
	key: string;
	kind: "bracket" | "value" | "gather";
	top: boolean;
	tone: WeaveMarkTone;
	align: "centre" | "start" | "end";
	label: ReactNode;
	/** centre, as a share of the drawn width (for the name layout) */
	x: number;
	style: CSSProperties;
}

const sameCords = (p: number[], q: number[]) =>
	p.length === q.length && [...p].sort().join() === [...q].sort().join();

function placeMarks(
	w: Weave,
	marks: WeaveMark[],
	frac: (v: number) => number,
	h: number,
): PlacedMark[] {
	const yTop = 3;
	const yBot = h - 3;
	const out: PlacedMark[] = [];
	marks.forEach((m, k) => {
		const s = w.segOf(m.id);
		if (!s) return;
		const top = w.isTop(m.id);
		const tone = m.tone ?? (m.kind === "bracket" || !m.kind ? "quiet" : "key");
		const base = { key: String(k), top, tone, label: m.label };
		const yPct = `${((top ? yTop : yBot) / h) * 100}%`;
		const alignOf = (x: number) =>
			x < 0.18 ? "start" : x > 0.82 ? "end" : ("centre" as const);
		if (m.kind === "gather") {
			const r = w.recs.find((r) =>
				r.top === m.id
					? sameCords(r.tc, m.cords)
					: r.bottom === m.id && sameCords(r.bc, m.cords),
			);
			if (!r) return;
			const [gx, gy] = r.ends[r.top === m.id ? 0 : 1];
			const x = frac(gx);
			if (x < 0 || x > 1) return;
			out.push({
				...base,
				kind: "gather",
				align: x > 0.75 ? "end" : "start",
				x,
				style: { left: `${x * 100}%`, top: `${(gy / h) * 100}%` },
			});
			return;
		}
		const pos = (i: number) => (s.rev ? s.n - 1 - i : i);
		if (m.kind === "value") {
			if (m.cord < 0 || m.cord >= s.n) return;
			const x = frac(s.start + (pos(m.cord) + 0.5) * s.pitch);
			if (x < 0 || x > 1) return;
			out.push({
				...base,
				kind: "value",
				align: "centre",
				x,
				style: { left: `${x * 100}%`, top: yPct },
			});
			return;
		}
		const from = Math.max(0, m.from);
		const to = Math.min(s.n, m.to);
		if (to <= from) return;
		const ends = [pos(from), pos(to - 1)];
		const a = frac(s.start + Math.min(...ends) * s.pitch);
		const b = frac(s.start + (Math.max(...ends) + 1) * s.pitch);
		const left = Math.max(0, a);
		const right = Math.min(1, b);
		if (right <= left) return;
		// neighbouring brackets keep a hair of space between their ticks
		out.push({
			...base,
			kind: "bracket",
			align: alignOf((left + right) / 2),
			x: (left + right) / 2,
			style: {
				left: `calc(${left * 100}% + 1.5px)`,
				width: `max(2px, calc(${(right - left) * 100}% - 3px))`,
				top: yPct,
			},
		});
	});
	return out;
}

/** px per character of a khipu name (0.72rem, tracked) */
const NAME_CH = 7.4;
/** px per character of a value mark (0.7rem, tabular) */
const MARK_CH = 6.6;

interface NameBox {
	key: string;
	top: boolean;
	text: string;
	/** preferred left, as a share of the width */
	x: number;
	/** laid-out left in px */
	left: number;
	lane: 0 | 1;
	hidden: boolean;
}

/** Khipu names along each primary: at their khipu's first cord, nudged right
 * past a neighbour or a value mark, else on a second line, else left out
 * (the caption lists every khipu). Before the width is known: as given. */
function layoutNames(
	items: { key: string; top: boolean; text: string; x: number }[],
	fw: number,
	values: PlacedMark[],
): NameBox[] {
	const out: NameBox[] = items.map((n) => ({
		...n,
		left: 0,
		lane: 0,
		hidden: false,
	}));
	if (!fw) return out;
	for (const top of [true, false]) {
		const row = out.filter((n) => n.top === top).sort((p, q) => p.x - q.x);
		const blocks: [number, number][] = values
			.filter((v) => v.top === top)
			.map((v) => {
				const len =
					typeof v.label === "string" || typeof v.label === "number"
						? String(v.label).length
						: 4;
				const half = (len * MARK_CH) / 2 + 4;
				return [v.x * fw - half, v.x * fw + half];
			});
		const right: [number, number] = [-Infinity, -Infinity];
		for (const n of row) {
			const wd = n.text.length * NAME_CH + 4;
			const pref = Math.min(Math.max(0, n.x * fw), fw - wd);
			let done = false;
			for (const lane of [0, 1] as const) {
				const left = Math.max(pref, right[lane] + 8);
				// value marks share lane 0: a name they cover takes lane 1
				if (
					lane === 0 &&
					blocks.some(([b0, b1]) => left < b1 && left + wd > b0)
				)
					continue;
				if (left + wd > fw || left - pref > Math.max(60, wd)) continue;
				n.left = left;
				n.lane = lane;
				right[lane] = left + wd;
				done = true;
				break;
			}
			n.hidden = !done;
		}
	}
	return out;
}

/** "89 of 104 fields agree with UR233" per compared link, else the matched
 * thread count; then the tally of kinds */
function summary(w: Weave, name: (id: string) => string, rich?: false): string;
function summary(w: Weave, name: (id: string) => string, rich: true): ReactNode;
function summary(
	w: Weave,
	name: (id: string) => string,
	rich?: boolean,
): ReactNode {
	const many = w.links.length > 1;
	const compared = w.links.filter((l) => l.compared);
	const plain = w.links.filter((l) => !l.compared);
	const parts: string[] = compared.map(
		(l, i) =>
			`${l.agree} of ${l.compared}${i === 0 ? " fields agree" : ""}${many ? ` between ${name(l.top)} and ${name(l.bottom)}` : ""}`,
	);
	const m = plain.reduce((s, l) => s + l.matched, 0);
	if (plain.length)
		parts.push(
			`${m} matched cord${m === 1 ? "" : "s"}${compared.length ? " on the other links" : ""}`,
		);
	const text = `${parts.join(compared.length > 1 ? ", " : "; ")}.`;
	if (!rich) return `${text} ${w.total} threads drawn.`;
	return (
		<>
			{text} <b>{w.total}</b> threads drawn
			<Tally counts={w.counts} />.
		</>
	);
}

function Tally({ counts }: { counts: Partial<Record<ThreadKind, number>> }) {
	const kinds = (Object.keys(THREAD_LABEL) as ThreadKind[]).filter(
		(k) => counts[k],
	);
	if (kinds.length < 2) return null;
	return (
		<>
			{": "}
			{kinds.map((k, i) => (
				<Fragment key={k}>
					{i > 0 && ", "}
					<span className="strand-weave-tally">
						<i className={`strand-weave-key weave-t-${k}`} aria-hidden="true" />
						{counts[k]} {THREAD_LABEL[k]}
					</span>
				</Fragment>
			))}
		</>
	);
}

function Layers({ layers, className }: { layers: Layer[]; className: string }) {
	return (
		<g className={className}>
			{layers.map((l) => (
				<path
					key={l.key}
					className={l.cls}
					d={l.d}
					style={
						l.color
							? {
									stroke: l.raw
										? l.color
										: `color-mix(in oklab, ${l.color} var(--weave-dye), var(--weave-mix))`,
								}
							: undefined
					}
					vectorEffect="non-scaling-stroke"
				/>
			))}
		</g>
	);
}

const WeaveBody = memo(function WeaveBody({ w }: { w: Weave }) {
	return (
		<>
			<Layers layers={w.cords} className="weave-cords" />
			<path
				className="weave-primary"
				d={w.primaries}
				vectorEffect="non-scaling-stroke"
			/>
			<path
				className="weave-splice"
				d={w.splices}
				vectorEffect="non-scaling-stroke"
			/>
			<Layers layers={w.threads} className="weave-threads" />
			<g className="weave-threads weave-marks">
				{w.strikes && (
					<path
						className="weave-strike"
						d={w.strikes}
						vectorEffect="non-scaling-stroke"
					/>
				)}
				{w.rings && (
					<>
						<path
							className="weave-ring"
							d={w.rings}
							vectorEffect="non-scaling-stroke"
						/>
						<path
							className="weave-ring-hole"
							d={w.rings}
							vectorEffect="non-scaling-stroke"
						/>
					</>
				)}
			</g>
		</>
	);
});

/** hover: each thread has an invisible hit line with its values as a title */
const Hits = memo(function Hits({ w }: { w: Weave }) {
	return (
		<g className="weave-hits">
			{w.recs.map((t) => (
				<path key={t.key} d={t.hit} vectorEffect="non-scaling-stroke">
					<title>{t.title}</title>
				</path>
			))}
		</g>
	);
});

export default memo(StrandWeave);
