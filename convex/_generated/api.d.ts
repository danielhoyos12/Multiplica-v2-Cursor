/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as audit from "../audit.js";
import type * as authz from "../authz.js";
import type * as cells from "../cells.js";
import type * as formation from "../formation.js";
import type * as foundation from "../foundation.js";
import type * as health from "../health.js";
import type * as leadership from "../leadership.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_identity from "../lib/identity.js";
import type * as lib_ids from "../lib/ids.js";
import type * as lib_time from "../lib/time.js";
import type * as organization from "../organization.js";
import type * as persons from "../persons.js";
import type * as reporting from "../reporting.js";
import type * as seed from "../seed.js";
import type * as send from "../send.js";
import type * as transfers from "../transfers.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  audit: typeof audit;
  authz: typeof authz;
  cells: typeof cells;
  formation: typeof formation;
  foundation: typeof foundation;
  health: typeof health;
  leadership: typeof leadership;
  "lib/errors": typeof lib_errors;
  "lib/identity": typeof lib_identity;
  "lib/ids": typeof lib_ids;
  "lib/time": typeof lib_time;
  organization: typeof organization;
  persons: typeof persons;
  reporting: typeof reporting;
  seed: typeof seed;
  send: typeof send;
  transfers: typeof transfers;
  users: typeof users;
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
