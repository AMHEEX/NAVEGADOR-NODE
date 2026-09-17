import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import LRUCache from 'lru-cache';
import { Agent } from 'agent-base';
import createDebug from 'debug';
import { getProxyForUrl as envGetProxyForUrl } from 'proxy-from-env';
const debug = createDebug('proxy-agent');
/**
 * Shorthands for built-in supported types.
 * Lazily loaded since some of these imports can be quite expensive
 * (in particular, pac-proxy-agent).
 */
const wellKnownAgents = {
    http: async () => (await import('http-proxy-agent')).HttpProxyAgent,
    https: async () => (await import('https-proxy-agent')).HttpsProxyAgent,
    socks: async () => (await import('socks-proxy-agent')).SocksProxyAgent,
    pac: async () => (await import('pac-proxy-agent')).PacProxyAgent,
};
/**
 * Supported proxy types.
 */
export const proxies = {
    http: [wellKnownAgents.http, wellKnownAgents.https],
    https: [wellKnownAgents.http, wellKnownAgents.https],
    socks: [wellKnownAgents.socks, wellKnownAgents.socks],
    socks4: [wellKnownAgents.socks, wellKnownAgents.socks],
    socks4a: [wellKnownAgents.socks, wellKnownAgents.socks],
    socks5: [wellKnownAgents.socks, wellKnownAgents.socks],
    socks5h: [wellKnownAgents.socks, wellKnownAgents.socks],
    'pac+data': [wellKnownAgents.pac, wellKnownAgents.pac],
    'pac+file': [wellKnownAgents.pac, wellKnownAgents.pac],
    'pac+ftp': [wellKnownAgents.pac, wellKnownAgents.pac],
    'pac+http': [wellKnownAgents.pac, wellKnownAgents.pac],
    'pac+https': [wellKnownAgents.pac, wellKnownAgents.pac],
};
function isValidProtocol(v) {
    return Object.keys(proxies).includes(v);
}
/**
 * Uses the appropriate `Agent` subclass based off of the "proxy"
 * environment variables that are currently set.
 *
 * An LRU cache is used, to prevent unnecessary creation of proxy
 * `http.Agent` instances.
 */
export class ProxyAgent extends Agent {
    constructor(opts) {
        super(opts);
        /**
         * Cache for `Agent` instances.
         */
        this.cache = new LRUCache({
            max: 20,
            dispose: (agent) => agent.destroy(),
        });
        debug('Creating new ProxyAgent instance: %o', opts);
        this.connectOpts = opts;
        this.httpAgent = opts?.httpAgent || new http.Agent(opts);
        this.httpsAgent =
            opts?.httpsAgent || new https.Agent(opts);
        this.getProxyForUrl = opts?.getProxyForUrl || envGetProxyForUrl;
    }
    async connect(req, opts) {
        const { secureEndpoint } = opts;
        const isWebSocket = req.getHeader('upgrade') === 'websocket';
        const protocol = secureEndpoint
            ? isWebSocket
                ? 'wss:'
                : 'https:'
            : isWebSocket
                ? 'ws:'
                : 'http:';
        const host = req.getHeader('host');
        const url = new URL(req.path, `${protocol}//${host}`).href;
        const proxy = await this.getProxyForUrl(url, req);
        if (!proxy) {
            debug('Proxy not enabled for URL: %o', url);
            return secureEndpoint ? this.httpsAgent : this.httpAgent;
        }
        debug('Request URL: %o', url);
        debug('Proxy URL: %o', proxy);
        // attempt to get a cached `http.Agent` instance first
        const cacheKey = `${protocol}+${proxy}`;
        let agent = this.cache.get(cacheKey);
        if (!agent) {
            const proxyUrl = new URL(proxy);
            const proxyProto = proxyUrl.protocol.replace(':', '');
            if (!isValidProtocol(proxyProto)) {
                throw new Error(`Unsupported protocol for proxy URL: ${proxy}`);
            }
            const ctor = await proxies[proxyProto][secureEndpoint || isWebSocket ? 1 : 0]();
            agent = new ctor(proxy, this.connectOpts);
            this.cache.set(cacheKey, agent);
        }
        else {
            debug('Cache hit for proxy URL: %o', proxy);
        }
        return agent;
    }
    destroy() {
        for (const agent of this.cache.values()) {
            agent.destroy();
        }
        super.destroy();
    }
}
//# sourceMappingURL=index.js.map