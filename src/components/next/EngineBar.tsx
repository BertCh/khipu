import {
	replicateAllIds,
	useEngineStatus,
	useReplicateAll,
	useVerdicts,
} from "#/lib/engine/useEngine";
import { useNotebook, variantsTotal } from "#/lib/next/notebook";
import type { Verdict } from "#/lib/next/types";
import "#/styles/next/engine.css";

const TALLY: { v: Verdict; label: string; cls: string }[] = [
	{ v: "reproduces", label: "reproduce", cls: "ok" },
	{ v: "drift", label: "drift", cls: "drift" },
	{ v: "weak", label: "weak", cls: "weak" },
	{ v: "contradicts", label: "contradict", cls: "contra" },
];

const STATE_TEXT = {
	idle: "idle",
	loading: "loading",
	ready: "ready",
	error: "error",
} as const;

/**
 * One line of engine state above the ledger: status, corpus and data hash,
 * Replicate all with its tally, the alpha-wealth meter and the run log.
 */
export default function EngineBar({ onOpenLog }: { onOpenLog: () => void }) {
	const status = useEngineStatus();
	const all = useReplicateAll();
	const verdicts = useVerdicts();
	const nb = useNotebook();

	const ids = replicateAllIds();
	const tally: Record<string, number> = {};
	for (const id of ids) {
		const v = verdicts[id]?.verdict;
		if (v) tally[v] = (tally[v] ?? 0) + 1;
	}
	const judged = ids.filter((id) => verdicts[id]).length;

	const w = nb.wealth.wealth;
	const share = Math.max(0, Math.min(1, w / 0.05));
	const low = w < 0.01;
	const running = all.status === "running";
	const [done, total] = all.progress ?? [judged, ids.length];
	const variants = variantsTotal();

	const facts: string[] = [];
	if (status.nKhipus != null)
		facts.push(`${status.nKhipus.toLocaleString("en")} khipus`);
	if (status.dataHash) facts.push(`data ${status.dataHash.slice(0, 6)}`);
	facts.push(
		status.workers
			? `${status.workers} worker${status.workers === 1 ? "" : "s"}`
			: "main thread",
	);

	return (
		<section className="engine-bar" aria-label="Engine">
			<div className="eb-group eb-status">
				<span className={`eb-dot eb-dot-${status.state}`} aria-hidden="true" />
				<span className="eb-state">{STATE_TEXT[status.state]}</span>
				<span className="eb-facts num" title={status.dataHash ?? undefined}>
					{facts.join(" · ")}
				</span>
				{status.error ? (
					<span className="eb-error" role="alert">
						{status.error}
					</span>
				) : null}
			</div>

			<div className="eb-group eb-replicate">
				<button
					type="button"
					className="btn eb-btn"
					onClick={running ? all.cancel : all.start}
					disabled={status.state === "error"}
				>
					{running ? "Cancel" : "Replicate all"}
				</button>
				<span className="eb-progress num" aria-live="polite">
					{running ? (
						<>
							<span className="eb-track" aria-hidden="true">
								<span
									className="eb-fill"
									style={{ width: `${(100 * done) / Math.max(1, total)}%` }}
								/>
							</span>
							{done}/{total}
						</>
					) : (
						`${judged}/${ids.length} tests judged`
					)}
				</span>
				<span
					className="eb-tally num"
					title="Registry tests (each claim's live test, controls included), not claims"
				>
					{TALLY.map((t) =>
						tally[t.v] ? (
							<span key={t.v} className={`eb-tally-item eb-v-${t.cls}`}>
								<span className="eb-tally-dot" aria-hidden="true" />
								{tally[t.v]} {t.label}
							</span>
						) : null,
					)}
				</span>
			</div>

			<div className="eb-group eb-alpha">
				<span
					className="eb-meter"
					title="Alpha-investing wealth: exploratory runs spend it, discoveries earn it back. Below 0.01 new exploratory findings are hard to claim."
				>
					<span className="eb-meter-label">α-wealth</span>
					<span className="eb-meter-track" aria-hidden="true">
						<span
							className={`eb-meter-fill${low ? " is-low" : ""}`}
							style={{ width: `${share * 100}%` }}
						/>
					</span>
					<span className={`eb-meter-value num${low ? " is-low" : ""}`}>
						{w.toFixed(3)}
					</span>
				</span>
				<span className="eb-runs num">
					{nb.runs.length.toLocaleString("en")} run
					{nb.runs.length === 1 ? "" : "s"} · {variants} variant
					{variants === 1 ? "" : "s"}
				</span>
				<button type="button" className="btn eb-btn" onClick={onOpenLog}>
					Run log
				</button>
			</div>
		</section>
	);
}
