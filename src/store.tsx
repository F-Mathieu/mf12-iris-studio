import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getSettings, setSetting } from './services/base';

export interface ClientModeState { sessionId: string; registrationId?: string | null; familyId?: string | null; orderId?: string | null }
interface AppState {
  settings: Record<string, string>;
  reloadSettings: () => Promise<void>;
  client: ClientModeState | null;
  enterClient: (s: ClientModeState) => Promise<void>;
  updateClient: (s: Partial<ClientModeState>) => Promise<void>;
  exitClient: (pin: string) => Promise<boolean>;
  /** Leaves the presentation (PIN already checked) and opens an admin route. */
  leaveClientTo: (path: string) => Promise<void>;
}
const Ctx = createContext<AppState>(null as unknown as AppState);

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [client, setClient] = useState<ClientModeState | null>(null);
  const reloadSettings = useCallback(async () => {
    const s = await getSettings();
    setSettings(s);
    setClient(s.client_mode ? JSON.parse(s.client_mode) : null);
  }, []);
  useEffect(() => { reloadSettings(); }, [reloadSettings]);
  // Client mode is persisted: a reload/restart stays in client mode until the PIN is entered.
  const enterClient = async (c: ClientModeState) => { await setSetting('client_mode', JSON.stringify(c)); setClient(c); };
  const updateClient = async (c: Partial<ClientModeState>) => {
    const n = { ...(client as ClientModeState), ...c };
    await setSetting('client_mode', JSON.stringify(n)); setClient(n);
  };
  const exitClient = async (pin: string) => {
    if (pin !== (settings.client_pin || '1212')) return false;
    await setSetting('client_mode', ''); setClient(null); return true;
  };
  const leaveClientTo = async (path: string) => {
    await setSetting('client_mode', '');
    window.location.hash = `#${path}`; // read by the admin HashRouter when it mounts
    setClient(null);
  };
  return <Ctx.Provider value={{ settings, reloadSettings, client, enterClient, updateClient, exitClient, leaveClientTo }}>{children}</Ctx.Provider>;
}
export const useApp = () => useContext(Ctx);
