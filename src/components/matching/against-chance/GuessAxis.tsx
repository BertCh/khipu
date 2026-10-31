/**
 * "You draw it" (Distill idiom): a bare number line the reader clicks to
 * mark a guess before any shuffle has run, so the reveal that follows is
 * compared against a committed prediction rather than read cold.
 */
export interface GuessAxisProps {
	domain: [number, number];
	guess: number | null;
	onGuess?: (v: number) => void;
	locked?: boolean;
	width?: number;
	label?: string;
}

export default function GuessAxis({
	domain,
	guess,
	onGuess,
	locked = false,
	width = 480,
	label = "Guess",
}: GuessAxisProps) {
	const height = 56;
	const pad = 18;
	const trackY = height - 20;
	const [lo, hi] = domain;
	const span = Math.max(1, hi - lo);
	const x = (v: number) => pad + ((v - lo) / span) * (width - 2 * pad);
	const valueAt = (px: number) => lo + ((px - pad) / (width - 2 * pad)) * span;

	const clamp = (v: number) => Math.round(Math.min(hi, Math.max(lo, v)));
	const step = Math.max(1, Math.round(span / 40));

	const place = (clientX: number, rect: DOMRect) => {
		if (locked || !onGuess) return;
		const px = ((clientX - rect.left) / rect.width) * width;
		onGuess(clamp(valueAt(px)));
	};

	const nudge = (delta: number) => {
		if (locked || !onGuess) return;
		onGuess(clamp((guess ?? lo) + delta));
	};

	return (
		<div
			className="mtx-scroll ac-guess-axis-wrap"
			role="slider"
			tabIndex={locked ? -1 : 0}
			aria-valuemin={lo}
			aria-valuemax={hi}
			aria-valuenow={guess ?? lo}
			aria-label={`${label}: click or use the arrow keys to mark a guess between ${lo} and ${hi}${guess != null ? `; your guess is ${guess}` : ""}`}
			onClick={(e) => place(e.clientX, e.currentTarget.getBoundingClientRect())}
			onKeyDown={(e) => {
				if (locked || !onGuess) return;
				if (e.key === "ArrowRight" || e.key === "ArrowUp") {
					e.preventDefault();
					nudge(step);
				} else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
					e.preventDefault();
					nudge(-step);
				} else if (e.key === "Home") {
					e.preventDefault();
					onGuess(lo);
				} else if (e.key === "End") {
					e.preventDefault();
					onGuess(hi);
				}
			}}
		>
			<svg
				className="ac-guess-axis"
				width={width}
				height={height}
				viewBox={`0 0 ${width} ${height}`}
				aria-hidden="true"
			>
				<line
					x1={pad}
					x2={width - pad}
					y1={trackY}
					y2={trackY}
					className={`ac-guess-track${locked ? " is-locked" : ""}`}
				/>
				{[lo, Math.round((lo + hi) / 2), hi].map((t) => (
					<g key={t} className="ac-guess-tick">
						<line x1={x(t)} x2={x(t)} y1={trackY - 4} y2={trackY + 4} />
						<text x={x(t)} y={trackY + 18} textAnchor="middle">
							{t}
						</text>
					</g>
				))}
				{guess != null && (
					<g
						className="ac-guess-mark"
						style={{ transform: `translateX(${x(guess)}px)` }}
					>
						<line y1={trackY - 20} y2={trackY + 6} />
						<circle cy={trackY} r={4} />
						<text y={trackY - 24} textAnchor="middle">
							your guess: {guess}
						</text>
					</g>
				)}
			</svg>
		</div>
	);
}
