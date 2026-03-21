/// -----------------------------
// GET RECIPE ID FROM URL
// -----------------------------
const params = new URLSearchParams(window.location.search);
const recipeId = params.get("id");

if (!recipeId) {
  alert("No recipe ID provided.");
  window.location.href = "index.html";
}

// -----------------------------
// LOAD RECIPE FROM FIRESTORE
// -----------------------------
db.collection("recipes").doc(recipeId).get()
  .then(doc => {
    if (!doc.exists) {
      alert("Recipe not found.");
      window.location.href = "index.html";
      return;
    }

    const recipe = doc.data();

    // Fill name
    document.getElementById("recipe-name").textContent = recipe.name;

    // Fill ingredients
    const ingredientList = document.getElementById("ingredient-list");
    ingredientList.innerHTML = "";
    recipe.ingredients.forEach(item => {
      const li = document.createElement("li");
      li.textContent = item;
      ingredientList.appendChild(li);
    });

    // Fill directions
    const directionsList = document.getElementById("directions-list");
    directionsList.innerHTML = "";
    recipe.directions.forEach(step => {
      const li = document.createElement("li");
      li.textContent = step;
      directionsList.appendChild(li);
    });
  })
  .catch(err => {
    console.error("Error loading recipe:", err);
  });

// -----------------------------
// DELETE RECIPE
// -----------------------------
document.getElementById("delete-btn").addEventListener("click", () => {
  if (!confirm("Are you sure you want to delete this recipe?")) return;

  db.collection("recipes").doc(recipeId).delete()
    .then(() => {
      alert("Recipe deleted.");
      window.location.href = "index.html";
    })
    .catch(err => {
      console.error("Error deleting recipe:", err);
    });
});

// -----------------------------
// SAVE AS PDF
// -----------------------------
document.getElementById("pdf-btn").addEventListener("click", () => {
  const element = document.querySelector(".recipe-card");
  html2pdf().from(element).save(`${recipeId}.pdf`);
});

