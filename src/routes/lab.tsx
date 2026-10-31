import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import KhipuLumaLab from "#/components/khipu/KhipuLumaLab";
import { getColors, getKhipu, getKhipuIndex } from "#/lib/khipu/data";
import type { KhipuSummary } from "#/lib/khipu/types";
import "#/styles/lab.css";

const DEFAULT_ID = "KH0238";
const ID_RE = /^KH\d{4}$/;
/** cord names: p12, p12s1, p5m1, t1 … */
const CORD_RE = /^[a-z]\w{0,23}$/i;
/** "x,y,z,yaw,pitch" as written by `formatCam` */
const CAM_RE = /^-?[\d.]+(,-?[\d.]+){4}$/;

interface Search {
	/** Khipu to reconstruct; omitted for the default subject. */
	id?: string;
	/** Selected cord, by name. */
	cord?: string;
	/** Camera, "x,y,z,yaw,pitch"; omitted for the fitted front view. */
	cam?: string;
}

export const Route = createFileRoute("/lab")({
	validateSearch: (raw: Record<string, unknown>): Search => ({
		id:
			typeof raw.id === "string" && ID_RE.test(raw.id) && raw.id !== DEFAULT_ID
				? raw.id
				: undefined,
		cord:
			typeof raw.cord === "string" && CORD_RE.test(raw.cord)
				? raw.cord
				: undefined,
		cam:
			typeof raw.cam === "string" && CAM_RE.test(raw.cam) ? raw.cam : undefined,
	}),
	loaderDeps: ({ search }) => ({ id: search.id ?? DEFAULT_ID }),
	loader: async ({ deps }) => {
		const [khipu, colors, index] = await Promise.all([
			getKhipu(deps.id),
			getColors(),
			getKhipuIndex(),
		]);
		return { id: deps.id, khipu, colors, index };
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: `Khipu Lab — ${loaderData?.id ?? DEFAULT_ID}, live material reconstruction`,
			},
			{
				name: "description",
				content:
					"A real-time, physics-based reconstruction of an Inka khipu: every recorded knot, hitch, ply and cord end, rendered with luma.gl.",
			},
		],
	}),
	component: LabPage,
});

/** One line per khipu for the picker: id, where it is, how big it is. */
function optionLabel(k: KhipuSummary) {
	const where = k.provenance ?? k.museum ?? "provenance unknown";
	return `${k.id} · ${where} · ${k.nCords} cords, ${k.nKnots} knots`;
}

function LabPage() {
	const { id, khipu, colors, index } = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate({ from: "/lab" });
	// the lab reports its selection and settled camera; keep them in the URL
	// without adding history entries
	const onViewChange = useCallback(
		(view: { cord?: string; cam?: string }) =>
			navigate({
				search: (prev) => ({ ...prev, cord: view.cord, cam: view.cam }),
				replace: true,
				// keep the page where it is; only the address changes
				resetScroll: false,
			}),
		[navigate],
	);
	const options = useMemo(
		() => [...index].sort((a, b) => a.id.localeCompare(b.id)),
		[index],
	);
	const position = options.findIndex((k) => k.id === id);
	const prev = position > 0 ? options[position - 1] : null;
	const next =
		position >= 0 && position < options.length - 1
			? options[position + 1]
			: null;
	const choose = (nextId: string) =>
		navigate({
			// a new subject starts with no selection and the fitted view
			search: { id: nextId === DEFAULT_ID ? undefined : nextId },
		});

	const picker = (
		<div className="lab-subject">
			<label htmlFor="lab-subject-select">Subject</label>
			<div className="lab-subject-nav">
				<button
					type="button"
					disabled={!prev}
					onClick={() => prev && choose(prev.id)}
					aria-label={prev ? `Previous khipu, ${prev.id}` : "No previous khipu"}
				>
					←
				</button>
				<span>
					{position + 1} / {options.length}
				</span>
				<button
					type="button"
					disabled={!next}
					onClick={() => next && choose(next.id)}
					aria-label={next ? `Next khipu, ${next.id}` : "No next khipu"}
				>
					→
				</button>
			</div>
			<select
				id="lab-subject-select"
				value={id}
				onChange={(e) => choose(e.target.value)}
			>
				{options.map((k) => (
					<option key={k.id} value={k.id}>
						{optionLabel(k)}
					</option>
				))}
			</select>
		</div>
	);

	if (!khipu)
		return (
			<main className="lab-page">
				<header className="lab-intro page-wrap-wide">
					<div className="lab-kicker">
						<span>EXPERIMENT 01</span>
						<span>REAL-TIME MATERIAL STUDY · 1 UNIT = 4 CM</span>
					</div>
					<div className="lab-title-row">
						<h1>Khipu under gravity</h1>
						<div>
							{picker}
							<p>No record for {id}. Choose another khipu.</p>
						</div>
					</div>
				</header>
			</main>
		);

	return (
		<main className="lab-page">
			<header className="lab-intro page-wrap-wide">
				<div className="lab-kicker">
					<span>EXPERIMENT 01</span>
					<span>REAL-TIME MATERIAL STUDY · 1 UNIT = 4 CM</span>
				</div>
				<div className="lab-title-row">
					<h1>Khipu under gravity</h1>
					<div>
						{picker}
						<p>
							A physics simulation of{" "}
							<Link to="/khipus/$id" params={{ id: khipu.id }}>
								{khipu.id}
							</Link>
							, at true scale. All {khipu.stats.nCords} recorded cords keep
							their measured lengths, attachment (recto or verso), ply twist,
							colours, knot positions and directions, and end type. Click a cord
							to read its record.
						</p>
					</div>
				</div>
			</header>

			<section
				className="lab-stage page-wrap-wide"
				aria-label="Khipu simulation"
			>
				<KhipuLumaLab
					key={khipu.id}
					khipu={khipu}
					colors={colors}
					initialCord={search.cord}
					initialCam={search.cam}
					onViewChange={onViewChange}
				/>
			</section>

			<section className="lab-notes page-wrap-wide">
				<div>
					<span className="lab-note-number">01</span>
					<h2>One strand</h2>
					<p>
						Each knot is tied in the cord’s own centerline: a single knot is an
						overhand, a long knot a multiple overhand with its straight axis
						strand (AXD or AXU where recorded), a figure-eight a twisted bight
						with the end passed back through its eye. S knots lean{" "}
						<code>\</code>, Z knots <code>/</code>.
					</p>
				</div>
				<div>
					<span className="lab-note-number">02</span>
					<h2>Plied fibre</h2>
					<p>
						Cords are extruded on the GPU as two-ply rope: a two-lobed section
						that turns with the recorded twist, so S- and Z-plied cords differ
						in silhouette and shadow, and a barber-pole cord is two plies of
						different colours. Mottled, striped and tweed cords follow the
						Ascher colour codes.
					</p>
				</div>
				<div>
					<span className="lab-note-number">03</span>
					<h2>Recorded codes</h2>
					<p>
						{khipu.stats.nPendants} pendants and {khipu.stats.nSubsidiaries}{" "}
						subsidiaries hang from half-hitches made with their own doubled ends
						— a collar in front for recto, a V for verso — and finish as the
						record says: knotted, broken, cut, ravelled, doubled or just
						unfinished. {khipu.stats.nKnots} knots hang in their recorded
						parent–child structure.
					</p>
				</div>
			</section>
		</main>
	);
}
