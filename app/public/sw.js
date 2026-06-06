self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

const pendingRequests = new Map();

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CHUNK_DATA') {
        const { requestId, data } = event.data;
        if (pendingRequests.has(requestId)) {
            pendingRequests.get(requestId)(data);
            pendingRequests.delete(requestId);
        }
    }
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (url.pathname.startsWith('/stream/')) {
        const messageId = parseInt(url.pathname.split('/').pop(), 10);
        if (isNaN(messageId)) return;

        event.respondWith(
            (async () => {
                const clients = await self.clients.matchAll({ type: 'window' });
                const client = clients[0]; 
                if (!client) {
                    return new Response('No active client found for stream proxy', { status: 503 });
                }

                const rangeHeader = event.request.headers.get('Range') || 'bytes=0-';
                const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
                let startByte = match ? parseInt(match[1], 10) : 0;
                let endByte = match && match[2] ? parseInt(match[2], 10) : undefined;

                const infoRequestId = crypto.randomUUID();
                const fileInfoPromise = new Promise((resolve) => {
                    pendingRequests.set(infoRequestId, resolve);
                });
                client.postMessage({
                    type: 'GET_FILE_INFO',
                    messageId,
                    requestId: infoRequestId
                });
                const fileInfo = await fileInfoPromise;

                if (!fileInfo || !fileInfo.size) {
                    return new Response('File info not found', { status: 404 });
                }

                const hasRange = event.request.headers.has('Range');

                if (!hasRange) {
                    let currentByte = 0;
                    const CHUNK_SIZE = 512 * 1024; // 512KB chunks

                    const stream = new ReadableStream({
                        async pull(controller) {
                            if (currentByte >= fileInfo.size) {
                                controller.close();
                                return;
                            }

                            const endByte = Math.min(currentByte + CHUNK_SIZE - 1, fileInfo.size - 1);
                            
                            const chunkRequestId = crypto.randomUUID();
                            const chunkPromise = new Promise((resolve) => {
                                pendingRequests.set(chunkRequestId, resolve);
                            });

                            client.postMessage({
                                type: 'GET_CHUNK',
                                messageId,
                                startByte: currentByte,
                                endByte,
                                requestId: chunkRequestId
                            });

                            const chunkData = await chunkPromise;
                            
                            if (!chunkData || chunkData.byteLength === 0) {
                                controller.error('Failed to fetch chunk');
                                return;
                            }
                            
                            controller.enqueue(new Uint8Array(chunkData));
                            currentByte = endByte + 1;
                        },
                        cancel() {
                            client.postMessage({
                                type: 'ABORT_CHUNK',
                                messageId
                            });
                        }
                    });

                    return new Response(stream, {
                        status: 200,
                        headers: {
                            'Content-Type': fileInfo.mimeType || 'application/octet-stream',
                            'Content-Length': fileInfo.size.toString(),
                            'Accept-Ranges': 'bytes'
                        }
                    });
                }

                // --- Range Request Handling ---
                if (endByte === undefined) {
                    endByte = fileInfo.size - 1;
                } else if (endByte >= fileInfo.size) {
                    endByte = fileInfo.size - 1;
                }

                if (startByte >= fileInfo.size) {
                    return new Response(null, {
                        status: 416,
                        headers: { 'Content-Range': `bytes */${fileInfo.size}` }
                    });
                }

                let currentByteRange = startByte;
                const CHUNK_SIZE_RANGE = 512 * 1024; // 512KB chunks for range requests too

                const streamRange = new ReadableStream({
                    async pull(controller) {
                        if (currentByteRange > endByte) {
                            controller.close();
                            return;
                        }

                        const chunkEndByte = Math.min(currentByteRange + CHUNK_SIZE_RANGE - 1, endByte);
                        
                        const chunkRequestId = crypto.randomUUID();
                        const chunkPromise = new Promise((resolve) => {
                            pendingRequests.set(chunkRequestId, resolve);
                        });

                        client.postMessage({
                            type: 'GET_CHUNK',
                            messageId,
                            startByte: currentByteRange,
                            endByte: chunkEndByte,
                            requestId: chunkRequestId
                        });

                        const chunkData = await chunkPromise;
                        
                        if (!chunkData || chunkData.byteLength === 0) {
                            controller.error('Failed to fetch chunk');
                            return;
                        }
                        
                        controller.enqueue(new Uint8Array(chunkData));
                        currentByteRange = chunkEndByte + 1;
                    },
                    cancel() {
                        client.postMessage({
                            type: 'ABORT_CHUNK',
                            messageId
                        });
                    }
                });

                return new Response(streamRange, {
                    status: 206,
                    headers: {
                        'Content-Type': fileInfo.mimeType || 'video/mp4',
                        'Content-Range': `bytes ${startByte}-${endByte}/${fileInfo.size}`,
                        'Content-Length': (endByte - startByte + 1).toString(),
                        'Accept-Ranges': 'bytes'
                    }
                });
            })()
        );
    }
});
