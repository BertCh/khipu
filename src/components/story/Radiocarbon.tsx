/**
 * A calibrated radiocarbon result as a strip of calendar years: the 2σ
 * ranges with their probabilities, against the events that bracket the
 * account. Numbers are passed in; nothing is computed here.
 */

export interface DateRange {
	from: number;
	to: number;
	/** share of the 2σ probability in this range, 0–1 */
	p: number;
}

export interface DateMark {
	year: number;
	label: string;
}

export default function Radiocarbon({
	ranges,
	marks,
	from,
	to,
	label,
}: {
	ranges: DateRange[];
	marks: DateMark[];
	from: number;
	to: number;
	label: string;
}) {
	const W = 640;
	const H = 92;
	const padL = 16;
	const padR = 16;
	const axisY = 58;
	const x = (y: number) =>
		padL + ((y - from) / (to - from)) * (W - padL - padR);
	const decades: number[] = [];
	for (let y = Math.ceil(from / 50) * 50; y <= to; y += 50) decades.push(y);
	return (
		<div className="radiocarbon">
			<svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
				<title>{label}</title>
				<line
					x1={padL}
					x2={W - padR}
					y1={axisY}
					y2={axisY}
					className="rc-axis"
				/>
				{decades.map((y) => (
					<g key={y} transform={`translate(${x(y)} ${axisY})`}>
						<line y2={4} className="rc-axis" />
						<text y={18} textAnchor="middle" className="rc-tick">
							{y}
						</text>
					</g>
				))}
				{ranges.map((r) => (
					<g key={r.from}>
						<rect
							x={x(r.from)}
							y={axisY - 12 - 18 * r.p}
							width={x(r.to) - x(r.from)}
							height={12 + 18 * r.p}
							className="rc-range"
						/>
						<text
							x={(x(r.from) + x(r.to)) / 2}
							y={axisY - 16 - 18 * r.p}
							textAnchor="middle"
							className="rc-range-label"
						>
							{r.from}–{r.to} · {Math.round(r.p * 100)}%
						</text>
					</g>
				))}
				{marks.map((m) => (
					<g key={m.year} transform={`translate(${x(m.year)} 0)`}>
						<line y1={axisY - 44} y2={axisY} className="rc-mark" />
						<text y={axisY + 34} textAnchor="middle" className="rc-mark-label">
							{m.label}
						</text>
					</g>
				))}
			</svg>
		</div>
	);
}
