const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
const SCALES = ["", "ngàn", "triệu", "tỷ", "ngàn tỷ", "triệu tỷ"];
const digit = (d: number) => DIGITS[d] ?? "";

/** One 3-digit group. `full` = not the leading group, so a 0 hundreds still reads "không trăm". */
function readGroup(n: number, full: boolean): string[] {
  const hundreds = Math.floor(n / 100);
  const tens = Math.floor((n % 100) / 10);
  const units = n % 10;
  const words: string[] = [];
  if (full || hundreds > 0) words.push(digit(hundreds), "trăm");
  if (tens === 0) {
    if (units > 0 && words.length > 0) words.push("lẻ");
  } else if (tens === 1) {
    words.push("mười");
  } else {
    words.push(digit(tens), "mươi");
  }
  if (units === 1 && tens >= 2) words.push("mốt");
  else if (units === 5 && tens >= 1) words.push("lăm");
  else if (units === 4 && tens >= 2) words.push("tư");
  else if (units > 0) words.push(digit(units));
  return words;
}

/** VND integer → Vietnamese words for "Số tiền bằng chữ" (M17-04 · Q114: "ngàn", not "nghìn"). */
export function vndToWords(amount: number): string {
  if (amount === 0) return "Không đồng";
  const groups: number[] = [];
  for (let rest = Math.abs(Math.trunc(amount)); rest > 0; rest = Math.floor(rest / 1000)) {
    groups.push(rest % 1000);
  }
  const words: string[] = [];
  groups.forEach((group, i) => {
    const leading = i === groups.length - 1;
    if (group === 0 && !leading) return;
    const scale = SCALES[i] ?? "";
    words.unshift(...readGroup(group, !leading), ...(scale ? [scale] : []));
  });
  const text = `${words.join(" ")} đồng`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
