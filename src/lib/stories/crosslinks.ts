import type { Cord, Khipu } from "#/lib/khipu/types";

export const ROUNDED_SOURCE_ID = "KH0049";
export const ROUNDED_COPY_ID = "KH0362";
export const PACHACAMAC_LONG_ID = "KH0450";
export const PACHACAMAC_TABLE_ID = "KH0147";
export const GAFFRON_FRAGMENT_ID = "KH0689";
export const BROWN_SOURCE_ID = "KH0377";
export const BROWN_COPY_ID = "KH0590";
export const SIX_SOURCE_ID = "KH0358";
export const SIX_COPY_ID = "KH0602";

export const CROSS_LINK_IDS = [
	ROUNDED_SOURCE_ID,
	ROUNDED_COPY_ID,
	PACHACAMAC_LONG_ID,
	PACHACAMAC_TABLE_ID,
	GAFFRON_FRAGMENT_ID,
	BROWN_SOURCE_ID,
	BROWN_COPY_ID,
	SIX_SOURCE_ID,
	SIX_COPY_ID,
] as const;

export type FieldVerdict = "exact" | "near" | "blank" | "different" | "missing";

export interface FieldComparison {
	position: number;
	a: number | null;
	b: number | null;
	verdict: FieldVerdict;
}

export interface GroupAlignment {
	aGroup: number;
	bGroup: number;
	fields: FieldComparison[];
	exact: number;
	near: number;
	blanked: number;
}

export function pendantCords(khipu: Khipu): Cord[] {
	return khipu.cords
		.filter((cord) => cord.level === 1 && cord.kind === "pendant")
		.sort((a, b) => a.ordinal - b.ordinal);
}

/** A recorded JSON group, retaining empty indexes made by interleaved top cords. */
export function groupCords(khipu: Khipu, group: number): Cord[] {
	return pendantCords(khipu).filter((cord) => cord.group === group);
}

export function cordValues(cords: Cord[]): number[] {
	return cords.map((cord) => cord.value ?? 0);
}

export function compareValue(a: number | null, b: number | null): FieldVerdict {
	if (a == null || b == null) return "missing";
	if (a === b) return "exact";
	if (b === 0 && a > 0) return "blank";
	if (a > 0 && Math.abs(a - b) / a <= 0.02) return "near";
	return "different";
}

export function compareRuns(a: number[], b: number[]): FieldComparison[] {
	const n = Math.max(a.length, b.length);
	return Array.from({ length: n }, (_, position) => {
		const av = a[position] ?? null;
		const bv = b[position] ?? null;
		return {
			position,
			a: av,
			b: bv,
			verdict: compareValue(av, bv),
		};
	});
}

const ROUNDED_GROUP_MAP = [
	[2, 0],
	[4, 1],
	[5, 2],
	[6, 3],
] as const;

export function roundedAlignments(a: Khipu, b: Khipu): GroupAlignment[] {
	return ROUNDED_GROUP_MAP.map(([aGroup, bGroup]) => {
		const fields = compareRuns(
			cordValues(groupCords(a, aGroup)),
			cordValues(groupCords(b, bGroup)),
		);
		return {
			aGroup,
			bGroup,
			fields,
			exact: fields.filter((field) => field.verdict === "exact").length,
			near: fields.filter((field) => field.verdict === "near").length,
			blanked: fields.filter((field) => field.verdict === "blank").length,
		};
	});
}

export function roundedStats(rows: GroupAlignment[]) {
	const fields = rows.flatMap((row) => row.fields);
	const nonzeroCopy = fields.filter((field) => (field.b ?? 0) > 0);
	return {
		fields: fields.length,
		exact: fields.filter((field) => field.verdict === "exact").length,
		blanked: fields.filter((field) => field.verdict === "blank").length,
		nonzero: nonzeroCopy.length,
		nonzeroExact: nonzeroCopy.filter((field) => field.verdict === "exact")
			.length,
		nonzeroWithinTwo: nonzeroCopy.filter(
			(field) =>
				field.a != null &&
				field.b != null &&
				field.a > 0 &&
				Math.abs(field.a - field.b) / field.a <= 0.02,
		).length,
	};
}

/** The exact 12-cord passage straddling the last two aligned groups. */
export function roundedExactPassage(a: Khipu, b: Khipu) {
	const left = pendantCords(a).slice(82, 94);
	const right = pendantCords(b).slice(46, 58);
	return compareRuns(cordValues(left), cordValues(right));
}

export function pachacamacReverse(long: Khipu, fragment: Khipu) {
	const source = cordValues(groupCords(long, 15));
	const found = cordValues(groupCords(fragment, 0));
	const oriented = [...found.slice(0, -1)].reverse().concat(found.at(-1) ?? 0);
	return compareRuns(source, oriented);
}

export function pachacamacTable(table: Khipu, fragment: Khipu) {
	const source = cordValues(groupCords(table, 0));
	const second = cordValues(groupCords(fragment, 1));
	const last = cordValues(groupCords(fragment, 2));
	const found = second.concat(last);
	return compareRuns(source, found);
}

export function brownEight(a: Khipu, b: Khipu) {
	return compareRuns(
		cordValues(groupCords(a, 0)).slice(10, 18),
		cordValues(groupCords(b, 1)),
	);
}

export function sixFields(a: Khipu, b: Khipu) {
	return compareRuns(
		cordValues(groupCords(a, 29)),
		cordValues(groupCords(b, 3)),
	);
}
