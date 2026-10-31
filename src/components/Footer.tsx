export default function Footer() {
	return (
		<footer className="site-footer">
			<div className="page-wrap">
				<p>
					Data from the{" "}
					<a
						href="https://khipufieldguide.com/"
						target="_blank"
						rel="noreferrer"
					>
						Khipu Field Guide
					</a>{" "}
					(Ashok Khosla, MIT licence) and the{" "}
					<a
						href="https://github.com/khipulab/open-khipu-repository"
						target="_blank"
						rel="noreferrer"
					>
						Open Khipu Repository
					</a>{" "}
					(
					<a
						href="https://doi.org/10.5281/zenodo.18025748"
						target="_blank"
						rel="noreferrer"
					>
						doi:10.5281/zenodo.18025748
					</a>
					). Colour swatches follow the Ascher colour chart via ISCC–NBS
					centroids.
				</p>
			</div>
		</footer>
	);
}
