import {
  createPlaceAutocompleteElements,
  createRouteWaypoint,
  getPlaceLabel,
  placeToRouteLocation,
  requestDrivingRoutes,
  resolvePlacePrediction
} from "./google-api.js";
import {
  clearRouteState,
  createRouteAppState,
  swapRouteState
} from "./app-state.js";
import { createMapRenderer } from "./map-renderer.js";
import {
  analyzeRoutes,
  clampPenaltyMultiplier,
  getRecommendedRouteIndex,
  recalculateAnalyzedRouteScores
} from "./route-scoring.js";
import { loadTrafficCalmingData } from "./traffic-data.js";
import { createUiRenderer } from "./ui-renderer.js";

const state = createRouteAppState();
const ui = createUiRenderer();
const mapRenderer = createMapRenderer();
let initialized = false;
const mobileAutocompleteMediaQuery = "(max-width: 600px)";
const autocompleteScrollTimers = new WeakMap();

function updateControls() {
  ui.updateControls({
    routeRequestInProgress: state.routeRequestInProgress,
    autocompleteReady: state.autocompleteReady,
    trafficCalmingDataReady: state.trafficCalmingDataReady,
    startPlace: state.startPlace,
    endPlace: state.endPlace,
    routeCount: state.analyzedRoutes.length
  });
}

function setRouteRequestInProgress(inProgress) {
  const changed = state.routeRequestInProgress !== inProgress;
  state.routeRequestInProgress = inProgress;
  updateControls();

  if (changed && inProgress) {
    ui.announceStatus("Finding route options.");
  }
}

function cancelActiveRouteRequest() {
  state.latestRouteRequestId++;

  if (state.activeRouteAbortController) {
    state.activeRouteAbortController.abort();
    state.activeRouteAbortController = null;
  }

  setRouteRequestInProgress(false);
}

function clearAnalyzedRoute() {
  mapRenderer.clearRouteVisualization();
  state.analyzedRoutes = [];
  state.currentRouteIndex = 0;
}

function setAutocompleteValue(element, value) {
  if (element) {
    element.value = value;
  }
}

function swapLocations() {
  if (
    !state.startPlace ||
    !state.endPlace ||
    state.routeRequestInProgress
  ) {
    return;
  }

  cancelActiveRouteRequest();
  mapRenderer.clearRouteVisualization();
  state.startSelectionId++;
  state.endSelectionId++;

  if (!swapRouteState(state)) return;

  state.suppressStartInvalidationUntil = Date.now() + 250;
  state.suppressEndInvalidationUntil = Date.now() + 250;
  setAutocompleteValue(
    state.startAutocompleteElement,
    getPlaceLabel(state.startPlace)
  );
  setAutocompleteValue(
    state.endAutocompleteElement,
    getPlaceLabel(state.endPlace)
  );
  mapRenderer.refreshEndpointMarkers(state.startPlace, state.endPlace);
  mapRenderer.fitEndpointMarkers(state.startPlace, state.endPlace);
  ui.setRouteStatus(
    "Locations swapped. Select Get Route to calculate the reverse trip."
  );
  updateControls();
}

function clearRouteAndLocations() {
  cancelActiveRouteRequest();
  mapRenderer.clearRouteVisualization();
  state.startSelectionId++;
  state.endSelectionId++;
  clearRouteState(state);
  state.suppressStartInvalidationUntil = Date.now() + 250;
  state.suppressEndInvalidationUntil = Date.now() + 250;
  setAutocompleteValue(state.startAutocompleteElement, "");
  setAutocompleteValue(state.endAutocompleteElement, "");
  mapRenderer.clearEndpointMarker("start");
  mapRenderer.clearEndpointMarker("end");
  ui.clearRouteResults();
  mapRenderer.resetViewport();
  updateControls();
  ui.announceStatus("Route and locations cleared.");
}

function drawAnalyzedRoute(routeIndex, shouldAnnounce = true) {
  const selected = state.analyzedRoutes[routeIndex];

  if (!selected) {
    ui.setRouteStatus("No analyzed route found.");
    return;
  }

  state.currentRouteIndex = routeIndex;
  const recommendedRouteIndex = getRecommendedRouteIndex(
    state.analyzedRoutes
  );

  mapRenderer.drawAnalyzedRoutes(
    state.analyzedRoutes,
    state.currentRouteIndex,
    (selectedIndex) => drawAnalyzedRoute(selectedIndex)
  );
  ui.renderRouteComparison({
    analyzedRoutes: state.analyzedRoutes,
    currentRouteIndex: state.currentRouteIndex,
    penaltyMultiplier: state.trafficCalmingPenaltyMultiplier,
    recommendedRouteIndex,
    onRouteSelected: (selectedIndex) => drawAnalyzedRoute(selectedIndex)
  });

  if (shouldAnnounce) {
    ui.announceStatus(
      `Route ${routeIndex + 1} selected. ${selected.uniqueMatchedProjects.length} matched traffic-calmed project(s).`
    );
  }
}

function handlePenaltyMultiplierChange(event) {
  const nextMultiplier = clampPenaltyMultiplier(event.target.value);
  if (nextMultiplier === null) return;

  state.trafficCalmingPenaltyMultiplier = nextMultiplier;
  ui.setPenaltyMultiplier(nextMultiplier);

  if (state.analyzedRoutes.length > 0) {
    state.analyzedRoutes = recalculateAnalyzedRouteScores(
      state.analyzedRoutes,
      nextMultiplier
    );
    drawAnalyzedRoute(state.currentRouteIndex, false);
  }

  ui.announceStatus(
    `Traffic-calming avoidance set to ${nextMultiplier.toFixed(2).replace(/0$/, "")} times.`
  );
}

function isAddressEditingKey(event) {
  return (
    event.key === "Backspace" ||
    event.key === "Delete" ||
    (event.key &&
      event.key.length === 1 &&
      !event.metaKey &&
      !event.ctrlKey)
  );
}

function alignMobileAutocomplete(element) {
  const sidebar = document.getElementById("sidebar");

  if (
    !sidebar ||
    !element ||
    !window.matchMedia(mobileAutocompleteMediaQuery).matches
  ) {
    return;
  }

  const elementRect = element.getBoundingClientRect();
  const sidebarRect = sidebar.getBoundingClientRect();
  const targetScrollTop =
    sidebar.scrollTop + elementRect.top - sidebarRect.top - 8;

  sidebar.scrollTop = Math.max(0, targetScrollTop);
}

function activateMobileAutocomplete(element) {
  const sidebar = document.getElementById("sidebar");

  if (
    !sidebar ||
    !window.matchMedia(mobileAutocompleteMediaQuery).matches
  ) {
    return;
  }

  sidebar.classList.add("autocomplete-active");
  window.requestAnimationFrame(() => alignMobileAutocomplete(element));

  const existingTimer = autocompleteScrollTimers.get(element);
  if (existingTimer) window.clearTimeout(existingTimer);

  autocompleteScrollTimers.set(
    element,
    window.setTimeout(() => alignMobileAutocomplete(element), 300)
  );
}

function deactivateMobileAutocomplete() {
  document
    .getElementById("sidebar")
    ?.classList.remove("autocomplete-active");
}

function scheduleMobileAutocompleteDeactivation() {
  window.setTimeout(() => {
    if (!document.querySelector("gmp-place-autocomplete:focus-within")) {
      deactivateMobileAutocomplete();
    }
  }, 150);
}

function invalidateSelectedPlace(which) {
  const now = Date.now();
  const isStart = which === "start";
  const invalidationSuppressed = isStart
    ? now < state.suppressStartInvalidationUntil
    : now < state.suppressEndInvalidationUntil;

  if (invalidationSuppressed) return;

  if (isStart) {
    state.startSelectionId++;
  } else {
    state.endSelectionId++;
  }

  const hadSelection = isStart
    ? Boolean(state.startPlace)
    : Boolean(state.endPlace);

  if (!hadSelection && !state.routeRequestInProgress) return;

  if (isStart) {
    state.startPlace = null;
  } else {
    state.endPlace = null;
  }

  cancelActiveRouteRequest();
  clearAnalyzedRoute();
  mapRenderer.clearEndpointMarker(which);
  ui.setRouteStatus(
    `${isStart ? "Start location" : "Destination"} changed. Select an updated address from the suggestions before requesting another route.`
  );
  updateControls();
}

function attachPlaceInvalidationListeners(element, which) {
  element.addEventListener("focusin", () => {
    activateMobileAutocomplete(element);
  });
  element.addEventListener("focusout", scheduleMobileAutocompleteDeactivation);
  element.addEventListener("input", () => {
    invalidateSelectedPlace(which);
    activateMobileAutocomplete(element);
  });
  element.addEventListener("paste", () => invalidateSelectedPlace(which));
  element.addEventListener("cut", () => invalidateSelectedPlace(which));
  element.addEventListener("keydown", (event) => {
    if (isAddressEditingKey(event)) {
      invalidateSelectedPlace(which);
    }
  });
}

async function handlePlaceSelection(which, placePrediction) {
  const isStart = which === "start";
  const selectionKey = isStart ? "startSelectionId" : "endSelectionId";
  const suppressionKey = isStart
    ? "suppressStartInvalidationUntil"
    : "suppressEndInvalidationUntil";
  const placeKey = isStart ? "startPlace" : "endPlace";
  const selectionId = ++state[selectionKey];

  state[placeKey] = null;
  mapRenderer.clearEndpointMarker(which);
  clearAnalyzedRoute();
  updateControls();
  state[suppressionKey] = Date.now() + 100;

  try {
    const place = await resolvePlacePrediction(placePrediction);
    if (selectionId !== state[selectionKey]) return;

    state[placeKey] = place;
    state[suppressionKey] = Date.now() + 100;
    mapRenderer.updateEndpointMarker(which, place);
    mapRenderer.fitEndpointMarkers(state.startPlace, state.endPlace);
    updateControls();
    ui.announceStatus(
      `${isStart ? "Start location" : "Destination"} selected: ${getPlaceLabel(place)}.`
    );
    deactivateMobileAutocomplete();
  } catch (error) {
    if (selectionId !== state[selectionKey]) return;

    state[placeKey] = null;
    console.error(`${isStart ? "Start" : "Destination"} place details failed:`, error);
    ui.setRouteStatus(
      `The ${isStart ? "start location" : "destination"} could not be loaded. Please select it again from the suggestions.`
    );
    updateControls();
    deactivateMobileAutocomplete();
  }
}

async function setupPlaceAutocomplete() {
  const { startElement, endElement } =
    await createPlaceAutocompleteElements(
      document.getElementById("startAutocompleteContainer"),
      document.getElementById("endAutocompleteContainer")
    );

  state.startAutocompleteElement = startElement;
  state.endAutocompleteElement = endElement;
  attachPlaceInvalidationListeners(startElement, "start");
  attachPlaceInvalidationListeners(endElement, "end");

  startElement.addEventListener("gmp-select", ({ placePrediction }) => {
    handlePlaceSelection("start", placePrediction);
  });
  endElement.addEventListener("gmp-select", ({ placePrediction }) => {
    handlePlaceSelection("end", placePrediction);
  });
  startElement.addEventListener("gmp-error", (event) => {
    console.error("Start autocomplete error:", event);
    ui.setRouteStatus(
      "Start-location suggestions are temporarily unavailable. Check your connection and try again."
    );
  });
  endElement.addEventListener("gmp-error", (event) => {
    console.error("End autocomplete error:", event);
    ui.setRouteStatus(
      "Destination suggestions are temporarily unavailable. Check your connection and try again."
    );
  });
}

async function loadTrafficCalmingSegments() {
  state.trafficCalmingDataReady = false;
  updateControls();

  try {
    const { segments, skippedSegmentCount } =
      await loadTrafficCalmingData();
    state.trafficCalmingSegments = segments;
    mapRenderer.setTrafficCalmingSegments(segments);

    const statusMessage =
      skippedSegmentCount > 0
        ? `Loaded ${segments.length} traffic-calmed road segments. Skipped ${skippedSegmentCount} malformed segment(s).`
        : `Loaded ${segments.length} traffic-calmed road segments.`;

    ui.setTrafficDataStatus(statusMessage);
    state.trafficCalmingDataReady = true;
    ui.announceStatus(
      `Loaded ${segments.length} traffic-calmed road segments.`
    );
  } catch (error) {
    console.error("Error loading GeoJSON:", error);
    state.trafficCalmingSegments = [];
    mapRenderer.clearTrafficCalmingSegments();
    const statusMessage =
      error.userMessage ||
      (error instanceof SyntaxError
        ? "Traffic-calming data is not valid JSON. Check the GeoJSON file for formatting errors."
        : "Traffic-calming data could not be loaded. Make sure the local server is running, then reload the page.");
    ui.setTrafficDataStatus(statusMessage);
    ui.announceStatus(statusMessage);
  } finally {
    updateControls();
  }
}

async function computeAndDrawRoute(origin, destination) {
  const requestId = ++state.latestRouteRequestId;

  if (state.activeRouteAbortController) {
    state.activeRouteAbortController.abort();
  }

  const abortController = new AbortController();
  state.activeRouteAbortController = abortController;
  setRouteRequestInProgress(true);

  try {
    ui.setRouteStatus("Finding route options...");
    const { routes, skippedRouteCount } = await requestDrivingRoutes({
      origin,
      destination,
      signal: abortController.signal
    });

    if (requestId !== state.latestRouteRequestId) return;

    if (skippedRouteCount > 0) {
      console.warn(
        `Skipped ${skippedRouteCount} incomplete route option(s).`
      );
    }

    state.analyzedRoutes = analyzeRoutes(
      routes,
      state.trafficCalmingSegments,
      state.trafficCalmingPenaltyMultiplier
    );
    state.currentRouteIndex = getRecommendedRouteIndex(
      state.analyzedRoutes
    );
    drawAnalyzedRoute(state.currentRouteIndex, false);
    updateControls();
    ui.announceStatus(
      `${state.analyzedRoutes.length} route option(s) found. Route ${state.currentRouteIndex + 1} is recommended.`
    );
  } catch (error) {
    if (
      error.name === "AbortError" ||
      requestId !== state.latestRouteRequestId
    ) {
      return;
    }

    console.error("Route request failed:", error);
    ui.setRouteStatus(
      error.userMessage ||
        (error instanceof TypeError
          ? "Could not reach Google's routing service. Check your internet connection and try again."
          : "The route could not be calculated. Select the locations again and retry.")
    );
  } finally {
    if (requestId === state.latestRouteRequestId) {
      state.activeRouteAbortController = null;
      setRouteRequestInProgress(false);
    }
  }
}

async function calculateRouteFromInputs() {
  if (state.routeRequestInProgress) return;

  if (!state.trafficCalmingDataReady) {
    ui.setRouteStatus(
      "Traffic-calming data is not ready yet. Wait for it to finish loading and try again."
    );
    return;
  }

  if (!state.startPlace || !state.endPlace) {
    ui.setRouteStatus(
      "Select both a start location and destination from the suggestions."
    );
    return;
  }

  try {
    ui.setRouteStatus("Using selected places and requesting routes...");
    const startLocation = placeToRouteLocation(state.startPlace);
    const endLocation = placeToRouteLocation(state.endPlace);

    ui.renderSelectedLocations(
      startLocation.formattedAddress,
      endLocation.formattedAddress
    );
    ui.announceStatus("Locations selected. Requesting route options.");

    await computeAndDrawRoute(
      createRouteWaypoint(startLocation),
      createRouteWaypoint(endLocation)
    );
  } catch (error) {
    console.error("Place route calculation failed:", error);
    ui.setRouteStatus(`Route setup failed: ${error.message}`);
  }
}

function attachStaticControls() {
  document
    .getElementById("routeButton")
    .addEventListener("click", calculateRouteFromInputs);
  document
    .getElementById("swapButton")
    .addEventListener("click", swapLocations);
  document
    .getElementById("clearButton")
    .addEventListener("click", clearRouteAndLocations);
  document
    .getElementById("penaltyMultiplier")
    .addEventListener("input", handlePenaltyMultiplierChange);
}

export async function initMap() {
  if (initialized) return;
  initialized = true;

  attachStaticControls();
  updateControls();
  mapRenderer.initialize(document.getElementById("map"));

  try {
    await mapRenderer.prepareEndpointMarkers();
  } catch (error) {
    console.error("Marker setup failed:", error);
    ui.announceStatus(
      "Map markers could not be loaded. Routing remains available."
    );
  }

  try {
    await setupPlaceAutocomplete();
    state.autocompleteReady = true;
    updateControls();
  } catch (error) {
    console.error("Autocomplete setup failed:", error);
    ui.setRouteStatus(
      "Address search could not be loaded. Check your internet connection and Google Maps configuration, then reload the page."
    );
  }

  await loadTrafficCalmingSegments();
}
