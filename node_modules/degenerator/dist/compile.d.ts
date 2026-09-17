import type { Context } from 'vm';
import type { QuickJS } from 'quickjs-wasi';
import type { DegeneratorNames } from './degenerator.js';
export interface CompileOptions {
    names?: DegeneratorNames;
    filename?: string;
    sandbox?: Context;
}
export declare function compile<R = unknown, A extends unknown[] = []>(vm: QuickJS, code: string, returnName: string, options?: CompileOptions): (...args: A) => Promise<R>;
//# sourceMappingURL=compile.d.ts.map