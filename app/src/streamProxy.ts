import { getAuthorizedClient, getTelegramMessage, getDriveManifest, runWithGlobalNetworkMutex } from './telegramBrowser';

const CHUNK_SIZE = 1024 * 512; // 512 KB alignment
const MAX_CACHE_SIZE = 50; // Max 25MB memory buffer

interface CachedChunk {
    buffer: Uint8Array;
    lastAccessed: number;
}
const chunkCache = new Map<string, CachedChunk>();
const fetchPromises = new Map<string, Promise<Uint8Array>>();
const abortControllers = new Map<number, AbortController>();

async function getOrFetchChunk(messageId: number, alignedOffset: number, signal?: AbortSignal): Promise<Uint8Array> {
    const key = `${messageId}_${alignedOffset}`;
    
    if (chunkCache.has(key)) {
        const cached = chunkCache.get(key)!;
        cached.lastAccessed = Date.now();
        return cached.buffer;
    }
    
    if (fetchPromises.has(key)) {
        return fetchPromises.get(key)!;
    }

    const promise = new Promise<Uint8Array>((resolve, reject) => {
        runWithGlobalNetworkMutex(async () => {
            if (signal?.aborted) {
                reject(new Error('Aborted'));
                return;
            }

            try {
                const client = await getAuthorizedClient();
                const message = await getTelegramMessage(messageId);
                const bigInt = (await import('big-integer')).default;

                const iter = client.iterDownload({
                    file: message.media,
                    offset: bigInt(alignedOffset),
                    limit: 1,
                    requestSize: CHUNK_SIZE
                });

                const chunks: Uint8Array[] = [];
                for await (const chunk of iter) {
                    if (signal?.aborted) throw new Error('Aborted');
                    chunks.push(chunk as Uint8Array);
                }

                const combined = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
                let offset = 0;
                for (const c of chunks) {
                    combined.set(c, offset);
                    offset += c.length;
                }

                if (chunkCache.size >= MAX_CACHE_SIZE) {
                    let oldestKey = '';
                    let oldestTime = Infinity;
                    for (const [k, v] of chunkCache.entries()) {
                        if (v.lastAccessed < oldestTime) {
                            oldestTime = v.lastAccessed;
                            oldestKey = k;
                        }
                    }
                    if (oldestKey) chunkCache.delete(oldestKey);
                }

                chunkCache.set(key, { buffer: combined, lastAccessed: Date.now() });
                fetchPromises.delete(key);

                resolve(combined);

                // Trigger read-ahead prebuffering sequentially
                if (!signal?.aborted) {
                    (async () => {
                        for (let i = 1; i <= 4; i++) {
                            if (signal?.aborted) break;
                            const nextOffset = alignedOffset + (CHUNK_SIZE * i);
                            const nextKey = `${messageId}_${nextOffset}`;
                            if (!chunkCache.has(nextKey) && !fetchPromises.has(nextKey)) {
                                try {
                                    await getOrFetchChunk(messageId, nextOffset, signal);
                                } catch (e) { break; }
                            }
                        }
                    })();
                }
            } catch (e) {
                fetchPromises.delete(key);
                reject(e);
            }
        });
    });

    fetchPromises.set(key, promise);
    return promise;
}

export function registerStreamProxyListener() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', async (event) => {
            const data = event.data;
            if (!data) return;

            if (data.type === 'GET_FILE_INFO') {
                try {
                    const messageId = data.messageId;
                    const message = await getTelegramMessage(messageId);
                    const manifest = await getDriveManifest();
                    const record = manifest.files[String(messageId)];
                    
                    event.source?.postMessage({
                        type: 'CHUNK_DATA',
                        requestId: data.requestId,
                        data: {
                            size: parseInt(String(message.file?.size || record?.size || 1), 10),
                            mimeType: message.file?.mimeType || 'video/mp4'
                        }
                    });
                } catch (e) {
                    event.source?.postMessage({ type: 'CHUNK_DATA', requestId: data.requestId, data: null });
                }
            }

            if (data.type === 'ABORT_CHUNK') {
                const messageId = data.messageId;
                if (abortControllers.has(messageId)) {
                    abortControllers.get(messageId)!.abort();
                    abortControllers.delete(messageId);
                }
                for (const key of fetchPromises.keys()) {
                    if (key.startsWith(`${messageId}_`)) {
                        fetchPromises.delete(key);
                    }
                }
            }

            if (data.type === 'GET_CHUNK') {
                try {
                    const { messageId, startByte, endByte, requestId } = data;
                    
                    if (!abortControllers.has(messageId)) {
                        abortControllers.set(messageId, new AbortController());
                    }
                    const signal = abortControllers.get(messageId)!.signal;

                    const totalLength = endByte - startByte + 1;
                    const resultBuffer = new Uint8Array(totalLength);
                    let currentOffset = startByte;
                    let writeOffset = 0;

                    while (currentOffset <= endByte) {
                        if (signal.aborted) throw new Error('Aborted');
                        const alignedOffset = Math.floor(currentOffset / CHUNK_SIZE) * CHUNK_SIZE;
                        const chunkData = await getOrFetchChunk(messageId, alignedOffset, signal);
                        
                        const chunkStart = Math.max(currentOffset, alignedOffset);
                        const chunkEnd = Math.min(endByte, alignedOffset + CHUNK_SIZE - 1);
                        const length = chunkEnd - chunkStart + 1;
                        
                        const sourceOffset = chunkStart - alignedOffset;
                        const availableLength = chunkData.length - sourceOffset;
                        const actualLength = Math.min(length, Math.max(0, availableLength));
                        
                        if (actualLength > 0) {
                            resultBuffer.set(chunkData.subarray(sourceOffset, sourceOffset + actualLength), writeOffset);
                        }
                        
                        currentOffset += length;
                        writeOffset += actualLength;
                        
                        if (actualLength < length) {
                            // Reached EOF early
                            break;
                        }
                    }

                    const finalBuffer = writeOffset < totalLength ? resultBuffer.subarray(0, writeOffset) : resultBuffer;
                    const copy = new Uint8Array(finalBuffer);

                    (event.source as any)?.postMessage({
                        type: 'CHUNK_DATA',
                        requestId,
                        data: copy.buffer
                    }, [copy.buffer]);

                } catch (e) {
                    console.error('StreamProxy chunk error:', e);
                    (event.source as any)?.postMessage({ type: 'CHUNK_DATA', requestId: data.requestId, data: new ArrayBuffer(0) });
                }
            }
        });
    }
}
