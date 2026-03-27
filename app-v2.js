// app.js v2.7 — Full Pipeline (Importer + Formatter)
// ------------------------------------------------------
// GLOBALS
// ------------------------------------------------------
let recipes = [];

// ------------------------------------------------------
// BASIC TEXT CLEANER
// ------------------------------------------------------
function cleanText(raw) {
  return raw
    .replace(/\r/g, "\n")
    .replace(/[|=~”“‘’•·]/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\t+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// ------------------------------------------------------
// LOAD RECIPES FROM FIRESTORE
// ------------------------------------------------------
function loadRecipes() {
  db.collection("recipes")
    .get()
    .then(snapshot => {
      recipes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      recipes = recipes.map(r => ({
        ...r,
        name: typeof r.name === "string" ? r.name : ""
      }));

      renderRecipes(recipes);
      enableCategoryFiltering();
    })
    .catch(err => console.error("Error loading recipes:", err));
}

function renderRecipes(list) {
  const container = document.getElementById("recipe-list");
  if (!container) return;

  container.innerHTML = "";
  list.sort((a, b) => a.name.localeCompare(b.name));

  list.forEach(recipe => {
    const card = document.createElement("div");
    card.className = "recipe-card";

    if (recipe.category) {
      const catDiv = document.createElement("div");
      catDiv.className = "category-preview";
      catDiv.textContent = recipe.category;
      card.appendChild(catDiv);
    }

    const link = document.createElement("a");
    link.textContent = recipe.name;
    link.href = `recipe.html?id=${encodeURIComponent(recipe.id)}`;
    card.appendChild(link);

    container.appendChild(card);
  });
}

loadRecipes();

// ------------------------------------------------------
// SEARCH + DROPDOWN
// ------------------------------------------------------
const search = document.getElementById("search");
const searchBtn = document.getElementById("search-btn");
const searchResults = document.getElementById("search-results");

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

function updateSearchDropdown(list) {
  if (!searchResults) return;

  searchResults.innerHTML = "";
  const query = search.value.toLowerCase().trim();

  if (!query) {
    searchResults.style.display = "none";
    return;
  }

  const matches = list.filter(r =>
    (r.name || "").toLowerCase().includes(query)
  );

  if (matches.length === 0) {
    searchResults.style.display = "none";
    return;
  }

  matches.slice(0, 8).forEach(recipe => {
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

if (search) {
  search.addEventListener("input", runSearch);
  searchBtn?.addEventListener("click", runSearch);
}

// ------------------------------------------------------
// AZURE OCR (RAW BINARY)
// ------------------------------------------------------
async function runOCR(arrayBuffer) {
  try {
    const response = await fetch(
      "https://recipes-ocr-cpc7d8hbffahe0ad.canadacentral-01.azurewebsites.net/api/ocr",
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: arrayBuffer
      }
    );

    return await response.text();
  } catch (err) {
    console.error("Read v3 OCR error:", err);
    return "";
  }
}

// ------------------------------------------------------
// FILE UPLOAD HANDLER
// ------------------------------------------------------
const fileInput = document.getElementById("recipe-file");
const uploadbtn = document.getElementById("upload-btn");
const uploadName = document.getElementById("upload-name");
const uploadCategory = document.getElementById("upload-category");

if (uploadbtn) {
  uploadbtn.addEventListener("click", () => {
    const files = fileInput.files;
    const name = uploadName.value.trim();
    const category = uploadCategory.value.trim();

    if (!name) return alert("Please enter a recipe name.");
    if (!category) return alert("Please select a category.");
    if (!files.length) return alert("Please select a file first.");

    const ext = files[0].name.toLowerCase().split(".").pop() || "";

    if (ext === "txt") return readTextFile(files[0], name, category);
    if (ext === "pdf") return readPDF(files[0], name, category);
    if (ext === "docx") return readDocx(files[0], name, category);
    if (ext === "html" || ext === "htm") return readHTML(files[0], name, category);

    if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext))
      return readImageOCR(files, name, category);

    alert("Unsupported file type.");
  });
}

// ------------------------------------------------------
// TEXT FILE
// ------------------------------------------------------
function readTextFile(file, name, category) {
  const reader = new FileReader();
  reader.onload = () => handleImportedText(reader.result, name, category);
  reader.readAsText(file);
}

// ------------------------------------------------------
// MULTI‑PAGE PDF → PNG → OCR
// ------------------------------------------------------
async function readPDF(file, name, category) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    const pngBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error("Failed to create PNG blob"))),
        "image/png",
        1.0
      );
    });

    const pageText = await runOCR(pngBlob);
    fullText += "\n" + pageText;
  }

  handleImportedText(fullText, name, category);
}

// ------------------------------------------------------
// DOCX FILE
// ------------------------------------------------------
function readDocx(file, name, category) {
  const reader = new FileReader();
  reader.onload = async () => {
    const result = await mammoth.extractRawText({
      arrayBuffer: reader.result
    });
    handleImportedText(result.value, name, category);
  };
  reader.readAsArrayBuffer(file);
}

// ------------------------------------------------------
// HTML FILE
// ------------------------------------------------------
function readHTML(file, name, category) {
  const reader = new FileReader();
  reader.onload = () => {
    const div = document.createElement("div");
    div.innerHTML = reader.result;
    handleImportedText(div.innerText, name, category);
  };
  reader.readAsText(file);
}

// ------------------------------------------------------
// MULTI‑IMAGE OCR
// ------------------------------------------------------
async function readImageOCR(fileList, name, category) {
  let fullText = "";

  for (const file of fileList) {
    const text = await runOCR(file);
    fullText += "\n" + text;
  }

  handleImportedText(fullText, name, category);
}

// ------------------------------------------------------
// PIPELINE HELPERS
// ------------------------------------------------------
// ------------------------------------------------------
// v2.7.1 — FULL PIPELINE (Importer keeps step numbers)
// ------------------------------------------------------

// Normalize units BEFORE splitting
function normalizeUnits(line) {
  return line
    .replace(/\btea\b/i, "teaspoon")
    .replace(/\btable\b/i, "tablespoon")
    .replace(/\btsp\b/i, "teaspoon")
    .replace(/\btbsp\b/i, "tablespoon");
}

// Normalize fractions BEFORE splitting
function normalizeFractions(line) {
  return line
    .replace(/\b11\/4\b/g, "1 1/4")
    .replace(/\b11\/2\b/g, "1 1/2")
    .replace(/\b12\/3\b/g, "1 2/3")
    .replace(/\b13\/4\b/g, "1 3/4");
}

// Remove ingredient comments
function removeIngredientComments(line) {
  const triggers = [
    "delicious",
    "spoon",
    "ever had",
    "party mood",
    "up the",
    "you've"
  ];
  for (const t of triggers) {
    const idx = line.toLowerCase().indexOf(t);
    if (idx !== -1) return line.slice(0, idx).trim();
  }
  return line;
}

// Remove variation garbage
function stripVariations(line) {
  const keys = [
    "banana",
    "liqueur",
    "cuatro",
    "dulce",
    "variation",
    "many restaurants",
    "serve the cake in a bowl",
    "continued on next page",
    "tres leches cake (continuation)"
  ];
  for (const k of keys) {
    const idx = line.toLowerCase().indexOf(k);
    if (idx !== -1) return line.slice(0, idx).trim();
  }
  return line;
}

// Remove page numbers, headers, etc.
function isGarbage(line) {
  const lower = line.toLowerCase();
  const patterns = [
    /^page\s*\d+/,
    /^\d+\s*of\s*\d+/,
    /^three guys/,
    /^desserts$/,
    /^variations$/,
    /^cuatro/,
    /^banana/,
    /^www\./,
    /^http/
  ];
  return patterns.some(p => p.test(lower));
}

// Merge broken quantity lines
function mergeBrokenQuantities(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const curr = lines[i];
    const next = lines[i + 1] || "";
    if (/^\d+$/.test(curr) && next.startsWith("(")) {
      out.push((curr + " " + next).trim());
      i++;
    } else {
      out.push(curr);
    }
  }
  return out;
}

// Split merged steps
function splitSteps(line) {
  const pattern = /(\bstep\s*\d+[:.)-]*|\b\d+[:.)-])/gi;
  const matches = [...line.matchAll(pattern)];
  if (matches.length < 2) return [line];

  const parts = [];
  let last = 0;
  for (let i = 1; i < matches.length; i++) {
    const start = matches[i].index;
    parts.push(line.slice(last, start).trim());
    last = start;
  }
  parts.push(line.slice(last).trim());
  return parts.filter(p => p.length > 0);
}

// Remove step numbers (formatter)
function removeStepNumber(line) {
  return line
    .replace(/^\s*step\s*\d+[:.)\-\—]*\s*/i, "")
    .replace(/^\s*\d+[:.)\-\—]*\s*/, "")
    .replace(/^[\.\)\:\-\—]+\s*/, "")
    .trim();
}

// Strict ingredient splitting
function splitIngredients(line) {
  const qty = /(\d+\s?\d*\/?\d*|\d+\.\d+|\(\d.*?\))/g;
  const matches = [...line.matchAll(qty)];
  if (matches.length < 2) return [line];

  const parts = [];
  let last = 0;
  for (let i = 1; i < matches.length; i++) {
    const start = matches[i].index;
    parts.push(line.slice(last, start).trim());
    last = start;
  }
  parts.push(line.slice(last).trim());
  return parts.filter(p => p.length > 0);
}

// Normalize OCR text
function normalizeOCR(text) {
  let lines = text
    .replace(/\r/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\t+/g, " ")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0);

  lines = lines.filter(l => !isGarbage(l));
  lines = mergeBrokenQuantities(lines);

  return lines;
}

// ------------------------------------------------------
// v2.7.1 IMPORTER (keeps step numbers)
// ------------------------------------------------------
function processRecipePipeline(rawText, name, category) {
  const cleaned = cleanText(rawText);
  const lines = normalizeOCR(cleaned);

  let narrative = [];
  let ingredients = [];
  let directions = [];

  let mode = "narrative";

  const stepPattern = /^(\bstep\s*\d+[:.)-]*|\b\d+[:.)-])/i;
  const ingredientPattern =
    /^(\d+|\d+\s?\/\s?\d+|\d+\.\d+|\d+\s?\d\/\d|\(?\d+.*\)?)\s*[a-z]/i;

  for (let line of lines) {
    line = normalizeUnits(line);
    line = normalizeFractions(line);
    line = stripVariations(line);

    if (line.length === 0) continue;

    const lower = line.toLowerCase();

    if (lower.includes("ingredient")) {
      mode = "ingredients";
      continue;
    }

    if (lower.includes("direction") || lower.includes("instruction") || lower.includes("method")) {
      mode = "directions";
      continue;
    }

    if (stepPattern.test(line)) {
      const split = splitSteps(line);
      split.forEach(s => directions.push(s));
      mode = "directions";
      continue;
    }

    if (mode === "ingredients" && ingredientPattern.test(line)) {
      const split = splitIngredients(line);
      split.forEach(s => {
        const cleanedIng = removeIngredientComments(s).trim();
        if (cleanedIng.length > 0) ingredients.push(cleanedIng);
      });
      continue;
    }

    if (mode === "directions") {
      if (directions.length > 0) {
        directions[directions.length - 1] += " " + line;
      } else {
        directions.push(line);
      }
      continue;
    }

    narrative.push(line);
  }

  // ------------------------------------------------------
  // FORMATTER: remove step numbers
  // ------------------------------------------------------
  const formattedDirections = directions.map(removeStepNumber);

  return {
    name,
    category,
    narrative,
    ingredients,
    directions: formattedDirections,
    createdAt: new Date()
  };
}

// ------------------------------------------------------
// HANDLE IMPORTED TEXT → SAVE TO FIRESTORE
// ------------------------------------------------------
function handleImportedText(rawText, name, category) {
  const recipe = processRecipePipeline(rawText, name, category);

  db.collection("recipes")
    .add(recipe)
    .then(() => alert("Recipe uploaded!"))
    .catch(err => {
      console.error("Error saving recipe:", err);
      alert("Error saving recipe. Check console.");
    });
}

// ------------------------------------------------------
// CATEGORY FILTERING
// ------------------------------------------------------
function enableCategoryFiltering() {
  const items = document.querySelectorAll("#category-list li");
  if (!items) return;

  items.forEach(li => {
    li.addEventListener("click", () => {
      items.forEach(i => i.classList.remove("active"));
      li.classList.add("active");

      const category = li.dataset.cat;

      const filtered = recipes.filter(
        r =>
          r.category &&
          r.category.toLowerCase() === category.toLowerCase()
      );

      renderRecipes(filtered);
    });
  });
}
