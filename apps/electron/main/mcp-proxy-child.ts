import http from 'node:http';

type ParentMessage =
  | {
      type: 'ready';
      endpoint: string;
    }
  | {
      type: 'error';
      error: string;
    };

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3318;
const targetBaseUrl = readRequiredEnv('DORY_MCP_PROXY_TARGET_URL').replace(/\/$/, '');
const host = process.env.DORY_MCP_PROXY_HOST?.trim() || DEFAULT_HOST;
const port = parsePort(process.env.DORY_MCP_PROXY_PORT) ?? DEFAULT_PORT;
const endpoint = `http://${host}:${port}/api/mcp`;

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parsePort(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const portValue = Number(value);
  if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535) {
    throw new Error(`Invalid DORY_MCP_PROXY_PORT: ${value}`);
  }
  return portValue;
}

function sendToParent(message: ParentMessage) {
  if (process.send) {
    process.send(message);
  }
}

function writeJson(res: http.ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readRequestBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function buildForwardHeaders(req: http.IncomingMessage) {
  const headers = new Headers();
  const blocked = new Set(['connection', 'content-length', 'host', 'transfer-encoding']);

  for (const [name, value] of Object.entries(req.headers)) {
    if (blocked.has(name.toLowerCase()) || typeof value === 'undefined') {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
      continue;
    }
    headers.set(name, value);
  }

  return headers;
}

function writeProxyResponse(res: http.ServerResponse, upstream: Response) {
  const headers: Record<string, string> = {};
  upstream.headers.forEach((value, name) => {
    const lowerName = name.toLowerCase();
    if (lowerName === 'connection' || lowerName === 'transfer-encoding' || lowerName === 'content-encoding' || lowerName === 'content-length') {
      return;
    }
    headers[name] = value;
  });
  res.writeHead(upstream.status, headers);
}

async function proxyMcpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readRequestBody(req);
  const upstream = await fetch(`${targetBaseUrl}/api/mcp`, {
    method: req.method,
    headers: buildForwardHeaders(req),
    body: body?.toString('utf8'),
  });

  writeProxyResponse(res, upstream);
  const responseBody = Buffer.from(await upstream.arrayBuffer());
  res.end(responseBody);
}

const server = http.createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', endpoint);

    if (url.pathname === '/health') {
      writeJson(res, 200, {
        ok: true,
        endpoint,
        target: targetBaseUrl,
      });
      return;
    }

    if (url.pathname !== '/api/mcp') {
      writeJson(res, 404, {
        error: 'Not found',
      });
      return;
    }

    await proxyMcpRequest(req, res);
  })().catch(error => {
    writeJson(res, 502, {
      error: error instanceof Error ? error.message : String(error),
    });
  });
});

server.on('error', error => {
  sendToParent({
    type: 'error',
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});

server.listen(port, host, () => {
  sendToParent({
    type: 'ready',
    endpoint,
  });
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
