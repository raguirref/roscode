import json, sys, pathlib

p = pathlib.Path(sys.argv[1])
d = json.loads(p.read_text())

d.update({
    "nameShort": "roscode",
    "nameLong": "roscode studio",
    "applicationName": "roscode-studio",
    "dataFolderName": ".roscode-studio",
    "win32MutexName": "roscodestudio",
    "darwinBundleIdentifier": "com.manchestterrobotics.roscode-studio",
    "licenseName": "MIT",
    "licenseUrl": "https://github.com/raguirref/roscode/blob/main/LICENSE",
    "reportIssueUrl": "https://github.com/raguirref/roscode/issues",
    # Override the VS Code default chat agent to prevent Copilot prompts
    "defaultChatAgent": {},
})

# Remove marketplace, telemetry, VS Code onboarding keys
for key in [
    "extensionsGallery", "extensionTips", "extensionImportantTips",
    "extensionKeywords", "keymapExtensionTips", "webExtensionTips",
    "languageExtensionTips", "trustedExtensionAuthAccess",
    "linkProtectionTrustedDomains", "welcomePage",
    "enableTelemetry", "sendASmile", "surveys",
    "checksumFailMoreInfoUrl", "introductoryVideosUrl",
    "keyboardShortcutsUrlLinux", "keyboardShortcutsUrlMac", "keyboardShortcutsUrlWin",
    "releaseNotesUrl", "requestFeatureUrl", "tipsAndTricksUrl", "twitterUrl",
]:
    d.pop(key, None)

p.write_text(json.dumps(d, indent=2))
print(f"✅ product.json patched")
