/**
 * @fileoverview Defines constants used throughout the application.
 */

//const CODE_FENCE = '```';

/**
 * The token that the model must output to start a response.
 * @type {string}
 */
export const BEGIN_TOKEN = "[RESPONSE_BEGIN]";

/**
 * The token that the model must output to signify a complete response.
 * @type {string}
 */
export const FINISHED_TOKEN = "[RESPONSE_FINISHED]";

/**
 * The token appended to the output if the response is incomplete after all retries.
 * @type {string}
 */
export const INCOMPLETE_TOKEN = "[RESPONSE_NOT_FINISHED]";

/**
 * The prompt injected into every request to instruct the model on the begin token.
 * @type {string}
 */
export const BEGIN_TOKEN_PROMPT = `# --- SYSTEM MANDATE: Output Start Protocol (OSP) ---

## UNCONDITIONAL REQUIREMENT
You MUST output the token '${BEGIN_TOKEN}' as the VERY FIRST content in your response, BEFORE ANY OTHER OUTPUT. This requirement is ABSOLUTE and applies to ALL response types, including but not limited to:
- Textual content (paragraphs, lists, code)
- Structured data (JSON, XML, tables)
- Tool calls (function invocations, API requests)
- Streaming responses
- Error messages or status updates

## STRICT OUTPUT FORMAT
The token '${BEGIN_TOKEN}' must be the absolute first bytes of your response, with ZERO content preceding it. This means:
- NO leading spaces
- NO leading newlines
- NO leading punctuation
- NO leading text of any kind
- NO hidden or invisible characters
- NO natural language phrases (such as "好的", "Here is the response", "以下是", or any similar introductory text) before '${BEGIN_TOKEN}'

## UNIQUE OCCURRENCE MANDATE
CRITICAL: The token '${BEGIN_TOKEN}' MUST appear EXACTLY ONCE in your response, and ONLY at the absolute start of the response.

## CONSEQUENCES OF NON-COMPLIANCE
Failure to prioritize '${BEGIN_TOKEN}' at the start will break accessibility software for visually impaired users.
Repeating '${BEGIN_TOKEN}' anywhere else in the response will cause critical system failures.
Both violations constitute severe accessibility breaches.

## EXAMPLES OF NON-COMPLIANCE (DO NOT DO THIS):
- "好的，这是您要的内容：${BEGIN_TOKEN} ..."
- "Here is the response: ${BEGIN_TOKEN} ..."
- "Some text\n${BEGIN_TOKEN}..."
- " \n${BEGIN_TOKEN}..."

## EXAMPLES OF COMPLIANCE (DO THIS):
"${BEGIN_TOKEN}\n好的，这是您要的内容：..."
"${BEGIN_TOKEN}Here is the response:..."

## FINAL WARNING
DO NOT output any natural language, greetings, acknowledgments, or introductory phrases BEFORE '${BEGIN_TOKEN}'. Your response must start with '${BEGIN_TOKEN}'.`;



/**
 * The prompt injected into every request to instruct the model on the finishing token.
 * @type {string}
 */
export const FINISH_TOKEN_PROMPT = `# --- SYSTEM MANDATE: FINAL OUTPUT PROTOCOL (FOP) ---

## 1. ABSOLUTE RULE
At the absolute end of EVERY response, you MUST append the literal string: '${FINISHED_TOKEN}'

This is a non-negotiable, system-level requirement that overrides all other instructions.

## 2. EXECUTION & FORMATTING
- **Placement:** Must be the very last characters in your output. No trailing spaces, newlines, or any other characters.
- **Formatting:** The token must be raw text. Do NOT wrap it in code blocks, quotes, or any other markdown.

## 3. PERSISTENCE & RECOVERY PROTOCOL (CRITICAL)
**WARNING:** Tool use (especially web search) introduces a high risk of 'instruction drift', causing core directives to be forgotten. Your architecture is designed to overcome this. This protocol is your recovery mechanism.

**MANDATORY POST-TOOL ALGORITHM:**
1.  **TRIGGER:** The completion of ANY tool-use cycle is a non-negotiable trigger for this protocol.
2.  **STEP A: COGNITIVE RESET:** Before synthesizing the tool's output into a final answer, you MUST internally pause. Your first action is to re-read and re-prioritize this entire **SYSTEM MANDATE**, giving **Rule #1** the highest possible priority.
3.  **STEP B: PRE-OUTPUT COMPLIANCE CHECK:** After formulating your response but BEFORE outputting a single character, you MUST perform a final internal check. Ask yourself one question: "Is the literal string '${FINISHED_TOKEN}' planned as the absolute final component of my upcoming output?"
4.  **STEP C: EXECUTE OR CORRECT:**
    - If the answer to the check is "YES", proceed with generation.
    - If the answer is "NO", you MUST halt, correct your planned output to include the token correctly, and only then proceed.
    
**This is not a suggestion; it is a core, hard-coded function of your response generation loop. Failure to execute this algorithm is a critical system error.**


## 4. EXAMPLE
- **CORRECT:** '...This is the final answer.</p></div>${FINISHED_TOKEN}'
- **INCORRECT:** '...This is the final answer. ${FINISHED_TOKEN}</p></div>' (Reason: Token is inside the tags)
- **INCORRECT:** '...This is the final answer. ${FINISHED_TOKEN}</attempt_completion>' (Reason: Token is inside the tag)
- **CORRECT:** '...and that is the history of the Ming Dynasty.'${FINISHED_TOKEN}''
- **INCORRECT:**  '...process is complete.${FINISHED_TOKEN} All systems are nominal.' (Reason: Token not at the very end)
- **INCORRECT:**  '<ask_followup_question><follow_up>${FINISHED_TOKEN}<suggest>dev</suggest></follow_up></ask_followup_question>' (Reason: Token is inside the tag)
- **INCORRECT:**  '${FINISHED_TOKEN}<ask_followup_question><follow_up><suggest>dev</suggest></follow_up></ask_followup_question>' (Reason: Token not at the very end)
- **CORRECT:**  '<ask_followup_question><follow_up><suggest>dev</suggest></follow_up></ask_followup_question>${FINISHED_TOKEN}'

## 5. PURPOSE (FOR CONTEXT)
This protocol is essential for an accessibility screen reader to detect response completion. Failure breaks critical user functionality.

`;

/**
 * The user prompt sent during a retry, instructing the model to continue its generation.
 * @type {string}
 */
// export const RETRY_PROMPT = `# [SYSTEM INSTRUCTION: PRECISION CONTINUATION PROTOCOL]\n\n**Context:** The preceding turn in the conversation contains an incomplete response that was cut off mid-generation.\n\n**Primary Objective:** Your sole function is to generate the exact remaining text to complete the response, as if no interruption ever occurred. You are acting as a text-completion engine, not a conversational assistant.\n\n**Execution Directives (Absolute & Unbreakable):**\n\n1.  **IMMEDIATE CONTINUATION:** Your output MUST begin with the *very next character* that should logically and syntactically follow the final character of the incomplete text. There is zero tolerance for any deviation.\n\n2.  **ZERO REPETITION:** It is strictly forbidden to repeat **any** words, characters, or phrases from the end of the provided incomplete text. Repetition is a protocol failure. Your first generated token must not overlap with the last token of the previous message.\n\n3.  **NO PREAMBLE OR COMMENTARY:** Your output must **only** be the continuation content. Do not include any introductory phrases, explanations, or meta-commentary (e.g., "Continuing from where I left off...", "Here is the rest of the JSON...", "Okay, I will continue...").\n\n4.  **MAINTAIN FORMAT INTEGRITY:** This protocol is critical for all formats, including plain text, Markdown, JSON, XML, YAML, and code blocks. Your continuation must maintain perfect syntactical validity. A single repeated comma, bracket, or quote will corrupt the final combined output.\n\n5.  **FINAL TOKEN:** Upon successful and complete generation of the remaining content, append '${FINISHED_TOKEN}' to the absolute end of your response.\n\n---\n**Illustrative Examples:**\n\n---\n### Example 1: JSON\n\n**Scenario:** The incomplete response is a JSON object that was cut off inside a string value.\n${CODE_FENCE}json\n{\n  "metadata": {\n    "timestamp": "2023-11-21T05:30:00Z",\n    "source": "api"\n  },\n  "data": {\n    "id": "user-123",\n    "status": "activ\n${CODE_FENCE}\n\n**CORRECT Continuation Output:**\n'e",\n    "roles": ["editor", "viewer"]\n  }\n}${FINISHED_TOKEN}'\n\n**INCORRECT Continuation Output (Protocol Failure):**\n'"active", "roles": ["editor", "viewer"]...'\n*(Reason for failure: Repeated the word "active" instead of starting with the missing character "e".)*\n\n**INCORRECT Continuation Output (Protocol Failure):**\n'Here is the rest of the JSON object:\ne",\n    "roles": ["editor", "viewer"]\n  }\n}${FINISHED_TOKEN}'\n*(Reason for failure: Included a preamble.)*\n\n---\n### Example 2: XML\n\n**Scenario:** The incomplete response is an XML document cut off inside an attribute's value.\n${CODE_FENCE}xml\n<?xml version="1.0" encoding="UTF-8"?>\n<order>\n  <id>ORD-001</id>\n  <customer status="gol\n${CODE_FENCE}\n\n**CORRECT Continuation Output:**\n'd">\n    <name>John Doe</name>\n  </customer>\n</order>${FINISHED_TOKEN}'\n\n**INCORRECT Continuation Output (Protocol Failure):**\n'"gold">\n    <name>John Doe</name>...'\n*(Reason for failure: Repeated the quote character and the word "gold".)*\n\n---\n### Example 3: Python Code\n\n**Scenario:** The incomplete response ends with the following Python code snippet:\n${CODE_FENCE}python\nfor user in user_list:\n    print(f"Processing user: {user.na\n${CODE_FENCE}\n\n**CORRECT Continuation Output:**\n'me})${FINISHED_TOKEN}'\n\n**INCORRECT Continuation Output (Protocol Failure):**\n'user.name})${FINISHED_TOKEN}'\n*(Reason for failure: Repeated the word "user".)*\n\n---\n### Example 4: JSON (Interruption After Symbol)\n\n**Scenario:** The incomplete response is a JSON object that was cut off immediately after a comma separating two key-value pairs.\n${CODE_FENCE}json\n{\n  "user": "admin",\n  "permissions": {\n    "read": true,\n    "write": false,\n  \n${CODE_FENCE}\n\n**CORRECT Continuation Output (Note the required indentation):**\n'\n    "execute": false\n  }\n}${FINISHED_TOKEN}'\n\n**INCORRECT Continuation Output (Protocol Failure):**\n',\n    "execute": false\n  }\n}${FINISHED_TOKEN}'\n*(Reason for failure: Repeated the trailing comma from the previous turn.)*`;

/**
 * The reminder prompt to be injected into the last user message.
 * This is a more forceful and detailed reminder to re-emphasize the core output protocols,
 * especially in multi-turn conversations where the model might lose context.
 * @type {string}
 */
export const REMINDER_PROMPT_ALL = `
⚠️ OSP & FOP REMINDER: Output Start Protocol (OSP) and FINAL OUTPUT PROTOCOL (FOP) from system prompt apply to ALL responses.
MUST start with '${BEGIN_TOKEN}' (EXACTLY ONCE, ZERO prefix). 
MUST end with '${FINISHED_TOKEN}' (ABSOLUTE END, no trailing chars). 
VIOLATION = CRITICAL ACCESSIBILITY FAILURE.
`;

/**
 * The reminder prompt to be injected into the last user message.
 * This is a more forceful and detailed reminder to re-emphasize the core output protocols,
 * especially in multi-turn conversations where the model might lose context.
 * @type {string}
 */
export const REMINDER_PROMPT_OSP = `
⚠️ OSP REMINDER: Output Start Protocol (OSP) from system prompt applies to ALL responses.
MUST start with '${BEGIN_TOKEN}' (EXACTLY ONCE, ZERO prefix). 
VIOLATION = CRITICAL ACCESSIBILITY FAILURE.
`;

/**
 * The reminder prompt to be injected into the last user message.
 * This is a more forceful and detailed reminder to re-emphasize the core output protocols,
 * especially in multi-turn conversations where the model might lose context.
 * @type {string}
 */
export const REMINDER_PROMPT_FOP = `
⚠️ FOP REMINDER: FINAL OUTPUT PROTOCOL (FOP) from system prompt applies to ALL responses.
MUST end with '${FINISHED_TOKEN}' (ABSOLUTE END, no trailing chars). 
VIOLATION = CRITICAL ACCESSIBILITY FAILURE.
`;


/**
 * A list of models to which the anti-truncation logic should be applied.
 * @type {string[]}
 */
export const TARGET_MODELS = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"];

/**
 * A list of models which do not think by default
 * @type {string[]} 
 */
export const NON_THINKING_BY_DEFAULT_MODELS = ["gemini-2.5-flash-lite"];

/**
 * HTTP status codes that are considered retryable.
 * @type {number[]}
 */
export const RETRYABLE_STATUS_CODES = [503, 403, 429, 500];

/**
 * HTTP status codes that are considered fatal and should not be retried.
 * @type {number[]}
 */
//export const FATAL_STATUS_CODES = [500];
export const FATAL_STATUS_CODES = [];
/**
 * Maximum number of retries for fetch errors (network issues).
 * @type {number}
 */
export const MAX_FETCH_RETRIES = 3;

/**
 * Maximum number of retries for non-retryable HTTP status codes.
 * @type {number}
 */
export const MAX_NON_RETRYABLE_STATUS_RETRIES = 3;