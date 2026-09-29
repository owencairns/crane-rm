import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const analysisSummaryCounts = v.object({
  criticalMatched: v.number(),
  highMatched: v.number(),
  mediumMatched: v.number(),
  lowMatched: v.number(),
});

const analysisError = v.object({
  message: v.string(),
  code: v.optional(v.string()),
  batchesFailed: v.optional(v.number()),
  batchesSucceeded: v.optional(v.number()),
  failedProvisionIds: v.optional(v.array(v.string())),
});

const evidenceCitation = v.object({
  documentName: v.optional(v.string()),
  page: v.optional(v.number()),
  excerpt: v.string(),
});

export default defineSchema({
  contracts: defineTable({
    ownerId: v.string(),
    filename: v.string(),
    status: v.string(),
    storageId: v.optional(v.id("_storage")),
    pageCount: v.optional(v.number()),
    chunkCount: v.optional(v.number()),
    provisionCatalogVersion: v.optional(v.string()),
    projectName: v.optional(v.string()),
    gcName: v.optional(v.string()),
    state: v.optional(v.string()),
    riskScore: v.optional(v.number()),
    shareToken: v.optional(v.string()),
    lastAnalysisId: v.optional(v.id("analyses")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  chunks: defineTable({
    ownerId: v.string(),
    contractId: v.id("contracts"),
    chunkId: v.string(),
    chunkIndex: v.number(),
    pageStart: v.number(),
    pageEnd: v.number(),
    sectionPath: v.optional(v.string()),
    text: v.string(),
    textHash: v.string(),
  })
    .index("by_contract", ["contractId"])
    .index("by_chunk_id", ["chunkId"]),

  contract_images: defineTable({
    contractId: v.id("contracts"),
    imageIndex: v.number(),
    storageId: v.id("_storage"),
    pageNumber: v.number(),
    altText: v.string(),
  })
    .index("by_contract", ["contractId"])
    .index("by_contract_image", ["contractId", "imageIndex"]),

  analyses: defineTable({
    ownerId: v.string(),
    contractId: v.id("contracts"),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    model: v.string(),
    status: v.string(),
    summary: v.optional(v.string()),
    summaryCounts: v.optional(analysisSummaryCounts),
    error: v.optional(analysisError),
  })
    .index("by_contract", ["contractId"])
    .index("by_owner", ["ownerId"]),

  findings: defineTable({
    ownerId: v.string(),
    contractId: v.id("contracts"),
    analysisId: v.id("analyses"),
    provisionId: v.string(),
    priority: v.string(),
    matched: v.boolean(),
    confidence: v.number(),
    evidenceChunkIds: v.array(v.string()),
    evidencePages: v.array(v.number()),
    evidenceExcerpts: v.array(v.string()),
    reasoningSummary: v.string(),
    recommendedAction: v.optional(v.string()),
    screeningResult: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_analysis", ["analysisId"])
    .index("by_contract", ["contractId"])
    .index("by_analysis_provision", ["analysisId", "provisionId"]),

  /* ---------------------------------------------------------------- */
  /*  SubProtect — COI verification                                   */
  /*                                                                  */
  /*  A coiReview cross-examines a Certificate of Insurance against   */
  /*  the insurance requirements it must satisfy. Both PDFs are OCR'd */
  /*  and extracted into the same canonical ACORD-25 shape: the       */
  /*  requirements doc yields the REQUIRED coverage, the COI yields    */
  /*  the ACTUAL coverage. A review step diffs the two and writes one  */
  /*  coiFinding per checked item.                                     */
  /* ---------------------------------------------------------------- */

  coiReviews: defineTable({
    ownerId: v.string(),
    // Requirements document (contract / exhibit describing what's required)
    requirementsFilename: v.string(),
    requirementsStorageId: v.optional(v.id("_storage")),
    // The Certificate of Insurance package being verified. Legacy single-file
    // fields remain for existing reviews; new reviews use the array fields.
    coiFilename: v.string(),
    coiStorageId: v.optional(v.id("_storage")),
    coiFilenames: v.optional(v.array(v.string())),
    coiStorageIds: v.optional(v.array(v.id("_storage"))),
    // draft | uploaded | parsing | extracting | reviewing | complete | failed
    status: v.string(),
    // Canonical extracted blobs (JSON-stringified acord25 shape).
    // requiredCoverage = what the requirements demand; actualCoverage = the COI.
    requiredCoverage: v.optional(v.string()),
    actualCoverage: v.optional(v.string()),
    // Headline name pulled from the COI's named insured (for list views).
    insuredName: v.optional(v.string()),
    summaryCounts: v.optional(
      v.object({
        met: v.number(),
        partial: v.number(),
        missing: v.number(),
        needsVerification: v.number(),
        notApplicable: v.optional(v.number()),
      })
    ),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  /* ---------------------------------------------------------------- */
  /*  Access control — invitation-only onboarding                     */
  /*                                                                  */
  /*  The suite is invitation-only. An admin issues an `invitation`   */
  /*  (emailed via Brevo) carrying a configurable access window       */
  /*  (default 90 days). When the invitee accepts and creates their   */
  /*  account, a `userAccess` grant is written starting from that     */
  /*  moment. Tool access is gated on an active grant; on expiry the  */
  /*  grant remains (data is kept) but tools are blocked until an     */
  /*  admin extends or renews it. Admins (ADMIN_EMAILS) always pass.  */
  /* ---------------------------------------------------------------- */

  invitations: defineTable({
    // Invitee email, always stored lowercased/trimmed.
    email: v.string(),
    // Opaque URL-safe token embedded in the accept link.
    token: v.string(),
    // pending | accepted | revoked
    status: v.string(),
    // Days of access granted, counted from acceptance. Default 90.
    accessWindowDays: v.number(),
    // Optional admin customization of the invitation email.
    emailSubject: v.optional(v.string()),
    emailBody: v.optional(v.string()),
    invitedByUserId: v.string(),
    invitedByEmail: v.string(),
    // When the accept link itself stops working (distinct from the
    // post-acceptance access window).
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
    acceptedByUserId: v.optional(v.string()),
    // Email-delivery bookkeeping.
    lastSentAt: v.optional(v.number()),
    lastSendError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_email", ["email"])
    .index("by_status", ["status"]),

  userAccess: defineTable({
    // Better Auth user id (identity.subject) — same id used as ownerId
    // on contracts/coiReviews, so access maps directly to a user's data.
    userId: v.string(),
    email: v.string(),
    invitationId: v.optional(v.id("invitations")),
    // active | revoked. Expiry is derived from accessExpiresAt vs now.
    status: v.string(),
    accessStartsAt: v.number(),
    // Absent = unlimited access (never expires).
    accessExpiresAt: v.optional(v.number()),
    grantedByUserId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_email", ["email"]),

  /* ---------------------------------------------------------------- */
  /*  Invitation email template — a single saved row (the "default")  */
  /*  edited in the admin area. Only one is ever kept; saving updates  */
  /*  the existing row. Per-invitation overrides still take priority.  */
  /* ---------------------------------------------------------------- */
  inviteEmailTemplate: defineTable({
    subject: v.string(),
    body: v.string(),
    updatedAt: v.number(),
    updatedByEmail: v.optional(v.string()),
  }),

  /* ---------------------------------------------------------------- */
  /*  AuditGuard — premium-audit estimation                           */
  /*                                                                  */
  /*  An auditGuardReview reads a client's in-force policy package,    */
  /*  works out how each line of business is rated (revenue/payroll/   */
  /*  etc.), then — once the client supplies projected financials —    */
  /*  projects the additional premium expected at year-end audit.      */
  /*  Stage 1 OCRs + extracts the policies and pauses at               */
  /*  "awaiting_inputs"; stage 2 consumes the financials and writes    */
  /*  one auditGuardLine per rated line of business.                   */
  /* ---------------------------------------------------------------- */

  auditGuardReviews: defineTable({
    ownerId: v.string(),
    // Client / named insured (headline for list views).
    clientName: v.optional(v.string()),
    // The uploaded policy package (declarations, schedules, endorsements).
    policyFilenames: v.array(v.string()),
    policyStorageIds: v.optional(v.array(v.id("_storage"))),
    // draft | uploaded | parsing | extracting | awaiting_inputs |
    // estimating | complete | failed
    status: v.string(),
    // JSON-stringified PolicyExtraction (stage-1 output).
    policyData: v.optional(v.string()),
    // JSON-stringified FinancialInputRequest[] — the dynamic checklist of
    // figures the user must supply, derived from how the policies are rated.
    inputRequests: v.optional(v.string()),
    // JSON-stringified Record<string, number> the user entered (stage 2).
    financialInputs: v.optional(v.string()),
    estimateSummary: v.optional(
      v.object({
        lineCount: v.number(),
        estimatedLineCount: v.number(),
        totalCurrentPremium: v.union(v.number(), v.null()),
        totalProjectedPremium: v.union(v.number(), v.null()),
        totalAdditionalPremium: v.union(v.number(), v.null()),
        premiumFloor: v.optional(v.union(v.number(), v.null())),
        floorApplied: v.optional(v.boolean()),
        floorReasoning: v.optional(v.union(v.string(), v.null())),
      })
    ),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  auditGuardLines: defineTable({
    ownerId: v.string(),
    reviewId: v.id("auditGuardReviews"),
    // Stable slug, e.g. "generalLiability", "workersComp".
    lineId: v.string(),
    lineOfBusiness: v.string(),
    policyNumber: v.optional(v.string()),
    carrier: v.optional(v.string()),
    auditable: v.boolean(),
    // revenue | payroll | subcontracted_cost | units | flat | unknown
    ratingBasis: v.string(),
    ratingBasisLabel: v.string(),
    unitSize: v.number(),
    classCode: v.optional(v.string()),
    classCodeDescription: v.optional(v.string()),
    state: v.optional(v.string()),
    ratePerUnit: v.optional(v.number()),
    rateComponents: v.optional(
      v.array(
        v.object({
          label: v.string(),
          ratePerUnit: v.number(),
        })
      )
    ),
    rateSource: v.string(), // stated | implied | unknown
    boundExposure: v.optional(v.number()),
    currentPremium: v.optional(v.number()),
    premiumModifiers: v.optional(
      v.array(
        v.object({
          key: v.string(),
          label: v.string(),
          factor: v.number(),
        })
      )
    ),
    confidence: v.string(), // high | medium | low
    assumptions: v.array(v.string()),
    notes: v.optional(v.string()),
    evidenceExcerpts: v.optional(v.array(v.string())),
    citations: v.optional(v.array(evidenceCitation)),
    // ---- stage-2 estimate fields (null until financials supplied) ----
    // estimated | needs_input | insufficient_data | not_auditable
    estimateStatus: v.optional(v.string()),
    inputKey: v.optional(v.string()),
    rawExposure: v.optional(v.number()),
    projectedExposure: v.optional(v.number()),
    annualized: v.optional(v.boolean()),
    additionalExposure: v.optional(v.number()),
    additionalPremium: v.optional(v.number()),
    projectedPremium: v.optional(v.number()),
    estimateReasoning: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_review", ["reviewId"])
    .index("by_review_line", ["reviewId", "lineId"]),

  coiFindings: defineTable({
    ownerId: v.string(),
    coiReviewId: v.id("coiReviews"),
    // Stable id of the checked requirement, e.g. "generalLiability.eachOccurrence"
    itemId: v.string(),
    category: v.string(), // "General Liability" | "Auto Liability" | ...
    label: v.string(), // human-friendly: "Each Occurrence Limit"
    priority: v.string(), // critical | high | medium | low
    // requirements_document | baseline_check | non_coi_requirement
    requirementSource: v.optional(v.string()),
    // met | partial | missing | needs_verification | not_applicable
    status: v.string(),
    requiredValue: v.optional(v.string()),
    foundValue: v.optional(v.string()),
    reasoning: v.string(),
    recommendedAction: v.optional(v.string()),
    requirementEvidenceExcerpts: v.optional(v.array(v.string())),
    requirementCitations: v.optional(v.array(evidenceCitation)),
    coiEvidenceExcerpts: v.optional(v.array(v.string())),
    coiCitations: v.optional(v.array(evidenceCitation)),
    // External source links (e.g. AM Best carrier rating pages) for findings
    // whose evidence lives outside the uploaded PDFs.
    sourceLinks: v.optional(
      v.array(v.object({ label: v.string(), url: v.string() }))
    ),
    // Legacy field from the first SubProtect pass. New rows use coiEvidenceExcerpts.
    evidenceExcerpts: v.optional(v.array(v.string())),
    createdAt: v.number(),
  })
    .index("by_review", ["coiReviewId"])
    .index("by_review_item", ["coiReviewId", "itemId"]),

  /* ---------------------------------------------------------------- */
  /*  Legacy access tables (pre-suite invite system)                  */
  /*                                                                  */
  /*  The production deployment that predates this suite shipped a    */
  /*  token-based invite system (`invites`) and a role table          */
  /*  (`userRoles`). Those rows hold real onboarding history (e.g.    */
  /*  Chris's admin grant), so we keep the tables defined to preserve */
  /*  the data and let the schema validate on deploy. The live access */
  /*  model is now `invitations` + `userAccess` + ADMIN_EMAILS /      */
  /*  SUPER_ADMIN_EMAILS; nothing in the app reads these anymore.     */
  /* ---------------------------------------------------------------- */

  invites: defineTable({
    token: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
    note: v.optional(v.string()),
    consumedAt: v.optional(v.number()),
    consumedBy: v.optional(v.string()),
    revokedAt: v.optional(v.number()),
  }),

  userRoles: defineTable({
    userId: v.string(),
    role: v.string(),
    grantedBy: v.optional(v.string()),
    grantedAt: v.optional(v.number()),
  }),
});
