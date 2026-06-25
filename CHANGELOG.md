# Changelog

## 0.2.4

- Reverted inline decoration to clean italic text style (no badge/border) using inlay hint color for better readability.
- Updated README and description to reflect current features.

## 0.2.3

- Fixed false positive warnings on PascalCase/TitleCase dot-separated strings (e.g. Mixpanel tracking events like 'User.Filtration.Click').
- Improved inline decoration style: uses inlay hint colors, rounded badge, and '→ ' prefix for better visibility.

## 0.2.2

- Improved translation key detection: no longer flags single-char strings (e.g. ':'), strings without letters, or camelCase identifiers (e.g. 'editorCodeLens.foreground').

## 0.2.1

- Fixed false positive diagnostics and decorations on import paths, package names, and other non-i18n strings. Now only string literals that follow a translation function call or contain a key separator are checked.

## 0.2.0

- Added hover tooltip: hovering over an i18n key shows its translated value for all configured locales.
- Added autocomplete: suggests all known translation keys when typing inside a string literal.
- Added inline decorations: the translated text is shown in italic after each key directly in the editor.
- Added diagnostics: keys that have no matching entry in any locale JSON are underlined with a warning.

## 0.1.1

- Fixed reverse navigation not working when the locale file path does not exactly match path templates: added fallback locale directory detection.
- Fixed silent crash when findTextInFiles returns context-only results without ranges.
- Reverse navigation now always searches for the bare key in addition to namespace-prefixed variants.

## 0.1.0

- Updated repository URL to the Paprikaapps GitHub organization.

## 0.0.9

- Added repository field to package.json.

## 0.0.8

- Fixed reverse navigation returning no results: replaced unsupported backreference regex with a ripgrep-compatible pattern.

## 0.0.7

- Improved reverse navigation performance: replaced manual file scanning with VS Code's built-in ripgrep search.
- Added cancellation token support for reverse navigation to avoid stale results.

## 0.0.6

- Added reverse Go to Definition: press F12 on a key inside a JSON locale file to jump to all usages of that key in source code.

## 0.0.5

- Added support for simple template strings that reference local string constants.

## 0.0.4

- Renamed the extension display name to i18n Locale Lens.

## 0.0.3

- Renamed the extension display name to Locale Lens.
- Added a marketplace icon.
- Updated marketplace description and keywords.

## 0.0.2

- Removed publishing instructions from packaged extension documentation.

## 0.0.1

- Initial release.
- Added configurable Go to Definition for i18n keys stored in JSON locale files.
- Added support for namespaces, locale path templates, and nested JSON keys.

