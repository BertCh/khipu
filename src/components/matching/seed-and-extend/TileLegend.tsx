import type { TileState } from "#/components/matching/NumberTape";

/**
 * A small key for a NumberTape figure's tile states, drawn with the exact
 * same `.tape-tile-*` classes the tape itself uses, so the swatch in the
 * legend and the swatch on the tape are identically styled.
 */
export function TileLegend({
	items,
}: {
	items: { state: TileState; label: string }[];
}) {
	return (
		<div className="sae-legend">
			{items.map((it) => (
				<span key={it.state} className="sae-legend-item">
					<svg
						className="sae-legend-swatch"
						width={14}
						height={14}
						viewBox="0 0 14 14"
						aria-hidden="true"
					>
						<g className={`tape-tile tape-tile-${it.state}`}>
							<rect
								className="tape-swatch"
								width={14}
								height={14}
								rx={3}
								fill="var(--surface-2)"
							/>
						</g>
					</svg>
					{it.label}
				</span>
			))}
		</div>
	);
}

export default TileLegend;
