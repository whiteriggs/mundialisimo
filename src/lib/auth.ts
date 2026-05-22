export const USERS = ["Juan", "Javi", "Jordi", "Jorge", "Esteban", "Manuel", "JuanRa"];
export const PASSWORD = "mundialisimo";

export function checkLogin(name: string, password: string): boolean {
  return USERS.includes(name) && password === PASSWORD;
}

export function getStoredUser(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("mundialisimo_user");
}

export function storeUser(name: string): void {
  localStorage.setItem("mundialisimo_user", name);
}

export function clearUser(): void {
  localStorage.removeItem("mundialisimo_user");
}
