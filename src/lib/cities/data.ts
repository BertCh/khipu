import { readJson, type Silhouettes } from "#/lib/khipu/data";
import { tiePlaceKhipu } from "./tie";
import type {
	CityIndex,
	MetroKhipu,
	NationKhipu,
	PlaceKhipu,
	PlaceSeriesFile,
} from "./types";

/**
 * Loaders for the city khipus in public/data/cities (built by
 * scripts/build_cities.py from the Cities Tool atlas). Same arrangement as
 * lib/khipu/data: static JSON, fetched and memoised.
 */

const SLUG_RE = /^[a-z0-9-]{1,60}$/;

function assertSlug(kind: string, slug: string): string {
	if (!SLUG_RE.test(slug)) throw new Error(`Not a ${kind} slug: ${slug}`);
	return slug;
}

const cities = <T>(relPath: string) => readJson<T>(`cities/${relPath}`);

export const getCityIndex = () => cities<CityIndex>("index.json");

export const getCitySilhouettes = () => cities<Silhouettes>("silhouettes.json");

export const getNationKhipu = () => cities<NationKhipu>("us.json");

export async function getMetroKhipu(slug: string): Promise<MetroKhipu | null> {
	try {
		return await cities<MetroKhipu>(`metros/${assertSlug("metro", slug)}.json`);
	} catch {
		return null;
	}
}

/** Neighbours in the index order (by population), for the prev/next links. */
export async function getMetroNeighbors(slug: string) {
	assertSlug("metro", slug);
	const index = await getCityIndex();
	const rows = index.metros;
	const i = rows.findIndex((m) => m.slug === slug);
	const pick = (j: number) =>
		j >= 0 && j < rows.length
			? { slug: rows[j].slug, name: rows[j].displayName }
			: null;
	return {
		prev: i > 0 ? pick(i - 1) : null,
		next: i >= 0 ? pick(i + 1) : null,
		position: i + 1,
		total: rows.length,
	};
}

export interface PlacePage {
	khipu: PlaceKhipu;
	/** the place's neighbours in khipu order within the metro */
	prev: { slug: string; name: string } | null;
	next: { slug: string; name: string } | null;
	position: number;
	total: number;
}

/**
 * A place's khipu, tied on request from its metro's series file (the third
 * level; see lib/cities/tie.ts for why it is not pre-built). The place is
 * named by its slug under the metro, or by its GEOID.
 */
export async function getPlaceKhipu(
	metro: string,
	place: string,
): Promise<PlacePage | null> {
	assertSlug("metro", metro);
	assertSlug("place", place);
	let file: PlaceSeriesFile;
	try {
		file = await cities<PlaceSeriesFile>(`places/${metro}.json`);
	} catch {
		return null;
	}
	const i = file.places.findIndex((p) => p.slug === place || p.id === place);
	if (i < 0) return null;
	const index = await getCityIndex();
	const pick = (j: number) =>
		j >= 0 && j < file.places.length
			? { slug: file.places[j].slug, name: file.places[j].name }
			: null;
	return {
		khipu: tiePlaceKhipu(
			file,
			file.places[i],
			index.encoding,
			index.source.window,
		),
		prev: pick(i - 1),
		next: pick(i + 1),
		position: i + 1,
		total: file.places.length,
	};
}
