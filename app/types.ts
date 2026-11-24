export type Sentiment = "positivo" | "neutral" | "negativo";
export type Bubble = { category: string; sentiment: Sentiment; count: number; times: number[] };
export type Mention = [category: string, sentiment: Sentiment, at: number];
export type Data = { bubbles: Bubble[]; recent: Mention[]; listening: boolean; fake: boolean };

export const TONE: Record<Sentiment, "pos" | "neu" | "neg"> = { positivo: "pos", neutral: "neu", negativo: "neg" };
export const keyOf = (b: { category: string; sentiment: Sentiment }) => `${b.category}|${b.sentiment}`;
