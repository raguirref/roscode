import sys, pathlib

target = pathlib.Path(sys.argv[1])
content = target.read_text(encoding="utf-8")

NUCLEAR_CSS = """
<style id="roscode-nuclear">
/* ═══ roscode studio — workbench overrides ═══ */

/* ── Workbench background ─────────────────────── */
body, .monaco-workbench { background: #080b0f !important; }
.part.editor           { background: #080b0f !important; }

/* ── Status bar — theme instead of hide ──────── */
.part.statusbar {
  background: #080b0f !important;
  border-top: 1px solid #141e2e !important;
  height: 24px !important;
}
.part.statusbar .statusbar-item { font-size: 11px !important; }
/* Hide VS Code branding text in status bar */
.part.statusbar .statusbar-item[id*="vscode"] { opacity: 0 !important; pointer-events: none !important; }
/* Error/warning counts stay visible */

/* ── Menu bar — hide (we use command palette) ─ */
.menubar { display: none !important; }

/* ── Editor tabs + breadcrumbs ────────────────── */
.tabs-and-actions-container { display: none !important; }
.breadcrumbs-below-tabs, .breadcrumb-item { display: none !important; }

/* ── Title bar — keep drag region, kill content ─ */
.part.titlebar {
  background: #080b0f !important;
  border: none !important;
  height: 28px !important;
}
.monaco-title-bar { background: #080b0f !important; }
/* Hide EVERYTHING inside the title bar except the macOS traffic lights area */
.part.titlebar .titlebar-left  { display: none !important; }
.part.titlebar .titlebar-right { display: none !important; }
.part.titlebar .titlebar-center { display: none !important; }
.part.titlebar .window-title   { display: none !important; }
.part.titlebar .monaco-action-bar { display: none !important; }
.part.titlebar .monaco-toolbar  { display: none !important; }
.part.titlebar .layout-controls-container { display: none !important; }
.part.titlebar .action-bar      { display: none !important; }
/* Keep left side for macOS traffic lights */
.part.titlebar .window-controls-container.left { opacity: 1 !important; display: flex !important; }
.part.titlebar .window-controls-container.right { display: none !important; }

/* ── Bottom panel — hide UNLESS a terminal is open ── */
.part.panel:not(:has(.xterm)) { display: none !important; }

/* ── SCM / Source control specific kills ──────── */
.scm-view                   { display: none !important; }
.scm-provider               { display: none !important; }
.scm-empty-state            { display: none !important; }
.scm-empty-message          { display: none !important; }
[id="workbench.view.scm"]   { display: none !important; }
[id="workbench.panel.scm"]  { display: none !important; }

/* ── Empty editor states ──────────────────────── */
.editor-group-empty-state   { display: none !important; }
.editor-empty-message       { display: none !important; }
.empty-editor-hint          { display: none !important; }
.editorPlaceholder          { display: none !important; }
.empty-view                 { display: none !important; }
[class*="emptyEditorHint"]  { display: none !important; }
.watermark                  { display: none !important; }

/* ── Welcome / onboarding ─────────────────────── */
.gettingStartedContainer    { display: none !important; }
.welcomePage                { display: none !important; }
.welcome-view-content       { display: none !important; }
[class*="welcomePageContainer"] { display: none !important; }

/* ── Dialogs (workspace trust, git clone, etc.) ── */
.monaco-dialog-box          { display: none !important; }
.dialog-shadow              { display: none !important; }
.dialog-message-container   { display: none !important; }
.monaco-dialog              { display: none !important; }

/* ── Notifications ────────────────────────────── */
.notifications-toasts       { display: none !important; }
.notification-list-item     { display: none !important; }
.notifications-center       { display: none !important; }
.notification-toast         { display: none !important; }

/* ── Scrollbars ───────────────────────────────── */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #30363d; border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: #4cc9f0; }

/* ── Focus ring ───────────────────────────────── */
:focus-visible { outline-color: #4cc9f0 !important; }
</style>
"""

# Inyectar en HTML
if target.suffix == ".html":
    if "roscode-nuclear" in content:
        print(f"⏭  {target.name} ya tiene CSS inyectado, saltando")
    elif "</head>" in content:
        content = content.replace("</head>", NUCLEAR_CSS + "\n</head>", 1)
        target.write_text(content, encoding="utf-8")
        print(f"✅ CSS inyectado en {target.name}")
    else:
        print(f"⚠️  {target.name}: no encontré </head>, saltando")
else:
    print(f"⚠️  {target.name} no es HTML, saltando")
