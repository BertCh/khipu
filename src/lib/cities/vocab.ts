import type { Quadrant, SupplySide } from "./types";

/**
 * The Cities Tool's vocabulary for its diagnosis plane (population growth
 * against wage growth, each side of the all-metro median), in the two
 * registers it uses: the verdict ("a Magnet") and the scatter's corner label.
 */
export const QUADRANT: Record<
	Quadrant,
	{ verdict: string; noun: string; corner: string; gloss: string }
> = {
	demand_positive: {
		verdict: "a Magnet",
		noun: "Magnet",
		corner: "Boomtown",
		gloss:
			"population and pay both above the median: consistent with rising demand",
	},
	demand_negative: {
		verdict: "a Leak",
		noun: "Leak",
		corner: "Cooling off",
		gloss:
			"population and pay both below the median: consistent with falling demand",
	},
	supply_positive: {
		verdict: "a Sponge",
		noun: "Sponge",
		corner: "Lifestyle magnet",
		gloss:
			"population above the median, pay below: suggests amenities, not wages, draw people",
	},
	supply_negative: {
		verdict: "a Fortress",
		noun: "Fortress",
		corner: "Held back",
		gloss:
			"pay above the median, population below: often a sign of constrained housing supply",
	},
};

export const QUADRANT_ORDER: Quadrant[] = [
	"demand_positive",
	"supply_negative",
	"supply_positive",
	"demand_negative",
];

export function quadrantNoun(q: Quadrant | null | undefined): string {
	return q ? QUADRANT[q].noun : "Undiagnosed";
}

export function supplySideLabel(s: SupplySide | null | undefined): string {
	return s === "cost"
		? "cost side"
		: s === "amenity"
			? "amenity side"
			: "no supply-side reading";
}

const compact = new Intl.NumberFormat("en-US", {
	notation: "compact",
	maximumFractionDigits: 1,
});
const whole = new Intl.NumberFormat("en-US");
const usd = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	maximumFractionDigits: 0,
});

export function fmtCompact(n: number | null | undefined): string {
	return n == null ? "—" : compact.format(n);
}
export function fmtWhole(n: number | null | undefined): string {
	return n == null ? "—" : whole.format(n);
}
export function fmtUsd(n: number | null | undefined): string {
	return n == null ? "—" : usd.format(n);
}
/** A per-year fraction as "+0.57 %/yr". */
export function fmtRate(r: number | null | undefined): string {
	if (r == null) return "—";
	const pct = r * 100;
	return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(2)} %/yr`;
}

/** "Weirton's", "Hooverson Heights'" */
export function possessive(name: string): string {
	return name.endsWith("s") ? `${name}'` : `${name}'s`;
}
