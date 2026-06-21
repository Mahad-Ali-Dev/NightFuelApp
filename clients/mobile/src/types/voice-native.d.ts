/**
 * voice-native.d.ts
 *
 * Ambient module shims for the on-device voice packages used ONLY by the lazy
 * native adapter (`src/lib/voiceNative.ts`):
 *
 *   - `expo-speech`               → on-device text-to-speech (TTS).
 *   - `expo-speech-recognition`   → on-device speech-to-text (STT)
 *                                   (jamsch/expo-speech-recognition, @sdk-54).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * These packages are DECLARED in package.json for the EAS build but are NOT
 * installed in the environment that runs the jest/`tsc` gate (we do not
 * `npm install` native deps there). Without a type for them, `tsc --noEmit`
 * would error on `src/lib/voiceNative.ts`'s imports ("Cannot find module …").
 * These minimal `declare module` shims give the type-checker just enough surface
 * for that file to compile WITHOUT the packages present.
 *
 * REMOVE-ME ONCE DEPS ARE INSTALLED
 * ---------------------------------
 * When `expo-speech` and `expo-speech-recognition@sdk-54` are actually installed
 * (for an EAS dev/release build), DELETE the corresponding `declare module`
 * block(s) below so the real, complete bundled types take over. Keeping a shim
 * for an installed package would shadow its real types. These shims are
 * intentionally a SUBSET of the real APIs — only what the native adapter uses.
 */

// ─── expo-speech (TTS) ────────────────────────────────────────────────────────
declare module 'expo-speech' {
  export interface SpeechOptions {
    language?: string;
    pitch?: number;
    rate?: number;
    voice?: string;
    volume?: number;
    onStart?: () => void;
    onDone?: () => void;
    onStopped?: () => void;
    onError?: (error: Error) => void;
  }

  export function speak(text: string, options?: SpeechOptions): void;
  export function stop(): Promise<void>;
  export function pause(): Promise<void>;
  export function resume(): Promise<void>;
  export function isSpeakingAsync(): Promise<boolean>;
  export function getAvailableVoicesAsync(): Promise<unknown[]>;
  export const maxSpeechInputLength: number;
}

// ─── expo-speech-recognition (STT) ────────────────────────────────────────────
// jamsch/expo-speech-recognition. Module-event API: a static `ExpoSpeechRecognitionModule`
// plus `addSpeechRecognitionListener(event, cb)`. We type only the slice used.
declare module 'expo-speech-recognition' {
  export interface ExpoSpeechRecognitionOptions {
    lang?: string;
    interimResults?: boolean;
    continuous?: boolean;
    requiresOnDeviceRecognition?: boolean;
    addsPunctuation?: boolean;
    maxAlternatives?: number;
    contextualStrings?: string[];
    [key: string]: unknown;
  }

  export interface ExpoSpeechRecognitionResult {
    transcript: string;
    confidence?: number;
  }

  export interface ExpoSpeechRecognitionResultEvent {
    isFinal: boolean;
    results: ExpoSpeechRecognitionResult[];
  }

  export interface ExpoSpeechRecognitionErrorEvent {
    error: string;
    message?: string;
  }

  export interface PermissionResponse {
    granted: boolean;
    canAskAgain?: boolean;
    status?: string;
  }

  export interface ExpoSpeechRecognitionNativeEventMap {
    start: void;
    end: void;
    result: ExpoSpeechRecognitionResultEvent;
    error: ExpoSpeechRecognitionErrorEvent;
    [key: string]: unknown;
  }

  export interface EventSubscription {
    remove(): void;
  }

  export const ExpoSpeechRecognitionModule: {
    start(options: ExpoSpeechRecognitionOptions): void;
    stop(): void;
    abort(): void;
    requestPermissionsAsync(): Promise<PermissionResponse>;
    getPermissionsAsync(): Promise<PermissionResponse>;
    getStateAsync?(): Promise<string>;
    isRecognitionAvailable?(): boolean;
    getSupportedLocales?(options?: unknown): Promise<unknown>;
  };

  export function addSpeechRecognitionListener<
    K extends keyof ExpoSpeechRecognitionNativeEventMap,
  >(
    event: K,
    listener: (ev: ExpoSpeechRecognitionNativeEventMap[K]) => void,
  ): EventSubscription;

  export function getSpeechRecognitionServices(): string[];
}
