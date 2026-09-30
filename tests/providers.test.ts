/**
 * tests/providers.test.ts
 *
 * Tests for the Translation Provider Abstraction (v1.1).
 * All external calls are mocked — no real API keys required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ProviderError } from "../src/providers/types";
import {
  ProviderRegistry,
  buildDefaultRegistry,
  resolveProvider,
  validateProviderShape,
} from "../src/providers/registry";
import { GoogleProvider } from "../src/providers/google";
import { OpenAIProvider } from "../src/providers/openai";
import { ClaudeProvider } from "../src/providers/claude";
import { LibreTranslateProvider } from "../src/providers/libretranslate";
import { MyMemoryProvider } from "../src/providers/mymemory";
import { AWSProvider } from "../src/providers/aws";

// vi.mock is hoisted above imports, so SDK mocks must be declared once at
// module level; per-test behaviour is set on the shared mock fns.
const { awsSend, claudeCreate, MockAPIError } = vi.hoisted(() => {
  class MockAPIError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  }
  return { awsSend: vi.fn(), claudeCreate: vi.fn(), MockAPIError };
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    static APIError = MockAPIError;
    beta = { messages: { create: claudeCreate } };
  },
}));

vi.mock("@aws-sdk/client-translate", () => ({
  TranslateClient: class {
    send = awsSend;
  },
  TranslateTextCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockFetchOk(body: unknown) {
  return vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);
}

function mockFetchError(status: number, bodyText = "Bad Request") {
  return vi.spyOn(global, "fetch").mockResolvedValue({
    ok: false,
    status,
    json: async () => ({}),
    text: async () => bodyText,
  } as Response);
}

function mockFetchNetworkFailure(message = "Network error") {
  return vi.spyOn(global, "fetch").mockRejectedValue(new Error(message));
}

const SAMPLE_INPUT = { greeting: "Hello", farewell: "Goodbye" };
const SAMPLE_TRANSLATED_ES = { greeting: "Hola", farewell: "Adiós" };

// ─── ProviderError ────────────────────────────────────────────────────────────

describe("ProviderError", () => {
  it("includes provider name in message", () => {
    const err = new ProviderError("openai", "rate limit exceeded");
    expect(err.message).toBe("[openai] rate limit exceeded");
    expect(err.providerName).toBe("openai");
    expect(err.name).toBe("ProviderError");
  });

  it("wraps an Error cause", () => {
    const cause = new Error("connection refused");
    const err = new ProviderError("google", cause);
    expect(err.message).toBe("[google] connection refused");
  });

  it("is instanceof Error", () => {
    const err = new ProviderError("openai", "bad key");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ProviderError);
  });
});

// ─── ProviderRegistry ─────────────────────────────────────────────────────────

describe("ProviderRegistry", () => {
  it("registers and retrieves a provider by name", () => {
    const registry = new ProviderRegistry();
    const provider = { name: "test", translate: async () => ({}) };
    registry.register(provider);
    expect(registry.get("test")).toBe(provider);
  });

  it("throws on duplicate registration", () => {
    const registry = new ProviderRegistry();
    const provider = { name: "test", translate: async () => ({}) };
    registry.register(provider);
    expect(() => registry.register(provider)).toThrow("test");
  });

  it("throws on unknown provider lookup", () => {
    const registry = new ProviderRegistry();
    expect(() => registry.get("nonexistent")).toThrow("nonexistent");
  });

  it("listNames returns names in insertion order", () => {
    const registry = new ProviderRegistry();
    registry.register({ name: "a", translate: async () => ({}) });
    registry.register({ name: "b", translate: async () => ({}) });
    registry.register({ name: "c", translate: async () => ({}) });
    expect(registry.listNames()).toEqual(["a", "b", "c"]);
  });
});

// ─── validateProviderShape ────────────────────────────────────────────────────

describe("validateProviderShape", () => {
  it("passes for a valid shape", () => {
    expect(() =>
      validateProviderShape({ name: "x", translate: () => {} }),
    ).not.toThrow();
  });

  it("throws when name is missing", () => {
    expect(() => validateProviderShape({ translate: () => {} })).toThrow(
      "name",
    );
  });

  it("throws when translate is missing", () => {
    expect(() => validateProviderShape({ name: "x" })).toThrow("translate");
  });

  it("throws listing both missing fields", () => {
    expect(() => validateProviderShape({})).toThrow();
  });
});

// ─── buildDefaultRegistry ────────────────────────────────────────────────────

describe("buildDefaultRegistry", () => {
  it("registers only providers with credentials", () => {
    const registry = buildDefaultRegistry({
      claude: { apiKey: "ck" },
      google: { apiKey: "gk" },
    });
    const names = registry.listNames();
    expect(names).toContain("claude");
    expect(names).toContain("google");
    expect(names).not.toContain("lingo");
    expect(names).not.toContain("openai");
    expect(names).not.toContain("aws");
  });

  it("registers mymemory even without email (empty string is valid)", () => {
    const registry = buildDefaultRegistry({ mymemory: { email: "" } });
    expect(registry.listNames()).toContain("mymemory");
  });

  it("does not register aws when credentials are incomplete", () => {
    const registry = buildDefaultRegistry({
      aws: { accessKeyId: "ak", secretAccessKey: "", region: "us-east-1" },
    });
    expect(registry.listNames()).not.toContain("aws");
  });
});

// ─── resolveProvider ─────────────────────────────────────────────────────────

describe("resolveProvider", () => {
  it("explains what is needed when custom is chosen without a path", async () => {
    for (const customPath of [undefined, "", "   "]) {
      await expect(
        resolveProvider(new ProviderRegistry(), "custom", customPath),
      ).rejects.toThrow("needs the path to a JS file");
    }
  });

  it("reports a missing custom provider file", async () => {
    await expect(
      resolveProvider(new ProviderRegistry(), "custom", "./does-not-exist.js"),
    ).rejects.toThrow("Custom provider file not found");
  });
});

// ─── Empty input short-circuit ────────────────────────────────────────────────

describe("Empty input short-circuit (all providers)", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi
      .spyOn(global, "fetch")
      .mockRejectedValue(new Error("fetch should not be called"));
    awsSend.mockReset();
    claudeCreate.mockReset();
  });

  afterEach(() => vi.restoreAllMocks());

  const providers = [
    new GoogleProvider("key"),
    new OpenAIProvider("key"),
    new LibreTranslateProvider("https://libretranslate.com", "key"),
    new MyMemoryProvider("test@example.com"),
  ];

  for (const provider of providers) {
    it(`${provider.name}: returns {} for empty input without calling fetch`, async () => {
      const result = await provider.translate({}, "en", "es");
      expect(result).toEqual({});
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }

  it("aws: returns {} for empty input without calling AWS SDK", async () => {
    const provider = new AWSProvider("ak", "sk", "us-east-1");
    const result = await provider.translate({}, "en", "es");
    expect(result).toEqual({});
    expect(awsSend).not.toHaveBeenCalled();
  });

  it("claude: returns {} for empty input without calling the API", async () => {
    const provider = new ClaudeProvider("key");
    const result = await provider.translate({}, "en", "es");
    expect(result).toEqual({});
    expect(claudeCreate).not.toHaveBeenCalled();
  });
});

// ─── Google ───────────────────────────────────────────────────────────────────

describe("GoogleProvider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns translated values with same keys", async () => {
    mockFetchOk({
      data: {
        translations: [{ translatedText: "Hola" }, { translatedText: "Adiós" }],
      },
    });
    const provider = new GoogleProvider("gkey");
    const result = await provider.translate(SAMPLE_INPUT, "en", "es");
    expect(result).toEqual(SAMPLE_TRANSLATED_ES);
  });

  it("throws ProviderError on HTTP error", async () => {
    mockFetchError(400, "Bad Request");
    const provider = new GoogleProvider("gkey");
    await expect(provider.translate(SAMPLE_INPUT, "en", "es")).rejects.toThrow(
      ProviderError,
    );
    await expect(provider.translate(SAMPLE_INPUT, "en", "es")).rejects.toThrow(
      "[google]",
    );
  });

  it("throws ProviderError on network failure", async () => {
    mockFetchNetworkFailure();
    const provider = new GoogleProvider("gkey");
    await expect(provider.translate(SAMPLE_INPUT, "en", "es")).rejects.toThrow(
      ProviderError,
    );
  });

  it("includes API key in URL", async () => {
    const spy = mockFetchOk({
      data: {
        translations: [{ translatedText: "x" }, { translatedText: "y" }],
      },
    });
    const provider = new GoogleProvider("my-google-key");
    await provider.translate(SAMPLE_INPUT, "en", "es");
    const [url] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("key=my-google-key");
  });
});

// ─── OpenAI ───────────────────────────────────────────────────────────────────

describe("OpenAIProvider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns translated values with same keys", async () => {
    mockFetchOk({
      choices: [{ message: { content: JSON.stringify(SAMPLE_TRANSLATED_ES) } }],
    });
    const provider = new OpenAIProvider("oai-key");
    const result = await provider.translate(SAMPLE_INPUT, "en", "es");
    expect(result).toEqual(SAMPLE_TRANSLATED_ES);
  });

  it("throws ProviderError when model response is not valid JSON", async () => {
    mockFetchOk({
      choices: [{ message: { content: "Sorry, I cannot translate that." } }],
    });
    const provider = new OpenAIProvider("oai-key");
    await expect(provider.translate(SAMPLE_INPUT, "en", "es")).rejects.toThrow(
      ProviderError,
    );
  });

  it("throws ProviderError on HTTP error", async () => {
    mockFetchError(401, "Unauthorized");
    const provider = new OpenAIProvider("bad-key");
    await expect(provider.translate(SAMPLE_INPUT, "en", "es")).rejects.toThrow(
      "[openai]",
    );
  });

  it("throws ProviderError on missing keys in response", async () => {
    mockFetchOk({
      choices: [{ message: { content: JSON.stringify({ greeting: "Hola" }) } }],
    });
    const provider = new OpenAIProvider("oai-key");
    // Response missing "farewell" key
    await expect(provider.translate(SAMPLE_INPUT, "en", "es")).rejects.toThrow(
      ProviderError,
    );
  });

  function requestBody(spy: ReturnType<typeof mockFetchOk>, call = 0) {
    return JSON.parse(
      (spy.mock.calls[call] as [string, RequestInit])[1].body as string,
    );
  }

  it("requests strict structured output with exactly the input keys", async () => {
    const spy = mockFetchOk({
      choices: [{ message: { content: JSON.stringify(SAMPLE_TRANSLATED_ES) } }],
    });
    await new OpenAIProvider("k").translate(SAMPLE_INPUT, "en", "es");
    const { response_format } = requestBody(spy);
    expect(response_format.type).toBe("json_schema");
    expect(response_format.json_schema.strict).toBe(true);
    expect(response_format.json_schema.schema.required).toEqual([
      "greeting",
      "farewell",
    ]);
    expect(response_format.json_schema.schema.additionalProperties).toBe(false);
  });

  it("splits large inputs into batches of 50 keys", async () => {
    const spy = vi
      .spyOn(global, "fetch")
      .mockImplementation(async (_url, init) => {
        const keys: string[] = JSON.parse(init!.body as string).response_format
          .json_schema.schema.required;
        const content = JSON.stringify(
          Object.fromEntries(keys.map((k) => [k, `t_${k}`])),
        );
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content } }] }),
          text: async () => content,
        } as Response;
      });
    const input = Object.fromEntries(
      Array.from({ length: 120 }, (_, i) => [`k${i}`, `v${i}`]),
    );
    const result = await new OpenAIProvider("k").translate(input, "en", "es");
    expect(spy).toHaveBeenCalledTimes(3);
    expect(Object.keys(result)).toHaveLength(120);
    expect(result.k119).toBe("t_k119");
  });

  it("throws ProviderError when the response is truncated", async () => {
    mockFetchOk({
      choices: [
        { finish_reason: "length", message: { content: '{"greeting": "Ho' } },
      ],
    });
    await expect(
      new OpenAIProvider("k").translate(SAMPLE_INPUT, "en", "es"),
    ).rejects.toThrow("[openai] Response was truncated");
  });

  it("throws ProviderError when the model refuses", async () => {
    mockFetchOk({
      choices: [{ message: { content: null, refusal: "I can't help with that." } }],
    });
    await expect(
      new OpenAIProvider("k").translate(SAMPLE_INPUT, "en", "es"),
    ).rejects.toThrow("[openai] Model declined");
  });
});

// ─── Claude ───────────────────────────────────────────────────────────────────

function claudeResponse(
  body: unknown,
  stop_reason: string = "end_turn",
) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { stop_reason, content: [{ type: "text", text }] };
}

describe("ClaudeProvider", () => {
  beforeEach(() => {
    claudeCreate.mockReset();
  });

  it("returns translated values with same keys", async () => {
    claudeCreate.mockResolvedValue(claudeResponse(SAMPLE_TRANSLATED_ES));
    const provider = new ClaudeProvider("claude-key");
    const result = await provider.translate(SAMPLE_INPUT, "en", "es");
    expect(result).toEqual(SAMPLE_TRANSLATED_ES);
  });

  it("constrains output to a JSON schema of exactly the input keys", async () => {
    claudeCreate.mockResolvedValue(claudeResponse(SAMPLE_TRANSLATED_ES));
    await new ClaudeProvider("key").translate(SAMPLE_INPUT, "en", "es");
    const params = claudeCreate.mock.calls[0][0];
    expect(params.model).toBe("claude-opus-5");
    expect(params.output_config.format.type).toBe("json_schema");
    expect(params.output_config.format.schema.required).toEqual([
      "greeting",
      "farewell",
    ]);
    expect(params.output_config.format.schema.additionalProperties).toBe(false);
  });

  it("splits large inputs into batches of 50 keys", async () => {
    claudeCreate.mockImplementation(async (params: any) =>
      claudeResponse(
        Object.fromEntries(
          params.output_config.format.schema.required.map((k: string) => [
            k,
            `t_${k}`,
          ]),
        ),
      ),
    );
    const input = Object.fromEntries(
      Array.from({ length: 120 }, (_, i) => [`k${i}`, `v${i}`]),
    );
    const result = await new ClaudeProvider("key").translate(input, "en", "es");
    expect(claudeCreate).toHaveBeenCalledTimes(3);
    expect(Object.keys(result)).toHaveLength(120);
    expect(result.k119).toBe("t_k119");
  });

  it("throws ProviderError when the response is truncated", async () => {
    claudeCreate.mockResolvedValue(claudeResponse('{"greeting": "Ho', "max_tokens"));
    await expect(
      new ClaudeProvider("key").translate(SAMPLE_INPUT, "en", "es"),
    ).rejects.toThrow("[claude] Response was truncated");
  });

  it("throws ProviderError when the model declines", async () => {
    claudeCreate.mockResolvedValue({ stop_reason: "refusal", content: [] });
    await expect(
      new ClaudeProvider("key").translate(SAMPLE_INPUT, "en", "es"),
    ).rejects.toThrow("[claude] Model declined");
  });

  it("throws ProviderError when response is not valid JSON", async () => {
    claudeCreate.mockResolvedValue(claudeResponse("Here are your translations: ..."));
    await expect(
      new ClaudeProvider("key").translate(SAMPLE_INPUT, "en", "es"),
    ).rejects.toThrow(ProviderError);
  });

  it("throws ProviderError on API error", async () => {
    claudeCreate.mockRejectedValue(new MockAPIError(529, "Overloaded"));
    await expect(
      new ClaudeProvider("key").translate(SAMPLE_INPUT, "en", "es"),
    ).rejects.toThrow("[claude] HTTP 529: Overloaded");
  });
});

// ─── LibreTranslate ───────────────────────────────────────────────────────────

describe("LibreTranslateProvider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns translated values with same keys", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ translatedText: "Hola" }),
        text: async () => "",
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ translatedText: "Adiós" }),
        text: async () => "",
      } as Response);

    const provider = new LibreTranslateProvider(
      "https://libretranslate.com",
      "key",
    );
    const result = await provider.translate(SAMPLE_INPUT, "en", "es");
    expect(result).toEqual(SAMPLE_TRANSLATED_ES);
  });

  it("throws ProviderError on HTTP error", async () => {
    mockFetchError(429, "Too Many Requests");
    const provider = new LibreTranslateProvider(
      "https://libretranslate.com",
      "key",
    );
    await expect(provider.translate(SAMPLE_INPUT, "en", "es")).rejects.toThrow(
      "[libretranslate]",
    );
  });

  it("strips region suffix from locale", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ translatedText: "Olá" }),
      text: async () => "",
    } as Response);
    const provider = new LibreTranslateProvider(
      "https://libretranslate.com",
      "",
    );
    await provider.translate({ greeting: "Hello" }, "en", "pt-BR");
    const body = JSON.parse(
      (spy.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.target).toBe("pt");
  });
});

// ─── MyMemory ────────────────────────────────────────────────────────────────

describe("MyMemoryProvider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns translated values with same keys", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          responseData: { translatedText: "Hola" },
          responseStatus: 200,
        }),
        text: async () => "",
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          responseData: { translatedText: "Adiós" },
          responseStatus: 200,
        }),
        text: async () => "",
      } as Response);

    const provider = new MyMemoryProvider("test@example.com");
    const result = await provider.translate(SAMPLE_INPUT, "en", "es");
    expect(result).toEqual(SAMPLE_TRANSLATED_ES);
  });

  it("throws ProviderError on HTTP error", async () => {
    mockFetchError(429, "Too Many Requests");
    const provider = new MyMemoryProvider();
    await expect(provider.translate(SAMPLE_INPUT, "en", "es")).rejects.toThrow(
      "[mymemory]",
    );
  });

  it("throws ProviderError on non-200 API status", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        responseData: { translatedText: "" },
        responseStatus: 429,
      }),
      text: async () => "",
    } as Response);
    const provider = new MyMemoryProvider();
    await expect(provider.translate(SAMPLE_INPUT, "en", "es")).rejects.toThrow(
      "[mymemory]",
    );
  });

  it("includes email in request when provided", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        responseData: { translatedText: "Hola" },
        responseStatus: 200,
      }),
      text: async () => "",
    } as Response);
    const provider = new MyMemoryProvider("user@example.com");
    await provider.translate({ greeting: "Hello" }, "en", "es");
    const [url] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("de=user%40example.com");
  });
});

// ─── AWS ─────────────────────────────────────────────────────────────────────

describe("AWSProvider", () => {
  beforeEach(() => {
    awsSend.mockReset();
  });

  it("returns translated values with same keys (mocked SDK)", async () => {
    const translations: Record<string, string> = {
      Hello: "Hola",
      Goodbye: "Adiós",
    };
    awsSend.mockImplementation(async (cmd: { input: { Text: string } }) => ({
      TranslatedText: translations[cmd.input.Text] ?? cmd.input.Text,
    }));

    const provider = new AWSProvider("ak", "sk", "us-east-1");
    const result = await provider.translate(SAMPLE_INPUT, "en", "es");
    expect(result).toEqual(SAMPLE_TRANSLATED_ES);
  });

  it("throws ProviderError when SDK throws", async () => {
    awsSend.mockRejectedValue({
      name: "ServiceUnavailableException",
      message: "Service unavailable",
    });

    const provider = new AWSProvider("ak", "sk", "us-east-1");
    await expect(provider.translate(SAMPLE_INPUT, "en", "es")).rejects.toThrow(
      "[aws] ServiceUnavailableException",
    );
  });

  it("strips region suffix from target locale", async () => {
    awsSend.mockResolvedValue({ TranslatedText: "Olá" });
    const provider = new AWSProvider("ak", "sk", "us-east-1");
    await provider.translate({ greeting: "Hello" }, "en", "pt-BR");
    expect(awsSend.mock.calls[0][0].input.TargetLanguageCode).toBe("pt");
  });
});

// ─── Key preservation property ────────────────────────────────────────────────

describe("Key preservation — all REST providers", () => {
  afterEach(() => vi.restoreAllMocks());

  const testCases = [
    {
      name: "Google",
      makeProvider: () => new GoogleProvider("key"),
      mockResponse: (keys: string[]) =>
        mockFetchOk({
          data: {
            translations: keys.map((_, i) => ({
              translatedText: `translated_${i}`,
            })),
          },
        }),
    },
    {
      name: "OpenAI",
      makeProvider: () => new OpenAIProvider("key"),
      mockResponse: (keys: string[]) => {
        const body = Object.fromEntries(
          keys.map((k, i) => [k, `translated_${i}`]),
        );
        mockFetchOk({
          choices: [{ message: { content: JSON.stringify(body) } }],
        });
      },
    },
    {
      name: "Claude",
      makeProvider: () => new ClaudeProvider("key"),
      mockResponse: (keys: string[]) => {
        const body = Object.fromEntries(
          keys.map((k, i) => [k, `translated_${i}`]),
        );
        claudeCreate.mockReset();
        claudeCreate.mockResolvedValue(claudeResponse(body));
      },
    },
  ];

  for (const { name, makeProvider, mockResponse } of testCases) {
    it(`${name}: output keys match input keys`, async () => {
      const input = { a: "Apple", b: "Banana", c: "Cherry" };
      mockResponse(Object.keys(input));
      const provider = makeProvider();
      const result = await provider.translate(input, "en", "es");
      expect(Object.keys(result).sort()).toEqual(Object.keys(input).sort());
    });
  }
});
