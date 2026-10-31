import { Link } from "@tanstack/react-router";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
	return (
		<header className="site-header">
			<nav className="page-wrap site-nav" aria-label="Main">
				<Link to="/" className="site-brand">
					<KnotMark />
					<span>Khipu</span>
				</Link>
				<div className="site-links">
					<Link
						to="/"
						className="nav-link"
						activeOptions={{ exact: true }}
						activeProps={{ className: "nav-link is-active" }}
					>
						Overview
					</Link>
					<Link
						to="/stories"
						className="nav-link"
						activeProps={{ className: "nav-link is-active" }}
					>
						Stories
					</Link>
					<Link
						to="/khipus"
						className="nav-link"
						activeProps={{ className: "nav-link is-active" }}
					>
						Browse
					</Link>
					<Link
						to="/network"
						className="nav-link"
						activeProps={{ className: "nav-link is-active" }}
					>
						Network
					</Link>
					<Link
						to="/matching"
						className="nav-link"
						activeProps={{ className: "nav-link is-active" }}
					>
						Matching
					</Link>
					<Link
						to="/cities"
						className="nav-link"
						activeProps={{ className: "nav-link is-active" }}
					>
						Cities
					</Link>
					<Link
						to="/colors"
						className="nav-link"
						activeProps={{ className: "nav-link is-active" }}
					>
						Colours
					</Link>
					<Link
						to="/anatomy"
						className="nav-link"
						activeProps={{ className: "nav-link is-active" }}
					>
						Anatomy
					</Link>
					<Link
						to="/lab"
						className="nav-link nav-link-lab"
						activeProps={{ className: "nav-link nav-link-lab is-active" }}
					>
						Lab <span aria-hidden="true">↗</span>
					</Link>
					<Link
						to="/next"
						className="nav-link"
						activeProps={{ className: "nav-link is-active" }}
					>
						Next
					</Link>
					<Link
						to="/about"
						className="nav-link"
						activeProps={{ className: "nav-link is-active" }}
					>
						About the data
					</Link>
				</div>
				<div className="site-tools">
					<ThemeToggle />
				</div>
			</nav>
		</header>
	);
}

/** A primary cord with three pendants — the site mark. */
function KnotMark() {
	return (
		<svg width="26" height="22" viewBox="0 0 26 22" aria-hidden="true">
			<path
				d="M1 4.5H25"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
			/>
			<path
				d="M7 5v14M13 5v11M19 5v15"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
			/>
			<circle cx="7" cy="11" r="1.7" fill="currentColor" />
			<circle cx="7" cy="15" r="1.7" fill="currentColor" />
			<rect x="11" y="9" width="4" height="5" rx="1.2" fill="currentColor" />
			<circle cx="19" cy="14" r="1.7" fill="currentColor" />
		</svg>
	);
}
