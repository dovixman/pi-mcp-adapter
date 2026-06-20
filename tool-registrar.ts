// tool-registrar.ts - MCP content transformation
// NOTE: Tools are NOT registered with Pi - only the unified `mcp` proxy tool is registered.
// This keeps the LLM context small (1 tool instead of 100s).

import type { McpContent, ContentBlock } from "./types.ts";

/**
 * Transform MCP content types to Pi content blocks.
 */
export function transformMcpContent(content: McpContent[]): ContentBlock[] {
  return content.map(c => {
    if (c.type === "text") {
      return { type: "text" as const, text: c.text ?? "" };
    }
    if (c.type === "image") {
      return {
        type: "image" as const,
        data: c.data ?? "",
        mimeType: c.mimeType ?? "image/png",
      };
    }
    if (c.type === "resource") {
      const resourceUri = c.resource?.uri ?? "(no URI)";
      const resourceContent = c.resource?.text ?? (c.resource ? JSON.stringify(c.resource) : "(no content)");
      return {
        type: "text" as const,
        text: `[Resource: ${resourceUri}]\n${resourceContent}`,
      };
    }
    if (c.type === "resource_link") {
      const linkName = c.name ?? c.uri ?? "unknown";
      const linkUri = c.uri ?? "(no URI)";
      return {
        type: "text" as const,
        text: `[Resource Link: ${linkName}]\nURI: ${linkUri}`,
      };
    }
    if (c.type === "audio") {
      return {
        type: "text" as const,
        text: `[Audio content: ${c.mimeType ?? "audio/*"}]`,
      };
    }
    return { type: "text" as const, text: JSON.stringify(c) };
  });
}

/**
 * Resolve the content blocks for an MCP tool result.
 *
 * Per the MCP spec, `content` is mandatory while `structuredContent` is
 * optional, but some servers return their payload only in `structuredContent`
 * with an empty `content: []`. In that case we serialize `structuredContent`
 * to a text block instead of dropping the data (which would surface as an
 * "(empty result)" to the model). See nicobailon/pi-mcp-adapter#113.
 *
 * Note: when this fallback fires, `structuredContent` is exposed to the model
 * even though the server placed nothing in `content`. Servers should not put
 * data in `structuredContent` that they would not want the model to see.
 *
 * Typed as `Record<string, unknown>` rather than the SDK `CallToolResult`:
 * that type is a union whose `{ toolResult }` variant has no `content`, which
 * makes structural call-site arguments fail to type-check. The runtime guards
 * below validate shape defensively, so the wide type is safe here.
 */
export function resolveMcpResultContent(result: Record<string, unknown>): ContentBlock[] {
  const blocks = transformMcpContent((Array.isArray(result.content) ? result.content : []) as McpContent[]);
  if (blocks.length > 0) return blocks;

  if (result.structuredContent !== undefined && result.structuredContent !== null) {
    return [{ type: "text" as const, text: stringifyStructuredContent(result.structuredContent) }];
  }

  return [];
}

function stringifyStructuredContent(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    // Circular references or throwing getters — degrade instead of failing the call.
    return String(value);
  }
}
