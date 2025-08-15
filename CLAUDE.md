# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Cloudflare Worker proxy for the Gemini API that provides robust streaming retry capabilities and standardized error responses. The main purpose is to handle model "thought" processes and filter thoughts after retries to maintain a clean output stream.

## Common Commands

### Development
- `npm start` - Start the development server using Wrangler
- `docker-compose up --build` - Build and start the Docker container
- `docker-compose down` - Stop and remove the Docker container
- `docker-compose logs` - View container logs

### Testing
- Test the service: `curl -I http://localhost:8080`

## Architecture

### Main Components

1. **Configuration System**: 
   - Default configuration is defined in the `CONFIG` object in `index.js`
   - Environment variables can override these defaults via the `updateConfigFromEnv()` function
   - Configuration values are read from the Cloudflare Worker environment (`env` parameter)

2. **Request Handling**:
   - The worker handles both streaming and non-streaming requests
   - Streaming requests are processed by `handleStreamingPost()`
   - Non-streaming requests are processed by `handleNonStreaming()`
   - CORS preflight requests are handled by `handleOPTIONS()`

3. **Streaming Processing**:
   - Core logic is in `processStreamAndRetryInternally()`
   - Implements retry mechanisms for interrupted streams
   - Handles "thought" filtering to clean up output
   - Supports up to `max_consecutive_retries` attempts

4. **Error Handling**:
   - Standardized error responses via `jsonError()` and `standardizeInitialError()`
   - Non-retryable status codes are defined in `NON_RETRYABLE_STATUSES`
   - Google-style status codes are mapped from HTTP status codes

### Key Features

1. **Retry Logic**: Automatically retries failed streaming requests with accumulated context
2. **Thought Filtering**: Can filter out model "thought" processes from the output stream
3. **Environment Configuration**: Supports configuration via environment variables
4. **Error Standardization**: Converts upstream errors to consistent format

### Configuration Variables

- `UPSTREAM_URL_BASE`: The base URL for the upstream Gemini API
- `MAX_CONSECUTIVE_RETRIES`: Maximum number of retry attempts (default: 100)
- `DEBUG_MODE`: Enable debug logging (default: true)
- `RETRY_DELAY_MS`: Delay between retry attempts in milliseconds (default: 750)
- `SWALLOW_THOUGHTS_AFTER_RETRY`: Filter thoughts after a retry (default: true)

## Docker Setup

The application runs in a Docker container using:
- Node.js 20 slim image
- Wrangler for Cloudflare Workers development
- Port mapping: 8650 (host) -> 8080 (container)