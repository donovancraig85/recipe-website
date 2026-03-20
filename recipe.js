const recipes = [
  {id: 1, name: "Chicken Alfredo", ingredients: ["chicken","pasta","brocolli","cream","garlic"]},
  {id: 2, name: "Beef Tacos", ingredients: ["Ground beef", "taco shells", "taco seasoning"]},
  {id: 3, name: "cereal", ingredients: ["ceral of choice", "milk"]},
  {id: 4, name: "Cake", ingredients: ["eggs", "milk"]}
];

const params = new URLSearchParams(window.location.search);
const id = Number(params.get("id"));

const recipe = recipes.find(r => r.id === id);

if (recipe) {
  document.getElementById("recipe-name").textContent = recipe.name;

  const ul = document.getElementById("ingredient-list");
  recipe.ingredients.forEach(i => {
    const li = document.createElement("li");
    li.textContent = i;
    ul.appendChild(li);
  });
}
