# Nashville Traffic-Calmed Routes

An interactive map for comparing Nashville driving routes by their exposure to completed traffic-calming projects.

The app is a static website built with HTML, CSS, JavaScript, Google Maps Platform, Turf.js, and a local GeoJSON dataset. It does not require a build step.

## Live website

Use the app at [sackscooper.github.io/traffic-calmed-routes](https://sackscooper.github.io/traffic-calmed-routes/).

## Run locally

Serve the project directory with any local web server, then open `index.html`. For example:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000/`.

The browser-based regression checks are kept in a local-only file so they are
not included in the public GitHub Pages deployment.

## Publishing

The static frontend is compatible with GitHub Pages. 

The app requests alternative routes through the Maps JavaScript API Route class so its browser credential can be protected with website and API restrictions.

## Data

The traffic-calming data is stored in `traffic_calming_segments-beta.geojson`. It is a snapshot of Metro Nashville's [Traffic Calming Projects feature layer](https://maps.nashville.gov/arcgis2/rest/services/NDOT/TrafficCalmingProjects/FeatureServer/0), filtered to projects whose status is `Completed with vertical measures`.

The source was verified on August 18, 2026. The snapshot contains 307 projects, and the latest completion date present is April 30, 2026. Metro Nashville's [Open Data Policy](https://www.nashville.gov/departments/metro-clerk/legal-resources/executive-orders/mayor-freddie-oconnell/fo018) governs secondary use; confirm that the final distribution complies with all applicable terms.

This independent project is provided for informational purposes only. It is not affiliated with or endorsed by the Metropolitan Government of Nashville and Davidson County, and its data may contain errors or may not reflect recent street changes.
