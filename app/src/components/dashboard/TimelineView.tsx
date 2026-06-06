import { useState, useMemo } from 'react';
import { TelegramFile } from '../../types';
import { FileExplorer } from './FileExplorer';
import { ArrowLeft, Calendar, Image as ImageIcon } from 'lucide-react';
import { invokeCommand } from '../../platform';
import { toast } from 'sonner';

interface TimelineViewProps {
    files: TelegramFile[];
    loading: boolean;
    error: Error | null;
    onFileClick: (e: React.MouseEvent, id: number) => void;
    onDelete: (id: number) => void;
    onDownload: (id: number, name: string) => void;
    onPreview: (file: TelegramFile) => void;
    onDragStart: (fileId: number) => void;
    onDragEnd: () => void;
    onEditTags: (file: TelegramFile) => void;
    onRename: (file: TelegramFile) => void;
}

interface MonthBucket {
    id: string; // e.g. "2023-10"
    label: string; // e.g. "October 2023"
    date: Date;
    files: TelegramFile[];
    coverFile: TelegramFile | null;
}

export function TimelineView({
    files, loading, error, onFileClick, onDelete, onDownload, onPreview,
    onDragStart, onDragEnd, onEditTags, onRename
}: TimelineViewProps) {
    const [activeMonthId, setActiveMonthId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);

    const buckets = useMemo(() => {
        const map = new Map<string, MonthBucket>();

        for (const file of files) {
            if (file.trashed || file.missing) continue;
            // The user requested ALL files to be included.

            if (!file.created_at) continue;
            const date = new Date(file.created_at);
            if (isNaN(date.getTime())) continue;

            const year = date.getFullYear();
            const month = date.getMonth();
            const bucketId = `${year}-${month.toString().padStart(2, '0')}`;
            
            if (!map.has(bucketId)) {
                map.set(bucketId, {
                    id: bucketId,
                    label: date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
                    date: new Date(year, month, 1),
                    files: [],
                    coverFile: null
                });
            }

            const bucket = map.get(bucketId)!;
            bucket.files.push(file);
            
            // Prefer images for the cover
            if (!bucket.coverFile && file.mime_type?.startsWith('image/')) {
                bucket.coverFile = file;
            }
        }

        // Sort buckets descending by date
        return Array.from(map.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [files]);

    const activeBucket = activeMonthId ? buckets.find(b => b.id === activeMonthId) : null;

    if (activeBucket) {
        return (
            <div className="flex flex-col h-full">
                <div className="flex items-center gap-4 px-4 py-3 md:px-6 md:py-4 border-b border-telegram-border bg-telegram-surface">
                    <button 
                        onClick={() => {
                            setActiveMonthId(null);
                            setSelectedIds([]);
                        }}
                        className="p-2 hover:bg-telegram-hover rounded-full transition-colors text-telegram-text"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2 text-telegram-text">
                            <Calendar className="w-5 h-5 text-telegram-primary" />
                            {activeBucket.label}
                        </h2>
                        <p className="text-sm text-telegram-subtext">{activeBucket.files.length} items</p>
                    </div>
                </div>
                <FileExplorer
                    files={activeBucket.files}
                    loading={loading}
                    error={error}
                    viewMode="grid"
                    selectedIds={selectedIds}
                    activeFolderId={null}
                    onFileClick={onFileClick}
                    onDelete={onDelete}
                    onDownload={onDownload}
                    onPreview={onPreview}
                    onManualUpload={() => toast.info('You cannot upload directly into a timeline month.')}
                    onManualFolderUpload={() => toast.info('You cannot upload directly into a timeline month.')}
                    onCreateFolder={async () => {}}
                    allowUpload={false}
                    onSelectionClear={() => setSelectedIds([])}
                    onToggleSelection={(id: number) => {
                        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
                    }}
                    onDrop={() => {}}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onRestore={() => {}}
                    onEditTags={onEditTags}
                    onRename={onRename}
                    onSetFolderColor={() => {}}
                    onShowVersions={() => {}}
                    onMove={() => toast.info("Cannot move from timeline view. Edit tags instead.")}
                    onCut={() => {}}
                    // Show specific date and time, plus file size!
                    getItemPath={(file) => {
                        if (!file.created_at) return file.sizeStr;
                        const d = new Date(file.created_at);
                        const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                        return `${dateStr} at ${timeStr} • ${file.sizeStr}`;
                    }}
                />
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 overflow-y-auto custom-scrollbar h-full relative">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-telegram-text">Timeline</h2>
            </div>

            {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={`skeleton-${i}`} className="group relative flex flex-col bg-telegram-surface rounded-xl border border-telegram-border overflow-hidden animate-pulse">
                            <div className="aspect-square bg-telegram-hover"></div>
                            <div className="p-3">
                                <div className="h-4 bg-telegram-hover rounded w-3/4 mb-2"></div>
                                <div className="h-3 bg-telegram-hover rounded w-1/4"></div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : buckets.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-telegram-subtext p-8 text-center mt-12">
                    <Calendar className="w-16 h-16 mb-4 opacity-50" />
                    <h3 className="text-lg font-medium text-telegram-text mb-2">No Files Found</h3>
                    <p className="max-w-md">
                        Your files will be automatically organized here by month.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {buckets.map((bucket) => (
                        <div 
                            key={bucket.id}
                            onClick={() => setActiveMonthId(bucket.id)}
                            className="group relative flex flex-col cursor-pointer bg-telegram-surface rounded-xl border border-telegram-border overflow-hidden hover:border-telegram-primary transition-colors"
                        >
                            <div className="aspect-square bg-telegram-bg relative overflow-hidden">
                                {bucket.coverFile ? (
                                    <AlbumCover file={bucket.coverFile} />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <ImageIcon className="w-12 h-12 text-telegram-subtext opacity-20" />
                                    </div>
                                )}
                            </div>
                            <div className="p-3">
                                <h3 className="font-medium text-sm text-telegram-text truncate flex items-center gap-1">
                                    {bucket.label}
                                </h3>
                                <p className="text-xs text-telegram-subtext">{bucket.files.length} items</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Reuse AlbumCover logic from CollectionsView or define it here
import { useEffect } from 'react';

function AlbumCover({ file }: { file: TelegramFile }) {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        invokeCommand('cmd_get_thumbnail', { messageId: file.id })
            .then((res: any) => {
                if (isMounted && typeof res === 'string') setUrl(res);
            })
            .catch(() => {});
        return () => {
            isMounted = false;
        };
    }, [file.id]);

    if (!url) {
        return (
            <div className="absolute inset-0 flex items-center justify-center bg-telegram-hover animate-pulse">
                <ImageIcon className="w-8 h-8 text-telegram-subtext opacity-50" />
            </div>
        );
    }

    return (
        <img 
            src={url} 
            alt="Cover"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
    );
}
