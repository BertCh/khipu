import { Conf } from "#/components/story/Story";
import { useRun } from "#/lib/engine/useEngine";
import { fmtNum, formatP } from "#/lib/next/pairdata";
import type { Hypothesis, RunResult, Spec } from "#/lib/next/types";
import type { PriorStatus } from "#/lib/stories/links";
import {
	type StrandLevel,
	type StrandLink,
	THREAD_LABEL,
	type ThreadKind,
} from "#/lib/stories/strands";
import "#/styles/next/pair.css";

const PRIOR_TEXT: Record<PriorStatus, string> = {
	published: "published before",
	catalogue: "tied in the catalogue",
	"not-found": "no prior claim found",
};

const KIND_ORDER: ThreadKind[] = [
	"exact",
	"sum",
	"scaled",
	"near",
	"blank",
	"differ",
	"dropped",
];

/** A small dot histogram of the null draws with the observed value marked. */
export function NullDots({
	nulls,
	observed,
	width = 120,
	height = 34,
}: {
	nulls: ArrayLike<number>;
	observed: number;
	width?: number;
	height?: number;
}) {
	const n = nulls.length;
	if (!n) return null;
	let lo = Number.POSITIVE_INFINITY;
	let hi = Number.NEGATIVE_INFINITY;
	for (let i = 0; i < n; i++) {
		lo = Math.min(lo, nulls[i]);
		hi = Math.max(hi, nulls[i]);
	}
	const beyond = observed > hi;
	// keep the null readable: an observed value far out sits at the edge
	const dhi = beyond
		? hi + Math.max(1e-9, hi - lo) * 0.25
		: Math.max(hi, observed);
	const dlo = Math.min(lo, observed);
	const bins = 20;
	const counts = new Array(bins).fill(0) as number[];
	const span = Math.max(1e-9, dhi - dlo);
	for (let i = 0; i < n; i++) {
		const k = Math.min(bins - 1, Math.floor(((nulls[i] - dlo) / span) * bins));
		counts[k]++;
	}
	const maxC = Math.max(...counts);
	const r = 1.4;
	const perDot = Math.max(
		1,
		Math.ceil(maxC / Math.floor((height - 4) / (2 * r))),
	);
	const bw = (width - 10) / bins;
	const ox = beyond ? width - 3 : 4 + ((observed - dlo) / span) * (width - 10);
	const dots = [];
	for (let k = 0; k < bins; k++) {
		const m = Math.ceil(counts[k] / perDot);
		for (let d = 0; d < m; d++)
			dots.push(
				<circle
					key={`${k}-${d}`}
					cx={4 + (k + 0.5) * bw}
					cy={height - 2 - r - d * 2 * r}
					r={r}
					className="es-null-dot"
				/>,
			);
	}
	return (
		<svg
			width={width}
			height={height}
			className="es-nulls"
			role="img"
			aria-label={`${n} chance draws from ${fmtNum(lo)} to ${fmtNum(hi)}; observed ${fmtNum(observed)}`}
		>
			{dots}
			{beyond && (
				<path
					d={`M${width - 12} ${height - 8}l3 -6M${width - 9} ${height - 8}l3 -6`}
					className="es-break"
				/>
			)}
			<line x1={ox} x2={ox} y1={1} y2={height - 1} className="es-obs" />
		</svg>
	);
}

export interface EvidenceStripProps {
	hypothesis: Hypothesis;
	spec: Spec;
	result?: RunResult;
	/** longest exact run of the pair, when the scan sees one */
	longest?: number;
	link?: StrandLink;
	prior?: PriorStatus;
	level?: StrandLevel;
}

/**
 * The pair's evidence at a glance: its longest run against what a shuffled
 * corpus produces, its own statistic against its own chance, agreement,
 * thread counts, prior work and the level the site records.
 */
export default function EvidenceStrip(p: EvidenceStripProps) {
	const L = p.longest ?? 0;
	const floor = useRun(
		L >= 4
			? {
					hypothesisId: "scanFloor",
					spec: { cls: "atLeast", atLeast: L },
					R: 20,
				}
			: null,
		{ priority: "batch", label: `scan floor ≥ ${L}`, audit: true },
	);
	const r = p.result;
	const statName =
		p.spec.statistic === "run"
			? "longest run"
			: p.spec.statistic === "sw"
				? "alignment score"
				: p.hypothesis.statistic;
	const kinds = new Map<ThreadKind, number>();
	for (const t of p.link?.threads ?? [])
		kinds.set(t.kind, (kinds.get(t.kind) ?? 0) + 1);
	const E = floor.result?.nullMean;
	const R = r?.provenance.R;

	return (
		<dl className="es">
			{L > 0 && (
				<div className="es-cell">
					<dt>Longest exact run</dt>
					<dd>
						<b className="es-big">{L}</b>
						<span className="es-sub">
							{floor.status === "done" && E != null ? (
								<>
									E = {fmtNum(E, 1)} pairs in a shuffled corpus reach {L}
									{floor.result
										? ` (the real corpus: ${fmtNum(floor.result.observed, 0)})`
										: ""}
								</>
							) : floor.status === "error" ? (
								"corpus floor unavailable"
							) : (
								"shuffling the corpus…"
							)}
						</span>
					</dd>
				</div>
			)}
			<div className="es-cell">
				<dt>
					{statName[0].toUpperCase()}
					{statName.slice(1)}
				</dt>
				<dd>
					{r ? (
						<>
							<b className="es-big">{fmtNum(r.observed, 1)}</b>
							{r.nulls && r.nulls.length > 0 && (
								<NullDots nulls={r.nulls} observed={r.observed} />
							)}
							<span className="es-sub">
								p {formatP(r.p, R)}
								{r.nullMean != null
									? ` · chance mean ${fmtNum(r.nullMean, 1)}`
									: ""}
								{R ? ` · R ${R.toLocaleString("en")}` : ""}
							</span>
						</>
					) : (
						<span className="es-sub">running…</span>
					)}
				</dd>
			</div>
			{p.link?.compared != null && p.link.agree != null && (
				<div className="es-cell">
					<dt>Fields that agree</dt>
					<dd>
						<b className="es-big">
							{p.link.agree} of {p.link.compared}
						</b>
						<span className="es-bar" aria-hidden="true">
							<i
								style={{
									width: `${(100 * p.link.agree) / Math.max(1, p.link.compared)}%`,
								}}
							/>
						</span>
					</dd>
				</div>
			)}
			<div className="es-cell">
				<dt>Threads</dt>
				<dd>
					{kinds.size === 0 ? (
						<span className="es-sub">none read cord by cord</span>
					) : (
						<span className="es-kinds">
							{KIND_ORDER.filter((k) => kinds.has(k)).map((k) => (
								<span key={k}>
									<i className={`pd-kind pd-kind-${k}`} />
									{kinds.get(k)} {THREAD_LABEL[k]}
								</span>
							))}
						</span>
					)}
				</dd>
			</div>
			<div className="es-cell">
				<dt>Recorded</dt>
				<dd className="es-chips">
					{p.level && p.level !== "scan" ? (
						<Conf level={p.level} />
					) : (
						<span className="es-chip">scan pair, unread</span>
					)}
					{p.prior && (
						<span className={`es-chip es-prior-${p.prior}`}>
							{PRIOR_TEXT[p.prior]}
						</span>
					)}
				</dd>
			</div>
		</dl>
	);
}
