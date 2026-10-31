import { Link } from "@tanstack/react-router";
import { useRef } from "react";
import { Conf } from "#/components/story/Story";
import type {
	ArithLabel,
	ArithTest,
	Profile,
	ProfileFile,
	Role,
	TestResult,
} from "#/lib/khipu/profile";
import { type KhipuSet, KIND_LABEL, STORY_TITLE } from "#/lib/stories/links";
import "#/styles/profile.css";

/**
 * The khipu page's profile panel: scale, arithmetic against chance, colour
 * layout, structure and network role, each with a one-line gloss. Arithmetic
 * is never a raw count: every count sits beside what the khipu's own values
 * give when shuffled (scripts/build_profiles.py).
 */

const SCALE_LABEL: Record<Profile["scale"]["label"], string> = {
	units: "Units",
	tens: "Tens",
	hundreds: "Hundreds",
	thousands: "Thousands and up",
	none: "No values",
};

const ARITH_LABEL: Record<ArithLabel, string> = {
	clear: "Clear arithmetic",
	some: "Some arithmetic",
	none: "None beyond chance",
	small: "Too small to tell",
	untested: "Not tested",
};

const COLOUR_LABEL: Record<Profile["colour"]["label"], string> = {
	banded: "Banded",
	seriated: "Seriated",
	mixed: "Mixed",
	irregular: "Irregular",
	few: "Too few groups",
};

const TEST_LABEL: Record<ArithTest, { name: string; gloss: string }> = {
	groupTotals: {
		name: "Group totals",
		gloss:
			"a group's total written on one of its own cords or on the cord beside it",
	},
	adjacentSums: {
		name: "Adjacent sums",
		gloss: "a pendant equal to the run of pendants starting right next to it",
	},
	topSums: {
		name: "Top-cord totals",
		gloss: "a lone top cord equal to the total of the group beside it",
	},
	paperSums: {
		name: "All sums, 2024 paper",
		gloss:
			"Medrano & Khosla's relations 1–3 and 5: a cord equal to any run of cords to one side, of its colour, or at its place in other groups",
	},
};

const TEST_ORDER: ArithTest[] = [
	"groupTotals",
	"adjacentSums",
	"topSums",
	"paperSums",
];

export interface KhipuProfileProps {
	id: string;
	profile: Profile;
	meta: ProfileFile["meta"];
	roles: Role[];
	sets: KhipuSet[];
	/** short catalogue names, for the partners */
	aliases: Record<string, string>;
}

export default function KhipuProfile({
	id,
	profile,
	meta,
	roles,
	sets,
	aliases,
}: KhipuProfileProps) {
	const method = useRef<HTMLDetailsElement>(null);
	const openMethod = () => {
		const el = method.current;
		if (!el) return;
		el.open = true;
		el.scrollIntoView({ behavior: "smooth", block: "start" });
	};
	const { scale, colour, structure: st, arithmetic: ar } = profile;

	return (
		<section className="section" aria-labelledby="profile-title">
			<h2 id="profile-title">Profile</h2>
			<p className="prose">
				A plain description of this khipu, computed the same way for every one
				in the corpus. Arithmetic is counted against chance: the same khipu's
				numbers shuffled, so sums that any jumble of these values would produce
				do not count as evidence.
			</p>
			<div className="profile panel">
				<Row
					name="Scale"
					verdict={SCALE_LABEL[scale.label]}
					gloss="How large a typical pendant's number is: the middle value of the non-zero pendants."
				>
					{scale.nonZero > 0 ? (
						<>
							median {fmt(scale.median)} across {scale.nonZero} non-zero pendant
							{scale.nonZero === 1 ? "" : "s"}; {pct(scale.shareThousands)} are
							1,000 or more
						</>
					) : (
						"no pendant carries a knotted value"
					)}
				</Row>

				<Row
					name="Arithmetic"
					verdict={
						<span className={`profile-arith is-${ar.label}`}>
							<i aria-hidden="true" />
							{ARITH_LABEL[ar.label]}
						</span>
					}
					gloss={
						<>
							Cords that total other cords, counted on this khipu and on its own
							values shuffled.{" "}
							<button
								type="button"
								className="profile-link"
								onClick={openMethod}
							>
								How chance is computed
							</button>
						</>
					}
				>
					<ArithFacts
						ar={ar}
						nonZero={scale.nonZero}
						minNz={meta.thresholds.minNonZero}
					/>
				</Row>

				<Row
					name="Colour layout"
					verdict={
						<>
							{COLOUR_LABEL[colour.label]}
							{colour.source === "approx" && colour.label !== "few" && (
								<span className="profile-approx"> (approximate)</span>
							)}
						</>
					}
					gloss="Banded: each group mostly one colour. Seriated: a sequence of colours repeated group after group."
				>
					{colour.source === "kfg" ? (
						<>
							Khipu Field Guide: {colour.banded} banded and {colour.seriated}{" "}
							seriated of {colour.clusters} cluster
							{colour.clusters === 1 ? "" : "s"} (2024 counts)
						</>
					) : colour.clusters > 0 ? (
						<>
							our estimate: {colour.banded} of {colour.clusters} groups of three
							or more mostly one colour, {colour.seriated} repeating another
							group's colour sequence
						</>
					) : (
						"no group of three or more pendants to judge"
					)}
				</Row>

				<Row
					name="Structure"
					verdict={`${st.pendants.toLocaleString()} pendant${st.pendants === 1 ? "" : "s"}`}
					gloss="How the cords are arranged: groups along the primary cord, cords hanging from cords, and cords raised above it."
				>
					<ul className="profile-facts">
						<li>
							{st.groups} group{st.groups === 1 ? "" : "s"}
							{st.groups > 1 &&
								(st.sixShare > 0
									? `, ${pct(st.sixShare)} of them six cords`
									: ", none of six cords")}
						</li>
						<li>
							{st.subsidiaries.toLocaleString()} subsidiar
							{st.subsidiaries === 1 ? "y" : "ies"}
						</li>
						<li>
							{st.topCords} top cord{st.topCords === 1 ? "" : "s"}
							{st.topCords > 0 &&
								(st.topSums > 0
									? `, ${st.topSums} totalling a neighbouring group`
									: ", none totalling a neighbouring group")}
						</li>
						{st.brokenPrimary && <li>primary cord broken: part may be lost</li>}
					</ul>
				</Row>

				<Row
					name="Network"
					verdict={
						roles.length === 0
							? "No known links"
							: `${roles.length} link${roles.length === 1 ? "" : "s"}`
					}
					gloss={
						<>
							Other khipus this one is known to match, from the curated links
							and the shared-run scan.{" "}
							{(roles.length > 0 || sets.length > 0) && (
								<Link to="/network/$id" params={{ id }}>
									See it on the network
								</Link>
							)}
						</>
					}
				>
					{roles.length > 0 || sets.length > 0 ? (
						<ul className="profile-roles">
							{roles.slice(0, 8).map((r) => (
								<li key={`${r.partner}-${r.kind}`}>
									<span>
										{cap(r.relation)}{" "}
										<Link
											to="/khipus/$id"
											params={{ id: r.partner }}
											title={r.note}
										>
											{r.partner}
										</Link>
										{aliases[r.partner] && (
											<span className="profile-alias">
												{" "}
												{aliases[r.partner]}
											</span>
										)}
										{r.story && STORY_TITLE[r.story] && (
											<>
												{" · "}
												<Link to={r.story}>{STORY_TITLE[r.story]}</Link>
											</>
										)}
									</span>
									<span className="profile-role-tags">
										<span className="profile-kind">{KIND_LABEL[r.kind]}</span>
										<Conf level={r.level}>{r.level}</Conf>
									</span>
								</li>
							))}
							{roles.length > 8 && (
								<li className="profile-more">
									and {roles.length - 8} more on the{" "}
									<Link to="/network/$id" params={{ id }}>
										network page
									</Link>
								</li>
							)}
							{sets.map((s) => (
								<li key={s.id}>
									<span>
										One of {s.ids.length} in the set “{s.label}”
										{s.story && STORY_TITLE[s.story] && (
											<>
												{" · "}
												<Link to={s.story}>{STORY_TITLE[s.story]}</Link>
											</>
										)}
									</span>
								</li>
							))}
						</ul>
					) : (
						"no curated link, and no run of six or more values shared with another khipu"
					)}
				</Row>
			</div>

			<details className="profile-method" id="profile-method" ref={method}>
				<summary>How chance is computed</summary>
				<div className="prose">
					<p>
						Each count is made twice: on the khipu as recorded, and on the same
						khipu with its pendant values shuffled among its pendant positions —
						the same numbers, groups, colours, subsidiaries and top cords, only
						the order of the values changed. The shuffle is repeated up to{" "}
						{meta.reps.toLocaleString()} times (with a fixed seed, stopping
						early once a count is plainly ordinary). “Chance” is the average
						count over the shuffles, and p is the share of shuffles that reach
						the recorded count.
					</p>
					<p>
						The verdict takes the smallest p among the tests, multiplied by the
						number of tests: below {meta.thresholds.clear} with at least two
						hits on that count is <strong>clear</strong>, below{" "}
						{meta.thresholds.some} is <strong>some</strong>. Khipus with fewer
						than {meta.thresholds.minNonZero} non-zero pendants are too small to
						tell. Across the corpus: {meta.counts.clear ?? 0} clear,{" "}
						{meta.counts.some ?? 0} some, {meta.counts.none ?? 0} none beyond
						chance, {meta.counts.small ?? 0} too small, and{" "}
						{meta.counts.untested ?? 0} not tested because their knots are not
						ordinary decimal numbers.
					</p>
					<p>
						Why bother: a large khipu of small numbers yields hundreds of “sums”
						by coincidence alone. Medrano &amp; Khosla (2024, Latin American
						Antiquity) counted such sums across the corpus; with this shuffle
						most of their counts, and the working/summary types built on them,
						are what shuffled values give. The counts that hold up are group
						totals, sums beside the summed cords, and top-cord totals, and, on a
						few khipus, the paper's broader sums.
					</p>
				</div>
			</details>
		</section>
	);
}

function Row({
	name,
	verdict,
	gloss,
	children,
}: {
	name: string;
	verdict: React.ReactNode;
	gloss: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div className="profile-row">
			<div className="profile-key">
				<span className="profile-name">{name}</span>
				<span className="profile-verdict">{verdict}</span>
			</div>
			<div className="profile-body">
				<div className="profile-detail">{children}</div>
				<p className="profile-gloss">{gloss}</p>
			</div>
		</div>
	);
}

function ArithFacts({
	ar,
	nonZero,
	minNz,
}: {
	ar: Profile["arithmetic"];
	nonZero: number;
	minNz: number;
}) {
	if (ar.label === "untested") {
		return (
			<>
				{ar.why === "data-error"
					? "the cord data is marked unreliable, so no count is made"
					: "the knots do not record ordinary decimal numbers, so sums are not looked for"}
			</>
		);
	}
	const tests = TEST_ORDER.filter((t) => ar.tests?.[t]).map(
		(t) => [t, ar.tests?.[t] as TestResult] as const,
	);
	return (
		<>
			{ar.label === "small" && (
				<p className="profile-note">
					only {nonZero} non-zero pendant{nonZero === 1 ? "" : "s"} (fewer than{" "}
					{minNz}): too few for a shuffle to tell design from coincidence
				</p>
			)}
			{tests.length > 0 && (
				<table
					className={`profile-tests${ar.label === "small" ? " is-muted" : ""}`}
				>
					<thead>
						<tr>
							<th scope="col">Count</th>
							<th scope="col" className="num">
								Found
							</th>
							<th scope="col" className="num">
								Chance
							</th>
							<th scope="col" className="profile-track-cell">
								<span className="profile-legend">
									<i className="profile-track-found" /> found
									<i className="profile-track-found is-beyond" /> beyond chance
									<i className="profile-track-chance" /> chance
								</span>
							</th>
							<th scope="col" className="num">
								p
							</th>
						</tr>
					</thead>
					<tbody>
						{tests.map(([t, r]) => (
							<tr key={t} className={ar.lead === t ? "is-lead" : undefined}>
								<th scope="row" title={TEST_LABEL[t].gloss}>
									{TEST_LABEL[t].name}
								</th>
								<td className="num">{r.observed.toLocaleString()}</td>
								<td className="num">{fmt(r.chance)}</td>
								<td className="profile-track-cell">
									<Track r={r} />
								</td>
								<td className="num profile-p">{pText(r.p)}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</>
	);
}

/** Found (filled dot) against chance (hollow tick) on one shared scale per row. */
function Track({ r }: { r: TestResult }) {
	const max = Math.max(r.observed, r.chance, 1) * 1.08;
	const x = (v: number) => `${(v / max) * 100}%`;
	return (
		<span
			className="profile-track"
			title={`found ${r.observed}, chance ${fmt(r.chance)} (${pText(r.p)})`}
		>
			<span className="profile-track-line" />
			<span className="profile-track-chance" style={{ left: x(r.chance) }} />
			<span
				className={`profile-track-found${r.p < 0.05 ? " is-beyond" : ""}`}
				style={{ left: x(r.observed) }}
			/>
		</span>
	);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function pText(p: number) {
	if (p >= 0.5) return "> 0.5";
	if (p < 0.001) return "< 0.001";
	return p < 0.01 ? p.toFixed(3) : p.toFixed(2);
}

function fmt(v: number) {
	if (v === 0) return "0";
	if (v < 10) return v.toFixed(v < 1 ? 2 : 1).replace(/\.0+$/, "");
	return Math.round(v).toLocaleString();
}

function pct(share: number) {
	if (share > 0 && share < 0.01) return "under 1%";
	return `${Math.round(share * 100)}%`;
}
