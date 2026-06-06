import { useState, useMemo, useEffect } from 'react';
import { TelegramFile } from '../../types';
import { FileExplorer } from './FileExplorer';
import { ArrowLeft, Image as ImageIcon, Sparkles, Plus, Trash2, CheckSquare } from 'lucide-react';
import { invokeCommand } from '../../platform';
import { toast } from 'sonner';

interface CollectionsViewProps {
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
    onAnalyzeMissing?: () => void;
}

interface CollectionAlbum {
    name: string;
    tag: string;
    isAi: boolean;
    files: TelegramFile[];
    coverFile: TelegramFile | null;
}

export function CollectionsView({
    files, loading, error, onFileClick, onDelete, onDownload, onPreview,
    onDragStart, onDragEnd, onEditTags, onRename, onAnalyzeMissing
}: CollectionsViewProps) {
    const [activeTag, setActiveTag] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'manual' | 'ai'>('manual');
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    
    // Wizard State
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [isSelectingForCollection, setIsSelectingForCollection] = useState<string | null>(null);
    const [newCollectionName, setNewCollectionName] = useState('');
    const [isSavingCollection, setIsSavingCollection] = useState(false);
    const [isDeletingCollection, setIsDeletingCollection] = useState(false);

    const albums = useMemo(() => {
        const collectionsMap = new Map<string, CollectionAlbum>();

        for (const file of files) {
            if (!file.tags || file.trashed || file.missing) continue;

            for (const tag of file.tags) {
                let isAi = false;
                let albumName = tag;

                if (tag.startsWith('ai:')) {
                    isAi = true;
                    albumName = tag.substring(3);
                } else if (tag.startsWith('collection:')) {
                    albumName = tag.substring(11);
                } else {
                    continue; // Skip normal tags, we only care about ai: and collection:
                }

                if (!collectionsMap.has(tag)) {
                    collectionsMap.set(tag, {
                        name: albumName,
                        tag,
                        isAi,
                        files: [],
                        coverFile: null
                    });
                }

                const album = collectionsMap.get(tag)!;
                album.files.push(file);
                if (!album.coverFile && file.mime_type?.startsWith('image/')) {
                    album.coverFile = file;
                }
            }
        }

        return Array.from(collectionsMap.values()).sort((a, b) => b.files.length - a.files.length);
    }, [files]);

    const activeAlbum = activeTag ? albums.find(a => a.tag === activeTag) : null;

    const handleSaveNewCollection = async () => {
        if (!isSelectingForCollection || selectedIds.length === 0) return;
        setIsSavingCollection(true);
        try {
            const tagToApply = `collection:${isSelectingForCollection}`;
            
            // Invoke tagging command for all selected files
            for (const id of selectedIds) {
                const file = files.find(f => f.id === id);
                if (!file) continue;
                
                const existingTags = file.tags || [];
                if (!existingTags.includes(tagToApply)) {
                    const newTags = [...existingTags, tagToApply];
                    await invokeCommand('cmd_set_tags', { messageId: id, tags: newTags });
                }
            }
            
            toast.success(`Created collection "${isSelectingForCollection}" with ${selectedIds.length} items`);
            setIsSelectingForCollection(null);
            setSelectedIds([]);
        } catch (err) {
            console.error(err);
            toast.error('Failed to create collection');
        } finally {
            setIsSavingCollection(false);
        }
    };

    const handleDeleteCollection = async () => {
        if (!activeAlbum) return;
        if (!confirm(`Are you sure you want to delete the collection "${activeAlbum.name}"?\n\nThe photos will NOT be deleted. They will safely remain in their original folders.`)) return;
        
        setIsDeletingCollection(true);
        try {
            for (const file of activeAlbum.files) {
                const existingTags = file.tags || [];
                const newTags = existingTags.filter(t => t !== activeAlbum.tag);
                await invokeCommand('cmd_set_tags', { messageId: file.id, tags: newTags });
            }
            toast.success(`Deleted collection "${activeAlbum.name}"`);
            setActiveTag(null);
        } catch (err) {
            console.error(err);
            toast.error('Failed to delete collection');
        } finally {
            setIsDeletingCollection(false);
        }
    };

    if (isSelectingForCollection) {
        const selectableFiles = files.filter(f => f.mime_type?.startsWith('image/') || f.mime_type?.startsWith('video/'));
        const allSelected = selectableFiles.length > 0 && selectedIds.length === selectableFiles.length;

        const handleSelectAll = () => {
            if (allSelected) {
                setSelectedIds([]);
            } else {
                setSelectedIds(selectableFiles.map(f => f.id));
            }
        };

        return (
            <div className="flex flex-col h-full">
                <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 md:px-6 md:py-4 border-b border-telegram-border bg-telegram-surface">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2 text-telegram-text">
                            Select items for "{isSelectingForCollection}"
                        </h2>
                        <p className="text-sm text-telegram-subtext">{selectedIds.length} items selected</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={handleSelectAll}
                            className="rounded-md px-4 py-2 text-sm font-medium text-telegram-text hover:bg-telegram-hover transition mr-2 flex items-center gap-2"
                        >
                            <CheckSquare className="w-4 h-4" />
                            {allSelected ? 'Deselect All' : 'Select All'}
                        </button>
                        <button 
                            onClick={() => {
                                setIsSelectingForCollection(null);
                                setSelectedIds([]);
                            }}
                            className="rounded-md px-4 py-2 text-sm font-medium text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSaveNewCollection}
                            disabled={isSavingCollection || selectedIds.length === 0}
                            className="rounded-md bg-telegram-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-telegram-primary/90 disabled:opacity-50"
                        >
                            {isSavingCollection ? 'Saving...' : 'Save Collection'}
                        </button>
                    </div>
                </div>
                <FileExplorer
                    files={selectableFiles}
                    loading={loading}
                    error={error}
                    viewMode="grid"
                    selectedIds={selectedIds}
                    activeFolderId={null}
                    onFileClick={(_e, id) => {
                        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
                    }}
                    onDelete={onDelete}
                    onDownload={onDownload}
                    onPreview={onPreview}
                    onManualUpload={() => {}}
                    onCreateFolder={async () => {}}
                    allowUpload={false}
                    onSelectionClear={() => setSelectedIds([])}
                    onToggleSelection={(id: number) => {
                        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
                    }}
                    onDrop={() => {}}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onEditTags={onEditTags}
                    onRename={onRename}
                />
            </div>
        );
    }

    if (activeAlbum) {
        return (
            <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4 border-b border-telegram-border bg-telegram-surface">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => setActiveTag(null)}
                            className="p-2 hover:bg-telegram-hover rounded-full transition-colors text-telegram-text"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h2 className="text-xl font-bold flex items-center gap-2 text-telegram-text">
                                {activeAlbum.isAi && <Sparkles className="w-5 h-5 text-telegram-primary" />}
                                {activeAlbum.name}
                            </h2>
                            <p className="text-sm text-telegram-subtext">{activeAlbum.files.length} items</p>
                        </div>
                    </div>
                    <button
                        onClick={handleDeleteCollection}
                        disabled={isDeletingCollection}
                        className={`p-2 rounded-full transition-colors ${isDeletingCollection ? 'opacity-50 cursor-not-allowed text-telegram-subtext' : 'text-red-500 hover:bg-red-500/10'}`}
                        title="Delete Collection"
                    >
                        <Trash2 className="w-5 h-5" />
                    </button>
                </div>
                <FileExplorer
                    files={activeAlbum.files}
                    loading={loading}
                    error={error}
                    viewMode="grid"
                    selectedIds={selectedIds}
                    activeFolderId={null}
                    onFileClick={onFileClick}
                    onDelete={onDelete}
                    onDownload={onDownload}
                    onPreview={onPreview}
                    onManualUpload={() => toast.info('You cannot upload directly into a collection yet.')}
                    onManualFolderUpload={() => toast.info('You cannot upload directly into a collection yet.')}
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
                    onMove={() => toast.info("Cannot move from collections. Edit tags instead.")}
                    onCut={() => {}}
                />
            </div>
        );
    }

    const aiAlbums = albums.filter(a => a.isAi);
    const manualAlbums = albums.filter(a => !a.isAi);

    return (
        <div className="p-4 md:p-6 overflow-y-auto custom-scrollbar h-full relative">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-telegram-text">Your Collections</h2>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 rounded-md bg-telegram-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-telegram-primary/90"
                >
                    <Plus className="h-4 w-4" />
                    Create Collection
                </button>
            </div>

            {albums.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center text-telegram-subtext p-8 text-center mt-12">
                    <Sparkles className="w-16 h-16 mb-4 opacity-50" />
                    <h3 className="text-lg font-medium text-telegram-text mb-2">No Collections Yet</h3>
                    <p className="max-w-md">
                        Upload photos with your Gemini API key configured to let AI automatically generate beautiful collections for you. You can also manually add the <code className="bg-telegram-hover px-1 py-0.5 rounded">collection:Name</code> tag to files to group them manually!
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    <div className="flex items-center gap-2 border-b border-telegram-border pb-px">
                        <button 
                            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'manual' ? 'border-telegram-primary text-telegram-primary' : 'border-transparent text-telegram-subtext hover:text-telegram-text'}`}
                            onClick={() => setActiveTab('manual')}
                        >
                            Manual Collections
                        </button>
                        <button 
                            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-1 ${activeTab === 'ai' ? 'border-telegram-primary text-telegram-primary' : 'border-transparent text-telegram-subtext hover:text-telegram-text'}`}
                            onClick={() => setActiveTab('ai')}
                        >
                            <Sparkles className="w-4 h-4" />
                            AI Collections
                        </button>
                    </div>
                    
                    {activeTab === 'manual' && (
                        manualAlbums.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                {manualAlbums.map((album) => (
                                    <div 
                                        key={album.tag}
                                        onClick={() => setActiveTag(album.tag)}
                                        className="group relative flex flex-col cursor-pointer bg-telegram-surface rounded-xl border border-telegram-border overflow-hidden hover:border-telegram-primary transition-colors"
                                    >
                                        <div className="aspect-square bg-telegram-bg relative overflow-hidden">
                                            {album.coverFile ? (
                                                <AlbumCover file={album.coverFile} />
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <ImageIcon className="w-12 h-12 text-telegram-subtext opacity-20" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-3">
                                            <h3 className="font-medium text-sm text-telegram-text truncate flex items-center gap-1">
                                                {album.name}
                                            </h3>
                                            <p className="text-xs text-telegram-subtext">{album.files.length} items</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-telegram-subtext text-sm py-8 text-center border-2 border-dashed border-telegram-border rounded-xl">
                                No manual collections yet. Create one by selecting files and clicking "Create Collection".
                            </div>
                        )
                    )}

                    {activeTab === 'ai' && (
                        <div className="flex flex-col gap-4">
                            {onAnalyzeMissing && (
                                <div className="flex justify-between items-center bg-telegram-hover/30 p-4 rounded-xl border border-telegram-border">
                                    <div>
                                        <h4 className="text-sm font-semibold text-telegram-text">Analyze Missing Photos</h4>
                                        <p className="text-xs text-telegram-subtext">Scan your drive for any images that haven't been tagged by AI yet.</p>
                                    </div>
                                    <button
                                        onClick={onAnalyzeMissing}
                                        className="flex items-center gap-2 rounded-md bg-telegram-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-telegram-primary/90"
                                    >
                                        <Sparkles className="h-4 w-4" />
                                        Analyze Remaining
                                    </button>
                                </div>
                            )}
                            
                            {aiAlbums.length > 0 ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                {aiAlbums.map((album) => (
                                    <div 
                                        key={album.tag}
                                        onClick={() => setActiveTag(album.tag)}
                                        className="group relative flex flex-col cursor-pointer bg-telegram-surface rounded-xl border border-telegram-border overflow-hidden hover:border-telegram-primary transition-colors"
                                    >
                                        <div className="aspect-square bg-telegram-bg relative overflow-hidden">
                                            {album.coverFile ? (
                                                <AlbumCover file={album.coverFile} />
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <ImageIcon className="w-12 h-12 text-telegram-subtext opacity-20" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-3">
                                            <h3 className="font-medium text-sm text-telegram-text truncate flex items-center gap-1">
                                                {album.name}
                                            </h3>
                                            <p className="text-xs text-telegram-subtext">{album.files.length} items</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-telegram-subtext text-sm py-8 text-center border-2 border-dashed border-telegram-border rounded-xl">
                                No AI collections yet. Set up your Gemini API key in Settings to let AI automatically tag your photos.
                            </div>
                        )}
                        </div>
                    )}
                </div>
            )}

            {showCreateModal && (
                <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowCreateModal(false)}>
                    <div className="w-full max-w-sm rounded-xl border border-telegram-border bg-telegram-surface shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
                        <h2 className="text-lg font-bold text-telegram-text mb-4">Create New Collection</h2>
                        <input
                            autoFocus
                            value={newCollectionName}
                            onChange={(e) => setNewCollectionName(e.target.value)}
                            placeholder="e.g. Summer Vacation"
                            className="w-full rounded-lg border border-telegram-border bg-telegram-hover px-3 py-2 text-sm text-telegram-text outline-none focus:border-telegram-primary/60 mb-6"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && newCollectionName.trim()) {
                                    setIsSelectingForCollection(newCollectionName.trim());
                                    setShowCreateModal(false);
                                    setNewCollectionName('');
                                    setSelectedIds([]);
                                }
                            }}
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    setShowCreateModal(false);
                                    setNewCollectionName('');
                                }}
                                className="rounded-md px-4 py-2 text-sm font-medium text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    if (newCollectionName.trim()) {
                                        setIsSelectingForCollection(newCollectionName.trim());
                                        setShowCreateModal(false);
                                        setNewCollectionName('');
                                        setSelectedIds([]);
                                    }
                                }}
                                disabled={!newCollectionName.trim()}
                                className="rounded-md bg-telegram-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-telegram-primary/90 disabled:opacity-50"
                            >
                                Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

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
