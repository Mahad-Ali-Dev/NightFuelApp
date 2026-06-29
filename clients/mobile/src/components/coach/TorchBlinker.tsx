/**
 * TorchBlinker — blinks the device flashlight a few times via a hidden CameraView
 * (expo-camera's torch needs a mounted camera). Best-effort: works only in the
 * FOREGROUND on a real device with camera permission + a dev build; if permission
 * is denied or the camera is unavailable it silently no-ops. Imperative: grab a
 * ref and call .blink().
 */
import React, { forwardRef, useImperativeHandle, useState, useRef, useCallback } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';

export interface TorchHandle {
    blink: () => Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const TorchBlinker = forwardRef<TorchHandle>(function TorchBlinker(_props, ref) {
    const [permission, requestPermission] = useCameraPermissions();
    const [torchOn, setTorchOn] = useState(false);
    const busyRef = useRef(false);

    const blink = useCallback(async () => {
        if (busyRef.current) return;
        // The torch needs camera permission. Request it on first use; bail quietly
        // if denied (the notification + vibration still nudge the user).
        if (!permission?.granted) {
            const res = await requestPermission().catch(() => null);
            if (!res?.granted) return;
            await sleep(300); // let the CameraView mount now that permission is granted
        }
        busyRef.current = true;
        try {
            for (let i = 0; i < 4; i++) {
                setTorchOn(true);
                await sleep(180);
                setTorchOn(false);
                await sleep(160);
            }
        } finally {
            busyRef.current = false;
        }
    }, [permission?.granted, requestPermission]);

    useImperativeHandle(ref, () => ({ blink }), [blink]);

    // Mount the (invisible) camera only once permission is granted — that's what
    // lets us toggle the torch. 1×1 + opacity 0 keeps it off-screen + inert.
    if (!permission?.granted) return null;
    return <CameraView style={{ width: 1, height: 1, opacity: 0 }} facing="back" enableTorch={torchOn} />;
});
