import * as w from "./win32.js";

const RUN_KEY = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const VALUE_NAME = "Cyclone2Battery";

export function isAutostartEnabled(): boolean {
  return (
    w.RegGetValueW(w.HKEY_CURRENT_USER, RUN_KEY, VALUE_NAME, w.RRF_RT_REG_SZ, null, null, null) === w.ERROR_SUCCESS
  );
}

export function setAutostart(enabled: boolean, executable: string): boolean {
  if (!enabled) {
    const result = w.RegDeleteKeyValueW(w.HKEY_CURRENT_USER, RUN_KEY, VALUE_NAME);
    return result === w.ERROR_SUCCESS || result === w.ERROR_FILE_NOT_FOUND;
  }
  const command = `"${executable}"`;
  const bytes = (command.length + 1) * 2;
  return w.RegSetKeyValueW(w.HKEY_CURRENT_USER, RUN_KEY, VALUE_NAME, w.REG_SZ, command, bytes) === w.ERROR_SUCCESS;
}
