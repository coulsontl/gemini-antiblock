# Gemini Antiblock Proxy

A Cloudflare Worker proxy for the Gemini API with robust streaming retry capabilities and standardized error responses. This proxy handles model "thought" processes and can filter thoughts after retries to maintain a clean output stream.

## Features

- **Streaming Retry**: Automatically retries failed streaming requests with accumulated context
- **Thought Filtering**: Can filter out model "thought" processes from the output stream
- **Error Standardization**: Converts upstream errors to consistent format
- **Environment Configuration**: Supports configuration via environment variables
- **Docker Support**: Easy deployment with Docker

## Configuration

The proxy can be configured using environment variables. Create a `wrangler.toml` file in the project root with the following format:

```toml
name = "gemini-antiblock"
main = "index.js"
compatibility_date = "2023-10-16"

[vars]
UPSTREAM_URL_BASE = "https://generativelanguage.googleapis.com"
MAX_CONSECUTIVE_RETRIES = "100"
DEBUG_MODE = "true"
RETRY_DELAY_MS = "750"
SWALLOW_THOUGHTS_AFTER_RETRY = "true"
```

### Environment Variables

- `UPSTREAM_URL_BASE`: The base URL for the upstream Gemini API (default: "https://generativelanguage.googleapis.com")
- `MAX_CONSECUTIVE_RETRIES`: Maximum number of retry attempts (default: 100)
- `DEBUG_MODE`: Enable debug logging (default: true)
- `RETRY_DELAY_MS`: Delay between retry attempts in milliseconds (default: 750)
- `SWALLOW_THOUGHTS_AFTER_RETRY`: Filter thoughts after a retry (default: true)

## Docker Deployment

To run the proxy using Docker with custom configuration:

```bash
docker run -p 8080:8080 -v $(pwd)/wrangler.toml:/app/wrangler.toml coulsontl/gemini-antiblock:latest
```

This command maps your local `wrangler.toml` file to the container, allowing you to customize the proxy configuration.

## Development

### Prerequisites

- Node.js 20+
- Docker (for containerized deployment)

### Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm start
   ```

### Docker Build

To build the Docker image locally:

```bash
docker build -t gemini-antiblock .
```

## Usage

Once deployed, the proxy will be available at `http://localhost:8080` and can be used as a drop-in replacement for the Gemini API endpoint.

## License

This project is licensed under the MIT License.
