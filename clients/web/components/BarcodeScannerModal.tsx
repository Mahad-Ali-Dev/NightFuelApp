'use client';

import { useState, useRef, useEffect } from 'react';
import { useZxing } from 'react-zxing';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ScanLine, Loader2, Camera, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BarcodeScannerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onScan: (barcode: string) => void;
}

export function BarcodeScannerModal({ isOpen, onClose, onScan }: BarcodeScannerModalProps) {
    const [result, setResult] = useState<string>('');
    const [hasCameraError, setHasCameraError] = useState(false);
    const [isScanning, setIsScanning] = useState(true);

    const { ref } = useZxing({
        onDecodeResult: (result: any) => {
            const code = result.getText();
            setResult(code);
            setIsScanning(false);
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(200);
            }
            onScan(code);
            setTimeout(onClose, 500);
        },
        onError: (error: any) => {
            if (error.name === 'NotAllowedError' || error.name === 'NotFoundError') {
                setHasCameraError(true);
            }
        },
    } as any);

    // Reset state when opened
    useEffect(() => {
        if (isOpen) {
            setResult('');
            setIsScanning(true);
            setHasCameraError(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl overflow-hidden"
                >
                    <div className="flex items-center justify-between border-b border-white/5 p-4">
                        <div className="flex items-center gap-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/20 text-brand-400">
                                <ScanLine className="h-4 w-4" />
                            </span>
                            <h3 className="text-sm font-semibold text-white">Scan Barcode</h3>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-neutral-400 hover:text-white" onClick={onClose}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="relative aspect-[4/3] w-full bg-black overflow-hidden flex items-center justify-center">
                        {hasCameraError ? (
                            <div className="flex flex-col items-center gap-3 text-neutral-500 px-6 text-center">
                                <AlertCircle className="h-8 w-8 text-red-500/80" />
                                <p className="text-sm">Cannot access camera. Please check permissions.</p>
                            </div>
                        ) : (
                            <>
                                <video ref={ref} className="h-full w-full object-cover opacity-80" />
                                
                                {/* Scanning Overlay */}
                                <div className="absolute inset-0 pointer-events-none">
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 aspect-square max-w-[200px] border-2 border-brand-500/50 rounded-2xl">
                                        {/* Scanner line animation */}
                                        {isScanning && (
                                            <motion.div
                                                animate={{ top: ['0%', '100%', '0%'] }}
                                                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                                className="absolute left-0 right-0 h-0.5 bg-brand-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.5)]"
                                            />
                                        )}
                                    </div>
                                    <div className="absolute inset-0 bg-black/30 w-full h-full [mask-image:radial-gradient(transparent_35%,black_70%)]" />
                                </div>

                                {result && (
                                    <motion.div 
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="absolute inset-0 flex items-center justify-center bg-emerald-500/20 backdrop-blur-sm"
                                    >
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="h-12 w-12 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg">
                                                <ScanLine className="h-6 w-6" />
                                            </div>
                                            <span className="text-lg font-bold text-white tracking-widest bg-black/50 px-3 py-1 rounded-lg backdrop-blur-md">
                                                {result}
                                            </span>
                                        </div>
                                    </motion.div>
                                )}
                            </>
                        )}
                    </div>

                    <div className="p-4 bg-white/5 flex justify-center text-xs text-neutral-400">
                        <p>Align the barcode within the frame</p>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
