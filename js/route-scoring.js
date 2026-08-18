import {
  TRAFFIC_CALMING_DISTANCE_PENALTY_MINUTES_PER_KM,
  TRAFFIC_CALMING_PROJECT_PENALTY_MINUTES
} from "./config.js";
import {
  findTrafficCalmingMatches,
  getUniqueMatchedProjects
} from "./traffic-matching.js";

export function parseDurationSeconds(durationText) {
  if (!durationText) return 0;
  return Number(durationText.replace("s", ""));
}

export function clampPenaltyMultiplier(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) return null;
  return Math.min(Math.max(numericValue, 0), 3);
}

export function calculateTrafficCalmingExposure(uniqueMatchedProjects) {
  const matchedDistanceMeters = uniqueMatchedProjects.reduce(
    (total, project) => total + (project.overlapDistanceMeters || 0),
    0
  );
  const projectPenaltyMinutes =
    uniqueMatchedProjects.length *
    TRAFFIC_CALMING_PROJECT_PENALTY_MINUTES;
  const distancePenaltyMinutes =
    (matchedDistanceMeters / 1000) *
    TRAFFIC_CALMING_DISTANCE_PENALTY_MINUTES_PER_KM;

  return {
    matchedDistanceMeters,
    projectPenaltyMinutes,
    distancePenaltyMinutes,
    totalPenaltyMinutes: projectPenaltyMinutes + distancePenaltyMinutes
  };
}

export function analyzeRoutes(
  routes,
  trafficCalmingSegments,
  penaltyMultiplier
) {
  return routes.map((route, index) => {
    const coordinates = route.polyline.geoJsonLinestring.coordinates;
    const matchAnalysis = findTrafficCalmingMatches(
      coordinates,
      trafficCalmingSegments
    );
    const matchedSegments = matchAnalysis.matches;
    const uniqueMatchedProjects = getUniqueMatchedProjects(matchedSegments);
    const exposure = calculateTrafficCalmingExposure(
      uniqueMatchedProjects
    );
    const distanceMiles = route.distanceMeters / 1609.344;
    const durationMinutes = parseDurationSeconds(route.duration) / 60;
    const baseExposurePenaltyMinutes = exposure.totalPenaltyMinutes;
    const exposurePenaltyMinutes =
      baseExposurePenaltyMinutes * penaltyMultiplier;

    return {
      index,
      route,
      coordinates,
      matchedSegments,
      uniqueMatchedProjects,
      trafficCalmingCount: uniqueMatchedProjects.length,
      matchedDistanceMeters: exposure.matchedDistanceMeters,
      baseExposurePenaltyMinutes,
      exposurePenaltyMinutes,
      matchCandidateCount: matchAnalysis.candidateSegmentCount,
      routeSampleCount: matchAnalysis.sampleCount,
      distanceMiles,
      durationMinutes,
      score: durationMinutes + exposurePenaltyMinutes
    };
  });
}

export function recalculateAnalyzedRouteScores(
  analyzedRoutes,
  penaltyMultiplier
) {
  return analyzedRoutes.map((analyzed) => {
    const exposurePenaltyMinutes =
      analyzed.baseExposurePenaltyMinutes * penaltyMultiplier;

    return {
      ...analyzed,
      exposurePenaltyMinutes,
      score: analyzed.durationMinutes + exposurePenaltyMinutes
    };
  });
}

export function getRecommendedRouteIndex(analyzedRoutes) {
  if (!Array.isArray(analyzedRoutes) || analyzedRoutes.length === 0) {
    return 0;
  }

  const recommended = analyzedRoutes.reduce((best, current) =>
    current.score < best.score ? current : best
  );

  return recommended.index;
}
