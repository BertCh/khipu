import { useEffect, useMemo, useRef } from "react";
import { fullSpec } from "#/lib/engine/hypothesis";
import { getHypothesis } from "#/lib/engine/registry";
import { binomUpper } from "#/lib/engine/stats";
import { type RunLogEntry, useNotebook } from "#/lib/next/notebook";
import type { LineupTrial, Spec } from "#/lib/next/types";
import "#/styles/next/engine.css";

function fmtNum(v: number | null | undefined): string {
	if (v == null || !Number.isFinite(v)) return "–";
	if (Number.isInteger(v)) return v.toLocaleString("en");
	return v.toLocaleString("en", { maximumFractionDigits: 2 });
}

function fmtP(p: number | null, R: number): string {
	if (p == null || !Number.isFinite(p)) return "–";
	if (R > 0 && p <= 1 / (R + 1) + 1e-12)
		return `< ${Number((1 / (R + 1)).toPrecision(2))}`;
	return String(Number(p.toPrecision(2)));
}

/** "key=value" for each spec entry that differs from the hypothesis default */
function specDiff(e: RunLogEntry): string {
	const p = e.provenance;
	let def: Spec | null = null;
	let R: number | null = null;
	try {
		const h = getHypothesis(p.hypothesisId);
		if (h) {
			def = fullSpec(h);
			R = h.R;
		}
	} catch {
		def = null;
	}
	const parts: string[] = [];
	for (const [k, v] of Object.entries(p.spec))
		if (!def || def[k] !== v) parts.push(`${k}=${String(v)}`);
	if (R != null && p.R !== R) parts.push(`R=${p.R}`);
	return parts.length ? parts.join(" ") : "default";
}

function Spark({ bins }: { bins?: number[] }) {
	if (!bins?.length)
		return <span className="rl-spark rl-spark-none" aria-hidden="true" />;
	const max = Math.max(1, ...bins);
	const w = 60 / bins.length;
	return (
		<svg
			className="rl-spark"
			width={60}
			height={18}
			viewBox="0 0 60 18"
			aria-hidden="true"
		>
			{bins.map((b, i) => {
				const h = (16 * b) / max;
				return (
					<rect
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed bins
						key={i}
						x={i * w + 0.5}
						y={17 - h}
						width={Math.max(0.5, w - 1)}
						height={h}
					/>
				);
			})}
		</svg>
	);
}

interface Group {
	id: string;
	label: string;
	runs: RunLogEntry[];
}

function groupRuns(runs: RunLogEntry[]): Group[] {
	const out: Group[] = [];
	const by = new Map<string, Group>();
	for (const e of runs) {
		const id = e.provenance.hypothesisId;
		let g = by.get(id);
		if (!g) {
			g = { id, label: e.label, runs: [] };
			by.set(id, g);
			out.push(g);
		}
		g.runs.push(e);
	}
	return out;
}

function trialGroups(trials: LineupTrial[]) {
	const by = new Map<string, { pair: string; k: number; n: number }>();
	for (const t of trials) {
		const g = by.get(t.pair) ?? { pair: t.pair, k: 0, n: 0 };
		g.n++;
		if (t.correct) g.k++;
		by.set(t.pair, g);
	}
	return [...by.values()];
}

function download(blob: Blob, name: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const FOCUSABLE =
	'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** The run log drawer: every run and lineup trial this browser has made. */
export default function RunLog({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const nb = useNotebook();
	const panel = useRef<HTMLDivElement>(null);
	const closeRef = useRef(onClose);
	closeRef.current = onClose;
	const groups = useMemo(() => groupRuns(nb.runs), [nb.runs]);
	const trials = useMemo(() => trialGroups(nb.trials), [nb.trials]);

	useEffect(() => {
		if (!open) return;
		const opener =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		const el = panel.current;
		el?.querySelector<HTMLElement>(".rl-close")?.focus();
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				closeRef.current();
				return;
			}
			if (e.key !== "Tab" || !el) return;
			const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
				(n) => n.offsetParent !== null,
			);
			if (!items.length) return;
			const first = items[0];
			const last = items[items.length - 1];
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			} else if (!el.contains(document.activeElement)) {
				e.preventDefault();
				first.focus();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("keydown", onKey);
			opener?.focus?.();
		};
	}, [open]);

	if (!open) return null;

	const w = nb.wealth;
	return (
		<div className="rl-root">
			<button
				type="button"
				className="rl-backdrop"
				aria-label="Close run log"
				tabIndex={-1}
				onClick={onClose}
			/>
			<div
				ref={panel}
				className="rl-drawer"
				role="dialog"
				aria-modal="true"
				aria-labelledby="rl-title"
			>
				<header className="rl-head">
					<h2 id="rl-title">Run log</h2>
					<button type="button" className="btn rl-close" onClick={onClose}>
						Close
					</button>
				</header>
				<p className="rl-note">
					Stored in this browser only; export to keep. α-wealth{" "}
					<span className="num">{w.wealth.toFixed(3)}</span> after{" "}
					<span className="num">{w.tests}</span> exploratory test
					{w.tests === 1 ? "" : "s"} (
					<span className="num">{w.rejections}</span> beat their bid).
				</p>
				<div className="rl-actions">
					<button
						type="button"
						className="btn"
						onClick={() =>
							download(
								nb.exportBundle(),
								`proving-ground-notebook-${new Date().toISOString().slice(0, 10)}.json`,
							)
						}
					>
						Export bundle
					</button>
					<button
						type="button"
						className="btn"
						disabled={!nb.runs.length && !nb.trials.length}
						onClick={() => {
							if (
								window.confirm(
									"Clear every logged run, lineup trial and the α-wealth?",
								)
							)
								nb.clear();
						}}
					>
						Clear
					</button>
				</div>

				{trials.length ? (
					<section className="rl-section" aria-label="Lineup trials">
						<h3>Lineups</h3>
						<ul className="rl-trials">
							{trials.map((t) => (
								<li key={t.pair} className="num">
									<span className="rl-mono">{t.pair.replace("|", " ↔ ")}</span>
									<span>
										{t.k} of {t.n} correct · binomial p{" "}
										{binomUpper(t.k, t.n, 1 / 20).toPrecision(2)}
									</span>
								</li>
							))}
						</ul>
					</section>
				) : null}

				<section className="rl-section" aria-label="Runs">
					<h3>
						Runs <span className="rl-count num">{nb.runs.length}</span>
					</h3>
					{groups.length === 0 ? (
						<p className="rl-empty">
							No runs yet. Open a claim or press Replicate all.
						</p>
					) : (
						groups.map((g) => (
							<div key={g.id} className="rl-group">
								<div className="rl-group-head">
									<span className="rl-group-label">{g.label}</span>
									<span className="rl-mono rl-group-id">{g.id}</span>
								</div>
								<ul className="rl-runs">
									{g.runs.map((e, i) => (
										<li
											// biome-ignore lint/suspicious/noArrayIndexKey: log order is stable
											key={`${e.key}-${e.provenance.at}-${i}`}
											className="rl-run"
										>
											<div className="rl-run-main">
												<span className="rl-spec rl-mono">{specDiff(e)}</span>
												<span className="rl-kind">
													{e.kind}
													{e.exploratory ? " · exploratory" : ""}
												</span>
											</div>
											<div className="rl-run-nums num">
												<span title="observed / chance mean">
													{fmtNum(e.observed)}
													{e.nullMean != null ? ` / ${fmtNum(e.nullMean)}` : ""}
												</span>
												<span>p {fmtP(e.p, e.provenance.R)}</span>
												<span>{fmtNum(e.provenance.ms)} ms</span>
												<span
													className="rl-hash rl-mono"
													title={`data ${e.provenance.dataHash}`}
												>
													{e.provenance.dataHash.slice(0, 6)}
												</span>
												<Spark bins={e.spark} />
											</div>
										</li>
									))}
								</ul>
							</div>
						))
					)}
				</section>
			</div>
		</div>
	);
}
