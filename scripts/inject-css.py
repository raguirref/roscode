import sys, pathlib

target = pathlib.Path(sys.argv[1])
content = target.read_text(encoding="utf-8")

NUCLEAR_CSS = """
<style id="roscode-nuclear">
/* ═══ NUCLEAR: ocultar TODO el chrome de VS Code ═══ */

/* Activity bar (izquierda con íconos) */
.activitybar { display: none !important; }

/* Sidebar (explorer, search, etc.) */
.sidebar { display: none !important; }

/* Status bar inferior */
.part.statusbar { display: none !important; }

/* Menú nativo (File Edit Selection...) */
.menubar { display: none !important; }

/* Tabs de archivos abiertos */
.tabs-and-actions-container { display: none !important; }

/* Breadcrumbs */
.breadcrumbs-below-tabs, .breadcrumb-item { display: none !important; }

/* Title bar de Electron */
.part.titlebar .window-controls-container { opacity: 0 !important; }
.part.titlebar { background: #0d1117 !important; border: none !important; }
.monaco-title-bar { background: #0d1117 !important; }

/* Notificaciones pop-up de VS Code */
.notifications-toasts { display: none !important; }
.notification-list-item { display: none !important; }

/* Welcome tab, walkthrough, empty states */
.gettingStartedContainer { display: none !important; }
.welcomePage { display: none !important; }
.welcome-view-content { display: none !important; }

/* Empty editor state — "Clone Git Repository" / "Open Folder" prompts */
.editor-empty-message { display: none !important; }
.empty-editor-hint { display: none !important; }
.editorPlaceholder { display: none !important; }
.scm-empty-state { display: none !important; }
.empty-view { display: none !important; }

/* Workspace Trust dialog */
.monaco-dialog-box { display: none !important; }
.dialog-message-container { display: none !important; }

/* Git clone / open folder CTA in editor area */
.editor-group-empty-state { display: none !important; }
[class*="emptyEditorHint"] { display: none !important; }

/* Native VS Code dialog boxes (git clone, trust, etc.) */
.monaco-dialog-box { display: none !important; }
.dialog-shadow { display: none !important; }
.dialog-message-container { display: none !important; }
.monaco-dialog { display: none !important; }

/* Title bar layout controls (top-right VS Code icons) */
.layout-controls-container { display: none !important; }
.titlebar-right .action-bar { display: none !important; }
.title-actions { display: none !important; }
.window-controls-container.right { display: none !important; }

/* VSCodium flash: force black background so any brief native chrome is invisible */
.monaco-workbench { background: #0d1117 !important; }

/* Background general */
body, .monaco-workbench {
  background: #0d1117 !important;
  font-family: 'Inter', 'SF Pro Display', system-ui, sans-serif !important;
}

/* Editor area — solo visible cuando se pide explícitamente */
.part.editor {
  background: #0d1117 !important;
}

/* Scrollbars */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #30363d; border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: #4cc9f0; }

/* Focus outline: usar color cyan */
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
