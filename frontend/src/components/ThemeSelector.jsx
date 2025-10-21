import React, { useEffect, useState } from "react";

const themes = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else if (theme === "light") {
    document.documentElement.classList.remove("dark");
  } else if (theme === "system") {
    // Remove manual override and follow system preference
    document.documentElement.classList.remove("dark");
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.classList.add("dark");
    }
  }
}

export default function ThemeSelector() {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "system");

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem("theme", theme);
    if (theme === "system") {
      // Listen for system theme changes
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => {
        applyTheme("system");
      };
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme]);

  return (
    <div style={{ margin: "8px 0" }}>
      <label htmlFor="theme-select" style={{ marginRight: "8px" }}>
        Theme:
      </label>
      <select
        id="theme-select"
        value={theme}
        onChange={e => setTheme(e.target.value)}
        style={{
          padding: "6px 12px",
          borderRadius: "6px",
          border: "1px solid #666",
          background: theme === "dark" ? "#222" : "#fff",
          color: theme === "dark" ? "#fff" : "#222",
        }}
      >
        {themes.map(t => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
    </div>
  );
}
