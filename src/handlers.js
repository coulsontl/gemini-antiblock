/**
 * @fileoverview Request handlers for streaming and non-streaming requests.
 */

import {
  FINISHED_TOKEN,
  INCOMPLETE_TOKEN,
  TARGET_MODELS,
  RETRYABLE_STATUS_CODES,
  FATAL_STATUS_CODES,
  MAX_FETCH_RETRIES,
  MAX_NON_RETRYABLE_STATUS_RETRIES
} from "./constants.js";
import {
  injectFinishTokenPrompt,
  isResponseComplete,
  cleanFinalText,
  buildRetryRequest,
  buildUpstreamRequest,
  parseParts,
  isStructuredOutputRequest,
  processSSEDataLine,
} from "./core.js";
import { logDebug, jsonError } from "./utils.js";

/**
 * Handles non-streaming requests with a retry mechanism.
 * @param {Request} request - The original incoming request.
 * @param {object} config - The worker configuration.
 * @param {URL} url - The parsed URL of the request.
 * @returns {Promise<Response>}
 */
export async function handleNonStreamingRequest(request, config, url) {
  const isTargetModel = TARGET_MODELS.some(model => url.pathname.includes(`models/${model}:generateContent`));

  if (!isTargetModel) {
    logDebug(config.debugMode, "Passing through non-streaming request without modification.");
    const upstreamUrl = `${config.upstreamUrlBase}${url.pathname}${url.search}`;
    const upstreamRequest = new Request(upstreamUrl, request);
    return fetch(upstreamRequest);
  }

  let attempts = 0;
  const originalRequestBody = await request.json();

  // 检查是否为结构化输出请求
  if (isStructuredOutputRequest(originalRequestBody)) {
    logDebug(config.debugMode, "Structured output request detected. Passing through without modification.");
    const upstreamUrl = `${config.upstreamUrlBase}${url.pathname}${url.search}`;
    const upstreamRequest = buildUpstreamRequest(upstreamUrl, request, originalRequestBody);
    return fetch(upstreamRequest);
  }

  let injectedOriginalRequestBody = injectFinishTokenPrompt(originalRequestBody, config);
  let currentRequestBody = structuredClone(injectedOriginalRequestBody);
  let accumulatedText = "";
  let allThoughtParts = []; // Accumulate thought parts from all attempts

  logDebug(config.debugMode, "Starting non-streaming request handler.");

  while (attempts <= config.maxRetries) {
    attempts++;
    logDebug(config.debugMode, `Non-streaming attempt ${attempts}/${config.maxRetries + 1}`);

    const upstreamUrl = `${config.upstreamUrlBase}${url.pathname}${url.search}`;
    logDebug(config.debugMode, `Upstream URL: ${upstreamUrl}`);
    const upstreamRequest = buildUpstreamRequest(upstreamUrl, request, currentRequestBody);

    try {
      const upstreamResponse = await fetch(upstreamRequest);

      if (upstreamResponse.ok) {
        const responseJson = await upstreamResponse.json();
        // Parse parts to extract thoughts, response text, and function calls
        const parts = responseJson?.candidates?.[0]?.content?.parts || [];
        const parsedParts = parseParts(parts);

        // Check if response contains function call
        if (parsedParts.hasFunctionCall) {
          logDebug(config.debugMode, "Non-streaming response contains function call. Returning as is.");
          return new Response(JSON.stringify(responseJson), {
            status: 200,
            headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
          });
        }

        // Accumulate only the formal response text (excluding thoughts)
        accumulatedText += parsedParts.responseText;

        // Accumulate thought parts from this attempt
        if (parsedParts.thoughtParts && parsedParts.thoughtParts.length > 0) {
          allThoughtParts.push(...parsedParts.thoughtParts);
        }

        if (isResponseComplete(accumulatedText)) {
          logDebug(config.debugMode, "Non-streaming response is complete.");
          // Clean the final text and reconstruct the parts array
          const finalParts = [];
          // Add all accumulated thought parts first, with cleaned text
          for (const thoughtPart of allThoughtParts) {
            if (thoughtPart.text) {
              // Create a new object with cleaned text
              finalParts.push({
                ...thoughtPart,
                text: cleanFinalText(thoughtPart.text)
              });
            } else {
              finalParts.push(thoughtPart);
            }
          }
          // Add the cleaned response text
          finalParts.push({ text: cleanFinalText(accumulatedText) });

          responseJson.candidates[0].content.parts = finalParts;
          return new Response(JSON.stringify(responseJson), {
            status: 200,
            headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
          });
        } else {
          logDebug(config.debugMode, "Non-streaming response is incomplete. Preparing for retry.");
          currentRequestBody = buildRetryRequest(injectedOriginalRequestBody, accumulatedText);
        }
      } else {
        logDebug(config.debugMode, `Non-streaming attempt ${attempts} failed with status ${upstreamResponse.status}`);

        // Check for fatal status codes first
        if (FATAL_STATUS_CODES.includes(upstreamResponse.status)) {
          logDebug(config.debugMode, `Fatal status ${upstreamResponse.status} received. Aborting retries.`);
          return jsonError(upstreamResponse.status, "Upstream API returned a fatal error.", await upstreamResponse.text());
        }

        const isRetryableStatus = RETRYABLE_STATUS_CODES.includes(upstreamResponse.status);
        const maxRetriesForThisError = isRetryableStatus ? config.maxRetries : MAX_NON_RETRYABLE_STATUS_RETRIES;

        if (attempts > maxRetriesForThisError) {
          return jsonError(upstreamResponse.status, "Upstream API error after max retries.", await upstreamResponse.text());
        }
      }
    } catch (error) {
      logDebug(config.debugMode, `Fetch error during non-streaming attempt ${attempts}:`, error);
      if (attempts > MAX_FETCH_RETRIES) {
        return jsonError(500, "Internal Server Error after max retries.", error.message);
      }
    }
  }

  // If the loop finishes, all retries have been used up.
  logDebug(config.debugMode, "Max retries reached for non-streaming request.");

  // Construct final response with all accumulated thought parts and incomplete text
  const finalParts = [];
  // Add all accumulated thought parts first, with cleaned text
  for (const thoughtPart of allThoughtParts) {
    if (thoughtPart.text) {
      // Create a new object with cleaned text
      finalParts.push({
        ...thoughtPart,
        text: cleanFinalText(thoughtPart.text)
      });
    } else {
      finalParts.push(thoughtPart);
    }
  }
  // Add the incomplete text
  finalParts.push({ text: `${accumulatedText}\n${INCOMPLETE_TOKEN}` });

  const finalJson = {
    candidates: [{
      content: {
        parts: finalParts
      },
      finishReason: "MAX_RETRIES"
    }]
  };
  return new Response(JSON.stringify(finalJson), {
    status: 200, // Still a "successful" response from the proxy's perspective
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
  });
}

/**
 * Handles streaming requests with a retry mechanism.
 * @param {Request} request - The original incoming request.
 * @param {object} config - The worker configuration.
 * @param {URL} url - The parsed URL of the request.
 * @returns {Promise<Response>}
 */
export async function handleStreamingRequest(request, config, url) {
  const isTargetModel = TARGET_MODELS.some(model => url.pathname.includes(`models/${model}:streamGenerateContent`));

  if (!isTargetModel) {
    logDebug(config.debugMode, "Passing through streaming request without modification.");
    const upstreamUrl = `${config.upstreamUrlBase}${url.pathname}${url.search}`;
    const upstreamRequest = new Request(upstreamUrl, request);
    return fetch(upstreamRequest);
  }

  const originalRequestBody = await request.json();

  // 检查是否为结构化输出请求
  if (isStructuredOutputRequest(originalRequestBody)) {
    logDebug(config.debugMode, "Structured output request detected. Passing through without modification.");
    const upstreamUrl = `${config.upstreamUrlBase}${url.pathname}${url.search}`;
    const upstreamRequest = buildUpstreamRequest(upstreamUrl, request, originalRequestBody);
    return fetch(upstreamRequest);
  }

  let accumulatedText = ""; // Accumulates text across all retry attempts

  logDebug(config.debugMode, "Starting streaming request handler.");

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const TOKEN_LEN = FINISHED_TOKEN.length;
  const LOOKAHEAD_SIZE = TOKEN_LEN + 4; // As per user's suggestion

  const process = async () => {
    let attempts = 0;
    let injectedOriginalRequestBody = injectFinishTokenPrompt(originalRequestBody, config);
    let currentRequestBody = structuredClone(injectedOriginalRequestBody);
    let hasFunctionCallInStream = false; // Flag to track if function call was detected in the stream
    let passthroughMode = false; // Flag to track if we should just pass through all data

    // --- Buffers for the current attempt ---
    let lineBuffer = ""; // For handling incomplete lines from chunks
    let textBuffer = ""; // Accumulates text content for lookahead logic
    let linesBuffer = []; // Accumulates original SSE lines corresponding to textBuffer
    let streamTextThisAttempt = ""; // Text that has been forwarded to client in this attempt

    // Buffer size limits to prevent memory issues
    const MAX_LINE_BUFFER_SIZE = 1000000; // 1MB
    const MAX_TEXT_BUFFER_SIZE = 500000; // 500KB
    const MAX_LINES_BUFFER_SIZE = 100; // 100 lines
    // --- End of Buffers ---

    while (attempts <= config.maxRetries) {
      attempts++;
      logDebug(config.debugMode, `Streaming attempt ${attempts}/${config.maxRetries + 1}`);

      const upstreamUrl = `${config.upstreamUrlBase}${url.pathname}${url.search}`;
      logDebug(config.debugMode, `Upstream URL: ${upstreamUrl}`);
      const upstreamRequest = buildUpstreamRequest(upstreamUrl, request, currentRequestBody);

      // Reset buffers for each attempt
      lineBuffer = "";
      textBuffer = "";
      linesBuffer = [];
      streamTextThisAttempt = "";

      try {
        const upstreamResponse = await fetch(upstreamRequest);

        if (upstreamResponse.ok) {
          const reader = upstreamResponse.body.getReader();
          // streamTextThisAttempt is now defined at the function level to track forwarded text

          while (true) {
            const { value, done } = await reader.read();

            // --- Chunk Processing ---
            // Process value first to ensure data is handled even when done is true
            if (value) {
              const chunkString = decoder.decode(value, { stream: true });

              // If in passthrough mode, just forward the chunk directly
              if (passthroughMode) {
                writer.write(encoder.encode(chunkString));
              } else {
                const processableString = lineBuffer + chunkString;

                // Check if lineBuffer is getting too large
                if (processableString.length > MAX_LINE_BUFFER_SIZE) {
                  logDebug(config.debugMode, "Line buffer exceeding maximum size, truncating");
                  // Force split at the maximum size to prevent memory issues
                  const truncatedString = processableString.substring(0, MAX_LINE_BUFFER_SIZE);
                  const lines = truncatedString.split(/\r?\n\r?\n/);
                  lineBuffer = ""; // Clear buffer to prevent accumulation
                  for (const line of lines) {
                    if (line) {
                      // Process each line immediately to prevent buffer buildup
                      if (line.startsWith('data:')) {
                        const buffers = { textBuffer, linesBuffer };
                        const flags = { hasFunctionCallInStream, hasOnlyThoughtContent: false };
                        const result = processSSEDataLine(line, buffers, config.debugMode, flags);
                        // Update the buffers and flags from the function
                        textBuffer = buffers.textBuffer;
                        hasFunctionCallInStream = flags.hasFunctionCallInStream;

                        // Print response text for debugging (from second attempt onwards)
                        if (attempts > 1 && config.debugMode && result && result.parsedParts && result.parsedParts.responseText) {
                          console.log(`[DEBUG ${new Date().toISOString()}] Attempt ${attempts}, received response text: "${result.parsedParts.responseText}"`);
                        }

                        // Check if function call was detected
                        if (hasFunctionCallInStream && !passthroughMode) {
                          logDebug(config.debugMode, "Function call detected. Switching to passthrough mode and releasing buffers.");
                          // Forward all buffered lines immediately
                          if (linesBuffer.length > 0) {
                            writer.write(encoder.encode(linesBuffer.join('\n\n') + '\n\n'));
                            linesBuffer = [];
                            textBuffer = "";
                          }
                          passthroughMode = true;
                          // Forward all remaining lines in the current chunk
                          const currentLineIndex = lines.indexOf(line);
                          const remainingLines = lines.slice(currentLineIndex + 1);
                          if (remainingLines.length > 0) {
                            writer.write(encoder.encode(remainingLines.join('\n\n') + '\n\n'));
                          }

                          // Break out of the loop since we're now in passthrough mode
                          break;
                        }

                        // Check if this line contains only thought content (no response text)
                        if (flags.hasOnlyThoughtContent) {
                          logDebug(config.debugMode, "Line contains only thought content. Forwarding immediately.");

                          // Clean text in parts before forwarding
                          const jsonStr = line.substring(5).trim();
                          const data = JSON.parse(jsonStr);

                          // When the stream contains only thought content, the finishReason is often "STOP",
                          // which can cause the client to prematurely close the connection.
                          // By removing finishReason, we allow the stream to continue.
                          if (data.candidates?.[0]) {
                            delete data.candidates[0].finishReason;

                            for (const part of data.candidates[0].content?.parts || []) {
                              if (part.text) {
                                part.text = cleanFinalText(part.text);
                              }
                            }
                          }
                          const cleanedLine = `data: ${JSON.stringify(data)}`;

                          writer.write(encoder.encode(cleanedLine + '\n\n'));
                          // Remove this line from the linesBuffer since it's already forwarded
                          const index = linesBuffer.indexOf(line);
                          if (index !== -1) {
                            linesBuffer.splice(index, 1);
                          }
                          // Continue to the next line
                          continue;
                        }
                      } else {
                        // Forward comments, empty lines, etc. immediately with two newlines
                        writer.write(encoder.encode(line + '\n\n'));
                      }
                    }
                  }
                } else {
                  // Split by two newlines as per user feedback
                  const lines = processableString.split(/\r?\n\r?\n/);
                  lineBuffer = lines.pop() || ""; // Last line might be incomplete

                  for (const line of lines) {
                    if (line.startsWith('data:')) {
                      const buffers = { textBuffer, linesBuffer };
                      const flags = { hasFunctionCallInStream, hasOnlyThoughtContent: false };
                      const result = processSSEDataLine(line, buffers, config.debugMode, flags);
                      // Update the buffers and flags from the function
                      textBuffer = buffers.textBuffer;
                      hasFunctionCallInStream = flags.hasFunctionCallInStream;

                      // Print response text for debugging (from second attempt onwards)
                      if (attempts > 1 && config.debugMode && result && result.parsedParts && result.parsedParts.responseText) {
                        console.log(`[DEBUG ${new Date().toISOString()}] Attempt ${attempts}, received response text: "${result.parsedParts.responseText}"`);
                      }

                      // Check if function call was detected
                      if (hasFunctionCallInStream && !passthroughMode) {
                        logDebug(config.debugMode, "Function call detected. Switching to passthrough mode and releasing buffers.");
                        // Forward all buffered lines immediately
                        if (linesBuffer.length > 0) {
                          writer.write(encoder.encode(linesBuffer.join('\n\n') + '\n\n'));
                          linesBuffer = [];
                          textBuffer = "";
                        }
                        passthroughMode = true;
                        // Forward all remaining lines in the current chunk
                        const currentLineIndex = lines.indexOf(line);
                        const remainingLines = lines.slice(currentLineIndex + 1);
                        if (remainingLines.length > 0) {
                          writer.write(encoder.encode(remainingLines.join('\n\n') + '\n\n'));
                        }

                        // Break out of the loop since we're now in passthrough mode
                        break;
                      }

                      // Check if this line contains only thought content (no response text)
                      if (flags.hasOnlyThoughtContent) {
                        logDebug(config.debugMode, "Line contains only thought content. Forwarding immediately.");

                        // Clean text in parts before forwarding
                        const jsonStr = line.substring(5).trim();
                        const data = JSON.parse(jsonStr);

                        // When the stream contains only thought content, the finishReason is often "STOP",
                        // which can cause the client to prematurely close the connection.
                        // By removing finishReason, we allow the stream to continue.
                        if (data.candidates?.[0]) {
                          delete data.candidates[0].finishReason;

                          for (const part of data.candidates[0].content?.parts || []) {
                            if (part.text) {
                              part.text = cleanFinalText(part.text);
                            }
                          }
                        }
                        const cleanedLine = `data: ${JSON.stringify(data)}`;

                        writer.write(encoder.encode(cleanedLine + '\n\n'));
                        // Remove this line from the linesBuffer since it's already forwarded
                        const index = linesBuffer.indexOf(line);
                        if (index !== -1) {
                          linesBuffer.splice(index, 1);
                        }
                        // Continue to the next line
                        continue;
                      }
                    } else {
                      // Forward comments, empty lines, etc. immediately with two newlines
                      writer.write(encoder.encode(line + '\n\n'));
                    }
                  }

                  // Skip lookahead and safe forwarding if in passthrough mode
                  if (!passthroughMode) {
                    // --- Lookahead and Safe Forwarding Logic ---

                    // Check if textBuffer is exceeding maximum size
                    if (textBuffer.length > MAX_TEXT_BUFFER_SIZE) {
                      logDebug(config.debugMode, "Text buffer exceeding maximum size, forcing forward");
                      // Force forward all buffered lines to prevent memory issues
                      if (linesBuffer.length > 0) {
                        writer.write(encoder.encode(linesBuffer.join('\n\n') + '\n\n'));
                        linesBuffer = [];
                        textBuffer = "";
                      }
                    }

                    // Check if linesBuffer is exceeding maximum size
                    if (linesBuffer.length > MAX_LINES_BUFFER_SIZE) {
                      logDebug(config.debugMode, "Lines buffer exceeding maximum size, forcing forward");
                      // Force forward all buffered lines to prevent memory issues
                      if (linesBuffer.length > 0) {
                        writer.write(encoder.encode(linesBuffer.join('\n\n') + '\n\n'));
                        linesBuffer = [];
                        textBuffer = "";
                      }
                    }

                    if (textBuffer.length > LOOKAHEAD_SIZE) {
                      const safeTextLength = textBuffer.length - LOOKAHEAD_SIZE;
                      let forwardedTextLength = 0;

                      while (linesBuffer.length > 0) {
                        const currentLine = linesBuffer[0];
                        let currentLineTextLength = 0;
                        let currentLineText = "";

                        if (currentLine.startsWith('data:')) {
                          try {
                            const jsonStr = currentLine.substring(5).trim();
                            if (jsonStr) {
                              const data = JSON.parse(jsonStr);
                              // Parse parts to extract only the formal response text length
                              const parts = data?.candidates?.[0]?.content?.parts || [];
                              const parsedParts = parseParts(parts);
                              currentLineTextLength = parsedParts.responseText.length || 0;
                              currentLineText = parsedParts.responseText || "";
                            }
                          } catch (e) { /* ignore, length 0 */ }
                        }

                        if (forwardedTextLength + currentLineTextLength <= safeTextLength) {
                          // Remove the line from buffer and add to forward list
                          const lineToForward = linesBuffer.shift();
                          writer.write(encoder.encode(lineToForward + '\n\n'));
                          // Update streamTextThisAttempt with the text being forwarded
                          streamTextThisAttempt += currentLineText;
                          forwardedTextLength += currentLineTextLength;
                        } else {
                          break; // Cannot forward this line safely
                        }
                      }

                      // Trim the textBuffer accordingly, ensuring we don't break multi-byte characters
                      // Use a safe approach to trim by character count instead of byte count
                      textBuffer = textBuffer.slice(forwardedTextLength);
                    }
                    // --- End of Lookahead and Safe Forwarding ---
                  }
                }
              }
            }
            // --- End of Chunk Processing ---

            // Then check if stream is done
            if (done) {
              // --- End of Stream Processing ---
              logDebug(config.debugMode, "Upstream stream ended for this attempt.");

              if (passthroughMode) {
                writer.close();
                return;
              }

              // Process any remaining lines in the buffer
              if (lineBuffer) {
                const line = lineBuffer;
                lineBuffer = ""; // Clear buffer

                if (line.startsWith('data:')) {
                  const buffers = { textBuffer, linesBuffer };
                  const flags = { hasFunctionCallInStream, hasOnlyThoughtContent: false };
                  const result = processSSEDataLine(line, buffers, config.debugMode, flags);
                  // Update the buffers and flags from the function
                  textBuffer = buffers.textBuffer;
                  hasFunctionCallInStream = flags.hasFunctionCallInStream;

                  // Print response text for debugging (from second attempt onwards)
                  if (attempts > 1 && config.debugMode && result && result.parsedParts && result.parsedParts.responseText) {
                    console.log(`[DEBUG ${new Date().toISOString()}] Attempt ${attempts}, received response text: "${result.parsedParts.responseText}"`);
                  }

                  // Check if this line contains only thought content (no response text)
                  if (flags.hasOnlyThoughtContent) {
                    logDebug(config.debugMode, "Line contains only thought content. Forwarding immediately.");

                    // Clean text in parts before forwarding
                    const jsonStr = line.substring(5).trim();
                    const data = JSON.parse(jsonStr);

                    // When the stream contains only thought content, the finishReason is often "STOP",
                    // which can cause the client to prematurely close the connection.
                    // By removing finishReason, we allow the stream to continue.
                    if (data.candidates?.[0]) {
                      delete data.candidates[0].finishReason;

                      for (const part of data.candidates[0].content?.parts || []) {
                        if (part.text) {
                          part.text = cleanFinalText(part.text);
                        }
                      }
                    }
                    const cleanedLine = `data: ${JSON.stringify(data)}`;

                    writer.write(encoder.encode(cleanedLine + '\n\n'));
                    // Remove this line from the linesBuffer since it's already forwarded
                    const index = linesBuffer.indexOf(line);
                    if (index !== -1) {
                      linesBuffer.splice(index, 1);
                    }
                  } else {
                    linesBuffer.push(line); // Add to buffer for later processing
                  }
                } else {
                  linesBuffer.push(line); // Forward non-data lines
                }
              }


              // Check for completion with the entire textBuffer
              if (isResponseComplete(textBuffer)) {
                logDebug(config.debugMode, "Streaming response is complete after stream end.");
                const cleanedText = cleanFinalText(textBuffer);

                // Find the last valid data JSON line from linesBuffer as base for finalPayload
                let basePayload = null;
                for (let i = linesBuffer.length - 1; i >= 0; i--) {
                  const line = linesBuffer[i];
                  if (line.startsWith('data:')) {
                    try {
                      const jsonStr = line.substring(5).trim();
                      if (jsonStr) {
                        const data = JSON.parse(jsonStr);
                        if (data && data.candidates && data.candidates.length > 0) {
                          basePayload = data;
                          break;
                        }
                      }
                    } catch (e) {
                      // Ignore parse errors, continue to previous line
                      logDebug(config.debugMode, `Error parsing JSON from line: ${line.substring(0, 100)}...`, e);
                    }
                  }
                }

                // Construct and send the final cleaned data line
                let finalPayload;
                if (basePayload) {
                  // Use basePayload as foundation, only replace content parts
                  // finalPayload = JSON.parse(JSON.stringify(basePayload)); // Deep clone
                  finalPayload = structuredClone(basePayload); // Deep clone
                  if (finalPayload.candidates && finalPayload.candidates.length > 0 && finalPayload.candidates[0].content) {
                    // Preserve all other properties, just replace the content parts
                    finalPayload.candidates[0].content.parts = [{ text: cleanedText }];
                  }
                  logDebug(config.debugMode, "Using base payload for final response");
                } else {
                  // Fallback to original simple structure if no valid base found
                  finalPayload = {
                    candidates: [{
                      content: { parts: [{ text: cleanedText }] },
                      finishReason: "STOP"
                    }]
                  };
                  logDebug(config.debugMode, "No valid base payload found, using simple structure");
                }

                writer.write(encoder.encode(`data: ${JSON.stringify(finalPayload)}\n\n`));
                writer.close();
                return; // Success
              } else {
                logDebug(config.debugMode, `Streaming response is incomplete after stream end. Preparing for retry. textBuffer: ${textBuffer}`);
                // Do NOT forward remaining buffered lines as they don't contain the finish token
                // streamTextThisAttempt already contains all the text that was forwarded to the client
                accumulatedText += streamTextThisAttempt;
                currentRequestBody = buildRetryRequest(injectedOriginalRequestBody, accumulatedText);
                break; // Break inner while to start next retry attempt
              }
              // --- End of Stream Processing ---
            }
          }
        } else {
          logDebug(config.debugMode, `Streaming attempt ${attempts} failed with status ${upstreamResponse.status}`);

          // Check for fatal status codes
          if (FATAL_STATUS_CODES.includes(upstreamResponse.status)) {
            logDebug(config.debugMode, `Fatal status ${upstreamResponse.status} received. Aborting retries.`);
            const errorData = await upstreamResponse.text();
            writer.write(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: { code: upstreamResponse.status, message: "Upstream API returned a fatal error.", details: errorData } })}\n\n`));
            writer.close();
            return; // Abort immediately
          }

          if (attempts > config.maxRetries) {
            const errorData = await upstreamResponse.text();
            writer.write(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: { code: upstreamResponse.status, message: "Upstream API error after max retries.", details: errorData } })}\n\n`));
            writer.close();
            return;
          }
        }
      } catch (error) {
        logDebug(config.debugMode, `Fetch error during streaming attempt ${attempts}:`, error);
        if (attempts > config.maxRetries) {
          writer.write(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: { code: 500, message: "Internal Server Error after max retries.", details: error.message } })}\n\n`));
          writer.close();
          return;
        }
      }
    }

    // If the loop finishes, all retries have been used up.
    logDebug(config.debugMode, "Max retries reached for streaming request.");
    // Any remaining content in linesBuffer from the last failed attempt should be sent.
    if (linesBuffer.length > 0) {
      writer.write(encoder.encode(linesBuffer.join('\n\n') + '\n\n'));
    }
    // Append INCOMPLETE_TOKEN to the very end.
    // We need to construct a final data message for this.
    const incompletePayload = {
      candidates: [{
        content: {
          parts: [{ text: INCOMPLETE_TOKEN }] // Append directly
        },
        finishReason: "MAX_RETRIES",
        index: 0 // Assuming index 0
      }]
    };
    writer.write(encoder.encode(`data: ${JSON.stringify(incompletePayload)}\n\n`));
    writer.close();
  };

  let heartbeatInterval;

  // Start the heartbeat after setting up the stream, but before starting the processing
  heartbeatInterval = setInterval(() => {
    try {
      // Check if the writer is still open and can accept data
      if (writer.desiredSize !== null && writer.desiredSize > 0) {
        logDebug(config.debugMode, "Sending SSE heartbeat.");
        const heartbeatPayload = {
          candidates: [{
            content: { parts: [{ text: "" }], role: "model" },
            index: 0
          }]
        };
        writer.write(encoder.encode(`data: ${JSON.stringify(heartbeatPayload)}\n\n`));
      }
    } catch (e) {
      logDebug(config.debugMode, "Failed to send heartbeat, stream likely closed.", e);
      clearInterval(heartbeatInterval);
    }
  }, 5000);

  process().catch(e => {
    logDebug(config.debugMode, "Unhandled error in streaming process:", e);
    // Attempt to send an error event to the client if possible
    try {
      writer.write(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: { code: 500, message: "Internal worker error.", details: e.message } })}\n\n`));
      writer.close();
    } catch (_) { /* writer might already be closed */ }
  }).finally(() => {
    logDebug(config.debugMode, "Clearing SSE heartbeat interval.");
    clearInterval(heartbeatInterval);
  });

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}