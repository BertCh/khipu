import { createFileRoute } from "@tanstack/react-router";
import { inkOn } from "#/lib/khipu/colors";
import { getColors, getCorpus } from "#/lib/khipu/data";

export const Route = createFileRoute("/colors")({
	loader: async () => {
		const [colors, corpus] = await Promise.all([getColors(), getCorpus()]);
		return { colors, corpus };
	},
	head: () => ({ meta: [{ title: "Colours — Khipu" }] }),
	component: Colours,
});

const FAMILY: Record<string, string> = {
	A: "White",
	B: "Brown",
	Y: "Yellow",
	R: "Red",
	N: "Orange",
	G: "Green",
	L: "Olive",
	M: "Grey",
	H: "Blue",
	Z: "Black",
};

function Colours() {
	const { colors, corpus } = Route.useLoaderData();
	const entries = Object.entries(colors).sort(
		(a, b) => (corpus.colorCords[b[0]] ?? 0) - (corpus.colorCords[a[0]] ?? 0),
	);
	const families = new Map<string, typeof entries>();
	for (const e of entries) {
		const f = e[1].family;
		families.set(f, [...(families.get(f) ?? []), e]);
	}
	const order = Object.keys(FAMILY);

	return (
		<main className="page-wrap">
			<h1 className="page-title">The Ascher colour chart</h1>
			<p className="lede">
				Marcia and Robert Ascher recorded cord colours with two-letter codes
				keyed to the ISCC–NBS colour system. These are the 64 codes in use
				across the corpus, with the swatch each maps to and how many cords carry
				it. Mixed cords combine codes: <code>W:MB</code> is white and moderate
				brown mottled together, <code>W-MB</code> is the two plied as a barber
				pole.
			</p>

			{order.map((f) => {
				const list = families.get(f);
				if (!list) return null;
				return (
					<section className="section" key={f}>
						<h2>{FAMILY[f]}</h2>
						<div className="swatches" style={{ marginTop: "0.9rem" }}>
							{list.map(([code, c]) => (
								<div className="swatch" key={code}>
									<div
										className="swatch-chip"
										style={{ background: c.hex, color: inkOn(c.hex) }}
									>
										{code}
									</div>
									<div className="swatch-body">
										<b>{c.name}</b>
										<span>
											{(corpus.colorCords[code] ?? 0).toLocaleString()} cords ·{" "}
											{c.hex}
										</span>
									</div>
								</div>
							))}
						</div>
					</section>
				);
			})}
		</main>
	);
}
