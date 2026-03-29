import { createRoot } from "react-dom/client";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

setBaseUrl("https://btp-gestion-de-projet.onrender.com");
setAuthTokenGetter(() => localStorage.getItem("hairou_token"));

createRoot(document.getElementById("root")!).render(<App />);
