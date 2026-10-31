import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment } from "react";
import { CHAPTER_PATH, CHAPTERS } from "#/components/matching/ChapterShell";
import NumberTape from "#/components/matching/NumberTape";
import { getColors, getKhipu } from "#/lib/khipu/data";
import { tapeOf } from "#/lib/matching/tape";
import "#/styles/matching/base.css";

const HERO_ID = "KH0303";

export const Route = createFileRoute("/matching/")({
	loader: async () => {
		const [colors, khipu] = await Promise.all([getColors(), getKhipu(HERO_ID)]);
		return { colors, cords: khipu ? tapeOf(khipu) : [] };
	},
	head: () => ({
		meta: [
			{ title: "How matching works — Khipu" },
			{
				name: "description",
				content:
					"How this project finds that two khipus, or two parts of one khipu, record the same thing — and checks that a match is more than chance.",
			},
		],
	}),
	component: MatchingHub,
});

const PIPELINE = [
	"cords",
	"numbers",
	"seeds",
	"runs",
	"alignment",
	"reordering",
	"sums",
	"chance",
];

function MatchingHub() {
	const { colors, cords } = Route.useLoaderData();
	return (
		<main className="page-wrap story">
			<nav className="story-crumb" aria-label="Matching">
				<Link to="/">Khipu</Link>
				<span aria-hidden="true">/</span>
				<span>How matching works</span>
			</nav>
			<header className="story-head">
				<h1 className="page-title">How matching works</h1>
				<p className="lede">
					Two khipus can record the same account in different cords, and one
					khipu can repeat a passage within itself. Five short chapters walk
					through the actual code that finds a match — on real khipus, with the
					real numbers — and the actual shuffles that check a match is more than
					what the numbers alone would give.
				</p>
			</header>

			<div className="matching-hub-pipeline" aria-hidden="true">
				{PIPELINE.map((p, i) => (
					<Fragment key={p}>
						<span className="matching-hub-pipeline-step">{p}</span>
						{i < PIPELINE.length - 1 && (
							<span className="matching-hub-pipeline-arrow">→</span>
						)}
					</Fragment>
				))}
			</div>

			{cords.length > 0 && (
				<div className="matching-hub-tape-wrap">
					<NumberTape
						cords={cords}
						colors={colors}
						label={`${HERO_ID}, ${cords.length} cords, in order`}
					/>
					<p className="muted">
						{HERO_ID}&rsquo;s level-1 cords, the &ldquo;number tape&rdquo; every
						chapter below reads.
					</p>
				</div>
			)}

			<div className="matching-hub-cards">
				{CHAPTERS.map((c, i) => (
					<Link
						key={c.slug}
						to={CHAPTER_PATH[c.slug]}
						className="matching-hub-card"
					>
						<div className="matching-hub-card-no">
							{String(i + 1).padStart(2, "0")}
						</div>
						<h3>{c.title}</h3>
						<p>{c.blurb}</p>
					</Link>
				))}
			</div>
		</main>
	);
}
