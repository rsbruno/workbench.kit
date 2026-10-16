export type DailyAnswer = { hasContent: boolean; daily: string };

export const DAILY_SCHEMA = {
  properties: {
    hasContent: { description: "false when the commits do not allow reporting anything useful", type: "boolean" },
    daily: { description: "the daily text", type: "string" }
  },
  required: ["daily", "hasContent"],
  additionalProperties: false,
  type: "object"
} as const;

/** A JSON Schema object handed to the agent CLI. */
export type JsonSchema = Record<string, unknown>;
