import { useQuery } from '@tanstack/react-query';
import { Image, Video, FileText, HardDrive } from 'lucide-react';
import { invokeCommand } from '../../platform';
import { DriveStats } from '../../types';

function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function AnalyticsBanner() {
    const { data: stats, isLoading } = useQuery({
        queryKey: ['drive-stats-analytics'],
        queryFn: () => invokeCommand<DriveStats>('cmd_get_drive_stats', {})
    });

    if (isLoading || !stats) return null;

    const photos = stats.types.find(t => t.label === 'Images')?.count || 0;
    const videos = stats.types.find(t => t.label === 'Videos')?.count || 0;
    const documents = stats.types.find(t => t.label === 'Documents' || t.label === 'Archives')?.count || 0;

    return (
        <div className="px-4 pt-4 md:px-6 md:pt-6 pb-2">
            <h2 className="text-xl font-bold text-telegram-text mb-4">Drive Overview</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-telegram-surface border border-telegram-border rounded-xl p-4 flex items-center gap-4 hover:border-telegram-primary/50 transition-colors">
                    <div className="p-3 bg-blue-500/10 text-blue-500 rounded-lg">
                        <HardDrive className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs text-telegram-subtext font-medium uppercase tracking-wider">Total Usage</p>
                        <p className="text-xl font-bold text-telegram-text">{formatBytes(stats.activeBytes)}</p>
                        <p className="text-xs text-telegram-subtext">{stats.activeFiles} files</p>
                    </div>
                </div>
                
                <div className="bg-telegram-surface border border-telegram-border rounded-xl p-4 flex items-center gap-4 hover:border-telegram-primary/50 transition-colors">
                    <div className="p-3 bg-green-500/10 text-green-500 rounded-lg">
                        <Image className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs text-telegram-subtext font-medium uppercase tracking-wider">Photos</p>
                        <p className="text-xl font-bold text-telegram-text">{photos}</p>
                    </div>
                </div>

                <div className="bg-telegram-surface border border-telegram-border rounded-xl p-4 flex items-center gap-4 hover:border-telegram-primary/50 transition-colors">
                    <div className="p-3 bg-purple-500/10 text-purple-500 rounded-lg">
                        <Video className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs text-telegram-subtext font-medium uppercase tracking-wider">Videos</p>
                        <p className="text-xl font-bold text-telegram-text">{videos}</p>
                    </div>
                </div>

                <div className="bg-telegram-surface border border-telegram-border rounded-xl p-4 flex items-center gap-4 hover:border-telegram-primary/50 transition-colors">
                    <div className="p-3 bg-orange-500/10 text-orange-500 rounded-lg">
                        <FileText className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs text-telegram-subtext font-medium uppercase tracking-wider">Documents</p>
                        <p className="text-xl font-bold text-telegram-text">{documents}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
