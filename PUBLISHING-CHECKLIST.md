# Publishing checklist

This is the working launch list for the Nashville Traffic-Calmed Routes app. Check items off only after they have been verified on the real public domain.

## Before a public preview

### Google Maps setup and cost controls

- [x] Create a production JavaScript map ID in Google Maps Platform and replace `DEMO_MAP_ID` in `js/config.js`.
- [ ] Create production API credentials. Prefer separate development and production keys so local testing cannot affect the public app.
- [ ] Restrict the production browser key to the exact HTTPS website origins that will host the app. Keep localhost only on the development key.
- [ ] Restrict each key to only the APIs it uses: Maps JavaScript API, Places API (New), and Routes API. Remove Geocoding API after the unused geocoding helper is deleted.
- [ ] Rotate the current key before launch. It has already been stored directly in the project files; a browser key will remain visible by design, so application and API restrictions are the real protection.
- [ ] Verify that the Maps JavaScript API Route class works with the production website-restricted key on the final Pages origin. Set conservative Routes quotas and usage monitoring before sharing the site.
- [ ] Set project quotas, billing-budget alerts, and unexpected-usage alerts before sharing the public URL.
- [ ] Test Maps, Places, Advanced Markers, and Routes again using the production map ID, credentials, and domain restrictions.

### Hosting and releases

- [ ] Put the project under version control and keep a recoverable copy of every deployed release.
- [ ] Choose a static host and public domain, then require HTTPS and redirect all HTTP traffic to HTTPS.
- [ ] Create a repeatable deployment process with a preview environment and a simple rollback procedure.
- [ ] Configure compression and sensible cache headers for JavaScript, CSS, and the GeoJSON file. Use versioned asset names or hashes so updates are not hidden by old browser caches.
- [ ] Add a Content Security Policy and other standard security headers that allow only the Google Maps and selected asset hosts the app actually needs.
- [ ] Pin Turf to an exact tested version or bundle it locally. Change Google Maps from the weekly channel to a more conservative release channel after final compatibility testing.
- [ ] Decide whether `matching-tests.html` should be excluded from the public deployment or retained as a documented diagnostics page.

### Traffic-calming data

- [x] Document the GeoJSON source, Nashville coverage, status filter, source-verification date, and latest completion date present.
- [ ] Confirm that public redistribution of the dataset is permitted under the applicable Metro Nashville terms.
- [x] Display the source URL, verification date, status filter context, and a no-endorsement/informational-use disclaimer.
- [ ] Define a repeatable refresh process so completed, removed, or corrected projects are reflected in the app.
- [ ] Run schema, coordinate, duplicate, and geometry validation before every data release.
- [x] Show users the snapshot verification date and latest completion date present, and explain that the map may not reflect current street conditions.
- [ ] Recheck the matching thresholds against a wider sample of real Nashville routes before treating recommendations as production-ready.

## Before full launch

### Reliability and testing

- [ ] Add an automated production build check for JavaScript syntax, GeoJSON validity, and the matching regression tests.
- [ ] Add end-to-end tests for address selection, swapping, clearing, changing the avoidance setting, requesting alternatives, and selecting a route.
- [ ] Test slow connections, blocked APIs, no-route responses, quota errors, malformed data, and repeated rapid requests.
- [ ] Test current Chrome, Safari, Firefox, and Edge, plus common iPhone and Android screen sizes.
- [ ] Complete keyboard-only and screen-reader testing and run an accessibility audit.
- [ ] Add privacy-conscious error monitoring so API and data failures can be detected without recording users' searched locations.
- [ ] Monitor load time and route-analysis time on lower-powered phones. Optimize or pre-index the GeoJSON if real-device results are slow.

### Privacy, legal, and user expectations

- [ ] Publish a short privacy notice explaining that selected locations are sent to Google to provide autocomplete and routes, what the app itself stores, and how long any operational logs are retained.
- [ ] Review Google Maps Platform terms, attribution requirements, and branding rules for the final presentation.
- [ ] Add a plain-language explanation of how the recommendation and traffic-calming penalty work. Make clear that it is a planning aid, not safety-critical navigation guidance.
- [ ] Add a contact or feedback method for incorrect data, routing problems, and accessibility issues.
- [ ] If analytics are added, minimize collected data and add any consent or disclosure required for the chosen service and audience.

### Production cleanup and polish

- [x] Remove the unused hardcoded test-route function and unused Geocoding API helper.
- [x] Remove debug logs that print selected places or complete route responses. Keep only deliberate, privacy-safe diagnostics.
- [x] Remove the duplicate Routes REST endpoint and key configuration by using the Maps JavaScript API Route class.
- [ ] Add a favicon, Apple touch icon, page description, social-sharing image, and finalized public app name.
- [ ] Add an About/help section covering the legend, avoidance control, data date, known limitations, and basic troubleshooting.
- [ ] Confirm that the layout remains usable with long addresses, larger text settings, zoom up to 200%, and a large number of route-result cards.

## Optional after launch

- [ ] Add installable Progressive Web App features if users want a home-screen shortcut.
- [ ] Add a non-location-specific service-status page.
- [ ] Consider a feedback workflow for proposed dataset corrections, with review before any map data changes.
- [ ] Consider automated scheduled data refreshes once the source and validation process are stable.

## Current known launch blockers

1. The development API key is embedded in `index.html`; it must be rotated and its production website and API restrictions verified before publishing.
2. Routes quotas, billing-budget alerts, and unexpected-usage alerts have not been verified for the public site.
3. There is no production host, HTTPS domain, or deployment/rollback workflow yet.
4. Explicit redistribution permission and refresh ownership still need confirmation before treating the dataset as production-ready.
5. Privacy, user-guidance, monitoring, and production browser/device testing remain to be completed.
