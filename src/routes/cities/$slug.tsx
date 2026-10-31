import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { StatTile } from "#/components/charts/Figure";
import {
	CityKey,
	PlaceTip,
	Verdict,
	verdictSentence,
} from "#/components/cities/CityBits";
import KhipuDiagram from "#/components/khipu/KhipuDiagram";
import CordReader from "#/components/story/CordReader";
import {
	getCityIndex,
	getMetroKhipu,
	getMetroNeighbors,
} from "#/lib/cities/data";
import type { CityEncoding, MetroKhipu, PlaceMeta } from "#/lib/cities/types";
import {
	fmtRate,
	fmtUsd,
	fmtWhole,
	possessive,
	QUADRANT,
	supplySideLabel,
} from "#/lib/cities/vocab";
import { getCodes, getColors } from "#/lib/khipu/data";
import type { CordNode, GroupBox } from "#/lib/khipu/layout";
import type { ColorTable, Cord } from "#/lib/khipu/types";

export const Route = createFileRoute("/cities/$slug")({
	loader: async ({ params }) => {
		const slug = params.slug.toLowerCase();
		const [khipu, index, colors, codes, neighbors] = await Promise.all([
			getMetroKhipu(slug),
			getCityIndex(),
			getColors(),
			getCodes(),
			getMetroNeighbors(slug),
		]);
		if (!khipu) throw notFound();
		return { khipu, enc: index.encoding, colors, codes, neighbors };
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData
					? `${loaderData.khipu.city.displayName} — Cities — Khipu`
					: "Cities — Khipu",
			},
		],
	}),
	notFoundComponent: () => (
		<main className="page-wrap">
			<h1 className="page-title">No such metro</h1>
			<p className="lede">
				Slugs look like boston-ma. <Link to="/cities">Browse the metros</Link>{" "}
				to find one.
			</p>
		</main>
	),
	component: Detail,
});

// wider sub-columns than the recorded khipus, since every place hangs two
// or three cords whose knots must stay apart; the row pitch (20 cm) clears a
// nine-knot cluster from 2.4 px/cm up
const ZOOMS = [
	{ label: "Compact", slot: 8, subOffset: 7, pxPerCm: 2.4 },
	{ label: "Normal", slot: 11, subOffset: 9, pxPerCm: 3.4 },
	{ label: "Large", slot: 16, subOffset: 12, pxPerCm: 5 },
];

function Detail() {
	const { khipu, enc, colors, codes, neighbors } = Route.useLoaderData();
	const city = khipu.city;
	const s = khipu.stats;
	const [zoom, setZoom] = useState(city.nPlaces > 60 ? 0 : 1);
	const [showNames, setShowNames] = useState(city.nPlaces <= 60);
	const [showValues, setShowValues] = useState(false);
	const [showGroups, setShowGroups] = useState(true);
	const [selected, setSelected] = useState<string | null>(null);
	// names hang below the cords as rotated text, so give them room
	const layout = useMemo(
		() => ({ ...ZOOMS[zoom], padBottom: showNames ? 120 : 24 }),
		[zoom, showNames],
	);

	const placeOf = useCallback(
		(c: Cord): PlaceMeta | undefined => khipu.places[c.parent ?? c.name],
		[khipu.places],
	);

	const tip = useCallback(
		(node: CordNode) => {
			const p = placeOf(node.cord);
			return p ? (
				<PlaceTip node={node} place={p} enc={enc} colors={colors} />
			) : null;
		},
		[enc, colors, placeOf],
	);

	const groupLabel = useCallback(
		(g: GroupBox) => {
			const first = g.pendants[0];
			return first ? (khipu.places[first.cord.name]?.state ?? null) : null;
		},
		[khipu.places],
	);

	const label = useCallback(
		(c: Cord) => {
			if (showValues) return c.value != null ? fmtWhole(c.value) : null;
			if (!showNames) return null;
			return c.kind === "pendant" ? (khipu.places[c.name]?.name ?? null) : null;
		},
		[showValues, showNames, khipu.places],
	);

	const principal = city.principalCord
		? khipu.cords.find((c) => c.name === city.principalCord)
		: undefined;
	const principalMeta = principal ? khipu.places[principal.name] : undefined;
	const nIncorporated = Object.values(khipu.places).filter(
		(p) => p.class === "incorporated",
	).length;
	const jobs = Object.values(khipu.places).reduce(
		(a, p) => a + (p.jobsHere ?? 0),
		0,
	);

	return (
		<main className="page-wrap-wide">
			<nav className="prevnext" aria-label="Neighbouring metros by population">
				<span>
					{neighbors.prev ? (
						<Link to="/cities/$slug" params={{ slug: neighbors.prev.slug }}>
							← {neighbors.prev.name}
						</Link>
					) : (
						<Link to="/cities">← All metros</Link>
					)}
				</span>
				<span style={{ color: "var(--ink-3)" }}>
					{neighbors.position} of {neighbors.total} by population
				</span>
				<span>
					{neighbors.next && (
						<Link to="/cities/$slug" params={{ slug: neighbors.next.slug }}>
							{neighbors.next.name} →
						</Link>
					)}
				</span>
			</nav>

			<header className="detail-head">
				<div>
					<h1 className="page-title">
						{city.displayName}
						<span className="aliases">
							{city.states.length > 1 ? city.states.join("–") : city.division}
						</span>
					</h1>
					<p className="city-verdict">
						<Verdict
							quadrant={city.quadrant}
							borderline={city.borderline}
							enc={enc}
							colors={colors}
							long
						/>
						<span>
							{verdictSentence(city.name, city.quadrant, city.borderline)}
							{city.quadrant ? ` — ${QUADRANT[city.quadrant].gloss}.` : "."}
						</span>
					</p>
					<dl className="meta">
						<dt>Population</dt>
						<dd>
							{fmtWhole(city.population)}{" "}
							<span className="muted">{fmtRate(city.popCagr)}</span>
						</dd>
						<dt>Mean wage</dt>
						<dd>
							{fmtUsd(city.wage)}{" "}
							<span className="muted">{fmtRate(city.wageCagr)}</span>
						</dd>
						<dt>Home values</dt>
						<dd>
							<span className="muted">{fmtRate(city.costCagr)}</span>
						</dd>
						<dt>Constraint</dt>
						<dd>{supplySideLabel(city.supplySide)}</dd>
						<dt>Places</dt>
						<dd>
							{city.nPlaces} in {city.states.join(" and ")}: {nIncorporated}{" "}
							incorporated, {city.nPlaces - nIncorporated} census-designated
						</dd>
						<dt>Principal city</dt>
						<dd>
							{city.principalPlaceName}
							{principalMeta?.population != null
								? `, ${fmtWhole(principalMeta.population)} people`
								: ""}
						</dd>
					</dl>
				</div>
				<div>
					<h3 style={{ marginBottom: "0.4rem" }}>As a khipu</h3>
					<dl className="meta">
						<dt>Primary cord</dt>
						<dd>{khipu.primary.length} cm, coloured by the metro's verdict</dd>
						<dt>Groups</dt>
						<dd>
							{city.states.length === 1
								? `one, for ${city.states[0]}`
								: `one per state: ${city.states.join(", ")}`}
							; {city.principalPlaceName} leads
						</dd>
						<dt>Knot rows</dt>
						<dd>
							{city.digits}, {enc.pitch} cm apart — room for{" "}
							{fmtWhole(10 ** city.digits - 1)}
						</dd>
						<dt>On the country's khipu</dt>
						<dd>
							<Link to="/cities">a pendant of {fmtWhole(city.population)}</Link>
							, its population
						</dd>
						<dt>Beneath it</dt>
						<dd>
							{city.nPlaces} place khipus, one per pendant, each a group per
							year
							{principalMeta ? (
								<>
									{" "}
									—{" "}
									<Link
										to="/cities/$slug/$place"
										params={{ slug: city.slug, place: principalMeta.slug }}
									>
										{possessive(principalMeta.name)}
									</Link>{" "}
									first
								</>
							) : null}
						</dd>
						<dt>Source</dt>
						<dd>
							Growth Lab Cities Tool, {city.window.start}–{city.window.end},
							tied by scripts/build_cities.py
						</dd>
					</dl>
				</div>
			</header>

			<div className="stats detail-stats">
				<StatTile
					label="pendant cords"
					value={s.nPendants}
					hint={`one per place, in ${s.nGroups} groups`}
				/>
				<StatTile
					label="subsidiary cords"
					value={s.nSubsidiaries}
					hint={
						nIncorporated === 1
							? "one place carries a population cord"
							: `${nIncorporated} places carry a population cord`
					}
				/>
				<StatTile label="knots" value={s.nKnots} />
				<StatTile
					label="resident workers"
					value={s.totalValue}
					hint="sum of the pendants"
				/>
				<StatTile
					label="jobs located in the places"
					value={jobs}
					hint="sum of the first subsidiaries"
				/>
			</div>

			<section className="section">
				<h2>Diagram</h2>
				<p className="prose" style={{ marginBottom: "0.9rem" }}>
					Each place hangs from the primary cord in its state's group, the
					principal city first and the rest by size. Its pendant counts resident
					workers, the brown subsidiary jobs located there, the grey one
					population. Knot rows line up across the khipu, so knots reaching
					higher mean a bigger number. Hover a cord for the place; click to
					select it. Each place also has its own khipu, with a group per year,
					opened from the table or the selection.
				</p>
				<div className="diagram-tools">
					{ZOOMS.map((z, i) => (
						<button
							key={z.label}
							type="button"
							className="btn"
							aria-pressed={zoom === i}
							onClick={() => setZoom(i)}
						>
							{z.label}
						</button>
					))}
					<span className="spacer" />
					<button
						type="button"
						className="btn"
						aria-pressed={showNames}
						onClick={() => {
							setShowNames((v) => !v);
							setShowValues(false);
						}}
					>
						Show names
					</button>
					<button
						type="button"
						className="btn"
						aria-pressed={showValues}
						onClick={() => {
							setShowValues((v) => !v);
							setShowNames(false);
						}}
					>
						Show values
					</button>
					<button
						type="button"
						className="btn"
						aria-pressed={showGroups}
						onClick={() => setShowGroups((v) => !v)}
					>
						Show groups
					</button>
					{selected && (
						<>
							<button
								type="button"
								className="btn"
								onClick={() => setSelected(null)}
							>
								Clear selection (
								{placeOfName(khipu, selected)?.name ?? selected})
							</button>
							{placeOfName(khipu, selected) && (
								<Link
									to="/cities/$slug/$place"
									params={{
										slug: city.slug,
										place: placeOfName(khipu, selected)?.slug ?? "",
									}}
									className="btn"
								>
									Open {possessive(placeOfName(khipu, selected)?.name ?? "")}{" "}
									khipu →
								</Link>
							)}
						</>
					)}
				</div>
				<KhipuDiagram
					khipu={khipu}
					colors={colors}
					codes={codes}
					layout={layout}
					showGroups={showGroups}
					selected={selected}
					onSelect={setSelected}
					groupLabel={groupLabel}
					label={label}
					renderTooltip={tip}
				/>
			</section>

			{principal && principalMeta && (
				<section className="section">
					<h2>Reading {principalMeta.name}'s cord</h2>
					<p className="prose" style={{ marginBottom: "0.9rem" }}>
						The principal city's pendant, enlarged: {fmtWhole(principal.value)}{" "}
						resident workers, one decimal place per row. Single knots count tens
						and up, a long knot's turns are the units, a figure-eight is a one,
						an empty row is zero. The cord extends past the units row by the
						residents' mean wage, {fmtUsd(principalMeta.wage)} at 1 cm per{" "}
						{fmtUsd(enc.wagePerCm)}.
					</p>
					<div className="reader-pair">
						<CordReader
							cord={principal}
							colors={colors}
							pxPerCm={5.5}
							title={`${principalMeta.name}: resident workers`}
						/>
					</div>
				</section>
			)}

			<section className="section">
				<h2>How to read it</h2>
				<CityKey enc={enc} colors={colors} scope="metro" />
			</section>

			<section className="section">
				<h2>Places</h2>
				<p className="prose" style={{ marginBottom: "0.9rem" }}>
					Every place in khipu order, with the atlas's numbers. Click a row to
					highlight its pendant; the name opens the place's khipu.
				</p>
				<PlaceTable
					khipu={khipu}
					enc={enc}
					colors={colors}
					selected={selected}
					onSelect={setSelected}
				/>
			</section>
		</main>
	);
}

/** The place a cord belongs to, by the cord's name (pendant or subsidiary). */
function placeOfName(khipu: MetroKhipu, name: string): PlaceMeta | undefined {
	return khipu.places[name] ?? khipu.places[name.replace(/s\d+$/, "")];
}

function PlaceTable({
	khipu,
	enc,
	colors,
	selected,
	onSelect,
}: {
	khipu: MetroKhipu;
	enc: CityEncoding;
	colors: ColorTable;
	selected: string | null;
	onSelect: (name: string | null) => void;
}) {
	const pendants = khipu.cords.filter((c) => c.kind === "pendant");
	const groupState = (c: Cord) =>
		c.group === 0 ? "Metro" : (khipu.places[c.name]?.state ?? "");
	return (
		<div
			className="table-wrap"
			style={{ maxHeight: "70vh", overflowY: "auto" }}
		>
			<table className="data-table">
				<thead>
					<tr>
						<th>Cord</th>
						<th>Group</th>
						<th>Place</th>
						<th>Class</th>
						<th>Verdict</th>
						<th className="num">Resident workers</th>
						<th className="num">Jobs here</th>
						<th className="num">Population</th>
						<th className="num">Mean wage</th>
						<th className="num">Home value</th>
						<th className="num">Cords</th>
						<th className="num">Knots</th>
					</tr>
				</thead>
				<tbody>
					{pendants.map((c) => {
						const p = khipu.places[c.name];
						if (!p) return null;
						const subs = khipu.cords.filter((x) => x.parent === c.name);
						const knots = c.nKnots + subs.reduce((a, x) => a + x.nKnots, 0);
						// the row lights up for the pendant or either of its subsidiaries
						const isSel =
							selected != null &&
							(selected === c.name || selected.startsWith(`${c.name}s`));
						return (
							<tr
								key={c.name}
								className={isSel ? "is-selected" : undefined}
								onClick={() => onSelect(selected === c.name ? null : c.name)}
								style={{ cursor: "pointer" }}
							>
								<td className="cell-muted">{c.name}</td>
								<td className="cell-muted">{groupState(c)}</td>
								<td>
									<Link
										to="/cities/$slug/$place"
										params={{ slug: khipu.city.slug, place: p.slug }}
										onClick={(e) => e.stopPropagation()}
									>
										{p.name}
									</Link>
								</td>
								<td className="cell-muted">
									{p.class === "CDP" ? "CDP" : "city"}
								</td>
								<td>
									<Verdict
										quadrant={p.quadrant}
										borderline={p.borderline}
										enc={enc}
										colors={colors}
									/>
								</td>
								<td className="num">{fmtWhole(p.residentWorkers)}</td>
								<td className="num">{fmtWhole(p.jobsHere)}</td>
								<td className="num">{fmtWhole(p.population)}</td>
								<td className="num">{fmtUsd(p.wage)}</td>
								<td className="num">{fmtUsd(p.homeValue)}</td>
								<td className="num">{1 + subs.length}</td>
								<td className="num">{knots}</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
