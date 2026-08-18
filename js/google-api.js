import { NASHVILLE_BOUNDS } from "./config.js";
import { parseDurationSeconds } from "./route-scoring.js";
import { isValidLineStringCoordinates } from "./traffic-matching.js";

const autocompleteLabels = new WeakMap();

export function getPlaceLabel(place) {
  return (
    (place &&
      (place.formattedAddress ||
        autocompleteLabels.get(place) ||
        place.displayName)) ||
    "Selected location"
  );
}

export function placeToRouteLocation(place) {
  if (!place || !place.location) {
    throw new Error("Selected place is missing location data.");
  }

  const latitude = place.location.lat();
  const longitude = place.location.lng();

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Selected place has invalid coordinates. Select it again.");
  }

  return {
    latitude,
    longitude,
    formattedAddress: getPlaceLabel(place)
  };
}

export function createRouteWaypoint(location) {
  return {
    lat: location.latitude,
    lng: location.longitude
  };
}

export async function createPlaceAutocompleteElements(
  startContainer,
  endContainer
) {
  await google.maps.importLibrary("places");

  if (!startContainer || !endContainer) {
    throw new Error("Autocomplete containers are missing from index.html.");
  }

  const startElement = new google.maps.places.PlaceAutocompleteElement({
    locationBias: NASHVILLE_BOUNDS,
    includedRegionCodes: ["us"],
    placeholder: "Enter start location",
    description: "Search for the trip starting location"
  });
  const endElement = new google.maps.places.PlaceAutocompleteElement({
    locationBias: NASHVILLE_BOUNDS,
    includedRegionCodes: ["us"],
    placeholder: "Enter destination",
    description: "Search for the trip destination"
  });

  startElement.id = "start";
  endElement.id = "end";
  startContainer.replaceChildren(startElement);
  endContainer.replaceChildren(endElement);

  return { startElement, endElement };
}

export async function resolvePlacePrediction(placePrediction) {
  const place = placePrediction.toPlace();
  const autocompleteLabel = placePrediction.text?.toString().trim();

  if (autocompleteLabel) {
    autocompleteLabels.set(place, autocompleteLabel);
  }

  await place.fetchFields({
    fields: ["formattedAddress", "location"]
  });

  return place;
}

function createUserFacingError(message, technicalMessage = message) {
  const error = new Error(technicalMessage);
  error.userMessage = message;
  return error;
}

function getRouteComputationErrorMessage(error) {
  const details = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();

  if (details.includes("invalid") || details.includes("argument")) {
    return "Google could not process those locations. Select both addresses again and retry.";
  }

  if (
    details.includes("denied") ||
    details.includes("permission") ||
    details.includes("unauthenticated") ||
    details.includes("401") ||
    details.includes("403")
  ) {
    return "Google Routes access was denied. Check that the API key permits the Routes API for this website.";
  }

  if (
    details.includes("quota") ||
    details.includes("resource_exhausted") ||
    details.includes("429")
  ) {
    return "The Google routing request limit has been reached. Wait a moment and try again.";
  }

  if (
    details.includes("internal") ||
    details.includes("unavailable") ||
    details.includes("500")
  ) {
    return "Google's routing service is temporarily unavailable. Try again in a few minutes.";
  }

  return "The route request failed. Check the selected locations and try again.";
}

function getCoordinateComponent(point, component) {
  const value = point && point[component];
  return Number(typeof value === "function" ? value.call(point) : value);
}

export function normalizeBrowserRoute(route) {
  const coordinates = Array.isArray(route?.path)
    ? route.path.map((point) => [
        getCoordinateComponent(point, "lng"),
        getCoordinateComponent(point, "lat")
      ])
    : [];
  const durationSeconds = Number(route?.durationMillis) / 1000;

  return {
    description: route?.description || "",
    distanceMeters: Number(route?.distanceMeters),
    duration: `${durationSeconds}s`,
    polyline: {
      geoJsonLinestring: {
        coordinates
      }
    }
  };
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new DOMException("Route request cancelled.", "AbortError");
  }
}

function isUsableApiRoute(route) {
  const durationSeconds = route && parseDurationSeconds(route.duration);

  return (
    route &&
    Number.isFinite(route.distanceMeters) &&
    route.distanceMeters >= 0 &&
    typeof route.duration === "string" &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0 &&
    route.polyline &&
    route.polyline.geoJsonLinestring &&
    isValidLineStringCoordinates(
      route.polyline.geoJsonLinestring.coordinates
    )
  );
}

export async function requestDrivingRoutes({
  origin,
  destination,
  signal
}) {
  throwIfAborted(signal);
  let data;

  try {
    const { Route } = await google.maps.importLibrary("routes");
    throwIfAborted(signal);
    data = await Route.computeRoutes({
      origin,
      destination,
      travelMode: "DRIVING",
      routingPreference: "TRAFFIC_AWARE",
      computeAlternativeRoutes: true,
      polylineQuality: "HIGH_QUALITY",
      fields: ["description", "distanceMeters", "durationMillis", "path"]
    });
    throwIfAborted(signal);
  } catch (error) {
    if (error?.name === "AbortError") throw error;

    throw createUserFacingError(
      getRouteComputationErrorMessage(error),
      `Maps JavaScript Route.computeRoutes failed: ${error?.message || error}`
    );
  }

  if (!data || !Array.isArray(data.routes) || data.routes.length === 0) {
    throw createUserFacingError(
      "No driving routes were found between those locations. Check the addresses and try again."
    );
  }

  const normalizedRoutes = data.routes.map(normalizeBrowserRoute);
  const routes = normalizedRoutes.filter(isUsableApiRoute);

  if (routes.length === 0) {
    throw createUserFacingError(
      "Google returned routes without enough map data to display them. Try the request again."
    );
  }

  return {
    routes,
    skippedRouteCount: normalizedRoutes.length - routes.length
  };
}
