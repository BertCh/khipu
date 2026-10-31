import { useEffect, useMemo, useState } from "react";
import KhipuDiagram from "#/components/khipu/KhipuDiagram";
import StrandWeave, { type WeaveRange } from "#/components/story/StrandWeave";
import { icOf } from "#/lib/engine/corpus";
import { loadCorpus } from "#/lib/engine/load";
import { getColors, getKhipu, readJson } from "#/lib/khipu/data";
import type { ColorTable, Cord, Khipu } from "#/lib/khipu/types";
import { flipSpans, orientThreads } from "#/lib/next/orient";
import {
	blindRanks,
	type PairSide,
	pairSide,
	splitPair,
} from "#/lib/next/pairdata";
import type { Hypothesis, RunResult, Spec } from "#/lib/next/types";
import {
	CURATED,
	type PriorStatus,
	pairKey,
	type ScanFile,
} from "#/lib/stories/links";
import {
	getStrands,
	type StrandFile,
	type StrandLevel,
	type StrandThread,
} from "#/lib/stories/strands";
import EvidenceStrip from "./EvidenceStrip";
import PairDotplot, {
	EvidenceList,
	type PlotView,
	type RunItem,
} from "./PairDotplot";
import TrackStack from "./TrackStack";
import "#/styles/next/pair.css";

export interface PairEvidenceProps {
	pair: string;
	hypothesis: Hypothesis;
	spec: Spec;
	result?: RunResult;
	thread?: number;
	onThread: (k: number | undefined) => void;
	blind?: boolean;
}

interface Loaded {
	ka: Khipu | null;
	kb: Khipu | null;
	strands?: StrandFile;
	colors: ColorTable | null;
	scan: ScanFile | null;
}

/** "chain:KH0517>KH0502" → ["KH0517", "KH0502"] (totals, heads) */
function chainIds(id: string): [string, string] | null {
	const m = /^chain:(KH\d{4})>(KH\d{4})$/.exec(id);
	return m ? [m[1], m[2]] : null;
}

const CONTROL_NOTE: Record<string, string> = {
	decoyPair:
		"This is the decoy control: the test ran against a seeded shuffle of the second khipu, so the drawing below (the real khipus) is not what was scored.",
	plantedCopy:
		"This is the planted-copy control: the test ran against a shuffle of the second khipu with the Paris–Lima run planted into it; the drawing shows the real khipus.",
};

/**
 * Everything the Proving Ground shows about one pair (or one totals → heads
 * chain): the evidence strip, a dotplot with its text twin, the weave for
 * the chosen window, value tracks, and both khipus drawn in full on request.
 */
export default function PairEvidence(p: PairEvidenceProps) {
	const chain = useMemo(() => chainIds(p.hypothesis.id), [p.hypothesis.id]);
	const [a, b] = chain ?? splitPair(p.pair);
	const key = pairKey(a, b);
	const valueSource = p.spec.valueSource === "knots" ? "knots" : "kfg";

	const [data, setData] = useState<Loaded | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [ic, setIc] = useState<((v: number) => number) | undefined>();
	const [view, setView] = useState<PlotView | null>(null);
	const [showFull, setShowFull] = useState(false);

	useEffect(() => {
		let live = true;
		setData(null);
		setView(null);
		Promise.all([
			getKhipu(a),
			getKhipu(b),
			getStrands(),
			getColors().catch(() => null),
			readJson<ScanFile>("stories/links.json").catch(() => null),
		])
			.then(([ka, kb, strands, colors, scan]) => {
				if (live) setData({ ka, kb, strands, colors, scan });
			})
			.catch((e: unknown) => {
				if (live) setError(String(e));
			});
		return () => {
			live = false;
		};
	}, [a, b]);

	useEffect(() => {
		let live = true;
		loadCorpus()
			.then((c) => {
				const f = icOf(c);
				if (live) setIc(() => f);
			})
			.catch(() => {});
		return () => {
			live = false;
		};
	}, []);

	const sideA = useMemo(
		() => (data?.ka ? pairSide(data.ka, valueSource) : null),
		[data?.ka, valueSource],
	);
	const sideB = useMemo(
		() => (data?.kb ? pairSide(data.kb, valueSource) : null),
		[data?.kb, valueSource],
	);
	const link = data?.strands?.links[key];
	const scanPair = data?.scan?.pairs.find((s) => pairKey(s.a, s.b) === key);
	const curated = CURATED.find((c) => pairKey(c.a, c.b) === key);

	// threads: strands.json for a pair; the matched cords of the run for a chain
	const threads = useMemo<StrandThread[]>(() => {
		if (!chain) {
			return link ? orientThreads(link, a) : [];
		}
		if (!p.result || !sideA || !sideB) return [];
		// chain hits: parallel lists of each matched group's first cord on the
		// totals khipu and the head it lands on; the bracket spans the group
		const groupOf = (first: number) => {
			const g = sideA.cords[first]?.group;
			if (g == null) return [first];
			const out: number[] = [];
			sideA.cords.forEach((c, i) => {
				if (c.group === g && c.kind === "pendant") out.push(i);
			});
			return out.length ? out : [first];
		};
		const out: StrandThread[] = [];
		for (const h of p.result.obs.hits) {
			const ia = h.ids.indexOf(a);
			const ib = h.ids.indexOf(b);
			if (ia < 0 || ib < 0 || !h.at) continue;
			const firsts = h.at[ia] ?? [];
			const heads = h.at[ib] ?? [];
			firsts.forEach((first, k) => {
				const head = heads[k];
				if (first < 0 || head == null || head < 0) return;
				const ta = groupOf(first);
				const va = ta.reduce((s, i) => s + Math.trunc(sideA.values[i] ?? 0), 0);
				const vb = sideB.values[head] ?? 0;
				out.push({
					a: ta,
					b: [head],
					va,
					vb,
					kind: "sum",
					how: va === vb ? undefined : "one digit apart",
				});
			});
		}
		return out;
	}, [chain, link, a, p.result, sideA, sideB, b]);

	// exact runs, in the (a, b) frame
	const ids = p.hypothesis.ids ?? [a, b];
	const liveSpans = p.result?.obs.spans;
	const spans = useMemo<[number, number, number][]>(() => {
		if (chain) return [];
		if (liveSpans) return flipSpans(liveSpans, ids[0] !== a);
		if (scanPair) return flipSpans(scanPair.spans, scanPair.a !== a);
		return [];
	}, [chain, liveSpans, ids[0], a, scanPair]);
	const dir = p.result?.obs.dir ?? scanPair?.dir ?? "fwd";
	const runs: RunItem[] = spans.map(([len, startA, startB]) => ({
		len,
		startA,
		startB,
	}));
	const longest =
		link?.longest ??
		scanPair?.longest ??
		(p.result?.obs.detail?.longest as number | undefined) ??
		(spans.length ? Math.max(...spans.map((s) => s[0])) : undefined);

	const ranks = useMemo(
		() =>
			p.blind && sideA && sideB ? blindRanks(sideA.values, sideB.values) : null,
		[p.blind, sideA, sideB],
	);
	const shown = useMemo(
		() => (v: number) =>
			ranks
				? v
					? `r${ranks.get(v) ?? "?"}`
					: "blank"
				: v.toLocaleString("en"),
		[ranks],
	);
	const labelA = p.blind ? "A" : both(a, sideA?.alias);
	const labelB = p.blind ? "B" : both(b, sideB?.alias);
	const names = useMemo(
		() =>
			p.blind
				? { [a]: "A", [b]: "B" }
				: { [a]: both(a, sideA?.alias), [b]: both(b, sideB?.alias) },
		[p.blind, a, b, sideA?.alias, sideB?.alias],
	);

	const sel =
		p.thread != null && p.thread >= 0 && p.thread < threads.length
			? threads[p.thread]
			: undefined;
	const nA = sideA?.values.length ?? 0;
	const nB = sideB?.values.length ?? 0;

	const win = useMemo<WeaveRange | null>(() => {
		if (view) return { id: a, from: view.x0, to: view.x1 };
		if (sel) {
			const [from, to] = around(sel.a, nA);
			return { id: a, from, to };
		}
		return null;
	}, [view, sel, a, nA]);

	let rangeA: [number, number] = [0, nA];
	let rangeB: [number, number] = [0, nB];
	if (view) {
		rangeA = [view.x0, view.x1];
		rangeB = [view.y0, view.y1];
	} else if (sel) {
		rangeA = around(sel.a, nA);
		rangeB = around(sel.b, nB);
	} else if (runs.length) {
		const r = runs[0];
		rangeA = around([r.startA, r.startA + r.len - 1], nA, 10);
		rangeB = around([r.startB, r.startB + r.len - 1], nB, 10);
	}

	const weaveThreads = useMemo(
		() => (chain ? [{ a, b, threads }] : undefined),
		[chain, a, b, threads],
	);
	const ringA = useMemo(() => ringFor(sel, "a", sideA), [sel, sideA]);
	const ringB = useMemo(() => ringFor(sel, "b", sideB), [sel, sideB]);

	if (error) return <p className="pe-note">Could not load the pair: {error}</p>;
	if (!data || !sideA || !sideB) {
		if (data && (!data.ka || !data.kb))
			return (
				<p className="pe-note">
					One of {a}, {b} has no record in this corpus.
				</p>
			);
		return <p className="pe-note cell-muted">Loading both khipus…</p>;
	}

	const level: StrandLevel | undefined =
		link?.level ?? curated?.level ?? (scanPair ? "scan" : undefined);
	const prior: PriorStatus | undefined = curated
		? (curated.prior?.status ?? "not-found")
		: undefined;
	const weaveGated =
		!chain &&
		(!link || ((link.level ?? "scan") === "scan" && (link.longest ?? 0) < 5));

	const onRun = (r: RunItem) => {
		setView({
			x0: Math.max(0, r.startA - 10),
			x1: Math.min(nA, r.startA + r.len + 10),
			y0: Math.max(0, r.startB - 10),
			y1: Math.min(nB, r.startB + r.len + 10),
		});
	};

	return (
		<div className="pe">
			{CONTROL_NOTE[p.hypothesis.id] && (
				<p className="pe-note">{CONTROL_NOTE[p.hypothesis.id]}</p>
			)}
			{chain && (
				<p className="pe-note">
					A chain: {labelA}'s group totals (across) matched to {labelB}'s cords
					(down), in {labelB}'s order. Each bracket gathers one group's cords
					into the head it equals.
				</p>
			)}
			<EvidenceStrip
				hypothesis={p.hypothesis}
				spec={p.spec}
				result={p.result}
				longest={chain ? undefined : longest}
				link={chain ? undefined : link}
				prior={prior}
				level={level}
			/>
			<div className="pe-plot">
				<PairDotplot
					a={sideA}
					b={sideB}
					spans={spans}
					dir={dir}
					threads={threads}
					ic={ic}
					blind={p.blind}
					shown={shown}
					view={view}
					onView={setView}
					selected={p.thread}
					onThread={p.onThread}
					labelA={labelA}
					labelB={labelB}
				/>
				<EvidenceList
					a={sideA}
					b={sideB}
					labelA={labelA}
					labelB={labelB}
					runs={runs}
					dir={dir}
					threads={threads}
					shown={shown}
					blind={p.blind}
					selected={p.thread}
					onThread={p.onThread}
					onRun={onRun}
				/>
			</div>
			<section className="pe-section">
				<h4>
					The weave{win ? `, ${labelA} cords ${win.from + 1}–${win.to}` : ""}
				</h4>
				{weaveGated ? (
					<p className="cell-muted">
						The weave draws scan pairs from a run of 5 up; a run of{" "}
						{longest ?? 0} is at the chance floor, so it is left out here. The
						dotplot above shows the run.
					</p>
				) : (
					<StrandWeave
						top={[a]}
						bottom={[b]}
						links={[key]}
						variant="inline"
						window={win}
						inset="auto"
						includeScan
						names={names}
						interactive={!p.blind}
						reversed={dir === "rev" ? [b] : undefined}
						threads={weaveThreads}
					/>
				)}
			</section>
			<section className="pe-section">
				<h4>Tracks</h4>
				<TrackStack
					a={sideA}
					b={sideB}
					labelA={labelA}
					labelB={labelB}
					rangeA={rangeA}
					rangeB={rangeB}
					colors={data.colors}
					threads={threads}
					shown={shown}
					blind={p.blind}
					mirrorB={dir === "rev"}
				/>
			</section>
			{!p.blind && data.ka && data.kb && data.colors && (
				<details
					className="pe-full"
					open={showFull}
					onToggle={(e) => setShowFull(e.currentTarget.open)}
				>
					<summary>
						Show both khipus
						{sel
							? ", the selected thread's cords ringed"
							: " (select a thread to ring its cords)"}
					</summary>
					{showFull && (
						<div className="pe-diagrams">
							<div className="pe-diagram">
								<h5>{labelA}</h5>
								<KhipuDiagram
									khipu={data.ka}
									colors={data.colors}
									ring={ringA}
								/>
							</div>
							<div className="pe-diagram">
								<h5>{labelB}</h5>
								<KhipuDiagram
									khipu={data.kb}
									colors={data.colors}
									ring={ringB}
								/>
							</div>
						</div>
					)}
				</details>
			)}
		</div>
	);
}

/** the KH id the claim header uses, with the catalogue name the charts know */
function both(id: string, alias?: string): string {
	return alias && alias !== id ? `${id} · ${alias}` : id;
}

/** cords [from, to) covering `cs`, padded and clamped to the khipu */
function around(cs: number[], n: number, pad = 8): [number, number] {
	return [
		Math.max(0, Math.min(...cs) - pad),
		Math.min(n, Math.max(...cs) + pad + 1),
	];
}

/** ring the cords (or named subsidiaries) a thread touches on one side */
function ringFor(
	t: StrandThread | undefined,
	side: "a" | "b",
	s: PairSide | null,
): ((c: Cord) => string | null) | undefined {
	if (!t || !s) return undefined;
	const subs = side === "a" ? t.subA : t.subB;
	const names = new Set(
		subs?.length ? subs : t[side].map((i) => s.names[i]).filter(Boolean),
	);
	return (c: Cord) => (names.has(c.name) ? "var(--accent)" : null);
}
