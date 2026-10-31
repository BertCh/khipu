import {
	type AttachKind,
	attachKind,
	axisKind,
	knotDirs,
	type Slant,
	slantOf,
	type TermKind,
} from "#/lib/khipu/anatomy";
import type { CordPaint } from "#/lib/khipu/colors";
import type { CordNode, Layout, LayoutOptions } from "#/lib/khipu/layout";
import { knotClusterYs, knotY } from "#/lib/khipu/layout";
import type { Knot } from "#/lib/khipu/types";

/**
 * The schematic renderer's marks: a cord is a coloured line, a knot a dot, a
 * bar or an 8. Shared by the diagram body, the key and the story cord reader.
 *
 * Everything is drawn in layout units, sized for a CORD_W cord, so the marks
 * magnify honestly when a story stage zooms into them.
 */

export const CORD_W = 2.2;
export const CASING_W = 4.2;

/** theme ink for marks that sit on the primary cord or beyond a cord's tip */
const THEME_INK = "var(--ink)";

export function cordPath(n: CordNode): string {
	if (!n.parent) return `M${n.x},${n.ay} L${n.x},${n.y1}`;
	return `M${n.ax},${n.ay} L${n.x},${n.y0} L${n.x},${n.y1}`;
}

export function dashFor(pattern: CordPaint["pattern"]): string | undefined {
	switch (pattern) {
		case "barberpole":
			return "5 4";
		case "mottled":
			return "1.5 3";
		case "striped":
			return "8 8";
		case "tweed":
			return "2 2";
		default:
			return undefined;
	}
}

/**
 * A line through (x, y) leaning the way a twist or knot direction leans:
 * `\` for S (slant 1), `/` for Z (slant -1). `hw` and `hh` are the half
 * extents, so a 45° slash has hw = hh.
 */
function lean(x: number, y: number, s: Slant, hw: number, hh: number): string {
	return `M${x - hw},${y - s * hh} L${x + hw},${y + s * hh}`;
}

export function CordStroke({
	node,
	paints,
	layout,
	dim,
}: {
	node: CordNode;
	paints: CordPaint[];
	layout: Layout;
	dim: boolean;
}) {
	const opacity = dim ? 0.45 : 1;
	const dash = node.lengthKnown ? undefined : "2 3";
	const elbow = node.parent
		? `M${node.ax},${node.ay} L${node.x},${node.y0}`
		: null;
	const dir = node.up ? -1 : 1;
	const px = layout.options.pxPerCm;

	// spliced cords: one run per colour range, otherwise the whole cord
	const runs =
		paints.length > 1 && paints.every((p) => p.range)
			? paints.map((p) => {
					const r = p.range as [number, number];
					return {
						paint: p,
						y0: node.y0 + dir * r[0] * px,
						y1: node.y0 + dir * r[1] * px,
					};
				})
			: [{ paint: paints[0], y0: node.y0, y1: node.y1 }];

	return (
		<g className="kd-fade" style={{ opacity }}>
			{elbow && (
				<path
					d={elbow}
					fill="none"
					stroke={paints[0].base}
					strokeWidth={CORD_W}
					strokeLinecap="round"
				/>
			)}
			{runs.map((r, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: runs are positional
				<g key={i}>
					<line
						x1={node.x}
						x2={node.x}
						y1={r.y0}
						y2={r.y1}
						stroke={r.paint.base}
						strokeWidth={CORD_W}
						strokeLinecap="round"
						strokeDasharray={dash}
					/>
					{r.paint.accent && (
						<line
							x1={node.x}
							x2={node.x}
							y1={r.y0}
							y2={r.y1}
							stroke={r.paint.accent}
							strokeWidth={CORD_W}
							strokeDasharray={dashFor(r.paint.pattern)}
						/>
					)}
				</g>
			))}
		</g>
	);
}

/** pitch of the dots of a single-knot cluster, and their radius */
const DOT_PITCH = 5.2;
const DOT_R = 2.3;

/** Half the drawn height of a knot cluster, in px, matching KnotGlyph. */
function glyphHalfH(k: Knot): number {
	const n = Math.max(1, k.n);
	switch (k.type) {
		case "S":
			return ((n - 1) * DOT_PITCH) / 2 + DOT_R;
		case "E":
		case "EE":
			return 2.6 + 2.4 * (k.type === "EE" ? 1.6 : 1) + 0.7;
		case "TF":
			return 4;
		case "U":
			return 3.2;
		default:
			return (3 + n * 2) / 2;
	}
}

/**
 * How far past a cord's start its attachment reaches, in px, so a knot
 * cluster can begin below it: the point of a verso loop, the foot of a recto
 * collar, or just the primary's casing; on a subsidiary the hitch is on the
 * parent and only the elbow needs clearing.
 */
function hitchDepth(node: CordNode): number {
	if (node.parent) return 1.5;
	switch (attachKind(node.cord)) {
		case "verso":
			return 6;
		case "recto":
		case "top":
			return 3.5;
		default:
			return 3;
	}
}

/** How a cord's knot glyphs are drawn: the centre of each, and a size factor (1 unless the cord is short of room). */
export interface GlyphFit {
	ys: number[];
	scale: number;
}

/**
 * Where and how big to draw each knot cluster of a laid-out cord: at its
 * recorded position where it can be. A stack of dots is taller than the
 * knots it stands for, so a cluster recorded near the attachment would climb
 * over the hitch and the primary, and neighbours would overlap; they are
 * kept on the cord and apart instead (see packAlongCord), and drawn smaller
 * when a known-length cord hasn't room for them at full size.
 */
export function fitGlyphs(node: CordNode, options: LayoutOptions): GlyphFit {
	const halves = node.cord.knots.map(glyphHalfH);
	const clear = hitchDepth(node);
	const gap = 1;
	let scale = 1;
	if (node.lengthKnown && halves.length > 0) {
		const room =
			Math.abs(node.y1 - node.y0) - clear - gap * (halves.length - 1);
		const need = halves.reduce((a, h) => a + 2 * h, 0);
		if (need > room) scale = Math.max(0.4, room / need);
	}
	return {
		ys: knotClusterYs(
			node,
			halves.map((h) => h * scale),
			options,
			clear,
			gap,
		),
		scale,
	};
}

/**
 * A knot cluster centred on `y`, scaled about it when the cord is short of
 * room (see fitGlyphs).
 */
export function KnotGlyph({
	node,
	knot,
	options,
	ink,
	cord,
	y = knotY(node, knot.pos, options),
	scale = 1,
}: {
	node: CordNode;
	knot: Knot;
	options: LayoutOptions;
	/** contrast colour against the cord */
	ink: string;
	/** the cord's own colour, used for the gaps between turns */
	cord: string;
	/** the cluster's centre; its recorded position unless the cord's knots were packed (fitGlyphs) */
	y?: number;
	scale?: number;
}) {
	const mark = (
		<KnotMark x={node.x} y={y} node={node} knot={knot} ink={ink} cord={cord} />
	);
	if (scale >= 1) return mark;
	const x = node.x;
	return (
		<g
			transform={`translate(${x} ${y}) scale(${scale}) translate(${-x} ${-y})`}
		>
			{mark}
		</g>
	);
}

/**
 * Knot glyphs. Single knots are dots (one per knot), long knots are a bar whose
 * height grows with the number of turns and is split by hairlines, figure-eights
 * are a small 8. The mark is ink; the cord colour shows through around it.
 *
 * The way a knot was tied leans its mark: a dot is scratched `\` (S) or `/`
 * (Z) in the cord colour, a bar's turns slope the same way, an 8's crossing
 * strand slants between its loops. Nothing leans when the direction wasn't
 * recorded. A long knot with a recorded axis gets a notch where the wrapping
 * strand enters the coil.
 */
function KnotMark({
	x,
	y,
	node,
	knot,
	ink,
	cord,
}: {
	x: number;
	y: number;
	node: CordNode;
	knot: Knot;
	ink: string;
	cord: string;
}) {
	switch (knot.type) {
		case "S": {
			const pitch = DOT_PITCH;
			const r = DOT_R;
			// a scratch 1.5 r long at 45°
			const sc = (1.5 * r) / 2 / Math.SQRT2;
			const dirs = knotDirs(knot);
			const start = y - ((dirs.length - 1) * pitch) / 2;
			return (
				<g fill={ink}>
					{dirs.map((d, i) => {
						const cy = start + i * pitch;
						const s = slantOf(d);
						return (
							// biome-ignore lint/suspicious/noArrayIndexKey: positional
							<g key={i}>
								<circle cx={x} cy={cy} r={r} />
								{s !== 0 && (
									<path
										d={lean(x, cy, s, sc, sc)}
										stroke={cord}
										strokeWidth={0.9}
										strokeLinecap="round"
									/>
								)}
							</g>
						);
					})}
				</g>
			);
		}
		case "E":
		case "EE": {
			const w = knot.type === "EE" ? 1.6 : 1;
			const r = 2.4 * w;
			// the crossing strand slants through the waist and just past the
			// loops, so its lean shows even where the rings nearly touch
			const s = slantOf(knot.dir);
			return (
				<g fill="none" stroke={ink} strokeWidth={1.4}>
					<circle cx={x} cy={y - 2.6} r={r} />
					<circle cx={x} cy={y + 2.6} r={r} />
					{s !== 0 && <path d={lean(x, y, s, r + 1, 1.9 * w)} />}
				</g>
			);
		}
		case "TF":
			return (
				<path
					d={`M${x - 3.5},${y + 3} L${x},${y - 4} L${x + 3.5},${y + 3} Z`}
					fill={ink}
				/>
			);
		case "U":
			return (
				<circle
					cx={x}
					cy={y}
					r={2.6}
					fill="none"
					stroke={ink}
					strokeWidth={1.2}
				/>
			);
		default: {
			// long-knot family: height encodes turns
			const turns = Math.max(1, knot.n);
			const h = 3 + turns * 2;
			const w = knot.type === "L" ? 5 : 6.5;
			const spiral = knot.type === "SP";
			const s = slantOf(knot.dir);
			// the wrapping strand enters at the top when the axis runs down,
			// at the bottom when it runs up; the other way on a cord that rises
			const axis = axisKind(knot);
			const entry = axis == null ? 0 : (axis === "down") !== node.up ? -1 : 1;
			const edge = y + entry * (h / 2);
			return (
				<g>
					<rect
						x={x - w / 2}
						y={y - h / 2}
						width={w}
						height={h}
						rx={1.5}
						fill={spiral ? cord : ink}
						stroke={spiral ? ink : undefined}
						strokeWidth={spiral ? 1 : undefined}
					/>
					{turns > 1 &&
						Array.from({ length: turns - 1 }, (_, i) => (
							<path
								// biome-ignore lint/suspicious/noArrayIndexKey: positional
								key={i}
								d={lean(
									x,
									y - h / 2 + 2 + (i + 1) * ((h - 4) / turns),
									s,
									w / 2,
									0.6,
								)}
								stroke={spiral ? ink : cord}
								strokeWidth={0.8}
							/>
						))}
					{entry !== 0 && (
						<path
							d={`M${x - 1.5},${edge + entry * 3.6} L${x + 1.5},${edge + entry * 3.6} L${x},${edge + entry * 0.7} Z`}
							fill={ink}
						/>
					)}
				</g>
			);
		}
	}
}

/**
 * A cord's attachment mark, following the Field Guide's own shorthand: recto
 * is a small collar (the cord crosses the front of the primary inside it),
 * verso a V hanging in front of the primary with the cord emerging from its
 * point, an overhand knot a dot, a top cord the collar with the cord running
 * up. A slash beside the mark leans the way the cord is plied (`\` S, `/` Z).
 *
 * On the primary cord (x, y) is the crossing; on a parent cord (`onParent`)
 * it is the point on the parent's column and the mark shrinks and sits to the
 * right, where the subsidiary leaves.
 */
export function SchematicHitch({
	x,
	y,
	kind,
	twist,
	cord,
	up,
	onParent,
}: {
	x: number;
	y: number;
	kind: AttachKind;
	twist: string | null | undefined;
	cord: string;
	/** contrast colour against the cord (unused: the collar's outline is theme ink, to read on any primary) */
	ink: string;
	up?: boolean;
	onParent?: boolean;
}) {
	if (kind === "unknown") return null;
	const d = up ? -1 : 1;
	// the primary's collar is 5 × 6; on a parent everything is 60 % and
	// nudged right of the column
	const k = onParent ? 0.6 : 1;
	const cx = onParent ? x + 1.2 : x;
	const s = slantOf(twist);
	const outline = {
		stroke: THEME_INK,
		strokeOpacity: 0.8,
		strokeWidth: 0.9 * k,
		strokeLinejoin: "round" as const,
	};
	let mark: React.ReactNode;
	switch (kind) {
		case "recto":
		case "top":
			mark = (
				<rect
					x={cx - 2.5 * k}
					y={y - 3 * k}
					width={5 * k}
					height={6 * k}
					rx={0.6 * k}
					fill={cord}
					{...outline}
				/>
			);
			break;
		case "verso": {
			// the loop hangs from the primary's lower edge to a point on the cord
			const y0 = y + d * 1.4 * k;
			const y1 = y + d * 5.2 * k;
			mark = (
				<>
					<path
						d={`M${cx - 2.5 * k},${y0} L${cx},${y1} L${cx + 2.5 * k},${y0} Z`}
						fill={cord}
					/>
					<path
						d={`M${cx - 2.5 * k},${y0} L${cx},${y1} L${cx + 2.5 * k},${y0}`}
						fill="none"
						strokeLinecap="round"
						{...outline}
					/>
				</>
			);
			break;
		}
		case "overhand":
			mark = <circle cx={cx} cy={y} r={2.2 * k} fill={cord} {...outline} />;
			break;
	}
	// the Field Guide's slash over the attachment, here just beside it; left
	// off a parent cord, where a clutch of subsidiaries can share one point
	const sx = cx + (kind === "overhand" ? 2.2 : 2.5) + 1.8;
	const sh = 1.06;
	return (
		<g>
			{mark}
			{s !== 0 && !onParent && (
				<path
					d={lean(sx, y, s, sh, sh)}
					stroke={THEME_INK}
					strokeOpacity={0.7}
					strokeWidth={0.8}
					strokeLinecap="round"
				/>
			)}
		</g>
	);
}

/**
 * A cord's end mark. `y` is where the line ends (with a round cap of CORD_W),
 * `up` for a cord that rises. Knotted is a ring around the tip — hollow, so
 * it can't be mistaken for a value knot; broken splays ragged ticks; cut
 * bars the tip; ravelled lets two plies diverge; doubled hooks the end back
 * on itself; canutito bands the tip in thread colour; twisted tapers it.
 */
export function SchematicEnd({
	x,
	y,
	kind,
	cord,
	up,
	accent,
}: {
	x: number;
	y: number;
	kind: TermKind;
	cord: string;
	/** contrast colour against the cord (unused: marks beyond the tip are theme ink) */
	ink: string;
	up?: boolean;
	/** thread colour of a canutito */
	accent?: string;
}) {
	const d = up ? -1 : 1;
	const at = (dy: number) => y + d * dy;
	switch (kind) {
		case "knotted":
			return (
				<circle
					cx={x}
					cy={y}
					r={2}
					fill="none"
					stroke={THEME_INK}
					strokeOpacity={0.75}
					strokeWidth={0.9}
				/>
			);
		case "broken":
			return (
				<path
					d={`M${x - 0.5},${at(0.8)} L${x - 1.7},${at(3.1)} M${x + 0.6},${at(1)} L${x + 1.3},${at(3.6)}`}
					fill="none"
					stroke={THEME_INK}
					strokeOpacity={0.75}
					strokeWidth={0.8}
					strokeLinecap="round"
				/>
			);
		case "cut":
			return (
				<line
					x1={x - 1.75}
					x2={x + 1.75}
					y1={at(1)}
					y2={at(1)}
					stroke={THEME_INK}
					strokeOpacity={0.85}
					strokeWidth={0.9}
				/>
			);
		case "ravelled": {
			const plies = `M${x - 1.6},${at(4.2)} L${x},${at(0.6)} L${x + 1.6},${at(4.2)}`;
			return (
				<g fill="none" strokeLinecap="round" strokeLinejoin="round">
					<path d={plies} stroke="var(--cord-casing)" strokeWidth={2.4} />
					<path d={plies} stroke={cord} strokeWidth={1.1} />
				</g>
			);
		}
		case "doubled": {
			// the end folds back on itself: on 2.2 px beyond the tip, a U-turn
			// to the right, and back up alongside the cord
			const r = 1.3;
			const hook = `M${x},${at(0.4)} L${x},${at(2.2)} A${r} ${r} 0 0 ${d > 0 ? 0 : 1} ${x + 2 * r},${at(2.2)} L${x + 2 * r},${at(-1.6)}`;
			return (
				<g fill="none" strokeLinecap="round" strokeLinejoin="round">
					<path d={hook} stroke="var(--cord-casing)" strokeWidth={3} />
					<path d={hook} stroke={cord} strokeWidth={1.5} />
				</g>
			);
		}
		case "canutito":
			return (
				<rect
					x={x - 1.6}
					y={Math.min(at(-2.6), at(0.4))}
					width={3.2}
					height={3}
					rx={0.5}
					fill={accent ?? "#b8362c"}
				/>
			);
		case "twisted": {
			const wedge = `M${x - 1.1},${at(-0.6)} L${x},${at(3.4)} L${x + 1.1},${at(-0.6)} Z`;
			return (
				<path
					d={wedge}
					fill={cord}
					stroke="var(--cord-casing)"
					strokeWidth={0.9}
					strokeLinejoin="round"
				/>
			);
		}
		default:
			// unfinished and unknown: the line just ends
			return null;
	}
}
