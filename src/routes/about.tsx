import { createFileRoute, Link } from "@tanstack/react-router";
import { readJson } from "#/lib/khipu/data";
import type { ScanFile } from "#/lib/stories/links";
import { getStrands } from "#/lib/stories/strands";

export const Route = createFileRoute("/about")({
	// counts for "Links between khipus"; the page stands without them
	loader: async () => {
		const [scan, strands] = await Promise.all([
			readJson<ScanFile>("stories/links.json").catch(() => null),
			getStrands(),
		]);
		const links = strands ? Object.values(strands.links) : [];
		return {
			pairs: scan?.pairs.length ?? null,
			shuffles: scan?.shuffles ?? null,
			six: scan?.baseline["6"] ?? null,
			strandLinks: links.length,
			threads: links.reduce((n, l) => n + l.threads.length, 0),
		};
	},
	head: () => ({ meta: [{ title: "About the data — Khipu" }] }),
	component: About,
});

function About() {
	const { pairs, shuffles, six, strandLinks, threads } = Route.useLoaderData();
	return (
		<main className="page-wrap">
			<h1 className="page-title">About the data</h1>
			<p className="lede">
				Two open archives describe the same objects in different ways. This site
				draws its cord-level structure from one and its archival metadata from
				the other.
			</p>

			<section className="section prose">
				<h2>Khipu Field Guide</h2>
				<p>
					Ashok Khosla's{" "}
					<a
						href="https://khipufieldguide.com/"
						target="_blank"
						rel="noreferrer"
					>
						Khipu Field Guide
					</a>{" "}
					reconciles the Harvard Khipu Database, the Aschers' databooks, and
					later recordings into one workbook per khipu, each structurally
					checked so it can be drawn. There is one Excel file per khipu with
					sheets for the khipu, its primary cord, its cord groups and its cords.
					A cord row carries the cord's twist, attachment, length, termination,
					colour, value and a compact knot string such as{" "}
					<code>1S(10.0,S),10;5L(17.5,S),5</code> — one single knot at 10 cm
					worth ten, then a five-turn long knot at 17.5 cm worth five. Names
					encode the hierarchy: <code>p13s1</code> is the first subsidiary of
					pendant 13.
				</p>
				<p>
					684 workbooks were published when this copy was taken (September
					2026). They are MIT-licensed.
				</p>
			</section>

			<section className="section prose">
				<h2>Open Khipu Repository</h2>
				<p>
					The{" "}
					<a
						href="https://github.com/khipulab/open-khipu-repository"
						target="_blank"
						rel="noreferrer"
					>
						Open Khipu Repository
					</a>{" "}
					is an archival database maintained by the Open Khipu Research
					Laboratory and an advisory board, and released on Zenodo
					(doi:10.5281/zenodo.18025748). Its SQLite file holds 619 khipus in
					relational tables — khipu, primary cord, cord clusters, cords, knot
					clusters, knots, and colour records — along with the code tables that
					define every abbreviation. It also assigns the stable KH numbers that
					both sources share, which is what lets the two be joined.
				</p>
				<p>
					From the OKR this site takes the code tables (knot types, attachment,
					termination, fibre, structure) and the Ascher colour chart with its
					ISCC–NBS colour values, which supply the swatches on the site.
				</p>
			</section>

			<section className="section prose">
				<h2>What was computed</h2>
				<p>
					Cord positions along the primary cord come from the group records
					(start plus ordinal times spacing); subsidiary positions come from the
					parent's position column. Knot counts treat a long knot as one knot
					however many turns it has. Everything else is as recorded. The
					pipeline is <code>scripts/fetch_data.sh</code> followed by{" "}
					<code>scripts/build_data.py</code>, which writes the JSON in{" "}
					<code>public/data</code>.
				</p>
			</section>

			<section className="section prose">
				<h2>Links between khipus</h2>
				<p>
					Two further files hold what the site knows about khipus that share
					values. <code>public/data/stories/links.json</code> is the output of a
					scan of every pair of khipus for runs of level-1 values in the same
					order (forward, or with one khipu reversed)
					{pairs != null ? `: ${pairs} pairs with a run of four or more` : ""},
					with the museum numbers and find-spots that several khipus share. It
					also records the scan&rsquo;s chance level, from the same scan run
					over {shuffles ?? "three"} copies of the corpus with the values
					shuffled
					{six
						? `: ${six.observed} pairs share a run of six or more, against ${six.shuffled} on average by chance`
						: ""}
					. It is written by <code>scripts/build_links.py</code>.
				</p>
				<p>
					<code>public/data/stories/strands.json</code> goes down to the cord.
					For each linked pair
					{strandLinks ? ` (${strandLinks} of them)` : ""}, it pairs each cord
					of one khipu with the cord of the other that answers it, and says how:
					the same value, a near value, a sum, a fixed ratio, blank on both,
					blank on one, or a value that differs
					{threads ? `; ${threads.toLocaleString()} pairs of cords in all` : ""}
					. Every pair is checked against the recorded values when{" "}
					<code>scripts/build_strands.py</code> writes the file. Links the
					stories have read carry their level (firm, likely, open); a pair only
					the scan has seen is marked as unexamined. Both files feed the{" "}
					<Link to="/network">network</Link> and the matched cords on each
					khipu&rsquo;s page, and{" "}
					<Link to="/stories/what-chance-can-do">What chance can do</Link> sets
					the scan against its chance level.{" "}
					<Link to="/matching">How matching works</Link> walks through the
					scan's own code, step by step, on real khipus.
				</p>
			</section>

			<section className="section prose">
				<h2>What is drawn and what is recorded</h2>
				<p>
					Attachment, twist, knot direction, the axis of a long knot and the
					ends of cords are recorded codes: a letter or two per feature, set
					down by whoever measured the khipu. The drawing's geometry — where a
					loop sits, which way a strand leans, how ragged a break is — is the
					conventional reading of those codes, not an observation of the object,
					and a code that was not recorded draws nothing: a smooth cord, a cord
					hanging from the primary without a hitch, an end that just stops. The
					conventions and their sources are set out feature by feature on{" "}
					<Link to="/anatomy">Reading the drawing</Link>.
				</p>
			</section>
		</main>
	);
}
