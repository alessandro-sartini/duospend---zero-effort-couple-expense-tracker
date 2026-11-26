export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ ? __APP_VERSION__ : '1.2.0';

export const APP_BUILD_SHA: string =
  typeof __APP_BUILD_SHA__ !== 'undefined' && __APP_BUILD_SHA__ ? __APP_BUILD_SHA__ : 'local';

export const APP_BUILD_TIME: string =
  typeof __APP_BUILD_TIME__ !== 'undefined' && __APP_BUILD_TIME__ ? __APP_BUILD_TIME__ : '';

export function formatAppVersionLabel(): string {
  return APP_BUILD_SHA && APP_BUILD_SHA !== 'local' && APP_BUILD_SHA !== 'unknown'
    ? `v${APP_VERSION} (${APP_BUILD_SHA})`
    : `v${APP_VERSION}`;
}
