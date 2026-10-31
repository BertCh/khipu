import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getRouter } from "./router";

import "./styles.css";

const router = getRouter();

// biome-ignore lint/style/noNonNullAssertion: #app is in index.html
createRoot(document.getElementById("app")!).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
