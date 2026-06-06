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

                if (endByte === undefined) {
                    endByte = Math.min(startByte + 1024 * 1024 - 1, fileInfo.size - 1);
                } else if (endByte >= fileInfo.size) {
                    endByte = fileInfo.size - 1;
                }

                if (startByte >= fileInfo.size) {
                    return new Response(null, {
                        status: 416,
                        headers: { 'Content-Range': `bytes */${fileInfo.size}` }
                    });
                }

                const chunkRequestId = crypto.randomUUID();
                const chunkPromise = new Promise((resolve) => {
                    pendingRequests.set(chunkRequestId, resolve);
                });

                client.postMessage({
                    type: 'GET_CHUNK',
                    messageId,
                    startByte,
                    endByte,
                    requestId: chunkRequestId
                });

                const chunkData = await chunkPromise;

                return new Response(chunkData, {
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
