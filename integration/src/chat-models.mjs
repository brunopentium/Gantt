import { IntegrationError } from './store.mjs';

// Tool-capable options checked against OpenRouter's public catalog on 2026-10-16.
const options = [
  { id: 'openai/gpt-6-luna', name: 'GPT-6 Luna', free: false },
  { id: 'openai/gpt-6.1-sol', name: 'GPT-6.1 Sol', free: false },
  { id: 'anthropic/claude-sonnet-5.5', name: 'Claude Sonnet 5.5', free: false },
  { id: 'google/gemini-4-argon', name: 'Gemini 4 Argon', free: false },
  { id: 'deepseek/deepseek-v4-pro-0813', name: 'DeepSeek V4 Pro (0813)', free: false },
  { id: 'qwen/qwen3.8-max-0902', name: 'Qwen3.8 Max (0902)', free: false },
  { id: 'minimax/minimax-m3', name: 'MiniMax M3', free: false },
  { id: 'deepseek/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', free: false },
  { id: 'qwen/qwen3.8-flash', name: 'Qwen3.8 Flash', free: false },
  { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash', free: false },
  { id: 'openrouter/free', name: 'Automático gratuito (modelo variável)', free: true },
  { id: 'nvidia/nemotron-3.5-lightning:free', name: 'Nemotron 3.5 Lightning', free: true },
  { id: 'google/gemma-4-31b-it:free', name: 'Google Gemma 4 31B', free: true },
  { id: 'google/gemma-4-26b-a4b-it:free', name: 'Google Gemma 4 26B A4B', free: true },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nemotron 3 Ultra', free: true },
  { id: 'nvidia/nemotron-3.5-super-vl:free', name: 'Nemotron 3.5 Super VL', free: true },
  { id: 'poolside/laguna-s-2.1:free', name: 'Laguna S 2.1', free: true }
];
export const defaultChatModel = env => env.OPENROUTER_MODEL || 'openai/gpt-6-luna';
export function chatModels(env) {
  const model = defaultChatModel(env);
  return options.some(option => option.id === model) ? options.map(option => ({ ...option }))
    : [{ id: model, name: model, free: model.endsWith(':free') || model === 'openrouter/free' }, ...options];
}
export function selectChatModel(env, id) {
  const model = chatModels(env).find(option => option.id === (id || defaultChatModel(env)));
  if (!model) throw new IntegrationError('invalid_model', 'Escolha um dos modelos disponíveis no seletor.');
  return model;
}
