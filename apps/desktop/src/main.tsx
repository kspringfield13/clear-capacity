import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/geist/wght.css";
import { App } from "./App";
import { readThemePreference } from "./services/localStore";
import "./styles.css";

// Default sync, load async preference
document.documentElement.dataset.theme = "light";
document.documentElement.dataset.runtime = "__TAURI_INTERNALS__" in window ? "tauri" : "web";

readThemePreference().then((theme) => {
  document.documentElement.dataset.theme = theme;
}).catch(() => {
  // keep default
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
