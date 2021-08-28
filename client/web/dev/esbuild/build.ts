import * as fs from 'fs'
import * as path from 'path'

import * as esbuild from 'esbuild'

import { manifestPlugin } from './manifestPlugin'
import { packageResolutionPlugin } from './packageResolutionPlugin'
import { sassPlugin } from './sassPlugin'
import { workerPlugin } from './workerPlugin'

const rootPath = path.resolve(__dirname, '..', '..', '..', '..')
export const uiAssetsPath = path.join(rootPath, 'ui', 'assets')
const isEnterpriseBuild = process.env.ENTERPRISE && Boolean(JSON.parse(process.env.ENTERPRISE))
const enterpriseDirectory = path.resolve(__dirname, '..', '..', 'src', 'enterprise')

export const esbuildOutDirectory = path.join(uiAssetsPath, 'esbuild')

// TODO(sqs): look into speeding this up by ignoring node_modules/monaco-editor/... entrypoints
export const BUILD_OPTIONS: esbuild.BuildOptions = {
    entryPoints: {
        // Enterprise vs. OSS builds use different entrypoints. The enterprise entrypoint imports a
        // strict superset of the OSS entrypoint.
        app: isEnterpriseBuild
            ? path.join(enterpriseDirectory, 'main.tsx')
            : path.join(__dirname, '..', '..', 'src', 'main.tsx'),
    },
    bundle: true,
    format: 'esm',
    logLevel: 'error',
    splitting: true,
    chunkNames: 'chunk-[name]-[hash]',
    plugins: [sassPlugin, workerPlugin, manifestPlugin, packageResolutionPlugin],
    define: {
        'process.env.NODE_ENV': '"development"',
        'process.env.PERCY_ON': JSON.stringify(process.env.PERCY_ON),
        'process.env.SOURCEGRAPH_API_URL': JSON.stringify(process.env.SOURCEGRAPH_API_URL),
    },
    loader: {
        '.yaml': 'text',
        '.ttf': 'file',
        '.png': 'file',
    },
    target: 'es2020',
    sourcemap: true,
    incremental: true,
}

export const buildMonaco = async (): Promise<void> => {
    await esbuild.build({
        entryPoints: {
            'scripts/editor.worker.bundle': 'monaco-editor/esm/vs/editor/editor.worker.js',
            'scripts/json.worker.bundle': 'monaco-editor/esm/vs/language/json/json.worker.js',
        },
        format: 'iife',
        target: 'es2020',
        bundle: true,
        outdir: esbuildOutDirectory,
    })
}

export const build = async (): Promise<void> => {
    const METAFILE = true // TODO(sqs): remove metafile
    const result = await esbuild.build({
        ...BUILD_OPTIONS,
        outdir: esbuildOutDirectory,
        incremental: false,
        metafile: METAFILE,
    })
    if (METAFILE) {
        await fs.promises.writeFile(
            path.join(esbuildOutDirectory, 'meta.json'),
            JSON.stringify(result.metafile, null, 2)
        )
    }
    if (process.env.TODO) {
        await buildMonaco()
        // TODO(sqs): always run this, i just gated it in an if-env check for perf while doing some debugging
    }
}

if (require.main === module) {
    build()
        .catch(error => console.error('Error:', error))
        .finally(() => process.exit(0))
}
