// -----------------------------
// GLOBALS
// -----------------------------
let recipes = [];

// -----------------------------
// UNIVERSAL TEXT CLEANER
// -----------------------------
function cleanText(raw) {
  return raw
    .replace(/\r/g, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/[•●▪■]/g, "")
    .replace(/\t+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{2,}/g, "\n")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
}

// -----------------------------
// LOAD RECIPES FROM FIRESTORE
// -----------------------------
function loadRecipes() {
  db.collection("recipes").get().then(snapshot => {
    recipes = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    recipes = recipes.map(r => ({
      ...r,
      name: typeof r.name === "string" ? r.name : ""
    }));

    renderRecipes(recipes);
  }).catch(err => {
    console.error("Error loading recipes:", err);
  });
}

function renderRecipes(list) {
  const container = document.getElementById("recipe-list");
  container.innerHTML = "";

  list.sort((a, b) => a.name.localeCompare(b.name));

  list.forEach(recipe => {
    const card = document.createElement("div");
    card.className = "recipe-card";

    const link = document.createElement("a");
    link.textContent = recipe.name;
    link.href = `recipe.html?id=${encodeURIComponent(recipe.id)}`;

    if (recipe.category) {
      const catDiv = document.createElement("div");
      catDiv.className = "category-preview";
      catDiv.textContent = recipe.category;
      card.appendChild(catDiv);
    }

    card.appendChild(link);
    container.appendChild(card);
  });
}

loadRecipes();

// -----------------------------
// FUZZY MATCHING (NAME ONLY)
// -----------------------------
function levenshteinDistance(a, b) {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

function fuzzyMatch(text, query) {
  text = text.toLowerCase();
  query = query.toLowerCase();

  if (text.includes(query)) return true;

  return levenshteinDistance(text, query) <= 2;
}

// -----------------------------
// SEARCH + LIVE DROPDOWN
// -----------------------------
const search = document.getElementById("search");
const searchBtn = document.getElementById("search-btn");
const searchResults = document.getElementById("search-results");

function updateSearchDropdown(list) {
  searchResults.innerHTML = "";

  const query = search.value.toLowerCase().trim();
  if (!query) {
    searchResults.style.display = "none";
    return;
  }

  const nameMatches = list.filter(r =>
    r.name.toLowerCase().includes(query)
  );

  if (nameMatches.length === 0) {
    searchResults.style.display = "none";
    return;
  }

  nameMatches.slice(0, 8).forEach(recipe => {
    const item = document.createElement("div");
    item.textContent = recipe.name;
    item.addEventListener("click", () => {
      window.location.href = `recipe.html?id=${encodeURIComponent(recipe.id)}`;
    });
    searchResults.appendChild(item);
  });

  searchResults.style.display = "block";
}

function runSearch() {
  const query = search.value.toLowerCase().trim();

  if (!query) {
    renderRecipes(recipes);
    searchResults.style.display = "none";
    return;
  }

  const filtered = recipes.filter(recipe =>
    fuzzyMatch(recipe.name || "", query)
  );

  renderRecipes(filtered);
  updateSearchDropdown(filtered);
}

search.addEventListener("input", runSearch);
searchBtn.addEventListener("click", () => runSearch());

// -----------------------------
// ADVANCED RECIPE PARSER
// -----------------------------
function autoFormatRecipe(raw, name) {
  raw = cleanText(raw);

  // Normalize weird unicode, bullets, dashes, etc.
  raw = raw
    .replace(/\u00A0/g, " ")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/\r/g, "");

  let lines = raw
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0);

  let narrative = [];
  let ingredients = [];
  let directions = [];

  let servings = null;
  let prepTime = null;
  let cookTime = null;
  let totalTime = null;

  let mode = "narrative";
  let seenIngredients = false;

  const normalizeHeader = (txt) =>
    txt.toLowerCase().replace(/[^a-z]/g, "");

  for (let line of lines) {
    const lower = line.toLowerCase();
    const header = normalizeHeader(line);

    // METADATA
    if (lower.startsWith("yields") || lower.startsWith("yield")) {
      const match = lower.match(/(\d+)\s*serv/);
      if (match) servings = match[1];
      mode = "ingredients";
      seenIngredients = true;
      continue;
    }

    if (lower.startsWith("prep")) {
      const match = line.match(/prep[^0-9]*([\d\s\w]+)/i);
      if (match) prepTime = match[1].trim();
      continue;
    }

    if (lower.startsWith("cook")) {
      const match = line.match(/cook[^0-9]*([\d\s\w]+)/i);
      if (match) cookTime = match[1].trim();
      continue;
    }

    if (lower.startsWith("total")) {
      const match = line.match(/total[^0-9]*([\d\s\w]+)/i);
      if (match) totalTime = match[1].trim();
      continue;
    }

    // SECTION HEADERS
    if (header === "ingredients") {
      mode = "ingredients";
      seenIngredients = true;
      continue;
    }

    if (header === "directions" || header === "instructions") {
      mode = "directions";
      continue;
    }

    // NUMBERED LINES
    if (/^\d+[\).]?\s/.test(line)) {
      if (mode === "directions") {
        directions.push(line);
      } else if (mode === "ingredients") {
        ingredients.push(line);
      } else {
        narrative.push(line);
      }
      continue;
    }

    // INGREDIENT LINES
    if (mode === "ingredients") {
      ingredients.push(line);
      continue;
    }

    // DEFAULT → NARRATIVE
    narrative.push(line);
  }

  return {
    narrative,
    ingredients,
    directions,
    servings,
    prepTime,
    cookTime,
    totalTime
  };
}
// -----------------------------
// FILE UPLOAD HANDLER
// -----------------------------
const fileInput = document.getElementById("recipe-file");
const uploadbtn = document.getElementById("upload-btn");
const uploadName = document.getElementById("upload-name");
const uploadCategory = document.getElementById("upload-category");

uploadbtn.addEventListener("click", () => {
  const file = fileInput.files[0];
  const name = uploadName.value.trim();
  const category = uploadCategory.value.trim();

  if (!name) return alert("Please enter a recipe name.");
  if (!category) return alert("Please select a category.");
  if (!file) return alert("Please select a file first.");

  const ext = file.name.split(".").pop().toLowerCase();

  if (["txt"].includes(ext)) return readTextFile(file, name);
  if (["pdf"].includes(ext)) return readPDF(file, name);
  if (["docx"].includes(ext)) return readDocx(file, name);
  if (["html", "htm"].includes(ext)) return readHTML(file, name);
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return readImageOCR(file, name);

  alert("Unsupported file type.");
});

// -----------------------------
// TEXT FILE
// -----------------------------
function readTextFile(file, name) {
  const reader = new FileReader();
  reader.onload = () => processRecipeText(reader.result, name);
  reader.readAsText(file);
}

// -----------------------------
// PDF FILE
// -----------------------------
function readPDF(file, name) {
  const reader = new FileReader();
  reader.onload = async () => {
    const typedArray = new Uint8Array(reader.result);
    const pdf = await pdfjsLib.getDocument(typedArray).promise;

    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map(item => item.str);
      fullText += strings.join("\n") + "\n";
    }

    processRecipeText(fullText, name);
  };
  reader.readAsArrayBuffer(file);
}

// -----------------------------
// DOCX FILE
// -----------------------------
function readDocx(file, name) {
  const reader = new FileReader();
  reader.onload = async () => {
    const result = await mammoth.extractRawText({ arrayBuffer: reader.result });
    processRecipeText(result.value, name);
  };
  reader.readAsArrayBuffer(file);
}

// -----------------------------
// HTML FILE
// -----------------------------
function readHTML(file, name) {
  const reader = new FileReader();
  reader.onload = () => {
    const div = document.createElement("div");
    div.innerHTML = reader.result;
    processRecipeText(div.innerText, name);
  };
  reader.readAsText(file);
}

// -----------------------------
// IMAGE OCR
// -----------------------------
function readImageOCR(file, name) {
  Tesseract.recognize(file, "eng").then(result => {
    processRecipeText(result.data.text, name);
  });
}

// -----------------------------
// PROCESS + SAVE FORMATTED RECIPE
// -----------------------------
function processRecipeText(text, name) {
  const formatted = autoFormatRecipe(text, name);

  const category = uploadCategory.value.trim();

  const newRecipe = {
  name,
  category,
  narrative: formatted.narrative,
  ingredients: formatted.ingredients,
  directions: formatted.directions,

  // NEW metadata fields
  servings: formatted.servings,
  prepTime: formatted.prepTime,
  cookTime: formatted.cookTime,
  totalTime: formatted.totalTime
};

  db.collection("recipes").add(newRecipe)
    .then(docRef => {
      alert("Recipe uploaded successfully!");
      uploadName.value = "";
      uploadCategory.value = "";
      fileInput.value = "";

      recipes.push({ id: docRef.id, ...newRecipe });
      renderRecipes(recipes);
    })
    .catch(err => {
      console.error("Error uploading recipe:", err);
      alert("Error uploading recipe. Check console for details.");
    });
}

// -----------------------------
// CATEGORY SIDEBAR FILTERING

// -----------------------------
function enableCategoryFiltering() {
  const items = document.querySelectorAll("#category-list li");

  items.forEach(li => {
    li.addEventListener("click", () => {
      items.forEach(i => i.classList.remove("active"));
      li.classList.add("active");

      const category = li.dataset.cat;

      const filtered = recipes.filter(r =>
        r.category &&
        r.category.toLowerCase() === category.toLowerCase()
      );

      renderRecipes(filtered);
    });
  });
}

enableCategoryFiltering();
