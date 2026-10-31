import { Link } from "@tanstack/react-router";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useMeasure } from "#/components/charts/useMeasure";
import KhipuSilhouette from "#/components/khipu/KhipuSilhouette";
import type { Silhouettes } from "#/lib/khipu/data";
import type { ColorTable } from "#/lib/khipu/types";
import {
	type GraphLink,
	type GraphNode,
	type Island,
	KIND_LABEL,
	shortMuseum,
} from "#/lib/stories/links";
import {
	matchedThreads,
	type StrandFile,
	THREAD_LABEL,
	type ThreadKind,
} from "#/lib/stories/strands";

/**
 * One island of the network drawn in the khipus' own terms: every linked
 * khipu is laid on a shelf, pendant by pendant at one shared scale, and each
 * link becomes a ribbon between the cords that actually match — a run of
 * identical values is a band from the cords of one khipu to the cords of the
 * other, twisted when one khipu is read in reverse. Links the scan cannot
 * place on the cords (spliced primaries, matched group leaders) run down the
 * gutter instead. Where a link has been read cord by cord (strands.json),
 * each matched pair of pendants gets a thread of its own, from the tip of the
 * cord on the upper khipu to the head of its partner below; a sum gathers its
 * cords in a small fan first. The order of the shelf keeps linked khipus next
 * to each other where it can.
 */

/** the khipus drawn as rows: all of a small island, the linked ones of a big one */
export const MAX_ROWS = 40;

export function shelfRows(island: Island, strands?: StrandFile): GraphNode[] {
	// khipus with no link of their own go in the page's "Also found here" strip
	const linked = island.nodes.filter((n) => n.links.length > 0);
	const pool =
		linked.length >= 2 || island.nodes.length > MAX_ROWS
			? linked
			: island.nodes;
	// a link weighs what it shares: its run values or its matched cords, or a
	// token weight for a curated link neither can see, so the widest ribbons
	// and the densest threads get adjacent rows
	const weight = (l: GraphLink) =>
		Math.max(
			l.scan?.values ?? 0,
			matchedThreads(strands?.links[l.id]).length,
		) || 8;
	const degree = (n: GraphNode) => n.links.reduce((s, l) => s + weight(l), 0);
	const between = (x: GraphNode, y: GraphNode) =>
		x.links
			.filter((l) => l.a === y.id || l.b === y.id)
			.reduce((s, l) => s + weight(l), 0);
	const left = new Set(pool);
	const out: GraphNode[] = [];
	while (left.size) {
		// start each chain at its best-connected khipu, then keep appending the
		// khipu most tied to the row just placed
		let next: GraphNode | undefined;
		const last = out[out.length - 1];
		let best = -1;
		for (const n of left) {
			const score = last
				? between(n, last) * 100 +
					out.reduce((s, o) => s + between(n, o), 0) * 10 +
					degree(n)
				: degree(n);
			if (score > best || (score === best && next && n.id < next.id)) {
				best = score;
				next = n;
			}
		}
		if (!next) break;
		left.delete(next);
		out.push(next);
	}
	return settle(out, pool, weight);
}

/**
 * Polish the greedy order: move single rows while that shortens the total
 * weighted distance between linked rows. The greedy chain starts at the hub,
 * which leaves the hub's second partner two rows away; this pulls it back.
 */
function settle(
	order: GraphNode[],
	pool: GraphNode[],
	weight: (l: GraphLink) => number,
): GraphNode[] {
	const ids = new Set(pool.map((n) => n.id));
	const seen = new Set<string>();
	const edges: [string, string, number][] = [];
	for (const n of pool)
		for (const l of n.links)
			if (!seen.has(l.id) && ids.has(l.a) && ids.has(l.b)) {
				seen.add(l.id);
				edges.push([l.a, l.b, weight(l)]);
			}
	if (order.length < 3 || edges.length === 0) return order;
	const cost = (o: GraphNode[]) => {
		const at = new Map(o.map((n, i) => [n.id, i]));
		let c = 0;
		for (const [a, b, w] of edges)
			c += w * Math.abs((at.get(a) ?? 0) - (at.get(b) ?? 0));
		return c;
	};
	let best = order;
	let bestCost = cost(best);
	for (let pass = 0; pass < 12; pass++) {
		let improved = false;
		for (let i = 0; i < best.length; i++)
			for (let j = 0; j < best.length; j++) {
				if (i === j) continue;
				const o = best.slice();
				const [n] = o.splice(i, 1);
				o.splice(j, 0, n);
				const c = cost(o);
				if (c < bestCost - 1e-9) {
					best = o;
					bestCost = c;
					improved = true;
				}
			}
		if (!improved) break;
	}
	return best;
}

interface Row {
	node: GraphNode;
	index: number;
	n: number;
	/** top of the row (the primary cord) and its height */
	y: number;
	h: number;
	/** width of the drawn silhouette */
	w: number;
	/** how far the row slides right so its matched cords sit over their partners */
	x: number;
	/** y of each pendant's tip, relative to the row, as the silhouette draws it */
	tips: number[];
}

interface Ribbon {
	link: GraphLink;
	key: string;
	top: Row;
	bottom: Row;
	/** cord ranges, 0-based inclusive start, exclusive end */
	t0: number;
	t1: number;
	b0: number;
	b1: number;
	rev: boolean;
	values?: number[];
	/** the link's cords are drawn as threads too, so the ribbon steps back */
	threaded: boolean;
}

interface Connector {
	link: GraphLink;
	top: Row;
	bottom: Row;
	depth: number;
}

/** one matched pair of cords (or cords and their total), ready to draw */
interface Thread {
	key: string;
	kind: ThreadKind;
	d: string;
	/** where a fan of cords gathers into one strand */
	joints: [number, number][];
	/** differ: a short bar across the thread's middle */
	strike?: string;
	/** dropped: the end at the blank cord, drawn as a hollow ring */
	hollow?: [number, number];
	title: string;
}

interface ThreadLabel {
	x: number;
	y: number;
	text: string;
}

/** every thread of one link, drawn and lit together */
interface Strand {
	link: GraphLink;
	top: Row;
	bottom: Row;
	/** the link skips rows, so its threads cross other khipus */
	far: boolean;
	threads: Thread[];
	/** the values beside the thread ends, thinned so none overlap */
	labels: ThreadLabel[];
	/** the matched cords of each end, for the focus marks */
	ends: { row: Row; cords: number[] }[];
}

/** a matched cord, marked on its row */
interface Mark {
	i: number;
	kind: GraphLink["kind"];
}

const GAP = 60;
const TOP = 8;
const LABEL_H = 36;
/** threads that carry a value across weigh full in the row alignment */
const MATCHED = new Set<ThreadKind>(["exact", "near", "sum", "scaled"]);

/** below this pitch a run's threads would merge into its ribbon anyway */
const THREAD_PITCH = 3;
/** how far below/above a row a fan of cords gathers */
const FAN = 11;

const cordX = (i: number, pitch: number) => 1 + i * pitch;
const cordMid = (i: number, pitch: number) => 1 + i * pitch + pitch / 2;

const pNames = (cords: number[]) => cords.map((i) => `p${i + 1}`).join("+");

/** the spread of the aligned shelf, as a multiple of its longest khipu */
const MAX_SPREAD = 1.6;

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** the weighted median of [value, weight] pairs */
const median = (xs: [number, number][]) => {
	const s = [...xs].sort((p, q) => p[0] - q[0]);
	const half = s.reduce((t, [, w]) => t + w, 0) / 2;
	let acc = 0;
	for (const [v, w] of s) {
		acc += w;
		if (acc >= half) return v;
	}
	return s[s.length - 1]?.[0] ?? 0;
};

/**
 * Slide the rows sideways, in cords, so that matched cords sit over each
 * other and the threads between rows fall as straight as they can, like the
 * bands of a Sankey diagram. Each link asks for one shift between its two
 * khipus — the weighted median of where its threads (or scan spans) land, so a
 * stray sum does not drag a long run out of line — and the shifts are settled
 * by least absolute error, since a chain of links need not agree. Rows no link can
 * place are centred under the rest; a spread wider than MAX_SPREAD times the
 * longest khipu is pulled in, so the cords stay a readable size.
 */
export function alignRows(
	rows: GraphNode[],
	links: GraphLink[],
	counts: Map<string, number>,
	strandFile: StrandFile | undefined,
): Map<string, number> {
	const ids = new Set(rows.map((r) => r.id));
	// per link: off_b - off_a ≈ d, with weight w
	const edges: { a: string; b: string; d: number; w: number }[] = [];
	for (const link of links) {
		if (!ids.has(link.a) || !ids.has(link.b) || link.a === link.b) continue;
		const deltas: [number, number][] = [];
		const sl = strandFile?.links[link.id];
		if (sl?.threads.length) {
			const aIsA = sl.a === link.a;
			for (const t of sl.threads) {
				if (!t.a.length || !t.b.length) continue;
				const d = mean(t.a) - mean(t.b);
				deltas.push([aIsA ? d : -d, MATCHED.has(t.kind) ? 1 : 0.5]);
			}
		} else if (link.scan?.spans.length) {
			const aIsA = (link.scan.a ?? link.a) === link.a;
			for (const [n, i, j] of link.scan.spans)
				deltas.push([aIsA ? i - j : j - i, n]);
		}
		if (deltas.length === 0) continue;
		edges.push({
			a: link.a,
			b: link.b,
			d: median(deltas),
			w: deltas.reduce((s, [, w]) => s + w, 0),
		});
	}
	const off = new Map(rows.map((r) => [r.id, 0]));
	const nbrs = new Map<string, { o: string; d: number; w: number }[]>(
		rows.map((r) => [r.id, []]),
	);
	for (const e of edges) {
		nbrs.get(e.a)?.push({ o: e.b, d: -e.d, w: e.w });
		nbrs.get(e.b)?.push({ o: e.a, d: e.d, w: e.w });
	}
	// first least squares (Gauss–Seidel on the weighted graph Laplacian: each
	// row moves to the weighted mean of where its partners want it), then the
	// weighted median, so a fragment tied to two distant places sits squarely
	// under its stronger partner instead of halfway between both
	const settle = (pick: (xs: [number, number][]) => number, passes: number) => {
		for (let it = 0; it < passes; it++) {
			let moved = 0;
			for (const r of rows) {
				const ns = nbrs.get(r.id) ?? [];
				if (ns.length === 0) continue;
				const x = pick(ns.map(({ o, d, w }) => [(off.get(o) ?? 0) + d, w]));
				moved = Math.max(moved, Math.abs(x - (off.get(r.id) ?? 0)));
				off.set(r.id, x);
			}
			if (moved < 0.01) break;
		}
	};
	settle(
		(xs) =>
			xs.reduce((s, [x, w]) => s + x * w, 0) /
			xs.reduce((s, [, w]) => s + w, 0),
		400,
	);
	settle(median, 50);
	// components of the alignment graph, each free to slide as a whole
	const comp = new Map<string, number>();
	const comps: string[][] = [];
	for (const r of rows) {
		if (comp.has(r.id)) continue;
		const members: string[] = [];
		const stack = [r.id];
		comp.set(r.id, comps.length);
		while (stack.length) {
			const id = stack.pop() as string;
			members.push(id);
			for (const { o } of nbrs.get(id) ?? [])
				if (!comp.has(o)) {
					comp.set(o, comps.length);
					stack.push(o);
				}
		}
		comps.push(members);
	}
	const n = (id: string) => counts.get(id) ?? 0;
	const maxN = Math.max(1, ...rows.map((r) => n(r.id)));
	const cap = maxN * MAX_SPREAD;
	const spread = (m: string[], f: number) => {
		const lo = Math.min(...m.map((id) => (off.get(id) ?? 0) * f));
		const hi = Math.max(...m.map((id) => (off.get(id) ?? 0) * f + n(id)));
		return { lo, hi };
	};
	const out = new Map<string, number>();
	const placed = comps.map((m) => {
		let f = 1;
		const { lo, hi } = spread(m, 1);
		if (hi - lo > cap) {
			// pull the component in until it fits
			let a = 0;
			let b = 1;
			for (let k = 0; k < 20; k++) {
				const mid = (a + b) / 2;
				const s = spread(m, mid);
				if (s.hi - s.lo > cap) b = mid;
				else a = mid;
			}
			f = a;
		}
		return { m, f, ...spread(m, f) };
	});
	const width = Math.max(...placed.map((p) => p.hi - p.lo));
	for (const p of placed) {
		const shift = (width - (p.hi - p.lo)) / 2 - p.lo;
		for (const id of p.m) out.set(id, (off.get(id) ?? 0) * p.f + shift);
	}
	return out;
}

function layout(
	rows: GraphNode[],
	links: GraphLink[],
	silhouettes: Silhouettes,
	values: Record<string, number[]> | undefined,
	strandFile: StrandFile | undefined,
	width: number,
	gutter: number,
) {
	const labelsAbove = gutter === 0;
	const artW = Math.max(120, width - gutter - 8);
	const counts = new Map(
		rows.map((r) => [r.id, silhouettes[r.id]?.l.length ?? 0]),
	);
	const shift = alignRows(rows, links, counts, strandFile);
	// the shelf's extent in cords, once the rows have slid into line
	const maxN = Math.max(
		1,
		...rows.map((r) => (shift.get(r.id) ?? 0) + (counts.get(r.id) ?? 0)),
	);
	const pitch = Math.max(1, Math.min(9, artW / maxN));
	const maxLen = Math.max(
		1,
		...rows.map((r) =>
			Math.max(0, ...(silhouettes[r.id]?.l.map((l) => l ?? 0) ?? [0])),
		),
	);
	const perCm = Math.min(2, 120 / maxLen);

	let y = TOP;
	const placed: Row[] = rows.map((node, index) => {
		const s = silhouettes[node.id];
		const n = s?.l.length ?? 0;
		const longest = Math.max(0, ...(s?.l.map((l) => l ?? 0) ?? [0]));
		const h = Math.max(28, Math.min(128, longest * perCm)) + 4;
		// the same scale KhipuSilhouette uses, so a thread leaves its cord's tip
		const own = Math.max(1, longest);
		const tips = (s?.l ?? []).map(
			(l) => 2 + Math.max(1, ((l ?? 0) / own) * (h - 4)),
		);
		if (labelsAbove) y += LABEL_H;
		const x = (shift.get(node.id) ?? 0) * pitch;
		const row = {
			node,
			index,
			n,
			y,
			h,
			w: Math.max(24, n * pitch + 2),
			x,
			tips,
		};
		y += h + GAP;
		return row;
	});
	const byId = new Map(placed.map((r) => [r.node.id, r]));

	const ribbons: Ribbon[] = [];
	const connectors: Connector[] = [];
	const strands: Strand[] = [];
	const marks = new Map<string, Mark[]>(placed.map((r) => [r.node.id, []]));
	for (const link of links) {
		const ra = byId.get(link.a);
		const rb = byId.get(link.b);
		if (!ra || !rb) continue;
		const aOnTop = ra.index < rb.index;
		const top = aOnTop ? ra : rb;
		const bottom = aOnTop ? rb : ra;
		const spans = link.scan?.spans ?? [];
		const sl = strandFile?.links[link.id];
		const threaded = !!sl && sl.threads.length > 0 && pitch >= THREAD_PITCH;
		const rev = link.scan?.dir === "rev";
		// spans index the scan's own a/b, which a curated link may name the other way round
		const scanA = link.scan?.a ?? link.a;
		const iOnTop = (scanA === link.a) === aOnTop;
		const mine: Ribbon[] = spans.map(([n, i, j], k) => {
			const ti = iOnTop ? i : j;
			const bi = iOnTop ? j : i;
			return {
				link,
				key: `${link.id}:${k}`,
				top,
				bottom,
				t0: ti,
				t1: ti + n,
				b0: bi,
				b1: bi + n,
				rev,
				values: values?.[scanA]?.slice(i, i + n),
				threaded,
			};
		});
		ribbons.push(...mine);
		if (sl && sl.threads.length > 0) {
			const s = buildStrand(link, sl, top, bottom, mine, pitch, gutter);
			if (s.threads.length > 0) {
				strands.push(s);
				for (const e of s.ends) {
					const m = marks.get(e.row.node.id);
					if (m) for (const i of e.cords) m.push({ i, kind: link.kind });
				}
			}
			continue;
		}
		if (spans.length === 0) connectors.push({ link, top, bottom, depth: 0 });
	}
	// gutter connectors nest: a longer one bulges further out than the ones inside it
	connectors.sort(
		(x, y) => x.bottom.index - x.top.index - (y.bottom.index - y.top.index),
	);
	for (const c of connectors)
		c.depth = connectors.filter(
			(o) =>
				o !== c &&
				o.top.index >= c.top.index &&
				o.bottom.index <= c.bottom.index &&
				o.bottom.index - o.top.index < c.bottom.index - c.top.index,
		).length;
	// long threads first, so the ones between neighbours draw over them
	strands.sort(
		(x, y) => y.bottom.index - y.top.index - (x.bottom.index - x.top.index),
	);
	// per row: its ribbon bands and its matched cords, as stable arrays for the memoised rows
	const bands = new Map<string, Ribbon[]>(
		placed.map((r) => [
			r.node.id,
			ribbons.filter((b) => b.top === r || b.bottom === r),
		]),
	);
	for (const [k, m] of marks) {
		const seen = new Set<number>();
		marks.set(
			k,
			m.filter((x) => !seen.has(x.i) && seen.add(x.i)),
		);
	}

	return {
		rows: placed,
		ribbons,
		connectors,
		strands,
		bands,
		marks,
		pitch,
		height: y - GAP + 8,
		svgWidth: Math.max(width, gutter + 8 + maxN * pitch + 2),
		labelsAbove,
	};
}

function buildStrand(
	link: GraphLink,
	sl: NonNullable<StrandFile["links"][string]>,
	top: Row,
	bottom: Row,
	ribbons: Ribbon[],
	pitch: number,
	gutter: number,
): Strand {
	// the strand file keys a pair by pairKey, so its a may be either end
	const topIsA = sl.a === top.node.id;
	const yt = top.y + top.h;
	const yb = bottom.y + 2;
	const X = (i: number, row: Row) => gutter + row.x + cordMid(i, pitch);
	// a thread leaves its cord's tip; at a fine pitch the cords touch, so it
	// leaves the bottom of the row instead of drawing over its neighbours
	const tip = (i: number) => (pitch < THREAD_PITCH ? yt : top.y + top.tips[i]);
	const ok = (cords: number[], row: Row) =>
		cords.filter((i) => Number.isInteger(i) && i >= 0 && i < row.n);
	const threads: Thread[] = [];
	const topLabels: ThreadLabel[] = [];
	const bottomLabels: ThreadLabel[] = [];
	const topCords = new Set<number>();
	const bottomCords = new Set<number>();
	sl.threads.forEach((t, k) => {
		const tc = ok(topIsA ? t.a : t.b, top);
		const bc = ok(topIsA ? t.b : t.a, bottom);
		if (tc.length === 0 || bc.length === 0) return;
		// at a fine pitch a plain one-to-one match inside a ribbon is the ribbon
		if (
			pitch < THREAD_PITCH &&
			tc.length === 1 &&
			bc.length === 1 &&
			ribbons.some(
				(r) => tc[0] >= r.t0 && tc[0] < r.t1 && bc[0] >= r.b0 && bc[0] < r.b1,
			)
		)
			return;
		const vt = topIsA ? t.va : t.vb;
		const vb = topIsA ? t.vb : t.va;
		const joints: [number, number][] = [];
		let d = "";
		// the upper end: straight down from each cord's tip, gathered into one point
		let x0: number;
		let y0: number;
		if (tc.length === 1) {
			x0 = X(tc[0], top);
			y0 = yt;
			d += `M${x0},${tip(tc[0])}L${x0},${yt}`;
		} else {
			x0 = tc.reduce((s, i) => s + X(i, top), 0) / tc.length;
			y0 = yt + FAN;
			for (const i of tc) {
				const x = X(i, top);
				d += `M${x},${tip(i)}L${x},${yt}Q${x},${y0} ${x0},${y0}`;
			}
			joints.push([x0, y0]);
		}
		// the lower end: a head of one cord, or a fan opening onto several
		let x1: number;
		let y1: number;
		if (bc.length === 1) {
			x1 = X(bc[0], bottom);
			y1 = yb;
		} else {
			x1 = bc.reduce((s, i) => s + X(i, bottom), 0) / bc.length;
			y1 = yb - FAN;
			joints.push([x1, y1]);
		}
		const ym = (y1 - y0) / 2;
		d += `M${x0},${y0}C${x0},${y0 + ym} ${x1},${y1 - ym} ${x1},${y1}`;
		if (bc.length > 1)
			for (const i of bc) {
				const x = X(i, bottom);
				d += `M${x1},${y1}Q${x},${y1} ${x},${yb}`;
			}
		for (const i of tc) topCords.add(i);
		for (const i of bc) bottomCords.add(i);
		const [ca, cb] = topIsA ? [tc, bc] : [bc, tc];
		const ratio =
			t.kind === "scaled" && t.va
				? `, ×${Math.round((t.vb / t.va) * 100) / 100}`
				: t.how
					? `: ${t.how}`
					: "";
		const xm = (x0 + x1) / 2;
		const ymid = (y0 + y1) / 2;
		threads.push({
			key: `${link.id}:${k}`,
			kind: t.kind,
			d,
			joints,
			strike:
				t.kind === "differ"
					? `M${xm - 3},${ymid - 2}L${xm + 3},${ymid + 2}`
					: undefined,
			hollow:
				t.kind === "dropped" ? (vt === 0 ? [x0, y0] : [x1, y1]) : undefined,
			title: `${pNames(ca)} of ${sl.a} = ${t.va} → ${pNames(cb)} of ${sl.b} = ${t.vb} (${THREAD_LABEL[t.kind]}${ratio})${t.note ? ` — ${t.note}` : ""}`,
		});
		if (t.kind !== "blank") {
			topLabels.push({ x: x0, y: y0 + 11, text: String(vt) });
			bottomLabels.push({ x: x1, y: y1 - 4, text: String(vb) });
		}
	});
	return {
		link,
		top,
		bottom,
		far: bottom.index - top.index > 1,
		threads,
		labels: [...thin(topLabels), ...thin(bottomLabels)],
		ends: [
			{ row: top, cords: [...topCords].sort((x, y) => x - y) },
			{ row: bottom, cords: [...bottomCords].sort((x, y) => x - y) },
		],
	};
}

/** keep the labels that fit side by side, left to right */
function thin(labels: ThreadLabel[]): ThreadLabel[] {
	const out: ThreadLabel[] = [];
	let right = -Infinity;
	for (const l of [...labels].sort((x, y) => x.x - y.x)) {
		const half = (l.text.length * 6 + 2) / 2;
		if (l.x - half < right + 3) continue;
		out.push(l);
		right = l.x + half;
	}
	return out;
}

function ribbonPath(r: Ribbon, gutter: number, pitch: number): string {
	const xt0 = gutter + r.top.x + cordX(r.t0, pitch);
	const xt1 = gutter + r.top.x + cordX(r.t1, pitch);
	const xb0 = gutter + r.bottom.x + cordX(r.b0, pitch);
	const xb1 = gutter + r.bottom.x + cordX(r.b1, pitch);
	const yt = r.top.y + r.top.h;
	const yb = r.bottom.y;
	const ym = (yt + yb) / 2;
	// a reversed match crosses: the first cord of one run is the last of the other
	const [l1, r1] = r.rev ? [xb1, xb0] : [xb0, xb1];
	return `M${xt0},${yt}C${xt0},${ym} ${l1},${ym} ${l1},${yb}L${r1},${yb}C${r1},${ym} ${xt1},${ym} ${xt1},${yt}Z`;
}

function connectorPath(c: Connector, gutter: number): string {
	const x = gutter > 0 ? gutter - 14 : 6;
	const y0 = c.top.y + 6;
	const y1 = c.bottom.y + 6;
	const bulge = 16 + c.depth * 9;
	const xo = gutter > 0 ? x - bulge : x + bulge;
	return `M${x},${y0}C${xo},${y0} ${xo},${y1} ${x},${y1}`;
}

interface Props {
	island: Island;
	rows: GraphNode[];
	silhouettes: Silhouettes;
	colors: ColorTable;
	/** level-1 values per khipu, when they were loaded: the ribbons then say what they carry */
	values?: Record<string, number[]>;
	/** cord-by-cord matches, when strands.json has been built */
	strands?: StrandFile;
	selected: string | null;
	onSelect: (id: string | null) => void;
}

export default function IslandShelf({
	island,
	rows,
	silhouettes,
	colors,
	values,
	strands,
	selected,
	onSelect,
}: Props) {
	const { ref, width } = useMeasure<HTMLDivElement>(960);
	const [hover, setHover] = useState<string | null>(null);
	const gutter = width < 640 ? 0 : 176;
	const L = useMemo(
		() =>
			layout(rows, island.links, silhouettes, values, strands, width, gutter),
		[rows, island.links, silhouettes, values, strands, width, gutter],
	);

	const focus = hover ?? selected;
	const lit = useMemo(() => {
		const nodes = new Set<string>();
		const links = new Set<string>();
		if (!focus) return { nodes, links, any: false };
		const link = island.links.find((l) => l.id === focus);
		if (link) {
			links.add(link.id);
			nodes.add(link.a);
			nodes.add(link.b);
		} else {
			nodes.add(focus);
			for (const l of island.links)
				if (l.a === focus || l.b === focus) {
					links.add(l.id);
					nodes.add(l.a);
					nodes.add(l.b);
				}
		}
		return { nodes, links, any: true };
	}, [focus, island.links]);

	// a stable toggle, so selecting one thing does not redraw every memoised row
	const selectedRef = useRef(selected);
	selectedRef.current = selected;
	const toggle = useCallback(
		(id: string) => onSelect(selectedRef.current === id ? null : id),
		[onSelect],
	);
	const ribbonCls = (link: GraphLink) =>
		[
			"shelf-ribbon",
			`link-edge-${link.kind}`,
			`shelf-ribbon-${link.level}`,
			lit.links.has(link.id) ? "is-lit" : "",
			selected === link.id ? "is-selected" : "",
		].join(" ");

	// the values a lit ribbon carries, printed once beside it — unless its
	// threads print them cord by cord
	const focusStrand = focus
		? L.strands.find((s) => s.link.id === focus)
		: undefined;
	const label =
		focus && !focusStrand
			? L.ribbons.find((r) => r.link.id === focus && r.values?.length)
			: undefined;

	// the threads go over the rows, so each one visibly leaves its own cord —
	// except on a narrow screen, where the row labels sit in their path
	const threadLayer = (
		<g className="shelf-threads">
			{L.strands.map((s) => (
				<StrandGroup
					key={s.link.id}
					strand={s}
					lit={lit.links.has(s.link.id)}
					selected={selected === s.link.id}
					onHover={setHover}
					onSelect={toggle}
				/>
			))}
		</g>
	);

	return (
		<div className="island-shelf" ref={ref}>
			<div className="island-shelf-scroll">
				<svg
					width={L.svgWidth}
					height={L.height}
					viewBox={`0 0 ${L.svgWidth} ${L.height}`}
					role="img"
					className={lit.any ? "has-focus" : undefined}
					aria-label={`${rows.length} khipus laid out with ${island.links.length} links drawn between their cords`}
					onClick={() => onSelect(null)}
					onKeyDown={(e) => {
						if (e.key === "Escape") onSelect(null);
					}}
				>
					{/* ribbons first, so the rows read over them */}
					{L.ribbons.map((r) => (
						// biome-ignore lint/a11y/noStaticElementInteractions: svg control with a title; the list below is the keyboard route
						<g
							key={r.key}
							className={`${ribbonCls(r.link)}${r.threaded ? " is-threaded" : ""}`}
							onMouseEnter={() => setHover(r.link.id)}
							onMouseLeave={() => setHover(null)}
							onClick={(e) => {
								e.stopPropagation();
								toggle(r.link.id);
							}}
						>
							<title>{`${KIND_LABEL[r.link.kind]}: ${r.t1 - r.t0} values, cords ${r.t0 + 1}–${r.t1} of ${r.top.node.id} and ${r.b0 + 1}–${r.b1} of ${r.bottom.node.id}${r.rev ? ", reversed" : ""}${r.values ? `: ${r.values.join(" · ")}` : ""}`}</title>
							<path
								className="shelf-ribbon-fill"
								d={ribbonPath(r, gutter, L.pitch)}
							/>
						</g>
					))}
					{L.connectors.map((c) => (
						// biome-ignore lint/a11y/noStaticElementInteractions: as above
						<g
							key={c.link.id}
							className={ribbonCls(c.link)}
							onMouseEnter={() => setHover(c.link.id)}
							onMouseLeave={() => setHover(null)}
							onClick={(e) => {
								e.stopPropagation();
								toggle(c.link.id);
							}}
						>
							<title>{`${KIND_LABEL[c.link.kind]}: ${c.link.note}`}</title>
							<path
								className="shelf-connector-hit"
								d={connectorPath(c, gutter)}
							/>
							<path className="shelf-connector" d={connectorPath(c, gutter)} />
						</g>
					))}
					{L.labelsAbove && threadLayer}
					{L.rows.map((row) => (
						<ShelfRow
							key={row.node.id}
							row={row}
							gutter={gutter}
							pitch={L.pitch}
							labelsAbove={L.labelsAbove}
							bands={L.bands.get(row.node.id) ?? NONE}
							marks={L.marks.get(row.node.id) ?? NONE}
							silhouettes={silhouettes}
							colors={colors}
							lit={lit.nodes.has(row.node.id)}
							selected={selected === row.node.id}
							onHover={setHover}
							onSelect={toggle}
						/>
					))}
					{!L.labelsAbove && threadLayer}
					{focusStrand && (
						<StrandFocus strand={focusStrand} gutter={gutter} pitch={L.pitch} />
					)}
					{label && (
						<RibbonLabel ribbon={label} gutter={gutter} pitch={L.pitch} />
					)}
				</svg>
			</div>
		</div>
	);
}

const NONE: never[] = [];

const StrandGroup = memo(function StrandGroup({
	strand: s,
	lit,
	selected,
	onHover,
	onSelect,
}: {
	strand: Strand;
	lit: boolean;
	selected: boolean;
	onHover: (id: string | null) => void;
	onSelect: (id: string) => void;
}) {
	const cls = [
		"shelf-strand",
		`link-edge-${s.link.kind}`,
		`shelf-ribbon-${s.link.level}`,
		s.far ? "is-far" : "",
		lit ? "is-lit" : "",
		selected ? "is-selected" : "",
	]
		.filter(Boolean)
		.join(" ");
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: svg control; each thread has a title and the list below is the keyboard route
		<g
			className={cls}
			onMouseEnter={() => onHover(s.link.id)}
			onMouseLeave={() => onHover(null)}
			onClick={(e) => {
				e.stopPropagation();
				onSelect(s.link.id);
			}}
		>
			{s.threads.map((t) => (
				<g key={t.key} className={`shelf-thread shelf-thread-${t.kind}`}>
					<title>{t.title}</title>
					<path className="shelf-thread-hit" d={t.d} />
					<path className="shelf-thread-line" d={t.d} />
					{t.strike && <path className="shelf-thread-strike" d={t.strike} />}
					{t.hollow && (
						<circle
							className="shelf-thread-hollow"
							cx={t.hollow[0]}
							cy={t.hollow[1]}
							r={2.2}
						/>
					)}
					{t.joints.map(([x, y]) => (
						<circle
							key={`${x},${y}`}
							className="shelf-thread-joint"
							cx={x}
							cy={y}
							r={2}
						/>
					))}
				</g>
			))}
		</g>
	);
});

/** the focused link's cords picked out on both rows, and the values at its thread ends */
function StrandFocus({
	strand: s,
	gutter,
	pitch,
}: {
	strand: Strand;
	gutter: number;
	pitch: number;
}) {
	return (
		<g
			className={`shelf-strand-focus link-edge-${s.link.kind}${pitch < 6 ? " is-dense" : ""}`}
		>
			{s.ends.flatMap((e) =>
				e.cords.map((i) => (
					<rect
						key={`${e.row.node.id}:${i}`}
						className="shelf-strand-cord"
						x={gutter + e.row.x + cordX(i, pitch) - 0.5}
						y={e.row.y - 4}
						width={pitch + 1}
						height={e.row.tips[i] + 5}
						rx={Math.min(2, pitch / 2)}
					/>
				)),
			)}
			{s.labels.map((l) => (
				<text
					key={`${l.x},${l.y}`}
					className="shelf-thread-label"
					x={l.x}
					y={l.y}
					textAnchor="middle"
				>
					{l.text}
				</text>
			))}
		</g>
	);
}

function RibbonLabel({
	ribbon: r,
	gutter,
	pitch,
}: {
	ribbon: Ribbon;
	gutter: number;
	pitch: number;
}) {
	const x =
		gutter +
		(r.top.x * 2 +
			r.bottom.x * 2 +
			cordX(r.t0, pitch) +
			cordX(r.t1, pitch) +
			cordX(r.b0, pitch) +
			cordX(r.b1, pitch)) /
			4;
	const y = (r.top.y + r.top.h + r.bottom.y) / 2;
	const vals = r.values ?? [];
	const shown = vals.length > 14 ? vals.slice(0, 14) : vals;
	const text = `${shown.join(" · ")}${vals.length > shown.length ? ` · … ${vals.length} values` : ""}${r.rev ? "  ↺" : ""}`;
	return (
		<text className="shelf-ribbon-label" x={x} y={y + 3.5} textAnchor="middle">
			{text}
		</text>
	);
}

const ShelfRow = memo(function ShelfRow({
	row,
	gutter,
	pitch,
	labelsAbove,
	bands,
	marks,
	silhouettes,
	colors,
	lit,
	selected,
	onHover,
	onSelect,
}: {
	row: Row;
	gutter: number;
	pitch: number;
	labelsAbove: boolean;
	bands: Ribbon[];
	marks: Mark[];
	silhouettes: Silhouettes;
	colors: ColorTable;
	lit: boolean;
	selected: boolean;
	onHover: (id: string | null) => void;
	onSelect: (id: string) => void;
}) {
	const { node, y, h, w, n, x } = row;
	const s = silhouettes[node.id];
	const cords = s ? s.l.map((l, i) => ({ length: l, color: s.c[i] })) : [];
	const k = node.summary;
	const sets = node.sets.map((st) => st.label).join(" · ");
	const cls = ["shelf-row", lit ? "is-lit" : "", selected ? "is-selected" : ""]
		.filter(Boolean)
		.join(" ");
	const labelY = labelsAbove ? -LABEL_H + 14 : 12;
	const dot = Math.max(0.9, Math.min(2, pitch * 0.32));
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: svg control; the rows are also listed as text
		<g
			className={cls}
			transform={`translate(0,${y})`}
			onMouseEnter={() => onHover(node.id)}
			onMouseLeave={() => onHover(null)}
			onClick={(e) => {
				e.stopPropagation();
				onSelect(node.id);
			}}
		>
			<rect
				className="shelf-row-halo"
				x={0}
				y={labelsAbove ? -LABEL_H + 2 : -6}
				width={Math.max(gutter + x + w + 8, gutter + 160)}
				height={h + (labelsAbove ? LABEL_H + 4 : 12)}
				rx={6}
			/>
			<g
				className="shelf-label"
				transform={`translate(${labelsAbove ? Math.max(0, Math.min(x, x + w - 160)) : 0},${labelY})`}
			>
				<text className="shelf-label-id">
					<tspan fontWeight={600}>{node.id}</tspan>
					<tspan dx={5} className="shelf-label-alias">
						{node.alias}
					</tspan>
				</text>
				<text className="shelf-label-sub" y={14}>
					{shortMuseum(k)} · {n} pendants
					{k.primaryLength ? ` · ${k.primaryLength} cm` : ""}
				</text>
				{sets && !labelsAbove && (
					<text className="shelf-label-set" y={27}>
						{sets.length > 30 ? `${sets.slice(0, 28)}…` : sets}
					</text>
				)}
			</g>
			<g transform={`translate(${gutter + x},0)`}>
				{bands.map((b) => {
					const onTop = b.top === row;
					const c0 = onTop ? b.t0 : b.b0;
					const c1 = onTop ? b.t1 : b.b1;
					return (
						<rect
							key={b.key}
							className={`shelf-band link-edge-${b.link.kind}${b.threaded ? " is-threaded" : ""}`}
							x={cordX(c0, pitch)}
							y={-3}
							width={(c1 - c0) * pitch}
							height={h + 3}
							rx={1.5}
						/>
					);
				})}
				{n === 0 ? (
					<line
						x1={0}
						x2={w}
						y1={1.5}
						y2={1.5}
						stroke="var(--ink-3)"
						strokeWidth={1}
					/>
				) : (
					<KhipuSilhouette cords={cords} colors={colors} width={w} height={h} />
				)}
				{marks.map((m) => (
					<circle
						key={m.i}
						className={`shelf-mark-dot link-edge-${m.kind}`}
						cx={cordMid(m.i, pitch)}
						cy={-2.5}
						r={dot}
					/>
				))}
			</g>
		</g>
	);
});

/** The rows as text, for readers without the drawing and for keyboard users. */
export function ShelfIndex({
	rows,
	selected,
	onSelect,
}: {
	rows: GraphNode[];
	selected: string | null;
	onSelect: (id: string | null) => void;
}) {
	return (
		<ol className="shelf-index">
			{rows.map((r) => (
				<li key={r.id} className={selected === r.id ? "is-selected" : ""}>
					<button
						type="button"
						onClick={() => onSelect(selected === r.id ? null : r.id)}
					>
						{r.id} · {r.alias}
					</button>{" "}
					<Link to="/khipus/$id" params={{ id: r.id }}>
						open ↗
					</Link>
				</li>
			))}
		</ol>
	);
}
