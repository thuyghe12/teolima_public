/**
 * Gemini's own safety filters, turned on for the coach's Live session.
 *
 * The adjustable filters are off by default on Gemini 2.5 and later models
 * unless a threshold is set, so the coach sets one for each category the
 * Gemini API supports, including jailbreak (prompts designed to bypass
 * safety filters). This is the model provider's layer; provenance, the
 * change log and Prompt Shields in server/guard sit around it and do not
 * depend on it.
 */
import { HarmBlockThreshold, HarmCategory, type SafetySetting } from '@google/genai';

export const LIVE_SAFETY_SETTINGS: SafetySetting[] = [
  HarmCategory.HARM_CATEGORY_JAILBREAK,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE }));
