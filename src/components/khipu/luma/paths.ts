import { beginKind, termKind } from "#/lib/khipu/anatomy";
import {
	type EndCurve,
	primaryEndCurve,
	terminationCurve,
} from "#/lib/khipu/ends3d";
import { hitchCurve, subsidiaryHitchCurve } from "#/lib/khipu/hitch3d";
import { type KnotPoint, knotCurve } from "#/lib/khipu/knots3d";
import type { KnotType } from "#/lib/khipu/types";
import {
	CM,
	type LabModel,
	type Paint,
	type PrimaryModel,
	primaryPoint,
	type Rope,
	type V3,
} from "./model";
import { BYTES_PER_INSTANCE, F, FLOATS_PER_INSTANCE } from "./shaders";

/**
 * Turns the simulated ropes into the centerlines the GPU extrudes: each
 * cord's body smoothed from its particles, its hitch spliced on at the top,
 * its knots laid along it at their recorded positions, its end at the
 * bottom; the primary with its beginning and termination. Everything is
 * packed into one instance buffer, one record per centerline segment.
 *
 * This runs every frame for every cord, so it works on flat scratch arrays
 * and allocates nothing per sample. A cord whose particles have not moved
 * since its last build is copied from that build instead.
 */

/** Feature codes carried per segment, read by the shader's view modes. */
export const FEATURE = {
	body: 0,
	single: 1,
	long: 2,
	eight: 3,
	otherKnot: 4,
	recto: 5,
	verso: 6,
	otherHitch: 7,
	end: 8,
	primary: 9,
	stopper: 10,
} as const;

const KNOT_FEATURE: Record<KnotType, number> = {
	S: FEATURE.single,
	L: FEATURE.long,
	LL: FEATURE.long,
	BL: FEATURE.long,
	SP: FEATURE.long,
	E: FEATURE.eight,
	EE: FEATURE.eight,
	TF: FEATURE.otherKnot,
	U: FEATURE.otherKnot,
};

export interface StrandStyle {
	twist: -1 | 0 | 1;
	/** 1 = show the ply profile, 0 = smooth */
	plied: number;
	paint: Paint;
	cordId: number;
	/** brightness nudge so neighbouring cords are not identical */
	shade: number;
	/** the cord's own diameter, for the ply pitch */
	d: number;
}

/** An sRGB colour as the linear RGB the shader lights (see `hexRgb`). */
function linear(rgb: V3): V3 {
	const f = (v: number) =>
		v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	return [f(rgb[0]), f(rgb[1]), f(rgb[2])];
}

const WOOD: Paint = {
	color: linear([0.42, 0.27, 0.15]),
	accent: linear([0.42, 0.27, 0.15]),
	pattern: 0,
};
const THREAD: Paint = {
	color: linear([0.36, 0.5, 0.56]),
	accent: linear([0.36, 0.5, 0.56]),
	pattern: 0,
};
const RED: V3 = linear([0.7, 0.2, 0.16]);

/* ---------------------------------------------------------------------------
   Sample stream: one strand's centerline, in flat arrays
   --------------------------------------------------------------------------- */

/** Per-sample fields in the stream: x y z r feature shade plied paintIndex. */
const S_STRIDE = 8;

/**
 * The most a stream may turn between consecutive samples once assembled.
 * The curves themselves are refined to this at build time (curve3d.ts);
 * this catches the joints between them — a hitch's tail meeting the body,
 * a knot spliced in — and any kink the simulation puts in a body.
 */
const MAX_JOINT_TURN = (13 * Math.PI) / 180;
/** Joints turning less than this need no acos: they are never split. */
const COS_MAX_JOINT_TURN = Math.cos(MAX_JOINT_TURN);

/** |(x, y, z)|. Math.hypot guards against overflow nothing here can reach, at several times the cost. */
function len3(x: number, y: number, z = 0): number {
	return Math.sqrt(x * x + y * y + z * z);
}

class Stream {
	buf = new Float64Array(S_STRIDE * 4096);
	n = 0;
	paints: (Paint | undefined)[] = [];
	private turn = new Float64Array(4096);
	private scratch = new Float64Array(S_STRIDE * 4096);

	reset(): void {
		this.n = 0;
		this.paints.length = 0;
	}

	/** Close the strand's end: two samples that bring the radius to a point. */
	capEnd(): void {
		if (this.n < 2) return;
		const b = this.buf;
		const o = (this.n - 1) * S_STRIDE;
		const q = (this.n - 2) * S_STRIDE;
		let dx = b[o] - b[q];
		let dy = b[o + 1] - b[q + 1];
		let dz = b[o + 2] - b[q + 2];
		const l = len3(dx, dy, dz) || 1;
		dx /= l;
		dy /= l;
		dz /= l;
		const r = b[o + 3];
		const f = b[o + 4];
		const sh = b[o + 5];
		const pl = b[o + 6];
		const pi = b[o + 7];
		this.push(
			b[o] + dx * r * 0.3,
			b[o + 1] + dy * r * 0.3,
			b[o + 2] + dz * r * 0.3,
			r * 0.7,
			f,
			sh,
			pl,
		);
		this.buf[(this.n - 1) * S_STRIDE + 7] = pi;
		this.push(
			b[o] + dx * r * 0.5,
			b[o + 1] + dy * r * 0.5,
			b[o + 2] + dz * r * 0.5,
			r * 0.08,
			f,
			sh,
			pl,
		);
		this.buf[(this.n - 1) * S_STRIDE + 7] = pi;
	}

	/**
	 * Split any joint turning more than `maxTurn` into pieces on a centripetal
	 * Catmull-Rom through the samples (the same rounding curve3d.ts applies
	 * to the curves when they are built). Samples keep their other fields
	 * from the start of the piece they subdivide.
	 */
	smoothJoints(maxTurn: number): void {
		const n = this.n;
		if (n < 3) return;
		const b = this.buf;
		if (this.turn.length < n) this.turn = new Float64Array(n * 2);
		const turn = this.turn;
		turn[0] = 0;
		turn[n - 1] = 0;
		let extra = 0;
		let ux = 0;
		let uy = 0;
		let uz = 0;
		let lu = 0;
		for (let i = 0; i < n - 1; i++) {
			const o = i * S_STRIDE;
			const c = o + S_STRIDE;
			let vx = b[c] - b[o];
			let vy = b[c + 1] - b[o + 1];
			let vz = b[c + 2] - b[o + 2];
			const lv = Math.sqrt(vx * vx + vy * vy + vz * vz);
			if (lv < 1e-9) {
				turn[i] = 0;
				continue;
			}
			vx /= lv;
			vy /= lv;
			vz /= lv;
			if (i > 0 && lu > 0) {
				const cos = Math.max(-1, Math.min(1, ux * vx + uy * vy + uz * vz));
				turn[i] = cos >= COS_MAX_JOINT_TURN ? 0 : Math.acos(cos);
			} else turn[i] = 0;
			ux = vx;
			uy = vy;
			uz = vz;
			lu = lv;
		}
		for (let i = 0; i < n - 1; i++) {
			const k = Math.ceil(Math.max(turn[i], turn[i + 1]) / maxTurn - 0.05);
			if (k > 1) extra += k - 1;
		}
		if (extra === 0) return;
		const need = (n + extra) * S_STRIDE;
		if (this.scratch.length < need) this.scratch = new Float64Array(need * 2);
		const out = this.scratch;
		let m = 0;
		for (let i = 0; i < n - 1; i++) {
			const o = i * S_STRIDE;
			out.set(b.subarray(o, o + S_STRIDE), m * S_STRIDE);
			m++;
			const k = Math.ceil(Math.max(turn[i], turn[i + 1]) / maxTurn - 0.05);
			if (k < 2) continue;
			// the spline's neighbours, mirrored past the ends of the stream
			const p1 = o;
			const p2 = o + S_STRIDE;
			const p0 = i > 0 ? o - S_STRIDE : -1;
			const p3 = i + 2 < n ? o + 2 * S_STRIDE : -1;
			const x0 = p0 >= 0 ? b[p0] : 2 * b[p1] - b[p2];
			const y0 = p0 >= 0 ? b[p0 + 1] : 2 * b[p1 + 1] - b[p2 + 1];
			const z0 = p0 >= 0 ? b[p0 + 2] : 2 * b[p1 + 2] - b[p2 + 2];
			const x3 = p3 >= 0 ? b[p3] : 2 * b[p2] - b[p1];
			const y3 = p3 >= 0 ? b[p3 + 1] : 2 * b[p2 + 1] - b[p1 + 1];
			const z3 = p3 >= 0 ? b[p3 + 2] : 2 * b[p2 + 2] - b[p1 + 2];
			const t1 = Math.sqrt(len3(b[p1] - x0, b[p1 + 1] - y0, b[p1 + 2] - z0));
			const t2 =
				t1 +
				Math.sqrt(
					len3(b[p2] - b[p1], b[p2 + 1] - b[p1 + 1], b[p2 + 2] - b[p1 + 2]),
				);
			const t3 =
				t2 + Math.sqrt(len3(x3 - b[p2], y3 - b[p2 + 1], z3 - b[p2 + 2]));
			for (let j = 1; j < k; j++) {
				const t = t1 + ((t2 - t1) * j) / k;
				const w01 = (t - 0) / (t1 - 0);
				const w12 = (t - t1) / (t2 - t1);
				const w23 = (t - t2) / (t3 - t2);
				const w02 = (t - 0) / (t2 - 0);
				const w13 = (t - t1) / (t3 - t1);
				const q = m * S_STRIDE;
				for (let a = 0; a < 3; a++) {
					const c0 = a === 0 ? x0 : a === 1 ? y0 : z0;
					const c1 = b[p1 + a];
					const c2 = b[p2 + a];
					const c3 = a === 0 ? x3 : a === 1 ? y3 : z3;
					const a1 = c0 + (c1 - c0) * w01;
					const a2 = c1 + (c2 - c1) * w12;
					const a3 = c2 + (c3 - c2) * w23;
					const b1 = a1 + (a2 - a1) * w02;
					const b2 = a2 + (a3 - a2) * w13;
					out[q + a] = b1 + (b2 - b1) * w12;
				}
				out[q + 3] = b[p1 + 3] + (b[p2 + 3] - b[p1 + 3]) * (j / k);
				out[q + 4] = b[p1 + 4];
				out[q + 5] = b[p1 + 5];
				out[q + 6] = b[p1 + 6];
				out[q + 7] = b[p1 + 7];
				m++;
			}
		}
		const last = (n - 1) * S_STRIDE;
		out.set(b.subarray(last, last + S_STRIDE), m * S_STRIDE);
		m++;
		this.scratch = b;
		this.buf = out;
		this.n = m;
	}

	/** Close the strand's start the same way, by extrapolating backwards. */
	capStart(): void {
		if (this.n < 2) return;
		const b = this.buf;
		if ((this.n + 2) * S_STRIDE > b.length) {
			const next = new Float64Array(b.length * 2);
			next.set(b);
			this.buf = next;
		}
		const buf = this.buf;
		buf.copyWithin(2 * S_STRIDE, 0, this.n * S_STRIDE);
		this.n += 2;
		const o = 2 * S_STRIDE;
		const q = 3 * S_STRIDE;
		let dx = buf[o] - buf[q];
		let dy = buf[o + 1] - buf[q + 1];
		let dz = buf[o + 2] - buf[q + 2];
		const l = len3(dx, dy, dz) || 1;
		dx /= l;
		dy /= l;
		dz /= l;
		const r = buf[o + 3];
		const set = (i: number, k: number, rr: number) => {
			const t = i * S_STRIDE;
			buf[t] = buf[o] + dx * r * k;
			buf[t + 1] = buf[o + 1] + dy * r * k;
			buf[t + 2] = buf[o + 2] + dz * r * k;
			buf[t + 3] = rr;
			buf[t + 4] = buf[o + 4];
			buf[t + 5] = buf[o + 5];
			buf[t + 6] = buf[o + 6];
			buf[t + 7] = buf[o + 7];
		};
		set(1, 0.3, r * 0.7);
		set(0, 0.5, r * 0.08);
	}

	/**
	 * Ease the ply relief across each splice between samples with their own
	 * strength (knots, drawn at a fraction of it) and samples that take the
	 * strand's (`base`): a smoothstep over `width` of arc either side, so the
	 * silhouette's ply lobes do not step where a knot meets the body.
	 */
	rampPlied(base: number, width: number): void {
		const n = this.n;
		if (n < 2 || width <= 0) return;
		const b = this.buf;
		const own = (i: number) => b[i * S_STRIDE + 6] >= 0;
		const seg = (i: number) => {
			const o = i * S_STRIDE;
			const q = o + S_STRIDE;
			return len3(b[q] - b[o], b[q + 1] - b[o + 1], b[q + 2] - b[o + 2]);
		};
		let dist: Float64Array | null = null;
		const value = this.rampScratch(n);
		// each sample takes the blend of its nearest splice, within `width`
		const visit = (i: number, x: number, strength: number) => {
			const d = Math.abs(x);
			if (!dist) return;
			if (d >= width || d >= dist[i]) return;
			dist[i] = d;
			const t = (x + width) / (2 * width);
			value[i] = strength + (base - strength) * t * t * (3 - 2 * t);
		};
		for (let i = 0; i + 1 < n; i++) {
			if (own(i) === own(i + 1)) continue;
			if (!dist) {
				dist = this.distScratch(n);
				dist.fill(Number.POSITIVE_INFINITY, 0, n);
			}
			// the splice sits mid-segment; x is its arc distance, + toward the body
			const knotFirst = own(i);
			const strength = b[(knotFirst ? i : i + 1) * S_STRIDE + 6];
			const sign = knotFirst ? -1 : 1;
			let x = seg(i) / 2;
			for (let j = i; j >= 0 && x < width; j--) {
				visit(j, sign * x, strength);
				if (j > 0) x += seg(j - 1);
			}
			x = seg(i) / 2;
			for (let j = i + 1; j < n && x < width; j++) {
				visit(j, -sign * x, strength);
				if (j + 1 < n) x += seg(j);
			}
		}
		if (!dist) return;
		for (let i = 0; i < n; i++)
			if (dist[i] < width) b[i * S_STRIDE + 6] = value[i];
	}

	private dist = new Float64Array(4096);
	private ramp = new Float64Array(4096);
	private distScratch(n: number): Float64Array {
		if (this.dist.length < n) this.dist = new Float64Array(n * 2);
		return this.dist;
	}
	private rampScratch(n: number): Float64Array {
		if (this.ramp.length < n) this.ramp = new Float64Array(n * 2);
		return this.ramp;
	}

	push(
		x: number,
		y: number,
		z: number,
		r: number,
		feature: number,
		shade = 1,
		plied = -1,
		paint?: Paint,
	): void {
		// A sample on top of the last one (a knot or hitch spliced where the
		// body's own sample already is) takes its place: a zero-length step
		// is skipped by the packer, and the rings either side of it, each
		// square to a different tangent, would leave a thin crack round the
		// cord.
		if (this.n > 0) {
			const q = (this.n - 1) * S_STRIDE;
			const c = this.buf;
			if (
				Math.abs(c[q] - x) + Math.abs(c[q + 1] - y) + Math.abs(c[q + 2] - z) <
				1e-9
			)
				this.n--;
		}
		if ((this.n + 1) * S_STRIDE > this.buf.length) {
			const next = new Float64Array(this.buf.length * 2);
			next.set(this.buf);
			this.buf = next;
		}
		const o = this.n * S_STRIDE;
		const b = this.buf;
		b[o] = x;
		b[o + 1] = y;
		b[o + 2] = z;
		b[o + 3] = r;
		b[o + 4] = feature;
		b[o + 5] = shade;
		b[o + 6] = plied;
		if (paint) {
			this.paints.push(paint);
			b[o + 7] = this.paints.length - 1;
		} else b[o + 7] = -1;
		this.n++;
	}
}

/* ---------------------------------------------------------------------------
   Instance packer
   --------------------------------------------------------------------------- */

export class Packer {
	data: Float32Array;
	/** where the next instance is written */
	count = 0;
	/**
	 * Instances may be written up to here and no further: a stream that
	 * would cross it is dropped and `overflow` set (see SceneBuilder).
	 */
	limit = Number.POSITIVE_INFINITY;
	overflow = false;
	private tx = new Float64Array(4096);
	private ty = new Float64Array(4096);
	private tz = new Float64Array(4096);
	// the bend at each sample: where it turns toward, and how far the section
	// may reach that way before it crosses the hinge with the next segment
	private cx = new Float64Array(4096);
	private cy = new Float64Array(4096);
	private cz = new Float64Array(4096);
	private cap = new Float64Array(4096);
	// that direction in the sample's frame, (cos, sin) round (n, t × n)
	private bc = new Float64Array(4096);
	private bs = new Float64Array(4096);

	constructor(capacity: number) {
		this.data = new Float32Array(capacity * FLOATS_PER_INSTANCE);
	}

	reset(): void {
		this.count = 0;
		this.limit = Number.POSITIVE_INFINITY;
		this.overflow = false;
	}

	get byteLength(): number {
		return this.count * BYTES_PER_INSTANCE;
	}

	ensure(instances: number): void {
		while ((this.count + instances) * FLOATS_PER_INSTANCE > this.data.length) {
			const next = new Float32Array(this.data.length * 2);
			next.set(this.data);
			this.data = next;
		}
	}

	/**
	 * Fill instances [from, to) with empty records: zero radius at both ends,
	 * so every vertex of the segment lands on one point and it draws nothing.
	 * (A shader that widens thin cords to a minimum on-screen size must keep
	 * r0 = r1 = 0 at zero — it scales r, which does — or cull these records.)
	 */
	pad(from: number, to: number): void {
		if (to <= from) return;
		const d = this.data;
		d.fill(0, from * FLOATS_PER_INSTANCE, to * FLOATS_PER_INSTANCE);
		for (let i = from; i < to; i++) {
			const o = i * FLOATS_PER_INSTANCE;
			// a valid frame, so nothing downstream normalises a zero vector
			d[o + F.t0 + 1] = -1;
			d[o + F.t1 + 1] = -1;
			d[o + F.n0 + 2] = 1;
			d[o + F.n1 + 2] = 1;
			d[o + F.cordId] = -2;
			d[o + F.feature] = -1;
		}
	}

	/**
	 * One strand: consecutive samples become segments. Tangents are central
	 * differences shared by neighbouring segments (so the tube is
	 * watertight); the frame normal is parallel-transported from the first
	 * sample's front so the ply profile turns smoothly and never flips.
	 */
	addStream(
		stream: Stream,
		style: StrandStyle,
		front: V3 = [0, 0, 1],
		caps = true,
	): void {
		stream.smoothJoints(MAX_JOINT_TURN);
		if (caps) {
			stream.capStart();
			stream.capEnd();
		}
		const n = stream.n;
		if (n < 2) return;
		if (this.count + n - 1 > this.limit) {
			this.overflow = true;
			return;
		}
		const b = stream.buf;
		if (this.tx.length < n) {
			this.tx = new Float64Array(n * 2);
			this.ty = new Float64Array(n * 2);
			this.tz = new Float64Array(n * 2);
			this.cx = new Float64Array(n * 2);
			this.cy = new Float64Array(n * 2);
			this.cz = new Float64Array(n * 2);
			this.cap = new Float64Array(n * 2);
			this.bc = new Float64Array(n * 2);
			this.bs = new Float64Array(n * 2);
		}
		const tx = this.tx;
		const ty = this.ty;
		const tz = this.tz;
		const cx = this.cx;
		const cy = this.cy;
		const cz = this.cz;
		const cap = this.cap;
		const bc = this.bc;
		const bs = this.bs;
		// The ring at each sample is the mitre between the segments meeting
		// there, so its tangent bisects their directions (not the chord across
		// the neighbours, which a long leg beside a short one would swing
		// almost parallel to the short segment and fan its ring out sideways).
		// On the inside of the turn the ring leans into each neighbour by
		// r·sin(tilt); where the two rings of a segment lean further than the
		// segment is long the tube turns inside out. The shader keeps the
		// section within half of that room (with a margin) in the direction
		// the cord turns toward; here is that direction and limit.
		let ux = 0;
		let uy = -1;
		let uz = 0;
		let lu = 0;
		for (let i = 0; i < n; i++) {
			const o = i * S_STRIDE;
			let vx = 0;
			let vy = 0;
			let vz = 0;
			let lv = 0;
			if (i < n - 1) {
				const c = o + S_STRIDE;
				vx = b[c] - b[o];
				vy = b[c + 1] - b[o + 1];
				vz = b[c + 2] - b[o + 2];
				lv = Math.sqrt(vx * vx + vy * vy + vz * vz);
				if (lv >= 1e-9) {
					vx /= lv;
					vy /= lv;
					vz /= lv;
				} else lv = 0;
			}
			// the bisector; at an end, or across a zero-length step, the one
			// direction there is; at a hairpin, the incoming direction
			let x = (lu > 0 ? ux : 0) + (lv > 0 ? vx : 0);
			let y = (lu > 0 ? uy : 0) + (lv > 0 ? vy : 0);
			let z = (lu > 0 ? uz : 0) + (lv > 0 ? vz : 0);
			let l = Math.sqrt(x * x + y * y + z * z);
			if (l < 1e-6) {
				x = ux;
				y = uy;
				z = uz;
				l = 1;
			}
			x /= l;
			y /= l;
			z /= l;
			tx[i] = x;
			ty[i] = y;
			tz[i] = z;
			cap[i] = 0;
			if (lu > 0 && lv > 0) {
				// the ring's tilt toward each neighbour, and the room it has
				const ku = ux * x + uy * y + uz * z;
				const kv = vx * x + vy * y + vz * z;
				const px = vx - x * kv;
				const py = vy - y * kv;
				const pz = vz - z * kv;
				const sinV = Math.sqrt(px * px + py * py + pz * pz);
				const sinU = Math.sqrt(Math.max(0, 1 - ku * ku));
				if (sinV > 5e-4 && sinU > 5e-4) {
					cx[i] = px / sinV;
					cy[i] = py / sinV;
					cz[i] = pz / sinV;
					cap[i] = 0.42 * Math.min(lu / sinU, lv / sinV);
				}
			}
			if (lv > 0) {
				ux = vx;
				uy = vy;
				uz = vz;
				lu = lv;
			}
		}
		// that direction resolved in the sample's frame (n, t × n)
		const frameAt = (i: number, nx: number, ny: number, nz: number) => {
			if (cap[i] === 0) {
				// unused where there is no cap, but kept deterministic
				bc[i] = 0;
				bs[i] = 0;
				return;
			}
			const bx = ty[i] * nz - tz[i] * ny;
			const by = tz[i] * nx - tx[i] * nz;
			const bz = tx[i] * ny - ty[i] * nx;
			bc[i] = cx[i] * nx + cy[i] * ny + cz[i] * nz;
			bs[i] = cx[i] * bx + cy[i] * by + cz[i] * bz;
		};
		this.ensure(n - 1);
		const d = this.data;
		const invD = 1 / style.d;
		// the transported normal, carried along
		let nx = front[0];
		let ny = front[1];
		let nz = front[2];
		{
			const k = nx * tx[0] + ny * ty[0] + nz * tz[0];
			nx -= tx[0] * k;
			ny -= ty[0] * k;
			nz -= tz[0] * k;
			let l = len3(nx, ny, nz);
			if (l < 1e-4) {
				// front is along the tangent: use anything perpendicular
				nx = ty[0];
				ny = -tx[0];
				nz = 0;
				l = len3(nx, ny, nz) || 1;
			}
			nx /= l;
			ny /= l;
			nz /= l;
		}
		let s = 0;
		frameAt(0, nx, ny, nz);
		for (let i = 0; i < n - 1; i++) {
			const j = i + 1;
			const k = nx * tx[j] + ny * ty[j] + nz * tz[j];
			let mx = nx - tx[j] * k;
			let my = ny - ty[j] * k;
			let mz = nz - tz[j] * k;
			let l = len3(mx, my, mz);
			if (l < 1e-4) {
				mx = ty[j];
				my = -tx[j];
				mz = 0;
				l = len3(mx, my, mz) || 1;
			}
			mx /= l;
			my /= l;
			mz /= l;
			frameAt(j, mx, my, mz);
			const oa = i * S_STRIDE;
			const ob = j * S_STRIDE;
			const segLen = len3(
				b[ob] - b[oa],
				b[ob + 1] - b[oa + 1],
				b[ob + 2] - b[oa + 2],
			);
			if (segLen >= 1e-7) {
				const o = this.count * FLOATS_PER_INSTANCE;
				d[o + F.p0] = b[oa];
				d[o + F.p0 + 1] = b[oa + 1];
				d[o + F.p0 + 2] = b[oa + 2];
				d[o + F.p1] = b[ob];
				d[o + F.p1 + 1] = b[ob + 1];
				d[o + F.p1 + 2] = b[ob + 2];
				d[o + F.t0] = tx[i];
				d[o + F.t0 + 1] = ty[i];
				d[o + F.t0 + 2] = tz[i];
				d[o + F.t1] = tx[j];
				d[o + F.t1 + 1] = ty[j];
				d[o + F.t1 + 2] = tz[j];
				d[o + F.n0] = nx;
				d[o + F.n0 + 1] = ny;
				d[o + F.n0 + 2] = nz;
				d[o + F.n1] = mx;
				d[o + F.n1 + 1] = my;
				d[o + F.n1 + 2] = mz;
				d[o + F.r0] = b[oa + 3];
				d[o + F.r1] = b[ob + 3];
				d[o + F.s0] = s;
				s += segLen * invD;
				d[o + F.s1] = s;
				d[o + F.twist] = style.twist;
				d[o + F.plied] = b[oa + 6] >= 0 ? b[oa + 6] : style.plied;
				d[o + F.plied1] = b[ob + 6] >= 0 ? b[ob + 6] : style.plied;
				const pi = b[oa + 7];
				const paint =
					pi >= 0 ? (stream.paints[pi] ?? style.paint) : style.paint;
				d[o + F.pattern] = paint.pattern;
				d[o + F.feature] = b[oa + 4];
				d[o + F.color] = paint.color[0];
				d[o + F.color + 1] = paint.color[1];
				d[o + F.color + 2] = paint.color[2];
				d[o + F.accent] = paint.accent[0];
				d[o + F.accent + 1] = paint.accent[1];
				d[o + F.accent + 2] = paint.accent[2];
				d[o + F.cordId] = style.cordId;
				d[o + F.shade] = style.shade * b[oa + 5];
				d[o + F.shade1] = style.shade * b[ob + 5];
				d[o + F.bend0] = cap[i];
				d[o + F.bend0 + 1] = bc[i];
				d[o + F.bend0 + 2] = bs[i];
				d[o + F.bend1] = cap[j];
				d[o + F.bend1 + 1] = bc[j];
				d[o + F.bend1 + 2] = bs[j];
				this.count++;
			}
			nx = mx;
			ny = my;
			nz = mz;
		}
	}
}

/* ---------------------------------------------------------------------------
   Frames and curves
   --------------------------------------------------------------------------- */

/** A frame at a point: t along the cord, n toward the viewer, x to the viewer's right. */
interface Frame {
	px: number;
	py: number;
	pz: number;
	tx: number;
	ty: number;
	tz: number;
	nx: number;
	ny: number;
	nz: number;
	xx: number;
	xy: number;
	xz: number;
}

function frameOf(
	px: number,
	py: number,
	pz: number,
	tx: number,
	ty: number,
	tz: number,
	out?: Frame,
): Frame {
	// front = world z projected off the tangent
	let nx = -tx * tz;
	let ny = -ty * tz;
	let nz = 1 - tz * tz;
	let l = len3(nx, ny, nz);
	if (l < 1e-4) {
		nx = 0;
		ny = 1;
		nz = 0;
		l = 1;
	}
	nx /= l;
	ny /= l;
	nz /= l;
	const f = out ?? ({} as Frame);
	f.px = px;
	f.py = py;
	f.pz = pz;
	f.tx = tx;
	f.ty = ty;
	f.tz = tz;
	f.nx = nx;
	f.ny = ny;
	f.nz = nz;
	// x = n × t
	f.xx = ny * tz - nz * ty;
	f.xy = nz * tx - nx * tz;
	f.xz = nx * ty - ny * tx;
	return f;
}

/** One frame reused by the hot loops that consume a frame at once. */
const scratchFrame = frameOf(0, 0, 0, 0, -1, 0);

/** Push a curve given in a frame's local units (diameters) onto a stream. */
function pushLocal(
	stream: Stream,
	f: Frame,
	pts: KnotPoint[],
	d: number,
	r: number,
	feature: number,
	paint?: Paint,
	shadeOf?: (q: KnotPoint) => number,
	plied = -1,
	reverse = false,
): void {
	const n = pts.length;
	for (let k = 0; k < n; k++) {
		const q = pts[reverse ? n - 1 - k : k];
		const lx = q.x * d;
		const ly = q.y * d;
		const lz = q.z * d;
		stream.push(
			f.px + f.xx * lx + f.tx * ly + f.nx * lz,
			f.py + f.xy * lx + f.ty * ly + f.ny * lz,
			f.pz + f.xz * lx + f.tz * ly + f.nz * lz,
			r * q.r,
			feature,
			shadeOf ? shadeOf(q) : 1,
			plied,
			paint,
		);
	}
}

/**
 * Push a curve given in cord units along a body: each point takes the
 * body's frame at its own arc length, so a knot (or a long cluster of them)
 * follows the cord's curve and its far end lands back on the body exactly.
 */
function pushAlong(
	stream: Stream,
	body: Body,
	s0: number,
	pts: KnotPoint[],
	d: number,
	r: number,
	feature: number,
	paint?: Paint,
	shades?: Float64Array,
	plied = -1,
): void {
	// the points run roughly along the body, so the search walks from the last one
	let hint = 0;
	for (let k = 0; k < pts.length; k++) {
		const q = pts[k];
		const s = s0 + q.y * d;
		hint = body.indexNear(Math.max(0, Math.min(body.length, s)), hint);
		const f = body.frameBeyond(s, scratchFrame, hint);
		const lx = q.x * d;
		const lz = q.z * d;
		stream.push(
			f.px + f.xx * lx + f.nx * lz,
			f.py + f.xy * lx + f.ny * lz,
			f.pz + f.xz * lx + f.nz * lz,
			r * q.r,
			feature,
			shades ? shades[k] : 1,
			plied,
			paint,
		);
	}
}

/**
 * Strands deeper in a knot sit in its shadow: a brightness per point of a
 * (cached, so fixed) knot curve, kept beside it rather than worked out
 * again every frame.
 */
const shadeCache = new WeakMap<KnotPoint[], Float64Array>();

function knotShades(pts: KnotPoint[], radius: number): Float64Array {
	let out = shadeCache.get(pts);
	if (!out) {
		const inner = Math.max(0.5, radius - 0.6);
		out = new Float64Array(pts.length);
		for (let k = 0; k < pts.length; k++)
			out[k] = 0.72 + 0.28 * Math.min(1, len3(pts[k].x, pts[k].z) / inner);
		shadeCache.set(pts, out);
	}
	return out;
}

/* ---------------------------------------------------------------------------
   Bodies
   --------------------------------------------------------------------------- */

/** The smoothed body of one rope, in flat arrays: points and cumulative arc length. */
class Body {
	x = new Float64Array(512);
	y = new Float64Array(512);
	z = new Float64Array(512);
	arc = new Float64Array(512);
	// unit tangent at each point, so frames along the body turn continuously
	tx = new Float64Array(512);
	ty = new Float64Array(512);
	tz = new Float64Array(512);
	n = 0;
	length = 0;

	/** Catmull-Rom through the particles, subdivided to about a diameter. */
	build(rope: Rope): void {
		const ps = rope.particles;
		const sub = Math.max(
			2,
			Math.min(12, Math.round(rope.segmentLength / (rope.d * 1.1))),
		);
		const need = (ps.length - 1) * sub + 1;
		if (this.x.length < need) {
			this.x = new Float64Array(need * 2);
			this.y = new Float64Array(need * 2);
			this.z = new Float64Array(need * 2);
			this.arc = new Float64Array(need * 2);
			this.tx = new Float64Array(need * 2);
			this.ty = new Float64Array(need * 2);
			this.tz = new Float64Array(need * 2);
		}
		let n = 0;
		for (let i = 0; i < ps.length - 1; i++) {
			const p0 = ps[Math.max(0, i - 1)].p;
			const p1 = ps[i].p;
			const p2 = ps[i + 1].p;
			const p3 = ps[Math.min(ps.length - 1, i + 2)].p;
			for (let k = 0; k < sub; k++) {
				const t = k / sub;
				const t2 = t * t;
				const t3 = t2 * t;
				const c0 = -t3 + 2 * t2 - t;
				const c1 = 3 * t3 - 5 * t2 + 2;
				const c2 = -3 * t3 + 4 * t2 + t;
				const c3 = t3 - t2;
				this.x[n] = 0.5 * (c0 * p0[0] + c1 * p1[0] + c2 * p2[0] + c3 * p3[0]);
				this.y[n] = 0.5 * (c0 * p0[1] + c1 * p1[1] + c2 * p2[1] + c3 * p3[1]);
				this.z[n] = 0.5 * (c0 * p0[2] + c1 * p1[2] + c2 * p2[2] + c3 * p3[2]);
				n++;
			}
		}
		const last = ps[ps.length - 1].p;
		this.x[n] = last[0];
		this.y[n] = last[1];
		this.z[n] = last[2];
		n++;
		this.n = n;
		this.arc[0] = 0;
		for (let i = 1; i < n; i++)
			this.arc[i] =
				this.arc[i - 1] +
				len3(
					this.x[i] - this.x[i - 1],
					this.y[i] - this.y[i - 1],
					this.z[i] - this.z[i - 1],
				);
		this.length = this.arc[n - 1];
		for (let i = 0; i < n; i++) {
			const a = Math.max(0, i - 1);
			const b = Math.min(n - 1, i + 1);
			let tx = this.x[b] - this.x[a];
			let ty = this.y[b] - this.y[a];
			let tz = this.z[b] - this.z[a];
			const l = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
			tx /= l;
			ty /= l;
			tz /= l;
			this.tx[i] = tx;
			this.ty[i] = ty;
			this.tz[i] = tz;
		}
	}

	/** Index of the last point at or before arc length s. */
	indexAt(s: number): number {
		let lo = 0;
		let hi = this.n - 1;
		while (hi - lo > 1) {
			const m = (lo + hi) >> 1;
			if (this.arc[m] <= s) lo = m;
			else hi = m;
		}
		return lo;
	}

	/**
	 * The same index as `indexAt`, found by walking from `hint`: cheaper when
	 * consecutive lookups are close together (a knot laid along the body).
	 */
	indexNear(s: number, hint: number): number {
		const arc = this.arc;
		const last = this.n - 2;
		let i = Math.max(0, Math.min(last, hint));
		while (i < last && arc[i + 1] <= s) i++;
		while (i > 0 && arc[i] > s) i--;
		return i;
	}

	/** Frame at arc length s, continuing straight on past the body's end. */
	frameBeyond(s: number, out?: Frame, index?: number): Frame {
		const f = this.frameAt(s, out, index);
		if (s > this.length) {
			const over = s - this.length;
			f.px += f.tx * over;
			f.py += f.ty * over;
			f.pz += f.tz * over;
		}
		return f;
	}

	/**
	 * Frame at arc length s (clamped), written into `out` when given; `index`
	 * is the point at or before s when the caller already knows it.
	 */
	frameAt(s: number, out?: Frame, index?: number): Frame {
		const sc = Math.max(0, Math.min(this.length, s));
		const lo = index ?? this.indexAt(sc);
		const hi = Math.min(this.n - 1, lo + 1);
		const span = this.arc[hi] - this.arc[lo] || 1;
		const u = (sc - this.arc[lo]) / span;
		let tx = this.tx[lo] + (this.tx[hi] - this.tx[lo]) * u;
		let ty = this.ty[lo] + (this.ty[hi] - this.ty[lo]) * u;
		let tz = this.tz[lo] + (this.tz[hi] - this.tz[lo]) * u;
		const l = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
		tx /= l;
		ty /= l;
		tz /= l;
		return frameOf(
			this.x[lo] + (this.x[hi] - this.x[lo]) * u,
			this.y[lo] + (this.y[hi] - this.y[lo]) * u,
			this.z[lo] + (this.z[hi] - this.z[lo]) * u,
			tx,
			ty,
			tz,
			out,
		);
	}

	/** Push the body's own points between two arc lengths (with exact end points). */
	emit(
		stream: Stream,
		from: number,
		to: number,
		r: number,
		paints: Paint[],
	): void {
		if (to <= from) return;
		const pushAt = (s: number) => {
			const f = this.frameAt(s, scratchFrame);
			stream.push(
				f.px,
				f.py,
				f.pz,
				r,
				FEATURE.body,
				1,
				-1,
				paintAt(paints, s / CM),
			);
		};
		pushAt(from);
		const i0 = this.indexAt(from) + 1;
		for (let i = i0; i < this.n && this.arc[i] < to; i++) {
			if (this.arc[i] - from < 1e-6) continue;
			stream.push(
				this.x[i],
				this.y[i],
				this.z[i],
				r,
				FEATURE.body,
				1,
				-1,
				paintAt(paints, this.arc[i] / CM),
			);
		}
		pushAt(to);
	}
}

/** Paint for a point `cm` down a spliced cord. */
function paintAt(paints: Paint[], cm: number): Paint | undefined {
	if (paints.length < 2) return undefined;
	for (const p of paints)
		if (p.range && cm >= p.range[0] && cm < p.range[1]) return p;
	return undefined;
}

/* ---------------------------------------------------------------------------
   Cords
   --------------------------------------------------------------------------- */

function hitchFeature(rope: Rope): number {
	return rope.attach === "recto"
		? FEATURE.recto
		: rope.attach === "verso"
			? FEATURE.verso
			: FEATURE.otherHitch;
}

const stream = new Stream();
const extraStream = new Stream();
const body = new Body();

function emitEndStrands(
	end: EndCurve,
	f: Frame,
	d: number,
	style: StrandStyle,
	packer: Packer,
): void {
	for (const strand of end.strands) {
		const paint: Paint =
			strand.color === "cord"
				? style.paint
				: strand.color === "accent"
					? {
							color: style.paint.pattern ? style.paint.accent : RED,
							accent: RED,
							pattern: 0,
						}
					: strand.color === "wood"
						? WOOD
						: THREAD;
		extraStream.reset();
		pushLocal(extraStream, f, strand.points, d, d / 2, FEATURE.end);
		packer.addStream(extraStream, {
			...style,
			paint,
			plied: strand.plied,
			twist: strand.color === "wood" ? 0 : style.twist,
		});
	}
}

export function buildRope(rope: Rope, model: LabModel, packer: Packer): void {
	const d = rope.d;
	const r = d / 2;
	const style: StrandStyle = {
		twist: rope.twist,
		plied: 1,
		paint: rope.paints[0],
		cordId: rope.id,
		shade: 0.93 + ((rope.id * 7) % 5) * 0.03,
		d,
	};
	stream.reset();
	let cursor = 0; // arc length of the body already emitted

	// the hitch, in the frame of the hang direction at the anchor
	{
		const parent =
			rope.parentId != null ? model.ropes[rope.parentId] : undefined;
		const hitch = parent
			? subsidiaryHitchCurve(rope.attach, parent.d / 2 / d, rope.side)
			: hitchCurve(rope.attach, model.primary.d / 2 / d);
		const f = frameOf(
			rope.anchor[0],
			rope.anchor[1],
			rope.anchor[2],
			rope.hang[0],
			rope.hang[1],
			rope.hang[2],
		);
		pushLocal(stream, f, hitch.points, d, r, hitchFeature(rope));
		// some hitches merge into the cord a little below where the body's
		// frame begins: the body picks up from there rather than doubling back
		cursor = Math.max(0, hitch.points[hitch.points.length - 1].y) * d;
	}

	// the body, with knots laid along it
	body.build(rope);
	const up = rope.kind === "top";
	const end = terminationCurve(rope.term);
	const endReserve = rope.term === "knotted" ? end.reach * d : 0;
	let floor = Math.max(cursor, d * 0.4); // knots keep their order and stay below the hitch
	for (const knot of rope.knots) {
		const curve = knotCurve(knot, up);
		const L = curve.length * d;
		let s0 = knot.pos * CM - L / 2;
		s0 = Math.max(s0, floor);
		s0 = Math.min(s0, Math.max(floor, body.length - endReserve - L));
		if (s0 > body.length - d) break;
		body.emit(stream, cursor, s0, r, rope.paints);
		const feature = KNOT_FEATURE[knot.type] ?? FEATURE.otherKnot;
		const paint = paintAt(rope.paints, knot.pos);
		pushAlong(
			stream,
			body,
			s0,
			curve.points,
			d,
			r,
			feature,
			paint,
			knotShades(curve.points, curve.radius),
			0.35,
		);
		for (const extra of curve.extras) {
			extraStream.reset();
			pushAlong(
				extraStream,
				body,
				s0,
				extra,
				d,
				r,
				feature,
				paint,
				knotShades(extra, curve.radius),
				0.35,
			);
			packer.addStream(extraStream, style);
		}
		cursor = s0 + L;
		floor = cursor + d * 0.35;
	}
	body.emit(stream, cursor, body.length, r, rope.paints);

	// the end, in the frame of the last stretch of body. Knots that do not
	// fit the recorded length run on past it; the end then follows them
	// rather than being drawn back where the record says the cord stops.
	{
		const f = body.frameBeyond(Math.max(cursor, body.length));
		const endFeature = rope.term === "knotted" ? FEATURE.stopper : FEATURE.end;
		pushLocal(stream, f, end.tail, d, r, endFeature);
		if (!rope.lengthKnown) {
			// an unrecorded length: the stub fades out rather than ending
			stream.push(
				f.px + f.tx * d * 0.6,
				f.py + f.ty * d * 0.6,
				f.pz + f.tz * d * 0.6,
				r * 0.5,
				FEATURE.body,
			);
			stream.push(
				f.px + f.tx * d * 1.1,
				f.py + f.ty * d * 1.1,
				f.pz + f.tz * d * 1.1,
				r * 0.15,
				FEATURE.body,
			);
		}
		stream.rampPlied(style.plied, d);
		packer.addStream(stream, style);
		emitEndStrands(end, f, d, style, packer);
	}
}

/* ---------------------------------------------------------------------------
   The primary cord
   --------------------------------------------------------------------------- */

export function buildPrimary(primary: PrimaryModel, packer: Packer): void {
	const d = primary.d;
	const r = d / 2;
	const style: StrandStyle = {
		twist: primary.structure === "P" ? primary.twist : 0,
		plied: primary.structure === "P" ? 1 : primary.structure === "B" ? 0.5 : 0,
		paint: primary.paint,
		cordId: -1,
		shade: 1,
		d,
	};
	stream.reset();
	// the beginning, drawn beyond x0 with the cord running toward −x
	const begin = primaryEndCurve(beginKind(primary.beginning), [1, 0, 0]);
	const p0 = primaryPoint(primary.x0, primary);
	const fBegin = frameOf(p0[0], p0[1], p0[2], -1, 0, 0);
	pushLocal(
		stream,
		fBegin,
		begin.tail,
		d,
		r,
		FEATURE.end,
		undefined,
		undefined,
		-1,
		true,
	);
	const n = Math.max(8, Math.ceil((primary.x1 - primary.x0) / (d * 1.2)));
	for (let i = 0; i <= n; i++) {
		const x = primary.x0 + ((primary.x1 - primary.x0) * i) / n;
		const p = primaryPoint(x, primary);
		stream.push(p[0], p[1], p[2], r, FEATURE.primary);
	}
	const term = primaryEndCurve(termKind(primary.term), [-1, 0, 0]);
	const p1 = primaryPoint(primary.x1, primary);
	const fTerm = frameOf(p1[0], p1[1], p1[2], 1, 0, 0);
	pushLocal(stream, fTerm, term.tail, d, r, FEATURE.end);
	packer.addStream(stream, style);
	emitEndStrands(begin, fBegin, d, style, packer);
	emitEndStrands(term, fTerm, d, style, packer);
}

/* ---------------------------------------------------------------------------
   The scene, in stable per-cord slots
   --------------------------------------------------------------------------- */

/** One cord's reserved run of instances. */
interface Slot {
	start: number;
	/** instances reserved; those past `count` are empty records */
	cap: number;
	count: number;
	/** particle positions the slot was last built from */
	pose: Float64Array;
}

/** Room a slot keeps for its cord to grow (a swaying knot run adds joints). */
function slotRoom(count: number): number {
	return count + Math.max(8, Math.ceil(count * 0.03));
}

/** A new layout once this share of the buffer is slots cords have outgrown. */
const MAX_DEAD = 0.1;

/**
 * Keeps every cord at a fixed place in the instance buffer, so a frame
 * repacks only the cords that moved and uploads only their bytes. The
 * primary and each rope get a slot with some room to grow; a rope that
 * outgrows its slot moves to the end and leaves an empty run behind,
 * and too much of that brings a fresh layout.
 *
 * `packer.count` is the whole layout (empty records included): it is what
 * is drawn. The ranges written since the last `takeDirty` are recorded.
 */
export class SceneBuilder {
	private slots: Slot[] = [];
	private model: LabModel | null = null;
	/** instances in outgrown slots, now empty */
	private dead = 0;
	/** instance ranges [start, end) rewritten since the last `takeDirty` */
	private dirty: number[] = [];
	/** the whole layout changed since the last `takeDirty` */
	private full = true;
	/** how many cords were rebuilt on the last call */
	rebuilt = 0;
	/** cord segments actually drawn (the layout less its empty records) */
	segments = 0;

	/** Bring the packer up to date with the model: only moved cords are repacked. */
	build(model: LabModel, packer: Packer): void {
		if (
			model !== this.model ||
			this.slots.length !== model.ropes.length + 1 ||
			this.dead > packer.count * MAX_DEAD
		) {
			this.layout(model, packer);
			return;
		}
		this.rebuilt = 0;
		const ropes = model.ropes;
		for (let k = 0; k < ropes.length; k++) {
			const rope = ropes[k];
			const slot = this.slots[k + 1];
			if (poseUnchanged(rope, slot.pose)) continue;
			this.rebuilt++;
			const was = slot.count;
			packer.count = slot.start;
			packer.limit = slot.start + slot.cap;
			packer.overflow = false;
			buildRope(rope, model, packer);
			const end = packer.count;
			packer.limit = Number.POSITIVE_INFINITY;
			if (packer.overflow) {
				// outgrown: empty the old slot and take a new one at the end
				packer.overflow = false;
				packer.pad(slot.start, slot.start + slot.cap);
				this.mark(slot.start, slot.start + slot.cap);
				this.dead += slot.cap;
				this.segments -= was;
				const total = this.total;
				packer.count = total;
				buildRope(rope, model, packer);
				slot.start = total;
				slot.count = packer.count - total;
				slot.cap = slotRoom(slot.count);
				packer.ensure(slot.cap - slot.count);
				packer.pad(total + slot.count, total + slot.cap);
				this.total = total + slot.cap;
				this.mark(slot.start, this.total);
				this.segments += slot.count;
			} else {
				slot.count = end - slot.start;
				packer.pad(end, slot.start + was);
				this.mark(slot.start, slot.start + Math.max(was, slot.count));
				this.segments += slot.count - was;
			}
			writePose(rope, slot);
		}
		packer.count = this.total;
	}

	/** instances laid out, empty records included */
	private total = 0;

	/** Lay every cord out afresh, each in a new slot. */
	private layout(model: LabModel, packer: Packer): void {
		this.model = model;
		this.slots = [];
		this.dead = 0;
		this.segments = 0;
		this.dirty.length = 0;
		this.full = true;
		packer.reset();
		const place = (build: () => void, pose: Float64Array) => {
			const start = packer.count;
			build();
			const count = packer.count - start;
			const cap = slotRoom(count);
			packer.ensure(cap - count);
			packer.pad(start + count, start + cap);
			packer.count = start + cap;
			this.slots.push({ start, cap, count, pose });
			this.segments += count;
		};
		// the primary never moves: its slot is only rewritten by a new layout
		place(() => buildPrimary(model.primary, packer), new Float64Array(0));
		for (const rope of model.ropes)
			place(() => buildRope(rope, model, packer), poseOf(rope));
		this.rebuilt = model.ropes.length;
		this.total = packer.count;
	}

	private mark(start: number, end: number): void {
		if (end > start) this.dirty.push(start, end);
	}

	/**
	 * What changed since the last call, for the upload: either `full` (upload
	 * everything) or instance ranges [start, end) sorted and merged, joined
	 * across gaps of up to `joinGap` instances (copying an unchanged gap is
	 * cheaper than another copy command). Clears the record.
	 */
	takeDirty(joinGap = 0): { full: boolean; ranges: number[] } {
		const full = this.full;
		const d = this.dirty;
		const ranges: number[] = [];
		if (!full && d.length > 0) {
			// usually already in order: cords are visited in slot order, and
			// only a cord moved to the end breaks it
			let sorted = true;
			for (let i = 2; i < d.length; i += 2)
				if (d[i] < d[i - 2]) {
					sorted = false;
					break;
				}
			let order: number[] | null = null;
			if (!sorted) {
				order = [];
				for (let i = 0; i < d.length; i += 2) order.push(i);
				order.sort((a, b) => d[a] - d[b]);
			}
			const n = d.length / 2;
			for (let k = 0; k < n; k++) {
				const i = order ? order[k] : k * 2;
				const start = d[i];
				const end = d[i + 1];
				const last = ranges.length - 1;
				if (last > 0 && start <= ranges[last] + joinGap)
					ranges[last] = Math.max(ranges[last], end);
				else ranges.push(start, end);
			}
		}
		this.full = false;
		d.length = 0;
		return { full, ranges };
	}
}

function writePose(rope: Rope, slot: Slot): void {
	const ps = rope.particles;
	if (slot.pose.length !== ps.length * 3) slot.pose = poseOf(rope);
	const out = slot.pose;
	for (let i = 0; i < ps.length; i++) {
		out[i * 3] = ps[i].p[0];
		out[i * 3 + 1] = ps[i].p[1];
		out[i * 3 + 2] = ps[i].p[2];
	}
}

function poseOf(rope: Rope): Float64Array {
	const ps = rope.particles;
	const out = new Float64Array(ps.length * 3);
	for (let i = 0; i < ps.length; i++) {
		out[i * 3] = ps[i].p[0];
		out[i * 3 + 1] = ps[i].p[1];
		out[i * 3 + 2] = ps[i].p[2];
	}
	return out;
}

/** True when no particle has moved more than a small fraction of a diameter. */
function poseUnchanged(rope: Rope, pose: Float64Array): boolean {
	const ps = rope.particles;
	if (pose.length !== ps.length * 3) return false;
	const tol = rope.d * 0.08;
	for (let i = 0; i < ps.length; i++) {
		const p = ps[i].p;
		if (
			Math.abs(p[0] - pose[i * 3]) > tol ||
			Math.abs(p[1] - pose[i * 3 + 1]) > tol ||
			Math.abs(p[2] - pose[i * 3 + 2]) > tol
		)
			return false;
	}
	return true;
}

/** Everything, in one buffer (no cache). */
export function buildScene(model: LabModel, packer: Packer): void {
	packer.reset();
	buildPrimary(model.primary, packer);
	for (const rope of model.ropes) buildRope(rope, model, packer);
}

/* ---------------------------------------------------------------------------
   Picking
   --------------------------------------------------------------------------- */

/** Distance between a ray and a segment. */
/** Scratch result of `raySegment`: [distance between ray and segment, depth along the ray]. */
const hit = new Float64Array(2);

function raySegment(o: V3, dir: V3, a: V3, b: V3): Float64Array {
	const ux = b[0] - a[0];
	const uy = b[1] - a[1];
	const uz = b[2] - a[2];
	const wx = a[0] - o[0];
	const wy = a[1] - o[1];
	const wz = a[2] - o[2];
	const aa = dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2];
	const bb = dir[0] * ux + dir[1] * uy + dir[2] * uz;
	const cc = ux * ux + uy * uy + uz * uz;
	const dd = dir[0] * wx + dir[1] * wy + dir[2] * wz;
	const ee = ux * wx + uy * wy + uz * wz;
	const den = aa * cc - bb * bb;
	let sc: number;
	let tc: number;
	if (den < 1e-9) {
		sc = 0;
		tc = cc > 0 ? Math.max(0, Math.min(1, ee / cc)) : 0;
	} else {
		tc = Math.max(0, Math.min(1, (aa * ee - bb * dd) / den));
		sc = Math.max(0, (bb * tc + dd) / aa);
	}
	const px = o[0] + dir[0] * sc - (a[0] + ux * tc);
	const py = o[1] + dir[1] * sc - (a[1] + uy * tc);
	const pz = o[2] + dir[2] * sc - (a[2] + uz * tc);
	hit[0] = Math.sqrt(px * px + py * py + pz * pz);
	hit[1] = sc;
	return hit;
}

export interface Pick {
	rope: Rope;
	/** distance from the ray origin to the point picked */
	depth: number;
}

/**
 * The rope nearest a ray, or null. The tolerance grows with depth
 * (`tolerance + perUnit × depth`) so it is a fixed size on screen.
 */
export function pickRope(
	model: LabModel,
	origin: V3,
	dir: V3,
	tolerance: number,
	perUnit = 0,
): Pick | null {
	let best: Rope | null = null;
	let bestDepth = 0;
	// margin by which the nearest candidate so far beat its own tolerance
	let bestScore = 0;
	for (const rope of model.ropes) {
		const ps = rope.particles;
		// include the hitch region above the anchor
		const carrierSide: V3 = [
			rope.anchor[0] - rope.hang[0] * rope.d * 3,
			rope.anchor[1] - rope.hang[1] * rope.d * 3,
			rope.anchor[2] - rope.hang[2] * rope.d * 3,
		];
		let h = raySegment(origin, dir, carrierSide, ps[0].p);
		let score = tolerance + perUnit * h[1] - h[0];
		let depth = h[1];
		for (let i = 0; i < ps.length - 1; i++) {
			h = raySegment(origin, dir, ps[i].p, ps[i + 1].p);
			const s = tolerance + perUnit * h[1] - h[0];
			if (s > score) {
				score = s;
				depth = h[1];
			}
		}
		if (score > bestScore) {
			bestScore = score;
			bestDepth = depth;
			best = rope;
		}
	}
	return best ? { rope: best, depth: bestDepth } : null;
}

/** Distance from a point to the nearest cord particle (the primary included). */
export function nearestCordDistance(model: LabModel, point: V3): number {
	let best = Number.POSITIVE_INFINITY;
	const chains = [model.primaryChain, ...model.ropes];
	for (const chain of chains) {
		const ps = chain.particles;
		for (let i = 0; i < ps.length; i++) {
			const p = ps[i].p;
			const dx = p[0] - point[0];
			const dy = p[1] - point[1];
			const dz = p[2] - point[2];
			const d2 = dx * dx + dy * dy + dz * dz;
			if (d2 < best) best = d2;
		}
	}
	return Math.sqrt(best);
}
