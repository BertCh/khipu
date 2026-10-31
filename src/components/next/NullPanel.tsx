import { bin, max as d3max, min as d3min, range as d3range } from "d3";
import { useEffect, useMemo, useState } from "react";
import DotRows, { type DotRow } from "#/components/charts/DotRows";
import { useMeasure } from "#/components/charts/useMeasure";
import { formatP } from "#/components/next/EvidenceLedger";
import { NULL_BLURB, NULL_LABEL } from "#/lib/engine/nulls";
import { alphaInvest } from "#/lib/engine/stats";
import type { RunState } from "#/lib/engine/useEngine";
import { useNotebook } from "#/lib/next/notebook";
import type {
	Expected,
	Hypothesis,
	NullModel,
	RunResult,
	Spec,
	SpecValue,
} from "#/lib/next/types";

/**
 * What chance does, drawn: the replicate histogram (or the analytic curve,
 * or the per-unit counts) with the observed value, the recorded chance level
 * as a ghost, the readout, the named null, and the controls that change it.
 */

export interface NullPanelProps {
	hypothesis: Hypothesis;
	/** the full spec in force */
	spec: Spec;
	run: RunState;
	R: number;
	seed: number;
	exploratory: boolean;
	onSpec: (spec: Spec) => void;
	onRun: (R: number, seed: number) => void;
	/** heavy hypotheses wait for a click */
	onStart?: () => void;
	waiting?: boolean;
}

const R_OPTIONS = [100, 200, 500, 1000, 2000, 5000];

/** blurbs for the chance models a single test defines for itself */
const NULL_TEXT: Record<string, string> = {
	"chain:both":
		"The pendant values of both khipus are shuffled, and the group totals are summed again from the shuffled totals khipu, so chance must produce the matching values themselves, not just their order.",
	"chain:values":
		"Only the heads khipu's pendant values are shuffled; the totals stay. Every matching value survives, so this tests only whether the matches keep their order.",
	"chain:within":
		"The heads khipu's pendant values are shuffled within their groups; the totals stay. Like the order-only shuffle, it tests the order of the matches, not their existence.",
	direction:
		"Each top cord that totals exactly one of the compared groups is, by chance, as likely to total any of them: a sign test between the group before and the group after.",
	pooled:
		"Each top cord's value is replaced by one drawn from the top cords of the other khipus. Every direction beats this, so it shows only that top cords total some neighbouring group.",
};
const CONTROL_KEYS = new Set(["null", "valueSource", "statistic"]);

export function fmtNum(v: number | null | undefined, digits?: number): string {
	if (v == null || !Number.isFinite(v)) return "—";
	const d = digits ?? (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2);
	return v.toLocaleString("en", { maximumFractionDigits: d });
}

function isNullModel(v: SpecValue | undefined): v is NullModel {
	return typeof v === "string" && v in NULL_LABEL;
}

type Shape = "replicate" | "analytic" | "units" | "none";

function shapeOf(r: RunResult): Shape {
	if (r.nulls && r.nulls.length > 0) return "replicate";
	if (r.units && r.units.length > 0) return "units";
	if (r.nullMean != null && r.nullSd != null) return "analytic";
	return "none";
}

/** a test's own name for a chance model that is not one of the shared ones */
function axisNullLabel(h: Hypothesis | undefined, v: SpecValue | undefined) {
	const ax = h?.axes.find((a) => a.key === "null");
	const o = ax?.options.find((x) => x.value === v);
	return o ? o.label.charAt(0).toLowerCase() + o.label.slice(1) : undefined;
}

export function nullName(spec: Spec, shape?: Shape, h?: Hypothesis): string {
	// a chain's "values"/"within" are heads-only shuffles: use the test's words
	const own = axisNullLabel(h, spec.null);
	if (own && (h?.id.startsWith("chain:") || !isNullModel(spec.null)))
		return own;
	if (isNullModel(spec.null)) return NULL_LABEL[spec.null];
	if (shape === "analytic") return "analytic expectation";
	if (shape === "units") return "values shuffled within each khipu";
	return "no null: a count";
}

export default function NullPanel(p: NullPanelProps) {
	const { hypothesis: h, spec, run } = p;
	const { wealth } = useNotebook();
	const result = run.result;
	const shape = result ? shapeOf(result) : undefined;
	const bid = alphaInvest(wealth, 1).bid;
	const nm = spec.null;

	return (
		<div className="null-panel">
			<div className="null-main">
				<div className="null-figure">
					{result ? (
						shape === "replicate" && result.nulls ? (
							<NullHistogram
								nulls={result.nulls}
								observed={result.observed}
								expected={h.expected}
								R={result.provenance.R}
							/>
						) : shape === "analytic" ? (
							<NullHistogram
								analytic={{
									mean: result.nullMean ?? 0,
									sd: result.nullSd ?? 0,
								}}
								observed={result.observed}
								expected={h.expected}
							/>
						) : shape === "units" ? (
							<UnitCounts result={result} expected={h.expected} />
						) : (
							<CountRows result={result} expected={h.expected} />
						)
					) : (
						<div className="null-placeholder">
							{p.waiting ? (
								<>
									<p>
										This test is heavy: it runs up to a thousand shuffles for
										every khipu, so it waits for you.
									</p>
									<button
										type="button"
										className="btn btn-primary"
										onClick={p.onStart}
									>
										Run ({h.id === "profileCounts" ? "≈4 s" : "≈10 s"} pooled)
									</button>
								</>
							) : run.status === "error" ? (
								<>
									<p className="null-error">Run failed: {run.error}</p>
									<button type="button" className="btn" onClick={run.rerun}>
										Try again
									</button>
								</>
							) : run.status === "cancelled" ? (
								<>
									<p>The run was cancelled.</p>
									<button
										type="button"
										className="btn btn-primary"
										onClick={run.rerun}
									>
										Run again
									</button>
								</>
							) : (
								<p>
									{run.status === "running"
										? "Running against chance…"
										: "Waiting for the engine…"}
								</p>
							)}
						</div>
					)}
					{run.status === "running" && (
						<Progress progress={run.progress} onCancel={run.cancel} />
					)}
				</div>

				{result && (
					<>
						<p className="null-sentence">{sentence(h, spec, result, shape)}</p>
						<dl className="null-readout">
							<div>
								<dt>p</dt>
								<dd>
									{formatP(
										result.p,
										result.nulls ? result.provenance.R : undefined,
									)}
								</dd>
							</div>
							<div>
								<dt>z</dt>
								<dd>{fmtNum(result.z, 1)}</dd>
							</div>
							<div>
								<dt>R</dt>
								<dd>{result.provenance.R.toLocaleString("en")}</dd>
							</div>
							<div>
								<dt>seed</dt>
								<dd>{result.provenance.seed}</dd>
							</div>
							<div>
								<dt>ms</dt>
								<dd>{Math.round(result.provenance.ms).toLocaleString("en")}</dd>
							</div>
						</dl>
					</>
				)}
			</div>

			<aside className="null-side">
				<div className="null-card">
					<h4>Chance model</h4>
					<p className="null-card-name">{nullName(spec, shape, h)}</p>
					{NULL_TEXT[h.id.startsWith("chain:") ? `chain:${nm}` : String(nm)] ? (
						<p>
							{
								NULL_TEXT[
									h.id.startsWith("chain:") ? `chain:${nm}` : String(nm)
								]
							}
						</p>
					) : (
						isNullModel(nm) && <p>{NULL_BLURB[nm]}</p>
					)}
					<p className="null-card-stat">
						Statistic: <span>{h.statistic}</span>
					</p>
				</div>
				<Controls
					{...p}
					bid={bid}
					canResample={shape !== "analytic" && shape !== "none"}
				/>
			</aside>
		</div>
	);
}

function sentence(
	h: Hypothesis,
	spec: Spec,
	r: RunResult,
	shape: Shape | undefined,
): string {
	const obs = fmtNum(r.observed);
	if (shape === "replicate" && r.nulls) {
		const mx = d3max(r.nulls) ?? 0;
		return `${obs} ${h.statistic}; in ${r.provenance.R.toLocaleString("en")} runs of chance (${nullName(spec, shape, h)}), mean ${fmtNum(r.nullMean, 1)}, max ${fmtNum(mx)}; p ${formatP(r.p, r.provenance.R)}.`;
	}
	if (shape === "analytic")
		return `${obs} ${h.statistic}; chance expects ${fmtNum(r.nullMean, 1)} ± ${fmtNum(r.nullSd, 1)} (analytic); p ${formatP(r.p)}.`;
	if (shape === "units") {
		const n = r.units?.length ?? 0;
		return `${obs} ${h.statistic}, from ${n.toLocaleString("en")} khipus each tested against its own shuffles.`;
	}
	return `${obs} ${h.statistic}. This is a count with no chance model; it is checked against the recorded value.`;
}

function Progress({
	progress,
	onCancel,
}: {
	progress: [number, number] | null;
	onCancel: () => void;
}) {
	const [done, total] = progress ?? [0, 0];
	const pct = total > 0 ? Math.round((done / total) * 100) : 0;
	return (
		<div className="null-progress">
			<progress max={total || 1} value={done} aria-label={`Progress ${pct}%`} />
			<span>
				{done.toLocaleString("en")} / {total.toLocaleString("en")}
			</span>
			<button type="button" className="btn" onClick={onCancel}>
				Cancel
			</button>
		</div>
	);
}

function Controls({
	hypothesis: h,
	spec,
	run,
	R,
	seed,
	exploratory,
	onSpec,
	onRun,
	bid,
	canResample,
}: NullPanelProps & { bid: number; canResample: boolean }) {
	const [seedDraft, setSeedDraft] = useState(String(seed));
	const [rDraft, setRDraft] = useState(R);
	useEffect(() => setSeedDraft(String(seed)), [seed]);
	useEffect(() => setRDraft(R), [R]);
	const axes = h.axes.filter((a) => CONTROL_KEYS.has(a.key));
	const rOptions = R_OPTIONS.includes(R)
		? R_OPTIONS
		: [...R_OPTIONS, R].sort((a, b) => a - b);
	const commit = () => {
		const s = Number.parseInt(seedDraft, 10);
		const sd = Number.isFinite(s) && s >= 0 ? s : seed;
		// the same settings again (after a cancel or an error) start the same run
		if (rDraft === R && sd === seed) run.rerun();
		else onRun(rDraft, sd);
	};
	return (
		<form
			className="null-controls"
			onSubmit={(e) => {
				e.preventDefault();
				commit();
			}}
		>
			{axes.map((a) => {
				const idx = a.options.findIndex((o) => o.value === spec[a.key]);
				return (
					<label key={a.key}>
						<span>{a.label}</span>
						<select
							value={idx < 0 ? 0 : idx}
							onChange={(e) => {
								const o = a.options[Number(e.target.value)];
								if (o) onSpec({ ...spec, [a.key]: o.value });
							}}
						>
							{a.options.map((o, i) => (
								<option key={String(o.value)} value={i}>
									{o.label}
								</option>
							))}
						</select>
					</label>
				);
			})}
			{canResample && (
				<div className="null-controls-row">
					<label>
						<span>Replicates</span>
						<select
							value={rDraft}
							onChange={(e) => setRDraft(Number(e.target.value))}
						>
							{rOptions.map((r) => (
								<option key={r} value={r}>
									{r.toLocaleString("en")}
								</option>
							))}
						</select>
					</label>
					<label>
						<span>Seed</span>
						<input
							type="number"
							inputMode="numeric"
							min={0}
							value={seedDraft}
							onChange={(e) => setSeedDraft(e.target.value)}
						/>
					</label>
				</div>
			)}
			<div className="null-controls-row">
				{canResample && (
					<button type="submit" className="btn">
						Rerun
					</button>
				)}
				{run.status === "running" && (
					<button type="button" className="btn" onClick={run.cancel}>
						Cancel
					</button>
				)}
			</div>
			{exploratory ? (
				<p className="null-explore">
					Exploratory run: α bid {fmtNum(bid, 3)}. Only the default settings
					give a verdict.
				</p>
			) : (
				<p className="null-explore is-default">
					Default settings: this run is confirmatory and spends no α.
				</p>
			)}
		</form>
	);
}

/* ─────────── histogram / analytic curve ─────────── */

const H = 190;
const M = { t: 30, r: 18, b: 30, l: 18 };

function NullHistogram({
	nulls,
	analytic,
	observed,
	expected,
	R,
}: {
	nulls?: Float64Array;
	analytic?: { mean: number; sd: number };
	observed: number;
	expected?: Expected;
	R?: number;
}) {
	const { ref, width } = useMeasure<HTMLDivElement>(560);
	const W = Math.max(260, width);
	const geo = useMemo(() => {
		let lo: number;
		let hi: number;
		if (nulls) {
			lo = d3min(nulls) ?? 0;
			hi = d3max(nulls) ?? 0;
		} else {
			const a = analytic ?? { mean: 0, sd: 1 };
			const sd = Math.max(a.sd, 1e-6);
			lo = a.mean - 4 * sd;
			hi = a.mean + 4 * sd;
		}
		const span = Math.max(hi - lo, 1);
		const breakRight = observed > hi + 3 * span;
		const breakLeft = observed < lo - 3 * span;
		const ghost = expected?.nullMean;
		let dLo = lo;
		let dHi = hi;
		const include = (v: number | undefined) => {
			if (v == null || !Number.isFinite(v)) return;
			if (v < lo - 3 * span || v > hi + 3 * span) return;
			dLo = Math.min(dLo, v);
			dHi = Math.max(dHi, v);
		};
		include(ghost);
		if (!breakLeft && !breakRight) {
			dLo = Math.min(dLo, observed);
			dHi = Math.max(dHi, observed);
			include(expected?.value);
		}
		const pad = Math.max((dHi - dLo) * 0.06, 0.5);
		dLo -= pad;
		dHi += pad;
		// the stretch of axis reserved past a break for the observed marker
		const gap = 56;
		const x0 = M.l + (breakLeft ? gap : 0);
		const x1 = W - M.r - (breakRight ? gap : 0);
		const x = (v: number) => x0 + ((v - dLo) / (dHi - dLo)) * (x1 - x0);
		const obsX = breakRight ? W - M.r - 6 : breakLeft ? M.l + 6 : x(observed);
		return { lo, hi, dLo, dHi, x, x0, x1, obsX, breakLeft, breakRight };
	}, [nulls, analytic, observed, expected, W]);

	const bars = useMemo(() => {
		if (!nulls) return null;
		const { lo, hi } = geo;
		const ints = nulls.every((v) => Number.isInteger(v));
		const b =
			ints && hi - lo <= 40
				? bin()
						.domain([lo, hi + 1])
						.thresholds(d3range(lo, hi + 1))
				: bin()
						.domain([lo, hi === lo ? lo + 1 : hi])
						.thresholds(30);
		const bins = b(Array.from(nulls));
		const top = d3max(bins, (d) => d.length) ?? 1;
		return { bins, top };
	}, [nulls, geo]);

	const yBase = H - M.b;
	const yTop = M.t + 4;
	const { x, obsX } = geo;
	const ticks = niceTicks(geo.dLo, geo.dHi, W < 420 ? 4 : 6);

	let curve: string | null = null;
	if (analytic) {
		const sd = Math.max(analytic.sd, 1e-6);
		const pts: string[] = [];
		const n = 80;
		for (let i = 0; i <= n; i++) {
			const v = geo.dLo + ((geo.dHi - geo.dLo) * i) / n;
			const d = Math.exp(-0.5 * ((v - analytic.mean) / sd) ** 2);
			pts.push(`${x(v).toFixed(1)},${(yBase - d * (yBase - yTop)).toFixed(1)}`);
		}
		curve = `M${geo.x0},${yBase}L${pts.join("L")}L${geo.x1},${yBase}Z`;
	}

	const rec = expected?.value;
	const tol = expected?.tol ?? 0;
	const obsLabel = `observed ${fmtNum(observed)}`;
	const labelAnchor = obsX > W - 90 ? "end" : obsX < 90 ? "start" : "middle";
	const desc = nulls
		? `Histogram of ${nulls.length} replicate statistics from ${fmtNum(geo.lo)} to ${fmtNum(geo.hi)}; observed ${fmtNum(observed)}.`
		: `Normal curve, mean ${fmtNum(analytic?.mean)} sd ${fmtNum(analytic?.sd)}; observed ${fmtNum(observed)}.`;

	return (
		<div ref={ref} className="null-hist">
			<svg
				width={W}
				height={H}
				viewBox={`0 0 ${W} ${H}`}
				role="img"
				aria-label={desc}
			>
				<title>{desc}</title>
				{bars?.bins.map((b) => {
					if (b.x0 == null || b.x1 == null || b.length === 0) return null;
					const bx0 = x(b.x0);
					const bx1 = x(b.x1);
					const h = (b.length / bars.top) * (yBase - yTop);
					return (
						<rect
							key={b.x0}
							className="null-bar"
							x={bx0 + 0.5}
							y={yBase - h}
							width={Math.max(1, bx1 - bx0 - 1)}
							height={h}
						>
							<title>
								{`${fmtNum(b.x0)}–${fmtNum(b.x1)}: ${b.length} of ${R ?? nulls?.length} runs`}
							</title>
						</rect>
					);
				})}
				{curve && <path className="null-curve" d={curve} />}
				<line
					className="null-axis"
					x1={M.l}
					x2={W - M.r}
					y1={yBase}
					y2={yBase}
				/>
				{ticks.map((t) => (
					<g key={t} transform={`translate(${x(t)},${yBase})`}>
						<line className="null-axis" y2={4} />
						<text className="null-tick" y={16} textAnchor="middle">
							{fmtNum(t)}
						</text>
					</g>
				))}
				{geo.breakRight && <AxisBreak x={geo.x1 + 16} y={yBase} />}
				{geo.breakLeft && <AxisBreak x={geo.x0 - 16} y={yBase} />}

				{expected?.nullMean != null &&
					expected.nullMean >= geo.dLo &&
					expected.nullMean <= geo.dHi && (
						<g className="null-ghost">
							<line
								x1={x(expected.nullMean)}
								x2={x(expected.nullMean)}
								y1={yTop - 6}
								y2={yBase}
							/>
							<text
								x={x(expected.nullMean)}
								y={yTop - 10}
								textAnchor={x(expected.nullMean) < 120 ? "start" : "middle"}
							>
								recorded chance {fmtNum(expected.nullMean, 1)}
							</text>
						</g>
					)}

				{rec != null && (
					<g className="null-recorded">
						{!geo.breakLeft && !geo.breakRight ? (
							<>
								<rect
									x={Math.min(x(rec - tol), x(rec + tol)) - 1}
									y={yBase - 10}
									width={Math.max(2, Math.abs(x(rec + tol) - x(rec - tol)) + 2)}
									height={10}
								/>
								<line x1={x(rec)} x2={x(rec)} y1={yBase - 14} y2={yBase + 2} />
							</>
						) : (
							<rect x={obsX - 5} y={yBase - 10} width={10} height={10} />
						)}
						<title>{`recorded ${fmtNum(rec)}${tol ? ` ± ${fmtNum(tol)}` : ""}`}</title>
					</g>
				)}

				<g className="null-obs">
					<line x1={obsX} x2={obsX} y1={yTop - 20} y2={yBase} />
					<text
						x={obsX}
						y={yTop - 22 + 0}
						textAnchor={labelAnchor}
						dx={labelAnchor === "end" ? -4 : labelAnchor === "start" ? 4 : 0}
					>
						{obsLabel}
					</text>
				</g>
			</svg>
			{rec != null && (
				<p className="null-legend">
					<span className="null-legend-obs" /> observed{" "}
					<span className="null-legend-rec" /> recorded {fmtNum(rec)}
					{tol ? ` ± ${fmtNum(tol)}` : ""}
					{expected?.nullMean != null && (
						<>
							{" "}
							<span className="null-legend-ghost" /> recorded chance{" "}
							{fmtNum(expected.nullMean, 1)}
						</>
					)}
				</p>
			)}
		</div>
	);
}

function AxisBreak({ x, y }: { x: number; y: number }) {
	return (
		<g className="null-break">
			<rect x={x - 7} y={y - 6} width={14} height={12} />
			<path
				d={`M${x - 6},${y + 5}L${x - 1},${y - 5}M${x + 1},${y + 5}L${x + 6},${y - 5}`}
			/>
		</g>
	);
}

function niceTicks(lo: number, hi: number, n: number): number[] {
	const span = hi - lo;
	if (!(span > 0)) return [lo];
	const raw = span / n;
	const mag = 10 ** Math.floor(Math.log10(raw));
	const step =
		[1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
	const out: number[] = [];
	for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step)
		out.push(Number(v.toFixed(10)));
	return out;
}

/* ─────────── units / counts ─────────── */

function UnitCounts({
	result,
	expected,
}: {
	result: RunResult;
	expected?: Expected;
}) {
	const detail = result.obs.detail ?? {};
	const keys = Object.keys(expected?.detail ?? detail);
	const rows: DotRow[] = [];
	const main = expected?.value;
	rows.push(
		dotRow(
			"value",
			"Observed",
			result.observed,
			main,
			expected?.tol ?? 0,
			true,
		),
	);
	for (const k of keys) {
		const e = expected?.detail?.[k];
		rows.push(dotRow(k, k, detail[k] ?? 0, e?.value, e?.tol ?? 0, false));
	}
	const top = Math.max(
		1,
		...rows.map((r) => Math.max(r.value, r.hi ?? 0, r.ref ?? 0)),
	);
	const dom: [number, number] = [0, niceCeil(top * 1.08)];
	return (
		<DotRows
			rows={rows}
			domain={dom}
			ticks={niceTicks(0, dom[1], 4)}
			format={(v) => fmtNum(v)}
			axisLabel="khipus"
		/>
	);
}

function niceCeil(v: number): number {
	const mag = 10 ** Math.floor(Math.log10(Math.max(v, 1)));
	return Math.ceil(v / mag) * mag;
}

function dotRow(
	key: string,
	label: string,
	value: number,
	rec: number | undefined,
	tol: number,
	emphasis: boolean,
): DotRow {
	return {
		key,
		label,
		value,
		ref: rec,
		lo: rec != null ? rec - tol : undefined,
		hi: rec != null ? rec + tol : undefined,
		note:
			rec != null
				? `${fmtNum(value)} vs ${fmtNum(rec)}${tol ? ` ± ${fmtNum(tol)}` : ""}`
				: fmtNum(value),
		emphasis,
		muted: rec != null && Math.abs(value - rec) > tol,
		tip: (
			<>
				<div className="chart-tip-title">{label}</div>
				<div className="chart-tip-row">
					<strong>{fmtNum(value)}</strong>
					<span>observed now</span>
				</div>
				{rec != null && (
					<div className="chart-tip-row">
						<strong>
							{fmtNum(rec)}
							{tol ? ` ± ${fmtNum(tol)}` : ""}
						</strong>
						<span>recorded</span>
					</div>
				)}
			</>
		),
	};
}

function CountRows({
	result,
	expected,
}: {
	result: RunResult;
	expected?: Expected;
}) {
	const detail = result.obs.detail ?? {};
	const rows: [string, number, number | undefined, number][] = [
		["Observed", result.observed, expected?.value, expected?.tol ?? 0],
	];
	for (const k of Object.keys(detail)) {
		const e = expected?.detail?.[k];
		rows.push([k, detail[k], e?.value, e?.tol ?? 0]);
	}
	return (
		<table className="data-table null-count-table">
			<thead>
				<tr>
					<th>Measure</th>
					<th className="num">Now</th>
					<th className="num">Recorded</th>
					<th>Match</th>
				</tr>
			</thead>
			<tbody>
				{rows.map(([label, now, rec, tol]) => {
					const ok = rec == null ? null : Math.abs(now - rec) <= tol;
					return (
						<tr key={label}>
							<td>{label}</td>
							<td className="num">{fmtNum(now, 3)}</td>
							<td className="num">
								{rec == null
									? "—"
									: `${fmtNum(rec, 3)}${tol ? ` ± ${fmtNum(tol)}` : ""}`}
							</td>
							<td className={ok === false ? "is-off" : undefined}>
								{ok == null ? "—" : ok ? "✓ same" : "≈ moved"}
							</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}
