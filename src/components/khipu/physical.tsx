import {
	type AttachKind,
	axisKind,
	knotDirs,
	type Slant,
	slantOf,
} from "#/lib/khipu/anatomy";
import type { CordPaint } from "#/lib/khipu/colors";
import { luminance } from "#/lib/khipu/colors";
import type { Knot } from "#/lib/khipu/types";

/**
 * The physical renderer's marks. Everything here is drawn as the object is
 * made: a cord is a plied rope with the ridges of its final twist, a pendant
 * hangs from a half-hitch whose face (recto or verso) is what the recorder
 * saw, a knot is an overhand knot, a coil of turns or a figure-eight whose
 * crossing strand leans the way it was tied. All marks are parametrised by
 * the cord's drawn diameter `w`, so the same code draws a 3 px cord in the
 * diagram and a 16 px cord in the close-up.
 *
 * Conventions are in src/lib/khipu/anatomy.ts. Slants: S leans `\`, Z `/`.
 */

/* ---------------------------------------------------------------------------
   Ink
   --------------------------------------------------------------------------- */

export interface RopeInk {
	/** the cord's own colour */
	base: string;
	/** its shadow edge and ridges */
	shade: string;
	/** its lit edge */
	light: string;
	/** a contrasting outline for marks that must read on the cord */
	ink: string;
}

function hexToRgb(hex: string): [number, number, number] {
	const n = Number.parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
	const c = (v: number) =>
		Math.max(0, Math.min(255, Math.round(v)))
			.toString(16)
			.padStart(2, "0");
	return `#${c(r)}${c(g)}${c(b)}`;
}

/** Mix a hex colour towards another by k ∈ [0, 1]. */
export function mix(hex: string, towards: string, k: number): string {
	const a = hexToRgb(hex);
	const b = hexToRgb(towards);
	return rgbToHex(
		a[0] + (b[0] - a[0]) * k,
		a[1] + (b[1] - a[1]) * k,
		a[2] + (b[2] - a[2]) * k,
	);
}

const INK_DARK = "#2a221b";
const INK_LIGHT = "#f6f1e8";

export function ropeInk(base: string): RopeInk {
	const lum = luminance(base);
	return {
		base,
		// pale cords need a firmer shadow edge to hold their shape on pale ground
		shade: mix(base, INK_DARK, lum > 0.5 ? 0.42 : 0.34),
		light: mix(base, INK_LIGHT, lum > 0.5 ? 0.35 : 0.3),
		ink: lum > 0.4 ? INK_DARK : INK_LIGHT,
	};
}

/* ---------------------------------------------------------------------------
   Patterns: ply ridges, barber poles, mottling. One <defs> per drawing.
   --------------------------------------------------------------------------- */

export type Orientation = "vertical" | "horizontal";

const hexId = (hex: string) => hex.replace("#", "");

const sizeId = (w: number) => String(Math.round(w * 10));

/**
 * Pattern ids carry the cord diameter they were tiled for, so two drawings
 * on one page at different scales never share a tile.
 */
export function plyPatternId(
	twist: string | null | undefined,
	orientation: Orientation = "vertical",
	w = 1,
): string | undefined {
	const t = twist?.[0];
	if (t !== "S" && t !== "Z") return undefined;
	return `ply-${t}-${orientation[0]}-${sizeId(w)}`;
}

export function barberPatternId(
	accent: string,
	twist: string | null | undefined,
	orientation: Orientation = "vertical",
	w = 1,
): string {
	const t = twist?.[0] === "Z" ? "Z" : twist?.[0] === "S" ? "S" : "U";
	return `bp-${t}-${orientation[0]}-${hexId(accent)}-${sizeId(w)}`;
}

export function mottlePatternId(accent: string, fine: boolean, w = 1): string {
	return `mt-${fine ? "f" : "c"}-${hexId(accent)}-${sizeId(w)}`;
}

export interface RopeSpec {
	paints: CordPaint[];
	twist: string | null | undefined;
	orientation?: Orientation;
	/** this rope's diameter when it differs from the drawing's cord width */
	w?: number;
}

/**
 * Diagonal lines that tile into continuous parallel ridges. A corner-to-corner
 * line repeats seamlessly; the half-offset family is drawn as two segments so
 * it also joins across tile edges.
 */
function ridgeLines(
	slant: Slant,
	W: number,
	H: number,
	orientation: Orientation,
): { main: string; half: string } {
	// on a horizontal cord the same twist shows the opposite diagonal
	const s = orientation === "horizontal" ? -slant : slant;
	if (s > 0) {
		return {
			main: `M0,0 L${W},${H}`,
			half: `M0,${H / 2} L${W / 2},${H} M${W / 2},0 L${W},${H / 2}`,
		};
	}
	return {
		main: `M0,${H} L${W},0`,
		half: `M0,${H / 2} L${W / 2},0 M${W / 2},${H} L${W},${H / 2}`,
	};
}

/**
 * Every pattern a set of ropes needs. `w` is the base cord diameter; a spec
 * may name its own (the primary cord is thicker), and ridge spacing follows
 * it so the texture reads as rope at any magnification.
 */
export function RopeDefs({ w, ropes }: { w: number; ropes: RopeSpec[] }) {
	const plies = new Map<string, { slant: Slant; o: Orientation; w: number }>();
	const barbers = new Map<
		string,
		{ accent: string; slant: Slant; o: Orientation; w: number }
	>();
	const mottles = new Map<
		string,
		{ accent: string; fine: boolean; w: number }
	>();
	for (const r of ropes) {
		const o = r.orientation ?? "vertical";
		const rw = r.w ?? w;
		const id = plyPatternId(r.twist, o, rw);
		if (id) plies.set(id, { slant: slantOf(r.twist), o, w: rw });
		for (const p of r.paints) {
			if (!p.accent) continue;
			if (p.pattern === "barberpole")
				barbers.set(barberPatternId(p.accent, r.twist, o, rw), {
					accent: p.accent,
					slant: slantOf(r.twist),
					o,
					w: rw,
				});
			else if (p.pattern === "mottled" || p.pattern === "tweed")
				mottles.set(mottlePatternId(p.accent, p.pattern === "tweed", rw), {
					accent: p.accent,
					fine: p.pattern === "tweed",
					w: rw,
				});
		}
	}
	return (
		<defs>
			{[...plies].map(([id, p]) => {
				const across = p.w;
				const along = p.w * 0.9;
				const W = p.o === "vertical" ? across : along;
				const H = p.o === "vertical" ? along : across;
				const lines = ridgeLines(p.slant, W, H, p.o);
				return (
					<pattern
						key={id}
						id={id}
						patternUnits="userSpaceOnUse"
						width={W}
						height={H}
					>
						<path
							d={lines.main}
							stroke="rgba(20,12,6,0.30)"
							strokeWidth={p.w * 0.16}
							fill="none"
						/>
						<path
							d={lines.half}
							stroke="rgba(255,250,240,0.28)"
							strokeWidth={p.w * 0.1}
							fill="none"
						/>
					</pattern>
				);
			})}
			{[...barbers].map(([id, b]) => {
				// two plies of different colours: stripes as wide as their gaps,
				// steep, following the twist
				const along = b.w * 2.1;
				const W = b.o === "vertical" ? b.w : along;
				const H = b.o === "vertical" ? along : b.w;
				if (b.slant === 0) {
					// twist unrecorded: bands square to the cord, an honest blank
					return (
						<pattern
							key={id}
							id={id}
							patternUnits="userSpaceOnUse"
							width={W}
							height={H}
						>
							<rect
								x={0}
								y={0}
								width={b.o === "vertical" ? W : W / 2}
								height={b.o === "vertical" ? H / 2 : H}
								fill={b.accent}
							/>
						</pattern>
					);
				}
				const lines = ridgeLines(b.slant, W, H, b.o);
				const spacing = (W * H) / Math.hypot(W, H);
				return (
					<pattern
						key={id}
						id={id}
						patternUnits="userSpaceOnUse"
						width={W}
						height={H}
					>
						<path
							d={lines.main}
							stroke={b.accent}
							strokeWidth={spacing * 0.5}
							fill="none"
						/>
					</pattern>
				);
			})}
			{[...mottles].map(([id, m]) => {
				const T = m.w * 3;
				const r = m.fine ? m.w * 0.16 : m.w * 0.3;
				const dots = m.fine
					? [
							[0.15, 0.1],
							[0.55, 0.25],
							[0.85, 0.05],
							[0.3, 0.5],
							[0.7, 0.6],
							[0.1, 0.8],
							[0.5, 0.9],
							[0.9, 0.75],
							[0.4, 0.3],
						]
					: [
							[0.2, 0.15],
							[0.7, 0.3],
							[0.35, 0.6],
							[0.85, 0.8],
							[0.1, 0.9],
						];
				return (
					<pattern
						key={id}
						id={id}
						patternUnits="userSpaceOnUse"
						width={T}
						height={T}
					>
						{dots.map(([dx, dy], i) => (
							<ellipse
								// biome-ignore lint/suspicious/noArrayIndexKey: positional
								key={i}
								cx={dx * T}
								cy={dy * T}
								rx={r}
								ry={r * 1.5}
								fill={m.accent}
							/>
						))}
					</pattern>
				);
			})}
		</defs>
	);
}

/* ---------------------------------------------------------------------------
   Ropes
   --------------------------------------------------------------------------- */

/** Stroke widths that scale with the cord but never vanish. */
export function hairline(w: number, k = 0.12): number {
	return Math.max(0.5, w * k);
}

/**
 * A vertical run of rope from y0 to y1 (either order), lit from the upper
 * left: shadow edge, body, colour pattern, ply ridges, highlight. Spliced
 * cords draw one run per colour range.
 */
export function CordRope({
	x,
	y0,
	y1,
	w,
	paints,
	twist,
	dashed = false,
	pxPerCm = 1,
}: {
	x: number;
	y0: number;
	y1: number;
	w: number;
	paints: CordPaint[];
	twist: string | null | undefined;
	/** length unrecorded: a stub drawn in dashes */
	dashed?: boolean;
	pxPerCm?: number;
}) {
	const dir = y1 >= y0 ? 1 : -1;
	const runs =
		paints.length > 1 && paints.every((p) => p.range)
			? paints.map((p) => {
					const r = p.range as [number, number];
					return {
						paint: p,
						a: y0 + dir * r[0] * pxPerCm,
						b: y0 + dir * r[1] * pxPerCm,
					};
				})
			: [{ paint: paints[0], a: y0, b: y1 }];
	const ply = plyPatternId(twist, "vertical", w);
	return (
		<g>
			{runs.map((r, i) => (
				<RopeRun
					// biome-ignore lint/suspicious/noArrayIndexKey: runs are positional
					key={i}
					x={x}
					a={r.a}
					b={r.b}
					w={w}
					paint={r.paint}
					twist={twist}
					ply={ply}
					dashed={dashed}
				/>
			))}
		</g>
	);
}

function RopeRun({
	x,
	a,
	b,
	w,
	paint,
	twist,
	ply,
	dashed,
}: {
	x: number;
	a: number;
	b: number;
	w: number;
	paint: CordPaint;
	twist: string | null | undefined;
	ply?: string;
	dashed: boolean;
}) {
	const ink = ropeInk(paint.base);
	const dash = dashed ? `${w * 0.9} ${w * 1.1}` : undefined;
	const pat =
		paint.accent && paint.pattern === "barberpole"
			? `url(#${barberPatternId(paint.accent, twist, "vertical", w)})`
			: paint.accent &&
					(paint.pattern === "mottled" || paint.pattern === "tweed")
				? `url(#${mottlePatternId(paint.accent, paint.pattern === "tweed", w)})`
				: null;
	return (
		<g strokeLinecap="round">
			<line
				x1={x}
				x2={x}
				y1={a}
				y2={b}
				stroke={ink.shade}
				strokeWidth={w + hairline(w, 0.28)}
				strokeDasharray={dash}
			/>
			<line
				x1={x}
				x2={x}
				y1={a}
				y2={b}
				stroke={ink.base}
				strokeWidth={w}
				strokeDasharray={dash}
			/>
			{pat && (
				<line
					x1={x}
					x2={x}
					y1={a}
					y2={b}
					stroke={pat}
					strokeWidth={w}
					strokeDasharray={dash}
				/>
			)}
			{paint.accent && paint.pattern === "striped" && (
				<line
					x1={x + w * 0.22}
					x2={x + w * 0.22}
					y1={a}
					y2={b}
					stroke={paint.accent}
					strokeWidth={w * 0.32}
					strokeDasharray={dash}
				/>
			)}
			{ply && (
				<line
					x1={x}
					x2={x}
					y1={a}
					y2={b}
					stroke={`url(#${ply})`}
					strokeWidth={w}
					strokeDasharray={dash}
				/>
			)}
			<line
				x1={x - w * 0.24}
				x2={x - w * 0.24}
				y1={a}
				y2={b}
				stroke={ink.light}
				strokeWidth={w * 0.22}
				strokeOpacity={0.75}
				strokeDasharray={dash}
			/>
		</g>
	);
}

/**
 * The elbow of a subsidiary: from its hitch on the parent to the top of its
 * own column. A straight lead, as in the schematic, so that a parent with
 * many subsidiaries reads as a fan hung from one point rather than a shelf;
 * drawn a little thinner than the cord so the fan stays light.
 */
export function ElbowRope({
	ax,
	ay,
	x,
	y0,
	w,
	paint,
}: {
	ax: number;
	ay: number;
	x: number;
	y0: number;
	w: number;
	paint: CordPaint;
}) {
	const ink = ropeInk(paint.base);
	const ew = w * 0.8;
	const d = `M${ax},${ay} L${x},${y0}`;
	return (
		<g fill="none" strokeLinecap="round">
			<path d={d} stroke={ink.shade} strokeWidth={ew + hairline(w, 0.28)} />
			<path d={d} stroke={ink.base} strokeWidth={ew} />
			<path
				d={d}
				stroke={ink.light}
				strokeWidth={ew * 0.22}
				strokeOpacity={0.6}
				transform={`translate(0 ${-ew * 0.22})`}
			/>
		</g>
	);
}

/* ---------------------------------------------------------------------------
   Hitches
   --------------------------------------------------------------------------- */

/**
 * A pendant's half-hitch on the primary cord, drawn in two layers because
 * the two faces differ in what lies in front of the primary:
 *
 * - recto: the cord itself crosses the front of the primary, inside the
 *   small square collar of the loop that sits behind (`front` layer)
 * - verso: the loop hangs in front as a V below the primary and the cord
 *   passes behind (`behind` layer draws the arms that peek over the top;
 *   `front` draws the V and its choke)
 *
 * `y` is the primary's centre line, `W` its diameter. Top cords take the
 * recto form mirrored upward.
 */
export function PendantHitch({
	x,
	y,
	w,
	W,
	kind,
	paint,
	up = false,
	layer,
}: {
	x: number;
	y: number;
	w: number;
	W: number;
	kind: AttachKind;
	paint: CordPaint;
	up?: boolean;
	layer: "behind" | "front";
}) {
	const ink = ropeInk(paint.base);
	const d = up ? -1 : 1;
	const hw = w * 0.95;
	const line = hairline(w, 0.14);
	if (kind === "verso") {
		const top = y - d * (W / 2 + w * 0.35);
		const bottom = y + d * (W / 2 + w * 0.1);
		const choke = y + d * (W / 2 + w * 1.45);
		if (layer === "behind") {
			// the loop's arms passing over the far side of the primary
			return (
				<g strokeLinecap="round">
					<line
						x1={x - hw}
						x2={x - hw}
						y1={top}
						y2={y}
						stroke={ink.shade}
						strokeWidth={w * 0.52 + line}
					/>
					<line
						x1={x + hw}
						x2={x + hw}
						y1={top}
						y2={y}
						stroke={ink.shade}
						strokeWidth={w * 0.52 + line}
					/>
					<line
						x1={x - hw}
						x2={x - hw}
						y1={top}
						y2={y}
						stroke={ink.base}
						strokeWidth={w * 0.52}
					/>
					<line
						x1={x + hw}
						x2={x + hw}
						y1={top}
						y2={y}
						stroke={ink.base}
						strokeWidth={w * 0.52}
					/>
				</g>
			);
		}
		const v = `M${x - hw},${bottom - d * w * 0.2} L${x - hw},${bottom} Q${x - hw},${choke} ${x},${choke} Q${x + hw},${choke} ${x + hw},${bottom} L${x + hw},${bottom - d * w * 0.2}`;
		return (
			<g fill="none" strokeLinecap="round" strokeLinejoin="round">
				<path d={v} stroke={ink.shade} strokeWidth={w * 0.52 + line * 2} />
				<path d={v} stroke={ink.base} strokeWidth={w * 0.52} />
				<path
					d={v}
					stroke={ink.light}
					strokeWidth={w * 0.14}
					strokeOpacity={0.7}
					transform={`translate(${-w * 0.1} ${-d * w * 0.1})`}
				/>
			</g>
		);
	}
	if (layer === "behind") return null;
	if (kind === "unknown") return null;
	if (kind === "overhand") {
		return (
			<g>
				<ellipse
					cx={x}
					cy={y + d * (W / 2 + w * 0.5)}
					rx={w * 1.05}
					ry={w * 0.8}
					fill={ink.base}
					stroke={ink.shade}
					strokeWidth={line}
				/>
			</g>
		);
	}
	// recto (and top cords): the cord crosses the primary's face inside the
	// collar of the loop behind it
	const collarTop = y - d * (W / 2 + w * 0.05);
	const collarBottom = y + d * (W / 2 + w * 0.7);
	const cy0 = Math.min(collarTop, collarBottom);
	const ch = Math.abs(collarBottom - collarTop);
	return (
		<g strokeLinecap="round">
			<rect
				x={x - hw - w * 0.1}
				y={cy0}
				width={2 * hw + w * 0.2}
				height={ch}
				rx={w * 0.25}
				fill="none"
				stroke={ink.shade}
				strokeWidth={line * 1.6}
			/>
			<line
				x1={x}
				x2={x}
				y1={collarTop}
				y2={collarBottom}
				stroke={ink.shade}
				strokeWidth={w + hairline(w, 0.28)}
			/>
			<line
				x1={x}
				x2={x}
				y1={collarTop}
				y2={collarBottom}
				stroke={ink.base}
				strokeWidth={w}
			/>
			<line
				x1={x - w * 0.24}
				x2={x - w * 0.24}
				y1={collarTop}
				y2={collarBottom}
				stroke={ink.light}
				strokeWidth={w * 0.22}
				strokeOpacity={0.75}
			/>
		</g>
	);
}

/**
 * A subsidiary's hitch on its (vertical) parent: the same two faces, turned
 * sideways and small. Drawn over the parent at the attachment point.
 */
export function SubsidiaryHitch({
	x,
	y,
	w,
	kind,
	paint,
}: {
	x: number;
	y: number;
	w: number;
	kind: AttachKind;
	paint: CordPaint;
}) {
	if (kind === "unknown" || kind === "top") return null;
	const ink = ropeInk(paint.base);
	const line = hairline(w, 0.14);
	if (kind === "verso") {
		const d = `M${x - w * 0.2},${y - w * 0.9} Q${x + w * 1.1},${y - w * 0.9} ${x + w * 1.1},${y} Q${x + w * 1.1},${y + w * 0.9} ${x - w * 0.2},${y + w * 0.9}`;
		return (
			<g fill="none" strokeLinecap="round">
				<path d={d} stroke={ink.shade} strokeWidth={w * 0.6 + line * 2} />
				<path d={d} stroke={ink.base} strokeWidth={w * 0.6} />
			</g>
		);
	}
	return (
		<rect
			x={x - w * 0.75}
			y={y - w * 0.95}
			width={w * 1.5}
			height={w * 1.9}
			rx={w * 0.25}
			fill="none"
			stroke={ink.shade}
			strokeWidth={line * 1.6}
		/>
	);
}

/* ---------------------------------------------------------------------------
   Knots
   --------------------------------------------------------------------------- */

/** Vertical pitch of single knots in a cluster, in cord diameters. */
export const KNOT_PITCH = 2.4;
/** The snug pitch, bulges just touching, that a short cord closes its clusters up to. */
export const KNOT_PITCH_MIN = 1.7;

/** Half the drawn height of a knot cluster, in px, matching PhysicalKnot. */
export function knotHalfH(k: Knot, w: number, pitch = KNOT_PITCH): number {
	const n = Math.max(1, k.n);
	switch (k.type) {
		case "S":
			return ((n - 1) * pitch * w) / 2 + w * 0.82;
		case "E":
			return w * 0.92 * 2.05 + w * 0.3;
		case "EE":
			return w * 1.15 * 2.05 + w * 0.35;
		case "TF":
			return w * 1.6;
		case "U":
			return w * 0.85;
		default:
			return (n * 0.82 * w + w * 0.5) / 2 + (k.axis ? w * 0.8 : 0);
	}
}

/** How a cord's knot clusters are drawn: the single-knot pitch in diameters, and the knots' diameter. */
export interface KnotFit {
	pitch: number;
	w: number;
}

/**
 * How to draw a cord's knot clusters so they fit on it, in order with `gap`
 * px between them and `clear` px left below the hitch: at the airy pitch
 * when `len` px of cord has room for that, closed up towards the snug pitch
 * when it hasn't, and — as a last resort, since a knot narrower than its
 * cord looks wrong — drawn smaller. A cord of unknown length takes the airy
 * pitch; its knots trail past the drawn stub anyway.
 */
export function fitKnots(
	knots: Knot[],
	w: number,
	len: number | null,
	clear: number,
	gap: number,
): KnotFit {
	const airy = { pitch: KNOT_PITCH, w };
	if (len == null || knots.length === 0) return airy;
	const room = len - clear - gap * (knots.length - 1);
	// the stacked height is linear in the pitch and in the diameter
	const stack = (pitch: number, kw: number) =>
		knots.reduce((a, k) => a + 2 * knotHalfH(k, kw, pitch), 0);
	if (stack(KNOT_PITCH, w) <= room) return airy;
	const perPitch = stack(1, w) - stack(0, w);
	const pitch = perPitch > 0 ? (room - stack(0, w)) / perPitch : 0;
	if (pitch >= KNOT_PITCH_MIN) return { pitch, w };
	const snug = stack(KNOT_PITCH_MIN, w);
	return {
		pitch: KNOT_PITCH_MIN,
		w: Math.max(w * 0.35, (w * room) / snug),
	};
}

/**
 * How far past a cord's start its attachment reaches, in px, so a knot
 * cluster can begin below it: a pendant's hitch hangs from the primary's
 * centre line (`W` its diameter) to the choke of a verso loop, the foot of
 * a recto collar or the bulge of an overhand knot; a subsidiary's is on its
 * parent, and only the elbow needs clearing.
 */
export function hitchDepth(
	w: number,
	W: number,
	kind: AttachKind,
	sub: boolean,
): number {
	if (sub) return w * 0.6;
	switch (kind) {
		case "verso":
			return W / 2 + w * 1.75;
		case "overhand":
			return W / 2 + w * 1.35;
		case "recto":
		case "top":
			return W / 2 + w * 0.8;
		default:
			return W / 2 + w * 0.2;
	}
}

/** A strand crossing the face of a knot, leaning with its direction. */
function Crossing({
	x,
	y,
	w,
	slant,
	ink,
	span = 0.75,
	rise = 0.45,
	width = 0.62,
}: {
	x: number;
	y: number;
	w: number;
	slant: Slant;
	ink: RopeInk;
	span?: number;
	rise?: number;
	width?: number;
}) {
	if (slant === 0) return null;
	// S leans `\`: the left end sits higher (smaller y); Z the reverse
	const x1 = x - w * span;
	const x2 = x + w * span;
	const y1 = y - slant * w * rise;
	const y2 = y + slant * w * rise;
	return (
		<g strokeLinecap="round">
			<line
				x1={x1}
				x2={x2}
				y1={y1}
				y2={y2}
				stroke={ink.shade}
				strokeWidth={w * width + hairline(w, 0.3)}
			/>
			<line
				x1={x1}
				x2={x2}
				y1={y1}
				y2={y2}
				stroke={ink.base}
				strokeWidth={w * width}
			/>
			<line
				x1={x1}
				x2={x2}
				y1={y1}
				y2={y2}
				stroke={ink.light}
				strokeWidth={w * width * 0.3}
				strokeOpacity={0.7}
				transform={`translate(0 ${-w * 0.12})`}
			/>
		</g>
	);
}

/** One overhand knot: a bulge with the crossing strand across its face. */
function SingleKnot({
	x,
	y,
	w,
	slant,
	ink,
}: {
	x: number;
	y: number;
	w: number;
	slant: Slant;
	ink: RopeInk;
}) {
	return (
		<g>
			<ellipse
				cx={x}
				cy={y}
				rx={w * 1.12}
				ry={w * 0.82}
				fill={ink.base}
				stroke={ink.shade}
				strokeWidth={hairline(w, 0.16)}
			/>
			<ellipse
				cx={x - w * 0.3}
				cy={y - w * 0.25}
				rx={w * 0.45}
				ry={w * 0.3}
				fill={ink.light}
				opacity={0.55}
			/>
			<Crossing x={x} y={y} w={w} slant={slant} ink={ink} />
		</g>
	);
}

/**
 * A long knot: a coil of `turns` wraps, each leaning with the direction, and
 * when the axis was recorded, the wrapping strand's oblique entry at one end
 * of the coil (top for axis-down, bottom for axis-up).
 */
function LongKnot({
	x,
	y,
	w,
	turns,
	slant,
	ink,
	axis,
	up,
	variant,
}: {
	x: number;
	y: number;
	w: number;
	turns: number;
	slant: Slant;
	ink: RopeInk;
	axis: "down" | "up" | null;
	up: boolean;
	variant: "L" | "LL" | "BL" | "SP";
}) {
	const pitch = w * 0.82;
	const h = turns * pitch + w * 0.5;
	const hw = variant === "LL" ? w * 1.5 : w * 1.12;
	const top = y - h / 2;
	const line = hairline(w, 0.16);
	const wrapW = variant === "SP" ? w * 0.5 : w * 0.66;
	const rise = w * 0.36;
	const wraps = Array.from(
		{ length: turns },
		(_, i) => top + w * 0.25 + pitch * (i + 0.5),
	);
	// the wrapping strand enters the coil at the end away from the axis, and
	// joins the end wrap where that wrap is nearest the cord's end: for a `\`
	// wrap that is its left end at the top and its right end at the bottom
	const entryAtTop = axis === (up ? "up" : "down");
	const lean = slant || 1;
	const entry =
		axis == null
			? null
			: entryAtTop
				? {
						x1: x,
						y1: top - w * 0.85,
						x2: x - lean * hw * 0.8,
						y2: wraps[0] - lean * rise * 0.6,
					}
				: {
						x1: x,
						y1: top + h + w * 0.85,
						x2: x + lean * hw * 0.8,
						y2: wraps[turns - 1] + lean * rise * 0.6,
					};
	return (
		<g>
			{variant !== "SP" && (
				<rect
					x={x - hw}
					y={top}
					width={2 * hw}
					height={h}
					rx={w * 0.45}
					fill={ink.base}
					stroke={ink.shade}
					strokeWidth={line}
				/>
			)}
			{variant === "LL" && (
				<line
					x1={x}
					x2={x}
					y1={top}
					y2={top + h}
					stroke={ink.shade}
					strokeWidth={line * 1.4}
				/>
			)}
			{entry && (
				<g strokeLinecap="round">
					<line
						x1={entry.x1}
						x2={entry.x2}
						y1={entry.y1}
						y2={entry.y2}
						stroke={ink.shade}
						strokeWidth={wrapW + line * 1.6}
					/>
					<line
						x1={entry.x1}
						x2={entry.x2}
						y1={entry.y1}
						y2={entry.y2}
						stroke={ink.base}
						strokeWidth={wrapW}
					/>
				</g>
			)}
			{wraps.map((wy) => (
				<g key={wy} strokeLinecap="round">
					<line
						x1={x - hw}
						x2={x + hw}
						y1={wy - slant * rise}
						y2={wy + slant * rise}
						stroke={ink.shade}
						strokeWidth={wrapW + line * 1.6}
					/>
					<line
						x1={x - hw}
						x2={x + hw}
						y1={wy - slant * rise}
						y2={wy + slant * rise}
						stroke={ink.base}
						strokeWidth={wrapW}
					/>
					<line
						x1={x - hw + w * 0.2}
						x2={x + hw - w * 0.2}
						y1={wy - slant * rise * 0.8 - w * 0.13}
						y2={wy + slant * rise * 0.8 - w * 0.13}
						stroke={ink.light}
						strokeWidth={wrapW * 0.28}
						strokeOpacity={0.65}
					/>
				</g>
			))}
			{variant === "BL" && (
				<line
					x1={x - hw - w * 0.2}
					x2={x + hw + w * 0.2}
					y1={y}
					y2={y}
					stroke={ink.shade}
					strokeWidth={w * 0.45}
					strokeLinecap="round"
				/>
			)}
		</g>
	);
}

/** A figure-eight: two bights and the crossing between them. */
function EightKnot({
	x,
	y,
	w,
	slant,
	ink,
	double,
}: {
	x: number;
	y: number;
	w: number;
	slant: Slant;
	ink: RopeInk;
	double: boolean;
}) {
	const r = double ? w * 1.15 : w * 0.92;
	const gap = r * 1.05;
	const line = hairline(w, 0.16);
	const strand = w * (double ? 0.7 : 0.6);
	return (
		<g fill="none" strokeLinecap="round">
			<circle
				cx={x}
				cy={y - gap}
				r={r}
				stroke={ink.shade}
				strokeWidth={strand + line * 2}
			/>
			<circle
				cx={x}
				cy={y + gap}
				r={r}
				stroke={ink.shade}
				strokeWidth={strand + line * 2}
			/>
			<circle
				cx={x}
				cy={y - gap}
				r={r}
				stroke={ink.base}
				strokeWidth={strand}
			/>
			<circle
				cx={x}
				cy={y + gap}
				r={r}
				stroke={ink.base}
				strokeWidth={strand}
			/>
			<circle
				cx={x - r * 0.25}
				cy={y - gap - r * 0.3}
				r={r}
				stroke={ink.light}
				strokeWidth={strand * 0.25}
				strokeOpacity={0.6}
				strokeDasharray={`${r * 1.6} ${r * 5}`}
			/>
			<Crossing
				x={x}
				y={y}
				w={w}
				slant={slant}
				ink={ink}
				span={r / w}
				rise={0.55}
				width={strand / w}
			/>
		</g>
	);
}

/**
 * A knot cluster centred on `y`: single knots stack at `pitch` diameters
 * (KNOT_PITCH unless the cord had to close them up), each with its own
 * direction where the record gives one per knot; every other type is one
 * knot.
 */
export function PhysicalKnot({
	x,
	y,
	w,
	knot,
	paint,
	up = false,
	pitch: pitchD = KNOT_PITCH,
}: {
	x: number;
	y: number;
	w: number;
	knot: Knot;
	paint: CordPaint;
	up?: boolean;
	pitch?: number;
}) {
	const ink = ropeInk(paint.base);
	const dirs = knotDirs(knot);
	switch (knot.type) {
		case "S": {
			const n = Math.max(1, knot.n);
			const pitch = pitchD * w;
			const start = y - ((n - 1) * pitch) / 2;
			return (
				<g>
					{dirs.map((d, i) => (
						<SingleKnot
							// biome-ignore lint/suspicious/noArrayIndexKey: positional
							key={i}
							x={x}
							y={start + i * pitch}
							w={w}
							slant={slantOf(d)}
							ink={ink}
						/>
					))}
				</g>
			);
		}
		case "E":
		case "EE":
			return (
				<EightKnot
					x={x}
					y={y}
					w={w}
					slant={slantOf(dirs[0])}
					ink={ink}
					double={knot.type === "EE"}
				/>
			);
		case "TF":
			return (
				<g>
					{[-0.6, 0, 0.6].map((k) => (
						<line
							key={k}
							x1={x}
							x2={x + k * w * 1.1}
							y1={y}
							y2={y - w * 1.6}
							stroke={ink.shade}
							strokeWidth={hairline(w, 0.18)}
							strokeLinecap="round"
						/>
					))}
					<SingleKnot x={x} y={y} w={w} slant={slantOf(dirs[0])} ink={ink} />
				</g>
			);
		case "U":
			return (
				<ellipse
					cx={x}
					cy={y}
					rx={w * 1.1}
					ry={w * 0.85}
					fill="none"
					stroke={ink.shade}
					strokeWidth={hairline(w, 0.2)}
					strokeDasharray={`${w * 0.5} ${w * 0.35}`}
				/>
			);
		default:
			return (
				<LongKnot
					x={x}
					y={y}
					w={w}
					turns={Math.max(1, knot.n)}
					slant={slantOf(dirs[0])}
					ink={ink}
					axis={axisKind(knot)}
					up={up}
					variant={knot.type as "L" | "LL" | "BL" | "SP"}
				/>
			);
	}
}
