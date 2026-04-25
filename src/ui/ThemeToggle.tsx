import { useEffect, useState } from "react";
import { getCurrentTheme, toggleTheme, type Theme } from "./theme.ts";

export function ThemeToggle(): React.ReactElement {
  const [theme, setTheme] = useState<Theme>(() => getCurrentTheme());

  useEffect(() => {
    setTheme(getCurrentTheme());
  }, []);

  const handleClick = (): void => {
    setTheme(toggleTheme());
  };

  const label = theme === "dark" ? "Light theme" : "Dark theme";
  const icon = theme === "dark" ? "☀" : "☾";

  return (
    <button
      type="button"
      onClick={handleClick}
      title={label}
      aria-label={label}
      className="archik-btn"
      style={{ minWidth: 30, justifyContent: "center" }}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}
