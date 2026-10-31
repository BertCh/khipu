import { useMemo } from "react";
import {
	attachKind,
	beginKind,
	cordDiameter,
	medianThickness,
	termKind,
} from "#/lib/khipu/anatomy";
import type { CordPaint } from "#/lib/khipu/colors";
import { knotClusterYs, type Layout } from "#/lib/khipu/layout";
import type { Cord } from "#/lib/khipu/types";
import {
	CordRope,
	ElbowRope,
	fitKnots,
	hitchDepth,
	knotHalfH,
	PendantHitch,
	PhysicalKnot,
	RopeDefs,
	type RopeSpec,
	SubsidiaryHitch,
} from "./physical";
import { CordEnd, PrimaryRope } from "./physicalEnds";

/**
 * The physical renderer's layers of a laid-out khipu — everything between
 * the group brackets and the labels: the primary cord as a rope with its
 * ends, every cord as plied rope hung from its half-hitch, knots as they
 * were tied, ends as they were found. Drawn back to front the way the
 * object overlaps itself: verso loops behind the primary, recto crossings
 * in front of it.
 */
export function PhysicalLayers({
	layout,
	paintsOf,
	primaryPaint,
	dimmed,
}: {
	layout: Layout;
	paintsOf: (c: Cord) => CordPaint[];
	primaryPaint: CordPaint;
	dimmed: (c: Cord) => boolean;
}) {
	const o = layout.options;
	const w = o.cordW ?? 2.2;
	const W = w * 1.6;
	const primary = layout.khipu.primary;
	const median = useMemo(
		() => medianThickness(layout.khipu.cords),
		[layout.khipu.cords],
	);
	const ropes: RopeSpec[] = useMemo(
		() => [
			{
				paints: [primaryPaint],
				twist: primary.twist,
				orientation: "horizontal",
				w: W,
			},
			...layout.nodes.map((n) => ({
				paints: paintsOf(n.cord),
				twist: n.cord.twist,
			})),
		],
		[layout.nodes, paintsOf, primaryPaint, primary.twist, W],
	);
	const diam = (c: Cord) => cordDiameter(c, w, median);
	const pendants = layout.nodes.filter((n) => !n.parent);
	const fade = (c: Cord) => ({ opacity: dimmed(c) ? 0.4 : 1 });

	return (
		<g className="kd-physical">
			<RopeDefs w={w} ropes={ropes} />

			{/* what lies behind the primary cord: verso loops' far arms */}
			<g className="kd-hitch-behind">
				{pendants.map((n) => (
					<g key={n.cord.name} className="kd-fade" style={fade(n.cord)}>
						<PendantHitch
							x={n.x}
							y={n.ay}
							w={diam(n.cord)}
							W={W}
							kind={attachKind(n.cord)}
							paint={paintsOf(n.cord)[0]}
							up={n.up}
							layer="behind"
						/>
					</g>
				))}
			</g>

			<PrimaryRope
				x0={layout.primaryX0}
				x1={layout.primaryX1}
				y={layout.primaryY}
				W={W}
				paint={primaryPaint}
				twist={primary.twist}
				structure={primary.structure}
				begin={beginKind(primary.beginning)}
				term={termKind(primary.term)}
			/>

			{/* the cords, parents before children so a hitch sits on its parent */}
			<g className="kd-ropes">
				{layout.nodes.map((n) => {
					const paints = paintsOf(n.cord);
					const cw = diam(n.cord);
					// a pendant's rope shows from the primary's edge: a recto crossing
					// is drawn by its hitch, a verso cord passes behind
					const y0 = n.parent ? n.y0 : n.y0 + (n.up ? -1 : 1) * (W / 2 - 0.5);
					return (
						<g key={n.cord.name} className="kd-fade" style={fade(n.cord)}>
							{n.parent && (
								<ElbowRope
									ax={n.ax}
									ay={n.ay}
									x={n.x}
									y0={n.y0}
									w={cw}
									paint={paints[0]}
								/>
							)}
							<CordRope
								x={n.x}
								y0={y0}
								y1={n.y1}
								w={cw}
								paints={paints}
								twist={n.cord.twist}
								dashed={!n.lengthKnown}
								pxPerCm={o.pxPerCm}
							/>
						</g>
					);
				})}
			</g>

			{/* hitches in front: a subsidiary's on its parent, a pendant's on the primary */}
			<g className="kd-hitches">
				{layout.nodes.map((n) => {
					const kind = attachKind(n.cord);
					const paint = paintsOf(n.cord)[0];
					const cw = diam(n.cord);
					return (
						<g key={n.cord.name} className="kd-fade" style={fade(n.cord)}>
							{n.parent ? (
								<SubsidiaryHitch
									x={n.ax}
									y={n.ay}
									w={cw}
									kind={kind}
									paint={paint}
								/>
							) : (
								<PendantHitch
									x={n.x}
									y={n.ay}
									w={cw}
									W={W}
									kind={kind}
									paint={paint}
									up={n.up}
									layer="front"
								/>
							)}
						</g>
					);
				})}
			</g>

			{/* knots: at their recorded positions, kept on the cord below its hitch and apart, closed up or shrunk to fit it */}
			<g className="kd-knots">
				{layout.nodes.map((n) => {
					if (n.cord.knots.length === 0) return null;
					const paint = paintsOf(n.cord)[0];
					const cw = diam(n.cord);
					const clear = hitchDepth(cw, W, attachKind(n.cord), !!n.parent);
					const gap = cw * 0.3;
					const fit = fitKnots(
						n.cord.knots,
						cw,
						n.lengthKnown ? Math.abs(n.y1 - n.y0) : null,
						clear,
						gap,
					);
					const ys = knotClusterYs(
						n,
						n.cord.knots.map((k) => knotHalfH(k, fit.w, fit.pitch)),
						o,
						clear,
						gap,
					);
					return (
						<g key={n.cord.name} className="kd-fade" style={fade(n.cord)}>
							{n.cord.knots.map((k, i) => (
								<PhysicalKnot
									// biome-ignore lint/suspicious/noArrayIndexKey: knots have no id
									key={i}
									x={n.x}
									y={ys[i]}
									w={fit.w}
									pitch={fit.pitch}
									knot={k}
									paint={paint}
									up={n.up}
								/>
							))}
						</g>
					);
				})}
			</g>

			<g className="kd-ends">
				{layout.nodes.map((n) => {
					const kind = termKind(n.cord.term);
					if (kind === "unknown" || !n.lengthKnown) return null;
					return (
						<g key={n.cord.name} className="kd-fade" style={fade(n.cord)}>
							<CordEnd
								x={n.x}
								y={n.y1}
								w={diam(n.cord)}
								kind={kind}
								paint={paintsOf(n.cord)[0]}
								up={n.up}
							/>
						</g>
					);
				})}
			</g>
		</g>
	);
}
