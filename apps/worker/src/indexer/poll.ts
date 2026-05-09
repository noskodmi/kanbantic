import { sepoliaDeployment } from "@kanbantic/shared";

const CONTRACT_ADDRESSES = Object.values(sepoliaDeployment.contracts).map((a) => a.toLowerCase());

export interface EvmLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}

interface JsonRpcLogsResponse {
  result?: EvmLog[];
  error?: { message: string };
}

interface JsonRpcBlockNumberResponse {
  result: string;
}

/**
 * Fetch logs for our 5 contracts between [fromBlock, toBlock] in
 * chunkSize-block windows. On range error, halve the chunk and retry.
 */
export async function fetchLogs(
  rpcUrl: string,
  fromBlock: number,
  toBlock: number,
  initialChunk: number,
): Promise<EvmLog[]> {
  const all: EvmLog[] = [];
  let cursor = fromBlock;
  let chunk = initialChunk;

  while (cursor <= toBlock) {
    const end = Math.min(cursor + chunk - 1, toBlock);
    const logs = await getLogsRange(rpcUrl, cursor, end);
    if (logs === null) {
      if (chunk <= 100) {
        throw new Error(`getLogs failed even at chunk=${String(chunk)}`);
      }
      chunk = Math.floor(chunk / 2);
      continue;
    }
    all.push(...logs);
    cursor = end + 1;
  }
  return all;
}

async function getLogsRange(
  rpcUrl: string,
  fromBlock: number,
  toBlock: number,
): Promise<EvmLog[] | null> {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getLogs",
    params: [
      {
        address: CONTRACT_ADDRESSES,
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${toBlock.toString(16)}`,
      },
    ],
  };
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const payload = await res.json<JsonRpcLogsResponse>();
  if (payload.error) {
    if (/range|exceed|10000|10_000|9500/i.test(payload.error.message)) {
      return null;
    }
    throw new Error(`eth_getLogs error: ${payload.error.message}`);
  }
  return payload.result ?? [];
}

export async function blockNumber(rpcUrl: string): Promise<number> {
  const body = { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] };
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json<JsonRpcBlockNumberResponse>();
  return Number.parseInt(payload.result, 16);
}
