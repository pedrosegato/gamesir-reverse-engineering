import koffi from "koffi";

export type Pointer = bigint;

const HANDLE = koffi.pointer("HANDLE", koffi.opaque());
for (const name of ["HWND", "HICON", "HMENU", "HINSTANCE", "HKEY"]) koffi.alias(name, HANDLE);

const POINT = koffi.struct("POINT", { x: "int32_t", y: "int32_t" });

koffi.struct("MSG", {
  hwnd: "HWND",
  message: "uint32_t",
  wParam: "uintptr_t",
  lParam: "intptr_t",
  time: "uint32_t",
  pt: POINT,
  lPrivate: "uint32_t",
});

koffi.proto("intptr_t __stdcall WNDPROC(HWND hwnd, uint32_t message, uintptr_t wParam, intptr_t lParam)");

const WNDCLASSEXW = koffi.struct("WNDCLASSEXW", {
  cbSize: "uint32_t",
  style: "uint32_t",
  lpfnWndProc: "WNDPROC *",
  cbClsExtra: "int32_t",
  cbWndExtra: "int32_t",
  hInstance: "HINSTANCE",
  hIcon: "HICON",
  hCursor: "HANDLE",
  hbrBackground: "HANDLE",
  lpszMenuName: "const char16_t *",
  lpszClassName: "const char16_t *",
  hIconSm: "HICON",
});

const GUID = koffi.struct("GUID", {
  data1: "uint32_t",
  data2: "uint16_t",
  data3: "uint16_t",
  data4: koffi.array("uint8_t", 8),
});

const NOTIFYICONDATAW = koffi.struct("NOTIFYICONDATAW", {
  cbSize: "uint32_t",
  hWnd: "HWND",
  uID: "uint32_t",
  uFlags: "uint32_t",
  uCallbackMessage: "uint32_t",
  hIcon: "HICON",
  szTip: koffi.array("char16_t", 128),
  dwState: "uint32_t",
  dwStateMask: "uint32_t",
  szInfo: koffi.array("char16_t", 256),
  uVersion: "uint32_t",
  szInfoTitle: koffi.array("char16_t", 64),
  dwInfoFlags: "uint32_t",
  guidItem: GUID,
  hBalloonIcon: "HICON",
});

export const STRUCT_SIZES = {
  MSG: koffi.sizeof("MSG"),
  WNDCLASSEXW: WNDCLASSEXW.size,
  NOTIFYICONDATAW: NOTIFYICONDATAW.size,
};

export interface Point {
  x: number;
  y: number;
}

export interface Msg {
  hwnd: Pointer | null;
  message: number;
  wParam: number | bigint;
  lParam: number | bigint;
  time: number;
  pt: Point;
  lPrivate: number;
}

export interface WndClass {
  cbSize: number;
  style: number;
  lpfnWndProc: Pointer;
  cbClsExtra: number;
  cbWndExtra: number;
  hInstance: Pointer | null;
  hIcon: Pointer | null;
  hCursor: Pointer | null;
  hbrBackground: Pointer | null;
  lpszMenuName: string | null;
  lpszClassName: string;
  hIconSm: Pointer | null;
}

export interface NotifyIconData {
  cbSize: number;
  hWnd: Pointer;
  uID: number;
  uFlags: number;
  uCallbackMessage: number;
  hIcon: Pointer | null;
  szTip: string;
  dwState: number;
  dwStateMask: number;
  szInfo: string;
  uVersion: number;
  szInfoTitle: string;
  dwInfoFlags: number;
  guidItem: { data1: number; data2: number; data3: number; data4: number[] };
  hBalloonIcon: Pointer | null;
}

export type WndProc = (
  hwnd: Pointer,
  message: number,
  wParam: number | bigint,
  lParam: number | bigint,
) => number | bigint;

export const registerWndProc = (proc: WndProc): Pointer => koffi.register(proc, "WNDPROC *");

const user32 = koffi.load("user32.dll");
const kernel32 = koffi.load("kernel32.dll");
const shell32 = koffi.load("shell32.dll");
const advapi32 = koffi.load("advapi32.dll");

export const GetLastError: () => number = kernel32.func("uint32_t __stdcall GetLastError()");

export const GetModuleHandleW: (name: string | null) => Pointer | null = kernel32.func(
  "HINSTANCE __stdcall GetModuleHandleW(const char16_t *name)",
);

export const RegisterClassExW: (cls: WndClass) => number = user32.func(
  "uint16_t __stdcall RegisterClassExW(const WNDCLASSEXW *cls)",
);

export const CreateWindowExW: (
  exStyle: number,
  className: string,
  windowName: string,
  style: number,
  x: number,
  y: number,
  width: number,
  height: number,
  parent: Pointer | null,
  menu: Pointer | null,
  instance: Pointer | null,
  param: null,
) => Pointer | null = user32.func(
  "HWND __stdcall CreateWindowExW(uint32_t exStyle, const char16_t *className, const char16_t *windowName, uint32_t style, int x, int y, int width, int height, HWND parent, HMENU menu, HINSTANCE instance, void *param)",
);

export const DefWindowProcW: WndProc = user32.func(
  "intptr_t __stdcall DefWindowProcW(HWND hwnd, uint32_t message, uintptr_t wParam, intptr_t lParam)",
);

export const PeekMessageW: (
  msg: Partial<Msg>,
  hwnd: Pointer | null,
  min: number,
  max: number,
  remove: number,
) => number = user32.func(
  "int __stdcall PeekMessageW(_Out_ MSG *msg, HWND hwnd, uint32_t min, uint32_t max, uint32_t remove)",
);

export const TranslateMessage: (msg: Partial<Msg>) => number = user32.func(
  "int __stdcall TranslateMessage(const MSG *msg)",
);

export const DispatchMessageW: (msg: Partial<Msg>) => number | bigint = user32.func(
  "intptr_t __stdcall DispatchMessageW(const MSG *msg)",
);

export const PostMessageW: (hwnd: Pointer, message: number, wParam: number, lParam: number) => number = user32.func(
  "int __stdcall PostMessageW(HWND hwnd, uint32_t message, uintptr_t wParam, intptr_t lParam)",
);

export const RegisterWindowMessageW: (name: string) => number = user32.func(
  "uint32_t __stdcall RegisterWindowMessageW(const char16_t *name)",
);

export const FindWindowW: (className: string, windowName: string | null) => Pointer | null = user32.func(
  "HWND __stdcall FindWindowW(const char16_t *className, const char16_t *windowName)",
);

export const CreatePopupMenu: () => Pointer | null = user32.func("HMENU __stdcall CreatePopupMenu()");

export const AppendMenuW: (menu: Pointer, flags: number, id: number, text: string | null) => number = user32.func(
  "int __stdcall AppendMenuW(HMENU menu, uint32_t flags, uintptr_t id, const char16_t *text)",
);

export const TrackPopupMenu: (
  menu: Pointer,
  flags: number,
  x: number,
  y: number,
  reserved: number,
  hwnd: Pointer,
  rect: null,
) => number = user32.func(
  "int __stdcall TrackPopupMenu(HMENU menu, uint32_t flags, int x, int y, int reserved, HWND hwnd, void *rect)",
);

export const DestroyMenu: (menu: Pointer) => number = user32.func("int __stdcall DestroyMenu(HMENU menu)");

export const GetCursorPos: (point: Partial<Point>) => number = user32.func(
  "int __stdcall GetCursorPos(_Out_ POINT *point)",
);

export const SetForegroundWindow: (hwnd: Pointer) => number = user32.func(
  "int __stdcall SetForegroundWindow(HWND hwnd)",
);

export const CreateIconFromResourceEx: (
  bits: Uint8Array,
  size: number,
  icon: number,
  version: number,
  width: number,
  height: number,
  flags: number,
) => Pointer | null = user32.func(
  "HICON __stdcall CreateIconFromResourceEx(const uint8_t *bits, uint32_t size, int icon, uint32_t version, int width, int height, uint32_t flags)",
);

export const Shell_NotifyIconW: (message: number, data: NotifyIconData) => number = shell32.func(
  "int __stdcall Shell_NotifyIconW(uint32_t message, NOTIFYICONDATAW *data)",
);

export const RegGetValueW: (
  key: Pointer,
  subKey: string,
  value: string,
  flags: number,
  type: null,
  data: null,
  size: null,
) => number = advapi32.func(
  "int32_t __stdcall RegGetValueW(HKEY key, const char16_t *subKey, const char16_t *value, uint32_t flags, void *type, void *data, void *size)",
);

export const RegSetKeyValueW: (
  key: Pointer,
  subKey: string,
  valueName: string,
  type: number,
  data: string,
  size: number,
) => number = advapi32.func(
  "int32_t __stdcall RegSetKeyValueW(HKEY key, const char16_t *subKey, const char16_t *valueName, uint32_t type, const char16_t *data, uint32_t size)",
);

export const RegDeleteKeyValueW: (key: Pointer, subKey: string, valueName: string) => number = advapi32.func(
  "int32_t __stdcall RegDeleteKeyValueW(HKEY key, const char16_t *subKey, const char16_t *valueName)",
);

/** `(HKEY)(LONG)0x80000001`: the cast to LONG sign-extends on 64-bit. */
export const HKEY_CURRENT_USER: Pointer = 0xffffffff80000001n;

export const ERROR_SUCCESS = 0;
export const ERROR_FILE_NOT_FOUND = 2;
export const REG_SZ = 1;
export const RRF_RT_REG_SZ = 0x2;

export const WM_NULL = 0x0000;
export const WM_LBUTTONUP = 0x0202;
export const WM_RBUTTONUP = 0x0205;
export const WM_APP = 0x8000;
export const PM_REMOVE = 0x1;

export const NIM_ADD = 0x0;
export const NIM_MODIFY = 0x1;
export const NIM_DELETE = 0x2;
export const NIF_MESSAGE = 0x1;
export const NIF_ICON = 0x2;
export const NIF_TIP = 0x4;

export const MF_STRING = 0x0;
export const MF_GRAYED = 0x1;
export const MF_CHECKED = 0x8;
export const MF_SEPARATOR = 0x800;
export const TPM_RIGHTBUTTON = 0x2;
export const TPM_NONOTIFY = 0x80;
export const TPM_RETURNCMD = 0x100;

export const ICON_RESOURCE_VERSION = 0x00030000;
