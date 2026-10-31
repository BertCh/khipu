import { inkOn } from "#/lib/khipu/colors";

export interface BarRow {
	key: string;
	label: string;
	/** small secondary text after the label */
	sublabel?: string;
	value: number;
	/** intrinsic colour for the bar (e.g. an Ascher cord colour); default is the series colour */
	color?: string;
	href?: string;
}

interface Props {
	rows: BarRow[];
	/** denominator for the share column; defaults to the sum of rows */
	total?: number;
	/** show a share % next to each value */
	share?: boolean;
	format?: (v: number) => string;
	/** max bar length in px is the track; bars scale to the largest value */
	max?: number;
}

const fmt = (v: number) => v.toLocaleString();

/**
 * Horizontal bars in HTML: label, a thin bar growing from a shared baseline
 * with a rounded data end, and the value at the tip. Every value is visible,
 * so no tooltip is needed.
 */
export default function BarList({
	rows,
	total,
	share = false,
	format = fmt,
	max,
}: Props) {
	const top = max ?? Math.max(1, ...rows.map((r) => r.value));
	const denom = total ?? rows.reduce((a, r) => a + r.value, 0);
	return (
		<ul className="barlist">
			{rows.map((r) => {
				const w = Math.max(0, (r.value / top) * 100);
				const swatch = r.color;
				return (
					<li className="barlist-row" key={r.key}>
						<div
							className="barlist-label"
							title={r.sublabel ? `${r.label} — ${r.sublabel}` : r.label}
						>
							{swatch && (
								<i
									className="barlist-swatch"
									style={{
										background: swatch,
										outlineColor:
											inkOn(swatch) === "#1c1a17"
												? "var(--hairline)"
												: "transparent",
									}}
									aria-hidden="true"
								/>
							)}
							<span className="barlist-name">{r.label}</span>
							{r.sublabel && <span className="barlist-sub">{r.sublabel}</span>}
						</div>
						<div className="barlist-track">
							<div
								className="barlist-bar"
								style={{
									width: `${w}%`,
									background: r.color ?? "var(--series-1)",
									boxShadow:
										swatch && inkOn(swatch) === "#1c1a17"
											? "inset 0 0 0 1px var(--rule)"
											: undefined,
								}}
							/>
						</div>
						<div className="barlist-value">
							{format(r.value)}
							{share && denom > 0 && (
								<span className="barlist-share">
									{((r.value / denom) * 100).toFixed(
										r.value / denom < 0.01 ? 1 : 0,
									)}
									%
								</span>
							)}
						</div>
					</li>
				);
			})}
		</ul>
	);
}
