import { createRoot } from "react-dom/client";
import { checkAndClearCache } from "./utils/cacheControl";
import App from "./App.tsx";
import "./index.css";

checkAndClearCache().then(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
