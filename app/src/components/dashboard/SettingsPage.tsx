import { useState, useEffect } from 'react';
import { Moon, SlidersHorizontal, Sun, Wrench, X, Sparkles, AlertTriangle, type LucideIcon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { invokeCommand } from '../../platform';
import { toast } from 'sonner';

interface SettingsPageProps {
    onOpenTools: () => void;
    onRepairDrive?: () => void;
    isRepairing?: boolean;
    onClose: () => void;
}

export function SettingsPage({
    onOpenTools,
    onRepairDrive,
    isRepairing = false,
    onClose,
}: SettingsPageProps) {
    const { theme, toggleTheme } = useTheme();
    const [geminiApiKey, setGeminiApiKey] = useState('');
    const [geminiModel, setGeminiModel] = useState('');
    const [isSavingAi, setIsSavingAi] = useState(false);

    const handleFactoryReset = async () => {
        if (!confirm("Are you sure you want to factory reset the drive? This will wipe the entire manifest and drop all folders and tracking. The actual files in Telegram will NOT be deleted, but Telegram Drive will forget about them.")) return;
        try {
            await invokeCommand('cmd_factory_reset');
            localStorage.clear();
            toast.success("Drive has been factory reset.");
            window.location.reload();
        } catch (err: any) {
            toast.error(err.message || 'Failed to factory reset');
        }
    };

    useEffect(() => {
        void invokeCommand('cmd_get_drive_stats', {}).then((stats: any) => {
            if (stats.geminiApiKey) setGeminiApiKey(stats.geminiApiKey);
            if (stats.geminiModel) setGeminiModel(stats.geminiModel);
        });
    }, []);

    const saveAiSettings = async () => {
        setIsSavingAi(true);
        await invokeCommand('cmd_update_settings', { settings: { geminiApiKey, geminiModel: geminiModel || undefined } });
        setIsSavingAi(false);
    };

    return (
        <div className="fixed inset-0 z-[205] flex flex-col bg-telegram-bg text-telegram-text" onClick={(event) => event.stopPropagation()}>
            <header className="flex items-center justify-between border-b border-telegram-border bg-telegram-surface px-4 pb-3 pt-[calc(0.85rem+env(safe-area-inset-top))] md:px-6 md:py-4">
                <div>
                    <h2 className="text-lg font-semibold">Settings</h2>
                    <p className="text-xs text-telegram-subtext">Display, drive tools, and recovery controls</p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md p-2 text-telegram-subtext transition hover:bg-telegram-hover hover:text-telegram-text"
                    aria-label="Close settings"
                >
                    <X className="h-5 w-5" />
                </button>
            </header>

            <main className="custom-scrollbar flex-1 overflow-auto p-4 md:p-6">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
                    <section className="rounded-lg border border-telegram-border bg-telegram-surface p-4">
                        <SettingHeader icon={SlidersHorizontal} title="Drive Tools" />
                        <div className="mt-4 flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    onOpenTools();
                                }}
                                className="tool-btn"
                            >
                                <SlidersHorizontal className="h-4 w-4" />
                                Open Drive Tools
                            </button>
                            {onRepairDrive && (
                                <button
                                    type="button"
                                    onClick={onRepairDrive}
                                    disabled={isRepairing}
                                    className="tool-btn"
                                >
                                    <Wrench className={`h-4 w-4 ${isRepairing ? 'animate-pulse' : ''}`} />
                                    {isRepairing ? 'Repairing Index...' : 'Repair Index'}
                                </button>
                            )}
                        </div>
                    </section>

                    <section className="rounded-lg border border-telegram-border bg-telegram-surface p-4">
                        <SettingHeader icon={Sparkles} title="AI Features" />
                        <div className="mt-4 flex flex-col gap-3">
                            <label className="text-sm font-medium text-telegram-text">Gemini API Key</label>
                            <p className="text-xs text-telegram-subtext">Enter your Google Gemini API key to enable AI-powered image analysis and auto-tagging for collections.</p>
                            <div className="flex gap-2">
                                <input
                                    type="password"
                                    value={geminiApiKey}
                                    onChange={(e) => setGeminiApiKey(e.target.value)}
                                    placeholder="AIzaSy..."
                                    className="flex-1 rounded-md border border-telegram-border bg-telegram-bg px-3 py-2 text-sm text-telegram-text placeholder:text-telegram-subtext focus:border-telegram-primary/50 focus:outline-none"
                                />
                                <button
                                    onClick={saveAiSettings}
                                    disabled={isSavingAi}
                                    className="rounded-md bg-telegram-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-telegram-primary/90 disabled:opacity-50"
                                >
                                    {isSavingAi ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                            <div className="mt-2 flex flex-col gap-2">
                                <label className="text-sm font-medium text-telegram-text">Custom Gemini Model (Optional)</label>
                                <p className="text-xs text-telegram-subtext">If empty, we will auto-detect a suitable model (e.g., gemini-1.5-flash). Set this to force a specific model.</p>
                                <input
                                    type="text"
                                    value={geminiModel}
                                    onChange={(e) => setGeminiModel(e.target.value)}
                                    placeholder="e.g. gemini-1.5-pro"
                                    className="rounded-md border border-telegram-border bg-telegram-bg px-3 py-2 text-sm text-telegram-text placeholder:text-telegram-subtext focus:border-telegram-primary/50 focus:outline-none"
                                />
                            </div>
                        </div>
                    </section>

                    <section className="rounded-lg border border-telegram-border bg-telegram-surface p-4">
                        <SettingHeader icon={theme === 'dark' ? Moon : Sun} title="Theme" />
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className="mt-4 inline-flex h-11 items-center gap-2 rounded-md border border-telegram-border bg-telegram-hover px-4 text-sm font-medium text-telegram-text transition hover:border-telegram-primary/60"
                        >
                            {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4 text-telegram-primary" />}
                            {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                        </button>
                    </section>

                    <section className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                        <SettingHeader icon={AlertTriangle} title="Danger Zone" />
                        <div className="mt-4 flex flex-col gap-2">
                            <p className="text-sm text-telegram-subtext">If your drive stats are stuck, you can completely wipe the internal database. Your actual files in Telegram will not be deleted, but the drive will be completely emptied.</p>
                            <button
                                type="button"
                                onClick={handleFactoryReset}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-red-500 px-4 text-sm font-medium text-white transition hover:bg-red-600 self-start"
                            >
                                <AlertTriangle className="h-4 w-4" />
                                Factory Reset Drive
                            </button>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
}

function SettingHeader({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
    return (
        <div className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="h-4 w-4 text-telegram-primary" />
            {title}
        </div>
    );
}
