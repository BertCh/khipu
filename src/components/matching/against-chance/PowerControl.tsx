import { useState } from "react";
import { useLiveNull } from "#/components/matching/against-chance/useLiveNull";
import NullHistogram from "#/components/matching/NullHistogram";
import type { CorpusLite } from "#/lib/next/types";

/** both controls score with align.ts's float alignment score — round only how it's printed */
const formatScore = (v: number) => v.toFixed(2);

/**
 * The project's own positive/negative control
 * (`src/lib/engine/tests/controls.ts`), run live: KH0097 against a seeded
 * full shuffle of KH0586 (no real signal — the test must find nothing), and
 * the same shuffle with the pair's longest shared run written back in at its
 * place (the test must find it). Both use the registry's own
 * `decoyPair`/`plantedCopy` hypotheses, so the p-values match what
 * `/next/proving-ground` reports for the same claims at the default seed.
 */
export default function PowerControl({
	corpus,
}: {
	corpus: CorpusLite | null;
}) {
	const decoy = useLiveNull("decoyPair", corpus);
	const planted = useLiveNull("plantedCopy", corpus);
	const [started, setStarted] = useState(false);

	const bothDone = decoy.done && planted.done;
	const n = Math.max(decoy.nulls.length, planted.nulls.length);
	const total = Math.max(decoy.R, planted.R);

	return (
		<div className="ac-figure ac-power">
			{!started ? (
				<button
					type="button"
					className="btn btn-primary ac-reveal-btn"
					disabled={!corpus}
					onClick={() => {
						setStarted(true);
						decoy.run();
						planted.run();
					}}
				>
					Run both controls ({decoy.R || "…"} shuffles each) →
				</button>
			) : (
				<>
					<p className="ac-progress-label" aria-live="polite">
						{n} / {total} shuffles{bothDone ? " — done" : ", shuffling…"}
					</p>
					<div className="ac-control-grid">
						<div className="ac-control-card">
							<h4>Decoy — no real match</h4>
							{decoy.obs && (
								<NullHistogram
									nulls={decoy.nulls}
									observed={decoy.obs.value}
									direction="upper"
									label="decoy score"
									formatObserved={formatScore}
								/>
							)}
							<p className="muted">
								KH0097 against a full, seeded shuffle of KH0586 — whatever the
								two once shared is gone.
							</p>
						</div>
						<div className="ac-control-card">
							<h4>Planted — the run written back in</h4>
							{planted.obs && (
								<NullHistogram
									nulls={planted.nulls}
									observed={planted.obs.value}
									direction="upper"
									label="planted score"
									formatObserved={formatScore}
								/>
							)}
							<p className="muted">
								The same shuffle, with the pair&rsquo;s longest shared run
								spliced back at its place before anything else moved.
							</p>
						</div>
					</div>
				</>
			)}
		</div>
	);
}
