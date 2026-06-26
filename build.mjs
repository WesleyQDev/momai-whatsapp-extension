import { build, context } from 'esbuild'
import { readFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'))

const entries = []
if (manifest.ui?.page && existsSync(path.join(__dirname, 'src/page.tsx')))
  entries.push({ in: 'src/page.tsx', out: 'page' })
if (manifest.ui?.panel && existsSync(path.join(__dirname, 'src/panel.tsx')))
  entries.push({ in: 'src/panel.tsx', out: 'panel' })

if (entries.length === 0) {
  console.log('[skill:build] No UI entries in manifest. Nothing to do.')
  process.exit(0)
}

mkdirSync(path.join(__dirname, 'dist'), { recursive: true })

const makeReactGlobalPlugin = {
  name: 'make-react-global',
  setup(build) {
    build.onResolve({ filter: /^react$/ }, (args) => {
      return { path: args.path, namespace: 'react-global' }
    })
    build.onLoad({ filter: /^react$/, namespace: 'react-global' }, () => {
      return {
        contents: `module.exports = window.React;`,
        loader: 'js'
      }
    })

    build.onResolve({ filter: /^react-dom$/ }, (args) => {
      return { path: args.path, namespace: 'react-dom-global' }
    })
    build.onLoad({ filter: /^react-dom$/, namespace: 'react-dom-global' }, () => {
      return {
        contents: `module.exports = window.ReactDOM;`,
        loader: 'js'
      }
    })

    build.onResolve({ filter: /^react\/jsx-runtime$/ }, (args) => {
      return { path: args.path, namespace: 'react-jsx-runtime-global' }
    })
    build.onLoad({ filter: /^react\/jsx-runtime$/, namespace: 'react-jsx-runtime-global' }, () => {
      return {
        contents: `module.exports = window.JSXRuntime;`,
        loader: 'js'
      }
    })
  }
}

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: entries.map((e) => ({ in: e.in, out: e.out })),
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  jsxImportSource: 'react',
  target: 'es2022',
  platform: 'browser',
  minify: process.env.NODE_ENV === 'production',
  sourcemap: true,
  outdir: 'dist',
  logLevel: 'info',
  plugins: [makeReactGlobalPlugin],
  alias: {
    'momai:registry': path.resolve(
      __dirname,
      '../../../../src/renderer/src/components/chat/SkillResponseRegistry.ts'
    ),
    'momai:events': path.resolve(
      __dirname,
      '../../../../src/renderer/src/hooks/useExtensionEvents.ts'
    ),
    'momai:api': path.resolve(__dirname, '../../../../src/renderer/src/services/api.ts'),
    'momai:constants': path.resolve(__dirname, '../../../../src/renderer/src/constants.ts'),
    'momai:text': path.resolve(__dirname, '../../../../src/renderer/src/utils/text.ts'),
    'momai:tts-service': path.resolve(
      __dirname,
      '../../../../src/renderer/src/services/ttsService.ts'
    ),
    'momai:image-viewer': path.resolve(
      __dirname,
      '../../../../src/renderer/src/components/ImageViewer.tsx'
    )
  },
  banner: {
    js: `;(function(){if(typeof window!=='undefined'&&!window.__skillRendererRegistry){window.__skillRendererRegistry={registerRenderer:function(){}};}})();`
  }
}

if (process.argv.includes('--watch')) {
  const ctx = await context(options)
  await ctx.watch()
  console.log('[skill:build] Watching for changes...')
} else {
  await build(options)
  console.log('[skill:build] Built →', entries.map((e) => e.out + '.js').join(', '))
}
