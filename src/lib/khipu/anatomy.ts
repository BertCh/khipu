import type { Cord, Knot } from "./types";

/**
 * The physical reading of the record: what each recorded code looks like on
 * the object, in one place, so every renderer and every caption agrees.
 *
 * Conventions (Ascher & Ascher; Urton 2003; the Khipu Field Guide's recording
 * guide and the Harvard Khipu Database's attachment drawing):
 *
 * - Twist and knot direction are named after the middle stroke of the letter:
 *   S leans `\`, Z leans `/`. This holds for the ridges of a plied cord and for
 *   the slant of the strand that crosses the face of a knot.
 * - A pendant is hitched to the primary cord by passing the cord around it and
 *   through its own doubled end (a half-hitch). *Recto*: the cord passes over
 *   the front of the primary and the loop sits behind, so the front shows the
 *   cord crossing the primary inside a small square collar. *Verso*: the loop
 *   sits in front, hanging below the primary as a V, and the cord emerges from
 *   the choke at its bottom, having passed behind the primary.
 * - A long knot is a coil of turns; one strand runs straight through the coil
 *   (its axis) while the other wraps. AXD: the straight strand is the lower
 *   one, so the wrapping strand enters at the top. AXU: the reverse.
 */

/** +1 leans `\` (S), -1 leans `/` (Z), 0 unknown. */
export type Slant = -1 | 0 | 1;

export function slantOf(dir: string | null | undefined): Slant {
	const d = dir?.[0];
	return d === "S" ? 1 : d === "Z" ? -1 : 0;
}

/** One direction letter per knot in a cluster ("ZZSZ" → 4, "Z" → n × Z). */
export function knotDirs(knot: Knot): string[] {
	const n = Math.max(1, knot.n);
	const d = knot.dir || "U";
	if (d.length >= n) return Array.from({ length: n }, (_, i) => d[i]);
	return Array.from({ length: n }, () => d[0]);
}

export type AttachKind = "recto" | "verso" | "top" | "overhand" | "unknown";

export function attachKind(cord: Pick<Cord, "attach" | "kind">): AttachKind {
	switch (cord.attach) {
		case "R":
			return "recto";
		case "V":
			return "verso";
		case "T":
			return "top";
		case "H":
			return "overhand";
		default:
			return cord.kind === "top" ? "top" : "unknown";
	}
}

export type TermKind =
	| "knotted"
	| "broken"
	| "cut"
	| "ravelled"
	| "doubled"
	| "unfinished"
	| "canutito"
	| "twisted"
	| "unknown";

export function termKind(code: string | null | undefined): TermKind {
	switch (code) {
		case "K":
			return "knotted";
		case "B":
			return "broken";
		case "C":
			return "cut";
		case "R":
			return "ravelled";
		case "D":
			return "doubled";
		case "U":
			return "unfinished";
		case "TT":
			return "canutito";
		case "T":
			return "twisted";
		default:
			return "unknown";
	}
}

export type BeginKind =
	| "knotted"
	| "doubled"
	| "twisted"
	| "tassel"
	| "wooden-bar"
	| "needlework"
	| "broken"
	| "ravelled"
	| "affixed"
	| "unknown";

export function beginKind(code: string | null | undefined): BeginKind {
	switch (code) {
		case "K":
			return "knotted";
		case "D":
			return "doubled";
		case "T":
			return "twisted";
		case "TL":
			return "tassel";
		case "WB":
			return "wooden-bar";
		case "NB":
			return "needlework";
		case "B":
			return "broken";
		case "R":
			return "ravelled";
		case "X":
			return "affixed";
		default:
			return "unknown";
	}
}

export type AxisKind = "down" | "up" | null;

export function axisKind(knot: Pick<Knot, "axis">): AxisKind {
	const a = knot.axis?.toUpperCase();
	return a === "AXD" || a === "D" ? "down" : a === "AXU" ? "up" : null;
}

export const LONG_KNOTS = new Set(["L", "LL", "BL", "SP"]);

/**
 * Drawn diameter of a cord. Recorded thickness is patchy (9 % of cords) and
 * its units vary between recorders, so it only nudges the width, relative to
 * the khipu's own median where one is known.
 */
export function cordDiameter(
	cord: Pick<Cord, "thick">,
	base: number,
	medianThick: number | null,
): number {
	if (cord.thick == null || !medianThick) return base;
	const k = Math.sqrt(cord.thick / medianThick);
	return base * Math.min(1.5, Math.max(0.75, k));
}

export function medianThickness(cords: Pick<Cord, "thick">[]): number | null {
	const t = cords
		.map((c) => c.thick)
		.filter((x): x is number => x != null && x > 0)
		.sort((a, b) => a - b);
	return t.length ? t[Math.floor(t.length / 2)] : null;
}

/* ---------------------------------------------------------------------------
   Plain-language readings, for keys, callouts and the hover card.
   --------------------------------------------------------------------------- */

export const ATTACH_TEXT: Record<AttachKind, { label: string; how: string }> = {
	recto: {
		label: "recto",
		how: "the cord passes over the front of the primary cord; its loop sits behind, showing as a small collar",
	},
	verso: {
		label: "verso",
		how: "the loop hangs in front of the primary cord as a V; the cord passes behind and emerges from the choke",
	},
	top: {
		label: "top cord",
		how: "hitched to run the other way from the pendants",
	},
	overhand: {
		label: "overhand knot",
		how: "tied to the primary cord with an overhand knot rather than hitched",
	},
	unknown: { label: "attachment not recorded", how: "" },
};

export const TWIST_TEXT: Record<string, { label: string; how: string }> = {
	S: {
		label: "S-plied",
		how: "the final ply leans like the middle of an S: \\",
	},
	Z: { label: "Z-plied", how: "the final ply leans like the middle of a Z: /" },
	U: { label: "twist not recorded", how: "" },
};

export const KNOT_DIR_TEXT: Record<string, string> = {
	S: "tied S — the crossing strand leans \\",
	Z: "tied Z — the crossing strand leans /",
	U: "direction not recorded",
};

export const AXIS_TEXT: Record<"down" | "up", string> = {
	down: "axis down — the straight strand leaves the coil at the bottom, the wrapping strand enters at the top",
	up: "axis up — the straight strand enters at the top, the wrapping strand leaves at the bottom",
};

export const TERM_TEXT: Record<TermKind, { label: string; how: string }> = {
	knotted: { label: "knotted end", how: "finished with a small stopper knot" },
	broken: { label: "broken", how: "the cord ends where it broke" },
	cut: { label: "cut", how: "a clean end, sharper than a break" },
	ravelled: { label: "ravelled", how: "the plies are coming apart" },
	doubled: { label: "doubled", how: "the end is folded back on itself" },
	unfinished: {
		label: "unfinished",
		how: "neither knotted, broken nor cut — it just ends",
	},
	canutito: {
		label: "canutito",
		how: "the end is wrapped with coloured thread",
	},
	twisted: { label: "twisted end", how: "the plies twisted to a point" },
	unknown: { label: "end not recorded", how: "" },
};

export const BEGIN_TEXT: Record<BeginKind, string> = {
	knotted: "knotted",
	doubled: "doubled back into a loop",
	twisted: "twisted to a point",
	tassel: "finished with a tassel (borla)",
	"wooden-bar": "tied to a wooden bar",
	needlework: "bound in a needlework bundle",
	broken: "broken",
	ravelled: "ravelled",
	affixed: "affixed to another cord",
	unknown: "not recorded",
};

export const STRUCTURE_TEXT: Record<string, string> = {
	P: "plied cord",
	B: "braided",
	W: "wrapped",
};
