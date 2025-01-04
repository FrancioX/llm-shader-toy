import { APIError, OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { Err, Ok, Result } from 'ts-results-es';
import { asResult } from './utils';

const systemPrompt = `
You are a skilled graphics shader programmer.

You answer the user's prompts with only valid webgl glsl code.

The user might either want you to fix or in some other way alter some provided shader code or
they might ask you to write a shader from scratch.

Every answer should be a valid glsl shader program in the following format. You may define additional
functions as needed.

\`\`\`glsl
#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;

out vec4 out_color;

void main() {
    // Implement the shader here.
    out_color = vec4(1.0, 1.0, 1.0, 1.0);
}
\`\`\`
`;

const openaiModels = ['gpt-4-turbo', 'gpt-3.5-turbo'] as const;
const claudeModels = ['claude-3-5-sonnet-20241022'] as const;
const availableModels = [...openaiModels, ...claudeModels] as const;
type Model = (typeof availableModels)[number];

class SystemMessage {
  readonly role = 'system';
  constructor(readonly content: string) {}
}

class AssistantMessage {
  readonly role = 'assistant';
  constructor(readonly content: string) {}
}

class UserMessage {
  readonly role = 'user';
  constructor(readonly content: string) {}
}

type ChatMessage = SystemMessage | AssistantMessage | UserMessage;

class ChatTurn {
  constructor(
    readonly userMessage: UserMessage,
    readonly assistantMessage: AssistantMessage,
    readonly userInput: string,
    readonly shaderSource: string
  ) {}
}

class LLMResponse {
  constructor(
    readonly turns: ChatTurn[],
    readonly shaderSource: string
  ) {}
}

class RecoverableError extends Error {}

class UnrecoverableError extends Error {}

interface LLMProvider {
  callLLM(prompt: Array<ChatMessage>): Promise<Result<string, Error>>;
}

class OpenAIProvider implements LLMProvider {
  constructor(private openai: OpenAI, private model: Model) {}

  async callLLM(prompt: Array<ChatMessage>): Promise<Result<string, Error>> {
    try {
      const response = await this.openai.chat.completions.create({
        messages: prompt,
        model: this.model as string
      });
      return asResult(response.choices[0].message.content, Error('LLMResponseFailure'));
    } catch (error: unknown) {
      if (error instanceof APIError) {
        if (error.status === 401) {
          return Err(new UnrecoverableError('API key is invalid'));
        }
        if (error.status === 403) {
          return Err(new UnrecoverableError('Region not supported'));
        }
        if (error.status === 429) {
          return Err(new RecoverableError('Rate limit exceeded, try again later'));
        }
        if (error.status === 500 || error.status === 503) {
          return Err(new RecoverableError('Internal server error, try again later'));
        }
        return Err(new UnrecoverableError(`API error: ${error.message}`));
      }
      return Err(new UnrecoverableError(`Unknown Error: ${error}`));
    }
  }
}

class ClaudeProvider implements LLMProvider {
  constructor(private anthropic: Anthropic, private model: Model) {}

  async callLLM(prompt: Array<ChatMessage>): Promise<Result<string, Error>> {
    try {
      const messages = prompt.map(msg => ({
        role: msg.role === 'system' ? 'user' : msg.role as 'user' | 'assistant',
        content: msg.content
      }));

      const response = await this.anthropic.messages.create({
        model: this.model as string,
        max_tokens: 1024,
        messages: messages,
      });

      if (!response.content[0] || !('text' in response.content[0])) {
        return Err(new Error('Unexpected response format from Claude'));
      }

      return Ok(response.content[0].text);
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message.includes('401')) {
          return Err(new UnrecoverableError('API key is invalid'));
        }
        if (error.message.includes('429')) {
          return Err(new RecoverableError('Rate limit exceeded, try again later'));
        }
        if (error.message.includes('500') || error.message.includes('503')) {
          return Err(new RecoverableError('Internal server error, try again later'));
        }
        return Err(new UnrecoverableError(`API error: ${error.message}`));
      }
      return Err(new UnrecoverableError(`Unknown Error: ${error}`));
    }
  }
}

function createLLMProvider(
  openai: OpenAI | undefined,
  anthropic: Anthropic | undefined,
  model: Model
): LLMProvider | undefined {
  if (openaiModels.includes(model as any)) {
    return openai ? new OpenAIProvider(openai, model) : undefined;
  } else if (claudeModels.includes(model as any)) {
    return anthropic ? new ClaudeProvider(anthropic, model) : undefined;
  }
  return undefined;
}

async function fetchLLMResponse(
  openai: OpenAI | undefined,
  anthropic: Anthropic | undefined,
  model: Model,
  turns: ChatTurn[],
  currentShaderCode: string,
  userInput: string
): Promise<Result<LLMResponse, Error>> {
  const provider = createLLMProvider(openai, anthropic, model);
  if (!provider) {
    return Err(new UnrecoverableError('No LLM provider available for the selected model'));
  }

  const newUserMessage = makeUserMessage(userInput, currentShaderCode);
  const llmPrompt = makeLLMPrompt(turns, newUserMessage);
  const response = await provider.callLLM(llmPrompt);
  const llmResponse = response.andThen(parseResponse).map((newShaderCode) => {
    const newAssistantMessage = makeAssistantMessage(newShaderCode);
    const newChatTurn = new ChatTurn(newUserMessage, newAssistantMessage, userInput, newShaderCode);
    return new LLMResponse(turns.concat(newChatTurn), newShaderCode);
  });
  return llmResponse;
}

function makeUserMessage(userInput: string, code: string): UserMessage {
  const content = `
Current shader code:
\`\`\`glsl
${code}
\`\`\`

${userInput}
  `.trim();
  return new UserMessage(content);
}

function makeAssistantMessage(code: string): AssistantMessage {
  const content = `
Assistant generated shader code:
\`\`\`glsl
${code}
\`\`\`
  `.trim();
  return new AssistantMessage(content);
}

function makeLLMPrompt(turns: ChatTurn[], userMessage: UserMessage): ChatMessage[] {
  return [
    new SystemMessage(systemPrompt),
    ...turns.flatMap((turn) => [turn.userMessage, turn.assistantMessage]),
    userMessage
  ];
}

function parseResponse(response: string): Result<string, Error> {
  const regex = /```glsl([\s\S]+)```/;
  let match = response.match(regex);
  if (!match) {
    return Err(Error('ParseFailure'));
  }
  return Ok(match[1].trim());
}

export { availableModels, openaiModels, claudeModels, fetchLLMResponse, ChatTurn, RecoverableError, UnrecoverableError };
export type { Model, LLMResponse };
