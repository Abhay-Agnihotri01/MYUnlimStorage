import { getAuthorizedClient, getTelegramMessage, getDriveManifest } from './telegramBrowser';

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
                            size: message.file?.size || record?.size || Math.max(1, record?.size || 0),
                            mimeType: message.file?.mimeType || 'video/mp4'
                        }
                    });
                } catch (e) {
                    event.source?.postMessage({ type: 'CHUNK_DATA', requestId: data.requestId, data: null });
                }
            }

            if (data.type === 'GET_CHUNK') {
                try {
                    const { messageId, startByte, endByte, requestId } = data;
                    const client = await getAuthorizedClient();
                    const message = await getTelegramMessage(messageId);
                    
                    const CHUNK_SIZE = 1024 * 512; // 512 KB alignment
                    const alignedOffset = Math.floor(startByte / CHUNK_SIZE) * CHUNK_SIZE;
                    const bytesToFetch = endByte - alignedOffset + 1;
                    const limit = Math.ceil(bytesToFetch / CHUNK_SIZE);
                    const bigInt = (await import('big-integer')).default;

                    const iter = client.iterDownload({
                        file: message.media,
                        offset: bigInt(alignedOffset),
                        limit: limit,
                        requestSize: CHUNK_SIZE
                    });

                    const chunks: Uint8Array[] = [];
                    for await (const chunk of iter) {
                        chunks.push(chunk as Uint8Array);
                    }

                    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
                    const combined = new Uint8Array(totalLength);
                    let offset = 0;
                    for (const c of chunks) {
                        combined.set(c, offset);
                        offset += c.length;
                    }

                    const exactOffset = startByte - alignedOffset;
                    const exactEnd = endByte - alignedOffset + 1;
                    const exactChunk = combined.slice(exactOffset, exactEnd);

                    event.source?.postMessage({
                        type: 'CHUNK_DATA',
                        requestId,
                        data: exactChunk.buffer
                    }, [exactChunk.buffer]);

                } catch (e) {
                    console.error('StreamProxy chunk error:', e);
                    event.source?.postMessage({ type: 'CHUNK_DATA', requestId: data.requestId, data: new ArrayBuffer(0) });
                }
            }
        });
    }
}
