import {
	type BeginKind,
	type Slant,
	slantOf,
	type TermKind,
} from "#/lib/khipu/anatomy";
import type { CordPaint } from "#/lib/khipu/colors";
import {
	barberPatternId,
	hairline,
	mix,
	mottlePatternId,
	plyPatternId,
	type RopeInk,
	ropeInk,
} from "./physical";

/**
 * The ends of things: how a cord finishes (a stopper knot, a break, a cut,
 * ravelled plies, a doubled-back end, a canutito wrap) and the primary cord
 * itself with its beginning and its termination.
 *
 * Every end is drawn once in a local frame — the rope's tip at the origin,
 * the rope arriving from −y, whatever lies beyond the tip at +y — and turned
 * to point down, up, left or right. Rotations only, never mirrors, so a `\`
 * ridge stays a `\` (or becomes the `/` the same twist shows on a horizontal
 * cord). Sizes are in rope diameters, strokes via hairline(), so the same
 * glyph reads at 3 px and at 24 px.
 */

interface Frame {
	/** the rope's diameter */
	w: number;
	ink: RopeInk;
	/** lean of the ply ridges as seen in this frame */
	slant: Slant;
	/** where the light comes from, in this frame */
	lx: -1 | 1;
	ly: -1 | 1;
	/** the side a folded end returns on (and a tassel droops to): the right of a hanging cord, below the primary */
	side: -1 | 1;
}

/** Half-width of the rope's shadow edge, as CordRope draws it. */
const shadeHalf = (w: number) => (w + hairline(w, 0.28)) / 2;

/* ---------------------------------------------------------------------------
   Cord ends
   --------------------------------------------------------------------------- */

/** A stopper knot: a plain bead at the tip, no crossing strand. */
function Stopper({ f }: { f: Frame }) {
	const { w, ink } = f;
	const cy = -w * 0.2;
	return (
		<g>
			<ellipse
				cx={0}
				cy={cy}
				rx={w * 0.95}
				ry={w * 0.78}
				fill={ink.base}
				stroke={ink.shade}
				strokeWidth={hairline(w, 0.16)}
			/>
			{/* the crease where the cord enters the bead */}
			<path
				d={`M${-w * 0.42},${cy - w * 0.72} Q0,${cy - w * 0.5} ${w * 0.42},${cy - w * 0.72}`}
				fill="none"
				stroke={ink.shade}
				strokeWidth={hairline(w, 0.12)}
				strokeOpacity={0.6}
				strokeLinecap="round"
			/>
			<ellipse
				cx={f.lx * w * 0.3}
				cy={cy + f.ly * w * 0.26}
				rx={w * 0.36}
				ry={w * 0.2}
				fill={ink.light}
				opacity={0.5}
			/>
		</g>
	);
}

/** Quadratic curves given as [x0, y0, cx, cy, x1, y1] in diameters. */
const curves = (w: number, list: number[][]) =>
	list
		.map(
			([x0, y0, cx, cy, x1, y1]) =>
				`M${x0 * w},${y0 * w} Q${cx * w},${cy * w} ${x1 * w},${y1 * w}`,
		)
		.join(" ");

/** The plies of a broken end, parting to unequal lengths... */
const BROKEN_PLIES = [
	[-0.28, -0.5, -0.3, 0.2, -0.42, 0.75],
	[0.02, -0.5, 0.02, 0.3, -0.05, 1.05],
	[0.3, -0.5, 0.32, 0.1, 0.42, 0.5],
];

/** ...and the loose fibres beyond them. */
const BROKEN_HAIRS = [
	[-0.42, 0.7, -0.5, 1.0, -0.55, 1.25],
	[-0.05, 1.0, -0.02, 1.3, -0.12, 1.55],
	[0.42, 0.45, 0.5, 0.7, 0.62, 0.9],
	[0.15, 0.6, 0.2, 0.9, 0.28, 1.15],
];

/** A break: the plies come apart at different lengths and fray. */
function Ragged({ f }: { f: Frame }) {
	const { w, ink } = f;
	const plies = curves(w, BROKEN_PLIES);
	return (
		<g fill="none" strokeLinecap="round">
			<path
				d={curves(w, BROKEN_HAIRS)}
				stroke={ink.shade}
				strokeWidth={hairline(w, 0.14)}
			/>
			<path
				d={plies}
				stroke={ink.shade}
				strokeWidth={w * 0.3 + hairline(w, 0.12) * 2}
			/>
			<path d={plies} stroke={ink.base} strokeWidth={w * 0.3} />
		</g>
	);
}

/** A cut: the round cap squared off flat. */
function Cut({ f }: { f: Frame }) {
	const { w, ink } = f;
	const hs = shadeHalf(w);
	const face = Math.max(hs - w / 2, hairline(w, 0.16));
	return (
		<g>
			<rect
				x={-hs}
				y={0}
				width={2 * hs}
				height={w * 0.5 + face}
				fill={ink.shade}
			/>
			<rect x={-w / 2} y={0} width={w} height={w * 0.5} fill={ink.base} />
			<line
				x1={f.lx * w * 0.24}
				x2={f.lx * w * 0.24}
				y1={0}
				y2={w * 0.5}
				stroke={ink.light}
				strokeWidth={w * 0.22}
				strokeOpacity={0.75}
			/>
		</g>
	);
}

/** Ravelled: the two plies part and curl away from each other. */
function Ravelled({ f }: { f: Frame }) {
	const { w, ink } = f;
	const sw = w * 0.4;
	const edge = hairline(w, 0.16);
	const left = `M${-w * 0.14},${-w * 0.45} C${-w * 0.24},${w * 0.55} ${-w * 0.3},${w * 1.25} ${-w * 1.0},${w * 1.85}`;
	const right = `M${w * 0.14},${-w * 0.45} C${w * 0.28},${w * 0.6} ${w * 0.5},${w * 1.15} ${w * 0.85},${w * 2.0}`;
	const shift = `translate(${f.lx * w * 0.08} ${f.ly * w * 0.05})`;
	return (
		<g fill="none" strokeLinecap="round">
			<path d={left} stroke={ink.shade} strokeWidth={sw + edge * 2} />
			<path d={right} stroke={ink.shade} strokeWidth={sw + edge * 2} />
			<path d={left} stroke={ink.base} strokeWidth={sw} />
			<path d={right} stroke={ink.base} strokeWidth={sw} />
			<path
				d={left}
				stroke={ink.light}
				strokeWidth={sw * 0.3}
				strokeOpacity={0.6}
				transform={shift}
			/>
			<path
				d={right}
				stroke={ink.light}
				strokeWidth={sw * 0.3}
				strokeOpacity={0.6}
				transform={shift}
			/>
		</g>
	);
}

/** Short ply ridges across a straight run of rope, for loops drawn without the tiled pattern. */
function RidgeTicks({
	f,
	x,
	from,
	to,
}: {
	f: Frame;
	x: number;
	from: number;
	to: number;
}) {
	const { w, slant } = f;
	if (!slant) return null;
	const pitch = w * 0.9;
	const dark: string[] = [];
	const pale: string[] = [];
	for (
		let y = Math.min(from, to) + pitch * 0.4;
		y < Math.max(from, to);
		y += pitch
	) {
		dark.push(
			`M${x - w * 0.34},${y - slant * w * 0.3} L${x + w * 0.34},${y + slant * w * 0.3}`,
		);
		const yh = y + pitch / 2;
		if (yh < Math.max(from, to))
			pale.push(
				`M${x - w * 0.3},${yh - slant * w * 0.27} L${x + w * 0.3},${yh + slant * w * 0.27}`,
			);
	}
	return (
		<g fill="none">
			<path
				d={dark.join(" ")}
				stroke="rgba(20,12,6,0.30)"
				strokeWidth={w * 0.16}
			/>
			<path
				d={pale.join(" ")}
				stroke="rgba(255,250,240,0.28)"
				strokeWidth={w * 0.1}
			/>
		</g>
	);
}

/** Doubled back: a U-turn at the tip returning alongside the rope. */
function Doubled({ f, back = 1.6 }: { f: Frame; back?: number }) {
	const { w, ink, side } = f;
	const r = w * 0.72;
	const xr = side * 2 * r;
	// from the tip round the bottom of the U to the far leg
	const sweep = side > 0 ? 0 : 1;
	const d = `M0,${-w * 0.4} L0,0 A${r},${r} 0 0 ${sweep} ${xr},0 L${xr},${-back * w}`;
	return (
		<g fill="none" strokeLinecap="round" strokeLinejoin="round">
			<path d={d} stroke={ink.shade} strokeWidth={w + hairline(w, 0.28)} />
			<path d={d} stroke={ink.base} strokeWidth={w} />
			<RidgeTicks f={f} x={xr} from={-w * 0.2} to={-back * w + w * 0.2} />
			<path
				d={d}
				stroke={ink.light}
				strokeWidth={w * 0.22}
				strokeOpacity={0.55}
				transform={`translate(${f.lx * w * 0.22} ${f.ly * w * 0.14})`}
			/>
		</g>
	);
}

/**
 * A taper to a point, over `len` diameters: an unfinished end, or with the
 * ridges of the plies twisted tight, a twisted one.
 */
function Taper({
	f,
	len = 1.45,
	twisted = false,
}: {
	f: Frame;
	len?: number;
	twisted?: boolean;
}) {
	const { w, ink, lx } = f;
	const s = f.slant || 1;
	const tip = len * w;
	const neck = w * 0.3;
	const body = `M${-w * 0.5},0 L${-w * 0.5},${neck} L0,${tip} L${w * 0.5},${neck} L${w * 0.5},0 Z`;
	const edge = `M${-w * 0.5},${neck} L0,${tip} L${w * 0.5},${neck}`;
	// ridges cross the taper where it is still wide enough to show them
	const ridges = twisted
		? [0.14, 0.4, 0.64]
				.map((k) => {
					const y = neck + k * (tip - neck);
					const hw = (w * 0.5 * (tip - y)) / (tip - neck) - w * 0.06;
					return `M${-hw},${y - s * hw * 0.8} L${hw},${y + s * hw * 0.8}`;
				})
				.join(" ")
		: null;
	return (
		<g strokeLinecap="round" strokeLinejoin="round">
			<path d={body} fill={ink.base} />
			<path
				d={edge}
				fill="none"
				stroke={ink.shade}
				strokeWidth={hairline(w, 0.16)}
			/>
			{ridges && (
				<path
					d={ridges}
					fill="none"
					stroke={ink.shade}
					strokeWidth={hairline(w, 0.14)}
					strokeOpacity={0.75}
				/>
			)}
			<path
				d={`M${lx * w * 0.24},0 L${lx * w * 0.24},${neck} L${lx * w * 0.07},${tip - w * 0.55}`}
				fill="none"
				stroke={ink.light}
				strokeWidth={w * 0.18}
				strokeOpacity={0.6}
			/>
		</g>
	);
}

/** Canutito: the tip bound in a sleeve of contrasting thread. */
function Canutito({ f, colour }: { f: Frame; colour: string }) {
	const { w, lx } = f;
	const c = ropeInk(colour);
	const s = f.slant || 1;
	const wraps = [-0.52, -0.16, 0.2];
	return (
		<g>
			<rect
				x={-w * 0.66}
				y={-w * 0.82}
				width={w * 1.32}
				height={w * 1.47}
				rx={w * 0.12}
				fill={colour}
				stroke={c.shade}
				strokeWidth={hairline(w, 0.16)}
			/>
			<path
				d={wraps
					.map(
						(k) =>
							`M${-w * 0.66},${k * w + w * 0.1 - s * w * 0.04} L${w * 0.66},${k * w + w * 0.1 + s * w * 0.04}`,
					)
					.join(" ")}
				fill="none"
				stroke={c.shade}
				strokeWidth={hairline(w, 0.08)}
				strokeOpacity={0.5}
			/>
			<path
				d={wraps
					.map(
						(k) =>
							`M${-w * 0.66},${k * w - s * w * 0.04} L${w * 0.66},${k * w + s * w * 0.04}`,
					)
					.join(" ")}
				fill="none"
				stroke={c.light}
				strokeWidth={hairline(w, 0.1)}
				strokeOpacity={0.85}
			/>
			<line
				x1={lx * w * 0.42}
				x2={lx * w * 0.42}
				y1={-w * 0.7}
				y2={w * 0.53}
				stroke={c.light}
				strokeWidth={w * 0.14}
				strokeOpacity={0.5}
				strokeLinecap="round"
			/>
		</g>
	);
}

/* ---------------------------------------------------------------------------
   Ends only the primary cord has
   --------------------------------------------------------------------------- */

/** A borla: a bound neck, then fibres fanning out and drooping. */
function Tassel({ f }: { f: Frame }) {
	const { w, ink, side, lx } = f;
	const neckEnd = w * 0.85;
	const fibres = [-0.36, -0.24, -0.12, 0, 0.12, 0.24, 0.36].map((x0, i) => {
		const a = side * (-0.35 + (1.35 * i) / 6);
		const len = w * [2.6, 3.0, 2.8, 3.1, 2.7, 3.0, 2.6][i];
		const x1 = x0 * w + Math.sin(a) * len + side * w * 0.55;
		const y1 = neckEnd + Math.cos(a) * len * 0.9;
		const cx = x0 * w + Math.sin(a) * len * 0.45;
		const cy = neckEnd + Math.cos(a) * len * 0.6;
		return `M${x0 * w},${neckEnd - w * 0.1} Q${cx},${cy} ${x1},${y1}`;
	});
	const wisps = [-0.3, -0.05, 0.2, 0.42].map((x0, i) => {
		const a = side * (-0.55 + (1.75 * i) / 3);
		const len = w * [2.2, 2.5, 2.4, 2.1][i];
		return `M${x0 * w},${neckEnd} Q${x0 * w + Math.sin(a) * len * 0.5},${neckEnd + Math.cos(a) * len * 0.65} ${x0 * w + Math.sin(a) * len + side * w * 0.4},${neckEnd + Math.cos(a) * len * 0.85}`;
	});
	return (
		<g strokeLinecap="round">
			<path
				d={wisps.join(" ")}
				fill="none"
				stroke={ink.shade}
				strokeWidth={hairline(w, 0.12)}
				strokeOpacity={0.8}
			/>
			<path
				d={fibres.join(" ")}
				fill="none"
				stroke={ink.shade}
				strokeWidth={w * 0.26}
			/>
			<path
				d={fibres.join(" ")}
				fill="none"
				stroke={ink.base}
				strokeWidth={w * 0.13}
			/>
			<rect
				x={-w * 0.66}
				y={-w * 0.05}
				width={w * 1.32}
				height={neckEnd + w * 0.05}
				rx={w * 0.12}
				fill={ink.base}
				stroke={ink.shade}
				strokeWidth={hairline(w, 0.16)}
			/>
			{[0.18, 0.4, 0.62].map((k) => (
				<line
					key={k}
					x1={-w * 0.66}
					x2={w * 0.66}
					y1={k * w - w * 0.03}
					y2={k * w + w * 0.03}
					stroke={ink.light}
					strokeWidth={hairline(w, 0.1)}
					strokeOpacity={0.8}
				/>
			))}
			<line
				x1={lx * w * 0.42}
				x2={lx * w * 0.42}
				y1={w * 0.05}
				y2={neckEnd - w * 0.1}
				stroke={ink.light}
				strokeWidth={w * 0.14}
				strokeOpacity={0.5}
			/>
		</g>
	);
}

const WOOD = "#7a5230";
const WOOD_EDGE = "#4a2f1a";

/** A wooden bar across the end of the primary, the rope lashed to it. */
function WoodenBar({ f }: { f: Frame }) {
	const { w, ink } = f;
	return (
		<g>
			{/* the lashing that binds the rope to the bar */}
			<rect
				x={-w * 0.62}
				y={-w * 0.8}
				width={w * 1.24}
				height={w * 0.8}
				rx={w * 0.1}
				fill={ink.base}
				stroke={ink.shade}
				strokeWidth={hairline(w, 0.16)}
			/>
			{[-0.6, -0.38, -0.16].map((k) => (
				<line
					key={k}
					x1={-w * 0.62}
					x2={w * 0.62}
					y1={k * w}
					y2={k * w}
					stroke={ink.light}
					strokeWidth={hairline(w, 0.1)}
					strokeOpacity={0.8}
				/>
			))}
			<rect
				x={-w * 2}
				y={0}
				width={w * 4}
				height={w * 0.8}
				rx={w * 0.22}
				fill={WOOD}
				stroke={WOOD_EDGE}
				strokeWidth={hairline(w, 0.16)}
			/>
			<line
				x1={-w * 1.6}
				x2={w * 1.6}
				y1={w * 0.28}
				y2={w * 0.28}
				stroke={mix(WOOD, "#f6f1e8", 0.32)}
				strokeWidth={hairline(w, 0.1)}
				strokeOpacity={0.85}
				strokeLinecap="round"
			/>
		</g>
	);
}

/** Diagonal hatching clipped to a box, without a clipPath. */
function hatch(
	x0: number,
	x1: number,
	y0: number,
	y1: number,
	pitch: number,
	dir: 1 | -1,
): string {
	const parts: string[] = [];
	const step = pitch * Math.SQRT2;
	if (dir > 0) {
		// lines y = x + c
		for (let c = y0 - x1; c <= y1 - x0; c += step) {
			const a = Math.max(x0, y0 - c);
			const b = Math.min(x1, y1 - c);
			if (b > a) parts.push(`M${a},${a + c} L${b},${b + c}`);
		}
	} else {
		// lines y = -x + c
		for (let c = y0 + x0; c <= y1 + x1; c += step) {
			const a = Math.max(x0, c - y1);
			const b = Math.min(x1, c - y0);
			if (b > a) parts.push(`M${a},${c - a} L${b},${c - b}`);
		}
	}
	return parts.join(" ");
}

/** A needlework bundle: the end bound in a crosshatched sleeve. */
function Needlework({ f }: { f: Frame }) {
	const { w, ink, lx } = f;
	const top = -w * 1.6;
	const bottom = w * 0.8;
	const hw = w * 0.7;
	const inset = w * 0.12;
	const pitch = w * 0.3;
	return (
		<g>
			<rect
				x={-hw}
				y={top}
				width={2 * hw}
				height={bottom - top}
				rx={w * 0.3}
				fill={ink.base}
				stroke={ink.shade}
				strokeWidth={hairline(w, 0.16)}
			/>
			<path
				d={`${hatch(-hw + inset, hw - inset, top + inset, bottom - inset, pitch, 1)} ${hatch(-hw + inset, hw - inset, top + inset, bottom - inset, pitch, -1)}`}
				fill="none"
				stroke={ink.shade}
				strokeWidth={hairline(w, 0.09)}
				strokeOpacity={0.7}
			/>
			<line
				x1={lx * w * 0.45}
				x2={lx * w * 0.45}
				y1={top + w * 0.3}
				y2={bottom - w * 0.3}
				stroke={ink.light}
				strokeWidth={w * 0.16}
				strokeOpacity={0.45}
				strokeLinecap="round"
			/>
		</g>
	);
}

/**
 * Affixed: the end hooked up and over another cord. That cord is not in the
 * record, so it is a neutral ghost: it runs through the eye of the hook and
 * on below the primary, and the returning arm passes behind it.
 */
function Hook({ f }: { f: Frame }) {
	const { w, ink, side } = f;
	const up = -side;
	const r = w * 0.85;
	const xr = up * 2 * r;
	const sweep = up > 0 ? 0 : 1;
	const cy = w * 0.15;
	const d = `M0,${-w * 0.4} L0,${cy} A${r},${r} 0 0 ${sweep} ${xr},${cy} L${xr},${-w * 0.35}`;
	const ghost = {
		stroke: mix(ink.base, "#8a8478", 0.6),
		strokeWidth: w * 0.56,
		strokeOpacity: 0.7,
	};
	return (
		<g fill="none" strokeLinecap="round" strokeLinejoin="round">
			<line x1={-up * w * 0.66} x2={-up * w * 2.1} y1={cy} y2={cy} {...ghost} />
			<path d={d} stroke={ink.shade} strokeWidth={w + hairline(w, 0.28)} />
			<path d={d} stroke={ink.base} strokeWidth={w} />
			<path
				d={d}
				stroke={ink.light}
				strokeWidth={w * 0.22}
				strokeOpacity={0.55}
				transform={`translate(${f.lx * w * 0.22} ${f.ly * w * 0.14})`}
			/>
			<line x1={up * w * 0.66} x2={up * w * 2.8} y1={cy} y2={cy} {...ghost} />
		</g>
	);
}

/* ---------------------------------------------------------------------------
   Dispatch and the public components
   --------------------------------------------------------------------------- */

function EndGlyph({
	kind,
	f,
	paint,
	primary = false,
}: {
	kind: BeginKind | TermKind;
	f: Frame;
	paint: CordPaint;
	/** the primary's ends are drawn a little longer */
	primary?: boolean;
}) {
	switch (kind) {
		case "knotted":
			return <Stopper f={f} />;
		case "broken":
			return <Ragged f={f} />;
		case "cut":
			return <Cut f={f} />;
		case "ravelled":
			return <Ravelled f={f} />;
		case "doubled":
			return <Doubled f={f} back={primary ? 1.5 : 1.6} />;
		case "unfinished":
			return <Taper f={f} />;
		case "twisted":
			return <Taper f={f} twisted len={primary ? 2.5 : 1.45} />;
		case "canutito":
			return (
				<Canutito
					f={f}
					colour={mix(paint.accent ?? "#b8362c", paint.base, 0.15)}
				/>
			);
		case "tassel":
			return <Tassel f={f} />;
		case "wooden-bar":
			return <WoodenBar f={f} />;
		case "needlework":
			return <Needlework f={f} />;
		case "affixed":
			return <Hook f={f} />;
		default:
			return null;
	}
}

/**
 * The end of a cord at (x, y), where its rope already stops; `up` when the
 * cord runs upward (top cords). `twist` leans the ridges on twisted and
 * doubled ends the way the cord is plied.
 */
export function CordEnd({
	x,
	y,
	w,
	kind,
	paint,
	up = false,
	twist,
}: {
	x: number;
	y: number;
	w: number;
	kind: TermKind;
	paint: CordPaint;
	up?: boolean;
	twist?: string | null;
}) {
	if (kind === "unknown") return null;
	const ink = ropeInk(paint.base);
	// a top cord's end is the same glyph turned through 180°: the light and
	// the loop's side swap so both still read from the upper left / right
	const f: Frame = up
		? { w, ink, slant: slantOf(twist), lx: 1, ly: 1, side: -1 }
		: { w, ink, slant: slantOf(twist), lx: -1, ly: -1, side: 1 };
	return (
		<g transform={`translate(${x} ${y})${up ? " rotate(180)" : ""}`}>
			<EndGlyph kind={kind} f={f} paint={paint} />
		</g>
	);
}

/** Herringbone of a braid: nested chevrons along the cord. */
function chevrons(x0: number, x1: number, y: number, W: number): string {
	const parts: string[] = [];
	const arm = W * 0.48;
	for (let x = x0 + W * 0.3; x + arm <= x1 - W * 0.2; x += W * 0.5)
		parts.push(`M${x},${y - W * 0.42} L${x + arm},${y} L${x},${y + W * 0.42}`);
	return parts.join(" ");
}

/** The turns of a wrapped cord: bands square across it. */
function bands(x0: number, x1: number, y: number, W: number): string {
	const parts: string[] = [];
	for (let x = x0 + W * 0.35; x <= x1 - W * 0.3; x += W * 0.55)
		parts.push(`M${x},${y - W * 0.5} L${x},${y + W * 0.5}`);
	return parts.join(" ");
}

/**
 * The primary cord from x0 (its beginning, 0 cm) to x1 (its end) along y, of
 * diameter W, lit from above: shadow edge, body, colour pattern, the texture
 * of its structure (plied ridges, a braid's herringbone, a wrapping's bands),
 * highlight; then its beginning at the left and its termination at the
 * right, drawn beyond the rope's ends. Pattern ids are keyed on W, as
 * CordRope keys its own on w.
 */
export function PrimaryRope({
	x0,
	x1,
	y,
	W,
	paint,
	twist,
	structure,
	begin,
	term,
}: {
	x0: number;
	x1: number;
	y: number;
	W: number;
	paint: CordPaint;
	twist: string | null | undefined;
	structure: string | null | undefined;
	begin: BeginKind;
	term: TermKind;
}) {
	const ink = ropeInk(paint.base);
	const slant = slantOf(twist);
	const pat =
		paint.accent && paint.pattern === "barberpole"
			? `url(#${barberPatternId(paint.accent, twist, "horizontal", W)})`
			: paint.accent &&
					(paint.pattern === "mottled" || paint.pattern === "tweed")
				? `url(#${mottlePatternId(paint.accent, paint.pattern === "tweed", W)})`
				: null;
	const ply =
		structure === "B" || structure === "W"
			? undefined
			: plyPatternId(twist, "horizontal", W);
	const texture =
		structure === "B"
			? chevrons(x0, x1, y, W)
			: structure === "W"
				? bands(x0, x1, y, W)
				: null;
	// the ends: turned so "beyond the tip" points along −x at the beginning
	// and +x at the end, the light staying at the upper left, loops below
	const beginFrame: Frame = { w: W, ink, slant, lx: -1, ly: 1, side: 1 };
	const termFrame: Frame = { w: W, ink, slant, lx: 1, ly: -1, side: -1 };
	return (
		<g>
			<g strokeLinecap="round">
				<line
					x1={x0}
					x2={x1}
					y1={y}
					y2={y}
					stroke={ink.shade}
					strokeWidth={W + hairline(W, 0.28)}
				/>
				<line x1={x0} x2={x1} y1={y} y2={y} stroke={ink.base} strokeWidth={W} />
				{pat && (
					<line x1={x0} x2={x1} y1={y} y2={y} stroke={pat} strokeWidth={W} />
				)}
				{paint.accent && paint.pattern === "striped" && (
					<line
						x1={x0}
						x2={x1}
						y1={y + W * 0.22}
						y2={y + W * 0.22}
						stroke={paint.accent}
						strokeWidth={W * 0.32}
					/>
				)}
				{ply && (
					<line
						x1={x0}
						x2={x1}
						y1={y}
						y2={y}
						stroke={`url(#${ply})`}
						strokeWidth={W}
					/>
				)}
				{texture && (
					<g fill="none" strokeLinejoin="round">
						<path
							d={texture}
							stroke={ink.light}
							strokeWidth={hairline(W, 0.1)}
							strokeOpacity={0.55}
							transform={
								structure === "B"
									? `translate(${-W * 0.09} ${-W * 0.09})`
									: `translate(${-W * 0.13} 0)`
							}
						/>
						<path
							d={texture}
							stroke={ink.shade}
							strokeWidth={hairline(W, 0.12)}
							strokeOpacity={0.8}
						/>
					</g>
				)}
				<line
					x1={x0}
					x2={x1}
					y1={y - W * 0.24}
					y2={y - W * 0.24}
					stroke={ink.light}
					strokeWidth={W * 0.22}
					strokeOpacity={0.75}
				/>
			</g>
			<g transform={`translate(${x0} ${y}) rotate(90)`}>
				<EndGlyph kind={begin} f={beginFrame} paint={paint} primary />
			</g>
			<g transform={`translate(${x1} ${y}) rotate(-90)`}>
				<EndGlyph kind={term} f={termFrame} paint={paint} primary />
			</g>
		</g>
	);
}
