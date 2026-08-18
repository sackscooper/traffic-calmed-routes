import { MAP_ID, NASHVILLE_CENTER } from "./config.js";
import { getPlaceLabel } from "./google-api.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(timestamp) {
  if (!timestamp) return "Unknown";
  return new Date(timestamp).toLocaleDateString();
}

export function createMapRenderer() {
  let map = null;
  let currentRoutePolyline = null;
  let currentRoutePolylines = [];
  let currentMatchedSegments = [];
  let renderedTrafficCalmingSegments = [];
  let trafficCalmingBounds = null;
  let startMarker = null;
  let endMarker = null;
  let AdvancedMarkerElementClass = null;
  let PinElementClass = null;

  function initialize(mapElement) {
    map = new google.maps.Map(mapElement, {
      center: NASHVILLE_CENTER,
      zoom: 11,
      mapTypeId: "roadmap",
      mapId: MAP_ID
    });
  }

  async function prepareEndpointMarkers() {
    const markerLibrary = await google.maps.importLibrary("marker");
    AdvancedMarkerElementClass = markerLibrary.AdvancedMarkerElement;
    PinElementClass = markerLibrary.PinElement;
  }

  function clearTrafficCalmingSegments() {
    renderedTrafficCalmingSegments.forEach((segment) => {
      if (segment.googleLine) {
        segment.googleLine.setMap(null);
        segment.googleLine = null;
      }
    });
    renderedTrafficCalmingSegments = [];
    trafficCalmingBounds = null;
  }

  function drawTrafficCalmingSegment(segment, bounds) {
    const path = segment.coordinates.map((coordinate) => {
      const point = { lat: coordinate[1], lng: coordinate[0] };
      bounds.extend(point);
      return point;
    });
    const line = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: "#fe0000",
      strokeWeight: 3,
      strokeOpacity: 0.55,
      zIndex: 1,
      map
    });
    const infoWindow = new google.maps.InfoWindow();
    const props = segment.props;

    line.addListener("click", (event) => {
      infoWindow.setContent(`
        <strong>${escapeHtml(props.OnStreet || "Unknown street")}</strong><br>
        From: ${escapeHtml(props.BeginStreet || "Unknown")}<br>
        To: ${escapeHtml(props.EndStreet || "Unknown")}<br>
        Neighborhood: ${escapeHtml(props.Neighborhood || "Unknown")}<br>
        Status: ${escapeHtml(props.Status || "Unknown")}<br>
        Complete Date: ${escapeHtml(formatDate(props.CompleteDate))}
      `);
      infoWindow.setPosition(event.latLng);
      infoWindow.open(map);
    });

    segment.googleLine = line;
  }

  function setTrafficCalmingSegments(segments) {
    clearTrafficCalmingSegments();
    const bounds = new google.maps.LatLngBounds();

    segments.forEach((segment) => {
      drawTrafficCalmingSegment(segment, bounds);
    });

    renderedTrafficCalmingSegments = segments;
    trafficCalmingBounds = bounds;

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds);
    }
  }

  function clearEndpointMarker(which) {
    const marker = which === "start" ? startMarker : endMarker;

    if (marker) {
      marker.map = null;
    }

    if (which === "start") {
      startMarker = null;
    } else {
      endMarker = null;
    }
  }

  function updateEndpointMarker(which, place) {
    if (!AdvancedMarkerElementClass || !PinElementClass || !place?.location) {
      return;
    }

    const isStart = which === "start";
    let marker = isStart ? startMarker : endMarker;
    const title = `${isStart ? "Start" : "Destination"}: ${getPlaceLabel(place)}`;

    if (marker) {
      marker.position = place.location;
      marker.title = title;
      marker.map = map;
      return;
    }

    const pin = new PinElementClass({
      background: isStart ? "#188038" : "#c5221f",
      borderColor: "#ffffff",
      glyphColor: "#ffffff",
      glyphText: isStart ? "A" : "B",
      scale: 1.1
    });

    marker = new AdvancedMarkerElementClass({
      map,
      position: place.location,
      title,
      zIndex: 40
    });
    marker.append(pin);

    if (isStart) {
      startMarker = marker;
    } else {
      endMarker = marker;
    }
  }

  function refreshEndpointMarkers(startPlace, endPlace) {
    if (startPlace) {
      updateEndpointMarker("start", startPlace);
    } else {
      clearEndpointMarker("start");
    }

    if (endPlace) {
      updateEndpointMarker("end", endPlace);
    } else {
      clearEndpointMarker("end");
    }
  }

  function fitEndpointMarkers(startPlace, endPlace) {
    if (!startPlace?.location || !endPlace?.location) return;

    const bounds = new google.maps.LatLngBounds();
    bounds.extend(startPlace.location);
    bounds.extend(endPlace.location);
    map.fitBounds(bounds, 80);
  }

  function clearRoutePolylines() {
    currentRoutePolylines.forEach((polyline) => polyline.setMap(null));
    currentRoutePolylines = [];

    if (currentRoutePolyline) {
      currentRoutePolyline.setMap(null);
      currentRoutePolyline = null;
    }
  }

  function resetMatchedSegmentStyles() {
    currentMatchedSegments.forEach((segment) => {
      if (!segment.googleLine) return;
      segment.googleLine.setOptions({
        strokeColor: "#fe0000",
        strokeWeight: 3,
        strokeOpacity: 0.65,
        zIndex: 1
      });
    });

    currentMatchedSegments = [];
  }

  function highlightMatchedSegments(matches) {
    matches.forEach((segment) => {
      if (!segment.googleLine) return;
      segment.googleLine.setOptions({
        strokeColor: "#FF9900",
        strokeWeight: 12,
        strokeOpacity: 0.75,
        zIndex: 30
      });
    });

    currentMatchedSegments = matches;
  }

  function clearRouteVisualization() {
    clearRoutePolylines();
    resetMatchedSegmentStyles();
  }

  function drawAnalyzedRoutes(
    analyzedRoutes,
    selectedRouteIndex,
    onRouteSelected
  ) {
    const selected = analyzedRoutes[selectedRouteIndex];
    if (!selected) return;

    clearRouteVisualization();
    const bounds = new google.maps.LatLngBounds();

    analyzedRoutes.forEach((analyzed) => {
      const isSelected = analyzed.index === selectedRouteIndex;
      const path = analyzed.coordinates.map((coordinate) => ({
        lat: coordinate[1],
        lng: coordinate[0]
      }));

      path.forEach((point) => bounds.extend(point));

      const polyline = new google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: isSelected ? "#0057FF" : "#666666",
        strokeWeight: isSelected ? 7 : 5,
        strokeOpacity: isSelected ? 1 : 0.35,
        zIndex: isSelected ? 20 : 8,
        map
      });

      polyline.addListener("click", () => onRouteSelected(analyzed.index));
      currentRoutePolylines.push(polyline);

      if (isSelected) {
        currentRoutePolyline = polyline;
      }
    });

    highlightMatchedSegments(selected.matchedSegments);

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds);
    }
  }

  function resetViewport() {
    if (trafficCalmingBounds && !trafficCalmingBounds.isEmpty()) {
      map.fitBounds(trafficCalmingBounds);
    } else {
      map.setCenter(NASHVILLE_CENTER);
      map.setZoom(11);
    }
  }

  return {
    initialize,
    prepareEndpointMarkers,
    setTrafficCalmingSegments,
    clearTrafficCalmingSegments,
    clearEndpointMarker,
    updateEndpointMarker,
    refreshEndpointMarkers,
    fitEndpointMarkers,
    clearRouteVisualization,
    drawAnalyzedRoutes,
    resetViewport
  };
}
