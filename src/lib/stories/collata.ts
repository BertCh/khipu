/**
 * The two Collata khipus are held by the community of San Juan de Collata
 * (Huarochirí) and are in neither the Khipu Field Guide nor the Open Khipu
 * Repository. Everything here is transcribed from Sabine Hyland, "Writing with
 * Twisted Cords: The Inscriptive Capacity of Andean Khipus", Current
 * Anthropology 58(3), 2017 — the cord sequences she publishes in full.
 */

export type Ply = "S" | "Z";

export interface CollataCord {
	colors: string[];
	fibers: string[];
	ply: Ply;
	wrapped?: boolean;
	/** Hyland's proposed syllabic value, for the ending sequences only */
	reads?: string;
}

/** Dyed camelid fibre, as Hyland names the hues. */
export const COLLATA_HUES: Record<string, string> = {
	yellow: "#d4ad35",
	red: "#a5322a",
	blue: "#2f4d8a",
	green: "#5f7c3c",
	white: "#efe8d9",
	black: "#2a2622",
	grey: "#8d887f",
	purple: "#6a3f6c",
	pink: "#cf8a96",
	orange: "#cf7330",
	"golden brown": "#b5842c",
	"light brown": "#b99b76",
	"medium brown": "#8a6543",
	"dark brown": "#4c3423",
};

const c = (
	colors: string,
	fibers: string,
	ply: Ply,
	extra: Partial<CollataCord> = {},
): CollataCord => ({
	colors: colors.split("/"),
	fibers: fibers.split("/"),
	ply,
	...extra,
});

/** Khipu A: the twelve pendants that follow the opening cayte bundle. */
export const KHIPU_A_INTRO: CollataCord[] = [
	c("yellow", "alpaca", "Z"),
	c("light brown", "alpaca", "S"),
	c("dark brown/light brown", "alpaca", "Z"),
	c("light brown", "alpaca", "S"),
	c("blue/dark brown", "alpaca/deer", "Z"),
	c("red", "vicuña", "Z"),
	c("light brown", "vicuña", "Z"),
	c("light brown", "vicuña", "S"),
	c("dark brown/light brown", "alpaca", "Z"),
	c("red", "vicuña", "Z"),
	c("medium brown", "vicuña", "Z"),
	c("medium brown", "vicuña", "Z"),
];

/** Khipu B: the eight pendants between its two caytes. */
export const KHIPU_B_INTRO: CollataCord[] = [
	c("light brown/medium brown", "vicuña", "S"),
	c("medium brown", "vicuña", "S"),
	c("white/orange", "alpaca", "Z"),
	c("blue/red", "alpaca", "Z"),
	c("blue/red", "alpaca", "S"),
	c("light brown", "vicuña", "S"),
	c("blue/medium brown", "alpaca", "Z"),
	c("medium brown", "vicuña", "S"),
];

/** Khipu A's last three cords, read by Hyland as the sender's lineage: A-LLU-KA. */
export const KHIPU_A_END: CollataCord[] = [
	c("dark brown", "guanaco", "S", { reads: "A" }),
	c("white/dark brown", "llama/guanaco", "Z", { wrapped: true, reads: "LLU" }),
	c("blue", "llama", "S", { reads: "KA" }),
];

/** Khipu B's last three cords: the first two recur from A, the third is new. */
export const KHIPU_B_END: CollataCord[] = [
	c("dark brown", "guanaco", "S", { reads: "A" }),
	c("blue", "llama", "S", { reads: "KA" }),
	c("golden brown", "vicuña", "S", { reads: "PAR(U)" }),
];

export const COLLATA_FACTS = {
	khipuA: { pendants: 288, groups: 9, ribbons: 8, topCordCm: 62.2 },
	khipuB: { pendants: 199, groups: 4, topCordCm: 58.4 },
	pendants: 487,
	combinations: 95,
	longestPendantCm: 48.3,
	/** in decreasing frequency */
	fibers: ["vicuña", "alpaca", "guanaco", "llama", "deer", "vizcacha"],
	hues: Object.keys(COLLATA_HUES).length,
	ply: { S: 58, Z: 42 },
	/** Urton & Brezine's corpus figures Hyland compares against */
	plyInkaCamelid: { S: 59, Z: 41 },
	plyInkaCotton: { S: 97, Z: 3 },
	manuscriptsInBox: 100,
	earliestManuscript: 1645,
	rebellion: 1783,
};

/** Same cord type: the same colours, fibres and ply, wrapped or not. */
export function sameCordType(a: CollataCord, b: CollataCord): boolean {
	return (
		a.ply === b.ply &&
		!!a.wrapped === !!b.wrapped &&
		a.colors.join("/") === b.colors.join("/") &&
		a.fibers.join("/") === b.fibers.join("/")
	);
}

/** Pairs [i, j] where cord i of one sequence and cord j of the other are the same type. */
export function cordTypeMatches(
	a: CollataCord[],
	b: CollataCord[],
): [number, number][] {
	const out: [number, number][] = [];
	a.forEach((x, i) => {
		b.forEach((y, j) => {
			if (sameCordType(x, y)) out.push([i, j]);
		});
	});
	return out;
}
