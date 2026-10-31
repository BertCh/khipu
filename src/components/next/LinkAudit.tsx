import { useEffect, useMemo, useState } from "react";
import IslandFlow from "#/components/story/IslandFlow";
import { Conf } from "#/components/story/Story";
import { useBatch, useRun, useVerdicts } from "#/lib/engine/useEngine";
import {
	getColors,
	getKhipuIndex,
	getSilhouettes,
	readJson,
	type Silhouettes,
} from "#/lib/khipu/data";
import type { ColorTable } from "#/lib/khipu/types";
import { type LinkTest, linkTestOf } from "#/lib/next/linktest";
import { fmtNum, formatP } from "#/lib/next/pairdata";
import type { RunRequest, RunResult, Verdict } from "#/lib/next/types";
import {
	buildGraph,
	type Graph,
	type GraphLink,
	type Island,
	islandLabel,
	type PriorStatus,
	type ScanFile,
} from "#/lib/stories/links";
import {
	getStrands,
	type StrandFile,
	type StrandLevel,
	type StrandLink,
} from "#/lib/stories/strands";
import { NullDots } from "./EvidenceStrip";
import "#/styles/next/pair.css";

const R_AUDIT = 200;
const R_FLOOR = 20;
const R_RERUN = 1000;
/** the forest's x axis: −log10 p from 0 to 3.5 */
const X_MAX = 3.5;

type Filter = "all" | "curated" | "scan" | "candidates";

interface Loaded {
	graph: Graph;
	strands: StrandFile;
	sils: Silhouettes;
	colors: ColorTable;
}

interface Row {
	key: string;
	sl: StrandLink;
	link?: GraphLink;
	island?: Island;
	aliasA: string;
	aliasB: string;
	level: StrandLevel;
	curated: boolean;
	longest: number;
	threads: number;
	/** how the link is scored: alignment, totals → heads chain, or not at all */
	test: LinkTest;
	/** the hypothesis that scores it (none for an unscored link) */
	hid?: string;
}

const PRIOR_SHORT: Record<PriorStatus, string> = {
	published: "published",
	catalogue: "catalogue",
	"not-found": "not found",
};

const VERDICT_TEXT: Record<Verdict, string> = {
	reproduces: "holds",
	drift: "drifted",
	weak: "weak",
	contradicts: "contradicted",
	exploratory: "exploratory",
	"not-ported": "not ported",
};

const xOf = (p: number | null | undefined) =>
	p == null ? null : Math.min(X_MAX, -Math.log10(Math.max(p, 1e-12)));
const pct = (x: number) => `${(100 * x) / X_MAX}%`;

/**
 * The /network links as one lens: every strands.json link scored against its
 * own chance (the second khipu's values shuffled) and against a shuffled
 * corpus's longest runs, as a forest plot grouped by island.
 */
export default function LinkAudit(p: {
	selected?: string;
	onSelect: (pair: string | undefined) => void;
	onOpen: (pair: string) => void;
}) {
	const [data, setData] = useState<Loaded | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [filter, setFilter] = useState<Filter>("all");
	const [rerun, setRerun] = useState<string | null>(null);
	// the island context is open beside the forest, behind a disclosure on phones
	const [flowOpen, setFlowOpen] = useState(() => {
		try {
			return window.matchMedia("(min-width: 721px)").matches;
		} catch {
			return true;
		}
	});

	useEffect(() => {
		let live = true;
		Promise.all([
			getKhipuIndex(),
			readJson<ScanFile>("stories/links.json"),
			getStrands(),
			getSilhouettes(),
			getColors(),
		])
			.then(([index, scan, strands, sils, colors]) => {
				if (!strands) throw new Error("strands.json is missing");
				const graph = buildGraph(index, scan, {
					minRun: 4,
					accessions: false,
					places: false,
				});
				if (live) setData({ graph, strands, sils, colors });
			})
			.catch((e: unknown) => {
				if (live) setError(String(e));
			});
		return () => {
			live = false;
		};
	}, []);

	const rows = useMemo<Row[]>(() => {
		if (!data) return [];
		const linkById = new Map(data.graph.links.map((l) => [l.id, l]));
		const islandOf = new Map<string, Island>();
		for (const is of data.graph.islands)
			for (const l of is.links) islandOf.set(l.id, is);
		const nodeAlias = new Map(data.graph.nodes.map((n) => [n.id, n.alias]));
		return Object.entries(data.strands.links).map(([key, sl]) => {
			const level = sl.level ?? "scan";
			const link = linkById.get(key);
			const test = linkTestOf(sl.rule, sl.a, sl.b);
			const hid =
				test.kind === "chain"
					? `chain:${test.totals}>${test.heads}`
					: test.kind === "align"
						? `pair:${key}`
						: undefined;
			return {
				test,
				hid,
				key,
				sl,
				link,
				island: islandOf.get(key),
				aliasA: nodeAlias.get(sl.a) ?? sl.a,
				aliasB: nodeAlias.get(sl.b) ?? sl.b,
				level,
				curated: level !== "scan",
				longest: sl.longest ?? link?.scan?.longest ?? 0,
				threads: sl.threads.length,
			};
		});
	}, [data]);

	const reqs = useMemo<RunRequest[] | null>(() => {
		if (!rows.length) return null;
		const out: RunRequest[] = rows.flatMap((r) =>
			r.hid ? [{ hypothesisId: r.hid, R: R_AUDIT }] : [],
		);
		const Ls = [
			...new Set(rows.map((r) => r.longest).filter((L) => L >= 4)),
		].sort((x, y) => x - y);
		for (const L of Ls)
			out.push({
				hypothesisId: "scanFloor",
				spec: { cls: "atLeast", atLeast: L },
				R: R_FLOOR,
			});
		return out;
	}, [rows]);

	const batch = useBatch(reqs, { priority: "batch", audit: true });
	const verdicts = useVerdicts();
	const rerunHid = rows.find((r) => r.key === rerun)?.hid;
	const rerunRun = useRun(
		rerunHid ? { hypothesisId: rerunHid, R: R_RERUN } : null,
		{ priority: "interactive", label: `link audit rerun ${rerun ?? ""}` },
	);

	// results by pair, and the shuffled-corpus expectation by run length
	const { byPair, floorE } = useMemo(() => {
		const byPair = new Map<string, RunResult>();
		const floorE = new Map<number, number>();
		const keyOf = new Map(rows.map((r) => [r.hid, r.key]));
		for (const r of Object.values(batch.results)) {
			const id = r.provenance.hypothesisId;
			const key = keyOf.get(id);
			if (key) byPair.set(key, r);
			else if (id === "scanFloor" && r.nullMean != null)
				floorE.set(Number(r.provenance.spec.atLeast), r.nullMean);
		}
		return { byPair, floorE };
	}, [batch.results, rows]);
	const errors = batch.errors;

	const m = rows.length;
	// the Bonferroni line counts the links that are scored
	const mScored = rows.filter((r) => r.hid).length;
	const bonfX = mScored ? Math.log10(mScored / 0.05) : null;

	const isCandidate = (r: Row) => {
		const res = byPair.get(r.key);
		return !r.curated && res?.p != null && res.p < 0.01;
	};
	// biome-ignore lint/correctness/useExhaustiveDependencies: isCandidate reads byPair
	const shown = useMemo(
		() =>
			rows.filter((r) =>
				filter === "all"
					? true
					: filter === "curated"
						? r.curated
						: filter === "scan"
							? !r.curated
							: isCandidate(r),
			),
		[rows, filter, byPair],
	);

	// islands, largest first, each with its audited links
	const groups = useMemo(() => {
		if (!data) return [];
		const order = new Map(data.graph.islands.map((is, i) => [is.id, i]));
		const g = new Map<string, { island?: Island; rows: Row[] }>();
		for (const r of shown) {
			const id = r.island?.id ?? "none";
			let e = g.get(id);
			if (!e) {
				e = { island: r.island, rows: [] };
				g.set(id, e);
			}
			e.rows.push(r);
		}
		for (const e of g.values())
			e.rows.sort(
				(x, y) =>
					Number(y.curated) - Number(x.curated) ||
					y.longest - x.longest ||
					x.key.localeCompare(y.key),
			);
		return [...g.values()].sort(
			(x, y) =>
				(x.island ? (order.get(x.island.id) ?? 1e9) : 1e9) -
				(y.island ? (order.get(y.island.id) ?? 1e9) : 1e9),
		);
	}, [data, shown]);

	const selRow = rows.find((r) => r.key === p.selected);
	const done = rows.filter((r) => byPair.has(r.key)).length;
	const nUnscored = m - mScored;
	const nCand = rows.filter(isCandidate).length;

	if (error)
		return <p className="pe-note">Could not load the links: {error}</p>;
	if (!data) return <p className="cell-muted">Loading the links…</p>;

	const floorP = 1 / (R_AUDIT + 1);
	const rNeeded = bonfX ? Math.ceil(mScored / 0.05) : 0;

	return (
		<div className="la">
			<div className="la-tools">
				<div className="la-filters">
					{(
						[
							["all", `All ${m}`],
							["curated", "Curated"],
							["scan", "Scan only"],
							["candidates", `Candidates${nCand ? ` (${nCand})` : ""}`],
						] as [Filter, string][]
					).map(([f, label]) => (
						<button
							key={f}
							type="button"
							className="btn"
							aria-pressed={filter === f}
							onClick={() => setFilter(f)}
						>
							{label}
						</button>
					))}
				</div>
				<p className="la-status" aria-live="polite">
					{batch.status === "running" || done < mScored
						? `Scoring links against chance: ${done} of ${mScored}`
						: `${mScored} links scored, ${R_AUDIT} shuffles each`}
					{nUnscored > 0 ? ` · ${nUnscored} not scored by alignment` : ""}
					{Object.keys(errors).length > 0
						? ` · ${Object.keys(errors).length} could not run`
						: ""}
				</p>
			</div>
			<p className="la-lede">
				Each dot is one link's p: how often shuffling the second khipu's values
				scores as high as the real pair (further right is less likely by
				chance). A totals → heads link is scored by its chain test instead, with
				both khipus shuffled. Links whose evidence is not an ordered run of
				values (a catalogue identity, a scaling, a mirror, subsidiaries) get no
				dot; open them for their claim. E is how many pairs a scan of a shuffled
				corpus finds with a run that long anyway. With {R_AUDIT} shuffles the
				smallest p is {formatP(floorP)}, so no link can pass the Bonferroni line
				for {mScored} links (it needs about {rNeeded.toLocaleString("en")}{" "}
				shuffles); rerun a link at {R_RERUN.toLocaleString("en")} to sharpen it.
			</p>

			<div className="la-body">
				{selRow && (
					<aside className="la-context" aria-label="Selected link">
						<SelectedLink
							row={selRow}
							result={byPair.get(selRow.key)}
							rerun={rerun === selRow.key ? rerunRun : undefined}
							E={floorE.get(selRow.longest)}
							onRerun={() => setRerun(selRow.key)}
							onOpen={() => p.onOpen(selRow.key)}
							onClose={() => p.onSelect(undefined)}
						/>
						{selRow.island && (
							<details
								className="la-flow"
								open={flowOpen}
								onToggle={(e) => setFlowOpen(e.currentTarget.open)}
							>
								<summary>
									Island: {islandLabel(selRow.island)} ·{" "}
									{selRow.island.nodes.length} khipus
								</summary>
								<div className="la-flow-body">
									<IslandFlow
										island={selRow.island}
										silhouettes={data.sils}
										colors={data.colors}
										selected={selRow.key}
										onSelect={(id) => {
											if (id?.includes("|")) p.onSelect(id);
										}}
										embedded
									/>
								</div>
							</details>
						)}
					</aside>
				)}

				<div className="la-forest">
					<div className="la-row la-head">
						<span className="la-c-name">Link</span>
						<span className="la-c-rec">Recorded</span>
						<span className="la-c-plot">
							<span className="la-axis" aria-hidden="true">
								{[0, 1, 2, 3].map((t) => (
									<span key={t} className="la-tick" style={{ left: pct(t) }}>
										{t === 0 ? "p 1" : `.${"0".repeat(t - 1)}1`}
									</span>
								))}
								<span
									className="la-guide-label"
									style={{ left: pct(-Math.log10(0.05)) }}
								>
									.05
								</span>
								{bonfX != null && bonfX <= X_MAX && (
									<span
										className="la-guide-label la-guide-label-bonf"
										style={{ left: pct(bonfX) }}
									>
										Bonf.
									</span>
								)}
							</span>
							<span className="sr-only">p against chance</span>
						</span>
						<span className="la-c-num">Run</span>
						<span className="la-c-num">E</span>
						<span className="la-c-num">Threads</span>
						<span className="la-c-prior">Prior</span>
						<span className="la-c-verdict">Live</span>
					</div>
					{groups.map((g) => (
						<div key={g.island?.id ?? "none"} className="la-island">
							<div className="la-island-head">
								<span>
									{g.island ? islandLabel(g.island) : "Not in an island"}
								</span>
								<span className="cell-muted">
									{g.island ? `${g.island.nodes.length} khipus · ` : ""}
									{g.rows.length} link{g.rows.length === 1 ? "" : "s"}
								</span>
							</div>
							{g.rows.map((r) => {
								const res = byPair.get(r.key);
								const x = xOf(res?.p);
								const atFloor =
									res?.p != null && res.p <= 1 / (res.provenance.R + 1) + 1e-12;
								const v = r.hid ? verdicts[r.hid] : undefined;
								const unscored = r.test.kind === "none";
								const E = floorE.get(r.longest);
								const kind = r.link?.kind ?? "passage";
								const prior = r.curated
									? (r.link?.prior?.status ?? "not-found")
									: undefined;
								const cand = isCandidate(r);
								const pLabel = unscored
									? "not scored"
									: res
										? `${r.test.kind === "chain" ? "chain " : ""}p ${formatP(res.p, res.provenance.R)}`
										: Object.keys(errors).some((k) => k.startsWith(`${r.hid}@`))
											? "error"
											: "running";
								return (
									<button
										key={r.key}
										type="button"
										className={`la-row${p.selected === r.key ? " is-selected" : ""}`}
										aria-pressed={p.selected === r.key}
										aria-label={`${r.aliasA} and ${r.aliasB}: ${r.level}, ${pLabel}, longest run ${r.longest || "none"}, ${r.threads} threads`}
										onClick={() =>
											p.onSelect(p.selected === r.key ? undefined : r.key)
										}
									>
										<span className="la-c-name">
											<b>
												{r.aliasA} ↔ {r.aliasB}
											</b>
											{cand && (
												<span className="la-cand">
													candidate: no reading yet
												</span>
											)}
										</span>
										<span className="la-c-rec">
											<span
												className={`la-kind network-kind-${kind}`}
												title={kind}
											>
												<i />
											</span>
											{r.level === "scan" ? (
												<span className="conf conf-open la-scan">scan</span>
											) : (
												<Conf level={r.level} />
											)}
										</span>
										<span
											className={`la-c-plot${unscored ? " is-unscored" : ""}`}
										>
											{unscored && (
												<span className="la-unscored">
													not scored by alignment; see claim
												</span>
											)}
											<span
												className="la-guide"
												style={{ left: pct(-Math.log10(0.05)) }}
											/>
											<span
												className="la-guide la-guide-strong"
												style={{ left: pct(2) }}
											/>
											{bonfX != null && bonfX <= X_MAX && (
												<span
													className="la-guide la-guide-bonf"
													style={{ left: pct(bonfX) }}
												/>
											)}
											{x != null && (
												<span
													className={`la-dot${atFloor ? " la-dot-floor" : ""}${res && res.p != null && res.p < 0.01 ? " la-dot-strong" : ""}`}
													style={{ left: pct(x) }}
												/>
											)}
											{atFloor && x != null && (
												<span className="la-floor" style={{ left: pct(x) }}>
													≥
												</span>
											)}
										</span>
										<span className="la-c-num">{r.longest || "—"}</span>
										<span
											className="la-c-num"
											title={
												E != null
													? `pairs a shuffled corpus finds with a run of ${r.longest} or more`
													: undefined
											}
										>
											{r.longest >= 4 ? fmtNum(E, 1) : "—"}
										</span>
										<span className="la-c-num">{r.threads || "—"}</span>
										<span className="la-c-prior">
											{prior ? PRIOR_SHORT[prior] : "unchecked"}
										</span>
										<span className="la-c-meta">
											run {r.longest || "—"}
											{r.longest >= 4 ? ` · E ${fmtNum(E, 1)}` : ""} ·{" "}
											{r.threads} threads · prior{" "}
											{prior ? PRIOR_SHORT[prior] : "unchecked"}
										</span>
										<span
											className={`la-c-verdict la-v-${v?.verdict ?? "none"}`}
										>
											{unscored
												? "see claim"
												: v
													? VERDICT_TEXT[v.verdict]
													: res?.p != null
														? res.p < 0.01
															? "beats chance"
															: res.p < 0.05
																? "weak"
																: "at chance"
														: "—"}
											<small className="la-pline">{pLabel}</small>
										</span>
									</button>
								);
							})}
						</div>
					))}
					<div className="la-foot">
						<span className="la-key">
							<i className="la-guide-k" /> p = .05{" "}
							<i className="la-guide-k la-guide-strong" /> p = .01{" "}
							<i className="la-guide-k la-guide-bonf" /> Bonferroni .05/
							{mScored}
							{bonfX != null && bonfX > X_MAX ? " (off the axis)" : ""} ·{" "}
							<span className="la-floor-k">≥</span> at the floor of {R_AUDIT}{" "}
							shuffles
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

function SelectedLink({
	row,
	result,
	rerun,
	E,
	onRerun,
	onOpen,
	onClose,
}: {
	row: Row;
	result?: RunResult;
	rerun?: ReturnType<typeof useRun>;
	E?: number;
	onRerun: () => void;
	onOpen: () => void;
	onClose: () => void;
}) {
	const best = rerun?.result ?? result;
	return (
		<div className="la-sel">
			<div className="la-sel-head">
				<h3>
					{row.aliasA} ↔ {row.aliasB}
				</h3>
				<button
					type="button"
					className="btn la-close"
					onClick={onClose}
					aria-label="Clear selection"
				>
					×
				</button>
			</div>
			<p className="la-sel-note">{row.link?.note ?? row.sl.rule}</p>
			<dl className="la-sel-stats">
				<div>
					<dt>
						{row.test.kind === "chain"
							? "p of the chain against chance"
							: "p against chance"}
					</dt>
					<dd>
						{row.test.kind === "none" ? (
							<span className="cell-muted">not scored: {row.test.why}</span>
						) : best ? (
							<>
								{formatP(best.p, best.provenance.R)}{" "}
								<span className="cell-muted">
									(R {best.provenance.R.toLocaleString("en")})
								</span>
							</>
						) : (
							"running…"
						)}
					</dd>
				</div>
				{best?.nulls && best.nulls.length > 0 && (
					<div>
						<dt>Chance draws</dt>
						<dd>
							<NullDots nulls={best.nulls} observed={best.observed} />
						</dd>
					</div>
				)}
				<div>
					<dt>Longest run · E</dt>
					<dd>
						{row.longest || "—"} · {row.longest >= 4 ? fmtNum(E, 1) : "—"}
					</dd>
				</div>
				<div>
					<dt>Threads</dt>
					<dd>
						{row.threads}
						{row.sl.compared != null
							? ` · ${row.sl.agree} of ${row.sl.compared} fields agree`
							: ""}
					</dd>
				</div>
			</dl>
			<div className="la-sel-actions">
				<button type="button" className="btn" onClick={onOpen}>
					Open evidence
				</button>
				<button
					type="button"
					className="btn"
					onClick={onRerun}
					disabled={rerun?.status === "running" || row.test.kind === "none"}
				>
					{rerun?.status === "running"
						? `Rerunning… ${rerun.progress ? Math.round((100 * rerun.progress[0]) / Math.max(1, rerun.progress[1])) : 0}%`
						: rerun?.status === "done"
							? `Rerun at R ${R_RERUN.toLocaleString("en")}: done`
							: `Rerun at R ${R_RERUN.toLocaleString("en")}`}
				</button>
			</div>
		</div>
	);
}
