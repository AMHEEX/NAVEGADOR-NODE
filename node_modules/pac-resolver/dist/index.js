import { compile } from 'degenerator';
/**
 * Built-in PAC functions.
 */
import dateRange from './dateRange.js';
import dnsDomainIs from './dnsDomainIs.js';
import dnsDomainLevels from './dnsDomainLevels.js';
import dnsResolve from './dnsResolve.js';
import isInNet from './isInNet.js';
import isPlainHostName from './isPlainHostName.js';
import isResolvable from './isResolvable.js';
import localHostOrDomainIs from './localHostOrDomainIs.js';
import myIpAddress from './myIpAddress.js';
import shExpMatch from './shExpMatch.js';
import timeRange from './timeRange.js';
import weekdayRange from './weekdayRange.js';
/**
 * Returns an asynchronous `FindProxyForURL()` function
 * from the given JS string (from a PAC file).
 */
export function createPacResolver(qjs, _str, _opts = {}) {
    const str = Buffer.isBuffer(_str) ? _str.toString('utf8') : _str;
    // The sandbox to use for the `vm` context.
    const context = {
        ...sandbox,
        ..._opts.sandbox,
    };
    // Construct the array of async function names to add `await` calls to.
    const names = Object.keys(context).filter((k) => isAsyncFunction(context[k]));
    const opts = {
        filename: 'proxy.pac',
        names,
        ..._opts,
        sandbox: context,
    };
    // Compile the JS `FindProxyForURL()` function into an async function.
    const resolver = compile(qjs, str, 'FindProxyForURL', opts);
    function FindProxyForURL(url, _host) {
        const urlObj = typeof url === 'string' ? new URL(url) : url;
        const host = _host || urlObj.hostname;
        if (!host) {
            throw new TypeError('Could not determine `host`');
        }
        return resolver(urlObj.href, host);
    }
    Object.defineProperty(FindProxyForURL, 'toString', {
        value: () => resolver.toString(),
        enumerable: false,
    });
    return FindProxyForURL;
}
export const sandbox = Object.freeze({
    alert: (message = '') => console.log('%s', message),
    dateRange,
    dnsDomainIs,
    dnsDomainLevels,
    dnsResolve,
    isInNet,
    isPlainHostName,
    isResolvable,
    localHostOrDomainIs,
    myIpAddress,
    shExpMatch,
    timeRange,
    weekdayRange,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isAsyncFunction(v) {
    if (typeof v !== 'function')
        return false;
    // Native `AsyncFunction`
    if (v.constructor.name === 'AsyncFunction')
        return true;
    // TypeScript compiled
    if (String(v).indexOf('__awaiter(') !== -1)
        return true;
    // Legacy behavior - set `async` property on the function
    return Boolean(v.async);
}
//# sourceMappingURL=index.js.map