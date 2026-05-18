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
import type * as contractNode from "../contractNode.js";
import type * as contracts from "../contracts.js";
import type * as http from "../http.js";
import type * as lib_analysisConfig from "../lib/analysisConfig.js";
import type * as lib_nodeConfig from "../lib/nodeConfig.js";
import type * as lib_pdf from "../lib/pdf.js";
import type * as lib_prompts from "../lib/prompts.js";
import type * as lib_provisions from "../lib/provisions.js";
import type * as lib_types from "../lib/types.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  contractNode: typeof contractNode;
  contracts: typeof contracts;
  http: typeof http;
  "lib/analysisConfig": typeof lib_analysisConfig;
  "lib/nodeConfig": typeof lib_nodeConfig;
  "lib/pdf": typeof lib_pdf;
  "lib/prompts": typeof lib_prompts;
  "lib/provisions": typeof lib_provisions;
  "lib/types": typeof lib_types;
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

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
