// Usuários DACHSER (não são Z3US admins)
const DACHSER_ADMIN_USERS = ["ana.tozzo", "danilo.pedroso", "teste.test3"];

export const isZ3usAdmin = (): boolean => {
  try {
    const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
    if (!storedUser) return false;
    const parsed = JSON.parse(storedUser);
    const isAdmin = parsed.is_admin === 1 || parsed.is_admin === "1" || parsed.is_admin === true;
    return isAdmin && !DACHSER_ADMIN_USERS.includes(parsed.username);
  } catch { return false; }
};

/**
 * Filtra itens por ano mínimo (2027) para usuários não-Z3US admin.
 * Z3US admins veem todos os dados.
 */
export const filterByYearIfNotZ3us = <T>(
  items: T[],
  getDate: (item: T) => string | Date | null | undefined,
  minYear: number = 2027
): T[] => {
  if (isZ3usAdmin()) return items;
  
  return items.filter((item) => {
    const dateVal = getDate(item);
    if (!dateVal) return false;
    try {
      const year = new Date(dateVal).getFullYear();
      return year >= minYear;
    } catch {
      return false;
    }
  });
};
