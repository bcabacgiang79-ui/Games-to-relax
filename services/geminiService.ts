/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { StrategicHint, AiResponse, DebugInfo } from "../types";

// Initialize Gemini Client
let ai: GoogleGenAI | null = null;

if (process.env.API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
} else {
    console.error("API_KEY is missing from environment variables.");
}

const STRATEGY_MODEL = "gemini-flash-lite-latest";
const CHAT_MODEL = "gemini-3-pro-preview";

export interface TargetCandidate {
  id: string;
  color: string;
  size: number;
  row: number;
  col: number;
  pointsPerBubble: number;
  description: string;
}

export const getStrategicHint = async (
  imageBase64: string,
  validTargets: TargetCandidate[],
  dangerRow: number
): Promise<AiResponse> => {
  const startTime = performance.now();
  
  const debug: DebugInfo = {
    latency: 0,
    screenshotBase64: imageBase64,
    promptContext: "",
    rawResponse: "",
    timestamp: new Date().toLocaleTimeString()
  };

  if (!ai) {
    return {
        hint: { message: "API Key missing." },
        debug: { ...debug, error: "API Key Missing" }
    };
  }

  const getBestLocalTarget = (msg: string = "No clear shots—play defensively."): StrategicHint => {
    if (validTargets.length > 0) {
        const best = validTargets.sort((a,b) => {
            const scoreA = a.size * a.pointsPerBubble;
            const scoreB = b.size * b.pointsPerBubble;
            return (scoreB - scoreA) || (a.row - b.row);
        })[0];
        
        return {
            message: `Fallback: Select ${best.color.toUpperCase()} at Row ${best.row}`,
            rationale: "Selected based on highest potential cluster score available locally.",
            targetRow: best.row,
            targetCol: best.col,
            recommendedColor: best.color as any
        };
    }
    return { message: msg, rationale: "No valid clusters found to target." };
  };

  const hasDirectTargets = validTargets.length > 0;
  const targetListStr = hasDirectTargets 
    ? validTargets.map(t => 
        `- OPTION: Select ${t.color.toUpperCase()} (${t.pointsPerBubble} pts/bubble) -> Target [Row ${t.row}, Col ${t.col}]. Cluster Size: ${t.size}. Total Value: ${t.size * t.pointsPerBubble}.`
      ).join("\n")
    : "NO MATCHES AVAILABLE. Suggest a color to set up a future combo.";
  
  debug.promptContext = targetListStr;

  const prompt = `
    You are a strategic gaming AI for a Bubble Shooter.
    Current board screenshot provided. Valid targets listed.

    ### GAME STATE
    - Danger Level: ${dangerRow >= 6 ? "CRITICAL" : "Stable"}
    
    ### SCORING
    - Red: 100, Blue: 150, Green: 200, Yellow: 250, Purple: 300, Orange: 500.

    ### AVAILABLE MOVES
    ${targetListStr}

    ### YOUR TASK
    Return RAW JSON only.
    Analyze the board. If no good matches exist, you can suggest "skip" for the turn.
    {
      "message": "Short directive",
      "rationale": "One sentence rationale",
      "recommendedColor": "red|blue|green|yellow|purple|orange",
      "targetRow": integer,
      "targetCol": integer,
      "suggestSkip": boolean
    }
  `;

  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
    const genAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await genAi.models.generateContent({
      model: STRATEGY_MODEL,
      contents: {
        parts: [
            { text: prompt },
            { 
              inlineData: {
                mimeType: "image/png",
                data: cleanBase64
              } 
            }
        ]
      },
      config: {
        maxOutputTokens: 1000,
        temperature: 0.2,
        responseMimeType: "application/json" 
      }
    });

    const endTime = performance.now();
    debug.latency = Math.round(endTime - startTime);
    
    let text = response.text || "{}";
    debug.rawResponse = text;
    
    try {
        const json = JSON.parse(text);
        debug.parsedResponse = json;
        return {
            hint: {
                message: json.message || "Ready!",
                rationale: json.rationale,
                targetRow: json.targetRow,
                targetCol: json.targetCol,
                recommendedColor: json.recommendedColor?.toLowerCase(),
                suggestSkip: json.suggestSkip
            },
            debug
        };
    } catch (e: any) {
        return { hint: getBestLocalTarget("Parse error"), debug: { ...debug, error: e.message } };
    }
  } catch (error: any) {
    return { hint: getBestLocalTarget("Service unreachable"), debug: { ...debug, error: error.message } };
  }
};

export const getChatResponse = async (userMessage: string, history: { role: 'user' | 'model', parts: { text: string }[] }[]) => {
    if (!ai) return "AI not initialized.";
    const genAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const chat = genAi.chats.create({
        model: CHAT_MODEL,
        config: {
            systemInstruction: "You are the Gemini Slingshot Assistant. You help users understand the game, the AI technology behind it, and general strategies. Keep responses concise and friendly."
        }
    });
    
    // Manual history feeding as simple chat.sendMessage doesn't handle history array directly in this SDK version's simpler abstraction
    // but we can pass it if we use the sessions. 
    // For this context, we just send the message.
    const response = await chat.sendMessage({ message: userMessage });
    return response.text;
};
