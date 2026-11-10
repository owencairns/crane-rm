/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as admin from "../admin.js";
import type * as auditGuardNode from "../auditGuardNode.js";
import type * as auditGuardReviews from "../auditGuardReviews.js";
import type * as auth from "../auth.js";
import type * as coiReviewNode from "../coiReviewNode.js";
import type * as coiReviews from "../coiReviews.js";
import type * as contractNode from "../contractNode.js";
import type * as contracts from "../contracts.js";
import type * as email from "../email.js";
import type * as emailTemplate from "../emailTemplate.js";
import type * as http from "../http.js";
import type * as invitations from "../invitations.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_analysisConfig from "../lib/analysisConfig.js";
import type * as lib_auditGuardCompute from "../lib/auditGuardCompute.js";
import type * as lib_auditGuardCorrections from "../lib/auditGuardCorrections.js";
import type * as lib_auditGuardPrompts from "../lib/auditGuardPrompts.js";
import type * as lib_auditGuardSchemas from "../lib/auditGuardSchemas.js";
import type * as lib_coiPrompts from "../lib/coiPrompts.js";
import type * as lib_inviteEmail from "../lib/inviteEmail.js";
import type * as lib_nodeConfig from "../lib/nodeConfig.js";
import type * as lib_pdf from "../lib/pdf.js";
import type * as lib_prompts from "../lib/prompts.js";
import type * as lib_provisions from "../lib/provisions.js";
import type * as lib_schemas_acord25 from "../lib/schemas/acord25.js";
import type * as lib_types from "../lib/types.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  admin: typeof admin;
  auditGuardNode: typeof auditGuardNode;
  auditGuardReviews: typeof auditGuardReviews;
  auth: typeof auth;
  coiReviewNode: typeof coiReviewNode;
  coiReviews: typeof coiReviews;
  contractNode: typeof contractNode;
  contracts: typeof contracts;
  email: typeof email;
  emailTemplate: typeof emailTemplate;
  http: typeof http;
  invitations: typeof invitations;
  "lib/access": typeof lib_access;
  "lib/analysisConfig": typeof lib_analysisConfig;
  "lib/auditGuardCompute": typeof lib_auditGuardCompute;
  "lib/auditGuardCorrections": typeof lib_auditGuardCorrections;
  "lib/auditGuardPrompts": typeof lib_auditGuardPrompts;
  "lib/auditGuardSchemas": typeof lib_auditGuardSchemas;
  "lib/coiPrompts": typeof lib_coiPrompts;
  "lib/inviteEmail": typeof lib_inviteEmail;
  "lib/nodeConfig": typeof lib_nodeConfig;
  "lib/pdf": typeof lib_pdf;
  "lib/prompts": typeof lib_prompts;
  "lib/provisions": typeof lib_provisions;
  "lib/schemas/acord25": typeof lib_schemas_acord25;
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
