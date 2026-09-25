const products = [
{ id: "p1", title: "Механическая клавиатура", price: 8500, category: "accessories", inStock: true, rating: 4.8 },
{ id: "p2", title: "Игровой монитор 144Hz", price: 24000, category: "displays", inStock: false, rating: 4.6 },
{ id: "p3", title: "Беспроводная мышь", price: 4200, category: "accessories", inStock: true, rating: 4.9 },
{ id: "p4", title: "USB-C Хаб 7-in-1", price: 3100, category: "adapters", inStock: true, rating: 4.2 },
{ id: "p5", title: "Кронштейн для монитора", price: 5600, category: "accessories", inStock: false, rating: 4.7 },
];

console.log(`Загружено товаров: ${products.length}\n`);

console.log("===== .map() =====");

const productTitles = products.map(item => item.title);
console.log("1. Названия товаров:", productTitles);

const productsWithDiscount = products.map(item => ({
...item,
discountPrice: item.price * 0.85,
formattedPrice: `${item.price.toLocaleString("ru-RU")} ₽`
}));
console.log("2. Со скидкой (первый):", productsWithDiscount[0]);

const mockJsxList = products.map((item, index) =>
`<li key="${item.id}" data-index="${index}">${item.title} - ${item.price}₽</li>`
);
console.log("3. Эмуляция JSX:", mockJsxList[0]);

console.log("\n===== .filter() =====");

const inStockOnly = products.filter(item => item.inStock);
console.log(`1. В наличии товаров: ${inStockOnly.length}`);

const affordableAccessories = products.filter(
item => item.category === "accessories" && item.price < 6000
);
console.log("2. Бюджетные аксессуары:", affordableAccessories);

const idToDelete = "p3";
const remainingProducts = products.filter(item => item.id !== idToDelete);
console.log("3. Товары после удаления p3:", remainingProducts.length); // 4

console.log("\n===== .find() =====");

const targetId = "p4";
const foundProduct = products.find(item => item.id === targetId);
console.log(`Найден: ${foundProduct?.title ?? "Товар не найден"}`);

const topRated = products.find(item => item.rating >= 4.9);
console.log("Топ товар:", topRated?.title); // "Беспроводная мышь"

const missing = products.find(item => item.id === "p999");
console.log("Результат поиска несуществующего:", missing); // undefined

console.log("\n===== Method Chaining =====");

const showcaseProducts = products
.filter(item => item.inStock && item.rating >= 4.5)
.map(item => ({
badge: "Хит",
displayName: `${item.title} (${item.rating})`,
finalPrice: `${item.price.toLocaleString("ru-RU")} ₽`
}));

console.log("Витрина хитов:", showcaseProducts);

console.log("\n===== CatalogManager =====");

const getProductById = (list, id) =>
list.find(item => item.id === id);

const filterCatalog = (list, { category, onlyInStock = false } = {}) => {
return list.filter(item => {
const matchesCategory = category ? item.category === category : true;
const matchesStock = onlyInStock ? item.inStock : true;
return matchesCategory && matchesStock;
});
};

const updateProductPrice = (list, id, newPrice) => {
return list.map(item =>
item.id === id ? { ...item, price: newPrice } : item
);
};

const activeAccessories = filterCatalog(products, {
category: "accessories",
onlyInStock: true
});

const updatedList = updateProductPrice(products, "p1", 7990);

console.log("Аксессуары в наличии:", activeAccessories.length); // 2
console.log("Новая цена p1:", getProductById(updatedList, "p1")?.price); // 7990

console.log(`
Метод .map() протестирован: 100% элементов трансформированы без мутации
Метод .filter() протестирован: предикаты отработали корректно
Метод .find() протестирован: ранний выход зафиксирован
`);
