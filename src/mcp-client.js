export function createMcpInitializeParams() {
  return {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'LaunchScout', version: '1.0.0' }
  };
}

export function createMcpClient(fetchImpl = fetch) {
  const sessions = new WeakMap();
  let nextRequestId = 0;

  async function send(connection, method, params = {}, session = null) {
    const requestId = ++nextRequestId;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(session?.protocolVersion ? { 'Mcp-Protocol-Version': session.protocolVersion } : {}),
      ...(session?.sessionId ? { 'Mcp-Session-Id': session.sessionId } : {}),
      ...(connection.token ? { Authorization: `Bearer ${connection.token}` } : {})
    };

    try {
      const response = await fetchImpl(connection.endpoint, {
        method: 'POST',
        mode: 'cors',
        headers,
        body: JSON.stringify(createMcpRequest(method, params, requestId)),
        signal: controller.signal
      });
      const body = await response.text();
      if (!response.ok) {
        let detail = '';
        try { detail = JSON.parse(body).error?.message || ''; } catch {}
        throw new Error(`MCP HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
      }
      if (response.status === 202) return { result: null, sessionId: response.headers.get('mcp-session-id') || '' };
      return {
        result: parseMcpResponse(response.headers.get('content-type') || '', body, requestId),
        sessionId: response.headers.get('mcp-session-id') || ''
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function call(connection, method, params = {}) {
    if (!connection?.endpoint) return null;
    let session = sessions.get(connection);
    if (session && (session.endpoint !== connection.endpoint || session.token !== connection.token)) {
      sessions.delete(connection);
      session = null;
    }

    if (method === 'initialize') {
      if (session?.serverInfo) return { protocolVersion: session.protocolVersion, serverInfo: session.serverInfo };
      const response = await send(connection, method, createMcpInitializeParams());
      const result = response.result;
      if (!result?.serverInfo || !result.protocolVersion) throw new Error('O endpoint não respondeu com uma negociação MCP válida.');
      session = {
        protocolVersion: result.protocolVersion,
        sessionId: response.sessionId,
        serverInfo: result.serverInfo,
        endpoint: connection.endpoint,
        token: connection.token
      };
      sessions.set(connection, session);
      try {
        const initialized = await send(connection, 'notifications/initialized', {}, session);
        if (initialized.sessionId && initialized.sessionId !== session.sessionId) {
          session.sessionId = initialized.sessionId;
          sessions.set(connection, session);
        }
      } catch (error) {
        sessions.delete(connection);
        throw error;
      }
      return result;
    }

    let response;
    try {
      response = await send(connection, method, params, session);
    } catch (error) {
      if (!session?.sessionId || !String(error.message).startsWith('MCP HTTP 404')) throw error;
      sessions.delete(connection);
      await call(connection, 'initialize');
      response = await send(connection, method, params, sessions.get(connection));
    }
    if (session && response.sessionId && response.sessionId !== session.sessionId) {
      sessions.set(connection, { ...session, sessionId: response.sessionId });
    }
    return response.result;
  }

  return {
    call,
    reset(connection) {
      sessions.delete(connection);
    }
  };
}

function parseJsonMessage(value) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error('mcp_response_invalid_json');
  }
}

export function parseMcpResponse(contentType, body, requestId) {
  if (!body.trim()) return null;

  let messages;
  if (contentType.toLowerCase().includes('text/event-stream')) {
    messages = body.split(/\r?\n\r?\n/).flatMap((event) => {
      const data = event.split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''));
      if (!data.length) return [];
      const value = data.join('\n');
      return value === '[DONE]' ? [] : [parseJsonMessage(value)];
    });
  } else {
    messages = [parseJsonMessage(body)];
  }

  const message = messages.find((item) => item?.id === requestId);
  if (!message) return null;
  if (message.error) {
    throw new Error(message.error.message || 'MCP JSON-RPC error');
  }
  return message.result ?? null;
}

export function createMcpRequest(method, params, id) {
  const request = { jsonrpc: '2.0', method, params };
  if (!method.startsWith('notifications/')) request.id = id;
  return request;
}
