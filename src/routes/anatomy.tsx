import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
	CordRope,
	PendantHitch,
	PhysicalKnot,
	RopeDefs,
	type RopeSpec,
} from "#/components/khipu/physical";
import { CordEnd, PrimaryRope } from "#/components/khipu/physicalEnds";
import {
	CASING_W,
	CORD_W,
	CordStroke,
	KnotGlyph,
	SchematicEnd,
	SchematicHitch,
} from "#/components/khipu/schematic";
import {
	type AttachKind,
	BEGIN_TEXT,
	type BeginKind,
	STRUCTURE_TEXT,
	TERM_TEXT,
	type TermKind,
} from "#/lib/khipu/anatomy";
import { type CordPaint, hexFor, inkOn, paintsFor } from "#/lib/khipu/colors";
import { getColors, getCorpus } from "#/lib/khipu/data";
import type { CordNode, Layout, LayoutOptions } from "#/lib/khipu/layout";
import type { ColorSegment, Knot, KnotType } from "#/lib/khipu/types";

/**
 * The reader's guide to the drawing: what the record encodes, feature by
 * feature, and how the two renderers show it. Every sample is drawn by the
 * glyph code the diagrams use, so the guide cannot drift from the drawing.
 */

export const Route = createFileRoute("/anatomy")({
	loader: async () => {
		const [corpus, colors] = await Promise.all([getCorpus(), getColors()]);
		return { corpus, colors };
	},
	head: () => ({ meta: [{ title: "Reading the drawing — Khipu" }] }),
	component: Anatomy,
});

/* ---------------------------------------------------------------------------
   Sample geometry. The schematic is magnified SS× from the diagram's own
   units; the physical side is drawn 1:1 at a W px cord, W_P for the primary.
   --------------------------------------------------------------------------- */

const SS = 2.5;
/** schematic pane, px */
const SW = 80;
/** the arrow gutter between the panes */
const GAP = 26;
/** physical pane, px */
const PW = 90;
/** physical cord diameter */
const W = 14;
/** physical primary cord diameter, in the attachment samples */
const W_P = 22;
/** and in the primary-cord samples, where it stands alone */
const W_P2 = 18;
/** schematic cord column, in schematic units */
const SX = SW / SS / 2;
/** physical cord column */
const PX = PW / 2;

const n = (x: number | undefined) => (x ?? 0).toLocaleString();

/** Enough of a laid-out cord for the schematic glyphs to sit on. */
function stub(x: number, y0: number, y1 = y0, up = false): CordNode {
	return {
		x,
		y0,
		y1,
		ax: x,
		ay: y0,
		up,
		lengthKnown: true,
		parent: null,
		children: [],
	} as unknown as CordNode;
}

const OPTIONS = { pxPerCm: 1 } as LayoutOptions;

function knot(
	type: KnotType,
	nn: number,
	dir: string,
	extra: Partial<Knot> = {},
): Knot {
	return { type, n: nn, pos: 0, dir, ...extra };
}

/**
 * One feature, schematic on the left and physical on the right, with a
 * caption. Each pane is its own nested <svg> so a stub of primary cord can
 * run off the edge and be clipped rather than show an end.
 */
function Sample({
	caption,
	note,
	h = 150,
	pw = PW,
	wide = false,
	schematic,
	physical,
}: {
	caption: string;
	note?: string;
	h?: number;
	pw?: number;
	/** takes a whole row on a phone */
	wide?: boolean;
	/** omitted when the schematic has no mark for the feature */
	schematic?: ReactNode;
	physical: ReactNode;
}) {
	const total = (schematic ? SW + GAP : 0) + pw;
	const ax = SW + 6;
	return (
		<figure className={wide ? "anat-sample is-wide" : "anat-sample"}>
			<svg
				width={total}
				height={h}
				viewBox={`0 0 ${total} ${h}`}
				aria-hidden="true"
			>
				{schematic && (
					<>
						<svg
							x={0}
							y={0}
							width={SW}
							height={h}
							viewBox={`0 0 ${SW / SS} ${h / SS}`}
							aria-hidden="true"
						>
							{schematic}
						</svg>
						<path
							className="anat-arrow"
							d={`M${ax},${h / 2} h${GAP - 12} m-3.5,-3.5 l3.5,3.5 l-3.5,3.5`}
							fill="none"
							strokeWidth={1.1}
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</>
				)}
				<svg
					x={schematic ? SW + GAP : 0}
					y={0}
					width={pw}
					height={h}
					viewBox={`0 0 ${pw} ${h}`}
					aria-hidden="true"
				>
					{physical}
				</svg>
			</svg>
			<figcaption>
				<b>{caption}</b>
				{note && <span>{note}</span>}
			</figcaption>
		</figure>
	);
}

/** A schematic cord: casing, then the coloured line, then whatever sits on it. */
function SchCord({
	paints,
	y0,
	y1,
	pxPerCm = 1,
	up = false,
	children,
}: {
	paints: CordPaint[];
	y0: number;
	y1: number;
	pxPerCm?: number;
	up?: boolean;
	children?: ReactNode;
}) {
	const node = stub(SX, y0, y1, up);
	const layout = { options: { pxPerCm } } as Layout;
	return (
		<g>
			<line
				x1={SX}
				x2={SX}
				y1={y0}
				y2={y1}
				stroke="var(--cord-casing)"
				strokeWidth={CASING_W}
				strokeLinecap="round"
			/>
			<CordStroke node={node} paints={paints} layout={layout} dim={false} />
			{children}
		</g>
	);
}

/** The schematic primary cord, as the diagram draws it: a wider plain line. */
function SchPrimary({ y, paint }: { y: number; paint: CordPaint }) {
	return (
		<g strokeLinecap="round">
			<line
				x1={-4}
				x2={SW / SS + 4}
				y1={y}
				y2={y}
				stroke="var(--cord-casing)"
				strokeWidth={CASING_W + 1.5}
			/>
			<line
				x1={-4}
				x2={SW / SS + 4}
				y1={y}
				y2={y}
				stroke={paint.base}
				strokeWidth={CORD_W + 1.5}
			/>
		</g>
	);
}

/** A physical cord: plied rope from y0 to y1, then whatever sits on it. */
function PhysCord({
	paints,
	twist,
	y0,
	y1,
	pxPerCm = 1,
	children,
}: {
	paints: CordPaint[];
	twist: string | null;
	y0: number;
	y1: number;
	pxPerCm?: number;
	children?: ReactNode;
}) {
	return (
		<g>
			<CordRope
				x={PX}
				y0={y0}
				y1={y1}
				w={W}
				paints={paints}
				twist={twist}
				pxPerCm={pxPerCm}
			/>
			{children}
		</g>
	);
}

function Samples({ children }: { children: ReactNode }) {
	return <div className="anat-samples">{children}</div>;
}

function Stat({ children }: { children: ReactNode }) {
	return <p className="anat-stat">{children}</p>;
}

/* ---------------------------------------------------------------------------
   The page
   --------------------------------------------------------------------------- */

const KNOT_H = 150;
const END_H = 120;

const KNOT_ROWS: {
	caption: string;
	note?: string;
	knot: Knot;
	twist?: string;
}[] = [
	{
		caption: "3 single knots, tied S",
		note: "the crossing strand leans \\; the dot is scratched \\",
		knot: knot("S", 3, "S"),
	},
	{
		caption: "3 single knots, tied Z",
		note: "leans /; scratched /",
		knot: knot("S", 3, "Z"),
	},
	{
		caption: "4 single knots, Z Z S Z",
		note: "one direction per knot, as recorded",
		knot: knot("S", 4, "ZZSZ"),
	},
	{
		caption: "long knot, 5 turns, S",
		note: "each turn of the coil leans \\; a hairline per turn",
		knot: knot("L", 5, "S"),
	},
	{
		caption: "long knot, 5 turns, Z",
		knot: knot("L", 5, "Z"),
	},
	{
		caption: "figure-eight, S",
		note: "two bights; the crossing between them leans \\",
		knot: knot("E", 1, "S"),
	},
	{
		caption: "figure-eight, Z",
		knot: knot("E", 1, "Z"),
	},
];

const AXIS_ROWS: { caption: string; note: string; knot: Knot }[] = [
	{
		caption: "long knot, 4 turns, axis down",
		note: "the wrapping strand enters obliquely at the top; the schematic notches the top",
		knot: knot("L", 4, "Z", { axis: "AXD" }),
	},
	{
		caption: "long knot, 4 turns, axis up",
		note: "enters at the bottom; notched at the bottom",
		knot: knot("L", 4, "Z", { axis: "AXU" }),
	},
	{
		caption: "long knot, 4 turns, axis not recorded",
		note: "no entry mark, no notch — the usual case",
		knot: knot("L", 4, "Z"),
	},
];

const RARE_ROWS: { caption: string; note?: string; knot: Knot }[] = [
	{
		caption: "double figure-eight",
		note: "a larger 8; the Aschers value it 2",
		knot: knot("EE", 1, "Z"),
	},
	{
		caption: "double long knot, 3 turns",
		note: "a long knot with two axes, from one khipu; valued 3",
		knot: knot("LL", 3, "Z"),
	},
	{
		caption: "belted long knot, 3 turns",
		note: "an extra wrap around the outside of the coil",
		knot: knot("BL", 3, "Z"),
	},
	{
		caption: "spiral, 3 wraps",
		note: "wraps without a coil; valued like a long knot",
		knot: knot("SP", 3, "Z"),
	},
	{
		caption: "tufted",
		note: "a single knot with the fibre left standing; valued 1",
		knot: knot("TF", 1, "Z"),
	},
	{
		caption: "unidentified",
		note: "a knot the recorder could not name",
		knot: knot("U", 1, "U"),
	},
];

/** The decimal sample: a cord reading 234, positions in cm. */
const PLACES: { knot: Knot; place: string }[] = [
	{ knot: knot("S", 2, "Z", { pos: 2, value: 200 }), place: "hundreds · 2" },
	{ knot: knot("S", 3, "Z", { pos: 7, value: 30 }), place: "tens · 3" },
	{ knot: knot("L", 4, "Z", { pos: 12, value: 4 }), place: "units · 4" },
];
/** vertical scale of the decimal and colour samples */
const PLACE_PX_PER_CM = 22;

const TERM_KINDS: TermKind[] = [
	"knotted",
	"broken",
	"cut",
	"ravelled",
	"doubled",
	"unfinished",
	"canutito",
	"twisted",
];

/** corpus.term is keyed by code */
const TERM_CODE: Record<TermKind, string> = {
	knotted: "K",
	broken: "B",
	cut: "C",
	ravelled: "R",
	doubled: "D",
	unfinished: "U",
	canutito: "TT",
	twisted: "T",
	unknown: "",
};

const BEGIN_KINDS: BeginKind[] = [
	"knotted",
	"doubled",
	"twisted",
	"tassel",
	"wooden-bar",
	"needlework",
	"broken",
	"ravelled",
	"affixed",
];

function Anatomy() {
	const { corpus, colors } = Route.useLoaderData();

	// one specimen cord colour throughout, a mid brown the marks read on;
	// white for the second colour, a paler brown for the primary cord
	const seg = (codes: string[], ops?: string[], range?: [number, number]) =>
		({ codes, ops, range }) as ColorSegment;
	const cord = paintsFor([seg(["AB"])], colors);
	const paint = cord[0];
	const primary = paintsFor([seg(["YB"])], colors)[0];
	const barber = paintsFor([seg(["W", "MB"], ["-"])], colors);
	const mottled = paintsFor([seg(["W", "MB"], [":"])], colors);
	const striped = paintsFor([seg(["MB", "W"], ["%"])], colors);
	const spliced = paintsFor(
		[seg(["SR"], undefined, [0, 2]), seg(["W"], undefined, [2, 5])],
		colors,
	);
	const ink = inkOn(paint.base);
	const thread = hexFor("SR", colors);

	// every pattern the samples need, once; ids carry the cord diameter
	const ropes: RopeSpec[] = [
		{ paints: cord, twist: "S" },
		{ paints: cord, twist: "Z" },
		{ paints: barber, twist: "S" },
		{ paints: barber, twist: "Z" },
		{ paints: mottled, twist: "S" },
		{ paints: striped, twist: "S" },
		{ paints: spliced, twist: "S" },
	];
	const primaryRope: RopeSpec = {
		paints: [primary],
		twist: "S",
		orientation: "horizontal",
	};

	const attach = corpus.attach;
	const twist = corpus.twist;
	const kt = corpus.knotTypes;
	const kd = corpus.knotDir;
	const term = corpus.term;
	const solid = Object.values(corpus.colorSolid).reduce((a, b) => a + b, 0);
	const noEnds = TERM_KINDS.filter((k) => !term[TERM_CODE[k]]);

	const hitch = (kind: AttachKind, up = false) => {
		const py = up ? 92 : 28;
		const spy = py / SS;
		return {
			schematic: (
				<g>
					<SchPrimary y={spy} paint={primary} />
					<SchCord
						paints={cord}
						y0={spy}
						y1={up ? 8 / SS : (END_H - 8) / SS}
						up={up}
					/>
					<SchematicHitch
						x={SX}
						y={spy}
						kind={kind}
						twist="S"
						cord={paint.base}
						ink={ink}
						up={up}
					/>
				</g>
			),
			physical: (
				<g>
					<PendantHitch
						x={PX}
						y={py}
						w={W}
						W={W_P}
						kind={kind}
						paint={paint}
						up={up}
						layer="behind"
					/>
					<PrimaryRope
						x0={-80}
						x1={PW + 80}
						y={py}
						W={W_P}
						paint={primary}
						twist="S"
						structure="P"
						begin="unknown"
						term="unknown"
					/>
					{/* the rope shows from the primary's edge, as in the diagram */}
					<CordRope
						x={PX}
						y0={py + (up ? -1 : 1) * (W_P / 2 - 0.5)}
						y1={up ? 8 : END_H - 8}
						w={W}
						paints={cord}
						twist="S"
					/>
					<PendantHitch
						x={PX}
						y={py}
						w={W}
						W={W_P}
						kind={kind}
						paint={paint}
						up={up}
						layer="front"
					/>
				</g>
			),
		};
	};

	const knotSample = (
		r: { caption: string; note?: string; knot: Knot; twist?: string },
		h = KNOT_H,
	) => {
		const k = { ...r.knot, pos: h / 2 / SS };
		return (
			<Sample
				key={r.caption}
				caption={r.caption}
				note={r.note}
				h={h}
				schematic={
					<SchCord paints={cord} y0={8 / SS} y1={(h - 8) / SS}>
						<KnotGlyph
							node={stub(SX, 0)}
							knot={k}
							options={OPTIONS}
							ink={ink}
							cord={paint.base}
						/>
					</SchCord>
				}
				physical={
					<PhysCord paints={cord} twist={r.twist ?? "S"} y0={8} y1={h - 8}>
						<PhysicalKnot x={PX} y={h / 2} w={W} knot={k} paint={paint} />
					</PhysCord>
				}
			/>
		);
	};

	const colourSample = (
		caption: string,
		note: string,
		paints: CordPaint[],
		tw: string,
	) => (
		<Sample
			key={caption}
			caption={caption}
			note={note}
			h={END_H}
			schematic={
				<SchCord
					paints={paints}
					y0={10 / SS}
					y1={(END_H - 10) / SS}
					pxPerCm={PLACE_PX_PER_CM / SS}
				/>
			}
			physical={
				<PhysCord
					paints={paints}
					twist={tw}
					y0={10}
					y1={END_H - 10}
					pxPerCm={PLACE_PX_PER_CM}
				/>
			}
		/>
	);

	const placesH = 320;

	return (
		<main className="page-wrap">
			<h1 className="page-title">Reading the drawing</h1>
			<p className="lede">
				Every khipu here is drawn two ways from the same record. The schematic
				view shows cords as coloured lines, knots as dots and bars, and a small
				mark for each recorded code. The physical view draws plied rope,
				half-hitches, knots leaning the recorded way, and ends as recorded. This
				page goes feature by feature through what the recorders wrote down and
				how each view shows it.
			</p>

			{/* the patterns every physical sample refers to */}
			<svg width={0} height={0} className="anat-defs" aria-hidden="true">
				<RopeDefs w={W} ropes={ropes} />
				<RopeDefs w={W_P} ropes={[primaryRope]} />
				<RopeDefs w={W_P2} ropes={[primaryRope]} />
			</svg>

			<section className="section prose">
				<p>
					In each pair the schematic mark is on the left and the physical
					drawing on the right, both magnified: the schematic at two and a half
					times the diagram, the physical at a cord fourteen pixels across. The
					samples are drawn by the same code as the diagrams. The conventions
					come from Marcia and Robert Ascher's databooks, Gary Urton's{" "}
					<i>Signs of the Inka Khipu</i> (2003), the Khipu Field Guide's
					recording guide and the Harvard Khipu Database's attachment drawing;
					they are set down in one place in the code, in{" "}
					<code>src/lib/khipu/anatomy.ts</code>, and listed at the{" "}
					<a href="#sources">foot of this page</a>.
				</p>
			</section>

			<section className="section" id="twist">
				<h2>Twist</h2>
				<div className="prose">
					<p>
						A cord is spun from fibre and then plied: two or more spun threads
						twisted together the opposite way. Recorders note the direction of
						that final ply as S or Z, after the middle stroke of the letter — an
						S-plied cord's ridges lean \, a Z-plied cord's lean /. Most recorded
						cords are S-plied; Urton recorded ply direction because the rarer
						Z-ply may carry meaning. The physical view draws the ridges; the
						schematic keeps the line plain and puts a small slash beside the
						attachment mark instead (see the next section).
					</p>
				</div>
				<Samples>
					{(
						[
							["S-plied", "S", "ridges lean \\"],
							["Z-plied", "Z", "ridges lean /"],
							["twist not recorded", null, "drawn smooth"],
						] as [string, string | null, string][]
					).map(([caption, tw, note]) => (
						<Sample
							key={caption}
							caption={caption}
							note={note}
							h={END_H}
							schematic={
								<SchCord paints={cord} y0={8 / SS} y1={(END_H - 8) / SS} />
							}
							physical={
								<PhysCord paints={cord} twist={tw} y0={8} y1={END_H - 8} />
							}
						/>
					))}
				</Samples>
				<Stat>
					{n(twist.S)} cords S-plied, {n(twist.Z)} Z-plied, {n(twist.U)} not
					recorded.
				</Stat>
			</section>

			<section className="section" id="attachment">
				<h2>Attachment</h2>
				<div className="prose">
					<p>
						A pendant is hitched to the primary cord: the cord is passed round
						it and through its own doubled end, a half-hitch. Seen from the
						front the hitch has two faces. <b>Recto</b>: the cord crosses the
						front of the primary and the loop sits behind, showing as a small
						collar around the crossing. <b>Verso</b>: the loop hangs in front as
						a V below the primary, and the cord passes behind to emerge from the
						choke at the bottom of the V. The Field Guide's rule of thumb: if
						the cord leaves from the bottom of the primary it is verso, from the
						top, recto. A <b>top cord</b> is hitched to run the other way from
						the pendants. The physical drawing follows the Harvard Khipu
						Database's attachment diagram (Julia Meyerson); the schematic
						reduces each face to its silhouette, a collar or a V, with the twist
						slash beside it. Almost half the cords have no recorded attachment;
						they are drawn without a hitch.
					</p>
				</div>
				<Samples>
					{(
						[
							[
								"recto",
								"recto",
								false,
								"the cord crosses in front, inside the collar",
							],
							[
								"verso",
								"verso",
								false,
								"the loop hangs in front as a V; the cord emerges from its choke",
							],
							["top cord", "top", true, "the recto form, mirrored upward"],
							["not recorded", "unknown", false, "no hitch is drawn"],
						] as [string, AttachKind, boolean, string][]
					).map(([caption, kind, up, note]) => (
						<Sample
							key={caption}
							caption={caption}
							note={note}
							h={END_H}
							{...hitch(kind, up)}
						/>
					))}
				</Samples>
				<Stat>
					{n(attach.R)} cords recorded recto, {n(attach.V)} verso, {n(attach.T)}{" "}
					top cords, {n(attach.U)} not recorded.
				</Stat>
			</section>

			<section className="section" id="knots">
				<h2>Knots</h2>
				<div className="prose">
					<p>
						Three knot types record numbers. A <b>single knot</b> is an overhand
						knot; a cluster of them stacked on the cord counts a digit. A{" "}
						<b>long knot</b> is an overhand knot with extra turns, two to nine,
						one per unit. A <b>figure-eight</b> stands for one. The Aschers
						recorded type and count; Urton added the direction of the tie, S or
						Z like twist, after the lean of the strand that crosses the face of
						the knot — and a cluster can mix them, one letter per knot. The
						physical view leans the crossing strand and every turn of a coil;
						the schematic scratches its dot the same way, slopes the hairlines
						of its bar, and slants the waist of its 8.
					</p>
				</div>
				<Samples>{KNOT_ROWS.map((r) => knotSample(r))}</Samples>

				<h3 className="anat-sub">The axis of a long knot</h3>
				<div className="prose">
					<p>
						One strand runs straight through the coil of a long knot, its axis,
						while the other wraps around it. A few recorders noted which way the
						axis runs. <b>Axis down</b>: the straight strand is the lower one,
						so the wrapping strand enters the coil obliquely at the top.{" "}
						<b>Axis up</b>: the reverse. Only 437 long knots record it, on a
						handful of khipus such as{" "}
						<Link to="/khipus/$id" params={{ id: "KH0676" }}>
							KH0676
						</Link>
						; the rest carry no mark.
					</p>
				</div>
				<Samples>{AXIS_ROWS.map((r) => knotSample(r))}</Samples>

				<h3 className="anat-sub">Rarer knots</h3>
				<Samples>{RARE_ROWS.map((r) => knotSample(r))}</Samples>
				<Stat>
					{n(kt.S)} single knots, {n(kt.L)} long, {n(kt.E)} figure-eight,{" "}
					{n(kt.SP)} spiral, {n(kt.TF)} tufted, {n(kt.EE)} double figure-eight,{" "}
					{n(kt.LL)} double long, {n(kt.BL)} belted, {n(kt.U)} unidentified.{" "}
					{n(kd.Z)} knots tied Z, {n(kd.S)} S, {n(kd.U)} not recorded.
				</Stat>
			</section>

			<section className="section" id="places">
				<h2>Decimal places</h2>
				<div className="prose">
					<p>
						The knots read as decimal digits by position. Rows of single knots
						sit at the same heights across the khipu; the row nearest the
						primary cord is the highest power of ten, the row furthest from it
						the units. The units row alone takes a long knot (two to nine, by
						its turns) or a figure-eight (one), which is what marks it as the
						last digit. A cord may begin with a long knot but, in this reading,
						does not end with a single knot unless the value is a round ten and
						the units row is empty. So two single knots, then three, then a
						four-turn long knot read 234. Locke described this in 1923; the
						Aschers built their databooks on it.
					</p>
				</div>
				<Samples>
					<Sample
						caption="234"
						note="2 single knots at 2 cm, 3 at 7 cm, a 4-turn long knot at 12 cm; the long knot marks the units"
						h={placesH}
						pw={PW + 60}
						wide
						schematic={
							<SchCord paints={cord} y0={8 / SS} y1={(placesH - 8) / SS}>
								{PLACES.map((p) => (
									<KnotGlyph
										key={p.place}
										node={stub(SX, 8 / SS)}
										knot={p.knot}
										options={{ pxPerCm: PLACE_PX_PER_CM / SS } as LayoutOptions}
										ink={ink}
										cord={paint.base}
									/>
								))}
							</SchCord>
						}
						physical={
							<PhysCord paints={cord} twist="S" y0={8} y1={placesH - 8}>
								{PLACES.map((p) => {
									const y = 8 + p.knot.pos * PLACE_PX_PER_CM;
									return (
										<g key={p.place}>
											<PhysicalKnot
												x={PX}
												y={y}
												w={W}
												knot={p.knot}
												paint={paint}
											/>
											<line
												x1={PX + W * 1.4}
												x2={PX + W * 2.1}
												y1={y}
												y2={y}
												className="anat-tick"
											/>
											<text
												x={PX + W * 2.4}
												y={y}
												dominantBaseline="middle"
												className="anat-label"
											>
												{p.place}
											</text>
										</g>
									);
								})}
							</PhysCord>
						}
					/>
				</Samples>
			</section>

			<section className="section" id="colour">
				<h2>Colour</h2>
				<div className="prose">
					<p>
						Cord colour is recorded in the Aschers' two-letter codes (see{" "}
						<Link to="/colors">the colour chart</Link>) together with the way
						two colours combine. <b>Mottled</b>, when fibres of two colours are
						spun together. <b>Barber pole</b>, when two plies of different
						colours are plied together, so the stripes spiral with the twist —
						the physical view follows it, and an S-plied and a Z-plied pole
						spiral opposite ways. <b>Striped</b>, when one colour runs along the
						other. <b>Spliced</b>, when the cord changes colour part way along,
						the change recorded in centimetres from the attachment. The
						schematic overlays a dash pattern per combination and breaks the
						line at a splice.
					</p>
				</div>
				<Samples>
					{colourSample("solid", "AB, light brown", cord, "S")}
					{colourSample(
						"barber pole, S-plied",
						"W-MB: white and moderate brown plied together; the stripes lean \\",
						barber,
						"S",
					)}
					{colourSample(
						"barber pole, Z-plied",
						"the same two plies, leaning /",
						barber,
						"Z",
					)}
					{colourSample(
						"mottled",
						"W:MB, the two colours spun together",
						mottled,
						"S",
					)}
					{colourSample(
						"striped",
						"MB%W, white running along the brown",
						striped,
						"S",
					)}
					{colourSample(
						"spliced",
						"SR(0–2)/W(2–5): strong red for two centimetres, then white",
						spliced,
						"S",
					)}
				</Samples>
				<Stat>
					{n(solid)} of {n(corpus.nCords)} cords are a single colour; the rest
					combine two codes or change colour along their length.
				</Stat>
			</section>

			<section className="section" id="ends">
				<h2>Ends</h2>
				<div className="prose">
					<p>
						Recorders note how each cord ends, whether by construction or by
						damage. A <b>knotted</b> end, a small stopper knot near the tip, is
						the most common; otherwise the cord is <b>broken</b>, <b>cut</b> (a
						cleaner end than a break), <b>ravelled</b> with its plies coming
						apart, <b>doubled</b> back on itself, or <b>unfinished</b> — neither
						knotted, broken nor cut, it just ends. A <b>canutito</b> is a tip
						wrapped in coloured thread; a <b>twisted</b> end has its plies
						twisted to a point. The physical view draws the end itself; the
						schematic marks the tip.
					</p>
				</div>
				<Samples>
					{TERM_KINDS.map((kind) => (
						<Sample
							key={kind}
							caption={TERM_TEXT[kind].label}
							note={TERM_TEXT[kind].how}
							h={END_H}
							schematic={
								<SchCord paints={cord} y0={8 / SS} y1={(END_H - 34) / SS}>
									<SchematicEnd
										x={SX}
										y={(END_H - 34) / SS}
										kind={kind}
										cord={paint.base}
										ink={ink}
										accent={thread}
									/>
								</SchCord>
							}
							physical={
								<PhysCord paints={cord} twist="S" y0={8} y1={END_H - 34}>
									<CordEnd
										x={PX}
										y={END_H - 34}
										w={W}
										kind={kind}
										paint={paint}
									/>
								</PhysCord>
							}
						/>
					))}
				</Samples>
				<Stat>
					{n(term.K)} cords end knotted, {n(term.B)} broken, {n(term.U)}{" "}
					unfinished, {n(term.R)} ravelled, {n(term.C)} cut, {n(term.D)} doubled
					{noEnds.length > 0 &&
						`; no ${noEnds.map((k) => TERM_TEXT[k].label.replace(/ end$/, "")).join(" or ")} ends are recorded in the corpus`}
					.
				</Stat>

				<h3 className="anat-sub">The primary cord</h3>
				<div className="prose">
					<p>
						The primary cord's ends are recorded separately. Position 0 is its{" "}
						<b>beginning</b>, drawn at the left: knotted, doubled back into a
						loop, twisted to a point, finished with a tassel (a <i>borla</i>),
						tied to a wooden bar, bound in a needlework bundle, broken,
						ravelled, or affixed to another cord. Its <b>termination</b> at the
						right takes the same codes as a pendant's. Its <b>structure</b> is
						plied like the cords, or braided, or wrapped. Only the physical view
						draws any of this; the schematic keeps the primary cord as a plain
						line whatever its make.
					</p>
				</div>
				<Samples>
					{BEGIN_KINDS.map((kind) => (
						<Sample
							key={kind}
							caption={`begins ${BEGIN_TEXT[kind]}`}
							h={90}
							pw={130}
							physical={
								<PrimaryRope
									x0={40}
									x1={330}
									y={45}
									W={W_P2}
									paint={primary}
									twist="S"
									structure="P"
									begin={kind}
									term="unknown"
								/>
							}
						/>
					))}
				</Samples>
				<Samples>
					{(["P", "B", "W"] as const).map((s) => (
						<Sample
							key={s}
							caption={STRUCTURE_TEXT[s]}
							h={90}
							pw={130}
							physical={
								<PrimaryRope
									x0={-100}
									x1={330}
									y={45}
									W={W_P2}
									paint={primary}
									twist="S"
									structure={s}
									begin="unknown"
									term="unknown"
								/>
							}
						/>
					))}
				</Samples>
			</section>

			<section className="section prose" id="recorded">
				<h2>Recorded and drawn</h2>
				<p>
					Attachment, twist, knot direction, axis and the ends are recorded
					codes: one letter or two per feature, set down by whoever measured the
					khipu. The drawing's geometry — where a loop sits, which way a strand
					leans, how ragged a break is — is the conventional reading of those
					codes, not an observation of the object, and a code that was not
					recorded draws nothing. The hover card on a khipu page gives the same
					readings in words.
				</p>
			</section>

			<section className="section prose" id="sources">
				<h2>Sources</h2>
				<ul className="anat-sources">
					<li>
						Marcia Ascher and Robert Ascher, <i>Code of the Quipu: Databook</i>{" "}
						(1978) and <i>Databook II</i> (1988) — the recording conventions
						behind every khipu here: knot types and counts, positions, the
						colour codes.
					</li>
					<li>
						Gary Urton,{" "}
						<i>
							Signs of the Inka Khipu: Binary Coding in the Andean
							Knotted-String Records
						</i>{" "}
						(University of Texas Press, 2003) — S and Z for ply and knot
						direction, recto and verso for the attachment.
					</li>
					<li>
						Ashok Khosla, Khipu Field Guide:{" "}
						<a
							href="https://www.khipufieldguide.com/databook/ReadingKhipu.html"
							target="_blank"
							rel="noreferrer"
						>
							Reading a Khipu
						</a>{" "}
						(the recording guide, with photographs of each knot tied S and Z and
						with its axis up or down) and{" "}
						<a
							href="https://www.khipufieldguide.com/guidebook/KhipuSigns.html"
							target="_blank"
							rel="noreferrer"
						>
							Khipu Signs
						</a>
						.
					</li>
					<li>
						Harvard Khipu Database,{" "}
						<a
							href="https://web.archive.org/web/2020/http://khipukamayuq.fas.harvard.edu/Khipu-Explained.html"
							target="_blank"
							rel="noreferrer"
						>
							Khipu Explained
						</a>{" "}
						— the two faces of pendant attachment and the twists of singles and
						plied cords, drawn by Julia Meyerson (the site is offline; the link
						is to an archived copy, and its data continues as the{" "}
						<Link to="/about">Open Khipu Repository</Link>).
					</li>
				</ul>
			</section>
		</main>
	);
}
