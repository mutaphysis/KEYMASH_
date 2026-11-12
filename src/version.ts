// Filled in at build time by vite.config.ts (`define`).
declare const __APP_VERSION__: string;
declare const __GIT_SHA__: string;
declare const __BUILD_NUMBER__: string;
declare const __BUILD_TIME__: string;

export const VERSION = __APP_VERSION__;
export const GIT_SHA = __GIT_SHA__;
export const BUILD_NUMBER = __BUILD_NUMBER__;
export const BUILD_TIME = __BUILD_TIME__;

/** e.g. "v0.1.0 · #14 · e898ece" (CI) or "v0.1.0 · e898ece" (local) or "v0.1.0 · dev" */
export const VERSION_LABEL = ['v' + VERSION, BUILD_NUMBER && '#' + BUILD_NUMBER, GIT_SHA].filter(Boolean).join(' · ');
