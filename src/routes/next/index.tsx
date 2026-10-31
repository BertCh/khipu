import { createFileRoute, Link } from "@tanstack/react-router";
import "#/styles/next/next.css";

export const Route = createFileRoute("/next/")({
	head: () => ({
		meta: [
			{ title: "Next · Khipu" },
			{
				name: "description",
				content:
					"Instruments in development: new ways to test what the khipus say.",
			},
		],
	}),
	component: NextHub,
});

interface Instrument {
	title: string;
	blurb: string;
	to?: "/next/proving-ground";
	glyph: string;
}

const INSTRUMENTS: Instrument[] = [
	{
		title: "Proving Ground",
		blurb:
			"Every claim this project has made, re-run in your browser against its own chance.",
		to: "/next/proving-ground",
		glyph: "M4 30V18M10 30V12M16 30V20M22 30V8M28 30V16",
	},
	{
		title: "Concordance",
		blurb: "The whole corpus as a khipu-by-khipu evidence matrix.",
		glyph: "M4 4h6v6H4zM12 12h6v6h-6zM20 20h6v6h-6zM12 4h6v6h-6zM4 20h6v6H4z",
	},
	{
		title: "Rule workbench",
		blurb: "State your own cord relation and test it.",
		glyph: "M4 8h24M4 16h16M4 24h20M24 13l4 3-4 3",
	},
];

function NextHub() {
	return (
		<main className="page-wrap next-page next-hub">
			<h1 className="page-title">Next</h1>
			<p className="lede">
				Instruments in development: new ways to test what the khipus say.
			</p>
			<div className="next-cards">
				{INSTRUMENTS.map((it) =>
					it.to ? (
						<Link key={it.title} to={it.to} className="next-card is-live">
							<CardBody it={it} status="live" />
						</Link>
					) : (
						<div key={it.title} className="next-card is-planned">
							<CardBody it={it} status="planned" />
						</div>
					),
				)}
			</div>
		</main>
	);
}

function CardBody({ it, status }: { it: Instrument; status: string }) {
	return (
		<>
			<svg
				className="next-card-glyph"
				width="32"
				height="32"
				viewBox="0 0 32 32"
				aria-hidden="true"
			>
				<path
					d={it.glyph}
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
			<span className={`next-card-status is-${status}`}>{status}</span>
			<h2>{it.title}</h2>
			<p>{it.blurb}</p>
			{status === "live" && (
				<span className="next-card-foot">
					Open <span aria-hidden="true">→</span>
				</span>
			)}
		</>
	);
}
