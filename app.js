const state = {
  mode: "poster",
  cards: [],
  trainingOrder: "sequence",
  trainingIndex: 0,
  mistakes: new Set(),
  boxes: [],
  suggestions: [],
  tempBox: null,
  dragging: null,
  selectedBoxIndex: null,
  user: null,
  groups: [],
  activeGroupId: null,
  groupCards: {},
  groupLocked: false,
  deletedCardUids: {},
  shuffleOrder: [],
  sync: {
    dirty: false,
    syncing: false,
    lastCloudSyncAt: 0,
  },
};


const dom = {
  modeButtons: document.querySelectorAll(".mode-switch__btn"),
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("file-input"),
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
  saveStatus: document.getElementById("save-status"),
  appVersion: document.getElementById("app-version"),
};

const APP_VERSION = "2026-02-07.2";
if (dom.appVersion) {
  dom.appVersion.textContent = `v${APP_VERSION}`;
}

const jumpButtons = document.querySelectorAll("[data-jump]");
const SUPABASE_URL = "https://boiznsjwyazawvubggxc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_lTKSPVkBj94F3rcoGlXaUA_364PHBGf";
const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
const LOCAL_STORAGE_KEY = "ipcatalogue.localState.v1";
let localSaveTimer = null;
let cloudSyncTimer = null;
const CLOUD_SYNC_DEBOUNCE = 1200;

const setActiveMode = (mode) => {
  state.mode = mode;
  dom.modeButtons.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.mode === mode);
  });
};

const setAuthStatus = (text) => {
  if (dom.authStatus) {
    dom.authStatus.textContent = text;
  }
};

const setSaveStatus = (text, state = "") => {
  if (!dom.saveStatus) return;
  dom.saveStatus.textContent = text;
  if (state) {
    dom.saveStatus.dataset.state = state;
  } else {
    delete dom.saveStatus.dataset.state;
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
  if (!state.activeGroupId) return;
  if (!state.cards.length) return;
  state.sync.dirty = true;
  scheduleLocalSave("已自动保存");
  scheduleCloudSync();
};

const serializeGroupCards = (groupCards) => {
  return Object.entries(groupCards || {}).reduce((acc, [groupId, cards]) => {
    acc[groupId] = Array.isArray(cards)
      ? cards.map((card) => ({
          id: card.id,
          uid: card.uid,
          name: card.name,
          description: card.description,
          status: card.status,
          starred: Boolean(card.starred),
          updatedAt: card.updatedAt,
          box: card.box || null,
          image: "",
        }))
      : [];
    return acc;
  }, {});
};

const buildLocalPayload = () => ({
  version: 1,
  groups: state.groups,
  activeGroupId: state.activeGroupId,
  groupCards: serializeGroupCards(state.groupCards),
  deletedCardUids: state.deletedCardUids,
  trainingIndex: state.trainingIndex,
  trainingOrder: state.trainingOrder,
  mistakes: Array.from(state.mistakes),
  sync: {
    dirty: state.sync.dirty,
    lastCloudSyncAt: state.sync.lastCloudSyncAt,
  },
});

const buildMinimalPayload = () => ({
  version: 1,
  groups: state.groups,
  activeGroupId: state.activeGroupId,
  trainingOrder: state.trainingOrder,
  sync: {
    dirty: state.sync.dirty,
    lastCloudSyncAt: state.sync.lastCloudSyncAt,
  },
});

const saveLocalState = (message = "已保存", status = "success") => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(buildLocalPayload()));
    setSaveStatus(message, status);
    return true;
  } catch (error) {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(buildMinimalPayload()));
      setSaveStatus("本地空间不足，仅保存基础信息", "error");
      return true;
    } catch (fallbackError) {
      setSaveStatus(`保存失败：${fallbackError.message || "本地存储不可用"}`, "error");
      return false;
    }
  }
};

const scheduleLocalSave = (message = "已自动保存") => {
  state.sync.dirty = true;
  if (localSaveTimer) {
    clearTimeout(localSaveTimer);
  }
  localSaveTimer = setTimeout(() => {
    saveLocalState(message, "success");
  }, 200);
};

const scheduleCloudSync = (message = "已同步到云端") => {
  if (!supabaseClient || !state.user) {
    setSaveStatus("已本地保存，登录后自动同步", "");
    return;
  }
  if (cloudSyncTimer) {
    clearTimeout(cloudSyncTimer);
  }
  cloudSyncTimer = setTimeout(() => {
    syncAllGroupsToCloud(message);
  }, CLOUD_SYNC_DEBOUNCE);
};

const getNowMs = () => Date.now();

const ensureCardMeta = (card) => ({
  ...card,
  uid: card.uid || generateId(),
  updatedAt: Number.isFinite(card.updatedAt) ? card.updatedAt : getNowMs(),
});

const touchCard = (card) => ({
  ...card,
  updatedAt: getNowMs(),
});

const buildShuffledOrder = () => {
  const order = [...state.cards];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  state.shuffleOrder = order.map((card) => card.uid || card.id);
  return order;
};

const getShuffledCards = () => {
  const ids = new Set(state.cards.map((card) => card.uid || card.id));
  const isValid =
    state.shuffleOrder.length === state.cards.length &&
    state.shuffleOrder.every((id) => ids.has(id));
  if (!isValid) {
    return buildShuffledOrder();
  }
  const map = new Map(state.cards.map((card) => [card.uid || card.id, card]));
  return state.shuffleOrder.map((id) => map.get(id)).filter(Boolean);
};

const syncAllGroupsToCloud = async (message = "已同步到云端") => {
  if (!supabaseClient || !state.user) return false;
  if (!state.groups.length) return true;
  if (state.sync.syncing) return false;
  state.sync.syncing = true;
  setSaveStatus("同步中...", "");

  try {
    const groupPayload = state.groups.map((group) => ({
      id: group.id,
      user_id: state.user.id,
      name: group.name,
    }));

    const { error: groupError } = await supabaseClient
      .from("card_groups")
      .upsert(groupPayload, { onConflict: "id" });
    if (groupError) {
      throw groupError;
    }

    for (const group of state.groups) {
      const cards = state.groupCards[group.id] || [];
      const normalized = cards.map((card) => ensureCardMeta(card));
      state.groupCards[group.id] = normalized;

      if (normalized.length) {
        const cardPayload = normalized.map((card) => ({
          user_id: state.user.id,
          group_id: group.id,
          card_uid: card.uid,
          name: card.name,
          description: card.description,
          image_data: card.image,
          box: card.box || null,
          status: card.status || "draft",
          starred: Boolean(card.starred),
          updated_at: new Date(card.updatedAt).toISOString(),
        }));

        const { error: cardError } = await supabaseClient
          .from("cards")
          .upsert(cardPayload, { onConflict: "user_id,card_uid" });
        if (cardError) {
          throw cardError;
        }
      }

      const deletedMap = state.deletedCardUids[group.id] || {};
      const deletedUids = Object.keys(deletedMap);
      if (deletedUids.length) {
        const { error: deleteError } = await supabaseClient
          .from("cards")
          .delete()
          .eq("user_id", state.user.id)
          .eq("group_id", group.id)
          .in("card_uid", deletedUids);
        if (deleteError) {
          throw deleteError;
        }
        delete state.deletedCardUids[group.id];
      }
    }

    if (state.activeGroupId) {
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
    }

    state.sync.dirty = false;
    state.sync.lastCloudSyncAt = Date.now();
    saveLocalState(message, "success");
    refreshLocalGroupCache();
    state.sync.syncing = false;
    return true;
  } catch (error) {
    state.sync.syncing = false;
    setSaveStatus(`同步失败：${error.message || "请检查网络"}`, "error");
    return false;
  }
};

const refreshLocalGroupCache = () => {
  if (state.activeGroupId) {
    state.groupCards[state.activeGroupId] = state.cards;
    updateActiveGroupCount(state.cards.length);
  }
  renderGroupCards();
};

const loadLocalState = () => {
  let payload = null;
  try {
    payload = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "null");
  } catch (error) {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    payload = null;
  }
  if (!payload || !Array.isArray(payload.groups)) {
    return false;
  }
  state.groups = payload.groups;
  state.groupCards = Object.entries(payload.groupCards || {}).reduce(
    (acc, [groupId, cards]) => {
      acc[groupId] = Array.isArray(cards) ? cards.map((card) => ensureCardMeta(card)) : [];
      return acc;
    },
    {}
  );
  state.deletedCardUids = payload.deletedCardUids || {};
  state.activeGroupId = payload.activeGroupId || state.groups[0]?.id || null;
  state.trainingIndex = Number.isFinite(payload.trainingIndex) ? payload.trainingIndex : 0;
  state.trainingOrder = payload.trainingOrder || "sequence";
  state.mistakes = new Set(payload.mistakes || []);
  state.sync.dirty = Boolean(payload.sync?.dirty);
  state.sync.lastCloudSyncAt = Number(payload.sync?.lastCloudSyncAt) || 0;
  setActiveCards(getGroupCards(state.activeGroupId));
  renderGroups();
  refreshLocalGroupCache();
  renderCards();
  updateFlashcard();
  if (state.activeGroupId) {
    setCardSectionMeta(`当前组：${getGroupName(state.activeGroupId)}`);
  } else {
    setCardSectionMeta("未选择组");
  }
  return true;
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
    ...ensureCardMeta(card),
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
  const updated = state.cards.map((card) => ensureCardMeta(card));
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
    if (state.sync.dirty) {
      const ok = await syncAllGroupsToCloud("已同步本地到云端");
      if (!ok) return;
    }
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
    if (state.selectedBoxIndex === index) {
      box.classList.add("is-selected");
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
        <button class="btn tiny ghost" data-action="star" data-id="${card.id}">${card.starred ? "已星标" : "星标"}</button>
        <button class="btn tiny ghost" data-action="delete" data-id="${card.id}">删除</button>
      </div>
    `;

    dom.cardGrid.appendChild(cardEl);
  });
};

const updateFlashcard = () => {
  if (!state.cards.length) {
    dom.flashName.textContent = "角色名称";
    dom.flashDesc.textContent = "角色简介将显示在这里，可手动填写。";
    dom.flashTag.textContent = "卡片未确认";
    dom.flashImage.style.backgroundImage = "linear-gradient(135deg, #fff0e2, #ffd0b4)";
    dom.statusBox.textContent = "已完成 0 / 0";
    return;
  }

  const order = getTrainingOrder();
  const card = order[state.trainingIndex % order.length];
  dom.flashName.textContent = card.name;
  dom.flashDesc.textContent = card.description;
  const statusText = card.status === "confirmed" ? "已确认" : "待确认";
  dom.flashTag.textContent = card.starred ? `${statusText} · 已星标` : statusText;
  dom.flashImage.style.backgroundImage = `url(${card.image})`;
  dom.statusBox.textContent = `已完成 ${state.trainingIndex + 1} / ${order.length}`;
};

const getTrainingOrder = () => {
  if (state.trainingOrder === "mistake") {
    const mistakes = state.cards.filter((card) => state.mistakes.has(card.id));
    return mistakes.length ? mistakes : state.cards;
  }
  if (state.trainingOrder === "random") {
    return weightedShuffle(state.cards);
  }
  if (state.trainingOrder === "shuffle") {
    return getShuffledCards();
  }
  return state.cards;
};

const setPreviewImage = (src) => {
  dom.previewImage.src = src;
  state.boxes = [];
  state.tempBox = null;
  state.selectedBoxIndex = null;
  state.suggestions = [];
  renderCropOverlay();
};

const handleFile = (file) => {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const src = event.target.result;
    setPreviewImage(src);
  };
  reader.readAsDataURL(file);
};

const rebuildCardsFromBoxes = () => {
  if (!dom.previewImage.src) return;
};

const removeSelectedBox = (index = state.selectedBoxIndex) => {
  if (index === null || index === undefined) return;
  if (!state.boxes[index]) return;
  state.boxes.splice(index, 1);
  state.selectedBoxIndex = null;
  renderCropOverlay();
};

const getAuthInput = () => {
  return {
    email: dom.authEmail?.value?.trim(),
    password: dom.authPassword?.value?.trim(),
  };
};

const loadCardsFromCloud = async () => {
  if (!supabaseClient || !state.user) {
    setSaveStatus("请先登录以同步云端", "error");
    return;
  }
  if (!(await ensureGroupSelected())) {
    setSaveStatus("请先选择卡牌组", "error");
    return;
  }
  const requestGroupId = state.activeGroupId;
  setSaveStatus("云端加载中...", "");
  const { data, error } = await supabaseClient
    .from("cards")
    .select("id,card_uid,name,description,image_data,box,status,starred,updated_at")
    .eq("user_id", state.user.id)
    .eq("group_id", requestGroupId)
    .order("updated_at", { ascending: true });

  if (error) {
    setSaveStatus(`加载失败：${error.message || "请检查配置"}`, "error");
    return;
  }

  const localCards = getGroupCards(requestGroupId);
  const localByUid = new Map(localCards.map((card) => [card.uid, card]));
  const deletedMap = state.deletedCardUids[requestGroupId] || {};
  const backfill = [];

  const merged = [];
  (data || []).forEach((card, index) => {
    const uid = card.card_uid || card.id || generateId();
    if (!card.card_uid && card.id) {
      backfill.push({ id: card.id, uid });
    }
    const cloudUpdatedAt = Date.parse(card.updated_at || "") || 0;
    const local = localByUid.get(uid);
    const deletedAt = deletedMap[uid] || 0;
    const cloudHasImage = Boolean(card.image_data);
    const localMissingImage = local && (!local.image || local.image === "");

    if (deletedAt && deletedAt >= cloudUpdatedAt) {
      return;
    }

    if (deletedAt && cloudUpdatedAt > deletedAt) {
      delete deletedMap[uid];
    }

    if (localMissingImage && cloudHasImage) {
      // Prefer cloud image when local cache intentionally stripped it.
      merged.push({
        id: index + 1,
        uid,
        name: card.name || `角色 ${index + 1}`,
        description: card.description || "",
        image: card.image_data || "",
        status: card.status || "draft",
        starred: Boolean(card.starred),
        box: card.box || null,
        updatedAt: cloudUpdatedAt || getNowMs(),
      });
      localByUid.delete(uid);
      return;
    }

    if (local && Number.isFinite(local.updatedAt) && local.updatedAt > cloudUpdatedAt) {
      merged.push(local);
      localByUid.delete(uid);
      return;
    }

    merged.push({
      id: index + 1,
      uid,
      name: card.name || `角色 ${index + 1}`,
      description: card.description || "",
      image: card.image_data || "",
      status: card.status || "draft",
      starred: Boolean(card.starred),
      box: card.box || null,
      updatedAt: cloudUpdatedAt || getNowMs(),
    });
    localByUid.delete(uid);
  });

  localByUid.forEach((card) => {
    if (card?.uid && deletedMap[card.uid]) return;
    merged.push(card);
  });

  const loaded = merged.map((card, index) => ({
    ...card,
    id: index + 1,
  }));

  if (backfill.length) {
    await Promise.all(
      backfill.map((item) =>
        supabaseClient.from("cards").update({ card_uid: item.uid }).eq("id", item.id)
      )
    );
  }
  if (requestGroupId) {
    state.groupCards[requestGroupId] = loaded;
  }
  if (requestGroupId !== state.activeGroupId) {
    return;
  }
  setActiveCards(loaded);
  updateActiveGroupCount(loaded.length);
  state.boxes = [];
  state.tempBox = null;
  renderCropOverlay();
  renderCards();
  updateFlashcard();
  setCardSectionMeta(`当前组：${dom.groupSelect?.selectedOptions?.[0]?.textContent || ""}`);
  setSaveStatus("已加载云端卡牌", "success");
};

const saveCardsToCloud = async () => {
  if (!(await ensureGroupSelected())) {
    setSaveStatus("请先选择卡牌组", "error");
    return;
  }
  if (!state.cards.length) {
    setSaveStatus("暂无卡牌可保存", "error");
    return;
  }
  state.sync.dirty = true;
  ensureCardIds();
  if (state.activeGroupId) {
    state.groupCards[state.activeGroupId] = state.cards;
  }
  updateActiveGroupCount(state.cards.length);
  saveLocalState("已本地保存", "success");
  scheduleCloudSync("保存成功，已同步云端");
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
    const cachedCards = state.groupCards[group.id];
    const localCount = Array.isArray(cachedCards) ? cachedCards.length : null;
    const displayCount =
      group.id === state.activeGroupId
        ? state.cards.length
        : localCount !== null
          ? localCount
          : group.count ?? 0;
    const card = document.createElement("div");
    card.className = "group-card";
    card.dataset.groupId = group.id;
    card.innerHTML = `
      <div class="group-card__top">
        <div class="group-card__icon">📁</div>
        <div class="group-card__badge">${displayCount}</div>
      </div>
      <div>
        <div class="group-card__title">${group.name}</div>
        <div class="group-card__sub">${displayCount} cards</div>
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
    setSaveStatus("加载卡牌组失败", "error");
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
  const name = nameInput?.value?.trim();
  if (!name) {
    statusSetter("请输入组名");
    setSaveStatus("请输入组名", "error");
    return;
  }
  const data = {
    id: generateId(),
    name,
    count: 0,
  };
  state.groups.push(data);
  state.activeGroupId = data.id;
  state.groupCards[data.id] = [];
  state.cards = [];
  state.trainingIndex = 0;
  state.mistakes.clear();
  if (nameInput) {
    nameInput.value = "";
  }
  renderGroups();
  renderGroupCards();
  renderCards();
  updateFlashcard();
  statusSetter("已创建卡牌组");
  saveLocalState("已创建卡牌组", "success");
  scheduleCloudSync("已创建卡牌组，自动同步云端");
};

const ensureGroupSelected = () => {
  if (state.activeGroupId) return true;
  setGroupStatus("请先选择或创建卡牌组");
  return false;
};

const renameGroup = async () => {
  if (!state.activeGroupId) {
    setGroupStatus("请先选择卡牌组");
    return;
  }
  const name = dom.groupRename?.value?.trim();
  if (!name) {
    setGroupStatus("请输入新名称");
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
  saveLocalState("已更新组名称", "success");
  scheduleCloudSync("已更新组名称，自动同步云端");
};

const deleteGroup = async () => {
  if (!state.activeGroupId) {
    setGroupStatus("请先选择卡牌组");
    return;
  }
  const ok = window.confirm("确定删除当前卡牌组及其卡片吗？此操作无法撤销。");
  if (!ok) return;

  state.groups = state.groups.filter((group) => group.id !== state.activeGroupId);
  delete state.groupCards[state.activeGroupId];
  delete state.deletedCardUids[state.activeGroupId];
  const deletedGroupId = state.activeGroupId;
  state.activeGroupId = state.groups[0]?.id || null;
  setActiveCards(getGroupCards(state.activeGroupId));
  renderGroups();
  renderGroupCards();
  renderCards();
  updateFlashcard();
  setGroupStatus("已删除卡牌组");
  saveLocalState("已删除卡牌组", "success");

  if (supabaseClient && state.user) {
    try {
      await supabaseClient
        .from("cards")
        .delete()
        .eq("user_id", state.user.id)
        .eq("group_id", deletedGroupId);
      await supabaseClient
        .from("study_sessions")
        .delete()
        .eq("user_id", state.user.id)
        .eq("group_id", deletedGroupId);
      await supabaseClient
        .from("card_groups")
        .delete()
        .eq("id", deletedGroupId)
        .eq("user_id", state.user.id);
      setSaveStatus("已删除卡牌组并同步云端", "success");
    } catch (error) {
      setSaveStatus(`云端删除失败：${error.message || "请检查网络"}`, "error");
    }
  } else {
    scheduleCloudSync("已删除卡牌组，登录后自动同步");
  }
};

const restoreSession = async () => {
  const restored = loadLocalState();
  if (!supabaseClient) {
    setAuthStatus("Supabase 未初始化，请检查网络或刷新页面");
    if (!restored) {
      renderGroups();
      renderGroupCards();
      renderCards();
      updateFlashcard();
      setGroupStatus("请先创建卡牌组");
    }
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  state.user = data.session?.user || null;
  setAuthStatus(state.user ? `已登录：${state.user.email}` : "未登录");

  if (state.user) {
    if (state.sync.dirty) {
      await syncAllGroupsToCloud("已同步本地到云端");
    }
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
  } else if (!restored) {
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
      starred: false,
      updatedAt: getNowMs(),
      box,
    };
  });
  setActiveCards([...state.cards, ...newCards]);
  reindexCards();
  renderCards();
  updateFlashcard();
  updateActiveGroupCount(state.cards.length);
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
      return touchCard({ ...card, [field]: value });
    }
    return card;
  });
  setActiveCards(updated);
  updateFlashcard();
  autoSaveNow();
};

const toggleCardStatus = (id) => {
  const updated = state.cards.map((card) => {
    if (card.id === id) {
      const nextStatus = card.status === "confirmed" ? "draft" : "confirmed";
      return touchCard({ ...card, status: nextStatus });
    }
    return card;
  });
  setActiveCards(updated);
  renderCards();
  updateFlashcard();
  autoSaveNow();
};

const toggleCardStar = (id) => {
  const updated = state.cards.map((card) => {
    if (card.id === id) {
      return touchCard({ ...card, starred: !card.starred });
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
  if (target && !target.uid) {
    target.uid = generateId();
  }
  if (target?.uid && state.activeGroupId) {
    if (!state.deletedCardUids[state.activeGroupId]) {
      state.deletedCardUids[state.activeGroupId] = {};
    }
    state.deletedCardUids[state.activeGroupId][target.uid] = getNowMs();
  }
  setActiveCards(state.cards.filter((card) => card.id !== id));
  state.mistakes.delete(id);
  reindexCards();
  if (state.trainingIndex >= state.cards.length) {
    state.trainingIndex = Math.max(0, state.cards.length - 1);
  }
  renderCards();
  updateFlashcard();
  updateActiveGroupCount(state.cards.length);
  autoSaveNow();
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
  autoSaveNow();
};

const goToNext = (step) => {
  if (!state.cards.length) return;
  const order = getTrainingOrder();
  const nextIndex = (state.trainingIndex + step + order.length) % order.length;
  if (state.trainingOrder === "shuffle" && step > 0 && nextIndex === 0) {
    buildShuffledOrder();
  }
  state.trainingIndex = nextIndex;
  updateFlashcard();
  autoSaveNow();
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
    if (target.dataset.action === "star") {
      toggleCardStar(Number(target.dataset.id));
    }
    if (target.dataset.action === "delete") {
      deleteCard(Number(target.dataset.id));
    }
  });

  dom.confirmAll.addEventListener("click", () => {
    if (!ensureGroupSelected()) {
      dom.groupSelect?.scrollIntoView({ behavior: "smooth", block: "center" });
      setSaveStatus("请先选择卡牌组", "error");
      return;
    }
    setSaveStatus("保存中...", "");
    saveCardsToCloud();
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
    if (state.sync.dirty) {
      await syncAllGroupsToCloud("已同步本地到云端");
    }
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
    setAuthStatus("未登录");
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
    const nextGroupId = dom.groupSelect.value || null;
    if (dom.uploadGroupSelect) {
      dom.uploadGroupSelect.value = nextGroupId || "";
    }
    setGroupStatus(nextGroupId ? "已选择卡牌组" : "请选择或创建组");
    setUploadGroupStatus(nextGroupId ? "已选择卡牌组" : "请选择或创建组");
    await switchGroup(nextGroupId, { loadCloud: true });
    scheduleLocalSave();
  });

  dom.createGroup?.addEventListener("click", () => {
    createGroup(dom.groupName, setGroupStatus);
  });

  dom.renameGroup?.addEventListener("click", () => {
    renameGroup();
  });

  dom.uploadGroupSelect?.addEventListener("change", async () => {
    const nextGroupId = dom.uploadGroupSelect.value || null;
    if (dom.groupSelect) {
      dom.groupSelect.value = nextGroupId || "";
    }
    setGroupStatus(nextGroupId ? "已选择卡牌组" : "请选择或创建组");
    setUploadGroupStatus(nextGroupId ? "已选择卡牌组" : "请选择或创建组");
    await switchGroup(nextGroupId, { loadCloud: true });
    scheduleLocalSave();
  });

  dom.uploadCreateGroup?.addEventListener("click", () => {
    createGroup(dom.uploadGroupName, setUploadGroupStatus);
  });

  dom.groupGrid?.addEventListener("click", async (event) => {
    const target = event.target.closest(".group-card");
    if (!target) return;
    const groupId = target.dataset.groupId;
    if (!groupId) return;
    if (dom.groupSelect) {
      dom.groupSelect.value = groupId;
    }
    if (dom.uploadGroupSelect) {
      dom.uploadGroupSelect.value = groupId;
    }
    setGroupStatus("已选择卡牌组");
    setUploadGroupStatus("已选择卡牌组");
    await switchGroup(groupId, { loadCloud: true });
    scheduleLocalSave();
    const training = document.getElementById("training");
    training?.scrollIntoView({ behavior: "smooth" });
  });

  dom.deleteGroup?.addEventListener("click", () => {
    deleteGroup();
  });

  dom.syncSave?.addEventListener("click", () => {
    saveCardsToCloud();
  });

  dom.syncLoad?.addEventListener("click", () => {
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
    if (state.trainingOrder === "shuffle") {
      buildShuffledOrder();
    }
    updateFlashcard();
  });

  dom.mockGenerate.addEventListener("click", () => {
    const file = dom.fileInput.files[0];
    if (file) {
      handleFile(file);
      return;
    }
    const sample = "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=800&q=80";
    setPreviewImage(sample);
  });

  jumpButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.jump);
      target?.scrollIntoView({ behavior: "smooth" });
    });
  });

  dom.cropOverlay.addEventListener("pointerdown", (event) => {
    if (!dom.previewImage.src) return;
    event.preventDefault();
    const rect = dom.cropOverlay.getBoundingClientRect();
    const start = { x: event.clientX, y: event.clientY };
    const target = event.target.closest(".preview-box");

    if (target) {
      const index = Number(target.dataset.index);
      const box = state.boxes[index];
      if (!Number.isNaN(index)) {
        state.selectedBoxIndex = index;
      }
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

    state.selectedBoxIndex = null;
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
        state.selectedBoxIndex = state.boxes.length - 1;
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
    removeSelectedBox(index);
    rebuildCardsFromBoxes();
  });

  dom.cropOverlay.addEventListener("contextmenu", (event) => {
    const target = event.target.closest(".preview-box");
    if (!target) return;
    event.preventDefault();
    const index = Number(target.dataset.index);
    if (Number.isNaN(index)) return;
    removeSelectedBox(index);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    if (!dom.previewImage.src) return;
    removeSelectedBox();
  });
};

const init = () => {
  setActiveMode("poster");
  renderCards();
  updateFlashcard();
  attachEvents();
  restoreSession();
};

init();
