import { patchTsPluginToSkipExternalDeclarations } from './with-nx';

describe('patchTsPluginToSkipExternalDeclarations', () => {
  it('should drop declaration assets with paths starting with ".."', () => {
    const emitted: Array<Record<string, unknown>> = [];
    const mockPlugin = {
      generateBundle: function () {
        // Simulate @rollup/plugin-typescript emitting declarations
        (this as any).emitFile({
          type: 'asset',
          fileName: 'src/index.d.ts',
          source: 'export declare const x: number;',
        });
        (this as any).emitFile({
          type: 'asset',
          fileName: '../../util-lib/src/index.d.ts',
          source: 'export declare function greet(): string;',
        });
        (this as any).emitFile({
          type: 'asset',
          fileName: '../other/types.d.ts',
          source: 'export type Foo = string;',
        });
      },
    };

    const patched = patchTsPluginToSkipExternalDeclarations(mockPlugin);

    // Simulate rollup context with emitFile
    const ctx = {
      emitFile: (emission: Record<string, unknown>) => {
        emitted.push(emission);
      },
    };

    patched.generateBundle.call(ctx);

    // Only the in-project declaration should be emitted
    expect(emitted).toHaveLength(1);
    expect(emitted[0].fileName).toBe('src/index.d.ts');
  });

  it('should pass through non-asset emissions unchanged', () => {
    const emitted: Array<Record<string, unknown>> = [];
    const mockPlugin = {
      generateBundle: function () {
        (this as any).emitFile({
          type: 'chunk',
          fileName: '../some-chunk.js',
        });
      },
    };

    const patched = patchTsPluginToSkipExternalDeclarations(mockPlugin);
    const ctx = {
      emitFile: (emission: Record<string, unknown>) => {
        emitted.push(emission);
      },
    };

    patched.generateBundle.call(ctx);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].fileName).toBe('../some-chunk.js');
  });

  it('should return plugin as-is if generateBundle is missing', () => {
    const plugin = { name: 'test' };
    const result = patchTsPluginToSkipExternalDeclarations(plugin as any);
    expect(result).toBe(plugin);
  });
});
