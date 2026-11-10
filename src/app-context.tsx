import { createContext, useContext } from "react";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}

export interface AppContextValue {
  admin: boolean;
  setAdmin: (admin: boolean) => void;
  name: string;
  editName: () => void;
  // 이름이 없으면 먼저 물어본다. 취소하면 null
  requireName: () => Promise<string | null>;
  toast: (message: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("AppContext가 없습니다.");
  return value;
}
