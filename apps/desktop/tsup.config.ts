import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      main: 'src/main.ts',
      preload: 'src/preload.ts',
      'picker-preload': 'src/picker-preload.ts',
      // Entrada própria (não só um import de main.ts) de propósito: main.ts
      // precisa setar WINDOWS_MEDIA_SESSIONS_BACKEND antes desse módulo
      // carregar, e isso só é possível com um import() dinâmico apontando
      // pra um arquivo dist/ real — que só existe se isto for uma entrada
      // separada do bundler, em vez de ficar inline dentro do main.js.
      activity: 'src/activity.ts',
    },
    format: ['cjs'],
    platform: 'node',
    target: 'node22',
    outDir: 'dist',
    clean: true,
    splitting: false,
    sourcemap: false,
    // windows-media-sessions e ps-list resolvem o caminho dos próprios
    // binários (bin/win-x64/*.exe) relativo ao arquivo do módulo em tempo de
    // execução — se o tsup embutisse esse código dentro do main.js, esse
    // caminho relativo apontaria pra dentro de dist/ em vez de node_modules/,
    // e o backend nunca seria encontrado/executado (foi exatamente o bug:
    // startActivityMonitor rodava sem lançar erro síncrono, mas o processo
    // do backend nunca chegava a existir). external mantém esses pacotes
    // como require() de verdade, resolvido do node_modules real.
    external: ['electron', 'windows-media-sessions', 'ps-list'],
    // @nexplay/shared PRECISA ir embutido: os preloads rodam com sandbox:true, onde require() só aceita 'electron'.
    // Fora daqui (o padrão do tsup para dependências) o preload quebrava inteiro ao carregar e o site ficava sem
    // ponte nenhuma — sem os botões de minimizar/maximizar/fechar (bug do 0.2.19 e 0.2.20). Ver check-preloads.mjs.
    noExternal: ['electron-updater', '@nexplay/shared'],
  },
  {
    entry: { 'picker-renderer': 'src/picker-renderer.ts' },
    format: ['iife'],
    platform: 'browser',
    target: 'chrome140',
    outDir: 'renderer-dist',
    clean: true,
    splitting: false,
    minify: true,
  },
]);
