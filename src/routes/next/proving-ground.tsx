import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { StatTile } from "#/components/charts/Figure";
import ClaimView from "#/components/next/ClaimView";
import EngineBar from "#/components/next/EngineBar";
import EvidenceLedger, {
	type SearchPatch,
	useLedgerRows,
} from "#/components/next/EvidenceLedger";
import LinkAudit from "#/components/next/LinkAudit";
import RunLog from "#/components/next/RunLog";
import { getKhipuIndex, readJson } from "#/lib/khipu/data";
import { getClaims, resolveClaim } from "#/lib/next/claims";
import {
	type PGSearch,
	type PGView,
	validatePGSearch,
} from "#/lib/next/search";
import { buildGraph, type ScanFile } from "#/lib/stories/links";
import { getStrands } from "#/lib/stories/strands";
import "#/styles/network.css";
import "#/styles/next/next.css";

export const Route = createFileRoute("/next/proving-ground")({
	validateSearch: validatePGSearch,
	loader: async () => {
		const [file, index, strands, scan] = await Promise.all([
			getClaims(),
			getKhipuIndex(),
			getStrands(),
			readJson<ScanFile>("stories/links.json"),
		]);
		const graph = buildGraph(index, scan);
		return { file, strands, graph };
	},
	head: () => ({
		meta: [
			{ title: "Proving Ground · Khipu" },
			{
				name: "description",
				content:
					"Every claim this project has made, re-run in your browser against its own chance.",
			},
		],
	}),
	component: ProvingGround,
});

const VIEWS: { key: PGView; label: string }[] = [
	{ key: "claims", label: "Claims" },
	{ key: "links", label: "Links" },
];

function ProvingGround() {
	const { file, strands, graph } = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const [logOpen, setLogOpen] = useState(false);

	const onSearch = useCallback(
		(patch: SearchPatch, opts?: { replace?: boolean }) =>
			navigate({
				search: (prev: PGSearch) => {
					const next: PGSearch = { ...prev, ...patch };
					// a different claim starts from its own defaults
					if (patch.claim !== undefined && patch.claim !== prev.claim) {
						next.spec = patch.spec;
						next.R = patch.R;
						next.seed = patch.seed;
						next.thread = patch.thread;
						next.pair = patch.pair;
					}
					return next;
				},
				replace: opts?.replace,
			}),
		[navigate],
	);

	const view: PGView = search.view ?? "claims";
	const claim = useMemo(
		() =>
			search.claim
				? resolveClaim(search.claim, file, strands, graph)
				: undefined,
		[search.claim, file, strands, graph],
	);

	return (
		<main
			className={`page-wrap network-page next-page pg-page${view === "claims" && claim ? " has-claim" : ""}`}
		>
			<nav className="pg-crumb" aria-label="Next">
				<Link to="/next">Next</Link> <span aria-hidden="true">/</span>
			</nav>
			<h1 className="page-title">Proving Ground</h1>
			<p className="lede">
				Each claim below was made somewhere on this site. The ones marked live
				are re-computed now, in this browser, against a null model you can see
				and change.
			</p>

			<EngineBar onOpenLog={() => setLogOpen(true)} />
			<Tiles claims={file.claims} strands={strands} />

			<div className="pg-views">
				{VIEWS.map((v) => (
					<button
						key={v.key}
						type="button"
						className="btn"
						aria-pressed={view === v.key}
						onClick={() =>
							onSearch({ view: v.key === "claims" ? undefined : v.key })
						}
					>
						{v.label}
					</button>
				))}
			</div>

			{view === "claims" ? (
				<div className={`pg-claims${claim ? " has-claim" : ""}`}>
					<div className="pg-ledger-pane">
						<EvidenceLedger
							claims={file.claims}
							strands={strands}
							search={search}
							onSearch={onSearch}
							selected={claim?.id ?? search.claim}
						/>
					</div>
					<div className="pg-claim-pane">
						{claim ? (
							<>
								<button
									type="button"
									className="linkish pg-back"
									onClick={() => onSearch({ claim: undefined, tab: undefined })}
								>
									← all claims
								</button>
								<ClaimView
									key={claim.id}
									claim={claim}
									claims={file.claims}
									search={search}
									onSearch={onSearch}
									strands={strands}
								/>
							</>
						) : search.claim ? (
							<div className="pg-empty">
								<h2>No claim “{search.claim}”</h2>
								<p>
									The ledger has no claim with that id. It may have been
									renamed; search the ledger for its khipus.
								</p>
							</div>
						) : (
							<Intro />
						)}
					</div>
				</div>
			) : (
				<LinkAudit
					selected={search.sel}
					onSelect={(pair) => onSearch({ sel: pair }, { replace: true })}
					onOpen={(pair) =>
						onSearch({
							view: undefined,
							claim: `pair:${pair}`,
							tab: "evidence",
						})
					}
				/>
			)}

			<RunLog open={logOpen} onClose={() => setLogOpen(false)} />
		</main>
	);
}

function Tiles({
	claims,
	strands,
}: {
	claims: Parameters<typeof useLedgerRows>[0];
	strands: Parameters<typeof useLedgerRows>[1];
}) {
	const rows = useLedgerRows(claims, strands);
	const real = rows.filter((r) => !r.claim.control);
	const liveN = rows.filter((r) => r.h).length;
	const count = (v: string) => rows.filter((r) => r.v?.verdict === v).length;
	// every tile counts claims (the engine bar counts registry hypotheses)
	return (
		<div className="stats pg-stats">
			<StatTile
				label="claims"
				value={real.length}
				hint={`plus ${rows.length - real.length} controls`}
			/>
			<StatTile
				label="claims with a live test"
				value={liveN}
				hint="re-run in this browser"
			/>
			<StatTile label="claims that hold" value={count("reproduces")} />
			<StatTile label="claims drifted" value={count("drift")} />
			<StatTile label="claims contradicted" value={count("contradicts")} />
		</div>
	);
}

function Intro() {
	return (
		<div className="pg-intro">
			<h2>Pick a claim</h2>
			<p>
				Every row is something this site has said about the khipus. The{" "}
				<strong>recorded</strong> chip is what the site concluded; the{" "}
				<strong>live</strong> chip is what the engine finds now, from the same
				data, against a named chance model.
			</p>
			<ul>
				<li>
					<strong>Null</strong> shows what chance does, and lets you change the
					chance model.
				</li>
				<li>
					<strong>Robustness</strong> re-runs the claim under every reasonable
					choice it could have made.
				</li>
				<li>
					<strong>Evidence</strong> draws the cords themselves; for a pair, the
					two khipus face to face.
				</li>
				<li>
					<strong>Lineup</strong> hides the real pair among shuffles: can you
					find it?
				</li>
				<li>
					<strong>Provenance</strong> is how to cite a run: data hash, seed,
					spec.
				</li>
			</ul>
			<p className="pg-intro-note">
				Changing a setting makes the run exploratory; exploratory runs spend a
				budget of false-discovery risk (α-wealth, in the engine bar). Only runs
				at a claim's own settings give a verdict.
			</p>
		</div>
	);
}
