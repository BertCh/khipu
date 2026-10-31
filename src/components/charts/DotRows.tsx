import { type ReactNode, useState } from "react";
import "./DotRows.css";

export interface DotRow {
	key: string;
	label: string;
	sub?: string;
	/** position of the observed dot */
	value: number;
	/** chance band (e.g. ±2 sd of the shuffles) */
	lo?: number;
	hi?: number;
	/** this row's own chance level, drawn as a hollow ring (when rows differ) */
	ref?: number;
	/** text at the right */
	note: string;
	tip: ReactNode;
	emphasis?: boolean;
	/** a result at chance level: the dot is drawn grey */
	muted?: boolean;
}

/**
 * One row per measure: a grey chance band around a reference line, and the
 * observed value as a dot. Positions are percentages, so the plot column
 * reflows with the page; below 640px the labels stack above their tracks.
 * Rows whose chance level differs carry their own `ref` ring; a shared
 * `reference` line runs through every row.
 */
export default function DotRows({
	rows,
	domain,
	log = false,
	ticks,
	format,
	reference,
	referenceLabel,
	axisLabel,
}: {
	rows: DotRow[];
	domain: [number, number];
	log?: boolean;
	ticks: number[];
	format: (v: number) => string;
	reference?: number;
	referenceLabel?: string;
	axisLabel: string;
}) {
	const [hover, setHover] = useState<string | null>(null);
	const f = (v: number) => (log ? Math.log(v) : v);
	const x = (v: number) => {
		const t = (f(v) - f(domain[0])) / (f(domain[1]) - f(domain[0]));
		return `${Math.max(0, Math.min(1, t)) * 100}%`;
	};
	return (
		<div className="dot-rows" onPointerLeave={() => setHover(null)}>
			{rows.map((r) => (
				<div
					key={r.key}
					className={`dot-row${r.emphasis ? " is-emphasis" : ""}${r.muted ? " is-muted" : ""}`}
					onPointerEnter={() => setHover(r.key)}
				>
					<div className="dot-row-label">
						<span>{r.label}</span>
						{r.sub && <small>{r.sub}</small>}
					</div>
					<div className="dot-track">
						{reference != null && (
							<span className="dot-ref" style={{ left: x(reference) }} />
						)}
						{r.lo != null && r.hi != null && (
							<span
								className="dot-band"
								style={{
									left: x(r.lo),
									width: `calc(${x(r.hi)} - ${x(r.lo)})`,
								}}
							/>
						)}
						{r.ref != null && (
							<>
								<span
									className="dot-stem"
									style={{
										left: x(Math.min(r.ref, r.value)),
										width: `calc(${x(Math.max(r.ref, r.value))} - ${x(Math.min(r.ref, r.value))})`,
									}}
								/>
								<span className="dot-ring" style={{ left: x(r.ref) }} />
							</>
						)}
						<span className="dot-dot" style={{ left: x(r.value) }} />
						{hover === r.key && (
							<div className="chart-tip" style={{ left: x(r.value), top: -4 }}>
								{r.tip}
							</div>
						)}
					</div>
					<div className="dot-row-note">{r.note}</div>
				</div>
			))}
			<div className="dot-row dot-axis" aria-hidden="true">
				<div className="dot-row-label" />
				<div className="dot-track">
					{ticks.map((t) => (
						<span key={t} className="dot-tick" style={{ left: x(t) }}>
							{format(t)}
						</span>
					))}
					{reference != null && referenceLabel && (
						<span className="dot-ref-label" style={{ left: x(reference) }}>
							{referenceLabel}
						</span>
					)}
				</div>
				<div className="dot-row-note dot-axis-label">{axisLabel}</div>
			</div>
		</div>
	);
}

/** The legend under a DotRows: the observed dot and the chance band or ring. */
export function DotKey({
	observed,
	band,
	ring,
}: {
	observed: string;
	band?: string;
	ring?: string;
}) {
	return (
		<div className="chart-legend">
			<span>
				<i className="legend-dot" style={{ background: "var(--series-1)" }} />
				{observed}
			</span>
			{band && (
				<span>
					<i
						className="legend-rect"
						style={{ background: "var(--series-context)", opacity: 0.45 }}
					/>
					{band}
				</span>
			)}
			{ring && (
				<span>
					<i className="dot-key-ring" />
					{ring}
				</span>
			)}
		</div>
	);
}
