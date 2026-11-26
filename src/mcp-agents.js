export async function collectAgentSearchResults(connections, callMcp, argumentsForSearch, normalizeItem) {
  const responses = await Promise.allSettled(connections.map(async (connection) => ({
    connection,
    result: await callMcp(connection, 'tools/call', {
      name: 'search_launches',
      arguments: argumentsForSearch
    })
  })));
  const items = [];
  let failedCount = 0;
  let successfulCount = 0;

  for (const response of responses) {
    if (response.status !== 'fulfilled') {
      failedCount += 1;
      continue;
    }

    const { connection, result } = response.value;
    if (result?.isError) {
      failedCount += 1;
      continue;
    }

    let agentItems = result?.structuredContent?.items;
    if (!Array.isArray(agentItems) && Array.isArray(result?.content)) {
      const text = result.content.find((part) => part.type === 'text')?.text;
      if (typeof text !== 'string') {
        failedCount += 1;
        continue;
      }
      try {
        agentItems = JSON.parse(text).items;
      } catch {
        failedCount += 1;
        continue;
      }
    }

    if (!Array.isArray(agentItems)) {
      failedCount += 1;
      continue;
    }

    successfulCount += 1;
    for (const [index, item] of agentItems.entries()) {
      const normalized = normalizeItem(item, index + items.length, connection);
      if (normalized) items.push(normalized);
    }
  }

  return { items, failedCount, successfulCount };
}
