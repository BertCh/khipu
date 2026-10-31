/**
 * Turning a link's evidence to face one way. A scan pair's `a` is whichever
 * khipu the scan met first, and a strands.json link's `a` follows the curated
 * link, so neither need match the order a view draws them in (graph-audit
 * §5 bug 1: the Basel fragments).
 */
import type { GraphLink } from "#/lib/stories/links";
import type { StrandLink, StrandThread } from "#/lib/stories/strands";

/**
 * A link's exact shared runs relative to `link.a` / `link.b`. A reversed
 * run pairs a[startA + k] with b[startB + len − 1 − k], which is symmetric,
 * so swapping the two starts is enough in both directions.
 */
export function orientSpans(
	link: GraphLink,
): { len: number; startA: number; startB: number }[] {
	const scan = link.scan;
	if (!scan) return [];
	const flip = scan.a !== link.a;
	return scan.spans.map(([len, sa, sb]) =>
		flip ? { len, startA: sb, startB: sa } : { len, startA: sa, startB: sb },
	);
}

/** The same, from bare spans in the frame of (from, …) into (to, …). */
export function flipSpans(
	spans: [number, number, number][],
	flip: boolean,
): [number, number, number][] {
	return flip ? spans.map(([l, x, y]) => [l, y, x]) : spans;
}

/** A link's threads with `.a` indexing khipu `a` (and `subA` naming its subsidiaries). */
export function orientThreads(sl: StrandLink, a: string): StrandThread[] {
	if (sl.a === a) return sl.threads;
	return sl.threads.map((t) => {
		const o: StrandThread = {
			a: t.b,
			b: t.a,
			va: t.vb,
			vb: t.va,
			kind: t.kind,
		};
		if (t.how !== undefined) o.how = t.how;
		if (t.note !== undefined) o.note = t.note;
		if (t.subB !== undefined) o.subA = t.subB;
		if (t.subA !== undefined) o.subB = t.subA;
		return o;
	});
}
