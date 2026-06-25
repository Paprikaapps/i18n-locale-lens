# i18n Locale Lens

Jump from i18n keys in code to their JSON locale definitions, see translations inline, and catch missing keys automatically.

## Features

### Go to Definition
Press `F12` or Cmd/Ctrl-click on any i18n key to jump directly to its entry in the locale JSON file.

```ts
t('task.canceled')  // F12 → opens common.json at the "canceled" key
```

### Inline Translation
The translated value is displayed in italic right after each key in the editor — no need to open the JSON file to know what a key says.

```ts
t('task.filters.due date from')   Срок сдачи с
t('auth:login.title')             Войти
```

### Hover Tooltip
Hover over any key to see its translated value for all configured locales in a popup.

### Autocomplete
Get key suggestions when typing inside a string — includes the translated value as documentation.

### Missing Key Diagnostics
Keys that have no matching entry in any locale JSON file are underlined with a warning so you catch typos early.

```ts
t('task.nonexistent')  // ⚠ i18n key not found: "task.nonexistent"
```

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
