import { type Rgb, toHex } from "gamesir-hid";
import { ICON_SIZE, iconResource } from "./icon.js";
import * as w from "./win32.js";

export type MenuEntry =
  | "separator"
  | { readonly label: string; readonly checked?: boolean; readonly disabled?: boolean; readonly onClick?: () => void };

export interface TrayOptions {
  readonly name: string;
  readonly tooltip: string;
  readonly icon: Rgb;
  readonly menu: () => readonly MenuEntry[];
}

const ICON_ID = 1;
export const CALLBACK_MESSAGE = w.WM_APP + 1;
/** O event loop do Node não espera na fila de mensagens do Win32, então ela é esvaziada periodicamente. */
const PUMP_EVERY_MS = 100;

export class Tray {
  private readonly hwnd: w.Pointer;
  private readonly taskbarCreated: number;
  private readonly icons = new Map<string, w.Pointer>();
  private readonly msg: Partial<w.Msg> = {};
  private readonly pumpTimer: NodeJS.Timeout;
  private tooltip: string;
  private icon: w.Pointer | null;
  private menuRequested = false;
  private readdRequested = false;

  constructor(private readonly options: TrayOptions) {
    const instance = w.GetModuleHandleW(null);
    const wndProc = w.registerWndProc((hwnd, message, wParam, lParam) => this.handle(hwnd, message, wParam, lParam));
    w.RegisterClassExW({
      cbSize: w.STRUCT_SIZES.WNDCLASSEXW,
      style: 0,
      lpfnWndProc: wndProc,
      cbClsExtra: 0,
      cbWndExtra: 0,
      hInstance: instance,
      hIcon: null,
      hCursor: null,
      hbrBackground: null,
      lpszMenuName: null,
      lpszClassName: options.name,
      hIconSm: null,
    });
    const hwnd = w.CreateWindowExW(0, options.name, options.name, 0, 0, 0, 0, 0, null, null, instance, null);
    if (!hwnd) throw new Error("CreateWindowExW falhou");
    this.hwnd = hwnd;
    this.taskbarCreated = w.RegisterWindowMessageW("TaskbarCreated");
    this.tooltip = options.tooltip;
    this.icon = this.iconFor(options.icon);
    this.notify(w.NIM_ADD);
    this.pumpTimer = setInterval(() => this.pump(), PUMP_EVERY_MS);
  }

  update(tooltip: string, color: Rgb): void {
    const icon = this.iconFor(color);
    if (tooltip === this.tooltip && icon === this.icon) return;
    this.tooltip = tooltip;
    this.icon = icon;
    this.notify(w.NIM_MODIFY);
  }

  /** Só tira o ícone: a janela oculta e o callback dela ficam até o processo terminar. */
  remove(): void {
    clearInterval(this.pumpTimer);
    this.notify(w.NIM_DELETE);
  }

  /** O Explorer apaga os ícones quando reinicia; antes do login completo, o NIM_ADD inicial também falha. */
  private handle(hwnd: w.Pointer, message: number, wParam: number | bigint, lParam: number | bigint): number | bigint {
    if (message === CALLBACK_MESSAGE) {
      const event = Number(lParam) & 0xffff;
      if (event === w.WM_LBUTTONUP || event === w.WM_RBUTTONUP) this.menuRequested = true;
      return 0;
    }
    if (message === this.taskbarCreated) {
      this.readdRequested = true;
      return 0;
    }
    return w.DefWindowProcW(hwnd, message, wParam, lParam);
  }

  private pump(): void {
    while (w.PeekMessageW(this.msg, null, 0, 0, w.PM_REMOVE)) {
      w.TranslateMessage(this.msg);
      w.DispatchMessageW(this.msg);
    }
    if (this.readdRequested) {
      this.readdRequested = false;
      this.notify(w.NIM_ADD);
    }
    if (this.menuRequested) {
      this.menuRequested = false;
      this.showMenu();
    }
  }

  private showMenu(): void {
    const menu = w.CreatePopupMenu();
    if (!menu) return;
    const actions = new Map<number, () => void>();
    this.options.menu().forEach((entry, index) => {
      if (entry === "separator") {
        w.AppendMenuW(menu, w.MF_SEPARATOR, 0, null);
        return;
      }
      const id = index + 1;
      const enabled = entry.onClick && !entry.disabled;
      w.AppendMenuW(
        menu,
        w.MF_STRING | (entry.checked ? w.MF_CHECKED : 0) | (enabled ? 0 : w.MF_GRAYED),
        id,
        entry.label,
      );
      if (enabled && entry.onClick) actions.set(id, entry.onClick);
    });

    const cursor: Partial<w.Point> = {};
    w.GetCursorPos(cursor);
    w.SetForegroundWindow(this.hwnd);
    const flags = w.TPM_RETURNCMD | w.TPM_NONOTIFY | w.TPM_RIGHTBUTTON;
    const chosen = w.TrackPopupMenu(menu, flags, cursor.x ?? 0, cursor.y ?? 0, 0, this.hwnd, null);
    w.PostMessageW(this.hwnd, w.WM_NULL, 0, 0);
    w.DestroyMenu(menu);
    actions.get(chosen)?.();
  }

  private iconFor(color: Rgb): w.Pointer | null {
    const key = toHex(color);
    const cached = this.icons.get(key);
    if (cached) return cached;
    const resource = iconResource(color);
    const icon = w.CreateIconFromResourceEx(
      resource,
      resource.length,
      1,
      w.ICON_RESOURCE_VERSION,
      ICON_SIZE,
      ICON_SIZE,
      0,
    );
    if (icon) this.icons.set(key, icon);
    return icon;
  }

  private notify(message: number): void {
    w.Shell_NotifyIconW(message, {
      cbSize: w.STRUCT_SIZES.NOTIFYICONDATAW,
      hWnd: this.hwnd,
      uID: ICON_ID,
      uFlags: w.NIF_MESSAGE | w.NIF_ICON | w.NIF_TIP,
      uCallbackMessage: CALLBACK_MESSAGE,
      hIcon: this.icon,
      szTip: this.tooltip,
      dwState: 0,
      dwStateMask: 0,
      szInfo: "",
      uVersion: 0,
      szInfoTitle: "",
      dwInfoFlags: 0,
      guidItem: { data1: 0, data2: 0, data3: 0, data4: [0, 0, 0, 0, 0, 0, 0, 0] },
      hBalloonIcon: null,
    });
  }
}
