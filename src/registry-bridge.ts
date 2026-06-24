// Re-exports registerRenderer from the host app.
// The esbuild alias `momai:registry` resolves this import to
//   apps/momai/src/renderer/src/components/chat/SkillResponseRegistry.ts
// at build time. For pre-built bundles (ZIP installs), the banner
// installed by build.mjs injects globalThis.__skillRendererRegistry,
// which is set by the host before importing the bundle.
import { registerRenderer } from 'momai:registry'

export { registerRenderer }
