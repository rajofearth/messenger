import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { manifestFor, parseVersionCode, releaseProblem } from "./lib/manifest";

/**
 * The release feed: one endpoint, one GET.
 *
 *   GET /updates/manifest?versionCode=4
 *   200 {"upToDate":true}                 the build has nothing newer
 *   200 {"versionCode":...}               a release the build does not have
 *   400 {"error":"..."}                   versionCode is not a version code
 *   500 {"error":"..."}                   the stored release is invalid
 *
 * The URL is public and the app bakes it in at build time through
 * `EXPO_PUBLIC_UPDATE_FEED_URL`; the APK itself stays on GitHub Releases.
 */
const http = httpRouter();

auth.addHttpRoutes(http);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

http.route({
  path: "/updates/manifest",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const requested = parseVersionCode(
      new URL(request.url).searchParams.get("versionCode"),
    );
    if (requested === null) {
      return json({ error: "versionCode must be a non-negative integer" }, 400);
    }

    const release = await ctx.runQuery(internal.releases.latest, {});
    if (!release) return json({ upToDate: true });

    const problem = releaseProblem(release);
    if (problem) {
      // Fail closed: an invalid row is a deployment bug, not an update.
      console.error(`Release ${release._id} cannot be served: ${problem}`);
      return json({ error: "the release feed is invalid" }, 500);
    }
    return json(manifestFor(release, requested));
  }),
});

export default http;
