# i18n Locale Lens

Jump between i18n keys in code and their JSON locale definitions — in both directions.

- **Code → JSON:** put the cursor on an i18n key, press `F12` or Cmd/Ctrl-click it, and jump directly to the matching key in your locale JSON.
- **JSON → Code:** put the cursor on a key inside a locale JSON file, press `F12` or Cmd/Ctrl-click it, and jump to all usages of that key in your source files.

## Features

- Supports JavaScript, TypeScript, JSX, and TSX by default.
- Can be enabled for any VS Code language ID through settings.
- Works with nested JSON objects and dot-separated keys.
- Supports i18next-style namespaces such as `auth:login.title`.
- Resolves simple template strings based on local string constants.
- Supports configurable locale path templates.
- Can search multiple locales and multiple namespace files.
- Reverse navigation from JSON locale keys to all their usages in source code.

## Default Behavior

The default configuration supports projects with this structure:

```text
public/locales/ru/common.json
public/locales/ru/auth.json
public/locales/en/common.json
```

Examples:

```ts
t('common.button.ok');
t('lesson.call dialog.ready to start lesson');
t('auth:login.title');

const NOTIFICATION_SETTINGS_LOCAL_KEY = 'notification settings';
t(`${NOTIFICATION_SETTINGS_LOCAL_KEY}.header text`);
```

## Settings

```json
{
  "i18nJsonGotoDefinition.enabledLanguageIds": ["typescript", "typescriptreact", "javascript", "javascriptreact"],
  "i18nJsonGotoDefinition.locales": ["ru"],
  "i18nJsonGotoDefinition.pathTemplates": ["public/locales/{locale}/{namespaceFile}.json"],
  "i18nJsonGotoDefinition.defaultNamespace": "translation",
  "i18nJsonGotoDefinition.namespaceFileMap": {
    "translation": "common",
    "common": "common"
  },
  "i18nJsonGotoDefinition.namespaceSeparator": ":",
  "i18nJsonGotoDefinition.keySeparator": ".",
  "i18nJsonGotoDefinition.searchAllNamespaceFilesForKeysWithoutNamespace": true,
  "i18nJsonGotoDefinition.resolveTemplateStringExpressions": true,
  "i18nJsonGotoDefinition.ignoreTemplateStringsWithExpressions": true
}
```

## Path Template Placeholders

- `{locale}` and `{language}` are replaced with values from `i18nJsonGotoDefinition.locales`.
- `{namespace}` is replaced with the namespace from the key.
- `{namespaceFile}` is replaced with `namespaceFileMap[namespace]`, or with the namespace itself when there is no mapping.

## Configuration Examples

Single JSON file per locale:

```json
{
  "i18nJsonGotoDefinition.locales": ["ru", "en"],
  "i18nJsonGotoDefinition.pathTemplates": ["locales/{locale}.json"],
  "i18nJsonGotoDefinition.defaultNamespace": "translation",
  "i18nJsonGotoDefinition.namespaceFileMap": {
    "translation": "{locale}"
  }
}
```

Namespace folders:

```json
{
  "i18nJsonGotoDefinition.locales": ["ru"],
  "i18nJsonGotoDefinition.pathTemplates": ["src/i18n/{locale}/{namespaceFile}/index.json"],
  "i18nJsonGotoDefinition.namespaceFileMap": {
    "translation": "common",
    "auth": "auth"
  }
}
```

Enable all file types:

```json
{
  "i18nJsonGotoDefinition.enabledLanguageIds": []
}
```

