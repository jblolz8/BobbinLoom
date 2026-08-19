import { describe, expect, it } from "vitest";
import { resolveModelInfo } from "../src/client/components/base/ModelIcon";

describe("resolveModelInfo", () => {
  it("resolves DeepSeek models with exact model name", () => {
    expect(resolveModelInfo("deepseek-chat")).toEqual({
      family: "deepseek",
      displayName: "deepseek-chat",
      rawModel: "deepseek-chat"
    });
    expect(resolveModelInfo("deepseek/deepseek-reasoner")).toEqual({
      family: "deepseek",
      displayName: "deepseek-reasoner",
      rawModel: "deepseek/deepseek-reasoner"
    });
    expect(resolveModelInfo("deepseek-v4-flash")).toEqual({
      family: "deepseek",
      displayName: "deepseek-v4-flash",
      rawModel: "deepseek-v4-flash"
    });
  });

  it("resolves Anthropic Claude models with exact model name", () => {
    expect(resolveModelInfo("claude-3-5-sonnet-20241022")).toEqual({
      family: "anthropic",
      displayName: "claude-3-5-sonnet-20241022",
      rawModel: "claude-3-5-sonnet-20241022"
    });
    expect(resolveModelInfo("anthropic/claude-3-7-sonnet")).toEqual({
      family: "anthropic",
      displayName: "claude-3-7-sonnet",
      rawModel: "anthropic/claude-3-7-sonnet"
    });
    expect(resolveModelInfo("claude-3-haiku-20240307")).toEqual({
      family: "anthropic",
      displayName: "claude-3-haiku-20240307",
      rawModel: "claude-3-haiku-20240307"
    });
  });

  it("resolves OpenAI models with exact model name", () => {
    expect(resolveModelInfo("gpt-4o")).toEqual({
      family: "openai",
      displayName: "gpt-4o",
      rawModel: "gpt-4o"
    });
    expect(resolveModelInfo("openai/gpt-4o-mini")).toEqual({
      family: "openai",
      displayName: "gpt-4o-mini",
      rawModel: "openai/gpt-4o-mini"
    });
    expect(resolveModelInfo("o1-mini")).toEqual({
      family: "openai",
      displayName: "o1-mini",
      rawModel: "o1-mini"
    });
    expect(resolveModelInfo("o3-mini")).toEqual({
      family: "openai",
      displayName: "o3-mini",
      rawModel: "o3-mini"
    });
  });

  it("resolves Gemini models with exact model name", () => {
    expect(resolveModelInfo("gemini-1.5-pro")).toEqual({
      family: "gemini",
      displayName: "gemini-1.5-pro",
      rawModel: "gemini-1.5-pro"
    });
    expect(resolveModelInfo("google/gemini-2.0-flash")).toEqual({
      family: "gemini",
      displayName: "gemini-2.0-flash",
      rawModel: "google/gemini-2.0-flash"
    });
    expect(resolveModelInfo("gemini-2.5-pro")).toEqual({
      family: "gemini",
      displayName: "gemini-2.5-pro",
      rawModel: "gemini-2.5-pro"
    });
    expect(resolveModelInfo("gemma-2-27b-it")).toEqual({
      family: "gemini",
      displayName: "gemma-2-27b-it",
      rawModel: "gemma-2-27b-it"
    });
  });

  it("resolves Meta Llama models with exact model name", () => {
    expect(resolveModelInfo("llama-3.3-70b-instruct")).toEqual({
      family: "meta",
      displayName: "llama-3.3-70b-instruct",
      rawModel: "llama-3.3-70b-instruct"
    });
    expect(resolveModelInfo("meta-llama/llama-3.1-8b-instruct")).toEqual({
      family: "meta",
      displayName: "llama-3.1-8b-instruct",
      rawModel: "meta-llama/llama-3.1-8b-instruct"
    });
  });

  it("resolves Mistral models with exact model name", () => {
    expect(resolveModelInfo("mistral-large-latest")).toEqual({
      family: "mistral",
      displayName: "mistral-large-latest",
      rawModel: "mistral-large-latest"
    });
    expect(resolveModelInfo("codestral-latest")).toEqual({
      family: "mistral",
      displayName: "codestral-latest",
      rawModel: "codestral-latest"
    });
  });

  it("resolves Qwen models with exact model name", () => {
    expect(resolveModelInfo("qwen2.5-72b-instruct")).toEqual({
      family: "qwen",
      displayName: "qwen2.5-72b-instruct",
      rawModel: "qwen2.5-72b-instruct"
    });
  });

  it("resolves Cohere & Grok models with exact model name", () => {
    expect(resolveModelInfo("command-r-plus")).toEqual({
      family: "cohere",
      displayName: "command-r-plus",
      rawModel: "command-r-plus"
    });
    expect(resolveModelInfo("x-ai/grok-2")).toEqual({
      family: "grok",
      displayName: "grok-2",
      rawModel: "x-ai/grok-2"
    });
  });

  it("handles null / empty / fallback models", () => {
    expect(resolveModelInfo(null)).toEqual({
      family: "generic",
      displayName: "AI Model",
      rawModel: ""
    });
    expect(resolveModelInfo("my-custom-finetune")).toEqual({
      family: "generic",
      displayName: "my-custom-finetune",
      rawModel: "my-custom-finetune"
    });
  });
});
