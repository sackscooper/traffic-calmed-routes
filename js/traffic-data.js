import { TRAFFIC_CALMING_DATA_URL } from "./config.js";
import { parseTrafficCalmingGeoJson } from "./traffic-matching.js";

export async function loadTrafficCalmingData(
  url = TRAFFIC_CALMING_DATA_URL
) {
  const response = await fetch(url);

  if (!response.ok) {
    const error = new Error(
      `Traffic-calming data request returned ${response.status}.`
    );
    error.userMessage =
      response.status === 404
        ? "Traffic-calming data file was not found. Confirm that traffic_calming_segments-beta.geojson is in the project folder."
        : `Traffic-calming data could not be loaded (HTTP ${response.status}).`;
    throw error;
  }

  const geojson = await response.json();
  return parseTrafficCalmingGeoJson(geojson);
}
