'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronLeft, Camera, Plus, CalendarDays,
    Maximize2, Trash2, ChevronRight, SplitSquareHorizontal
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ProgressPhoto {
    id: string;
    dataUrl: string;
    date: string;
    label: string;
}

const STORAGE_KEY = 'nightfuel-progress-photos';

function loadPhotos(): ProgressPhoto[] {
    if (typeof window === 'undefined') return [];
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch { return []; }
}

function savePhotos(photos: ProgressPhoto[]) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(photos));
}

export default function ProgressPhotosPage() {
    const router = useRouter();
    const [photos, setPhotos] = useState<ProgressPhoto[]>(loadPhotos);
    const [comparing, setComparing] = useState(false);
    const [compareIdxA, setCompareIdxA] = useState(0);
    const [compareIdxB, setCompareIdxB] = useState(Math.max(0, loadPhotos().length - 1));
    const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const addPhoto = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const newPhoto: ProgressPhoto = {
                id: `photo-${Date.now()}`,
                dataUrl: e.target?.result as string,
                date: new Date().toISOString().split('T')[0]!,
                label: 'Progress',
            };
            const updated = [...photos, newPhoto];
            setPhotos(updated);
            savePhotos(updated);
        };
        reader.readAsDataURL(file);
    };

    const deletePhoto = (id: string) => {
        const updated = photos.filter((p) => p.id !== id);
        setPhotos(updated);
        savePhotos(updated);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files) Array.from(files).forEach(addPhoto);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="min-h-screen bg-transparent p-4 md:p-8">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* Header */}
                <header className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="bg-white/5 hover:bg-white/10 text-white rounded-xl">
                        <ChevronLeft size={20} />
                    </Button>
                    <div className="flex-1">
                        <h1 className="text-3xl font-black text-white flex items-center gap-3">
                            <Camera className="text-brand-500" /> Progress Photos
                        </h1>
                        <p className="text-neutral-400 text-sm mt-0.5">
                            {photos.length} photo{photos.length !== 1 ? 's' : ''} saved locally
                        </p>
                    </div>
                    <div className="flex gap-2">
                        {photos.length >= 2 && (
                            <Button
                                onClick={() => { setComparing(!comparing); setCompareIdxA(0); setCompareIdxB(photos.length - 1); }}
                                className={cn(
                                    'rounded-xl text-sm font-bold',
                                    comparing ? 'bg-brand-500 text-white' : 'bg-white/5 text-neutral-400 border border-white/10'
                                )}
                            >
                                <SplitSquareHorizontal size={16} className="mr-1.5" />
                                Compare
                            </Button>
                        )}
                        <Button
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold"
                        >
                            <Plus size={16} className="mr-1.5" /> Add Photo
                        </Button>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleFileChange}
                        className="hidden"
                    />
                </header>

                {/* Compare Mode */}
                {comparing && photos.length >= 2 && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass-card p-5 rounded-2xl border-brand-500/20"
                    >
                        <h3 className="text-white font-bold text-sm mb-4 text-center">Before / After Comparison</h3>
                        <div className="grid grid-cols-2 gap-4">
                            {/* Before */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Before</span>
                                    <div className="flex gap-1">
                                        <button onClick={() => setCompareIdxA(Math.max(0, compareIdxA - 1))} className="p-1 rounded bg-white/5 text-neutral-500"><ChevronLeft size={14} /></button>
                                        <button onClick={() => setCompareIdxA(Math.min(photos.length - 1, compareIdxA + 1))} className="p-1 rounded bg-white/5 text-neutral-500"><ChevronRight size={14} /></button>
                                    </div>
                                </div>
                                <div className="aspect-[3/4] rounded-xl overflow-hidden bg-white/5">
                                    <img src={photos[compareIdxA]?.dataUrl ?? ''} alt="Before" className="w-full h-full object-cover" />
                                </div>
                                <p className="text-neutral-500 text-xs text-center">{photos[compareIdxA]?.date ?? ''}</p>
                            </div>
                            {/* After */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">After</span>
                                    <div className="flex gap-1">
                                        <button onClick={() => setCompareIdxB(Math.max(0, compareIdxB - 1))} className="p-1 rounded bg-white/5 text-neutral-500"><ChevronLeft size={14} /></button>
                                        <button onClick={() => setCompareIdxB(Math.min(photos.length - 1, compareIdxB + 1))} className="p-1 rounded bg-white/5 text-neutral-500"><ChevronRight size={14} /></button>
                                    </div>
                                </div>
                                <div className="aspect-[3/4] rounded-xl overflow-hidden bg-white/5">
                                    <img src={photos[compareIdxB]?.dataUrl ?? ''} alt="After" className="w-full h-full object-cover" />
                                </div>
                                <p className="text-neutral-500 text-xs text-center">{photos[compareIdxB]?.date ?? ''}</p>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Photo Grid */}
                {photos.length === 0 ? (
                    <div className="glass-card p-16 text-center rounded-2xl border-dashed border border-white/10">
                        <Camera size={48} className="text-neutral-700 mx-auto mb-4" />
                        <h3 className="text-white font-bold text-lg">No progress photos yet</h3>
                        <p className="text-neutral-500 text-sm mt-2 mb-4">Upload photos to track your visual transformation over time.</p>
                        <Button onClick={() => fileInputRef.current?.click()} className="bg-brand-500 text-white rounded-xl font-bold">
                            <Camera size={16} className="mr-1.5" /> Take Your First Photo
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {photos.map((photo, i) => (
                            <motion.div
                                key={photo.id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.04 }}
                                className="group relative aspect-[3/4] rounded-xl overflow-hidden bg-white/5 cursor-pointer"
                                onClick={() => setLightboxIdx(i)}
                            >
                                <img src={photo.dataUrl} alt={`Progress ${photo.date}`} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <p className="text-white text-xs font-bold">{photo.date}</p>
                                </div>
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setLightboxIdx(i); }}
                                        className="p-1.5 rounded-lg bg-black/50 text-white/80 hover:text-white"
                                    >
                                        <Maximize2 size={12} />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); deletePhoto(photo.id); }}
                                        className="p-1.5 rounded-lg bg-black/50 text-red-400 hover:text-red-300"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}

                {/* Lightbox */}
                <AnimatePresence>
                    {lightboxIdx !== null && photos[lightboxIdx] && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-4"
                            onClick={() => setLightboxIdx(null)}
                        >
                            <button
                                className="absolute top-4 right-4 p-3 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all z-10"
                                onClick={() => setLightboxIdx(null)}
                            >
                                ✕
                            </button>

                            {lightboxIdx > 0 && (
                                <button
                                    className="absolute left-4 p-3 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all z-10"
                                    onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
                                >
                                    <ChevronLeft size={24} />
                                </button>
                            )}
                            {lightboxIdx < photos.length - 1 && (
                                <button
                                    className="absolute right-4 p-3 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all z-10"
                                    onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
                                >
                                    <ChevronRight size={24} />
                                </button>
                            )}

                            <motion.img
                                key={lightboxIdx}
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                src={photos[lightboxIdx].dataUrl}
                                alt="Progress"
                                className="max-w-full max-h-[85vh] rounded-2xl object-contain"
                                onClick={(e) => e.stopPropagation()}
                            />

                            <div className="absolute bottom-6 text-center">
                                <p className="text-white font-bold">{photos[lightboxIdx].date}</p>
                                <p className="text-neutral-500 text-xs">{lightboxIdx + 1} / {photos.length}</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
