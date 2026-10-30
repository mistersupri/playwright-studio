import type { Artifact } from "./types";

/** Opens Playwright's trace viewer (served by the API) on a trace from this server. */
export function traceViewerUrl(a: Artifact) {
  return `/trace-viewer/index.html?trace=${encodeURIComponent(location.origin + a.url)}`;
}
