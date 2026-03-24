const params = new URLSearchParams(window.location.search);
const category = params.get("cat");

document.getElementById("category-title").textContent = category;

db.collection("recipes")
  .where("category", "==", category)
  .get()
  .then(snapshot => {
    const list = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    renderCategoryRecipes(list);
  });

function renderCategoryRecipes(list) {
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
