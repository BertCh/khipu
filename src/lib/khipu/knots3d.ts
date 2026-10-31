import { axisKind, knotDirs, slantOf } from "./anatomy";
import {
	arcTo,
	biarc,
	refine,
	tangentAt,
	type V,
	vadd,
	vdot,
	vnorm,
	vscale,
	vsub,
} from "./curve3d";
import type { Knot } from "./types";

/**
 * Parametric centerlines for the knots of a khipu, in the cord's own frame.
 *
 * Units are cord diameters (d = 1). The frame is right-handed with `y` running
 * *along the cord away from its attachment* (down a hanging pendant), `z`
 * toward the viewer (the recto face) and `x` to the viewer's right. A knot
 * begins at y = 0 on the cord's axis and ends at y = `length`, again on the
 * axis, so it can be spliced into any tube path.
 *
 * Direction follows the sources (see anatomy.ts): the strands crossing the
 * front face of an S knot lean `\`, of a Z knot `/`. In a helix around a
 * vertical axis that is its handedness: a left-handed helix shows `\` on
 * its near side whichever way it is traversed, so S = left-handed, Z =
 * right-handed, which is also how S- and Z-plied cords lie.
 *
 * The knots are the ones tied on khipus:
 * - The single knot is an overhand. Tightened, the working end has wrapped
 *   once around the standing part and the two exits lie on the axis; the
 *   visible diagonal on the face is that one wrap.
 * - The long knot is a multiple overhand (the end passed n times through
 *   its loop): n touching wraps around a straight core, with one strand
 *   running obliquely across the outside of the coil from one end to the
 *   other. The recorders' "axis" is which end that oblique strand leaves
 *   the coil toward: AXD, it enters the coil at the top and the straight
 *   strand is the lower one; AXU the reverse. LL doubles the core, BL adds
 *   a belt wrap around the finished coil, SP leaves the coil open.
 * - The figure-eight is left as an 8: two bights stacked along the cord with
 *   the cord entering through one bight's eye and leaving through the
 *   other's, crossing itself between them; the strand in front at the
 *   crossing leans with the recorded direction.
 */

export interface KnotPoint {
	x: number;
	y: number;
	z: number;
	/** radius multiplier for the tube at this point (1 = the plain cord) */
	r: number;
}

export interface KnotCurve {
	/** the cord itself, from (0,0,0) to (0,length,0) */
	points: KnotPoint[];
	/** extra strands that are not the cord's own path (fibre tufts) */
	extras: KnotPoint[][];
	/** distance along the cord's axis the knot occupies, in diameters */
	length: number;
	/** how far the knot bulges from the axis, in diameters */
	radius: number;
}

const TAU = Math.PI * 2;

/**
 * The wraps of a knot lean with the recorded direction: S `\\`, Z `/`.
 * In the coil below, h = +1 makes the front strands run up-and-left (`\\`).
 * Unknown → Z, the corpus majority.
 */
function hand(dir: string | undefined): 1 | -1 {
	return slantOf(dir) === 1 ? 1 : -1;
}

function smoothstep(t: number): number {
	const x = Math.max(0, Math.min(1, t));
	return x * x * (3 - 2 * x);
}

/* ---------------------------------------------------------------------------
   The coil family: single, long, double long, belted long, spiral
   --------------------------------------------------------------------------- */

interface CoilSpec {
	turns: number;
	hand: 1 | -1;
	/** the oblique strand is the entering one (the straight strand leaves at the far end: AXD) */
	obliqueAtEntry: boolean;
	/** helix radius (centerline), diameters */
	helixR: number;
	/** axial advance per turn, diameters */
	pitch: number;
	/** the core is two strands side by side */
	doubleCore: boolean;
	/** an extra wrap cinched around the outside at mid-height */
	belt: boolean;
	samplesPerTurn: number;
}

/**
 * One multiple-overhand knot, built as the axis-down case: the cord enters
 * along the axis, runs obliquely down the outside of the coil across its
 * front face, turns under the coil's far end into the wraps, wraps back up
 * around the core, turns in over the near end and leaves straight down the
 * core. The axis-up case is the same knot upside down: built with the
 * opposite hand and reflected, so its wraps still lean the recorded way.
 */
/**
 * Where the last wrap crests before diving into the core: this far round
 * past the wrap's end (radians, in the hand's sense), this high above the
 * coil, at this fraction of the helix radius, heading straight in. Chosen
 * so the transitions keep a bend radius about the cord's (checked in the
 * Node harness); an apex closer to the axis makes the dive too tight.
 */
const APEX_A = 1.2;
const APEX_Y = 0.4;
const APEX_R = 2.0;
const APEX_T = 1.0;
const DIVE_PULL = 0.6;
/**
 * The lead-in clears the axis before the dive reaches it: it runs out
 * toward the oblique's start, this far from the axis (LEAD_R) at this depth
 * (LEAD_Y), on one arc from the axis. The dive
 * reaches the axis CORE_IN below the coil's top.
 */
const LEAD_R = 0.5;
const LEAD_Y = 0.45;
const CORE_IN = 0.6;

function coil(spec: CoilSpec): KnotCurve {
	if (!spec.obliqueAtEntry) {
		const flipped = coil({
			...spec,
			obliqueAtEntry: true,
			hand: spec.hand === 1 ? -1 : 1,
		});
		const L = flipped.length;
		const flip = (p: KnotPoint): KnotPoint => ({
			x: p.x,
			y: L - p.y,
			z: p.z,
			r: p.r,
		});
		return {
			points: flipped.points.map(flip).reverse(),
			extras: flipped.extras.map((e) => e.map(flip)),
			length: L,
			radius: flipped.radius,
		};
	}
	const { turns, hand: h, helixR: R, pitch, samplesPerTurn } = spec;
	const coilH = turns * pitch;
	const lead = 1.3;
	const top = lead;
	const bottom = lead + coilH;
	const length = coilH + 2 * lead;
	const pts: KnotPoint[] = [];
	const P = (x: number, y: number, z: number, r = 1) =>
		pts.push({ x, y, z, r });
	const bend = (from: KnotPoint, to: KnotPoint, n = 4) => {
		for (let i = 1; i < n; i++) {
			const t = smoothstep(i / n);
			P(
				from.x + (to.x - from.x) * t,
				from.y + (to.y - from.y) * t,
				from.z + (to.z - from.z) * t,
				from.r + (to.r - from.r) * t,
			);
		}
	};
	const push = (q: KnotPoint[]) => {
		for (const p of q) pts.push(p);
	};
	const last = (): V => {
		const p = pts[pts.length - 1];
		return [p.x, p.y, p.z];
	};
	// a point at angle a round the axis (0 = front, increasing turns toward
	// −h·x, the sense the wraps run in as they climb)
	const on = (a: number, y: number, radius: number): V => [
		-h * radius * Math.sin(a),
		y,
		radius * Math.cos(a),
	];

	// The oblique strand crosses the front face from angle −a0 at the top
	// toward +a0 at the bottom (a0 short of a quarter turn), lying on the
	// wraps: its axis a cord's width outside theirs, hugging in a little
	// mid-way. It stops short of +a0 and the wraps start past it, since the
	// turn from one to the other is an S a cord's width across, and an S
	// between parallel runs only bends as gently as it is long.
	const a0 = 0.42 * Math.PI;
	const obliqueR = R + 1.0;
	const gap = 0.7;
	const wrapStart = a0 + gap;
	const oblique = (t: number): V =>
		on(
			-a0 + (2 * a0 - gap) * t,
			top + 0.05 + (coilH + 0.1) * t,
			obliqueR - 0.12 * Math.sin(Math.PI * t),
		);
	const wrap = (t: number): V =>
		on(wrapStart + TAU * turns * t, bottom - coilH * t, R);

	// Every transition is a biarc: it leaves one piece along its tangent and
	// arrives at the next along its tangent, so the strand never kinks and
	// its bends have a definite radius, kept to at least the cord's own.

	// The strand that dives into the core comes over the near end from the
	// apex, where the last wrap crests, and passes the lead-in on its way
	// down: the lead-in runs out toward the oblique first, so the dive
	// finds the axis clear (drawn down the axis, the two ran together).
	const endAngle = wrapStart + TAU * turns;
	const apexAngle = endAngle + APEX_A;
	const out = vnorm([oblique(0)[0], 0, oblique(0)[2]]);

	// lead in: one arc out toward the oblique's start, then down onto it
	const leadTo: V = [out[0] * LEAD_R, LEAD_Y, out[2] * LEAD_R];
	P(0, 0, 0);
	push(arcTo([0, 0, 0], [0, 1, 0], leadTo, 1, 1));
	// the arc's direction where it ends: its start direction reflected in the chord
	const chord = vnorm(leadTo);
	const leadT = vsub(vscale(chord, 2 * chord[1]), [0, 1, 0]);
	push(biarc(leadTo, leadT, oblique(0), tangentAt(oblique, 0)));
	{
		const n = Math.max(
			10,
			Math.round(samplesPerTurn * 0.75 * Math.max(1, turns * 0.6)),
		);
		for (let i = 1; i <= n; i++) {
			const p = oblique(i / n);
			P(p[0], p[1], p[2]);
		}
	}
	// under the far end into the first wrap: a U a cord's width across,
	// from the outside of the coil in to the helix
	push(biarc(last(), tangentAt(oblique, 1), wrap(0), tangentAt(wrap, 0)));
	{
		const n = Math.round(samplesPerTurn * turns);
		for (let i = 1; i <= n; i++) {
			const p = wrap(i / n);
			P(p[0], p[1], p[2]);
		}
	}
	// over the near end into the core: the last wrap climbs on round and in
	// to an apex a cord's width above the coil, then dives down the middle
	{
		const side = spec.doubleCore ? 0.26 : 0;
		const coreR = spec.doubleCore ? 0.92 : 1;
		const apex = on(apexAngle, top - APEX_Y, R * APEX_R);
		// heading in, and still round with the helix: the crest over the rim
		const inward = vnorm(vsub([side, 0, 0], [apex[0], 0, apex[2]]));
		const around = vnorm(tangentAt(wrap, 1));
		const apexT = vnorm(vadd(inward, vscale(around, APEX_T)));
		push(biarc(last(), tangentAt(wrap, 1), apex, apexT));
		// down past the lead-in onto the axis: a cubic from the apex, heading
		// in, to the core, heading down, pulled long at both ends so the dive
		// only reaches the axis well below where the lead-in turns out
		const coreTop = top + CORE_IN;
		const core: V = [side, coreTop, 0];
		const span = Math.sqrt(vdot(vsub(core, apex), vsub(core, apex)));
		const b1 = vadd(apex, vscale(apexT, DIVE_PULL * span));
		const b2 = vsub(core, [0, DIVE_PULL * span, 0]);
		const dive = (t: number): V => {
			const u = 1 - t;
			return vadd(
				vadd(vscale(apex, u * u * u), vscale(b1, 3 * u * u * t)),
				vadd(vscale(b2, 3 * u * t * t), vscale(core, t * t * t)),
			);
		};
		{
			const n = 8;
			for (let i = 1; i <= n; i++) {
				const p = dive(i / n);
				P(p[0], p[1], p[2], 1 + (coreR - 1) * (i / n));
			}
		}
		const n = Math.max(3, Math.round(turns * 2));
		for (let i = 1; i <= n; i++)
			P(side, coreTop + (bottom - 0.05 - coreTop) * (i / n), 0, coreR);
		bend(pts[pts.length - 1], { x: 0, y: length - lead * 0.45, z: 0, r: 1 }, 4);
	}
	P(0, length - lead * 0.45, 0);
	P(0, length, 0);

	const extras: KnotPoint[][] = [];
	if (spec.doubleCore) {
		// the second strand of the core lies beside the first
		const strand: KnotPoint[] = [];
		const n = Math.max(3, Math.round(turns * 2));
		for (let i = 0; i <= n; i++)
			strand.push({
				x: -0.26,
				y: top + 0.05 + (coilH - 0.1) * (i / n),
				z: 0.02,
				r: 0.92,
			});
		extras.push(strand);
	}
	if (spec.belt) {
		// a wrap cinched round the outside of the coil at mid-height
		const n = samplesPerTurn + 4;
		const belt: KnotPoint[] = [];
		const y = (top + bottom) / 2;
		for (let i = 0; i <= n; i++) {
			const a = (i / n) * TAU * 1.12;
			belt.push({
				x: -h * (R + 1.0) * Math.sin(a),
				y: y - 0.2 + 0.4 * (i / n),
				z: (R + 1.0) * Math.cos(a),
				r: 0.85,
			});
		}
		extras.push(belt);
	}
	return { points: pts, extras, length, radius: R + 1.5 };
}

/**
 * One overhand knot: the coil with a single wrap. Its one wrap is nearly
 * level; the diagonal a recorder sights on a single knot is the oblique
 * strand, which runs against the wraps, so the hand is reversed here to
 * put that strand on the recorded lean.
 */
function single(dir: string | undefined): KnotCurve {
	return coil({
		turns: 1,
		hand: hand(dir) === 1 ? -1 : 1,
		obliqueAtEntry: true,
		helixR: 0.78,
		pitch: 1.4,
		doubleCore: false,
		belt: false,
		samplesPerTurn: 16,
	});
}

/** A cluster of `n` single knots, stacked along the cord with a gap. */
function singleCluster(knot: Knot): KnotCurve {
	const dirs = knotDirs(knot);
	const gap = 0.7;
	const points: KnotPoint[] = [];
	let y = 0;
	let radius = 0;
	for (let i = 0; i < dirs.length; i++) {
		const one = single(dirs[i]);
		radius = Math.max(radius, one.radius);
		// each knot starts on the axis where the gap before it ends (its
		// first point too: the lead-in's arc leaves along the axis from it)
		for (const p of one.points) points.push({ ...p, y: p.y + y });
		y += one.length;
		if (i < dirs.length - 1) y += gap;
	}
	return { points, extras: [], length: y, radius };
}

function longKnot(knot: Knot, up: boolean): KnotCurve {
	const turns = Math.max(1, Math.round(knot.n || 1));
	const axis = axisKind(knot);
	// axis down: the oblique strand is at the top, nearer the attachment; a
	// top cord's attachment is at the other end, so `up` flips it
	const obliqueAtEntry = axis == null ? true : (axis === "down") !== up;
	const variant = knot.type;
	return coil({
		turns,
		hand: hand(knotDirs(knot)[0]),
		obliqueAtEntry,
		helixR: variant === "SP" ? 1.05 : variant === "LL" ? 0.95 : 0.85,
		pitch: variant === "SP" ? 1.6 : 1.0,
		doubleCore: variant === "LL",
		belt: variant === "BL",
		samplesPerTurn: 16,
	});
}

/* ---------------------------------------------------------------------------
   Figure-eight
   --------------------------------------------------------------------------- */

/**
 * Tied as it is on a cord: a bight is twisted a full turn (two crossings)
 * and the working end passed back through its eye. Left loose, as khipu
 * figure-eights are, that reads as an 8: the upper lobe is the space
 * between the two crossings of the twisted pair, the lower lobe is the eye,
 * and the working end runs diagonally down the outside of the twist and
 * through the eye. That diagonal is the strand the recorders sight: it
 * leans `\\` on an S knot, `/` on a Z. EE twists the bight twice.
 */
function figureEight(dir: string | undefined, double: boolean): KnotCurve {
	const s = slantOf(dir) || -1; // unknown → Z
	const w = 1.05; // half the separation of the twisted pair
	const wz = 0.5; // how far the strands pass in front of / behind each other
	const halfTwists = double ? 4 : 2;
	const twistH = halfTwists * 1.5;
	const Re = 0.98; // eye radius (centerline)
	const lead = 0.8;
	const top = lead;
	const bottom = top + twistH;
	const eyeC = bottom + Re * 0.9; // eye centre
	const tail = 1.0; // below the eye, back to the axis
	const length = eyeC + Re + tail;
	const pts: KnotPoint[] = [];
	const push = (q: KnotPoint[]) => {
		for (const p of q) pts.push(p);
	};
	const last = (): V => {
		const p = pts[pts.length - 1];
		return [p.x, p.y, p.z];
	};
	const sample = (f: (t: number) => V, t0: number, t1: number, n: number) => {
		for (let i = 1; i <= n; i++) {
			const p = f(t0 + ((t1 - t0) * i) / n);
			pts.push({ x: p[0], y: p[1], z: p[2], r: 1 });
		}
	};
	// the working end leaves the twist at the top on the side its diagonal
	// starts from: left for `\\` (S), right for `/` (Z); the standing part
	// enters on the other side
	const bSide = s === 1 ? -1 : 1;
	const aSide = -bSide;
	// a strand of the twisted pair at fraction t down it: it starts on
	// `side` and turns halfTwists times round the pair's axis
	const twist =
		(side: number) =>
		(t: number): V => [
			side * w * Math.cos(Math.PI * halfTwists * t),
			top + twistH * t,
			side * wz * Math.sin(Math.PI * halfTwists * t) * -s,
		];
	const A = twist(aSide);
	const B = twist(bSide);
	// the eye, a loop below the twist tipped forward at the bottom so the
	// working end can pass through it and down behind it
	const from = aSide < 0 ? Math.PI : 0; // angle round the eye centre, 0 = right
	const to = from + (aSide < 0 ? -Math.PI : Math.PI);
	const eye = (t: number): V => {
		const ang = from + (to - from) * t;
		return [
			Re * Math.cos(ang),
			eyeC + Re * Math.abs(Math.sin(ang)),
			0.15 + 0.25 * Math.sin(Math.PI * t),
		];
	};
	// the working end's diagonal down the front of the twist, clear of it
	const dz = wz + 1.0;
	const x0 = B(0)[0] * 0.95;
	const x1 = -B(0)[0] * 0.35;
	const diag = (t: number): V => [
		x0 + (x1 - x0) * t,
		top - 0.35 + (twistH + 0.5) * t,
		dz - 0.1 * Math.sin(Math.PI * t),
	];

	// Pieces joined by biarcs, each leaving one along its tangent and
	// arriving at the next along its own: no corners for the renderer to
	// crease.
	pts.push({ x: 0, y: 0, z: 0, r: 1 });
	// the standing part enters the twisted pair
	push(biarc([0, 0, 0], [0, 1, 0], A(0), tangentAt(A, 0)));
	sample(A, 0, 1, 9 * halfTwists);
	// round the eye: from A's bottom, down and round to B's bottom
	push(biarc(last(), tangentAt(A, 1), eye(0), tangentAt(eye, 1e-3)));
	sample(eye, 0, 1, 14);
	push(
		biarc(last(), tangentAt(eye, 1 - 1e-3), B(1), vscale(tangentAt(B, 1), -1)),
	);
	// strand B climbs back up the twist
	sample(B, 1, 0, 9 * halfTwists);
	// over the top and down the front: the working end's diagonal
	push(biarc(last(), vscale(tangentAt(B, 0), -1), diag(0), tangentAt(diag, 0)));
	sample(diag, 0, 1, 8);
	// back through the eye, down behind its bottom and out along the axis
	const through: V = [x1 * 0.4, eyeC + 0.1, 0.2];
	const throughT = vnorm([0, 0.6, -1]);
	const behind: V = [0, eyeC + Re, eye(0.5)[2] - 1.0];
	push(biarc(last(), tangentAt(diag, 1), through, throughT));
	push(biarc(through, throughT, behind, [0, 1, 0]));
	push(biarc(behind, [0, 1, 0], [0, length, 0], [0, 1, 0]));
	return { points: pts, extras: [], length, radius: w + 1.1 };
}

/* ---------------------------------------------------------------------------
   Tufted and unidentified
   --------------------------------------------------------------------------- */

/** A single knot with loose fibre ends standing out of it. */
function tufted(knot: Knot): KnotCurve {
	const base = single(knotDirs(knot)[0]);
	const mid = base.length / 2;
	const extras: KnotPoint[][] = [];
	for (const [fx, fz] of [
		[-0.7, 0.5],
		[0.2, 0.9],
		[0.75, 0.2],
		[-0.3, -0.8],
	]) {
		const strand: KnotPoint[] = [];
		for (let i = 0; i <= 5; i++) {
			const t = i / 5;
			strand.push({
				x: fx * 0.4 + fx * 1.6 * t,
				y: mid - 0.2 - 1.2 * t + 0.25 * Math.sin(t * 5 + fx),
				z: fz * 0.4 + fz * 1.6 * t,
				r: 0.32 * (1 - t * 0.5),
			});
		}
		extras.push(strand);
	}
	return { ...base, extras };
}

/** Recorded but not identified: a loose open loop. */
function unidentified(): KnotCurve {
	// one loose turn out to the side and round the front, opening and
	// closing gently so it bends no tighter than the cord is thick
	const points: KnotPoint[] = [];
	const n = 40;
	const length = 2.8;
	const R = 0.9;
	for (let i = 0; i <= n; i++) {
		const t = i / n;
		const env = Math.sin(Math.PI * t) ** 2;
		const a = TAU * t;
		points.push({
			x: R * Math.sin(a) * env,
			y: length * t,
			z: 0.7 * R * (1 - Math.cos(a)) * env,
			r: 1,
		});
	}
	return { points, extras: [], length, radius: 1.6 };
}

/* ---------------------------------------------------------------------------
   Entry point
   --------------------------------------------------------------------------- */

const cache = new Map<string, KnotCurve>();

/**
 * The bend allowed between consecutive samples once a curve is built (see
 * curve3d.ts): the wraps of a coil, sampled at 16 a turn, are split in two;
 * the straight core and the lead-ins are not.
 */
const MAX_TURN = (13 * Math.PI) / 180;

/**
 * The centerline of a recorded knot cluster. `up` for cords that run toward
 * the viewer's top (top cords), which flips which end of a long knot counts
 * as its top.
 */
export function knotCurve(knot: Knot, up = false): KnotCurve {
	const key = `${knot.type}|${knot.n}|${knot.dir}|${knot.axis ?? ""}|${up ? 1 : 0}`;
	let c = cache.get(key);
	if (c) return c;
	switch (knot.type) {
		case "S":
			c = singleCluster(knot);
			break;
		case "E":
		case "EE":
			c = figureEight(knotDirs(knot)[0], knot.type === "EE");
			break;
		case "TF":
			c = tufted(knot);
			break;
		case "U":
			c = unidentified();
			break;
		default:
			c = longKnot(knot, up);
	}
	c = {
		...c,
		points: refine(c.points, MAX_TURN),
		extras: c.extras.map((e) => refine(e, MAX_TURN)),
	};
	cache.set(key, c);
	return c;
}

/** A stopper knot for a knotted cord end: one overhand. */
export function stopperCurve(): KnotCurve {
	return knotCurve({ type: "S", n: 1, dir: "U", pos: 0 });
}
