'use server';

import OpenAI from 'openai';
import { redis } from '@/lib/redis';

// AI Configuration
const modelProvider = process.env.AI_MODEL_PROVIDER || 'groq';
const apiKey = modelProvider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GROQ_API_KEY;

if (!apiKey) {
  console.warn('AI API key not configured. AI features will be disabled.');
}

const openai = apiKey ? new OpenAI({
  apiKey,
  baseURL: modelProvider === 'openai' ? undefined : 'https://api.groq.com/openai/v1',
}) : null;

const model = modelProvider === 'openai' ? 'gpt-4o' : 'llama-3.3-70b-versatile';

export type AIResponse = {
  success: boolean;
  message: string;
  data?: unknown;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

/**
 * General purpose AI query function
 * @param systemPrompt - The system instructions for the AI
 * @param userPrompt - The user's query or input
 * @param options - Optional configuration
 * @returns AI response with usage statistics
 */
export async function query_ai(
  systemPrompt: string,
  userPrompt: string,
  options?: {
    json?: boolean;
    cache_key?: string;
    cache_ttl?: number;
    temperature?: number;
  }
): Promise<AIResponse> {
  if (!openai) {
    return {
      success: false,
      message: 'AI service not configured. Please set up API keys.',
    };
  }

  try {
    // Check cache if key provided
    if (options?.cache_key) {
      const cached = await redis.get(options.cache_key);
      if (cached) {
        return {
          success: true,
          message: 'Response from cache',
          data: JSON.parse(cached),
        };
      }
    }

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: options?.temperature ?? 0.7,
      ...(options?.json && { response_format: { type: 'json_object' } }),
    });

    const content = response.choices[0].message.content || '';
    const data = options?.json ? JSON.parse(content) : content;

    // Cache if requested
    if (options?.cache_key && options?.cache_ttl) {
      await redis.setex(options.cache_key, options.cache_ttl, JSON.stringify(data));
    }

    return {
      success: true,
      message: 'Query successful',
      data,
      usage: response.usage ? {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens,
      } : undefined,
    };
  } catch (error) {
    console.error('AI Query Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'AI query failed',
    };
  }
}

/**
 * Stream AI responses for chat-like interactions
 */
export async function stream_ai(
  systemPrompt: string,
  userPrompt: string,
  onChunk: (chunk: string) => void
): Promise<AIResponse> {
  if (!openai) {
    return {
      success: false,
      message: 'AI service not configured',
    };
  }

  try {
    const stream = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
    });

    let fullResponse = '';
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        onChunk(content);
      }
    }

    return {
      success: true,
      message: 'Stream completed',
      data: fullResponse,
    };
  } catch (error) {
    console.error('AI Stream Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'AI stream failed',
    };
  }
}
