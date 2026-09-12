import https_ from 'https';
import { http } from './http.js';
/**
 * Returns a Readable stream from an "https:" URI.
 */
export const https = (url, opts) => {
    return http(url, { ...opts, http: https_ });
};
//# sourceMappingURL=https.js.map