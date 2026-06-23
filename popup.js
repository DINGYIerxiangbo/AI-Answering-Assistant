let currentCustomModels = [];

const modelSelect = document.getElementById('modelSelect');
const settingsToggleBtn = document.getElementById('settingsToggleBtn');
const settingsPanel = document.getElementById('settingsPanel');
const recognizeBtn = document.getElementById('recognizeAndAskBtn');
const loadingIndicator = document.getElementById('loadingIndicator');

const answerContent = document.getElementById('answerContent');
const parseContent = document.getElementById('parseContent');
const statusContent = document.getElementById('statusContent');

const autoAnswerToggle = document.getElementById('autoAnswerToggle');
const autoNextToggle = document.getElementById('autoNextToggle');
const autoAnswerCard = document.getElementById('autoAnswerCard');
const autoNextCard = document.getElementById('autoNextCard');

const floatingBtn = document.getElementById('floatingBtn');
const modelListContainer = document.getElementById('modelListContainer');
const toggleAddModelBtn = document.getElementById('toggleAddModelBtn');
const addModelForm = document.getElementById('addModelForm');

const editingModelId = document.getElementById('editingModelId');
const newModelName = document.getElementById('newModelName');
const newModelUrl = document.getElementById('newModelUrl');
const newModelKey = document.getElementById('newModelKey');
const newModelRequestName = document.getElementById('newModelRequestName');

const addCustomModelBtn = document.getElementById('addCustomModelBtn');
const cancelAddModelBtn = document.getElementById('cancelAddModelBtn');

function generateId() { return Date.now() + '-' + Math.random().toString(36).substr(2, 6); }

function updateToggleVisuals() {
  if (autoAnswerToggle.checked) {
    autoAnswerCard.style.backgroundColor = "#f0fdf4"; 
    autoAnswerCard.style.borderColor = "#22c55e";     
    autoAnswerCard.style.borderStyle = "solid";
    autoAnswerCard.style.borderWidth = "1px";
    autoAnswerCard.style.color = "#166534";           
  } else {
    autoAnswerCard.style.backgroundColor = "#f1f5f9"; 
    autoAnswerCard.style.borderColor = "transparent";
    autoAnswerCard.style.color = "#334155";
  }

  if (autoNextToggle.checked) {
    autoNextCard.style.backgroundColor = "#f0fdf4"; 
    autoNextCard.style.borderColor = "#22c55e";     
    autoNextCard.style.borderStyle = "solid";
    autoNextCard.style.borderWidth = "1px";
    autoNextCard.style.color = "#166534";           
  } else {
    autoNextCard.style.backgroundColor = "#f1f5f9"; 
    autoNextCard.style.borderColor = "transparent";
    autoNextCard.style.color = "#334155";
  }
}

async function loadAllData() {
  const result = await chrome.storage.sync.get(['customModels', 'selectedModelId', 'autoAnswerState', 'autoNextState']);
  currentCustomModels = result.customModels || [];

  autoAnswerToggle.checked = !!result.autoAnswerState;
  autoNextToggle.checked = !!result.autoNextState;

  modelSelect.innerHTML = '';
  if (currentCustomModels.length === 0) {
    const opt = document.createElement('option');
    opt.value = "";
    opt.innerText = "-- 请先在下方添加AI密钥 --";
    modelSelect.appendChild(opt);
  } else {
    currentCustomModels.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.innerText = m.name;
      if (m.id === result.selectedModelId) opt.selected = true;
      modelSelect.appendChild(opt);
    });
  }

  renderModelList();
  updateToggleVisuals();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:') && !tab.url.startsWith('file:')) {
    chrome.tabs.sendMessage(tab.id, { action: "getLiveStatus" }, (response) => {
      if (chrome.runtime.lastError) {
        setDefaultUI();
        return;
      }
      if (response && response.success) {
        if (response.answer) answerContent.innerText = response.answer;
        if (response.parse) parseContent.innerText = response.parse;
        if (response.status) statusContent.innerText = response.status;
      } else {
        setDefaultUI();
      }
    });
  } else {
    setDefaultUI();
  }
}

function setDefaultUI() {
  if (autoAnswerToggle.checked || autoNextToggle.checked) {
    answerContent.innerText = "等待作业触发...";
    parseContent.innerText = "正在持续监听答题流水线...";
    statusContent.innerText = "状态：就绪，等待题目检测...";
  } else {
    answerContent.innerText = "等待作业触发...";
    parseContent.innerText = "请在上方配置并开启自动化功能";
    statusContent.innerText = "状态：就绪，等待题目检测... (自动化未开启)";
  }
}

function startSyncListener() {
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.autoAnswerState !== undefined) {
      autoAnswerToggle.checked = !!changes.autoAnswerState.newValue;
    }
    if (changes.autoNextState !== undefined) {
      autoNextToggle.checked = !!changes.autoNextState.newValue;
    }
    updateToggleVisuals();
    syncStateToContentScript();
  });

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "updatePopupDisplay") {
      if (request.answer) answerContent.innerText = request.answer;
      if (request.parse) parseContent.innerText = request.parse;
      if (request.status) statusContent.innerText = request.status;
    }
  });
}

function renderModelList() {
  modelListContainer.innerHTML = '';
  if (currentCustomModels.length === 0) {
    modelListContainer.innerHTML = `<div style="font-size:11px; color:#94a3b8; text-align:center; padding:10px;">暂无自定义配置，请点击上方按钮添加</div>`;
    return;
  }

  currentCustomModels.forEach(m => {
    const div = document.createElement('div');
    div.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:6px; border-radius:6px; margin-bottom:5px; font-size:11px; border:1px solid #e2e8f0;";
    
    let maskedKey = "未配置";
    if (m.key) {
      maskedKey = m.key.length > 8 ? m.key.substring(0, 4) + "••••" + m.key.substring(m.key.length - 4) : "••••••••";
    }

    div.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:2px; flex:1; overflow:hidden; padding-right:4px;">
        <span style="font-weight:bold; color:#1e293b; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${m.name} [${m.modelParam}]</span>
        <span style="color:#64748b; font-size:10px; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">密钥: ${maskedKey}</span>
      </div>
      <div style="display:flex; gap:4px; flex-shrink:0;">
        <button class="edit-item-btn" style="background:#3b82f6; color:#fff; border:none; padding:3px 6px; border-radius:4px; cursor:pointer; font-size:10px;">编辑</button>
        <button class="del-item-btn" style="background:#ef4444; color:#fff; border:none; padding:3px 6px; border-radius:4px; cursor:pointer; font-size:10px;">删除</button>
      </div>
    `;
    
    div.querySelector('.del-item-btn').onclick = async () => {
      currentCustomModels = currentCustomModels.filter(item => item.id !== m.id);
      await chrome.storage.sync.set({ customModels: currentCustomModels });
      const result = await chrome.storage.sync.get('selectedModelId');
      if (result.selectedModelId === m.id) {
        await chrome.storage.sync.set({ selectedModelId: currentCustomModels.length > 0 ? currentCustomModels[0].id : "" });
      }
      await loadAllData();
    };

    div.querySelector('.edit-item-btn').onclick = () => {
      editingModelId.value = m.id;
      newModelName.value = m.name;
      newModelUrl.value = m.apiUrl;
      newModelKey.value = m.key;
      newModelRequestName.value = m.modelParam;
      addModelForm.classList.remove('hidden');
    };

    modelListContainer.appendChild(div);
  });
}

async function syncStateToContentScript() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:') && !tab.url.startsWith('file:')) {
    chrome.tabs.sendMessage(tab.id, {
      action: "syncStates",
      autoAnswer: autoAnswerToggle.checked,
      autoNext: autoNextToggle.checked
    }, () => {
      if (chrome.runtime.lastError) {}
    });
  }
}

async function ensureContentScriptInjected(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { action: "ping" });
    if (chrome.runtime.lastError) { /* 静默允许往下走进行注入 */ }
    if (res && res.success) return true;
  } catch (e) {}
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    await new Promise(r => setTimeout(r, 200));
    return true;
  } catch (err) {
    return false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadAllData();
  startSyncListener();
});

settingsToggleBtn.onclick = () => settingsPanel.classList.toggle('hidden');
toggleAddModelBtn.onclick = () => {
  editingModelId.value = "";
  newModelName.value = ''; newModelUrl.value = ''; newModelKey.value = ''; newModelRequestName.value = '';
  addModelForm.classList.toggle('hidden');
};
cancelAddModelBtn.onclick = () => { 
  editingModelId.value = "";
  newModelName.value = ''; newModelUrl.value = ''; newModelKey.value = ''; newModelRequestName.value = '';
  addModelForm.classList.add('hidden'); 
};

addCustomModelBtn.onclick = async () => {
  const name = newModelName.value.trim();
  const url = newModelUrl.value.trim();
  const key = newModelKey.value.trim();
  const param = newModelRequestName.value.trim();
  const targetId = editingModelId.value;

  if (!name || !url || !key || !param) { alert('请填写完整模型配置！'); return; }

  if (targetId) {
    currentCustomModels = currentCustomModels.map(m => {
      if (m.id === targetId) {
        return { id: targetId, name, apiUrl: url, key, modelParam: param };
      }
      return m;
    });
  } else {
    const nid = generateId();
    currentCustomModels.push({ id: nid, name, apiUrl: url, key, modelParam: param });
    await chrome.storage.sync.set({ selectedModelId: nid });
  }

  await chrome.storage.sync.set({ customModels: currentCustomModels });
  
  const currentSelect = await chrome.storage.sync.get('selectedModelId');
  if(!currentSelect.selectedModelId && currentCustomModels.length > 0) {
    await chrome.storage.sync.set({ selectedModelId: currentCustomModels[0].id });
  }

  editingModelId.value = "";
  newModelName.value = ''; newModelUrl.value = ''; newModelKey.value = ''; newModelRequestName.value = '';
  addModelForm.classList.add('hidden');
  await loadAllData();
};

autoAnswerToggle.onchange = async () => {
  await chrome.storage.sync.set({ autoAnswerState: autoAnswerToggle.checked });
  updateToggleVisuals();
  await syncStateToContentScript();
};

autoNextToggle.onchange = async () => {
  await chrome.storage.sync.set({ autoNextState: autoNextToggle.checked });
  updateToggleVisuals();
  await syncStateToContentScript();
};

modelSelect.onchange = async () => {
  if (modelSelect.value) {
    await chrome.storage.sync.set({ selectedModelId: modelSelect.value });
  }
};

floatingBtn.onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:') && !tab.url.startsWith('file:')) {
    const ok = await ensureContentScriptInjected(tab.id);
    if (ok) {
      chrome.tabs.sendMessage(tab.id, { action: "createFloatingWindow" }, () => {
        if(chrome.runtime.lastError){}
        window.close();
      });
    }
  }
};

recognizeBtn.onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) return;
  const ok = await ensureContentScriptInjected(tab.id);
  if (!ok) return;

  loadingIndicator.classList.remove('hidden');
  answerContent.innerText = '';
  parseContent.innerText = '';

  chrome.tabs.sendMessage(tab.id, { action: "extractText" }, async (response) => {
    if (chrome.runtime.lastError) {
      loadingIndicator.classList.add('hidden');
      return;
    }
    if (!response || !response.text) {
      loadingIndicator.classList.add('hidden');
      
      let ansText = "未抓取到题目";
      let parseText = "请在上方配置并开启自动化功能";
      let statusText = "状态：就绪，等待题目检测...";

      answerContent.innerText = ansText;
      parseContent.innerText = parseText;
      statusContent.innerText = statusText;

      chrome.tabs.sendMessage(tab.id, {
        action: "updateFloaterDisplayFromPopup",
        answer: ansText,
        parse: parseText,
        status: statusText
      }, () => { if(chrome.runtime.lastError){} });
      return;
    }

    const result = await chrome.storage.sync.get(['customModels', 'selectedModelId']);
    const models = result.customModels || [];
    let activeModel = models.find(m => m.id === result.selectedModelId) || models[0];
    
    if (!activeModel || !activeModel.key) {
      loadingIndicator.classList.add('hidden');
      answerContent.innerText = '错误：请先点击【AI设置】添加并配置您的自定义模型。';
      return;
    }

    chrome.runtime.sendMessage({ action: "callAIProxy", model: activeModel, userText: response.text }, (res) => {
      loadingIndicator.classList.add('hidden');
      if (res && res.success && res.data) {
        let text = res.data;
        
        let answer = 'A';
        let cleaned = text.replace(/["'`\s\*[\]()（）【】]/g, '');
        const match1 = cleaned.match(/答案[:：]([A-Da-d])/i);
        if (match1) {
          answer = match1[1].toUpperCase();
        } else if (/选([A-Da-d])/i.test(cleaned)) {
          const match2 = cleaned.match(/选([A-Da-d])/i);
          if (match2) answer = match2[1].toUpperCase();
        } else if (/^[A-Da-d]/i.test(cleaned)) {
          answer = cleaned.charAt(0).toUpperCase();
        } else {
          const matchRegex = text.match(/[A-D a-d]/);
          if (matchRegex) answer = matchRegex[0].trim().toUpperCase();
        }

        const parseMatch = text.match(/解析[：:]\s*([\s\S]*?)$/i);
        let parse = parseMatch ? parseMatch[1].trim() : text.replace(/答案[:：]./gi, '').trim();
        if(parse.length > 80) parse = parse.substring(0, 80) + "...";

        let ansText = "答案: " + answer;
        let parseText = "解析: " + parse;
        let statusText = "正常答题：答案提取成功并已模拟点击选项。";

        answerContent.innerText = ansText;
        parseContent.innerText = parseText;
        statusContent.innerText = statusText;

        chrome.tabs.sendMessage(tab.id, {
          action: "updateFloaterDisplayFromPopup",
          answer: ansText,
          parse: parseText,
          status: statusText
        }, () => { if(chrome.runtime.lastError){} });

      } else {
        let ansText = "未识别";
        let parseText = "接口未响应或Key失效";
        let statusText = "异常状态：模型调用失败，请检查配置。";

        answerContent.innerText = ansText;
        parseContent.innerText = parseText;
        statusContent.innerText = statusText;
        
        chrome.tabs.sendMessage(tab.id, {
          action: "updateFloaterDisplayFromPopup",
          answer: ansText,
          parse: parseText,
          status: statusText
        }, () => { if(chrome.runtime.lastError){} });
      }
    });
  });
};
