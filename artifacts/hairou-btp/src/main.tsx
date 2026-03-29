import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

const apiUrl = import.meta.env.VITE_API_URL ?? "";
setBaseUrl(apiUrl || null);

createRoot(document.getElementById("root")!).render(<App />);
