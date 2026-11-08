import * as vscode from "vscode";
import { execFile, spawn } from "child_process";

type Mode = "time" | "gnome";

const GNOME_SCHEMA = "org.gnome.desktop.interface";

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

function settings() {
  return vscode.workspace.getConfiguration("vscode_darkmode");
}

function getMode(): Mode {
  return settings().get<string>("mode") === "gnome" ? "gnome" : "time";
}

function applyTheme(isDark: boolean) {
  const target = isDark ? settings().get<string>("dark") : settings().get<string>("light");
  const workbench = vscode.workspace.getConfiguration("workbench");
  if (target && workbench.get("colorTheme") !== target) {
    workbench.update("colorTheme", target, vscode.ConfigurationTarget.Global);
  }
}

// ---------------------------------------------------------------------------
// Mode "time": same behaviour as before (day / night hours)
// ---------------------------------------------------------------------------

function isDarkByTime(): boolean | undefined {
  const day = Number(settings().get("day"));
  const night = Number(settings().get("night"));
  if (Number.isNaN(day) || Number.isNaN(night)) {
    return undefined;
  }
  const clock = new Date().getHours();
  if (clock > night || clock < day) {
    return true;
  }
  if (clock <= night && clock > day) {
    return false;
  }
  return undefined; // clock === day: keep whatever is active
}

function startTimeMode(): vscode.Disposable {
  const tick = () => {
    const dark = isDarkByTime();
    if (dark !== undefined) {
      applyTheme(dark);
    }
  };
  tick();
  // The hour only matters once in a while, no need to poll every second.
  const interval = setInterval(tick, 30 * 1000);
  return new vscode.Disposable(() => clearInterval(interval));
}

// ---------------------------------------------------------------------------
// Mode "gnome": follow org.gnome.desktop.interface (color-scheme / gtk-theme)
// This is what "Night Theme Switcher", "Auto Theme Switcher" and similar
// GNOME Shell extensions change, as well as Settings > Appearance.
// ---------------------------------------------------------------------------

function gsettingsGet(key: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("gsettings", ["get", GNOME_SCHEMA, key], (err, stdout) => {
      if (err) {
        reject(err);
      } else {
        resolve(stdout.trim().replace(/^'|'$/g, ""));
      }
    });
  });
}

async function isGnomeDark(): Promise<boolean> {
  const scheme = await gsettingsGet("color-scheme").catch(() => "default");
  if (scheme === "prefer-dark") {
    return true;
  }
  if (scheme === "prefer-light") {
    return false;
  }
  // "default": some setups only switch the GTK theme (e.g. Adwaita-dark)
  const gtkTheme = await gsettingsGet("gtk-theme").catch(() => "");
  return /dark/i.test(gtkTheme);
}

function startGnomeMode(output: vscode.OutputChannel): vscode.Disposable {
  if (process.platform !== "linux") {
    vscode.window.showWarningMessage('VSCODE DARKMODE: mode "gnome" only works on Linux. Falling back to time mode.');
    return startTimeMode();
  }

  const sync = async () => {
    try {
      const dark = await isGnomeDark();
      output.appendLine(`GNOME is ${dark ? "dark" : "light"}`);
      applyTheme(dark);
    } catch (e) {
      output.appendLine(`Could not read GNOME settings: ${e}`);
    }
  };

  sync();

  // `gsettings monitor` prints a line every time a key of the schema changes.
  const proc = spawn("gsettings", ["monitor", GNOME_SCHEMA]);
  let buffer = "";
  let debounce: NodeJS.Timeout | undefined;

  proc.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    if (lines.some((l) => /^(color-scheme|gtk-theme):/.test(l))) {
      // switcher extensions often change several keys at once
      if (debounce) {
        clearTimeout(debounce);
      }
      debounce = setTimeout(sync, 200);
    }
  });
  proc.on("error", (e) => {
    output.appendLine(`gsettings monitor failed: ${e.message}`);
    vscode.window.showWarningMessage(
      "VSCODE DARKMODE: could not run `gsettings`. Is VS Code installed as Flatpak/Snap? See the output channel for details."
    );
  });

  return new vscode.Disposable(() => {
    if (debounce) {
      clearTimeout(debounce);
    }
    proc.kill();
  });
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel("VSCODE DARKMODE");
  context.subscriptions.push(output);

  let active: vscode.Disposable | undefined;

  const stop = () => {
    if (active) {
      active.dispose();
      active = undefined;
    }
  };

  const start = () => {
    stop();
    active = getMode() === "gnome" ? startGnomeMode(output) : startTimeMode();
  };

  context.subscriptions.push(
    new vscode.Disposable(stop),
    vscode.commands.registerCommand("vscode_darkmode.stop", stop),
    vscode.commands.registerCommand("vscode_darkmode.start", start),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("vscode_darkmode") && active) {
        start();
      }
    })
  );

  start();
}

export function deactivate() {}