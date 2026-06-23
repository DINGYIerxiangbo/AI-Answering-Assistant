console.log("[Background] Service Worker Speed-Optimized (3s Timeout)");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "callAIProxy") {
    handleAIRequest(request.model, request.userText)
      .then(data => sendResponse({ success: true, data: data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; 
  }
  return true;
});

async function handleAIRequest(model, userText) {
  const { apiUrl, modelParam, key } = model;
  
  const systemPrompt = `你是一个无感情的答题机器。请直接选出正确字母选项。
  格式要求：
  答案:X (X只能是A、B、C、D中的一个字母)
  解析:原因
  不要有任何开头、结尾或标点符号。若无法分辨，直接返回：答案:A`;

  let headers = { "Content-Type": "application/json" };
  let body = {};

  if (apiUrl.includes("generativelanguage.googleapis.com")) {
    body = { contents: [{ parts: [{ text: systemPrompt + "\n\n" + userText }] }], generationConfig: { maxOutputTokens: 60, temperature: 0.0 } };
  } else if (apiUrl.includes("api.anthropic.com")) {
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
    body = { model: modelParam, max_tokens: 60, temperature: 0.0, messages: [{ role: "user", content: systemPrompt + "\n\n" + userText }] };
  } else {
    headers["Authorization"] = `Bearer ${key}`;
    body = { 
      model: modelParam, 
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText }
      ], 
      max_tokens: 60, 
      temperature: 0.0,
      thinking: { type: "disabled" } 
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    
    if (apiUrl.includes("generativelanguage.googleapis.com")) {
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else if (apiUrl.includes("api.anthropic.com")) {
      return data.content?.[0]?.text || '';
    } else {
      return data.choices?.[0]?.message?.content || '';
    }
  } catch(e) {
    clearTimeout(timeoutId);
    throw e;
  }
}
