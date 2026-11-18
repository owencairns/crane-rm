/*
 * Extraction prompts for CertMaster. Two calls run in parallel over the same
 * OCR text: one for the coverage lines, one for parties, wording and
 * endorsements. Both share SHARED_RULES so the model treats every number as a
 * contract MINIMUM and never fills gaps from general knowledge.
 */

const SHARED_RULES = `You are a commercial insurance account manager at an agency. You are reading a construction contract, subcontract, or insurance exhibit to work out what a certificate of insurance (ACORD 25) must show for the contractor/vendor who carries the insurance.

RULES
- Extract ONLY what the document states. Never fill a value from general knowledge or "typical" contracts. A null or false is always better than a guess.
- Every dollar amount is the contract's REQUIRED MINIMUM. Use plain numbers (1000000, not "$1,000,000" or "1M").
- "$2,000,000 each occurrence / $4,000,000 aggregate" means eachOccurrence 2000000 and generalAggregate 4000000. Do not combine primary and umbrella limits unless the document says the total can be met that way; if it does, record the primary limits it states and explain the combination in notes.
- When the document gives different limits by contract value or risk tier with no condition about the work, use the tier that applies to THIS contract if you can tell; otherwise use the highest tier and explain in notes.
- Ignore disability insurance, unemployment insurance/compensation, state disability, paid family leave, payroll taxes, and government benefit programs. Workers compensation and employers liability are in scope.
- Some requestors send a SAMPLE or template ACORD 25 that shows what they want. Treat its checked boxes, Y marks, limits and remarks as the requirements.
- When the original PDF is attached, use it to read checkboxes, tables, handwriting and scanned pages; the OCR text can lose checkbox marks. Page numbers still follow the "=== PAGE n ===" markers.
- Evidence: for each value you extract, add { field, page, excerpt }. "page" is the 1-based number from the "=== PAGE n ===" marker the text sits under. "excerpt" is copied character for character from that page (keep typos and punctuation), 5 to 40 words. Never paraphrase an excerpt.`;

export function getCoverageExtractionPrompt(documentText: string): string {
  return `${SHARED_RULES}

TASK: extract the required coverage lines.

generalLiability (Commercial General Liability / CGL)
- required: true only if the document requires CGL.
- formType: "occurrence" or "claimsMade" if stated (e.g. "on an occurrence basis"), else null.
- addlInsured: true if any party must be additional insured on the GL policy.
- Base requirements only. Limits that apply only under a condition ("should Subcontractor's work include crane services", "where exposure exists", "if applicable to the services") go in conditionalRequirements, NOT here, even when the condition is met.
- subrogationWaived: true if a waiver of subrogation is required on GL (or on "all policies").
- genAggregateAppliesPer: "project" if the aggregate must apply per project (e.g. "per project aggregate", CG 25 03), "location" if per location, "policy" only if stated.
- limits: eachOccurrence, generalAggregate, productsCompletedOpsAggregate, personalAdvertisingInjury, damageToRentedPremises, medicalExpense.
- notes: endorsement or wording requirements specific to GL (completed operations duration, contractual liability, XCU, etc.).

autoLiability
- required, addlInsured, subrogationWaived as above.
- coverageSymbols: set only what the document specifies ("any auto", "owned, hired and non-owned" → ownedAutosOnly, hiredAutosOnly, nonOwnedAutosOnly). If auto liability is required with no symbol stated, set anyAuto true.
- limits: combinedSingleLimit, or split limits (bodilyInjuryPerPerson, bodilyInjuryPerAccident, propertyDamagePerAccident) when stated that way.

umbrellaExcess
- required, type ("umbrella" | "excess" | null), formType, addlInsured, subrogationWaived.
- limits: eachOccurrence, aggregate. If only one figure is given ("$5,000,000 umbrella"), put it in eachOccurrence and aggregate.
- notes: "follow form", "over GL, auto and EL", "may be met with any combination of primary and excess", etc.

workersComp
- required: true if workers compensation is required.
- wcStatutory: true when statutory limits are required (that is the normal wording).
- subrogationWaived: true if a waiver of subrogation applies to WC (or to "all policies").
- employersLiability: eachAccident, diseaseEachEmployee, diseasePolicyLimit. A single figure ("Employers Liability $1,000,000") applies to all three.

other: one entry per other coverage the document requires unconditionally (professional/E&O, pollution/contractors pollution, rigging/riggers liability, installation floater, builder's risk, cyber, aircraft, watercraft, railroad protective, crane/hook, inland marine, etc.).
- coverageName: the coverage as the document names it.
- limits: [{ label, amount }] such as [{ "label": "Each Claim", "amount": 1000000 }].
- Leave the array empty when no other coverage is required. Do not list the contractor's own property/tools insurance or loss-payee clauses unless a limit is stated.

conditionalRequirements: every requirement that only applies under a condition (crane services, aircraft, professional services, pollution/hazardous material, hauling hazardous waste, water work, etc.).
- trigger: the condition as written.
- requirement: what it demands, with limits.
- appliesToThisWork: "yes" if this document's scope of work clearly meets the condition (e.g. the scope says the subcontractor operates a crane), "no" if the scope clearly does not, "unclear" otherwise.
- reason: one sentence pointing to the scope text that decides it.
- page and excerpt (verbatim) for the condition.

DEFAULTS when a line is not mentioned: required false, booleans false, limits null, notes null, evidence [].

DOCUMENT
${documentText}`;
}

export function getPartiesExtractionPrompt(documentText: string): string {
  return `${SHARED_RULES}

TASK: extract the parties, project, certificate wording requirements and endorsements.

contractInfo: projectName, contractNumber, parties.contractor (the party that carries the insurance), parties.requestor (the party demanding the certificate), certDeadline (when certificates are due, as written), notes.

namedInsured: the entity whose policies the certificate evidences (the INSURED box). Usually the Contractor/Subcontractor/Vendor/Consultant that must carry insurance. Resolve defined terms ("Subcontractor") to the full legal name and mailing address from the preamble, party blocks, signature blocks, or notice section. Never use the owner, general contractor, certificate holder, or the insurance agent unless the document says that entity carries the insurance. If the document never names the party (only a role like "Subcontractor" or a placeholder like "(Your Company)"), name is null. Address strings may be "" when unknown; line2 may be null.

certificateHolder: the party the certificate is issued to or must be furnished to.
  a. An explicit certificate holder block or name wins.
  b. Otherwise the party certificates must be furnished/submitted/delivered/addressed to.
  c. Resolve roles ("Contractor", "Owner") to the full legal name and address from page 1, party definitions, signature blocks, or notice addresses.
  d. If several recipients are listed, use the main party requiring insurance; put the others in additionalInsuredParties or notes.
  Never use the named insured as the certificate holder.
  name is the legal entity only. "c/o ...", "Attn: ...", and department lines go in address.line1 / line2, followed by the street address (e.g. name "Cahill Contractors LLC", line1 "c/o Lockton Companies, Attn: Diane Gibbons", line2 "8110 E. Union Ave., Suite 100").

descriptionOfOperations
- text: one plain sentence describing the work/project for the Description of Operations box, built only from document facts (project name, job number, site address). Null if there is nothing to say.
- structured.projectName, structured.jobNumber, structured.locations (project/site addresses).
- structured.additionalInsured.isRequiredByContract: true if any additional insured status is required.
- structured.additionalInsured.scope: "both" when ongoing AND completed operations are required (CG 20 10 + CG 20 37, the CG 20 10 11 85 "Form B" endorsement, which covers both, or "ongoing and completed operations", or completed operations coverage that must name the additional insureds), "ongoingOperations", "completedOperations", or "unspecified".
- structured.waiverOfSubrogation, structured.primaryNoncontributory, structured.perProjectAggregate: true only when required.

cancellation: noticeDays only when the policies/insurer must give advance written notice before cancellation or reduction (e.g. 30 for "no cancellation without thirty (30) days prior written notice"). A duty on the subcontractor to tell the contractor after it receives a cancellation notice is NOT noticeDays; put that in notes.

specialRequirements: cross-cutting requirements that do not map to a field above but matter for issuing the certificate (carrier rating such as "A- VII or better", deductible caps, separation of insureds, cross-liability, "no exclusion for residential work", copies of endorsements to be attached, wrap-up/OCIP enrollment). Each { requirement, page, excerpt } with a verbatim excerpt.

endorsements
- additionalInsuredParties: every party/role, OTHER THAN the certificate holder, that must be additional insured, in the document's order. These are printed right after the holder's name ("<holder>, <party 1>, <party 2> are Additional Insured..."), so:
  - Never repeat the certificate holder, by name or by its defined term (if the holder is defined as "Contractor", do not write "Contractor").
  - The holder's own people become "its officers, directors, and employees" (use the document's wording).
  - Resolve defined roles to names when the document names them ("the Owners, Vlad Kroll & Martine Darwish" → "Vlad Kroll & Martine Darwish (Owners)" is fine; keep generic role lists like "Project Owners, Architects and Engineers" as written).
- primaryNoncontributoryLines: lines that must be primary and non-contributory ("generalLiability", "autoLiability", "umbrellaExcess", "workersComp").
- additionalInsuredForms: AI endorsement form numbers the document names, verbatim (e.g. "CG 20 10 04 13", "CG 20 37 04 13", "CA 20 48").
- otherRequiredForms: any other named endorsement forms (waiver, per project aggregate CG 25 03, notice of cancellation), verbatim.
- completedOperationsYears: years after completion completed-operations coverage must stay in force, when stated.

DOCUMENT
${documentText}`;
}
