export function createRouteAppState() {
  return {
    trafficCalmingSegments: [],
    analyzedRoutes: [],
    currentRouteIndex: 0,
    startPlace: null,
    endPlace: null,
    startAutocompleteElement: null,
    endAutocompleteElement: null,
    autocompleteReady: false,
    trafficCalmingDataReady: false,
    routeRequestInProgress: false,
    latestRouteRequestId: 0,
    activeRouteAbortController: null,
    suppressStartInvalidationUntil: 0,
    suppressEndInvalidationUntil: 0,
    startSelectionId: 0,
    endSelectionId: 0,
    trafficCalmingPenaltyMultiplier: 1
  };
}

export function swapRouteState(routeState) {
  if (!routeState.startPlace || !routeState.endPlace) return false;

  [routeState.startPlace, routeState.endPlace] = [
    routeState.endPlace,
    routeState.startPlace
  ];
  routeState.analyzedRoutes = [];
  routeState.currentRouteIndex = 0;
  return true;
}

export function clearRouteState(routeState) {
  routeState.startPlace = null;
  routeState.endPlace = null;
  routeState.analyzedRoutes = [];
  routeState.currentRouteIndex = 0;
}
