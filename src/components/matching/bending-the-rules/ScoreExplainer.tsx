import { useId, useMemo, useState } from "react";
import { isSlip } from "#/lib/engine/tests/align";
import { DEFAULT_SW_PARAMS, subScoreP } from "#/lib/matching/swTrace";

export interface ScoreExplainerProps {
	ic: (v: number) => number;
}

/**
 * Describes which of `isSlip`'s own branches a pair matches, for the UI text
 * only — the score itself always comes straight from `subScoreP`/`isSlip`,
 * never from this function.
 */
function slipKind(a: number, b: number): string | null {
	if (a === b || a <= 0 || b <= 0) return null;
	if (Math.abs(a - b) === 1) return "off by one";
	if (a === 10 * b || b === 10 * a) return "off by a factor of ten";
	const sa = String(a);
	const sb = String(b);
	if (sa.length === sb.length) {
		let nd = 0;
		let dd = 0;
		for (let i = 0; i < sa.length; i++) {
			if (sa[i] !== sb[i]) {
				nd++;
				dd = Math.abs(sa.charCodeAt(i) - sb.charCodeAt(i));
			}
		}
		if (nd === 1 && dd === 1) return "one digit off by one";
		if (sa.length >= 2 && [...sa].sort().join("") === [...sb].sort().join(""))
			return "the digits transposed";
	}
	if (Math.abs(sa.length - sb.length) === 1) {
		const [lo, hi] = sa.length < sb.length ? [sa, sb] : [sb, sa];
		for (let i = 0; i < hi.length; i++) {
			if (hi.slice(0, i) + hi.slice(i + 1) === lo) return "a digit dropped";
		}
	}
	return "a recording slip";
}

interface Example {
	label: string;
	a: number;
	b: number;
	note?: string;
}

const EXAMPLES: Example[] = [
	{ label: "equal, a rare value", a: 2904, b: 2904 },
	{ label: "equal, a common value", a: 1, b: 1 },
	{ label: "both blank", a: 0, b: 0 },
	{ label: "blank against a value", a: 0, b: 100 },
	{ label: "off by one", a: 21, b: 22 },
	{ label: "a digit off by one", a: 100, b: 110, note: "AS175/UR233, step 5" },
	{ label: "×10", a: 100, b: 10 },
	{ label: "digits transposed", a: 12, b: 21 },
	{ label: "a digit dropped", a: 123, b: 13 },
	{ label: "unrelated", a: 100, b: 120, note: "AS175/UR233, step 5" },
];

function ruleFor(a: number, b: number, ic: (v: number) => number): string {
	if (a === b) {
		if (a === 0) return "both blank: score is 0 — blank cords align freely.";
		return `equal, nonzero: max(0.1, IC(${a}) − 3) = max(0.1, ${ic(a).toFixed(2)} − 3).`;
	}
	if (a === 0 || b === 0) return "blank against a value: always −1.5 (ZMIS).";
	if (isSlip(a, b)) {
		const kind = slipKind(a, b);
		const mean = 0.5 * (ic(a) + ic(b));
		return `a slip, ${kind}: max(−3, 0.5 × mean(IC(${a}), IC(${b})) − 3) = max(−3, ${(0.5 * mean).toFixed(2)} − 3).`;
	}
	return "unrelated values: always −3 (MIS).";
}

/**
 * Pick two values and see align.ts's substitution rule score them, computed
 * live with the real corpus-wide icOf. Source: src/lib/engine/tests/align.ts
 * (`isSlip`, the rule itself), src/lib/matching/swTrace.ts (`subScoreP`, a
 * parameterised copy of the same formula).
 */
export default function ScoreExplainer({ ic }: ScoreExplainerProps) {
	const [a, setA] = useState(100);
	const [b, setB] = useState(110);
	const score = useMemo(
		() => subScoreP(a, b, ic, DEFAULT_SW_PARAMS),
		[a, b, ic],
	);
	const rule = useMemo(() => ruleFor(a, b, ic), [a, b, ic]);
	const idA = useId();
	const idB = useId();

	const clamp = (v: number) => Math.max(0, Math.min(99999, Math.trunc(v) || 0));

	return (
		<div className="btr-score">
			<div className="diagram-tools btr-score-pickers">
				<label className="btr-score-field" htmlFor={idA}>
					a
					<input
						id={idA}
						type="number"
						min={0}
						max={99999}
						value={a}
						onChange={(e) => setA(clamp(Number(e.target.value)))}
					/>
				</label>
				<label className="btr-score-field" htmlFor={idB}>
					b
					<input
						id={idB}
						type="number"
						min={0}
						max={99999}
						value={b}
						onChange={(e) => setB(clamp(Number(e.target.value)))}
					/>
				</label>
				<div className="btr-score-readout" aria-live="polite">
					score <strong>{score.toFixed(2)}</strong>
				</div>
			</div>
			<p className="btr-score-rule">{rule}</p>
			<div className="ledger btr-score-table-wrap">
				<table className="ledger-table">
					<thead>
						<tr>
							<th>case</th>
							<th className="num">a</th>
							<th className="num">b</th>
							<th className="num">score</th>
						</tr>
					</thead>
					<tbody>
						{EXAMPLES.map((ex) => (
							<tr key={ex.label}>
								<td>
									<button
										type="button"
										className="btn btr-score-try"
										aria-pressed={a === ex.a && b === ex.b}
										onClick={() => {
											setA(ex.a);
											setB(ex.b);
										}}
									>
										{ex.label}
									</button>
									{ex.note && (
										<span className="muted btr-score-note"> ({ex.note})</span>
									)}
								</td>
								<td className="num">{ex.a}</td>
								<td className="num">{ex.b}</td>
								<td className="num">
									{subScoreP(ex.a, ex.b, ic, DEFAULT_SW_PARAMS).toFixed(2)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
