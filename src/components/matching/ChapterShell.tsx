import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * Every chapter's route, in series order, as a fixed, typed lookup — so
 * `<Link to>` stays statically checked against the generated route tree
 * while `ChapterShell` can still build prev/next links generically.
 */
export const CHAPTER_PATH = {
	"seed-and-extend": "/matching/seed-and-extend",
	"bending-the-rules": "/matching/bending-the-rules",
	reordering: "/matching/reordering",
	sums: "/matching/sums",
	"against-chance": "/matching/against-chance",
} as const;

export type ChapterSlug = keyof typeof CHAPTER_PATH;

export interface ChapterInfo {
	slug: ChapterSlug;
	title: string;
	blurb: string;
}

/** The series, in reading order — the hub's cards and every chapter's series nav read from this. */
export const CHAPTERS: ChapterInfo[] = [
	{
		slug: "seed-and-extend",
		title: "Seed and extend",
		blurb:
			"Cords become a number tape; short windows seed a search, and a seed grows into a maximal shared run.",
	},
	{
		slug: "bending-the-rules",
		title: "Bending the rules",
		blurb:
			"A tolerant alignment bridges mismatches, slips and gaps that an exact run can't — and says what it cost.",
	},
	{
		slug: "reordering",
		title: "When the order changes",
		blurb:
			"Fields get relabelled, groups get sorted, a khipu gets read from the other end: matching when position itself has moved.",
	},
	{
		slug: "sums",
		title: "Sums inside a khipu",
		blurb:
			"A cord can match a run of its own neighbours — the running sum that finds a total next to its parts.",
	},
	{
		slug: "against-chance",
		title: "Against chance",
		blurb:
			"Every match above is checked against shuffled copies of the same khipus, so a run means more than numbers alone.",
	},
];

function SeriesNav({ slug }: { slug: ChapterSlug }) {
	const i = CHAPTERS.findIndex((c) => c.slug === slug);
	const prev = i > 0 ? CHAPTERS[i - 1] : null;
	const next = i >= 0 && i < CHAPTERS.length - 1 ? CHAPTERS[i + 1] : null;
	return (
		<nav className="chapter-series-nav" aria-label="Chapter">
			<span className="chapter-series-count">
				Chapter {i + 1} of {CHAPTERS.length}
			</span>
			<span className="chapter-series-links">
				{prev ? (
					<Link to={CHAPTER_PATH[prev.slug]} className="chapter-series-link">
						‹ {prev.title}
					</Link>
				) : (
					<Link to="/matching" className="chapter-series-link">
						‹ How matching works
					</Link>
				)}
				<Link to="/matching" className="chapter-series-hub">
					All chapters
				</Link>
				{next ? (
					<Link to={CHAPTER_PATH[next.slug]} className="chapter-series-link">
						{next.title} ›
					</Link>
				) : (
					<span className="chapter-series-link is-disabled">End ›</span>
				)}
			</span>
		</nav>
	);
}

export interface ChapterShellProps {
	slug: ChapterSlug;
	title: ReactNode;
	standfirst?: ReactNode;
	meta?: ReactNode;
	children: ReactNode;
}

/**
 * The page shell every /matching chapter uses: a breadcrumb back to the hub,
 * a series nav (top and bottom) and the same header/figure layout as
 * src/components/story/Story.tsx's `StoryPage` (reuses its CSS classes).
 */
export function ChapterShell({
	slug,
	title,
	standfirst,
	meta,
	children,
}: ChapterShellProps) {
	const info = CHAPTERS.find((c) => c.slug === slug);
	return (
		<main className="page-wrap story chapter-page">
			<nav className="story-crumb" aria-label="How matching works">
				<Link to="/matching">How matching works</Link>
				<span aria-hidden="true">/</span>
				<span>{info?.title ?? title}</span>
			</nav>
			<SeriesNav slug={slug} />
			<header className="story-head">
				<h1 className="page-title">{title}</h1>
				{standfirst && <p className="lede">{standfirst}</p>}
				{meta && <div className="story-meta">{meta}</div>}
			</header>
			{children}
			<SeriesNav slug={slug} />
		</main>
	);
}

export default ChapterShell;
