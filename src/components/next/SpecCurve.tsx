import { useMemo, useState } from "react";
import { useMeasure } from "#/components/charts/useMeasure";
import { fmtNum } from "#/components/next/NullPanel";
import { keepsClaim, specGrid, specHolds } from "#/lib/engine/hypothesis";
import { claimChangingAxes } from "#/lib/engine/registry";
import { useSpecCurve } from "#/lib/engine/useEngine";
import type { Hypothesis, Spec, SpecPoint } from "#/lib/next/types";

/**
 * The specification curve: the same claim run under every combination of the
 * choices it could have made (null model, value source, thresholds…), sorted
 * by effect, with the decision matrix underneath saying which choice each
 * column made. A claim that holds only under its own settings shows here.
 */

interface Props {
	hypothesis: Hypothesis;
	/** specKey of the spec currently in the URL, if any */
	pinned?: string;
	onPick: (spec: Spec) => void;
}

const LABEL_W = 184;
const TOP_H = 170;
const ROW_H = 17;
const HEAD_H = 21;

/** short names for the matrix rows; the full labels stay in tooltips and lists */
const SHORT: Record<string, string> = {
	"Values as the KFG records them": "KFG values",
	"Values re-read from the knots where they differ": "Re-read from knots",
	"Whole pendants shuffled (MK a)": "Whole pendants (MK a)",
	"Pendant values shuffled, colours stay": "Values only",
	"Pendants shuffled within their group (MK c)": "Within group (MK c)",
	"Groups shuffled as blocks (MK b)": "Group blocks (MK b)",
	"Decimal khipus (Wari and unreadable left out)": "Decimal khipus",
	"Wari canuto khipus only": "Wari only",
	"Every khipu, as chance.json counts them": "Every khipu",
	"Tolerant alignment score (slips allowed)": "Tolerant score",
	"Longest exact shared run": "Longest exact run",
	"Second khipu's cords shuffled end to end": "End to end",
	"Second khipu's cords shuffled within groups": "Within groups",
	"Pendant values shuffled along the khipu": "Along the khipu",
	"Pendant values shuffled within their group": "Within group",
	"First cord of the group": "First cord",
	"Five-cord and four-cord windows": "5- and 4-cord",
	"Five-cord windows only": "5-cord only",
	"Both khipus' pendant values shuffled (totals redrawn)": "Both khipus",
	"Heads khipu's values shuffled (order only)": "Heads, order only",
	"Heads khipu's values shuffled within groups (order only)":
		"Heads in groups, order only",
	"Before and after equally likely (sign test)": "Sign test",
	"Top-cord values drawn from other khipus": "Pooled top cords",
	"Also ±1 or a register slip": "±1 or a slip",
	"Also one digit apart": "One digit apart",
	"Exact, or one digit off": "Exact or one digit",
};

function optionLabel(h: Hypothesis, key: string, value: unknown): string {
	const ax = h.axes.find((a) => a.key === key);
	return ax?.options.find((o) => o.value === value)?.label ?? String(value);
}

function shortLabel(label: string): string {
	return SHORT[label] ?? label;
}

/** The ways a spec differs from the default, in words. */
export function describeSpec(h: Hypothesis, spec: Spec): string {
	const diffs = h.axes
		.filter((a) => spec[a.key] !== h.defaultSpec[a.key])
		.map(
			(a) =>
				`${a.label.replace(/:.*$/, "")}: ${optionLabel(h, a.key, spec[a.key])}`,
		);
	return diffs.length ? diffs.join("; ") : "the default specification";
}

export default function SpecCurve({ hypothesis: h, pinned, onPick }: Props) {
	const [enabled, setEnabled] = useState(false);
	const curve = useSpecCurve(h, enabled);
	const n = useMemo(() => specGrid(h).length, [h]);
	const R = Math.min(h.R, 200);
	const [hover, setHover] = useState<number | null>(null);

	const pts = useMemo(
		() =>
			[...curve.points].sort(
				(a, b) =>
					(a.z ?? Number.POSITIVE_INFINITY) - (b.z ?? Number.POSITIVE_INFINITY),
			),
		[curve.points],
	);
	const def = pts.find((p) => p.isDefault);
	const chance = h.expected?.direction === "chance";
	// specifications that change what is tested are controls, not robustness
	const kept = pts.filter((p) => keepsClaim(h, p.spec));
	const nControls = pts.length - kept.length;
	const holding = (p: SpecPoint) => specHolds(h, p, def?.z ?? null);
	const holds = kept.filter((p) => p.q != null && holding(p)).length;
	const controlAxes = h.axes.filter((a) =>
		claimChangingAxes(h).includes(a.key),
	);
	const done = curve.status === "done" && pts.length > 0;
	const worst = useMemo(() => {
		const withZ = pts.filter((p) => p.z != null && keepsClaim(h, p.spec));
		if (!withZ.length) return undefined;
		return chance ? withZ[withZ.length - 1] : withZ[0];
	}, [pts, h, chance]);

	return (
		<div className="spec-curve">
			<div className="spec-head">
				{done ? (
					<>
						<h4>
							Holds in {holds} of {kept.length} specifications{" "}
							<span>
								{chance
									? "(at chance: BH q ≥ .05, or within the recorded ratio)"
									: "(BH q < .05 in the claim's direction)"}
							</span>
						</h4>
						{nControls > 0 && (
							<p>
								{nControls} more are controls: they change{" "}
								{controlAxes.map((a) => a.label.toLowerCase()).join(", ")}, so
								they test another claim and are drawn hollow and grey.
							</p>
						)}
						{worst && (
							<p>
								Weakest: {describeSpec(h, worst.spec)} (z {fmtNum(worst.z, 1)}
								{worst.q != null ? `, q ${fmtNum(worst.q, 2)}` : ""}).
							</p>
						)}
					</>
				) : (
					<p>
						Every combination of this test's choices, each against its own
						chance, with Benjamini–Hochberg q across the grid. Spec-curve runs
						are exploratory and spend α.
					</p>
				)}
				<div className="spec-actions">
					{curve.status !== "running" && (
						<button
							type="button"
							className="btn btn-primary"
							onClick={() => (enabled ? curve.restart() : setEnabled(true))}
							disabled={enabled && curve.status === "done"}
						>
							{done ? "Ran" : "Run"} all {n} specifications
							{h.R > 0 ? ` (R ${R})` : ""}
						</button>
					)}
					{curve.status === "running" && (
						<div className="null-progress">
							<progress
								max={curve.progress?.[1] || 1}
								value={curve.progress?.[0] ?? 0}
								aria-label="Specification progress"
							/>
							<span>
								{curve.progress
									? `${curve.progress[0]} / ${curve.progress[1]}`
									: "starting"}
							</span>
							<button type="button" className="btn" onClick={curve.cancel}>
								Cancel
							</button>
						</div>
					)}
				</div>
			</div>

			{pts.length > 0 && (
				<>
					<CurveChart
						h={h}
						pts={pts}
						pinned={pinned}
						hover={hover}
						onHover={setHover}
						onPick={onPick}
						holding={holding}
					/>
					<MiniCurve h={h} pts={pts} pinned={pinned} holding={holding} />
					<p className="spec-legend">
						<span>
							<i className="spec-lg-dot is-sig" /> holds
						</span>
						<span>
							<i className="spec-lg-dot" /> does not
						</span>
						{nControls > 0 && (
							<span>
								<i className="spec-lg-dot is-control" /> control
							</span>
						)}
						<span>
							<i className="spec-lg-ring" /> default
						</span>
						<span>
							<i className="spec-lg-band" /> z within ±1.96
						</span>
					</p>
					<details className="spec-list-wrap">
						<summary>List of {pts.length} specifications</summary>
						<SpecList
							h={h}
							pts={pts}
							pinned={pinned}
							onPick={onPick}
							holding={holding}
						/>
					</details>
				</>
			)}
		</div>
	);
}

function CurveChart({
	h,
	pts,
	pinned,
	hover,
	onHover,
	onPick,
	holding,
}: {
	h: Hypothesis;
	pts: SpecPoint[];
	pinned?: string;
	hover: number | null;
	onHover: (i: number | null) => void;
	onPick: (spec: Spec) => void;
	holding: (p: SpecPoint) => boolean;
}) {
	const { ref, width } = useMeasure<HTMLDivElement>(720);
	const W = Math.max(320, width);
	const zs = pts.map((p) => p.z ?? 0);
	const zLo = Math.min(-2.5, ...zs);
	const zHi = Math.max(2.5, ...zs);
	const x0 = LABEL_W;
	const x1 = W - 12;
	const step = (x1 - x0) / pts.length;
	const cx = (i: number) => x0 + step * (i + 0.5);
	const y = (z: number) => 12 + (1 - (z - zLo) / (zHi - zLo)) * (TOP_H - 30);
	const rows: { key: string; label: string; value?: unknown; head: boolean }[] =
		[];
	for (const a of h.axes) {
		rows.push({ key: a.key, label: a.label, head: true });
		for (const o of a.options)
			rows.push({ key: a.key, label: o.label, value: o.value, head: false });
	}
	let yy = TOP_H + 8;
	const rowY = rows.map((r) => {
		const at = yy;
		yy += r.head ? HEAD_H : ROW_H;
		return at;
	});
	const H = yy + 6;
	const r = Math.max(2.5, Math.min(5, step / 2.6));
	const ticks = [0, -2, 2].concat(
		zHi > 6 ? [Math.round(zHi / 2), Math.floor(zHi)] : [],
	);
	return (
		<div ref={ref} className="spec-chart" onPointerLeave={() => onHover(null)}>
			<svg
				width={W}
				height={H}
				viewBox={`0 0 ${W} ${H}`}
				role="img"
				aria-label={`Specification curve: ${pts.length} specifications sorted by z`}
			>
				<rect
					className="spec-band"
					x={x0}
					width={x1 - x0}
					y={y(1.96)}
					height={y(-1.96) - y(1.96)}
				/>
				<line className="spec-zero" x1={x0} x2={x1} y1={y(0)} y2={y(0)} />
				{ticks
					.filter((t) => t >= zLo && t <= zHi)
					.filter(
						(t, i, arr) =>
							t === 0 ||
							arr.every((u, j) => j >= i || Math.abs(y(u) - y(t)) > 12),
					)
					.map((t) => (
						<text
							key={t}
							className="spec-tick"
							x={x0 - 6}
							y={y(t) + 3}
							textAnchor="end"
						>
							z {t}
						</text>
					))}
				{hover != null && (
					<rect
						className="spec-hover-col"
						x={x0 + step * hover}
						width={step}
						y={4}
						height={H - 8}
					/>
				)}
				{rows.map((row, i) => (
					<text
						key={`${row.key}:${String(row.value)}:${row.head}`}
						className={row.head ? "spec-axis-head" : "spec-axis-opt"}
						x={row.head ? 4 : 14}
						y={rowY[i] + (row.head ? 12 : 10)}
					>
						{truncate(
							row.head ? row.label.replace(/:.*$/, "") : shortLabel(row.label),
							row.head ? 26 : 24,
						)}
					</text>
				))}
				{pts.map((p, i) => {
					const control = !keepsClaim(h, p.spec);
					const sig = !control && holding(p);
					const isPinned = pinned != null && p.specKey === pinned;
					return (
						// biome-ignore lint/a11y/noStaticElementInteractions: the list below is the keyboard twin
						<g
							key={p.specKey}
							className="spec-col"
							onPointerEnter={() => onHover(i)}
							onClick={() => onPick(p.spec)}
						>
							<title>{`z ${fmtNum(p.z, 2)} · q ${fmtNum(p.q, 3)} · ${describeSpec(h, p.spec)}`}</title>
							<rect
								className="spec-hit"
								x={x0 + step * i}
								width={step}
								y={4}
								height={H - 8}
							/>
							{p.z != null && (
								<circle
									className={`spec-dot${sig ? " is-sig" : ""}${control ? " is-control" : ""}`}
									cx={cx(i)}
									cy={y(p.z)}
									r={r}
								/>
							)}
							{p.isDefault && p.z != null && (
								<circle
									className="spec-ring"
									cx={cx(i)}
									cy={y(p.z)}
									r={r + 3}
								/>
							)}
							{isPinned && p.z != null && (
								<circle
									className="spec-ring is-pinned"
									cx={cx(i)}
									cy={y(p.z)}
									r={r + 5.5}
								/>
							)}
							{rows.map((row, j) =>
								row.head ? null : (
									<circle
										key={`${row.key}:${String(row.value)}`}
										className={`spec-pip${p.spec[row.key] === row.value ? " is-on" : ""}`}
										cx={cx(i)}
										cy={rowY[j] + 6}
										r={p.spec[row.key] === row.value ? 3 : 1.4}
									/>
								),
							)}
						</g>
					);
				})}
			</svg>
		</div>
	);
}

function truncate(s: string, n: number): string {
	return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Phones: the curve alone, full width, so the default's place stays visible. */
function MiniCurve({
	h,
	pts,
	pinned,
	holding,
}: {
	h: Hypothesis;
	pts: SpecPoint[];
	pinned?: string;
	holding: (p: SpecPoint) => boolean;
}) {
	const { ref, width } = useMeasure<HTMLDivElement>(360);
	const W = Math.max(240, width);
	const Hh = 96;
	const zs = pts.map((p) => p.z ?? 0);
	const zLo = Math.min(-2.5, ...zs);
	const zHi = Math.max(2.5, ...zs);
	const x0 = 34;
	const x1 = W - 6;
	const step = (x1 - x0) / Math.max(1, pts.length);
	const cx = (i: number) => x0 + step * (i + 0.5);
	const y = (z: number) => 6 + (1 - (z - zLo) / (zHi - zLo)) * (Hh - 12);
	const r = Math.max(2, Math.min(4, step / 2.4));
	return (
		<div ref={ref} className="spec-mini">
			<svg
				width={W}
				height={Hh}
				viewBox={`0 0 ${W} ${Hh}`}
				role="img"
				aria-label={`Specification curve: ${pts.length} specifications sorted by z; the list below has each one`}
			>
				<rect
					className="spec-band"
					x={x0}
					width={x1 - x0}
					y={y(1.96)}
					height={y(-1.96) - y(1.96)}
				/>
				<line className="spec-zero" x1={x0} x2={x1} y1={y(0)} y2={y(0)} />
				<text className="spec-tick" x={x0 - 4} y={y(0) + 3} textAnchor="end">
					z 0
				</text>
				<text className="spec-tick" x={x0 - 4} y={y(zHi) + 8} textAnchor="end">
					{Math.round(zHi)}
				</text>
				{pts.map((p, i) =>
					p.z == null ? null : (
						<g key={p.specKey}>
							<circle
								className={`spec-dot${!keepsClaim(h, p.spec) ? " is-control" : holding(p) ? " is-sig" : ""}`}
								cx={cx(i)}
								cy={y(p.z)}
								r={r}
							/>
							{p.isDefault && (
								<circle
									className="spec-ring"
									cx={cx(i)}
									cy={y(p.z)}
									r={r + 3}
								/>
							)}
							{pinned === p.specKey && (
								<circle
									className="spec-ring is-pinned"
									cx={cx(i)}
									cy={y(p.z)}
									r={r + 5}
								/>
							)}
						</g>
					),
				)}
			</svg>
		</div>
	);
}

function SpecList({
	h,
	pts,
	pinned,
	onPick,
	holding,
}: {
	h: Hypothesis;
	pts: SpecPoint[];
	pinned?: string;
	onPick: (spec: Spec) => void;
	holding: (p: SpecPoint) => boolean;
}) {
	const zs = pts.map((p) => Math.abs(p.z ?? 0));
	const zMax = Math.max(2.5, ...zs);
	return (
		<ol className="spec-list">
			{pts.map((p) => {
				const control = !keepsClaim(h, p.spec);
				const sig = !control && holding(p);
				const pos = 50 + ((p.z ?? 0) / zMax) * 46;
				const diffs = h.axes.filter(
					(a) => p.spec[a.key] !== h.defaultSpec[a.key],
				);
				return (
					<li key={p.specKey}>
						<button
							type="button"
							className={`spec-row${pinned === p.specKey ? " is-pinned" : ""}`}
							onClick={() => onPick(p.spec)}
						>
							<span className="spec-row-track" aria-hidden="true">
								<span className="spec-row-band" />
								<span
									className={`spec-row-dot${sig ? " is-sig" : ""}${control ? " is-control" : ""}`}
									style={{ left: `${pos}%` }}
								/>
							</span>
							<span className="spec-row-z">
								z {fmtNum(p.z, 1)} · q {fmtNum(p.q, 2)}
							</span>
							<span className="spec-row-chips">
								{p.isDefault && (
									<span className="spec-chip is-default">default</span>
								)}
								{control && <span className="spec-chip">control</span>}
								{diffs.map((a) => (
									<span key={a.key} className="spec-chip">
										{shortLabel(optionLabel(h, a.key, p.spec[a.key]))}
									</span>
								))}
							</span>
						</button>
					</li>
				);
			})}
		</ol>
	);
}
