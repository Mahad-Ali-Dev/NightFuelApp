'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Download, Trash2, ShieldAlert, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { deleteAccount, exportData, clearTokens } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

// The user must type this exact string to arm the irreversible delete.
const CONFIRM_PHRASE = 'DELETE';

export default function PrivacySettingsPage() {
    const router = useRouter();
    const storeLogout = useAuthStore((s) => s.logout);

    const [isExporting, setIsExporting] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [confirmText, setConfirmText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    // GDPR Art. 15/20 — download the aggregated account data as a JSON file.
    const handleExport = async () => {
        setIsExporting(true);
        try {
            const res = await exportData();
            const blob = new Blob([JSON.stringify(res.data, null, 2)], {
                type: 'application/json',
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const stamp = new Date().toISOString().slice(0, 10);
            a.download = `zeitra-data-export-${stamp}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            toast.success('Your data export has been downloaded.');
        } catch (err: any) {
            console.error('Export failed', err);
            toast.error(err?.response?.data?.error || 'Failed to export your data. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    // GDPR Art. 17 — permanently delete the account, then clear local session and
    // bounce to /login.
    const handleDelete = async () => {
        if (confirmText !== CONFIRM_PHRASE) return;
        setIsDeleting(true);
        try {
            await deleteAccount();
            // Account + server-side refresh token are gone; drop the in-memory
            // access token + session-hint cookie and reset the store.
            clearTokens();
            storeLogout();
            toast.success('Your account and data have been deleted.');
            router.push('/login');
        } catch (err: any) {
            console.error('Delete failed', err);
            toast.error(err?.response?.data?.error || 'Failed to delete your account. Please try again.');
            setIsDeleting(false);
        }
    };

    const closeDialog = () => {
        if (isDeleting) return;
        setShowDeleteDialog(false);
        setConfirmText('');
    };

    return (
        <div className="space-y-6 pb-24">
            <header>
                <h1 className="text-3xl font-bold text-white">Privacy &amp; Data</h1>
                <p className="text-neutral-400 mt-1">
                    Manage your personal data. You can export everything we hold or permanently delete your account.
                </p>
            </header>

            {/* Export */}
            <Card className="glass-card">
                <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2 text-lg">
                        <Download className="h-5 w-5 text-brand-500" />
                        Export my data
                    </CardTitle>
                    <CardDescription>
                        Download a copy of your account data (profile, preferences, logs) as a JSON file (GDPR Art. 15/20).
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button
                        onClick={handleExport}
                        disabled={isExporting}
                        variant="outline"
                        className="gap-2"
                    >
                        {isExporting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Download className="h-4 w-4" />
                        )}
                        {isExporting ? 'Preparing export…' : 'Export my data'}
                    </Button>
                </CardContent>
            </Card>

            {/* Delete */}
            <Card className="glass-card border-red-500/20">
                <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2 text-lg">
                        <ShieldAlert className="h-5 w-5 text-red-400" />
                        Delete account
                    </CardTitle>
                    <CardDescription>
                        Permanently delete your account and all associated data. This cannot be undone (GDPR Art. 17).
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button
                        onClick={() => setShowDeleteDialog(true)}
                        variant="destructive"
                        className="gap-2"
                    >
                        <Trash2 className="h-4 w-4" />
                        Delete account
                    </Button>
                </CardContent>
            </Card>

            {/* Type-to-confirm dialog */}
            {showDeleteDialog && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="delete-dialog-title"
                    onClick={closeDialog}
                >
                    <div
                        className="glass-panel relative w-full max-w-md rounded-2xl border border-red-500/30 p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={closeDialog}
                            disabled={isDeleting}
                            aria-label="Close"
                            className="absolute right-4 top-4 text-neutral-400 hover:text-white disabled:opacity-50"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        <div className="flex items-center gap-2 mb-2">
                            <ShieldAlert className="h-6 w-6 text-red-400" />
                            <h2 id="delete-dialog-title" className="text-xl font-bold text-white">
                                Delete your account?
                            </h2>
                        </div>
                        <p className="text-sm text-neutral-400 mb-4">
                            This permanently erases your account and all data across the platform. This action is
                            irreversible. Type <span className="font-mono font-bold text-red-400">{CONFIRM_PHRASE}</span> to confirm.
                        </p>

                        <div className="space-y-2 mb-6">
                            <Label htmlFor="confirm-delete" className="text-neutral-300">
                                Confirmation
                            </Label>
                            <Input
                                id="confirm-delete"
                                value={confirmText}
                                onChange={(e) => setConfirmText(e.target.value)}
                                placeholder={CONFIRM_PHRASE}
                                autoComplete="off"
                                disabled={isDeleting}
                            />
                        </div>

                        <div className="flex justify-end gap-3">
                            <Button variant="ghost" onClick={closeDialog} disabled={isDeleting}>
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={handleDelete}
                                disabled={confirmText !== CONFIRM_PHRASE || isDeleting}
                                className="gap-2"
                            >
                                {isDeleting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Trash2 className="h-4 w-4" />
                                )}
                                {isDeleting ? 'Deleting…' : 'Delete account'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
