import { mountApp } from "./app";
import css from "./style.css";

// Fallback UI: same app, rendered as an extension page in a popup window.
const style = document.createElement("style");
style.textContent = css;
document.head.append(style);

const root = document.getElementById("app")!;
const app = mountApp(root, { onClose: () => window.close(), standalone: true });

document.addEventListener("keydown", (e) => {
  if (app.handleKey(e)) e.preventDefault();
});
app.focus();
