/**
 * The passes around the cords: the key light's shadow map and the linen
 * board the khipu hangs in front of. The renderer owns when they run; this
 * module owns what they draw.
 *
 * The key light comes from the upper left, in front, about 40° up — a
 * museum case lamp. Its shadow map is an orthographic depth render of the
 * cords (6-sided, round, slightly thin; see `SHADOW_PASS` in the vertex
 * shader) fitted to the model's bounds and the board behind it, sampled
 * through a hardware comparison sampler with 3×3 PCF.
 */

import {
	Buffer,
	type Device,
	type Framebuffer,
	type RenderPass,
	Texture,
} from "@luma.gl/core";
import { Model } from "@luma.gl/engine";
import { Matrix4 } from "@math.gl/core";
import type { V3 } from "./model";
import { BOARD_FS, BOARD_VS, SHADOW_FS, SHADOW_VS } from "./shaders";

const norm = (v: V3): V3 => {
	const l = Math.hypot(v[0], v[1], v[2]);
	return [v[0] / l, v[1] / l, v[2] / l];
};

/** Direction toward the key light: upper left, in front, ≈ 39° elevation. */
export const KEY_LIGHT: V3 = norm([-0.52, 0.62, 0.58]);
export const SHADOW_SIZE = 2048;
export const SHADOW_SIDES = 6;
/** How far behind the khipu's deepest point the board stands, world units. */
export const BOARD_GAP = 0.3;

export interface Bounds {
	min: V3;
	max: V3;
}

/** The board's plane (world z). */
export function boardZ(bounds: Bounds): number {
	return bounds.min[2] - BOARD_GAP;
}

/**
 * The key light's view-projection: orthographic along the light, fitted
 * to the model's box (padded for sway) extended back to the board. Since
 * the projection runs along the light, every shadow a cord casts on the
 * board falls inside the same rectangle as the cord itself.
 */
export function lightMatrix(bounds: Bounds): Matrix4 {
	const pad = 0.35;
	const lo: V3 = [bounds.min[0] - pad, bounds.min[1] - pad, boardZ(bounds)];
	const hi: V3 = [
		bounds.max[0] + pad,
		bounds.max[1] + pad,
		bounds.max[2] + pad,
	];
	const centre: V3 = [
		(lo[0] + hi[0]) / 2,
		(lo[1] + hi[1]) / 2,
		(lo[2] + hi[2]) / 2,
	];
	const reach = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
	const eye: V3 = [
		centre[0] + KEY_LIGHT[0] * reach,
		centre[1] + KEY_LIGHT[1] * reach,
		centre[2] + KEY_LIGHT[2] * reach,
	];
	const view = new Matrix4().lookAt({ eye, center: centre, up: [0, 1, 0] });
	let x0 = Infinity;
	let x1 = -Infinity;
	let y0 = Infinity;
	let y1 = -Infinity;
	let z0 = Infinity;
	let z1 = -Infinity;
	for (let i = 0; i < 8; i++) {
		const p = view.transformAsPoint([
			i & 1 ? hi[0] : lo[0],
			i & 2 ? hi[1] : lo[1],
			i & 4 ? hi[2] : lo[2],
		]);
		x0 = Math.min(x0, p[0]);
		x1 = Math.max(x1, p[0]);
		y0 = Math.min(y0, p[1]);
		y1 = Math.max(y1, p[1]);
		z0 = Math.min(z0, p[2]);
		z1 = Math.max(z1, p[2]);
	}
	const projection = new Matrix4().ortho({
		left: x0,
		right: x1,
		bottom: y0,
		top: y1,
		near: -z1 - 0.05,
		far: -z0 + 0.05,
	});
	return projection.multiplyRight(view);
}

/** The per-instance layout and corner template, passed in to keep the modules acyclic. */
export interface CordGeometry {
	// biome-ignore lint/suspicious/noExplicitAny: luma's BufferLayout, as the renderer declares it
	layouts: any[];
	/** ring-pair template for SHADOW_SIDES sides (see `ringTemplate`) */
	template: { corners: Float32Array; indices: Uint16Array };
	instanceBuffer: Buffer;
	instanceCount: number;
	diameter: number;
}

/** The key light's depth map of the cords. */
export class ShadowPass {
	readonly texture: Texture;
	readonly lightMVP: Matrix4;
	private readonly device: Device;
	private readonly framebuffer: Framebuffer;
	private readonly corners: Buffer;
	private readonly indices: Buffer;
	private readonly model: Model;
	private instanceBuffer: Buffer;
	readonly uniforms: {
		uMVP: Matrix4;
		uSides: number;
		uLod: [number, number];
		uDiameter: number;
		uEye: V3;
		uPxWorld: number;
	};

	constructor(device: Device, geometry: CordGeometry, bounds: Bounds) {
		this.device = device;
		this.lightMVP = lightMatrix(bounds);
		this.texture = device.createTexture({
			id: "khipu-shadow-map",
			format: "depth24plus",
			width: SHADOW_SIZE,
			height: SHADOW_SIZE,
			usage: Texture.SAMPLE | Texture.RENDER,
			sampler: {
				type: "comparison-sampler",
				compare: "less-equal",
				minFilter: "linear",
				magFilter: "linear",
				addressModeU: "clamp-to-edge",
				addressModeV: "clamp-to-edge",
			},
		});
		this.framebuffer = device.createFramebuffer({
			id: "khipu-shadow-fb",
			width: SHADOW_SIZE,
			height: SHADOW_SIZE,
			colorAttachments: [],
			depthStencilAttachment: this.texture,
		});
		this.corners = device.createBuffer({
			data: geometry.template.corners,
			usage: Buffer.VERTEX | Buffer.COPY_DST,
		});
		this.indices = device.createBuffer({
			data: geometry.template.indices,
			usage: Buffer.INDEX | Buffer.COPY_DST,
		});
		this.instanceBuffer = geometry.instanceBuffer;
		this.uniforms = {
			uMVP: this.lightMVP,
			uSides: SHADOW_SIDES,
			// no pixel size here (uPxWorld 0): every segment, one level of detail
			uLod: [0, 1e30],
			uDiameter: geometry.diameter,
			uEye: [0, 0, 0],
			uPxWorld: 0,
		};
		this.model = new Model(device, {
			id: "khipu-shadow",
			vs: SHADOW_VS,
			fs: SHADOW_FS,
			bufferLayout: geometry.layouts,
			attributes: { corner: this.corners, instances: this.instanceBuffer },
			indexBuffer: this.indices,
			instanceCount: geometry.instanceCount,
			uniforms: this.uniforms,
			parameters: {
				depthWriteEnabled: true,
				depthCompare: "less-equal",
				// Only the side facing away from the light goes into the map, so
				// the lit side stays clear of acne. The template winds clockwise
				// seen from outside, so that far side is the "front" face here.
				cullMode: "back",
				// luma's WebGL maps these to polygonOffset(factor, units)
				depthBias: 1.5,
				depthBiasSlopeScale: 2,
			},
		});
	}

	/** Re-render the depth map from the current instances. */
	draw(instanceBuffer: Buffer, instanceCount: number): void {
		if (instanceBuffer !== this.instanceBuffer) {
			this.instanceBuffer = instanceBuffer;
			this.model.setAttributes({ instances: instanceBuffer });
		}
		this.model.setInstanceCount(instanceCount);
		const pass = this.device.beginRenderPass({
			framebuffer: this.framebuffer,
			clearColor: false,
			clearDepth: 1,
			parameters: { viewport: [0, 0, SHADOW_SIZE, SHADOW_SIZE] },
		});
		this.model.draw(pass);
		pass.end();
	}

	destroy(): void {
		this.model.destroy();
		this.corners.destroy();
		this.indices.destroy();
		this.framebuffer.destroy();
		this.texture.destroy();
	}
}

/** The linen board behind the khipu. */
export class Backdrop {
	private readonly model: Model;
	private readonly quad: Buffer;
	readonly uniforms: {
		uMVP: Matrix4 | number[];
		uBoardZ: number;
		uEye: V3;
		uExposure: number;
		uLightDir: V3;
		uLightMVP: Matrix4;
		uShadowTexel: number;
		uBackground: V3;
		uPoolCentre: [number, number];
		uPoolRadius: number;
	};

	constructor(
		device: Device,
		bounds: Bounds,
		shadow: ShadowPass,
		background: V3,
	) {
		const cx = (bounds.min[0] + bounds.max[0]) / 2;
		const cy = (bounds.min[1] + bounds.max[1]) / 2;
		const w = bounds.max[0] - bounds.min[0];
		const h = bounds.max[1] - bounds.min[1];
		// far wider than any view of the khipu; the pool of light fades long before the edge
		const hx = w / 2 + 40;
		const hy = h / 2 + 30;
		this.quad = device.createBuffer({
			data: new Float32Array([
				cx - hx,
				cy - hy,
				cx + hx,
				cy - hy,
				cx + hx,
				cy + hy,
				cx - hx,
				cy - hy,
				cx + hx,
				cy + hy,
				cx - hx,
				cy + hy,
			]),
			usage: Buffer.VERTEX | Buffer.COPY_DST,
		});
		this.uniforms = {
			uMVP: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
			uBoardZ: boardZ(bounds),
			uEye: [0, 0, 10],
			uExposure: 1,
			uLightDir: KEY_LIGHT,
			uLightMVP: shadow.lightMVP,
			uShadowTexel: 1 / SHADOW_SIZE,
			uBackground: background,
			// the lamp is aimed a little below the khipu's middle, where the cords hang
			uPoolCentre: [cx, cy - h * 0.08],
			uPoolRadius: Math.max(w, h) * 0.75 + 1,
		};
		this.model = new Model(device, {
			id: "khipu-board",
			vs: BOARD_VS,
			fs: BOARD_FS,
			bufferLayout: [{ name: "position", format: "float32x2" }],
			attributes: { position: this.quad },
			vertexCount: 6,
			uniforms: this.uniforms,
			bindings: { uShadowMap: shadow.texture },
			parameters: {
				depthWriteEnabled: true,
				depthCompare: "less-equal",
				// seen from behind (the verso side) the board is not there
				cullMode: "back",
			},
		});
	}

	draw(pass: RenderPass): void {
		this.model.draw(pass);
	}

	destroy(): void {
		this.model.destroy();
		this.quad.destroy();
	}
}
