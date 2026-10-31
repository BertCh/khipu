import type {
	ColorSegment,
	Cord,
	CordGroup,
	KhipuStats,
	Knot,
	PrimaryCord,
} from "#/lib/khipu/types";
import type {
	CityEncoding,
	PlaceCity,
	PlaceKhipu,
	PlaceRole,
	PlaceSeries,
	PlaceSeriesFile,
	PlaceSeriesKey,
	PlaceYear,
	Quadrant,
} from "./types";

/**
 * Ties a place's khipu from its yearly series — the third level of the city
 * collection, below the country (whose pendants are metros) and the metro
 * (whose pendants are places).
 *
 * The metro and national khipus are tied once by scripts/build_cities.py;
 * 16,943 place khipus written out the same way would run past a gigabyte,
 * so the script only writes each metro's place series and this ties one
 * khipu when it is asked for. The cord builders below mirror the script's
 * (decimal_knots, make_cord, stats_for) and read the same constants from
 * index.json's encoding block, so a cord here is knotted exactly as it would
 * be a level up.
 *
 * Encoding: one group per year, oldest first, the same cords in the same
 * order every year —
 *   p{n}      residents who work, in the place's own colour; the cord runs
 *             on past the units row by that year's mean wage
 *   p{n}s1    of whom, those who also work in the place (stay colour)
 *   p{n}s2    and those who commute out (commute colour) — s1 + s2 = p{n}
 *   p{n+1}    jobs located in the place (jobs colour)
 *   p{n+1}s1  held by people who live there (the same count as p{n}s1)
 *   p{n+1}s2  held by people who commute in — again s1 + s2 = the pendant
 *   p{n+2}    population (population colour; incorporated places only)
 *   p{n+3}    home value in dollars (home-value colour)
 * A cord the atlas has no number for that year is not tied, so a group can
 * be short. The last year's residents cord is the place's pendant on the
 * metro khipu, the jobs cord its first subsidiary and the latest population
 * its second: that is how the levels join.
 */

const BORDERLINE_OP = "-";

function colorOf(
	quadrant: Quadrant | null,
	borderline: boolean,
	enc: CityEncoding,
): [string, ColorSegment[]] {
	const code = enc.quadrantColor[quadrant ?? "none"];
	if (borderline && code !== "W")
		return [
			`${code}${BORDERLINE_OP}W`,
			[{ codes: [code, "W"], ops: [BORDERLINE_OP] }],
		];
	return [code, [{ codes: [code] }]];
}

function solid(code: string): [string, ColorSegment[]] {
	return [code, [{ codes: [code] }]];
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Knots for `value` on a cord whose rows fit `digits` powers of ten. Row r
 * (0 = nearest the attachment) holds 10^(digits-1-r); a subsidiary attached
 * `offset` cm down its parent has its rows pulled up by that much so they
 * line up with the parent's.
 */
function decimalKnots(
	value: number,
	digits: number,
	offset: number,
	direction: string,
	enc: CityEncoding,
): Knot[] {
	if (!value) return [];
	const s = String(Math.trunc(value));
	const knots: Knot[] = [];
	for (let i = 0; i < s.length; i++) {
		const d = Number(s[i]);
		if (d === 0) continue;
		const p = s.length - 1 - i;
		const depth = enc.row0 + (digits - 1 - p) * enc.pitch - offset;
		if (p === 0)
			knots.push({
				n: d,
				type: d === 1 ? "E" : "L",
				pos: r1(depth),
				dir: direction,
				value: d,
			});
		else
			knots.push({
				n: d,
				type: "S",
				pos: r1(depth),
				dir: direction,
				value: d * 10 ** p,
			});
	}
	return knots;
}

function physicalKnots(knots: Knot[]): number {
	return knots.reduce((a, k) => a + (k.type === "S" ? k.n : 1), 0);
}

function minLength(digits: number, offset: number, enc: CityEncoding) {
	return enc.row0 + (digits - 1) * enc.pitch + enc.tail - offset;
}

interface CordSpec {
	name: string;
	level: number;
	kind: Cord["kind"];
	ordinal: number;
	value: number;
	digits: number;
	color: [string, ColorSegment[]];
	parent?: string;
	group?: number;
	pos?: number;
	offset?: number;
	direction: string;
	attach: string;
	tail?: number;
}

function makeCord(spec: CordSpec, enc: CityEncoding): Cord {
	const offset = spec.offset ?? 0;
	const knots = decimalKnots(
		spec.value,
		spec.digits,
		offset,
		spec.direction,
		enc,
	);
	const cord: Cord = {
		name: spec.name,
		level: spec.level,
		kind: spec.kind,
		ordinal: spec.ordinal,
		twist: "S",
		attach: spec.attach,
		length: r1(minLength(spec.digits, offset, enc) + (spec.tail ?? 0)),
		term: "K",
		thick: null,
		color: spec.color[0],
		colorParsed: spec.color[1],
		value: Math.trunc(spec.value),
		altValue: null,
		knots,
		nKnots: physicalKnots(knots),
	};
	if (spec.parent !== undefined) cord.parent = spec.parent;
	if (spec.group !== undefined) cord.group = spec.group;
	if (spec.pos !== undefined) cord.pos = r1(spec.pos);
	return cord;
}

function digitsNeeded(values: (number | null)[]): number {
	let d = 1;
	for (const v of values) if (v) d = Math.max(d, String(Math.trunc(v)).length);
	return d;
}

function statsFor(cords: Cord[], groups: CordGroup[]): KhipuStats {
	const pendants = cords.filter((c) => c.level === 1 && c.kind === "pendant");
	const colorsUsed = new Map<string, number>();
	for (const c of cords)
		for (const seg of c.colorParsed ?? [])
			for (const code of seg.codes)
				colorsUsed.set(code, (colorsUsed.get(code) ?? 0) + 1);
	const knotTypes: KhipuStats["knotTypes"] = {};
	for (const c of cords)
		for (const k of c.knots)
			knotTypes[k.type] = (knotTypes[k.type] ?? 0) + (k.type === "S" ? k.n : 1);
	const values = pendants.flatMap((c) => (c.value != null ? [c.value] : []));
	const lengths = cords.flatMap((c) => (c.length != null ? [c.length] : []));
	return {
		nCords: cords.length,
		nPendants: pendants.length,
		nSubsidiaries: cords.filter((c) => c.level > 1).length,
		nTop: cords.filter((c) => c.kind === "top").length,
		nGroups: groups.length,
		nKnots: cords.reduce((a, c) => a + c.nKnots, 0),
		maxLevel: Math.max(0, ...cords.map((c) => c.level)),
		nColors: colorsUsed.size,
		totalValue: values.reduce((a, v) => a + v, 0),
		maxValue: Math.max(0, ...values),
		meanCordLength: lengths.length
			? Math.round(
					(lengths.reduce((a, v) => a + v, 0) / lengths.length) * 100,
				) / 100
			: 0,
		knotTypes,
		topColors: [...colorsUsed.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5)
			.map(([k]) => k),
	};
}

export function tiePlaceKhipu(
	file: PlaceSeriesFile,
	place: PlaceSeries,
	enc: CityEncoding,
	window: { start: number; end: number },
): PlaceKhipu {
	const col = new Map(file.series.map((k, i) => [k, i]));
	const at = (row: (number | null)[], key: PlaceSeriesKey): number | null =>
		row[col.get(key) ?? -1] ?? null;

	const own = colorOf(place.quadrant, place.borderline, enc);
	const direction =
		place.supplySide === "cost"
			? "S"
			: place.supplySide === "amenity"
				? "Z"
				: "U";
	const attach = place.class === "incorporated" ? "R" : "V";

	// every knotted value shares the khipu's rows (the wage is a length, not knots)
	const digits = digitsNeeded(
		place.rows.flatMap((row) =>
			file.series.flatMap((k, i) => (k === "wage" ? [] : [row[i]])),
		),
	);

	const cords: Cord[] = [];
	const groups: CordGroup[] = [];
	const roles: PlaceKhipu["roles"] = {};
	const yearRows: PlaceYear[] = [];
	let cursor = 0;
	let ordinal = 0;

	file.years.forEach((year, yi) => {
		const row = place.rows[yi] ?? [];
		const y: PlaceYear = {
			year,
			group: groups.length,
			population: at(row, "population"),
			residentWorkers: at(row, "residentWorkers"),
			jobsHere: at(row, "jobsHere"),
			liveWorkHere: at(row, "liveWorkHere"),
			outCommuters: at(row, "outCommuters"),
			inCommuters: at(row, "inCommuters"),
			wage: at(row, "wage"),
			homeValue: at(row, "homeValue"),
			cords: {},
		};
		const pendantsOf: [
			PlaceRole,
			number | null,
			[string, ColorSegment[]],
			number,
		][] = [
			["residents", y.residentWorkers, own, (y.wage ?? 0) / enc.wagePerCm],
			["jobs", y.jobsHere, solid(enc.jobsColor), 0],
			["population", y.population, solid(enc.populationColor), 0],
			["homeValue", y.homeValue, solid(enc.homeValueColor), 0],
		];
		if (!pendantsOf.some(([, v]) => v != null)) return;

		const start = cursor;
		const first = ordinal + 1;
		const gi = groups.length;
		let i = 0;
		const tie = (
			role: PlaceRole,
			spec: Omit<CordSpec, "digits" | "direction" | "attach">,
		) => {
			cords.push(makeCord({ ...spec, digits, direction, attach }, enc));
			roles[spec.name] = { year, role };
			// "stay" hangs under both work cords; the map keeps the residents' one
			y.cords[role] ??= spec.name;
		};
		for (const [role, value, color, tail] of pendantsOf) {
			if (value == null) continue;
			ordinal += 1;
			const name = `p${ordinal}`;
			tie(role, {
				name,
				level: 1,
				kind: "pendant",
				ordinal,
				value,
				color,
				group: gi,
				pos: start + i * enc.pendantSpacing,
				tail,
			});
			i += 1;
			// the commute split beneath the two work cords: who stays, who crosses
			const subs: [PlaceRole, number | null][] =
				role === "residents"
					? [
							["stay", y.liveWorkHere],
							["out", y.outCommuters],
						]
					: role === "jobs"
						? [
								["stay", y.liveWorkHere],
								["in", y.inCommuters],
							]
						: [];
			subs.forEach(([subRole, subValue], si) => {
				if (subValue == null) return;
				tie(subRole, {
					name: `${name}s${si + 1}`,
					level: 2,
					kind: "subsidiary",
					ordinal: si + 1,
					value: subValue,
					color: solid(subRole === "stay" ? enc.stayColor : enc.commuteColor),
					parent: name,
					pos: enc.subPos[si],
					offset: enc.subPos[si],
				});
			});
		}
		groups.push({
			start: r1(start),
			first,
			last: ordinal,
			n: ordinal - first + 1,
			spacing: enc.pendantSpacing,
		});
		yearRows.push(y);
		cursor = start + i * enc.pendantSpacing + enc.groupGap;
	});

	const totalLength = Math.max(0, cursor - enc.groupGap);
	const primary: PrimaryCord = {
		structure: "P",
		thick: null,
		length: r1(totalLength),
		color: own[0],
		colorParsed: own[1],
		fiber: null,
		beginning: "K",
		term: "K",
		twist: "S",
		notes: null,
	};

	const latest = <K extends keyof PlaceYear>(key: K): PlaceYear[K] | null => {
		for (let i = yearRows.length - 1; i >= 0; i--) {
			const v = yearRows[i][key];
			if (v != null) return v;
		}
		return null;
	};
	const lastCommute = [...yearRows]
		.reverse()
		.find((y) => y.residentWorkers != null);

	const city: PlaceCity = {
		kind: "place",
		id: place.id,
		slug: place.slug,
		name: place.name,
		displayName: `${place.name}, ${place.state}`,
		state: place.state,
		stateName: place.stateName,
		class: place.class,
		metro: file.metro,
		metroCord: place.cord,
		population: latest("population") as number | null,
		wage: latest("wage") as number | null,
		popCagr: place.popCagr,
		wageCagr: place.wageCagr,
		costCagr: place.costCagr,
		quadrant: place.quadrant,
		borderline: place.borderline,
		supplySide: place.supplySide,
		amenityPct: place.amenityPct,
		jobAccess: place.jobAccess,
		features: place.features,
		window,
		digits,
		years: yearRows.map((y) => y.year),
		lastCommuteYear: lastCommute?.year ?? null,
	};

	return {
		id: `${file.metro.slug}/${place.slug}`,
		city,
		primary,
		groups,
		cords,
		stats: statsFor(cords, groups),
		roles,
		yearRows,
	};
}
