# Gemini Antiblock Proxy

A Cloudflare Worker proxy for the Gemini API with robust streaming retry capabilities and standardized error responses. This proxy handles model "thought" processes and can filter thoughts after retries to maintain a clean output stream.

## Code Source

The code in this project originates from https://linux.do/t/topic/879281. This project only provides Docker encapsulation without any code modifications.

## Features

- **Streaming Retry**: Automatically retries failed streaming requests with accumulated context
- **Thought Filtering**: Can filter out model "thought" processes from the output stream
- **Error Standardization**: Converts upstream errors to consistent format
- **Environment Configuration**: Supports configuration via environment variables
- **Docker Support**: Easy deployment with Docker

## Configuration

The proxy can be configured using environment variables. Create a `wrangler.toml` file in the project root with the following format:

```toml
name = "gemini-anti-truncate"
main = "src/index.js"
compatibility_date = "2024-04-05"

[observability.logs]
enabled = true

[vars]
# --- 核心配置 ---
# GPTLoad地址 (必填)
UPSTREAM_URL_BASE = "https://<你的gptload地址>/proxy/gemini"

# 单次请求的最大重试次数 (可选, 默认为 10)
MAX_RETRIES = 20

# 调试模式 (可选, 默认为 true)
DEBUG_MODE = "true"
```

### Environment Variables

- `UPSTREAM_URL_BASE`: The base URL for the upstream Gemini API (default: "https://generativelanguage.googleapis.com")
- `MAX_RETRIES`: Maximum number of retry attempts (default: 100)
- `DEBUG_MODE`: Enable debug logging (default: true)

## Docker Deployment

To run the proxy using Docker with custom configuration:

```bash
docker run -p 8080:8080 -v $(pwd)/wrangler.toml:/app/wrangler.toml coulsontl/gemini-antiblock:gat_dev
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
