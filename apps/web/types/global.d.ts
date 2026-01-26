declare module '*.wasm?url' {
  const url: string;
  export default url;
}
declare module '*.worker.js?url' {
  const url: string;
  export default url;
}

declare module 'ssh2';
declare module 'ssh2-no-cpu-features';

type AuthBridge = {
  openExternal: (url: string) => Promise<void>;
  onCallback: (callback: (url: string) => void) => () => void;
};

interface Window {
  authBridge?: AuthBridge;
  electron?: {
    platform: string;
    isPackaged: boolean;
  };
}
