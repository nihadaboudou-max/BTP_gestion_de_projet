import { createRoot } from "react-dom/client";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Configure l'URL du backend (définie dans VITE_API_URL sur Render)
const apiUrl = import.meta.env.VITE_API_URL ?? "";
setBaseUrl(apiUrl || null);

// Auth token getter global
setAuthTokenGetter(() => localStorage.getItem("hairou_token"));

createRoot(document.getElementById("root")!).render(<App />);
