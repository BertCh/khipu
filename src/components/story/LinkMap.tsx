import {
	forceCollide,
	forceLink,
	forceManyBody,
	forceSimulation,
	forceX,
	forceY,
	type SimulationLinkDatum,
} from "d3-force";
import { polygonHull } from "d3-polygon";
import { memo, useCallback, useMemo, useState } from "react";
import { useMeasure } from "#/components/charts/useMeasure";
import KhipuSilhouette from "#/components/khipu/KhipuSilhouette";
import type { Silhouettes } from "#/lib/khipu/data";
import type { ColorTable } from "#/lib/khipu/types";
import {
	type Graph,
	type GraphNode,
	type Island,
	islandLabel,
	islandSub,
	KIND_LABEL,
	type LinkKind,
} from "#/lib/stories/links";

/**
 * The map of linked khipus: every connected set of khipus is an island, laid
 * out by a small force simulation and drawn with each khipu as its own
 * silhouette; the islands then flow across the page in rows, largest first.
 * Layout is deterministic (d3-force's own generator), so the map is the same
 * on every visit and can be run synchronously before the first paint.
 */

interface PlacedNode {
	node: GraphNode;
	x: number;
	y: number;
	/** glyph width and height */
	w: number;
	h: number;
	/** collision radius */
	r: number;
}

interface PlacedIsland {
	island: Island;
	nodes: PlacedNode[];
	byId: Map<string, PlacedNode>;
	/** radius of the island around its own origin */
	radius: number;
	/** origin on the page, and a scale for islands wider than the page */
	x: number;
	y: number;
	scale: number;
	/** where the row's labels sit, below the tallest island in the row */
	labelY: number;
	label: string;
	sub: string;
}

const LABEL_H = 40;
/** outlines are drawn largest first: find-spot, then accession, then a story's set */
const SET_ORDER = { place: 0, accession: 1, set: 2 } as const;
const ISLAND_GAP = 20;

function glyphSize(n: GraphNode) {
	const w = Math.round(
		Math.max(30, Math.min(78, 6 * Math.sqrt(n.summary.nPendants))),
	);
	return { w, h: 20 };
}

function layoutIsland(island: Island, visible: Set<LinkKind>): PlacedNode[] {
	type SimNode = PlacedNode & { index?: number; vx?: number; vy?: number };
	type SimLink = SimulationLinkDatum<SimNode>;
	const end = (n: SimNode | string | number) => n as SimNode;
	const nodes: SimNode[] = island.nodes.map((node) => {
		const { w, h } = glyphSize(node);
		return { node, x: 0, y: 0, w, h, r: Math.hypot(w, h) / 2 + 4 };
	});
	const byId = new Map(nodes.map((n) => [n.node.id, n]));
	const links: SimLink[] = island.links
		.filter((l) => visible.has(l.kind))
		.map((l) => ({
			source: byId.get(l.a) as SimNode,
			target: byId.get(l.b) as SimNode,
		}));
	// set members hold together as a ring, so a set without links still forms
	const ring: SimLink[] = [];
	for (const s of island.sets) {
		const members = s.ids
			.map((id) => byId.get(id))
			.filter(Boolean) as SimNode[];
		for (let i = 0; i < members.length; i++)
			if (members.length > 1)
				ring.push({
					source: members[i],
					target: members[(i + 1) % members.length],
				});
	}
	// a big find-spot packs tighter than a story's handful
	const big = nodes.length > 30;
	const sim = forceSimulation<SimNode>(nodes)
		.force(
			"link",
			forceLink<SimNode, SimLink>(links)
				.distance((l) => end(l.source).r + end(l.target).r + (big ? 18 : 34))
				.strength(0.9),
		)
		.force(
			"ring",
			forceLink<SimNode, SimLink>(ring)
				.distance((l) => end(l.source).r + end(l.target).r + (big ? 4 : 16))
				.strength(0.25),
		)
		.force("charge", forceManyBody().strength(big ? -70 : -170))
		.force(
			"collide",
			forceCollide<SimNode>((n) => n.r + (big ? 1 : 4)).iterations(2),
		)
		.force("x", forceX(0).strength(0.07))
		.force("y", forceY(0).strength(0.09))
		.stop();
	sim.tick(320);
	// recentre on the bounding box, not the mean, so labels sit under the island
	const xs = nodes.map((n) => n.x);
	const ys = nodes.map((n) => n.y);
	const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
	const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
	return nodes.map((n) => ({ ...n, x: n.x - cx, y: n.y - cy }));
}

function flowIslands(
	graph: Graph,
	visible: Set<LinkKind>,
	width: number,
): { islands: PlacedIsland[]; height: number } {
	const placed = graph.islands.map((island) => {
		const nodes = layoutIsland(island, visible);
		// a set's outline is a 56px round stroke, so it reaches 28px past its nodes
		const radius =
			Math.max(...nodes.map((n) => Math.hypot(n.x, n.y) + n.r)) +
			(island.sets.length ? 30 : 10);
		const label = islandLabel(island);
		return {
			island,
			nodes,
			byId: new Map(nodes.map((n) => [n.node.id, n])),
			radius,
			x: 0,
			y: 0,
			scale: 1,
			labelY: 0,
			label,
			sub: islandSub(island, label),
		} satisfies PlacedIsland;
	});
	// rows: islands flow left to right, largest first, and wrap
	const maxW = width - 16;
	let x = 8;
	let y = 8;
	let rowH = 0;
	let row: PlacedIsland[] = [];
	const rows: PlacedIsland[][] = [];
	const closeRow = () => {
		if (row.length === 0) return;
		// spread the row's slack evenly so islands don't hug the left edge
		const used = row.reduce((s, p) => s + p.radius * p.scale * 2, 0);
		const slack = Math.max(0, maxW - used) / (row.length + 1);
		let cx = 8 + slack;
		for (const p of row) {
			const d = p.radius * p.scale;
			p.x = cx + d;
			p.y = y + rowH / 2;
			p.labelY = rowH / 2 + 16;
			cx += d * 2 + slack;
		}
		rows.push(row);
		y += rowH + LABEL_H + ISLAND_GAP;
		row = [];
		rowH = 0;
		x = 8;
	};
	for (const p of placed) {
		const d0 = p.radius * 2;
		if (d0 > maxW) p.scale = maxW / d0;
		const d = p.radius * p.scale * 2;
		if (x + d > maxW + 8 && row.length > 0) closeRow();
		row.push(p);
		x += d + ISLAND_GAP;
		rowH = Math.max(rowH, d);
	}
	closeRow();
	return { islands: placed, height: y - ISLAND_GAP + 8 };
}

/** Where a line from this node's centre toward (tx, ty) leaves its glyph box. */
function edgePoint(n: PlacedNode, tx: number, ty: number) {
	const dx = tx - n.x;
	const dy = ty - n.y;
	const hw = n.w / 2 + 4;
	// the box includes the label under the glyph
	const vy = dy > 0 ? n.h / 2 + 14 : n.h / 2 + 4;
	const t = Math.min(
		dx === 0 ? Infinity : hw / Math.abs(dx),
		dy === 0 ? Infinity : vy / Math.abs(dy),
	);
	const k = Math.min(0.48, t);
	return { x: n.x + dx * k, y: n.y + dy * k };
}

/** Outline around a set of points: the hull, fattened with a round stroke. */
function hullPath(points: [number, number][]): string {
	if (points.length === 0) return "";
	if (points.length === 1) {
		const [x, y] = points[0];
		return `M${x - 0.1},${y}L${x + 0.1},${y}`;
	}
	const hull = points.length > 2 ? (polygonHull(points) ?? points) : points;
	return `${hull.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join("")}Z`;
}

interface Props {
	graph: Graph;
	silhouettes: Silhouettes;
	colors: ColorTable;
	visible: Set<LinkKind>;
	selected: string | null;
	onSelect: (id: string | null) => void;
	/** when given, an island's label opens it */
	onOpen?: (island: Island) => void;
}

export default function LinkMap({
	graph,
	silhouettes,
	colors,
	visible,
	selected,
	onSelect,
	onOpen,
}: Props) {
	const { ref, width } = useMeasure<HTMLDivElement>(960);
	const [hover, setHover] = useState<string | null>(null);
	const toggleSelect = useCallback(
		(id: string) => onSelect(selected === id ? null : id),
		[onSelect, selected],
	);
	const { islands, height } = useMemo(
		() => flowIslands(graph, visible, width),
		[graph, visible, width],
	);

	// what the hover or selection lights up: a node and its links, or a link
	// and its two ends
	const focus = hover ?? selected;
	const lit = useMemo(() => {
		const nodes = new Set<string>();
		const links = new Set<string>();
		if (!focus) return { nodes, links, any: false };
		const link = graph.links.find((l) => l.id === focus);
		if (link) {
			links.add(link.id);
			nodes.add(link.a);
			nodes.add(link.b);
		} else {
			nodes.add(focus);
			for (const l of graph.links)
				if (l.a === focus || l.b === focus) {
					links.add(l.id);
					nodes.add(l.a);
					nodes.add(l.b);
				}
		}
		return { nodes, links, any: true };
	}, [focus, graph.links]);

	const hoverNode = hover
		? islands.flatMap((p) => p.nodes).find((n) => n.node.id === hover)
		: undefined;
	const hoverIsland = hoverNode
		? islands.find((p) => p.byId.has(hoverNode.node.id))
		: undefined;

	return (
		<div className="link-map" ref={ref}>
			<svg
				width={width}
				height={height}
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				className={lit.any ? "has-focus" : undefined}
				aria-label={`${graph.nodes.length} linked khipus in ${graph.islands.length} groups`}
				onClick={() => onSelect(null)}
				onKeyDown={(e) => {
					if (e.key === "Escape") onSelect(null);
				}}
			>
				{islands.map((p) => (
					<g
						key={p.island.id}
						className="link-island"
						transform={`translate(${p.x},${p.y}) scale(${p.scale})`}
					>
						{[...p.island.sets]
							.sort((x, y) => SET_ORDER[x.kind] - SET_ORDER[y.kind])
							.map((s) => (
								<path
									key={s.id}
									className={`link-set link-set-${s.kind}`}
									d={hullPath(
										s.ids
											.map((id) => p.byId.get(id))
											.filter(Boolean)
											.map((n) => [n?.x ?? 0, n?.y ?? 0]),
									)}
								>
									<title>{`${s.label}: ${s.note}`}</title>
								</path>
							))}
						{p.island.links
							.filter((l) => visible.has(l.kind))
							.map((l) => {
								const na = p.byId.get(l.a);
								const nb = p.byId.get(l.b);
								if (!na || !nb) return null;
								const a = edgePoint(na, nb.x, nb.y);
								const b = edgePoint(nb, na.x, na.y);
								const w =
									l.kind === "passage"
										? 1.2
										: 1.6 + Math.min(3, Math.sqrt(l.scan?.values ?? 4) / 2);
								const cls = [
									"link-edge",
									`link-edge-${l.kind}`,
									`link-edge-${l.level}`,
									lit.links.has(l.id) ? "is-lit" : "",
									selected === l.id ? "is-selected" : "",
								].join(" ");
								return (
									// biome-ignore lint/a11y/noStaticElementInteractions: the wide hit line is the control, with a title
									<g
										key={l.id}
										className={cls}
										onMouseEnter={() => setHover(l.id)}
										onMouseLeave={() => setHover(null)}
										onClick={(e) => {
											e.stopPropagation();
											onSelect(selected === l.id ? null : l.id);
										}}
									>
										<title>{`${KIND_LABEL[l.kind]}: ${l.note}`}</title>
										<line
											className="link-edge-hit"
											x1={a.x}
											y1={a.y}
											x2={b.x}
											y2={b.y}
										/>
										<line
											className="link-edge-line"
											x1={a.x}
											y1={a.y}
											x2={b.x}
											y2={b.y}
											strokeWidth={w}
										/>
									</g>
								);
							})}
						{p.nodes.map((n) => (
							<NodeGlyph
								key={n.node.id}
								placed={n}
								silhouettes={silhouettes}
								colors={colors}
								lit={lit.nodes.has(n.node.id)}
								selected={selected === n.node.id}
								onHover={setHover}
								onSelect={toggleSelect}
							/>
						))}
					</g>
				))}
				{islands.map((p) => (
					// biome-ignore lint/a11y/noStaticElementInteractions: the label opens the island; the detail panel has the same link as a button
					<g
						key={`${p.island.id}-label`}
						className={
							onOpen ? "link-island-title is-link" : "link-island-title"
						}
						transform={`translate(${p.x},${p.y + p.labelY})`}
						onClick={(e) => {
							if (!onOpen) return;
							e.stopPropagation();
							onOpen(p.island);
						}}
					>
						{onOpen && <title>Open this island</title>}
						<text className="link-island-label" textAnchor="middle">
							{p.label}
							{onOpen && <tspan className="link-island-open"> ↗</tspan>}
						</text>
						<text className="link-island-sub" y={15} textAnchor="middle">
							{p.sub}
						</text>
					</g>
				))}
			</svg>
			{hoverNode && hoverIsland && (
				<div
					className="link-tip"
					style={{
						left: hoverIsland.x + hoverNode.x * hoverIsland.scale,
						top:
							hoverIsland.y +
							(hoverNode.y - hoverNode.h / 2 - 8) * hoverIsland.scale,
					}}
				>
					<b>
						{hoverNode.node.id} · {hoverNode.node.alias}
					</b>
					<span>
						{hoverNode.node.summary.museum ?? "museum not recorded"}
						{hoverNode.node.summary.provenance
							? ` — ${hoverNode.node.summary.provenance}`
							: ""}
					</span>
					<span>
						{hoverNode.node.summary.nPendants} pendants,{" "}
						{hoverNode.node.links.length}{" "}
						{hoverNode.node.links.length === 1 ? "link" : "links"}
					</span>
				</div>
			)}
		</div>
	);
}

const NodeGlyph = memo(function NodeGlyph({
	placed,
	silhouettes,
	colors,
	lit,
	selected,
	onHover,
	onSelect,
}: {
	placed: PlacedNode;
	silhouettes: Silhouettes;
	colors: ColorTable;
	lit: boolean;
	selected: boolean;
	onHover: (id: string | null) => void;
	onSelect: (id: string) => void;
}) {
	const { node, x, y, w, h } = placed;
	const s = silhouettes[node.id];
	const cords = s ? s.l.map((l, i) => ({ length: l, color: s.c[i] })) : [];
	const cls = [
		"link-node",
		lit ? "is-lit" : "",
		selected ? "is-selected" : "",
	].join(" ");
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: an svg control; keyboard access is the table below
		<g
			className={cls}
			transform={`translate(${x},${y})`}
			onMouseEnter={() => onHover(node.id)}
			onMouseLeave={() => onHover(null)}
			onClick={(e) => {
				e.stopPropagation();
				onSelect(node.id);
			}}
		>
			<rect
				className="link-node-halo"
				x={-w / 2 - 5}
				y={-h / 2 - 4}
				width={w + 10}
				height={h + 8}
				rx={6}
			/>
			<g transform={`translate(${-w / 2},${-h / 2})`}>
				<KhipuSilhouette cords={cords} colors={colors} width={w} height={h} />
			</g>
			<text className="link-node-label" y={h / 2 + 11} textAnchor="middle">
				{node.alias}
			</text>
		</g>
	);
});
