import { Link } from "@tanstack/react-router";
import {
	type KeyboardEvent,
	type ReactNode,
	useMemo,
	useRef,
	useState,
} from "react";
import { Certainty, KIND_TEXT } from "#/components/next/EvidenceLedger";
import HitStrip from "#/components/next/HitStrip";
import Lineup from "#/components/next/Lineup";
import NullPanel, { fmtNum } from "#/components/next/NullPanel";
import PairEvidence from "#/components/next/PairEvidence";
import ProvenanceCard from "#/components/next/ProvenanceCard";
import SpecCurve from "#/components/next/SpecCurve";
import StatusChip from "#/components/next/StatusChip";
import {
	DEFAULT_SEED,
	fullSpec,
	isDefaultSpec,
	parseSpecKey,
	specKey,
} from "#/lib/engine/hypothesis";
import { getHypothesis, unjudgedWhy } from "#/lib/engine/registry";
import { useRun, useVerdicts } from "#/lib/engine/useEngine";
import {
	certainty,
	claimPairs,
	claimVerdict,
	DOWNGRADE_TEXT,
	hypothesisFor,
	liveLabel,
} from "#/lib/next/claims";
import { logTrial } from "#/lib/next/notebook";
import type { PGSearch, PGTab } from "#/lib/next/search";
import type { Claim, Hypothesis, RunResult, Spec } from "#/lib/next/types";
import { pairKey } from "#/lib/stories/links";
import type { StrandFile } from "#/lib/stories/strands";

/**
 * One claim, opened: what was said, what the engine finds now, and five
 * tabs on the test — its chance model, its robustness across choices, the
 * evidence itself, a blind lineup, and the provenance to cite it by.
 */

interface Props {
	claim: Claim;
	/** every claim, to name a successor or predecessor */
	claims: Claim[];
	search: PGSearch;
	onSearch: (patch: Partial<PGSearch>, opts?: { replace?: boolean }) => void;
	/** strands.json, to find the other pairs a multi-pair claim covers */
	strands?: StrandFile;
}

const TABS: { key: PGTab; label: string }[] = [
	{ key: "null", label: "Null" },
	{ key: "spec", label: "Robustness" },
	{ key: "evidence", label: "Evidence" },
	{ key: "lineup", label: "Lineup" },
	{ key: "provenance", label: "Provenance" },
];

function safeHypothesis(c: Claim): Hypothesis | undefined {
	try {
		return hypothesisFor(c);
	} catch {
		return undefined;
	}
}

function isPairLike(h: Hypothesis): boolean {
	return (
		h.scope === "pair" || h.id.startsWith("pair:") || h.id.startsWith("chain:")
	);
}

export default function ClaimView({
	claim,
	claims,
	search,
	onSearch,
	strands,
}: Props) {
	const h = useMemo(() => safeHypothesis(claim), [claim]);
	const verdicts = useVerdicts();
	const v = claimVerdict(claim, verdicts);
	const live = liveLabel(claim, v);
	// a hypothesis with no expectation for this claim: say why it is not judged
	const why = h && !h.expected ? unjudgedWhy(h) : undefined;
	const cert = certainty(claim, v);

	const parsed = useMemo(
		() => (h && search.spec ? parseSpecKey(search.spec, h) : undefined),
		[h, search.spec],
	);
	const spec: Spec = useMemo(() => (h ? fullSpec(h, parsed) : {}), [h, parsed]);
	const R = search.R ?? h?.R ?? 0;
	const seed = search.seed ?? DEFAULT_SEED;
	const exploratory =
		!!h &&
		(!isDefaultSpec(h, spec) ||
			(search.R != null && search.R !== h.R) ||
			(search.seed != null && search.seed !== DEFAULT_SEED));

	// heavy tests wait for a click; the click is a trigger, not state to cite
	const runKey = h ? `${h.id}|${search.spec ?? ""}|${R}|${seed}` : "";
	const [started, setStarted] = useState<string | null>(null);
	const go = !!h && (h.cost !== "heavy" || started === runKey);
	const run = useRun(
		go && h
			? {
					hypothesisId: h.id,
					spec: parsed,
					R: search.R,
					seed: search.seed,
				}
			: null,
		{ priority: "interactive", label: h?.label, hypothesis: h },
	);

	const pair = h && isPairLike(h) ? pairOf(h, claim) : undefined;
	const pairs = useMemo(
		() => claimPairs(claim, h, strands),
		[claim, h, strands],
	);
	const reasons: Partial<Record<PGTab, string>> = {};
	const noRepro = `Not reproducible here: ${claim.repro}${claim.script ? ` · ${claim.script}` : ""}`;
	if (!h) {
		reasons.null = noRepro;
		reasons.spec = noRepro;
		reasons.evidence = noRepro;
		reasons.lineup = noRepro;
	} else {
		if (h.axes.length === 0) reasons.spec = "This test has no choices to vary";
		if (!pair || !h.lineup) reasons.lineup = "A lineup needs a pair of khipus";
	}
	const wanted = search.tab ?? (h ? "null" : "provenance");
	const tab: PGTab = reasons[wanted] ? (h ? "null" : "provenance") : wanted;
	const enabled = TABS.filter((t) => !reasons[t.key]).map((t) => t.key);

	const tabRefs = useRef<Partial<Record<PGTab, HTMLButtonElement | null>>>({});
	const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
		const i = enabled.indexOf(tab);
		let next: PGTab | undefined;
		if (e.key === "ArrowRight") next = enabled[(i + 1) % enabled.length];
		else if (e.key === "ArrowLeft")
			next = enabled[(i - 1 + enabled.length) % enabled.length];
		else if (e.key === "Home") next = enabled[0];
		else if (e.key === "End") next = enabled[enabled.length - 1];
		if (!next) return;
		e.preventDefault();
		onSearch({ tab: next });
		tabRefs.current[next]?.focus();
	};

	const setSpec = (s: Spec) => {
		if (!h) return;
		onSearch({ spec: isDefaultSpec(h, s) ? undefined : specKey(s) });
	};
	const setRun = (r: number, sd: number) => {
		if (!h) return;
		onSearch({
			R: r === h.R ? undefined : r,
			seed: sd === DEFAULT_SEED ? undefined : sd,
		});
	};
	const byId = (id: string) => claims.find((c) => c.id === id);
	const successor = claim.supersededBy ? byId(claim.supersededBy) : undefined;
	const predecessor = claim.supersedes ? byId(claim.supersedes) : undefined;

	return (
		<article className="claim-view" aria-labelledby="claim-statement">
			<header className="claim-head">
				<p className="claim-kicker">
					<span className="claim-id">{claim.id}</span>
					<span>{KIND_TEXT[claim.kind]}</span>
					{claim.control && <span>{claim.control} control</span>}
					{claim.story && (
						<a href={claim.story} className="claim-story">
							story <span aria-hidden="true">↗</span>
						</a>
					)}
				</p>
				<h2
					id="claim-statement"
					className={`claim-statement${claim.supersededBy ? " is-superseded" : ""}`}
				>
					{claim.statement}
				</h2>
				{claim.khipus.length > 0 && (
					<p className="claim-khipus">
						{claim.khipus.map((k) => (
							<Link key={k} to="/khipus/$id" params={{ id: k }}>
								{k}
							</Link>
						))}
					</p>
				)}
				<div className="claim-status-row">
					<span className="claim-status-pair">
						<span className="claim-status-label">Recorded</span>
						<StatusChip status={claim.status} />
					</span>
					<span className="claim-status-pair">
						<span className="claim-status-label">Live</span>
						<StatusChip live={live} title={v?.note} />
					</span>
					<span className="claim-status-pair">
						<span className="claim-status-label">Certainty</span>
						<Certainty claim={claim} value={cert} />
					</span>
				</div>
				{(v?.note ?? why) && (
					<p className="claim-note">
						{v?.note && v.verdict !== "exploratory" ? v.note : why}
					</p>
				)}
				{claim.downgrades.length > 0 && (
					<p className="claim-downgrades">
						{claim.downgrades.map((d) => (
							<span
								key={d}
								className="downgrade-chip"
								title={DOWNGRADE_TEXT[d]}
							>
								{DOWNGRADE_TEXT[d]}
							</span>
						))}
					</p>
				)}
				<dl className="claim-facts">
					{claim.numbers && claim.numbers !== "—" && (
						<Fact term="Numbers">{claim.numbers}</Fact>
					)}
					{claim.test && <Fact term="Test">{claim.test}</Fact>}
					{claim.prior && <Fact term="Prior work">{claim.prior}</Fact>}
					{claim.confounds && <Fact term="Confounds">{claim.confounds}</Fact>}
					{claim.supersededBy && (
						<Fact term="Superseded by">
							<button
								type="button"
								className="linkish"
								onClick={() => onSearch({ claim: claim.supersededBy })}
							>
								→ {successor?.statement ?? claim.supersededBy}
							</button>
						</Fact>
					)}
					{claim.supersedes && (
						<Fact term="Supersedes">
							<button
								type="button"
								className="linkish"
								onClick={() => onSearch({ claim: claim.supersedes })}
							>
								{predecessor?.statement ?? claim.supersedes}
							</button>
						</Fact>
					)}
				</dl>
			</header>

			{!h && (
				<div className="claim-norepro" role="note">
					<strong>Not reproducible here.</strong>{" "}
					{claim.repro === "script"
						? "It was established by a script that needs data this page does not carry"
						: claim.repro === "manual"
							? "It was checked by hand"
							: claim.repro === "scratchpad"
								? "It came from a one-off survey"
								: claim.repro === "constant"
									? "It rests on a constant in the site's code"
									: "No test of it can run in the browser"}
					{claim.script ? (
						<>
							: <code>{claim.script}</code>
						</>
					) : null}
					. It stays in the ledger with its recorded status.
				</div>
			)}

			<div
				className="claim-tabs"
				role="tablist"
				aria-label="Claim analysis"
				onKeyDown={onTabKey}
			>
				{TABS.map((t) => {
					const reason = reasons[t.key];
					return (
						<button
							key={t.key}
							ref={(el) => {
								tabRefs.current[t.key] = el;
							}}
							type="button"
							role="tab"
							id={`claim-tab-${t.key}`}
							aria-controls="claim-tabpanel"
							aria-selected={tab === t.key}
							aria-disabled={reason ? true : undefined}
							tabIndex={tab === t.key ? 0 : -1}
							title={reason}
							className="claim-tab"
							onClick={() => !reason && onSearch({ tab: t.key })}
						>
							{t.label}
						</button>
					);
				})}
			</div>

			<div
				className="claim-tabpanel"
				role="tabpanel"
				id="claim-tabpanel"
				aria-labelledby={`claim-tab-${tab}`}
			>
				{tab === "null" && h && (
					<NullPanel
						hypothesis={h}
						spec={spec}
						run={run}
						R={R}
						seed={seed}
						exploratory={exploratory}
						onSpec={setSpec}
						onRun={setRun}
						waiting={!go}
						onStart={() => setStarted(runKey)}
					/>
				)}
				{tab === "spec" && h && (
					<SpecCurve
						hypothesis={h}
						pinned={search.spec ? specKey(spec) : undefined}
						onPick={setSpec}
					/>
				)}
				{tab === "evidence" && h && (
					<>
						{pairs.length > 1 && (
							<PairPicker
								pairs={pairs}
								value={
									search.pair && pairs.includes(search.pair)
										? search.pair
										: pairs[0]
								}
								onPick={(k) =>
									onSearch(
										{ pair: k === pairs[0] ? undefined : k, thread: undefined },
										{ replace: true },
									)
								}
							/>
						)}
						{pairs.length > 1 &&
						search.pair &&
						search.pair !== pairs[0] &&
						pairs.includes(search.pair) ? (
							<OtherPair
								key={search.pair}
								pair={search.pair}
								search={search}
								onSearch={onSearch}
							/>
						) : (
							<Evidence
								h={h}
								pair={pair}
								spec={spec}
								result={run.result}
								status={run.status}
								search={search}
								onSearch={onSearch}
							/>
						)}
					</>
				)}
				{tab === "lineup" && h && pair && (
					<div className="claim-lineup">
						<Lineup
							pair={pair}
							spec={spec}
							seed={search.seed ?? DEFAULT_SEED}
							onTrial={logTrial}
						/>
					</div>
				)}
				{tab === "provenance" && (
					<ProvenanceCard claim={claim} hypothesis={h} result={run.result} />
				)}
			</div>
		</article>
	);
}

/** a segmented control over the pairs a multi-pair claim covers */
function PairPicker({
	pairs,
	value,
	onPick,
}: {
	pairs: string[];
	value: string;
	onPick: (pair: string) => void;
}) {
	return (
		<fieldset className="claim-pairs">
			<legend>Pair</legend>
			{pairs.map((k) => (
				<button
					key={k}
					type="button"
					className="btn btn-chip"
					aria-pressed={k === value}
					onClick={() => onPick(k)}
				>
					{k.replace("|", " ↔ ")}
				</button>
			))}
		</fieldset>
	);
}

/**
 * Another pair of a multi-pair claim: its own default alignment run, shown
 * as evidence only (the claim is judged on its first pair).
 */
function OtherPair({
	pair,
	search,
	onSearch,
}: {
	pair: string;
	search: PGSearch;
	onSearch: Props["onSearch"];
}) {
	const h = useMemo(() => getHypothesis(`pair:${pair}`), [pair]);
	const run = useRun(h ? { hypothesisId: h.id } : null, {
		priority: "interactive",
		label: h?.label,
		audit: true,
	});
	if (!h) return <p className="claim-tab-intro">Unknown pair {pair}.</p>;
	return (
		<Evidence
			h={h}
			pair={pair}
			spec={fullSpec(h)}
			result={run.result}
			status={run.status}
			search={search}
			onSearch={onSearch}
		/>
	);
}

function pairOf(h: Hypothesis, claim: Claim): string | undefined {
	const ids = h.ids ?? claim.khipus;
	if (ids.length < 2) return claim.pair;
	return pairKey(ids[0], ids[1]);
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
	return (
		<div>
			<dt>{term}</dt>
			<dd>{children}</dd>
		</div>
	);
}

function Evidence({
	h,
	pair,
	spec,
	result,
	status,
	search,
	onSearch,
}: {
	h: Hypothesis;
	pair?: string;
	spec: Spec;
	result?: RunResult;
	status: string;
	search: PGSearch;
	onSearch: Props["onSearch"];
}) {
	if (pair)
		return (
			<PairEvidence
				pair={pair}
				hypothesis={h}
				spec={spec}
				result={result}
				thread={search.thread}
				onThread={(k) => onSearch({ thread: k }, { replace: true })}
				blind={search.blind}
			/>
		);
	if (!result)
		return (
			<p className="claim-tab-intro">
				{status === "running"
					? "Running; the evidence appears when the observed value is in."
					: h.cost === "heavy"
						? "Run the test on the Null tab to see where its hits fall."
						: "Waiting for the engine…"}
			</p>
		);
	const analyticOrNone = !result.nulls && !result.units;
	return (
		<div className="claim-evidence">
			{analyticOrNone && <ExpectedTable h={h} result={result} />}
			{result.obs.hits.length > 0 && (
				<HitStrip result={result} hypothesis={h} />
			)}
		</div>
	);
}

function ExpectedTable({ h, result }: { h: Hypothesis; result: RunResult }) {
	const e = h.expected;
	return (
		<table className="data-table null-count-table">
			<thead>
				<tr>
					<th />
					<th className="num">Now</th>
					<th className="num">Recorded</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td>Observed</td>
					<td className="num">{fmtNum(result.observed, 3)}</td>
					<td className="num">{e?.value != null ? fmtNum(e.value, 3) : "—"}</td>
				</tr>
				{result.nullMean != null && (
					<tr>
						<td>Chance expects</td>
						<td className="num">
							{fmtNum(result.nullMean, 1)}
							{result.nullSd != null ? ` ± ${fmtNum(result.nullSd, 1)}` : ""}
						</td>
						<td className="num">
							{e?.nullMean != null ? fmtNum(e.nullMean, 1) : "—"}
						</td>
					</tr>
				)}
			</tbody>
		</table>
	);
}
