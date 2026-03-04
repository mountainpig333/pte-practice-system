const ANTHROPIC_API_KEY = 'sk-ant-api03-oZRxn1JTxjFV6nHSuR1X9L74MJRxPw2-J8Lp72hqhCVVgb_FS9gXh4V-4_j3T3Ai6_JRbSUq2CbMr2CgR6zJ0lHQAA';

async function callClaude(prompt) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 2048,
            messages: [{ role: 'user', content: prompt }]
        })
    });
    const result = await response.json();
    if (result.error) throw new Error(result.error.message);
    return result.content[0].text;
}

// 測試修正中文題目
const testQuestion = {
    "type": "MCMA",
    "passage": "Digital transformation is reshaping supply chain operations, introducing technologies that improve透明度, efficiency, and decision‑making.",
    "question": "Which digital technologies are most beneficial for supply chain optimization? (select all that apply)",
    "options": ["Blockchain for traceability", "AI for demand forecasting", "Fax machines", "IoT for asset tracking", "Traditional spreadsheets"],
    "answers": ["Blockchain for traceability", "AI for demand forecasting", "IoT for asset tracking"],
    "explanation": "區塊鏈、人工智慧與物聯網等技術可提升供應鏈效率。",
    "difficulty": "medium",
    "topic": "supply chain"
};

const prompt = `Fix this PTE question. It has Chinese text mixed in English. Replace all Chinese with proper English and ensure the explanation is in Traditional Chinese.

Question: ${JSON.stringify(testQuestion, null, 2)}

Return ONLY JSON:
{
  "valid": false,
  "errors": ["list of errors found"],
  "fixed": <corrected question object>
}`;

callClaude(prompt).then(text => {
    console.log(text);
}).catch(e => console.error(e));
