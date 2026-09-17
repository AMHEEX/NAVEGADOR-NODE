import { lookup } from 'dns';
export function dnsLookup(host, opts) {
    return new Promise((resolve, reject) => {
        lookup(host, opts, (err, res) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(res);
            }
        });
    });
}
export function isGMT(v) {
    return v === 'GMT';
}
//# sourceMappingURL=util.js.map