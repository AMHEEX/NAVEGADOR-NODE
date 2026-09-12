import { dnsLookup } from './util.js';
/**
 * Tries to resolve the hostname. Returns true if succeeds.
 *
 * @param {String} host is the hostname from the URL.
 * @return {Boolean}
 */
export default async function isResolvable(host) {
    const family = 4;
    try {
        if (await dnsLookup(host, { family })) {
            return true;
        }
    }
    catch (err) {
        // ignore
    }
    return false;
}
//# sourceMappingURL=isResolvable.js.map