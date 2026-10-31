import type { KnotPoint } from "./knots3d";

/**
 * Adaptive refinement of a parametric centerline (a knot, hitch or end
 * curve in cord diameters). The renderer extrudes a straight tube between
 * consecutive samples, so a helix drawn at 16 samples a turn shows as a
 * stack of short cylinders creased 22° at every joint. Rather than sample
 * every curve more densely — knots are already two thirds of a scene's
 * segments — this splits only the segments that actually turn: each is
 * divided until the bend at its ends is under `maxTurn`, and the new
 * samples are placed on a centripetal Catmull-Rom spline through the
 * originals, so a coarse helix rounds out instead of gaining more
 * corners. Straight runs (a long knot's core, a lead-in) are left alone.
 *
 * Endpoints are kept exactly: a knot still begins and ends on the cord's
 * axis where the body is spliced to it.
 */
export function refine(points: KnotPoint[], maxTurn: number): KnotPoint[] {
	// one subdivision of a sharp corner leaves most of its turn near the
	// apex, so go round until every joint is under the limit
	let out = points;
	for (let pass = 0; pass < 6; pass++) {
		const next = refineOnce(out, maxTurn);
		if (next.length === out.length) break;
		out = next;
	}
	return out;
}

function refineOnce(points: KnotPoint[], maxTurn: number): KnotPoint[] {
	// drop coincident samples: they carry no direction and would put a
	// division by zero into the spline's parameterisation
	const src: KnotPoint[] = [];
	for (const p of points) {
		const q = src[src.length - 1];
		if (q && dist(p, q) < 1e-6) src[src.length - 1] = p;
		else src.push(p);
	}
	const n = src.length;
	if (n < 3) return src;
	// turning angle at each interior sample
	const turn = new Float64Array(n);
	for (let i = 1; i < n - 1; i++) {
		const a = src[i - 1];
		const b = src[i];
		const c = src[i + 1];
		const ux = b.x - a.x;
		const uy = b.y - a.y;
		const uz = b.z - a.z;
		const vx = c.x - b.x;
		const vy = c.y - b.y;
		const vz = c.z - b.z;
		const cos =
			(ux * vx + uy * vy + uz * vz) /
			(Math.sqrt(ux * ux + uy * uy + uz * uz) *
				Math.sqrt(vx * vx + vy * vy + vz * vz));
		turn[i] = Math.acos(Math.max(-1, Math.min(1, cos)));
	}
	const out: KnotPoint[] = [];
	for (let i = 0; i < n - 1; i++) {
		const p1 = src[i];
		const p2 = src[i + 1];
		out.push(p1);
		let k = Math.ceil(Math.max(turn[i], turn[i + 1]) / maxTurn - 0.05);
		// a long leg meeting a short one at a bend leaves the ring there no
		// room to tilt on the short side (see Packer.addStream): split it to
		// about twice its neighbour across the bend
		const len = dist(p1, p2);
		if (i > 0 && turn[i] > 0.02)
			k = Math.max(k, Math.ceil(len / (2 * dist(src[i - 1], p1)) - 0.05));
		if (i + 2 < n && turn[i + 1] > 0.02)
			k = Math.max(k, Math.ceil(len / (2 * dist(p2, src[i + 2])) - 0.05));
		if (k < 2) continue;
		// neighbours for the spline, mirrored past the ends of the curve
		const p0 = i > 0 ? src[i - 1] : mirror(p1, p2);
		const p3 = i + 2 < n ? src[i + 2] : mirror(p2, p1);
		const t0 = 0;
		const t1 = t0 + Math.sqrt(dist(p0, p1));
		const t2 = t1 + Math.sqrt(dist(p1, p2));
		const t3 = t2 + Math.sqrt(dist(p2, p3));
		for (let j = 1; j < k; j++) {
			const t = t1 + ((t2 - t1) * j) / k;
			// Barry–Goldman evaluation of the centripetal Catmull-Rom segment
			const a1 = lerp(p0, p1, (t - t0) / (t1 - t0));
			const a2 = lerp(p1, p2, (t - t1) / (t2 - t1));
			const a3 = lerp(p2, p3, (t - t2) / (t3 - t2));
			const b1 = lerp(a1, a2, (t - t0) / (t2 - t0));
			const b2 = lerp(a2, a3, (t - t1) / (t3 - t1));
			out.push(lerp(b1, b2, (t - t1) / (t2 - t1)));
		}
	}
	out.push(src[n - 1]);
	return out;
}

function dist(a: KnotPoint, b: KnotPoint): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	const dz = a.z - b.z;
	return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function lerp(a: KnotPoint, b: KnotPoint, t: number): KnotPoint {
	return {
		x: a.x + (b.x - a.x) * t,
		y: a.y + (b.y - a.y) * t,
		z: a.z + (b.z - a.z) * t,
		r: a.r + (b.r - a.r) * t,
	};
}

/** `a` reflected through `b`: a phantom neighbour beyond the curve's end. */
function mirror(a: KnotPoint, b: KnotPoint): KnotPoint {
	return { x: 2 * a.x - b.x, y: 2 * a.y - b.y, z: 2 * a.z - b.z, r: a.r };
}

/* ---------------------------------------------------------------------------
   Arcs: the pieces the knot and hitch designs are built from
   --------------------------------------------------------------------------- */

export type V = [number, number, number];
export const vsub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vadd = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vscale = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
export const vdot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vnorm = (a: V): V => {
	const l = Math.sqrt(vdot(a, a)) || 1;
	return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * A circular arc leaving P along T and ending at Q, sampled about every
 * 15°: the interior points and Q. A straight run when Q lies along T.
 */
export function arcTo(P: V, T: V, Q: V, rP: number, rQ: number): KnotPoint[] {
	const c = vsub(Q, P);
	const L = Math.sqrt(vdot(c, c));
	const out: KnotPoint[] = [];
	if (L < 1e-9) return out;
	const ch = vscale(c, 1 / L);
	const cosHalf = Math.max(-1, Math.min(1, vdot(ch, T)));
	const half = Math.acos(cosHalf);
	const k = Math.max(2, Math.round((2 * half) / 0.26));
	if (half < 1e-3 || half > Math.PI - 1e-3) {
		for (let i = 1; i <= k; i++) {
			const t = i / k;
			out.push({
				x: P[0] + c[0] * t,
				y: P[1] + c[1] * t,
				z: P[2] + c[2] * t,
				r: rP + (rQ - rP) * t,
			});
		}
		return out;
	}
	const rho = L / (2 * Math.sin(half));
	const n = vnorm(vsub(ch, vscale(T, cosHalf)));
	const C = vadd(P, vscale(n, rho));
	const e1 = vsub(P, C);
	const e2 = vscale(T, rho);
	for (let i = 1; i <= k; i++) {
		const t = i / k;
		const phi = 2 * half * t;
		const p = vadd(
			C,
			vadd(vscale(e1, Math.cos(phi)), vscale(e2, Math.sin(phi))),
		);
		out.push({ x: p[0], y: p[1], z: p[2], r: rP + (rQ - rP) * t });
	}
	return out;
}

/**
 * Two circular arcs joining P0 (leaving along T0) to P1 (arriving along
 * T1), tangent to each other where they meet: the classic biarc, with the
 * two tangent lengths equal. Arcs are the tightest a cord can be bent
 * without kinking, so a transition built this way has a definite bend
 * radius to check against the cord's thickness.
 */
export function biarc(P0: V, T0: V, P1: V, T1: V, r0 = 1, r1 = 1): KnotPoint[] {
	const v = vsub(P1, P0);
	const vv = vdot(v, v);
	if (vv < 1e-12) return [];
	const tt = vdot(T0, T1);
	const vt = vdot(v, vadd(T0, T1));
	const denom = 2 * (1 - tt);
	let d: number;
	if (Math.abs(denom) < 1e-6) {
		const vT = vdot(v, T0);
		d = Math.abs(vT) < 1e-9 ? Math.sqrt(vv) / 2 : vv / (4 * vT);
	} else d = (-vt + Math.sqrt(vt * vt + denom * vv)) / denom;
	if (!(d > 0)) d = Math.sqrt(vv) / 4;
	const J = vscale(vadd(vadd(P0, vscale(T0, d)), vsub(P1, vscale(T1, d))), 0.5);
	const rJ = (r0 + r1) / 2;
	const first = arcTo(P0, T0, J, r0, rJ);
	// the first arc's tangent at J: T0 reflected in the chord
	const ch = vnorm(vsub(J, P0));
	const TJ = vsub(vscale(ch, 2 * vdot(ch, T0)), T0);
	return first.concat(arcTo(J, TJ, P1, rJ, r1));
}

/** The direction a sampled curve runs in at parameter t. */
export function tangentAt(f: (t: number) => V, t: number): V {
	const e = 1e-4;
	return vnorm(vsub(f(t + e), f(t - e)));
}

/**
 * A parametric piece sampled from t0 (exclusive) to t1 (inclusive), about
 * every `step` diameters along it, its radius multiplier running from r0
 * to r1: the interior points and the end, like `arcTo`.
 */
export function run(
	f: (t: number) => V,
	t0: number,
	t1: number,
	r0: number,
	r1: number,
	step = 0.3,
): KnotPoint[] {
	let len = 0;
	let prev = f(t0);
	for (let i = 1; i <= 16; i++) {
		const p = f(t0 + ((t1 - t0) * i) / 16);
		len += Math.sqrt(vdot(vsub(p, prev), vsub(p, prev)));
		prev = p;
	}
	const k = Math.max(1, Math.ceil(len / step));
	const out: KnotPoint[] = [];
	for (let i = 1; i <= k; i++) {
		const u = i / k;
		const p = f(t0 + (t1 - t0) * u);
		out.push({ x: p[0], y: p[1], z: p[2], r: r0 + (r1 - r0) * u });
	}
	return out;
}
