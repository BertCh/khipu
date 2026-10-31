import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { StatTile } from "#/components/charts/Figure";
import {
	CityKey,
	PlaceYearTip,
	Verdict,
	verdictSentence,
} from "#/components/cities/CityBits";
import KhipuDiagram from "#/components/khipu/KhipuDiagram";
import CordReader from "#/components/story/CordReader";
import { getCityIndex, getPlaceKhipu } from "#/lib/cities/data";
import type { PlaceKhipu } from "#/lib/cities/types";
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
import type { Cord } from "#/lib/khipu/types";

/**
 * The third level of the city collection: one place's khipu, a group per
 * year, tied on request from the metro's series file. The trailing
 * underscore in the file name keeps it out from under the metro page.
 */
export const Route = createFileRoute("/cities/$slug_/$place")({
	loader: async ({ params }) => {
		const metro = params.slug.toLowerCase();
		const place = params.place.toLowerCase();
		const [page, index, colors, codes] = await Promise.all([
			getPlaceKhipu(metro, place),
			getCityIndex(),
			getColors(),
			getCodes(),
		]);
		if (!page) throw notFound();
		return { ...page, enc: index.encoding, colors, codes };
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData
					? `${loaderData.khipu.city.name}, ${loaderData.khipu.city.metro.displayName} — Cities — Khipu`
					: "Cities — Khipu",
			},
		],
	}),
	notFoundComponent: () => (
		<main className="page-wrap">
			<h1 className="page-title">No such place</h1>
			<p className="lede">
				A place is named under its metro, as in /cities/boston-ma/cambridge.{" "}
				<Link to="/cities">Browse the metros</Link> and open one to find its
				places.
			</p>
		</main>
	),
	component: Detail,
});

// the same spacing as the metro page: every work cord hangs two subsidiaries
const ZOOMS = [
	{ label: "Compact", slot: 8, subOffset: 7, pxPerCm: 2.4 },
	{ label: "Normal", slot: 11, subOffset: 9, pxPerCm: 3.4 },
	{ label: "Large", slot: 16, subOffset: 12, pxPerCm: 5 },
];

const pct = (part: number | null, whole: number | null) =>
	part != null && whole ? `${Math.round((100 * part) / whole)} %` : null;

function Detail() {
	const { khipu, prev, next, position, total, enc, colors, codes } =
		Route.useLoaderData();
	const city = khipu.city;
	const s = khipu.stats;
	const [zoom, setZoom] = useState(1);
	const [showValues, setShowValues] = useState(false);
	const [showGroups, setShowGroups] = useState(true);
	const [selected, setSelected] = useState<string | null>(null);
	const layout = useMemo(
		() => ({ ...ZOOMS[zoom], padBottom: showValues ? 80 : 24 }),
		[zoom, showValues],
	);

	const tip = useCallback(
		(node: CordNode) => (
			<PlaceYearTip node={node} khipu={khipu} enc={enc} colors={colors} />
		),
		[khipu, enc, colors],
	);
	const groupLabel = useCallback(
		(g: GroupBox) => String(khipu.yearRows[g.index]?.year ?? ""),
		[khipu.yearRows],
	);
	const label = useCallback(
		(c: Cord) =>
			showValues && c.value != null && c.kind === "pendant"
				? fmtWhole(c.value)
				: null,
		[showValues],
	);

	// the year the metro khipu carries, and its cords, enlarged below
	const lastYear = city.lastCommuteYear
		? khipu.yearRows.find((y) => y.year === city.lastCommuteYear)
		: undefined;
	const latest = khipu.yearRows[khipu.yearRows.length - 1];
	const cordNamed = (name?: string) =>
		name ? khipu.cords.find((c) => c.name === name) : undefined;
	const residentsCord = cordNamed(lastYear?.cords.residents);
	const jobsCord = cordNamed(lastYear?.cords.jobs);
	const selectedYear = selected ? khipu.roles[selected]?.year : undefined;
	const metroTo = {
		to: "/cities/$slug",
		params: { slug: city.metro.slug },
	} as const;

	return (
		<main className="page-wrap-wide">
			<nav className="prevnext" aria-label="Neighbouring places in khipu order">
				<span>
					{prev ? (
						<Link
							to="/cities/$slug/$place"
							params={{ slug: city.metro.slug, place: prev.slug }}
						>
							← {prev.name}
						</Link>
					) : (
						<Link {...metroTo}>← {city.metro.displayName}</Link>
					)}
				</span>
				<span style={{ color: "var(--ink-3)" }}>
					{position} of {total} places, in khipu order
				</span>
				<span>
					{next && (
						<Link
							to="/cities/$slug/$place"
							params={{ slug: city.metro.slug, place: next.slug }}
						>
							{next.name} →
						</Link>
					)}
				</span>
			</nav>

			<p className="story-crumb">
				<Link to="/cities">United States</Link>
				<span>›</span>
				<Link {...metroTo}>{city.metro.displayName}</Link>
				<span>›</span>
				<span>{city.name}</span>
			</p>

			<header className="detail-head">
				<div>
					<h1 className="page-title">
						{city.name}
						<span className="aliases">
							{city.class === "CDP" ? "census-designated place" : "city"} in{" "}
							{city.stateName ?? city.state}
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
							{city.population != null ? (
								<>
									{fmtWhole(city.population)}{" "}
									<span className="muted">
										{latest?.year}, {fmtRate(city.popCagr)}
									</span>
								</>
							) : (
								<span className="muted">
									not counted — the atlas has no population series for
									census-designated places
								</span>
							)}
						</dd>
						<dt>Mean wage</dt>
						<dd>
							{fmtUsd(city.wage)}{" "}
							<span className="muted">{fmtRate(city.wageCagr)}</span>
						</dd>
						<dt>Home value</dt>
						<dd>
							{fmtUsd(latest?.homeValue)}{" "}
							<span className="muted">{fmtRate(city.costCagr)}</span>
						</dd>
						<dt>Constraint</dt>
						<dd>{supplySideLabel(city.supplySide)}</dd>
						{lastYear && (
							<>
								<dt>Residents who work</dt>
								<dd>
									{fmtWhole(lastYear.residentWorkers)}{" "}
									<span className="muted">
										{lastYear.year}: {fmtWhole(lastYear.liveWorkHere)} (
										{pct(lastYear.liveWorkHere, lastYear.residentWorkers)}) work
										in {city.name}, {fmtWhole(lastYear.outCommuters)} commute
										out
									</span>
								</dd>
								<dt>Jobs here</dt>
								<dd>
									{fmtWhole(lastYear.jobsHere)}{" "}
									<span className="muted">
										{fmtWhole(lastYear.liveWorkHere)} (
										{pct(lastYear.liveWorkHere, lastYear.jobsHere)}) held by
										residents, {fmtWhole(lastYear.inCommuters)} by commuters in
									</span>
								</dd>
							</>
						)}
						{city.jobAccess && (
							<>
								<dt>Jobs within reach</dt>
								<dd>
									{city.jobAccess
										.filter((j) => j.jobs != null)
										.map((j) => `${fmtWhole(j.jobs)} in ${j.minutes} min`)
										.join(" · ")}
								</dd>
							</>
						)}
					</dl>
				</div>
				<div>
					<h3 style={{ marginBottom: "0.4rem" }}>As a khipu</h3>
					<dl className="meta">
						<dt>Primary cord</dt>
						<dd>{khipu.primary.length} cm, coloured by the place's verdict</dd>
						<dt>Groups</dt>
						<dd>
							one per year, {city.years[0]}–{city.years[city.years.length - 1]},
							oldest first; the same cords in the same order each year
						</dd>
						<dt>Knot rows</dt>
						<dd>
							{city.digits}, {enc.pitch} cm apart — room for{" "}
							{fmtWhole(10 ** city.digits - 1)}
						</dd>
						<dt>On {possessive(city.metro.displayName)} khipu</dt>
						<dd>
							<Link {...metroTo}>
								pendant {city.metroCord} of{" "}
								{fmtWhole(lastYear?.residentWorkers ?? residentsCord?.value)}
							</Link>
							{lastYear
								? ` — this khipu's ${lastYear.year} residents cord, ${lastYear.cords.residents}`
								: ""}
						</dd>
						<dt>Source</dt>
						<dd>
							Growth Lab Cities Tool, place series {enc.placeYears[0]}–
							{enc.placeYears[1]}; tied on request by src/lib/cities/tie.ts
						</dd>
					</dl>
				</div>
			</header>

			<div className="stats detail-stats">
				<StatTile
					label="pendant cords"
					value={s.nPendants}
					hint={`in ${s.nGroups} year groups`}
				/>
				<StatTile
					label="subsidiary cords"
					value={s.nSubsidiaries}
					hint="the commute split, under every work cord"
				/>
				<StatTile label="knots" value={s.nKnots} />
				{lastYear && (
					<>
						<StatTile
							label={`residents who work, ${lastYear.year}`}
							value={lastYear.residentWorkers ?? 0}
							hint="the pendant the metro khipu carries"
						/>
						<StatTile
							label={`jobs here, ${lastYear.year}`}
							value={lastYear.jobsHere ?? 0}
							hint="its first subsidiary, a level up"
						/>
					</>
				)}
			</div>

			<section className="section">
				<h2>Diagram</h2>
				<p className="prose" style={{ marginBottom: "0.9rem" }}>
					Each year is a group. Its first cord, in {possessive(city.name)}{" "}
					colour, counts residents who work, with subsidiaries for those who
					work here and those who commute out. The brown cord counts jobs
					located here, split into residents and commuters in; the grey cord is
					population and the green one home value. Follow a colour across groups
					to see one number over time. Hover a cord for the year; click to
					select it.
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
						aria-pressed={showValues}
						onClick={() => setShowValues((v) => !v)}
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
						<button
							type="button"
							className="btn"
							onClick={() => setSelected(null)}
						>
							Clear selection ({selected}
							{selectedYear ? `, ${selectedYear}` : ""})
						</button>
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

			{lastYear && residentsCord && jobsCord && (
				<section className="section">
					<h2>Reading {lastYear.year}'s work cords</h2>
					<p className="prose" style={{ marginBottom: "0.9rem" }}>
						The two cords also shown on the metro khipu, enlarged. Residents who
						work: {fmtWhole(residentsCord.value)}, split into{" "}
						{fmtWhole(lastYear.liveWorkHere)} working in {city.name} and{" "}
						{fmtWhole(lastYear.outCommuters)} commuting out. Jobs:{" "}
						{fmtWhole(jobsCord.value)}, split into the same{" "}
						{fmtWhole(lastYear.liveWorkHere)} residents and{" "}
						{fmtWhole(lastYear.inCommuters)} commuters in. Single knots count
						tens and up, a long knot's turns are the units, a figure-eight is a
						one, an empty row is zero. The residents' cord extends past the
						units row by that year's mean wage, {fmtUsd(lastYear.wage)} at 1 cm
						per {fmtUsd(enc.wagePerCm)}.
					</p>
					<div className="reader-pair">
						<CordReader
							cord={residentsCord}
							colors={colors}
							pxPerCm={5.5}
							title={`${city.name}, ${lastYear.year}: residents who work`}
						/>
						<CordReader
							cord={jobsCord}
							colors={colors}
							pxPerCm={5.5}
							title={`${city.name}, ${lastYear.year}: jobs located here`}
						/>
					</div>
				</section>
			)}

			<section className="section">
				<h2>How to read it</h2>
				<CityKey
					enc={enc}
					colors={colors}
					scope="place"
					placeName={city.name}
				/>
			</section>

			<section className="section">
				<h2>Years</h2>
				<p className="prose" style={{ marginBottom: "0.9rem" }}>
					Every year group in khipu order, with the atlas's numbers. Click a row
					to highlight its residents' cord.
				</p>
				<YearTable
					khipu={khipu}
					selectedYear={selectedYear}
					onSelect={setSelected}
				/>
			</section>
		</main>
	);
}

function YearTable({
	khipu,
	selectedYear,
	onSelect,
}: {
	khipu: PlaceKhipu;
	selectedYear: number | undefined;
	onSelect: (name: string | null) => void;
}) {
	return (
		<div className="table-wrap">
			<table className="data-table">
				<thead>
					<tr>
						<th>Year</th>
						<th>Cords</th>
						<th className="num">Population</th>
						<th className="num">Residents who work</th>
						<th className="num">work here</th>
						<th className="num">commute out</th>
						<th className="num">Jobs here</th>
						<th className="num">commuters in</th>
						<th className="num">Mean wage</th>
						<th className="num">Home value</th>
						<th className="num">Knots</th>
					</tr>
				</thead>
				<tbody>
					{khipu.yearRows.map((y) => {
						const names = Object.values(y.cords);
						const group = khipu.cords.filter((c) => c.group === y.group);
						const knots = group.reduce(
							(a, c) =>
								a +
								c.nKnots +
								khipu.cords
									.filter((x) => x.parent === c.name)
									.reduce((b, x) => b + x.nKnots, 0),
							0,
						);
						const first = y.cords.residents ?? names[0];
						const isSel = selectedYear === y.year;
						return (
							<tr
								key={y.year}
								className={isSel ? "is-selected" : undefined}
								onClick={() => onSelect(isSel ? null : (first ?? null))}
								style={{ cursor: "pointer" }}
							>
								<td>{y.year}</td>
								<td className="cell-muted">
									{group.length
										? `${group[0].name}–${group[group.length - 1].name}`
										: "—"}
								</td>
								<td className="num">{fmtWhole(y.population)}</td>
								<td className="num">{fmtWhole(y.residentWorkers)}</td>
								<td className="num cell-muted">{fmtWhole(y.liveWorkHere)}</td>
								<td className="num cell-muted">{fmtWhole(y.outCommuters)}</td>
								<td className="num">{fmtWhole(y.jobsHere)}</td>
								<td className="num cell-muted">{fmtWhole(y.inCommuters)}</td>
								<td className="num">{fmtUsd(y.wage)}</td>
								<td className="num">{fmtUsd(y.homeValue)}</td>
								<td className="num">{knots}</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
