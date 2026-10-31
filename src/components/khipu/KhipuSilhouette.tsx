import { hexFor } from "#/lib/khipu/colors";
import type { ColorTable } from "#/lib/khipu/types";

/**
 * A thumbnail of a khipu built from the index record alone: one hairline per
 * pendant, length-scaled, in the cord's colour. Used in the browse table.
 */
export interface SilhouetteCord {
	length: number | null;
	color: string | null;
	group?: number;
}

interface Props {
	cords: SilhouetteCord[];
	colors: ColorTable;
	width?: number;
	height?: number;
}

export default function KhipuSilhouette({
	cords,
	colors,
	width = 140,
	height = 30,
}: Props) {
	if (cords.length === 0)
		return <svg width={width} height={height} aria-hidden="true" />;
	// a khipu with more pendants than the thumbnail has pixel columns is drawn
	// one bin per column: the longest cord in the bin, in the first one's colour
	const drawn = binCords(cords, width - 2);
	const n = drawn.length;
	const maxLen = Math.max(1, ...drawn.map((c) => c.length ?? 0));
	const step = (width - 2) / n;
	const usable = height - 4;
	return (
		<svg
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			aria-hidden="true"
			className="kh-silhouette"
		>
			<line
				x1={0}
				x2={width}
				y1={1.5}
				y2={1.5}
				stroke="var(--ink-3)"
				strokeWidth={1}
			/>
			{drawn.map((c, i) => {
				const x = 1 + i * step + step / 2;
				const h = ((c.length ?? 0) / maxLen) * usable;
				const sw = Math.max(0.6, Math.min(1.4, step * 0.7));
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: positional
					<g key={i}>
						<line
							x1={x}
							x2={x}
							y1={2}
							y2={2 + Math.max(1, h)}
							stroke="var(--cord-casing)"
							strokeWidth={sw + 1}
						/>
						<line
							x1={x}
							x2={x}
							y1={2}
							y2={2 + Math.max(1, h)}
							stroke={hexFor(c.color?.split(/[-:%^/(]/)[0], colors)}
							strokeWidth={sw}
						/>
					</g>
				);
			})}
		</svg>
	);
}

function binCords(cords: SilhouetteCord[], width: number): SilhouetteCord[] {
	const n = cords.length;
	// a fractional width would let the last bin run past the array
	const columns = Math.max(1, Math.floor(width));
	if (n <= columns) return cords;
	const out: SilhouetteCord[] = [];
	for (let b = 0; b < columns; b++) {
		const from = Math.floor((b * n) / columns);
		const to = Math.max(from + 1, Math.floor(((b + 1) * n) / columns));
		let best = cords[from];
		for (let i = from + 1; i < to; i++)
			if ((cords[i].length ?? 0) > (best.length ?? 0)) best = cords[i];
		out.push({ ...best, color: cords[from].color });
	}
	return out;
}
