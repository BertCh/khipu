import type { BeginKind, TermKind } from "./anatomy";
import { arcTo, refine } from "./curve3d";
import { type KnotPoint, stopperCurve } from "./knots3d";

/**
 * What the end of a cord looks like, in the cord's frame at its last point:
 * units of its diameter, `y` running on past the end of the plain body (y =
 * 0 is where the body's last sample sits), `z` toward the viewer, `x` to
 * the right. `tail` continues the cord's own tube; `strands` are separate
 * pieces (loose plies, fibres, a wrapping thread, a bar) with their own
 * radius multipliers and, where they are not the cord's colour, a colour
 * role.
 */
export interface EndStrand {
	points: KnotPoint[];
	/** "cord" takes the cord's colour; "accent" its second colour; "wood" is a bar */
	color: "cord" | "accent" | "wood" | "thread";
	/** 1 = same twist rendering as the cord, 0 = smooth */
	plied: number;
}

export interface EndCurve {
	tail: KnotPoint[];
	strands: EndStrand[];
	/** how far past the body the end reaches (for framing) */
	reach: number;
}

const cache = new Map<string, EndCurve>();

/** the bend allowed between samples after refinement (see curve3d.ts) */
const MAX_TURN = (13 * Math.PI) / 180;

/** The end of a pendant, subsidiary or top cord. */
export function terminationCurve(kind: TermKind): EndCurve {
	return cached(`t|${kind}`, () => buildTerm(kind, false));
}

/**
 * Either end of the primary cord. `down` is the direction gravity pulls in,
 * expressed in this frame, so a tassel's strands fall rather than point on
 * along the cord.
 */
export function primaryEndCurve(
	kind: BeginKind | TermKind,
	down: [number, number, number] = [1, 0, 0],
): EndCurve {
	return cached(`p|${kind}|${down.join(",")}`, () =>
		buildTerm(kind, true, down),
	);
}

function cached(key: string, make: () => EndCurve): EndCurve {
	const hit = cache.get(key);
	if (hit) return hit;
	const built = make();
	const c = {
		...built,
		tail: refine(built.tail, MAX_TURN),
		strands: built.strands.map((s) => ({
			...s,
			points: refine(s.points, MAX_TURN),
		})),
	};
	cache.set(key, c);
	return c;
}

const P = (x: number, y: number, z: number, r = 1): KnotPoint => ({
	x,
	y,
	z,
	r,
});

/** A gently wandering strand from `from` toward `dir`, of `len`, thinning to `rEnd`. */
function fibre(
	from: KnotPoint,
	dir: [number, number, number],
	len: number,
	r0: number,
	rEnd: number,
	seed: number,
	n = 6,
): KnotPoint[] {
	const out: KnotPoint[] = [];
	for (let i = 0; i <= n; i++) {
		const t = i / n;
		const wob = Math.sin(t * 6 + seed) * 0.16 * t;
		const wob2 = Math.cos(t * 5 + seed * 1.7) * 0.16 * t;
		out.push(
			P(
				from.x + dir[0] * len * t + wob,
				from.y + dir[1] * len * t + wob2 * 0.4,
				from.z + dir[2] * len * t + wob2,
				r0 + (rEnd - r0) * t,
			),
		);
	}
	return out;
}

function buildTerm(
	kind: BeginKind | TermKind,
	primary: boolean,
	down: [number, number, number] = [0, 1, 0],
): EndCurve {
	const strands: EndStrand[] = [];
	const tail: KnotPoint[] = [];
	switch (kind) {
		case "knotted": {
			// a stopper: one overhand a little back from the tip, then a short tail
			const k = stopperCurve();
			const lead = 0.5;
			tail.push(P(0, lead * 0.5, 0));
			for (const p of k.points) tail.push(P(p.x, lead + p.y, p.z, p.r));
			tail.push(P(0.05, lead + k.length + 0.5, 0.05, 0.95));
			tail.push(P(0.1, lead + k.length + 0.85, 0.1, 0.8));
			return { tail, strands, reach: lead + k.length + 0.9 };
		}
		case "broken": {
			// the plies part unevenly and fibres fly
			tail.push(P(0, 0.25, 0, 0.95), P(0.05, 0.55, 0, 0.7));
			strands.push({
				points: fibre(P(-0.2, 0.4, 0.1), [-0.35, 0.9, 0.2], 1.1, 0.5, 0.25, 1),
				color: "cord",
				plied: 1,
			});
			strands.push({
				points: fibre(
					P(0.2, 0.45, -0.1),
					[0.3, 0.85, -0.3],
					0.75,
					0.5,
					0.25,
					2,
				),
				color: "cord",
				plied: 1,
			});
			for (let i = 0; i < 5; i++) {
				const a = (i / 5) * Math.PI * 2 + 0.4;
				strands.push({
					points: fibre(
						P(0.25 * Math.cos(a), 0.5 + i * 0.08, 0.25 * Math.sin(a)),
						[0.6 * Math.cos(a), 0.9, 0.6 * Math.sin(a)],
						0.9 + (i % 3) * 0.35,
						0.13,
						0.05,
						i * 3.1,
					),
					color: "cord",
					plied: 0,
				});
			}
			return { tail, strands, reach: 1.6 };
		}
		case "cut":
			// a clean square end
			tail.push(P(0, 0.3, 0, 1), P(0, 0.42, 0, 0.98));
			return { tail, strands, reach: 0.45 };
		case "ravelled": {
			// the two plies unwind and part over a couple of diameters
			tail.push(P(0, 0.2, 0, 0.95), P(0, 0.4, 0, 0.75));
			for (const s of [1, -1]) {
				const pts: KnotPoint[] = [];
				const n = 9;
				for (let i = 0; i <= n; i++) {
					const t = i / n;
					const a = s * Math.PI * 0.5 + t * Math.PI * 1.6 * s;
					const spread = 0.3 + 0.9 * t;
					pts.push(
						P(
							spread * Math.cos(a),
							0.3 + 2.2 * t,
							spread * Math.sin(a),
							0.55 - 0.15 * t,
						),
					);
				}
				strands.push({ points: pts, color: "cord", plied: 0.5 });
			}
			return { tail, strands, reach: 2.6 };
		}
		case "doubled": {
			// folded back on itself round a half circle a cord's width across,
			// and lying alongside the cord
			const back = primary ? 2.2 : 1.7;
			tail.push(P(0, 0.35, 0));
			for (const p of arcTo([0, 0.35, 0], [0, 1, 0], [1.12, 0.35, 0.1], 1, 1))
				tail.push(p);
			tail.push(P(1.1, 0.25 - back * 0.5, 0.06));
			tail.push(P(1.05, 0.25 - back, 0.02, 0.9));
			tail.push(P(1.0, 0.1 - back, 0, 0.6));
			return { tail, strands, reach: 1.2 };
		}
		case "unfinished":
			// not knotted, not broken, not cut: the plies just thin out
			tail.push(
				P(0, 0.4, 0, 0.95),
				P(0.03, 0.9, 0.02, 0.8),
				P(0.06, 1.3, 0.04, 0.55),
			);
			return { tail, strands, reach: 1.35 };
		case "twisted": {
			// plied down to a point
			const len = primary ? 3 : 2;
			for (let i = 1; i <= 6; i++) {
				const t = i / 6;
				tail.push(
					P(
						0.04 * Math.sin(t * 7),
						len * t,
						0.04 * Math.cos(t * 7),
						1 - 0.88 * t * t,
					),
				);
			}
			return { tail, strands, reach: len };
		}
		case "canutito": {
			// the tip bound with coloured thread: a tight wrapping
			tail.push(P(0, 0.4, 0), P(0, 1.9, 0), P(0, 2.2, 0, 0.85));
			const pts: KnotPoint[] = [];
			const turns = 7;
			const n = turns * 10;
			for (let i = 0; i <= n; i++) {
				const t = i / n;
				const a = t * turns * Math.PI * 2;
				pts.push(P(0.6 * Math.sin(a), 0.5 + 1.4 * t, 0.6 * Math.cos(a), 0.23));
			}
			strands.push({ points: pts, color: "accent", plied: 0 });
			return { tail, strands, reach: 2.25 };
		}
		case "tassel": {
			// a borla: a bound bundle of loose strands falling from the tip
			tail.push(P(0, 0.4, 0), P(0, 0.9, 0, 1.05));
			const bind: KnotPoint[] = [];
			for (let i = 0; i <= 40; i++) {
				const t = i / 40;
				const a = t * 5 * Math.PI * 2;
				bind.push(
					P(1.05 * Math.sin(a), 1.0 + 0.9 * t, 1.05 * Math.cos(a), 0.22),
				);
			}
			strands.push({ points: bind, color: "accent", plied: 0 });
			for (let i = 0; i < 16; i++) {
				const a = (i / 16) * Math.PI * 2;
				const rad = 0.35 + (i % 3) * 0.2;
				strands.push({
					points: fibre(
						P(rad * Math.cos(a), 1.2, rad * Math.sin(a)),
						[
							0.45 * Math.cos(a) + down[0] * 1.5,
							0.7 + down[1] * 1.5,
							0.45 * Math.sin(a) + down[2] * 1.5,
						],
						3.2 + (i % 4) * 0.5,
						0.32,
						0.28,
						i * 1.3,
						8,
					),
					color: "cord",
					plied: 1,
				});
			}
			return { tail, strands, reach: 6 };
		}
		case "wooden-bar": {
			// the cord's end is made off round a short wooden bar
			tail.push(
				P(0, 0.4, 0),
				P(0, 1.2, 0.4),
				P(0, 1.9, 1.5),
				P(0, 1.5, 2.6),
				P(0, 0.5, 2.9),
				P(-0.1, -0.3, 2.2),
			);
			tail.push(P(-0.15, -0.5, 1.0, 0.9), P(0.2, -0.3, 0.3, 0.7));
			strands.push({
				points: [
					P(-5.5, 1.4, 1.75, 2.6),
					P(-1.5, 1.4, 1.75, 2.75),
					P(1.5, 1.4, 1.75, 2.75),
					P(5.5, 1.4, 1.75, 2.6),
				],
				color: "wood",
				plied: 0,
			});
			return { tail, strands, reach: 3 };
		}
		case "needlework": {
			// bound in a needlework bundle: thread wrapped thickly over the end
			tail.push(P(0, 0.4, 0), P(0, 3.2, 0), P(0, 3.5, 0, 0.8));
			const pts: KnotPoint[] = [];
			const turns = 12;
			const n = turns * 10;
			for (let i = 0; i <= n; i++) {
				const t = i / n;
				const a = t * turns * Math.PI * 2;
				const rad = 0.75 + 0.35 * Math.sin(Math.PI * t);
				pts.push(P(rad * Math.sin(a), 0.5 + 2.8 * t, rad * Math.cos(a), 0.3));
			}
			strands.push({ points: pts, color: "thread", plied: 0 });
			return { tail, strands, reach: 3.5 };
		}
		case "affixed": {
			// hooked round another cord
			tail.push(
				P(0, 0.4, 0),
				P(0.1, 1.2, 0.6),
				P(0.1, 1.5, 1.6),
				P(0, 1.1, 2.4),
				P(-0.1, 0.3, 2.3),
				P(-0.1, -0.2, 1.5, 0.8),
			);
			strands.push({
				points: [
					P(-4, 1.1, 1.5, 1),
					P(-1.5, 1.3, 1.5, 1),
					P(1.5, 1.3, 1.5, 1),
					P(4, 1.1, 1.5, 1),
				],
				color: "thread",
				plied: 1,
			});
			return { tail, strands, reach: 2.5 };
		}
		default:
			// unknown: the tube just ends, rounded
			tail.push(P(0, 0.3, 0, 0.9), P(0, 0.5, 0, 0.6));
			return { tail, strands, reach: 0.5 };
	}
}
