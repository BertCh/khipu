/**
 * Development-only hooks on `window.__lab` for driving and measuring the lab
 * from a test script (CDP): camera control, focus, settle, per-frame timing
 * averages, and `census` — a histogram of how big the instanced segments
 * are on screen (and, with `{idPass: true}`, how many are actually visible).
 * Nothing here is imported in production builds.
 */

import { Model } from "@luma.gl/engine";
import { FOVY } from "./camera";
import type { V3 } from "./model";
import { CORNER_LAYOUT, INSTANCE_LAYOUT, type LabRenderer } from "./renderer";
import { F, FLOATS_PER_INSTANCE, VS } from "./shaders";

export interface DevContext {
	mvp: () => ArrayLike<number>;
	eye: () => V3;
}

// biome-ignore lint/suspicious/noExplicitAny: a loose debugging surface
type Any = any;

let idModel: Model | null = null;
let idFb: Any = null;

/** Segment-size census of the current frame (see the module comment). */
export function census(r: LabRenderer, ctx: DevContext, opts: Any = {}): Any {
	const d = r.packer.data;
	const n = r.packer.count;
	const m: any = ctx.mvp();
	const [Wd, Hd] = r.drawingBufferSize();
	const focal = Hd / 2 / Math.tan(FOVY / 2);
	const edges = [0.5, 1, 2, 4, 8];
	const binOf = (v: number) => {
		let b = 0;
		while (b < edges.length && v >= edges[b]) b++;
		return b;
	};
	const hist = new Array(6).fill(0);
	const histLen = new Array(6).fill(0);
	const histDia = new Array(6).fill(0);
	const histVis = new Array(6).fill(0);
	const pixByBin = new Array(6).fill(0);
	const bin = new Int8Array(n);
	const inF = new Uint8Array(n);
	let out = 0;
	let areaSum = 0;
	let areaSumIn = 0;
	let under2Tri = 0;
	let lenSub1 = 0;
	const cl = (x: number, y: number, z: number) => [
		m[0] * x + m[4] * y + m[8] * z + m[12],
		m[1] * x + m[5] * y + m[9] * z + m[13],
		m[2] * x + m[6] * y + m[10] * z + m[14],
		m[3] * x + m[7] * y + m[11] * z + m[15],
	];
	const outside = (c: number[]) => [
		c[0] < -c[3],
		c[0] > c[3],
		c[1] < -c[3],
		c[1] > c[3],
		c[2] < -c[3],
		c[2] > c[3],
	];
	for (let i = 0; i < n; i++) {
		const o = i * FLOATS_PER_INSTANCE;
		const r = 0.5 * (d[o + F.r0] + d[o + F.r1]);
		const c0 = cl(d[o + F.p0], d[o + F.p0 + 1], d[o + F.p0 + 2]);
		const c1 = cl(d[o + F.p1], d[o + F.p1 + 1], d[o + F.p1 + 2]);
		const o0 = outside(c0);
		const o1 = outside(c1);
		let isOut = false;
		for (let k = 0; k < 6; k++)
			if (o0[k] && o1[k]) {
				isOut = true;
				break;
			}
		// grow by radius: a segment whose centreline is just outside may still touch the frame
		const depth = 0.5 * (c0[3] + c1[3]);
		const rpx = (r * focal) / Math.max(1e-6, depth);
		const sx0 = ((c0[0] / c0[3]) * Wd) / 2,
			sy0 = ((c0[1] / c0[3]) * Hd) / 2,
			sx1 = ((c1[0] / c1[3]) * Wd) / 2,
			sy1 = ((c1[1] / c1[3]) * Hd) / 2;
		const lpx = c0[3] > 0 && c1[3] > 0 ? Math.hypot(sx1 - sx0, sy1 - sy0) : 0;
		const b = binOf(rpx);
		bin[i] = b;
		const area = 2 * rpx * lpx + Math.PI * rpx * rpx;
		areaSum += area;
		if (isOut) {
			out++;
			continue;
		}
		inF[i] = 1;
		areaSumIn += area;
		hist[b]++;
		histLen[binOf(lpx)]++;
		histDia[binOf(2 * rpx)]++;
		if (rpx < 2) under2Tri++;
		if (lpx < 1) lenSub1++;
	}
	const res: any = {
		instances: n,
		drawingBuffer: [Wd, Hd],
		focalPx: focal,
		eye: ctx.eye(),
		outOfFrustum: out,
		inFrustum: n - out,
		radiusPxHist: { edges, counts: hist },
		diameterPxHist: { edges, counts: histDia },
		lengthPxHist: { edges, counts: histLen },
		shareTrianglesUnder2pxRadius: under2Tri / (n - out),
		segmentsUnder1pxLong: lenSub1,
		projectedAreaPxAll: areaSum,
		projectedAreaPxInFrustum: areaSumIn,
		bufferPx: Wd * Hd,
	};
	if (opts.idPass) {
		if (!idModel) {
			const vsId = VS.replace(
				"out vec3 vWorld;",
				"flat out float vId;\nout vec3 vWorld;",
			).replace("vWorld = pos;", "vWorld = pos; vId = float(gl_InstanceID);");
			const fsId =
				"#version 300 es\nprecision highp float;\nflat in float vId;\nout vec4 fragColor;\nvoid main(){ float id = vId + 1.0; fragColor = vec4(mod(id, 256.0) / 255.0, mod(floor(id / 256.0), 256.0) / 255.0, floor(id / 65536.0) / 255.0, 1.0); }";
			idModel = new Model(r.device, {
				id: "khipu-ids",
				vs: vsId,
				fs: fsId,
				bufferLayout: [CORNER_LAYOUT, INSTANCE_LAYOUT],
				attributes: {
					corner: r.template.corners,
					instances: r.instanceBuffer,
				},
				indexBuffer: r.template.indices,
				instanceCount: r.packer.count,
				uniforms: r.uniforms,
				parameters: {
					depthWriteEnabled: true,
					depthCompare: "less-equal",
					cullMode: "front",
				},
			});
		}
		if (!idFb || idFb.width !== Wd || idFb.height !== Hd) {
			idFb?.destroy();
			idFb = r.device.createFramebuffer({
				width: Wd,
				height: Hd,
				colorAttachments: ["rgba8unorm"],
				depthStencilAttachment: "depth24plus",
			});
		}
		idModel.setAttributes({
			corner: r.template.corners,
			instances: r.instanceBuffer,
		});
		idModel.setInstanceCount(r.packer.count);
		const pass = r.device.beginRenderPass({
			framebuffer: idFb,
			clearColor: [0, 0, 0, 1],
			clearDepth: 1,
		});
		idModel.draw(pass);
		pass.end();
		r.device.submit();
		const px: Uint8Array = (r.device as Any).readPixelsToArrayWebGL(idFb);
		const seen = new Uint8Array(n + 1);
		const pixCount = new Uint32Array(n + 1);
		let covered = 0;
		for (let p = 0; p < px.length; p += 4) {
			const id = px[p] + px[p + 1] * 256 + px[p + 2] * 65536;
			if (id === 0) continue;
			covered++;
			pixCount[id]++;
			if (!seen[id]) seen[id] = 1;
		}
		let visible = 0;
		let visibleIn = 0;
		const visByBin = new Array(6).fill(0);
		for (let i = 0; i < n; i++)
			if (seen[i + 1]) {
				visible++;
				if (inF[i]) visibleIn++;
				visByBin[bin[i]]++;
				pixByBin[bin[i]] += pixCount[i + 1];
			}
		for (let b = 0; b < 6; b++) histVis[b] = visByBin[b];
		res.idPass = {
			visibleSegments: visible,
			coveredPixels: covered,
			coveredShare: covered / (Wd * Hd),
			visibleByRadiusBin: histVis,
			pixelsByRadiusBin: pixByBin,
			inFrustumNotVisible: n - out - visibleIn,
			overdrawEstimate: areaSumIn / Math.max(1, covered),
		};
	}
	return res;
}

/** Install `window.__lab` (merged with whatever the component adds). */
export function installDevHooks(
	r: LabRenderer,
	ctx: DevContext,
	extra: Record<string, unknown>,
): () => void {
	const W = window as Any;
	W.__lab = {
		...(W.__lab ?? {}),
		...extra,
		ready: true,
		renderer: r,
		device: r.device,
		perf: () => r.takePerf(),
		census: (opts: Any) => census(r, ctx, opts),
	};
	return () => {
		idModel?.destroy();
		idFb?.destroy();
		idModel = null;
		idFb = null;
		if (W.__lab?.renderer === r) W.__lab = undefined;
	};
}
