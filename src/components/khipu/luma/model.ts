import {
	type AttachKind,
	attachKind,
	cordDiameter,
	medianThickness,
	slantOf,
	type TermKind,
	termKind,
} from "#/lib/khipu/anatomy";
import { type CordPaint, paintsFor } from "#/lib/khipu/colors";
import { knotCurve } from "#/lib/khipu/knots3d";
import type { ColorTable, Cord, Khipu, Knot } from "#/lib/khipu/types";

/**
 * The physical model of a khipu for the lab: world layout at a true scale,
 * every cord as a simulated rope, and the recorded codes each piece of
 * cord carries so the path builder can draw them.
 */

export type V3 = [number, number, number];

/** World units per centimetre: 1 unit = 4 cm. */
export const CM = 0.25;
/** Drawn diameter of an ordinary cord (about 2.4 mm at this scale — life is ~2 mm). */
export const CORD_D = 0.064;
export const PRIMARY_D = CORD_D * 1.75;
/** A cord whose length was not recorded is drawn as a short stub. */
export const STUB_CM = 2.5;

export interface Particle {
	p: V3;
	old: V3;
	pinned: boolean;
}

export interface Paint {
	color: V3;
	accent: V3;
	/** 0 solid, 1 barber pole, 2 mottled, 3 striped, 4 tweed */
	pattern: number;
	/** [from, to] in cm along the cord, when spliced */
	range?: [number, number];
}

export interface Rope {
	id: number;
	cord: Cord;
	name: string;
	level: number;
	parentId?: number;
	kind: "pendant" | "subsidiary" | "top";
	/**
	 * cm along the carrier where the cord is drawn hitched. Recorded positions
	 * that coincide (or sit closer than a cord's width) are spread apart so
	 * each hitch has its own place on the carrier; the record is `cord.pos`.
	 */
	posCm: number;
	/** the cord's recorded length in cm (or the stub) */
	lengthCm: number;
	lengthKnown: boolean;
	/** drawn diameter */
	d: number;
	/** where the plain body begins (just below the hitch) */
	anchor: V3;
	/** the direction the body leaves the hitch in */
	hang: V3;
	/** from the carrier's axis at the attachment to the body's start */
	offset: V3;
	/** a subsidiary hangs on this side of its parent (+1 = the viewer's right) */
	side: 1 | -1;
	particles: Particle[];
	/** collision radius per particle: the cord's, fattened where a knot sits */
	radii: Float64Array;
	segmentLength: number;
	rigid: boolean;
	attach: AttachKind;
	twist: -1 | 0 | 1;
	term: TermKind;
	paints: Paint[];
	knots: Knot[];
	phase: number;
	/** at rest: not integrated or constrained, and a fixed obstacle to others */
	sleep: boolean;
	/** consecutive frames the rope has been nearly still */
	stillFrames: number;
	/** where the rope was when its creep check began (see `updateSleep`) */
	creepPose: Float64Array | null;
}

export interface PrimaryModel {
	x0: number;
	x1: number;
	d: number;
	twist: -1 | 0 | 1;
	structure: "P" | "B" | "W";
	paint: Paint;
	beginning: string | null;
	term: string | null;
}

/** Anything the collider treats as a chain of capsules. */
export interface Chain {
	id: number;
	parentId?: number;
	particles: Particle[];
	radii: Float64Array;
	rigid: boolean;
	/** a sleeping chain is not moved by contacts (see Rope.sleep) */
	sleep?: boolean;
	stillFrames?: number;
}

export interface LabModel {
	primary: PrimaryModel;
	ropes: Rope[];
	/** the primary's centreline as a static chain, so nothing passes through it */
	primaryChain: Chain;
	/** overall extent for framing the camera */
	bounds: { min: V3; max: V3 };
	/** fixed-step clock: unspent frame time and elapsed simulated seconds */
	clock: { acc: number; t: number };
	contacts: Contacts;
	/** what the ropes last came to rest under, and whether they all have */
	rest: RestState;
}

export interface RestState {
	/** the wind and gravity of the last `simulate`; a change wakes every rope */
	wind: number;
	gravity: number;
	/** seconds of still air since everything was last woken */
	still: number;
	/** simulated seconds when the creep check last looked */
	creepCheck: number;
	/** every free rope is asleep: `simulate` does nothing */
	asleep: boolean;
}

/** A recorded sRGB hex colour, decoded to the linear RGB the shader lights. */
function hexRgb(hex: string): V3 {
	const raw = hex.replace("#", "");
	const n = Number.parseInt(
		raw.length === 3
			? raw
					.split("")
					.map((c) => c + c)
					.join("")
			: raw,
		16,
	);
	const lin = (c: number) => {
		const v = c / 255;
		return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	};
	return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
}

const PATTERN_CODE: Record<NonNullable<CordPaint["pattern"]>, number> = {
	barberpole: 1,
	mottled: 2,
	striped: 3,
	tweed: 4,
};

function toPaint(p: CordPaint): Paint {
	return {
		color: hexRgb(p.base),
		accent: hexRgb(p.accent ?? p.base),
		pattern: p.accent && p.pattern ? PATTERN_CODE[p.pattern] : 0,
		range: p.range,
	};
}

export function primaryX(cm: number, primary: PrimaryModel): number {
	return primary.x0 + cm * CM;
}

/**
 * The primary's centreline. Real primary cords are never ruler-straight: the
 * weight of the pendants produces a shallow catenary and the plied yarn keeps
 * a small, uneven set from storage and handling.
 */
export function primaryPoint(x: number, primary: PrimaryModel): V3 {
	const t = (x - primary.x0) / Math.max(1e-6, primary.x1 - primary.x0);
	const edge = Math.sin(t * Math.PI);
	return [
		x,
		-edge * 0.11 + Math.sin(t * Math.PI * 5.0 + 0.4) * edge * 0.008,
		Math.sin(t * Math.PI * 3.0 - 0.7) * edge * 0.014,
	];
}

/* ---------------------------------------------------------------------------
   Hitch positions
   --------------------------------------------------------------------------- */

interface HitchSlot {
	name: string;
	pos: number;
	/** room the hitch needs on each side of its centre along the carrier, cm */
	left: number;
	right: number;
	out: number;
}

/**
 * Recorded attachment positions are rounded to the half centimetre, so
 * several cords often share one. On the object they sit side by side, each
 * hitch taking its own width of the carrier. Relax the slots apart, pushing
 * both neighbours equally so a cluster stays centred on its record; a
 * crowded carrier end pushes the whole row along until it fits.
 */
/** Width of a hitch slot along its carrier, cord diameters. */
const HITCH_SLOT = 1.7;
/** The narrowest a slot may be squeezed on a crowded carrier. */
const MIN_HITCH_SLOT = 1.45;

function spreadHitches(slots: HitchSlot[], lengthCm: number): void {
	slots.sort((a, b) => a.pos - b.pos);
	// A half-hitch collar is two passes of the cord side by side; neighbours
	// on a real primary nest into each other, so HITCH_SLOT diameters is a
	// compromise between collars running into each other and pendants being
	// pushed away from their recorded positions. Where the carrier is too
	// short even for that (hundreds of pendants on one primary) the slots
	// shrink to fit, but never below MIN_HITCH_SLOT.
	let total = 0;
	for (const s of slots) total += s.left + s.right;
	const fit = Math.max(
		MIN_HITCH_SLOT / HITCH_SLOT,
		Math.min(1, (0.95 * lengthCm) / Math.max(total, 1e-9)),
	);
	for (const s of slots) {
		s.left *= fit;
		s.right *= fit;
	}
	for (const s of slots) s.out = s.pos;
	for (let k = 0; k < 4000; k++) {
		let moved = false;
		for (let i = 1; i < slots.length; i++) {
			const a = slots[i - 1];
			const b = slots[i];
			const min = a.right + b.left;
			const gap = b.out - a.out;
			if (gap < min - 1e-4) {
				const push = (min - gap) / 2;
				a.out -= push;
				b.out += push;
				moved = true;
			}
		}
		const first = slots[0];
		const last = slots[slots.length - 1];
		if (first.out < first.left) {
			first.out = first.left;
			moved = true;
		}
		if (last.out > lengthCm - last.right) {
			last.out = Math.max(first.out, lengthCm - last.right);
			moved = true;
		}
		if (!moved) break;
	}
}

/* ---------------------------------------------------------------------------
   The model
   --------------------------------------------------------------------------- */

/** Particle spacing along a cord, cm. */
const NODE_CM = 0.85;
/** Points along the primary's static collision chain, cm apart. */
const PRIMARY_NODE_CM = 0.8;

export function makeModel(khipu: Khipu, colors: ColorTable): LabModel {
	const median = medianThickness(khipu.cords);
	const pendantsSpan = Math.max(
		0,
		...khipu.cords.filter((c) => c.level === 1).map((c) => c.pos ?? 0),
	);
	const primaryCm = Math.max(khipu.primary.length ?? 0, pendantsSpan + 1, 4);
	const primaryPaint = toPaint(paintsFor(khipu.primary.colorParsed, colors)[0]);
	const primary: PrimaryModel = {
		x0: (-primaryCm * CM) / 2,
		x1: (primaryCm * CM) / 2,
		d: PRIMARY_D,
		twist: slantOf(khipu.primary.twist),
		structure:
			khipu.primary.structure === "B" || khipu.primary.structure === "W"
				? khipu.primary.structure
				: "P",
		paint: primaryPaint,
		beginning: khipu.primary.beginning,
		term: khipu.primary.term,
	};

	// First pass: each cord's size and its slot on its carrier, so hitches
	// that share a recorded position can be spread before anything hangs.
	const cords = khipu.cords.filter((c) => c.level <= 4);
	const sizes = new Map<string, { d: number; lengthCm: number }>();
	const slotsByCarrier = new Map<string, HitchSlot[]>();
	const slotOf = new Map<string, HitchSlot>();
	for (const cord of cords) {
		const carrier = cord.level > 1 ? (cord.parent ?? "") : "";
		if (cord.level > 1 && !sizes.has(carrier)) continue;
		const d = cordDiameter(cord, CORD_D, median);
		const lengthCm =
			cord.length != null && cord.length > 0 ? cord.length : STUB_CM;
		sizes.set(cord.name, { d, lengthCm });
		let slots = slotsByCarrier.get(carrier);
		if (!slots) {
			slots = [];
			slotsByCarrier.set(carrier, slots);
		}
		const half = ((d / CM) * HITCH_SLOT) / 2;
		const slot: HitchSlot = {
			name: cord.name,
			pos: cord.pos ?? 0,
			left: half,
			right: half,
			out: cord.pos ?? 0,
		};
		slots.push(slot);
		slotOf.set(cord.name, slot);
		// a subsidiary hitched at the top of its parent hangs beside the
		// parent's own hitch, on the side its ordinal gives it (see below),
		// so the parent takes up both widths there
		const parentSlot = carrier ? slotOf.get(carrier) : undefined;
		if (parentSlot && (cord.pos ?? 0) < 2) {
			const room = (d / CM) * 1.1;
			if (cord.ordinal % 2 === 0) parentSlot.left += room;
			else parentSlot.right += room;
		}
	}
	const hitchCm = new Map<string, number>();
	for (const [carrier, slots] of slotsByCarrier) {
		const lengthCm = carrier ? (sizes.get(carrier)?.lengthCm ?? 0) : primaryCm;
		spreadHitches(slots, lengthCm);
		for (const s of slots) hitchCm.set(s.name, s.out);
	}

	const byName = new Map<string, Rope>();
	const ropes: Rope[] = [];
	for (let i = 0; i < cords.length; i++) {
		const cord = cords[i];
		const parent = cord.parent ? byName.get(cord.parent) : undefined;
		if (cord.level > 1 && !parent) continue;
		const size = sizes.get(cord.name);
		if (!size) continue;
		const isTop = cord.kind === "top" || cord.attach === "T";
		const { d, lengthCm } = size;
		const lengthKnown = cord.length != null && cord.length > 0;
		const posCm = hitchCm.get(cord.name) ?? cord.pos ?? 0;
		let hang: V3;
		let offset: V3;
		let carrierPoint: V3;
		const side: 1 | -1 = cord.ordinal % 2 === 0 ? -1 : 1;
		if (parent) {
			// hitched round the parent at posCm down it and hanging beside it,
			// alternate sides so a fan of subsidiaries spreads instead of
			// stacking (see subsidiaryHitchCurve)
			hang = [0, -1, 0];
			offset = [side * (parent.d / 2 + 0.55 * d), -1.3 * d, 0.12 * d];
			carrierPoint = pointAlongRope(parent, posCm);
		} else {
			// the body starts where the hitch lets it go: (R + 1.55) diameters
			// from the primary's axis (see hitchCurve)
			hang = isTop ? [0, 1, 0] : [0, -1, 0];
			offset = scale(hang, (primary.d / 2 / d + 1.55) * d);
			carrierPoint = primaryPoint(primaryX(posCm, primary), primary);
		}
		const anchor = add(carrierPoint, offset);
		const length = lengthCm * CM;
		// Dense particles matter more than a large render tube here: they let a
		// cord describe a long, soft arc instead of a handful of hinged sticks.
		const nodeCount = Math.max(
			7,
			Math.min(84, Math.round(lengthCm / NODE_CM) + 2),
		);
		const segmentLength = length / (nodeCount - 1);
		const particles: Particle[] = [];
		// start already hanging (a top cord stands along its hang direction),
		// with the slightest lean so the solver has something to settle
		const rest: V3 = isTop ? hang : [0, -1, 0];
		for (let j = 0; j < nodeCount; j++) {
			const p: V3 = add(anchor, scale(rest, segmentLength * j));
			const envelope = Math.sin((j / Math.max(1, nodeCount - 1)) * Math.PI);
			p[0] += envelope * 0.014 * Math.sin(j * 0.38 + i * 1.17);
			p[2] += envelope * 0.018 * Math.cos(j * 0.31 + i * 0.73);
			particles.push({ p, old: [...p] as V3, pinned: j === 0 || isTop });
		}
		const knots = [...cord.knots].sort((a, b) => a.pos - b.pos);
		// A knot is several diameters wide: the cord collides as a fat capsule
		// there, a little under the knot's true extent so neighbouring knots
		// can nestle the way they do on the object. The first stretch below
		// the hitch stays plain: hitches sit a cord's width apart and cannot
		// move, so a fat capsule there would be a contact nothing can resolve.
		const radii = new Float64Array(nodeCount).fill(d / 2);
		for (const knot of knots) {
			const curve = knotCurve(knot, isTop);
			const L = curve.length * d;
			const s0 = Math.max(0, knot.pos * CM - L / 2);
			const s1 = s0 + L;
			const rk = curve.radius * d * 0.75;
			const j0 = Math.max(2, Math.floor((s0 - d * 0.5) / segmentLength));
			const j1 = Math.min(
				nodeCount - 1,
				Math.ceil((s1 + d * 0.5) / segmentLength),
			);
			for (let j = j0; j <= j1; j++) radii[j] = Math.max(radii[j], rk);
		}
		const rope: Rope = {
			id: ropes.length,
			cord,
			name: cord.name,
			level: cord.level,
			parentId: parent?.id,
			kind: isTop ? "top" : parent ? "subsidiary" : "pendant",
			posCm,
			lengthCm,
			lengthKnown,
			d,
			anchor,
			hang,
			offset,
			side,
			particles,
			radii,
			segmentLength,
			rigid: isTop,
			attach: isTop ? "top" : attachKind(cord),
			twist: slantOf(cord.twist),
			term: termKind(cord.term),
			paints: paintsFor(cord.colorParsed, colors).map(toPaint),
			knots,
			phase: i * 0.61,
			sleep: false,
			stillFrames: 0,
			creepPose: null,
		};
		byName.set(cord.name, rope);
		ropes.push(rope);
	}

	// the primary as a static chain of capsules
	const primaryNodes = Math.max(2, Math.ceil(primaryCm / PRIMARY_NODE_CM) + 1);
	const primaryParticles: Particle[] = [];
	for (let j = 0; j < primaryNodes; j++) {
		const x = primary.x0 + ((primary.x1 - primary.x0) * j) / (primaryNodes - 1);
		const p = primaryPoint(x, primary);
		primaryParticles.push({ p, old: [...p] as V3, pinned: true });
	}
	const primaryChain: Chain = {
		id: -1,
		particles: primaryParticles,
		radii: new Float64Array(primaryNodes).fill(primary.d / 2),
		rigid: true,
	};

	const min: V3 = [primary.x0 - 0.5, -0.5, -0.5];
	const max: V3 = [primary.x1 + 0.5, 0.5, 0.5];
	for (const rope of ropes) {
		for (const p of rope.particles) {
			for (let k = 0; k < 3; k++) {
				min[k] = Math.min(min[k], p.p[k]);
				max[k] = Math.max(max[k], p.p[k]);
			}
		}
	}
	const contacts = new Contacts([
		primaryChain,
		...ropes.filter((r) => !r.rigid),
	]);
	return {
		primary,
		ropes,
		primaryChain,
		bounds: { min, max },
		clock: { acc: 0, t: 0 },
		contacts,
		rest: { wind: 0, gravity: 9.8, still: 0, creepCheck: 0, asleep: false },
	};
}

/* ---------------------------------------------------------------------------
   Vectors
   --------------------------------------------------------------------------- */

export function add(a: V3, b: V3): V3 {
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
export function sub(a: V3, b: V3): V3 {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function scale(a: V3, k: number): V3 {
	return [a[0] * k, a[1] * k, a[2] * k];
}
export function dot(a: V3, b: V3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function cross(a: V3, b: V3): V3 {
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	];
}
export function len(a: V3): number {
	return Math.hypot(a[0], a[1], a[2]);
}
export function normalize(a: V3): V3 {
	const l = len(a) || 1;
	return [a[0] / l, a[1] / l, a[2] / l];
}
export function mix(a: V3, b: V3, t: number): V3 {
	return [
		a[0] + (b[0] - a[0]) * t,
		a[1] + (b[1] - a[1]) * t,
		a[2] + (b[2] - a[2]) * t,
	];
}

/** A point `cm` down a rope's body, on its coarse polyline. */
export function pointAlongRope(rope: Rope, cm: number): V3 {
	const t = Math.max(0, Math.min(1, cm / Math.max(1e-6, rope.lengthCm)));
	const scaled = t * (rope.particles.length - 1);
	const i = Math.min(rope.particles.length - 2, Math.floor(scaled));
	return mix(rope.particles[i].p, rope.particles[i + 1].p, scaled - i);
}

/* ---------------------------------------------------------------------------
   Simulation: Verlet ropes hung from their hitches
   --------------------------------------------------------------------------- */

/** Fixed simulation step, seconds. */
const STEP = 1 / 120;
/** Most steps taken in one frame (a slow frame slows the khipu, never explodes it). */
const MAX_STEPS = 4;
/** Air drag on a fine cord, per second of velocity lost. */
const DRAG = 1.7;
/** Bending: pull toward the neighbours' midpoint, per step. */
const BEND = 0.08;
/**
 * Damping of a particle's motion relative to its neighbours along the cord,
 * per step. A cord swinging as a whole is hardly touched; the vibration of
 * one particle caught between a contact and its constraints dies at once.
 */
const RELATIVE_DAMPING = 0.35;
/**
 * Fraction of a contact's overlap removed per pass. Under one, so a cord
 * pressed by several neighbours at once settles between them instead of
 * being thrown back and forth.
 */
const CONTACT_RELAX = 0.6;
/**
 * Furthest any particle is moved by one contact in one pass. A deep overlap
 * (a subsidiary hung through its parent's knot) opens over many passes
 * instead of being shoved apart in one.
 */
const CONTACT_MAX_MOVE = CORD_D * 0.3;
/**
 * Fraction of the relative velocity at a contact removed per pass: cords
 * rubbing together lose their motion to each other (fibre on fibre has no
 * bounce and plenty of friction), which is what lets a bundle come to rest.
 */
const CONTACT_DAMPING = 0.5;

export function anchorsFor(model: LabModel): void {
	const { ropes, primary } = model;
	for (const rope of ropes) {
		const parent = rope.parentId != null ? ropes[rope.parentId] : undefined;
		const carrier = parent
			? pointAlongRope(parent, rope.posCm)
			: primaryPoint(primaryX(rope.posCm, primary), primary);
		const anchor = rope.anchor;
		anchor[0] = carrier[0] + rope.offset[0];
		anchor[1] = carrier[1] + rope.offset[1];
		anchor[2] = carrier[2] + rope.offset[2];
		const first = rope.particles[0];
		first.p[0] = anchor[0];
		first.p[1] = anchor[1];
		first.p[2] = anchor[2];
		first.old[0] = anchor[0];
		first.old[1] = anchor[1];
		first.old[2] = anchor[2];
		if (rope.rigid) {
			for (let j = 1; j < rope.particles.length; j++) {
				const p = rope.particles[j].p;
				const l = rope.segmentLength * j;
				p[0] = anchor[0] + rope.hang[0] * l;
				p[1] = anchor[1] + rope.hang[1] * l;
				// a top cord leans back a touch as it rises
				p[2] = anchor[2] + rope.hang[2] * l - 0.02 * l;
			}
		}
	}
}

/** scratch: one rope's velocities */
let vel = new Float64Array(3 * 128);

/**
 * One fixed step. Integration with drag and a coherent breeze, then the
 * constraints: a long-range attachment (no particle further from the hitch
 * than the cord between them allows, which removes the stretch-and-rebound
 * a chain of distance constraints alone leaves), the distance constraints
 * themselves, a little bending stiffness, contacts, and the constraints
 * twice more so contacts do not leave a cord stretched.
 */
function step(
	model: LabModel,
	gravity: number,
	wind: number,
	drag: number,
	h: number,
): void {
	const t = model.clock.t;
	const s2 = h * h;
	const keep = 1 - drag * h;
	const floor = model.bounds.min[1] - 2;
	anchorsFor(model);
	for (const rope of model.ropes) {
		if (rope.rigid) continue;
		// a cord hitched to one that moves cannot stay asleep
		if (
			rope.sleep &&
			rope.parentId != null &&
			!model.ropes[rope.parentId].sleep
		)
			wake(rope);
		if (rope.sleep) continue;
		const ps = rope.particles;
		const phase = rope.phase;
		// the breeze: slow, whole-cord gusts with a faint ripple down the cord
		const gustX =
			wind *
			(0.22 * Math.sin(0.7 * t + phase) +
				0.14 * Math.sin(1.9 * t + 0.37 * phase));
		const gustZ =
			wind * (0.1 * Math.cos(0.5 * t + 0.8 * phase) + 0.05 * Math.sin(2.3 * t));
		const n = ps.length;
		if (vel.length < n * 3) vel = new Float64Array(n * 6);
		for (let i = 0; i < n; i++) {
			const p = ps[i].p;
			const o = ps[i].old;
			vel[i * 3] = p[0] - o[0];
			vel[i * 3 + 1] = p[1] - o[1];
			vel[i * 3 + 2] = p[2] - o[2];
		}
		for (let i = 1; i < n; i++) {
			const p = ps[i].p;
			const o = ps[i].old;
			const a = Math.max(0, i - 1) * 3;
			const b = Math.min(n - 1, i + 1) * 3;
			const c = i * 3;
			const vx =
				(vel[c] + ((vel[a] + vel[b]) * 0.5 - vel[c]) * RELATIVE_DAMPING) * keep;
			const vy =
				(vel[c + 1] +
					((vel[a + 1] + vel[b + 1]) * 0.5 - vel[c + 1]) * RELATIVE_DAMPING) *
				keep;
			const vz =
				(vel[c + 2] +
					((vel[a + 2] + vel[b + 2]) * 0.5 - vel[c + 2]) * RELATIVE_DAMPING) *
				keep;
			o[0] = p[0];
			o[1] = p[1];
			o[2] = p[2];
			const ripple = 1 + 0.35 * Math.sin(3.1 * t + i * 0.11 + phase);
			p[0] += vx + gustX * ripple * s2;
			p[1] += vy - gravity * s2;
			p[2] += vz + gustZ * s2;
		}
	}
	constrain(model, true);
	model.contacts.resolve();
	// contacts have the last word: the passes after them carry no bending,
	// which would otherwise pull a cord straight back into its neighbour
	constrain(model, false);
	constrain(model, false);
	for (const rope of model.ropes) {
		if (rope.rigid || rope.sleep) continue;
		for (const q of rope.particles) {
			if (q.p[1] < floor) {
				q.p[1] = floor;
				q.old[0] = q.p[0] - (q.p[0] - q.old[0]) * 0.7;
				q.old[2] = q.p[2] - (q.p[2] - q.old[2]) * 0.7;
			}
		}
	}
	model.clock.t = t + h;
}

function constrain(model: LabModel, bend: boolean): void {
	for (const rope of model.ropes) {
		if (rope.rigid || rope.sleep) continue;
		const ps = rope.particles;
		const rest = rope.segmentLength;
		const a0 = ps[0].p;
		// long-range attachment: within i segments of the hitch
		for (let i = 1; i < ps.length; i++) {
			const p = ps[i].p;
			const dx = p[0] - a0[0];
			const dy = p[1] - a0[1];
			const dz = p[2] - a0[2];
			const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
			const max = rest * i;
			if (d > max) {
				const k = max / d;
				p[0] = a0[0] + dx * k;
				p[1] = a0[1] + dy * k;
				p[2] = a0[2] + dz * k;
			}
		}
		// distance constraints, from the hitch down
		for (let i = 0; i < ps.length - 1; i++) {
			const a = ps[i];
			const b = ps[i + 1];
			const dx = b.p[0] - a.p[0];
			const dy = b.p[1] - a.p[1];
			const dz = b.p[2] - a.p[2];
			const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
			const k = (d - rest) / d;
			if (a.pinned) {
				b.p[0] -= dx * k;
				b.p[1] -= dy * k;
				b.p[2] -= dz * k;
			} else {
				const h = k * 0.5;
				a.p[0] += dx * h;
				a.p[1] += dy * h;
				a.p[2] += dz * h;
				b.p[0] -= dx * h;
				b.p[1] -= dy * h;
				b.p[2] -= dz * h;
			}
		}
		if (!bend) continue;
		// a little bending stiffness keeps a hanging cord from kinking
		for (let i = 1; i < ps.length - 1; i++) {
			const prev = ps[i - 1].p;
			const next = ps[i + 1].p;
			const cur = ps[i].p;
			cur[0] += ((prev[0] + next[0]) * 0.5 - cur[0]) * BEND;
			cur[1] += ((prev[1] + next[1]) * 0.5 - cur[1]) * BEND;
			cur[2] += ((prev[2] + next[2]) * 0.5 - cur[2]) * BEND;
		}
	}
}

/**
 * Advance the khipu by a frame's worth of time in fixed steps, so the motion
 * is the same at any frame rate. Gravity is in world units per second
 * squared; `wind` is the breeze's strength. Ropes that have come to rest in
 * still air sleep (see `updateSleep`); when all of them do, nothing is
 * stepped at all.
 */
export function simulate(
	model: LabModel,
	dt: number,
	gravity: number,
	wind: number,
): void {
	const rest = model.rest;
	if (wind !== rest.wind || gravity !== rest.gravity) {
		rest.wind = wind;
		rest.gravity = gravity;
		wakeAll(model);
	}
	const clock = model.clock;
	clock.acc += Math.min(Math.max(0, dt), 1 / 20);
	let steps = Math.floor(clock.acc / STEP);
	clock.acc -= steps * STEP;
	if (steps > MAX_STEPS) {
		steps = MAX_STEPS;
		clock.acc = 0;
	}
	if (steps === 0) return;
	if (rest.asleep) {
		clock.t += steps * STEP;
		return;
	}
	for (let i = 0; i < steps; i++) step(model, gravity, wind, DRAG, STEP);
	if (wind === 0) rest.still += steps * STEP;
	updateSleep(model);
}

/**
 * Whether `simulate` still moves anything. False once every rope sleeps;
 * it turns true again as soon as something wakes them (a change of wind or
 * gravity, `resetRopes`, `settle`, `wakeAll`).
 */
export function simAwake(model: LabModel): boolean {
	return !model.rest.asleep;
}

/** Fastest particle speed below which a rope counts as still, units per second. */
const SLEEP_SPEED = 0.005;
/** Consecutive still frames before a rope sleeps. */
const SLEEP_FRAMES = 60;
/**
 * A few cords never quite stop: pressed between neighbours they creep a
 * hair's breadth per second, forever. After this much still air, a rope
 * that has wandered less than CREEP_REACH over a CREEP_WINDOW sleeps.
 */
const CREEP_AFTER = 5;
const CREEP_WINDOW = 1;
const CREEP_REACH = CORD_D * 0.1;
/** A contact that would push a sleeping rope further than this wakes it. */
const WAKE_PUSH = CORD_D * 0.1;

/**
 * After a frame's steps: count the frames each rope has been still (only in
 * still air, and only once whatever it hangs from is asleep too) and put
 * the ones that have been still long enough to sleep, velocity zeroed.
 */
function updateSleep(model: LabModel): void {
	const rest = model.rest;
	const calm = rest.wind === 0;
	const creepDue =
		calm &&
		rest.still >= CREEP_AFTER &&
		model.clock.t - rest.creepCheck >= CREEP_WINDOW;
	if (creepDue) rest.creepCheck = model.clock.t;
	const maxStep = SLEEP_SPEED * STEP;
	let asleep = true;
	for (const rope of model.ropes) {
		if (rope.rigid || rope.sleep) continue;
		const parent =
			rope.parentId != null ? model.ropes[rope.parentId] : undefined;
		const held = calm && (!parent || parent.sleep || parent.rigid);
		let fastest = 0;
		const ps = rope.particles;
		if (held)
			for (let i = 1; i < ps.length; i++) {
				const p = ps[i].p;
				const o = ps[i].old;
				const dx = p[0] - o[0];
				const dy = p[1] - o[1];
				const dz = p[2] - o[2];
				const v = dx * dx + dy * dy + dz * dz;
				if (v > fastest) fastest = v;
			}
		if (held && fastest < maxStep * maxStep) rope.stillFrames++;
		else rope.stillFrames = 0;
		let sleep = rope.stillFrames >= SLEEP_FRAMES;
		if (!sleep && creepDue && held) {
			if (rope.creepPose && crept(rope, rope.creepPose) < CREEP_REACH)
				sleep = true;
			else rope.creepPose = poseOf(rope, rope.creepPose);
		}
		if (sleep) {
			rope.sleep = true;
			rope.creepPose = null;
			for (const q of ps) {
				q.old[0] = q.p[0];
				q.old[1] = q.p[1];
				q.old[2] = q.p[2];
			}
		} else asleep = false;
	}
	rest.asleep = asleep;
}

function poseOf(rope: Rope, into: Float64Array | null): Float64Array {
	const ps = rope.particles;
	const out =
		into && into.length === ps.length * 3
			? into
			: new Float64Array(ps.length * 3);
	for (let i = 0; i < ps.length; i++) {
		out[i * 3] = ps[i].p[0];
		out[i * 3 + 1] = ps[i].p[1];
		out[i * 3 + 2] = ps[i].p[2];
	}
	return out;
}

/** Furthest any particle has moved from `pose`. */
function crept(rope: Rope, pose: Float64Array): number {
	const ps = rope.particles;
	let m = 0;
	for (let i = 0; i < ps.length; i++) {
		const p = ps[i].p;
		const dx = p[0] - pose[i * 3];
		const dy = p[1] - pose[i * 3 + 1];
		const dz = p[2] - pose[i * 3 + 2];
		m = Math.max(m, dx * dx + dy * dy + dz * dz);
	}
	return Math.sqrt(m);
}

function wake(chain: Chain): void {
	chain.sleep = false;
	chain.stillFrames = 0;
}

/** Wake every rope (the wind or gravity changed, or the ropes were moved). */
export function wakeAll(model: LabModel): void {
	for (const rope of model.ropes) {
		wake(rope);
		rope.creepPose = null;
	}
	model.rest.still = 0;
	model.rest.creepCheck = model.clock.t;
	model.rest.asleep = false;
}

/**
 * Let the khipu come to rest before it is first shown: cords find their
 * places against their neighbours instead of doing so in front of the
 * viewer. Runs still air with heavy damping, then stills every particle.
 */
export function settle(model: LabModel, seconds = 0.5, gravity = 9.8): void {
	wakeAll(model);
	// coarser steps than live: this is a warm-up, not a motion anyone sees
	const h = 1 / 60;
	const steps = Math.round(seconds / h);
	for (let i = 0; i < steps; i++) step(model, gravity, 0, DRAG * 3, h);
	for (const rope of model.ropes) {
		for (const q of rope.particles) {
			q.old[0] = q.p[0];
			q.old[1] = q.p[1];
			q.old[2] = q.p[2];
		}
	}
}

export function resetRopes(model: LabModel): void {
	wakeAll(model);
	for (const rope of model.ropes) {
		const anchor = rope.particles[0].p;
		const rest: V3 = rope.rigid ? rope.hang : [0, -1, 0];
		for (let i = 1; i < rope.particles.length; i++) {
			const p = add(anchor, scale(rest, rope.segmentLength * i));
			rope.particles[i].p = p;
			rope.particles[i].old = [...p] as V3;
		}
	}
	model.clock.acc = 0;
}

/* ---------------------------------------------------------------------------
   Contacts: cords as chains of capsules that cannot pass through each other
   --------------------------------------------------------------------------- */

/** Grid cell for the broad phase, world units (about two knot widths). */
const CELL = 0.25;
const INV_CELL = 1 / CELL;
/** Most cells one segment's box can cover (3 per axis). */
const CELLS_PER_SEGMENT = 27;
/**
 * Boxes are grown by this much and the candidate pairs kept until some
 * particle has moved that far since they were found (half a cord's width).
 */
const MARGIN = CORD_D * 0.5;

/**
 * Segment-versus-segment contacts between every pair of chains.
 *
 * Broad phase: the segments' boxes (grown by their radii and a margin) are
 * binned into a hashed grid by counting sort and every pair sharing a cell
 * is kept as a candidate. That list is reused, pass after pass, until a
 * particle has moved further than the margin; a swaying khipu rebuilds it
 * every second or so, a still one never.
 *
 * Narrow phase, every pass: each candidate pair is tested as two capsules
 * and pushed apart at their closest points, the correction shared by the
 * four particles in proportion to how much each carries the contact point.
 * Pinned particles take none of it. Positions are worked on in flat arrays
 * and written back to the particles as they change. Nothing is allocated
 * per pass.
 */
export class Contacts {
	private readonly chains: Chain[];
	/** one entry per particle of every chain, in chain order */
	private readonly parts: Particle[] = [];
	private readonly pos: Float64Array;
	private readonly ref: Float64Array;
	private readonly rad: Float64Array;
	private readonly free: Float64Array;
	/** per segment: its chain and its first particle's flat index */
	private readonly segChain: Int32Array;
	private readonly segFirst: Int32Array;
	private readonly segIndex: Int32Array;
	private readonly n: number;
	/** per segment: box (6) and cell range (6) */
	private readonly box: Float64Array;
	private readonly cells: Int32Array;
	private readonly mask: number;
	private readonly cellStart: Int32Array;
	private readonly entries: Int32Array;
	private pairs = new Int32Array(1 << 14);
	private pairCount = 0;
	private built = false;
	/** contacts resolved on the last pass */
	resolved = 0;
	/** candidate pairs on the current list, and whether the last pass rebuilt it */
	candidates = 0;
	rebuilt = false;

	constructor(chains: Chain[]) {
		this.chains = chains;
		let n = 0;
		let m = 0;
		for (const c of chains) {
			n += Math.max(0, c.particles.length - 1);
			m += c.particles.length;
		}
		this.n = n;
		this.pos = new Float64Array(m * 3);
		this.ref = new Float64Array(m * 3);
		this.rad = new Float64Array(m);
		this.free = new Float64Array(m);
		this.segChain = new Int32Array(n);
		this.segFirst = new Int32Array(n);
		this.segIndex = new Int32Array(n);
		let k = 0;
		let q = 0;
		for (let c = 0; c < chains.length; c++) {
			const chain = chains[c];
			for (let i = 0; i < chain.particles.length; i++) {
				const particle = chain.particles[i];
				this.parts.push(particle);
				this.rad[q] = chain.radii[i];
				this.free[q] = particle.pinned ? 0 : 1;
				if (i < chain.particles.length - 1) {
					this.segChain[k] = c;
					this.segFirst[k] = q;
					this.segIndex[k] = i;
					k++;
				}
				q++;
			}
		}
		this.box = new Float64Array(n * 6);
		this.cells = new Int32Array(n * 6);
		let size = 1024;
		while (size < n * 4) size *= 2;
		this.mask = size - 1;
		this.cellStart = new Int32Array(size + 1);
		this.entries = new Int32Array(Math.max(1, n * CELLS_PER_SEGMENT));
	}

	/** Push every overlapping pair apart once. Returns whether anything moved. */
	resolve(): boolean {
		if (this.n < 2) return false;
		const { parts, pos, ref } = this;
		let moved = !this.built;
		for (let q = 0; q < parts.length; q++) {
			const p = parts[q].p;
			const o = q * 3;
			pos[o] = p[0];
			pos[o + 1] = p[1];
			pos[o + 2] = p[2];
			if (
				!moved &&
				(Math.abs(p[0] - ref[o]) > MARGIN ||
					Math.abs(p[1] - ref[o + 1]) > MARGIN ||
					Math.abs(p[2] - ref[o + 2]) > MARGIN)
			)
				moved = true;
		}
		this.rebuilt = moved;
		if (moved) this.rebuild();
		const pairs = this.pairs;
		let resolved = 0;
		for (let k = 0; k < this.pairCount; k++)
			if (this.separate(pairs[k * 2], pairs[k * 2 + 1])) resolved++;
		this.resolved = resolved;
		return resolved > 0;
	}

	/** Bin the segments and list the candidate pairs. */
	private rebuild(): void {
		const { n, pos, rad, segFirst, segChain, segIndex } = this;
		const chains = this.chains;
		const box = this.box;
		const cells = this.cells;
		const cellStart = this.cellStart;
		const entries = this.entries;
		const mask = this.mask;
		this.ref.set(pos);
		this.built = true;
		cellStart.fill(0);
		for (let s = 0; s < n; s++) {
			const a = segFirst[s] * 3;
			const b = a + 3;
			const r = Math.max(rad[segFirst[s]], rad[segFirst[s] + 1]) + MARGIN;
			const o = s * 6;
			box[o] = Math.min(pos[a], pos[b]) - r;
			box[o + 1] = Math.min(pos[a + 1], pos[b + 1]) - r;
			box[o + 2] = Math.min(pos[a + 2], pos[b + 2]) - r;
			box[o + 3] = Math.max(pos[a], pos[b]) + r;
			box[o + 4] = Math.max(pos[a + 1], pos[b + 1]) + r;
			box[o + 5] = Math.max(pos[a + 2], pos[b + 2]) + r;
			const x0 = Math.floor(box[o] * INV_CELL);
			const y0 = Math.floor(box[o + 1] * INV_CELL);
			const z0 = Math.floor(box[o + 2] * INV_CELL);
			cells[o] = x0;
			cells[o + 1] = y0;
			cells[o + 2] = z0;
			cells[o + 3] = Math.min(x0 + 2, Math.floor(box[o + 3] * INV_CELL));
			cells[o + 4] = Math.min(y0 + 2, Math.floor(box[o + 4] * INV_CELL));
			cells[o + 5] = Math.min(z0 + 2, Math.floor(box[o + 5] * INV_CELL));
			for (let x = x0; x <= cells[o + 3]; x++)
				for (let y = y0; y <= cells[o + 4]; y++)
					for (let z = z0; z <= cells[o + 5]; z++)
						cellStart[hashCell(x, y, z) & mask]++;
		}
		let sum = 0;
		for (let h = 0; h <= mask; h++) {
			sum += cellStart[h];
			cellStart[h] = sum;
		}
		cellStart[mask + 1] = sum;
		for (let s = 0; s < n; s++) {
			const o = s * 6;
			for (let x = cells[o]; x <= cells[o + 3]; x++)
				for (let y = cells[o + 1]; y <= cells[o + 4]; y++)
					for (let z = cells[o + 2]; z <= cells[o + 5]; z++)
						entries[--cellStart[hashCell(x, y, z) & mask]] = s;
		}
		let count = 0;
		let pairs = this.pairs;
		for (let s = 0; s < n; s++) {
			const o = s * 6;
			const sMinX = box[o];
			const sMinY = box[o + 1];
			const sMinZ = box[o + 2];
			const sMaxX = box[o + 3];
			const sMaxY = box[o + 4];
			const sMaxZ = box[o + 5];
			const ca = segChain[s];
			const ia = segIndex[s];
			for (let x = cells[o]; x <= cells[o + 3]; x++)
				for (let y = cells[o + 1]; y <= cells[o + 4]; y++)
					for (let z = cells[o + 2]; z <= cells[o + 5]; z++) {
						const h = hashCell(x, y, z) & mask;
						const end = cellStart[h + 1];
						for (let e = cellStart[h]; e < end; e++) {
							const t = entries[e];
							if (t <= s) continue;
							const u = t * 6;
							if (
								box[u] > sMaxX ||
								box[u + 3] < sMinX ||
								box[u + 1] > sMaxY ||
								box[u + 4] < sMinY ||
								box[u + 2] > sMaxZ ||
								box[u + 5] < sMinZ
							)
								continue;
							// a pair sharing several cells is listed once, from the
							// lowest cell both cover
							if (
								x !== Math.max(cells[o], cells[u]) ||
								y !== Math.max(cells[o + 1], cells[u + 1]) ||
								z !== Math.max(cells[o + 2], cells[u + 2])
							)
								continue;
							const cb = segChain[t];
							const ib = segIndex[t];
							if (ca === cb) {
								if (Math.abs(ia - ib) < 3) continue;
							} else {
								// a cord's first stretch sits beside its parent by construction
								const A = chains[ca];
								const B = chains[cb];
								if (A.parentId === B.id && ia < 2) continue;
								if (B.parentId === A.id && ib < 2) continue;
							}
							if (count * 2 + 2 > pairs.length) {
								const next = new Int32Array(pairs.length * 2);
								next.set(pairs);
								pairs = next;
								this.pairs = next;
							}
							pairs[count * 2] = s;
							pairs[count * 2 + 1] = t;
							count++;
						}
					}
		}
		this.pairCount = count;
		this.candidates = count;
	}

	/** Capsule-capsule: closest points, then push apart. */
	private separate(sa: number, sb: number): boolean {
		const { pos, rad, free } = this;
		const chainA = this.chains[this.segChain[sa]];
		const chainB = this.chains[this.segChain[sb]];
		// a sleeping rope is a fixed obstacle; two of them have nothing to do
		const sleepA = chainA.sleep === true;
		const sleepB = chainB.sleep === true;
		if (sleepA && sleepB) return false;
		const qa0 = this.segFirst[sa];
		const qa1 = qa0 + 1;
		const qb0 = this.segFirst[sb];
		const qb1 = qb0 + 1;
		const a0 = qa0 * 3;
		const a1 = qa1 * 3;
		const b0 = qb0 * 3;
		const b1 = qb1 * 3;
		const d1x = pos[a1] - pos[a0];
		const d1y = pos[a1 + 1] - pos[a0 + 1];
		const d1z = pos[a1 + 2] - pos[a0 + 2];
		const d2x = pos[b1] - pos[b0];
		const d2y = pos[b1 + 1] - pos[b0 + 1];
		const d2z = pos[b1 + 2] - pos[b0 + 2];
		const rx = pos[a0] - pos[b0];
		const ry = pos[a0 + 1] - pos[b0 + 1];
		const rz = pos[a0 + 2] - pos[b0 + 2];
		const a = d1x * d1x + d1y * d1y + d1z * d1z;
		const e = d2x * d2x + d2y * d2y + d2z * d2z;
		if (a < 1e-12 || e < 1e-12) return false;
		const f = d2x * rx + d2y * ry + d2z * rz;
		const c = d1x * rx + d1y * ry + d1z * rz;
		const b = d1x * d2x + d1y * d2y + d1z * d2z;
		const denom = a * e - b * b;
		let s = denom > 1e-12 ? clamp01((b * f - c * e) / denom) : 0;
		let t = (b * s + f) / e;
		if (t < 0) {
			t = 0;
			s = clamp01(-c / a);
		} else if (t > 1) {
			t = 1;
			s = clamp01((b - c) / a);
		}
		let nx = rx + d1x * s - d2x * t;
		let ny = ry + d1y * s - d2y * t;
		let nz = rz + d1z * s - d2z * t;
		const dist = Math.sqrt(nx * nx + ny * ny + nz * nz);
		const ra = rad[qa0] * (1 - s) + rad[qa1] * s;
		const rb = rad[qb0] * (1 - t) + rad[qb1] * t;
		const depth = ra + rb - dist;
		if (depth <= 0) return false;
		if (dist < 1e-6) {
			// coincident: cords hung on the same spot part front and back
			nx = 0;
			ny = 0;
			nz = 1;
		} else {
			nx /= dist;
			ny /= dist;
			nz /= dist;
			// Two hanging cords pressed together side by side cannot part
			// sideways: their hitches hold them. They slip past each other
			// front and back instead, so a sideways contact between nearly
			// parallel cords is steered toward the viewer's axis.
			const ca = this.segChain[sa];
			const cb = this.segChain[sb];
			if (ca !== cb && Math.abs(ny) < 0.35 && b * b > 0.85 * a * e) {
				// which goes in front is settled once the pair has parted; until
				// then, by which cord it is, so the choice cannot flip each pass
				const side =
					Math.abs(nz) > 0.3 ? Math.sign(nz) : (ca + cb) % 2 === 0 ? 1 : -1;
				nz += side * 0.6;
				const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
				nx /= l;
				ny /= l;
				nz /= l;
			}
		}
		let wa0 = free[qa0] * (1 - s);
		let wa1 = free[qa1] * s;
		let wb0 = free[qb0] * (1 - t);
		let wb1 = free[qb1] * t;
		if (sleepA || sleepB) {
			// how far the sleeper would be pushed were it awake: far enough
			// and it wakes, otherwise it holds like a pinned particle
			const Wf = wa0 * wa0 + wa1 * wa1 + wb0 * wb0 + wb1 * wb1;
			const push =
				Math.min(
					(depth * CONTACT_RELAX) / Math.max(Wf, 0.25),
					CONTACT_MAX_MOVE / Math.max(wa0, wa1, wb0, wb1, 1e-9),
				) * (sleepA ? Math.max(wa0, wa1) : Math.max(wb0, wb1));
			if (push > WAKE_PUSH) wake(sleepA ? chainA : chainB);
			else if (sleepA) wa0 = wa1 = 0;
			else wb0 = wb1 = 0;
		}
		// The contact point moves by `depth` when lambda = depth / W, but next
		// to a pinned particle W goes to zero and the free one would be flung:
		// cap it, and let a few more passes finish the job instead.
		const W = wa0 * wa0 + wa1 * wa1 + wb0 * wb0 + wb1 * wb1;
		// a contact right at two hitches has nothing free to move: leave it
		if (W < 0.02) return false;
		const lambda = Math.min(
			(depth * CONTACT_RELAX) / Math.max(W, 0.25),
			CONTACT_MAX_MOVE / Math.max(wa0, wa1, wb0, wb1),
		);
		if (wa0 > 0) this.shift(qa0, nx, ny, nz, lambda * wa0);
		if (wa1 > 0) this.shift(qa1, nx, ny, nz, lambda * wa1);
		if (wb0 > 0) this.shift(qb0, nx, ny, nz, -lambda * wb0);
		if (wb1 > 0) this.shift(qb1, nx, ny, nz, -lambda * wb1);
		// damp the relative motion of the two contact points (all directions)
		const pa0 = this.parts[qa0];
		const pa1 = this.parts[qa1];
		const pb0 = this.parts[qb0];
		const pb1 = this.parts[qb1];
		const dvx =
			vOf(pa0, 0) * (1 - s) +
			vOf(pa1, 0) * s -
			(vOf(pb0, 0) * (1 - t) + vOf(pb1, 0) * t);
		const dvy =
			vOf(pa0, 1) * (1 - s) +
			vOf(pa1, 1) * s -
			(vOf(pb0, 1) * (1 - t) + vOf(pb1, 1) * t);
		const dvz =
			vOf(pa0, 2) * (1 - s) +
			vOf(pa1, 2) * s -
			(vOf(pb0, 2) * (1 - t) + vOf(pb1, 2) * t);
		const mu = CONTACT_DAMPING / Math.max(W, 0.25);
		if (wa0 > 0) slow(pa0, dvx, dvy, dvz, mu * wa0);
		if (wa1 > 0) slow(pa1, dvx, dvy, dvz, mu * wa1);
		if (wb0 > 0) slow(pb0, dvx, dvy, dvz, -mu * wb0);
		if (wb1 > 0) slow(pb1, dvx, dvy, dvz, -mu * wb1);
		return true;
	}

	/**
	 * Move a particle out of a contact. Only the position moves: in Verlet
	 * terms that cancels the approach, so a resting contact is at rest and
	 * nothing bounces.
	 */
	private shift(q: number, nx: number, ny: number, nz: number, k: number) {
		const o = q * 3;
		const pos = this.pos;
		pos[o] += nx * k;
		pos[o + 1] += ny * k;
		pos[o + 2] += nz * k;
		const p = this.parts[q].p;
		p[0] = pos[o];
		p[1] = pos[o + 1];
		p[2] = pos[o + 2];
	}
}

function vOf(q: Particle, k: number): number {
	return q.p[k] - q.old[k];
}

/** Change a particle's velocity by moving its history, leaving its position alone. */
function slow(q: Particle, dvx: number, dvy: number, dvz: number, k: number) {
	q.old[0] += dvx * k;
	q.old[1] += dvy * k;
	q.old[2] += dvz * k;
}

function clamp01(v: number): number {
	return v < 0 ? 0 : v > 1 ? 1 : v;
}

function hashCell(x: number, y: number, z: number): number {
	return ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0;
}
