const FAVORITES_KEY = "prompt-atlas-favorites";

const state = {
  language: "en",
  search: "",
  category: "all",
  selectedId: null,
  favoritesOnly: false,
  favorites: loadFavorites(),
};

const languageToggle = document.querySelector("#languageToggle");
const categoryCount = document.querySelector("#categoryCount");
const promptCount = document.querySelector("#promptCount");
const favoriteCount = document.querySelector("#favoriteCount");
const tipsGrid = document.querySelector("#tipsGrid");
const searchInput = document.querySelector("#searchInput");
const categoryFilters = document.querySelector("#categoryFilters");
const cardsGrid = document.querySelector("#cardsGrid");
const resultsLabel = document.querySelector("#resultsLabel");
const detailDialog = document.querySelector("#detailDialog");
const dialogContent = document.querySelector("#dialogContent");
const tipsHeading = document.querySelector("#tipsHeading");
const libraryHeading = document.querySelector("#libraryHeading");
const searchLabel = document.querySelector("#searchLabel");
const favoritesToggle = document.querySelector("#favoritesToggle");
const favoritesLabel = document.querySelector("#favoritesLabel");
const toast = document.querySelector("#toast");

const categoryMap = new Map(
  promptAtlasData.categories.map((category) => [category.id, category])
);

function loadFavorites() {
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFavorites() {
  window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.favorites));
}

function textFor(item, key) {
  return state.language === "zh" && item[`${key}Zh`] ? item[`${key}Zh`] : item[key];
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 1800);
}

function isFavorite(cardId) {
  return state.favorites.includes(cardId);
}

function toggleFavorite(cardId) {
  if (isFavorite(cardId)) {
    state.favorites = state.favorites.filter((id) => id !== cardId);
    showToast(state.language === "zh" ? "已取消收藏" : "Removed from favorites");
  } else {
    state.favorites = [...state.favorites, cardId];
    showToast(state.language === "zh" ? "已加入收藏" : "Saved to favorites");
  }
  saveFavorites();
  render();
  if (state.selectedId === cardId && detailDialog.open) {
    renderDialog();
  }
}

async function copyPrompt(cardId) {
  const card = promptAtlasData.cards.find((item) => item.id === cardId);
  if (!card) {
    return;
  }

  const promptText = textFor(card, "prompt");

  try {
    await navigator.clipboard.writeText(promptText);
    showToast(state.language === "zh" ? "提示詞已複製" : "Prompt copied");
  } catch {
    showToast(state.language === "zh" ? "無法複製提示詞" : "Could not copy prompt");
  }
}

function getCardSearchBlob(card) {
  const category = categoryMap.get(card.category);
  return [
    card.title,
    card.titleZh,
    card.summary,
    card.summaryZh,
    card.prompt,
    card.promptZh,
    card.category,
    category?.name,
    category?.nameZh,
    ...card.tools,
    ...(card.keywords || []),
  ]
    .join(" ")
    .toLowerCase();
}

function filteredCards() {
  const query = state.search.trim().toLowerCase();

  return promptAtlasData.cards.filter((card) => {
    const matchesCategory =
      state.category === "all" || card.category === state.category;
    const matchesSearch = !query || getCardSearchBlob(card).includes(query);
    const matchesFavorites = !state.favoritesOnly || isFavorite(card.id);
    return matchesCategory && matchesSearch && matchesFavorites;
  });
}

function renderStats() {
  categoryCount.textContent = promptAtlasData.categories.length - 1;
  promptCount.textContent = promptAtlasData.cards.length;
  favoriteCount.textContent = state.favorites.length;
}

function renderTips() {
  tipsHeading.textContent =
    state.language === "zh" ? "先寫出更強的提示詞" : "Start with a stronger brief";

  tipsGrid.innerHTML = promptAtlasData.tips
    .map(
      (tip) => `
        <article class="tip-card">
          <p class="mini-label">${tip.tools.join(" · ")}</p>
          <h3>${textFor(tip, "title")}</h3>
          <p>${textFor(tip, "summary")}</p>
          <div class="prompt-block">
            <span>${state.language === "zh" ? "示例寫法" : "Prompt shape"}</span>
            <p>${textFor(tip, "prompt")}</p>
          </div>
        </article>
      `
    )
    .join("");
}

function renderFilters() {
  const allLabel = state.language === "zh" ? "全部分類" : "All categories";
  const allCount = promptAtlasData.cards.length;

  favoritesLabel.textContent =
    state.language === "zh" ? "只看收藏" : "Favorites only";
  favoritesToggle.classList.toggle("is-active", state.favoritesOnly);
  favoritesToggle.querySelector("strong").textContent = state.favorites.length;

  const filterItems = [
    `
      <button
        class="chip ${state.category === "all" ? "is-active" : ""}"
        type="button"
        data-category="all"
      >
        <span>${allLabel}</span>
        <strong>${allCount}</strong>
      </button>
    `,
    ...promptAtlasData.categories
      .filter((category) => category.id !== "fundamentals")
      .map((category) => {
        const count = promptAtlasData.cards.filter(
          (card) => card.category === category.id
        ).length;
        return `
          <button
            class="chip ${state.category === category.id ? "is-active" : ""}"
            type="button"
            data-category="${category.id}"
          >
            <span>${textFor(category, "name")}</span>
            <strong>${count}</strong>
          </button>
        `;
      }),
  ];

  categoryFilters.innerHTML = filterItems.join("");

  categoryFilters.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      state.category = button.dataset.category;
      render();
    });
  });
}

function resultsText(cards, selectedCategory) {
  if (cards.length === 0) {
    return state.language === "zh"
      ? "找不到符合條件的內容，試試較短的關鍵字。"
      : "No matching results yet. Try a shorter or broader search.";
  }

  const resultPrefix = state.language === "zh" ? "目前顯示" : "Showing";
  const resultSuffix = state.language === "zh" ? "張提示卡" : "prompt cards";
  const categoryLabel = selectedCategory ? textFor(selectedCategory, "name") : "";
  const favoritesSuffix =
    state.favoritesOnly && state.language === "zh"
      ? " · 收藏"
      : state.favoritesOnly
        ? " · favorites"
        : "";

  return selectedCategory
    ? `${resultPrefix} ${cards.length} ${resultSuffix} · ${categoryLabel}${favoritesSuffix}`
    : `${resultPrefix} ${cards.length} ${resultSuffix}${favoritesSuffix}`;
}

function actionLabel(cardId) {
  return isFavorite(cardId)
    ? state.language === "zh"
      ? "已收藏"
      : "Saved"
    : state.language === "zh"
      ? "收藏"
      : "Save";
}

function favoriteIcon(cardId) {
  return isFavorite(cardId) ? "★" : "☆";
}

function renderCards() {
  libraryHeading.textContent =
    state.language === "zh"
      ? "按角色或工作情境瀏覽"
      : "Browse by role or workstream";

  searchLabel.textContent =
    state.language === "zh"
      ? "搜尋提示詞、分類、工具或中文關鍵字"
      : "Search prompts, categories, apps, or Chinese text";

  searchInput.placeholder =
    state.language === "zh" ? "搜尋提示詞靈感..." : "Search prompt ideas...";

  const cards = filteredCards();
  const selectedCategory =
    state.category === "all" ? null : categoryMap.get(state.category);

  resultsLabel.textContent = resultsText(cards, selectedCategory);

  if (cards.length === 0) {
    cardsGrid.innerHTML = `
      <div class="empty-state">
        <h3>${state.language === "zh" ? "未找到結果" : "No results found"}</h3>
        <p>
          ${
            state.language === "zh"
              ? "你可以切換分類、清除搜尋，或者關閉收藏篩選再試一次。"
              : "Try switching categories, clearing the search box, or turning off the favorites filter."
          }
        </p>
      </div>
    `;
    return;
  }

  cardsGrid.innerHTML = cards
    .map((card) => {
      const category = categoryMap.get(card.category);
      return `
        <article class="prompt-card" data-card-id="${card.id}" tabindex="0">
          <div class="card-topline">
            <span class="category-tag">${textFor(category, "name")}</span>
            <span class="page-tag">p.${card.page}</span>
          </div>
          <h3>${textFor(card, "title")}</h3>
          <p>${textFor(card, "summary")}</p>
          <div class="tool-row">
            ${card.tools
              .map((tool) => `<span class="tool-pill">${tool}</span>`)
              .join("")}
          </div>
          <div class="card-actions">
            <button class="ghost-button ghost-button-small" type="button" data-copy-id="${card.id}">
              ${state.language === "zh" ? "複製提示詞" : "Copy prompt"}
            </button>
            <button class="favorite-button ${isFavorite(card.id) ? "is-active" : ""}" type="button" data-favorite-id="${card.id}">
              <span aria-hidden="true">${favoriteIcon(card.id)}</span>
              <span>${actionLabel(card.id)}</span>
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  cardsGrid.querySelectorAll("[data-card-id]").forEach((cardNode) => {
    const openCard = () => {
      state.selectedId = cardNode.dataset.cardId;
      renderDialog();
      detailDialog.showModal();
    };

    cardNode.addEventListener("click", (event) => {
      if (event.target.closest("[data-copy-id], [data-favorite-id]")) {
        return;
      }
      openCard();
    });

    cardNode.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        if (event.target.closest("[data-copy-id], [data-favorite-id]")) {
          return;
        }
        event.preventDefault();
        openCard();
      }
    });
  });

  cardsGrid.querySelectorAll("[data-copy-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      copyPrompt(button.dataset.copyId);
    });
  });

  cardsGrid.querySelectorAll("[data-favorite-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleFavorite(button.dataset.favoriteId);
    });
  });
}

function renderDialog() {
  const card = promptAtlasData.cards.find((item) => item.id === state.selectedId);
  if (!card) {
    return;
  }

  const category = categoryMap.get(card.category);

  dialogContent.innerHTML = `
    <div class="dialog-meta">
      <span class="category-tag">${textFor(category, "name")}</span>
      <span class="page-tag">p.${card.page}</span>
    </div>
    <h2>${textFor(card, "title")}</h2>
    <p class="dialog-summary">${textFor(card, "summary")}</p>
    <div class="dialog-actions">
      <button class="ghost-button" type="button" data-copy-id="${card.id}">
        ${state.language === "zh" ? "複製提示詞" : "Copy prompt"}
      </button>
      <button class="favorite-button ${isFavorite(card.id) ? "is-active" : ""}" type="button" data-favorite-id="${card.id}">
        <span aria-hidden="true">${favoriteIcon(card.id)}</span>
        <span>${actionLabel(card.id)}</span>
      </button>
    </div>
    <div class="dialog-grid">
      <section>
        <h3>${state.language === "zh" ? "示例提示詞" : "Prompt template"}</h3>
        <p class="dialog-prompt">${textFor(card, "prompt")}</p>
      </section>
      <section>
        <h3>${state.language === "zh" ? "建議工具" : "Suggested tools"}</h3>
        <div class="tool-row">
          ${card.tools.map((tool) => `<span class="tool-pill">${tool}</span>`).join("")}
        </div>
      </section>
      <section>
        <h3>${state.language === "zh" ? "搜尋關鍵字" : "Helpful keywords"}</h3>
        <div class="tool-row">
          ${card.keywords
            .map((keyword) => `<span class="tool-pill">${keyword}</span>`)
            .join("")}
        </div>
      </section>
    </div>
  `;

  dialogContent.querySelector("[data-copy-id]").addEventListener("click", () => {
    copyPrompt(card.id);
  });
  dialogContent.querySelector("[data-favorite-id]").addEventListener("click", () => {
    toggleFavorite(card.id);
  });
}

function renderLanguage() {
  document.documentElement.lang = state.language === "zh" ? "zh-Hant" : "en";
  languageToggle.textContent =
    state.language === "zh" ? "Switch to English" : "切換中文";
}

function render() {
  renderLanguage();
  renderStats();
  renderTips();
  renderFilters();
  renderCards();
  if (detailDialog.open && state.selectedId) {
    renderDialog();
  }
}

languageToggle.addEventListener("click", () => {
  state.language = state.language === "en" ? "zh" : "en";
  render();
});

favoritesToggle.addEventListener("click", () => {
  state.favoritesOnly = !state.favoritesOnly;
  renderCards();
  renderFilters();
});

searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderCards();
});

detailDialog.addEventListener("click", (event) => {
  const rect = detailDialog.getBoundingClientRect();
  const inDialog =
    rect.top <= event.clientY &&
    event.clientY <= rect.top + rect.height &&
    rect.left <= event.clientX &&
    event.clientX <= rect.left + rect.width;

  if (!inDialog) {
    detailDialog.close();
  }
});

render();
