import type { SwStep } from "#/lib/matching/swTrace";

const OP_GLYPH: Record<SwStep["op"], string> = {
	match: "=",
	slip: "≈",
	mismatch: "≠",
	gapA: "–",
	gapB: "–",
};

const OP_CLASS: Record<SwStep["op"], string> = {
	match: "is-match",
	slip: "is-slip",
	mismatch: "is-mismatch",
	gapA: "is-gap",
	gapB: "is-gap",
};

export interface DiffReadingProps {
	/** the aligned (possibly truncated/reversed) values, as in SwTraceResult */
	a: number[];
	b: number[];
	path: SwStep[];
	aLabel?: string;
	bLabel?: string;
}

/**
 * The traceback printed as two tapes with gap marks: a reading row, an
 * operator row (match / slip / mismatch / gap, glyph and colour together)
 * and the other reading row. Source: src/lib/matching/swTrace.ts (`SwStep`).
 */
export default function DiffReading({
	a,
	b,
	path,
	aLabel = "A",
	bLabel = "B",
}: DiffReadingProps) {
	if (path.length === 0) {
		return (
			<p className="muted">No local alignment ends at this cell (H = 0).</p>
		);
	}
	const counts = { match: 0, slip: 0, mismatch: 0, gap: 0 };
	for (const s of path) {
		if (s.op === "gapA" || s.op === "gapB") counts.gap++;
		else counts[s.op]++;
	}
	return (
		<div className="mtx-scroll">
			<div
				className="btr-diff"
				role="img"
				aria-label={`Alignment of ${path.length} steps: ${counts.match} matches, ${counts.slip} slips, ${counts.mismatch} mismatches, ${counts.gap} gaps`}
			>
				<div className="btr-diff-row">
					<span className="btr-diff-rowlabel">{aLabel}</span>
					{path.map((s, k) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: path steps are positional, not identified
						<span key={k} className="btr-diff-cell">
							{s.op === "gapA" ? "·" : a[s.i - 1]}
						</span>
					))}
				</div>
				<div className="btr-diff-row btr-diff-op">
					<span className="btr-diff-rowlabel" aria-hidden="true" />
					{path.map((s, k) => {
						const cls = `btr-diff-cell btr-diff-glyph ${OP_CLASS[s.op]}`;
						return (
							// biome-ignore lint/suspicious/noArrayIndexKey: path steps are positional, not identified
							<span key={k} className={cls} title={s.op}>
								{OP_GLYPH[s.op]}
							</span>
						);
					})}
				</div>
				<div className="btr-diff-row">
					<span className="btr-diff-rowlabel">{bLabel}</span>
					{path.map((s, k) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: path steps are positional, not identified
						<span key={k} className="btr-diff-cell">
							{s.op === "gapB" ? "·" : b[s.j - 1]}
						</span>
					))}
				</div>
			</div>
			<ul className="btr-diff-legend">
				<li>
					<span className="btr-diff-glyph is-match" aria-hidden="true">
						=
					</span>
					match ({counts.match})
				</li>
				<li>
					<span className="btr-diff-glyph is-slip" aria-hidden="true">
						≈
					</span>
					slip ({counts.slip})
				</li>
				<li>
					<span className="btr-diff-glyph is-mismatch" aria-hidden="true">
						≠
					</span>
					mismatch ({counts.mismatch})
				</li>
				<li>
					<span className="btr-diff-glyph is-gap" aria-hidden="true">
						–
					</span>
					gap ({counts.gap})
				</li>
			</ul>
		</div>
	);
}
