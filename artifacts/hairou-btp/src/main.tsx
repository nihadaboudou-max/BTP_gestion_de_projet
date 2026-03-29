import { createRoot } from "react-dom/client";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

const apiUrl = import.meta.env.VITE_API_URL 
  || "https://btp-gestion-de-projet.onrender.com";

setBaseUrl(apiUrl);
setAuthTokenGetter(() => localStorage.getItem("hairou_token"));

createRoot(document.getElementById("root")!).render(<App />);
