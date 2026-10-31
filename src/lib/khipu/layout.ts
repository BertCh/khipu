import type { Cord, CordGroup, KhipuLike } from "./types";

/**
 * Schematic layout of a khipu for SVG rendering.
 *
 * Horizontal position is ordinal, not metric: every pendant gets a column,
 * groups are separated by a gap, and subsidiaries branch into extra columns to
 * the right of their pendant so nothing overlaps. Vertical position is metric
 * (cm × pxPerCm) so cord lengths and knot positions are true to the record.
 */

export interface LayoutOptions {
	/** px per pendant column */
	slot: number;
	/** px between cord groups */
	gap: number;
	/** px per descendant column to the right of a pendant */
	subOffset: number;
	/** vertical scale */
	pxPerCm: number;
	padX: number;
	padTop: number;
	padBottom: number;
	/** hang pendants upward (a mirror drawn beneath another khipu) */
	invert?: boolean;
	/** drawn diameter of a cord (the physical renderer scales its marks by it) */
	cordW?: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
	slot: 11,
	gap: 14,
	subOffset: 4,
	pxPerCm: 3.4,
	padX: 18,
	padTop: 28,
	padBottom: 24,
	cordW: 2.2,
};

/** Length to draw for cords whose length wasn't recorded. */
const STUB_CM = 2;

export interface CordNode {
	cord: Cord;
	x: number;
	/** where the vertical run starts (just after the attachment elbow) */
	y0: number;
	/** where it ends */
	y1: number;
	/** attachment point on the parent (or the primary cord) */
	ax: number;
	ay: number;
	/** true for top cords, which run upward */
	up: boolean;
	lengthKnown: boolean;
	parent: CordNode | null;
	children: CordNode[];
	/** index into Layout.groups for pendants */
	group?: number;
}

export interface GroupBox {
	index: number;
	group: CordGroup;
	x0: number;
	x1: number;
	pendants: CordNode[];
}

export interface Layout {
	khipu: KhipuLike;
	width: number;
	height: number;
	primaryY: number;
	primaryX0: number;
	primaryX1: number;
	nodes: CordNode[];
	pendants: CordNode[];
	groups: GroupBox[];
	byName: Map<string, CordNode>;
	options: LayoutOptions;
}

function cmToPx(cm: number | null | undefined, o: LayoutOptions) {
	return (cm ?? 0) * o.pxPerCm;
}

export function layoutKhipu(
	khipu: KhipuLike,
	partial: Partial<LayoutOptions> = {},
): Layout {
	const o = { ...DEFAULT_LAYOUT, ...partial };
	const byName = new Map<string, CordNode>();
	const nodes: CordNode[] = [];

	for (const cord of khipu.cords) {
		const node: CordNode = {
			cord,
			x: 0,
			y0: 0,
			y1: 0,
			ax: 0,
			ay: 0,
			up: cord.kind === "top" ? !o.invert : !!o.invert,
			lengthKnown: cord.length != null,
			parent: null,
			children: [],
		};
		byName.set(cord.name, node);
		nodes.push(node);
	}

	// Build the tree. Cords whose parent is missing from the record are treated
	// as pendants so they still get drawn.
	const pendants: CordNode[] = [];
	for (const node of nodes) {
		const parentName = node.cord.parent;
		const parent = parentName ? byName.get(parentName) : undefined;
		if (parent) {
			node.parent = parent;
			parent.children.push(node);
		} else {
			pendants.push(node);
		}
	}
	for (const node of nodes) {
		node.children.sort((a, b) => a.cord.ordinal - b.cord.ordinal);
	}
	pendants.sort((a, b) => {
		const ga = a.cord.group ?? Number.POSITIVE_INFINITY;
		const gb = b.cord.group ?? Number.POSITIVE_INFINITY;
		return ga - gb || a.cord.ordinal - b.cord.ordinal;
	});

	// Horizontal placement: one column per pendant plus a column per descendant.
	const descendants = (n: CordNode): CordNode[] => {
		const out: CordNode[] = [];
		const walk = (c: CordNode) => {
			for (const ch of c.children) {
				out.push(ch);
				walk(ch);
			}
		};
		walk(n);
		return out;
	};

	let cursor = o.padX;
	let lastGroup: number | undefined;
	const groupsMap = new Map<number, GroupBox>();
	let maxUp = 0;
	let maxDown = 0;

	for (const p of pendants) {
		const g = p.cord.group;
		if (lastGroup !== undefined && g !== lastGroup) cursor += o.gap;
		lastGroup = g;
		const desc = descendants(p);
		const width = o.slot + o.subOffset * desc.length;
		p.x = cursor + o.slot / 2;
		desc.forEach((d, i) => {
			d.x = p.x + o.subOffset * (i + 1);
		});
		if (g !== undefined) {
			let box = groupsMap.get(g);
			if (!box) {
				box = {
					index: g,
					group: khipu.groups[g],
					x0: cursor,
					x1: cursor + width,
					pendants: [],
				};
				groupsMap.set(g, box);
			}
			box.x1 = cursor + width;
			box.pendants.push(p);
			p.group = g;
		}
		cursor += width;

		// vertical extents, relative to the primary cord
		const extent = (n: CordNode, base: number, dir: 1 | -1): void => {
			const len = cmToPx(n.lengthKnown ? n.cord.length : STUB_CM, o);
			const end = base + dir * len;
			if (dir > 0) maxDown = Math.max(maxDown, end);
			else maxUp = Math.max(maxUp, -end);
			for (const ch of n.children) {
				const at = Math.min(cmToPx(ch.cord.pos ?? 0, o), len);
				extent(ch, base + dir * at, dir);
			}
		};
		extent(p, 0, p.up ? -1 : 1);
	}

	const primaryY = o.padTop + maxUp + (maxUp > 0 ? 12 : 0);
	const primaryX0 = o.padX - 8;
	const primaryX1 = cursor + 8;

	// Vertical placement, now that we know where the primary cord sits.
	const place = (n: CordNode, ax: number, ay: number, dir: 1 | -1) => {
		const elbow = n.parent ? 4 : 0;
		n.ax = ax;
		n.ay = ay;
		n.y0 = ay + dir * elbow;
		const len = cmToPx(n.lengthKnown ? n.cord.length : STUB_CM, o);
		n.y1 = n.y0 + dir * len;
		for (const ch of n.children) {
			const at = Math.min(cmToPx(ch.cord.pos ?? 0, o), len);
			place(ch, n.x, n.y0 + dir * at, dir);
		}
	};
	for (const p of pendants) place(p, p.x, primaryY, p.up ? -1 : 1);

	return {
		khipu,
		width: primaryX1 + o.padX,
		height: primaryY + maxDown + o.padBottom,
		primaryY,
		primaryX0,
		primaryX1,
		nodes,
		pendants,
		groups: [...groupsMap.values()].sort((a, b) => a.index - b.index),
		byName,
		options: o,
	};
}

/** y coordinate of a knot on a laid-out cord. */
export function knotY(node: CordNode, posCm: number, o: LayoutOptions): number {
	const dir = node.up ? -1 : 1;
	return node.y0 + dir * cmToPx(posCm, o);
}

/**
 * Where along a cord to centre its knot clusters, in px from the cord's
 * start. Each sits at its recorded `pos` where it can, drawn `half` px either
 * side of it; the drawn clusters are taller than the knots they stand for,
 * so ones that would overlap are pushed apart down the cord in order, none
 * begins within `clear` px of the start (the hitch's room) and none runs
 * past a known end `len`. On a cord too short for all of them the first
 * stays at the hitch and the rest are spread evenly down to the end, each
 * overlapping the next by at most half — past the end if it must, so none
 * is hidden under another. Returned in the order given.
 */
export function packAlongCord(
	items: { pos: number; half: number }[],
	len: number | null,
	clear = 0,
	gap = 0,
): number[] {
	const n = items.length;
	if (n === 0) return [];
	const order = items
		.map((_, i) => i)
		.sort((a, b) => items[a].pos - items[b].pos);
	const h = order.map((i) => 2 * items[i].half);
	const need = clear + h.reduce((a, b) => a + b, 0) + gap * (n - 1);
	const top: number[] = [];
	if (len != null && need > len) {
		// the tight layout, squeezed so the last cluster ends at the end
		const span = need - clear - h[n - 1];
		const room = Math.max(len - clear - h[n - 1], span / 2);
		let t = clear;
		for (let k = 0; k < n; k++) {
			top.push(clear + (span > 0 ? ((t - clear) * room) / span : 0));
			t += h[k] + gap;
		}
	} else {
		let floor = clear;
		for (let k = 0; k < n; k++) {
			const it = items[order[k]];
			top.push(Math.max(it.pos - it.half, floor));
			floor = top[k] + h[k] + gap;
		}
		if (len != null) {
			let ceil = len;
			for (let k = n - 1; k >= 0; k--) {
				top[k] = Math.min(top[k], ceil - h[k]);
				ceil = top[k] - gap;
			}
		}
	}
	const out = new Array<number>(n);
	order.forEach((i, k) => {
		out[i] = top[k] + h[k] / 2;
	});
	return out;
}

/**
 * y at which to centre each knot cluster of a laid-out cord, given the
 * drawn half-height of each (see packAlongCord).
 */
export function knotClusterYs(
	node: CordNode,
	halves: number[],
	o: LayoutOptions,
	clear = 0,
	gap = 0,
): number[] {
	const dir = node.up ? -1 : 1;
	const len = node.lengthKnown ? Math.abs(node.y1 - node.y0) : null;
	const items = node.cord.knots.map((k, i) => ({
		pos: cmToPx(k.pos, o),
		half: halves[i],
	}));
	return packAlongCord(items, len, clear, gap).map((t) => node.y0 + dir * t);
}

/** An axis-aligned box in layout coordinates. */
export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

export function unionBox(boxes: Box[]): Box {
	const x0 = Math.min(...boxes.map((b) => b.x));
	const y0 = Math.min(...boxes.map((b) => b.y));
	const x1 = Math.max(...boxes.map((b) => b.x + b.w));
	const y1 = Math.max(...boxes.map((b) => b.y + b.h));
	return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function padBox(b: Box, px: number, py = px): Box {
	return { x: b.x - px, y: b.y - py, w: b.w + 2 * px, h: b.h + 2 * py };
}

/** The whole drawing. */
export function layoutBox(l: Layout): Box {
	return { x: 0, y: 0, w: l.width, h: l.height };
}

/** The extent of some cords, from their attachment to their end, descendants included. */
export function nodesBox(nodes: CordNode[], pad = 6): Box {
	const all: CordNode[] = [];
	const walk = (n: CordNode) => {
		all.push(n);
		for (const ch of n.children) walk(ch);
	};
	for (const n of nodes) walk(n);
	if (all.length === 0) return { x: 0, y: 0, w: 1, h: 1 };
	return padBox(
		unionBox(
			all.map((n) => ({
				x: Math.min(n.x, n.ax),
				y: Math.min(n.ay, n.y1),
				w: Math.abs(n.x - n.ax),
				h: Math.abs(n.y1 - n.ay),
			})),
		),
		pad,
	);
}

/** The extent of a cord group: its bracket and every cord in it. */
export function groupBoxOf(l: Layout, gi: number, pad = 6): Box {
	const g = l.groups.find((b) => b.index === gi);
	if (!g) return layoutBox(l);
	const cords = nodesBox(g.pendants, 0);
	const bracketY = l.options.invert ? l.primaryY : l.primaryY - 14;
	return padBox(
		unionBox([cords, { x: g.x0, y: bracketY, w: g.x1 - g.x0, h: 14 }]),
		pad,
	);
}

/** A window onto one cord between two distances along it, in cm. */
export function cordSpanBox(
	n: CordNode,
	fromCm: number,
	toCm: number,
	o: LayoutOptions,
	pad = 10,
): Box {
	const a = knotY(n, fromCm, o);
	const b = knotY(n, toCm, o);
	return padBox({ x: n.x, y: Math.min(a, b), w: 0, h: Math.abs(b - a) }, pad);
}
