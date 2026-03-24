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


function buildCategoryLinks() {
  const sidebarItems = document.querySelectorAll("#category-list li");
  const container = document.getElementById("category-links");

  if (!container) return;

  container.innerHTML = "";

  sidebarItems.forEach(item => {
    const cat = item.dataset.cat;
    if (!cat) return;

    const li = document.createElement("li");
    const link = document.createElement("a");

    link.href = `category.html?cat=${encodeURIComponent(cat)}`;
    link.textContent = cat;

    li.appendChild(link);
    container.appendChild(li);
  });
}

buildCategoryLinks();