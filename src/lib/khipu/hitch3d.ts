import type { AttachKind } from "./anatomy";
import {
	biarc,
	refine,
	run,
	tangentAt,
	type V,
	vadd,
	vnorm,
	vscale,
	vsub,
} from "./curve3d";
import type { KnotPoint } from "./knots3d";

/**
 * How a cord is hitched to the cord it hangs from, as one continuous
 * centerline in the hanging cord's own frame: units of its diameter, `y`
 * running down the cord away from the attachment (y = 0 where the plain
 * body begins, the hitch above it at negative y), `z` toward the viewer, `x`
 * along the carrying cord to the viewer's right. The carrying cord is a
 * cylinder of radius `R` (in the same units) along x, centred on the axis
 * at y = −(R + 1.55).
 *
 * The attachment is a half-hitch made with the cord's own doubled end: the
 * eye at the fold is spread open, its two arms go over the carrier and
 * pass either side of the body, and the fold crosses it, so the body is
 * choked by its own end. The curve is traced from the free end to the
 * body, so it finishes at y = 0 running down the cord and the body carries
 * straight on from it: the end lies on the carrier's lower face, rises over
 * the top, down the far face, comes forward under the carrier beside the
 * body (arm B), crosses it at the fold, goes back on the other side (arm
 * A), up the far face, over the top, and down the near face into the body.
 *
 * - recto: the body rises over the FRONT face; the arms return under from
 *   the back and the fold crosses in front of the body — a small collar
 *   below the carrier.
 * - verso: the same hitch seen from behind: the body rises behind, the arms
 *   come down the FRONT face as a V and the fold crosses behind the body.
 * - overhand: tied on with an overhand knot instead: the body rises in
 *   front, goes round the carrier once and knots on itself.
 * - unknown: a plain round turn, no eye, so nothing is claimed.
 *
 * Every piece is an arc — on the carrier, round the body — or a biarc
 * between them, so the strand never bends tighter than about its own
 * thickness (the renderer flattens anything tighter; see Packer.addStream).
 */
export interface HitchCurve {
	points: KnotPoint[];
	/** the doubled end lies side by side: strands are this much thinner */
	strandR: number;
}

const cache = new Map<string, HitchCurve>();

/** the bend allowed between samples after refinement (see curve3d.ts) */
const MAX_TURN = (13 * Math.PI) / 180;

export function hitchCurve(kind: AttachKind, R: number): HitchCurve {
	const key = `${kind}|${R.toFixed(3)}`;
	const hit = cache.get(key);
	if (hit) return hit;
	const built = build(kind, R);
	const c = { ...built, points: untilBody(refine(built.points, MAX_TURN)) };
	cache.set(key, c);
	return c;
}

/**
 * A subsidiary's hitch on its parent, which hangs the same way it does. In
 * the subsidiary's frame (y down the cord from y = 0 where the body starts,
 * z toward the viewer, x to the viewer's right) the parent is a vertical
 * cylinder of radius `R` whose axis passes through (−side·(R + 0.55), ·, 0):
 * the body hangs beside it, on the right when `side` is +1. The doubled end
 * rings the parent twice just above the body's start and the body rises
 * into the lower turn over the parent's front on recto, behind it on
 * verso; a round turn (one ring) when the hitch is not recorded. Traced,
 * like the pendant's, from the free end to the body.
 */
export function subsidiaryHitchCurve(
	kind: AttachKind,
	R: number,
	side: 1 | -1,
): HitchCurve {
	const key = `sub|${kind}|${R.toFixed(3)}|${side}`;
	const hit = cache.get(key);
	if (hit) return hit;
	const built = buildSubsidiary(kind, R, side);
	const c = { ...built, points: untilBody(refine(built.points, MAX_TURN)) };
	cache.set(key, c);
	return c;
}

/**
 * The curve without its last point, which is the body's first (0, 0, 0):
 * the body is emitted from there, and a sample drawn twice leaves a
 * zero-length step the renderer skips, so the rings either side of it
 * would not meet (a thin crack round the cord).
 */
function untilBody(points: KnotPoint[]): KnotPoint[] {
	return points.slice(0, -1);
}

/** Collects a traced curve, piece by piece. */
class Trace {
	pts: KnotPoint[] = [];
	start(p: V, r: number): void {
		this.pts.push({ x: p[0], y: p[1], z: p[2], r });
	}
	add(q: KnotPoint[]): void {
		for (const p of q) this.pts.push(p);
	}
	get last(): V {
		const p = this.pts[this.pts.length - 1];
		return [p.x, p.y, p.z];
	}
	get r(): number {
		return this.pts[this.pts.length - 1].r;
	}
}

function buildSubsidiary(
	kind: AttachKind,
	R: number,
	side: 1 | -1,
): HitchCurve {
	const strandR = 0.9;
	const ring = R + 0.55; // radius of a strand lying round the parent
	const cx = -side * ring; // parent axis (the body is on the ring at x = 0)
	const yr = -1.3; // height of the lower turn
	const pitch = 0.95; // rise per turn: the turns lie side by side
	const face = kind === "verso" ? -1 : 1; // the body rises over this face
	const turns = kind === "recto" || kind === "verso" ? 2 : 1;
	// a point on the ring round the parent, angle 0 = toward the body (+side
	// x), positive angles toward the face the body rises over; the turns
	// climb as the angle grows
	const a0 = 0.95; // where the body meets the ring
	const on = (a: number): V => {
		const y = yr - (pitch * (a - a0)) / (2 * Math.PI);
		return [cx + side * ring * Math.cos(a), y, face * ring * Math.sin(a)];
	};
	const t = new Trace();
	const aEnd = a0 + 2 * Math.PI * turns - 0.9;
	t.start(on(aEnd), 0.5);
	// the free end tapers in over the first half turn
	const aFull = aEnd - 2.2;
	t.add(run(on, aEnd, aFull, 0.5, strandR));
	t.add(run(on, aFull, a0, strandR, strandR));
	// down off the ring into the body, running straight down from y = 0
	t.add(
		biarc(
			t.last,
			vscale(tangentAt(on, a0), -1),
			[0, 0, 0],
			[0, 1, 0],
			strandR,
			1,
		),
	);
	return { points: t.pts, strandR };
}

function build(kind: AttachKind, R: number): HitchCurve {
	const strandR = 0.9;
	const clear = R + 0.55; // orbit radius of a strand lying on the carrier
	const yp = -(R + 1.55); // carrier axis
	const xa = -0.46; // arm A's side offset (the body's side over the carrier)
	const xb = 0.46;
	// a point on the orbit round the carrier at angle a (0 = front, π/2 =
	// top, π = back, going over the top as a grows), at side offset x
	const orbit = (a: number, x: number): V => [
		x,
		yp - clear * Math.sin(a),
		clear * Math.cos(a),
	];
	// the direction of travel there, a growing (dir +1) or shrinking (−1)
	const along = (a: number, dir: number): V => [
		0,
		-dir * Math.cos(a),
		-dir * Math.sin(a),
	];

	// The body leaves the near face below the front and runs down into the
	// cord as an S: first away from the carrier, then down the cord's axis.
	const aBody = -0.3;
	const body = biarc(
		orbit(aBody, xa),
		along(aBody, -1),
		[0, 0, 0],
		[0, 1, 0],
		strandR,
		1,
	);

	const t = new Trace();
	if (kind === "unknown") {
		// a round turn: the end lies on the front face beside the body, runs
		// under the carrier clear of it, up the back, over the top and down
		// the front into the body
		const xe = 0.62;
		const xu = 1.0;
		const aTip = -0.55;
		const f = (a: number): V => {
			// sideways as it goes round: out past the body under the carrier,
			// back in to the body's side by the top
			const u = (aTip - a) / (aTip - aBody + 2 * Math.PI);
			const x =
				u < 0.3
					? xe + (xu - xe) * Math.sin((Math.PI / 2) * (u / 0.3))
					: xu +
						(xa - xu) * (0.5 - 0.5 * Math.cos((Math.PI * (u - 0.3)) / 0.7));
			return orbit(a, x);
		};
		t.start(f(aTip), 0.5);
		t.add(run(f, aTip, aTip - 0.8, 0.5, 1));
		t.add(run(f, aTip - 0.8, aBody - 2 * Math.PI, 1, 1));
		t.add(body.map((p) => ({ ...p, r: Math.max(p.r, 1) })));
		return { points: t.pts, strandR: 1 };
	}

	// the fold: half a ring round the front of the body where it leaves the
	// carrier, in the plane square to it, from its right side to its left
	const ring = 0.92; // centreline radius round the body (pulled tight)
	const yc = -0.7;
	let k = 1;
	for (let i = 2; i < body.length - 1; i++)
		if (Math.abs(body[i].y - yc) < Math.abs(body[k].y - yc)) k = i;
	const C: V = [body[k].x, body[k].y, body[k].z];
	const up = vnorm(
		vsub(
			[body[k - 1].x, body[k - 1].y, body[k - 1].z],
			[body[k + 1].x, body[k + 1].y, body[k + 1].z],
		),
	);
	const ex = vnorm(vsub([1, 0, 0], vscale(up, up[0])));
	// forward, square to the body: ex × up points toward −z for a body
	// running up (−y), so take up × ex
	const ez: V = [
		up[1] * ex[2] - up[2] * ex[1],
		up[2] * ex[0] - up[0] * ex[2],
		up[0] * ex[1] - up[1] * ex[0],
	];
	const fold = (phi: number): V =>
		vadd(
			C,
			vadd(vscale(ex, ring * Math.cos(phi)), vscale(ez, ring * Math.sin(phi))),
		);
	const foldT = (phi: number): V =>
		vadd(vscale(ex, -Math.sin(phi)), vscale(ez, Math.cos(phi)));
	// where the arms leave the carrier's far face, below the back
	const aArm = Math.PI + 0.75;

	if (kind === "overhand") {
		// the end lies behind the fold on the right, comes forward into it, crosses
		// the body and goes back up over the carrier as the body's own turn
		const tip = vadd(fold(0), [0.1, 0.6, -1.3]);
		t.start(tip, 0.5);
		t.add(biarc(tip, vnorm([0, -0.3, 1]), fold(0), foldT(0), 0.5, strandR));
	} else {
		// arm B: the end lies on the carrier's front face, rises over the top
		// and down the back, and comes forward under it to the fold
		const aTip = -0.25;
		const aFull = 0.45;
		t.start(orbit(aTip, xb), 0.5);
		t.add(run((a) => orbit(a, xb), aTip, aFull, 0.5, strandR));
		t.add(run((a) => orbit(a, xb), aFull, aArm, strandR, strandR));
		t.add(biarc(t.last, along(aArm, 1), fold(0), foldT(0), strandR, strandR));
	}
	// the fold crosses the body's face, and arm A goes back under the
	// carrier on the other side, up the far face, over the top and down the
	// near face into the body
	t.add(run(fold, 0, Math.PI, strandR, strandR, 0.25));
	t.add(
		biarc(
			t.last,
			foldT(Math.PI),
			orbit(aArm, xa),
			along(aArm, -1),
			strandR,
			strandR,
		),
	);
	t.add(run((a) => orbit(a, xa), aArm, aBody, strandR, strandR));
	t.add(body);
	// verso is the same hitch from behind: turned half round the cord
	const pts =
		kind === "verso" ? t.pts.map((p) => ({ ...p, x: -p.x, z: -p.z })) : t.pts;
	return { points: pts, strandR: kind === "overhand" ? 1 : strandR };
}
