import { easeCubicInOut } from "d3-ease";
import { select } from "d3-selection";
import "d3-transition";
import {
	type D3ZoomEvent,
	zoom as d3zoom,
	type ZoomBehavior,
	type ZoomTransform,
	zoomIdentity,
} from "d3-zoom";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useMeasure } from "#/components/charts/useMeasure";
import { KhipuBody, type RenderStyle } from "#/components/khipu/KhipuDiagram";
import {
	type Box,
	type CordNode,
	type GroupBox,
	type Layout,
	layoutBox,
	unionBox,
} from "#/lib/khipu/layout";
import type { ColorTable, Cord } from "#/lib/khipu/types";

/**
 * A khipu under a camera. One or more laid-out khipus sit in a shared stage
 * space; the camera frames a box of it — the whole thing, one group, one
 * cord, a few centimetres of knots — and glides between frames. Cords and
 * knots scale with the zoom, as a drawing would under a glass; labels and
 * callouts are written in screen space so they keep one size. Drag pans,
 * pinch or ⌘-wheel zooms; the page still scrolls under a plain wheel.
 */

export interface StageItem {
	key: string;
	layout: Layout;
	/** where the drawing's origin sits in stage space */
	x?: number;
	y?: number;
	showGroups?: boolean;
	selected?: string | null;
	onSelect?: (name: string | null) => void;
	paint?: (cord: Cord) => string | null | undefined;
	emphasis?: (cord: Cord) => boolean;
	ring?: (cord: Cord) => string | null | undefined;
	label?: (cord: Cord) => string | null | undefined;
	groupLabel?: (g: GroupBox) => string | null | undefined;
	groupBand?: (g: GroupBox) => string | null | undefined;
	/** schematic (default) or physical drawing; see KhipuDiagram */
	style?: RenderStyle;
}

/** What an overlay gets: the camera, and ways to put a point on screen. */
export interface StageCtx {
	t: ZoomTransform;
	width: number;
	height: number;
	k: number;
	items: StageItem[];
	/** stage space → screen */
	sx: (x: number) => number;
	sy: (y: number) => number;
	/** a drawing's own coordinates → screen */
	px: (key: string, x: number) => number;
	py: (key: string, y: number) => number;
	node: (key: string, name: string) => CordNode | undefined;
}

interface Props {
	items: StageItem[];
	colors: ColorTable;
	/** the stage-space box to frame; null or undefined frames everything */
	view?: Box | null;
	/** screen pixels kept clear inside the frame */
	inset?: number;
	/** width ÷ height of the viewport */
	aspect?: number;
	minHeight?: number;
	maxZoom?: number;
	/** ms for a camera move */
	duration?: number;
	interactive?: boolean;
	/** screen-space marks drawn over the drawing */
	overlay?: (ctx: StageCtx) => ReactNode;
	ariaLabel: string;
	className?: string;
	onHoverCord?: (key: string, name: string | null) => void;
}

const VALUE_FONT = 10;

/** The drawing's box in stage space. */
export function itemBox(it: StageItem): Box {
	const b = layoutBox(it.layout);
	return { ...b, x: b.x + (it.x ?? 0), y: b.y + (it.y ?? 0) };
}

/** Move a box from a drawing's own coordinates into stage space. */
export function toStage(it: StageItem, b: Box): Box {
	return { ...b, x: b.x + (it.x ?? 0), y: b.y + (it.y ?? 0) };
}

function fitTransform(
	box: Box,
	width: number,
	height: number,
	inset: number,
	maxK: number,
) {
	const w = Math.max(1, width - 2 * inset);
	const h = Math.max(1, height - 2 * inset);
	const k = Math.min(maxK, w / Math.max(1, box.w), h / Math.max(1, box.h));
	return {
		k,
		x: width / 2 - k * (box.x + box.w / 2),
		y: height / 2 - k * (box.y + box.h / 2),
	};
}

export default function KhipuStage({
	items,
	colors,
	view,
	inset = 28,
	aspect = 2.2,
	minHeight = 300,
	maxZoom = 7,
	duration = 900,
	interactive = true,
	overlay,
	ariaLabel,
	className,
	onHoverCord,
}: Props) {
	const { ref, width } = useMeasure<HTMLDivElement>(900);
	const height = Math.max(minHeight, Math.round(width / aspect));
	const svgRef = useRef<SVGSVGElement>(null);
	const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
	const world = useMemo(() => unionBox(items.map(itemBox)), [items]);
	const target = useMemo(
		() => fitTransform(view ?? world, width, height, inset, maxZoom),
		[view, world, width, height, inset, maxZoom],
	);
	// start framed, so the server-rendered page shows the right view
	const [t, setT] = useState<ZoomTransform>(() =>
		zoomIdentity.translate(target.x, target.y).scale(target.k),
	);
	const [moved, setMoved] = useState(false);

	// the camera
	useEffect(() => {
		const svg = svgRef.current;
		if (!svg) return;
		const z = d3zoom<SVGSVGElement, unknown>()
			.filter((e: WheelEvent | MouseEvent | TouchEvent) => {
				if (!interactive) return false;
				// pinch arrives as a ctrl-wheel; a plain wheel scrolls the page
				if (e.type === "wheel") return e.ctrlKey || e.metaKey;
				if (e.type === "dblclick") return false;
				if ("touches" in e) return false;
				return !("button" in e && e.button);
			})
			.on("zoom", (e: D3ZoomEvent<SVGSVGElement, unknown>) => {
				setT(e.transform);
				if (e.sourceEvent) setMoved(true);
			});
		select(svg).call(z);
		zoomRef.current = z;
		return () => {
			select(svg).on(".zoom", null);
			zoomRef.current = null;
		};
	}, [interactive]);

	// keep the user inside a generous margin around the drawing
	useEffect(() => {
		const z = zoomRef.current;
		if (!z) return;
		const m = Math.max(world.w, world.h) * 0.5;
		const fitK = fitTransform(world, width, height, inset, maxZoom).k;
		z.scaleExtent([fitK * 0.6, maxZoom]).translateExtent([
			[world.x - m, world.y - m],
			[world.x + world.w + m, world.y + world.h + m],
		]);
	}, [world, width, height, inset, maxZoom]);

	// frame the view: animated when the view changes, instant when the
	// viewport does (first paint, hydration, a resize)
	const lastSize = useRef({ width: 0, height: 0 });
	useEffect(() => {
		const svg = svgRef.current;
		const z = zoomRef.current;
		if (!svg || !z) return;
		const tr = zoomIdentity.translate(target.x, target.y).scale(target.k);
		const resized =
			lastSize.current.width !== width || lastSize.current.height !== height;
		lastSize.current = { width, height };
		const still =
			resized ||
			duration === 0 ||
			window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (still) select(svg).call(z.transform, tr);
		else
			select(svg)
				.transition()
				.duration(duration)
				.ease(easeCubicInOut)
				.call(z.transform, tr);
		setMoved(false);
	}, [target, width, height, duration]);

	const refit = useCallback(() => {
		const svg = svgRef.current;
		const z = zoomRef.current;
		if (!svg || !z) return;
		select(svg)
			.transition()
			.duration(500)
			.ease(easeCubicInOut)
			.call(
				z.transform,
				zoomIdentity.translate(target.x, target.y).scale(target.k),
			);
		setMoved(false);
	}, [target]);

	const ctx: StageCtx = useMemo(() => {
		const byKey = new Map(items.map((it) => [it.key, it]));
		const ox = (key: string) => byKey.get(key)?.x ?? 0;
		const oy = (key: string) => byKey.get(key)?.y ?? 0;
		return {
			t,
			width,
			height,
			k: t.k,
			items,
			sx: (x) => t.applyX(x),
			sy: (y) => t.applyY(y),
			px: (key, x) => t.applyX(x + ox(key)),
			py: (key, y) => t.applyY(y + oy(key)),
			node: (key, name) => byKey.get(key)?.layout.byName.get(name),
		};
	}, [t, width, height, items]);

	return (
		<div
			ref={ref}
			className={`khipu-stage ${interactive ? "is-interactive" : ""} ${className ?? ""}`}
			style={{ height }}
		>
			<svg
				ref={svgRef}
				width={width}
				height={height}
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label={ariaLabel}
				onPointerLeave={() => {
					if (onHoverCord) for (const it of items) onHoverCord(it.key, null);
				}}
			>
				<title>{ariaLabel}</title>
				<g transform={t.toString()}>
					{items.map((it) => (
						<g key={it.key} transform={`translate(${it.x ?? 0} ${it.y ?? 0})`}>
							<KhipuBody
								layout={it.layout}
								colors={colors}
								showGroups={it.showGroups ?? true}
								selected={it.selected}
								onSelect={it.onSelect}
								paint={it.paint}
								emphasis={it.emphasis}
								ring={it.ring}
								groupBand={it.groupBand}
								style={it.style}
								labels={false}
								fixedStrokes
								selectionDims={false}
								onPointerCord={
									onHoverCord
										? (n) => onHoverCord(it.key, n.cord.name)
										: undefined
								}
							/>
						</g>
					))}
				</g>
				<g className="stage-screen" pointerEvents="none">
					{items.map((it) => (
						<ScreenLabels key={it.key} item={it} ctx={ctx} />
					))}
					{overlay?.(ctx)}
				</g>
			</svg>
			{moved && (
				<button
					type="button"
					className="btn stage-reset"
					onClick={refit}
					aria-label="Reset the view"
				>
					Reset view
				</button>
			)}
		</div>
	);
}

/**
 * Cord values and group labels, written in screen space so they do not grow
 * with the zoom. Hidden when the columns are too close for the text to fit,
 * and culled outside the viewport.
 */
function ScreenLabels({ item, ctx }: { item: StageItem; ctx: StageCtx }) {
	const { layout, key } = item;
	const { t, width, height } = ctx;
	const slotPx = layout.options.slot * t.k;
	const out: ReactNode[] = [];
	const dimmed = (c: Cord) =>
		(item.selected != null && item.selected !== c.name) ||
		(item.emphasis != null && !item.emphasis(c));

	if (item.label && slotPx >= VALUE_FONT + 1) {
		for (const n of layout.nodes) {
			const text = item.label(n.cord);
			if (!text) continue;
			const x = ctx.px(key, n.x);
			const y = ctx.py(key, n.y1) + (n.up ? -5 : 5);
			if (x < -40 || x > width + 40 || y < -60 || y > height + 60) continue;
			out.push(
				<text
					key={n.cord.name}
					x={x}
					y={y}
					className="stage-value kd-fade"
					transform={`rotate(${n.up ? -90 : 90} ${x} ${y})`}
					textAnchor="start"
					dominantBaseline="middle"
					style={{ opacity: dimmed(n.cord) ? 0.35 : 1 }}
				>
					{text}
				</text>,
			);
		}
	}
	if (item.groupLabel && (item.showGroups ?? true)) {
		const inv = layout.options.invert;
		for (const g of layout.groups) {
			const text = item.groupLabel(g);
			if (!text) continue;
			const x = ctx.px(key, g.x0 + 1);
			const y = inv
				? ctx.py(key, layout.primaryY + 9) + 13
				: ctx.py(key, layout.primaryY - 9) - 5;
			if (x < -200 || x > width + 40 || y < -20 || y > height + 20) continue;
			out.push(
				<text key={`g${g.index}`} x={x} y={y} className="stage-group-label">
					{text}
				</text>,
			);
		}
	}
	return <>{out}</>;
}

/* ---------------------------------------------------------------------------
   Screen-space marks for overlays. All coordinates are pixels.
   --------------------------------------------------------------------------- */

/** Rough width of a run of UI text at a font size, for label boxes. */
function textWidth(text: string, size: number) {
	return text.length * size * 0.56;
}

/** A dot on the drawing with a leader to a boxed label. */
export function Callout({
	x,
	y,
	dx = 48,
	dy = -18,
	text,
	sub,
	tone = "ink",
}: {
	x: number;
	y: number;
	dx?: number;
	dy?: number;
	text: string;
	sub?: string;
	tone?: "ink" | "accent" | "muted";
}) {
	const left = dx < 0;
	const ex = x + dx;
	const ey = y + dy;
	const w = Math.max(textWidth(text, 12.5), sub ? textWidth(sub, 11) : 0) + 12;
	const h = sub ? 34 : 20;
	const bx = left ? ex - w + 6 : ex - 6;
	return (
		<g className={`stage-callout tone-${tone}`}>
			<path
				d={`M${x},${y} L${ex - (left ? -6 : 6)},${ey}`}
				className="callout-leader"
			/>
			<circle cx={x} cy={y} r={3.5} className="callout-dot" />
			<rect
				x={bx}
				y={ey - 10}
				width={w}
				height={h}
				rx={4}
				className="callout-box"
			/>
			<text
				x={ex}
				y={ey}
				textAnchor={left ? "end" : "start"}
				dominantBaseline="middle"
				className="callout-text"
			>
				{text}
			</text>
			{sub && (
				<text
					x={ex}
					y={ey + 14}
					textAnchor={left ? "end" : "start"}
					dominantBaseline="middle"
					className="callout-sub"
				>
					{sub}
				</text>
			)}
		</g>
	);
}

/** A bracket over a span of the drawing, with a line of text above it. */
export function Bracket({
	x0,
	x1,
	y,
	text,
	short,
	tone = "ink",
}: {
	x0: number;
	x1: number;
	y: number;
	text: string;
	/** what to write instead when the span is too narrow for the text */
	short?: string;
	tone?: "ink" | "accent" | "muted" | "no";
}) {
	const fits = x1 - x0 >= textWidth(text, 12.5) + 8;
	const shown = fits || short == null ? text : short;
	return (
		<g className={`stage-bracket tone-${tone}`}>
			<path d={`M${x0},${y + 5} v-5 H${x1} v5`} className="bracket-line" />
			<text
				x={(x0 + x1) / 2}
				y={y - 7}
				textAnchor="middle"
				className="bracket-text"
			>
				{shown}
			</text>
		</g>
	);
}

/** A soft curve joining two points — one khipu's cord to another's. */
export function Connector({
	x1,
	y1,
	x2,
	y2,
	tone = "accent",
	strong = false,
}: {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	tone?: "accent" | "muted";
	strong?: boolean;
}) {
	const my = (y1 + y2) / 2;
	return (
		<path
			d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`}
			className={`stage-connector tone-${tone} ${strong ? "is-strong" : ""}`}
		/>
	);
}

/** A small pill of text pinned at a point. */
export function Tag({
	x,
	y,
	text,
	tone = "ink",
	anchor = "middle",
}: {
	x: number;
	y: number;
	text: string;
	tone?: "ink" | "accent" | "muted" | "no";
	anchor?: "start" | "middle" | "end";
}) {
	const w = text.length * 6.4 + 12;
	const x0 = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
	return (
		<g className={`stage-tag tone-${tone}`}>
			<rect x={x0} y={y - 9} width={w} height={18} rx={9} />
			<text x={x0 + w / 2} y={y} textAnchor="middle" dominantBaseline="middle">
				{text}
			</text>
		</g>
	);
}
