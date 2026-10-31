/**
 * The lab's free camera and the maths the controls share. Yaw 0 looks down
 * −z (at the recto face of the khipu); positive yaw turns right, positive
 * pitch looks up. There is no roll, so "up" is always the world's up.
 */

import { Matrix4 } from "@math.gl/core";
import {
	add,
	cross,
	dot,
	type LabModel,
	mix,
	normalize,
	scale,
	sub,
	type V3,
} from "./model";
import { nearestCordDistance } from "./paths";

export const FOVY = Math.PI / 4.4;
export const NEAR = 0.02;
export const FAR = 80;
export const WORLD_UP: V3 = [0, 1, 0];
/** how far the view may tip before "up" stops meaning anything */
export const PITCH_LIMIT = 1.5;
/** dragging turns the view a little faster than 1:1 with the world */
export const LOOK_GAIN = 1.25;
/** fly speed in world units per second per unit of clearance (see `flySpeed`) */
const FLY_GAIN = 0.85;

export const NAV_KEYS = new Set([
	"KeyW",
	"KeyA",
	"KeyS",
	"KeyD",
	"KeyQ",
	"KeyE",
	"KeyC",
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"PageUp",
	"PageDown",
	"Space",
	"ShiftLeft",
	"ShiftRight",
]);

export interface Camera {
	eye: V3;
	yaw: number;
	pitch: number;
}

export function forwardOf(cam: Camera): V3 {
	const c = Math.cos(cam.pitch);
	return [Math.sin(cam.yaw) * c, Math.sin(cam.pitch), -Math.cos(cam.yaw) * c];
}

export function rightOf(cam: Camera): V3 {
	return [Math.cos(cam.yaw), 0, Math.sin(cam.yaw)];
}

export function upOf(cam: Camera): V3 {
	return cross(rightOf(cam), forwardOf(cam));
}

export function lookAtCamera(eye: V3, target: V3): Camera {
	const f = normalize(sub(target, eye));
	return {
		eye,
		yaw: Math.atan2(f[0], -f[2]),
		pitch: Math.asin(Math.max(-1, Math.min(1, f[1]))),
	};
}

/** The classic orbit parameters, as a free camera looking at the target. */
export function orbitCamera(
	target: V3,
	yaw: number,
	pitch: number,
	dist: number,
): Camera {
	return lookAtCamera(
		[
			target[0] + Math.sin(yaw) * Math.cos(pitch) * dist,
			target[1] + Math.sin(pitch) * dist,
			target[2] + Math.cos(yaw) * Math.cos(pitch) * dist,
		],
		target,
	);
}

export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Rotate `v` about the unit axis `axis` by `angle` (Rodrigues). */
export function rotateAbout(v: V3, axis: V3, angle: number): V3 {
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	const k = dot(axis, v) * (1 - c);
	const x = cross(axis, v);
	return [
		v[0] * c + x[0] * s + axis[0] * k,
		v[1] * c + x[1] * s + axis[1] * k,
		v[2] * c + x[2] * s + axis[2] * k,
	];
}

export function distance(a: V3, b: V3): number {
	const d = sub(a, b);
	return Math.sqrt(dot(d, d));
}

export function boundsCentre(model: LabModel): V3 {
	return mix(model.bounds.min, model.bounds.max, 0.5);
}

/** The whole khipu, front on, filling the frame. */
export function fitCamera(model: LabModel, aspect: number): Camera {
	const { min, max } = model.bounds;
	const w = max[0] - min[0];
	const h = max[1] - min[1];
	const tan = Math.tan(FOVY / 2);
	const far = Math.max(w / (2 * tan * aspect), h / (2 * tan)) * 1.12 + 1;
	return orbitCamera(
		[(min[0] + max[0]) / 2, (min[1] + max[1]) / 2 + h * 0.04, 0],
		-0.1,
		0.06,
		far,
	);
}

/** View and projection for a camera at an aspect ratio. */
export function viewProjection(
	cam: Camera,
	aspect: number,
): { view: Matrix4; projection: Matrix4; mvp: Matrix4 } {
	const view = new Matrix4().lookAt({
		eye: cam.eye,
		center: add(cam.eye, forwardOf(cam)),
		up: WORLD_UP,
	});
	const projection = new Matrix4().perspective({
		fovy: FOVY,
		aspect,
		near: NEAR,
		far: FAR,
	});
	const mvp = new Matrix4(projection).multiplyRight(view);
	return { view, projection, mvp };
}

/**
 * How fast to fly: proportional to the clearance from the nearest cord, so
 * the whole khipu sweeps past from afar and a knot can be approached slowly.
 */
export function flySpeed(model: LabModel, eye: V3, fast: boolean): number {
	const clearance = Math.min(8, Math.max(0.2, nearestCordDistance(model, eye)));
	return clearance * FLY_GAIN * (fast ? 3 : 1);
}

/**
 * Advance the camera by one frame: keyboard flight (W/S along the view, A/D
 * across it, Q/E down/up, eased velocity) and easing toward a goal (focus,
 * reset). Returns the goal still pending, or null once it is reached. True
 * in `moved` when the eye or heading changed. With `snap` (reduced motion)
 * a goal is reached at once instead of eased toward, and flight starts and
 * stops without easing.
 */
export function stepCamera(
	cam: Camera,
	goal: Camera | null,
	keys: Set<string>,
	velocity: V3,
	model: LabModel,
	dt: number,
	{ snap = false }: { snap?: boolean } = {},
): { cam: Camera; goal: Camera | null; moved: boolean } {
	const step = Math.min(dt, 0.1);
	const axis = (minus: string[], plus: string[]) =>
		(plus.some((k) => keys.has(k)) ? 1 : 0) -
		(minus.some((k) => keys.has(k)) ? 1 : 0);
	const across = axis(["KeyA", "ArrowLeft"], ["KeyD", "ArrowRight"]);
	const rise = axis(["KeyQ", "KeyC", "PageDown"], ["KeyE", "Space", "PageUp"]);
	const along = axis(["KeyS", "ArrowDown"], ["KeyW", "ArrowUp"]);
	let wanted: V3 = [0, 0, 0];
	let moved = false;
	if (across || rise || along) {
		goal = null;
		const heading = normalize(
			add(
				add(scale(rightOf(cam), across), scale(WORLD_UP, rise)),
				scale(forwardOf(cam), along),
			),
		);
		const fast = keys.has("ShiftLeft") || keys.has("ShiftRight");
		wanted = scale(heading, flySpeed(model, cam.eye, fast));
	}
	const ease = snap ? 1 : 1 - Math.exp(-step * 9);
	velocity[0] += (wanted[0] - velocity[0]) * ease;
	velocity[1] += (wanted[1] - velocity[1]) * ease;
	velocity[2] += (wanted[2] - velocity[2]) * ease;
	if (dot(velocity, velocity) > 1e-8) {
		cam.eye = add(cam.eye, scale(velocity, step));
		moved = true;
	} else velocity[0] = velocity[1] = velocity[2] = 0;

	if (goal && snap) {
		return { cam: { ...goal }, goal: null, moved: true };
	}
	if (goal) {
		moved = true;
		const k = 1 - Math.exp(-step * 7);
		cam.eye = mix(cam.eye, goal.eye, k);
		cam.yaw += wrapAngle(goal.yaw - cam.yaw) * k;
		cam.pitch += (goal.pitch - cam.pitch) * k;
		if (
			distance(cam.eye, goal.eye) < 0.002 &&
			Math.abs(wrapAngle(goal.yaw - cam.yaw)) < 0.001 &&
			Math.abs(goal.pitch - cam.pitch) < 0.001
		) {
			cam = { ...goal };
			goal = null;
		}
	}
	return { cam, goal, moved };
}

/**
 * A camera as a short, URL-safe string: "x,y,z,yaw,pitch", positions to a
 * centimetre-ish (1/100 unit = 0.4 mm) and angles to a milliradian.
 */
export function formatCam(cam: Camera): string {
	const r = (v: number, d: number) => {
		const s = v.toFixed(d).replace(/\.?0+$/, "");
		return s === "-0" ? "0" : s;
	};
	return [
		r(cam.eye[0], 2),
		r(cam.eye[1], 2),
		r(cam.eye[2], 2),
		r(wrapAngle(cam.yaw), 3),
		r(cam.pitch, 3),
	].join(",");
}

/** The inverse of `formatCam`, or null when the string is not one. */
export function parseCam(text: string | undefined | null): Camera | null {
	if (!text) return null;
	const parts = text.split(",").map(Number);
	if (parts.length !== 5 || parts.some((v) => !Number.isFinite(v))) return null;
	const [x, y, z, yaw, pitch] = parts;
	if ([x, y, z].some((v) => Math.abs(v) > FAR)) return null;
	return {
		eye: [x, y, z],
		yaw: wrapAngle(yaw),
		pitch: Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch)),
	};
}
