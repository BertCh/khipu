import { fitGlyphs, KnotGlyph } from "#/components/khipu/KhipuDiagram";
import { hexFor, inkOn, paintsFor } from "#/lib/khipu/colors";
import { knotTypeName } from "#/lib/khipu/describe";
import type { CordNode, LayoutOptions } from "#/lib/khipu/layout";
import { DEFAULT_LAYOUT } from "#/lib/khipu/layout";
import type { ColorTable, Cord } from "#/lib/khipu/types";
import { placeValues } from "#/lib/stories/derive";

const PLACE_NAME: Record<number, string> = {
	1: "units",
	10: "tens",
	100: "hundreds",
	1000: "thousands",
	10000: "ten-thousands",
	100000: "hundred-thousands",
	1000000: "millions",
	10000000: "ten-millions",
	100000000: "hundred-millions",
};

/**
 * One cord, large, with its decimal places named: the knots sit where the
 * recorder measured them, and each cluster is read out beside it. This is
 * the part of a khipu we can read with confidence.
 */
export default function CordReader({
	cord,
	colors,
	pxPerCm = 6,
	title,
}: {
	cord: Cord;
	colors: ColorTable;
	pxPerCm?: number;
	title?: string;
}) {
	const paint = paintsFor(cord.colorParsed, colors)[0];
	const ink = inkOn(paint.base);
	const len = cord.length ?? 30;
	const scale = 2.2;
	const padTop = 22;
	const x = 60;
	const height = padTop + len * pxPerCm + 24;
	const options: LayoutOptions = { ...DEFAULT_LAYOUT, pxPerCm };
	// a stand-in node so the diagram's knot glyphs can be reused unchanged;
	// the glyphs draw inside a group scaled by `scale`, so its end is in that space
	const node: CordNode = {
		cord,
		x: 0,
		y0: 0,
		y1: (len * pxPerCm) / scale,
		ax: 0,
		ay: 0,
		up: false,
		lengthKnown: cord.length != null,
		parent: null,
		children: [],
	};
	const glyphOptions = { ...options, pxPerCm: pxPerCm / scale };
	const glyphs = fitGlyphs(node, glyphOptions);
	const places = placeValues(cord);
	const cmY = (cm: number) => padTop + cm * pxPerCm;
	// readout rows sit beside their knots, nudged apart when knots are close
	const ROW = 44;
	const rowY: number[] = [];
	for (const { knots } of places) {
		const want = cmY(knots[0].pos) - 12;
		const prev = rowY.at(-1);
		rowY.push(prev == null ? want : Math.max(want, prev + ROW));
	}
	const totalY = Math.max(cmY(len) + 4, (rowY.at(-1) ?? 0) + ROW);
	const ticks = [];
	for (let cm = 0; cm <= len; cm += 5) ticks.push(cm);

	return (
		<div className="cord-reader">
			<svg
				width={x + 40}
				height={height}
				viewBox={`0 0 ${x + 40} ${height}`}
				role="img"
				aria-label={`Cord ${cord.name}, value ${cord.value ?? "unknown"}`}
			>
				<title>{title ?? cord.name}</title>
				{/* primary cord stub */}
				<line
					x1={x - 30}
					x2={x + 30}
					y1={padTop}
					y2={padTop}
					stroke="var(--cord-casing)"
					strokeWidth={7}
					strokeLinecap="round"
				/>
				<line
					x1={x - 30}
					x2={x + 30}
					y1={padTop}
					y2={padTop}
					stroke={hexFor("W", colors)}
					strokeWidth={4.5}
					strokeLinecap="round"
				/>
				{/* cm ticks */}
				{ticks.map((cm) => (
					<g key={cm}>
						<line
							x1={x - 26}
							x2={x - 20}
							y1={cmY(cm)}
							y2={cmY(cm)}
							stroke="var(--rule)"
						/>
						<text
							x={x - 29}
							y={cmY(cm)}
							className="kd-label"
							textAnchor="end"
							dominantBaseline="middle"
						>
							{cm}
						</text>
					</g>
				))}
				{/* the cord */}
				<line
					x1={x}
					x2={x}
					y1={padTop}
					y2={cmY(len)}
					stroke="var(--cord-casing)"
					strokeWidth={CORD_W * scale + 2}
					strokeLinecap="round"
				/>
				<line
					x1={x}
					x2={x}
					y1={padTop}
					y2={cmY(len)}
					stroke={paint.base}
					strokeWidth={CORD_W * scale}
					strokeLinecap="round"
				/>
				{paint.accent && (
					<line
						x1={x}
						x2={x}
						y1={padTop}
						y2={cmY(len)}
						stroke={paint.accent}
						strokeWidth={CORD_W * scale * 0.55}
						strokeDasharray="2 5"
					/>
				)}
				<g transform={`translate(${x} ${padTop}) scale(${scale})`}>
					{cord.knots.map((k, i) => (
						<KnotGlyph
							// biome-ignore lint/suspicious/noArrayIndexKey: positional
							key={i}
							node={node}
							knot={k}
							options={glyphOptions}
							ink={ink}
							cord={paint.base}
							y={glyphs.ys[i]}
							scale={glyphs.scale}
						/>
					))}
				</g>
			</svg>
			<ol className="cord-readout">
				{places.map(({ place, knots }, i) => (
					<li key={place} style={{ top: rowY[i] }} className="readout-row">
						<span className="readout-place">{PLACE_NAME[place] ?? place}</span>
						<span className="readout-knots">
							{knots.map((k) => describeKnotShort(k)).join(" + ")}
						</span>
						<strong className="readout-value">
							{knots.reduce((a, k) => a + (k.value ?? 0), 0).toLocaleString()}
						</strong>
					</li>
				))}
				<li className="readout-total" style={{ top: totalY }}>
					<span>
						= {cord.value != null ? cord.value.toLocaleString() : "—"}
					</span>
				</li>
			</ol>
		</div>
	);
}

const CORD_W = 2.2;

function describeKnotShort(k: Cord["knots"][number]): string {
	const t = knotTypeName(k.type);
	if (k.type === "L" || k.type === "LL" || k.type === "BL" || k.type === "SP")
		return `${t} knot, ${k.n} turn${k.n === 1 ? "" : "s"}`;
	if (k.type === "E") return "figure-eight";
	return `${k.n} ${t}${k.n === 1 ? "" : "s"}`;
}
