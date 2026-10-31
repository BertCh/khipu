import {
	type CSSProperties,
	type ReactNode,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import {
	ATTACH_TEXT,
	AXIS_TEXT,
	attachKind,
	axisKind,
	KNOT_DIR_TEXT,
	knotDirs,
	LONG_KNOTS,
	TERM_TEXT,
	TWIST_TEXT,
	termKind,
} from "#/lib/khipu/anatomy";
import {
	type CordPaint,
	describeColor,
	hexFor,
	paintsFor,
} from "#/lib/khipu/colors";
import {
	codeLabel,
	knotTypeName,
	valueConflictText,
} from "#/lib/khipu/describe";
import { packAlongCord } from "#/lib/khipu/layout";
import type {
	CodeTables,
	ColorTable,
	Cord,
	Knot,
	PrimaryCord,
} from "#/lib/khipu/types";
import { placeValues } from "#/lib/stories/derive";
import {
	CordRope,
	ElbowRope,
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
 * One cord, close up: drawn as the object is made (a short cut-out of the
 * cord it hangs from, its hitch, the plied rope, every knot, the end), with
 * callouts beside it that read each feature back in plain language and give
 * the recorder's code. Top cords rise from the primary instead of hanging;
 * subsidiaries hang from a piece of their parent.
 */

/** drawn cord diameter; the primary is drawn W */
const CORD_W = 14;
const PRIMARY_W = 22;
/** the cord column and the drawing's width; leaders run to its right edge */
const CORD_X = 100;
const SVG_W = 250;
/** a stub this long stands in for a cord whose length was not recorded */
const STUB_CM = 6;
/** the piece of parent cord a subsidiary is shown hanging from */
const PARENT_Y0 = 6;
const PARENT_Y1 = 170;
const SUB_HITCH_Y = 62;
/** height of a callout's label line; leaders aim at its middle */
const LABEL_H = 18;
const ROW_GAP = 10;

const PLACE_NAMES = [
	"units",
	"tens",
	"hundreds",
	"thousands",
	"ten-thousands",
	"hundred-thousands",
	"millions",
	"ten-millions",
	"hundred-millions",
];

const SLASH: Record<string, string> = { S: "\\", Z: "/" };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function placeName(place: number): string {
	return PLACE_NAMES[Math.round(Math.log10(place))] ?? `×${place}`;
}

/** The colour in force at a point along a spliced cord. */
function paintAt(paints: CordPaint[], cm: number): CordPaint {
	return (
		paints.find((p) => !p.range || (cm >= p.range[0] && cm <= p.range[1])) ??
		paints[0]
	);
}

/** Splice ranges re-based when the drawn rope starts a little past 0 cm. */
function shiftPaints(paints: CordPaint[], byCm: number): CordPaint[] {
	if (byCm === 0) return paints;
	return paints.map((p) =>
		p.range
			? {
					...p,
					range: [
						Math.max(0, p.range[0] - byCm),
						Math.max(0, p.range[1] - byCm),
					],
				}
			: p,
	);
}

/** Half the drawn width of a knot cluster, in px, matching PhysicalKnot. */
function glyphHalfW(k: Knot, w: number): number {
	switch (k.type) {
		case "LL":
			return w * 1.5;
		case "BL":
			return w * 1.32;
		case "EE":
			return w * 1.5;
		case "E":
			return w * 1.22;
		default:
			return w * 1.12;
	}
}

/** "tied Z (/)", or one letter per knot when the cluster mixes them. */
function dirPhrase(dirs: string[]): string {
	const known = dirs.filter((d) => d === "S" || d === "Z");
	if (!known.length) return "direction not recorded";
	if (new Set(dirs).size === 1) return `tied ${dirs[0]} (${SLASH[dirs[0]]})`;
	return `tied ${dirs.join(", ")}`;
}

/** "3 single knots", "Long knot, 5 turns", "Figure-eight knot". */
function knotWhat(k: Knot): string {
	const n = Math.max(1, k.n);
	const s = n === 1 ? "" : "s";
	const name = knotTypeName(k.type);
	if (LONG_KNOTS.has(k.type)) return `${cap(name)} knot, ${n} turn${s}`;
	if (n === 1 && k.type !== "S") return `${cap(name)} knot`;
	return `${n} ${name} knot${s}`;
}

/** How the crossing strand leans, from KNOT_DIR_TEXT, minus the "tied X —". */
function leanNote(dirs: string[]): string | null {
	const uniq = [...new Set(dirs.filter((d) => d === "S" || d === "Z"))];
	if (!uniq.length) return null;
	const how = (d: string) => KNOT_DIR_TEXT[d].replace(/^tied \w — /, "");
	if (uniq.length === 1) return cap(how(uniq[0]));
	return `${cap(how(uniq[0]))} on the ${uniq[0]} knots, ${SLASH[uniq[1]]} on the ${uniq[1]}`;
}

interface Callout {
	key: string;
	label: string;
	code: string;
	lines: ReactNode[];
	/** the feature the leader points at */
	fx: number;
	fy: number;
	/** rows are estimated at this height until measured */
	estH: number;
}

export default function CordAnatomy({
	cord,
	parent,
	primary,
	colors,
	codes,
	khipuId,
}: {
	cord: Cord;
	parent?: Cord | null;
	primary: PrimaryCord;
	colors: ColorTable;
	codes: CodeTables;
	khipuId?: string;
}) {
	const w = CORD_W;
	const W = PRIMARY_W;
	const up = cord.kind === "top";
	const sub = cord.kind === "subsidiary";
	const d = up ? -1 : 1;
	const paints = paintsFor(cord.colorParsed, colors);
	const ak = attachKind(cord);
	const lastKnot = cord.knots.reduce((a, k) => Math.max(a, k.pos), 0);
	const drawnLen = cord.length ?? Math.max(STUB_CM, lastKnot + 2);
	// the scale fits the cord to the page, then stretches it if its knot
	// clusters — drawn far taller than life — need more room to sit one
	// after another below the hitch, with bare cord between them
	const halves = cord.knots.map((k) => knotHalfH(k, w));
	const knotGap = w * 1.6;
	const clear = hitchDepth(w, W, ak, sub);
	const knotRoom = clear + halves.reduce((a, h) => a + 2 * h + knotGap, 0) + w;
	const ppc = Math.max(
		Math.min(12, Math.max(3, 560 / drawnLen)),
		knotRoom / drawnLen,
	);

	/* --- geometry: where 0 cm sits and how far the drawing reaches --- */

	// pendants hang from the primary's centre line; a subsidiary's column
	// starts below the elbow from its parent; top cords rise to a tip at the top
	const parentX = CORD_X - 42;
	const hitchY = up ? 44 + drawnLen * ppc : sub ? SUB_HITCH_Y : 40;
	const elbow = w * 1.9;
	const origin = sub ? hitchY + elbow : hitchY;
	const cmY = (cm: number) => origin + d * cm * ppc;
	const tipY = cmY(drawnLen);
	// a verso cord emerges from the choke of its loop, below the primary
	const chokeCm = ak === "verso" && !sub ? (W / 2 + w * 1.15) / ppc : 0;
	const ropeStart = cmY(chokeCm);
	// knot clusters centre on their position, kept on the cord and apart
	const knotYs = packAlongCord(
		cord.knots.map((k, i) => ({ pos: k.pos * ppc, half: halves[i] })),
		cord.length == null ? null : drawnLen * ppc,
		clear,
		knotGap,
	).map((t) => origin + d * t);
	const drawingH = up ? hitchY + W / 2 + w * 1.5 + 12 : tipY + w * 3 + 8;
	const scaleX = sub ? parentX - w * 1.2 - 8 : CORD_X - 42;

	const primaryPaints = paintsFor(primary.colorParsed, colors);
	const parentPaints = parent
		? paintsFor(parent.colorParsed, colors)
		: [{ base: hexFor(undefined, colors), codes: [] }];
	const ropes: RopeSpec[] = [
		{ paints, twist: cord.twist },
		sub
			? { paints: parentPaints, twist: parent?.twist }
			: {
					paints: primaryPaints,
					twist: primary.twist,
					orientation: "horizontal",
					w: W,
				},
	];

	/* --- the callouts, in order along the cord --- */

	const placeOf = new Map<Knot, number>();
	for (const { place, knots } of placeValues(cord))
		for (const k of knots) placeOf.set(k, place);

	const fibre = primary.fiber ? codeLabel("fiber", primary.fiber, codes) : null;
	const tw = TWIST_TEXT[cord.twist?.[0] ?? "U"] ?? TWIST_TEXT.U;
	const tt = TERM_TEXT[termKind(cord.term)];
	const barber = paints.some((p) => p.pattern === "barberpole");
	const swatchCodes = cord.colorParsed?.flatMap((s) => s.codes) ?? [];

	const callouts: Callout[] = [];

	// attachment
	{
		const at = ATTACH_TEXT[ak];
		const face = at.how ? `${at.label} — ${at.how}` : "";
		const parentName = parent?.name ?? cord.parent ?? "its parent";
		const text = sub
			? `Subsidiary of ${parentName}, hitched ${cord.pos != null ? `at ${cord.pos} cm along it` : "to it"}${face ? `; ${face}` : ""}`
			: face
				? cap(face)
				: "Attachment not recorded";
		// the dot sits on the collar (or the V) just past the primary's edge; a
		// top cord's is marked on the collar's lower end, so that its row can sit
		// below the twist row without the leaders crossing
		const [fx, fy] = sub
			? [parentX + w * 0.75 + 5, hitchY - w * 1.05]
			: ak === "verso"
				? [CORD_X + w * 1.35 + 4, hitchY + d * (W / 2 + w * 0.6)]
				: ak === "unknown"
					? [CORD_X + w / 2 + 4, hitchY]
					: up
						? [CORD_X + w * 1.15 + 4, hitchY + W / 2 + w * 0.1]
						: [CORD_X + w * 1.15 + 4, hitchY + W / 2 + w * 0.25];
		callouts.push({
			key: "attach",
			label: "Attachment",
			code: cord.attach ?? "—",
			lines: [text],
			fx,
			fy,
			estH: LABEL_H + 34,
		});
	}

	// twist and colour: a little way down the cord, in the first clear gap
	{
		const spans = knotYs
			.map((c, i) => [c - halves[i], c + halves[i]] as const)
			.sort((a, b) => a[0] - b[0]);
		const hitchClear = sub ? origin + w : hitchY + d * (W / 2 + w * 1.7 + 6);
		let y = hitchClear + d * 12;
		for (const [a, b] of up ? [...spans].reverse() : spans) {
			const inside = y >= a - w * 0.9 && y <= b + w * 0.9;
			if (inside) y = up ? a - w * 1.2 : b + w * 1.2;
		}
		const text = tw.how
			? `${cap(tw.label)}${fibre ? `, khipu fibre ${fibre}` : ""} — ${tw.how}`
			: `Twist not recorded${fibre ? `; khipu fibre ${fibre}` : ""}`;
		const lines: ReactNode[] = [
			text,
			<>
				<span className="kd-swatches">
					{swatchCodes.map((code, i) => (
						<i
							// biome-ignore lint/suspicious/noArrayIndexKey: positional
							key={i}
							style={{ background: hexFor(code, colors) }}
						/>
					))}
				</span>
				{cord.color ?? "—"} — {describeColor(cord.colorParsed, colors)}
				{barber && "; the stripes follow the twist"}
			</>,
		];
		if (cord.thick != null) lines.push(`${cord.thick} cm thick`);
		callouts.push({
			key: "twist",
			label: "Twist and colour",
			code: cord.twist ?? "—",
			lines,
			fx: CORD_X + w / 2 + 4,
			fy: y,
			estH: LABEL_H + 17 * lines.length + 8,
		});
	}

	// one per knot cluster
	cord.knots.forEach((k, i) => {
		const dirs = knotDirs(k);
		const axis = axisKind(k);
		const place = placeOf.get(k);
		const value =
			k.value == null
				? "no value"
				: place != null
					? `${placeName(place)}: ${k.value.toLocaleString()}`
					: k.value.toLocaleString();
		const text = `${knotWhat(k)}, ${dirPhrase(dirs)}${axis ? `, axis ${axis},` : ""} at ${k.pos} cm — ${value}`;
		const lines: ReactNode[] = [text];
		const lean = leanNote(dirs);
		// the lean is explained once, on the first cluster, and again wherever a cluster mixes directions
		if (lean && (i === 0 || new Set(dirs).size > 1))
			lines.push(<span className="ca-note">{lean}</span>);
		if (axis)
			lines.push(<span className="ca-note">{cap(AXIS_TEXT[axis])}</span>);
		callouts.push({
			key: `knot-${i}`,
			label: `Knot${k.type === "S" && k.n > 1 ? "s" : ""} at ${k.pos} cm`,
			code: `${k.type}${k.n} ${k.dir || "U"}${k.axis ? ` ${k.axis}` : ""}`,
			lines,
			fx: CORD_X + glyphHalfW(k, w) + 6,
			fy: knotYs[i],
			estH: LABEL_H + 17 * lines.length + 8,
		});
	});

	// the end
	{
		const lines: ReactNode[] = [
			tt.how ? `${cap(tt.label)} — ${tt.how}` : "End not recorded",
			cord.length != null ? `${cord.length} cm long` : "Length not recorded",
		];
		callouts.push({
			key: "end",
			label: "End",
			code: cord.term ?? "—",
			lines,
			fx: CORD_X + w * 0.95 + 4,
			fy: tipY + d * w * 0.5,
			estH: LABEL_H + 17 * lines.length + 8,
		});
	}

	// rows sit beside their features, nudged apart when features are close
	callouts.sort((a, b) => a.fy - b.fy);

	/* --- row layout: measured heights, or estimates before the first paint --- */

	const rowEls = useRef<(HTMLLIElement | null)[]>([]);
	const [heights, setHeights] = useState<number[]>([]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the cord changes
	useLayoutEffect(() => {
		const measure = () => {
			const hs = rowEls.current
				.slice(0, callouts.length)
				.map((el) => el?.offsetHeight ?? 0);
			setHeights((old) =>
				old.length === hs.length && old.every((h, i) => h === hs[i]) ? old : hs,
			);
		};
		measure();
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	}, [cord, colors]);

	// rows start level with their features, then overlapping neighbours are
	// pushed apart both ways so a cluster of close callouts stays centred on
	// the features it names
	const hs = callouts.map((c, i) => heights[i] || c.estH);
	const tops = callouts.map((c) => c.fy - LABEL_H / 2);
	for (let pass = 0; pass < 40; pass++) {
		let moved = false;
		for (let i = 1; i < tops.length; i++) {
			const overlap = tops[i - 1] + hs[i - 1] + ROW_GAP - tops[i];
			if (overlap > 0.5) {
				tops[i - 1] -= overlap / 2;
				tops[i] += overlap / 2;
				moved = true;
			}
		}
		if (tops[0] < 0) {
			tops[0] = 0;
			moved = true;
		}
		if (!moved) break;
	}
	// a final forward pass makes the order strict whatever the clamp did
	let next = 0;
	for (let i = 0; i < tops.length; i++) {
		tops[i] = Math.max(tops[i], next);
		next = tops[i] + hs[i] + ROW_GAP;
	}
	const totalY = Math.max(up ? hitchY + W / 2 + 18 : tipY + w * 1.4, next + 4);
	// the svg is only as tall as the drawing (leaders may overflow it); the
	// row column is as tall as whichever reaches further
	const colH = Math.max(drawingH, totalY + 40);
	const edgeX = SVG_W - 1;
	const bendX = CORD_X + w * 2.2 + 8;

	/* --- the cm scale --- */

	const ticks: number[] = [];
	for (let cm = 0; cm <= drawnLen; cm += 5) ticks.push(cm);

	const paint0 = paintAt(paints, 0);
	const title = `${khipuId ? `${khipuId} ` : ""}${cord.name}`;

	return (
		<div className="cord-anatomy">
			<div className="ca-body">
				<svg
					width={SVG_W}
					height={drawingH}
					viewBox={`0 0 ${SVG_W} ${drawingH}`}
					role="img"
					aria-label={`${title}, drawn close up; value ${cord.value ?? "unknown"}`}
				>
					<title>{title}</title>
					<RopeDefs w={w} ropes={ropes} />
					<defs>
						{/* the cut-outs of the primary or parent fade at their cut ends; the
						    geometry is the same in every instance, so the ids can be shared */}
						<linearGradient
							id="ca-fade-h"
							gradientUnits="userSpaceOnUse"
							x1={CORD_X - 70}
							x2={CORD_X + 70}
							y1={0}
							y2={0}
						>
							<stop offset="0" stopColor="#fff" stopOpacity={0} />
							<stop offset="0.18" stopColor="#fff" stopOpacity={1} />
							<stop offset="0.82" stopColor="#fff" stopOpacity={1} />
							<stop offset="1" stopColor="#fff" stopOpacity={0} />
						</linearGradient>
						<linearGradient
							id="ca-fade-v"
							gradientUnits="userSpaceOnUse"
							x1={0}
							x2={0}
							y1={PARENT_Y0}
							y2={PARENT_Y1}
						>
							<stop offset="0" stopColor="#fff" stopOpacity={0} />
							<stop offset="0.18" stopColor="#fff" stopOpacity={1} />
							<stop offset="0.82" stopColor="#fff" stopOpacity={1} />
							<stop offset="1" stopColor="#fff" stopOpacity={0} />
						</linearGradient>
						<mask
							id="ca-mask-h"
							maskUnits="userSpaceOnUse"
							x={0}
							y={0}
							width={SVG_W}
							height={9999}
						>
							<rect
								x={0}
								y={0}
								width={SVG_W}
								height={9999}
								fill="url(#ca-fade-h)"
							/>
						</mask>
						<mask
							id="ca-mask-v"
							maskUnits="userSpaceOnUse"
							x={0}
							y={0}
							width={SVG_W}
							height={9999}
						>
							<rect
								x={0}
								y={0}
								width={SVG_W}
								height={9999}
								fill="url(#ca-fade-v)"
							/>
						</mask>
					</defs>

					{/* cm scale, drawn first so the hitch sits over its start */}
					<g className="ca-scale">
						<line x1={scaleX} x2={scaleX} y1={cmY(0)} y2={tipY} />
						{ticks.map((cm) => (
							<g key={cm}>
								<line x1={scaleX - 5} x2={scaleX} y1={cmY(cm)} y2={cmY(cm)} />
								{cm % 10 === 0 && cm > 0 && (
									<text
										x={scaleX - 8}
										y={cmY(cm)}
										className="kd-label"
										textAnchor="end"
										dominantBaseline="middle"
									>
										{cm}
									</text>
								)}
							</g>
						))}
						<text
							x={scaleX - 8}
							y={tipY + d * 12}
							className="kd-label"
							textAnchor="end"
							dominantBaseline="middle"
						>
							cm
						</text>
					</g>

					{sub ? (
						<g>
							<g mask="url(#ca-mask-v)">
								<CordRope
									x={parentX}
									y0={PARENT_Y0}
									y1={PARENT_Y1}
									w={w}
									paints={[paintAt(parentPaints, cord.pos ?? 0)]}
									twist={parent?.twist}
								/>
							</g>
							<ElbowRope
								ax={parentX}
								ay={hitchY}
								x={CORD_X}
								y0={origin}
								w={w}
								paint={paint0}
							/>
							<SubsidiaryHitch
								x={parentX}
								y={hitchY}
								w={w}
								kind={ak}
								paint={paint0}
							/>
						</g>
					) : (
						<g mask="url(#ca-mask-h)">
							<PendantHitch
								x={CORD_X}
								y={hitchY}
								w={w}
								W={W}
								kind={ak}
								paint={paint0}
								up={up}
								layer="behind"
							/>
							<PrimaryRope
								x0={CORD_X - 70}
								x1={CORD_X + 70}
								y={hitchY}
								W={W}
								paint={primaryPaints[0]}
								twist={primary.twist}
								structure={primary.structure}
								begin="unknown"
								term="unknown"
							/>
						</g>
					)}

					<CordRope
						x={CORD_X}
						y0={ropeStart}
						y1={tipY}
						w={w}
						paints={shiftPaints(paints, chokeCm)}
						twist={cord.twist}
						dashed={cord.length == null}
						pxPerCm={ppc}
					/>
					{cord.knots.map((k, i) => (
						<PhysicalKnot
							// biome-ignore lint/suspicious/noArrayIndexKey: positional
							key={i}
							x={CORD_X}
							y={knotYs[i]}
							w={w}
							knot={k}
							paint={paintAt(paints, k.pos)}
							up={up}
						/>
					))}
					{cord.length != null && (
						<CordEnd
							x={CORD_X}
							y={tipY}
							w={w}
							kind={termKind(cord.term)}
							paint={paintAt(paints, drawnLen)}
							up={up}
						/>
					)}
					{!sub && (
						<PendantHitch
							x={CORD_X}
							y={hitchY}
							w={w}
							W={W}
							kind={ak}
							paint={paint0}
							up={up}
							layer="front"
						/>
					)}

					{/* leaders: a dot at the feature, out past the knots, then to the row */}
					<g className="ca-leaders">
						{callouts.map((c, i) => {
							const bx = Math.max(bendX, c.fx + 6);
							const ry = tops[i] + LABEL_H / 2;
							return (
								<g key={c.key}>
									<circle cx={c.fx} cy={c.fy} r={2.2} />
									<polyline
										points={`${c.fx + 2.2},${c.fy} ${bx},${c.fy} ${edgeX},${ry}`}
									/>
								</g>
							);
						})}
					</g>
				</svg>

				<ol
					className="ca-rows"
					style={{ "--ca-h": `${colH}px` } as CSSProperties}
				>
					{callouts.map((c, i) => (
						<li
							key={c.key}
							ref={(el) => {
								rowEls.current[i] = el;
							}}
							className="ca-row"
							style={{ top: tops[i] }}
						>
							<div className="ca-row-head">
								<b className="ca-label">{c.label}</b>
								<span className="ca-code">{c.code}</span>
							</div>
							{c.lines.map((line, j) => (
								<div
									// biome-ignore lint/suspicious/noArrayIndexKey: positional
									key={j}
									className="ca-read"
								>
									{line}
								</div>
							))}
						</li>
					))}
					<li className="ca-total" style={{ top: totalY }}>
						= {cord.value != null ? cord.value.toLocaleString() : "—"}
						{cord.altValue != null &&
							cord.altValue !== 0 &&
							cord.altValue !== cord.value && (
								<small>alt. {cord.altValue.toLocaleString()}</small>
							)}
						{cord.valueConflict && (
							<small className="value-conflict" title={valueConflictText(cord)}>
								knots read {cord.valueConflict.knots.toLocaleString()} · sources
								disagree
							</small>
						)}
					</li>
				</ol>
			</div>
		</div>
	);
}
