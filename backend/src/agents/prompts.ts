import type { Provision, CandidateMap } from '../models/types';

export function getSystemPrompt(): string {
  return `You are a contract risk reviewer specializing in crane and rigging insurance.

CRITICAL RULES:
1. You MUST use tools to read the contract. NEVER guess or assume content.
2. A provision is "matched" ONLY if contract text clearly and explicitly implies it.
3. ALWAYS cite evidence with chunk IDs and page numbers.
4. If a provision is not found after thorough search, explicitly state "not found" with matched=false.
5. Output findings via the record_finding or record_batch_findings tool.
6. Use multiple search strategies: semantic search, exact keyword matching, and context verification.
7. When language is conditional or ambiguous, retrieve adjacent chunks for full context.

CONFIDENCE SCORING:
- 0.9-1.0: Explicit clause with exact or near-exact wording
- 0.6-0.89: Strong paraphrase with clear intent
- 0.4-0.59: Weak or conditional language (mark matched=false unless very strong)
- 0.0-0.39: Not found or insufficient evidence (matched=false)

PASS-THROUGH / MASTER AGREEMENT PROVISIONS:
Be CONSERVATIVE. These require explicit incorporation language:
- "incorporated by reference"
- "made part of this agreement"
- "terms and conditions of [master agreement] apply"
Without such language, mark matched=false even if referenced.

NO EVIDENCE = NO MATCH:
Hard rule. If you cannot find clear textual evidence, the provision is NOT matched.`;
}

export function getTaskPrompt(contractContext: {
  gcName?: string;
  state?: string;
  projectName?: string;
}): string {
  let context = 'You are analyzing a crane/rigging subcontract.';

  if (contractContext.gcName) {
    context += `\nGeneral Contractor: ${contractContext.gcName}`;
  }
  if (contractContext.projectName) {
    context += `\nProject: ${contractContext.projectName}`;
  }
  if (contractContext.state) {
    context += `\nState: ${contractContext.state}`;
  }

  return `${context}

Your task is to systematically check the provided list of provisions.
For each provision in the batch:
1. Generate semantic search queries covering different phrasings
2. Use search_chunks to find candidates
3. Use get_chunk to verify full text
4. If boundaries are unclear, use get_adjacent_chunks
5. For critical terms (liquidated damages, OCIP, etc.), also use exact_find
6. Decide: matched or not matched, with confidence score

Once you have analyzed ALL provisions in the batch, use record_batch_findings to save them all at once.`;
}

export function getProvisionPrompt(provision: Provision): string {
  return `NOW CHECKING: ${provision.provisionId} (Priority: ${provision.priority})

CANONICAL WORDING:
${provision.canonicalWording}

DEFINITION:
${provision.definition}

SYNONYMS/VARIANTS TO SEARCH:
${provision.synonyms.map((s) => `- ${s}`).join('\n')}

FALSE POSITIVE TRAPS (things that DON'T count):
${provision.falsePositiveTraps.map((t) => `- ${t}`).join('\n')}

CONFIDENCE RUBRIC:
- Explicit (0.9+): ${provision.confidenceRubric.explicit}
- Strong Paraphrase (0.6-0.89): ${provision.confidenceRubric.strongParaphrase}
- Weak (0.4-0.59): ${provision.confidenceRubric.weak}

INSTRUCTIONS:
1. Search for this provision using multiple queries
2. Verify any potential matches by reading full chunks
3. Check adjacent chunks if needed for context
4. Determine if matched or not matched
5. Record finding with:
   - matched: true/false
   - confidence: 0-1
   - evidenceChunkIds: [list of chunk IDs]
   - evidencePages: [list of page numbers]
   - evidenceExcerpts: [short quotes from contract]
   - reasoningSummary: explain your decision
   - recommendedAction: (optional) what the user should do

Begin analysis now.`;
}

export function getBatchProvisionPrompt(provisions: Provision[]): string {
  const provisionsText = provisions
    .map(
      (p) => `
---
PROVISION ID: ${p.provisionId}
PRIORITY: ${p.priority}
CANONICAL WORDING: ${p.canonicalWording}
DEFINITION: ${p.definition}
SYNONYMS: ${p.synonyms.join(', ')}
FALSE POSITIVES: ${p.falsePositiveTraps.join(', ')}
CONFIDENCE RUBRIC:
  - Explicit: ${p.confidenceRubric.explicit}
  - Strong: ${p.confidenceRubric.strongParaphrase}
  - Weak: ${p.confidenceRubric.weak}
---`
    )
    .join('\n');

  return `BATCH ANALYSIS REQUIRED
You must analyze the following ${provisions.length} provisions.

${provisionsText}

INSTRUCTIONS:
1. For EACH provision, perform searches to find evidence.
2. You can combine searches where appropriate (e.g. searching for "indemnity" might cover multiple provisions).
3. Verify evidence by reading chunks.
4. Compile findings for ALL provisions.
5. Call record_batch_findings ONCE with the array of findings.

Begin batch analysis now.`;
}

/**
 * Generate a verification prompt for provisions with pre-screened candidate chunks.
 * This is used in Pass 2 of the two-pass architecture.
 */
export function getCandidateVerificationPrompt(
  provisions: Provision[],
  candidateMap: CandidateMap
): string {
  const provisionSections = provisions.map((p) => {
    const candidates = candidateMap[p.provisionId] || [];
    const candidateText = candidates.length > 0
      ? candidates.map((c, idx) => {
          const matchInfo = c.matchType === 'both'
            ? ' [VECTOR+KEYWORD]'
            : c.matchType === 'keyword'
            ? ' [KEYWORD]'
            : ' [VECTOR]';
          const keywordInfo = c.keywordMatches?.length
            ? ` Keywords: ${c.keywordMatches.join(', ')}`
            : '';
          return `
  CANDIDATE ${idx + 1}${matchInfo} (score: ${c.score.toFixed(2)}, page ${c.pageStart})${keywordInfo}
  Chunk ID: ${c.chunkId}
  Text:
  """
  ${c.text.slice(0, 1500)}${c.text.length > 1500 ? '...[truncated]' : ''}
  """`;
        }).join('\n')
      : '  NO CANDIDATES FOUND - should be recorded as not matched';

    return `
================================================================================
PROVISION: ${p.provisionId} (${p.priority})
================================================================================
LOOKING FOR: ${p.canonicalWording}
DEFINITION: ${p.definition}

FALSE POSITIVE TRAPS (things that DON'T count):
${p.falsePositiveTraps.map((t) => `  - ${t}`).join('\n')}

CONFIDENCE RUBRIC:
  - Explicit (0.9+): ${p.confidenceRubric.explicit}
  - Strong (0.6-0.89): ${p.confidenceRubric.strongParaphrase}
  - Weak (<0.6, mark not matched): ${p.confidenceRubric.weak}

PRE-SCREENED CANDIDATES (${candidates.length} found):
${candidateText}
`;
  }).join('\n');

  return `## CANDIDATE VERIFICATION MODE

Pre-screening has identified candidate chunks for each provision below.
Your job is to VERIFY whether these candidates actually match the provision.

IMPORTANT RULES:
1. Review each candidate chunk carefully against the provision definition
2. Check for FALSE POSITIVES - don't be fooled by similar-sounding but different clauses
3. If a candidate confirms the provision, record as matched with appropriate confidence
4. If candidates are false positives or insufficient, record as NOT matched
5. You may use get_chunk or get_adjacent_chunks if you need more context
6. Call record_batch_findings ONCE with ALL findings when done

${provisionSections}

================================================================================
INSTRUCTIONS
================================================================================
1. Review each provision and its candidates above
2. For each provision, determine: matched (true/false), confidence (0-1), and evidence
3. If candidates don't clearly support the provision, mark matched=false
4. Record ALL findings using record_batch_findings

Begin verification now.`;
}
