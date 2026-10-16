import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { isSea } from "node:sea";
import { toRgb } from "gamesir-hid";
import { findControllers } from "gamesir-hid/node";
import { isAutostartEnabled, setAutostart } from "./autostart.js";
import { CALLBACK_MESSAGE, Tray } from "./tray.js";
import { FindWindowW, STRUCT_SIZES, WM_RBUTTONUP } from "./win32.js";

const WINDOW_NAME = "Cyclone2BatterySelfTest";
const EXPECTED_SIZES = { MSG: 48, WNDCLASSEXW: 80, NOTIFYICONDATAW: 976, DEV_BROADCAST_DEVICEINTERFACE_W: 32 };
const MENU_TIMEOUT_MS = 30_000;

/** Clicks the icon and picks the last menu item with ↑ + Enter; Esc closes the menu if nothing was picked. */
const CLICK_LAST_MENU_ITEM = `
Add-Type -Namespace SelfTest -Name User32 -MemberDefinition @'
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindowW(string cls, string name);
[DllImport("user32.dll")] public static extern bool PostMessageW(IntPtr hwnd, uint msg, UIntPtr wParam, IntPtr lParam);
'@
function Wait-Window($class) {
  for ($i = 0; $i -lt 50; $i++) {
    $hwnd = [SelfTest.User32]::FindWindowW($class, [NullString]::Value)
    if ($hwnd -ne [IntPtr]::Zero) { return $hwnd }
    Start-Sleep -Milliseconds 200
  }
  exit 1
}
function Send-Key($hwnd, $key) {
  [SelfTest.User32]::PostMessageW($hwnd, 0x100, [UIntPtr]::new($key), [IntPtr]::Zero) | Out-Null
  [SelfTest.User32]::PostMessageW($hwnd, 0x101, [UIntPtr]::new($key), [IntPtr]::Zero) | Out-Null
}
$app = Wait-Window '${WINDOW_NAME}'
"app $app"
"posted " + [SelfTest.User32]::PostMessageW($app, ${CALLBACK_MESSAGE}, [UIntPtr]::Zero, [IntPtr]${WM_RBUTTONUP})
$menu = Wait-Window '#32768'
"menu $menu"
Send-Key $menu 0x26
Send-Key $menu 0x0D
Start-Sleep -Seconds 3
if ([SelfTest.User32]::FindWindowW('#32768', [NullString]::Value) -ne [IntPtr]::Zero) { "escape"; Send-Key $menu 0x1B }
`;

interface MenuResult {
  readonly chosen: boolean;
  readonly opened: number;
  readonly helper: string;
  readonly added: boolean;
  readonly watchingDevices: boolean;
  readonly trayErrors: readonly string[];
}

function chooseFromMenu(): Promise<MenuResult> {
  return new Promise((resolve) => {
    let opened = 0;
    let helper = "";
    const trayErrors: string[] = [];
    const finish = (chosen: boolean) => {
      clearTimeout(timer);
      resolve({
        chosen,
        opened,
        helper: helper.trim(),
        added: tray.added,
        watchingDevices: tray.watchingDevices,
        trayErrors,
      });
    };
    const timer = setTimeout(() => finish(false), MENU_TIMEOUT_MS);
    const tray = new Tray({
      name: WINDOW_NAME,
      tooltip: "self-test",
      icon: toRgb("#808080"),
      menu: () => {
        opened++;
        return [{ label: "status" }, "separator", { label: "last", onClick: () => finish(true) }];
      },
      onError: (operation, code) => trayErrors.push(`${operation} ${code}`),
      onDeviceChange: () => {},
    });
    tray.update("self-test 2", toRgb("#00ff00"));
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", CLICK_LAST_MENU_ITEM], {
      windowsHide: true,
    });
    const collect = (data: Buffer) => {
      helper += data.toString();
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("exit", (code) => collect(Buffer.from(`\nexit ${code}`)));
  });
}

function autostartRoundTrip(): boolean {
  const before = isAutostartEnabled();
  const on = setAutostart(true, process.execPath) && isAutostartEnabled();
  const off = setAutostart(false, process.execPath) && !isAutostartEnabled();
  setAutostart(before, process.execPath);
  return on && off;
}

/** CI check of the executable: loads the native modules and exercises the Windows API, menu included. */
export async function selfTest(output: string): Promise<boolean> {
  const sizesMatch = Object.entries(EXPECTED_SIZES).every(
    ([name, size]) => STRUCT_SIZES[name as keyof typeof STRUCT_SIZES] === size,
  );
  const taskbar = FindWindowW("Shell_TrayWnd", null) !== null;
  const report: Record<string, unknown> = { sea: isSea(), sizes: STRUCT_SIZES, sizesMatch, taskbar };
  try {
    report.menu = await chooseFromMenu();
    report.controllers = (await findControllers()).length;
    report.autostart = autostartRoundTrip();
  } catch (error) {
    report.error = (error as Error).stack ?? String(error);
  }
  const menu = report.menu as MenuResult | undefined;
  report.ok =
    sizesMatch &&
    menu?.chosen === true &&
    menu.watchingDevices &&
    (menu.added || !taskbar) &&
    report.autostart === true;
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  return report.ok === true;
}
