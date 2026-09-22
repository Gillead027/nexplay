import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Server, ServerLayout } from '@nexplay/shared';
import { api } from './api';
import { onRealtimeEvent } from './realtime';
import { arrangeRail, type RailItem } from './serverFolders';

const SAVE_DELAY_MS = 400;

// A organização da lista de servidores (pastas) desta pessoa: lida do servidor, atualizada na hora na tela ao mexer e gravada
// logo em seguida (várias mexidas seguidas viram uma gravação só). Outra aba ou aparelho que reorganize chega por tempo real.
export function useServerLayout(servers: readonly Server[]) {
  const [layout, setLayout] = useState<ServerLayout>({ items: [] });
  const saveTimer = useRef<number | null>(null);
  const pending = useRef<ServerLayout | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getServerLayout()
      .then(({ layout: loaded }) => {
        if (active) setLayout(loaded);
      })
      .catch(() => undefined);
    const unsubscribe = onRealtimeEvent((event) => {
      // O eco da nossa própria gravação não deve desfazer uma mexida que ainda está esperando para ser gravada.
      if (event.type === 'SERVER_LAYOUT_UPDATE' && !pending.current) setLayout(event.layout);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const flush = useCallback(() => {
    const next = pending.current;
    pending.current = null;
    saveTimer.current = null;
    if (next) void api.saveServerLayout(next).catch(() => undefined);
  }, []);

  const update = useCallback(
    (next: ServerLayout) => {
      setLayout(next);
      pending.current = next;
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(flush, SAVE_DELAY_MS);
    },
    [flush],
  );

  // Ao sair da tela, o que ainda estava esperando para ser gravado é gravado.
  useEffect(() => () => flush(), [flush]);

  const serverIds = useMemo(() => servers.map((server) => server.id), [servers]);
  const rail: RailItem[] = useMemo(() => arrangeRail(servers, layout), [servers, layout]);
  return { layout, rail, serverIds, update };
}
