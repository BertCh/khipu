import { hexFor } from "#/lib/khipu/colors";
import type { ColorTable, Cord, Khipu } from "#/lib/khipu/types";
import { sextets } from "#/lib/stories/derive";

export const MOIETY_COLOR = {
	V: "var(--moiety-v)",
	R: "var(--moiety-r)",
	U: "var(--ink-3)",
} as const;

/**
 * Every six-cord group of the Santa Valley khipus as one glyph — six hair
 * lines in the cords' recorded colours, the first cord's value as a bar, and
 * a foot coloured by the group's attachment direction. If the match with the
 * 1670 revisita holds, each glyph is one named tributary.
 */
export default function PeopleGrid({
	khipus,
	colors,
	selected,
	onSelect,
	showMoiety,
}: {
	khipus: Khipu[];
	colors: ColorTable;
	selected: { id: string; i: number } | null;
	onSelect: (sel: { id: string; i: number; cords: Cord[] } | null) => void;
	showMoiety: boolean;
}) {
	return (
		<div className="people">
			{khipus.map((k) => {
				const groups = sextets(k);
				return (
					<div key={k.id} className="people-row">
						<div className="people-label">
							<strong>{k.aliases[0] ?? k.id}</strong>
							<span>
								{groups.length} groups
								{groups.at(-1)?.length !== 6 ? ", last incomplete" : ""}
							</span>
						</div>
						<div className="people-cells">
							{groups.map((g, i) => {
								const attach = g[0].attach ?? "U";
								const isSel = selected?.id === k.id && selected.i === i;
								return (
									<button
										type="button"
										// biome-ignore lint/suspicious/noArrayIndexKey: positional
										key={i}
										className={`person ${isSel ? "is-selected" : ""}`}
										onClick={() =>
											onSelect(isSel ? null : { id: k.id, i, cords: g })
										}
										aria-pressed={isSel}
										title={`${k.aliases[0]} group ${i + 1}: first cord ${g[0].value ?? "—"}, ${attach === "R" ? "recto" : attach === "V" ? "verso" : "unrecorded"} attachment`}
									>
										<svg
											width={26}
											height={30}
											viewBox="0 0 26 30"
											aria-hidden="true"
										>
											{g.map((c, j) => {
												const code = c.colorParsed?.[0]?.codes[0];
												const h = 4 + Math.min(18, (c.length ?? 30) * 0.45);
												return (
													<g key={c.name}>
														<line
															x1={3 + j * 4}
															x2={3 + j * 4}
															y1={2}
															y2={2 + h}
															stroke="var(--cord-casing)"
															strokeWidth={3.2}
															strokeLinecap="round"
														/>
														<line
															x1={3 + j * 4}
															x2={3 + j * 4}
															y1={2}
															y2={2 + h}
															stroke={hexFor(code, colors)}
															strokeWidth={2.2}
															strokeLinecap="round"
														/>
													</g>
												);
											})}
											<rect
												x={1}
												y={25}
												width={24}
												height={3}
												rx={1.5}
												fill={
													showMoiety
														? MOIETY_COLOR[attach as keyof typeof MOIETY_COLOR]
														: "var(--hairline)"
												}
											/>
										</svg>
									</button>
								);
							})}
						</div>
					</div>
				);
			})}
		</div>
	);
}
