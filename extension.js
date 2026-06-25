const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

const DEFAULT_ENABLED_LANGUAGE_IDS = ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'];
const DEFAULT_LOCALES = ['ru'];
const DEFAULT_PATH_TEMPLATES = ['public/locales/{locale}/{namespaceFile}.json'];
const DEFAULT_NAMESPACE = 'translation';
const DEFAULT_NAMESPACE_FILE_MAP = {
  translation: 'common',
  common: 'common'
};
const STRING_RANGE_REGEXP = /(['"`])((?:\\.|(?!\1).)*)(\1)/g;
const STRING_CONSTANT_REGEXP = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"`])((?:\\.|(?!\2).)*)(\2)/g;
const TEMPLATE_EXPRESSION_REGEXP = /\$\{([^}]+)\}/g;
const IDENTIFIER_REGEXP = /^[A-Za-z_$][\w$]*$/;

/** @typedef {{ key: string, namespace: string | null }} TranslationKey */
/** @typedef {{ enabledLanguageIds: string[], locales: string[], pathTemplates: string[], defaultNamespace: string, namespaceFileMap: Record<string, string>, namespaceSeparator: string, keySeparator: string, searchAllNamespaceFilesForKeysWithoutNamespace: boolean, resolveTemplateStringExpressions: boolean, ignoreTemplateStringsWithExpressions: boolean }} ExtensionConfig */

/**
 * Activates the extension and registers Go to Definition for i18n keys.
 *
 * @param {vscode.ExtensionContext} context VS Code extension context.
 */
function activate(context) {
  const provider = vscode.languages.registerDefinitionProvider(
    { scheme: 'file' },
    {
      provideDefinition(document, position) {
        const config = getExtensionConfig(document.uri);

        if (!isLanguageEnabled(document, config)) {
          return undefined;
        }

        const rawKey = getTranslationKeyAtPosition(document, position, config);

        if (!rawKey) {
          return undefined;
        }

        const translationKey = parseTranslationKey(rawKey, config);

        if (!translationKey) {
          return undefined;
        }

        return findTranslationLocation(document, translationKey, config);
      }
    }
  );

  const jsonProvider = vscode.languages.registerDefinitionProvider(
    { scheme: 'file', language: 'json' },
    {
      provideDefinition(document, position, token) {
        return provideDefinitionFromJson(document, position, token);
      }
    }
  );

  context.subscriptions.push(provider);
  context.subscriptions.push(jsonProvider);
}

/**
 * Reads extension settings and applies safe defaults.
 *
 * @param {vscode.Uri} uri document URI for scoped configuration.
 * @returns {ExtensionConfig}
 */
function getExtensionConfig(uri) {
  const config = vscode.workspace.getConfiguration('i18nJsonGotoDefinition', uri);

  return {
    enabledLanguageIds: config.get('enabledLanguageIds', DEFAULT_ENABLED_LANGUAGE_IDS),
    locales: config.get('locales', DEFAULT_LOCALES),
    pathTemplates: config.get('pathTemplates', DEFAULT_PATH_TEMPLATES),
    defaultNamespace: config.get('defaultNamespace', DEFAULT_NAMESPACE),
    namespaceFileMap: config.get('namespaceFileMap', DEFAULT_NAMESPACE_FILE_MAP),
    namespaceSeparator: config.get('namespaceSeparator', ':'),
    keySeparator: config.get('keySeparator', '.'),
    searchAllNamespaceFilesForKeysWithoutNamespace: config.get(
      'searchAllNamespaceFilesForKeysWithoutNamespace',
      true
    ),
    resolveTemplateStringExpressions: config.get('resolveTemplateStringExpressions', true),
    ignoreTemplateStringsWithExpressions: config.get('ignoreTemplateStringsWithExpressions', true)
  };
}

/**
 * Checks whether the extension is enabled for a source document language.
 *
 * @param {vscode.TextDocument} document source document.
 * @param {ExtensionConfig} config extension settings.
 * @returns {boolean}
 */
function isLanguageEnabled(document, config) {
  return config.enabledLanguageIds.length === 0 || config.enabledLanguageIds.includes(document.languageId);
}

/**
 * Returns a translation key under cursor and resolves simple template string expressions.
 *
 * @param {vscode.TextDocument} document source document.
 * @param {vscode.Position} position cursor position.
 * @param {ExtensionConfig} config extension settings.
 * @returns {string | null}
 */
function getTranslationKeyAtPosition(document, position, config) {
  const rawKey = getStringLiteralAtPosition(document, position);

  if (!rawKey) {
    return null;
  }

  if (!rawKey.includes('${')) {
    return rawKey;
  }

  if (!config.resolveTemplateStringExpressions) {
    return rawKey;
  }

  return resolveTemplateString(rawKey, collectStringConstants(document), new Set());
}

/**
 * Returns the string literal under cursor without surrounding quotes.
 *
 * @param {vscode.TextDocument} document source document.
 * @param {vscode.Position} position cursor position.
 * @returns {string | null}
 */
function getStringLiteralAtPosition(document, position) {
  const line = document.lineAt(position.line).text;
  let match;

  STRING_RANGE_REGEXP.lastIndex = 0;

  while ((match = STRING_RANGE_REGEXP.exec(line))) {
    const start = match.index + 1;
    const end = match.index + match[0].length - 1;

    if (position.character >= start && position.character <= end) {
      return unescapeStringLiteral(match[2]);
    }
  }

  return null;
}

/**
 * Unescapes common JavaScript string literal escapes.
 *
 * @param {string} value raw string literal content.
 * @returns {string}
 */
function unescapeStringLiteral(value) {
  return value.replace(/\\(['"`\\])/g, '$1');
}

/**
 * Collects simple string constants from the current document.
 *
 * @param {vscode.TextDocument} document source document.
 * @returns {Map<string, string>}
 */
function collectStringConstants(document) {
  const constants = new Map();
  const text = document.getText();
  let match;

  STRING_CONSTANT_REGEXP.lastIndex = 0;

  while ((match = STRING_CONSTANT_REGEXP.exec(text))) {
    constants.set(match[1], unescapeStringLiteral(match[3]));
  }

  return constants;
}

/**
 * Resolves template expressions that reference local string constants.
 *
 * @param {string} value template string content.
 * @param {Map<string, string>} constants known string constants.
 * @param {Set<string>} resolving constants currently being resolved.
 * @returns {string | null}
 */
function resolveTemplateString(value, constants, resolving) {
  let result = '';
  let lastIndex = 0;
  let match;

  TEMPLATE_EXPRESSION_REGEXP.lastIndex = 0;

  while ((match = TEMPLATE_EXPRESSION_REGEXP.exec(value))) {
    const expression = match[1].trim();
    const resolvedExpression = resolveTemplateExpression(expression, constants, resolving);

    if (resolvedExpression === null) {
      return null;
    }

    result += value.slice(lastIndex, match.index) + resolvedExpression;
    lastIndex = match.index + match[0].length;
  }

  result += value.slice(lastIndex);

  return result;
}

/**
 * Resolves a single template expression.
 *
 * @param {string} expression template expression content.
 * @param {Map<string, string>} constants known string constants.
 * @param {Set<string>} resolving constants currently being resolved.
 * @returns {string | null}
 */
function resolveTemplateExpression(expression, constants, resolving) {
  if (!IDENTIFIER_REGEXP.test(expression) || !constants.has(expression) || resolving.has(expression)) {
    return null;
  }

  resolving.add(expression);

  const value = constants.get(expression);
  const resolvedValue = value.includes('${') ? resolveTemplateString(value, constants, resolving) : value;

  resolving.delete(expression);

  return resolvedValue;
}

/**
 * Parses namespace and translation key from a string value.
 *
 * @param {string} rawKey raw translation key.
 * @param {ExtensionConfig} config extension settings.
 * @returns {TranslationKey | null}
 */
function parseTranslationKey(rawKey, config) {
  if (!rawKey || (config.ignoreTemplateStringsWithExpressions && rawKey.includes('${'))) {
    return null;
  }

  const namespaceSeparatorIndex = config.namespaceSeparator
    ? rawKey.indexOf(config.namespaceSeparator)
    : -1;

  if (namespaceSeparatorIndex === -1) {
    return {
      key: rawKey,
      namespace: null
    };
  }

  const namespace = rawKey.slice(0, namespaceSeparatorIndex);

  if (!namespace || /\s/.test(namespace)) {
    return {
      key: rawKey,
      namespace: null
    };
  }

  return {
    namespace,
    key: rawKey.slice(namespaceSeparatorIndex + config.namespaceSeparator.length)
  };
}

/**
 * Finds the configured JSON location for a translation key.
 *
 * @param {vscode.TextDocument} sourceDocument source document.
 * @param {TranslationKey} translationKey parsed translation key.
 * @param {ExtensionConfig} config extension settings.
 * @returns {vscode.Location | undefined}
 */
function findTranslationLocation(sourceDocument, translationKey, config) {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(sourceDocument.uri);

  if (!workspaceFolder) {
    return undefined;
  }

  const namespaceFiles = getCandidateNamespaceFiles(workspaceFolder.uri.fsPath, translationKey, config);

  for (const filePath of namespaceFiles) {
    const location = findKeyLocationInFile(filePath, translationKey.key, config);

    if (location) {
      return location;
    }
  }

  return undefined;
}

/**
 * Builds candidate JSON files where the key may be located.
 *
 * @param {string} workspaceRoot workspace root.
 * @param {TranslationKey} translationKey parsed translation key.
 * @param {ExtensionConfig} config extension settings.
 * @returns {string[]}
 */
function getCandidateNamespaceFiles(workspaceRoot, translationKey, config) {
  const namespaces = translationKey.namespace
    ? [translationKey.namespace]
    : [config.defaultNamespace];
  const candidateFiles = [];

  for (const locale of config.locales) {
    for (const namespace of namespaces) {
      candidateFiles.push(...resolveNamespaceFiles(workspaceRoot, locale, namespace, config));
    }

    if (!translationKey.namespace && config.searchAllNamespaceFilesForKeysWithoutNamespace) {
      candidateFiles.push(...getAllLocaleJsonFiles(workspaceRoot, locale, config));
    }
  }

  return Array.from(new Set(candidateFiles));
}

/**
 * Resolves files for a namespace and configured path templates.
 *
 * @param {string} workspaceRoot workspace root.
 * @param {string} locale locale name.
 * @param {string} namespace translation namespace.
 * @param {ExtensionConfig} config extension settings.
 * @returns {string[]}
 */
function resolveNamespaceFiles(workspaceRoot, locale, namespace, config) {
  const namespaceFile = renderTemplate(config.namespaceFileMap[namespace] || namespace, {
    locale,
    namespace,
    namespaceFile: namespace
  });

  return config.pathTemplates.map((template) =>
    path.resolve(
      workspaceRoot,
      renderTemplate(template, {
        locale,
        namespace,
        namespaceFile
      })
    )
  );
}

/**
 * Applies supported placeholders to a path or file name template.
 *
 * @param {string} template template with placeholders.
 * @param {{ locale: string, namespace: string, namespaceFile: string }} values placeholder values.
 * @returns {string}
 */
function renderTemplate(template, values) {
  return template
    .replace(/\{locale\}/g, values.locale)
    .replace(/\{language\}/g, values.locale)
    .replace(/\{namespace\}/g, values.namespace)
    .replace(/\{namespaceFile\}/g, values.namespaceFile);
}

/**
 * Returns all JSON files in configured locale directories.
 *
 * @param {string} workspaceRoot workspace root.
 * @param {string} locale locale name.
 * @param {ExtensionConfig} config extension settings.
 * @returns {string[]}
 */
function getAllLocaleJsonFiles(workspaceRoot, locale, config) {
  const files = [];
  const directories = getLocaleDirectories(workspaceRoot, locale, config);

  for (const directory of directories) {
    collectJsonFiles(directory, files);
  }

  return files;
}

/**
 * Infers locale directories from path templates.
 *
 * @param {string} workspaceRoot workspace root.
 * @param {string} locale locale name.
 * @param {ExtensionConfig} config extension settings.
 * @returns {string[]}
 */
function getLocaleDirectories(workspaceRoot, locale, config) {
  const directories = config.pathTemplates.map((template) => {
    const renderedTemplate = renderTemplate(template, {
      locale,
      namespace: config.defaultNamespace,
      namespaceFile: config.namespaceFileMap[config.defaultNamespace] || config.defaultNamespace
    });
    const beforeNamespacePlaceholder = template.includes('{namespace') ? template.split('{namespace')[0] : null;
    const normalizedTemplate = beforeNamespacePlaceholder
      ? renderTemplate(beforeNamespacePlaceholder, {
          locale,
          namespace: config.defaultNamespace,
          namespaceFile: config.namespaceFileMap[config.defaultNamespace] || config.defaultNamespace
        })
      : path.dirname(renderedTemplate);

    return path.resolve(workspaceRoot, normalizedTemplate);
  });

  return Array.from(new Set(directories));
}

/**
 * Recursively collects JSON files from a directory.
 *
 * @param {string} directory directory to traverse.
 * @param {string[]} files collected files.
 */
function collectJsonFiles(directory, files) {
  if (!fs.existsSync(directory)) {
    return;
  }

  const stat = fs.statSync(directory);

  if (!stat.isDirectory()) {
    return;
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      collectJsonFiles(entryPath, files);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(entryPath);
    }
  }
}

/**
 * Finds a key location in a single JSON file.
 *
 * @param {string} filePath JSON locale file path.
 * @param {string} key full translation key.
 * @param {ExtensionConfig} config extension settings.
 * @returns {vscode.Location | undefined}
 */
function findKeyLocationInFile(filePath, key, config) {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  const text = fs.readFileSync(filePath, 'utf8');
  const locations = parseJsonKeyLocations(text, config.keySeparator);
  const offset = locations.get(key);

  if (offset === undefined) {
    return undefined;
  }

  const uri = vscode.Uri.file(filePath);
  const documentPosition = offsetToPosition(text, offset);

  return new vscode.Location(uri, documentPosition);
}

/**
 * Parses JSON and stores each nested key position as a key path.
 *
 * @param {string} text JSON file content.
 * @param {string} keySeparator key path separator.
 * @returns {Map<string, number>}
 */
function parseJsonKeyLocations(text, keySeparator) {
  const locations = new Map();
  let index = 0;

  parseValue([]);

  return locations;

  /**
   * Parses a JSON value.
   *
   * @param {string[]} pathParts current value path.
   */
  function parseValue(pathParts) {
    skipWhitespace();

    if (text[index] === '{') {
      parseObject(pathParts);
      return;
    }

    if (text[index] === '[') {
      parseArray(pathParts);
      return;
    }

    skipPrimitive();
  }

  /**
   * Parses a JSON object.
   *
   * @param {string[]} pathParts current object path.
   */
  function parseObject(pathParts) {
    index += 1;
    skipWhitespace();

    while (index < text.length && text[index] !== '}') {
      const keyStart = index;
      const key = parseString();
      const keyPath = [...pathParts, key].join(keySeparator);

      locations.set(keyPath, keyStart + 1);

      skipWhitespace();

      if (text[index] === ':') {
        index += 1;
      }

      parseValue([...pathParts, key]);
      skipWhitespace();

      if (text[index] === ',') {
        index += 1;
        skipWhitespace();
      }
    }

    if (text[index] === '}') {
      index += 1;
    }
  }

  /**
   * Parses a JSON array.
   *
   * @param {string[]} pathParts current array path.
   */
  function parseArray(pathParts) {
    index += 1;
    skipWhitespace();

    while (index < text.length && text[index] !== ']') {
      parseValue(pathParts);
      skipWhitespace();

      if (text[index] === ',') {
        index += 1;
        skipWhitespace();
      }
    }

    if (text[index] === ']') {
      index += 1;
    }
  }

  /**
   * Parses a JSON string and returns its value.
   *
   * @returns {string}
   */
  function parseString() {
    let result = '';

    if (text[index] !== '"') {
      return result;
    }

    index += 1;

    while (index < text.length) {
      const char = text[index];

      if (char === '"') {
        index += 1;
        return result;
      }

      if (char === '\\') {
        const nextChar = text[index + 1];

        if (nextChar === 'u') {
          const code = text.slice(index + 2, index + 6);
          result += String.fromCharCode(parseInt(code, 16));
          index += 6;
          continue;
        }

        result += getEscapedCharacter(nextChar);
        index += 2;
        continue;
      }

      result += char;
      index += 1;
    }

    return result;
  }

  /**
   * Skips a JSON primitive.
   */
  function skipPrimitive() {
    if (text[index] === '"') {
      parseString();
      return;
    }

    while (index < text.length && !/[\s,\]}]/.test(text[index])) {
      index += 1;
    }
  }

  /**
   * Skips whitespace.
   */
  function skipWhitespace() {
    while (index < text.length && /\s/.test(text[index])) {
      index += 1;
    }
  }
}

/**
 * Returns a character for a JSON escape sequence.
 *
 * @param {string} char escaped character.
 * @returns {string}
 */
function getEscapedCharacter(char) {
  switch (char) {
    case '"':
      return '"';
    case '\\':
      return '\\';
    case '/':
      return '/';
    case 'b':
      return '\b';
    case 'f':
      return '\f';
    case 'n':
      return '\n';
    case 'r':
      return '\r';
    case 't':
      return '\t';
    default:
      return char;
  }
}

/**
 * Converts a text offset to a VS Code position.
 *
 * @param {string} text source text.
 * @param {number} offset text offset.
 * @returns {vscode.Position}
 */
function offsetToPosition(text, offset) {
  let line = 0;
  let character = 0;

  for (let i = 0; i < offset; i += 1) {
    if (text[i] === '\n') {
      line += 1;
      character = 0;
    } else {
      character += 1;
    }
  }

  return new vscode.Position(line, character);
}

/**
 * Provides Go to Definition from a JSON locale key to its usages in source code.
 *
 * @param {vscode.TextDocument} document JSON locale document.
 * @param {vscode.Position} position cursor position.
 * @param {vscode.CancellationToken} token cancellation token.
 * @returns {Promise<vscode.Location[] | undefined>}
 */
async function provideDefinitionFromJson(document, position, token) {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);

  if (!workspaceFolder) {
    return undefined;
  }

  const config = getExtensionConfig(document.uri);
  const namespaces = inferNamespacesFromFilePath(document.uri.fsPath, workspaceFolder.uri.fsPath, config);

  if (!namespaces) {
    return undefined;
  }

  const keyPath = getJsonKeyAtPosition(document, position, config);

  if (!keyPath) {
    return undefined;
  }

  const searchKeys = buildSearchKeys(keyPath, namespaces, config);

  return findKeyUsagesInCode(workspaceFolder, searchKeys, config, token);
}

/**
 * Returns the full key path at the cursor position inside a JSON document.
 *
 * @param {vscode.TextDocument} document JSON document.
 * @param {vscode.Position} position cursor position.
 * @param {ExtensionConfig} config extension settings.
 * @returns {string | null}
 */
function getJsonKeyAtPosition(document, position, config) {
  const text = document.getText();
  const cursorOffset = document.offsetAt(position);
  const keyRanges = parseJsonKeyRanges(text, config.keySeparator);

  for (const [keyPath, range] of keyRanges) {
    if (cursorOffset >= range.start && cursorOffset <= range.end) {
      return keyPath;
    }
  }

  return null;
}

/**
 * Parses JSON text and returns a map of key paths to their source character ranges.
 * The range covers the opening quote through the closing quote of the key string.
 *
 * @param {string} text JSON text.
 * @param {string} keySeparator key path separator.
 * @returns {Map<string, {start: number, end: number}>}
 */
function parseJsonKeyRanges(text, keySeparator) {
  const ranges = new Map();
  let index = 0;

  parseValue([]);

  return ranges;

  function parseValue(pathParts) {
    skipWhitespace();

    if (text[index] === '{') {
      parseObject(pathParts);
      return;
    }

    if (text[index] === '[') {
      parseArray(pathParts);
      return;
    }

    skipPrimitive();
  }

  function parseObject(pathParts) {
    index += 1;
    skipWhitespace();

    while (index < text.length && text[index] !== '}') {
      const keyStart = index;
      const key = parseString();
      const keyEnd = index - 1;
      const keyPath = [...pathParts, key].join(keySeparator);

      ranges.set(keyPath, { start: keyStart, end: keyEnd });

      skipWhitespace();

      if (text[index] === ':') {
        index += 1;
      }

      parseValue([...pathParts, key]);
      skipWhitespace();

      if (text[index] === ',') {
        index += 1;
        skipWhitespace();
      }
    }

    if (text[index] === '}') {
      index += 1;
    }
  }

  function parseArray(pathParts) {
    index += 1;
    skipWhitespace();

    while (index < text.length && text[index] !== ']') {
      parseValue(pathParts);
      skipWhitespace();

      if (text[index] === ',') {
        index += 1;
        skipWhitespace();
      }
    }

    if (text[index] === ']') {
      index += 1;
    }
  }

  function parseString() {
    let result = '';

    if (text[index] !== '"') {
      return result;
    }

    index += 1;

    while (index < text.length) {
      const char = text[index];

      if (char === '"') {
        index += 1;
        return result;
      }

      if (char === '\\') {
        const nextChar = text[index + 1];

        if (nextChar === 'u') {
          const code = text.slice(index + 2, index + 6);
          result += String.fromCharCode(parseInt(code, 16));
          index += 6;
          continue;
        }

        result += getEscapedCharacter(nextChar);
        index += 2;
        continue;
      }

      result += char;
      index += 1;
    }

    return result;
  }

  function skipPrimitive() {
    if (text[index] === '"') {
      parseString();
      return;
    }

    while (index < text.length && !/[\s,\]}]/.test(text[index])) {
      index += 1;
    }
  }

  function skipWhitespace() {
    while (index < text.length && /\s/.test(text[index])) {
      index += 1;
    }
  }
}

/**
 * Converts a path template to a regular expression with capture groups for namespace placeholders.
 *
 * @param {string} template path template string.
 * @returns {{ regex: RegExp, groups: Record<number, string> }}
 */
function templateToRegex(template) {
  const groups = {};
  let groupNum = 1;
  let pattern = '^';

  const parts = template.split(/(\{(?:locale|language|namespace|namespaceFile)\})/g);

  for (const part of parts) {
    const placeholderMatch = /^\{(locale|language|namespace|namespaceFile)\}$/.exec(part);

    if (placeholderMatch) {
      const name = placeholderMatch[1];

      if (name === 'namespace' || name === 'namespaceFile') {
        groups[groupNum] = name;
        groupNum += 1;
        pattern += '([^/]+)';
      } else {
        pattern += '[^/]+';
      }
    } else {
      pattern += part.replace(/[.+*?^${}()|[\]\\]/g, '\\$&');
    }
  }

  pattern += '$';

  return { regex: new RegExp(pattern), groups };
}

/**
 * Infers namespace names for a JSON file by matching it against configured path templates.
 * Returns null when the file does not match any locale path template.
 *
 * @param {string} filePath absolute path to the JSON file.
 * @param {string} workspaceRoot workspace root path.
 * @param {ExtensionConfig} config extension settings.
 * @returns {string[] | null}
 */
function inferNamespacesFromFilePath(filePath, workspaceRoot, config) {
  const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');

  for (const template of config.pathTemplates) {
    const { regex, groups } = templateToRegex(template);
    const match = regex.exec(relativePath);

    if (!match) {
      continue;
    }

    let namespace = null;
    let namespaceFile = null;

    for (const [groupIndex, groupName] of Object.entries(groups)) {
      if (groupName === 'namespace') {
        namespace = match[parseInt(groupIndex)];
      } else if (groupName === 'namespaceFile') {
        namespaceFile = match[parseInt(groupIndex)];
      }
    }

    if (namespace) {
      return [namespace];
    }

    if (namespaceFile) {
      const namespaces = [];

      for (const [ns, file] of Object.entries(config.namespaceFileMap)) {
        if (file === namespaceFile) {
          namespaces.push(ns);
        }
      }

      if (namespaces.length === 0) {
        namespaces.push(namespaceFile);
      }

      return namespaces;
    }

    return [config.defaultNamespace];
  }

  return null;
}

/**
 * Builds all key strings that could appear in source code for a given JSON key and namespace list.
 *
 * @param {string} keyPath translation key path (e.g. "login.title").
 * @param {string[]} namespaces namespace names inferred from the locale file.
 * @param {ExtensionConfig} config extension settings.
 * @returns {string[]}
 */
function buildSearchKeys(keyPath, namespaces, config) {
  const keys = new Set();
  const sep = config.namespaceSeparator || ':';

  for (const namespace of namespaces) {
    keys.add(`${namespace}${sep}${keyPath}`);

    if (namespace === config.defaultNamespace) {
      keys.add(keyPath);
    }
  }

  return Array.from(keys);
}

/**
 * Searches source files in the workspace for string literal usages of translation keys.
 * Uses VS Code's built-in text search (ripgrep) for performance.
 *
 * @param {vscode.WorkspaceFolder} workspaceFolder workspace folder to search.
 * @param {string[]} searchKeys key strings to look for.
 * @param {ExtensionConfig} config extension settings.
 * @param {vscode.CancellationToken} token cancellation token.
 * @returns {Promise<vscode.Location[]>}
 */
async function findKeyUsagesInCode(workspaceFolder, searchKeys, config, token) {
  const locations = [];
  const fileGlob = buildSourceFileGlob(config);
  const include = new vscode.RelativePattern(workspaceFolder, fileGlob);

  for (const searchKey of searchKeys) {
    if (token && token.isCancellationRequested) {
      break;
    }

    const escaped = searchKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    await vscode.workspace.findTextInFiles(
      { pattern: `['"\`]${escaped}['"\`]`, isRegExp: true },
      { include, exclude: '**/node_modules/**' },
      (result) => {
        if (token && token.isCancellationRequested) {
          return;
        }

        const ranges = Array.isArray(result.ranges) ? result.ranges : [result.ranges];

        for (const range of ranges) {
          // Shift one character right to skip the opening quote
          const start = new vscode.Position(range.start.line, range.start.character + 1);
          locations.push(new vscode.Location(result.uri, start));
        }
      },
      token
    );
  }

  return locations;
}

/**
 * Builds a glob pattern that matches all source files for the enabled language IDs.
 *
 * @param {ExtensionConfig} config extension settings.
 * @returns {string}
 */
function buildSourceFileGlob(config) {
  const langToExt = {
    typescript: 'ts',
    typescriptreact: 'tsx',
    javascript: 'js',
    javascriptreact: 'jsx',
    vue: 'vue',
    svelte: 'svelte'
  };

  const extensions = config.enabledLanguageIds
    .map((lang) => langToExt[lang] || lang)
    .filter(Boolean);

  if (extensions.length === 0) {
    return '**/*.{ts,tsx,js,jsx}';
  }

  if (extensions.length === 1) {
    return `**/*.${extensions[0]}`;
  }

  return `**/*.{${extensions.join(',')}}`;
}

/**
 * Deactivates the extension.
 */
function deactivate() {}

module.exports = {
  activate,
  deactivate
};
