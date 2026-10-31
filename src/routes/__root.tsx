import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, HeadContent, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import Footer from "../components/Footer";
import Header from "../components/Header";

export const Route = createRootRoute({
	// the document shell (charset, viewport, fonts, theme bootstrap) is index.html;
	// this only sets the defaults that routes override per page
	head: () => ({
		meta: [
			{ title: "Khipu" },
			{
				name: "description",
				content:
					"684 khipus, cord by cord, from the Khipu Field Guide and the Open Khipu Repository.",
			},
		],
	}),
	component: RootLayout,
});

function RootLayout() {
	return (
		<>
			<HeadContent />
			<Header />
			<Outlet />
			<Footer />
			{import.meta.env.DEV && (
				<TanStackDevtools
					config={{ position: "bottom-right" }}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
					]}
				/>
			)}
		</>
	);
}
