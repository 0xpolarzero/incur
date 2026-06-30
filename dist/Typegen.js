import fs from 'node:fs/promises';
import { z } from 'zod';
import * as RuntimeContext from './internal/runtime-context.js';
import { importCli } from './internal/utils.js';
/** Imports a CLI from `input` (must `export default` a `Cli`), generates the `.d.ts`, and writes it to `output`. */
export async function generate(input, output) {
    const cli = await importCli(input);
    await fs.writeFile(output, fromCli(cli));
}
/** Generates a `.d.ts` declaration string for the `incur` module augmentation. */
export function fromCli(cli) {
    const entries = RuntimeContext.collectStructuredCommands(RuntimeContext.fromCli(cli));
    const lines = ['export type Commands = {'];
    for (const { id, command } of entries)
        lines.push(`  ${propertyKey(id)}: { args: ${objectSchemaToType(command.args)}; options: ${objectSchemaToType(command.options)}${command.output ? `; output: ${schemaToType(command.output)}` : ''}${isStream(command) ? '; stream: true' : ''} }`);
    lines.push('}', '', "declare module 'incur' {", '  interface Register {', '    commands: Commands', '  }', '}', '', "declare module 'incur/client' {", '  interface Register {', '    commands: Commands', '  }', '}', '');
    return lines.join('\n');
}
/** Converts a Zod object schema to a TypeScript type string. Returns `{}` for undefined schemas. */
function objectSchemaToType(schema) {
    if (!schema)
        return '{}';
    return schemaToType(schema);
}
/** Converts a Zod schema to a TypeScript type string. */
function schemaToType(schema) {
    const json = z.toJSONSchema(schema);
    const defs = (json.$defs ?? {});
    return resolveType(json, defs);
}
/** Recursively resolves a JSON Schema node to a TypeScript type string. */
function resolveType(schema, defs) {
    if (schema.$ref) {
        const ref = schema.$ref.replace('#/$defs/', '');
        const resolved = defs[ref];
        if (resolved)
            return resolveType(resolved, defs);
        return 'unknown';
    }
    if ('const' in schema)
        return JSON.stringify(schema.const);
    if (schema.enum)
        return schema.enum.map((v) => JSON.stringify(v)).join(' | ');
    if (schema.anyOf)
        return schema.anyOf.map((s) => resolveType(s, defs)).join(' | ');
    const type = schema.type;
    if (Array.isArray(type))
        return type
            .map((t) => (t === 'null' ? 'null' : resolveType({ ...schema, type: t }, defs)))
            .join(' | ');
    switch (type) {
        case 'string':
            return 'string';
        case 'number':
        case 'integer':
            return 'number';
        case 'boolean':
            return 'boolean';
        case 'null':
            return 'null';
        case 'array': {
            const items = schema.items;
            const itemType = items ? resolveType(items, defs) : 'unknown';
            return itemType.includes(' | ') ? `(${itemType})[]` : `${itemType}[]`;
        }
        case 'object': {
            const properties = schema.properties;
            if (!properties || Object.keys(properties).length === 0)
                return '{}';
            const required = new Set(schema.required ?? []);
            const entries = Object.entries(properties).map(([key, value]) => {
                const type = resolveType(value, defs);
                if (required.has(key))
                    return `${propertyKey(key)}: ${type}`;
                return `${propertyKey(key)}?: ${type} | undefined`;
            });
            return `{ ${entries.join('; ')} }`;
        }
        default:
            return 'unknown';
    }
}
function propertyKey(key) {
    return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}
function isStream(command) {
    return command.run.constructor.name === 'AsyncGeneratorFunction';
}
//# sourceMappingURL=Typegen.js.map