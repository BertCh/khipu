import { useRouter } from "@tanstack/react-router";
import { getKhipuIndex, readJson } from "#/lib/khipu/data";
import type { KhipuSummary } from "#/lib/khipu/types";
import { buildGraph, type Graph, type ScanFile } from "#/lib/stories/links";

/**
 * The headline counts of /network, for pages that point to it (home, the
 * stories index), computed the way /network computes them at its default
 * setting (runs of six or more, no catalogue layers) so the numbers cannot
 * drift from the map.
 */
export interface NetworkSummary {
	/** khipus linked to at least one other */
	khipus: number;
	links: number;
	islands: number;
	/** links whose two khipus are now held by different museums */
	crossMuseum: number;
	/** links a story or a paper has read (not bare scan passages) */
	curated: number;
	/** pairs sharing a run of six or more, against the shuffled corpora */
	baseline: { observed: number; shuffled: number; shuffles: number };
}

export function networkSummary(
	index: KhipuSummary[],
	scan: ScanFile,
): NetworkSummary {
	return summarizeGraph(buildGraph(index, scan), scan);
}

/** The same counts for a graph already built (/network at any setting). */
export function summarizeGraph(graph: Graph, scan: ScanFile): NetworkSummary {
	const museum = new Map(graph.nodes.map((n) => [n.id, n.summary.museum]));
	return {
		khipus: graph.nodes.length,
		links: graph.links.length,
		islands: graph.islands.length,
		crossMuseum: graph.links.filter((l) => museum.get(l.a) !== museum.get(l.b))
			.length,
		curated: graph.links.filter((l) => l.kind !== "passage").length,
		baseline: { ...scan.baseline["6"], shuffles: scan.shuffles },
	};
}

/** For a loader: the summary, or null when links.json is missing. */
export async function getNetworkSummary(
	index?: KhipuSummary[],
): Promise<NetworkSummary | null> {
	try {
		const [idx, scan] = await Promise.all([
			index ?? getKhipuIndex(),
			readJson<ScanFile>("stories/links.json"),
		]);
		return networkSummary(idx, scan);
	} catch {
		return null;
	}
}

/** How many story pages the router knows (every /stories/<slug> route). */
export function useStoryCount(): number {
	const router = useRouter();
	return Object.keys(router.routesByPath).filter(
		(p) => p.startsWith("/stories/") && p.length > "/stories/".length,
	).length;
}

const WORDS = [
	"zero",
	"one",
	"two",
	"three",
	"four",
	"five",
	"six",
	"seven",
	"eight",
	"nine",
	"ten",
	"eleven",
	"twelve",
	"thirteen",
	"fourteen",
	"fifteen",
	"sixteen",
	"seventeen",
	"eighteen",
	"nineteen",
	"twenty",
];

/** A count as prose: words up to twenty, digits above. */
export function countWord(n: number, capital = false): string {
	const w = WORDS[n] ?? n.toLocaleString();
	return capital ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}
