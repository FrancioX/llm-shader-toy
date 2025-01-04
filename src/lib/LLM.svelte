<script lang="ts">
  import { OpenAI } from 'openai';
  import Anthropic from '@anthropic-ai/sdk';
  import { toast } from 'svelte-sonner';
  import { fade } from 'svelte/transition';
  import { Ok } from 'ts-results-es';
  import { availableModels, openaiModels, claudeModels, fetchLLMResponse, ChatTurn, type Model, RecoverableError, type LLMResponse } from './llm';
  import { shaderCompileError } from './stores';
  import spinner from '../assets/spinner.gif';
  import type { ShaderCompileError } from './render';

  // Module state.
  let openai: OpenAI | undefined;
  let anthropic: Anthropic | undefined;
  let modelSelection: Model;
  let turns: ChatTurn[] = [];
  let revertedTurns: ChatTurn[] = [];
  let messageInput: HTMLTextAreaElement;
  let messageSpinner: HTMLImageElement;
  let initialShaderSource: string;
  export let visible: boolean;
  export let shaderSource: string;

  // Initialize OpenAI client with API key from environment
  $: {
    const openaiKey = import.meta.env.VITE_OPENAI_API_KEY;
    const claudeKey = import.meta.env.VITE_CLAUDE_API_KEY;
    
    console.log('OpenAI API Key status:', openaiKey ? 'Found' : 'Not found');
    console.log('Claude API Key status:', claudeKey ? 'Found' : 'Not found');
    
    if (openaiKey) {
      openai = new OpenAI({ apiKey: openaiKey, dangerouslyAllowBrowser: true });
      console.log('OpenAI client initialized');
    }
    
    if (claudeKey) {
      anthropic = new Anthropic({ 
        apiKey: claudeKey,
        dangerouslyAllowBrowser: true
      });
      console.log('Claude client initialized');
    }
  }

  // Save the initial shader source.
  $: {
    if (initialShaderSource === undefined) {
      initialShaderSource = shaderSource;
    }
  }

  function onMessageInputKeyDown(event: any): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (event.target.value.trim() !== '') {
        const userMessage = event.target.value.trim();
        sendUserMessage(userMessage);
      }
    }
  }

  $: watchTurnsState(turns);
  function watchTurnsState(turns: ChatTurn[]): void {
    if (turns.length === 0) {
      shaderSource = initialShaderSource;
      return;
    }
    shaderSource = turns[turns.length - 1].shaderSource;
  }

  shaderCompileError.subscribe(onShaderCompileError);
  function onShaderCompileError(error: ShaderCompileError | null): void {
    if (error === null) {
      return;
    }
    if (messageInput === undefined) {
      return;
    }

    // TODO: Maybe make this less intrusive.
    // TODO: Also need to remove it if it's fixed by manual means
    const userMessageSuggestion = `
I tried to compile this shader, but it failed with the following error:
\`\`\`
${error.info}
\`\`\`
    `.trim();
    messageInput.value = userMessageSuggestion;
  }

  async function sendUserMessage(userMessage: string): Promise<void> {
    messageInput.readOnly = true;
    messageSpinner.style.visibility = 'visible';
    const llmResponse = await fetchLLMResponse(
      openai,
      anthropic,
      modelSelection,
      turns,
      shaderSource,
      userMessage
    );
    messageInput.readOnly = false;
    messageSpinner.style.visibility = 'hidden';
    messageInput.value = '';

    llmResponse
      .mapErr((err: Error) => {
        if (err instanceof RecoverableError) {
          toast.warning(err.message);
        } else {
          toast.error(err.message);
          console.error(err);
          openai = undefined;
          anthropic = undefined;
        }
        return err;
      })
      .andThen((llmResponse: LLMResponse) => {
        turns = llmResponse.turns;
        revertedTurns = [];
        return Ok(Ok.EMPTY);
      });
  }

  function revert(): void {
    if (turns.length === 0) {
      return;
    }
    const mostRecentTurn = turns[turns.length - 1];
    turns = turns.slice(0, -1);
    revertedTurns = [...revertedTurns, mostRecentTurn];
  }

  function undoRevert(): void {
    if (revertedTurns.length === 0) {
      return;
    }
    const mostRecentRevertedTurn = revertedTurns[revertedTurns.length - 1];
    revertedTurns = revertedTurns.slice(0, -1);
    turns = [...turns, mostRecentRevertedTurn];
  }

  function isModelAvailable(model: Model): boolean {
    if (openaiModels.includes(model as any)) {
      return !!openai;
    } else if (claudeModels.includes(model as any)) {
      return !!anthropic;
    }
    return false;
  }
</script>

{#if visible}
  <div id="llm-container" transition:fade>
    {#if !openai && !anthropic}
      <div class="error-message">
        No API keys found. Please make sure:
        <ol>
          <li>You have created a .env.local file</li>
          <li>You have added VITE_OPENAI_API_KEY=your-api-key-here and/or VITE_CLAUDE_API_KEY=your-api-key-here to the file</li>
          <li>You have restarted the development server</li>
        </ol>
      </div>
    {:else}
      <div id="llm-msg-history">
        {#each turns as turn}
          <div class="llm-user-msg">{turn.userInput}</div>
        {/each}
      </div>

      <div id="llm-msg-input-container">
        <textarea
          id="llm-msg-input"
          bind:this={messageInput}
          placeholder="Enter message here"
          on:keydown={onMessageInputKeyDown}
        />
        <img id="llm-msg-input-spinner" bind:this={messageSpinner} src={spinner} alt="spinner" />
      </div>
      <button on:click={revert} disabled={turns.length < 1}>Revert</button>
      <button on:click={undoRevert} disabled={revertedTurns.length < 1}>Undo revert</button>

      <select bind:value={modelSelection}>
        {#each availableModels as model}
          <option value={model} disabled={!isModelAvailable(model)}>{model}</option>
        {/each}
      </select>
    {/if}
  </div>
{/if}

<style>
  #llm-api-key {
    width: 100%;
    box-sizing: border-box;
  }

  #llm-msg-history {
    display: flex;
    flex-direction: column;
    width: 100%;
    background: field;
    max-height: 400px;
    min-height: 0px;
    overflow-y: scroll;
    scroll-behavior: smooth;
  }

  .llm-user-msg {
    background-color: #0074d9;
    border-radius: 1em 1em 0 1em;
    margin: 10px;
  }

  #llm-msg-input-container {
    position: relative;
  }

  #llm-msg-input {
    width: 100%;
    height: 100px;
    resize: none;
    box-sizing: border-box;
  }

  #llm-msg-input-spinner {
    position: absolute;
    width: 1em;
    height: 1em;
    bottom: 1em;
    right: 1em;
    visibility: hidden;
  }

  .error-message {
    color: #ff4136;
    padding: 1em;
    text-align: center;
    background-color: #ffebee;
    border-radius: 4px;
    margin-bottom: 1em;
  }
</style>
