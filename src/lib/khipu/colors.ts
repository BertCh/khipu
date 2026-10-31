import type { ColorSegment, ColorTable } from "./types";

/** Hex for an Ascher code, or a neutral fallback for codes we don't know. */
export function hexFor(code: string | undefined, colors: ColorTable): string {
	return (code && colors[code]?.hex) || "#9c978d";
}

/** Human name for an Ascher code. */
export function nameFor(code: string, colors: ColorTable): string {
	return colors[code]?.name ?? code;
}

/**
 * Turn a cord's parsed colour into what we draw: a base colour plus an optional
 * second colour and pattern. Spliced cords (colour changes along the length)
 * come back as multiple ranges.
 */
export interface CordPaint {
	base: string;
	accent?: string;
	/** dash pattern for the accent overlay */
	pattern?: "barberpole" | "mottled" | "striped" | "tweed";
	/** [from, to] cm, when the cord is spliced */
	range?: [number, number];
	codes: string[];
}

const OP_PATTERN: Record<string, CordPaint["pattern"]> = {
	"-": "barberpole",
	":": "mottled",
	"%": "striped",
	"^": "tweed",
};

export function paintsFor(
	segments: ColorSegment[] | null | undefined,
	colors: ColorTable,
): CordPaint[] {
	if (!segments?.length)
		return [{ base: hexFor(undefined, colors), codes: [] }];
	return segments.map((seg) => {
		const paint: CordPaint = {
			base: hexFor(seg.codes[0], colors),
			codes: seg.codes,
		};
		if (seg.codes.length > 1) {
			paint.accent = hexFor(seg.codes[1], colors);
			paint.pattern = OP_PATTERN[seg.ops?.[0] ?? ":"] ?? "mottled";
		}
		if (seg.range) paint.range = seg.range;
		return paint;
	});
}

/** Relative luminance of a hex colour (sRGB). */
export function luminance(hex: string): number {
	const n = Number.parseInt(hex.slice(1), 16);
	const ch = [16, 8, 0].map((s) => {
		const c = ((n >> s) & 255) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Ink colour that reads on top of a fill. */
export function inkOn(hex: string): string {
	return luminance(hex) > 0.4 ? "#1c1a17" : "#f4f2ec";
}

/** Plain-language description of an Ascher colour string, e.g. "white and moderate brown, mottled". */
export function describeColor(
	segments: ColorSegment[] | null | undefined,
	colors: ColorTable,
): string {
	if (!segments?.length) return "colour not recorded";
	return segments
		.map((seg) => {
			const names = seg.codes.map((c) => nameFor(c, colors));
			const op = seg.ops?.[0];
			const how =
				op === "-"
					? ", barber pole"
					: op === ":"
						? ", mottled"
						: op === "%"
							? ", striped"
							: op === "^"
								? ", tweed"
								: "";
			const where = seg.range ? ` (${seg.range[0]}–${seg.range[1]} cm)` : "";
			return names.join(" and ") + how + where;
		})
		.join("; then ");
}
