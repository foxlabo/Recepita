// lib/ai/expenseCategory.ts
//
// Azure OCR の結果をもとに、OpenAI で経費区分(category)やメモ、
// 必要に応じて日付・金額・取引先などを補正するためのヘルパー。

import OpenAI from 'openai';

// ★ ビルド時に OPENAI_API_KEY がなくても落ちないようにする
const apiKey = process.env.OPENAI_API_KEY;
let client: OpenAI | null = null;

if (apiKey && apiKey.trim().length > 0) {
  client = new OpenAI({ apiKey });
}

export type InferExpenseCategoryInput = {
  vendor?: string;
  amount?: number;
  itemsSummary?: string;
  ocrText?: string;
  detected?: {
    date?: string;
    amount?: number;
    vendor?: string;
    items?: Array<{ name?: string; qty?: number; price?: number; total?: number }>;
    tax?: number;
    subtotal?: number;
  };
  existingAi?: any;
};

export type InferExpenseCategoryResult = {
  category?: string;
  memo?: string;
  confidence?: number;
  fixedDetected?: {
    date?: string;
    amount?: number;
    vendor?: string;
    items?: Array<{ name?: string; qty?: number; price?: number; total?: number }>;
    tax?: number;
    subtotal?: number;
  };
  [key: string]: any;
};

export async function inferExpenseCategory(input: InferExpenseCategoryInput): Promise<InferExpenseCategoryResult> {
  const base: InferExpenseCategoryResult = { ...(input.existingAi ?? {}) };

  // 既に category が入っていたら、それを尊重して何もしない
  if (base.category) return base;

  // ★ OpenAI クライアントが使えない（= APIキー無し）場合は
  //    既存情報をそのまま返して AI 推論をスキップ
  if (!client) {
    console.warn('[inferExpenseCategory] OPENAI_API_KEY is not set; skip AI inference');
    return base;
  }

  const model = process.env.OPENAI_OCR_CATEGORY_MODEL || 'gpt-4.1-mini';

  const vendor = input.vendor ?? '';
  const amount = input.amount ?? 0;
  const itemsSummary = input.itemsSummary ?? '';
  const ocrText = input.ocrText ?? '';
  const detected = input.detected ?? {};

  const systemPrompt = `
あなたは日本のフリーランス向け経費精算システムのアシスタントです。
Azure Document Intelligence で抽出されたレシート情報と OCR テキストをもとに、
日本の会計実務でよく使われる経費区分を 1 つ推定し、必要に応じて
日付 / 金額 / 取引先 / 明細行 なども補正して JSON で返してください。

主な候補の例:
- 交通費
- 旅費交通費
- 交際費
- 通信費
- 消耗品費
- 器具備品
- 支払手数料
- 雑費

必ず JSON オブジェクトのみを返してください。
フィールド定義:
- category: 推定した経費区分名（上記のいずれか、またはそれに準じる日本語）
- confidence: 0〜1 の数値で自信度（例: 0.85）
- fixedDetected: 必要に応じて補正した detected 情報
  - date: "YYYY-MM-DD" 形式の文字列
  - amount: 数値。税込の支払総額
  - vendor: 取引先名
  - items: 明細行の配列 { name, qty, price, total }
  - tax: 税額（わかる場合のみ）
  - subtotal: 税抜金額（わかる場合のみ）

注意:
- 不明なフィールドは省略してよい
- JSON 以外のテキストや説明文は絶対に出力しない
`.trim();

  const userPrompt = `
元の extracted 情報と OCR テキストは次の通りです。

[extracted.detected(JSON)]
${JSON.stringify(detected, null, 2)}

[itemsSummary]
${itemsSummary || '(なし)'}

[vendor]
${vendor || '(不明)'}

[amount]
${amount || '(不明)'}

[ocrText]
${ocrText || '(なし)'}

上記をもとに、経費区分の category と memo、自信度 confidence を決め、
必要であれば fixedDetected に補正済みの detected を設定してください。
`.trim();

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const content = completion.choices[0]?.message?.content || '{}';
    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }

    const merged: InferExpenseCategoryResult = {
      ...base,
      ...parsed,
    };
    return merged;
  } catch (e) {
    console.warn('[inferExpenseCategory] OpenAI error', e);
    return base;
  }
}
