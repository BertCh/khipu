import {
	ATTACH_TEXT,
	attachKind,
	axisKind,
	BEGIN_TEXT,
	beginKind,
	TERM_TEXT,
	TWIST_TEXT,
	termKind,
} from "./anatomy";
import type { CodeTables, Cord, Knot, PrimaryCord } from "./types";

const KNOT_NAME: Record<string, string> = {
	S: "single",
	L: "long",
	E: "figure-eight",
	EE: "double figure-eight",
	LL: "double long",
	BL: "belted long",
	SP: "spiral",
	TF: "tufted",
	U: "unknown",
};

export const LONG_KNOT_TYPES = new Set(["L", "LL", "BL", "SP"]);

export function knotTypeName(type: string): string {
	return KNOT_NAME[type] ?? type;
}

/**
 * "3 single knots (Z) at 5 cm → 30"; one letter per knot when the cluster
 * mixes directions, "4 single knots (Z Z S Z) at 8.5 cm → 40"; the axis of a
 * long knot when it was recorded, "long knot, 5 turns (S), axis down, at
 * 17.5 cm → 5".
 */
export function describeKnot(k: Knot): string {
	const raw = k.dir ?? "U";
	const dir = raw.length > 1 ? raw.split("").join(" ") : raw === "U" ? "" : raw;
	const dirText = dir ? ` (${dir})` : "";
	const axis = axisKind(k);
	const axisText = axis ? `, axis ${axis},` : "";
	const what = LONG_KNOT_TYPES.has(k.type)
		? `${knotTypeName(k.type)} knot, ${k.n} turn${k.n === 1 ? "" : "s"}`
		: `${k.n} ${knotTypeName(k.type)} knot${k.n === 1 ? "" : "s"}`;
	const val = k.value != null ? ` → ${k.value.toLocaleString()}` : "";
	return `${what}${dirText}${axisText} at ${k.pos} cm${val}`;
}

/** What the record says about a cord, in the words the drawing follows. */
export interface Reading {
	label: string;
	/** how it shows on the object; empty when the code was not recorded */
	how: string;
}

/** "recto" — the cord passes over the front of the primary cord… */
export function describeAttachment(
	cord: Pick<Cord, "attach" | "kind">,
): Reading {
	return ATTACH_TEXT[attachKind(cord)];
}

/** "S-plied" — the final ply leans like the middle of an S: \ */
export function describeTwist(cord: Pick<Cord, "twist">): Reading {
	const t = cord.twist?.[0] ?? "U";
	return TWIST_TEXT[t] ?? TWIST_TEXT.U;
}

/** "knotted end" — finished with a small stopper knot */
export function describeTermination(cord: Pick<Cord, "term">): Reading {
	return TERM_TEXT[termKind(cord.term)];
}

/** "begins knotted, ends broken" */
export function describePrimaryEnds(
	primary: Pick<PrimaryCord, "beginning" | "term">,
): string {
	const begin = BEGIN_TEXT[beginKind(primary.beginning)];
	// the termination labels name the end ("knotted end"); after "ends" the word is redundant
	const term = TERM_TEXT[termKind(primary.term)].label.replace(
		/^end | end$/,
		"",
	);
	return `begins ${begin}, ends ${term}`;
}

export function cordKindLabel(cord: Cord): string {
	switch (cord.kind) {
		case "pendant":
			return "Pendant";
		case "top":
			return "Top cord";
		case "marker":
			return "Marker";
		default:
			return `Subsidiary, level ${cord.level}`;
	}
}

export function codeLabel(
	table: keyof CodeTables,
	code: string | null | undefined,
	codes: CodeTables,
): string {
	if (!code) return "not recorded";
	return codes[table]?.[code]?.label ?? code;
}

export function formatCm(cm: number | null | undefined): string {
	return cm == null ? "—" : `${cm} cm`;
}

/** Tooltip for a cord whose KFG Value differs from its knots: "Stored value 14; knots read 37 — sources disagree. …" */
export function valueConflictText(
	c: Pick<Cord, "value" | "valueConflict">,
): string {
	const v = c.valueConflict;
	if (!v) return "";
	return `Stored value ${(c.value ?? 0).toLocaleString()}; knots read ${v.knots.toLocaleString()} — sources disagree (${v.note}).`;
}
