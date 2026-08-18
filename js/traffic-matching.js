import {
  MATCH_DISTANCE_THRESHOLD_METERS,
  MAX_DIRECTION_DIFFERENCE_DEGREES,
  MIN_CONTIGUOUS_MATCH_METERS,
  ROUTE_SAMPLE_SPACING_METERS
} from "./config.js";

function getTurf() {
  if (!globalThis.turf) {
    throw new Error("Turf geometry tools have not loaded.");
  }

  return globalThis.turf;
}

export function isValidCoordinate(coordinate) {
  return (
    Array.isArray(coordinate) &&
    coordinate.length >= 2 &&
    Number.isFinite(coordinate[0]) &&
    Number.isFinite(coordinate[1]) &&
    coordinate[0] >= -180 &&
    coordinate[0] <= 180 &&
    coordinate[1] >= -90 &&
    coordinate[1] <= 90
  );
}

export function isValidLineStringCoordinates(coordinates) {
  return (
    Array.isArray(coordinates) &&
    coordinates.length >= 2 &&
    coordinates.every(isValidCoordinate)
  );
}

function createTrafficCalmingSegment(coordinates, props) {
  const turf = getTurf();
  const turfLine = turf.lineString(coordinates, props);

  return {
    props,
    coordinates,
    turfLine,
    bbox: turf.bbox(turfLine),
    lengthMeters:
      turf.length(turfLine, { units: "kilometers" }) * 1000,
    googleLine: null
  };
}

export function parseTrafficCalmingGeoJson(geojson) {
  if (
    !geojson ||
    geojson.type !== "FeatureCollection" ||
    !Array.isArray(geojson.features)
  ) {
    const error = new Error("GeoJSON is not a valid FeatureCollection.");
    error.userMessage =
      "Traffic-calming data is invalid: expected a GeoJSON FeatureCollection with a features array.";
    throw error;
  }

  const segments = [];
  let skippedSegmentCount = 0;

  geojson.features.forEach((feature) => {
    const geometry = feature && feature.geometry;
    const props = (feature && feature.properties) || {};

    if (!geometry) {
      skippedSegmentCount++;
      return;
    }

    if (geometry.type === "LineString") {
      if (isValidLineStringCoordinates(geometry.coordinates)) {
        segments.push(
          createTrafficCalmingSegment(geometry.coordinates, props)
        );
      } else {
        skippedSegmentCount++;
      }

      return;
    }

    if (geometry.type === "MultiLineString") {
      if (!Array.isArray(geometry.coordinates)) {
        skippedSegmentCount++;
        return;
      }

      geometry.coordinates.forEach((lineCoordinates) => {
        if (isValidLineStringCoordinates(lineCoordinates)) {
          segments.push(createTrafficCalmingSegment(lineCoordinates, props));
        } else {
          skippedSegmentCount++;
        }
      });

      return;
    }

    skippedSegmentCount++;
  });

  if (segments.length === 0) {
    const error = new Error("GeoJSON contains no usable line geometry.");
    error.userMessage =
      "Traffic-calming data loaded, but it contains no valid road segments.";
    throw error;
  }

  return { segments, skippedSegmentCount };
}

export function expandBboxByMeters(bbox, meters) {
  const centerLatitude = (bbox[1] + bbox[3]) / 2;
  const latitudePadding = meters / 111320;
  const longitudeScale = Math.max(
    Math.cos((centerLatitude * Math.PI) / 180),
    0.01
  );
  const longitudePadding = meters / (111320 * longitudeScale);

  return [
    bbox[0] - longitudePadding,
    bbox[1] - latitudePadding,
    bbox[2] + longitudePadding,
    bbox[3] + latitudePadding
  ];
}

export function bboxesIntersect(first, second) {
  return !(
    first[2] < second[0] ||
    first[0] > second[2] ||
    first[3] < second[1] ||
    first[1] > second[3]
  );
}

function coordinateIsInsideBbox(coordinate, bbox) {
  return (
    coordinate[0] >= bbox[0] &&
    coordinate[0] <= bbox[2] &&
    coordinate[1] >= bbox[1] &&
    coordinate[1] <= bbox[3]
  );
}

export function buildRouteSamples(
  routeLine,
  sampleSpacingMeters = ROUTE_SAMPLE_SPACING_METERS
) {
  const turf = getTurf();
  const routeLengthMeters =
    turf.length(routeLine, { units: "kilometers" }) * 1000;
  const sampleDistances = [];

  for (
    let distanceMeters = 0;
    distanceMeters < routeLengthMeters;
    distanceMeters += sampleSpacingMeters
  ) {
    sampleDistances.push(distanceMeters);
  }

  sampleDistances.push(routeLengthMeters);

  const points = sampleDistances.map((distanceMeters) =>
    turf.along(routeLine, distanceMeters / 1000, {
      units: "kilometers"
    })
  );

  const samples = points.map((point, index) => {
    const previousIndex = index === 0 ? 0 : index - 1;
    const nextIndex = index === points.length - 1 ? index : index + 1;
    const previousCoordinate = points[previousIndex].geometry.coordinates;
    const nextCoordinate = points[nextIndex].geometry.coordinates;
    const bearing =
      previousIndex === nextIndex
        ? 0
        : turf.bearing(previousCoordinate, nextCoordinate);

    return {
      point,
      coordinate: point.geometry.coordinates,
      bearing,
      distanceMeters: sampleDistances[index]
    };
  });

  return {
    routeLine,
    routeLengthMeters,
    sampleSpacingMeters,
    samples,
    bbox: turf.bbox(routeLine)
  };
}

function getLineBearingAtIndex(coordinates, index) {
  const turf = getTurf();
  const startIndex = Math.min(
    Math.max(Number.isInteger(index) ? index : 0, 0),
    coordinates.length - 2
  );

  return turf.bearing(
    coordinates[startIndex],
    coordinates[startIndex + 1]
  );
}

function getParallelBearingDifference(firstBearing, secondBearing) {
  let difference = Math.abs(firstBearing - secondBearing) % 360;

  if (difference > 180) {
    difference = 360 - difference;
  }

  return Math.min(difference, 180 - difference);
}

function estimateContiguousAlignedOverlap(
  routeSamples,
  segment,
  thresholdMeters
) {
  const turf = getTurf();
  const segmentMatchBbox = expandBboxByMeters(segment.bbox, thresholdMeters);
  let currentRunSampleCount = 0;
  let longestRunSampleCount = 0;

  routeSamples.samples.forEach((sample) => {
    if (!coordinateIsInsideBbox(sample.coordinate, segmentMatchBbox)) {
      currentRunSampleCount = 0;
      return;
    }

    const snappedPoint = turf.nearestPointOnLine(
      segment.turfLine,
      sample.point,
      { units: "meters" }
    );
    const distanceToSegment = Number(snappedPoint.properties.dist);
    const segmentBearing = getLineBearingAtIndex(
      segment.coordinates,
      snappedPoint.properties.index
    );
    const directionDifference = getParallelBearingDifference(
      sample.bearing,
      segmentBearing
    );
    const isAlignedMatch =
      Number.isFinite(distanceToSegment) &&
      distanceToSegment <= thresholdMeters &&
      Number.isFinite(directionDifference) &&
      directionDifference <= MAX_DIRECTION_DIFFERENCE_DEGREES;

    if (isAlignedMatch) {
      currentRunSampleCount++;
      longestRunSampleCount = Math.max(
        longestRunSampleCount,
        currentRunSampleCount
      );
    } else {
      currentRunSampleCount = 0;
    }
  });

  return Math.min(
    longestRunSampleCount * routeSamples.sampleSpacingMeters,
    segment.lengthMeters,
    routeSamples.routeLengthMeters
  );
}

export function findTrafficCalmingMatches(
  routeCoordinates,
  trafficCalmingSegments,
  thresholdMeters = MATCH_DISTANCE_THRESHOLD_METERS
) {
  const turf = getTurf();
  const routeLine = turf.lineString(routeCoordinates);
  const routeSamples = buildRouteSamples(routeLine);
  const routeMatchBbox = expandBboxByMeters(routeSamples.bbox, thresholdMeters);
  const candidateSegments = trafficCalmingSegments.filter((segment) =>
    bboxesIntersect(routeMatchBbox, segment.bbox)
  );
  const matches = [];

  candidateSegments.forEach((segment) => {
    const overlapDistanceMeters = estimateContiguousAlignedOverlap(
      routeSamples,
      segment,
      thresholdMeters
    );

    if (overlapDistanceMeters >= MIN_CONTIGUOUS_MATCH_METERS) {
      matches.push({
        ...segment,
        overlapDistanceMeters
      });
    }
  });

  return {
    matches,
    candidateSegmentCount: candidateSegments.length,
    sampleCount: routeSamples.samples.length
  };
}

export function getUniqueMatchedProjects(matches) {
  const projectIndexes = new Map();
  const uniqueProjects = [];

  matches.forEach((segment) => {
    const id =
      segment.props.OBJECTID ||
      `${segment.props.OnStreet}-${segment.props.BeginStreet}-${segment.props.EndStreet}`;

    if (projectIndexes.has(id)) {
      const existingProject = uniqueProjects[projectIndexes.get(id)];
      existingProject.overlapDistanceMeters +=
        segment.overlapDistanceMeters || 0;
    } else {
      projectIndexes.set(id, uniqueProjects.length);
      uniqueProjects.push({
        ...segment,
        overlapDistanceMeters: segment.overlapDistanceMeters || 0
      });
    }
  });

  return uniqueProjects;
}
