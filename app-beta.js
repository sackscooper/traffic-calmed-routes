const appModulePromise = import("./js/app.js");

async function initMap() {
  try {
    const app = await appModulePromise;
    await app.initMap();
  } catch (error) {
    console.error("Application startup failed:", error);

    const stats = document.getElementById("stats");
    const routeStats = document.getElementById("routeStats");
    const message =
      "The application could not start. Reload the page, and check that all project files are being served by the local web server.";

    if (stats) stats.innerText = "Application failed to load.";
    if (routeStats) routeStats.innerText = message;
  }
}

window.initMap = initMap;
