import Anthropic from "@anthropic-ai/sdk";
import { fetchAvecUsage } from "@/lib/anthropic/usage";

// Le fetch personnalisé relève le coût de chaque appel (voir lib/anthropic/usage.ts).
export const anthropic = new Anthropic({ fetch: fetchAvecUsage });
