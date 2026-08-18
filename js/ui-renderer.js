import {
  MATCH_DISTANCE_THRESHOLD_METERS,
  MIN_CONTIGUOUS_MATCH_METERS,
  TRAFFIC_CALMING_DISTANCE_PENALTY_MINUTES_PER_KM,
  TRAFFIC_CALMING_PROJECT_PENALTY_MINUTES
} from "./config.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMultiplier(multiplier) {
  return multiplier.toFixed(2).replace(/0$/, "");
}

function formatRouteDifference(value, unit, decimals, comparisonLabel) {
  const roundedMagnitude = Number(Math.abs(value).toFixed(decimals));

  if (roundedMagnitude === 0) {
    return `Same ${comparisonLabel} as baseline`;
  }

  return `${value < 0 ? "Saves" : "Adds"} ${roundedMagnitude.toFixed(decimals)} ${unit}`;
}

function formatSegmentDifference(avoidedSegments) {
  if (avoidedSegments > 0) {
    return `Avoids ${avoidedSegments} traffic-calmed project(s)`;
  }

  if (avoidedSegments < 0) {
    return `Uses ${Math.abs(avoidedSegments)} more traffic-calmed project(s)`;
  }

  return "Uses the same number of traffic-calmed projects";
}

function formatMatchedDistance(distanceMeters) {
  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(2)} km`;
  }

  return `${Math.round(distanceMeters)} m`;
}

function formatMatchedDistanceDifference(avoidedDistanceMeters) {
  const roundedDistance = Math.round(Math.abs(avoidedDistanceMeters));

  if (roundedDistance < 10) {
    return "Uses approximately the same traffic-calmed distance";
  }

  return avoidedDistanceMeters > 0
    ? `Avoids approximately ${formatMatchedDistance(roundedDistance)} of traffic calming`
    : `Uses approximately ${formatMatchedDistance(roundedDistance)} more traffic-calmed roadway`;
}

export function createUiRenderer() {
  const routeButton = document.getElementById("routeButton");
  const swapButton = document.getElementById("swapButton");
  const clearButton = document.getElementById("clearButton");
  const penaltyControl = document.getElementById("penaltyMultiplier");
  const penaltyValue = document.getElementById("penaltyValue");
  const stats = document.getElementById("stats");
  const routeStats = document.getElementById("routeStats");
  const announcer = document.getElementById("announcer");

  function announceStatus(message) {
    if (!announcer) return;

    announcer.textContent = "";
    window.setTimeout(() => {
      announcer.textContent = message;
    }, 0);
  }

  function setRouteStatus(message) {
    if (routeStats) {
      routeStats.innerText = message;
    }

    announceStatus(message);
  }

  function setTrafficDataStatus(message) {
    if (stats) {
      stats.innerText = message;
    }
  }

  function updateControls({
    routeRequestInProgress,
    autocompleteReady,
    trafficCalmingDataReady,
    startPlace,
    endPlace,
    routeCount
  }) {
    if (routeButton) {
      routeButton.disabled =
        routeRequestInProgress ||
        !autocompleteReady ||
        !trafficCalmingDataReady;
      routeButton.textContent = routeRequestInProgress
        ? "Finding routes..."
        : "Get Route";
      routeButton.setAttribute(
        "aria-busy",
        String(routeRequestInProgress)
      );
    }

    if (swapButton) {
      swapButton.disabled =
        routeRequestInProgress || !startPlace || !endPlace;
    }

    if (clearButton) {
      clearButton.disabled = !(
        routeRequestInProgress ||
        startPlace ||
        endPlace ||
        routeCount > 0
      );
    }

    if (penaltyControl) {
      penaltyControl.disabled = routeRequestInProgress;
    }
  }

  function setPenaltyMultiplier(multiplier) {
    if (penaltyValue) {
      penaltyValue.textContent = `${formatMultiplier(multiplier)}×`;
    }
  }

  function renderSelectedLocations(startAddress, endAddress) {
    if (!routeStats) return;

    routeStats.innerHTML = `
      <strong>Locations selected</strong><br>
      Start: ${escapeHtml(startAddress)}<br>
      Destination: ${escapeHtml(endAddress)}<br><br>
      Requesting routes...
    `;
  }

  function clearRouteResults() {
    if (routeStats) {
      routeStats.innerText = "";
    }
  }

  function renderRouteComparison({
    analyzedRoutes,
    currentRouteIndex,
    penaltyMultiplier,
    recommendedRouteIndex,
    onRouteSelected
  }) {
    if (!routeStats || analyzedRoutes.length === 0) {
      setRouteStatus("No route options available.");
      return;
    }

    const baseline = analyzedRoutes[0];
    const recommended = analyzedRoutes[recommendedRouteIndex];
    const routeCards = analyzedRoutes
      .map((analyzed, index) => {
        const isSelected = index === currentRouteIndex;
        const isRecommended = analyzed.index === recommended.index;
        const extraMinutes =
          analyzed.durationMinutes - baseline.durationMinutes;
        const extraMiles = analyzed.distanceMiles - baseline.distanceMiles;
        const avoidedSegments =
          baseline.uniqueMatchedProjects.length -
          analyzed.uniqueMatchedProjects.length;
        const avoidedMatchedDistance =
          baseline.matchedDistanceMeters - analyzed.matchedDistanceMeters;

        return `
          <div class="route-card ${isSelected ? "selected-route" : ""}">
            <strong>Route ${index + 1}</strong>
            ${isRecommended ? "<span class='recommended-badge'>Recommended</span>" : ""}
            <br>
            Distance: ${analyzed.distanceMiles.toFixed(2)} mi<br>
            Duration: ${analyzed.durationMinutes.toFixed(1)} min<br>
            Traffic-calmed projects: ${analyzed.uniqueMatchedProjects.length}<br>
            Matched traffic-calmed distance: ${formatMatchedDistance(analyzed.matchedDistanceMeters)}<br>
            Exposure penalty: ${analyzed.exposurePenaltyMinutes.toFixed(1)} min<br>
            Adjusted score: ${analyzed.score.toFixed(1)}<br>
            ${
              index === 0
                ? "Baseline route<br>"
                : `${formatRouteDifference(extraMinutes, "min", 1, "duration")}<br>
                   ${formatRouteDifference(extraMiles, "mi", 2, "distance")}<br>
                   ${formatSegmentDifference(avoidedSegments)}<br>
                   ${formatMatchedDistanceDifference(avoidedMatchedDistance)}<br>`
            }
            <button
              type="button"
              aria-pressed="${isSelected}"
              data-route-index="${index}"
            >${isSelected ? "Selected" : "View route"}</button>
          </div>
        `;
      })
      .join("");

    const selected = analyzedRoutes[currentRouteIndex];
    const matchedNames = selected.uniqueMatchedProjects
      .slice(0, 8)
      .map((segment) => {
        const street = escapeHtml(segment.props.OnStreet || "Unknown street");
        const from = escapeHtml(segment.props.BeginStreet || "Unknown");
        const to = escapeHtml(segment.props.EndStreet || "Unknown");
        const overlap = segment.overlapDistanceMeters
          ? `${Math.round(segment.overlapDistanceMeters)} m`
          : "unknown distance";

        return `• ${street} (${from} to ${to}) - approx. ${overlap}`;
      });
    const matchedList =
      matchedNames.length > 0 ? matchedNames.join("<br>") : "None detected";
    const recommendedExtraMinutes =
      recommended.durationMinutes - baseline.durationMinutes;
    const recommendedExtraMiles =
      recommended.distanceMiles - baseline.distanceMiles;
    const recommendedAvoidedSegments =
      baseline.uniqueMatchedProjects.length -
      recommended.uniqueMatchedProjects.length;
    const recommendedAvoidedMatchedDistance =
      baseline.matchedDistanceMeters - recommended.matchedDistanceMeters;

    routeStats.innerHTML = `
      <strong>Route Options</strong><br>
      Alternatives found: ${analyzedRoutes.length}<br>
      Avoidance strength: ${formatMultiplier(penaltyMultiplier)}×<br>
      Scoring: travel time + ${(TRAFFIC_CALMING_PROJECT_PENALTY_MINUTES * penaltyMultiplier).toFixed(2)} min per matched project + ${(TRAFFIC_CALMING_DISTANCE_PENALTY_MINUTES_PER_KM * penaltyMultiplier).toFixed(2)} min per matched km<br>
      Match rule: within ${MATCH_DISTANCE_THRESHOLD_METERS} m, road-aligned, and continuous for at least ${MIN_CONTIGUOUS_MATCH_METERS} m<br><br>

      <div class="recommendation-box">
        <strong>Recommended: Route ${recommended.index + 1}</strong><br>
        ${
          recommended.index === baseline.index
            ? "The baseline route is still best under the current penalty setting."
            : `${formatSegmentDifference(recommendedAvoidedSegments)}<br>
               ${formatMatchedDistanceDifference(recommendedAvoidedMatchedDistance)}<br>
               ${formatRouteDifference(recommendedExtraMinutes, "min", 1, "duration")}<br>
               ${formatRouteDifference(recommendedExtraMiles, "mi", 2, "distance")}`
        }
      </div>

      ${routeCards}

      <br>
      <strong>Selected Route ${currentRouteIndex + 1} Matched Projects:</strong><br>
      ${matchedList}
    `;

    routeStats
      .querySelectorAll("[data-route-index]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          onRouteSelected(Number(button.dataset.routeIndex));
        });
      });
  }

  return {
    announceStatus,
    setRouteStatus,
    setTrafficDataStatus,
    updateControls,
    setPenaltyMultiplier,
    renderSelectedLocations,
    clearRouteResults,
    renderRouteComparison
  };
}
