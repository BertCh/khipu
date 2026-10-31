import { DISTANCES, INSET, MAIN, PLACES } from "#/lib/stories/coast";

/**
 * The central coast of Peru with the two catalogued find-spots, Lima
 * between them, and the straight-line distance that the story keeps
 * returning to. Coastline and inset outlines are Natural Earth, projected
 * once in coast.ts; everything else is drawn here in that frame.
 */

type PlaceKey = keyof typeof PLACES;

const SITES: {
	key: PlaceKey;
	role: "site" | "city";
	anchor: "start" | "end";
}[] = [
	{ key: "huacho", role: "site", anchor: "end" },
	{ key: "chancay", role: "city", anchor: "end" },
	{ key: "lima", role: "city", anchor: "start" },
	{ key: "pachacamac", role: "site", anchor: "start" },
];

export default function CoastMap() {
	const { width, height } = MAIN;
	const h = PLACES.huacho;
	const p = PLACES.pachacamac;
	// the distance label sits a little seaward of the chord's midpoint
	const mx = (h.x + p.x) / 2 - 46;
	const my = (h.y + p.y) / 2 + 6;
	const insetX = width - INSET.width - 12;
	const insetY = 12;
	return (
		<div className="coast-map">
			<svg
				viewBox={`0 0 ${width} ${height}`}
				role="img"
				aria-label={`Map of the central Peruvian coast. Pachacámac lies just south of Lima; Huacho ${DISTANCES.pachacamacHuacho} km up the coast to the north-west.`}
			>
				<title>Pachacámac and Huacho on the coast of Peru</title>
				<rect width={width} height={height} className="coast-sea" />
				<path d={MAIN.land} className="coast-land" />
				{MAIN.coast.map((d) => (
					<path key={d.slice(0, 24)} d={d} className="coast-line" />
				))}
				<line x1={h.x} y1={h.y} x2={p.x} y2={p.y} className="coast-chord" />
				<text x={mx} y={my} className="coast-distance" textAnchor="middle">
					<tspan x={mx} dy="0">
						{DISTANCES.pachacamacHuacho} km
					</tspan>
					<tspan x={mx} dy="1.2em" className="coast-distance-sub">
						in a straight line
					</tspan>
				</text>
				{SITES.map(({ key, role, anchor }) => {
					const pl = PLACES[key];
					const dx = anchor === "start" ? 9 : -9;
					return (
						<g key={key} className={`coast-place is-${role}`}>
							<circle cx={pl.x} cy={pl.y} r={role === "site" ? 5.5 : 3.5} />
							<text x={pl.x + dx} y={pl.y + 4} textAnchor={anchor}>
								{pl.label}
							</text>
						</g>
					);
				})}
				<text
					x={70}
					y={height - 40}
					className="coast-ocean"
					transform={`rotate(-56 70 ${height - 40})`}
				>
					Pacific Ocean
				</text>
				<g className="coast-inset" transform={`translate(${insetX} ${insetY})`}>
					<rect width={INSET.width} height={INSET.height} />
					{INSET.land.map((d) => (
						<path key={d.slice(0, 24)} d={d} className="coast-inset-land" />
					))}
					{INSET.peru.map((d) => (
						<path key={d.slice(0, 24)} d={d} className="coast-inset-peru" />
					))}
					<rect
						x={INSET.box[0][0]}
						y={INSET.box[0][1]}
						width={INSET.box[1][0] - INSET.box[0][0]}
						height={INSET.box[1][1] - INSET.box[0][1]}
						className="coast-inset-box"
					/>
				</g>
			</svg>
		</div>
	);
}
