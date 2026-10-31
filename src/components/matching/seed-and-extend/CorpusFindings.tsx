import { Link } from "@tanstack/react-router";
import type { ScanFile } from "#/lib/stories/links";

const CLASS: { key: "6" | "5" | "4"; label: string }[] = [
	{ key: "6", label: "six or more" },
	{ key: "5", label: "exactly five" },
	{ key: "4", label: "exactly four" },
];

/**
 * Step 7's figure: the scan's results across the whole corpus, straight from
 * public/data/stories/links.json (written by scripts/build_links.py — the
 * same rule this chapter runs live, at corpus scale). The chance discussion
 * belongs to chapter 5; this is only the count.
 */
export function CorpusFindings({ scan }: { scan: ScanFile }) {
	const total = scan.pairs.length;
	return (
		<div className="sae-corpus">
			<div className="ledger">
				<table className="ledger-table">
					<thead>
						<tr>
							<th>Longest shared run</th>
							<th className="num">Pairs found</th>
							<th className="num">Mean of {scan.shuffles} shuffled corpora</th>
						</tr>
					</thead>
					<tbody>
						{CLASS.map((c) => {
							const row = scan.baseline[c.key];
							return (
								<tr key={c.key}>
									<td>{c.label}</td>
									<td className="num">{row.observed}</td>
									<td className="num">{row.shuffled}</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			<p className="muted sae-corpus-note">
				{total} pairs of khipus share a run of at least four values, forward or
				with one khipu reversed. Every one of them is on the{" "}
				<Link to="/network">network page</Link>; chapter 5,{" "}
				<Link to="/matching/against-chance">against chance</Link>, asks how many
				of these a shuffle would give on its own.
			</p>
		</div>
	);
}

export default CorpusFindings;
