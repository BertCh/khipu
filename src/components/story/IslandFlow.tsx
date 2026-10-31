import {
	forceCollide,
	forceLink,
	forceManyBody,
	forceSimulation,
	forceX,
	forceY,
	type SimulationLinkDatum,
} from "d3-force";
import { memo, useMemo, useState } from "react";
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

/**
 * How an island's khipus relate, as a diagram of named cards. A derived link
 * is an arrow from the record whose figures reappear to the record that
 * restates them, so the arrows set the columns: sources on the left, the
 * records built from them to the right, a chain of derivations reading left to
 * right. The other links (same account, same object, a shared passage) keep
 * their khipus in one column where they can, so mirrors sit stacked side by
 * side with their partner. Every edge carries a short label; hovering or
 * selecting one prints its note below. An island without a derived link has
 * no direction to read, and is laid out by a plain force simulation instead.
 */

interface Card {
	node: GraphNode;
	layer: number;
	x: number;
	y: number;
}

const CARD_W = 150;
const CARD_H = 50;
const V_GAP = 22;
const PAD = 14;
/** columns never closer than a card and a readable edge label */
const MIN_COL = CARD_W + 140;
/** headroom for the arcs of links that skip a column */
const ARC = 44;
/** extra space between two clusters of partners in one column */
const CLUSTER_GAP = 16;
/** the widest a same-column bracket and its label reach past the card */
const BRACKET = 96;

const directed = (l: GraphLink) => l.kind === "derived" && !l.undirected;

/** columns from the derived arrows: every record sits right of its sources */
function layers(nodes: GraphNode[], links: GraphLink[]): Map<string, number> {
	const L = new Map(nodes.map((n) => [n.id, 0]));
	for (let pass = 0; pass < nodes.length + 1; pass++) {
		let moved = false;
		for (const l of links) {
			const a = L.get(l.a) ?? 0;
			const b = L.get(l.b) ?? 0;
			if (directed(l)) {
				if (b < a + 1) {
					L.set(l.b, a + 1);
					moved = true;
				}
			} else if (a !== b) {
				// an undirected pair shares a column, unless that would put a
				// record left of one of its own sources
				const hi = Math.max(a, b);
				const lo = a < b ? l.a : l.b;
				const blocked = links.some(
					(o) => directed(o) && o.a === lo && (L.get(o.b) ?? 0) <= hi,
				);
				if (!blocked) {
					L.set(lo, hi);
					moved = true;
				}
			}
		}
		if (!moved) break;
	}
	// close up empty columns
	const used = [...new Set(L.values())].sort((x, y) => x - y);
	for (const [id, v] of L) L.set(id, used.indexOf(v));
	return L;
}

/**
 * Order each column so that partners are neighbours and edges cross little:
 * the khipus tied by a non-derived link inside one column form a cluster,
 * kept together in chain order; clusters are then sorted by the mean row of
 * their neighbours in the other columns, sweeping right and back a few times
 * (the usual barycentre heuristic for layered drawings).
 */
function orderColumns(
	cards: Card[],
	byId: Map<string, Card>,
	links: GraphLink[],
	nLayers: number,
	colW: number,
) {
	const nbrs = new Map<string, string[]>();
	for (const l of links) {
		if (!byId.has(l.a) || !byId.has(l.b)) continue;
		nbrs.set(l.a, [...(nbrs.get(l.a) ?? []), l.b]);
		nbrs.set(l.b, [...(nbrs.get(l.b) ?? []), l.a]);
	}
	const cols: Card[][][] = [];
	for (let k = 0; k < nLayers; k++) {
		const col = cards
			.filter((c) => c.layer === k)
			.sort((x, y) => x.node.id.localeCompare(y.node.id));
		const seen = new Set<Card>();
		const clusters: Card[][] = [];
		for (const c of col) {
			if (seen.has(c)) continue;
			// walk the same-column partners, each step to the next unvisited one
			const cluster: Card[] = [];
			const stack = [c];
			while (stack.length) {
				const x = stack.pop() as Card;
				if (seen.has(x)) continue;
				seen.add(x);
				cluster.push(x);
				for (const id of nbrs.get(x.node.id) ?? []) {
					const y = byId.get(id);
					if (y && y.layer === k && !seen.has(y)) stack.push(y);
				}
			}
			clusters.push(cluster);
		}
		cols.push(clusters.sort((x, y) => y.length - x.length));
	}
	// a card's row position, counting the air between clusters
	const pos = new Map<Card, number>();
	const place = () => {
		for (const clusters of cols) {
			let y = 0;
			for (const cl of clusters) {
				for (const c of cl) pos.set(c, y++);
				y += 0.3;
			}
		}
	};
	place();
	const bary = (cl: Card[], k: number) => {
		const ps: number[] = [];
		for (const c of cl)
			for (const id of nbrs.get(c.node.id) ?? []) {
				const o = byId.get(id);
				if (o && o.layer !== k) ps.push(pos.get(o) ?? 0);
			}
		// a cluster tied to nothing outside its column keeps to the end
		return ps.length
			? ps.reduce((s, p) => s + p, 0) / ps.length - (cl.length - 1) / 2
			: Infinity;
	};
	const sweep = (k: number) => {
		const keyed = cols[k].map((cl, i) => ({ cl, b: bary(cl, k), i }));
		cols[k] = keyed.sort((x, y) => x.b - y.b || x.i - y.i).map((e) => e.cl);
		place();
	};
	for (let it = 0; it < 6; it++) {
		for (let k = 1; k < nLayers; k++) sweep(k);
		for (let k = nLayers - 2; k >= 0; k--) sweep(k);
	}
	// the first column packs from the top; each later cluster sits level with
	// the khipus it is tied to on its left, pushed down only to clear the one
	// above it
	const pitch = CARD_H + V_GAP;
	cols.forEach((clusters, k) => {
		let floor = 0;
		for (const cl of clusters) {
			let want = floor;
			if (k > 0) {
				const ys: number[] = [];
				for (const c of cl)
					for (const id of nbrs.get(c.node.id) ?? []) {
						const o = byId.get(id);
						if (o && o.layer < k) ys.push(o.y);
					}
				if (ys.length)
					want =
						ys.reduce((s, y) => s + y, 0) / ys.length -
						((cl.length - 1) * pitch) / 2;
			}
			let y = Math.max(floor, want);
			for (const c of cl) {
				c.x = k * colW;
				c.y = y;
				y += pitch;
			}
			floor = y + CLUSTER_GAP;
		}
	});
	// then the first column returns the favour: a cluster that only feeds the
	// right-hand columns moves level with what it feeds, keeping its order;
	// clusters tied to nothing outside the column fill the gaps that leaves
	if (nLayers > 1) {
		const loose: Card[][] = [];
		const placed: [number, number][] = [];
		let floor = 0;
		for (const cl of cols[0]) {
			const ys: number[] = [];
			for (const c of cl)
				for (const id of nbrs.get(c.node.id) ?? []) {
					const o = byId.get(id);
					if (o && o.layer > 0) ys.push(o.y);
				}
			if (!ys.length) {
				loose.push(cl);
				continue;
			}
			const want =
				ys.reduce((s, y) => s + y, 0) / ys.length -
				((cl.length - 1) * pitch) / 2;
			let y = Math.max(floor, want);
			const top = y;
			for (const c of cl) {
				c.y = y;
				y += pitch;
			}
			placed.push([top, y - V_GAP]);
			floor = y + CLUSTER_GAP;
		}
		for (const cl of loose) {
			const h = cl.length * pitch - V_GAP;
			// the first gap between placed clusters tall enough to take it
			let top = floor;
			let prev = -Infinity;
			for (const [t, bot] of placed) {
				const start = prev === -Infinity ? 0 : prev + CLUSTER_GAP + V_GAP;
				if (t - CLUSTER_GAP - V_GAP - start >= h) {
					top = start;
					break;
				}
				prev = bot;
			}
			let y = top;
			for (const c of cl) {
				c.y = y;
				y += pitch;
			}
			placed.push([top, y - V_GAP]);
			placed.sort((x, y) => x[0] - y[0]);
			floor = Math.max(floor, y + CLUSTER_GAP);
		}
	}
}

function layout(nodes: GraphNode[], links: GraphLink[], width: number) {
	const layered = links.some(directed);
	const L = layered ? layers(nodes, links) : new Map<string, number>();
	const nLayers = layered ? Math.max(...L.values()) + 1 : 1;
	const inner = Math.max(CARD_W, width - 2 * PAD);
	const colW =
		nLayers > 1
			? Math.max(MIN_COL, Math.min(300, (inner - CARD_W) / (nLayers - 1)))
			: 0;

	type SimNode = Card & { index?: number; vx?: number; vy?: number };
	const sim: SimNode[] = nodes.map((node, i) => ({
		node,
		layer: L.get(node.id) ?? 0,
		x: 0,
		y: i * 9,
	}));
	const byId = new Map(sim.map((c) => [c.node.id, c]));

	if (layered) orderColumns(sim, byId, links, nLayers, colW);
	else if (links.length === 0) {
		// no links: a plain grid in catalogue order
		const per = Math.max(1, Math.floor((inner + 24) / (CARD_W + 24)));
		const cols = Math.ceil(sim.length / Math.ceil(sim.length / per));
		sim.forEach((c, i) => {
			c.x = (i % cols) * (CARD_W + 24);
			c.y = Math.floor(i / cols) * (CARD_H + V_GAP);
		});
	} else {
		const simLinks: SimulationLinkDatum<SimNode>[] = links
			.filter((l) => byId.has(l.a) && byId.has(l.b))
			.map((l) => ({ source: l.a, target: l.b }));
		sim.forEach((c, i) => {
			c.x = (i * 37) % 11;
		});
		forceSimulation(sim)
			.force(
				"link",
				forceLink<SimNode, SimulationLinkDatum<SimNode>>(simLinks)
					.id((d) => d.node.id)
					.distance(CARD_W * 1.5)
					.strength(0.6),
			)
			.force("charge", forceManyBody().strength(-400))
			.force("collide", forceCollide(CARD_W * 0.75))
			.force("x", forceX(0).strength(0.05))
			.force("y", forceY(0).strength(0.08))
			.stop()
			.tick(300);
		// push apart any cards the circular collide still lets overlap
		for (let it = 0; it < 60; it++)
			for (const a of sim)
				for (const b of sim) {
					if (a === b) continue;
					const dx = b.x - a.x;
					const dy = b.y - a.y;
					const ox = CARD_W + 16 - Math.abs(dx);
					const oy = CARD_H + V_GAP - Math.abs(dy);
					if (ox > 0 && oy > 0) {
						if (ox / CARD_W < oy / CARD_H) {
							const s = (dx >= 0 ? 1 : -1) * (ox / 2);
							a.x -= s;
							b.x += s;
						} else {
							const s = (dy >= 0 ? 1 : -1) * (oy / 2);
							a.y -= s;
							b.y += s;
						}
					}
				}
	}

	const skips = links.some(
		(l) =>
			byId.has(l.a) &&
			byId.has(l.b) &&
			Math.abs((L.get(l.a) ?? 0) - (L.get(l.b) ?? 0)) > 1,
	);
	const top = skips ? ARC : 0;
	const minX = Math.min(...sim.map((c) => c.x));
	const minY = Math.min(...sim.map((c) => c.y));
	for (const c of sim) {
		c.x += PAD - minX;
		c.y += PAD + 10 + top - minY;
	}
	// room on the right for the brackets of the last column
	const w = Math.max(...sim.map((c) => c.x)) + CARD_W + PAD + BRACKET;
	// a card wider than the page scales the drawing down rather than scroll
	const scale = Math.min(1, width / w);
	return {
		cards: sim as Card[],
		byId,
		width: w,
		height: Math.max(...sim.map((c) => c.y)) + CARD_H + PAD + 10,
		scale,
		layered,
	};
}

interface Edge {
	link: GraphLink;
	d: string;
	/** label position */
	lx: number;
	ly: number;
	label: string;
	arrow: boolean;
}

/** a card's border point in the direction of (tx, ty) from its centre */
function clip(c: Card, tx: number, ty: number) {
	const cx = c.x + CARD_W / 2;
	const cy = c.y + CARD_H / 2;
	const dx = tx - cx;
	const dy = ty - cy;
	const s = Math.min(
		dx ? CARD_W / 2 / Math.abs(dx) : Infinity,
		dy ? CARD_H / 2 / Math.abs(dy) : Infinity,
	);
	return [cx + dx * s, cy + dy * s] as const;
}

function edgeLabel(l: GraphLink) {
	if (l.short) return l.short;
	if (l.scan)
		return `${l.scan.values} values${l.scan.dir === "rev" ? " ↺" : ""}`;
	return KIND_LABEL[l.kind].toLowerCase();
}

function edges(links: GraphLink[], byId: Map<string, Card>): Edge[] {
	const out: Edge[] = [];
	for (const link of links) {
		const a = byId.get(link.a);
		const b = byId.get(link.b);
		if (!a || !b) continue;
		const arrow = directed(link);
		const label = edgeLabel(link);
		if (a.layer === b.layer && Math.abs(a.x - b.x) < 1) {
			// the same column: a bracket off the card's right edge, deeper the
			// further apart the two cards are
			const [top, bot] = a.y < b.y ? [a, b] : [b, a];
			const x = top.x + CARD_W;
			const y0 = top.y + CARD_H / 2;
			const y1 = bot.y + CARD_H / 2;
			const bulge = 18 + Math.min(60, (y1 - y0) / 6);
			out.push({
				link,
				d: `M${x},${y0}C${x + bulge},${y0} ${x + bulge},${y1} ${x},${y1}`,
				lx: x + bulge * 0.75 + 4,
				ly: (y0 + y1) / 2,
				label,
				arrow,
			});
			continue;
		}
		if (Math.abs(a.layer - b.layer) > 1) {
			// a link that skips a column arcs over the cards between
			const [l, r] = a.x < b.x ? [a, b] : [b, a];
			const x0 = l.x + CARD_W * 0.7;
			const x1 = r.x + CARD_W * 0.3;
			const y0 = l.y;
			const y1 = r.y;
			const peak = Math.min(y0, y1) - ARC + 6;
			const d =
				l === a
					? `M${x0},${y0}C${x0},${peak} ${x1},${peak} ${x1},${y1}`
					: `M${x1},${y1}C${x1},${peak} ${x0},${peak} ${x0},${y0}`;
			out.push({
				link,
				d,
				lx: (x0 + x1) / 2,
				ly: (0.25 * (y0 + y1)) / 2 + 0.75 * peak,
				label,
				arrow,
			});
			continue;
		}
		const [x0, y0] = clip(a, b.x + CARD_W / 2, b.y + CARD_H / 2);
		const [x1, y1] = clip(b, a.x + CARD_W / 2, a.y + CARD_H / 2);
		const horizontal = Math.abs(x1 - x0) > Math.abs(y1 - y0);
		const mx = (x0 + x1) / 2;
		const my = (y0 + y1) / 2;
		const d = horizontal
			? `M${x0},${y0}C${mx},${y0} ${mx},${y1} ${x1},${y1}`
			: `M${x0},${y0}C${x0},${my} ${x1},${my} ${x1},${y1}`;
		// the label sits three quarters along, near the record it points at,
		// clear of the brackets and the crossings in the middle of the gap
		const t = horizontal ? 0.72 : 0.5;
		const u = 1 - t;
		const bez = (p0: number, p1: number, p2: number, p3: number) =>
			u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
		const lx = horizontal ? bez(x0, mx, mx, x1) : bez(x0, x0, x1, x1);
		const ly = horizontal ? bez(y0, y0, y1, y1) : bez(y0, my, my, y1);
		out.push({ link, d, lx, ly, label, arrow });
	}
	return out;
}

interface Props {
	island: Island;
	silhouettes: Silhouettes;
	colors: ColorTable;
	selected: string | null;
	onSelect: (id: string | null) => void;
	/** the khipu the page was opened from, outlined */
	current?: string;
	/** inside a story: no shelf below to point at, and the story's caption
	 * explains the arrows */
	embedded?: boolean;
}

export default function IslandFlow({
	island,
	silhouettes,
	colors,
	selected,
	onSelect,
	current,
	embedded = false,
}: Props) {
	const { ref, width } = useMeasure<HTMLDivElement>(960);
	const [hover, setHover] = useState<string | null>(null);
	const linked = useMemo(() => {
		// an island held together only by a find or a museum number has no
		// edges: draw all its khipus, so the set itself is on show
		const withLinks = island.nodes.filter((n) => n.links.length > 0);
		return withLinks.length ? withLinks : island.nodes;
	}, [island]);
	const L = useMemo(
		() => layout(linked, island.links, width),
		[linked, island.links, width],
	);
	const E = useMemo(() => edges(island.links, L.byId), [island.links, L]);

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

	const toggle = (id: string) => onSelect(selected === id ? null : id);
	const focusLink = focus
		? island.links.find((l) => l.id === focus)
		: undefined;
	const focusNode = focus ? L.byId.get(focus)?.node : undefined;

	return (
		<div className="island-flow" ref={ref}>
			<svg
				width={L.width * L.scale}
				height={L.height * L.scale}
				viewBox={`0 0 ${L.width} ${L.height}`}
				role="img"
				className={lit.any ? "has-focus" : undefined}
				aria-label={`${linked.length} khipus and the ${island.links.length} links between them`}
				onClick={() => onSelect(null)}
				onKeyDown={(e) => {
					if (e.key === "Escape") onSelect(null);
				}}
			>
				<defs>
					{(["account", "derived", "object", "passage"] as const).map((k) => (
						<marker
							key={k}
							id={`flow-arrow-${k}`}
							className={`link-edge-${k}`}
							viewBox="0 0 10 10"
							refX={9}
							refY={5}
							markerWidth={7}
							markerHeight={7}
							orient="auto-start-reverse"
						>
							<path d="M0,1L10,5L0,9Z" className="flow-arrow" />
						</marker>
					))}
				</defs>
				{E.map((e) => (
					// biome-ignore lint/a11y/noStaticElementInteractions: svg control; the link list below is the keyboard route
					<g
						key={e.link.id}
						className={[
							"link-edge",
							"flow-edge",
							`link-edge-${e.link.kind}`,
							`link-edge-${e.link.level}`,
							lit.links.has(e.link.id) ? "is-lit" : "",
							selected === e.link.id ? "is-selected" : "",
						].join(" ")}
						onMouseEnter={() => setHover(e.link.id)}
						onMouseLeave={() => setHover(null)}
						onClick={(ev) => {
							ev.stopPropagation();
							toggle(e.link.id);
						}}
					>
						<title>{`${KIND_LABEL[e.link.kind]}: ${e.link.note}`}</title>
						<path className="link-edge-hit" d={e.d} fill="none" />
						<path
							className="link-edge-line"
							d={e.d}
							fill="none"
							markerEnd={
								e.arrow ? `url(#flow-arrow-${e.link.kind})` : undefined
							}
						/>
						<EdgeLabel x={e.lx} y={e.ly} text={e.label} />
					</g>
				))}
				{L.cards.map((c) => (
					<FlowCard
						key={c.node.id}
						card={c}
						silhouettes={silhouettes}
						colors={colors}
						lit={lit.nodes.has(c.node.id)}
						selected={selected === c.node.id}
						current={current === c.node.id}
						onHover={setHover}
						onSelect={toggle}
					/>
				))}
			</svg>
			<div className="flow-caption" aria-live="polite">
				{focusLink ? (
					<p className={`network-kind-${focusLink.kind}`}>
						<i aria-hidden="true" />
						<b>{KIND_LABEL[focusLink.kind]}</b>
						{directed(focusLink)
							? `, ${focusLink.a} → ${focusLink.b}`
							: `, ${focusLink.a} and ${focusLink.b}`}
						. {focusLink.note}
					</p>
				) : focusNode ? (
					<p>
						<b>
							{focusNode.id} · {focusNode.alias}
						</b>
						, {shortMuseum(focusNode.summary)}, {focusNode.summary.nPendants}{" "}
						pendants: {focusNode.links.length}{" "}
						{focusNode.links.length === 1 ? "link" : "links"} on this island.
					</p>
				) : (
					<p className="cell-muted">
						{island.links.length === 0
							? `No shared values link these khipus; they form an island because they were ${
									island.sets.some((st) => st.kind === "set")
										? `kept together (${island.sets
												.filter((st) => st.kind === "set")
												.map((st) => st.label)
												.join(", ")})`
										: "found or catalogued together"
								}. `
							: ""}
						{L.layered && !embedded
							? "Arrows run from the record whose figures reappear to the record that restates them. "
							: ""}
						{island.links.length
							? embedded
								? "Hover over a khipu or link for details; click to select it."
								: "Hover over a khipu or link for details; click to select it and highlight the link on the shelf below."
							: "Hover over a khipu for details."}
					</p>
				)}
			</div>
		</div>
	);
}

function EdgeLabel({ x, y, text }: { x: number; y: number; text: string }) {
	const w = text.length * 5.6 + 10;
	return (
		<g className="flow-edge-label" transform={`translate(${x},${y})`}>
			<rect x={-w / 2} y={-8} width={w} height={16} rx={8} />
			<text textAnchor="middle" y={3.5}>
				{text}
			</text>
		</g>
	);
}

const FlowCard = memo(function FlowCard({
	card: c,
	silhouettes,
	colors,
	lit,
	selected,
	current,
	onHover,
	onSelect,
}: {
	card: Card;
	silhouettes: Silhouettes;
	colors: ColorTable;
	lit: boolean;
	selected: boolean;
	current: boolean;
	onHover: (id: string | null) => void;
	onSelect: (id: string) => void;
}) {
	const n = c.node;
	const s = silhouettes[n.id];
	const cords = s ? s.l.map((l, i) => ({ length: l, color: s.c[i] })) : [];
	const cls = [
		"flow-card",
		lit ? "is-lit" : "",
		selected ? "is-selected" : "",
		current ? "is-current" : "",
	]
		.filter(Boolean)
		.join(" ");
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: svg control; the shelf index lists the khipus as text
		<g
			className={cls}
			transform={`translate(${c.x},${c.y})`}
			onMouseEnter={() => onHover(n.id)}
			onMouseLeave={() => onHover(null)}
			onClick={(e) => {
				e.stopPropagation();
				onSelect(n.id);
			}}
		>
			<rect className="flow-card-box" width={CARD_W} height={CARD_H} rx={7} />
			<text className="flow-card-id" x={9} y={16}>
				<tspan fontWeight={600}>{n.id}</tspan>
				<tspan dx={5} className="flow-card-alias">
					{n.alias}
				</tspan>
			</text>
			<g transform="translate(9,23)">
				{cords.length > 0 && (
					<KhipuSilhouette
						cords={cords}
						colors={colors}
						width={CARD_W - 18}
						height={20}
					/>
				)}
			</g>
		</g>
	);
});
