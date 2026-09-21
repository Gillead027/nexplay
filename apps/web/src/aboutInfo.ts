export interface BuildInfo {
  commit: string;
  builtAt: string | null;
}

// O app desktop se identifica no user agent como "NexPlay/<versão>", logo antes de "Chrome/".
// Navegadores comuns não têm um token "nome/x.y.z" nessa posição (vem "(KHTML, like Gecko)").
export function parseDesktopVersion(userAgent: string): string | null {
  const match = /\s([^\s/]+)\/(\d+\.\d+\.\d+(?:[-+.][\w.]+)?)\sChrome\//.exec(userAgent);
  return match?.[2] ?? null;
}

export function parseEngineVersion(userAgent: string): string | null {
  return /\bChrome\/(\d+)/.exec(userAgent)?.[1] ?? null;
}

export function describeApp(desktop: boolean, desktopVersion: string | null): string {
  if (!desktop) return 'Navegador (sem o aplicativo instalado)';
  return desktopVersion ? `Aplicativo para Windows ${desktopVersion}` : 'Aplicativo para Windows (versão não identificada)';
}

export function describeBuild(build: BuildInfo, formatDate: (iso: string) => string): string {
  if (build.commit === 'desenvolvimento') return 'desenvolvimento (não é uma versão publicada)';
  return build.builtAt ? `${build.commit}, gerada em ${formatDate(build.builtAt)}` : build.commit;
}

// Texto que a pessoa cola ao pedir ajuda: diz exatamente o que ela está rodando.
export function versionSummary({
  desktop,
  desktopVersion,
  build,
  engineVersion,
}: {
  desktop: boolean;
  desktopVersion: string | null;
  build: BuildInfo;
  engineVersion: string | null;
}): string {
  const parts = [`NexPlay — ${describeApp(desktop, desktopVersion)}`, `web ${build.commit}${build.builtAt ? ` (${build.builtAt})` : ''}`];
  if (engineVersion) parts.push(`Chromium ${engineVersion}`);
  return parts.join(' · ');
}
