export interface KnotExample {
	name: string;
	value: number;
	color: string | null;
	knots: { n: number; type: string; dir: string; value?: number }[];
}

/**
 * Step 1's figure: three of KH0303's cords, knot cluster by knot cluster, to
 * the decimal value `tapeOf` (src/lib/matching/tape.ts) reads off `Cord.value`
 * — the number every other figure in this chapter works from. Data straight
 * from public/data/khipus/KH0303.json, `Cord.knots` in its recorded (pos
 * ascending) order — nearest the primary cord first, so highest place value
 * first and the units cluster last. The full positional rule is explained at
 * /anatomy ("Decimal places").
 */
export function KnotExamples({ examples }: { examples: KnotExample[] }) {
	return (
		<div className="mtx-scroll">
			<table className="ledger-table sae-knot-table">
				<thead>
					<tr>
						<th>Cord</th>
						<th>Knot clusters, nearest the cord first</th>
						<th className="num">Value</th>
					</tr>
				</thead>
				<tbody>
					{examples.map((c) => (
						<tr key={c.name}>
							<td>{c.name}</td>
							<td className="sae-knot-clusters">
								{c.knots.length === 0
									? "no knots"
									: c.knots.map((k, i) => (
											<span
												// biome-ignore lint/suspicious/noArrayIndexKey: clusters are positional along the cord
												key={i}
												className="sae-knot-cluster"
											>
												{k.n}× {k.type}-knot ({k.dir}) = {k.value ?? "?"}
											</span>
										))}
							</td>
							<td className="num">{c.value}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export default KnotExamples;
