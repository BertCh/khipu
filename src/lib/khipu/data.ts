import type {
	CodeTables,
	ColorTable,
	Corpus,
	Khipu,
	KhipuSummary,
} from "./types";

/**
 * Loaders for the built JSON in public/data. The app is a static site, so
 * these just fetch the files; the per-khipu files are fetched lazily by id.
 * Results are memoised per path so the shared tables (colours, codes, the
 * index) are parsed once per session.
 */

const DATA_URL = `${import.meta.env.BASE_URL}data/`;

const cache = new Map<string, Promise<unknown>>();

/** Fetch and parse one JSON file; rejects with a NotFound-ish error on 404. */
export function readJson<T>(relPath: string): Promise<T> {
	let p = cache.get(relPath) as Promise<T> | undefined;
	if (!p) {
		p = fetch(DATA_URL + relPath).then((res) => {
			if (!res.ok) throw new Error(`${res.status} ${relPath}`);
			return res.json() as Promise<T>;
		});
		// don't memoise failures, so a flaky fetch can be retried
		p.catch(() => cache.delete(relPath));
		cache.set(relPath, p);
	}
	return p;
}

const ID_RE = /^KH\d{4}$/;

function assertId(id: string): string {
	if (!ID_RE.test(id)) throw new Error(`Not a khipu id: ${id}`);
	return id;
}

export const getKhipuIndex = () => readJson<KhipuSummary[]>("khipus.json");

export const getCorpus = () => readJson<Corpus>("corpus.json");

export const getColors = () => readJson<ColorTable>("colors.json");

export const getCodes = () => readJson<CodeTables>("codes.json");

/** Per khipu: pendant lengths (l) and base colour codes (c), for thumbnails. */
export type Silhouettes = Record<
	string,
	{ l: (number | null)[]; c: (string | null)[] }
>;

export const getSilhouettes = () => readJson<Silhouettes>("silhouettes.json");

export async function getKhipu(id: string): Promise<Khipu | null> {
	try {
		return await readJson<Khipu>(`khipus/${assertId(id)}.json`);
	} catch {
		return null;
	}
}

/** Ids immediately before and after this one in KH-number order. */
export async function getNeighbors(id: string) {
	assertId(id);
	const index = await getKhipuIndex();
	const ids = index.map((k) => k.id).sort();
	const i = ids.indexOf(id);
	return {
		prev: i > 0 ? ids[i - 1] : null,
		next: i >= 0 && i < ids.length - 1 ? ids[i + 1] : null,
		position: i + 1,
		total: ids.length,
	};
}

/** Several khipus at once, for the stories; ids that don't exist are dropped. */
export async function getKhipus(ids: string[]): Promise<Record<string, Khipu>> {
	const out: Record<string, Khipu> = {};
	await Promise.all(
		ids.map(async (id) => {
			const khipu = await getKhipu(id);
			if (khipu) out[id] = khipu;
		}),
	);
	return out;
}
