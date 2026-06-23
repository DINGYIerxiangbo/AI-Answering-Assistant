(function() {
  if (window.__aiContentScriptLoaded) return;
  window.__aiContentScriptLoaded = true;

  let autoAnswerTimer = null;
  let autoNextTimer = null;
  
  let isProcessingLock = false; 
  
  let hasQueriedFingerprint = ""; 
  let lastProcessedQuestionFingerprint = ""; 

  let isAutoAnswerRunning = false;
  let isAutoNextRunning = false;
  let nextRoundState = 0; 
  let randomDelayActive = false; 

  const targetSubjects = [
    "科学常识", "健康素养", "食品安全", "应急避险", "科技前沿",
    "航空航天", "信息技术", "天文地理", "历史文化", "消防安全", "气象常识"
  ];

  function smartExtractPageText() {
    try {
      const titleEl = document.querySelector('.topic-title');
      if (!titleEl) return "";
      let qText = titleEl.innerText.trim();

      const optionEls = document.querySelectorAll('.topic-box .answer-item');
      let optionsText = [];
      optionEls.forEach(el => {
        if(el.innerText.trim()) {
          optionsText.push(el.innerText.trim());
        }
      });

      if (qText.length < 2) return "";
      return `题目：${qText}\n选项：\n${optionsText.join('\n')}`;
    } catch (e) { 
      return ""; 
    }
  }

  function getScoreDiff() {
    try {
      const myScoreEl = document.querySelector('.head-box .left-box .fraction-text');
      const opScoreEl = document.querySelector('.head-box .right-box .fraction-text');
      
      if (myScoreEl && opScoreEl) {
        let myNum = parseInt(myScoreEl.innerText.replace(/[^0-9]/g, '')) || 0;
        let opNum = parseInt(opScoreEl.innerText.replace(/[^0-9]/g, '')) || 0;
        return myNum - opNum;
      }
    } catch(e){}
    return 0; 
  }

  async function runAutoAnswerCycle() {
    if (!isAutoAnswerRunning || isProcessingLock || randomDelayActive) return;
    if (findElementByText("再来一局") || findElementByText("确定")) return;

    let currentFingerprint = smartExtractPageText();
    if (!currentFingerprint || currentFingerprint.length < 10) return;
    
    if (currentFingerprint === hasQueriedFingerprint || currentFingerprint === lastProcessedQuestionFingerprint) {
      return; 
    }

    let diff = getScoreDiff();
    if (diff > 45) {
      randomDelayActive = true; 
      isProcessingLock = true;  
      
      hasQueriedFingerprint = currentFingerprint;

      let remainingSeconds = Math.floor(Math.random() * (10 - 3 + 1)) + 3;
      const randomOptions = ['A', 'B', 'C', 'D'];
      const randomChoice = randomOptions[Math.floor(Math.random() * randomOptions.length)];
      
      const thisSnapshot = currentFingerprint;
      
      let countdownTimer = setInterval(() => {
        if (smartExtractPageText() !== thisSnapshot) {
          clearInterval(countdownTimer);
          randomDelayActive = false;
          isProcessingLock = false;
          return;
        }

        if (remainingSeconds > 0) {
          const ansText = "随机待发: " + randomChoice;
          const parseText = "分差安全隔离中（当前分差: " + diff + " 分）。";
          const statusText = ` [倒计时持续中 ${remainingSeconds}s] 程序已进入[随机干扰/模拟真人减速]状态，秒数归零后自动点击。`;
          
          updateFloaterDisplay(ansText, parseText, statusText);
          remainingSeconds--;
        } else {
          clearInterval(countdownTimer);
          
          if (smartExtractPageText() === thisSnapshot) {
            let success = window.autoSelectOption(randomChoice);
            if (success) {
              lastProcessedQuestionFingerprint = thisSnapshot;
            }
            updateFloaterDisplay("随机选择: " + randomChoice, "已完成安全降速释放。", "随机保护：已成功在设定延迟后随机点击选项。");
          }
          
          setTimeout(() => {
            randomDelayActive = false; 
            isProcessingLock = false;
          }, 400);
        }
      }, 1000);

      return;
    }

    isProcessingLock = true;
    const thisRequestSnapshot = currentFingerprint; 
    hasQueriedFingerprint = thisRequestSnapshot;

    try {
      const result = await chrome.storage.sync.get(['customModels', 'selectedModelId']);
      const models = result.customModels || [];
      let activeModel = models.find(m => m.id === result.selectedModelId) || models[0];
      
      if (!activeModel || !activeModel.key) {
        isProcessingLock = false;
        return; 
      }

      updateFloaterDisplay("等待AI返回", "正在深度分析题目特征...", "正常答题：当前分差安全，大模型正在计算最佳答案。");

      chrome.runtime.sendMessage({ action: "callAIProxy", model: activeModel, userText: thisRequestSnapshot }, (res) => {
        try {
          let realtimeCheckText = smartExtractPageText();
          if (realtimeCheckText !== thisRequestSnapshot) {
            isProcessingLock = false; 
            return; 
          }

          if (res && res.success && res.data) {
            const { answer, parse } = splitAnswerAndParse(res.data);
            
            if (answer && ['A', 'B', 'C', 'D'].includes(answer)) {
              let selectSuccess = window.autoSelectOption(answer);
              if (selectSuccess) {
                lastProcessedQuestionFingerprint = thisRequestSnapshot; 
              }
              updateFloaterDisplay(answer, parse, "正常答题：答案提取成功并已模拟点击选项。");
            }
          } else {
            updateFloaterDisplay("未识别", "接口未响应或Key失效", "异常状态：模型调用失败，请检查配置。");
          }
        } catch(e){}
        
        setTimeout(() => {
          isProcessingLock = false; 
        }, 500);
      });

    } catch (err) {
      isProcessingLock = false;
    }
  }

  window.autoSelectOption = function(label) {
    if (!label) return false;
    const target = label.trim().toUpperCase();

    const items = document.querySelectorAll('.topic-box .answer-item');
    for (let item of items) {
      let text = item.innerText.trim();
      if (text.startsWith(target) || text.startsWith(target + '、') || text.startsWith(target + ' ')) {
        clickElement(item);
        return true;
      }
    }
    return false;
  };

  function runAutoNextCycle() {
    if (!isAutoNextRunning) return;
    try {
      if (nextRoundState === 0) {
        let retryBtn = findElementByText("再来一局") || document.querySelector('.btn-list button, .retry-btn, .play-again');
        if (retryBtn) {
          clickElement(retryBtn);
          nextRoundState = 1; 
          hasQueriedFingerprint = "";
          lastProcessedQuestionFingerprint = ""; 
          updateFloaterDisplay("等待开局", "准备跳转下一局...", "自动下一局：已点击[再来一局]，正在等待加载科目选关页。");
        }
        return;
      }

      if (nextRoundState === 1) {
        if (findElementByText("再来一局")) return;

        let clickedSubject = false;
        const shuffledSubjects = [...targetSubjects].sort(() => Math.random() - 0.5);
        for (let subject of shuffledSubjects) {
          let targetEl = findElementByText(subject);
          if (targetEl) {
            clickElement(targetEl);
            clickedSubject = true;
            break; 
          }
        }
        if (clickedSubject) {
          nextRoundState = 2;
          updateFloaterDisplay("科目已选", "随机科目匹配成功", "自动下一局：已成功随机点选分类科目，等待长出题目。");
        }
        return;
      }

      if (nextRoundState === 2) {
        const options = document.querySelectorAll('.topic-box .answer-item');
        if (options.length === 0) return;

        const randomOptions = ['A', 'B', 'C', 'D'];
        const randomChoice = randomOptions[Math.floor(Math.random() * randomOptions.length)];
        let selectSuccess = window.autoSelectOption(randomChoice);
        
        if (selectSuccess) {
          setTimeout(() => {
            let confirmBtn = findElementByText("确定") || document.querySelector('.btn-confirm, .confirm-btn, .save-btn');
            if (confirmBtn) clickElement(confirmBtn);
            nextRoundState = 0;
            updateFloaterDisplay("新对局就绪", "首题已初始化", "自动下一局：已成功点击[确定]激活比赛，闭关完成。");
          }, 500);
        }
      }
    } catch(e){}
  }

  function splitAnswerAndParse(text) {
    if (!text || text.trim().length === 0) return { answer: 'A', parse: '未收到数据' };
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
    
    return { answer, parse };
  }

  function findElementByText(str) {
    const arr = document.querySelectorAll('button, span, div, a, p, li');
    for(let el of arr) {
      if(el.offsetParent !== null && el.innerText && el.innerText.trim() === str) return el;
    }
    return null;
  }

  function clickElement(el) {
    try {
      el.click();
      ['mousedown', 'mouseup', 'change', 'click'].forEach(evt => {
        el.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
      });
    } catch(e) {}
  }

  function syncLocalTimers() {
    clearInterval(autoAnswerTimer);
    if (isAutoAnswerRunning) {
      autoAnswerTimer = setInterval(() => { runAutoAnswerCycle(); }, 1000); 
    } else {
      isProcessingLock = false;
      randomDelayActive = false;
      hasQueriedFingerprint = "";
      lastProcessedQuestionFingerprint = "";
    }

    clearInterval(autoNextTimer);
    if (isAutoNextRunning) {
      autoNextTimer = setInterval(() => { runAutoNextCycle(); }, 3000); 
    } else {
      nextRoundState = 0;
    }
  }

  function createFloatingWindow() {
    if (document.getElementById('ai-floater-root')) return;

    const rootContainer = document.createElement('div');
    rootContainer.id = 'ai-floater-root';
    rootContainer.style.cssText = "position:fixed; top:140px; right:30px; z-index:2147483647;";
    document.body.appendChild(rootContainer);

    const shadow = rootContainer.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .wrapper { width: 340px; background: #ffffff; border: 2px solid #3b82f6; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.18); padding: 12px; font-family: sans-serif; color: #334155; }
      .bar { font-weight: bold; font-size: 14px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; margin-bottom: 10px; cursor: move; user-select: none; }
      .button-row-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 10px; }
      .btn-card { background: #f1f5f9; padding: 6px; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px solid transparent; }
      .btn-card.active { border-color: #22c55e; background: #f0fdf4; color: #166534; border-style: solid; border-width: 1px; }
      .card-title { font-size: 11px; font-weight: bold; margin-bottom: 4px; color: #475569; text-align: center; }
      .action-small-btn { background: #ef4444; color: white; border: none; font-size: 11px; font-weight: bold; border-radius: 8px; cursor: pointer; padding: 8px 4px; display: flex; align-items: center; justify-content: center; text-align: center; line-height: 1.2; }
      .primary-big-btn { width: 100%; background: #3b82f6; color: #fff; border: none; padding: 10px; border-radius: 8px; font-weight: bold; font-size: 13px; cursor: pointer; text-align: center; margin-top: 2px; }
      .box-ans { padding: 6px; background: #f0fdf4; color: #166534; font-weight: bold; font-size: 12px; border-left: 3px solid #22c55e; margin-top: 8px; border-radius: 4px; }
      .box-prs { font-size: 11px; color: #64748b; margin-top: 6px; max-height: 55px; overflow-y: auto; padding: 4px 6px; background: #fafafa; border-left: 3px solid #3b82f6; border-radius: 4px; }
      .box-status { font-size: 11px; color: #b45309; margin-top: 6px; padding: 6px; background: #fffbeb; border-left: 3px solid #f59e0b; border-radius: 4px; font-weight: 500; line-height: 1.4; }
      .switch { position: relative; display: inline-block; width: 34px; height: 18px; }
      .switch input { opacity: 0; width: 0; height: 0; }
      .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: .2s; border-radius: 18px; }
      .slider:before { position: absolute; content: ""; height: 12px; width: 12px; left: 3px; bottom: 3px; background-color: white; transition: .2s; border-radius: 50%; }
      input:checked + .slider { background-color: #22c55e; }
      input:checked + .slider:before { transform: translateX(16px); }
    `;
    shadow.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.className = 'wrapper';
    wrapper.innerHTML = `
      <div class="bar">AI答题助手</div>
      <div class="button-row-grid">
        <div class="btn-card" id="f-ans-card">
          <span class="card-title">自动答题</span>
          <label class="switch"><input type="checkbox" id="f-ans-toggle"/><span class="slider round"></span></label>
        </div>
        <div class="btn-card" id="f-nxt-card">
          <span class="card-title">自动下一局</span>
          <label class="switch"><input type="checkbox" id="f-nxt-toggle"/><span class="slider round"></span></label>
        </div>
        <button id="f-close-btn" class="action-small-btn">关闭悬浮窗</button>
      </div>
      <div><button id="f-manual-btn" class="primary-big-btn">识别题目并解答</button></div>
      <div id="f-v-ans" class="box-ans">等待作业触发...</div>
      <div id="f-v-prs" class="box-prs">请在上方配置并开启自动化功能</div>
      <div id="f-v-status" class="box-status">状态：就绪，等待题目检测...</div>
    `;
    shadow.appendChild(wrapper);

    const fAnsToggle = shadow.getElementById('f-ans-toggle');
    const fNxtToggle = shadow.getElementById('f-nxt-toggle');
    const fAnsCard = shadow.getElementById('f-ans-card');
    const fNxtCard = shadow.getElementById('f-nxt-card');
    const fCloseBtn = shadow.getElementById('f-close-btn');
    const fManual = shadow.getElementById('f-manual-btn');

    isAutoAnswerRunning = false;
    isAutoNextRunning = false;
    chrome.storage.sync.set({ autoAnswerState: false, autoNextState: false });
    
    fAnsToggle.checked = false;
    fNxtToggle.checked = false;
    fAnsCard.classList.remove('active');
    fNxtCard.classList.remove('active');
    syncLocalTimers();

    fAnsToggle.onchange = () => {
      isAutoAnswerRunning = fAnsToggle.checked;
      chrome.storage.sync.set({ autoAnswerState: isAutoAnswerRunning });
      if(isAutoAnswerRunning) fAnsCard.classList.add('active'); else fAnsCard.classList.remove('active');
      syncLocalTimers();
    };

    fNxtToggle.onchange = () => {
      isAutoNextRunning = fNxtToggle.checked;
      chrome.storage.sync.set({ autoNextState: isAutoNextRunning });
      if(isAutoNextRunning) fNxtCard.classList.add('active'); else fNxtCard.classList.remove('active');
      syncLocalTimers();
    };

    fCloseBtn.onclick = () => { rootContainer.remove(); };

    fManual.onclick = () => {
      let text = smartExtractPageText();
      if (!text) {
        let ansStr = "未抓取到题目";
        let parseStr = "请在上方配置并开启自动化功能";
        let statusStr = "状态：就绪，等待题目检测...";
        
        shadow.getElementById('f-v-ans').innerText = ansStr;
        shadow.getElementById('f-v-prs').innerText = parseStr;
        shadow.getElementById('f-v-status').innerText = statusStr;

        chrome.runtime.sendMessage({ action: "updatePopupDisplay", answer: ansStr, parse: parseStr, status: statusStr }, () => { if(chrome.runtime.lastError){} });
        return;
      }
      shadow.getElementById('f-v-ans').innerText = "正在识别...";
      shadow.getElementById('f-v-status').innerText = "手动模式：正在解析当前静态页面元素。";
      chrome.storage.sync.get(['customModels', 'selectedModelId'], (result) => {
        const models = result.customModels || [];
        let activeModel = models.find(m => m.id === result.selectedModelId) || models[0];
        if (!activeModel) return;
        chrome.runtime.sendMessage({ action: "callAIProxy", model: activeModel, userText: text }, (res) => {
          if (res && res.success && res.data) {
            const parsed = splitAnswerAndParse(res.data);
            let ansText = "答案: " + parsed.answer;
            let parseText = "解析: " + parsed.parse;
            let statusText = "正常答题：答案提取成功并已模拟点击选项。";
            
            shadow.getElementById('f-v-ans').innerText = ansText;
            shadow.getElementById('f-v-prs').innerText = parseText;
            shadow.getElementById('f-v-status').innerText = statusText;

            chrome.runtime.sendMessage({ action: "updatePopupDisplay", answer: ansText, parse: parseText, status: statusText }, () => { if(chrome.runtime.lastError){} });
          }
        });
      });
    };

    let isDrag = false, ox = 0, oy = 0;
    shadow.querySelector('.bar').onmousedown = (e) => {
      isDrag = true;
      ox = e.clientX - rootContainer.offsetLeft;
      oy = e.clientY - rootContainer.offsetTop;
      e.preventDefault();
    };
    document.addEventListener('mousemove', (e) => {
      if (!isDrag) return;
      rootContainer.style.left = (e.clientX - ox) + 'px';
      rootContainer.style.top = (e.clientY - oy) + 'px';
    });
    document.addEventListener('mouseup', () => isDrag = false);
  }

  function updateFloaterDisplay(ans, parse, statusText = "") {
    let finalAns = ans.startsWith("答案:") || ans.startsWith("随机") ? ans : "答案: " + ans;
    let finalParse = parse.startsWith("解析:") || parse.startsWith("分差") ? parse : "解析: " + parse;

    try {
      const root = document.getElementById('ai-floater-root');
      if (root && root.shadowRoot) {
        const fAns = root.shadowRoot.getElementById('f-v-ans');
        const fPrs = root.shadowRoot.getElementById('f-v-prs');
        const fStatus = root.shadowRoot.getElementById('f-v-status');
        
        if (fAns) fAns.innerText = finalAns;
        if (fPrs) fPrs.innerText = finalParse;
        if (fStatus && statusText) fStatus.innerText = statusText;
      }
    } catch(e){}

    chrome.runtime.sendMessage({ action: "updatePopupDisplay", answer: finalAns, parse: finalParse, status: statusText }, () => { if(chrome.runtime.lastError){} });
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "ping") {
      sendResponse({ success: true });
    } else if (request.action === "extractText") {
      sendResponse({ text: smartExtractPageText() });
    } else if (request.action === "createFloatingWindow") {
      createFloatingWindow();
      sendResponse({ success: true });
    } else if (request.action === "syncStates") {
      isAutoAnswerRunning = request.autoAnswer;
      isAutoNextRunning = request.autoNext;
      
      try {
        const root = document.getElementById('ai-floater-root');
        if (root && root.shadowRoot) {
          const fAnsToggle = root.shadowRoot.getElementById('f-ans-toggle');
          const fNxtToggle = root.shadowRoot.getElementById('f-nxt-toggle');
          const fAnsCard = root.shadowRoot.getElementById('f-ans-card');
          const fNxtCard = root.shadowRoot.getElementById('f-nxt-card');
          if (fAnsToggle) fAnsToggle.checked = isAutoAnswerRunning;
          if (fNxtToggle) fNxtToggle.checked = isAutoNextRunning;
          if (fAnsCard) { if(isAutoAnswerRunning) fAnsCard.classList.add('active'); else fAnsCard.classList.remove('active'); }
          if (fNxtCard) { if(isAutoNextRunning) fNxtCard.classList.add('active'); else fNxtCard.classList.remove('active'); }
        }
      } catch(e){}

      syncLocalTimers();
      sendResponse({ success: true });
    } else if (request.action === "getLiveStatus") {
      let liveAns = "等待作业触发...";
      let livePrs = "请在上方配置并开启自动化功能";
      let liveStatus = "状态：就绪，等待题目检测...";
      try {
        const root = document.getElementById('ai-floater-root');
        if (root && root.shadowRoot) {
          liveAns = root.shadowRoot.getElementById('f-v-ans').innerText;
          livePrs = root.shadowRoot.getElementById('f-v-prs').innerText;
          liveStatus = root.shadowRoot.getElementById('f-v-status').innerText;
        }
      } catch(e){}
      sendResponse({ success: true, answer: liveAns, parse: livePrs, status: liveStatus });
    } else if (request.action === "updateFloaterDisplayFromPopup") {
      try {
        const root = document.getElementById('ai-floater-root');
        if (root && root.shadowRoot) {
          const fAns = root.shadowRoot.getElementById('f-v-ans');
          const fPrs = root.shadowRoot.getElementById('f-v-prs');
          const fStatus = root.shadowRoot.getElementById('f-v-status');
          if (fAns) fAns.innerText = request.answer;
          if (fPrs) fPrs.innerText = request.parse;
          if (fStatus) fStatus.innerText = request.status;
        }
      } catch(e){}
      sendResponse({ success: true });
    }
    return true; 
  });
})();
