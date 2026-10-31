import { useMemo, useState } from "react";
import GuessAxis from "#/components/matching/against-chance/GuessAxis";
import { useLiveNull } from "#/components/matching/against-chance/useLiveNull";
import NullHistogram from "#/components/matching/NullHistogram";
import type { CorpusLite } from "#/lib/next/types";

const PAIR_ID = "pair:KH0303|KH0304";

type Statistic = "sw" | "run";
type NullKind = "sequence" | "seqWithin";

const STAT_LABEL: Record<Statistic, string> = {
	sw: "tolerant alignment score",
	run: "longest exact shared run",
};

const NULL_TOGGLE_LABEL: Record<NullKind, string> = {
	sequence: "shuffled end to end",
	seqWithin: "shuffled within its own groups",
};

/** the alignment score is a float; round only how it's printed, not its value */
const formatStat = (statistic: Statistic) => (v: number) =>
	statistic === "sw" ? v.toFixed(2) : String(v);

/**
 * KH0303 fixed, KH0304 shuffled, live: the same `pair:KH0303|KH0304`
 * hypothesis `/next/proving-ground` runs, driven here directly
 * (`useLiveNull`, `src/lib/engine/tests/pair.ts`). A guess locks in before
 * any shuffle runs; the histogram then grows in real time as replicates
 * complete, chunked across frames (`src/lib/matching/against-chance/liveRun.ts`).
 */
export default function PairChance({ corpus }: { corpus: CorpusLite | null }) {
	const [statistic, setStatistic] = useState<Statistic>("sw");
	const [nullKind, setNullKind] = useState<NullKind>("sequence");
	const specOverride = useMemo(
		() => ({ statistic, null: nullKind }),
		[statistic, nullKind],
	);
	const { obs, R, nulls, running, done, run } = useLiveNull(
		PAIR_ID,
		corpus,
		specOverride,
	);
	const [guess, setGuess] = useState<number | null>(null);
	const [started, setStarted] = useState(false);

	// changing what's measured, or how B is shuffled, starts the whole thing over
	const restart = <T,>(setter: (v: T) => void, value: T) => {
		setGuess(null);
		setStarted(false);
		setter(value);
	};

	const observedValue = obs?.value;
	const domain = useMemo<[number, number]>(() => {
		if (observedValue == null) return [0, 10];
		const hi = Math.max(10, Math.ceil((observedValue * 1.3) / 5) * 5);
		return [0, hi];
	}, [observedValue]);

	return (
		<div className="ac-figure">
			<div className="ac-pair-toggles">
				<fieldset className="diagram-tools">
					<legend className="sr-only">Measure</legend>
					<span className="ac-toggle-label">Measure</span>
					{(["sw", "run"] as const).map((s) => (
						<button
							key={s}
							type="button"
							className="btn"
							aria-pressed={statistic === s}
							onClick={() => restart(setStatistic, s)}
						>
							{STAT_LABEL[s]}
						</button>
					))}
				</fieldset>
				<fieldset className="diagram-tools">
					<legend className="sr-only">Chance model</legend>
					<span className="ac-toggle-label">KH0304&rsquo;s cords</span>
					{(["sequence", "seqWithin"] as const).map((m) => (
						<button
							key={m}
							type="button"
							className="btn"
							aria-pressed={nullKind === m}
							onClick={() => restart(setNullKind, m)}
						>
							{NULL_TOGGLE_LABEL[m]}
						</button>
					))}
				</fieldset>
			</div>

			{!started ? (
				<div className="ac-guess-wrap">
					<p className="prose">
						KH0303&rsquo;s real {STAT_LABEL[statistic]} against KH0304 is below,
						but not yet shown. Click the line to mark where you think it falls
						once it is checked against {R || "a thousand"} shuffles of
						KH0304&rsquo;s cords — then reveal it.
					</p>
					<GuessAxis domain={domain} guess={guess} onGuess={setGuess} />
					<button
						type="button"
						className="btn btn-primary ac-reveal-btn"
						disabled={guess == null || !corpus}
						onClick={() => {
							setStarted(true);
							run();
						}}
					>
						Run {R || "…"} shuffles →
					</button>
				</div>
			) : (
				<>
					<GuessAxis domain={domain} guess={guess} locked />
					<div className="ac-progress-bar" aria-hidden="true">
						<div
							className="ac-progress-fill"
							style={{ width: `${R ? (nulls.length / R) * 100 : 0}%` }}
						/>
					</div>
					<p className="ac-progress-label" aria-live="polite">
						{nulls.length} / {R} shuffles
						{done ? " — done" : running ? ", shuffling…" : ""}
					</p>
					{observedValue != null && (
						<NullHistogram
							nulls={nulls}
							observed={observedValue}
							direction="upper"
							label={STAT_LABEL[statistic]}
							formatObserved={formatStat(statistic)}
						/>
					)}
				</>
			)}
		</div>
	);
}
