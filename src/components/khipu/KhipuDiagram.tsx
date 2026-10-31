import { memo, useCallback, useMemo, useRef, useState } from "react";
import { attachKind, termKind } from "#/lib/khipu/anatomy";
import {
	type CordPaint,
	describeColor,
	hexFor,
	inkOn,
	paintsFor,
} from "#/lib/khipu/colors";
import {
	cordKindLabel,
	describeAttachment,
	describeKnot,
	describeTermination,
	describeTwist,
	formatCm,
	type Reading as ReadingText,
	valueConflictText,
} from "#/lib/khipu/describe";
import {
	type CordNode,
	type GroupBox,
	type Layout,
	type LayoutOptions,
	layoutKhipu,
} from "#/lib/khipu/layout";
import type {
	CodeTables,
	ColorTable,
	Cord,
	KhipuLike,
} from "#/lib/khipu/types";
import { PhysicalLayers } from "./PhysicalBody";
import {
	CASING_W,
	CORD_W,
	CordStroke,
	cordPath,
	dashFor,
	fitGlyphs,
	KnotGlyph,
	SchematicEnd,
	SchematicHitch,
} from "./schematic";

export {
	CASING_W,
	CORD_W,
	cordPath,
	fitGlyphs,
	KnotGlyph,
} from "./schematic";

interface Props {
	khipu: KhipuLike;
	colors: ColorTable;
	/** kept for callers; the hover card now reads the codes through anatomy.ts */
	codes?: CodeTables;
	layout?: Partial<LayoutOptions>;
	showValues?: boolean;
	showGroups?: boolean;
	selected?: string | null;
	onSelect?: (name: string | null) => void;
	/** Fit into the container width (used for the overview hero). */
	fit?: boolean;
	className?: string;
	/**
	 * Story overlays. `paint` replaces a cord's recorded colour with a flat one
	 * (e.g. to colour by attachment); `emphasis` dims cords it returns false for;
	 * `label` writes under a cord instead of its value; `groupLabel` and
	 * `groupBand` annotate and tint a cord group; `ring` draws a highlighter
	 * stroke along a cord in the colour it returns.
	 */
	paint?: (cord: Cord) => string | null | undefined;
	emphasis?: (cord: Cord) => boolean;
	label?: (cord: Cord) => string | null | undefined;
	groupLabel?: (g: GroupBox) => string | null | undefined;
	groupBand?: (g: GroupBox) => string | null | undefined;
	ring?: (cord: Cord) => string | null | undefined;
	/** Hide the hover card (stories keep their own explanation panel). */
	tooltip?: boolean;
	/**
	 * Replace the hover card's contents: the box still follows the pointer and
	 * flips at the right edge, but says what the caller wants about the cord
	 * (the city khipus name a place rather than recite the record).
	 */
	renderTooltip?: (node: CordNode) => React.ReactNode;
	onHover?: (name: string | null) => void;
	/**
	 * How the record is drawn: `schematic` (lines, dots and bars with small
	 * marks for direction, attachment and ends) or `physical` (plied rope,
	 * half-hitches, knots as tied). See src/lib/khipu/anatomy.ts.
	 */
	style?: RenderStyle;
}

export type RenderStyle = "schematic" | "physical";

const HIT_W = 12;

export default function KhipuDiagram({
	khipu,
	colors,
	layout: layoutOpts,
	showValues = false,
	showGroups = true,
	selected = null,
	onSelect,
	fit = false,
	className,
	paint,
	emphasis,
	label,
	groupLabel,
	groupBand,
	ring,
	tooltip = true,
	renderTooltip,
	onHover,
	style = "schematic",
}: Props) {
	const layout = useMemo(
		() => layoutKhipu(khipu, layoutOpts),
		[khipu, layoutOpts],
	);
	const [hover, setHover] = useState<{
		node: CordNode;
		x: number;
		y: number;
	} | null>(null);
	const wrapRef = useRef<HTMLDivElement>(null);

	function onMove(node: CordNode, e: React.PointerEvent) {
		const rect = wrapRef.current?.getBoundingClientRect();
		if (!rect) return;
		setHover({
			node,
			x: e.clientX - rect.left,
			y: e.clientY - rect.top,
		});
		onHover?.(node.cord.name);
	}

	return (
		<div
			ref={wrapRef}
			className={`khipu-diagram ${fit ? "is-fit" : ""} ${className ?? ""}`}
			style={
				{
					position: "relative",
					"--fit-min": `${Math.min(layout.width, 1100)}px`,
				} as React.CSSProperties
			}
		>
			<div className="khipu-scroll">
				<svg
					width={fit ? "100%" : layout.width}
					height={fit ? undefined : layout.height}
					viewBox={`0 0 ${layout.width} ${layout.height}`}
					preserveAspectRatio="xMinYMin meet"
					role="img"
					aria-label={`Diagram of khipu ${khipu.id}: ${khipu.stats.nPendants} pendant cords in ${khipu.stats.nGroups} groups`}
					onPointerLeave={() => {
						setHover(null);
						onHover?.(null);
					}}
				>
					<title>{khipu.id}</title>
					<KhipuBody
						layout={layout}
						colors={colors}
						showGroups={showGroups}
						selected={selected}
						onSelect={onSelect}
						paint={paint}
						emphasis={emphasis}
						label={label}
						showValues={showValues}
						groupLabel={groupLabel}
						groupBand={groupBand}
						ring={ring}
						style={style}
						onPointerCord={onMove}
					/>
				</svg>
			</div>

			{hover && tooltip && (
				<CordTooltip
					node={hover.node}
					x={hover.x}
					y={hover.y}
					colors={colors}
					containerWidth={wrapRef.current?.clientWidth ?? 0}
					render={renderTooltip}
				/>
			)}
		</div>
	);
}

export interface BodyProps {
	layout: Layout;
	colors: ColorTable;
	showGroups?: boolean;
	showValues?: boolean;
	selected?: string | null;
	onSelect?: (name: string | null) => void;
	paint?: (cord: Cord) => string | null | undefined;
	emphasis?: (cord: Cord) => boolean;
	label?: (cord: Cord) => string | null | undefined;
	groupLabel?: (g: GroupBox) => string | null | undefined;
	groupBand?: (g: GroupBox) => string | null | undefined;
	ring?: (cord: Cord) => string | null | undefined;
	/**
	 * Draw value and group labels here, in drawing units. A stage that moves a
	 * camera over the body turns this off and writes its own labels in screen
	 * space, so text keeps one size at every zoom.
	 */
	labels?: boolean;
	/** Keep hairlines one pixel wide under a camera transform. */
	fixedStrokes?: boolean;
	/** Dim every cord but the selected one (the stage keeps its own emphasis). */
	selectionDims?: boolean;
	style?: RenderStyle;
	onPointerCord?: (node: CordNode, e: React.PointerEvent) => void;
}

/**
 * The drawing itself, as an SVG group: bands, group brackets, primary cord,
 * cords with casings, knots, labels, highlight rings and hit targets. Shared
 * by the plain diagram and the animated stage, and memoised so a camera can
 * move over it sixty times a second without redrawing a cord.
 */
export const KhipuBody = memo(function KhipuBody({
	layout,
	colors,
	showGroups = true,
	showValues = false,
	selected = null,
	onSelect,
	paint,
	emphasis,
	label,
	groupLabel,
	groupBand,
	ring,
	labels = true,
	fixedStrokes = false,
	selectionDims = true,
	style = "schematic",
	onPointerCord,
}: BodyProps) {
	const primaryPaint = paintsFor(layout.khipu.primary.colorParsed, colors)[0];
	const paintsOf = useCallback(
		(c: Cord): CordPaint[] => {
			const over = paint?.(c);
			if (over) return [{ base: over, codes: [] }];
			return paintsFor(c.colorParsed, colors);
		},
		[paint, colors],
	);
	const dimmed = (c: Cord) =>
		(selectionDims && selected != null && selected !== c.name) ||
		(emphasis != null && !emphasis(c));
	const hair = fixedStrokes ? "non-scaling-stroke" : undefined;
	// group brackets sit above the primary cord, or below it when the
	// pendants hang upward
	const flip = layout.options.invert ? -1 : 1;
	const bracketY = layout.primaryY - 9 * flip;

	return (
		<g className="kd-body">
			{groupBand && (
				<g className="kd-bands">
					{layout.groups.map((g) => {
						const fill = groupBand(g);
						if (!fill) return null;
						return (
							<rect
								key={g.index}
								x={g.x0 + 0.5}
								y={flip > 0 ? layout.primaryY - 14 : 6}
								width={g.x1 - g.x0 - 1}
								height={
									flip > 0
										? layout.height - layout.primaryY + 14 - 6
										: layout.primaryY + 14 - 6
								}
								rx={3}
								fill={fill}
							/>
						);
					})}
				</g>
			)}

			{showGroups && (
				<g className="kd-groups">
					{layout.groups.map((g) => {
						const y = bracketY;
						const wide = g.x1 - g.x0 >= 26;
						const text = groupLabel
							? groupLabel(g)
							: wide
								? String(g.group.start)
								: null;
						return (
							<g key={g.index}>
								<path
									d={`M${g.x0 + 1},${y + 3 * flip} v${-3 * flip} H${g.x1 - 1} v${3 * flip}`}
									fill="none"
									stroke="var(--rule)"
									strokeWidth={1}
									vectorEffect={hair}
								/>
								{labels && text && (
									<text
										x={g.x0 + 1}
										y={flip > 0 ? y - 3 : y + 11}
										className="kd-label"
									>
										{text}
									</text>
								)}
							</g>
						);
					})}
				</g>
			)}

			{style === "physical" ? (
				<PhysicalLayers
					layout={layout}
					paintsOf={paintsOf}
					primaryPaint={primaryPaint}
					dimmed={dimmed}
				/>
			) : (
				<SchematicLayers
					layout={layout}
					paintsOf={paintsOf}
					primaryPaint={primaryPaint}
					dimmed={dimmed}
				/>
			)}

			{labels && (showValues || label) && (
				<g className="kd-values">
					{layout.nodes.map((n) => {
						const text = label
							? label(n.cord)
							: n.cord.value
								? String(n.cord.value)
								: null;
						if (!text) return null;
						const y = n.up ? n.y1 - 4 : n.y1 + 4;
						return (
							<text
								key={n.cord.name}
								x={n.x}
								y={y}
								className="kd-value"
								transform={`rotate(${n.up ? -90 : 90} ${n.x} ${y})`}
								textAnchor="start"
								dominantBaseline="middle"
								opacity={dimmed(n.cord) ? 0.35 : 1}
							>
								{text}
							</text>
						);
					})}
				</g>
			)}

			{/* highlighter rings */}
			{(ring || selected) && (
				<g className="kd-rings" pointerEvents="none">
					{layout.nodes.map((n) => {
						const color =
							selected === n.cord.name
								? "var(--accent)"
								: (ring?.(n.cord) ?? null);
						if (!color) return null;
						return (
							<path
								key={n.cord.name}
								className="kd-fade"
								d={cordPath(n)}
								fill="none"
								stroke={color}
								strokeWidth={CASING_W + 4}
								strokeOpacity={selected === n.cord.name ? 0.55 : 0.35}
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						);
					})}
				</g>
			)}

			{/* hit targets */}
			{(onSelect || onPointerCord) && (
				<g className="kd-hits" fill="none" stroke="transparent">
					{layout.nodes.map((n) => (
						// biome-ignore lint/a11y/noStaticElementInteractions: SVG hit area; the cord table is the keyboard-reachable twin
						<path
							key={n.cord.name}
							d={cordPath(n)}
							strokeWidth={HIT_W}
							strokeLinecap="round"
							style={{ cursor: onSelect ? "pointer" : "default" }}
							onPointerMove={(e) => onPointerCord?.(n, e)}
							onPointerEnter={(e) => onPointerCord?.(n, e)}
							onClick={() =>
								onSelect?.(selected === n.cord.name ? null : n.cord.name)
							}
						/>
					))}
				</g>
			)}
		</g>
	);
});

/**
 * The schematic renderer's layers: the primary cord, cords over their
 * casings, attachment and end marks, knots inked to contrast with the cord
 * they sit on rather than with the theme.
 */
function SchematicLayers({
	layout,
	paintsOf,
	primaryPaint,
	dimmed,
}: {
	layout: Layout;
	paintsOf: (c: Cord) => CordPaint[];
	primaryPaint: CordPaint;
	dimmed: (c: Cord) => boolean;
}) {
	return (
		<>
			{/* primary cord */}
			<g>
				<line
					x1={layout.primaryX0}
					x2={layout.primaryX1}
					y1={layout.primaryY}
					y2={layout.primaryY}
					stroke="var(--cord-casing)"
					strokeWidth={CASING_W + 1.5}
					strokeLinecap="round"
				/>
				<line
					x1={layout.primaryX0}
					x2={layout.primaryX1}
					y1={layout.primaryY}
					y2={layout.primaryY}
					stroke={primaryPaint.base}
					strokeWidth={CORD_W + 1.5}
					strokeLinecap="round"
				/>
				{primaryPaint.accent && (
					<line
						x1={layout.primaryX0}
						x2={layout.primaryX1}
						y1={layout.primaryY}
						y2={layout.primaryY}
						stroke={primaryPaint.accent}
						strokeWidth={CORD_W + 1.5}
						strokeDasharray={dashFor(primaryPaint.pattern)}
					/>
				)}
			</g>

			{/* cords, casings first so colour always sits on top */}
			<g className="kd-casing">
				{layout.nodes.map((n) => (
					<path
						key={n.cord.name}
						d={cordPath(n)}
						fill="none"
						stroke="var(--cord-casing)"
						strokeWidth={CASING_W}
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				))}
			</g>
			<g className="kd-cords">
				{layout.nodes.map((n) => (
					<CordStroke
						key={n.cord.name}
						node={n}
						paints={paintsOf(n.cord)}
						layout={layout}
						dim={dimmed(n.cord)}
					/>
				))}
			</g>

			{/* knots: inked to contrast with the cord they sit on, not the theme */}
			<g className="kd-knots">
				{layout.nodes.map((n) => {
					if (n.cord.knots.length === 0) return null;
					const base = paintsOf(n.cord)[0].base;
					const ink = inkOn(base);
					const fit = fitGlyphs(n, layout.options);
					return (
						<g
							key={n.cord.name}
							className="kd-fade"
							style={{ opacity: dimmed(n.cord) ? 0.45 : 1 }}
						>
							{n.cord.knots.map((k, i) => (
								<KnotGlyph
									// biome-ignore lint/suspicious/noArrayIndexKey: knots have no id
									key={`${n.cord.name}-${i}`}
									node={n}
									knot={k}
									options={layout.options}
									ink={ink}
									cord={base}
									y={fit.ys[i]}
									scale={fit.scale}
								/>
							))}
						</g>
					);
				})}
			</g>

			{/* attachment faces and cord ends */}
			<g className="kd-marks">
				{layout.nodes.map((n) => {
					const base = paintsOf(n.cord)[0].base;
					const ink = inkOn(base);
					const end = termKind(n.cord.term);
					return (
						<g
							key={n.cord.name}
							className="kd-fade"
							style={{ opacity: dimmed(n.cord) ? 0.45 : 1 }}
						>
							<SchematicHitch
								x={n.parent ? n.ax : n.x}
								y={n.ay}
								kind={attachKind(n.cord)}
								twist={n.cord.twist}
								cord={base}
								ink={ink}
								up={n.up}
								onParent={!!n.parent}
							/>
							{n.lengthKnown && end !== "unknown" && (
								<SchematicEnd
									x={n.x}
									y={n.y1}
									kind={end}
									cord={base}
									ink={ink}
									up={n.up}
								/>
							)}
						</g>
					);
				})}
			</g>
		</>
	);
}

/** A recorded code and what it looks like on the object. */
function Reading({
	reading,
	code,
}: {
	reading: ReadingText;
	code: string | null;
}) {
	return (
		<>
			{reading.label}
			{code && code !== "U" && <span className="kd-code"> {code}</span>}
			{reading.how && <span className="kd-how">{reading.how}</span>}
		</>
	);
}

function CordTooltip({
	node,
	x,
	y,
	colors,
	containerWidth,
	render,
}: {
	node: CordNode;
	x: number;
	y: number;
	colors: ColorTable;
	containerWidth: number;
	render?: (node: CordNode) => React.ReactNode;
}) {
	const c = node.cord;
	const flip = containerWidth > 0 && x > containerWidth - 280;
	const style: React.CSSProperties = {
		position: "absolute",
		top: y + 14,
		left: flip ? undefined : x + 14,
		right: flip ? containerWidth - x + 14 : undefined,
	};
	if (render) {
		return (
			<div className="kd-tip" style={style} role="tooltip">
				{render(node)}
			</div>
		);
	}
	const swatches = c.colorParsed?.flatMap((s) => s.codes) ?? [];
	return (
		<div className="kd-tip" style={style} role="tooltip">
			<div className="kd-tip-head">
				<strong>{c.name}</strong>
				<span>{cordKindLabel(c)}</span>
			</div>
			<div className="kd-tip-row">
				<span className="kd-swatches">
					{swatches.map((code, i) => (
						<i
							// biome-ignore lint/suspicious/noArrayIndexKey: positional
							key={i}
							style={{ background: hexFor(code, colors) }}
						/>
					))}
				</span>
				<span>
					{c.color ?? "—"} — {describeColor(c.colorParsed, colors)}
				</span>
			</div>
			<dl>
				<dt>Value</dt>
				<dd>
					<strong>{c.value != null ? c.value.toLocaleString() : "—"}</strong>
					{c.altValue ? ` (alt ${c.altValue})` : ""}
					{c.valueConflict && (
						<span className="value-conflict" title={valueConflictText(c)}>
							{" "}
							· knots read {c.valueConflict.knots.toLocaleString()}
						</span>
					)}
				</dd>
				<dt>Length</dt>
				<dd>{formatCm(c.length)}</dd>
				{c.pos != null && (
					<>
						<dt>Attached at</dt>
						<dd>
							{c.pos} cm on {c.parent ?? "primary cord"}
						</dd>
					</>
				)}
				<dt>Attachment</dt>
				<dd>
					<Reading reading={describeAttachment(c)} code={c.attach} />
				</dd>
				<dt>Twist</dt>
				<dd>
					<Reading reading={describeTwist(c)} code={c.twist} />
				</dd>
				<dt>End</dt>
				<dd>
					<Reading reading={describeTermination(c)} code={c.term} />
				</dd>
			</dl>
			{c.knots.length > 0 && (
				<ul className="kd-tip-knots">
					{c.knots.map((k, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: positional
						<li key={i}>{describeKnot(k)}</li>
					))}
				</ul>
			)}
			{c.notes && <p className="kd-tip-notes">{c.notes}</p>}
		</div>
	);
}
