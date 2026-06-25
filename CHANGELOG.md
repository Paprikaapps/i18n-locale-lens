# Changelog

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

