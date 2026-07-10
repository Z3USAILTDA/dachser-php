import { createRoot } from "react-dom/client";
import { checkAndClearCache } from "./utils/cacheControl";
import App from "./App.tsx";
import "./index.css";
import "mapbox-gl/dist/mapbox-gl.css";

console.info("Build version:", import.meta.env.VITE_APP_VERSION);
console.info("Build date:", import.meta.env.VITE_BUILD_DATE);

checkAndClearCache().then(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
