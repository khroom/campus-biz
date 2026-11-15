import { expect, test, type Page } from "@playwright/test";

function contrast(foreground: string, background: string): number {
  const parse = (value: string) => value.match(/\d+/g)!.slice(0, 3).map(Number);
  const channel = (part: number) => {
    const ratio = part / 255;
    return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (value: string) => {
    const [red, green, blue] = parse(value).map(channel);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const left = luminance(foreground);
  const right = luminance(background);
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

async function brightCount(page: Page): Promise<number> {
  return page.locator(".react-flow__node:not(:has(.is-dim))").count();
}

test("студент доходит до траектории первой продажи", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Навигатор студента" })).toBeVisible();
  await expect(page.getByText("возможные результаты, а не гарантия")).toBeVisible();

  const before = await page.locator(".react-flow__node").count();
  await page.getByRole("button", { name: /Первая коммерческая продажа продукта/ }).click();
  const card = page.locator(".card");
  await expect(card.getByRole("heading", { name: "Первая коммерческая продажа продукта" })).toBeVisible();
  await expect(card.getByText("Это возможный результат, а не гарантия.")).toBeVisible();
  const focused = await brightCount(page);
  expect(focused).toBeGreaterThan(1);
  expect(focused).toBeLessThan(before);

  await page.getByRole("button", { name: "Вся карта" }).click();
  expect(await brightCount(page)).toBe(before);
});

test("поиск, фильтр и объяснение входа", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Поиск" }).fill("Биржа");
  await page.getByRole("button", { name: /Биржа проектов/ }).click();
  await expect(page.getByRole("heading", { name: "Биржа проектов" })).toBeVisible();
  await expect(page.locator(".sources a").first()).toHaveAttribute("href", /fa\.ru/);

  await page.getByRole("button", { name: "Вся карта" }).click();
  const withResources = await page.locator(".react-flow__node-vertex").count();
  await page.getByRole("button", { name: "Ресурсы", pressed: true }).click();
  await expect.poll(async () => page.locator(".react-flow__node-vertex").count()).toBeLessThan(withResources);

  await page.getByRole("button", { name: "Ресурсы" }).click();
  await page.locator(".react-flow__edge-interaction").first().click({ force: true });
  await expect(page.locator(".card").getByText(/не достаточен|на выходе процесса/)).toBeVisible();
});

test("на телефоне карточка проекта открывается в нижней панели", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Фильтры" })).toBeVisible();
  await page.getByRole("button", { name: /Первая коммерческая продажа продукта/ }).click();
  const sheet = page.locator(".sheet");
  await expect(sheet.getByRole("button", { name: "Карточка" })).toBeVisible();
  await expect(sheet.getByText("Это возможный результат, а не гарантия.")).toBeVisible();
});

test("текст шапки читается на светлом фоне", async ({ page }) => {
  await page.goto("/");
  const sample = await page.locator("h1").evaluate((node) => {
    const style = getComputedStyle(node);
    const parent = getComputedStyle(node.parentElement!.parentElement!);
    return { color: style.color, background: parent.backgroundColor };
  });
  expect(contrast(sample.color, sample.background)).toBeGreaterThan(4.5);
});
