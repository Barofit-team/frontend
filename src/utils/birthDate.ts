/** 생일이 지나지 않았다면 한 살을 빼는 만 나이. 존재하지 않는 날짜는 거부한다. */
export function ageFromBirthDate(year: string, month: string, day: string, today = new Date()): number | null {
  if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day)) return null;
  const y = Number(year), m = Number(month), d = Number(day);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age >= 0 ? age : null;
}
