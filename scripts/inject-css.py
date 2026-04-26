#!/usr/bin/env python3
"""
roscode studio — workbench hard-fork injector

Injects the complete roscode design system (CSS + HTML + JS) directly into the
VSCodium workbench HTML. Based on the official design handoff:
  - B · Blueprint Ops  (primary aesthetic — HUD, warm amber, monospace-forward)
  - A · Glass          (modernist influences — rounded corners, subtle glows)

Key design tokens:
  bg:       #0a0c0b
  bg2:      #0f1211
  surface:  #121615
  accent:   #f2a83b  (warm amber — primary CTA, active states)
  accent2:  #6dd3c8  (teal — secondary highlights, agent sparkle)
  ok:       #8bc34a
  warn:     #f2c84b
  err:      #e06666
  activityBar: 62px wide
  agentPanel:  320px wide
  statusBar:   24px high

Usage:
  python3 inject-css.py <path/to/workbench.html>
"""

import sys
import pathlib
import re

# ═══════════════════════════════════════════════════════════════════════
# DESIGN SYSTEM CSS
# ═══════════════════════════════════════════════════════════════════════

ROSCODE_CSS = """
<style id="roscode-v2">
/* ════════════════════════════════════════════════════════════════
   ROSCODE STUDIO — B · Blueprint Ops + A modernist influences
   Handoff spec: roscode-hifi.html (2026-04-25)
   ════════════════════════════════════════════════════════════════ */

/* ── Design tokens ─────────────────────────────────────────────── */
:root {
  --rs-bg:           #0a0c0b;
  --rs-bg2:          #0f1211;
  --rs-surface:      #121615;
  --rs-surfaceHi:    #181d1b;
  --rs-border:       rgba(34, 40, 38, 0.38);
  --rs-borderHi:     #333b38;
  --rs-ink:          #e4e6e1;
  --rs-ink2:         #9ea39a;
  --rs-ink3:         #636862;
  --rs-ink4:         #3a3e3a;
  --rs-accent:       #f2a83b;   /* amber — primary */
  --rs-accentBg:     rgba(242, 168, 59, 0.10);
  --rs-accentLine:   rgba(242, 168, 59, 0.28);
  --rs-accent2:      #6dd3c8;   /* teal — secondary / agent */
  --rs-ok:           #8bc34a;
  --rs-warn:         #f2c84b;
  --rs-err:          #e06666;
  --rs-font:         'Geist', 'Inter', ui-sans-serif, system-ui;
  --rs-fontMono:     'Geist Mono', 'JetBrains Mono', 'Cascadia Code', ui-monospace, monospace;
  --rs-radius:       4px;
  --rs-radius-lg:    8px;       /* A-modernist influence */
  --rs-ab-w:         62px;      /* activity bar width */
  --rs-agent-w:      320px;     /* agent panel width */
}

/* ── Map vscode tokens to roscode palette ──────────────────────── */
.monaco-workbench {
  --vscode-sideBar-background:                    var(--rs-bg2) !important;
  --vscode-sideBarSectionHeader-background:       var(--rs-surface) !important;
  --vscode-sideBarSectionHeader-foreground:       var(--rs-ink3) !important;
  --vscode-sideBarTitle-foreground:               var(--rs-ink3) !important;
  --vscode-activityBar-background:                var(--rs-bg2) !important;
  --vscode-activityBar-foreground:                var(--rs-ink2) !important;
  --vscode-activityBar-activeBorder:              var(--rs-accent) !important;
  --vscode-activityBar-inactiveForeground:        var(--rs-ink3) !important;
  --vscode-activityBarBadge-background:           var(--rs-accent) !important;
  --vscode-activityBarBadge-foreground:           #1a1408 !important;
  --vscode-panel-background:                      var(--rs-bg2) !important;
  --vscode-panel-border:                          var(--rs-border) !important;
  --vscode-panelTitle-activeForeground:           var(--rs-accent) !important;
  --vscode-panelTitle-activeBorder:               var(--rs-accent) !important;
  --vscode-panelTitle-inactiveForeground:         var(--rs-ink3) !important;
  --vscode-statusBar-background:                  var(--rs-bg2) !important;
  --vscode-statusBar-foreground:                  var(--rs-ink3) !important;
  --vscode-statusBarItem-hoverBackground:         var(--rs-surface) !important;
  --vscode-statusBar-debuggingBackground:         var(--rs-accent) !important;
  --vscode-statusBar-debuggingForeground:         #1a1408 !important;
  --vscode-titleBar-activeBackground:             var(--rs-bg2) !important;
  --vscode-titleBar-inactiveBackground:           var(--rs-bg2) !important;
  --vscode-titleBar-activeForeground:             var(--rs-ink) !important;
  --vscode-editor-background:                     var(--rs-bg) !important;
  --vscode-editorGroupHeader-tabsBackground:      var(--rs-bg2) !important;
  --vscode-tab-activeBackground:                  var(--rs-bg) !important;
  --vscode-tab-inactiveBackground:                var(--rs-bg2) !important;
  --vscode-tab-border:                            var(--rs-border) !important;
  --vscode-tab-activeBorderTop:                   var(--rs-accent) !important;
  --vscode-tab-activeForeground:                  var(--rs-ink) !important;
  --vscode-tab-inactiveForeground:                var(--rs-ink3) !important;
  --vscode-focusBorder:                           var(--rs-accent) !important;
  --vscode-inputOption-activeBorder:              var(--rs-accent) !important;
  --vscode-list-focusOutline:                     var(--rs-accentLine) !important;
  --vscode-list-activeSelectionBackground:        var(--rs-accentBg) !important;
  --vscode-list-activeSelectionForeground:        var(--rs-ink) !important;
  --vscode-list-hoverBackground:                  var(--rs-surface) !important;
  --vscode-list-focusBackground:                  var(--rs-accentBg) !important;
  --vscode-scrollbar-shadow:                      transparent !important;
  --vscode-scrollbarSlider-background:            rgba(51,59,56,0.6) !important;
  --vscode-scrollbarSlider-hoverBackground:       rgba(242,168,59,0.4) !important;
  --vscode-scrollbarSlider-activeBackground:      var(--rs-accent) !important;
  --vscode-input-background:                      var(--rs-surface) !important;
  --vscode-input-foreground:                      var(--rs-ink) !important;
  --vscode-input-border:                          var(--rs-borderHi) !important;
  --vscode-input-placeholderForeground:           var(--rs-ink3) !important;
  --vscode-button-background:                     var(--rs-accent) !important;
  --vscode-button-foreground:                     #1a1408 !important;
  --vscode-button-hoverBackground:                #f5b84a !important;
  --vscode-button-secondaryBackground:            transparent !important;
  --vscode-button-secondaryForeground:            var(--rs-ink) !important;
  --vscode-button-secondaryHoverBackground:       var(--rs-surface) !important;
  --vscode-dropdown-background:                   var(--rs-surface) !important;
  --vscode-dropdown-foreground:                   var(--rs-ink) !important;
  --vscode-badge-background:                      var(--rs-accentBg) !important;
  --vscode-badge-foreground:                      var(--rs-accent) !important;
  --vscode-sideBar-border:                        var(--rs-border) !important;
  --vscode-tree-indentGuidesStroke:               var(--rs-borderHi) !important;
  --activity-bar-width:                           var(--rs-ab-w) !important;
}

/* ── Global reset ──────────────────────────────────────────────── */
body, .monaco-workbench {
  background: var(--rs-bg) !important;
  font-family: var(--rs-font) !important;
  color: var(--rs-ink) !important;
}

/* ── Scrollbars ────────────────────────────────────────────────── */
::-webkit-scrollbar              { width: 4px; height: 4px; }
::-webkit-scrollbar-track        { background: transparent; }
::-webkit-scrollbar-thumb        { background: var(--rs-borderHi); border-radius: 2px; }
::-webkit-scrollbar-thumb:hover  { background: var(--rs-accent); }
::-webkit-scrollbar-corner       { background: transparent; }

/* ── Focus ─────────────────────────────────────────────────────── */
:focus-visible { outline-color: var(--rs-accent) !important; }

/* ════════════════════════════════════════════════════════════════
   TITLE BAR
   Height: 38px · bg2 background · amber accent gradient bottom border
   ════════════════════════════════════════════════════════════════ */
.part.titlebar {
  background: var(--rs-bg2) !important;
  border-bottom: 1px solid var(--rs-border) !important;
  height: 38px !important;
  min-height: 38px !important;
}
.part.titlebar::after {
  content: "";
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, var(--rs-accent) 0%, transparent 30%);
  opacity: 0.4;
  pointer-events: none;
  z-index: 1;
}
.monaco-title-bar { background: var(--rs-bg2) !important; }
.titlebar-right   { display: none !important; }
.part.titlebar .monaco-toolbar   { display: none !important; }
.layout-controls-container       { display: none !important; }
.window-controls-container.left  { opacity: 1 !important; display: flex !important; }
.menubar                          { display: none !important; }

/* Command center / search bar */
.part.titlebar .command-center,
.part.titlebar .command-center-quick-pick {
  background: var(--rs-surface) !important;
  border: 1px solid var(--rs-borderHi) !important;
  border-radius: var(--rs-radius) !important;
  height: 24px !important;
  transition: border-color 120ms;
}
.part.titlebar .command-center:hover {
  border-color: var(--rs-accentLine) !important;
}
.part.titlebar .command-center .label,
.part.titlebar .command-center .codicon {
  font-family: var(--rs-fontMono) !important;
  font-size: 11px !important;
  color: var(--rs-ink3) !important;
  letter-spacing: 0.3px !important;
}

/* ════════════════════════════════════════════════════════════════
   ACTIVITY BAR — 62px, icon + 3-letter code
   ════════════════════════════════════════════════════════════════ */
.part.activitybar {
  width: var(--rs-ab-w) !important;
  min-width: var(--rs-ab-w) !important;
  background: var(--rs-bg2) !important;
  border-right: 1px solid var(--rs-border) !important;
  z-index: 20 !important;
  overflow: hidden !important;
}

/* Item container */
.part.activitybar .composite-bar .monaco-action-bar .action-item,
.part.activitybar .action-item {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  width: var(--rs-ab-w) !important;
  min-width: var(--rs-ab-w) !important;
  height: 52px !important;
  padding: 0 !important;
  gap: 4px !important;
  border-left: 2px solid transparent !important;
  background: transparent !important;
  transition: color 100ms, background 100ms !important;
  cursor: pointer !important;
  box-sizing: border-box !important;
  position: relative !important;
  border-radius: 0 !important;
}
.part.activitybar .action-item:hover {
  background: var(--rs-surface) !important;
  border-left-color: transparent !important;
}
.part.activitybar .action-item.checked:not(.focused),
.part.activitybar .action-item[aria-checked="true"],
.part.activitybar .action-item.active {
  background: var(--rs-accentBg) !important;
  border-left-color: var(--rs-accent) !important;
}
.part.activitybar .action-item.checked .codicon,
.part.activitybar .action-item[aria-checked="true"] .codicon,
.part.activitybar .action-item.active .codicon {
  color: var(--rs-accent) !important;
}

/* Codicons */
.part.activitybar .codicon {
  font-size: 17px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  color: var(--rs-ink3) !important;
}
.part.activitybar .action-item:hover .codicon {
  color: var(--rs-ink2) !important;
}

/* Hide native active indicator (we use left border) */
.part.activitybar .active-item-indicator { display: none !important; }

/* Badge */
.part.activitybar .badge {
  background: var(--rs-accent) !important;
  color: #1a1408 !important;
  font-size: 9px !important;
  min-width: 14px !important; height: 14px !important;
  border-radius: 7px !important;
  font-weight: 700 !important;
  top: 6px !important; right: 5px !important;
}

/* Settings (global activity) at bottom */
.part.activitybar .global-activity .action-item {
  height: 48px !important;
}

/* 3-letter label injected by JS */
.rs-ab-code {
  font-family: var(--rs-fontMono) !important;
  font-size: 8px !important;
  font-weight: 600 !important;
  letter-spacing: 0.5px !important;
  text-transform: uppercase !important;
  color: inherit !important;
  line-height: 1 !important;
  display: block !important;
  pointer-events: none !important;
}

/* ════════════════════════════════════════════════════════════════
   SIDEBAR — file explorer
   ════════════════════════════════════════════════════════════════ */
.part.sidebar {
  background: var(--rs-bg2) !important;
  border-right: 1px solid var(--rs-border) !important;
}
.part.sidebar .title,
.part.sidebar .composite.title {
  background: var(--rs-bg2) !important;
  height: 32px !important;
}
.part.sidebar .title .title-label h2 {
  font-family: var(--rs-fontMono) !important;
  font-size: 10px !important;
  font-weight: 600 !important;
  letter-spacing: 1.5px !important;
  text-transform: uppercase !important;
  color: var(--rs-ink3) !important;
}
.part.sidebar .pane-header {
  background: var(--rs-surface) !important;
  border-top: 1px solid var(--rs-border) !important;
  height: 28px !important;
}
.part.sidebar .pane-header .title {
  font-family: var(--rs-fontMono) !important;
  font-size: 10px !important;
  letter-spacing: 1px !important;
  text-transform: uppercase !important;
  color: var(--rs-ink3) !important;
}
.part.sidebar .explorer-folders-view .monaco-list .monaco-list-row {
  font-family: var(--rs-fontMono) !important;
  font-size: 12px !important;
  color: var(--rs-ink2) !important;
}
.part.sidebar .monaco-list .monaco-list-row.focused {
  background: var(--rs-accentBg) !important;
  outline: none !important;
}
.part.sidebar .monaco-list .monaco-list-row.selected {
  background: var(--rs-accentBg) !important;
}
.part.sidebar .monaco-list .monaco-list-row.selected .label-name {
  color: var(--rs-accent) !important;
}
.part.sidebar .monaco-list .monaco-list-row:hover {
  background: var(--rs-surface) !important;
}

/* ════════════════════════════════════════════════════════════════
   EDITOR
   ════════════════════════════════════════════════════════════════ */
.part.editor { background: var(--rs-bg) !important; }
.editor-container,
.monaco-editor,
.monaco-editor-background { background: var(--rs-bg) !important; }

/* Tab bar */
.tabs-and-actions-container {
  background: var(--rs-bg2) !important;
  border-bottom: 1px solid var(--rs-border) !important;
  height: 32px !important;
}
.tabs-and-actions-container .tab {
  background: var(--rs-bg2) !important;
  border-right: 1px solid var(--rs-border) !important;
  font-family: var(--rs-fontMono) !important;
  font-size: 11px !important;
  letter-spacing: 0.3px !important;
  color: var(--rs-ink3) !important;
  height: 32px !important;
  padding: 0 16px !important;
}
.tabs-and-actions-container .tab.active {
  background: var(--rs-bg) !important;
  color: var(--rs-accent) !important;
  border-bottom: 1px solid var(--rs-bg) !important;
}
.tabs-and-actions-container .tab.active::before {
  content: "";
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: var(--rs-accent);
}
.tabs-and-actions-container .tab:hover:not(.active) {
  background: var(--rs-surface) !important;
  color: var(--rs-ink2) !important;
}

/* Breadcrumbs — hide */
.breadcrumbs-below-tabs, .breadcrumb-item { display: none !important; }

/* Empty / welcome states */
.editor-group-empty-state   { display: none !important; }
.editor-empty-message       { display: none !important; }
.empty-editor-hint          { display: none !important; }
.editorPlaceholder          { display: none !important; }
.empty-view                 { display: none !important; }
.watermark                  { display: none !important; }
.gettingStartedContainer    { display: none !important; }
.welcomePage                { display: none !important; }
.welcome-view-content       { display: none !important; }

/* ════════════════════════════════════════════════════════════════
   AUXILIARY BAR — permanent agent panel (320px right)
   ════════════════════════════════════════════════════════════════ */
.part.auxiliarybar {
  background: var(--rs-bg2) !important;
  border-left: 1px solid var(--rs-border) !important;
  min-width: var(--rs-agent-w) !important;
  max-width: var(--rs-agent-w) !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}
/* Hide the native .title header — we inject our own */
.part.auxiliarybar > .title { display: none !important; }
.part.auxiliarybar .pane-composite-part {
  flex: 1 !important; display: flex !important;
  flex-direction: column !important; overflow: hidden !important;
  padding: 0 !important;
}

/* ════════════════════════════════════════════════════════════════
   PANEL (terminal, output)
   ════════════════════════════════════════════════════════════════ */
.part.panel {
  background: var(--rs-bg2) !important;
  border-top: 1px solid var(--rs-border) !important;
}
.part.panel .title.panel-section-header {
  background: var(--rs-surface) !important;
  font-family: var(--rs-fontMono) !important;
  font-size: 10px !important;
  letter-spacing: 0.8px !important;
  text-transform: uppercase !important;
  color: var(--rs-ink3) !important;
  height: 32px !important;
}
.part.panel:not(:has(.xterm)) { display: none !important; }

/* ════════════════════════════════════════════════════════════════
   STATUS BAR — 24px, monospace, uppercase, B style
   ════════════════════════════════════════════════════════════════ */
.part.statusbar {
  background: var(--rs-bg2) !important;
  border-top: 1px solid var(--rs-border) !important;
  height: 24px !important; min-height: 24px !important;
}
.part.statusbar .statusbar-item {
  font-family: var(--rs-fontMono) !important;
  font-size: 10px !important;
  letter-spacing: 0.4px !important;
  text-transform: uppercase !important;
  color: var(--rs-ink3) !important;
}
.part.statusbar .statusbar-item:hover { background: var(--rs-surface) !important; }
.part.statusbar .statusbar-item.remote-kind {
  background: var(--rs-accentBg) !important;
  color: var(--rs-accent) !important;
}
.part.statusbar .statusbar-item[aria-label*="No Problems"] { color: var(--rs-ok) !important; }

/* ════════════════════════════════════════════════════════════════
   QUICK OPEN / COMMAND PALETTE
   ════════════════════════════════════════════════════════════════ */
.quick-input-widget {
  background: var(--rs-surface) !important;
  border: 1px solid var(--rs-borderHi) !important;
  border-radius: var(--rs-radius-lg) !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.7) !important;
}
.quick-input-widget .quick-input-header {
  background: var(--rs-surface) !important;
  border-bottom: 1px solid var(--rs-border) !important;
  border-radius: var(--rs-radius-lg) var(--rs-radius-lg) 0 0 !important;
}
.quick-input-widget input {
  font-family: var(--rs-fontMono) !important;
  font-size: 13px !important;
  color: var(--rs-ink) !important;
  background: transparent !important;
}
.quick-input-widget .monaco-list .monaco-list-row.focused {
  background: var(--rs-accentBg) !important;
}
.quick-input-widget .monaco-list .monaco-list-row .codicon {
  color: var(--rs-accent) !important;
}

/* ════════════════════════════════════════════════════════════════
   CONTEXT MENUS
   ════════════════════════════════════════════════════════════════ */
.monaco-menu .monaco-action-bar {
  background: var(--rs-surface) !important;
  border: 1px solid var(--rs-borderHi) !important;
  border-radius: var(--rs-radius-lg) !important;
  box-shadow: 0 8px 24px rgba(0,0,0,0.6) !important;
}
.monaco-menu .action-item {
  font-family: var(--rs-fontMono) !important;
  font-size: 12px !important;
  color: var(--rs-ink) !important;
}
.monaco-menu .action-item.focused,
.monaco-menu .action-item:hover {
  background: var(--rs-accentBg) !important;
  color: var(--rs-ink) !important;
}
.monaco-menu .action-item .action-menu-item-icon .codicon {
  color: var(--rs-accent) !important;
}

/* ════════════════════════════════════════════════════════════════
   NOTIFICATIONS — suppress
   ════════════════════════════════════════════════════════════════ */
.notifications-toasts   { display: none !important; }
.notification-toast     { display: none !important; }
.notifications-center   { display: none !important; }

/* ════════════════════════════════════════════════════════════════
   ROSCODE BRAND MARK (injected into title bar)
   ════════════════════════════════════════════════════════════════ */
#rs-brand-mark {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  padding: 0 10px 0 4px !important;
  flex-shrink: 0 !important;
  border-right: 1px solid var(--rs-border) !important;
  height: 100% !important;
  -webkit-app-region: no-drag !important;
  cursor: default !important;
}
#rs-brand-mark .rs-brand-txt {
  font-family: var(--rs-fontMono) !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  letter-spacing: 0.4px !important;
  color: var(--rs-ink2) !important;
  text-transform: uppercase !important;
  white-space: nowrap !important;
}
#rs-brand-mark .rs-brand-slash { color: var(--rs-accent) !important; }

/* ════════════════════════════════════════════════════════════════
   AGENT PANEL (injected into .part.auxiliarybar)
   B-style: monospace, amber accent, > USER / > AGENT format
   A-modernist: slightly rounded cards, teal agent sparkle
   ════════════════════════════════════════════════════════════════ */
#rs-agent {
  display: flex; flex-direction: column;
  height: 100%; width: 100%;
  background: var(--rs-bg2);
  font-family: var(--rs-fontMono);
  overflow: hidden;
}

/* Panel header */
#rs-agent .rs-ph {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 14px; height: 36px; flex-shrink: 0;
  border-bottom: 1px solid var(--rs-border);
}
#rs-agent .rs-ph-left  { display: flex; align-items: center; gap: 8px; }
#rs-agent .rs-ph-title {
  font-size: 10px; font-weight: 600; letter-spacing: 1.2px;
  text-transform: uppercase; color: var(--rs-ink);
}
#rs-agent .rs-ph-right { display: flex; align-items: center; gap: 6px; }
#rs-agent .rs-ph-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--rs-ink4); transition: background 300ms;
}
#rs-agent .rs-ph-dot.connected {
  background: var(--rs-ok); box-shadow: 0 0 6px var(--rs-ok);
  animation: rs-pulse 2s ease-in-out infinite;
}
#rs-agent .rs-ph-dot.connecting { background: var(--rs-accent); animation: rs-pulse 0.8s ease-in-out infinite; }
#rs-agent .rs-ph-status {
  font-size: 9px; letter-spacing: 0.6px; text-transform: uppercase;
  color: var(--rs-ink3);
}
@keyframes rs-pulse { 0%,100%{opacity:1} 50%{opacity:0.25} }

/* Tabs row */
#rs-agent .rs-tabs {
  display: flex; height: 32px; flex-shrink: 0;
  border-bottom: 1px solid var(--rs-border);
}
#rs-agent .rs-tab {
  flex: 1; background: transparent; border: none;
  border-bottom: 2px solid transparent;
  font-family: var(--rs-fontMono); font-size: 9px; font-weight: 600;
  letter-spacing: 1px; text-transform: uppercase;
  color: var(--rs-ink3); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: color 100ms, border-color 100ms;
}
#rs-agent .rs-tab:hover { color: var(--rs-ink2); }
#rs-agent .rs-tab.active { color: var(--rs-accent); border-bottom-color: var(--rs-accent); }

/* Body */
#rs-agent .rs-body { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
#rs-agent .rs-panel { flex: 1; overflow-y: auto; display: none; flex-direction: column; }
#rs-agent .rs-panel.active { display: flex; }

/* Messages */
#rs-agent .rs-msgs { flex: 1; overflow-y: auto; padding: 14px 14px 8px; display: flex; flex-direction: column; gap: 14px; }
#rs-agent .rs-msg-role {
  font-size: 9px; font-weight: 600; letter-spacing: 1.2px;
  text-transform: uppercase; color: var(--rs-ink3);
  margin-bottom: 4px;
}
#rs-agent .rs-msg-role.user  { color: var(--rs-accent); }
#rs-agent .rs-msg-role.agent { color: var(--rs-accent2); }
#rs-agent .rs-msg-role.tool  { color: var(--rs-ink3); }

/* User bubble — B style: bordered box aligned right */
#rs-agent .rs-msg-user {
  align-self: flex-end; max-width: 90%;
  padding: 8px 12px;
  background: var(--rs-surface); border: 1px solid var(--rs-border);
  border-radius: var(--rs-radius);
  font-size: 12.5px; color: var(--rs-ink); line-height: 1.55;
}
/* Agent reply — no bubble, just text */
#rs-agent .rs-msg-agent { font-size: 12.5px; color: var(--rs-ink); line-height: 1.55; }
#rs-agent .rs-msg-agent code, #rs-agent .rs-msg-agent .rs-code {
  font-family: var(--rs-fontMono); color: var(--rs-accent); background: var(--rs-surface);
  padding: 1px 5px; border-radius: 3px; font-size: 11px;
}
/* Tool call — monospace block */
#rs-agent .rs-msg-tool {
  background: var(--rs-surface); border-left: 2px solid var(--rs-ink3);
  padding: 8px 10px; border-radius: 0 var(--rs-radius) var(--rs-radius) 0;
  font-size: 11px; color: var(--rs-ink3); white-space: pre-wrap; word-break: break-all;
}

/* Thinking */
#rs-agent .rs-thinking {
  font-size: 11px; color: var(--rs-ink3); font-style: italic;
  animation: rs-blink 1s step-end infinite;
}
@keyframes rs-blink { 50% { opacity: 0; } }

/* Confirm gate */
#rs-agent .rs-confirm {
  padding: 10px 14px; border-top: 1px solid var(--rs-border);
  background: var(--rs-surface); display: none; flex-direction: column; gap: 8px;
}
#rs-agent .rs-confirm.visible { display: flex; }
#rs-agent .rs-confirm-title { font-size: 10px; font-weight: 600; letter-spacing: 0.8px; color: var(--rs-warn); text-transform: uppercase; }
#rs-agent .rs-confirm-body {
  font-size: 11px; color: var(--rs-ink2);
  background: var(--rs-bg); border: 1px solid var(--rs-border);
  border-left: 2px solid var(--rs-warn); padding: 6px 10px;
  border-radius: 0 var(--rs-radius) var(--rs-radius) 0;
  white-space: pre-wrap; word-break: break-all;
}
#rs-agent .rs-confirm-row { display: flex; gap: 8px; }
#rs-agent .rs-btn {
  flex: 1; padding: 6px 0;
  font-family: var(--rs-fontMono); font-size: 10px; font-weight: 600;
  letter-spacing: 0.5px; text-transform: uppercase;
  border-radius: var(--rs-radius); cursor: pointer; border: 1px solid;
  transition: opacity 100ms;
}
#rs-agent .rs-btn:hover { opacity: 0.8; }
#rs-agent .rs-btn.ok  { background: var(--rs-ok); border-color: var(--rs-ok); color: #0e1a06; }
#rs-agent .rs-btn.no  { background: transparent; border-color: var(--rs-borderHi); color: var(--rs-ink2); }

/* Input area — B style: `❯` cursor */
#rs-agent .rs-input-wrap {
  padding: 10px 12px; border-top: 1px solid var(--rs-border); flex-shrink: 0;
}
#rs-agent .rs-input-row {
  display: flex; gap: 6px; align-items: flex-end;
  border: 1px solid var(--rs-borderHi); border-radius: var(--rs-radius);
  background: var(--rs-bg); padding: 7px 10px;
  transition: border-color 100ms;
}
#rs-agent .rs-input-row:focus-within { border-color: var(--rs-accentLine); }
#rs-agent .rs-cursor {
  color: var(--rs-accent); font-size: 13px; font-weight: 600;
  line-height: 1; padding-top: 1px; flex-shrink: 0; user-select: none;
}
#rs-agent .rs-textarea {
  flex: 1; min-height: 18px; max-height: 100px;
  background: transparent; border: none; outline: none;
  color: var(--rs-ink); font-family: var(--rs-fontMono); font-size: 11px;
  line-height: 1.6; resize: none; overflow-y: auto; padding: 0;
}
#rs-agent .rs-textarea::placeholder { color: var(--rs-ink3); }
#rs-agent .rs-hint {
  font-size: 10px; color: var(--rs-ink3); flex-shrink: 0;
  align-self: flex-end; line-height: 1; padding-bottom: 1px;
  user-select: none;
}

/* Section label for non-chat tabs */
#rs-agent .rs-sec-label {
  padding: 10px 14px 6px; font-size: 9px; font-weight: 600;
  letter-spacing: 1.5px; text-transform: uppercase; color: var(--rs-ink3);
  border-bottom: 1px solid var(--rs-border);
}
/* Topic / param row */
#rs-agent .rs-row {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 14px; border-bottom: 1px solid var(--rs-border);
  font-size: 11px;
}
#rs-agent .rs-row:hover { background: var(--rs-surface); }
#rs-agent .rs-row-name  { flex: 1; color: var(--rs-ink); font-size: 12px; }
#rs-agent .rs-row-type  { font-size: 10px; color: var(--rs-ink3); }
#rs-agent .rs-row-badge {
  font-size: 10px; color: var(--rs-accent); background: var(--rs-accentBg);
  padding: 2px 6px; border-radius: 3px; font-weight: 600; flex-shrink: 0;
}
/* Empty state */
#rs-agent .rs-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 10px; padding: 32px 20px;
}
#rs-agent .rs-empty svg { opacity: 0.15; }
#rs-agent .rs-empty-txt {
  font-size: 11px; color: var(--rs-ink3); text-align: center;
  line-height: 1.7;
}
</style>
"""

# ═══════════════════════════════════════════════════════════════════════
# STARTUP OVERLAY
# ═══════════════════════════════════════════════════════════════════════

STARTUP_OVERLAY_JS = """
<script id="rs-startup">
(function() {
  var o = document.createElement('div');
  o.id = 'rs-overlay';
  o.style.cssText = [
    'position:fixed','inset:0','background:#0a0c0b','z-index:999999',
    'display:flex','align-items:center','justify-content:center',
    'flex-direction:column','gap:16px'
  ].join(';');
  o.innerHTML = [
    '<svg width="48" height="48" viewBox="0 0 1440 810" fill="none" style="animation:rs-rot 3s linear infinite">',
      '<g transform="translate(316, 0)">',
        '<path fill="#f2a83b" d="M 414.886719 3.832031 L 670.742188 152.695312 C 677.585938 156.679688 681.796875 163.996094 681.796875 171.914062 L 681.796875 469.789062 C 681.796875 477.703125 677.585938 485.023438 670.742188 489.007812 L 414.886719 637.867188 C 408.054688 641.84375 399.613281 641.84375 392.78125 637.867188 L 136.921875 489.007812 C 130.078125 485.023438 125.871094 477.703125 125.871094 469.789062 L 125.871094 171.914062 C 125.871094 163.996094 130.078125 156.679688 136.921875 152.695312 L 392.78125 3.832031 C 399.613281 -0.140625 408.054688 -0.140625 414.886719 3.832031 Z" />',
      '</g>',
    '</svg>',

    '<div style="font-family:\'Geist Mono\',monospace;font-size:10px;letter-spacing:2.5px;',
         'color:#636862;text-transform:uppercase">ROSCODE / STUDIO</div>',
    '<style>@keyframes rs-rot{from{transform:rotate(0)}to{transform:rotate(360deg)}}</style>'
  ].join('');
  document.documentElement.appendChild(o);
  var t = setInterval(function() {
    if (document.body && document.body.classList.contains('monaco-workbench')) {
      clearInterval(t);
      setTimeout(function() {
        o.style.transition = 'opacity 280ms ease';
        o.style.opacity = '0';
        setTimeout(function() { o.parentNode && o.parentNode.removeChild(o); }, 290);
      }, 180);
    }
  }, 40);
})();
</script>
"""

# ═══════════════════════════════════════════════════════════════════════
# AGENT PANEL HTML
# ═══════════════════════════════════════════════════════════════════════

AGENT_HTML = """
<div id="rs-agent">
  <div class="rs-ph">
    <div class="rs-ph-left">
      <svg width="14" height="14" viewBox="0 0 1440 810" fill="none">
        <g transform="translate(316, 0)">
          <path fill="#f2a83b" d="M 414.886719 3.832031 L 670.742188 152.695312 C 677.585938 156.679688 681.796875 163.996094 681.796875 171.914062 L 681.796875 469.789062 C 681.796875 477.703125 677.585938 485.023438 670.742188 489.007812 L 414.886719 637.867188 C 408.054688 641.84375 399.613281 641.84375 392.78125 637.867188 L 136.921875 489.007812 C 130.078125 485.023438 125.871094 477.703125 125.871094 469.789062 L 125.871094 171.914062 C 125.871094 163.996094 130.078125 156.679688 136.921875 152.695312 L 392.78125 3.832031 C 399.613281 -0.140625 408.054688 -0.140625 414.886719 3.832031 Z" />
        </g>
      </svg>
      <span class="rs-ph-title">AGENT · CLAUDE</span>
    </div>
    <div class="rs-ph-right">
      <span class="rs-ph-dot" id="rs-dot"></span>
      <span class="rs-ph-status" id="rs-status">OFFLINE</span>
    </div>
  </div>

  <div class="rs-tabs">
    <button class="rs-tab active" data-tab="agent">AGENT</button>
    <button class="rs-tab" data-tab="topics">TOPICS</button>
    <button class="rs-tab" data-tab="params">PARAMS</button>
    <button class="rs-tab" data-tab="map">MAP</button>
  </div>

  <div class="rs-body">
    <!-- AGENT -->
    <div class="rs-panel active" data-panel="agent">
      <div class="rs-msgs" id="rs-msgs"></div>
      <div class="rs-confirm" id="rs-confirm">
        <div class="rs-confirm-title">&#9888; DESTRUCTIVE ACTION</div>
        <div class="rs-confirm-body" id="rs-confirm-body"></div>
        <div class="rs-confirm-row">
          <button class="rs-btn ok" id="rs-ok">APPROVE</button>
          <button class="rs-btn no" id="rs-no">DENY</button>
        </div>
      </div>
      <div class="rs-input-wrap">
        <div class="rs-input-row">
          <span class="rs-cursor">&#10095;</span>
          <textarea class="rs-textarea" id="rs-input" placeholder="ask agent&#8230;" rows="1"></textarea>
          <span class="rs-hint">&#8984;&#8617;</span>
        </div>
      </div>
    </div>

    <!-- TOPICS -->
    <div class="rs-panel" data-panel="topics">
      <div class="rs-sec-label">LIVE TOPICS</div>
      <div id="rs-topics">
        <div class="rs-empty">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
            <path d="M4 7l8 4 8-4M4 12l8 4 8-4M4 17l8 4 8-4"/>
          </svg>
          <div class="rs-empty-txt">Waiting for ROS topics.<br>Start the agent to connect.</div>
        </div>
      </div>
    </div>

    <!-- PARAMS -->
    <div class="rs-panel" data-panel="params">
      <div class="rs-sec-label">NODE PARAMETERS</div>
      <div id="rs-params">
        <div class="rs-empty">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
          <div class="rs-empty-txt">No node selected.</div>
        </div>
      </div>
    </div>

    <!-- MAP -->
    <div class="rs-panel" data-panel="map">
      <div class="rs-empty" style="flex:1">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <polygon points="3 7 9 4 15 7 21 4 21 17 15 20 9 17 3 20 3 7"/>
          <path d="M9 4v13M15 7v13"/>
        </svg>
        <div class="rs-empty-txt">ROS map viewer.<br>Publish to /map to enable.</div>
      </div>
    </div>
  </div>
</div>
"""

# ═══════════════════════════════════════════════════════════════════════
# WORKBENCH JAVASCRIPT
# ═══════════════════════════════════════════════════════════════════════

WORKBENCH_JS = r"""
<script id="rs-init">
(function() {
'use strict';

var AGENT_HTML = null; // set by rs-agent-html script tag

/* ── Activity bar code map ─────────────────────────────────────── */
var CODE_MAP = [
  { re: /explorer|files/i,   code: 'FIL' },
  { re: /search/i,           code: 'SRC' },
  { re: /source.control|git/i,code: 'GIT' },
  { re: /run|debug/i,        code: 'DBG' },
  { re: /extensions/i,       code: 'EXT' },
  { re: /roscode.*network|network/i, code: 'NET' },
  { re: /roscode.*topic|topics/i,    code: 'TOP' },
  { re: /roscode.*node|nodes/i,      code: 'NOD' },
  { re: /roscode.*lib|library/i,     code: 'LIB' },
  { re: /terminal/i,         code: 'TRM' },
  { re: /roscode.*home|home/i, code: 'HOM' },
  { re: /testing/i,          code: 'TST' },
  { re: /remote/i,           code: 'SSH' },
];

function getCode(label) {
  if (!label) return '';
  for (var i = 0; i < CODE_MAP.length; i++) {
    if (CODE_MAP[i].re.test(label)) return CODE_MAP[i].code;
  }
  return label.replace(/[^a-z]/gi, '').substring(0, 3).toUpperCase() || '???';
}

/* ── Enhance activity bar items with 3-letter codes ────────────── */
function enhanceActivityBar() {
  var items = document.querySelectorAll('.part.activitybar .action-item');
  items.forEach(function(item) {
    if (item.dataset.rsCode) return;
    var label = item.getAttribute('aria-label') || item.title || '';
    var code = getCode(label);
    if (!code) return;
    item.dataset.rsCode = code;
    if (!item.querySelector('.rs-ab-code')) {
      var span = document.createElement('span');
      span.className = 'rs-ab-code';
      span.textContent = code;
      item.appendChild(span);
    }
  });
}

/* ── Inject roscode brand into title bar ────────────────────────── */
function injectBrand() {
  if (document.getElementById('rs-brand-mark')) return;
  var tb = document.querySelector('.part.titlebar .titlebar-left, .part.titlebar');
  if (!tb) return;
  var el = document.createElement('div');
  el.id = 'rs-brand-mark';
  el.innerHTML = [
    '<svg width="110" height="20" viewBox="0 0 1047 182" fill="none" style="margin-left: 4px;">',
      '<g transform="translate(0, -314)">',
        '<path fill="#f2a83b" d="M 253.171875 377.2125 C 256.179688 377.2125 258.6875 377.43125 260.6875 377.86875 L 259 398.728125 C 257.207031 398.239844 255.019531 397.99375 252.4375 397.99375 C 245.34375 397.99375 239.8125 399.819531 235.84375 403.464062 C 231.882812 407.1125 229.90625 412.214062 229.90625 418.775 L 229.90625 460.275 L 207.671875 460.275 L 207.671875 378.74375 L 224.515625 378.74375 L 227.796875 392.4625 L 228.890625 392.4625 C 231.410156 387.892188 234.820312 384.21875 239.125 381.425781 C 243.4375 378.625 248.117188 377.2125 253.171875 377.2125 Z"/>',
        '<path fill="#ffffff" d="M 311.21875 461.728125 C 298.730469 461.728125 289.015625 457.989844 282.070312 450.5125 C 275.125 443.035156 271.652344 432.679688 271.652344 419.446875 C 271.652344 406.132812 275.152344 395.730469 282.152344 388.239844 C 289.152344 380.749219 298.882812 377.003906 311.34375 377.003906 C 322.925781 377.003906 331.984375 380.657812 338.515625 387.965625 C 345.046875 395.273438 348.3125 405.441406 348.3125 418.46875 C 348.3125 431.25 345.011719 441.410156 338.410156 448.948438 C 331.808594 456.486719 322.742188 460.25625 311.210156 460.25625 Z M 311.21875 450.275 C 319.148438 450.275 325.152344 447.5625 329.230469 442.1375 C 333.308594 436.7125 335.347656 428.914062 335.347656 418.740625 C 335.347656 408.472656 333.289062 400.675781 329.171875 395.349219 C 325.054688 390.022656 319.054688 387.359375 311.171875 387.359375 C 303.242188 387.359375 297.234375 390.007812 293.148438 395.303906 C 289.0625 400.6 287.019531 408.40625 287.019531 418.721875 C 287.019531 428.992188 289.074219 436.789062 293.183594 442.1125 C 297.292969 447.435938 303.304688 450.1 311.21875 450.275 Z"/>',
      '</g>',
    '</svg>'
  ].join('');
  var wc = tb.querySelector('.window-controls-container');
  if (wc) wc.insertAdjacentElement('afterend', el);
  else tb.insertBefore(el, tb.firstChild);
}

/* ── Inject agent panel into auxiliary bar ──────────────────────── */
var agentReady = false;
function injectAgent() {
  if (agentReady) return;
  var aux = document.querySelector('.part.auxiliarybar');
  if (!aux) return;
  var target = aux.querySelector('.pane-composite-part') || aux;
  if (target.querySelector('#rs-agent')) { agentReady = true; return; }
  target.innerHTML = '';
  var html = document.getElementById('rs-agent-src');
  if (!html) return;
  target.insertAdjacentHTML('beforeend', html.textContent);
  agentReady = true;
  bootAgent();
}

/* ── Agent panel logic ──────────────────────────────────────────── */
var ws = null;

function bootAgent() {
  // Tab switching
  var tabs  = document.querySelectorAll('#rs-agent .rs-tab');
  var panels = document.querySelectorAll('#rs-agent .rs-panel');
  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      tabs.forEach(function(t) { t.classList.remove('active'); });
      panels.forEach(function(p) { p.classList.remove('active'); });
      tab.classList.add('active');
      var panel = document.querySelector('#rs-agent .rs-panel[data-panel="' + tab.dataset.tab + '"]');
      if (panel) panel.classList.add('active');
    });
  });

  // Textarea auto-height + submit on Enter
  var ta = document.getElementById('rs-input');
  if (ta) {
    ta.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });
    ta.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    });
  }

  // Confirm buttons
  var okBtn = document.getElementById('rs-ok');
  var noBtn = document.getElementById('rs-no');
  if (okBtn) okBtn.addEventListener('click', function() { respond('y'); });
  if (noBtn) noBtn.addEventListener('click', function() { respond('n'); });

  connectWS();
}

function connectWS() {
  setStatus('connecting');
  try {
    ws = new WebSocket('ws://localhost:9000');
    ws.onopen  = function() { setStatus('connected'); };
    ws.onclose = function() { ws = null; setStatus('offline'); setTimeout(connectWS, 5000); };
    ws.onerror = function() { setStatus('offline'); };
    ws.onmessage = function(e) {
      try { handle(JSON.parse(e.data)); } catch(ex) {}
    };
  } catch(ex) {
    setStatus('offline');
    setTimeout(connectWS, 5000);
  }
}

function setStatus(s) {
  var dot = document.getElementById('rs-dot');
  var lbl = document.getElementById('rs-status');
  if (!dot || !lbl) return;
  dot.className = 'rs-ph-dot' + (s === 'connected' ? ' connected' : s === 'connecting' ? ' connecting' : '');
  lbl.textContent = s === 'connected' ? 'READY' : s === 'connecting' ? 'CONN…' : 'OFFLINE';
}

function handle(msg) {
  var role = msg.type || msg.role;
  if (role === 'assistant' || role === 'agent') {
    removeThinking();
    appendMsg('agent', msg.content || '');
  } else if (role === 'tool_use' || role === 'tool') {
    var body = (msg.name || 'tool') + (msg.input ? '\n' + JSON.stringify(msg.input, null, 2) : '');
    appendTool(body);
  } else if (role === 'confirm' || msg.requires_confirmation) {
    showConfirm(msg);
  } else if (role === 'topics') {
    updateTopics(msg.topics || []);
  } else if (role === 'params') {
    updateParams(msg.params || []);
  } else if (role === 'error') {
    removeThinking();
    appendMsg('agent', '⚠ ' + (msg.message || 'error'));
  }
}

function appendMsg(role, text) {
  var msgs = document.getElementById('rs-msgs');
  if (!msgs) return;
  var div = document.createElement('div');
  var lbl = document.createElement('div');
  lbl.className = 'rs-msg-role ' + role;
  lbl.textContent = role === 'user' ? '> USER' : '> AGENT';
  var body = document.createElement('div');
  body.className = role === 'user' ? 'rs-msg-user' : 'rs-msg-agent';
  body.textContent = text;
  div.appendChild(lbl);
  div.appendChild(body);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function appendTool(text) {
  var msgs = document.getElementById('rs-msgs');
  if (!msgs) return;
  var div = document.createElement('div');
  var lbl = document.createElement('div');
  lbl.className = 'rs-msg-role tool';
  lbl.textContent = '> TOOL';
  var body = document.createElement('div');
  body.className = 'rs-msg-tool';
  body.textContent = text;
  div.appendChild(lbl);
  div.appendChild(body);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function showThinking() {
  var msgs = document.getElementById('rs-msgs');
  if (!msgs || msgs.querySelector('.rs-thinking')) return;
  var div = document.createElement('div');
  var lbl = document.createElement('div');
  lbl.className = 'rs-msg-role agent'; lbl.textContent = '> AGENT';
  var body = document.createElement('div');
  body.className = 'rs-thinking'; body.textContent = 'thinking…';
  div.appendChild(lbl); div.appendChild(body);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}
function removeThinking() {
  var t = document.querySelector('#rs-msgs .rs-thinking');
  if (t) t.parentNode.remove();
}

function showConfirm(msg) {
  var wrap = document.getElementById('rs-confirm');
  var body = document.getElementById('rs-confirm-body');
  if (!wrap || !body) return;
  body.textContent = (msg.tool_name || msg.name || '') + (msg.summary ? ': ' + msg.summary : '');
  wrap.classList.add('visible');
}

function respond(ans) {
  var wrap = document.getElementById('rs-confirm');
  if (wrap) wrap.classList.remove('visible');
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'confirm', answer: ans }));
}

function submit() {
  var ta = document.getElementById('rs-input');
  if (!ta) return;
  var text = ta.value.trim();
  if (!text) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    appendMsg('agent', '⚠ Agent offline. Run: python -m roscode.server');
    return;
  }
  appendMsg('user', text);
  showThinking();
  ws.send(JSON.stringify({ type: 'human', content: text }));
  ta.value = '';
  ta.style.height = 'auto';
}

function updateTopics(list) {
  var el = document.getElementById('rs-topics');
  if (!el || !list.length) return;
  el.innerHTML = list.map(function(t) {
    return '<div class="rs-row">' +
      '<div class="rs-row-name">' + esc(t.name || t.n || '') + '</div>' +
      '<div class="rs-row-type">' + esc(t.type || t.t || '') + '</div>' +
      (t.hz ? '<div class="rs-row-badge">' + t.hz + 'Hz</div>' : '') +
      '</div>';
  }).join('');
}

function updateParams(list) {
  var el = document.getElementById('rs-params');
  if (!el || !list.length) return;
  el.innerHTML = list.map(function(p) {
    return '<div class="rs-row">' +
      '<div class="rs-row-name">' + esc(p.key || p.k || '') + '</div>' +
      '<div class="rs-row-type">' + esc(p.type || p.t || '') + '</div>' +
      '<div class="rs-row-badge">' + esc(String(p.value || p.v || '')) + '</div>' +
      '</div>';
  }).join('');
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── DOM observer — fires after workbench mounts ────────────────── */
var done = false;
document.addEventListener('DOMContentLoaded', function() {
  var obs = new MutationObserver(function() {
    if (!done && document.body && document.body.classList.contains('monaco-workbench')) {
      done = true;
      injectBrand();
    }
    enhanceActivityBar();
    if (!agentReady) injectAgent();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  if (document.body && document.body.classList.contains('monaco-workbench')) {
    done = true; injectBrand();
  }
  enhanceActivityBar();
  injectAgent();
});

})();
</script>
"""


# ═══════════════════════════════════════════════════════════════════════
# INJECTION LOGIC
# ═══════════════════════════════════════════════════════════════════════

def _escape_for_script(html: str) -> str:
    """Store agent HTML in a <script type=text/template> tag."""
    return html.replace("</", "<\\/")


def inject(target: pathlib.Path) -> None:
    content = target.read_text(encoding="utf-8")

    if target.suffix != ".html":
        print(f"⚠  {target.name}: not HTML, skipping")
        return

    if "rs-init" in content:
        print(f"⏭  {target.name}: already injected (v2), skipping")
        return

    # Remove any old v1 injection
    if "roscode-nuclear" in content or "roscode-native-remover" in content or "rs-workbench-init" in content:
        content = re.sub(r'<style id="roscode-nuclear">.*?</style>', '', content, flags=re.DOTALL)
        content = re.sub(r'<script id="roscode-native-remover">.*?</script>', '', content, flags=re.DOTALL)
        content = re.sub(r'<style id="roscode-v2">.*?</style>', '', content, flags=re.DOTALL)
        content = re.sub(r'<script id="rs-startup-overlay">.*?</script>', '', content, flags=re.DOTALL)
        content = re.sub(r'<script id=\'rs-agent-html-var\'>.*?</script>', '', content, flags=re.DOTALL)
        content = re.sub(r'<script id="rs-workbench-init">.*?</script>', '', content, flags=re.DOTALL)
        print(f"  ↺  removed old injection from {target.name}")

    if "</head>" not in content:
        print(f"⚠  {target.name}: no </head>, skipping")
        return

    # Agent HTML stored in a template script tag (avoids </script> parser issues)
    agent_template = (
        f'\n<script id="rs-agent-src" type="text/template">{_escape_for_script(AGENT_HTML)}</script>\n'
    )

    head_inject = ROSCODE_CSS + "\n" + STARTUP_OVERLAY_JS + "\n"
    body_inject  = "\n" + agent_template + "\n" + WORKBENCH_JS + "\n"

    content = content.replace("</head>", head_inject + "</head>", 1)

    if "</body>" in content:
        content = content.replace("</body>", body_inject + "</body>", 1)
    else:
        content = content.replace("</html>", body_inject + "</html>", 1)

    target.write_text(content, encoding="utf-8")
    print(f"✅ roscode v2 (Blueprint Ops) injected into {target.name}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 inject-css.py <workbench.html>")
        sys.exit(1)
    inject(pathlib.Path(sys.argv[1]))
