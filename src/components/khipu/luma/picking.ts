/**
 * GPU picking: the cords drawn again with their cord id (+1) as an RGBA8
 * colour, but only for a few pixels round the cursor. Instead of a
 * full-size target, the projection is widened so that a (2r+1)² block of
 * the screen fills a tiny framebuffer, which is then read back and searched
 * for the id nearest its centre. The pass shares the renderer's corner and
 * instance buffers, so it sees exactly the geometry of the last `update`.
 */

import type { Buffer, Device, Framebuffer } from "@luma.gl/core";
import { Model } from "@luma.gl/engine";
import { Matrix4 } from "@math.gl/core";
import { type ChunkBounds, drawRuns, emptyRuns } from "./chunks";
import { VS } from "./shaders";

/** Layouts are passed in rather than imported, to keep renderer.ts ↔ picking.ts acyclic. */
export interface PickBuffers {
	/** ring template: corner vertices and the triangle list over them */
	template: { corners: Buffer; indices: Buffer };
	/** the instances' chunk bounds: only chunks inside the few picked pixels are drawn */
	chunks: ChunkBounds;
	instanceBuffer: Buffer;
	instanceCount: number;
	// biome-ignore lint/suspicious/noExplicitAny: luma's BufferLayout, as the renderer declares it
	layouts: any[];
	/** the cord pass's uniforms; every one but `uMVP` is copied (eye, pixel size…) */
	uniforms: Record<string, unknown>;
}

const OUT_ANCHOR = "out vec3 vWorld;";
const POS_ANCHOR = "vWorld = pos;";

/** The cord vertex shader with a flat cord id passed on to the fragment. */
export function pickVertexShader(vs = VS): string {
	for (const anchor of [OUT_ANCHOR, POS_ANCHOR])
		if (!vs.includes(anchor))
			throw new Error(
				`picking: the cord vertex shader no longer contains "${anchor}"`,
			);
	return vs
		.replace(OUT_ANCHOR, `flat out float vId;\n${OUT_ANCHOR}`)
		.replace(POS_ANCHOR, `${POS_ANCHOR}\n  vId = ident.x;`);
}

/** the uniforms the cord vertex shader declares (the id pass needs the same) */
const VS_UNIFORMS = [...VS.matchAll(/^uniform\s+\w+\s+(\w+)\s*;/gm)]
	.map((m) => m[1])
	.filter((name) => name !== "uMVP");

/** cord id + 1 as 24 bits of RGB; 0 (the clear colour) is "nothing". */
const PICK_FS = /* glsl */ `#version 300 es
precision highp float;
flat in float vId;
out vec4 fragColor;
void main(void) {
  float id = floor(vId + 1.5);
  fragColor = vec4(
    mod(id, 256.0) / 255.0,
    mod(floor(id / 256.0), 256.0) / 255.0,
    floor(id / 65536.0) / 255.0,
    1.0);
}`;

export class CordPicker {
	private readonly device: Device;
	private model: Model | null = null;
	private framebuffer: Framebuffer | null = null;
	private size = 0;
	/** the cord pass's uniforms with a widened projection */
	private readonly uniforms: Record<string, unknown> = { uMVP: new Matrix4() };
	private readonly runs = emptyRuns();

	constructor(device: Device) {
		this.device = device;
	}

	/**
	 * The cord id drawn nearest device pixel (x, y) — measured from the top
	 * left of a `width`×`height` drawing buffer — within `radius` pixels, or −1.
	 */
	pick(
		buffers: PickBuffers,
		mvp: ArrayLike<number>,
		[width, height]: [number, number],
		x: number,
		y: number,
		radius: number,
	): number {
		const r = Math.max(0, Math.round(radius));
		const n = 2 * r + 1;
		for (const name of VS_UNIFORMS)
			if (name in buffers.uniforms)
				this.uniforms[name] = buffers.uniforms[name];
		const model = this.ensure(buffers, n);
		const fb = this.framebuffer as Framebuffer;
		// the pixel's centre in NDC; scale the clip space about it so the
		// n×n block round it fills the whole framebuffer
		const cx = ((Math.floor(x) + 0.5) / width) * 2 - 1;
		const cy = 1 - ((Math.floor(y) + 0.5) / height) * 2;
		const sx = width / n;
		const sy = height / n;
		// column-major: x' = sx·x − sx·cx·w, y' = sy·y − sy·cy·w
		const zoom = new Matrix4([
			sx,
			0,
			0,
			0,
			0,
			sy,
			0,
			0,
			0,
			0,
			1,
			0,
			-sx * cx,
			-sy * cy,
			0,
			1,
		]);
		const pickMVP = zoom.multiplyRight(new Matrix4(Array.from(mvp)));
		this.uniforms.uMVP = pickMVP;
		buffers.chunks.cull(
			pickMVP,
			this.uniforms.uEye as ArrayLike<number>,
			this.uniforms.uPxWorld as number,
			[[0, Number.POSITIVE_INFINITY]],
			[this.runs],
		);
		model.setAttributes({
			corner: buffers.template.corners,
			instances: buffers.instanceBuffer,
		});
		model.setInstanceCount(buffers.instanceCount);
		const pass = this.device.beginRenderPass({
			framebuffer: fb,
			clearColor: [0, 0, 0, 0],
			clearDepth: 1,
		});
		const gl = (this.device as unknown as { gl: WebGL2RenderingContext }).gl;
		drawRuns(gl, model, pass, buffers.instanceBuffer, this.runs);
		pass.end();
		this.device.submit();
		const px = this.device.readPixelsToArrayWebGL(fb) as Uint8Array;
		let best = -1;
		let bestD = Number.POSITIVE_INFINITY;
		for (let j = 0; j < n; j++)
			for (let i = 0; i < n; i++) {
				const o = (j * n + i) * 4;
				const id = px[o] + px[o + 1] * 256 + px[o + 2] * 65536;
				if (id === 0) continue;
				const d = (i - r) ** 2 + (j - r) ** 2;
				if (d < bestD) {
					bestD = d;
					best = id - 1;
				}
			}
		return best;
	}

	private ensure(buffers: PickBuffers, n: number): Model {
		if (!this.model)
			this.model = new Model(this.device, {
				id: "khipu-cord-ids",
				vs: pickVertexShader(),
				fs: PICK_FS,
				bufferLayout: buffers.layouts,
				attributes: {
					corner: buffers.template.corners,
					instances: buffers.instanceBuffer,
				},
				indexBuffer: buffers.template.indices,
				instanceCount: buffers.instanceCount,
				uniforms: this.uniforms,
				parameters: {
					depthWriteEnabled: true,
					depthCompare: "less-equal",
					cullMode: "front",
				},
			});
		if (!this.framebuffer || this.size !== n) {
			this.framebuffer?.destroy();
			this.framebuffer = this.device.createFramebuffer({
				width: n,
				height: n,
				colorAttachments: ["rgba8unorm"],
				depthStencilAttachment: "depth24plus",
			});
			this.size = n;
		}
		return this.model;
	}

	destroy(): void {
		this.model?.destroy();
		this.framebuffer?.destroy();
		this.model = null;
		this.framebuffer = null;
	}
}
