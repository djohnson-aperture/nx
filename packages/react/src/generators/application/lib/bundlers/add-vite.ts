import {
  type Tree,
  ensurePackage,
  joinPathFragments,
  updateJson,
} from '@nx/devkit';
import { coerce, major } from 'semver';
import { nxVersion } from '../../../../utils/versions';
import { NormalizedSchema, Schema } from '../../schema';

// Vitest 4.x bundles vite as a regular dependency, allowing pnpm to resolve
// a different major (e.g. vite 8) alongside the workspace's vite 7.
// Vitest 3.2.x declares vite as a peer dep only, so it shares the workspace
// version. Use this for React Router projects until React Router supports Vite 8.
const vitestV3Version = '^3.2.0';

export async function setupViteConfiguration(
  tree: Tree,
  options: NormalizedSchema<Schema>,
  tasks: any[]
) {
  const { createOrEditViteConfig, viteConfigurationGenerator } = ensurePackage<
    typeof import('@nx/vite')
  >('@nx/vite', nxVersion);
  // We recommend users use `import.meta.env.MODE` and other variables in their code to differentiate between production and development.
  // See: https://vite.dev/guide/env-and-mode.html
  if (
    tree.exists(joinPathFragments(options.appProjectRoot, 'src/environments'))
  ) {
    tree.delete(joinPathFragments(options.appProjectRoot, 'src/environments'));
  }

  const reactRouterFrameworkConfig = {
    imports: [`import { reactRouter } from '@react-router/dev/vite'`],
    plugins: ['!process.env.VITEST && reactRouter()'],
  };

  const baseReactConfig = {
    imports: [
      options.compiler === 'swc'
        ? `import react from '@vitejs/plugin-react-swc'`
        : `import react from '@vitejs/plugin-react'`,
    ],
    plugins: ['react()'],
  };

  const viteTask = await viteConfigurationGenerator(tree, {
    uiFramework: 'react',
    project: options.projectName,
    newProject: true,
    includeVitest: options.unitTestRunner === 'vitest',
    inSourceTests: options.inSourceTests,
    compiler: options.compiler,
    skipFormat: true,
    addPlugin: options.addPlugin,
    projectType: 'application',
    port: options.port,
    // React Router does not yet support Vite 8, so force Vite 7.
    ...(options.useReactRouter ? { useViteV7: true } : {}),
  });
  tasks.push(viteTask);

  if (options.useReactRouter) {
    // React Router uses @react-router/dev/vite instead of @vitejs/plugin-react
    // (same as `npx create-react-router@latest`), so remove the react plugin.
    // Also downgrade vitest to 3.x which declares vite as a peer dep instead
    // of a regular dep, preventing pnpm from resolving a second vite major.
    updateJson(tree, 'package.json', (json) => {
      delete json.devDependencies?.['@vitejs/plugin-react'];
      delete json.devDependencies?.['@vitejs/plugin-react-swc'];
      if (json.devDependencies?.['vitest']) {
        const vitestMajor = major(coerce(json.devDependencies['vitest']));
        if (vitestMajor >= 4) {
          json.devDependencies['vitest'] = vitestV3Version;
        }
      }
      if (json.devDependencies?.['@vitest/ui']) {
        json.devDependencies['@vitest/ui'] = vitestV3Version;
      }
      return json;
    });
  }
  createOrEditViteConfig(
    tree,
    {
      project: options.projectName,
      includeLib: false,
      includeVitest: options.unitTestRunner === 'vitest',
      inSourceTests: options.inSourceTests,
      rollupOptionsExternal: ["'react'", "'react-dom'", "'react/jsx-runtime'"],
      port: options.port,
      previewPort: options.port,
      useEsmExtension: true,
      ...(options.useReactRouter
        ? reactRouterFrameworkConfig
        : baseReactConfig),
    },
    false
  );
}

export async function setupVitestConfiguration(
  tree: Tree,
  options: NormalizedSchema<Schema>,
  tasks: any[]
) {
  const { createOrEditViteConfig } = ensurePackage<typeof import('@nx/vite')>(
    '@nx/vite',
    nxVersion
  );
  ensurePackage('@nx/vitest', nxVersion);
  const { configurationGenerator } = await import('@nx/vitest/generators');

  const vitestTask = await configurationGenerator(tree, {
    uiFramework: 'react',
    coverageProvider: 'v8',
    project: options.projectName,
    inSourceTests: options.inSourceTests,
    skipFormat: true,
    addPlugin: options.addPlugin,
  });
  tasks.push(vitestTask);
  createOrEditViteConfig(
    tree,
    {
      project: options.projectName,
      includeLib: false,
      includeVitest: true,
      inSourceTests: options.inSourceTests,
      rollupOptionsExternal: ["'react'", "'react-dom'", "'react/jsx-runtime'"],
      imports: [
        options.compiler === 'swc'
          ? `import react from '@vitejs/plugin-react-swc'`
          : `import react from '@vitejs/plugin-react'`,
      ],
      plugins: ['react()'],
      useEsmExtension: true,
    },
    true
  );
  if (options.bundler === 'rsbuild') {
    tree.rename(
      joinPathFragments(options.appProjectRoot, 'vite.config.mts'),
      joinPathFragments(options.appProjectRoot, 'vitest.config.mts')
    );
  }
}
