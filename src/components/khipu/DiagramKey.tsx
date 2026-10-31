import {
	CASING_W,
	CORD_W,
	KnotGlyph,
	SchematicEnd,
	SchematicHitch,
} from "#/components/khipu/schematic";
import type { AttachKind, TermKind } from "#/lib/khipu/anatomy";
import { inkOn } from "#/lib/khipu/colors";
import type { CordNode, LayoutOptions } from "#/lib/khipu/layout";
import type { Knot, KnotType } from "#/lib/khipu/types";

/**
 * A key to the diagram's marks, drawn with the same glyph code as the
 * diagram so the two can't drift apart: the knots and the way they lean,
 * the attachment faces on the primary cord, the cord ends, then the cord
 * conventions (subsidiaries, unrecorded lengths, two-colour and spliced
 * cords).
 */

const W = 30;
const H = 44;
const CORD = "#8b5a3c";
const CORD_2 = "#e8e2d6";
/** a darker primary, as most khipus have, so the collar must read on it */
const PRIMARY = "#5a3d2b";
/** knots take the ink the diagram would put on this cord */
const INK = inkOn(CORD);
/** drawn a little larger than life so the marks can be told apart */
const SCALE = 1.5;
const OPTIONS = { pxPerCm: 1 } as LayoutOptions;

/** Enough of a laid-out cord for KnotGlyph to place a mark on. */
function stub(x: number, y0: number): CordNode {
	return { x, y0, up: false } as CordNode;
}

function knot(type: KnotType, n: number, pos: number, dir = "Z"): Knot {
	return { type, n, pos, dir };
}

function Cord({
	children,
	dashed,
	accent,
	splice,
	y1 = H - 2,
}: {
	children?: React.ReactNode;
	dashed?: boolean;
	accent?: "barberpole" | "mottled";
	splice?: boolean;
	/** where the cord ends (shortened so an end mark has room) */
	y1?: number;
}) {
	const x = W / 2;
	return (
		<svg
			width={W * SCALE}
			height={H * SCALE}
			viewBox={`0 0 ${W} ${H}`}
			aria-hidden="true"
		>
			<line
				x1={x}
				x2={x}
				y1={2}
				y2={y1}
				stroke="var(--cord-casing)"
				strokeWidth={CASING_W}
				strokeLinecap="round"
			/>
			{splice ? (
				<>
					<line
						x1={x}
						x2={x}
						y1={2}
						y2={H / 2}
						stroke={CORD_2}
						strokeWidth={CORD_W}
						strokeLinecap="round"
					/>
					<line
						x1={x}
						x2={x}
						y1={H / 2}
						y2={y1}
						stroke={CORD}
						strokeWidth={CORD_W}
						strokeLinecap="round"
					/>
				</>
			) : (
				<line
					x1={x}
					x2={x}
					y1={2}
					y2={y1}
					stroke={CORD}
					strokeWidth={CORD_W}
					strokeLinecap="round"
					strokeDasharray={dashed ? "2 3" : undefined}
				/>
			)}
			{accent && (
				<line
					x1={x}
					x2={x}
					y1={2}
					y2={y1}
					stroke={CORD_2}
					strokeWidth={CORD_W}
					strokeDasharray={accent === "barberpole" ? "5 4" : "1.5 3"}
				/>
			)}
			{children}
		</svg>
	);
}

/**
 * A short stretch of primary cord with one cord hitched to it, hanging down
 * or (for a top cord) rising, and the attachment mark where they meet.
 */
function Hitched({
	kind,
	twist = null,
	up = false,
}: {
	kind: AttachKind;
	twist?: string | null;
	up?: boolean;
}) {
	const x = W / 2;
	const py = up ? H - 9 : 9;
	const y1 = up ? 3 : H - 3;
	return (
		<svg
			width={W * SCALE}
			height={H * SCALE}
			viewBox={`0 0 ${W} ${H}`}
			aria-hidden="true"
		>
			<line
				x1={2}
				x2={W - 2}
				y1={py}
				y2={py}
				stroke="var(--cord-casing)"
				strokeWidth={CASING_W + 1.5}
				strokeLinecap="round"
			/>
			<line
				x1={2}
				x2={W - 2}
				y1={py}
				y2={py}
				stroke={PRIMARY}
				strokeWidth={CORD_W + 1.5}
				strokeLinecap="round"
			/>
			<line
				x1={x}
				x2={x}
				y1={py}
				y2={y1}
				stroke="var(--cord-casing)"
				strokeWidth={CASING_W}
				strokeLinecap="round"
			/>
			<line
				x1={x}
				x2={x}
				y1={py}
				y2={y1}
				stroke={CORD}
				strokeWidth={CORD_W}
				strokeLinecap="round"
			/>
			<SchematicHitch
				x={x}
				y={py}
				kind={kind}
				twist={twist}
				cord={CORD}
				ink={INK}
				up={up}
			/>
		</svg>
	);
}

const KNOTS: { label: string; knot: Knot }[] = [
	{
		label: "single knots tied Z: a dot each, scratched /",
		knot: knot("S", 3, 20, "Z"),
	},
	{ label: "tied S: scratched \\", knot: knot("S", 3, 20, "S") },
	{
		label:
			"long knot: a line per turn, sloping as tied; the notch marks the axis entry",
		knot: { ...knot("L", 4, 22, "Z"), axis: "AXD" },
	},
	{
		label: "figure-eight, its crossing slanting as tied",
		knot: knot("E", 1, 22, "Z"),
	},
	{ label: "spiral", knot: knot("SP", 3, 22) },
	{ label: "tufted", knot: knot("TF", 1, 22) },
	{ label: "unidentified", knot: knot("U", 1, 22, "U") },
];

const ATTACHMENTS: {
	label: string;
	kind: AttachKind;
	twist?: string;
	up?: boolean;
}[] = [
	{ label: "recto: crosses the front inside a collar", kind: "recto" },
	{ label: "verso: loops in front as a V", kind: "verso" },
	{ label: "top cord, running upward", kind: "top", up: true },
	{ label: "tied on with an overhand knot", kind: "overhand" },
	{ label: "Z-plied cord: a / beside it", kind: "recto", twist: "Z" },
	{ label: "S-plied cord: a \\", kind: "recto", twist: "S" },
];

const ENDS: { label: string; kind: TermKind }[] = [
	{ label: "knotted: a ring round the tip", kind: "knotted" },
	{ label: "broken", kind: "broken" },
	{ label: "cut", kind: "cut" },
	{ label: "ravelled, the plies parting", kind: "ravelled" },
	{ label: "doubled back on itself", kind: "doubled" },
	{ label: "canutito, wrapped in thread", kind: "canutito" },
	{ label: "twisted to a point", kind: "twisted" },
];

/** where the shortened cords of the end items stop */
const END_Y = H - 9;

function Group({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="diagram-key-group">
			<strong className="diagram-key-title">{title}</strong>
			<ul>{children}</ul>
		</section>
	);
}

export default function DiagramKey() {
	return (
		<section className="diagram-key" aria-label="Key to the diagram">
			<Group title="Knots">
				{KNOTS.map((k) => (
					<li key={k.label}>
						<Cord>
							<KnotGlyph
								node={stub(W / 2, 0)}
								knot={k.knot}
								options={OPTIONS}
								ink={INK}
								cord={CORD}
							/>
						</Cord>
						<span>{k.label}</span>
					</li>
				))}
			</Group>

			<Group title="Attachment">
				{ATTACHMENTS.map((a) => (
					<li key={a.label}>
						<Hitched kind={a.kind} twist={a.twist} up={a.up} />
						<span>{a.label}</span>
					</li>
				))}
			</Group>

			<Group title="Ends">
				{ENDS.map((e) => (
					<li key={e.label}>
						<Cord y1={END_Y}>
							<SchematicEnd
								x={W / 2}
								y={END_Y}
								kind={e.kind}
								cord={CORD}
								ink={INK}
							/>
						</Cord>
						<span>{e.label}</span>
					</li>
				))}
			</Group>

			<Group title="Cords">
				<li>
					<svg
						width={W * SCALE}
						height={H * SCALE}
						viewBox={`0 0 ${W} ${H}`}
						aria-hidden="true"
					>
						<g
							fill="none"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={CASING_W}
							stroke="var(--cord-casing)"
						>
							<path d={`M10,2 V${H - 2}`} />
							<path d={`M10,14 L20,18 V${H - 6}`} />
						</g>
						<g
							fill="none"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={CORD_W}
						>
							<path d={`M10,2 V${H - 2}`} stroke={CORD} />
							<path d={`M10,14 L20,18 V${H - 6}`} stroke={CORD_2} />
						</g>
						<SchematicHitch
							x={10}
							y={14}
							kind="recto"
							twist={null}
							cord={CORD_2}
							ink={INK}
							onParent
						/>
					</svg>
					<span>subsidiary, hung to the right of its parent</span>
				</li>
				<li>
					<Cord dashed />
					<span>length not recorded</span>
				</li>
				<li>
					<Cord accent="barberpole" />
					<span>two colours plied (barber pole, mottled…)</span>
				</li>
				<li>
					<Cord splice />
					<span>colour changes along the cord</span>
				</li>
			</Group>
		</section>
	);
}
