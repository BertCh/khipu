import {
	COLLATA_HUES,
	type CollataCord,
	cordTypeMatches,
} from "#/lib/stories/collata";
import "#/styles/threaded.css";

const PAD_X = 18;

/**
 * Knotless coloured cords, as on the Collata khipus: each pendant is drawn in
 * its dyed hue(s), with a hatch for ply direction (S slants like the middle of
 * an S, Z like a Z) and its animal fibre named underneath. Nothing is to
 * scale — Hyland publishes the sequences, not the measurements.
 */
export default function CollataCords({
	cords,
	title,
	showReading = false,
	slot = 64,
	len = 150,
}: {
	cords: CollataCord[];
	title: string;
	showReading?: boolean;
	slot?: number;
	/** drawn cord length in px; the real lengths are unpublished */
	len?: number;
}) {
	const padX = PAD_X;
	const top = showReading ? 40 : 18;
	const width = padX * 2 + cords.length * slot;
	const height = top + len + 58;
	return (
		<svg
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			role="img"
			aria-label={title}
			className="collata-cords"
		>
			<title>{title}</title>
			<line
				x1={padX - 8}
				x2={width - padX + 8}
				y1={top}
				y2={top}
				stroke="var(--cord-casing)"
				strokeWidth={7}
				strokeLinecap="round"
			/>
			<line
				x1={padX - 8}
				x2={width - padX + 8}
				y1={top}
				y2={top}
				stroke={COLLATA_HUES["light brown"]}
				strokeWidth={4.5}
				strokeLinecap="round"
			/>
			{cords.map((c, i) => {
				const x = padX + i * slot + slot / 2;
				const base = COLLATA_HUES[c.colors[0]] ?? "#999";
				const second = c.colors[1] ? COLLATA_HUES[c.colors[1]] : null;
				const y0 = top;
				const y1 = top + len;
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: positional
					<g key={i}>
						{showReading && c.reads && (
							<text
								x={x}
								y={top - 16}
								textAnchor="middle"
								className="collata-syllable"
							>
								{c.reads}
							</text>
						)}
						<line
							x1={x}
							x2={x}
							y1={y0}
							y2={y1}
							stroke="var(--cord-casing)"
							strokeWidth={9}
							strokeLinecap="round"
						/>
						<line
							x1={x}
							x2={x}
							y1={y0}
							y2={y1}
							stroke={base}
							strokeWidth={7}
							strokeLinecap="round"
						/>
						{second && (
							<line
								x1={x}
								x2={x}
								y1={y0}
								y2={y1}
								stroke={second}
								strokeWidth={7}
								strokeDasharray="7 7"
								strokeDashoffset={3}
							/>
						)}
						{/* ply hatch */}
						<g stroke="rgba(0,0,0,0.28)" strokeWidth={1} strokeLinecap="round">
							{Array.from({ length: Math.floor((y1 - y0) / 9) }, (_, j) => {
								const y = y0 + 6 + j * 9;
								const d = c.ply === "S" ? 1 : -1;
								return (
									<line
										// biome-ignore lint/suspicious/noArrayIndexKey: positional
										key={j}
										x1={x - 3}
										x2={x + 3}
										y1={y - 2 * d}
										y2={y + 2 * d}
									/>
								);
							})}
						</g>
						{c.wrapped && (
							<rect
								x={x - 5.5}
								y={y0 + 40}
								width={11}
								height={34}
								rx={2}
								fill="none"
								stroke="var(--ink)"
								strokeWidth={1.2}
								strokeDasharray="2 2"
							/>
						)}
						<text x={x} y={y1 + 12} textAnchor="middle" className="collata-ply">
							{c.ply}
						</text>
						<text
							x={x}
							y={y1 + 24}
							textAnchor="middle"
							className="collata-fiber"
						>
							{c.fibers.join(" / ")}
						</text>
						<g
							transform={`translate(${x - (c.colors.length * 12 - 2) / 2} ${y1 + 30})`}
						>
							{c.colors.map((hue, j) => (
								<rect
									key={hue}
									x={j * 12}
									y={0}
									width={10}
									height={10}
									rx={2}
									fill={COLLATA_HUES[hue] ?? "#999"}
									stroke="var(--rule)"
									strokeWidth={0.6}
								/>
							))}
						</g>
						<title>
							{`${c.colors.join(" / ")}, ${c.fibers.join(" / ")}, ${c.ply} ply${c.wrapped ? ", wrapped" : ""}${c.reads ? ` — read as ${c.reads}` : ""}`}
						</title>
					</g>
				);
			})}
		</svg>
	);
}

/**
 * Two cord sequences stacked, with a thread between every pair of cords of
 * the same type (colour, fibre, ply). A thread here says "the same kind of
 * cord", not "the same value": these cords carry no knots.
 */
export function CollataPairThreads({
	a,
	b,
	titleA,
	titleB,
	labelA,
	labelB,
	slot = 64,
}: {
	a: CollataCord[];
	b: CollataCord[];
	titleA: string;
	titleB: string;
	labelA: string;
	labelB: string;
	slot?: number;
}) {
	const pairs = cordTypeMatches(a, b);
	const n = Math.max(a.length, b.length);
	const width = PAD_X * 2 + n * slot;
	const h = 54;
	const x = (i: number) => PAD_X + i * slot + slot / 2;
	return (
		<div className="thr-pair">
			<h3 className="fig-title">{labelA}</h3>
			<CollataCords cords={a} title={titleA} showReading slot={slot} />
			<svg
				width={width}
				height={h}
				viewBox={`0 0 ${width} ${h}`}
				className="thr-pair-threads"
				role="img"
				aria-label={`${pairs.length} cords of the same type in both: ${pairs
					.map(
						([i, j]) =>
							`cord ${i + 1} of the first is cord ${j + 1} of the second`,
					)
					.join("; ")}`}
			>
				{pairs.map(([i, j]) => {
					const x0 = x(i);
					const x1 = x(j);
					const c = a[i];
					return (
						<g key={`${i}-${j}`}>
							<title>
								{`${c.colors.join(" / ")}, ${c.fibers.join(" / ")}, ${c.ply} ply: cord ${i + 1} of the first, cord ${j + 1} of the second`}
							</title>
							<path
								d={`M${x0},3C${x0},${h / 2} ${x1},${h / 2} ${x1},${h - 3}`}
							/>
							<circle cx={x0} cy={3} r={2.4} />
							<circle cx={x1} cy={h - 3} r={2.4} />
						</g>
					);
				})}
			</svg>
			<CollataCords cords={b} title={titleB} showReading slot={slot} />
			<h3 className="fig-title thr-pair-label-b">{labelB}</h3>
		</div>
	);
}
