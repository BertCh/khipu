import type { AttachKind, TermKind } from "#/lib/khipu/anatomy";
import type { CordPaint } from "#/lib/khipu/colors";
import type { Knot, KnotType } from "#/lib/khipu/types";
import {
	CordRope,
	PendantHitch,
	PhysicalKnot,
	RopeDefs,
	type RopeSpec,
} from "./physical";
import { CordEnd, PrimaryRope } from "./physicalEnds";

/**
 * The key to the physical drawing, made of the same glyphs at a legible
 * size: how a knot leans, where a hitch's loop sits, what the ridges of a
 * ply look like, how a cord ends.
 */

const W = 36;
const H = 54;
/** cord diameter in the key */
const CW = 5.5;
/** the primary's diameter */
const PW = 9;
const SCALE = 1.7;
const BROWN: CordPaint = { base: "#8b5a3c", codes: ["MB"] };
const PALE: CordPaint = { base: "#e8e2d6", codes: ["W"] };
const PRIMARY: CordPaint = { base: "#5a3d2b", codes: ["KB"] };

function knot(type: KnotType, n: number, dir = "Z", axis?: string): Knot {
	return { type, n, pos: 0, dir, axis };
}

/** One sample: a short rope with something on it. */
function Sample({
	paint = BROWN,
	twist = "S",
	y0 = 3,
	y1 = H - 3,
	dashed,
	ropes,
	children,
}: {
	paint?: CordPaint;
	twist?: string | null;
	y0?: number;
	y1?: number;
	dashed?: boolean;
	ropes?: RopeSpec[];
	children?: React.ReactNode;
}) {
	return (
		<svg
			width={W * SCALE}
			height={H * SCALE}
			viewBox={`0 0 ${W} ${H}`}
			aria-hidden="true"
		>
			<RopeDefs w={CW} ropes={ropes ?? [{ paints: [paint], twist }]} />
			<CordRope
				x={W / 2}
				y0={y0}
				y1={y1}
				w={CW}
				paints={[paint]}
				twist={twist}
				dashed={dashed}
			/>
			{children}
		</svg>
	);
}

/** A stretch of primary cord with one cord hitched to it. */
function Hitched({ kind, up = false }: { kind: AttachKind; up?: boolean }) {
	const py = up ? H - 10 : 10;
	const x = W / 2;
	const common = { x, y: py, w: CW, W: PW, kind, paint: BROWN, up };
	return (
		<svg
			width={W * SCALE}
			height={H * SCALE}
			viewBox={`0 0 ${W} ${H}`}
			aria-hidden="true"
		>
			<RopeDefs
				w={CW}
				ropes={[
					{ paints: [BROWN], twist: "S" },
					{ paints: [PRIMARY], twist: "S", orientation: "horizontal", w: PW },
				]}
			/>
			<PendantHitch {...common} layer="behind" />
			<PrimaryRope
				x0={1}
				x1={W - 1}
				y={py}
				W={PW}
				paint={PRIMARY}
				twist="S"
				structure="P"
				begin="unknown"
				term="unknown"
			/>
			<CordRope
				x={x}
				y0={py + (up ? -1 : 1) * (PW / 2 - 0.5)}
				y1={up ? 3 : H - 3}
				w={CW}
				paints={[BROWN]}
				twist="S"
			/>
			<PendantHitch {...common} layer="front" />
		</svg>
	);
}

const KNOTS: { label: string; knot: Knot }[] = [
	{
		label: "single knots tied Z: the crossing strand leans /",
		knot: knot("S", 2, "Z"),
	},
	{ label: "single knots tied S: it leans \\", knot: knot("S", 2, "S") },
	{
		label:
			"long knot, a turn per wrap; the strand entering the coil obliquely at the top means axis down",
		knot: knot("L", 4, "Z", "AXD"),
	},
	{
		label: "figure-eight, crossing leaning with its direction",
		knot: knot("E", 1, "S"),
	},
	{ label: "spiral: open wraps", knot: knot("SP", 3, "Z") },
	{ label: "tufted", knot: knot("TF", 1, "S") },
];

const ATTACHMENTS: { label: string; kind: AttachKind; up?: boolean }[] = [
	{
		label:
			"recto: the cord crosses the front of the primary inside the loop's collar",
		kind: "recto",
	},
	{
		label:
			"verso: the loop hangs in front; the cord passes behind and comes out of its choke",
		kind: "verso",
	},
	{ label: "top cord, hitched to run upward", kind: "top", up: true },
	{ label: "tied on with an overhand knot", kind: "overhand" },
];

const ENDS: { label: string; kind: TermKind }[] = [
	{ label: "knotted: a stopper knot", kind: "knotted" },
	{ label: "broken", kind: "broken" },
	{ label: "cut", kind: "cut" },
	{ label: "ravelled: the plies parting", kind: "ravelled" },
	{ label: "doubled back on itself", kind: "doubled" },
	{ label: "canutito: wrapped in thread", kind: "canutito" },
];

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

export default function PhysicalKey() {
	const barber: CordPaint = {
		base: PALE.base,
		accent: BROWN.base,
		pattern: "barberpole",
		codes: ["W", "MB"],
	};
	const mottled: CordPaint = {
		base: PALE.base,
		accent: BROWN.base,
		pattern: "mottled",
		codes: ["W", "MB"],
	};
	return (
		<section className="diagram-key" aria-label="Key to the drawing">
			<Group title="Knots">
				{KNOTS.map((k) => (
					<li key={k.label}>
						<Sample>
							<PhysicalKnot
								x={W / 2}
								y={H / 2}
								w={CW}
								knot={k.knot}
								paint={BROWN}
							/>
						</Sample>
						<span>{k.label}</span>
					</li>
				))}
			</Group>

			<Group title="Attachment">
				{ATTACHMENTS.map((a) => (
					<li key={a.label}>
						<Hitched kind={a.kind} up={a.up} />
						<span>{a.label}</span>
					</li>
				))}
			</Group>

			<Group title="Cords">
				<li>
					<Sample twist="S" />
					<span>S-plied: the ridges lean \</span>
				</li>
				<li>
					<Sample twist="Z" />
					<span>Z-plied: the ridges lean /</span>
				</li>
				<li>
					<Sample paint={PALE} twist={null} />
					<span>twist not recorded: no ridges</span>
				</li>
				<li>
					<Sample paint={barber} twist="S" />
					<span>
						barber pole: two colours plied, stripes following the twist
					</span>
				</li>
				<li>
					<Sample paint={mottled} twist="S" />
					<span>mottled: colours mixed in the spinning</span>
				</li>
				<li>
					<Sample dashed />
					<span>length not recorded</span>
				</li>
			</Group>

			<Group title="Ends">
				{ENDS.map((e) => (
					<li key={e.label}>
						<Sample y1={H - 15}>
							<CordEnd
								x={W / 2}
								y={H - 15}
								w={CW}
								kind={e.kind}
								paint={BROWN}
							/>
						</Sample>
						<span>{e.label}</span>
					</li>
				))}
			</Group>
		</section>
	);
}
