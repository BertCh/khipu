import { hexFor, inkOn } from "#/lib/khipu/colors";
import type { ColorTable } from "#/lib/khipu/types";
import { cordState, type SlotRow, type Tier } from "#/lib/stories/kh0081";

/**
 * The slot matrix of the Mirror Ledger story: one part of KH0081 as a grid,
 * a row per group and a column per colour slot, each cell painted in the
 * cord's recorded colour with its value. Missing slots are dashed, cords of
 * an off-template colour are outlined in the contrast colour, broken cords
 * carry a notch. Drawn once for each part so the two can be read side by
 * side. Theme colours come from the page's CSS variables.
 */

const CELL_W = 54;
const CELL_H = 18;
const ROW = 22;
const LABEL_W = 64;
const HEAD_H = 34;
const TIER_GAP = 14;
const PAD = 10;

const TIER_LABEL: Record<Tier, string> = {
	opening: "opening",
	summary: "summary",
	marker: "",
	detail: "detail",
};

export function SlotGrid({
	rows,
	template,
	colors,
	title,
}: {
	rows: SlotRow[];
	template: string[];
	colors: ColorTable;
	title: string;
}) {
	// a gap before each new tier
	const tops: number[] = [];
	let y = PAD + HEAD_H;
	rows.forEach((r, i) => {
		if (i > 0 && rows[i - 1].tier !== r.tier) y += TIER_GAP;
		tops.push(y);
		y += ROW;
	});
	const width = PAD + LABEL_W + template.length * CELL_W + PAD;
	const height = y + PAD;
	const x0 = PAD + LABEL_W;
	return (
		<svg
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			role="img"
			aria-label={title}
			style={{ display: "block", minWidth: width }}
		>
			<title>{title}</title>
			{template.map((colour, s) => {
				const cx = x0 + s * CELL_W + CELL_W / 2;
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: slots are positional
					<g key={s}>
						<text
							x={cx}
							y={PAD + 11}
							textAnchor="middle"
							fill="var(--ink-3)"
							fontSize={9}
							fontVariant="tabular-nums"
						>
							{s + 1}
						</text>
						<text
							x={cx}
							y={PAD + 24}
							textAnchor="middle"
							fill="var(--ink-2)"
							fontSize={9.5}
						>
							{colour}
						</text>
					</g>
				);
			})}
			{rows.map((r, i) => {
				const top = tops[i];
				const firstOfTier = i === 0 || rows[i - 1].tier !== r.tier;
				return (
					<g key={r.gi}>
						{firstOfTier && (
							<text
								x={PAD}
								y={top - 3}
								fill="var(--ink-3)"
								fontSize={8.5}
								letterSpacing={0.6}
								style={{ textTransform: "uppercase" }}
							>
								{TIER_LABEL[r.tier]}
							</text>
						)}
						<text
							x={PAD}
							y={top + CELL_H / 2 + 3.5}
							fill="var(--ink)"
							fontSize={10.5}
							fontVariant="tabular-nums"
						>
							g{r.gi + 1}
						</text>
						{r.cells.map((c, s) => {
							const x = x0 + s * CELL_W + 2;
							const key = `${r.gi}-${s}`;
							if (!c)
								return (
									<rect
										key={key}
										x={x}
										y={top}
										width={CELL_W - 4}
										height={CELL_H}
										rx={3}
										fill="none"
										stroke="var(--ink-3)"
										strokeDasharray="2 2"
										strokeWidth={1}
									/>
								);
							const codes = c.colorParsed?.[0]?.codes ?? [];
							const base = hexFor(codes[0], colors);
							const accent = codes[1] ? hexFor(codes[1], colors) : null;
							const ink = inkOn(base);
							const off = r.offTemplate.includes(c);
							const state = cordState(c);
							const v = c.value ?? 0;
							return (
								<g key={key}>
									<rect
										x={x}
										y={top}
										width={CELL_W - 4}
										height={CELL_H}
										rx={3}
										fill={base}
										fillOpacity={v === 0 ? 0.45 : 1}
										stroke={off ? "var(--moiety-r)" : "var(--cord-casing)"}
										strokeWidth={off ? 1.6 : 0.6}
									/>
									{accent && (
										<rect
											x={x + 3}
											y={top + 2}
											width={CELL_W - 10}
											height={2.5}
											rx={1}
											fill={accent}
											fillOpacity={0.9}
										/>
									)}
									<text
										x={x + (CELL_W - 4) / 2}
										y={top + CELL_H / 2 + 3.5}
										textAnchor="middle"
										fill={ink}
										fillOpacity={v === 0 ? 0.7 : 1}
										fontSize={9.5}
										fontVariant="tabular-nums"
									>
										{state.state === "stub" ? "·" : v}
									</text>
									{state.state === "broken" && (
										<path
											d={`M${x + CELL_W - 4} ${top + CELL_H - 6} v6 h-6 z`}
											fill="var(--ink)"
											fillOpacity={0.55}
										/>
									)}
								</g>
							);
						})}
					</g>
				);
			})}
		</svg>
	);
}
