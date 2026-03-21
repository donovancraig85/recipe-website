// -----------------------------
// GLOBALS
// -----------------------------
let recipes = [];

// -----------------------------
// UNIVERSAL TEXT CLEANER
// -----------------------------
function cleanText(raw) {
  return raw
    .replace(/\r/g, "\n")                 // normalize line breaks
    .replace(/<[^>]*>/g, "")              // remove HTML tags
    .replace(/&nbsp;/g, " ")              // remove HTML spaces
    .replace(/[•●▪■]/g, "")               // remove bullet symbols
    .replace(/\t+/g, " ")                 // remove tabs
    .replace(/[ ]{2,}/g, " ")             // collapse multiple spaces
    .replace(/\n{2,}/g, "\n")             // collapse blank lines
    .replace(/[^\S\r\n]+/g, " ")          // remove weird whitespace
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

    card.appendChild(link);
    container.appendChild(card);
  });
}

loadRecipes();

// -----------------------------
// FUZZY MATCHING
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
// SEARCH → DIRECT NAVIGATION
// -----------------------------
const search = document.getElementById("search");
const searchBtn = document.getElementById("search-btn");

function runSearch() {
  const query = search.value.toLowerCase();

  const filtered = recipes.filter(recipe => {
    const name = recipe.name || "";
    return fuzzyMatch(name, query);
  });

  if (filtered.length === 1) {
    window.location.href = `recipe.html?id=${encodeURIComponent(filtered[0].id)}`;
    return;
  }

  renderRecipes(filtered);
}

search.addEventListener("input", runSearch);
searchBtn.addEventListener("click", () => runSearch());

// -----------------------------
// AUTO FORMAT RECIPE
// -----------------------------
function autoFormatRecipe(raw, name) {
  raw = cleanText(raw);

  let lines = raw
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map(l =>
      l
        .replace(/^[-•*]\s*/, "")
        .replace(/^\d+[\.\-\)\:]\s*/, "")
    );

  if (lines.length === 0) {
    return { title: name, ingredients: [], directions: [] };
  }

  let ingredientsStart = -1;
  let directionsStart = -1;

  lines.forEach((line, idx) => {
    const lower = line.toLowerCase();
    if (ingredientsStart === -1 && lower.includes("ingredients")) {
      ingredientsStart = idx;
    }
    if (
      directionsStart === -1 &&
      (lower.includes("instructions") ||
       lower.includes("directions") ||
       lower.includes("method"))
    ) {
      directionsStart = idx;
    }
  });

  let ingredients = [];
  let directions = [];

  if (ingredientsStart !== -1) {
    const start = ingredientsStart + 1;
    const end = directionsStart !== -1 ? directionsStart : lines.length;
    for (let i = start; i < end; i++) {
      if (lines[i]) ingredients.push(lines[i]);
    }
  }

  if (directionsStart !== -1) {
    const start = directionsStart + 1;
    for (let i = start; i < lines.length; i++) {
      if (lines[i]) directions.push(lines[i]);
    }
  }

  if (ingredients.length === 0 && directions.length === 0) {
    const ingredientKeywords = [
      "cup", "tsp", "tbsp", "teaspoon", "tablespoon",
      "oz", "ounce", "lb", "pound", "clove", "slice",
      "gram", "kg", "ml", "liter", "pinch", "g)"
    ];

    for (let line of lines) {
      const lower = line.toLowerCase();
      const looksLikeIngredient =
        ingredientKeywords.some(k => lower.includes(k)) ||
        line.includes(",") ||
        /^[0-9]/.test(line);

      if (looksLikeIngredient) {
        ingredients.push(line);
      } else {
        directions.push(line);
      }
    }
  }

  return {
    title: name,
    ingredients,
    directions
  };
}

// -----------------------------
// UNIVERSAL FILE UPLOAD HANDLER
// -----------------------------
const fileInput = document.getElementById("recipe-file");
const uploadbtn = document.getElementById("upload-btn");
const uploadName = document.getElementById("upload-name");

uploadbtn.addEventListener("click", () => {
  const file = fileInput.files[0];
  const name = uploadName.value.trim();

  if (!name) return alert("Please enter a recipe name.");
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

  const newRecipe = {
    name,
    ingredients: formatted.ingredients,
    directions: formatted.directions
  };

  db.collection("recipes").add(newRecipe)
    .then(docRef => {
      alert("Recipe uploaded successfully!");
      uploadName.value = "";
      fileInput.value = "";

      recipes.push({ id: docRef.id, ...newRecipe });
      renderRecipes(recipes);
    })
    .catch(err => {
      console.error("Error uploading recipe:", err);
      alert("Error uploading recipe. Check console for details.");
    });
}
