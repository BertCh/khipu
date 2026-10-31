import { useMemo, useState } from "react";
import { HAND_COLOR, HAND_LABEL } from "#/components/khipu/SumXray";
import { describeColor, hexFor } from "#/lib/khipu/colors";
import { type CordSum, groupName } from "#/lib/khipu/fieldmarks";
import type { ColorTable, Cord, KhipuLike } from "#/lib/khipu/types";
import { type XrayGrid, xrayGrid } from "#/lib/khipu/xray";

/**
 * The Field Guide's sum detail table: every sum as an equation, sortable on
 * any column, with a thumbnail of the x-ray per row showing where the sum
 * cord and its summands sit. Rows share hover and pin state with the x-ray.
 */

type SortKey = "pos" | "hand" | "color" | "value" | "n";

const COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
	{ key: "pos", label: "Sum cord" },
	{ key: "hand", label: "Hand" },
	{ key: "color", label: "Colour" },
	{ key: "value", label: "Value", num: true },
	{ key: "n", label: "Summands", num: true },
];

interface Props {
	khipu: KhipuLike;
	colors: ColorTable;
	sums: CordSum[];
	focus: string | null;
	onFocus: (name: string | null) => void;
	hover: string | null;
	onHover: (name: string | null) => void;
}

export default function SumTable({
	khipu,
	colors,
	sums,
	focus,
	onFocus,
	hover,
	onHover,
}: Props) {
	const [sort, setSort] = useState<SortKey>("pos");
	const [dir, setDir] = useState<"asc" | "desc">("asc");
	const byName = useMemo(
		() => new Map(khipu.cords.map((c) => [c.name, c])),
		[khipu],
	);
	const grid = useMemo(() => xrayGrid(khipu), [khipu]);
	const thumb = useMemo(() => thumbGeometry(grid), [grid]);
	const baseId = `xray-base-${khipu.id}`;

	const rows = useMemo(() => {
		const sign = dir === "asc" ? 1 : -1;
		const key = (s: CordSum): number | string => {
			switch (sort) {
				case "pos":
					return s.sumIndex;
				case "hand":
					return s.hand;
				case "color":
					return s.color;
				case "value":
					return s.value;
				case "n":
					return s.summands.length;
			}
		};
		return [...sums].sort((a, b) => {
			const ka = key(a);
			const kb = key(b);
			const c = ka < kb ? -1 : ka > kb ? 1 : a.sumIndex - b.sumIndex;
			return sign * c;
		});
	}, [sums, sort, dir]);

	const setSortKey = (k: SortKey) => {
		if (sort === k) setDir(dir === "asc" ? "desc" : "asc");
		else {
			setSort(k);
			setDir(k === "value" || k === "n" ? "desc" : "asc");
		}
	};

	const active = hover ?? focus;

	return (
		<div className="table-wrap sum-table-wrap">
			{/* the empty grid every thumbnail reuses */}
			<svg
				width={0}
				height={0}
				aria-hidden="true"
				style={{ position: "absolute" }}
			>
				<defs>
					<symbol id={baseId} viewBox={`0 0 ${thumb.w} ${thumb.h}`}>
						<path d={thumb.cellsPath} fill="var(--rule)" opacity={0.6} />
						<rect
							x={0}
							y={thumb.primaryY - 0.35}
							width={thumb.w}
							height={0.7}
							fill="var(--ink-3)"
						/>
					</symbol>
				</defs>
			</svg>
			<table className="data-table sum-table">
				<thead>
					<tr>
						<th className="num">#</th>
						{COLUMNS.map((c) => (
							<th
								key={c.key}
								className={c.num ? "num" : undefined}
								aria-sort={
									sort === c.key
										? dir === "asc"
											? "ascending"
											: "descending"
										: undefined
								}
							>
								<button type="button" onClick={() => setSortKey(c.key)}>
									{c.label}
								</button>
							</th>
						))}
						<th>Where</th>
						<th>Equation</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((s, i) => {
						const cord = byName.get(s.sum);
						const isActive = active === s.sum;
						return (
							<tr
								key={`${s.sum}-${s.hand}`}
								className={isActive ? "is-selected" : undefined}
								onClick={() => onFocus(focus === s.sum ? null : s.sum)}
								onPointerEnter={() => onHover(s.sum)}
								onPointerLeave={() => onHover(null)}
								style={{ cursor: "pointer" }}
							>
								<td className="num cell-muted">{i + 1}</td>
								<td>
									{s.sum}
									{cord && (
										<span className="muted">
											{" "}
											· {groupName(cord, khipu.groups)}
										</span>
									)}
								</td>
								<td>
									<span className={`hand hand-${s.hand}`}>
										<i aria-hidden="true" />
										{HAND_LABEL[s.hand]}
									</span>
								</td>
								<td title={cord && describeColor(cord.colorParsed, colors)}>
									<span className="kd-swatches" style={{ marginRight: 6 }}>
										{s.color.split(/[:\-%^]/).map((code, j) => (
											<i
												// biome-ignore lint/suspicious/noArrayIndexKey: positional
												key={j}
												style={{ background: hexFor(code, colors) }}
											/>
										))}
									</span>
									{s.color || "—"}
								</td>
								<td className="num">
									<strong>{s.value.toLocaleString()}</strong>
								</td>
								<td className="num">{s.summands.length}</td>
								<td>
									<Thumb sum={s} grid={grid} geom={thumb} baseId={baseId} />
								</td>
								<td className="sum-equation">
									<Equation sum={s} byName={byName} groups={khipu.groups} />
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

/**
 * Thumbnail scale: cells one unit apart on a grid that fits in 150 × 40 px
 * without a cell falling under 1.5 px. Very tall grids (a khipu with one
 * enormous group) fall back to a single row of cords in khipu order.
 */
interface ThumbGeometry {
	w: number;
	h: number;
	px: number;
	primaryY: number;
	cellsPath: string;
	flat: boolean;
}

function thumbGeometry(grid: XrayGrid): ThumbGeometry {
	const rows = grid.rowsDown + grid.rowsUp;
	const pitch = Math.min(5, 150 / grid.nCols, 40 / (rows + 0.5));
	const flat = pitch < 1.5;
	if (flat) {
		const p = Math.max(1.2, Math.min(5, 150 / grid.n));
		return {
			w: grid.n,
			h: 1.5,
			px: p,
			primaryY: 0,
			cellsPath: "",
			flat,
		};
	}
	const primaryY = grid.rowsUp + (grid.rowsUp > 0 ? 0.5 : 0);
	const d: string[] = [];
	for (const c of grid.cells.values()) {
		const { x, y } = thumbXY(c.col, c.row, primaryY);
		d.push(`M${x},${y}h0.75v0.75h-0.75z`);
	}
	return {
		w: grid.nCols,
		h: primaryY + grid.rowsDown + 0.5,
		px: pitch,
		primaryY,
		cellsPath: d.join(""),
		flat,
	};
}

function thumbXY(col: number, row: number, primaryY: number) {
	return {
		x: col + 0.125,
		y: row >= 0 ? primaryY + 0.375 + row : primaryY - 0.375 + row,
	};
}

/** Where the sum sits on the x-ray: the sum cord in its hand's colour, the summands in ink. */
function Thumb({
	sum,
	grid,
	geom,
	baseId,
}: {
	sum: CordSum;
	grid: XrayGrid;
	geom: ThumbGeometry;
	baseId: string;
}) {
	const color = HAND_COLOR[sum.hand];
	const label = `sum cord at position ${sum.sumIndex + 1} of ${grid.n}, summands ${sum.hand === "R" ? "to its right" : "to its left"}`;
	if (geom.flat) {
		const W = 150;
		const x = (i: number) => ((i + 0.5) / grid.n) * W;
		return (
			<svg width={W} height={12} className="sum-strip" aria-label={label}>
				<line x1={0} x2={W} y1={6} y2={6} stroke="var(--rule)" />
				{sum.summandIndices.map((i) => (
					<line
						key={i}
						x1={x(i)}
						x2={x(i)}
						y1={3}
						y2={9}
						stroke="var(--ink)"
						strokeOpacity={0.7}
						strokeWidth={1.2}
					/>
				))}
				<line
					x1={x(sum.sumIndex)}
					x2={x(sum.sumIndex)}
					y1={0}
					y2={12}
					stroke={color}
					strokeWidth={2}
				/>
			</svg>
		);
	}
	const mark = (name: string, fill: string, pad: number) => {
		const c = grid.cells.get(name);
		if (!c) return null;
		const { x, y } = thumbXY(c.col, c.row, geom.primaryY);
		return (
			<rect
				key={name}
				x={x - pad}
				y={y - pad}
				width={0.75 + 2 * pad}
				height={0.75 + 2 * pad}
				fill={fill}
			/>
		);
	};
	return (
		<svg
			width={geom.w * geom.px}
			height={geom.h * geom.px}
			viewBox={`0 0 ${geom.w} ${geom.h}`}
			className="sum-strip"
			aria-label={label}
		>
			<use href={`#${baseId}`} width={geom.w} height={geom.h} />
			{sum.summands.map((n) => mark(n, "var(--ink)", 0.1))}
			{mark(sum.sum, color, 0.25)}
		</svg>
	);
}

function Equation({
	sum,
	byName,
	groups,
}: {
	sum: CordSum;
	byName: Map<string, Cord>;
	groups: KhipuLike["groups"];
}) {
	return (
		<span>
			{sum.summands.map((n, i) => {
				const c = byName.get(n);
				return (
					<span key={n}>
						{i > 0 && <span className="muted"> + </span>}
						<span className="sum-term">
							<b>{c?.value ?? "?"}</b>
							<span
								className="muted"
								title={c ? groupName(c, groups) : undefined}
							>
								{" "}
								{n}
							</span>
						</span>
					</span>
				);
			})}
		</span>
	);
}
