/**
 * Browser loader for the /next engine corpus: corpus-lite.json plus the
 * strand file (for strandsVerified). Memoised per session; a failed load is
 * not memoised, so it can be retried.
 */
import { readJson } from "#/lib/khipu/data";
import type { CorpusLite, CorpusLiteFile } from "#/lib/next/types";
import { getStrands } from "#/lib/stories/strands";
import { parseCorpus } from "./corpus.ts";

export const CORPUS_LITE_JSON = "next/corpus-lite.json";

let pending: Promise<CorpusLite> | null = null;

export function loadCorpus(): Promise<CorpusLite> {
	if (!pending) {
		const p = Promise.all([
			readJson<CorpusLiteFile>(CORPUS_LITE_JSON),
			getStrands(),
		]).then(([raw, strands]) => parseCorpus(raw, strands));
		p.catch(() => {
			if (pending === p) pending = null;
		});
		pending = p;
	}
	return pending;
}
