/**
 * Coarse culling and level-of-detail selection for the instanced cord
 * draws, on the CPU, in runs of instances.
 *
 * An instanced draw costs in proportion to instances × template vertices
 * even for segments the vertex shader throws away (on the M3 a rejected
 * 46-vertex instance costs about as much as a drawn one), so segments must
 * not be submitted at all where they cannot show. The instance buffer is
 * cut into fixed chunks of CHUNK consecutive instances — cords keep their
 * slots, so a chunk is a stretch of one or two cords, compact in space —
 * each with a bounding sphere and its range of cord radii. Per frame every
 * chunk is tested against the frustum and sorted into the level-of-detail
 * bands its segments might fall in; neighbouring chunks of a band merge
 * into runs, and each run is drawn by pointing the instance attributes at
 * its first record (WebGL 2 has no base instance).
 *
 * The test is conservative: the vertex shader still decides each segment's
 * band exactly, so a chunk drawn in two bands draws each segment once.
 */

import type { Buffer, RenderPass } from "@luma.gl/core";
import type { Model } from "@luma.gl/engine";
import { F, FLOATS_PER_INSTANCE, MIN_PX } from "./shaders";

/** instances per chunk */
export const CHUNK = 256;

/** Instance runs [first, count, first, count, …] for one draw. */
export interface Runs {
	data: Int32Array;
	/** used entries (twice the run count) */
	length: number;
	/** instances in all runs */
	instances: number;
}

export function emptyRuns(): Runs {
	return { data: new Int32Array(64), length: 0, instances: 0 };
}

function pushRun(runs: Runs, first: number, count: number): void {
	const n = runs.length;
	if (n >= 2 && runs.data[n - 2] + runs.data[n - 1] === first) {
		runs.data[n - 1] += count;
	} else {
		if (n + 2 > runs.data.length) {
			const grown = new Int32Array(runs.data.length * 2);
			grown.set(runs.data);
			runs.data = grown;
		}
		runs.data[n] = first;
		runs.data[n + 1] = count;
		runs.length = n + 2;
	}
	runs.instances += count;
}

export class ChunkBounds {
	/** chunks in use */
	count = 0;
	private instances = 0;
	/** bounding box centre of the segment endpoints */
	private cx = new Float32Array(0);
	private cy = new Float32Array(0);
	private cz = new Float32Array(0);
	/** half the box diagonal: every segment midpoint lies within it of the centre */
	private half = new Float32Array(0);
	/** smallest and largest max(r0, r1) of the chunk's segments (0 = empty chunk) */
	private rLo = new Float32Array(0);
	private rHi = new Float32Array(0);

	/**
	 * Refresh the bounds from the packed instances: all of them, or only the
	 * chunks touching the dirty instance ranges [start, end).
	 */
	update(data: Float32Array, instances: number, ranges: number[] | null): void {
		const count = Math.ceil(instances / CHUNK);
		if (count > this.cx.length) {
			const size = Math.ceil(count * 1.25) + 16;
			this.cx = new Float32Array(size);
			this.cy = new Float32Array(size);
			this.cz = new Float32Array(size);
			this.half = new Float32Array(size);
			this.rLo = new Float32Array(size);
			this.rHi = new Float32Array(size);
			ranges = null;
		}
		if (instances !== this.instances) ranges = null;
		this.count = count;
		this.instances = instances;
		if (!ranges) {
			for (let c = 0; c < count; c++) this.measure(data, c);
			return;
		}
		let last = -1;
		for (let i = 0; i < ranges.length; i += 2) {
			const a = Math.max(Math.floor(ranges[i] / CHUNK), last + 1);
			const b = Math.min(Math.ceil(ranges[i + 1] / CHUNK), count);
			for (let c = a; c < b; c++) this.measure(data, c);
			last = Math.max(last, b - 1);
		}
	}

	private measure(d: Float32Array, c: number): void {
		const end = Math.min((c + 1) * CHUNK, this.instances);
		let x0 = Infinity;
		let y0 = Infinity;
		let z0 = Infinity;
		let x1 = -Infinity;
		let y1 = -Infinity;
		let z1 = -Infinity;
		let lo = Infinity;
		let hi = 0;
		for (let i = c * CHUNK; i < end; i++) {
			const o = i * FLOATS_PER_INSTANCE;
			const r = Math.max(d[o + F.r0], d[o + F.r1]);
			// zero-radius padding (empty slot space) draws nothing
			if (r <= 0) continue;
			if (r < lo) lo = r;
			if (r > hi) hi = r;
			for (let k = F.p0; k <= F.p1; k += 3) {
				const x = d[o + k];
				const y = d[o + k + 1];
				const z = d[o + k + 2];
				if (x < x0) x0 = x;
				if (x > x1) x1 = x;
				if (y < y0) y0 = y;
				if (y > y1) y1 = y;
				if (z < z0) z0 = z;
				if (z > z1) z1 = z;
			}
		}
		if (hi === 0) {
			this.rHi[c] = 0;
			return;
		}
		this.cx[c] = (x0 + x1) / 2;
		this.cy[c] = (y0 + y1) / 2;
		this.cz[c] = (z0 + z1) / 2;
		this.half[c] = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2;
		this.rLo[c] = lo;
		this.rHi[c] = hi;
	}

	/**
	 * Sort the chunks inside the frustum of `mvp` (column-major) into the
	 * bands [lo, hi) of on-screen radius (pixels) whose segments they may
	 * hold, as runs per band. `pxWorld` is one pixel's world size at unit
	 * distance (0: no bands, every visible chunk goes to band 0).
	 */
	cull(
		mvp: ArrayLike<number>,
		eye: ArrayLike<number>,
		pxWorld: number,
		bands: readonly (readonly [number, number])[],
		out: Runs[],
	): void {
		for (const runs of out) {
			runs.length = 0;
			runs.instances = 0;
		}
		const m = mvp;
		// clip planes as rows of the matrix: w ± x, w ± y, w + z (near)
		const planes = [
			[m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]],
			[m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]],
			[m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]],
			[m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]],
			[m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]],
		].map(([a, b, c, d]) => {
			const l = Math.hypot(a, b, c) || 1;
			return [a / l, b / l, c / l, d / l];
		});
		const [ex, ey, ez] = [eye[0], eye[1], eye[2]];
		for (let c = 0; c < this.count; c++) {
			const rHi = this.rHi[c];
			if (rHi === 0) continue;
			const x = this.cx[c];
			const y = this.cy[c];
			const z = this.cz[c];
			const h = this.half[c];
			const d = Math.hypot(x - ex, y - ey, z - ez);
			const far = d + h;
			// as the vertex shader widens it: lobes, gauge, the minimum width
			const reach = h + 1.25 * Math.max(rHi, MIN_PX * pxWorld * far) + 1e-3;
			let inside = true;
			for (const p of planes)
				if (p[0] * x + p[1] * y + p[2] * z + p[3] < -reach) {
					inside = false;
					break;
				}
			if (!inside) continue;
			const first = c * CHUNK;
			const count = Math.min(CHUNK, this.instances - first);
			if (pxWorld <= 0) {
				pushRun(out[0], first, count);
				continue;
			}
			// the chunk's range of on-screen radii, a little wide for float32 in the shader
			const pxHi = (1.01 * rHi) / (pxWorld * Math.max(d - h, 1e-3));
			const pxLo = (0.99 * this.rLo[c]) / (pxWorld * far);
			for (let b = 0; b < bands.length; b++)
				if (pxHi >= bands[b][0] && pxLo < bands[b][1])
					pushRun(out[b], first, count);
		}
	}
}

interface Accessor {
	location: number;
	size: number;
	type: number;
	normalized: boolean;
	integer: boolean;
	stride: number;
	offset: number;
}

/** luma's WebGL vertex array, as far as the ranged draw needs it */
interface GLVertexArray {
	attributes: unknown[];
	_getAccessor(location: number): Omit<Accessor, "location">;
}

const accessors = new WeakMap<Model, { buffer: Buffer; list: Accessor[] }>();

/** The attribute pointers of `model` that read `buffer`. */
function instanceAccessors(model: Model, buffer: Buffer): Accessor[] {
	const cached = accessors.get(model);
	if (cached && cached.buffer === buffer) return cached.list;
	const va = (model as unknown as { vertexArray: GLVertexArray }).vertexArray;
	const list: Accessor[] = [];
	va.attributes.forEach((b, location) => {
		if (b === buffer) list.push({ location, ...va._getAccessor(location) });
	});
	accessors.set(model, { buffer, list });
	return list;
}

/**
 * Draw `model` (instanced, indexed) for the instance runs only. luma sets
 * up the pipeline, bindings and uniforms as usual; its one
 * `drawElementsInstanced` is replaced, for this call, by one per run with
 * the model's instance attributes re-pointed at the run's first record.
 * Every draw of such a model must come through here: the pointers are
 * left at offset 0, where luma set them.
 */
export function drawRuns(
	gl: WebGL2RenderingContext,
	model: Model,
	pass: RenderPass,
	instanceBuffer: Buffer,
	runs: Runs,
): void {
	if (runs.length === 0) return;
	const list = instanceAccessors(model, instanceBuffer);
	const handle = (instanceBuffer as unknown as { handle: WebGLBuffer }).handle;
	const point = (base: number) => {
		for (const a of list) {
			const offset = a.offset + base * a.stride;
			if (a.integer)
				gl.vertexAttribIPointer(a.location, a.size, a.type, a.stride, offset);
			else
				gl.vertexAttribPointer(
					a.location,
					a.size,
					a.type,
					a.normalized,
					a.stride,
					offset,
				);
		}
	};
	const real = gl.drawElementsInstanced;
	const target = gl as unknown as {
		drawElementsInstanced: WebGL2RenderingContext["drawElementsInstanced"];
	};
	target.drawElementsInstanced = (mode, count, type, offset) => {
		gl.bindBuffer(gl.ARRAY_BUFFER, handle);
		for (let i = 0; i < runs.length; i += 2) {
			point(runs.data[i]);
			real.call(gl, mode, count, type, offset, runs.data[i + 1]);
		}
		point(0);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
	};
	try {
		// luma skips an instanced draw of zero instances; the runs are what count
		if (model.instanceCount === 0) model.setInstanceCount(1);
		model.draw(pass);
	} finally {
		// the own property shadowed the prototype's method
		delete (target as { drawElementsInstanced?: unknown })
			.drawElementsInstanced;
	}
}
