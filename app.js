const state = {
  mode: "poster",
  cards: [],
  trainingOrder: "sequence",
  trainingIndex: 0,
  mistakes: new Set(),
  ocrText: "",
  boxes: [],
  suggestions: [],
  tempBox: null,
  dragging: null,
  user: null,
  groups: [],
  activeGroupId: null,
  groupCards: {},
  groupLocked: false,
};

const mockCards = [
  {
    id: 1,
    name: "星云兔",
    description: "来自银河的治愈系向导，擅长用光点记录直播现场。",
    image: "",
    status: "draft",
  },
  {
    id: 2,
    name: "棉花拳",
    description: "擅长软萌外形与硬核攻击的反差角色。",
    image: "",
    status: "draft",
  },
  {
    id: 3,
    name: "机甲萤火",
    description: "夜间巡航的机甲侦察兵，闪光尾翼是标识。",
    image: "",
    status: "draft",
  },
];

const dom = {
  modeButtons: document.querySelectorAll(".mode-switch__btn"),
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("file-input"),
  detectPill: document.getElementById("detect-pill"),
  aiStatus: document.getElementById("ai-status"),
  ocrText: document.getElementById("ocr-text"),
  pipelineSteps: document.querySelectorAll(".pipeline__step"),
  previewImage: document.getElementById("preview-image"),
  cropOverlay: document.getElementById("crop-overlay"),
  generateCards: document.getElementById("generate-cards"),
  cardGrid: document.getElementById("card-grid"),
  confirmAll: document.getElementById("confirm-all"),
  flashcard: document.getElementById("flashcard"),
  flashImage: document.getElementById("flash-image"),
  flashName: document.getElementById("flash-name"),
  flashDesc: document.getElementById("flash-desc"),
  flashTag: document.getElementById("flash-tag"),
  statusBox: document.getElementById("status-box"),
  prevCard: document.getElementById("prev-card"),
  nextCard: document.getElementById("next-card"),
  markKnown: document.getElementById("mark-known"),
  markUnknown: document.getElementById("mark-unknown"),
  modeSegment: document.getElementById("mode-segment"),
  mockGenerate: document.getElementById("mock-generate"),
  authEmail: document.getElementById("auth-email"),
  authPassword: document.getElementById("auth-password"),
  authStatus: document.getElementById("auth-status"),
  signUp: document.getElementById("sign-up"),
  signIn: document.getElementById("sign-in"),
  signInGithub: document.getElementById("sign-in-github"),
  signOut: document.getElementById("sign-out"),
  syncSave: document.getElementById("sync-save"),
  syncLoad: document.getElementById("sync-load"),
  syncStatus: document.getElementById("sync-status"),
  groupSelect: document.getElementById("group-select"),
  groupName: document.getElementById("group-name"),
  createGroup: document.getElementById("create-group"),
  groupRename: document.getElementById("group-rename"),
  renameGroup: document.getElementById("rename-group"),
  deleteGroup: document.getElementById("delete-group"),
  groupStatus: document.getElementById("group-status"),
  uploadGroupSelect: document.getElementById("upload-group-select"),
  uploadGroupName: document.getElementById("upload-group-name"),
  uploadCreateGroup: document.getElementById("upload-create-group"),
  uploadGroupStatus: document.getElementById("upload-group-status"),
  panelOverlay: document.getElementById("panel-overlay"),
  panelTriggers: document.querySelectorAll("[data-panel-trigger]"),
  panelCloses: document.querySelectorAll("[data-panel-close]"),
  panels: document.querySelectorAll(".panel"),
  groupGrid: document.getElementById("group-grid"),
  cardSectionMeta: document.getElementById("card-section-meta"),
};

const jumpButtons = document.querySelectorAll("[data-jump]");
const API_BASE =
  window.FLASHCARD_API ||
  (window.location.origin.startsWith("http")
    ? window.location.origin
    : "http://localhost:3000");

const SUPABASE_URL = "https://boiznsjwyazawvubggxc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_lTKSPVkBj94F3rcoGlXaUA_364PHBGf";
const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const setActiveMode = (mode) => {
  state.mode = mode;
  dom.modeButtons.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.mode === mode);
  });
  dom.detectPill.textContent = mode === "poster" ? "等待海报" : "等待单图";
};

const setPipelineStep = (index) => {
  dom.pipelineSteps.forEach((step, stepIndex) => {
    step.classList.toggle("is-active", stepIndex <= index);
  });
};

const setAiStatus = (text) => {
  if (dom.aiStatus) {
    dom.aiStatus.textContent = text;
  }
};

const setOcrText = (text) => {
  state.ocrText = text || "";
  if (dom.ocrText) {
    dom.ocrText.textContent = state.ocrText || "暂无文本";
  }
};

const setAuthStatus = (text) => {
  if (dom.authStatus) {
    dom.authStatus.textContent = text;
  }
};

const setSyncStatus = (text) => {
  if (dom.syncStatus) {
    dom.syncStatus.textContent = text;
  }
};

const setGroupStatus = (text) => {
  if (dom.groupStatus) {
    dom.groupStatus.textContent = text;
  }
};

const setUploadGroupStatus = (text) => {
  if (dom.uploadGroupStatus) {
    dom.uploadGroupStatus.textContent = text;
  }
};

const autoSaveNow = async () => {
  if (!supabaseClient || !state.user || !state.activeGroupId) return;
  if (!state.cards.length) return;
  await saveCardsToCloud();
};

const lockGroupSelection = (message) => {
  state.groupLocked = true;
  if (dom.groupSelect) dom.groupSelect.disabled = true;
  if (dom.uploadGroupSelect) dom.uploadGroupSelect.disabled = true;
  if (message) {
    setGroupStatus(message);
    setUploadGroupStatus(message);
  }
};

const unlockGroupSelection = (message) => {
  state.groupLocked = false;
  if (dom.groupSelect) dom.groupSelect.disabled = false;
  if (dom.uploadGroupSelect) dom.uploadGroupSelect.disabled = false;
  if (message) {
    setGroupStatus(message);
    setUploadGroupStatus(message);
  }
};

const setCardSectionMeta = (text) => {
  if (dom.cardSectionMeta) {
    dom.cardSectionMeta.textContent = text;
  }
};

const closePanels = () => {
  dom.panels.forEach((panel) => panel.classList.remove("is-active"));
  dom.panelOverlay?.classList.remove("is-active");
};

const reindexCards = () => {
  const updated = state.cards.map((card, index) => ({
    ...card,
    id: index + 1,
  }));
  setActiveCards(updated);
};

const generateId = () => {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `card_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const ensureCardIds = () => {
  const updated = state.cards.map((card) => ({
    ...card,
    uid: card.uid || generateId(),
  }));
  setActiveCards(updated);
};

const setActiveCards = (cards) => {
  state.cards = cards;
  if (state.activeGroupId) {
    state.groupCards[state.activeGroupId] = cards;
  }
};

const getGroupCards = (groupId) => state.groupCards[groupId] || [];

const getGroupName = (groupId) =>
  state.groups.find((group) => group.id === groupId)?.name || "";

const switchGroup = async (nextGroupId, { loadCloud = false } = {}) => {
  if (state.groupLocked && nextGroupId !== state.activeGroupId) {
    const notice = "当前组已锁定，请先保存到云端再切换";
    setGroupStatus(notice);
    setUploadGroupStatus(notice);
    return;
  }
  if (nextGroupId === state.activeGroupId) return;
  if (state.activeGroupId) {
    state.groupCards[state.activeGroupId] = state.cards;
  }
  state.activeGroupId = nextGroupId || null;

  if (!state.activeGroupId) {
    state.cards = [];
    state.trainingIndex = 0;
    state.mistakes.clear();
    renderCards();
    updateFlashcard();
    setCardSectionMeta("未选择组");
    return;
  }

  const activeName = getGroupName(state.activeGroupId);
  state.trainingIndex = 0;
  state.mistakes.clear();
  setActiveCards(getGroupCards(state.activeGroupId));
  renderCards();
  updateFlashcard();
  setCardSectionMeta(activeName ? `当前组：${activeName}` : "未选择组");

  if (loadCloud) {
    setCardSectionMeta("正在加载卡牌...");
    await loadCardsFromCloud();
  }
};

const renderCropOverlay = () => {
  dom.cropOverlay.innerHTML = "";
  const boxes = [...state.boxes];
  if (state.tempBox) {
    boxes.push(state.tempBox);
  }
  if (!boxes.length) return;

  boxes.forEach((boxData, index) => {
    const box = document.createElement("div");
    box.className = "preview-box";
    if (state.dragging?.index === index && state.dragging?.type === "move") {
      box.classList.add("is-active");
    }
    box.dataset.index = String(index);
    box.style.cssText = `left:${boxData.x}%;top:${boxData.y}%;width:${boxData.w}%;height:${boxData.h}%`;
    dom.cropOverlay.appendChild(box);
  });
};

const renderCards = () => {
  dom.cardGrid.innerHTML = "";
  if (!state.cards.length) {
    dom.cardGrid.innerHTML = `<div class="card empty">请先拖拽框选角色，再点击“确认框选”。</div>`;
    return;
  }

  state.cards.forEach((card) => {
    const cardEl = document.createElement("div");
    cardEl.className = "card";

    cardEl.innerHTML = `
      <div class="card__image">
        <img src="${card.image}" alt="${card.name}" />
      </div>
      <div class="card__fields">
        <label class="card__label">角色名称</label>
        <input type="text" value="${card.name}" data-field="name" data-id="${card.id}" />
        <label class="card__label">简介</label>
        <textarea data-field="description" data-id="${card.id}">${card.description}</textarea>
      </div>
      <div class="card__footer">
        <span class="card__status">${card.status === "confirmed" ? "已确认" : "待确认"}</span>
        <button class="btn tiny" data-action="toggle" data-id="${card.id}">${card.status === "confirmed" ? "改回草稿" : "确认卡片"}</button>
        <button class="btn tiny ghost" data-action="delete" data-id="${card.id}">删除</button>
      </div>
    `;

    dom.cardGrid.appendChild(cardEl);
  });
};

const updateFlashcard = () => {
  if (!state.cards.length) {
    dom.flashName.textContent = "角色名称";
    dom.flashDesc.textContent = "角色简介将显示在这里，支持从 OCR 或角色库自动生成。";
    dom.flashTag.textContent = "卡片未确认";
    dom.flashImage.style.backgroundImage = "linear-gradient(135deg, #fff0e2, #ffd0b4)";
    dom.statusBox.textContent = "已完成 0 / 0";
    return;
  }

  const order = getTrainingOrder();
  const card = order[state.trainingIndex % order.length];
  dom.flashName.textContent = card.name;
  dom.flashDesc.textContent = card.description;
  dom.flashTag.textContent = card.status === "confirmed" ? "已确认" : "待确认";
  dom.flashImage.style.backgroundImage = `url(${card.image})`;
  dom.statusBox.textContent = `已完成 ${state.trainingIndex + 1} / ${order.length}`;
};

const getTrainingOrder = () => {
  if (state.trainingOrder === "mistake") {
    const mistakes = state.cards.filter((card) => state.mistakes.has(card.id));
    return mistakes.length ? mistakes : state.cards;
  }
  if (state.trainingOrder === "random") {
    return [...state.cards].sort(() => 0.5 - Math.random());
  }
  return state.cards;
};

const applyMockData = (src, ocrText) => {
  dom.previewImage.src = src;
  dom.detectPill.textContent = state.mode === "poster" ? "检测到多角色" : "检测到单角色";
  setAiStatus("演示数据");
  setOcrText(ocrText || "未连接 OCR 服务，已使用演示内容。\n可启动本地后端启用 OCR + LLM。\n");
  state.boxes = [];
  state.tempBox = null;
  state.suggestions = mockCards.map((card) => ({
    name: card.name,
    description: card.description,
  }));
  setActiveCards([]);
  renderCropOverlay();
  renderCards();
  updateFlashcard();
};

const applyCardsFromAI = (src, cards, ocrText) => {
  dom.previewImage.src = src;
  state.suggestions = cards.map((card) => ({
    name: card.name || "",
    description: card.description || "",
  }));
  state.boxes = [];
  state.tempBox = null;
  setActiveCards([]);
  setOcrText(ocrText);
  renderCropOverlay();
  renderCards();
  updateFlashcard();
};

const parseImage = async (src) => {
  setPipelineStep(0);
  setAiStatus("识别中");
  setOcrText("正在识别文本，请稍候...");
  dom.detectPill.textContent = "解析中";

  try {
    const response = await fetch(`${API_BASE}/api/parse-image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: src,
        mode: state.mode,
        count: state.mode === "poster" ? 3 : 1,
      }),
    });

    if (!response.ok) {
      throw new Error("AI service error");
    }

    setPipelineStep(1);
    const data = await response.json();
    const cards = Array.isArray(data.cards) ? data.cards : [];
    if (!cards.length) {
      throw new Error("Empty cards");
    }
    setPipelineStep(2);
    setAiStatus("已完成");
    dom.detectPill.textContent = "请手动画框";
    applyCardsFromAI(src, cards, data.ocrText);
  } catch (error) {
    setPipelineStep(0);
    applyMockData(src, "解析失败，已回退到演示数据。\n请检查后端服务与密钥配置。");
  }
};

const handleFile = (file) => {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const src = event.target.result;
    dom.previewImage.src = src;
    state.boxes = [];
    state.tempBox = null;
    parseImage(src);
  };
  reader.readAsDataURL(file);
};

const rebuildCardsFromBoxes = () => {
  if (!dom.previewImage.src) return;
  setActiveCards([]);
  renderCards();
  updateFlashcard();
};

const getAuthInput = () => {
  return {
    email: dom.authEmail?.value?.trim(),
    password: dom.authPassword?.value?.trim(),
  };
};

const loadCardsFromCloud = async () => {
  if (!supabaseClient || !state.user) {
    setSyncStatus("请先登录");
    return;
  }
  if (!(await ensureGroupSelected())) {
    setSyncStatus("请先选择卡牌组");
    return;
  }
  setSyncStatus("加载中...");
  const { data, error } = await supabaseClient
    .from("cards")
    .select("id,card_uid,name,description,image_data,box,status")
    .eq("user_id", state.user.id)
    .eq("group_id", state.activeGroupId)
    .order("updated_at", { ascending: true });

  if (error) {
    setSyncStatus(`加载失败：${error.message || "请检查配置"}`);
    return;
  }

  const loaded = (data || []).map((card, index) => ({
    id: index + 1,
    uid: card.card_uid || generateId(),
    name: card.name || `角色 ${index + 1}`,
    description: card.description || "",
    image: card.image_data || "",
    status: card.status || "draft",
    box: card.box || null,
  }));
  setActiveCards(loaded);
  state.boxes = [];
  state.tempBox = null;
  renderCropOverlay();
  renderCards();
  updateFlashcard();
  setCardSectionMeta(`当前组：${dom.groupSelect?.selectedOptions?.[0]?.textContent || ""}`);
  setSyncStatus("已加载云端卡牌");
};

const saveCardsToCloud = async () => {
  if (!supabaseClient || !state.user) {
    setSyncStatus("请先登录");
    return;
  }
  if (!(await ensureGroupSelected())) {
    setSyncStatus("请先选择卡牌组");
    return;
  }
  if (!state.cards.length) {
    setSyncStatus("暂无卡牌可保存");
    return;
  }
  setSyncStatus("保存中...");

  ensureCardIds();

  const payload = state.cards.map((card) => ({
    user_id: state.user.id,
    group_id: state.activeGroupId,
    card_uid: card.uid,
    name: card.name,
    description: card.description,
    image_data: card.image,
    box: card.box || null,
    status: card.status || "draft",
  }));

  const { error } = await supabaseClient
    .from("cards")
    .upsert(payload, { onConflict: "user_id,card_uid" });
  if (error) {
    setSyncStatus(`保存失败：${error.message || "请检查配置"}`);
    return;
  }

  const mistakes = Array.from(state.mistakes);
  await supabaseClient
    .from("study_sessions")
    .delete()
    .eq("user_id", state.user.id)
    .eq("group_id", state.activeGroupId);
  await supabaseClient.from("study_sessions").insert({
    user_id: state.user.id,
    group_id: state.activeGroupId,
    mistakes,
    training_index: state.trainingIndex,
  });

  setSyncStatus("已保存到云端");
  unlockGroupSelection("已保存到云端，当前组已解锁");
  updateActiveGroupCount(state.cards.length);
  await loadGroupCounts();
};

const renderGroups = () => {
  if (!dom.groupSelect) return;
  dom.groupSelect.innerHTML = "";
  if (dom.uploadGroupSelect) dom.uploadGroupSelect.innerHTML = "";
  state.groups.forEach((group) => {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.name;
    dom.groupSelect.appendChild(option);
    if (dom.uploadGroupSelect) {
      const uploadOption = option.cloneNode(true);
      dom.uploadGroupSelect.appendChild(uploadOption);
    }
  });
  if (state.activeGroupId) {
    dom.groupSelect.value = state.activeGroupId;
    if (dom.uploadGroupSelect) dom.uploadGroupSelect.value = state.activeGroupId;
  }
  setGroupStatus(state.activeGroupId ? "已选择卡牌组" : "请选择或创建组");
  setUploadGroupStatus(state.activeGroupId ? "已选择卡牌组" : "请选择或创建组");
};

const renderGroupCards = () => {
  if (!dom.groupGrid) return;
  dom.groupGrid.innerHTML = "";
  if (!state.groups.length) {
    dom.groupGrid.innerHTML = `<div class="card empty">暂无卡牌组，请先创建。</div>`;
    return;
  }

  state.groups.forEach((group) => {
    const card = document.createElement("div");
    card.className = "group-card";
    card.dataset.groupId = group.id;
    card.innerHTML = `
      <div class="group-card__top">
        <div class="group-card__icon">📁</div>
        <div class="group-card__badge">${group.count ?? 0}</div>
      </div>
      <div>
        <div class="group-card__title">${group.name}</div>
        <div class="group-card__sub">${group.count ?? 0} cards</div>
      </div>
      <div class="group-card__actions">
        <button class="group-card__btn primary">进入训练</button>
        <button class="group-card__btn">查看</button>
      </div>
    `;
    dom.groupGrid.appendChild(card);
  });
};

const loadGroupCounts = async () => {
  if (!supabaseClient || !state.user || !state.groups.length) return;
  const updated = [];
  for (const group of state.groups) {
    const { count } = await supabaseClient
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", state.user.id)
      .eq("group_id", group.id);
    updated.push({ ...group, count: count || 0 });
  }
  state.groups = updated;
  renderGroupCards();
};

const updateActiveGroupCount = (count) => {
  if (!state.activeGroupId) return;
  state.groups = state.groups.map((group) =>
    group.id === state.activeGroupId ? { ...group, count } : group
  );
  renderGroupCards();
};

const loadGroupsFromCloud = async () => {
  if (!supabaseClient || !state.user) return;
  const { data, error } = await supabaseClient
    .from("card_groups")
    .select("id,name")
    .eq("user_id", state.user.id)
    .order("created_at", { ascending: true });

  if (error) {
    setSyncStatus("加载卡牌组失败");
    return;
  }
  state.groups = data || [];
  if (!state.activeGroupId && state.groups.length) {
    state.activeGroupId = state.groups[0].id;
  }
  renderGroups();
  await loadGroupCounts();
};

const createGroup = async (nameInput, statusSetter) => {
  if (!supabaseClient || !state.user) {
    setSyncStatus("请先登录");
    statusSetter("请先登录后创建组");
    return;
  }
  const name = nameInput?.value?.trim();
  if (!name) {
    setSyncStatus("请输入组名");
    statusSetter("请输入组名");
    return;
  }
  statusSetter("创建中...");
  const { data, error } = await supabaseClient
    .from("card_groups")
    .insert({ user_id: state.user.id, name })
    .select("id,name")
    .single();

  if (error) {
    setSyncStatus("创建组失败");
    statusSetter(`创建失败：${error.message || "请检查配置"}`);
    return;
  }
  state.groups.push(data);
  state.activeGroupId = data.id;
  if (nameInput) {
    nameInput.value = "";
  }
  renderGroups();
  renderGroupCards();
  setSyncStatus("已创建卡牌组");
  statusSetter("已创建卡牌组");
};

const ensureGroupSelected = () => {
  if (state.activeGroupId) return true;
  setGroupStatus("请先选择或创建卡牌组");
  return false;
};

const renameGroup = async () => {
  if (!supabaseClient || !state.user) {
    setGroupStatus("请先登录");
    return;
  }
  if (!state.activeGroupId) {
    setGroupStatus("请先选择卡牌组");
    return;
  }
  const name = dom.groupRename?.value?.trim();
  if (!name) {
    setGroupStatus("请输入新名称");
    return;
  }
  setGroupStatus("保存中...");
  const { error } = await supabaseClient
    .from("card_groups")
    .update({ name })
    .eq("id", state.activeGroupId)
    .eq("user_id", state.user.id);
  if (error) {
    setGroupStatus(`修改失败：${error.message || "请检查配置"}`);
    return;
  }
  state.groups = state.groups.map((group) =>
    group.id === state.activeGroupId ? { ...group, name } : group
  );
  if (dom.groupRename) {
    dom.groupRename.value = "";
  }
  renderGroups();
  setGroupStatus("已更新组名称");
};

const deleteGroup = async () => {
  if (!supabaseClient || !state.user) {
    setGroupStatus("请先登录");
    return;
  }
  if (!state.activeGroupId) {
    setGroupStatus("请先选择卡牌组");
    return;
  }
  const ok = window.confirm("确定删除当前卡牌组及其卡片吗？此操作无法撤销。");
  if (!ok) return;

  setGroupStatus("删除中...");
  await supabaseClient
    .from("cards")
    .delete()
    .eq("user_id", state.user.id)
    .eq("group_id", state.activeGroupId);
  await supabaseClient
    .from("study_sessions")
    .delete()
    .eq("user_id", state.user.id)
    .eq("group_id", state.activeGroupId);

  const { error } = await supabaseClient
    .from("card_groups")
    .delete()
    .eq("id", state.activeGroupId)
    .eq("user_id", state.user.id);

  if (error) {
    setGroupStatus(`删除失败：${error.message || "请检查配置"}`);
    return;
  }

  state.groups = state.groups.filter((group) => group.id !== state.activeGroupId);
  state.activeGroupId = state.groups[0]?.id || null;
  state.cards = [];
  unlockGroupSelection();
  renderGroups();
  renderGroupCards();
  renderCards();
  updateFlashcard();
  setGroupStatus("已删除卡牌组");
};

const restoreSession = async () => {
  if (!supabaseClient) {
    setAuthStatus("Supabase 未加载");
    setGroupStatus("请检查网络后重试");
    return;
  }
  const { data } = await supabaseClient.auth.getSession();
  state.user = data.session?.user || null;
  setAuthStatus(state.user ? `已登录：${state.user.email}` : "未登录");
  if (state.user) {
    await loadGroupsFromCloud();
    await loadCardsFromCloud();
    const { data: sessionData } = await supabaseClient
      .from("study_sessions")
      .select("mistakes,training_index")
      .eq("user_id", state.user.id)
      .eq("group_id", state.activeGroupId)
      .maybeSingle();
    if (sessionData?.mistakes) {
      state.mistakes = new Set(sessionData.mistakes);
    }
    if (Number.isFinite(sessionData?.training_index)) {
      state.trainingIndex = sessionData.training_index;
    }
    updateFlashcard();
  } else {
    setGroupStatus("请先登录后管理卡牌组");
  }
};

const cropImageFromBox = (box) => {
  const image = dom.previewImage;
  if (!image || !image.naturalWidth || !image.naturalHeight) {
    return image?.src || "";
  }
  const canvas = document.createElement("canvas");
  const sx = Math.round((box.x / 100) * image.naturalWidth);
  const sy = Math.round((box.y / 100) * image.naturalHeight);
  const sw = Math.round((box.w / 100) * image.naturalWidth);
  const sh = Math.round((box.h / 100) * image.naturalHeight);
  canvas.width = Math.max(1, sw);
  canvas.height = Math.max(1, sh);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
};

const buildCardsFromBoxes = () => {
  if (!state.boxes.length) {
    return;
  }
  if (!ensureGroupSelected()) {
    setGroupStatus("请先选择或创建卡牌组");
    return;
  }
  const baseIndex = state.cards.length;
  const newCards = state.boxes.map((box, index) => {
    const suggestion = state.suggestions[index] || {};
    return {
      id: baseIndex + index + 1,
      uid: generateId(),
      name: suggestion.name || `角色 ${index + 1}`,
      description: suggestion.description || "",
      image: cropImageFromBox(box),
      status: "draft",
      box,
    };
  });
  setActiveCards([...state.cards, ...newCards]);
  reindexCards();
  renderCards();
  updateFlashcard();
  updateActiveGroupCount(state.cards.length);
  lockGroupSelection("当前组已锁定，保存到云端后可切换");
  autoSaveNow();
  if (state.activeGroupId) {
    setCardSectionMeta(`当前组：${dom.groupSelect?.selectedOptions?.[0]?.textContent || ""}`);
  }
  state.boxes = [];
  state.tempBox = null;
  renderCropOverlay();
  closePanels();
};

const getRelativeBox = (start, end, rect) => {
  const x1 = Math.min(start.x, end.x);
  const y1 = Math.min(start.y, end.y);
  const x2 = Math.max(start.x, end.x);
  const y2 = Math.max(start.y, end.y);
  const width = Math.max(1, x2 - x1);
  const height = Math.max(1, y2 - y1);
  return {
    x: ((x1 - rect.left) / rect.width) * 100,
    y: ((y1 - rect.top) / rect.height) * 100,
    w: (width / rect.width) * 100,
    h: (height / rect.height) * 100,
  };
};

const clampBox = (box) => {
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const w = clamp(box.w, 2, 100);
  const h = clamp(box.h, 2, 100);
  const x = clamp(box.x, 0, 100 - w);
  const y = clamp(box.y, 0, 100 - h);
  return { x, y, w, h };
};

const updateCardField = (id, field, value) => {
  const updated = state.cards.map((card) => {
    if (card.id === id) {
      return { ...card, [field]: value };
    }
    return card;
  });
  setActiveCards(updated);
  updateFlashcard();
};

const toggleCardStatus = (id) => {
  const updated = state.cards.map((card) => {
    if (card.id === id) {
      const nextStatus = card.status === "confirmed" ? "draft" : "confirmed";
      return { ...card, status: nextStatus };
    }
    return card;
  });
  setActiveCards(updated);
  renderCards();
  updateFlashcard();
  autoSaveNow();
};

const deleteCard = async (id) => {
  const target = state.cards.find((card) => card.id === id);
  setActiveCards(state.cards.filter((card) => card.id !== id));
  state.mistakes.delete(id);
  reindexCards();
  if (state.trainingIndex >= state.cards.length) {
    state.trainingIndex = Math.max(0, state.cards.length - 1);
  }
  renderCards();
  updateFlashcard();
  updateActiveGroupCount(state.cards.length);
  if (!state.cards.length) {
    unlockGroupSelection("当前组已解锁");
  }
  autoSaveNow();

  if (!target?.uid || !supabaseClient || !state.user || !state.activeGroupId) {
    return;
  }

  await supabaseClient
    .from("cards")
    .delete()
    .eq("user_id", state.user.id)
    .eq("group_id", state.activeGroupId)
    .eq("card_uid", target.uid);
};

const markCard = (known) => {
  const order = getTrainingOrder();
  const card = order[state.trainingIndex % order.length];
  if (!card) return;
  if (!known) {
    state.mistakes.add(card.id);
  } else {
    state.mistakes.delete(card.id);
  }
};

const goToNext = (step) => {
  if (!state.cards.length) return;
  const order = getTrainingOrder();
  state.trainingIndex = (state.trainingIndex + step + order.length) % order.length;
  updateFlashcard();
};

const attachEvents = () => {
  dom.panelTriggers.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.panelTrigger;
      dom.panels.forEach((panel) => {
        panel.classList.toggle("is-active", panel.dataset.panel === target);
      });
      dom.panelOverlay?.classList.add("is-active");
    });
  });

  dom.panelCloses.forEach((btn) => {
    btn.addEventListener("click", closePanels);
  });

  dom.panelOverlay?.addEventListener("click", closePanels);

  dom.modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => setActiveMode(btn.dataset.mode));
  });

  dom.dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dom.dropzone.classList.add("dragover");
  });

  dom.dropzone.addEventListener("dragleave", () => {
    dom.dropzone.classList.remove("dragover");
  });

  dom.dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dom.dropzone.classList.remove("dragover");
    handleFile(event.dataTransfer.files[0]);
  });

  dom.fileInput.addEventListener("change", (event) => {
    handleFile(event.target.files[0]);
  });

  dom.cardGrid.addEventListener("input", (event) => {
    const target = event.target;
    if (!target.dataset.field) return;
    updateCardField(Number(target.dataset.id), target.dataset.field, target.value);
  });

  dom.cardGrid.addEventListener("click", (event) => {
    const target = event.target;
    if (target.dataset.action === "toggle") {
      toggleCardStatus(Number(target.dataset.id));
    }
    if (target.dataset.action === "delete") {
      deleteCard(Number(target.dataset.id));
    }
  });

  dom.confirmAll.addEventListener("click", () => {
    state.cards = state.cards.map((card) => ({ ...card, status: "confirmed" }));
    renderCards();
    updateFlashcard();
    autoSaveNow();
    if (!ensureGroupSelected()) {
      dom.groupSelect?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  dom.generateCards.addEventListener("click", () => {
    buildCardsFromBoxes();
  });

  dom.signUp.addEventListener("click", async () => {
    if (!supabaseClient) {
      setAuthStatus("Supabase 未初始化，请检查网络或刷新页面");
      return;
    }
    const { email, password } = getAuthInput();
    if (!email || !password) {
      setAuthStatus("请填写邮箱和密码");
      return;
    }
    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) {
      setAuthStatus(`注册失败：${error.message || "请检查配置"}`);
      return;
    }
    setAuthStatus("注册成功，请查看邮箱确认");
  });

  dom.signIn.addEventListener("click", async () => {
    if (!supabaseClient) {
      setAuthStatus("Supabase 未初始化，请检查网络或刷新页面");
      return;
    }
    const { email, password } = getAuthInput();
    if (!email || !password) {
      setAuthStatus("请填写邮箱和密码");
      return;
    }
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setAuthStatus(`登录失败：${error.message || "请检查配置"}`);
      return;
    }
    state.user = data.user;
    setAuthStatus(`已登录：${data.user.email}`);
    await loadGroupsFromCloud();
    await loadCardsFromCloud();
  });

  dom.signOut.addEventListener("click", async () => {
    if (!supabaseClient) {
      setAuthStatus("Supabase 未初始化，请检查网络或刷新页面");
      return;
    }
    await supabaseClient.auth.signOut();
    state.user = null;
    state.groups = [];
    state.activeGroupId = null;
    state.groupCards = {};
    unlockGroupSelection();
    setAuthStatus("未登录");
    renderGroups();
  });

  dom.signInGithub.addEventListener("click", async () => {
    if (!supabaseClient) {
      setAuthStatus("Supabase 未初始化，请检查网络或刷新页面");
      return;
    }
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      setAuthStatus(`GitHub 登录失败：${error.message || "请检查配置"}`);
    } else {
      setAuthStatus("已跳转到 GitHub 登录");
    }
  });

  dom.groupSelect?.addEventListener("change", async () => {
    if (state.groupLocked) {
      if (dom.groupSelect) dom.groupSelect.value = state.activeGroupId || "";
      if (dom.uploadGroupSelect) dom.uploadGroupSelect.value = state.activeGroupId || "";
      setGroupStatus("当前组已锁定，请先保存到云端再切换");
      return;
    }
    const nextGroupId = dom.groupSelect.value || null;
    if (dom.uploadGroupSelect) {
      dom.uploadGroupSelect.value = nextGroupId || "";
    }
    setGroupStatus(nextGroupId ? "已选择卡牌组" : "请选择或创建组");
    setUploadGroupStatus(nextGroupId ? "已选择卡牌组" : "请选择或创建组");
    await switchGroup(nextGroupId, { loadCloud: false });
  });

  dom.createGroup?.addEventListener("click", () => {
    createGroup(dom.groupName, setGroupStatus);
  });

  dom.renameGroup?.addEventListener("click", () => {
    renameGroup();
  });

  dom.uploadGroupSelect?.addEventListener("change", async () => {
    if (state.groupLocked) {
      if (dom.uploadGroupSelect) dom.uploadGroupSelect.value = state.activeGroupId || "";
      if (dom.groupSelect) dom.groupSelect.value = state.activeGroupId || "";
      setUploadGroupStatus("当前组已锁定，请先保存到云端再切换");
      return;
    }
    const nextGroupId = dom.uploadGroupSelect.value || null;
    if (dom.groupSelect) {
      dom.groupSelect.value = nextGroupId || "";
    }
    setGroupStatus(nextGroupId ? "已选择卡牌组" : "请选择或创建组");
    setUploadGroupStatus(nextGroupId ? "已选择卡牌组" : "请选择或创建组");
    await switchGroup(nextGroupId, { loadCloud: false });
  });

  dom.uploadCreateGroup?.addEventListener("click", () => {
    createGroup(dom.uploadGroupName, setUploadGroupStatus);
  });

  dom.groupGrid?.addEventListener("click", async (event) => {
    const target = event.target.closest(".group-card");
    if (!target) return;
    const groupId = target.dataset.groupId;
    if (!groupId) return;
    if (state.groupLocked && groupId !== state.activeGroupId) {
      setGroupStatus("当前组已锁定，请先保存到云端再切换");
      setUploadGroupStatus("当前组已锁定，请先保存到云端再切换");
      return;
    }
    if (dom.groupSelect) {
      dom.groupSelect.value = groupId;
    }
    if (dom.uploadGroupSelect) {
      dom.uploadGroupSelect.value = groupId;
    }
    setGroupStatus("已选择卡牌组");
    setUploadGroupStatus("已选择卡牌组");
    await switchGroup(groupId, { loadCloud: false });
    const training = document.getElementById("training");
    training?.scrollIntoView({ behavior: "smooth" });
  });

  dom.deleteGroup?.addEventListener("click", () => {
    deleteGroup();
  });

  dom.syncSave.addEventListener("click", () => {
    saveCardsToCloud();
  });

  dom.syncLoad.addEventListener("click", () => {
    loadCardsFromCloud();
  });


  dom.flashcard.addEventListener("click", () => {
    dom.flashcard.classList.toggle("is-flipped");
  });

  dom.prevCard.addEventListener("click", () => goToNext(-1));
  dom.nextCard.addEventListener("click", () => goToNext(1));

  dom.markKnown.addEventListener("click", () => {
    markCard(true);
    goToNext(1);
  });

  dom.markUnknown.addEventListener("click", () => {
    markCard(false);
    goToNext(1);
  });

  dom.modeSegment.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    dom.modeSegment.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("is-active", btn === button);
    });
    state.trainingOrder = button.dataset.order;
    state.trainingIndex = 0;
    updateFlashcard();
  });

  dom.mockGenerate.addEventListener("click", () => {
    const file = dom.fileInput.files[0];
    if (file) {
      handleFile(file);
      return;
    }
    const sample = "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=800&q=80";
    dom.previewImage.src = sample;
    parseImage(sample);
  });

  jumpButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.jump);
      target?.scrollIntoView({ behavior: "smooth" });
    });
  });

  dom.cropOverlay.addEventListener("pointerdown", (event) => {
    if (!dom.previewImage.src) return;
    const rect = dom.cropOverlay.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY };
    const target = event.target.closest(".preview-box");

    if (target) {
      const index = Number(target.dataset.index);
      const box = state.boxes[index];
      if (!box) return;
      state.dragging = {
        type: "move",
        index,
        start,
        offsetX: ((start.x - rect.left) / rect.width) * 100 - box.x,
        offsetY: ((start.y - rect.top) / rect.height) * 100 - box.y,
      };
      renderCropOverlay();
      return;
    }

    state.dragging = { type: "create", start };
    state.tempBox = getRelativeBox(start, start, rect);
    renderCropOverlay();
  });

  dom.cropOverlay.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    const rect = dom.cropOverlay.getBoundingClientRect();
    if (state.dragging.type === "create") {
      state.tempBox = clampBox(getRelativeBox(state.dragging.start, { x: event.clientX, y: event.clientY }, rect));
      renderCropOverlay();
    }
    if (state.dragging.type === "move") {
      const nextX = ((event.clientX - rect.left) / rect.width) * 100 - state.dragging.offsetX;
      const nextY = ((event.clientY - rect.top) / rect.height) * 100 - state.dragging.offsetY;
      const current = state.boxes[state.dragging.index];
      if (!current) return;
      state.boxes[state.dragging.index] = clampBox({
        ...current,
        x: nextX,
        y: nextY,
      });
      renderCropOverlay();
    }
  });

  const finishDrag = () => {
    if (!state.dragging) return;
    if (state.dragging.type === "create" && state.tempBox) {
      if (state.tempBox.w >= 2 && state.tempBox.h >= 2) {
        state.boxes.push(state.tempBox);
      }
    }
    state.dragging = null;
    state.tempBox = null;
    renderCropOverlay();
    rebuildCardsFromBoxes();
  };

  dom.cropOverlay.addEventListener("pointerup", finishDrag);
  dom.cropOverlay.addEventListener("pointerleave", finishDrag);

  dom.cropOverlay.addEventListener("dblclick", (event) => {
    const target = event.target.closest(".preview-box");
    if (!target) return;
    const index = Number(target.dataset.index);
    if (Number.isNaN(index)) return;
    state.boxes.splice(index, 1);
    renderCropOverlay();
    rebuildCardsFromBoxes();
  });
};

const init = () => {
  setActiveMode("poster");
  setPipelineStep(0);
  setAiStatus("待机");
  setOcrText("");
  renderCards();
  updateFlashcard();
  attachEvents();
  restoreSession();
  if (!supabaseClient) {
    setAuthStatus("Supabase 未初始化，请检查网络或刷新页面");
  }
};

init();
