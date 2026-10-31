/**
 * Shapes of the JSON produced by scripts/build_cities.py (public/data/cities/):
 * a census khipu per US metro, built from the Cities Tool atlas.
 */

import type { KhipuLike } from "#/lib/khipu/types";

export type Quadrant =
	| "demand_positive"
	| "demand_negative"
	| "supply_positive"
	| "supply_negative";
export type SupplySide = "cost" | "amenity";

/** One place of a metro, keyed in CityKhipu.places by its pendant's name. */
export interface PlaceMeta {
	/** URL segment under the metro: /cities/boston-ma/cambridge */
	slug: string;
	id: string;
	name: string;
	state: string;
	class: "incorporated" | "CDP";
	population: number | null;
	popCagr: number | null;
	wage: number | null;
	wageCagr: number | null;
	homeValue: number | null;
	costCagr: number | null;
	unemployment: number | null;
	quadrant: Quadrant | null;
	borderline: boolean;
	supplySide: SupplySide | null;
	amenityPct: number | null;
	jobsHere: number | null;
	residentWorkers: number | null;
}

/** One metro of the country, keyed in the national khipu's places by its pendant's name. */
export interface MetroMeta {
	id: string;
	slug: string;
	/** "Boston, MA" */
	name: string;
	state: string;
	division: string;
	population: number | null;
	popCagr: number | null;
	wage: number | null;
	wageCagr: number | null;
	costCagr: number | null;
	quadrant: Quadrant | null;
	borderline: boolean;
	supplySide: SupplySide | null;
	nPlaces: number;
}

interface CityBase {
	slug: string;
	name: string;
	displayName: string;
	population: number | null;
	/** mean wage at the window's end */
	wage: number | null;
	popCagr: number | null;
	wageCagr: number | null;
	costCagr: number | null;
	quadrant: Quadrant | null;
	borderline: boolean;
	supplySide: SupplySide | null;
	window: { start: number; end: number };
	/** powers of ten the knot rows fit; every cord in the khipu shares them */
	digits: number;
}

export interface MetroCity extends CityBase {
	kind: "metro";
	metroId: string;
	state: string;
	division: string | null;
	principalPlaceId: string;
	principalPlaceName: string;
	/** the principal place's pendant, next to the top cord */
	principalCord: string | null;
	lat: number;
	lng: number;
	/** metro employment at the window's end */
	employment: number | null;
	nPlaces: number;
	/** principal state first */
	states: string[];
}

export interface NationCity extends CityBase {
	kind: "nation";
	nMetros: number;
	/** group index → census division */
	divisions: Record<string, string>;
}

export interface MetroKhipu extends KhipuLike {
	city: MetroCity;
	places: Record<string, PlaceMeta>;
}

export interface NationKhipu extends KhipuLike {
	city: NationCity;
	places: Record<string, MetroMeta>;
}

/**
 * The third level: one place's yearly series, from public/data/cities/places/
 * {metro slug}.json (one file per metro, its places in khipu order). The app
 * ties the place's khipu from it on request — see lib/cities/tie.ts.
 */
export type PlaceSeriesKey =
	| "population"
	| "residentWorkers"
	| "jobsHere"
	| "liveWorkHere"
	| "outCommuters"
	| "inCommuters"
	| "wage"
	| "homeValue";

export interface PlaceSeries {
	slug: string;
	id: string;
	/** the place's pendant on the metro khipu */
	cord: string;
	name: string;
	state: string;
	stateName: string | null;
	class: "incorporated" | "CDP";
	quadrant: Quadrant | null;
	borderline: boolean;
	supplySide: SupplySide | null;
	popCagr: number | null;
	wageCagr: number | null;
	costCagr: number | null;
	amenityPct: number | null;
	/** jobs reachable within so many minutes, for the larger places */
	jobAccess:
		| {
				minutes: number;
				jobs: number | null;
				rankInMetro: number | null;
				rankNational: number | null;
		  }[]
		| null;
	features: {
		restaurants: number | null;
		culture: number | null;
		dailyNeeds: number | null;
	} | null;
	/** one row per year of PlaceSeriesFile.years, columns per `.series` */
	rows: (number | null)[][];
}

export interface PlaceSeriesFile {
	metro: {
		slug: string;
		metroId: string;
		displayName: string;
		quadrant: Quadrant | null;
		borderline: boolean;
	};
	years: number[];
	series: PlaceSeriesKey[];
	places: PlaceSeries[];
}

/** Which of a year's cords a cord of a place khipu is. */
export type PlaceRole =
	| "residents"
	| "stay"
	| "out"
	| "jobs"
	| "in"
	| "population"
	| "homeValue";

export interface PlaceCity extends CityBase {
	kind: "place";
	id: string;
	state: string;
	stateName: string | null;
	class: "incorporated" | "CDP";
	metro: PlaceSeriesFile["metro"];
	/** the place's pendant on the metro khipu, and what it carries */
	metroCord: string;
	amenityPct: number | null;
	jobAccess: PlaceSeries["jobAccess"];
	features: PlaceSeries["features"];
	/** the years tied, oldest first; one group each */
	years: number[];
	/** the last year with commute counts — the one the metro khipu carries */
	lastCommuteYear: number | null;
}

export interface PlaceYear {
	year: number;
	group: number;
	population: number | null;
	residentWorkers: number | null;
	jobsHere: number | null;
	liveWorkHere: number | null;
	outCommuters: number | null;
	inCommuters: number | null;
	wage: number | null;
	homeValue: number | null;
	/** the year's cords by role ("stay" is the residents' one; the jobs cord's is `${jobs}s1`) */
	cords: Partial<Record<PlaceRole, string>>;
}

export interface PlaceKhipu extends KhipuLike {
	city: PlaceCity;
	/** cord name → the year it belongs to and what it counts */
	roles: Record<string, { year: number; role: PlaceRole }>;
	/** in group order */
	yearRows: PlaceYear[];
}

export type CityKhipu = MetroKhipu | NationKhipu | PlaceKhipu;

/** One row of public/data/cities/index.json. */
export interface MetroSummary {
	slug: string;
	metroId: string;
	name: string;
	state: string;
	displayName: string;
	division: string | null;
	states: string[];
	population: number | null;
	wage: number | null;
	popCagr: number | null;
	wageCagr: number | null;
	costCagr: number | null;
	quadrant: Quadrant | null;
	borderline: boolean;
	supplySide: SupplySide | null;
	nPlaces: number;
	nIncorporated: number;
	/** Σ resident workers of the places — the sum of the pendant values */
	residentWorkers: number;
	/** Σ jobs located in the places */
	jobs: number;
	nCords: number;
	nPendants: number;
	nSubsidiaries: number;
	nGroups: number;
	nKnots: number;
	nColors: number;
	maxValue: number;
	digits: number;
}

export interface CityEncoding {
	row0: number;
	pitch: number;
	tail: number;
	wagePerCm: number;
	subPos: [number, number];
	pendantSpacing: number;
	groupGap: number;
	quadrantColor: Record<Quadrant | "none", string>;
	jobsColor: string;
	populationColor: string;
	/** the place khipus' extra cords */
	stayColor: string;
	commuteColor: string;
	homeValueColor: string;
	/** first and last year a place khipu ties */
	placeYears: [number, number];
	placeSeries: PlaceSeriesKey[];
}

export interface CityIndex {
	generatedAt: string;
	source: {
		generatedAt: string;
		window: { start: number; end: number };
		medians: { popCagr: number; wageCagr: number; costCagr: number };
		national: { popCagr: number; wageCagr: number; costCagr: number };
	};
	encoding: CityEncoding;
	nation: {
		population: number;
		wage: number | null;
		nMetros: number;
		nPlaces: number;
		nCords: number;
		nKnots: number;
		divisions: string[];
	};
	/** by population, largest first */
	metros: MetroSummary[];
}
