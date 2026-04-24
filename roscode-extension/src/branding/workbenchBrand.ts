import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

const MARKER_START = "<!-- roscode-brand-start -->";
const MARKER_END   = "<!-- roscode-brand-end -->";

/**
 * Injects roscode CSS & custom branding into VSCodium's workbench.html.
 * Technique used by Cursor / customize-ui extensions.
 *
 * No sudo required — /Applications/VSCodium.app is user-owned on Homebrew.
 */
export async function applyWorkbenchBranding(context: vscode.ExtensionContext): Promise<boolean> {
  const cfg = vscode.workspace.getConfiguration("roscode");
  if (!cfg.get<boolean>("applyBranding", true)) return false;

  const workbenchHtml = findWorkbenchHtml();
  if (!workbenchHtml) return false;

  const cssSrc = path.join(context.extensionPath, "themes", "workbench.css");
  if (!fs.existsSync(cssSrc)) return false;

  // Write the CSS file into the workbench's resource folder
  const cssDst = path.join(path.dirname(workbenchHtml), "roscode-brand.css");

  try {
    const newCss = fs.readFileSync(cssSrc, "utf8");
    let needsWrite = true;
    if (fs.existsSync(cssDst)) {
      const existing = fs.readFileSync(cssDst, "utf8");
      if (existing === newCss) needsWrite = false;
    }
    if (needsWrite) fs.writeFileSync(cssDst, newCss, "utf8");
  } catch (e) {
    console.error("roscode: failed to write workbench CSS", e);
    return false;
  }

  // Inject the <link> into workbench.html if not already present
  try {
    const html = fs.readFileSync(workbenchHtml, "utf8");
    if (html.includes(MARKER_START)) {
      // Already injected — check if CSS file exists, just return
      return true;
    }
    const injection = `\n\t\t${MARKER_START}\n\t\t<link rel="stylesheet" href="./roscode-brand.css">\n\t\t${MARKER_END}`;
    const patched = html.replace(
      /<link rel="stylesheet" href="\.\.\/\.\.\/\.\.\/workbench\/workbench\.desktop\.main\.css">/,
      (m) => m + injection
    );
    if (patched === html) return false; // couldn't find insertion point

    fs.writeFileSync(workbenchHtml, patched, "utf8");

    // Prompt for reload on first install
    const hasPrompted = context.globalState.get("roscode.brandingPrompted", false);
    if (!hasPrompted) {
      context.globalState.update("roscode.brandingPrompted", true);
      const choice = await vscode.window.showInformationMessage(
        "roscode studio branding installed. Reload to see changes.",
        "Reload Window"
      );
      if (choice === "Reload Window") {
        vscode.commands.executeCommand("workbench.action.reloadWindow");
      }
    }
    return true;
  } catch (e) {
    console.error("roscode: failed to patch workbench.html", e);
    return false;
  }
}

export function removeWorkbenchBranding(): void {
  const workbenchHtml = findWorkbenchHtml();
  if (!workbenchHtml) return;
  try {
    const html = fs.readFileSync(workbenchHtml, "utf8");
    const patched = html.replace(
      new RegExp(`\\s*${MARKER_START}[\\s\\S]*?${MARKER_END}`, "g"),
      ""
    );
    if (patched !== html) fs.writeFileSync(workbenchHtml, patched, "utf8");
    const cssPath = path.join(path.dirname(workbenchHtml), "roscode-brand.css");
    if (fs.existsSync(cssPath)) fs.unlinkSync(cssPath);
  } catch {}
}

function findWorkbenchHtml(): string | null {
  // VSCodium / Code-OSS layouts
  const candidates = [
    "/Applications/VSCodium.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html",
    path.join(process.env.HOME || "", "Applications/VSCodium.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html"),
    "/Applications/Visual Studio Code.app/Contents/Resources/app/out/vs/code/electron-sandbox/workbench/workbench.html",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}
