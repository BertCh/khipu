import type { KhipuSummary } from "#/lib/khipu/types";
import {
	CURATED,
	type GraphLink,
	type GraphNode,
	type Island,
	pairKey,
	shortAlias,
} from "#/lib/stories/links";

/**
 * A story's own island for IslandFlow: the given khipus and only the curated
 * links between them (no scan pairs, no sets), so a story can show the web it
 * reads without the noise of the full network island. Links that join a
 * listed khipu to one outside the list are left out.
 */
export function curatedIsland(
	index: KhipuSummary[],
	ids: string[],
	{ exclude = [] }: { exclude?: string[] } = {},
): Island {
	const byId = new Map(index.map((k) => [k.id, k]));
	const want = new Set(ids.filter((id) => byId.has(id)));
	const skip = new Set(exclude);
	const links: GraphLink[] = CURATED.filter(
		(c) => want.has(c.a) && want.has(c.b) && !skip.has(pairKey(c.a, c.b)),
	).map((c) => ({ ...c, id: pairKey(c.a, c.b) }));
	const nodes: GraphNode[] = [...want].sort().map((id) => {
		const summary = byId.get(id) as KhipuSummary;
		return {
			id,
			summary,
			alias: shortAlias(summary),
			links: links.filter((l) => l.a === id || l.b === id),
			sets: [],
		};
	});
	return { id: nodes[0]?.id ?? "", nodes, links, sets: [] };
}
