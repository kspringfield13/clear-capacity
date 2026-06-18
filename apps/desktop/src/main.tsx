import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/geist/wght.css";
import { App } from "./App";
import { readThemePreference } from "./services/localStore";
import "./styles.css";

document.documentElement.dataset.theme = readThemePreference();
document.documentElement.dataset.runtime = "__TAURI_INTERNALS__" in window ? "tauri" : "web";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
