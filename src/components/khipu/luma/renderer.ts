/**
 * The lab's GPU side: the device, the instanced cord model and its buffers,
 * and the passes that draw a frame. The React component owns the
 * simulation, the camera and the interface; each frame it calls `update`
 * (turn the sim state into packed instances and put them on the GPU) and
 * then `render` (draw them for a camera).
 */

import { Buffer, type Device, luma } from "@luma.gl/core";
import { Model } from "@luma.gl/engine";
import { webgl2Adapter } from "@luma.gl/webgl";
import type { Matrix4 } from "@math.gl/core";
import { ChunkBounds, drawRuns, emptyRuns, type Runs } from "./chunks";
import type { LabModel, V3 } from "./model";
import {
	Backdrop,
	KEY_LIGHT,
	SHADOW_SIDES,
	SHADOW_SIZE,
	ShadowPass,
} from "./passes";
import { Packer, SceneBuilder } from "./paths";
import { CordPicker } from "./picking";
import { QualityGovernor } from "./quality";
import {
	BYTES_PER_INSTANCE,
	F,
	FLOATS_PER_INSTANCE,
	FS,
	SIDES,
	VS,
} from "./shaders";

/** sRGB clear colour: what the board's pool of light fades to at its edges. */
export const BACKGROUND: V3 = [0.105, 0.108, 0.118];

const srgbToLinear = (c: number) =>
	c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

/** What a frame is drawn with, besides the instances. */
export interface FrameView {
	mvp: Matrix4;
	view: Matrix4;
	projection: Matrix4;
	eye: V3;
	exposure: number;
	/** 0 material, 1 knots, 2 attachment */
	viewMode: number;
	/** cord id, or −1 */
	selected: number;
	/** cord id under the pointer, or −1 */
	hover: number;
}

/** Rolling CPU timings, milliseconds per frame (dev readout and status). */
export interface FramePerf {
	frames: number;
	build: number;
	upload: number;
	draw: number;
	rebuilt: number;
	uploadedBytes: number;
}

/**
 * The ring-pair template every segment is extruded from: `sides + 1`
 * vertices per ring (the seam is doubled, so the ply phase can run on past
 * 2π) as (end 0|1, side index), and a triangle list over them. Indexed, a
 * vertex shared by up to six triangles is shaded once (the GPU's
 * post-transform cache) instead of six times.
 */
export function ringTemplate(sides = SIDES): {
	corners: Float32Array;
	indices: Uint16Array;
} {
	const ring = sides + 1;
	const corners = new Float32Array(ring * 4);
	for (let e = 0; e < 2; e++)
		for (let s = 0; s <= sides; s++) {
			corners[(e * ring + s) * 2] = e;
			corners[(e * ring + s) * 2 + 1] = s;
		}
	const indices = new Uint16Array(sides * 6);
	for (let s = 0; s < sides; s++) {
		// wound as before indexing: (0,s) (1,s) (1,s+1) · (0,s) (1,s+1) (0,s+1)
		indices.set([s, ring + s, ring + s + 1, s, ring + s + 1, s + 1], s * 6);
	}
	return { corners, indices };
}

/**
 * Levels of detail by on-screen radius (device pixels, before the minimum
 * width): a ring of `sides` for segments thinner than `maxPx`. A polygon
 * of n sides strays r·(1 − cos π/n) from its circle — under a quarter pixel
 * at each band's upper edge — and the ply relief and fibres are shaded per
 * fragment, not modelled, at these sizes. Each band is its own instanced
 * draw of the whole buffer; the vertex shader drops the segments of the
 * other bands (see `uLod`).
 */
export const CORD_LODS = [
	{ sides: 6, maxPx: 2 },
	{ sides: 12, maxPx: 7 },
	{ sides: SIDES, maxPx: Number.POSITIVE_INFINITY },
] as const;

/** `uLod` that accepts every segment (the shadow and picking passes). */
const ALL_LODS: [number, number] = [0, 1e30];

const f4 = (o: number) => o * 4;

/**
 * Dirty ranges closer than this many instances (64 KB) are uploaded as one:
 * re-sending an unchanged gap is cheaper than another copy command.
 */
const JOIN_GAP = 400;

/**
 * GPU instances to allocate for a layout of `count`. Cords keep their slots,
 * so the layout only grows when one outgrows its slot and moves to the end.
 */
function instanceCapacity(count: number): number {
	return Math.ceil(count * 1.1) + 4096;
}

/** The per-instance attribute layout shared by every pass that draws cords. */
export const INSTANCE_LAYOUT = {
	name: "instances",
	stepMode: "instance" as const,
	byteStride: BYTES_PER_INSTANCE,
	attributes: [
		{ attribute: "p0", format: "float32x3" as const, byteOffset: f4(F.p0) },
		{ attribute: "p1", format: "float32x3" as const, byteOffset: f4(F.p1) },
		{ attribute: "t0", format: "float32x3" as const, byteOffset: f4(F.t0) },
		{ attribute: "t1", format: "float32x3" as const, byteOffset: f4(F.t1) },
		{ attribute: "n0", format: "float32x3" as const, byteOffset: f4(F.n0) },
		{ attribute: "n1", format: "float32x3" as const, byteOffset: f4(F.n1) },
		{ attribute: "radii", format: "float32x4" as const, byteOffset: f4(F.r0) },
		{
			attribute: "flags",
			format: "float32x4" as const,
			byteOffset: f4(F.twist),
		},
		{
			attribute: "color",
			format: "float32x3" as const,
			byteOffset: f4(F.color),
		},
		{
			attribute: "accent",
			format: "float32x3" as const,
			byteOffset: f4(F.accent),
		},
		{
			attribute: "ident",
			format: "float32x2" as const,
			byteOffset: f4(F.cordId),
		},
		{
			attribute: "bend0",
			format: "float32x3" as const,
			byteOffset: f4(F.bend0),
		},
		{
			attribute: "bend1",
			format: "float32x3" as const,
			byteOffset: f4(F.bend1),
		},
		{
			attribute: "ends",
			format: "float32x2" as const,
			byteOffset: f4(F.plied1),
		},
	],
};

export const CORNER_LAYOUT = {
	name: "corner",
	stepMode: "vertex" as const,
	format: "float32x2" as const,
};

/** A ring template on the GPU. */
export interface RingBuffers {
	corners: Buffer;
	indices: Buffer;
}

export class LabRenderer {
	readonly device: Device;
	readonly packer = new Packer(60_000);
	readonly builder = new SceneBuilder();
	readonly perf: FramePerf = {
		frames: 0,
		build: 0,
		upload: 0,
		draw: 0,
		rebuilt: 0,
		uploadedBytes: 0,
	};
	private resources: { destroy(): void }[] = [];
	/** the finest ring template (SIDES), for the passes that draw every segment alike */
	readonly template: RingBuffers;
	instanceBuffer: Buffer;
	/** instances the GPU buffer can hold */
	capacity: number;
	/** one instanced draw per level of detail (CORD_LODS), finest last */
	readonly cords: Model[];
	readonly uniforms: {
		uMVP: Matrix4 | number[];
		uEye: V3;
		uSides: number;
		/** band of on-screen radius drawn; each level overrides it */
		uLod: [number, number];
		uDiameter: number;
		uExposure: number;
		uViewMode: number;
		uSelected: number;
		uHover: number;
		/** linear */
		uBackground: V3;
		/** world size of one pixel at unit distance (sets the minimum cord width) */
		uPxWorld: number;
		uLightDir: V3;
		uLightMVP: Matrix4 | number[];
		uShadowTexel: number;
	};
	/** bounds of fixed runs of instances, for culling and choosing levels of detail */
	readonly chunks = new ChunkBounds();
	/** each level's band of on-screen radius [lo, hi) */
	private readonly bands: [number, number][] = [];
	/** each level's instance runs for the frame being drawn */
	readonly runs: Runs[] = CORD_LODS.map(() => emptyRuns());
	private readonly shadow: ShadowPass;
	private readonly backdrop: Backdrop;
	/** instances changed since the shadow map was drawn */
	shadowDirty = true;
	private shadowAge = 0;

	static async create(
		canvas: HTMLCanvasElement,
		lab: LabModel,
	): Promise<LabRenderer> {
		const device = await luma.createDevice({
			type: "webgl",
			adapters: [webgl2Adapter],
			waitForPageLoad: false,
			createCanvasContext: {
				canvas,
				autoResize: true,
				useDevicePixels: true,
			},
			webgl: { antialias: true, alpha: false, preserveDrawingBuffer: false },
		});
		return new LabRenderer(device, lab);
	}

	private constructor(device: Device, lab: LabModel) {
		this.device = device;
		this.builder.build(lab, this.packer);
		const templates = CORD_LODS.map(({ sides }) =>
			this.createTemplate(ringTemplate(sides)),
		);
		this.template = templates[templates.length - 1];
		this.capacity = instanceCapacity(this.packer.count);
		this.instanceBuffer = this.track(
			device.createBuffer({
				byteLength: this.capacity * BYTES_PER_INSTANCE,
				usage: Buffer.VERTEX | Buffer.COPY_DST,
			}),
		);
		this.instanceBuffer.write(
			this.packer.data.subarray(0, this.packer.count * FLOATS_PER_INSTANCE),
		);
		this.builder.takeDirty();
		this.chunks.update(this.packer.data, this.packer.count, null);
		this.uniforms = {
			uMVP: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
			uEye: [0, 0, 10],
			uSides: SIDES,
			uLod: ALL_LODS,
			uDiameter: lab.ropes[0]?.d ?? 0.06,
			uExposure: 1,
			uViewMode: 0,
			uSelected: -1,
			uHover: -1,
			uBackground: BACKGROUND.map(srgbToLinear) as V3,
			uPxWorld: 0,
			uLightDir: KEY_LIGHT,
			uLightMVP: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
			uShadowTexel: 1 / SHADOW_SIZE,
		};
		this.shadow = this.track(
			new ShadowPass(
				device,
				{
					layouts: [CORNER_LAYOUT, INSTANCE_LAYOUT],
					template: ringTemplate(SHADOW_SIDES),
					instanceBuffer: this.instanceBuffer,
					instanceCount: this.packer.count,
					diameter: this.uniforms.uDiameter,
				},
				lab.bounds,
			),
		);
		this.uniforms.uLightMVP = this.shadow.lightMVP;
		this.backdrop = this.track(
			new Backdrop(device, lab.bounds, this.shadow, this.uniforms.uBackground),
		);
		let lo = 0;
		this.cords = CORD_LODS.map(({ sides, maxPx }, i) => {
			const band: [number, number] = [lo, Math.min(maxPx, ALL_LODS[1])];
			lo = maxPx;
			this.bands.push(band);
			return this.track(
				new Model(device, {
					id: `khipu-cords-${sides}`,
					vs: VS,
					fs: FS,
					bufferLayout: [CORNER_LAYOUT, INSTANCE_LAYOUT],
					attributes: {
						corner: templates[i].corners,
						instances: this.instanceBuffer,
					},
					indexBuffer: templates[i].indices,
					instanceCount: this.packer.count,
					// the shared uniforms with this level's template and band on top
					// (luma looks each uniform up by name, so the prototype chain serves)
					uniforms: Object.assign(Object.create(this.uniforms), {
						uSides: sides,
						uLod: band,
					}),
					bindings: { uShadowMap: this.shadow.texture },
					parameters: {
						depthWriteEnabled: true,
						depthCompare: "less-equal",
						// The ring template winds clockwise seen from outside the tube
						// (its right-hand normal points in), so the outer surface is the
						// "back" face: cull the front, or the far wall's inside is drawn.
						cullMode: "front",
					},
				}),
			);
		});
	}

	private createTemplate(t: {
		corners: Float32Array;
		indices: Uint16Array;
	}): RingBuffers {
		return {
			corners: this.track(
				this.device.createBuffer({
					data: t.corners,
					usage: Buffer.VERTEX | Buffer.COPY_DST,
				}),
			),
			indices: this.track(
				this.device.createBuffer({
					data: t.indices,
					usage: Buffer.INDEX | Buffer.COPY_DST,
				}),
			),
		};
	}

	private track<T extends { destroy(): void }>(resource: T): T {
		this.resources.push(resource);
		return resource;
	}

	get renderer(): string {
		return this.device.info.renderer;
	}

	/**
	 * Dynamic resolution: the draw loop reports each rendered frame
	 * (`governor.frame(time)`) and it lowers the pixel ratio while frames
	 * are slow (see quality.ts).
	 */
	readonly governor = new QualityGovernor((ratio) => this.setPixelRatio(ratio));

	/** Drawing buffer = CSS size × `ratio`; the display's own ratio tracks it exactly. */
	setPixelRatio(ratio: number): void {
		const native = typeof window === "undefined" ? 1 : window.devicePixelRatio;
		this.device.getCanvasContext().setProps({
			useDevicePixels: Math.abs(ratio - native) < 0.01 ? true : ratio,
		});
	}

	/** Drawing-buffer size in device pixels. */
	drawingBufferSize(): [number, number] {
		const [w, h] = this.device.getCanvasContext().getDrawingBufferSize();
		return [w, h];
	}

	/* -------------------------------------------------------------------------
	   Update: sim state → packed instances → GPU
	   ------------------------------------------------------------------------- */

	/**
	 * Whether the last `update` changed any instance (a cord moved, or the
	 * buffer was rewritten). False means the GPU holds exactly what it drew
	 * last frame: passes that depend only on the instances (the shadow map)
	 * can be skipped, and with an unchanged camera so can the whole frame.
	 */
	instancesChanged = true;
	/** CPU-side gather of the dirty instance ranges, for one upload */
	private staging = new Float32Array(0);
	/** the GL buffer the gather is uploaded into, then copied from on the GPU */
	private stagingBuffer: WebGLBuffer | null = null;

	/**
	 * Repack the moved cords and upload what changed. Each cord keeps its
	 * place in the buffer (SceneBuilder), so a frame's changes are a few
	 * ranges: they are gathered into one array, uploaded with one
	 * `bufferData` into a staging buffer and copied into place on the GPU.
	 * (Many `Buffer.write`s at offsets would be worse than one whole upload:
	 * ANGLE's Metal backend reallocates and copies the entire buffer for each
	 * `bufferSubData` into a buffer the GPU may still be reading.)
	 */
	update(lab: LabModel): void {
		let t = performance.now();
		this.builder.build(lab, this.packer);
		this.perf.build += performance.now() - t;
		this.perf.rebuilt += this.builder.rebuilt;
		t = performance.now();
		const { packer } = this;
		const dirty = this.builder.takeDirty(JOIN_GAP);
		let full = dirty.full;
		if (packer.count > this.capacity) {
			this.capacity = instanceCapacity(packer.count);
			const old = this.instanceBuffer;
			this.resources = this.resources.filter((r) => r !== old);
			old.destroy();
			this.instanceBuffer = this.track(
				this.device.createBuffer({
					byteLength: this.capacity * BYTES_PER_INSTANCE,
					usage: Buffer.VERTEX | Buffer.COPY_DST,
				}),
			);
			for (const m of this.cords)
				m.setAttributes({ instances: this.instanceBuffer });
			full = true;
		}
		if (full) {
			const used = packer.count * FLOATS_PER_INSTANCE;
			this.instanceBuffer.write(packer.data.subarray(0, used));
			this.perf.uploadedBytes += used * 4;
		} else if (dirty.ranges.length > 0) this.uploadRanges(dirty.ranges);
		this.instancesChanged = full || dirty.ranges.length > 0;
		if (this.instancesChanged)
			this.chunks.update(packer.data, packer.count, full ? null : dirty.ranges);
		for (const m of this.cords)
			if (packer.count !== m.instanceCount) m.setInstanceCount(packer.count);
		this.perf.upload += performance.now() - t;
	}

	/** Upload instance ranges [start, end) (sorted, disjoint) through the staging buffer. */
	private uploadRanges(ranges: number[]): void {
		const gl = (this.device as unknown as { gl: WebGL2RenderingContext }).gl;
		const data = this.packer.data;
		let floats = 0;
		for (let i = 0; i < ranges.length; i += 2)
			floats += (ranges[i + 1] - ranges[i]) * FLOATS_PER_INSTANCE;
		// a power-of-two size, so the driver can reuse the allocation
		let size = 1 << 14;
		while (size < floats) size *= 2;
		if (this.staging.length < size) this.staging = new Float32Array(size);
		const staging = this.staging;
		let o = 0;
		for (let i = 0; i < ranges.length; i += 2) {
			const a = ranges[i] * FLOATS_PER_INSTANCE;
			const b = ranges[i + 1] * FLOATS_PER_INSTANCE;
			staging.set(data.subarray(a, b), o);
			o += b - a;
		}
		if (!this.stagingBuffer) {
			const buffer = gl.createBuffer();
			this.stagingBuffer = buffer;
			this.track({ destroy: () => gl.deleteBuffer(buffer) });
		}
		const target = (this.instanceBuffer as unknown as { handle: WebGLBuffer })
			.handle;
		gl.bindBuffer(gl.COPY_READ_BUFFER, this.stagingBuffer);
		gl.bufferData(
			gl.COPY_READ_BUFFER,
			staging.subarray(0, size),
			gl.STREAM_DRAW,
		);
		gl.bindBuffer(gl.COPY_WRITE_BUFFER, target);
		let src = 0;
		for (let i = 0; i < ranges.length; i += 2) {
			const bytes = (ranges[i + 1] - ranges[i]) * BYTES_PER_INSTANCE;
			gl.copyBufferSubData(
				gl.COPY_READ_BUFFER,
				gl.COPY_WRITE_BUFFER,
				src,
				ranges[i] * BYTES_PER_INSTANCE,
				bytes,
			);
			src += bytes;
		}
		// luma binds these targets itself and leaves them unbound: match it
		gl.bindBuffer(gl.COPY_READ_BUFFER, null);
		gl.bindBuffer(gl.COPY_WRITE_BUFFER, null);
		this.perf.uploadedBytes += size * 4;
	}

	/* -------------------------------------------------------------------------
	   Render: the passes that draw a frame
	   ------------------------------------------------------------------------- */

	render(frame: FrameView): void {
		const t = performance.now();
		const u = this.uniforms;
		u.uMVP = frame.mvp;
		u.uEye = frame.eye;
		u.uExposure = frame.exposure;
		u.uViewMode = frame.viewMode;
		u.uSelected = frame.selected;
		u.uHover = frame.hover;
		// one pixel's world size at unit distance: 2·tan(fovy/2) / height
		const height = this.drawingBufferSize()[1];
		u.uPxWorld = 2 / (frame.projection[5] * Math.max(1, height));

		// The light is fixed, so the shadow map only goes stale when cords
		// move; while they sway it is redrawn every third frame (a sway of a
		// few frames is far below a shadow texel).
		this.shadowDirty ||= this.instancesChanged;
		this.shadowAge++;
		if (this.shadowDirty && (this.shadowAge >= 3 || this.perf.frames === 0)) {
			this.shadow.draw(this.instanceBuffer, this.packer.count);
			this.shadowDirty = false;
			this.shadowAge = 0;
		}

		const b = this.backdrop.uniforms;
		b.uMVP = frame.mvp;
		b.uEye = frame.eye;
		b.uExposure = frame.exposure;

		const context = this.device.getCanvasContext();
		const pass = this.device.beginRenderPass({
			framebuffer: context.getCurrentFramebuffer(),
			clearColor: [...BACKGROUND, 1],
			clearDepth: 1,
		});
		// sub-pixel cords are drawn wide and hand back their real coverage as alpha
		const gl = (this.device as unknown as { gl: WebGL2RenderingContext }).gl;
		gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
		this.chunks.cull(frame.mvp, frame.eye, u.uPxWorld, this.bands, this.runs);
		for (let i = 0; i < this.cords.length; i++)
			drawRuns(gl, this.cords[i], pass, this.instanceBuffer, this.runs[i]);
		gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
		// the board last: most of it behind cords is rejected by the depth test
		this.backdrop.draw(pass);
		pass.end();
		this.device.submit();
		this.perf.draw += performance.now() - t;
		this.perf.frames++;
	}

	/** Reset the rolling timings; returns the averages since the last reset. */
	takePerf(): FramePerf {
		const p = this.perf;
		const n = Math.max(1, p.frames);
		const out = {
			frames: p.frames,
			build: p.build / n,
			upload: p.upload / n,
			draw: p.draw / n,
			rebuilt: p.rebuilt / n,
			uploadedBytes: p.uploadedBytes / n,
		};
		p.frames = p.build = p.upload = p.draw = p.rebuilt = p.uploadedBytes = 0;
		return out;
	}

	destroy(): void {
		for (const r of this.resources.reverse()) r.destroy();
		this.resources = [];
		this.device.destroy();
	}

	/* -------------------------------------------------------------------------
	   Picking and capture (interaction; owned by the UX side)
	   ------------------------------------------------------------------------- */

	private picker: CordPicker | null = null;

	/**
	 * The cord drawn nearest a drawing-buffer pixel (device pixels from the
	 * top left) within `radiusPx`, or −1, for the camera of the last `render`.
	 * Draws an id pass into a tiny framebuffer and reads it back (a sync
	 * point), so call it at most once per animation frame.
	 */
	pickAt(xDevicePx: number, yDevicePx: number, radiusPx: number): number {
		if (!this.picker) this.picker = this.track(new CordPicker(this.device));
		return this.picker.pick(
			{
				template: this.template,
				chunks: this.chunks,
				// re-read each time: `update` replaces the buffer when it grows
				instanceBuffer: this.instanceBuffer,
				instanceCount: this.packer.count,
				layouts: [CORNER_LAYOUT, INSTANCE_LAYOUT],
				uniforms: this.uniforms,
			},
			this.uniforms.uMVP as ArrayLike<number>,
			this.drawingBufferSize(),
			xDevicePx,
			yDevicePx,
			radiusPx,
		);
	}

	/**
	 * Draw `frame` and snapshot the canvas as a PNG. The drawing buffer is
	 * not preserved, so the snapshot is taken in the same task as the draw
	 * (`toBlob` copies the bitmap synchronously; only the encoding is async).
	 */
	capture(frame: FrameView): Promise<Blob> {
		this.render(frame);
		const canvas = this.device.getCanvasContext().canvas;
		return new Promise((resolve, reject) => {
			if (!(canvas instanceof HTMLCanvasElement)) {
				reject(new Error("capture needs an on-screen canvas"));
				return;
			}
			canvas.toBlob(
				(blob) =>
					blob ? resolve(blob) : reject(new Error("the canvas was empty")),
				"image/png",
			);
		});
	}
}
