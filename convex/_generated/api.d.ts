/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as devTelemetry from "../devTelemetry.js";
import type * as devices from "../devices.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as lib_conversations from "../lib/conversations.js";
import type * as lib_identity from "../lib/identity.js";
import type * as lib_manifest from "../lib/manifest.js";
import type * as lib_mediaVariantRules from "../lib/mediaVariantRules.js";
import type * as lib_mediaVariants from "../lib/mediaVariants.js";
import type * as lib_relay from "../lib/relay.js";
import type * as lib_relayStore from "../lib/relayStore.js";
import type * as preferences from "../preferences.js";
import type * as profiles from "../profiles.js";
import type * as push from "../push.js";
import type * as relay from "../relay.js";
import type * as releases from "../releases.js";
import type * as security from "../security.js";
import type * as stories from "../stories.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  conversations: typeof conversations;
  crons: typeof crons;
  devTelemetry: typeof devTelemetry;
  devices: typeof devices;
  files: typeof files;
  http: typeof http;
  "lib/conversations": typeof lib_conversations;
  "lib/identity": typeof lib_identity;
  "lib/manifest": typeof lib_manifest;
  "lib/mediaVariantRules": typeof lib_mediaVariantRules;
  "lib/mediaVariants": typeof lib_mediaVariants;
  "lib/relay": typeof lib_relay;
  "lib/relayStore": typeof lib_relayStore;
  preferences: typeof preferences;
  profiles: typeof profiles;
  push: typeof push;
  relay: typeof relay;
  releases: typeof releases;
  security: typeof security;
  stories: typeof stories;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
