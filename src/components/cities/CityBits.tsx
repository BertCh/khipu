import type {
	CityEncoding,
	MetroMeta,
	PlaceKhipu,
	PlaceMeta,
	PlaceRole,
	Quadrant,
} from "#/lib/cities/types";
import {
	fmtRate,
	fmtUsd,
	fmtWhole,
	possessive,
	QUADRANT,
	supplySideLabel,
} from "#/lib/cities/vocab";
import { hexFor } from "#/lib/khipu/colors";
import type { CordNode } from "#/lib/khipu/layout";
import type { ColorTable } from "#/lib/khipu/types";

/** The cord colour a diagnosis gets, as the build script assigned it. */
export function quadrantCode(
	q: Quadrant | null | undefined,
	enc: CityEncoding,
): string {
	return enc.quadrantColor[q ?? "none"];
}

/** A small swatch of the cord colour a place gets, with its verdict. */
export function Verdict({
	quadrant,
	borderline,
	enc,
	colors,
	long = false,
}: {
	quadrant: Quadrant | null | undefined;
	borderline?: boolean;
	enc: CityEncoding;
	colors: ColorTable;
	long?: boolean;
}) {
	const code = quadrantCode(quadrant, enc);
	const text = quadrant
		? long
			? QUADRANT[quadrant].verdict
			: QUADRANT[quadrant].noun
		: long
			? "undiagnosed"
			: "Undiagnosed";
	return (
		<span className="verdict">
			<Swatch code={code} pole={borderline} colors={colors} />
			{text}
			{borderline ? <span className="verdict-note">borderline</span> : null}
		</span>
	);
}

export function Swatch({
	code,
	pole,
	colors,
	size = 11,
}: {
	code: string;
	/** barber-poled with white */
	pole?: boolean;
	colors: ColorTable;
	size?: number;
}) {
	const base = hexFor(code, colors);
	const style: React.CSSProperties = {
		width: size,
		height: size,
		background: pole
			? `repeating-linear-gradient(135deg, ${base} 0 3px, ${hexFor("W", colors)} 3px 5px)`
			: base,
	};
	return <i className="swatch-inline" style={style} />;
}

/** Which of a place's cords this is, from its name. */
export function cordRole(name: string): "pendant" | "s1" | "s2" {
	if (name.endsWith("s1")) return "s1";
	if (name.endsWith("s2")) return "s2";
	return "pendant";
}

const ROLE_LABEL = {
	pendant: "Pendant — resident workers",
	s1: "Subsidiary 1 — jobs located here",
	s2: "Subsidiary 2 — population",
} as const;

/** Hover card for a place's cord in a metro khipu. */
export function PlaceTip({
	node,
	place,
	enc,
	colors,
}: {
	node: CordNode;
	place: PlaceMeta;
	enc: CityEncoding;
	colors: ColorTable;
}) {
	const c = node.cord;
	const role = cordRole(c.name);
	return (
		<>
			<div className="kd-tip-head">
				<strong>
					{place.name}, {place.state}
				</strong>
				<span>{place.class === "CDP" ? "census-designated" : "city"}</span>
			</div>
			<div className="kd-tip-row">
				<Verdict
					quadrant={place.quadrant}
					borderline={place.borderline}
					enc={enc}
					colors={colors}
				/>
				<span style={{ color: "var(--ink-3)" }}>
					· {supplySideLabel(place.supplySide)}
				</span>
			</div>
			<p className="city-tip-cord">
				{ROLE_LABEL[role]}
				{c.value != null ? (
					<strong> {fmtWhole(c.value)}</strong>
				) : (
					<span> — not counted</span>
				)}
			</p>
			<dl>
				<dt>Resident workers</dt>
				<dd className={role === "pendant" ? "is-this" : undefined}>
					{fmtWhole(place.residentWorkers)}
				</dd>
				<dt>Jobs here</dt>
				<dd className={role === "s1" ? "is-this" : undefined}>
					{fmtWhole(place.jobsHere)}
				</dd>
				<dt>Population</dt>
				<dd className={role === "s2" ? "is-this" : undefined}>
					{fmtWhole(place.population)}
					{place.popCagr != null ? (
						<span className="muted"> {fmtRate(place.popCagr)}</span>
					) : null}
				</dd>
				<dt>Mean wage</dt>
				<dd>
					{fmtUsd(place.wage)}
					{place.wageCagr != null ? (
						<span className="muted"> {fmtRate(place.wageCagr)}</span>
					) : null}
				</dd>
				<dt>Home value</dt>
				<dd>
					{fmtUsd(place.homeValue)}
					{place.costCagr != null ? (
						<span className="muted"> {fmtRate(place.costCagr)}</span>
					) : null}
				</dd>
			</dl>
			<p className="kd-tip-notes">
				Click to select; open its khipu from the table.
			</p>
		</>
	);
}

/** What each of a year's cords counts in a place khipu. */
export const PLACE_ROLE: Record<PlaceRole, string> = {
	residents: "Residents who work",
	stay: "of whom, working in the place",
	out: "of whom, commuting out",
	jobs: "Jobs located here",
	in: "of which, held by commuters in",
	population: "Population",
	homeValue: "Home value",
};

/** Hover card for a cord of a place khipu: the year it belongs to, read out. */
export function PlaceYearTip({
	node,
	khipu,
	enc,
	colors,
}: {
	node: CordNode;
	khipu: PlaceKhipu;
	enc: CityEncoding;
	colors: ColorTable;
}) {
	const c = node.cord;
	const at = khipu.roles[c.name];
	const y = at ? khipu.yearRows.find((r) => r.year === at.year) : undefined;
	if (!at || !y) return null;
	const city = khipu.city;
	// the stay count hangs under both work cords; under the jobs cord it reads
	// as the jobs held by people who live here
	const underJobs = c.parent != null && c.parent === y.cords.jobs;
	const roleText =
		at.role === "stay" && underJobs
			? "of which, held by people living here"
			: PLACE_ROLE[at.role];
	const rowOf: PlaceRole =
		at.role === "stay" || at.role === "out"
			? underJobs
				? "jobs"
				: "residents"
			: at.role === "in"
				? "jobs"
				: at.role;
	const mark = (r: PlaceRole) => (r === rowOf ? "is-this" : undefined);
	return (
		<>
			<div className="kd-tip-head">
				<strong>
					{city.name}, {y.year}
				</strong>
				<span>{c.name}</span>
			</div>
			<div className="kd-tip-row">
				<Verdict
					quadrant={city.quadrant}
					borderline={city.borderline}
					enc={enc}
					colors={colors}
				/>
				<span style={{ color: "var(--ink-3)" }}>
					· {supplySideLabel(city.supplySide)}
				</span>
			</div>
			<p className="city-tip-cord">
				{roleText}
				<strong> {fmtWhole(c.value)}</strong>
			</p>
			<dl>
				<dt>Population</dt>
				<dd className={mark("population")}>{fmtWhole(y.population)}</dd>
				<dt>Residents who work</dt>
				<dd className={mark("residents")}>
					{fmtWhole(y.residentWorkers)}
					{y.liveWorkHere != null ? (
						<span className="muted">
							{" "}
							{fmtWhole(y.liveWorkHere)} here + {fmtWhole(y.outCommuters)} out
						</span>
					) : null}
				</dd>
				<dt>Jobs here</dt>
				<dd className={mark("jobs")}>
					{fmtWhole(y.jobsHere)}
					{y.liveWorkHere != null ? (
						<span className="muted">
							{" "}
							{fmtWhole(y.liveWorkHere)} residents + {fmtWhole(y.inCommuters)}{" "}
							in
						</span>
					) : null}
				</dd>
				<dt>Mean wage</dt>
				<dd>{fmtUsd(y.wage)}</dd>
				<dt>Home value</dt>
				<dd className={mark("homeValue")}>{fmtUsd(y.homeValue)}</dd>
			</dl>
		</>
	);
}

/** Hover card for a metro's pendant in the national khipu. */
export function MetroTip({
	metro,
	enc,
	colors,
}: {
	metro: MetroMeta;
	enc: CityEncoding;
	colors: ColorTable;
}) {
	return (
		<>
			<div className="kd-tip-head">
				<strong>{metro.name}</strong>
				<span>{metro.division}</span>
			</div>
			<div className="kd-tip-row">
				<Verdict
					quadrant={metro.quadrant}
					borderline={metro.borderline}
					enc={enc}
					colors={colors}
				/>
				<span style={{ color: "var(--ink-3)" }}>
					· {supplySideLabel(metro.supplySide)}
				</span>
			</div>
			<dl>
				<dt>Population</dt>
				<dd>
					{fmtWhole(metro.population)}
					<span className="muted"> {fmtRate(metro.popCagr)}</span>
				</dd>
				<dt>Mean wage</dt>
				<dd>
					{fmtUsd(metro.wage)}
					<span className="muted"> {fmtRate(metro.wageCagr)}</span>
				</dd>
				<dt>Places</dt>
				<dd>{fmtWhole(metro.nPlaces)}</dd>
			</dl>
			<p className="kd-tip-notes">Click to open its khipu.</p>
		</>
	);
}

/**
 * The reader's key to the encoding: what a colour, a cord, a knot row and a
 * group mean in the city khipus. Written once here and shown on both pages.
 */
export function CityKey({
	enc,
	colors,
	scope,
	placeName,
}: {
	enc: CityEncoding;
	colors: ColorTable;
	/** the metro khipus, the national one, or a place's */
	scope: "metro" | "nation" | "place";
	/** for a place khipu's key: the place, so the cords can be named for it */
	placeName?: string;
}) {
	const quadrants: Quadrant[] = [
		"demand_positive",
		"supply_negative",
		"supply_positive",
		"demand_negative",
	];
	return (
		<div className="city-key">
			<div className="city-key-col">
				<h3>Colour is the verdict</h3>
				<ul>
					{quadrants.map((q) => (
						<li key={q}>
							<Swatch code={enc.quadrantColor[q]} colors={colors} />
							<b>{QUADRANT[q].noun}</b>
							<span>{QUADRANT[q].gloss}</span>
						</li>
					))}
					<li>
						<Swatch code={enc.quadrantColor.none} colors={colors} />
						<b>Undyed</b>
						<span>no diagnosis: the atlas has no population series for it</span>
					</li>
					{scope === "place" && (
						<li>
							<CordMark kind="pendant" />
							<b>Primary cord</b>
							<span>
								in {possessive(placeName ?? "the place")} own colour; the same
								colour hangs its residents cord every year
							</span>
						</li>
					)}
					<li>
						<Swatch
							code={enc.quadrantColor.demand_positive}
							pole
							colors={colors}
						/>
						<b>Barber pole</b>
						<span>borderline: within the band around the median</span>
					</li>
				</ul>
			</div>
			<div className="city-key-col">
				<h3>
					{scope === "metro"
						? "Each place is a pendant"
						: scope === "place"
							? "Each year ties the same cords"
							: "Each metro is a pendant"}
				</h3>
				<ul>
					{scope === "place" ? (
						<>
							<li>
								<CordMark kind="pendant" />
								<b>Residents who work</b>
								<span>
									the year's first cord, in the place's colour; two subsidiaries
									split it into those who also work in{" "}
									{placeName ?? "the place"} and those who commute out
								</span>
							</li>
							<li>
								<Swatch code={enc.stayColor} colors={colors} />
								<b>Stay</b>
								<span>
									live and work in the same place — tied under both work cords,
									the same count each time
								</span>
							</li>
							<li>
								<Swatch code={enc.commuteColor} colors={colors} />
								<b>Cross the line</b>
								<span>
									commute out (under the residents) or in (under the jobs); a
									pendant is always the sum of its two subsidiaries
								</span>
							</li>
							<li>
								<Swatch code={enc.jobsColor} colors={colors} />
								<b>Jobs located here</b>
								<span>the second cord; beneath it who holds them</span>
							</li>
							<li>
								<Swatch code={enc.populationColor} colors={colors} />
								<b>Population</b>
								<span>
									the third cord, incorporated places only — a census-designated
									place ties none
								</span>
							</li>
							<li>
								<Swatch code={enc.homeValueColor} colors={colors} />
								<b>Home value</b>
								<span>
									the last cord, in dollars, so it reaches the top row
								</span>
							</li>
						</>
					) : (
						<li>
							<CordMark kind="pendant" />
							<b>Pendant</b>
							<span>
								{scope === "metro"
									? "the place's resident workers, knotted in decimal"
									: "the metro's population, knotted in decimal"}
							</span>
						</li>
					)}
					{scope === "metro" && (
						<>
							<li>
								<Swatch code={enc.jobsColor} colors={colors} />
								<b>Subsidiary 1</b>
								<span>jobs located in the place</span>
							</li>
							<li>
								<Swatch code={enc.populationColor} colors={colors} />
								<b>Subsidiary 2</b>
								<span>
									population — only incorporated places are counted, so cities
									carry three cords and census-designated places two
								</span>
							</li>
						</>
					)}
					<li>
						<CordMark kind="tail" />
						<b>Length</b>
						<span>
							{scope === "place"
								? `the residents cord runs past the units row by that year's mean wage, 1 cm for every ${fmtUsd(enc.wagePerCm)}`
								: `past the units row, 1 cm for every ${fmtUsd(enc.wagePerCm)} of mean wage`}
						</span>
					</li>
				</ul>
			</div>
			<div className="city-key-col">
				<h3>Knots are the count</h3>
				<ul>
					<li>
						<KnotMark kind="S" />
						<b>Single knots</b>
						<span>
							one row per power of ten, highest nearest the primary cord; a
							cluster of four in the thousands row is 4,000
						</span>
					</li>
					<li>
						<KnotMark kind="L" />
						<b>Long knot</b>
						<span>the units, 2 to 9, one turn per unit</span>
					</li>
					<li>
						<KnotMark kind="E" />
						<b>Figure-eight</b>
						<span>a units digit of 1</span>
					</li>
					<li>
						<KnotMark kind="row" />
						<b>Rows</b>
						<span>
							line up across every cord of a khipu, {enc.pitch} cm apart, so a
							number's size shows as how high its knots reach
						</span>
					</li>
				</ul>
			</div>
			<div className="city-key-col">
				<h3>
					{scope === "metro"
						? "Groups are states"
						: scope === "place"
							? "Groups are years"
							: "Groups are census divisions"}
				</h3>
				<ul>
					<li>
						<CordMark kind="group" />
						<b>Bracket</b>
						<span>
							{scope === "metro"
								? "one group per state, the principal state first; the principal city leads its group and the rest follow by size"
								: scope === "place"
									? `one group per year, ${enc.placeYears[0]} to ${enc.placeYears[1]}, oldest first; a year the atlas has no number for ties a shorter group`
									: "the nine census divisions, their metros in order of size"}
						</span>
					</li>
					{scope === "place" && (
						<li>
							<CordMark kind="pendant" />
							<b>The join</b>
							<span>
								the last year's residents cord is this place's pendant on the
								metro khipu; its jobs and population cords are that pendant's
								subsidiaries
							</span>
						</li>
					)}
					<li>
						<CordMark kind="attach" />
						<b>Attachment</b>
						<span>
							{scope === "nation"
								? "recto throughout"
								: "recto for an incorporated place, verso for a census-designated place"}
						</span>
					</li>
					<li>
						<KnotMark kind="dir" />
						<b>Knot direction</b>
						<span>
							S when the constraint reads as cost, Z when it reads as amenity
						</span>
					</li>
				</ul>
			</div>
		</div>
	);
}

function CordMark({
	kind,
}: {
	kind: "pendant" | "top" | "tail" | "group" | "attach";
}) {
	const stroke = "var(--ink-2)";
	switch (kind) {
		case "tail":
			return (
				<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
					<path
						d="M1 2H13"
						stroke={stroke}
						strokeWidth="2"
						strokeLinecap="round"
					/>
					<path
						d="M7 2V7"
						stroke={stroke}
						strokeWidth="1.6"
						strokeLinecap="round"
					/>
					<path
						d="M7 7V13"
						stroke={stroke}
						strokeWidth="1.6"
						strokeDasharray="1.5 1.5"
						strokeLinecap="round"
					/>
				</svg>
			);
		case "group":
			return (
				<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
					<path d="M2 4V2H12V4" fill="none" stroke={stroke} strokeWidth="1.2" />
					<path
						d="M1 7H13"
						stroke={stroke}
						strokeWidth="2"
						strokeLinecap="round"
					/>
					<path
						d="M4 7V13M7 7V13M10 7V13"
						stroke={stroke}
						strokeWidth="1.4"
						strokeLinecap="round"
					/>
				</svg>
			);
		case "attach":
			return (
				<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
					<path
						d="M1 3H13"
						stroke={stroke}
						strokeWidth="2"
						strokeLinecap="round"
					/>
					<path
						d="M4 3q0 3 2 3v7M10 3q0 3 -2 3v7"
						fill="none"
						stroke={stroke}
						strokeWidth="1.4"
						strokeLinecap="round"
					/>
				</svg>
			);
		default:
			return (
				<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
					<path
						d="M1 3H13"
						stroke={stroke}
						strokeWidth="2"
						strokeLinecap="round"
					/>
					<path
						d="M7 3V13"
						stroke={stroke}
						strokeWidth="1.6"
						strokeLinecap="round"
					/>
				</svg>
			);
	}
}

function KnotMark({ kind }: { kind: "S" | "L" | "E" | "row" | "dir" }) {
	const ink = "var(--ink-2)";
	switch (kind) {
		case "S":
			return (
				<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
					<path d="M7 0V14" stroke={ink} strokeWidth="1.2" />
					<circle cx="7" cy="3" r="1.8" fill={ink} />
					<circle cx="7" cy="7" r="1.8" fill={ink} />
					<circle cx="7" cy="11" r="1.8" fill={ink} />
				</svg>
			);
		case "L":
			return (
				<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
					<path d="M7 0V14" stroke={ink} strokeWidth="1.2" />
					<rect x="4.5" y="3" width="5" height="8" rx="1.2" fill={ink} />
					<path
						d="M4.5 5.5H9.5M4.5 8H9.5"
						stroke="var(--surface)"
						strokeWidth="0.8"
					/>
				</svg>
			);
		case "E":
			return (
				<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
					<path d="M7 0V14" stroke={ink} strokeWidth="1.2" />
					<circle
						cx="7"
						cy="4.5"
						r="2.2"
						fill="none"
						stroke={ink}
						strokeWidth="1.3"
					/>
					<circle
						cx="7"
						cy="9.5"
						r="2.2"
						fill="none"
						stroke={ink}
						strokeWidth="1.3"
					/>
				</svg>
			);
		case "dir":
			return (
				<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
					<path
						d="M3 11L11 3"
						stroke={ink}
						strokeWidth="1.6"
						strokeLinecap="round"
					/>
					<path
						d="M3 3L11 11"
						stroke={ink}
						strokeWidth="1.6"
						strokeLinecap="round"
						strokeDasharray="2 2"
					/>
				</svg>
			);
		default:
			return (
				<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
					<path d="M3 0V14M7 0V14M11 0V14" stroke={ink} strokeWidth="1" />
					<path
						d="M0 4H14M0 10H14"
						stroke={ink}
						strokeWidth="0.8"
						strokeDasharray="1 1.5"
					/>
					<circle cx="3" cy="4" r="1.5" fill={ink} />
					<circle cx="7" cy="4" r="1.5" fill={ink} />
					<circle cx="11" cy="10" r="1.5" fill={ink} />
				</svg>
			);
	}
}

/** "Boston is a Magnet" for a metro header; the cities tool's own phrasing. */
export function verdictSentence(
	name: string,
	quadrant: Quadrant | null,
	borderline: boolean,
): string {
	if (!quadrant) return `${name} has no diagnosis`;
	return `${name} is ${QUADRANT[quadrant].verdict}${borderline ? ", just" : ""}`;
}
