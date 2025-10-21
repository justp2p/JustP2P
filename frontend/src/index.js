// --- Dark mode initialization (system preference) ---
if (
  localStorage.getItem("theme") === null &&
  window.matchMedia("(prefers-color-scheme: dark)").matches
) {
  document.documentElement.classList.add("dark");
  localStorage.setItem("theme", "dark");
}

// --- Main React imports ---
import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
