import json, sys, pathlib

p = pathlib.Path(sys.argv[1])
d = json.loads(p.read_text())

d.update({
    "nameShort": "roscode",
    "nameLong": "roscode studio",
    "applicationName": "roscode-studio",
    "dataFolderName": ".roscode-studio",
    "win32MutexName": "roscodestudio",
    "licenseName": "MIT",
    "licenseUrl": "https://github.com/raguirref/roscode/blob/main/LICENSE",
    "reportIssueUrl": "https://github.com/raguirref/roscode/issues",
})

# Eliminar marketplace, telemetría, bienvenida de VS Code
for key in ["extensionsGallery", "extensionTips", "extensionImportantTips",
            "extensionKeywords", "keymapExtensionTips", "webExtensionTips",
            "languageExtensionTips", "trustedExtensionAuthAccess",
            "linkProtectionTrustedDomains", "welcomePage",
            "enableTelemetry", "sendASmile", "surveys"]:
    d.pop(key, None)

p.write_text(json.dumps(d, indent=2))
print(f"✅ product.json patcheado")
