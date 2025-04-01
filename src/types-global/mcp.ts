// Type definitions for the MCP (Message Control Protocol) protocol

// Common response types
export interface McpContent {
  type: "text";
  text: string;
}

export interface McpToolResponse {
  content: McpContent[];
  isError?: boolean;
}

// Resource response types
export interface ResourceContent {
  uri: string;
  text: string;
  mimeType?: string;
}

export interface ResourceResponse {
  contents: ResourceContent[];
}

// Prompt response types
export interface PromptMessageContent {
  type: "text";
  text: string;
}

export interface PromptMessage {
  role: "user" | "assistant";
  content: PromptMessageContent;
}

export interface PromptResponse {
  messages: PromptMessage[];
}

// Helper functions
export const createToolResponse = (text: string, isError?: boolean): McpToolResponse => ({
  content: [{
    type: "text",
    text
  }],
  isError
});

export const createResourceResponse = (uri: string, text: string, mimeType?: string): ResourceResponse => ({
  contents: [{
    uri,
    text,
    mimeType
  }]
});

export const createPromptResponse = (text: string, role: "user" | "assistant" = "assistant"): PromptResponse => ({
  messages: [{
    role,
    content: {
      type: "text",
      text
    }
  }]
});